"""No external network: one-shot Render PDF demonstration tests."""
import os
import unittest
from unittest.mock import patch
from erp.modules.payroll import render_demo

class RenderDemoTests(unittest.TestCase):
    def test_disabled_by_default(self):
        self.assertFalse(render_demo.allowed_to_run({}))
        self.assertFalse(render_demo.allowed_to_run({"ERP_APPS_SCRIPT_DEMO_ON_START":"true",
                                                     "ERP_PAYROLL_MAIL_ENABLED":"true"}))

    def test_fictional_pdf(self):
        pdf=render_demo.fictional_pdf()
        self.assertTrue(pdf.startswith(b"%PDF-"))
        self.assertLess(len(pdf),950000)

    def test_no_network_without_explicit_flag(self):
        with patch("erp.modules.payroll.render_demo.apps_script.send_prepared_pdf_request") as sender:
            self.assertFalse(render_demo.run_once({"ERP_PAYROLL_MAIL_ENABLED":"false"}))
            sender.assert_not_called()

    def test_fixed_id_and_one_attempt(self):
        config={"ERP_APPS_SCRIPT_DEMO_ON_START":"true",
                "ERP_PAYROLL_MAIL_ENABLED":"false",
                "ERP_APPS_SCRIPT_URL":"https://script.google.com/macros/s/"+"A"*48+"/exec",
                "ERP_APPS_SCRIPT_HMAC_SECRET":"testing-"+"x"*64,
                "ERP_APPS_SCRIPT_TEST_RECIPIENT":"owner@example.invalid"}
        with patch("erp.modules.payroll.render_demo.apps_script.send_prepared_pdf_request", return_value=render_demo.DEMO_ID) as sender:
            self.assertTrue(render_demo.run_once(config))
            sender.assert_called_once()
            self.assertEqual(sender.call_args.kwargs["expected_id"],render_demo.DEMO_ID)

if __name__=="__main__":
    unittest.main()
