"""Staff accounts created by Accounting, independent of Render's bootstrap users.

Passwords are stored as salted hashes in the private ERP state aggregate.
Only opaque bootstrap credentials are returned once on create/reset.
"""
import re
import secrets
from erp.modules.identity import infrastructure as auth
from erp.shared.domain.records import require

STAFF_ROLES = ("administrator", "ticketing", "candy")
USER_PATTERN = re.compile(r"[a-z0-9][a-z0-9._@+-]{2,79}\Z")


def public_accounts(state):
    return [{k: record.get(k) for k in ("id", "role", "branch", "active", "createdAt", "createdBy")}
            for record in state.get("staffAccounts", [])]


def load_directory(state, bootstrapped):
    users = dict(bootstrapped)
    for account in state.get("staffAccounts", []):
        if account.get("active") is True and account.get("id") not in users:
            users[account["id"]] = {k: account[k] for k in
                    ("id", "role", "branch", "passwordHash", "mustChangePassword")}
    return users


class UserDirectory:
    """Live lookup keeps new users available across workers and resets sessions."""
    def __init__(self, repository, bootstrapped):
        self.repository = repository
        self.bootstrapped = bootstrapped

    def get(self, username):
        if username in self.bootstrapped:
            return self.bootstrapped[username]
        state = self.repository.read()
        for record in state.get("staffAccounts", []):
            if record.get("id") == username and record.get("active") is True:
                return {k: record[k] for k in
                        ("id", "role", "branch", "passwordHash", "mustChangePassword")}
        return None


def mutate(state, actor, action, data, branch, at, reserved_logins):
    require(actor["role"] == "accounting", "Solo Contabilidad administra estas cuentas.")
    accounts = state.setdefault("staffAccounts", [])
    if action == "user_create":
        username = str(data.get("username") or "").strip().lower()
        role = str(data.get("role") or "")
        require(bool(USER_PATTERN.fullmatch(username)), "Usuario inválido: mínimo 3 caracteres, letras minúsculas y números.")
        require(role in STAFF_ROLES, "Solo se pueden crear cuentas de Administración, Boletería y Candy Bar.")
        require(branch in auth.BRANCHES, "Selecciona una sucursal válida.")
        require(username not in reserved_logins and not any(x["id"] == username for x in accounts),
                "El nombre de usuario ya existe.")
        temporary_password = secrets.token_urlsafe(20)
        account = dict(id=username, role=role, branch=branch,
                       passwordHash=auth.hash_password(temporary_password),
                       mustChangePassword=True, active=True,
                       createdAt=at, createdBy=actor["id"])
        accounts.append(account)
        return {"createdAccount": {"username": username, "temporaryPassword": temporary_password}}
    username = str(data.get("username") or "").strip().lower()
    account = next((x for x in accounts if x.get("id") == username and x.get("branch") == branch), None)
    require(account is not None, "Cuenta gestionada no encontrada en esta sucursal.")
    if action == "user_disable":
        require(account["active"] is True, "La cuenta ya está desactivada.")
        account.update(active=False, updatedAt=at, updatedBy=actor["id"])
    elif action == "user_enable":
        require(account["active"] is False, "La cuenta ya está activa.")
        account.update(active=True, updatedAt=at, updatedBy=actor["id"])
    elif action == "user_reset_password":
        require(account["active"] is True, "Activa la cuenta antes de restablecer su contraseña.")
        temporary_password = secrets.token_urlsafe(20)
        account.update(passwordHash=auth.hash_password(temporary_password),
                       mustChangePassword=True, updatedAt=at, updatedBy=actor["id"])
        return {"createdAccount": {"username": username, "temporaryPassword": temporary_password}}
    else:
        raise ValueError("Acción de cuentas no disponible.")
    return {}


def change_password(state, username, previous, replacement):
    require(isinstance(previous, str), "Introduce la contraseña actual.")
    account = next((row for row in state.get("staffAccounts", [])
                    if row.get("id") == username and row.get("active") is True), None)
    require(account is not None, "Cuenta no disponible.")
    user = {k: account[k] for k in ("id", "role", "branch", "passwordHash")}
    require(auth.verify_password(user, previous), "La contraseña actual no es correcta.")
    require(replacement != previous, "La contraseña nueva debe ser diferente.")
    account["passwordHash"] = auth.hash_password(replacement)
    account["mustChangePassword"] = False
    return {}
