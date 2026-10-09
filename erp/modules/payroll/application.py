"""Stage a biometric import using an injected file-reader port."""
import secrets
from datetime import date
from erp.shared.domain import validation as cinema
from erp.application.ports import BiometricReader

def import_file(state,user,data,branch,at,*,reader: BiometricReader):
    start=cinema.text(data.get('start'),10);end=cinema.text(data.get('end'),10)
    cinema.check(date.fromisoformat(start)<=date.fromisoformat(end),'El período no es válido.')
    name,rows,epoch=reader(data)
    token=cinema.text(data.get('requestId'),100)
    existing=next((r for r in state.get('payrollImports',[]) if r.get('requestId')==token and r['user']==user['id']),None)
    if existing:return {'payroll':existing['id']}
    item=dict(id=secrets.token_hex(8),requestId=token,branch=branch,user=user['id'],at=at,start=start,end=end,filename=name,headers=rows[0],rows=rows[1:],epoch=epoch,status='Pendiente de columnas',note='Selecciona las columnas del biométrico para calcular la planilla mensual.')
    state.setdefault('payrollImports',[]).append(item)
    return {'payroll':item['id']}
