"""Candy business rules; no I/O or rendering."""
from erp.shared.domain.records import require, number, find
from erp.modules.inventory.domain import active
import secrets, copy
from decimal import Decimal
from erp.shared.domain import validation as cinema
from erp.modules.cash import domain as cash

def ensure(state):
    used={p.get('code') for p in state['products'] if p.get('code')}
    counter=1
    for p in state['products']:
        if not p.get('code'):
            while f'XXX{counter}' in used:counter+=1
            p['code']=f'XXX{counter}';used.add(p['code'])
    orders=state.setdefault('candyOrders',[])
    state.setdefault('candyRequests',[])
    ids={o['id'] for o in orders}
    for sale in state['sales']:
        if sale['area']=='candy' and not sale.get('orderId'):
            oid='legacy-'+sale['id'];sale['orderId']=oid
            if oid not in ids:
                p=next((p for p in state['products'] if p['id']==sale['item']),{})
                orders.append(dict(id=oid,branch=sale['branch'],user=sale['user'],day=sale['day'],at=sale['at'],total=sale['total'],lines=[dict(item=sale['item'],name=sale['label'],code=p.get('code',''),quantity=sale['quantity'],unitPrice=sale.get('unitPrice',round(sale['total']/sale['quantity'],2) if sale['quantity'] else 0),total=sale['total'])]))

def checkout(state,user,data,day,at):
    token=cinema.text(data.get('requestId'),100)
    existing=next((o for o in state['candyOrders'] if o['user']==user['id'] and o.get('requestId')==token),None)
    if existing:return {'order':existing}
    cinema.check(cash.can_sell(state,user['id']),'Abre tu caja antes de vender.')
    cinema.check(not any(a['branch']==user['branch'] and a['kind']=='candy' and a['status']=='En curso' for a in state['audits']),'Ventas bloqueadas durante el arqueo de Candy bar.')
    rows=data.get('lines');cinema.check(isinstance(rows,list) and 1<=len(rows)<=100,'Agrega productos a la venta (máximo 100).')
    lines=[];seen=set();total=Decimal(0)
    for r in rows:
        cinema.check(isinstance(r,dict),'Producto inválido.')
        p=cinema.find(state,'products',r.get('item'));q=cinema.integer(r.get('quantity'),1,10000)
        cinema.check(p['kind']=='candy' and p['branch']==user['branch'],'Producto fuera de tu sucursal.')
        cinema.check(p['id'] not in seen,'Producto repetido. Ajusta la cantidad.');seen.add(p['id'])
        cinema.check(q<=p['stock'],f'Existencia insuficiente de {p["name"]}. Reduce la cantidad.')
        cinema.check(Decimal(str(r.get('unitPrice')))==Decimal(str(p['price'])),'El precio cambió. Actualiza la lista de venta.')
        subtotal=Decimal(str(p['price']))*q;total+=subtotal
        lines.append(dict(item=p['id'],code=p['code'],name=p['name'],quantity=q,unitPrice=p['price'],total=float(subtotal)))
    order=dict(id=secrets.token_hex(8),requestId=token,user=user['id'],branch=user['branch'],day=day,at=at,lines=lines,total=float(total))
    for line in lines:
        cinema.find(state,'products',line['item'])['stock']-=line['quantity']
        state['sales'].append(dict(id=secrets.token_hex(6),orderId=order['id'],branch=user['branch'],user=user['id'],area='candy',day=day,at=at,item=line['item'],label=line['name'],quantity=line['quantity'],unitPrice=line['unitPrice'],total=line['total'],seats=[]))
    state['candyOrders'].append(order);return {'order':order}

def request_void(state,user,data,at):
    order=cinema.find(state,'candyOrders',data.get('id'))
    cinema.check(order['user']==user['id'] and order['branch']==user['branch'],'Solo puedes solicitar la anulación de tus ventas.')
    cinema.check(not order.get('voided'),'La venta ya está anulada.')
    cinema.check(not any(r['order']==order['id'] and r['status']=='Pendiente' for r in state['candyRequests']),'Ya existe una solicitud pendiente.')
    row=dict(id=secrets.token_hex(6),order=order['id'],branch=order['branch'],user=user['id'],at=at,reason=cinema.text(data.get('reason'),300),status='Pendiente')
    state['candyRequests'].append(row);return {'request':row['id']}

def review(state,user,data,branch,at):
    row=cinema.find(state,'candyRequests',data.get('id'))
    cinema.check(row['branch']==branch and row['status']=='Pendiente','Solicitud no disponible.')
    status=data.get('status');cinema.check(status in ['Aprobado','Rechazado'],'Selecciona una decisión.')
    note=cinema.text(data.get('note'),300);order=cinema.find(state,'candyOrders',row['order'])
    if status=='Aprobado':
        cinema.check(not order.get('voided'),'La venta ya fue anulada.')
        restore=data.get('restoreStock');cinema.check(restore in ['yes','no'],'Indica si los productos regresan al inventario.')
        cinema.check(not any(a['branch']==branch and a['kind']=='candy' and a['status']=='En curso' for a in state['audits']),'Finaliza el arqueo de Candy antes de anular ventas.')
        if restore=='yes':
            for line in order['lines']:cinema.find(state,'products',line['item'])['stock']+=line['quantity']
        order.update(voided=True,voidAt=at,voidBy=user['id'],voidReason=note,restored=restore=='yes')
        affected=[]
        for sale in state['sales']:
            if sale.get('orderId')==order['id'] and sale['area']=='candy':sale['voided']=True;affected.append(sale)
        for close in state['closures']:
            if any(s['user']==close['user'] and s.get('cashSession','')==close.get('cashSession','') and (bool(s.get('cashSession')) or s['day']==close['day']) for s in affected):
                close.setdefault('revisions',[]).append(dict(at=at,by=user['id'],reason=note,order=order['id'],previous=copy.deepcopy({k:v for k,v in close.items() if k!='revisions'})))
                detail=cash.summary(state,close['user'],close['day'],close.get('cashSession',''))
                close.update(detail=detail,expected=detail['expected'],difference=round(close['physical']-detail['expected'],2),status='Pendiente',note='Venta anulada: requiere nueva conciliación de entrega y devolución.')
                close.pop('reviewer',None);close.pop('reviewed',None)
    row.update(status=status,note=note,reviewer=user['id'],reviewed=at)
    return {'reviewed':row['id']}



def sell_single(state,user,data,branch,*,now,today,uid):
    """Compatibility single-item sale with unchanged validation and pricing."""
    require(cash.can_sell(state,user['id']),'Tu caja del día ya está cerrada.'); quantity=number(data.get('quantity'),1,True)
    require(not active(state,branch,'candy'),'Ventas bloqueadas: Contabilidad está realizando un arqueo.')
    item=find(state,'products',data.get('item')); require(item['branch']==branch and item['kind']=='candy','Producto fuera de tu inventario.'); require(item['stock']>=quantity,'No hay existencias suficientes.')
    item['stock']-=quantity; label=item['name']; seats=[]
    unit_price=item['price']
    sale=dict(id=uid(),branch=branch,user=user['id'],area='candy',day=today(),at=now(),item=item['id'],label=label,quantity=quantity,unitPrice=unit_price,total=round(unit_price*quantity,2),seats=seats)
    state['sales'].append(sale); return {'sale':sale['id']}
