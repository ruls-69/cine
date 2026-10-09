"""Transactional storage: local SQLite and private Supabase PostgreSQL.

The existing domain services share one state document. In PostgreSQL an explicit
write transaction locks that row before reading it, preserving checkout and
inventory atomicity across threads and deployments. Authentication has separate
tables; no session or database credential is part of the public state document.
"""
from contextlib import contextmanager
from pathlib import Path
import atexit
import hashlib
import json
import os
import sqlite3
import threading
from erp.modules.identity import infrastructure as auth_config

_pool = None
_pool_key = None
_pool_lock = threading.Lock()
SCHEMA_VERSION = 1
BASE_COLLECTIONS = ('products', 'shows', 'sales', 'reports', 'audits', 'closures',
                    'log', 'trailers', 'rooms', 'movies', 'orders', 'cashMovements',
                    'cashOpenings', 'candyOrders', 'candyRequests', 'payrollEmployees',
                    'payrollRoles', 'payrollExtras', 'payrollImports', 'payrollRuns',
                    'payrollMail', 'payrollDeleted', 'printJobs')


def production():
    return auth_config.production()


def database_url():
    url = os.environ.get('DATABASE_URL', '').strip()
    if production() and not url:
        raise RuntimeError('Producción requiere DATABASE_URL de Supabase; no se usará SQLite efímero.')
    return url


def empty_state():
    return {name: [] for name in BASE_COLLECTIONS}


def validate_state(state):
    if not isinstance(state, dict) or any(not isinstance(v, list) for v in state.values()):
        raise ValueError('El respaldo no tiene el formato de estado del ERP.')
    for name in BASE_COLLECTIONS:
        state.setdefault(name, [])
    if any(not isinstance(row, dict) for values in state.values() for row in values):
        raise ValueError('El respaldo contiene registros inválidos.')
    return state


def connection_options(url):
    from psycopg.conninfo import conninfo_to_dict
    options = conninfo_to_dict(url)
    mode = os.environ.get('ERP_DB_SSL_MODE') or options.get('sslmode') or ('verify-full' if production() else 'require')
    if mode not in ('require', 'verify-ca', 'verify-full'):
        raise RuntimeError('La conexión PostgreSQL debe usar TLS: require o verify-full.')
    if production() and mode != 'verify-full':
        raise RuntimeError('Producción requiere ERP_DB_SSL_MODE=verify-full y el certificado CA de Supabase.')
    kwargs = dict(sslmode=mode, connect_timeout=10, prepare_threshold=None,
                  application_name='universal-erp',
                  options='-c statement_timeout=20000 -c lock_timeout=15000')
    if os.environ.get('ERP_DB_SSL_ROOT_CERT'):
        kwargs['sslrootcert'] = os.environ['ERP_DB_SSL_ROOT_CERT']
    return kwargs


def pool():
    global _pool, _pool_key
    url = database_url()
    if not url:
        raise RuntimeError('Falta DATABASE_URL.')
    key = hashlib.sha256((url + os.environ.get('ERP_DB_SSL_MODE', '') +
                          os.environ.get('ERP_DB_SSL_ROOT_CERT', '')).encode()).digest()
    with _pool_lock:
        if _pool is None or _pool_key != key:
            if _pool is not None:
                _pool.close()
            try:
                from psycopg_pool import ConnectionPool
            except ImportError:
                raise RuntimeError('Instala requirements.txt para habilitar PostgreSQL.') from None
            _pool = ConnectionPool(url, kwargs=connection_options(url), min_size=1,
                                   max_size=int(os.environ.get('ERP_DB_POOL_SIZE', '8')),
                                   timeout=15, max_waiting=32, open=True,
                                   check=ConnectionPool.check_connection,
                                   name='universal-erp')
            _pool_key = key
        return _pool


def close_pool():
    global _pool, _pool_key
    with _pool_lock:
        if _pool is not None:
            _pool.close()
        _pool = _pool_key = None


atexit.register(close_pool)


@contextmanager
def postgres_connection():
    """Use psycopg pooling normally, or one short-lived client connection for demos.

    With ERP_DB_CLIENT_POOL=disabled, Supavisor remains the server-side pooler.
    Transactions still commit or roll back on exiting this context manager.
    """
    mode = os.environ.get('ERP_DB_CLIENT_POOL', 'enabled').lower()
    if mode == 'enabled':
        with pool().connection() as conn:
            yield conn
    elif mode == 'disabled':
        import psycopg
        url = database_url()
        with psycopg.connect(url, **connection_options(url)) as conn:
            yield conn
    else:
        raise RuntimeError('ERP_DB_CLIENT_POOL debe ser enabled o disabled.')


class PostgresStateConnection:
    """Small, explicit compatibility boundary for the legacy domain services."""
    def __init__(self, connection):
        self.connection = connection

    def execute(self, query, params=()):
        normalized = ' '.join(query.strip().rstrip(';').split()).upper()
        if normalized == 'BEGIN IMMEDIATE':
            # A transaction is started by psycopg; row lock lasts until commit.
            return self.connection.execute('SELECT id FROM erp_private.state WHERE id=1 FOR UPDATE')
        if normalized in ('SELECT BODY FROM STATE WHERE ID=1', 'SELECT BODY FROM STATE'):
            return self.connection.execute('SELECT body::text FROM erp_private.state WHERE id=1')
        if normalized == 'SELECT 1 FROM STATE':
            return self.connection.execute('SELECT 1 FROM erp_private.state WHERE id=1')
        if normalized in ('UPDATE STATE SET BODY=? WHERE ID=1', 'UPDATE STATE SET BODY=?'):
            return self.connection.execute('UPDATE erp_private.state SET body=%s::jsonb, '
                                           'revision=revision+1, updated_at=now() WHERE id=1', params)
        if normalized == 'SELECT 1':
            return self.connection.execute('SELECT 1')
        raise RuntimeError('Operación de almacenamiento no soportada. Ejecuta las migraciones antes de iniciar.')


@contextmanager
def connect(sqlite_path):
    if database_url():
        with postgres_connection() as conn:
            yield PostgresStateConnection(conn)
    else:
        conn = sqlite3.connect(sqlite_path, timeout=20)
        try:
            conn.execute('PRAGMA busy_timeout=20000')
            with conn:
                yield conn
        finally:
            conn.close()


def initialize(sqlite_path, seed_factory, upgrade):
    if database_url():
        with postgres_connection() as conn:
            version = conn.execute('SELECT max(version) FROM erp_private.schema_versions').fetchone()[0]
            if version != SCHEMA_VERSION:
                raise RuntimeError('Esquema incompatible. Ejecuta migrate_data.py bootstrap antes del despliegue.')
            row = conn.execute('SELECT body FROM erp_private.state WHERE id=1 FOR UPDATE').fetchone()
            if not row:
                raise RuntimeError('Falta el estado inicial de producción. Ejecuta migrate_data.py bootstrap.')
            before = json.dumps(row[0], sort_keys=True)
            state = validate_state(row[0])
            upgrade(state)
            if json.dumps(state, sort_keys=True) != before:
                conn.execute('UPDATE erp_private.state SET body=%s::jsonb, revision=revision+1, '
                             'updated_at=now() WHERE id=1', (json.dumps(state, ensure_ascii=False),))
    else:
        Path(sqlite_path).parent.mkdir(parents=True, exist_ok=True)
        with connect(sqlite_path) as conn:
            conn.execute('PRAGMA journal_mode=WAL')
            conn.executescript(SQLITE_AUTH_SCHEMA)
            conn.execute('CREATE TABLE IF NOT EXISTS state (id INTEGER PRIMARY KEY, body TEXT NOT NULL)')
            conn.execute('BEGIN IMMEDIATE')
            row = conn.execute('SELECT body FROM state WHERE id=1').fetchone()
            state = validate_state(json.loads(row[0]) if row else seed_factory())
            upgrade(state)
            conn.execute('INSERT INTO state(id,body) VALUES(1,?) ON CONFLICT(id) '
                         'DO UPDATE SET body=excluded.body', (json.dumps(state, ensure_ascii=False),))


SQLITE_AUTH_SCHEMA = '''
CREATE TABLE IF NOT EXISTS auth_sessions (
    token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL, auth_version TEXT NOT NULL,
    expires_at REAL NOT NULL, last_seen REAL NOT NULL
);
CREATE INDEX IF NOT EXISTS session_expiry ON auth_sessions(expires_at);
CREATE TABLE IF NOT EXISTS login_attempts (
    key TEXT PRIMARY KEY, window_start REAL NOT NULL, attempts INTEGER NOT NULL,
    blocked_until REAL NOT NULL DEFAULT 0
);
'''


class AuthStore:
    def __init__(self, sqlite_path):
        self.sqlite_path = sqlite_path

    @contextmanager
    def transaction(self):
        if database_url():
            with postgres_connection() as conn:
                yield conn, True
        else:
            with connect(self.sqlite_path) as conn:
                conn.execute('BEGIN IMMEDIATE')
                yield conn, False

    @staticmethod
    def execute(conn, pg, query, args=()):
        if pg:
            query = query.replace('auth_sessions', 'erp_private.auth_sessions')
            query = query.replace('login_attempts', 'erp_private.login_attempts').replace('?', '%s')
        return conn.execute(query, args)

    def session_create(self, token_hash, user_id, auth_version, expires_at, now_epoch):
        with self.transaction() as (conn, pg):
            self.execute(conn, pg, 'DELETE FROM auth_sessions WHERE expires_at<=?', (now_epoch,))
            self.execute(conn, pg, 'INSERT INTO auth_sessions VALUES(?,?,?,?,?)',
                         (token_hash, user_id, auth_version, expires_at, now_epoch))

    def session_lookup(self, token_hash, now_epoch, idle_seconds):
        with self.transaction() as (conn, pg):
            row = self.execute(conn, pg, 'SELECT user_id,auth_version,expires_at,last_seen '
                               'FROM auth_sessions WHERE token_hash=?' + (' FOR UPDATE' if pg else ''),
                               (token_hash,)).fetchone()
            if not row:
                return None
            if row[2] <= now_epoch or row[3] + idle_seconds <= now_epoch:
                self.execute(conn, pg, 'DELETE FROM auth_sessions WHERE token_hash=?', (token_hash,))
                return None
            # Avoid a write on each two-second poll. Absolute expiry is never extended.
            if now_epoch - row[3] >= 60:
                self.execute(conn, pg, 'UPDATE auth_sessions SET last_seen=? WHERE token_hash=?',
                             (now_epoch, token_hash))
            return dict(user_id=row[0], auth_version=row[1], expires_at=row[2], last_seen=row[3])

    def session_delete(self, token_hash):
        with self.transaction() as (conn, pg):
            self.execute(conn, pg, 'DELETE FROM auth_sessions WHERE token_hash=?', (token_hash,))

    def login_allowed(self, key, now_epoch, window, max_attempts):
        """Reserve one attempt atomically, before checking the password."""
        with self.transaction() as (conn, pg):
            self.execute(conn, pg, 'DELETE FROM login_attempts WHERE window_start<? AND blocked_until<?',
                         (now_epoch - window * 2, now_epoch))
            self.execute(conn, pg, 'INSERT INTO login_attempts VALUES(?,?,0,0) '
                         'ON CONFLICT(key) DO NOTHING', (key, now_epoch))
            row = self.execute(conn, pg, 'SELECT window_start,attempts,blocked_until FROM login_attempts '
                               'WHERE key=?' + (' FOR UPDATE' if pg else ''), (key,)).fetchone()
            start, attempts, blocked = row
            if blocked > now_epoch:
                return False
            if now_epoch - start >= window:
                start, attempts = now_epoch, 0
            attempts += 1
            allowed = attempts <= max_attempts
            self.execute(conn, pg, 'UPDATE login_attempts SET window_start=?,attempts=?,blocked_until=? '
                         'WHERE key=?', (start, attempts, now_epoch + window if not allowed else 0, key))
            return allowed

    def login_failure(self, key, now_epoch, window, max_attempts):
        # login_allowed already consumes the attempt, including concurrent requests.
        pass

    def login_success(self, key):
        with self.transaction() as (conn, pg):
            self.execute(conn, pg, 'DELETE FROM login_attempts WHERE key=?', (key,))


def auth_store(sqlite_path):
    return AuthStore(sqlite_path)
