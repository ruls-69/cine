"""Ticketing business rules; no I/O or rendering."""
from erp.shared.domain.records import require, number, find
from decimal import Decimal
import secrets
from erp.modules.catalog import domain as cinema
from erp.modules.cash import domain as cash

def checkout(state,user,data,day,at):
    check=cinema.check
    request=str(data.get('requestId',''))
    check(8<=len(request)<=100,'Identificador de venta inválido. Vuelve a intentar.')
    orders=state.setdefault('orders',[])
    existing=next((o for o in orders if o['user']==user['id'] and o['requestId']==request),None)
    if existing:return {'order':existing,'repeated':True}
    check(cash.can_sell(state,user['id']),'Tu caja del día está cerrada.')
    lines=data.get('lines');check(isinstance(lines,list) and 1<=len(lines)<=50,'Agrega entre 1 y 50 funciones a la venta.')
    pending=[];seen=set();total=Decimal('0');order_id=secrets.token_hex(8)
    for row in lines:
        check(isinstance(row,dict),'Detalle de venta inválido.')
        show=cinema.find(state,'shows',row.get('item'))
        check(show['id'] not in seen,'Una función está repetida. Agrupa su cantidad.');seen.add(show['id'])
        check(show['branch']==user['branch'] and not show.get('cancelled'),'La función no está disponible en tu sucursal.')
        check(show['date']+'T'+show['time']>=at[:16],'Esta función ya comenzó. Retírala de la lista.')
        quantity=cinema.integer(row.get('quantity'),1,2000)
        check(quantity<=cinema.available(state,show),f'Quedan {cinema.available(state,show)} boletos para {show["title"]}, {show["date"]} {show["time"]}. Ajusta la cantidad.')
        price=cinema.price(show)
        check(cinema.amount(row.get('unitPrice'))==price and row.get('seatsPerTicket')==cinema.ticket_seats(show),'La tarifa o promoción cambió. Revisa la lista actualizada antes de confirmar.')
        subtotal=Decimal(str(price))*quantity;total+=subtotal
        pending.append(dict(item=show['id'],title=show['title'],date=show['date'],time=show['time'],room=show['room'],format=show.get('format','2D'),quantity=quantity,unitPrice=price,total=float(subtotal),seatsPerTicket=cinema.ticket_seats(show),seatQuantity=quantity*cinema.ticket_seats(show)))
    received=data.get('received');received=None if received in [None,''] else cinema.amount(received)
    check(received is None or Decimal(str(received))>=total,'El importe recibido es menor que el total a cobrar.')
    order=dict(id=order_id,requestId=request,branch=user['branch'],user=user['id'],day=day,at=at,lines=pending,total=float(total),received=received,change=round(received-float(total),2) if received is not None else None)
    for line in pending:
        state['sales'].append(dict(id=secrets.token_hex(6),orderId=order_id,branch=user['branch'],user=user['id'],area='ticketing',day=day,at=at,item=line['item'],label=f'{line["title"]} · {line["date"]} {line["time"]}',quantity=line['quantity'],seatQuantity=line['seatQuantity'],unitPrice=line['unitPrice'],total=line['total'],seats=[]))
    orders.append(order)
    return {'order':order,'repeated':False}



def sell_single(state,user,data,branch,*,now,today,uid):
    """Compatibility single-item sale with unchanged validation and pricing."""
    require(cash.can_sell(state,user['id']),'Tu caja del día ya está cerrada.'); quantity=number(data.get('quantity'),1,True)
    item=find(state,'shows',data.get('item')); require(item['branch']==branch and item['date']==today() and not item.get('cancelled') and not item.get('deleted'),'Selecciona una función vigente de hoy de tu sucursal.')
    require(quantity<=cinema.available(state,item),'No hay suficientes butacas disponibles para esta función.')
    seats=[]; label=f"{item['title']} · {item['time']}"
    unit_price=cinema.price(item)
    sale=dict(id=uid(),branch=branch,user=user['id'],area='ticketing',day=today(),at=now(),item=item['id'],label=label,quantity=quantity,unitPrice=unit_price,total=round(unit_price*quantity,2),seats=seats)
    sale['seatQuantity']=quantity*cinema.ticket_seats(item)
    state['sales'].append(sale); return {'sale':sale['id']}
