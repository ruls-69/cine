"""One controlled, fictional PDF transfer: Render -> Google Apps Script -> Gmail.

No Supabase access, no payroll data. The fixed request ID makes redeploys
idempotent at the Google receiver. Explicit opt-in; disabled by default.
"""
from io import BytesIO
import logging
import os

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas

from erp.modules.payroll import apps_script

LOGGER = logging.getLogger(__name__)
DEMO_ID = "cine-render-demo-20261022-v1"
DEMO_PERIOD = "2026-10"
DEMO_EMPLOYEE = "employee-fictional-render-demo"


def allowed_to_run(config=None):
    config = os.environ if config is None else config
    return (config.get("ERP_APPS_SCRIPT_DEMO_ON_START") == "true"
            and config.get("ERP_PAYROLL_MAIL_ENABLED") == "false")


def fictional_pdf():
    """A short, valid PDF generated without employee or payment data."""
    output = BytesIO()
    document = canvas.Canvas(output, pagesize=A4)
    document.setTitle("CINe - Render - Prueba de integracion")
    document.setFont("Helvetica-Bold", 17)
    document.drawString(52, 780, "MULTICINE UNIVERSAL")
    document.setFont("Helvetica-Bold", 12)
    document.drawString(52, 747, "PRUEBA TECNICA - DATOS FICTICIOS")
    document.setFont("Helvetica", 10)
    document.drawString(52, 713, "Origen: Render / Destino: Google Apps Script y Gmail")
    document.drawString(52, 691, "Periodo: octubre 2026")
    document.drawString(52, 669, "Documento generado exclusivamente para probar el correo.")
    document.drawString(52, 647, "No contiene datos salariales reales y no acredita pago alguno.")
    document.showPage()
    document.save()
    return output.getvalue()


def run_once(config=None):
    """Log only safe outcomes, never email, URL, HMAC, attachment or request."""
    config = os.environ if config is None else config
    if not allowed_to_run(config):
        return False
    try:
        recipient = config["ERP_APPS_SCRIPT_TEST_RECIPIENT"]
        job = {
            "id": DEMO_ID,
            "run": "fictional-run-render-demo",
            "employee": DEMO_EMPLOYEE,
            "subject": f"Reporte salarial {DEMO_PERIOD} · Multicine Universal",
        }
        run = {
            "id": "fictional-run-render-demo",
            "status": "Validada",
            "month": DEMO_PERIOD,
            "lines": [{"employee": DEMO_EMPLOYEE}],
        }
        request = apps_script.prepare_test_pdf_request(
            job, run, recipient, fictional_pdf(),
            url=config["ERP_APPS_SCRIPT_URL"],
            secret=config["ERP_APPS_SCRIPT_HMAC_SECRET"],
            allowed_recipient=recipient,
        )
        apps_script.send_prepared_pdf_request(request, expected_id=DEMO_ID)
        LOGGER.warning("CINe Render PDF demo: solicitud CONFIRMADA por Apps Script (o ya registrada).")
        return True
    except Exception as exc:
        # No automatic retry; ambiguous requests keep their fixed ID.
        LOGGER.warning("CINe Render PDF demo: SIN CONFIRMACION (%s). No reintentar sin revisar Gmail.",
                       type(exc).__name__)
        return False
