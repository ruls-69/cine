"""Brevo HTTPS transport for individual payroll reports."""
import base64
import json
import os
from urllib.request import Request, urlopen

ENDPOINT = "https://api.brevo.com/v3/smtp/email"


class MissingMessageIdError(RuntimeError):
    """Brevo response without the expected acceptance identifier."""

def send(job, run, recipient, report):
    payload = {
        "sender": {"email": os.environ["ERP_BREVO_FROM_EMAIL"],
                   "name": os.environ.get("ERP_BREVO_FROM_NAME", "Multicine Universal - Contabilidad")},
        "to": [{"email": recipient}],
        "subject": job["subject"],
        "textContent": (f"Hola {job['name']},\n\nContabilidad aprobó tu reporte salarial de {run['month']}."
                        "\nAdjuntamos tu detalle individual. Este reporte no acredita un pago."),
        "attachment": [{"name": f"reporte-salarial-{run['month']}.html",
                        "content": base64.b64encode(report).decode("ascii")}],
    }
    request = Request(ENDPOINT, data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
                      headers={"api-key": os.environ["ERP_BREVO_API_KEY"],
                               "Content-Type": "application/json", "Accept": "application/json"},
                      method="POST")
    with urlopen(request, timeout=30) as response:
        if response.status != 201:
            raise RuntimeError("Brevo no aceptó el mensaje.")
        body = json.loads(response.read(16384))
    message_id = body.get("messageId")
    if not isinstance(message_id, str) or not 0 < len(message_id) <= 300:
        raise MissingMessageIdError("Brevo no confirmó el identificador de envío.")
    return message_id
