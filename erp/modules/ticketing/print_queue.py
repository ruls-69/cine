"""Durable outbound-only print queue for Windows terminals connected to the ERP.

printJobs is private server state and MUST NOT be returned by /api/state.
All mutations use the same transaction/connection adapter as sales.
"""
import copy
import hashlib
import hmac
import json
import os
import re
import secrets
import time
from datetime import datetime, timezone

LEASE_SECONDS = 600


def _now():
    return datetime.now(timezone.utc).isoformat(timespec='seconds')


def validate_config(users):
    """Return verified terminal registrations. No raw access token is stored."""
    try:
        config = json.loads(os.environ.get('ERP_PRINT_AGENTS_JSON', '{}'))
    except (ValueError, TypeError) as error:
        raise ValueError('ERP_PRINT_AGENTS_JSON debe ser un objeto JSON válido.') from error
    if not isinstance(config, dict):
        raise ValueError('ERP_PRINT_AGENTS_JSON debe ser un objeto por terminal.')
    result = {}
    seen_users = set()
    for terminal, row in config.items():
        if not isinstance(terminal, str) or not re.fullmatch(r'[a-zA-Z0-9_-]{1,64}', terminal) or not isinstance(row, dict):
            raise ValueError('Registro de terminal de impresión inválido.')
        login = row.get('user')
        user = users.get(login) if isinstance(login, str) else None
        digest = row.get('tokenSha256', '')
        if not user or user.get('role') != 'ticketing' or not user.get('branch'):
            raise ValueError('Cada terminal debe pertenecer a un usuario de Boletería con sucursal.')
        if login in seen_users:
            raise ValueError('Usa un usuario de Boletería diferente para cada terminal.')
        if not isinstance(digest, str) or not re.fullmatch(r'[a-fA-F0-9]{64}', digest):
            raise ValueError('El token de la terminal requiere su huella SHA-256 de 64 caracteres.')
        if any(hmac.compare_digest(digest.lower(), item['tokenSha256']) for item in result.values()):
            raise ValueError('Cada terminal necesita un token diferente.')
        result[terminal] = dict(id=terminal, user=login, branch=user['branch'], tokenSha256=digest.lower())
        seen_users.add(login)
    return result


def authenticate(authorization, users):
    """Authenticate a printer separately from browser sessions and passwords."""
    parts = str(authorization or '').split(' ')
    if len(parts) != 2 or parts[0] != 'Bearer' or not 32 <= len(parts[1]) <= 256:
        raise PermissionError('Terminal no autorizada.')
    digest = hashlib.sha256(parts[1].encode()).hexdigest()
    matched = None
    for agent in validate_config(users).values():
        if hmac.compare_digest(digest, agent['tokenSha256']):
            matched = agent
    if not matched:
        raise PermissionError('Terminal no autorizada.')
    return {key: matched[key] for key in ('id', 'user', 'branch')}


def _read(db):
    db.execute('BEGIN IMMEDIATE')
    row = db.execute('SELECT body FROM state WHERE id=1').fetchone()
    if not row:
        raise ValueError('El sistema no está inicializado.')
    return json.loads(row[0])


def _save(db, state):
    db.execute('UPDATE state SET body=? WHERE id=1', (json.dumps(state, ensure_ascii=False),))


def _order(state, order_id, user):
    order = next((row for row in state.get('orders', []) if row['id'] == order_id), None)
    if not order or user.get('role') != 'ticketing' or order['user'] != user['id'] or order['branch'] != user['branch']:
        raise PermissionError('No tienes permiso para imprimir esta venta.')
    return order


def _public(job):
    messages = {
        'pending': 'Entradas pendientes de la terminal de impresión. Mantén el agente abierto.',
        'sending': 'La terminal está enviando las entradas a la Epson.',
        'queued': 'Entradas aceptadas por la cola de impresión de Windows. Comprueba la salida en papel.',
        'uncertain': 'Impresión sin confirmar. Revisa el papel y la cola de Windows antes de solicitar una reimpresión.',
    }
    return dict(status=job['status'], message=messages[job['status']], jobId=job['id'],
                terminal=job['terminal'], at=job.get('updated', job['at']))


def _sync_order(state, job):
    order = next((row for row in state.get('orders', []) if row['id'] == job['orderId']), None)
    if order and order.get('printing', {}).get('jobId') == job['id']:
        order['printing'] = _public(job)


def _expire(state, timestamp):
    changed = False
    for job in state.get('printJobs', []):
        if job['status'] == 'sending' and job.get('leaseUntil', 0) <= timestamp:
            job.update(status='uncertain', updated=_now(), reason='lease_expired')
            _sync_order(state, job)
            changed = True
    return changed


def expire_jobs(connect):
    """Refresh abandoned claims before exposing print statuses to a browser."""
    with connect() as db:
        row = db.execute('SELECT body FROM state WHERE id=1').fetchone()
        if not row:
            return False
        snapshot = json.loads(row[0])
    if not any(job['status'] == 'sending' and job.get('leaseUntil', 0) <= time.time()
               for job in snapshot.get('printJobs', [])):
        return False
    with connect() as db:
        state = _read(db)
        changed = _expire(state, time.time())
        if changed:
            _save(db, state)
        return changed


def queue_order(connect, users, order_id, user, reprint=False, request_id=None):
    agents = validate_config(users)
    agent = next((row for row in agents.values() if row['user'] == user['id'] and row['branch'] == user['branch']), None)
    with connect() as db:
        state = _read(db)
        order = _order(state, order_id, user)
        _expire(state, time.time())
        if request_id is not None:
            if not isinstance(request_id, str) or not re.fullmatch(r'[a-zA-Z0-9_-]{8,100}', request_id):
                raise ValueError('Identificador de impresión inválido.')
            existing = next((job for job in state.get('printJobs', []) if job['orderId'] == order_id
                             and job['user'] == user['id'] and job.get('requestId') == request_id), None)
            if existing:
                _save(db, state)
                return _public(existing)
        previous = order.get('printing', {})
        # Never make a second pending/sending job, even if a double click says reprint.
        if previous.get('status') in ('pending', 'sending') or (previous.get('status') in ('queued', 'uncertain') and not reprint):
            _save(db, state)
            return dict(previous)
        if not agent:
            order['printing'] = dict(status='unavailable', message='Esta caja no tiene terminal de impresión configurada. Usa «Ver entradas» para imprimir manualmente.', at=_now())
            _save(db, state)
            return dict(order['printing'])
        payload = {key: copy.deepcopy(order[key]) for key in ('id', 'branch', 'user', 'at', 'lines')}
        payload['production'] = os.environ.get('ERP_ENV', '').lower() == 'production'
        job = dict(id=secrets.token_hex(16), orderId=order['id'], branch=order['branch'],
                   user=order['user'], terminal=agent['id'], status='pending', at=_now(), order=payload)
        if request_id is not None:
            job['requestId'] = request_id
        state.setdefault('printJobs', []).append(job)
        order['printing'] = _public(job)
        state.setdefault('log', []).append(dict(id=secrets.token_hex(6), branch=order['branch'],
                                             at=_now(), user=user['id'], action='ticket_reprint_requested' if reprint else 'ticket_print_requested'))
        _save(db, state)
        return dict(order['printing'])


def manual_order(connect, order_id, user):
    with connect() as db:
        state = _read(db)
        order = _order(state, order_id, user)
        # Switching mode must not obscure an already submitted automatic job.
        if order.get('printing', {}).get('status') in ('pending', 'sending', 'queued', 'uncertain'):
            return dict(order['printing'])
        order['printing'] = dict(status='manual', message='Abre «Ver entradas» y selecciona «Imprimir boletos» en el equipo de caja.', at=_now())
        _save(db, state)
        return dict(order['printing'])


def agent_action(connect, agent, action, data):
    """Claim one job or acknowledge a lease. Caller authenticates first."""
    if action not in ('claim', 'ack') or not isinstance(data, dict):
        raise ValueError('Operación de impresión inválida.')
    with connect() as db:
        state = _read(db)
        _expire(state, time.time())
        own = [job for job in state.get('printJobs', []) if job['terminal'] == agent['id']
               and job['user'] == agent['user'] and job['branch'] == agent['branch']]
        if action == 'claim':
            # One in-flight job per terminal; old ambiguous jobs require human review.
            job = None if any(row['status'] == 'sending' for row in own) else next((row for row in own if row['status'] == 'pending'), None)
            if job:
                job.update(status='sending', claimToken=secrets.token_urlsafe(32), leaseUntil=time.time() + LEASE_SECONDS, updated=_now())
                _sync_order(state, job)
            _save(db, state)
            return {'job': dict(id=job['id'], claimToken=job['claimToken'], order=job['order']) if job else None}
        job_id, claim_token, outcome = data.get('jobId'), data.get('claimToken'), data.get('status')
        if not isinstance(job_id, str) or not isinstance(claim_token, str) or outcome not in ('queued', 'uncertain'):
            raise ValueError('Confirmación de impresión inválida.')
        job = next((row for row in own if row['id'] == job_id), None)
        if not job or not job.get('claimToken') or not hmac.compare_digest(job['claimToken'], claim_token):
            raise PermissionError('La confirmación no corresponde a esta terminal.')
        if job.get('acknowledged'):
            if job['status'] != outcome:
                raise ValueError('La impresión ya tiene una confirmación diferente.')
            _save(db, state)
            return {'ok': True, 'printing': _public(job)}
        if job['status'] not in ('sending', 'uncertain'):
            raise ValueError('La impresión no admite confirmación.')
        spool_id = data.get('spoolId')
        if spool_id is not None and (isinstance(spool_id, bool) or not isinstance(spool_id, int) or not 1 <= spool_id <= 4294967295):
            raise ValueError('Identificador de impresión inválido.')
        job.update(status=outcome, acknowledged=True, updated=_now())
        if spool_id is not None:
            job['spoolId'] = spool_id
        _sync_order(state, job)
        state.setdefault('log', []).append(dict(id=secrets.token_hex(6), branch=job['branch'],
                                             at=_now(), user=job['user'], action='ticket_print_' + outcome))
        _save(db, state)
        return {'ok': True, 'printing': _public(job)}
