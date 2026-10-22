"""Manual payroll reissue must preserve prior delivery history."""
import unittest
from erp.modules.payroll import domain


class PayrollReissueTests(unittest.TestCase):
    def setUp(self):
        self.branch = "Potosí"
        self.user = {"id": "accountant-demo"}
        self.at = "2026-10-22T12:00:00-04:00"
        self.state = {
            "payrollRuns": [{
                "id": "run-validated", "branch": self.branch, "status": "Validada",
                "month": "2026-09", "fingerprint": "f1",
                "lines": [{"employee": "emp-1", "name": "Persona Ficticia Uno"}],
            }],
            "payrollMail": [{
                "id": "original-job", "run": "run-validated", "branch": self.branch,
                "employee": "emp-1", "name": "Persona Ficticia Uno",
                "recipient": "one@example.invalid", "status": "Enviado",
                "subject": "Reporte salarial 2026-09 · Multicine Universal",
            }],
        }

    def create(self, **changes):
        payload = dict(run="run-validated", employee="emp-1",
                       email="one@example.invalid",
                       reason="El empleado pidió una segunda copia", confirm="yes")
        payload.update(changes)
        return domain.mutate(self.state, self.user, "payroll_mail_create",
                             payload, self.branch, self.at)

    def test_creates_new_job_without_modifying_sent_history(self):
        self.create()
        old, new = self.state["payrollMail"]
        self.assertEqual("original-job", old["id"])
        self.assertEqual("Enviado", old["status"])
        self.assertNotEqual(old["id"], new["id"])
        self.assertEqual(32, len(new["id"]))
        self.assertEqual(old["id"], new["previousJobId"])
        self.assertEqual("Pendiente de conectar correo", new["status"])
        self.assertNotIn("approvedAt", new)
        self.assertEqual("El empleado pidió una segunda copia", new["resendReason"])
        self.assertEqual(self.user["id"], new["createdBy"])

    def test_rejects_duplicate_pending_reissue(self):
        self.create()
        with self.assertRaisesRegex(ValueError, "pendiente o incierto"):
            self.create()

    def test_rejects_uncertain_original(self):
        self.state["payrollMail"][0]["status"] = "Revisar envío"
        with self.assertRaisesRegex(ValueError, "pendiente o incierto"):
            self.create()

    def test_requires_validated_run_and_explicit_confirmation(self):
        with self.assertRaisesRegex(ValueError, "Confirma"):
            self.create(confirm="no")
        self.state["payrollRuns"][0]["status"] = "Borrador"
        with self.assertRaisesRegex(ValueError, "validadas"):
            self.create()

    def test_requires_valid_employee_and_reason(self):
        with self.assertRaisesRegex(ValueError, "empleado"):
            self.create(employee="unknown")
        with self.assertRaisesRegex(ValueError, "Completa"):
            self.create(reason="")
        with self.assertRaisesRegex(ValueError, "Correo inválido"):
            self.create(email="bad@@example.invalid")


if __name__ == "__main__":
    unittest.main()
