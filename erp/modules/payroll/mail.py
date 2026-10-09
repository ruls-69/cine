"""Optional SMTP delivery with durable claims and conservative failure recovery.

SMTP acceptance is not proof of inbox delivery. Ambiguous attempts never resend
automatically, including when database confirmation fails after SMTP acceptance.
"""
import copy
from datetime import datetime
import json
import logging
import os
import secrets
import smtplib
import ssl
import threading
import time
from email.message import EmailMessage

from erp.modules.payroll import presentation as payroll
from erp.modules.payroll.domain import email as validate_email

LEASE_SECONDS = 15 * 60
POLL_SECONDS = 15
LOGGER = logging.getLogger(__name__)
UNCERTAIN = 'No se pudo confirmar la entrega al servidor de correo. Revisa la cuenta emisora antes de reintentar.'


def configured():
    return os.environ.get('ERP_PAYROLL_MAIL_ENABLED') == 'true' and all(
        os.environ.get(key) for key in ('ERP_SMTP_HOST', 'ERP_SMTP_USER', 'ERP_SMTP_PASSWORD', 'ERP_SMTP_FROM'))


def _load(db):
    db.execute('BEGIN IMMEDIATE')
    row = db.execute('SELECT body FROM state WHERE id=1').fetchone()
    if not row:
        raise ValueError('El sistema no está inicializado.')
    return json.loads(row[0])


def _save(db, state):
    db.execute('UPDATE state SET body=? WHERE id=1', (json.dumps(state, ensure_ascii=False),))


def _log(state, job, at, action):
    state.setdefault('log', []).append(dict(id=secrets.token_hex(6), branch=job['branch'],
                                         at=at, user='sistema', action=action))


def _expire(state, at, timestamp):
    changed = False
    for job in state.get('payrollMail', []):
        if job['status'] != 'Enviando':
            continue
        lease = job.get('leaseUntil')
        if not isinstance(lease, (int, float)):
            # Legacy attempts predate leases. Preserve a recent sender, and give
            # undated attempts a full lease rather than resetting them on startup.
            try:
                started = datetime.fromisoformat(job.get('attemptAt', ''))
                lease = started.timestamp() + LEASE_SECONDS if started.tzinfo else timestamp + LEASE_SECONDS
            except (ValueError, TypeError, OverflowError):
                lease = timestamp + LEASE_SECONDS
            job['leaseUntil'] = lease
            changed = True
        if lease <= timestamp:
            job.update(status='Revisar envío', error='Venció el tiempo de confirmación. Comprueba la recepción antes de reintentar.', finishedAt=at)
            _log(state, job, at, 'payroll_email_lease_expired')
            changed = True
    return changed


def claim_pending(connect, now, enabled=True):
    """Atomically select a validated employee-only report across all workers."""
    at, timestamp = now(), time.time()
    with connect() as db:
        state = _load(db)
        changed = _expire(state, at, timestamp)
        claimed = None
        if enabled:
            runs = {run['id']: run for run in state.get('payrollRuns', [])}
            for job in state.get('payrollMail', []):
                if job['status'] != 'Pendiente de conectar correo' or not job.get('recipient'):
                    continue
                run = runs.get(job.get('run'))
                if not run or run.get('status') != 'Validada':
                    # Do not let an orphan or corrected run block subsequent mail.
                    continue
                employee = job.get('employee')
                matching = [line for line in run.get('lines', []) if line.get('employee') == employee]
                if not isinstance(employee, str) or not employee or len(matching) != 1 or run.get('branch') != job.get('branch'):
                    job.update(status='Revisar envío', error='El reporte no identifica un único empleado de la sucursal. Revisa la planilla antes de enviar.', finishedAt=at)
                    _log(state, job, at, 'payroll_email_invalid_recipient_scope')
                    changed = True
                    continue
                job.update(status='Enviando', attempt=secrets.token_hex(16), attemptAt=at,
                           leaseUntil=timestamp + LEASE_SECONDS, error='')
                claimed = (copy.deepcopy(job), copy.deepcopy(run))
                changed = True
                break
        if changed:
            _save(db, state)
        return claimed


def deliver(job, run):
    """One network attempt only; caller persists the result or retains it in RAM."""
    employee = job.get('employee')
    if not employee or run.get('status') != 'Validada' or run.get('branch') != job.get('branch') or sum(line.get('employee') == employee for line in run.get('lines', [])) != 1:
        raise ValueError('El envío requiere el reporte de un único empleado de la sucursal.')
    attachment = payroll.report(run, employee)
    sender, recipient = validate_email(os.environ['ERP_SMTP_FROM']), validate_email(job['recipient'])
    if not sender or not recipient:
        raise ValueError('Remitente o destinatario vacío.')
    message = EmailMessage()
    message['From'], message['To'], message['Subject'] = sender, recipient, job['subject']
    message['Message-ID'] = f'<payroll-{job["id"]}-{job["attempt"]}@{sender.split("@")[-1]}>'
    message.set_content(f'Hola {job["name"]},\n\nContabilidad aprobó tu reporte salarial de {run["month"]}. Adjuntamos únicamente tu detalle individual.\n\nEste reporte no acredita una transferencia ni un pago ejecutado. Para observaciones, contacta a Contabilidad.\n\nMulticine Universal')
    message.add_attachment(attachment, maintype='text', subtype='html', filename=f'reporte-salarial-{run["month"]}.html')
    mode = os.environ.get('ERP_SMTP_SECURITY', 'starttls')
    host = os.environ['ERP_SMTP_HOST']
    port = int(os.environ.get('ERP_SMTP_PORT', '465' if mode == 'ssl' else '587'))
    if mode not in ('ssl', 'starttls') or not 1 <= port <= 65535:
        raise ValueError('SMTP requiere un puerto válido y TLS.')
    smtp = smtplib.SMTP_SSL(host, port, timeout=30, context=ssl.create_default_context()) if mode == 'ssl' else smtplib.SMTP(host, port, timeout=30)
    with smtp:
        if mode == 'starttls':
            smtp.ehlo()
            smtp.starttls(context=ssl.create_default_context())
            smtp.ehlo()
        smtp.login(os.environ['ERP_SMTP_USER'], os.environ['ERP_SMTP_PASSWORD'])
        if smtp.send_message(message):
            raise RuntimeError('Destinatario rechazado.')


def finish_attempt(connect, now, job, status, error):
    if status not in ('Enviado', 'Revisar envío'):
        raise ValueError('Resultado de correo inválido.')
    at = now()
    with connect() as db:
        state = _load(db)
        current = next((row for row in state.get('payrollMail', []) if row['id'] == job['id']), None)
        # An older worker cannot overwrite a manually retried attempt or a new claim.
        if not current or current.get('attempt') != job['attempt'] or current['status'] not in ('Enviando', 'Revisar envío'):
            return False
        # Retrying only the DB acknowledgement must not duplicate log entries.
        if current.get('acknowledgedAttempt') == job['attempt']:
            return True
        current.update(status=status, error=error, finishedAt=at, acknowledgedAttempt=job['attempt'])
        _log(state, job, at, 'payroll_email_' + status)
        _save(db, state)
        return True


class MailWorker:
    def __init__(self, connect, now):
        self.connect, self.now = connect, now
        self.pending_result = None

    def tick(self):
        if self.pending_result:
            # If SMTP succeeded and the DB failed, retry ONLY the DB write.
            finish_attempt(self.connect, self.now, *self.pending_result)
            self.pending_result = None
        claimed = claim_pending(self.connect, self.now, enabled=configured())
        if not claimed:
            return
        job, run = claimed
        try:
            deliver(job, run)
            status, error = 'Enviado', ''
        except Exception:
            status, error = 'Revisar envío', UNCERTAIN
        self.pending_result = (job, status, error)
        finish_attempt(self.connect, self.now, *self.pending_result)
        self.pending_result = None


def start(connect, now):
    """Preserved server API. Database outages never terminate this daemon."""
    stop = threading.Event()
    worker = MailWorker(connect, now)

    def loop():
        while not stop.wait(POLL_SECONDS):
            try:
                worker.tick()
            except Exception as error:
                # Do not log SMTP credentials, recipient names, or report contents.
                LOGGER.warning('No se pudo sincronizar la cola salarial (%s); se reintentará sin reenviar intentos procesados.', type(error).__name__)

    threading.Thread(target=loop, daemon=True, name='payroll-mail').start()
    return stop
