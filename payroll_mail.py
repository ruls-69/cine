"""Compatibility imports for existing scripts; implementation is packaged by capability."""
from erp.modules.payroll.mail import (
    LEASE_SECONDS, POLL_SECONDS, LOGGER, UNCERTAIN, configured, claim_pending, deliver, finish_attempt, MailWorker, start
)
