"""Compatibility API; implementation lives in the feature package."""
from erp.modules.ticketing.domain import (
    checkout
)
from erp.modules.ticketing.presentation import receipt as render_receipt
from erp.infrastructure import persistence as storage

def receipt(order):
    return render_receipt(order, production=storage.production())
