"""Infrastructure checks using temporary SQLite only, never the working database."""
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from tempfile import TemporaryDirectory
from unittest.mock import patch, Mock, MagicMock
import json
import os
import unittest
import migrate_data
from erp.infrastructure import persistence as storage


class StorageTests(unittest.TestCase):
    def setUp(self):
        self.environment = patch.dict(os.environ, {'ERP_ENV': 'development', 'DATABASE_URL': ''})
        self.environment.start()
        self.directory = TemporaryDirectory(prefix='erp-storage-')
        self.path = Path(self.directory.name) / 'test.sqlite3'
        storage.initialize(self.path, storage.empty_state, lambda state: None)

    def tearDown(self):
        self.directory.cleanup()
        self.environment.stop()

    def load(self):
        with storage.connect(self.path) as db:
            return json.loads(db.execute('SELECT body FROM state WHERE id=1').fetchone()[0])

    def test_transaction_rolls_back_after_failure(self):
        with self.assertRaises(ValueError):
            with storage.connect(self.path) as db:
                db.execute('BEGIN IMMEDIATE')
                db.execute('UPDATE state SET body=? WHERE id=1', ('{"sales":[{}]}',))
                raise ValueError('interrupted')
        self.assertEqual(self.load()['sales'], [])

    def test_concurrent_updates_keep_every_record(self):
        def update(i):
            with storage.connect(self.path) as db:
                db.execute('BEGIN IMMEDIATE')
                state = json.loads(db.execute('SELECT body FROM state WHERE id=1').fetchone()[0])
                state['sales'].append({'id': str(i)})
                db.execute('UPDATE state SET body=? WHERE id=1', (json.dumps(state),))
        with ThreadPoolExecutor(max_workers=5) as executor:
            list(executor.map(update, range(20)))
        self.assertEqual(len(self.load()['sales']), 20)

    def test_initialization_preserves_existing_rows(self):
        with storage.connect(self.path) as db:
            db.execute('UPDATE state SET body=? WHERE id=1', ('{"sales":[{"id":"sale-1"}]}',))
        storage.initialize(self.path, lambda: self.fail('must not seed'), lambda state: None)
        self.assertEqual(self.load()['sales'], [{'id': 'sale-1'}])
        self.assertIn('printJobs', self.load())

    def test_production_never_falls_back_to_sqlite(self):
        with patch.dict(os.environ, {'ERP_ENV': 'production', 'DATABASE_URL': ''}):
            with self.assertRaises(RuntimeError):
                with storage.connect(self.path):
                    pass

    def test_sessions_persist_across_store_instances_and_expire(self):
        storage.auth_store(self.path).session_create('hashed-token', 'accountant', 'version', 900, 100)
        store = storage.auth_store(self.path)
        self.assertEqual(store.session_lookup('hashed-token', 150, 200)['user_id'], 'accountant')
        self.assertIsNone(store.session_lookup('hashed-token', 301, 200))

    def test_session_absolute_expiry_survives_activity(self):
        store = storage.auth_store(self.path)
        store.session_create('token', 'user', 'v1', 500, 100)
        self.assertIsNotNone(store.session_lookup('token', 450, 1000))
        self.assertIsNone(store.session_lookup('token', 500, 1000))

    def test_login_limit_is_atomic_and_persistent(self):
        def allowed(_):
            return storage.auth_store(self.path).login_allowed('ip-user-hash', 100, 300, 4)
        with ThreadPoolExecutor(max_workers=6) as executor:
            results = list(executor.map(allowed, range(12)))
        self.assertEqual(sum(results), 4)
        self.assertFalse(storage.auth_store(self.path).login_allowed('ip-user-hash', 101, 300, 4))
        self.assertTrue(storage.auth_store(self.path).login_allowed('ip-user-hash', 401, 300, 4))

    def test_snapshot_integrity_and_exclusive_creation(self):
        path = Path(self.directory.name) / 'backup.json'
        state = self.load()
        migrate_data.save_snapshot(path, state)
        self.assertEqual(migrate_data.read_snapshot(path), state)
        with self.assertRaises(FileExistsError):
            migrate_data.save_snapshot(path, state)
        payload = json.loads(path.read_text(encoding='utf-8'))
        payload['state']['sales'].append({'id': 'tampered'})
        path.write_text(json.dumps(payload), encoding='utf-8')
        with self.assertRaises(ValueError):
            migrate_data.read_snapshot(path)

    def test_import_refuses_existing_data(self):
        conn = Mock()
        conn.execute.return_value.fetchone.return_value = ({'sales': [{'id': 'real-sale'}]},)
        with self.assertRaisesRegex(ValueError, 'ya tiene registros'):
            migrate_data.destination_empty(conn)
        self.assertEqual(conn.execute.call_count, 1)

    def test_invalid_state_is_rejected(self):
        for state in ({'sales': 'invalid'}, {'sales': [{'id': 'a'}, {'id': 'a'}]},
                      {'sales': [{'amount': float('nan')}]}, {'sales': [42]}):
            with self.assertRaises(ValueError):
                migrate_data.validate(state)

    def test_migration_rejects_missing_branch_and_broken_reference(self):
        with self.assertRaisesRegex(ValueError, 'Sucursal'):
            migrate_data.validate({'products': [{'id': 'product'}]})
        state = storage.empty_state()
        state['candyRequests'] = [dict(id='request', branch='Potosí', user='cashier', at='today',
                                       order='missing', status='Pendiente', reason='error')]
        with self.assertRaisesRegex(ValueError, 'Referencia'):
            migrate_data.validate(state)

    def test_restore_legacy_inflight_print_requires_review_without_jobs(self):
        state = storage.empty_state()
        state['orders'] = [dict(id='order', branch='Potosí', user='cashier', day='2026-10-01',
                                at='2026-10-01T12:00:00-04:00', requestId='sale-request', lines=[], total=0,
                                printing={'status': 'sending'})]
        connection = MagicMock()
        connection.__enter__.return_value = connection
        connection.execute.return_value.fetchone.return_value = (storage.empty_state(),)
        with patch('migrate_data.owner_connection', return_value=connection), patch('builtins.print'):
            migrate_data.import_state(state, apply=True)
        write = next(call for call in connection.execute.call_args_list if call.args[0].startswith('UPDATE'))
        restored = json.loads(write.args[1][0])
        self.assertEqual(restored['orders'][0]['printing']['status'], 'uncertain')
        self.assertFalse(restored['printJobs'])

    def test_postgres_adapter_locks_before_domain_write(self):
        raw = Mock()
        adapter = storage.PostgresStateConnection(raw)
        adapter.execute('BEGIN IMMEDIATE')
        adapter.execute('SELECT body FROM state WHERE id=1')
        adapter.execute('UPDATE state SET body=? WHERE id=1', ('{}',))
        queries = [call.args[0] for call in raw.execute.call_args_list]
        self.assertIn('FOR UPDATE', queries[0])
        self.assertIn('body::text', queries[1])
        self.assertIn('revision=revision+1', queries[2])
        with self.assertRaises(RuntimeError):
            adapter.execute('DROP TABLE state')


if __name__ == '__main__':
    unittest.main()
