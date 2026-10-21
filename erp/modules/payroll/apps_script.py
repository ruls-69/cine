"""Safe read-only HMAC connectivity probe for a Google Apps Script web app.

Does not send mail or read payroll records. Network timeouts are never treated
as success; only a signed JSON response from the expected Google endpoint is.
"""
import base64
from datetime import datetime, timezone
import hashlib
import hmac
import json
import logging
import os
import re
import secrets
from urllib.parse import urlsplit
from urllib.request import HTTPRedirectHandler, Request, build_opener

LOGGER = logging.getLogger(__name__)
_SCRIPT_PATH = re.compile(r"^/macros/s/[A-Za-z0-9_-]{12,256}/exec$")


def _valid_webapp_url(url):
    parsed = urlsplit(url)
    if (parsed.scheme != "https" or parsed.hostname != "script.google.com"
            or parsed.username or parsed.password or parsed.port is not None
            or parsed.query or parsed.fragment or not _SCRIPT_PATH.fullmatch(parsed.path)):
        raise ValueError("URL de Apps Script inválida; debe ser una implementación /exec.")
    return url


class _GoogleContentRedirect(HTTPRedirectHandler):
    """Allow only the documented one-time ContentService response redirect."""
    def redirect_request(self, req, fp, code, msg, headers, newurl):
        parsed = urlsplit(newurl)
        if (code not in (302, 303) or parsed.scheme != "https"
                or parsed.hostname != "script.googleusercontent.com"
                or parsed.username or parsed.password or parsed.port is not None
                or parsed.path != "/macros/echo"):
            raise ValueError("Redirección inesperada de Apps Script.")
        return super().redirect_request(req, fp, code, msg, headers, newurl)


def _signed_ping_request(url, secret, *, timestamp=None, request_id=None):
    """Return the signed request; keep HMAC secret outside source control."""
    _valid_webapp_url(url)
    if not isinstance(secret, str) or len(secret) < 32:
        raise ValueError("Falta configurar la clave privada de Apps Script.")
    timestamp = timestamp or datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    request_id = request_id or secrets.token_hex(16)
    payload = json.dumps({"operation": "ping", "requestId": request_id, "timestamp": timestamp},
                         ensure_ascii=False, separators=(",", ":"))
    signature = base64.urlsafe_b64encode(
        hmac.new(secret.encode("utf-8"), payload.encode("utf-8"), hashlib.sha256).digest()
    ).decode("ascii")
    body = json.dumps({"payload": payload, "signature": signature},
                      ensure_ascii=False, separators=(",", ":")).encode("utf-8")
    return Request(url, data=body, headers={"Content-Type": "application/json",
                                          "Accept": "application/json"}, method="POST")


def ping(*, url=None, secret=None, opener=None):
    """Send a single read-only signed ping and verify the returned JSON.

    No automatic POST retry: the future mail operation needs separate durable
    replay protection and must never assume a lost HTTP response is a rejection.
    """
    url = url if url is not None else os.environ.get("ERP_APPS_SCRIPT_URL", "")
    secret = secret if secret is not None else os.environ.get("ERP_APPS_SCRIPT_HMAC_SECRET", "")
    request = _signed_ping_request(url, secret)
    opener = opener if opener is not None else build_opener(_GoogleContentRedirect())
    with opener.open(request, timeout=30) as response:
        if response.status != 200:
            return False
        final = urlsplit(response.geturl())
        if (final.scheme != "https" or final.hostname != "script.googleusercontent.com"
                or final.path != "/macros/echo"):
            return False
        raw = response.read(8193)
    if len(raw) > 8192:
        return False
    try:
        body = json.loads(raw)
    except (ValueError, UnicodeError):
        return False
    return (isinstance(body, dict) and body.get("ok") is True
            and body.get("estado") == "autenticado"
            and body.get("envio") == "desactivado")


def startup_ping():
    """Opt-in network test; logs only status, never URLs, secrets or responses."""
    try:
        if ping():
            LOGGER.warning("CINe Apps Script: ping HMAC AUTORIZADO; correo DESACTIVADO.")
        else:
            LOGGER.warning("CINe Apps Script: ping sin confirmación. Correo DESACTIVADO.")
    except Exception as error:
        LOGGER.warning("CINe Apps Script: ping fallido (%s). Correo DESACTIVADO.",
                       type(error).__name__)
