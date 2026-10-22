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
from urllib.error import HTTPError
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


def prepare_test_pdf_request(job, run, recipient, pdf, *, url, secret, allowed_recipient, timestamp=None):
    """Create a signed single-employee delivery request; no network I/O here."""
    _valid_webapp_url(url)
    if not isinstance(secret, str) or len(secret) < 32:
        raise ValueError("Clave HMAC no configurada.")
    if not isinstance(pdf, bytes) or not pdf.startswith(b"%PDF-") or len(pdf) > 950000:
        raise ValueError("PDF inválido o demasiado grande.")
    if not isinstance(recipient, str) or not re.fullmatch(
            r"[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+", recipient.strip()) or len(recipient) > 254:
        raise ValueError("Destinatario inválido.")
    if allowed_recipient is not None:
        allowed = {address.strip().casefold() for address in allowed_recipient.split(",") if address.strip()}
        if recipient.strip().casefold() not in allowed:
            raise ValueError("Destinatario no autorizado para nómina.")
    if run.get("status") != "Validada" or job.get("run") != run.get("id"):
        raise ValueError("La planilla no está validada o no corresponde al reporte.")
    employee = job.get("employee")
    if not employee or sum(line.get("employee") == employee for line in run.get("lines", [])) != 1:
        raise ValueError("El PDF debe pertenecer a un único empleado.")
    if not re.fullmatch(r"[A-Za-z0-9_-]{16,80}", job.get("id", "")):
        raise ValueError("Identificador de envío inválido.")
    period = run.get("month")
    if not isinstance(period, str) or not re.fullmatch(r"20\d{2}-(0[1-9]|1[0-2])", period):
        raise ValueError("Periodo salarial inválido.")
    if job.get("subject") != f"Reporte salarial {period} · Multicine Universal":
        raise ValueError("Asunto de correo fuera de formato.")
    timestamp = timestamp or datetime.now(timezone.utc).isoformat(timespec="seconds").replace("+00:00", "Z")
    operation = "send_employee_pdf" if os.environ.get("ERP_APPS_SCRIPT_REAL_DELIVERY_ENABLED") == "true" else "send_test_pdf"
    data = {"operation": operation, "requestId": job["id"], "timestamp": timestamp,
            "recipient": recipient.strip(), "subject": job["subject"],
            "filename": f"reporte-salarial-{period}.pdf",
            "pdfBase64": base64.b64encode(pdf).decode("ascii")}
    payload = json.dumps(data, ensure_ascii=False, separators=(",", ":"))
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
            and body.get("envio") in ("desactivado", "activado"))


def startup_ping():
    """Opt-in network test; logs only status, never URLs, secrets or responses."""
    try:
        if ping():
            LOGGER.info("CINe Apps Script: ping HMAC AUTORIZADO (sin envío).")
        else:
            LOGGER.warning("CINe Apps Script: ping sin confirmación (no se intentó enviar correo).")
    except HTTPError as error:
        # Never log Google response bodies, authorization URLs, or HMAC values.
        LOGGER.warning("CINe Apps Script: ping rechazado HTTP %d (sin envío).",
                       int(error.code))
    except Exception as error:
        LOGGER.warning("CINe Apps Script: ping fallido (%s) (sin envío).",
                       type(error).__name__)


def send_prepared_pdf_request(request, *, expected_id, opener=None):
    """One HTTPS attempt; no network retry or ambiguous-success assumption."""
    opener = opener or build_opener(_GoogleContentRedirect())
    with opener.open(request, timeout=30) as response:
        final = urlsplit(response.geturl())
        if (response.status != 200 or final.scheme != "https" or
                final.hostname != "script.googleusercontent.com" or final.path != "/macros/echo"):
            raise RuntimeError("Respuesta de Google no validada.")
        raw = response.read(8193)
    if len(raw) > 8192:
        raise RuntimeError("Respuesta excesiva de Apps Script.")
    result = json.loads(raw)
    if (not isinstance(result, dict) or result.get("ok") is not True or
            result.get("estado") not in ("enviado", "ya_enviado") or
            result.get("requestId") != expected_id):
        raise RuntimeError("Apps Script no confirmó el correo.")
    return expected_id
