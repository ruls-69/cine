"""Compatibility API; implementation lives in the feature package."""
from erp.modules.catalog.domain import (
    key, ticket_seats, price, occupied, available, remove, sold, ensure_catalog, room_save, movie_save, schedule, cancel_show, public_catalog
)
from erp.shared.domain.validation import check, find, integer, text, amount
