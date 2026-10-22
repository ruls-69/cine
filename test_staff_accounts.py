"""Tests for accounting-managed user creation and access."""
import unittest
from erp.modules.identity import accounts

class StaffAccountsTests(unittest.TestCase):
    def setUp(self):
        self.state={"staffAccounts":[]}
        self.actor={"id":"accounting","role":"accounting","branch":None}
    def provision(self, action="user_create", **changes):
        data={"username":"staff.test","role":"ticketing"}
        data.update(changes)
        return accounts.mutate(self.state,self.actor,action,data,"Potosí","2026-10-22",set())
    def test_create_and_disable(self):
        self.provision()
        record=self.state["staffAccounts"][0]
        self.assertEqual(record["role"],"ticketing")
        self.assertTrue(record["active"])
        self.provision("user_disable")
        self.assertFalse(record["active"])
        self.provision("user_enable")
        self.assertTrue(record["active"])
    def test_no_manager_creation(self):
        with self.assertRaises(ValueError):
            self.provision(role="manager")
    def test_no_duplicate(self):
        self.provision()
        with self.assertRaises(ValueError):
            self.provision()
    def test_restricted_creator(self):
        with self.assertRaises(ValueError):
            accounts.mutate(self.state,{"id":"other","role":"ticketing"},"user_create",{"username":"another","role":"candy"},"Potosí","2026-10-22",set())

if __name__=="__main__":
    unittest.main()
