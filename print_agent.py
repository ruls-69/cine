"""Run on each Windows till. HTTPS polling; never expose the printer to the internet."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import secrets
import sqlite3
import sys
import time
from urllib.parse import urlparse
from urllib.request import Request, build_opener, HTTPRedirectHandler

from erp.modules.ticketing import thermal as thermal


class NoRedirect(HTTPRedirectHandler):
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        raise RuntimeError('El servidor respondió una redirección. Corrige ERP_PRINT_SERVER; no se reenviará el token.')


def settings():
    base = os.environ.get('ERP_PRINT_SERVER', '').strip().rstrip('/')
    url = urlparse(base)
    local_http = os.environ.get('ERP_PRINT_ALLOW_HTTP') == '1' and url.hostname in ('localhost', '127.0.0.1', '::1')
    if not url.hostname or url.username or url.password or url.query or url.fragment or url.path not in ('', '/') or (url.scheme != 'https' and not (url.scheme == 'http' and local_http)):
        raise ValueError('Configura ERP_PRINT_SERVER con el origen HTTPS del ERP, sin ruta ni credenciales.')
    token = os.environ.get('ERP_PRINT_TOKEN', '')
    if not 32 <= len(token) <= 256 or any(char.isspace() for char in token):
        raise ValueError('Configura un ERP_PRINT_TOKEN válido y exclusivo de esta terminal.')
    journal = Path(os.environ.get('ERP_PRINT_JOURNAL', str(Path(os.environ.get('LOCALAPPDATA', Path.home())) / 'UniversalERP' / 'print-journal.sqlite3')))
    return base, token, journal


def post(base, token, path, payload):
    request = Request(base + '/api/print-agent/' + path, data=json.dumps(payload).encode(),
                      headers={'Authorization': 'Bearer ' + token, 'Content-Type': 'application/json', 'User-Agent': 'UniversalPrintAgent/1.0'}, method='POST')
    # Default HTTPS context verifies certificates. Redirects never receive secrets.
    with build_opener(NoRedirect()).open(request, timeout=25) as response:
        raw = response.read(2000001)
        if len(raw) > 2000000:
            raise ValueError('Respuesta de impresión demasiado grande.')
        result = json.loads(raw)
        if not isinstance(result, dict):
            raise ValueError('Respuesta de impresión inválida.')
        return result


def open_journal(path):
    path.parent.mkdir(parents=True, exist_ok=True)
    db = sqlite3.connect(path)
    db.execute('PRAGMA synchronous=FULL')
    db.execute('CREATE TABLE IF NOT EXISTS jobs (id TEXT PRIMARY KEY, body TEXT NOT NULL, status TEXT NOT NULL, spool_id INTEGER, acknowledged INTEGER NOT NULL DEFAULT 0)')
    db.commit()
    return db


def acknowledge_pending(db, base, token):
    """A crash during send is ambiguous: acknowledge uncertainty, NEVER resend."""
    for job_id, body, status, spool_id in db.execute('SELECT id,body,status,spool_id FROM jobs WHERE acknowledged=0').fetchall():
        job = json.loads(body)
        outcome = 'queued' if status == 'queued' else 'uncertain'
        result = post(base, token, 'ack', dict(jobId=job_id, claimToken=job['claimToken'], status=outcome, spoolId=spool_id))
        if result.get('ok') is not True:
            raise ValueError('El servidor no confirmó el registro de impresión.')
        with db:
            db.execute('UPDATE jobs SET status=?,acknowledged=1 WHERE id=?', (outcome, job_id))


def process_job(db, job, printer):
    if not isinstance(job, dict) or not isinstance(job.get('id'), str) or not isinstance(job.get('claimToken'), str) or not isinstance(job.get('order'), dict):
        raise ValueError('Trabajo de impresión inválido.')
    # Primary key + journal commit BEFORE WritePrinter prevents automatic duplicates.
    if db.execute('SELECT 1 FROM jobs WHERE id=?', (job['id'],)).fetchone():
        return
    with db:
        db.execute('INSERT INTO jobs(id,body,status) VALUES(?,?,?)', (job['id'], json.dumps(job), 'sending'))
    try:
        payload = thermal.raw_bytes(job['order'])
        spool_id = thermal.send(printer, payload, 'Universal ' + job['order']['id'])
    except Exception:
        with db:
            db.execute('UPDATE jobs SET status=? WHERE id=?', ('uncertain', job['id']))
        print('Envío sin confirmar. Revisa la Epson y su cola antes de reimprimir.', flush=True)
    else:
        with db:
            db.execute('UPDATE jobs SET status=?,spool_id=? WHERE id=?', ('queued', spool_id, job['id']))
        print('Entradas entregadas a la cola de Windows.', flush=True)


def run():
    if os.name != 'nt':
        raise RuntimeError('Ejecuta el agente en el equipo Windows conectado a la Epson.')
    import msvcrt
    base, token, journal = settings()
    journal.parent.mkdir(parents=True, exist_ok=True)
    lock_path = journal.with_suffix('.lock')
    with lock_path.open('a+b') as lock:
        lock.seek(0, 2)
        if lock.tell() == 0:
            lock.write(b'0')
            lock.flush()
        lock.seek(0)
        try:
            msvcrt.locking(lock.fileno(), msvcrt.LK_NBLCK, 1)
        except OSError as error:
            raise RuntimeError('Ya hay otro agente usando este registro de impresión.') from error
        db = open_journal(journal)
        delay = 2
        try:
            print('Agente activo. Solo recibirá trabajos de su usuario de Boletería.', flush=True)
            while True:
                try:
                    acknowledge_pending(db, base, token)
                    # Detect installation/offline driver errors before leasing a new job.
                    printer = thermal.printer_name()
                    response = post(base, token, 'claim', {})
                    if response.get('job'):
                        process_job(db, response['job'], printer)
                        acknowledge_pending(db, base, token)
                    delay = 2
                except Exception as error:
                    # Do not log HTTP response bodies, tokens or payroll/sale payloads.
                    print('No se pudo sincronizar la impresión (' + type(error).__name__ + '). Reintentando; no se reenviarán trabajos ya procesados.', flush=True)
                    delay = min(delay * 2, 60)
                time.sleep(delay)
        finally:
            db.close()
            lock.seek(0)
            msvcrt.locking(lock.fileno(), msvcrt.LK_UNLCK, 1)


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--run', action='store_true', help='Recibir trabajos de la nube y enviarlos a la Epson.')
    parser.add_argument('--generate-token', action='store_true', help='Generar un secreto exclusivo y su huella para configurar la terminal.')
    args = parser.parse_args()
    if args.generate_token:
        token = secrets.token_urlsafe(48)
        print('ERP_PRINT_TOKEN=' + token)
        print('tokenSha256=' + hashlib.sha256(token.encode()).hexdigest())
        return
    if args.run:
        run()
    else:
        settings()
        print('Configuración válida. Impresora: ' + thermal.printer_name())
        print('No se imprimió nada. Usa --run para activar el agente.')


if __name__ == '__main__':
    try:
        main()
    except KeyboardInterrupt:
        print('Agente detenido.')
    except Exception as error:
        print(str(error), file=sys.stderr)
        sys.exit(1)
