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
             "ERP_APPS_SCRIPT_TEST_RECIPIENT":"owner@example.invalid"}):
            self.assertFalse(mail.configured())
            os.environ["ERP_PAYROLL_MAIL_ENABLED"]="true"
            self.assertTrue(mail.configured())

    def test_only_one_employee_pdf_and_one_http_attempt(self):
        fixture=PayrollMailWorkerTests("test_disabled_worker_never_claims_or_sends")
        fixture.setUp()
        try:
            with patch.dict(os.environ, {"ERP_PAYROLL_MAIL_ENABLED":"true",
                "ERP_PAYROLL_MAIL_PROVIDER":"apps_script",
                "ERP_APPS_SCRIPT_URL":"https://script.google.com/macros/s/"+"A"*48+"/exec",
                "ERP_APPS_SCRIPT_HMAC_SECRET":"testing-"+"x"*64,
                "ERP_APPS_SCRIPT_TEST_RECIPIENT":"one@example.invalid"}), \
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

if __name__=="__main__":
    unittest.main()
