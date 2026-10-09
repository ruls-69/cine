"""Isolated SMTP-worker tests: temporary database and mocked SMTP only."""
from contextlib import contextmanager
from datetime import datetime, timezone
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import time
import unittest
from unittest.mock import DEFAULT, patch

from erp.modules.payroll import mail as payroll_mail


class PayrollMailWorkerTests(unittest.TestCase):
    def setUp(self):
        root = Path(__file__).resolve().parent / 'tmp'
        root.mkdir(exist_ok=True)
        self.tmp = tempfile.TemporaryDirectory(prefix='mail-worker-', dir=root)
        self.path = Path(self.tmp.name) / 'state.sqlite3'
        self.env = patch.dict(os.environ, dict(ERP_PAYROLL_MAIL_ENABLED='true', ERP_SMTP_HOST='smtp.example.invalid',
                                              ERP_SMTP_USER='example', ERP_SMTP_PASSWORD='test-only',
                                              ERP_SMTP_FROM='payroll@example.invalid', ERP_SMTP_SECURITY='starttls', ERP_SMTP_PORT='587'))
        self.env.start()
        self.run = dict(id='run-one', branch='Potosí', status='Validada', month='2026-09',
                        lines=[dict(employee='employee-one'), dict(employee='employee-two')])
        self.job = dict(id='mail-one', branch='Potosí', run='run-one', employee='employee-one',
                        name='Empleado de prueba', recipient='one@example.invalid',
                        subject='Reporte de prueba', status='Pendiente de conectar correo')
        self.write(dict(payrollRuns=[self.run], payrollMail=[self.job], log=[]))

    def tearDown(self):
        self.env.stop()
        root = Path(__file__).resolve().parent / 'tmp'
        assert Path(self.tmp.name).resolve().is_relative_to(root)
        self.tmp.cleanup()

    def now(self):
        return datetime.now(timezone.utc).isoformat(timespec='seconds')

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path, timeout=5)
        try:
            with db:
                yield db
        finally:
            db.close()

    def read(self):
        with self.connect() as db:
            return json.loads(db.execute('SELECT body FROM state WHERE id=1').fetchone()[0])

    def write(self, state):
        with self.connect() as db:
            db.execute('CREATE TABLE IF NOT EXISTS state(id INTEGER PRIMARY KEY,body TEXT NOT NULL)')
            db.execute('INSERT OR REPLACE INTO state VALUES(1,?)', (json.dumps(state),))

    def test_another_worker_preserves_an_active_lease(self):
        first = payroll_mail.claim_pending(self.connect, self.now)
        self.assertIsNotNone(first)
        self.assertIsNone(payroll_mail.claim_pending(self.connect, self.now))
        current = self.read()['payrollMail'][0]
        self.assertEqual('Enviando', current['status'])
        self.assertEqual(first[0]['attempt'], current['attempt'])

    def test_expired_claim_never_resends_and_late_ack_is_scoped(self):
        with patch('erp.modules.payroll.mail.time.time', return_value=100):
            job, run = payroll_mail.claim_pending(self.connect, self.now)
        with patch('erp.modules.payroll.mail.time.time', return_value=10000):
            self.assertIsNone(payroll_mail.claim_pending(self.connect, self.now))
        self.assertEqual('Revisar envío', self.read()['payrollMail'][0]['status'])
        payroll_mail.finish_attempt(self.connect, self.now, job, 'Enviado', '')
        self.assertEqual('Enviado', self.read()['payrollMail'][0]['status'])
        self.assertIsNone(payroll_mail.claim_pending(self.connect, self.now))

    def test_old_attempt_cannot_overwrite_manual_retry(self):
        old, run = payroll_mail.claim_pending(self.connect, self.now)
        state = self.read()
        state['payrollMail'][0]['status'] = 'Pendiente de conectar correo'
        self.write(state)
        new, run = payroll_mail.claim_pending(self.connect, self.now)
        self.assertNotEqual(old['attempt'], new['attempt'])
        self.assertFalse(payroll_mail.finish_attempt(self.connect, self.now, old, 'Enviado', ''))
        self.assertEqual(new['attempt'], self.read()['payrollMail'][0]['attempt'])

    def test_recent_legacy_attempt_is_not_invalidated_on_worker_start(self):
        state = self.read()
        state['payrollMail'][0].update(status='Enviando', attempt='legacy', attemptAt=self.now())
        self.write(state)
        self.assertIsNone(payroll_mail.claim_pending(self.connect, self.now))
        current = self.read()['payrollMail'][0]
        self.assertEqual('Enviando', current['status'])
        self.assertGreater(current['leaseUntil'], time.time())

    def test_disabled_worker_never_claims_or_sends(self):
        with patch.dict(os.environ, {'ERP_PAYROLL_MAIL_ENABLED': 'false'}), patch('erp.modules.payroll.mail.deliver') as deliver:
            payroll_mail.MailWorker(self.connect, self.now).tick()
            deliver.assert_not_called()
        self.assertEqual('Pendiente de conectar correo', self.read()['payrollMail'][0]['status'])

    def test_missing_employee_cannot_send_complete_payroll(self):
        state = self.read()
        state['payrollMail'][0]['employee'] = ''
        self.write(state)
        with patch('erp.modules.payroll.mail.deliver') as deliver:
            payroll_mail.MailWorker(self.connect, self.now).tick()
            deliver.assert_not_called()
        self.assertEqual('Revisar envío', self.read()['payrollMail'][0]['status'])

    def test_db_outage_after_smtp_acceptance_retries_only_db(self):
        worker = payroll_mail.MailWorker(self.connect, self.now)
        original = payroll_mail.finish_attempt
        with patch('erp.modules.payroll.mail.deliver') as deliver, patch('erp.modules.payroll.mail.finish_attempt', wraps=original, side_effect=[sqlite3.OperationalError('temporary'), DEFAULT]):
            with self.assertRaises(sqlite3.OperationalError):
                worker.tick()
            self.assertIsNotNone(worker.pending_result)
            worker.tick()
            self.assertEqual(1, deliver.call_count)
        self.assertEqual('Enviado', self.read()['payrollMail'][0]['status'])

    def test_ambiguous_smtp_result_never_automatically_retries(self):
        worker = payroll_mail.MailWorker(self.connect, self.now)
        with patch('erp.modules.payroll.mail.deliver', side_effect=TimeoutError('uncertain')) as deliver:
            worker.tick()
            worker.tick()
            self.assertEqual(1, deliver.call_count)
        self.assertEqual('Revisar envío', self.read()['payrollMail'][0]['status'])

    def test_smtp_uses_tls_and_exact_employee_attachment(self):
        job, run = payroll_mail.claim_pending(self.connect, self.now)
        with patch('erp.modules.payroll.mail.payroll.report', return_value=b'<html>only one employee</html>') as report, patch('erp.modules.payroll.mail.smtplib.SMTP') as constructor:
            smtp = constructor.return_value
            smtp.send_message.return_value = {}
            payroll_mail.deliver(job, run)
            report.assert_called_once_with(run, 'employee-one')
            smtp.starttls.assert_called_once()
            message = smtp.send_message.call_args.args[0]
            self.assertEqual('one@example.invalid', message['To'])
            self.assertEqual(1, len(list(message.iter_attachments())))

    def test_background_loop_recovers_from_database_failure(self):
        original = payroll_mail.claim_pending
        stop = None
        try:
            with patch('erp.modules.payroll.mail.POLL_SECONDS', 0.01), patch('erp.modules.payroll.mail.deliver') as deliver, patch('erp.modules.payroll.mail.claim_pending', wraps=original, side_effect=[sqlite3.OperationalError('temporary'), DEFAULT, DEFAULT, DEFAULT]):
                stop = payroll_mail.start(self.connect, self.now)
                deadline = time.monotonic() + 2
                while time.monotonic() < deadline and not deliver.called:
                    time.sleep(0.01)
                stop.set()
                # Give an in-progress DB acknowledgement a chance to finish.
                time.sleep(0.05)
                self.assertEqual(1, deliver.call_count)
        finally:
            if stop:
                stop.set()


if __name__ == '__main__':
    unittest.main()
