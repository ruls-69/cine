"""HTTP boundaries against a disposable database; no real sales, mail or printing."""
import hashlib
import importlib
import io
import json
import os
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

from erp.modules.identity import infrastructure as auth_config
import server


class HTTPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory()
        cls.old_db = server.DB
        server.DB = Path(cls.temp.name) / 'http.sqlite3'
        cls.env = patch.dict(os.environ, {'ERP_ENV': 'test', 'DATABASE_URL': '', 'ERP_USERS_JSON': '', 'PUBLIC_BASE_URL': '', 'ERP_ALLOWED_ORIGINS': '', 'ERP_PRINT_AGENTS_JSON': '{}', 'ERP_PRINT_MODE': 'manual', 'ERP_PAYROLL_MAIL_ENABLED': 'false'})
        cls.env.start()
        cls.app = importlib.import_module('wsgi')
        cls.app._mail_stop.set()

    @classmethod
    def tearDownClass(cls):
        server.DB = cls.old_db
        cls.env.stop()
        cls.temp.cleanup()

    def request(self, path, data=None, method=None, headers=None):
        payload = json.dumps(data).encode() if data is not None else b''
        env = {'REQUEST_METHOD': method or ('POST' if data is not None else 'GET'), 'PATH_INFO': path,
               'QUERY_STRING': '', 'REMOTE_ADDR': '127.0.0.1', 'HTTP_HOST': 'localhost',
               'CONTENT_TYPE': 'application/json', 'CONTENT_LENGTH': str(len(payload)),
               'wsgi.input': io.BytesIO(payload), 'SERVER_PROTOCOL': 'HTTP/1.1'}
        env.update(headers or {})
        captured = {}
        def start_response(status, response_headers):
            captured.update(status=int(status.split()[0]), headers=dict(response_headers))
        result = b''.join(self.app.application(env, start_response))
        return captured['status'], captured['headers'], result

    def login(self):
        status, headers, body = self.request('/api/login', {'username': 'gerencia', 'password': 'Cine2026!'})
        self.assertEqual(status, 200, body)
        return headers['Set-Cookie'].split(';')[0]

    def test_local_credentials_and_injected_configuration(self):
        self.login()
        status, headers, body = self.request('/admin.html')
        self.assertEqual(status, 200)
        self.assertIn(b'window.ERP_CONFIG={"production": false}', body)
        self.assertIn('no-store', headers['Cache-Control'])
        self.assertNotIn(b'<!--ERP_CONFIG-->', body)

    def test_private_files_get_and_head_are_denied(self):
        for method in ('GET', 'HEAD'):
            for path in ('/erp.sqlite3', '/server.py', '/.env', '/storage.py', '/supabase/schema.sql', '/erp/application/commands.py', '/erp/modules/identity/infrastructure.py', '/src/app/admin.js', '/src/shared/contracts.ts'):
                status, _, body = self.request(path, method=method)
                self.assertEqual(status, 404, (method, path))
                if method == 'HEAD': self.assertEqual(body, b'')

    def test_browser_icon_resolves_to_existing_brand_asset(self):
        for method in ('GET', 'HEAD'):
            status, headers, body = self.request('/favicon.ico', method=method)
            self.assertEqual(status, 302)
            self.assertEqual(body, b'')
            self.assertEqual(headers['Location'], '/assets/logo-multicine-universal.png')
            status, asset_headers, _ = self.request(headers['Location'], method=method)
            self.assertEqual(status, 200)
            self.assertEqual({k.lower():v for k,v in asset_headers.items()}['content-type'], 'image/png')

    def test_session_is_hashed_and_survives_handler_instances(self):
        cookie = self.login()
        token = cookie.split('=', 1)[1]
        with server.connect() as db:
            row = db.execute('SELECT token_hash FROM auth_sessions WHERE token_hash=?', (hashlib.sha256(token.encode()).hexdigest(),)).fetchone()
        self.assertIsNotNone(row)
        self.assertNotEqual(row[0], token)
        status, headers, _ = self.request('/api/state', headers={'HTTP_COOKIE': cookie})
        self.assertEqual(status, 200)
        self.assertIn('private', headers['Cache-Control'])
        self.assertEqual(self.request('/api/logout', {}, headers={'HTTP_COOKIE': cookie})[0], 200)
        self.assertEqual(self.request('/api/state', headers={'HTTP_COOKIE': cookie})[0], 401)

    def test_changed_account_revokes_prior_sessions(self):
        cookie = self.login()
        changed = dict(server.USERS['gerencia'], password='changed')
        with patch.dict(server.USERS, {'gerencia': changed}):
            self.assertEqual(self.request('/api/state', headers={'HTTP_COOKIE': cookie})[0], 401)

    def test_unknown_origins_and_content_types_rejected(self):
        self.assertEqual(self.request('/api/login', {}, headers={'HTTP_ORIGIN': 'https://attacker.example'})[0], 403)
        self.assertEqual(self.request('/api/login', {}, headers={'CONTENT_TYPE': 'text/plain'})[0], 415)
        self.assertEqual(self.request('/api/login', ['not-an-object'])[0], 400)

    def test_production_origin_cookies_host_and_no_demo_markup(self):
        with patch.object(auth_config, 'production', return_value=True), patch('erp.infrastructure.persistence.database_url', return_value=''), patch.dict(os.environ, {'PUBLIC_BASE_URL': 'https://cine.example.com'}):
            headers = {'HTTP_HOST': 'cine.example.com', 'HTTP_ORIGIN': 'https://cine.example.com'}
            status, response, _ = self.request('/api/login', {'username': 'gerencia', 'password': 'Cine2026!'}, headers=headers)
            # Production config validation separately rejects these demo accounts.
            self.assertEqual(status, 200)
            self.assertIn('; Secure', response['Set-Cookie'])
            self.assertIn('HttpOnly', response['Set-Cookie'])
            self.assertEqual(self.request('/api/login', {}, headers={'HTTP_HOST': 'cine.example.com'})[0], 403)
            self.assertEqual(self.request('/admin.html', headers={'HTTP_HOST': 'attacker.example'})[0], 400)
            _, _, body = self.request('/admin.html', headers=headers)
            self.assertIn(b'window.ERP_CONFIG={"production": true}', body)
            _, _, public = self.request('/', headers=headers)
            self.assertIn(b'trailer-screen', public)

    def test_health_and_readiness(self):
        self.assertEqual(self.request('/healthz')[0], 200)
        self.assertEqual(self.request('/readyz')[0], 200)
        with patch.object(server, 'connect', side_effect=RuntimeError('private credentials')):
            status, _, body = self.request('/readyz')
        self.assertEqual(status, 503)
        self.assertNotIn(b'private credentials', body)

    def test_committed_checkout_survives_print_failure_without_duplicate(self):
        from datetime import date, timedelta
        with server.connect() as db:
            state = json.loads(db.execute('SELECT body FROM state WHERE id=1').fetchone()[0])
            show = state['shows'][0]
            show['date'] = (date.fromisoformat(server.today()) + timedelta(days=1)).isoformat()
            db.execute('UPDATE state SET body=? WHERE id=1', (json.dumps(state),))
        status, response, _ = self.request('/api/login', {'username': 'boleteria.potosi', 'password': 'Cine2026!'})
        self.assertEqual(status, 200)
        headers = {'HTTP_COOKIE': response['Set-Cookie'].split(';')[0]}
        request = dict(action='ticket_checkout', branch='Potosí', requestId='print-failure-checkout',
                       lines=[dict(item=show['id'], quantity=1, unitPrice=show['price'], seatsPerTicket=1)])
        with patch.object(server, 'print_order', side_effect=RuntimeError('private connection details')):
            status, _, first = self.request('/api/action', request, headers=headers)
            self.assertEqual(status, 200, first)
            status, _, second = self.request('/api/action', request, headers=headers)
            self.assertEqual(status, 200, second)
        first, second = json.loads(first), json.loads(second)
        self.assertEqual(first['order']['printing']['status'], 'uncertain')
        self.assertEqual(first['order']['id'], second['order']['id'])
        self.assertTrue(second['repeated'])
        self.assertNotIn('private connection details', json.dumps(first))
        with server.connect() as db:
            state = json.loads(db.execute('SELECT body FROM state WHERE id=1').fetchone()[0])
        self.assertEqual(sum(o['requestId']=='print-failure-checkout' for o in state['orders']), 1)

    def test_print_queue_never_visible_in_browser_state(self):
        with server.connect() as db:
            state = json.loads(db.execute('SELECT body FROM state WHERE id=1').fetchone()[0])
        state['printJobs'] = [{'branch': 'Potosí', 'claimToken': 'private'}]
        self.assertNotIn('printJobs', server.visible(state, server.USERS['gerencia']))

    def test_print_agents_do_not_accept_browser_session_as_auth(self):
        cookie = self.login()
        with patch.dict(os.environ, {'ERP_PRINT_MODE': 'agent'}):
            status, _, _ = self.request('/api/print-agent/claim', {}, headers={'HTTP_COOKIE': cookie})
        self.assertEqual(status, 403)

    def test_account_rate_limit_is_persistent(self):
        for _ in range(server.LOGIN_MAX_ATTEMPTS):
            self.assertEqual(self.request('/api/login', {'username': 'absent.test.user', 'password': 'bad'})[0], 401)
        self.assertEqual(self.request('/api/login', {'username': 'absent.test.user', 'password': 'bad'})[0], 429)


class ConfigTests(unittest.TestCase):
    def test_render_never_enables_demo_when_environment_is_missing(self):
        with patch.dict(os.environ, {'RENDER': 'true', 'ERP_USERS_JSON': ''}):
            with patch.dict(os.environ):
                os.environ.pop('ERP_ENV', None)
                self.assertTrue(auth_config.production())
                with self.assertRaises(RuntimeError): auth_config.load_users()
            with patch.dict(os.environ, {'ERP_ENV': 'development'}):
                with self.assertRaises(RuntimeError): auth_config.production()

    def test_production_cannot_start_without_accounts_or_database(self):
        with patch.dict(os.environ, {'ERP_ENV': 'production', 'ERP_USERS_JSON': '', 'DATABASE_URL': '', 'PUBLIC_BASE_URL': 'https://cine.example.com'}):
            with self.assertRaises(RuntimeError): auth_config.load_users()
            with self.assertRaises(RuntimeError): auth_config.validate_environment()

    def test_configured_password_hash_and_scope(self):
        encoded = auth_config.hash_password('A unique test password 7291')
        config = {'worker.one': {'role': 'ticketing', 'branch': 'Potosí', 'passwordHash': encoded}}
        with patch.dict(os.environ, {'ERP_ENV': 'production', 'ERP_USERS_JSON': json.dumps(config)}):
            users = auth_config.load_users()
            self.assertTrue(auth_config.verify_password(users['worker.one'], 'A unique test password 7291'))
            self.assertFalse(auth_config.verify_password(users['worker.one'], 'Cine2026!'))
            config['worker.one']['branch'] = None
            with patch.dict(os.environ, {'ERP_USERS_JSON': json.dumps(config)}):
                with self.assertRaises(RuntimeError): auth_config.load_users()

    def test_demo_password_hash_rejected_even_when_explicitly_configured(self):
        salt = b'1234567890123456'
        digest = hashlib.pbkdf2_hmac('sha256', b'Cine2026!', salt, 600000).hex()
        config = {'gerencia': {'role': 'manager', 'branch': None, 'passwordHash': f'pbkdf2_sha256$600000${salt.hex()}${digest}'}}
        with patch.dict(os.environ, {'ERP_ENV': 'production', 'ERP_USERS_JSON': json.dumps(config)}):
            with self.assertRaises(RuntimeError): auth_config.load_users()

    def test_production_origins_require_https_and_no_wildcard(self):
        for origin in ('http://cine.example.com', '*', 'https://*.example.com', 'https://cine.example.com/private', 'https://name:secret@cine.example.com'):
            with patch.dict(os.environ, {'ERP_ENV': 'production', 'PUBLIC_BASE_URL': origin, 'ERP_ALLOWED_ORIGINS': ''}):
                with self.assertRaises(RuntimeError): auth_config.allowed_origins()


if __name__ == '__main__':
    unittest.main()
