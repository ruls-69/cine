"""Offline tests for Brevo payroll delivery; no network or live credentials."""
import base64
import json
import os
import unittest
from unittest.mock import MagicMock, patch
from erp.modules.payroll import brevo, mail


class BrevoPayrollTests(unittest.TestCase):
    def test_feature_flag_and_configuration(self):
        with patch.dict(os.environ, {'ERP_PAYROLL_MAIL_ENABLED':'false',
                'ERP_PAYROLL_MAIL_PROVIDER':'brevo','ERP_BREVO_API_KEY':'fake',
                'ERP_BREVO_FROM_EMAIL':'sender@example.invalid'}):
            self.assertFalse(mail.configured())
            os.environ['ERP_PAYROLL_MAIL_ENABLED']='true'
            self.assertTrue(mail.configured())
            del os.environ['ERP_BREVO_API_KEY']
            self.assertFalse(mail.configured())

    def test_https_payload_only_contains_one_employee_report(self):
        job={'name':'Empleado de prueba','subject':'Reporte salarial 2026-09'}
        run={'month':'2026-09'}
        response=MagicMock()
        response.status=201
        response.read.return_value=b'{"messageId":"test-message-id"}'
        context=MagicMock()
        context.__enter__.return_value=response
        with patch.dict(os.environ, {'ERP_BREVO_API_KEY':'not-a-real-secret',
                                     'ERP_BREVO_FROM_EMAIL':'sender@example.invalid',
                                     'ERP_BREVO_FROM_NAME':'CINe Contabilidad'}):
            with patch.object(brevo, 'urlopen', return_value=context) as send:
                result=brevo.send(job,run,'employee@example.invalid',b'<html>one employee</html>')
        self.assertEqual(result,'test-message-id')
        request=send.call_args.args[0]
        self.assertEqual(request.full_url,'https://api.brevo.com/v3/smtp/email')
        self.assertEqual(request.get_method(),'POST')
        payload=json.loads(request.data)
        self.assertEqual(payload['to'],[{'email':'employee@example.invalid'}])
        self.assertEqual(payload['sender']['email'],'sender@example.invalid')
        self.assertEqual(base64.b64decode(payload['attachment'][0]['content']),
                         b'<html>one employee</html>')
        self.assertEqual(len(payload['attachment']),1)
        self.assertEqual(request.get_header('Api-key'),'not-a-real-secret')

    def test_invalid_brevo_response_does_not_claim_delivery(self):
        response=MagicMock()
        response.status=201
        response.read.return_value=b'{}'
        context=MagicMock()
        context.__enter__.return_value=response
        with patch.dict(os.environ, {'ERP_BREVO_API_KEY':'fake',
                                     'ERP_BREVO_FROM_EMAIL':'sender@example.invalid'}):
            with patch.object(brevo,'urlopen',return_value=context):
                with self.assertRaises(RuntimeError):
                    brevo.send({'name':'Test','subject':'Test'},
                               {'month':'2026-09'},'test@example.invalid',b'example')


if __name__=='__main__':
    unittest.main()
