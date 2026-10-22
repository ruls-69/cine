"""Web-managed payroll mail dispatch gates; never connects to Gmail."""
import unittest
from erp.modules.payroll import domain

class PayrollWebDispatchTests(unittest.TestCase):
    def setUp(self):
        self.branch="Potosí"
        self.user={"id":"accounting-1"}
        self.now="2026-10-22T12:00:00-04:00"
        self.state={"payrollRuns":[{
           "id":"run-1","branch":self.branch,"status":"Validada",
           "fingerprint":"fp-1","month":"2026-08",
           "lines":[{"employee":"emp-1","name":"Empleado ficticio"}]}],
           "payrollMail":[{
           "id":"job-1","branch":self.branch,"run":"run-1",
           "employee":"emp-1","name":"Empleado ficticio",
           "recipient":"one@example.invalid",
           "subject":"Reporte salarial 2026-08 · Multicine Universal",
           "status":"Pendiente de conectar correo"}]}
    def do(self,action,data=None):
        return domain.mutate(self.state,self.user,action,
                dict({"id":"job-1","confirm":"yes"},**(data or {})),self.branch,self.now)
    def test_authorization_does_not_automatically_dispatch(self):
        self.do("payroll_mail_authorize")
        j=self.state["payrollMail"][0]
        self.assertIsNotNone(j["approvedAt"])
        self.assertNotIn("dispatchRequestedAt",j)
        self.do("payroll_mail_dispatch")
        self.assertEqual(self.user["id"],j["dispatchRequestedBy"])
        with self.assertRaises(ValueError):
            self.do("payroll_mail_dispatch")
    def test_dispatch_requires_authorization(self):
        with self.assertRaises(ValueError):
            self.do("payroll_mail_dispatch")
        self.assertNotIn("dispatchRequestedAt",self.state["payrollMail"][0])
    def test_dispatch_prevents_recipient_edit_and_revocation(self):
        self.do("payroll_mail_authorize")
        self.do("payroll_mail_dispatch")
        with self.assertRaises(ValueError):
            self.do("payroll_mail_update",{"email":"two@example.invalid"})
        with self.assertRaises(ValueError):
            self.do("payroll_mail_revoke")
    def test_changed_planilla_blocks_dispatch(self):
        self.do("payroll_mail_authorize")
        self.state["payrollRuns"][0]["fingerprint"]="changed"
        with self.assertRaises(ValueError):
            self.do("payroll_mail_dispatch")
if __name__=="__main__":unittest.main()
