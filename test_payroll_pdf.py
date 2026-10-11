"""Individual PDF payroll safety tests, with no live records or email."""
from io import BytesIO
import unittest
from pypdf import PdfReader
from erp.modules.payroll import pdf_report


def example_run():
    return {
        "id": "folio-ficticio", "month": "2026-09", "branch": "Potosí",
        "status": "Validada",
        "lines": [
            {"employee": "one", "name": "Persona Ficticia Uno", "role": "Boletería",
             "code": "001", "base": 2400, "days": 25, "workedDays": 25,
             "expectedDays": 26, "earnedBase": 2307.69, "lateDeduction": 174.37,
             "extraTotal": 0, "total": 2133.32, "hours": 225,
             "lateRows": [{"date": "2026-09-08", "entry": "13:36", "minutes": 6,
                           "wholeDay": False, "hours": 1, "amount": 10.26}],
             "extras": []},
            {"employee": "two", "name": "Persona Confidencial Dos", "role": "Gerencia",
             "code": "002", "base": 9999, "days": 26, "workedDays": 26,
             "expectedDays": 26, "earnedBase": 9999, "lateDeduction": 0,
             "extraTotal": 0, "total": 9999, "hours": 234,
             "lateRows": [], "extras": []},
        ],
    }


class PayrollPdfTests(unittest.TestCase):
    def test_generated_pdf_is_readable_and_scope_is_individual(self):
        data = pdf_report.report(example_run(), "one")
        self.assertTrue(data.startswith(b"%PDF-"))
        reader = PdfReader(BytesIO(data))
        self.assertGreaterEqual(len(reader.pages), 1)
        text = "\n".join(page.extract_text() for page in reader.pages)
        for expected in ("Persona Ficticia Uno", "2.133,32", "2.307,69",
                         "174,37", "2026-09-08", "Potos", "No se registraron extras"):
            self.assertIn(expected, text)
        self.assertNotIn("Persona Confidencial Dos", text)
        self.assertNotIn("9.999,00", text)
        self.assertIn("no acredita", text)

    def test_no_whole_payroll_pdf_or_unvalidated_run(self):
        with self.assertRaises(ValueError):
            pdf_report.report(example_run(), None)
        with self.assertRaises(ValueError):
            pdf_report.report(example_run(), "missing")
        run = example_run()
        run["status"] = "Borrador"
        with self.assertRaises(ValueError):
            pdf_report.report(run, "one")


if __name__ == "__main__":
    unittest.main()
