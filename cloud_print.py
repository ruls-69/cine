"""Compatibility imports for existing scripts; implementation is packaged by capability."""
from erp.modules.ticketing.print_queue import (
    LEASE_SECONDS, validate_config, authenticate, expire_jobs, queue_order, manual_order, agent_action
)
