"""Offline worker delivery tests: no real mails or network."""
import os
import unittest
from unittest.mock import patch, Mock
from erp.modules.payroll import mail, apps_script
from test_payroll_mail_worker import PayrollMailWorkerTests

class AppsScriptWorkerTests(unittest.TestCase):
    def test_provider_disabled_and_configuration(self):
        with patch.dict(os.environ, {"ERP_PAYROLL_MAIL_ENABLED":"false",
             "ERP_PAYROLL_MAIL_PROVIDER":"apps_script",
             "ERP_APPS_SCRIPT_URL":"https://script.google.com/macros/s/abcabcabcabcabcabc/exec",
             "ERP_APPS_SCRIPT_HMAC_SECRET":"x"*64,
             "ERP_APPS_SCRIPT_ALLOWED_RECIPIENTS":"owner@example.invalid",
             "ERP_APPS_SCRIPT_REAL_DELIVERY_ENABLED":"false"}):
            self.assertFalse(mail.configured())
            os.environ["ERP_PAYROLL_MAIL_ENABLED"]="true"
            self.assertFalse(mail.configured())
            os.environ["ERP_APPS_SCRIPT_REAL_DELIVERY_ENABLED"]="true"
            self.assertTrue(mail.configured())

    def test_only_one_employee_pdf_and_one_http_attempt(self):
        fixture=PayrollMailWorkerTests("test_disabled_worker_never_claims_or_sends")
        fixture.setUp()
        try:
            with patch.dict(os.environ, {"ERP_PAYROLL_MAIL_ENABLED":"true",
                "ERP_PAYROLL_MAIL_PROVIDER":"apps_script",
                "ERP_APPS_SCRIPT_URL":"https://script.google.com/macros/s/"+"A"*48+"/exec",
                "ERP_APPS_SCRIPT_HMAC_SECRET":"testing-"+"x"*64,
                "ERP_APPS_SCRIPT_ALLOWED_RECIPIENTS":"one@example.invalid",
                "ERP_APPS_SCRIPT_REAL_DELIVERY_ENABLED":"true"}), \
                patch.object(mail.pdf_report,"report",return_value=b"%PDF-1.4 fake") as pdf, \
                patch.object(apps_script,"send_prepared_pdf_request",return_value="mail-one") as send:
                job, run=mail.claim_pending(fixture.connect,fixture.now)
                # Use the same constraints as production for a validated plan.
                run["lines"]=[{"employee":"employee-one"}]
                job["id"]="0123456789abcdef0123456789abcdef"
                run["id"]="run-one"
                job["run"]="run-one"
                job["subject"]="Reporte salarial 2026-09 · Multicine Universal"
                mail.deliver(job,run)
                pdf.assert_called_once_with(run,"employee-one")
                send.assert_called_once()
        finally:
            fixture.tearDown()

    def test_refused_acknowledgement_is_not_success(self):
        response=Mock()
        response.status=200
        response.geturl.return_value="https://script.googleusercontent.com/macros/echo?key=example"
        response.read.return_value=b'{"ok":false,"estado":"envio_desactivado"}'
        context=Mock()
        context.__enter__=Mock(return_value=response)
        context.__exit__=Mock(return_value=None)
        opener=Mock()
        opener.open.return_value=context
        with self.assertRaises(RuntimeError):
            apps_script.send_prepared_pdf_request(Mock(),expected_id="abc",opener=opener)
        opener.open.assert_called_once()


    def test_offline_worker_idle_when_real_delivery_disabled(self):
        """Even a globally enabled worker must not claim real payroll without explicit opt-in."""
        fixture = PayrollMailWorkerTests("test_disabled_worker_never_claims_or_sends")
        fixture.setUp()
        try:
            with patch.dict(os.environ, {
                "ERP_PAYROLL_MAIL_ENABLED": "true",
                "ERP_PAYROLL_MAIL_PROVIDER": "apps_script",
                "ERP_APPS_SCRIPT_URL": "https://script.google.com/macros/s/" + "A"*48 + "/exec",
                "ERP_APPS_SCRIPT_HMAC_SECRET": "testing-" + "x"*64,
                "ERP_APPS_SCRIPT_ALLOWED_RECIPIENTS": "one@example.invalid",
                "ERP_APPS_SCRIPT_REAL_DELIVERY_ENABLED": "false",
            }), patch.object(mail, "deliver") as deliver:
                mail.MailWorker(fixture.connect, fixture.now).tick()
                deliver.assert_not_called()
            current = fixture.read()["payrollMail"][0]
            self.assertEqual("Pendiente de conectar correo", current["status"])
        finally:
            fixture.tearDown()

    def test_disallowed_employee_recipient_never_reaches_transport(self):
        """The Render allowlist rejects unexpected recipients before any HTTPS call."""
        from test_payroll_pdf import example_run
        run = example_run()
        job = {
            "id": "0123456789abcdef0123456789abcdef",
            "run": run["id"], "branch": run["branch"], "employee": "one",
            "recipient": "blocked@example.invalid",
            "subject": "Reporte salarial 2026-09 · Multicine Universal",
        }
        with patch.dict(os.environ, {
            "ERP_PAYROLL_MAIL_PROVIDER": "apps_script",
            "ERP_APPS_SCRIPT_URL": "https://script.google.com/macros/s/" + "A"*48 + "/exec",
            "ERP_APPS_SCRIPT_HMAC_SECRET": "testing-" + "x"*64,
            "ERP_APPS_SCRIPT_ALLOWED_RECIPIENTS": "one@example.invalid",
            "ERP_APPS_SCRIPT_REAL_DELIVERY_ENABLED": "true",
        }), patch.object(apps_script, "send_prepared_pdf_request") as sender:
            with self.assertRaisesRegex(ValueError, "Destinatario no autorizado"):
                mail.deliver(job, run)
            sender.assert_not_called()

    def test_integrated_employee_pdf_hmac_is_private_and_offline(self):
        """Real rendering + signed envelope, with transport fully mocked out."""
        import base64
        import hashlib
        import hmac
        import json
        from io import BytesIO
        from pypdf import PdfReader
        from test_payroll_pdf import example_run

        run = example_run()  # two fictional employees
        secret = "testing-" + "x"*64
        job = {
            "id": "0123456789abcdef0123456789abcdef",
            "run": run["id"], "branch": run["branch"], "employee": "one",
            "recipient": "one@example.invalid",
            "subject": "Reporte salarial 2026-09 · Multicine Universal",
        }
        with patch.dict(os.environ, {
            "ERP_PAYROLL_MAIL_PROVIDER": "apps_script",
            "ERP_APPS_SCRIPT_URL": "https://script.google.com/macros/s/" + "A"*48 + "/exec",
            "ERP_APPS_SCRIPT_HMAC_SECRET": secret,
            "ERP_APPS_SCRIPT_ALLOWED_RECIPIENTS": "one@example.invalid",
            "ERP_APPS_SCRIPT_REAL_DELIVERY_ENABLED": "true",
        }), patch.object(apps_script, "send_prepared_pdf_request", return_value=job["id"]) as sender:
            self.assertEqual(job["id"], mail.deliver(job, run))
            sender.assert_called_once()
            request = sender.call_args.args[0]
            self.assertEqual(job["id"], sender.call_args.kwargs["expected_id"])

        signed = json.loads(request.data.decode("utf-8"))
        expected_signature = base64.urlsafe_b64encode(
            hmac.new(secret.encode("utf-8"), signed["payload"].encode("utf-8"),
                     hashlib.sha256).digest()
        ).decode("ascii")
        self.assertEqual(expected_signature, signed["signature"])
        payload = json.loads(signed["payload"])
        self.assertEqual("send_employee_pdf", payload["operation"])
        self.assertEqual(job["id"], payload["requestId"])
        self.assertEqual("one@example.invalid", payload["recipient"])
        self.assertEqual("reporte-salarial-2026-09.pdf", payload["filename"])

        data = base64.b64decode(payload["pdfBase64"], validate=True)
        reader = PdfReader(BytesIO(data))
        text = "\n".join(page.extract_text() for page in reader.pages)
        self.assertIn("Persona Ficticia Uno", text)
        self.assertIn("2.133,32", text)
        self.assertNotIn("Persona Confidencial Dos", text)
        self.assertNotIn("9.999,00", text)

if __name__=="__main__":
    unittest.main()
