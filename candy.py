"""Compatibility API; implementation lives in the feature package."""
from erp.modules.candy.domain import (
    ensure, checkout, request_void, review
)
from erp.modules.candy.presentation import receipt as render_receipt
from erp.infrastructure import persistence as storage

def receipt(order):
    return render_receipt(order, production=storage.production())
