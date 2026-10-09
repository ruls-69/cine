"""Session use cases. Cookies and HTTP status codes belong to the transport."""
import hashlib
import hmac
import re
from dataclasses import dataclass
from typing import Protocol
from erp.shared.domain.records import require


class SessionStore(Protocol):
    def session_lookup(self, token_hash, now_epoch, idle_seconds): ...
    def session_create(self, token_hash, user_id, auth_version, expires_at, now_epoch): ...
    def session_delete(self, token_hash): ...
    def login_allowed(self, key, now_epoch, window, max_attempts): ...
    def login_success(self, key): ...


class CredentialsRejected(Exception): pass
class LoginLimited(Exception): pass


@dataclass(frozen=True)
class SessionPolicy:
    idle_seconds: int
    max_seconds: int
    login_window: int
    login_attempts: int


class Identity:
    def __init__(self, store: SessionStore, users, policy: SessionPolicy, *, clock,
                 verify_password, auth_version, unknown_password_work, new_token):
        self.store, self.users, self.policy = store, users, policy
        self.clock, self.verify_password, self.auth_version = clock, verify_password, auth_version
        self.unknown_password_work, self.new_token = unknown_password_work, new_token

    @staticmethod
    def digest(token): return hashlib.sha256(token.encode()).hexdigest()

    def resolve(self, token):
        if not token or not re.fullmatch(r'[A-Za-z0-9_-]{40,100}', token): return None
        digest=self.digest(token)
        session=self.store.session_lookup(digest,self.clock(),self.policy.idle_seconds)
        user=self.users.get(session['user_id']) if session else None
        if user and hmac.compare_digest(session['auth_version'],self.auth_version(user)): return user
        if session: self.store.session_delete(digest)
        return None

    def login(self, data, peer):
        username=str(data.get('username','')).strip().lower()
        password=data.get('password')
        require(0<len(username)<=80 and isinstance(password,str) and len(password)<=256,'Usuario o contraseña inválidos.')
        current=self.clock()
        account='user:'+self.digest(username)
        address='peer:'+self.digest(str(peer))
        if not self.store.login_allowed(address,current,self.policy.login_window,100) or not self.store.login_allowed(account,current,self.policy.login_window,self.policy.login_attempts):
            raise LoginLimited('Demasiados intentos. Espera unos minutos e inténtalo de nuevo.')
        user=self.users.get(username)
        if user is None or not self.verify_password(user,password):
            if user is None: self.unknown_password_work()
            raise CredentialsRejected('Usuario o contraseña incorrectos.')
        self.store.login_success(account)
        token=self.new_token()
        self.store.session_create(self.digest(token),user['id'],self.auth_version(user),current+self.policy.max_seconds,current)
        return token

    def logout(self, token):
        if token: self.store.session_delete(self.digest(token))
