"""Cash closing commands, independent of HTTP and persistence."""
from erp.modules.cash import domain as cash
from erp.shared.domain.records import require, number, text_value, find
def execute(state,user,action,data,branch,*,now,today,uid):
    result={}
    if action=='close':
        require(cash.can_sell(state,user['id']),'Ya cerraste la caja del día.'); detail=cash.summary(state,user['id'],today());expected=detail['expected']; physical=number(data.get('physical'))
        state['closures'].append(dict(id=uid(),branch=branch,user=user['id'],day=today(),at=now(),area=user['role'],cashSession=(cash.active(state,user['id']) or {}).get('id',''),detail=detail,declaredPhysical=physical,cashierNote=str(data.get('note',''))[:300],expected=expected,physical=physical,difference=round(physical-expected,2),status='Pendiente',note=str(data.get('note',''))[:300]))
        opened=cash.active(state,user['id'])
        if opened: opened.update(closed=True,closedAt=now())
    elif action=='close_review':
        close=find(state,'closures',data.get('id')); require(close['branch']==branch and close['status']!='Confirmado','Cierre no disponible.'); physical=number(data.get('physical')); note=text_value(data.get('note'),300)
        close.update(physical=physical,difference=round(physical-close['expected'],2),note=note,reviewer=user['id'],reviewed=now()); close['status']='Confirmado' if close['difference']==0 else 'Observado'
    return result
