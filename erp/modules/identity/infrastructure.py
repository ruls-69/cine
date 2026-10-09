"""Environment-only production accounts; the local demo remains available offline."""
import getpass
import hashlib
import hmac
import json
import os
import re
import secrets
from urllib.parse import urlsplit

BRANCHES = ['Potosí', 'Sucre', 'Oruro']
ROLES = {'manager', 'accounting', 'administrator', 'ticketing', 'candy'}
ITERATIONS = 600000


def production():
    on_render = os.environ.get('RENDER', '').lower() == 'true'
    environment = os.environ.get('ERP_ENV', 'production' if on_render else 'development').lower()
    if environment not in ('development', 'production', 'test'):
        raise RuntimeError('ERP_ENV debe ser development, test o production.')
    if on_render and environment != 'production':
        raise RuntimeError('Render requiere ERP_ENV=production; las cuentas demo solo se usan localmente.')
    return environment == 'production'


def hash_password(password):
    if not isinstance(password, str) or not 12 <= len(password) <= 256:
        raise ValueError('Usa una contraseña de entre 12 y 256 caracteres.')
    if password == 'Cine2026!':
        raise ValueError('La contraseña de demostración no está permitida en producción.')
    salt = secrets.token_bytes(24)
    digest = hashlib.pbkdf2_hmac('sha256', password.encode(), salt, ITERATIONS).hex()
    return f'pbkdf2_sha256${ITERATIONS}${salt.hex()}${digest}'


def parse_hash(encoded):
    if not isinstance(encoded, str):
        raise ValueError('Falta passwordHash.')
    pieces = encoded.split('$')
    if len(pieces) != 4 or pieces[0] != 'pbkdf2_sha256':
        raise ValueError('Formato passwordHash inválido.')
    _, iterations, salt, digest = pieces
    if not iterations.isdigit() or not ITERATIONS <= int(iterations) <= 2000000:
        raise ValueError('El hash requiere entre 600000 y 2000000 iteraciones.')
    if not re.fullmatch(r'[a-fA-F0-9]{32,128}', salt) or len(salt) % 2 or not re.fullmatch(r'[a-fA-F0-9]{64}', digest):
        raise ValueError('Salt o digest inválido en passwordHash.')
    return int(iterations), bytes.fromhex(salt), digest.lower()


def verify_password(user, password):
    if not isinstance(password, str) or len(password) > 256:
        return False
    if user.get('demo'):
        digest = hashlib.pbkdf2_hmac('sha256', password.encode(), b'universal-local-demo-v1', 100000).hex()
        return hmac.compare_digest(user['password'], digest)
    iterations, salt, digest = parse_hash(user['passwordHash'])
    return hmac.compare_digest(hashlib.pbkdf2_hmac('sha256', password.encode(), salt, iterations).hex(), digest)


def auth_version(user):
    fields = {key: user.get(key) for key in ('id', 'role', 'branch', 'passwordHash', 'password')}
    return hashlib.sha256(json.dumps(fields, sort_keys=True).encode()).hexdigest()


def load_users():
    raw = os.environ.get('ERP_USERS_JSON', '').strip()
    if not raw:
        if production():
            raise RuntimeError('Producción requiere ERP_USERS_JSON con cuentas y contraseñas propias.')
        users = {}
        digest = hashlib.pbkdf2_hmac('sha256', b'Cine2026!', b'universal-local-demo-v1', 100000).hex()
        def add(login, role, branch=None):
            users[login] = dict(id=login, role=role, branch=branch, password=digest, demo=True)
        add('gerencia', 'manager')
        add('contabilidad', 'accounting')
        for branch, slug in zip(BRANCHES, ('potosi', 'sucre', 'oruro')):
            for prefix, role in [('admin', 'administrator'), ('boleteria', 'ticketing'), ('candy', 'candy'), ('boleteria2', 'ticketing'), ('candy2', 'candy')]:
                add(prefix + '.' + slug, role, branch)
        return users
    try:
        data = json.loads(raw)
    except ValueError:
        raise RuntimeError('ERP_USERS_JSON no contiene JSON válido.') from None
    if not isinstance(data, dict) or not data or len(data) > 1000:
        raise RuntimeError('ERP_USERS_JSON debe contener un objeto con las cuentas de la empresa.')
    users = {}
    for login, row in data.items():
        if not re.fullmatch(r'[a-z0-9][a-z0-9._@+-]{0,79}', login) or not isinstance(row, dict):
            raise RuntimeError('Identificador de usuario inválido en ERP_USERS_JSON.')
        role, branch = row.get('role'), row.get('branch')
        if role not in ROLES or (role in ('manager', 'accounting') and branch is not None) or (role not in ('manager', 'accounting') and branch not in BRANCHES):
            raise RuntimeError('Rol o sucursal inválidos en ERP_USERS_JSON.')
        try:
            parse_hash(row.get('passwordHash'))
            user = dict(id=login, role=role, branch=branch, passwordHash=row['passwordHash'])
            if verify_password(user, 'Cine2026!'):
                raise ValueError('No se permite la contraseña de demostración.')
        except ValueError as error:
            raise RuntimeError(f'Cuenta {login}: {error}') from None
        users[login] = user
    return users


def normalized_origin(value, require_https=False):
    try:
        parsed = urlsplit(value)
        port = parsed.port
    except ValueError:
        raise RuntimeError('Origen web inválido.') from None
    if parsed.scheme not in ('http', 'https') or not parsed.hostname or '*' in parsed.hostname or parsed.username or parsed.password or parsed.query or parsed.fragment or parsed.path not in ('', '/'):
        raise RuntimeError('Configura un origen completo sin ruta, por ejemplo https://cine.example.com.')
    if require_https and parsed.scheme != 'https':
        raise RuntimeError('Los orígenes de producción deben usar HTTPS.')
    host = parsed.hostname.lower()
    if ':' in host:
        host = '[' + host + ']'
    default = 443 if parsed.scheme == 'https' else 80
    return parsed.scheme + '://' + host + (f':{port}' if port and port != default else '')


def allowed_origins():
    public = os.environ.get('PUBLIC_BASE_URL', '').strip()
    if production() and not public:
        raise RuntimeError('Producción requiere PUBLIC_BASE_URL con el dominio HTTPS público.')
    values = ([public] if public else []) + [v.strip() for v in os.environ.get('ERP_ALLOWED_ORIGINS', '').split(',') if v.strip()]
    return {normalized_origin(v, production()) for v in values}


def validate_environment():
    if production() and not os.environ.get('DATABASE_URL', '').strip():
        raise RuntimeError('Producción requiere DATABASE_URL de Supabase.')
    allowed_origins()
    mode = os.environ.get('ERP_PRINT_MODE', 'manual' if production() else 'local')
    if mode not in ('manual', 'agent', 'local') or production() and mode == 'local':
        raise RuntimeError('ERP_PRINT_MODE en producción debe ser manual o agent.')


def main():
    import argparse
    parser = argparse.ArgumentParser(description='Genera un hash para ERP_USERS_JSON sin guardar la contraseña.')
    parser.add_argument('command', choices=['hash-password'])
    parser.parse_args()
    password = getpass.getpass('Contraseña nueva (mínimo 12 caracteres): ')
    if password != getpass.getpass('Repite la contraseña: '):
        parser.error('Las contraseñas no coinciden.')
    print(hash_password(password))


if __name__ == '__main__':
    main()
