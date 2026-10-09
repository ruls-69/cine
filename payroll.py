"""Compatibility API; implementation lives in the feature package."""
from erp.modules.payroll.domain import (
    amount, ensure, get, month, email, role_save, late_policy, lateness, employee_save, extra_save, extra_void, parse_day, parse_time, calculate, delete_record, mutate
)
from erp.modules.payroll.presentation import report
from erp.modules.payroll.application import import_file as stage_import
from erp.modules.payroll.biometric import read_file, decode

def import_file(state,user,data,branch,at):
    return stage_import(state,user,data,branch,at,reader=decode)
