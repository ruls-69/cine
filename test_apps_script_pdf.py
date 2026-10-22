"""Offline request construction tests. Never contacts Google or sends email."""
import base64
import hashlib
import hmac
import json
import unittest
from erp.modules.payroll import apps_script

URL = "https://script.google.com/macros/s/" + "A"*48 + "/exec"
SECRET = "unit-test-" + "a"*64
RECIPIENT = "owner@example.invalid"

def run():
    return {"id":"run-august","status":"Validada","month":"2026-08",
            "lines":[{"employee":"employee-one"}]}

def job():
    return {"id":"0123456789abcdef0123456789abcdef","run":"run-august",
            "employee":"employee-one",
            "subject":"Reporte salarial 2026-08 · Multicine Universal"}

class AppsScriptPdfTests(unittest.TestCase):
    def request(self, **changes):
        return apps_script.prepare_test_pdf_request(
            changes.get("job",job()),changes.get("run",run()),
            changes.get("recipient",RECIPIENT),changes.get("pdf",b"%PDF-1.4\nexample"),
            url=URL,secret=SECRET,allowed_recipient=RECIPIENT,
            timestamp="2026-10-21T23:00:00Z")

    def test_single_recipient_signed_pdf_payload(self):
        req=self.request()
        self.assertEqual(req.get_method(),"POST")
        packet=json.loads(req.data)
        payload=json.loads(packet["payload"])
        self.assertEqual(payload["operation"],"send_test_pdf")
        self.assertEqual(payload["requestId"],job()["id"])
        self.assertEqual(payload["recipient"],RECIPIENT)
        self.assertEqual(payload["filename"],"reporte-salarial-2026-08.pdf")
        self.assertEqual(base64.b64decode(payload["pdfBase64"]),b"%PDF-1.4\nexample")
        signature=base64.urlsafe_b64encode(
            hmac.new(SECRET.encode(),packet["payload"].encode(),hashlib.sha256).digest()
        ).decode()
        self.assertEqual(signature,packet["signature"])

    def test_reject_other_recipient_and_unvalidated_run(self):
        with self.assertRaises(ValueError):self.request(recipient="other@example.invalid")
        changed=run();changed["status"]="Borrador"
        with self.assertRaises(ValueError):self.request(run=changed)

    def test_reject_cross_employee_and_non_pdf(self):
        changed=job();changed["employee"]="someone-else"
        with self.assertRaises(ValueError):self.request(job=changed)
        with self.assertRaises(ValueError):self.request(pdf=b"<html>fake</html>")

    def test_reject_invalid_id_or_subject(self):
        changed=job();changed["id"]="short"
        with self.assertRaises(ValueError):self.request(job=changed)
        changed=job();changed["subject"]="Cuenta bancaria"
        with self.assertRaises(ValueError):self.request(job=changed)

if __name__=="__main__":
    unittest.main()
