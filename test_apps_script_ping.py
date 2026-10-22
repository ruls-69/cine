"""Read-only HMAC ping tests: no Gmail calls or credentials."""
import base64
import hashlib
import hmac
import json
import unittest
from unittest.mock import Mock
from erp.modules.payroll import apps_script

URL="https://script.google.com/macros/s/"+"A"*48+"/exec"
SECRET="test_"+"abc123"*12

class FakeResponse:
    status=200
    def __init__(self,body,url="https://script.googleusercontent.com/macros/echo?user_content_key=abc"):
        self.body=body
        self.url=url
    def __enter__(self):return self
    def __exit__(self,*a):return False
    def geturl(self):return self.url
    def read(self,n):return self.body[:n]

class ProbeTests(unittest.TestCase):
    def test_signature_is_google_compatible(self):
        req=apps_script._signed_ping_request(URL,SECRET,timestamp="2026-10-21T22:00:00Z",request_id="a"*32)
        body=json.loads(req.data)
        digest=hmac.new(SECRET.encode(),body["payload"].encode(),hashlib.sha256).digest()
        self.assertEqual(base64.urlsafe_b64encode(digest).decode(),body["signature"])
        self.assertEqual("ping",json.loads(body["payload"])["operation"])

    def test_only_exact_google_deployment_url(self):
        for candidate in ["http://script.google.com/macros/s/"+"A"*48+"/exec",
                          "https://evil.example/macros/s/"+"A"*48+"/exec",
                          "https://script.google.com/macros/s/"+"A"*48+"/exec?x=1",
                          "https://script.google.com.evil.invalid/macros/s/"+"A"*48+"/exec"]:
            with self.subTest(candidate=candidate),self.assertRaises(ValueError):
                apps_script._signed_ping_request(candidate,SECRET)

    def test_signed_response_accepts_authenticated_transport_state(self):
        opener=Mock()
        opener.open.return_value=FakeResponse(b'{"ok":true,"estado":"autenticado","envio":"desactivado"}')
        self.assertTrue(apps_script.ping(url=URL,secret=SECRET,opener=opener))
        opener.open.assert_called_once()
        self.assertEqual("POST",opener.open.call_args.args[0].get_method())
        opener.open.return_value=FakeResponse(b'{"ok":true,"estado":"autenticado","envio":"activado"}')
        self.assertTrue(apps_script.ping(url=URL,secret=SECRET,opener=opener))
        for payload in [b'{"ok":false,"estado":"no_autorizado"}',b'not json']:
            opener.open.return_value=FakeResponse(payload)
            self.assertFalse(apps_script.ping(url=URL,secret=SECRET,opener=opener))

    def test_redirect_policy(self):
        handler=apps_script._GoogleContentRedirect()
        original=apps_script._signed_ping_request(URL,SECRET)
        self.assertIsNotNone(handler.redirect_request(original,None,302,"found",{},"https://script.googleusercontent.com/macros/echo?x=y"))
        with self.assertRaises(ValueError):
            handler.redirect_request(original,None,302,"found",{},"https://unknown.invalid/x")

if __name__=="__main__":unittest.main()
