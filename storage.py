"""Compatibility imports for existing scripts; implementation is packaged by capability."""
from erp.infrastructure.persistence import (
    SCHEMA_VERSION, BASE_COLLECTIONS, production, database_url, empty_state, validate_state, connection_options, pool, close_pool, PostgresStateConnection, connect, initialize, SQLITE_AUTH_SCHEMA, AuthStore, auth_store
)
