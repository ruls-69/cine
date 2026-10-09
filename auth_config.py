"""Compatibility imports for existing scripts; implementation is packaged by capability."""
from erp.modules.identity.infrastructure import (
    BRANCHES, ROLES, ITERATIONS, production, hash_password, parse_hash, verify_password, auth_version, load_users, normalized_origin, allowed_origins, validate_environment, main
)

if __name__ == '__main__':
    main()
