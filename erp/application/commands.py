"""Authorized command orchestration over an in-memory transaction snapshot."""
from erp.modules.catalog import domain as cinema, trailers
from erp.modules.ticketing import domain as ticketing
from erp.modules.candy import domain as candy
from erp.modules.cash import domain as cash, operations as closing
from erp.modules.payroll import domain as payroll
from erp.modules.payroll.application import import_file as stage_import
from erp.modules.inventory import operations as inventory
from erp.modules.identity.domain import scoped
from erp.shared.domain.records import require

def mutate(state,user,action,data,*,now,today,uid,branches,biometric_reader):
    cinema.ensure_catalog(state);candy.ensure(state)
    role=user['role']; branch=data.get('branch',user['branch']); scoped(user,branch,branches)
    allowed={'payroll_import':['accounting'],'candy_checkout':['candy'],'candy_void_request':['candy'],'candy_void_review':['accounting'],'cash_open':['ticketing','candy'],'cash_void':['accounting'],'cash_movement':['ticketing','candy'],'ticket_checkout':['ticketing'],'sell':['ticketing','candy'],'show':['manager'],'report':['administrator'],'review':['accounting'],'product':['accounting'],'stock':['accounting'],'audit_start':['accounting'],'audit_save':['accounting'],'audit_finish':['accounting'],'close':['ticketing','candy'],'close_review':['accounting']}
    for name in ['payroll_delete','payroll_reopen','payroll_role','payroll_employee','payroll_extra','payroll_extra_void','payroll_calculate','payroll_validate','payroll_mail_update']:allowed[name]=['accounting']
    for name in ['trailer_save','room_save','movie_save','schedule','show_cancel','trailer_delete','movie_delete','room_delete','show_delete']: allowed[name]=['manager']
    require(role in allowed.get(action,[]),'Tu rol no permite esta operación.'); result={}
    before_sales={s['id'] for s in state['sales']}
    if action=='payroll_import': result=stage_import(state,user,data,branch,now(),reader=biometric_reader)
    elif action.startswith('payroll_'):result=payroll.mutate(state,user,action,data,branch,now())
    elif action=='candy_checkout': result=candy.checkout(state,user,data,today(),now())
    elif action=='candy_void_request': result=candy.request_void(state,user,data,now())
    elif action=='candy_void_review': result=candy.review(state,user,data,branch,now())
    elif action=='cash_open': result=cash.opening(state,user,data,today(),now())
    elif action=='cash_void': result=cash.void_movement(state,user,data,branch,now())
    elif action=='cash_movement': result=cash.movement(state,user,data,today(),now())
    elif action=='ticket_checkout': result=ticketing.checkout(state,user,data,today(),now())
    elif action in ['trailer_delete','movie_delete','room_delete','show_delete']: result=cinema.remove(state,branch,{'trailer_delete':'trailers','movie_delete':'movies','room_delete':'rooms','show_delete':'shows'}[action],data)
    elif action=='room_save': result=cinema.room_save(state,branch,data,today())
    elif action=='movie_save': result=cinema.movie_save(state,branch,data)
    elif action in ['schedule','show']: result=cinema.schedule(state,branch,data,today())
    elif action=='show_cancel': result=cinema.cancel_show(state,branch,data)
    elif action=='trailer_save':
        result=trailers.save(state,user,action,data,branch,now=now,uid=uid)
    elif action=='sell':
        seller=candy if role=='candy' else ticketing
        result=seller.sell_single(state,user,data,branch,now=now,today=today,uid=uid)
    elif action in ['product','stock','report','review','audit_start','audit_save','audit_finish']:
        result=inventory.execute(state,user,action,data,branch,now=now,uid=uid)
    elif action in ['close','close_review']:
        result=closing.execute(state,user,action,data,branch,now=now,today=today,uid=uid)
    candy.ensure(state)
    for sale in state['sales']:
        if sale['id'] not in before_sales:sale['cashSession']=(cash.active(state,user['id']) or {}).get('id','')
    state['log'].append(dict(id=uid(),branch=branch,at=now(),user=user['id'],action=action)); return result

