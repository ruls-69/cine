"""Inventory commands operate within the caller transaction."""
from erp.modules.inventory.domain import active
from erp.shared.domain.records import require, number, text_value, find
def execute(state,user,action,data,branch,*,now,uid):
    result={}
    if action=='product':
        kind=data.get('kind'); require(kind in ['candy','vault'],'Inventario inválido.'); require(not active(state,branch,kind),'Inventario bloqueado por arqueo.')
        state['products'].append(dict(id=uid(),branch=branch,kind=kind,name=text_value(data.get('name')),unit=text_value(data.get('unit')),price=number(data.get('price'),0.01),stock=0))
    elif action in ['stock','report']:
        p=find(state,'products',data.get('item')); require(p['branch']==branch,'Producto de otra sucursal.'); require(action!='report' or p['kind']=='vault','Administración solo reporta movimientos de bóveda.'); require(action!='stock' or p['kind']=='candy','En bóveda, Administración reporta y Contabilidad valida.')
        q=number(data.get('quantity'),1,True); direction=data.get('direction'); require(direction in ['in','out'],'Movimiento inválido.'); delta=q if direction=='in' else -q
        report=dict(id=uid(),branch=branch,item=p['id'],name=p['name'],delta=delta,reason=text_value(data.get('reason'),300),user=user['id'],at=now(),status='Pendiente',kind=p['kind'])
        require(not active(state,branch,p['kind']),'Inventario bloqueado por arqueo. Registra el movimiento al finalizar.')
        if action=='stock': p['stock']+=delta; report.update(status='Aprobado',reviewer=user['id'],reviewed=now())
        state['reports'].append(report)
    elif action=='review':
        report=find(state,'reports',data.get('id')); require(report['branch']==branch and report['status'] in ['Pendiente','Observado'],'Reporte no disponible.'); status=data.get('status'); require(status in ['Aprobado','Observado','Rechazado'],'Estado inválido.'); note=text_value(data.get('note'),300)
        if status=='Aprobado':
            p=find(state,'products',report['item']); require(not active(state,branch,p['kind']),'No se pueden validar movimientos durante un arqueo.'); p['stock']+=report['delta']
        report.update(status=status,note=note,reviewer=user['id'],reviewed=now())
    elif action=='audit_start':
        kind=data.get('kind'); require(kind in ['candy','vault'],'Inventario inválido.'); require(not active(state,branch,kind),'Ya hay un arqueo activo.')
        require(not any(r['branch']==branch and r['kind']==kind and r['status'] in ['Pendiente','Observado'] for r in state['reports']),'Resuelve los reportes pendientes de este inventario antes de contar.')
        rows=[dict(item=p['id'],name=p['name'],unit=p['unit'],system=p['stock'],price=p['price'],physical=None) for p in state['products'] if p['branch']==branch and p['kind']==kind]; require(bool(rows),'No hay productos para contar.')
        audit=dict(id=uid(),branch=branch,kind=kind,at=now(),user=user['id'],status='En curso',rows=rows); state['audits'].append(audit); result={'audit':audit['id']}
    elif action in ['audit_save','audit_finish']:
        audit=find(state,'audits',data.get('id')); require(audit['branch']==branch and audit['status']=='En curso','Arqueo no disponible.')
        for row in audit['rows']:
            value=data.get('counts',{}).get(row['item'],row['physical']); row['physical']=None if value is None or value=='' else number(value,0,True)
        if action=='audit_finish':
            require(all(r['physical'] is not None for r in audit['rows']),'Completa todos los productos. Vacío no es cero.')
            for row in audit['rows']: find(state,'products',row['item'])['stock']=row['physical']
            audit.update(status='Finalizado',finished=now(),reviewer=user['id'])
    return result
