"""Explicit, offline preparation and transfer. Never imports the local demo at boot."""
from pathlib import Path
from datetime import datetime, timezone
import argparse
import copy
import getpass
import hashlib
import json
import os
import sqlite3
import sys
from erp.infrastructure import persistence as storage
from auth_config import BRANCHES

ROOT = Path(__file__).resolve().parent
REQUIRED_FIELDS = {
    'products': 'kind name unit price stock',
    'shows': 'title room date time price capacity',
    'sales': 'user area day at item quantity total label seats',
    'reports': 'user at item kind delta status reason',
    'audits': 'user at kind status rows',
    'closures': 'user day at expected physical difference status',
    'log': 'user at action',
    'trailers': 'title videoId position published',
    'rooms': 'name capacity active',
    'movies': 'title duration genre rating poster position published',
    'orders': 'user day at requestId lines total',
    'candyOrders': 'user day at lines total',
    'candyRequests': 'user at order status reason',
    'cashMovements': 'user area day at direction total reason',
    'cashOpenings': 'user area day at closed',
    'payrollEmployees': 'code name role salary active',
    'payrollRoles': 'role salary',
    'payrollExtras': 'month date amount employees voided',
    'payrollImports': 'headers rows start end filename status',
    'payrollRuns': 'month source lines status',
    'payrollMail': 'run employee name recipient subject status at',
    'payrollDeleted': 'kind record at by',
    'printJobs': 'orderId user terminal status at order',
}


def canonical(state):
    return json.dumps(state, ensure_ascii=False, sort_keys=True, separators=(',', ':'), allow_nan=False)


def validate(state):
    state = storage.validate_state(copy.deepcopy(state))
    canonical(state)  # Reject NaN / infinity before anything reaches PostgreSQL.
    for name, records in state.items():
        if name not in REQUIRED_FIELDS:
            raise ValueError(f'Colección no reconocida: {name}. Usa la versión correspondiente del migrador.')
        ids = [str(record['id']) for record in records if 'id' in record]
        if len(ids) != len(set(ids)):
            raise ValueError(f'Hay identificadores duplicados en {name}.')
        for record in records:
            if record.get('branch') not in BRANCHES:
                raise ValueError(f'Sucursal inválida en {name}.')
            if name != 'payrollDeleted' and (not isinstance(record.get('id'), str) or not record['id']):
                raise ValueError(f'Falta identificador en {name}.')
            if any(field not in record for field in REQUIRED_FIELDS[name].split()):
                raise ValueError(f'Un registro de {name} está incompleto. No se importará.')
            for field in ('lines', 'rows', 'headers', 'seats', 'employees'):
                if field in record and not isinstance(record[field], list):
                    raise ValueError(f'Campo {field} inválido en {name}.')
    # Check references retained by the domain, including branch consistency.
    indexes = {name: {row['id']: row for row in records if 'id' in row} for name, records in state.items()}
    references = [('shows', 'roomId', 'rooms'), ('shows', 'movieId', 'movies'),
                  ('reports', 'item', 'products'), ('candyRequests', 'order', 'candyOrders'),
                  ('payrollRuns', 'source', 'payrollImports'), ('payrollMail', 'run', 'payrollRuns'),
                  ('payrollMail', 'employee', 'payrollEmployees'), ('printJobs', 'orderId', 'orders')]
    for name, field, target in references:
        for row in state[name]:
            if not row.get(field):
                continue  # Older shows get their catalog references at initialization.
            related = indexes[target].get(row[field])
            if not related or related['branch'] != row['branch']:
                raise ValueError(f'Referencia a {target} inválida en {name}.')
    return state


def read_sqlite(path):
    source = Path(path).resolve(strict=True)
    with sqlite3.connect(source.as_uri() + '?mode=ro', uri=True) as conn:
        row = conn.execute('SELECT body FROM state WHERE id=1').fetchone()
    if not row:
        raise ValueError('El archivo SQLite no contiene el estado del ERP.')
    return validate(json.loads(row[0]))


def digest(state):
    return hashlib.sha256(canonical(state).encode('utf-8')).hexdigest()


def counts(state):
    return {name: len(records) for name, records in state.items()}


def snapshot(state):
    return dict(schemaVersion=storage.SCHEMA_VERSION,
                exportedAt=datetime.now(timezone.utc).isoformat(),
                sha256=digest(state), counts=counts(state), state=state)


def save_snapshot(path, state):
    destination = Path(path).resolve()
    destination.parent.mkdir(parents=True, exist_ok=True)
    # Exclusive creation: a backup can never overwrite another backup.
    with destination.open('x', encoding='utf-8') as output:
        json.dump(snapshot(state), output, ensure_ascii=False, allow_nan=False)
    return destination


def read_snapshot(path):
    payload = json.loads(Path(path).read_text(encoding='utf-8'))
    if payload.get('schemaVersion') != storage.SCHEMA_VERSION:
        raise ValueError('Versión de respaldo incompatible.')
    raw = payload['state']
    if digest(raw) != payload.get('sha256'):
        raise ValueError('El contenido no coincide con la suma de verificación del respaldo.')
    return validate(raw)


def owner_connection():
    import psycopg
    url = os.environ.get('MIGRATION_DATABASE_URL', '').strip()
    if not url:
        raise ValueError('Falta MIGRATION_DATABASE_URL. Usa la conexión propietaria, solo en este equipo.')
    return psycopg.connect(url, **storage.connection_options(url))


def bootstrap():
    # Versioned schema is idempotent. All state initialization uses ON CONFLICT.
    with owner_connection() as conn:
        conn.execute((ROOT / 'supabase' / 'schema.sql').read_text(encoding='utf-8'))
        conn.execute('INSERT INTO erp_private.state(id,body) VALUES(1,%s::jsonb) '
                     'ON CONFLICT(id) DO NOTHING', (canonical(storage.empty_state()),))
    print('Esquema preparado. Los registros existentes se conservaron; no se crearon datos de demo.')


def set_password():
    from psycopg import sql
    password = getpass.getpass('Nueva contraseña de conexión para erp_app (mín. 20 caracteres): ')
    if len(password) < 20:
        raise ValueError('Utiliza una contraseña aleatoria de al menos 20 caracteres.')
    if password != getpass.getpass('Repite la contraseña: '):
        raise ValueError('Las contraseñas no coinciden.')
    with owner_connection() as conn:
        conn.execute(sql.SQL('ALTER ROLE erp_app PASSWORD {}').format(sql.Literal(password)))
    print('Contraseña de erp_app actualizada. Configura DATABASE_URL en Render; no publiques el secreto.')


def destination_empty(conn):
    row = conn.execute('SELECT body FROM erp_private.state WHERE id=1 FOR UPDATE').fetchone()
    if not row:
        raise ValueError('Ejecuta bootstrap antes de importar.')
    current = storage.validate_state(copy.deepcopy(row[0]))
    if any(current.values()):
        raise ValueError('El destino ya tiene registros. Se rechaza la importación para no sobrescribirlos.')


def import_state(state, apply):
    # An import must never trigger old mail or send old tickets to a printer.
    state = validate(state)
    if any(state.get(name) for name in ('payrollMail', 'printJobs')):
        for job in state.get('payrollMail', []):
            if job.get('status') in ('Enviando', 'Pendiente de conectar correo'):
                job.update(status='Revisar envío', error='Importado de respaldo. Comprueba la recepción antes de reintentar.')
        for job in state.get('printJobs', []):
            if job.get('status') in ('pending', 'sending'):
                job.update(status='uncertain', message='Importado de respaldo. Revisa la impresión antes de reenviar.')
    for order in state.get('orders', []):
        if order.get('printing', {}).get('status') in ('pending', 'sending'):
            order['printing'].update(status='uncertain', message='Restaurado. Comprueba las entradas antes de reimprimir.')
    print(json.dumps({'counts': counts(state), 'sha256': digest(state)}, ensure_ascii=False))
    with owner_connection() as conn:
        destination_empty(conn)
        if apply:
            conn.execute('UPDATE erp_private.state SET body=%s::jsonb, revision=revision+1, '
                         'updated_at=now() WHERE id=1', (canonical(state),))
            conn.execute('DELETE FROM erp_private.auth_sessions')
    print('Importación completada.' if apply else 'Revisión completada; no se importó nada. Añade --apply para transferir.')


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    commands = parser.add_subparsers(dest='command', required=True)
    commands.add_parser('bootstrap', help='Crear esquema privado y estado vacío sin datos de ejemplo.')
    commands.add_parser('set-app-password', help='Asignar por entrada oculta la contraseña de erp_app.')
    export = commands.add_parser('export-sqlite', help='Exportar estado local sin sesiones ni contraseñas.')
    export.add_argument('--source', required=True)
    export.add_argument('--output', required=True)
    backup = commands.add_parser('backup', help='Exportar estado PostgreSQL con la conexión de propietario.')
    backup.add_argument('--output', required=True)
    for name, argument in (('import-sqlite', '--source'), ('restore', '--source')):
        command = commands.add_parser(name, help='Revisar transferencia a destino vacío; --apply para ejecutar.')
        command.add_argument(argument, required=True)
        command.add_argument('--apply', action='store_true')
    args = parser.parse_args(argv)
    try:
        if args.command == 'bootstrap':
            bootstrap()
        elif args.command == 'set-app-password':
            set_password()
        elif args.command == 'export-sqlite':
            print('Respaldo creado:', save_snapshot(args.output, read_sqlite(args.source)))
        elif args.command == 'backup':
            with owner_connection() as conn:
                row = conn.execute('SELECT body FROM erp_private.state WHERE id=1').fetchone()
                if not row:
                    raise ValueError('No existe estado que respaldar.')
                state = validate(row[0])
            print('Respaldo creado:', save_snapshot(args.output, state))
        else:
            state = read_sqlite(args.source) if args.command == 'import-sqlite' else read_snapshot(args.source)
            import_state(state, args.apply)
    except (ValueError, FileNotFoundError, FileExistsError) as error:
        print(str(error), file=sys.stderr)
        return 1
    except Exception:
        # Driver errors may include credentials or employee data. Do not echo them.
        print('No se completó la operación. Comprueba la conexión TLS, los permisos y el esquema; '
              'no compartas credenciales en los registros.', file=sys.stderr)
        return 1
    return 0


if __name__ == '__main__':
    sys.exit(main())
