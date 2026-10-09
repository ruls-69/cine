"""Cash business rules; no I/O or rendering."""
from decimal import Decimal
import secrets
from erp.shared.domain import validation as cinema

def active(state,user):
    return next((o for o in reversed(state.get('cashOpenings',[])) if o['user']==user and not o.get('closed')),None)

def can_sell(state,user):
    return active(state,user) is not None or not any(c['user']==user for c in state['closures'])

def opening(state,user,data,day,at):
    cinema.check(active(state,user['id']) is None,'Ya tienes una caja abierta.')
    token=cinema.text(data.get('requestId'),100)
    cinema.check(not any(o.get('requestId')==token and o['user']==user['id'] for o in state.get('cashOpenings',[])),'Esta apertura ya fue registrada.')
    raw=data.get('amount')
    amount=0 if raw in [None,'','0',0,'0.00'] else cinema.amount(raw)
    row=dict(id=secrets.token_hex(6),requestId=token,user=user['id'],branch=user['branch'],area=user['role'],day=day,at=at,closed=False)
    state.setdefault('cashOpenings',[]).append(row)
    if not any(c['user']==user['id'] and c['day']==day for c in state['closures']):
        for record in state['sales']+state.get('cashMovements',[]):
            if record['user']==user['id'] and record['day']==day and not record.get('cashSession'):record['cashSession']=row['id']
    if amount:
        movement(state,user,dict(direction='in',amount=amount,reason='Fondo inicial de apertura',requestId=token+'-fund'),day,at)
    return {'opening':row['id']}

def summary(state,user,day,session=None):
    if session is None:
        current=active(state,user);session=current['id'] if current else ''
    def belongs(r):return r.get('cashSession','')==session and (bool(session) or r['day']==day)
    sales=[s for s in state['sales'] if s['user']==user and belongs(s) and not s.get('voided')]
    moves=[m for m in state.get('cashMovements',[]) if m['user']==user and belongs(m)]
    summed=lambda rows:float(sum((Decimal(str(r['total'])) for r in rows),Decimal(0)))
    revenue=summed(sales);income=summed([m for m in moves if m['direction']=='in' and not m.get('voided')]);expense=summed([m for m in moves if m['direction']=='out' and not m.get('voided')])
    return dict(salesTotal=revenue,incomeTotal=income,expenseTotal=expense,expected=round(revenue+income-expense,2),quantity=sum(s['quantity'] for s in sales),people=sum(s.get('seatQuantity',s['quantity']) for s in sales),transactions=len({s.get('orderId',s['id']) for s in sales}),sales=sales,movements=moves)

def movement(state,user,data,day,at):
    cinema.check(can_sell(state,user['id']),'La caja está cerrada. No puedes registrar movimientos.')
    direction=data.get('direction');cinema.check(direction in ['in','out'],'Movimiento inválido.')
    token=cinema.text(data.get('requestId'),100)
    existing=next((m for m in state.get('cashMovements',[]) if m['user']==user['id'] and m['requestId']==token),None)
    if existing:return {'movement':existing['id']}
    amount=cinema.amount(data.get('amount'));reason=cinema.text(data.get('reason'),300);reference=str(data.get('reference') or '').strip();cinema.check(len(reference)<=100,'Referencia demasiado larga.')
    if direction=='out':cinema.check(amount<=summary(state,user['id'],day)['expected'],'El egreso supera el saldo esperado de tu caja.')
    row=dict(id=secrets.token_hex(6),requestId=token,branch=user['branch'],user=user['id'],area=user['role'],day=day,at=at,direction=direction,total=amount,reason=reason,reference=reference)
    row['cashSession']=(active(state,user['id']) or {}).get('id','')
    state.setdefault('cashMovements',[]).append(row);return {'movement':row['id']}

def void_movement(state,user,data,branch,at):
    row=next((m for m in state.get('cashMovements',[]) if m['id']==data.get('id')),None)
    cinema.check(row is not None and row['branch']==branch,'Movimiento no disponible en esta sucursal.')
    cinema.check(not row.get('voided'),'Este movimiento ya fue anulado.')
    reason=cinema.text(data.get('reason'),300)
    row.update(voided=True,voidReason=reason,voidBy=user['id'],voidAt=at)
    for close in state['closures']:
        if close['user']==row['user'] and close.get('cashSession','')==row.get('cashSession','') and (bool(row.get('cashSession')) or close['day']==row['day']):
            import copy
            close.setdefault('revisions',[]).append(dict(at=at,by=user['id'],reason=reason,movement=row['id'],previous=copy.deepcopy({k:v for k,v in close.items() if k!='revisions'})))
            detail=summary(state,row['user'],row['day'],close.get('cashSession',''))
            close.update(detail=detail,expected=detail['expected'],difference=round(close['physical']-detail['expected'],2),status='Pendiente',note='Movimiento anulado: requiere nueva verificación contable.')
            close.pop('reviewer',None);close.pop('reviewed',None)
    return {'voided':row['id']}
