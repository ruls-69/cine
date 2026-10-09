"""Isolated queue/journal tests. No production DB, network or printer access."""
from contextlib import contextmanager
import hashlib
import json
import os
from pathlib import Path
import sqlite3
import tempfile
import unittest
from unittest.mock import patch

from erp.modules.ticketing import print_queue as cloud_print
import print_agent


class CloudPrintTests(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.path = Path(self.tmp.name) / 'state.sqlite3'
        self.users = {
            'cashier.a': dict(id='cashier.a', role='ticketing', branch='Potosí'),
            'cashier.b': dict(id='cashier.b', role='ticketing', branch='Potosí'),
        }
        self.token = 'isolated-test-token-a' * 3
        config = {
            'terminal-a': dict(user='cashier.a', tokenSha256=hashlib.sha256(self.token.encode()).hexdigest()),
            'terminal-b': dict(user='cashier.b', tokenSha256=hashlib.sha256(b'isolated-test-token-b').hexdigest()),
        }
        self.env = patch.dict(os.environ, {'ERP_PRINT_AGENTS_JSON': json.dumps(config), 'ERP_ENV': 'production'})
        self.env.start()
        self.agent = cloud_print.authenticate('Bearer ' + self.token, self.users)
        self.other = dict(id='terminal-b', user='cashier.b', branch='Potosí')
        order = dict(id='order-a', user='cashier.a', branch='Potosí', at='2026-10-02T12:00:00-04:00', lines=[])
        with self.connect() as db:
            db.execute('CREATE TABLE state(id INTEGER PRIMARY KEY, body TEXT NOT NULL)')
            db.execute('INSERT INTO state VALUES(1,?)', (json.dumps(dict(orders=[order], log=[])),))

    def tearDown(self):
        self.env.stop()
        self.tmp.cleanup()

    @contextmanager
    def connect(self):
        db = sqlite3.connect(self.path)
        try:
            with db:
                yield db
        finally:
            db.close()

    def state(self):
        with self.connect() as db:
            return json.loads(db.execute('SELECT body FROM state WHERE id=1').fetchone()[0])

    def queue(self, **kwargs):
        return cloud_print.queue_order(self.connect, self.users, 'order-a', self.users['cashier.a'], **kwargs)

    def claim(self):
        return cloud_print.agent_action(self.connect, self.agent, 'claim', {})['job']

    def ack(self, job, status='queued'):
        return cloud_print.agent_action(self.connect, self.agent, 'ack', dict(jobId=job['id'], claimToken=job['claimToken'], status=status, spoolId=123 if status == 'queued' else None))

    def test_auth_and_exact_terminal_isolation(self):
        with self.assertRaises(PermissionError):
            cloud_print.authenticate('Bearer ' + 'x' * 64, self.users)
        self.queue()
        self.assertIsNone(cloud_print.agent_action(self.connect, self.other, 'claim', {})['job'])
        with self.assertRaises(PermissionError):
            cloud_print.queue_order(self.connect, self.users, 'order-a', self.users['cashier.b'])
        job = self.claim()
        self.assertTrue(job['order']['production'])
        with self.assertRaises(PermissionError):
            cloud_print.agent_action(self.connect, self.other, 'ack', dict(jobId=job['id'], claimToken=job['claimToken'], status='queued'))

    def test_checkout_and_pending_reprint_are_deduplicated(self):
        first = self.queue()
        self.assertEqual(first, self.queue())
        self.assertEqual(first, self.queue(reprint=True))
        job = self.claim()
        self.assertIsNone(self.claim())
        self.assertEqual('sending', self.queue(reprint=True)['status'])
        self.ack(job)
        self.ack(job)  # Lost acknowledgement response is safe to retry.
        self.assertEqual(1, len(self.state()['printJobs']))
        self.assertEqual('queued', self.queue()['status'])

    def test_lease_expiration_is_uncertain_never_automatic_retry(self):
        self.queue()
        with patch('erp.modules.ticketing.print_queue.time.time', return_value=100):
            job = self.claim()
        with patch('erp.modules.ticketing.print_queue.time.time', return_value=10000):
            self.assertTrue(cloud_print.expire_jobs(self.connect))
            self.assertFalse(cloud_print.expire_jobs(self.connect))
            self.assertIsNone(self.claim())
        self.assertEqual('uncertain', self.state()['orders'][0]['printing']['status'])
        self.assertEqual('uncertain', self.queue()['status'])
        # A late acknowledgement still confirms that exact claim, without resending.
        self.ack(job)
        self.assertEqual('queued', self.state()['orders'][0]['printing']['status'])

    def test_reprint_idempotency_and_old_ack_do_not_overwrite_new_job(self):
        self.queue()
        old = self.claim()
        with patch('erp.modules.ticketing.print_queue.time.time', return_value=99999999999):
            newer = self.queue(reprint=True, request_id='reprint-attempt-01')
        self.ack(old)
        self.assertEqual(newer['jobId'], self.state()['orders'][0]['printing']['jobId'])
        self.ack(self.claim())
        repeated = self.queue(reprint=True, request_id='reprint-attempt-01')
        self.assertEqual(newer['jobId'], repeated['jobId'])
        self.assertEqual(2, len(self.state()['printJobs']))

    def test_local_journal_prevents_duplicate_and_recovers_uncertainty(self):
        self.queue()
        job = self.claim()
        journal = print_agent.open_journal(Path(self.tmp.name) / 'journal.sqlite3')
        try:
            with patch('print_agent.thermal.raw_bytes', return_value=b'test'), patch('print_agent.thermal.send', return_value=123) as send:
                print_agent.process_job(journal, job, 'fake printer')
                print_agent.process_job(journal, job, 'fake printer')
                self.assertEqual(1, send.call_count)
            with journal:
                journal.execute('UPDATE jobs SET status=?,spool_id=NULL', ('sending',))
            with patch('print_agent.post', return_value={'ok': True}) as post:
                print_agent.acknowledge_pending(journal, 'https://example.invalid', self.token)
                self.assertEqual('uncertain', post.call_args.args[3]['status'])
                self.assertEqual(1, journal.execute('SELECT acknowledged FROM jobs').fetchone()[0])
        finally:
            journal.close()


if __name__ == '__main__':
    unittest.main()
