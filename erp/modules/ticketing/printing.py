"""Print adapter coordination, invoked after the sale transaction commits."""
import os, json
from erp.modules.ticketing import print_queue as cloud_print
from erp.shared.domain.records import require, find

def print_order(order_id,user,reprint=False,request_id=None,*,connect,users,now,uid,lock,production,printer):
    mode=os.environ.get('ERP_PRINT_MODE','manual' if production else 'local')
    if mode=='agent': return cloud_print.queue_order(connect,users,order_id,user,reprint,request_id=request_id)
    if mode=='manual': return cloud_print.manual_order(connect,order_id,user)
    with lock:
        with connect() as db:
            db.execute('BEGIN IMMEDIATE');state=json.loads(db.execute('SELECT body FROM state WHERE id=1').fetchone()[0]);order=find(state,'orders',order_id)
            require(user['role']=='ticketing' and order['user']==user['id'] and order['branch']==user['branch'],'No tienes permiso para imprimir esta venta.')
            previous=order.get('printing',{})
            if previous.get('status') in ['queued','sending','uncertain'] and not reprint:return dict(previous)
            try: name=printer.printer_name()
            except Exception as error:
                order['printing']=dict(status='unavailable',message=str(error),at=now());db.execute('UPDATE state SET body=? WHERE id=1',(json.dumps(state,ensure_ascii=False),));return order['printing']
            order['printing']=dict(status='sending',message='Enviando a la Epson…',printer=name,at=now());payload=printer.raw_bytes(order)
            db.execute('UPDATE state SET body=? WHERE id=1',(json.dumps(state,ensure_ascii=False),))
        try:
            job=printer.send(name,payload,'Universal '+order_id)
            result=dict(status='queued',message='Boletos enviados a la cola de la Epson.',printer=name,job=job,at=now())
        except Exception as error:result=dict(status='uncertain',message='No se pudo confirmar la impresión. Revisa la impresora y su cola antes de reimprimir. '+str(error),printer=name,at=now())
        with connect() as db:
            db.execute('BEGIN IMMEDIATE');state=json.loads(db.execute('SELECT body FROM state WHERE id=1').fetchone()[0]);order=find(state,'orders',order_id);order['printing']=result
            state['log'].append(dict(id=uid(),branch=order['branch'],at=now(),user=user['id'],action='ticket_reprint' if reprint else 'ticket_print'))
            db.execute('UPDATE state SET body=? WHERE id=1',(json.dumps(state,ensure_ascii=False),))
        return result

