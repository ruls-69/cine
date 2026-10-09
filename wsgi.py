"""Gunicorn entrypoint. Use one gthread worker; do not use --preload.

The local and cloud servers use the same request handler and domain services.
No socket or secondary HTTP server is created by this adapter.
"""
import atexit
import io
import logging
from email.message import Message
from http import HTTPStatus
from urllib.parse import quote, urlsplit

from erp.modules.identity import infrastructure as auth_config
import server

LOGGER = logging.getLogger(__name__)


class WSGIHandler(server.Handler):
    def __init__(self, environ):
        self.command = environ.get('REQUEST_METHOD', 'GET').upper()
        self.request_version = environ.get('SERVER_PROTOCOL', 'HTTP/1.1')
        self.path = quote(environ.get('PATH_INFO', '/'), safe='/;:@&=+$,~*()-_.!')
        if environ.get('QUERY_STRING'):
            self.path += '?' + environ['QUERY_STRING']
        self.requestline = self.command + ' ' + self.path + ' ' + self.request_version
        self.client_address = (environ.get('REMOTE_ADDR', ''), 0)
        self.headers = Message()
        for key, value in environ.items():
            if key.startswith('HTTP_'):
                self.headers[key[5:].replace('_', '-')] = str(value)
        for key, header in [('CONTENT_TYPE', 'Content-Type'), ('CONTENT_LENGTH', 'Content-Length')]:
            if environ.get(key):
                self.headers[header] = str(environ[key])
        self.rfile = environ['wsgi.input']
        self.wfile = io.BytesIO()
        self.directory = str(server.ROOT)
        self.response_headers = []
        self._headers_buffer = []
        self.status = 200
        self.close_connection = True

    def send_response(self, code, message=None):
        self.status = int(code)

    def send_header(self, keyword, value):
        # Hop-by-hop headers belong to Gunicorn, never the application.
        if keyword.lower() in ('connection', 'transfer-encoding', 'keep-alive'):
            return
        # Keep a single most restrictive Cache-Control header.
        if keyword.lower() == 'cache-control':
            self.response_headers = [(k, v) for k, v in self.response_headers if k.lower() != 'cache-control']
        self.response_headers.append((keyword, str(value)))

    def flush_headers(self):
        self._headers_buffer = []


def application_request(environ, start_response):
    handler = WSGIHandler(environ)
    try:
        path = urlsplit(handler.path).path
        allowed_hosts = {urlsplit(origin).netloc for origin in auth_config.allowed_origins()}
        host = handler.headers.get('Host', '').lower()
        if auth_config.production() and path not in ('/healthz', '/readyz') and host not in allowed_hosts:
            handler.respond(400, {'error': 'Dominio no configurado para este servicio.'})
        elif handler.command == 'POST':
            handler.do_POST()
        elif handler.command == 'GET':
            handler.do_GET()
        elif handler.command == 'HEAD':
            handler.do_HEAD()
        else:
            handler.respond(405, {'error': 'Método no permitido.'}, headers={'Allow': 'GET, HEAD, POST'})
    except Exception:
        # Database errors may contain connection details. Log a safe event only.
        LOGGER.error('Request failed (%s)', handler.command)
        handler.status = 500
        handler.response_headers = []
        handler.wfile = io.BytesIO()
        handler.respond(500, {'error': 'Servicio temporalmente no disponible.'})
    body = handler.wfile.getvalue()
    if handler.command == 'HEAD':
        body = b''
    # Static file handling already sets Content-Length (including HEAD).
    if not any(k.lower() == 'content-length' for k, _ in handler.response_headers):
        handler.response_headers.append(('Content-Length', str(len(body))))
    start_response(f'{handler.status} {HTTPStatus(handler.status).phrase}', handler.response_headers)
    return [body]


server.init()
_mail_stop = server.payroll_mail.start(server.connect, server.now)
if _mail_stop is not None:
    atexit.register(_mail_stop.set)
application = application_request
