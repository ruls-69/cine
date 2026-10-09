"""Cinema ERP: local SQLite demo and private PostgreSQL production backend."""
import os, secrets, hashlib, threading, time
from datetime import datetime, timezone, timedelta
from http.server import ThreadingHTTPServer
from pathlib import Path
import cinema
import ticketing
from erp.modules.ticketing import thermal as thermal
import cash
import candy
import payroll
from erp.modules.payroll import mail as payroll_mail
from erp.modules.identity import infrastructure as auth_config
from erp.infrastructure import persistence as storage
from erp.modules.ticketing import print_queue as cloud_print
ROOT = Path(__file__).parent
DB = Path(os.environ.get('ERP_DB', str(ROOT / 'erp.sqlite3')))
BRANCHES = auth_config.BRANCHES
USERS = auth_config.load_users()
# Absolute lifetime caps polling sessions even while the browser stays open.
SESSION_IDLE_SECONDS = 8 * 60 * 60
SESSION_MAX_SECONDS = 12 * 60 * 60
LOGIN_WINDOW_SECONDS = 5 * 60
LOGIN_MAX_ATTEMPTS = 8

def auth_store(): return storage.auth_store(DB)
def session_hash(token): return hashlib.sha256(token.encode()).hexdigest()
def secure_cookie(): return auth_config.production() or os.environ.get('ERP_COOKIE_SECURE')=='true'
def session_cookie(token='', clear=False):
    return f'erp_session={token}; HttpOnly; SameSite=Strict; Path=/; Max-Age={0 if clear else SESSION_MAX_SECONDS}'+('; Secure' if secure_cookie() else '')

def now(): return datetime.now(timezone(timedelta(hours=-4))).isoformat(timespec='seconds')
def today(): return now()[:10]
def uid(): return secrets.token_hex(6)
def seed():
    state=dict(products=[],shows=[],sales=[],reports=[],audits=[],closures=[],log=[],trailers=[])
    for branch in BRANCHES:
        for kind,items in [('candy',[('Combo Universal',68,20),('Combo Clásico',43,25),('Mix Dulce',29,12),('Agua 500 ml',10,0),('Chocolate',15,-2)]),('vault',[('Vasos descartables',1,100),('Rollos de entradas',25,8),('Limpiador 1 L',18,0),('Bolsas de residuos',2,-1)])]:
            for name,price,stock in items: state['products'].append(dict(id=uid(),branch=branch,kind=kind,name=name,unit='Unidad',price=price,stock=stock))
        for i,title in enumerate(['Éter','La última luz','Un mundo azul']): state['shows'].append(dict(id=uid(),branch=branch,title=title,room=f'Sala {i+1}',date=today(),time=['19:50','20:10','18:40'][i],price=[36,32,32][i],capacity=40))
    return cinema.ensure_catalog(state)
def connect():
    return storage.connect(DB)

def init():
    auth_config.validate_environment()
    cloud_print.validate_config(USERS)
    def upgrade(state):
        cinema.ensure_catalog(state)
        candy.ensure(state)
    storage.initialize(DB, seed, upgrade)

def total_for(state,user,day): return round(sum(x['total'] for x in state['sales'] if x['user']==user and x['day']==day),2)
from erp.application.commands import mutate as execute_command
from erp.application.queries import visible as project_state
from erp.modules.payroll.biometric import decode
from erp.modules.inventory.domain import active
from erp.modules.inventory.presentation import audit_pdf
from erp.modules.catalog.trailers import youtube_id
from erp.modules.identity.domain import scoped as check_scope
from erp.shared.domain.records import require, number, text_value, find

def scoped(user,branch): return check_scope(user,branch,BRANCHES)
def mutate(state,user,action,data):
    return execute_command(state,user,action,data,now=now,today=today,uid=uid,branches=BRANCHES,biometric_reader=decode)
def visible(state,user):
    return project_state(state,user,users=USERS,mail_configured=payroll_mail.configured())

from erp.modules.ticketing.printing import print_order as dispatch_print

PRINT_LOCK=threading.Lock()
def print_order(order_id,user,reprint=False,request_id=None):
    return dispatch_print(order_id,user,reprint,request_id,connect=connect,users=USERS,now=now,uid=uid,lock=PRINT_LOCK,production=auth_config.production(),printer=thermal)

from erp.presentation.http import HttpHandler
from erp.infrastructure.state_repository import SqlStateRepository
from erp.application.service import Operations
from types import SimpleNamespace
from erp.modules.identity.application import Identity, SessionPolicy
from erp.modules.catalog.application import Catalog
from erp.application.documents import Documents

repository = SqlStateRepository(lambda: connect())
operations = Operations(repository, lambda state,user,action,data: mutate(state,user,action,data))

class Handler(HttpHandler):
    @property
    def services(self):
        # Resolve runtime configuration here, including test-only DB overrides.
        return SimpleNamespace(
            repository=repository, operations=operations,
            identity=Identity(auth_store(),USERS,SessionPolicy(SESSION_IDLE_SECONDS,SESSION_MAX_SECONDS,LOGIN_WINDOW_SECONDS,LOGIN_MAX_ATTEMPTS),clock=time.time,verify_password=auth_config.verify_password,auth_version=auth_config.auth_version,unknown_password_work=lambda:hashlib.pbkdf2_hmac('sha256',b'invalid',b'unknown-user-timing',auth_config.ITERATIONS),new_token=lambda:secrets.token_urlsafe(32)),
            catalog=Catalog(repository,BRANCHES,today),
            documents=Documents(repository,BRANCHES,{'payroll':payroll.report,'candy':candy.receipt,'closing':cash.report,'ticket':ticketing.receipt,'audit':audit_pdf}),
            auth_config=auth_config, auth_store=auth_store, session_hash=session_hash,
            USERS=USERS, BRANCHES=BRANCHES, ROOT=ROOT, today=today, now=now,
            SESSION_IDLE_SECONDS=SESSION_IDLE_SECONDS, SESSION_MAX_SECONDS=SESSION_MAX_SECONDS,
            LOGIN_WINDOW_SECONDS=LOGIN_WINDOW_SECONDS, LOGIN_MAX_ATTEMPTS=LOGIN_MAX_ATTEMPTS,
            visible=visible, scoped=scoped, session_cookie=session_cookie, print_order=print_order,
            payroll_report=payroll.report, candy_receipt=candy.receipt,
            cash_report=cash.report, ticket_receipt=ticketing.receipt,
            expire_print_jobs=lambda: cloud_print.expire_jobs(connect),
            authenticate_agent=lambda token: cloud_print.authenticate(token,USERS),
            agent_action=lambda agent,action,data: cloud_print.agent_action(connect,agent,action,data))

if __name__=='__main__':
    os.chdir(ROOT); init(); payroll_mail.start(connect,now); port=int(os.environ.get('PORT',os.environ.get('ERP_PORT','8765'))); print(f'Universal ERP: http://127.0.0.1:{port}',flush=True); ThreadingHTTPServer(('127.0.0.1',port),Handler).serve_forever()
