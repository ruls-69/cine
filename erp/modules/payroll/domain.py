"""Payroll business rules; no I/O or rendering."""
import secrets, re, hashlib, json, calendar, copy
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP
from datetime import date, datetime, timedelta
from erp.shared.domain import validation as cinema

def amount(value,zero=True):
    try:n=Decimal(str(value))
    except InvalidOperation:raise ValueError('Importe inválido.')
    cinema.check(n.is_finite() and (0 if zero else Decimal('.01'))<=n<=1000000,'Importe fuera de rango.')
    return float(n.quantize(Decimal('.01'),rounding=ROUND_HALF_UP))

def ensure(state):
    for key in ['payrollEmployees','payrollRoles','payrollExtras','payrollRuns','payrollMail']:state.setdefault(key,[])

def get(state,key,id,branch):
    item=cinema.find(state,key,id);cinema.check(item['branch']==branch,'Registro de otra sucursal.');return item

def month(value):
    value=cinema.text(value,7)
    cinema.check(bool(re.fullmatch(r'\d{4}-\d{2}',value)),'Mes inválido.')
    date.fromisoformat(value+'-01');return value

def email(value):
    value=str(value or '').strip()
    cinema.check(not value or bool(re.fullmatch(r'[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+',value)) and len(value)<=254,'Correo inválido.')
    return value

def role_save(state,data,branch,at,user):
    role=cinema.text(data.get('role'),80);salary=amount(data.get('salary'),False)
    old=next((r for r in state['payrollRoles'] if r['branch']==branch and r['role'].casefold()==role.casefold()),None)
    if old:old.update(salary=salary,at=at,user=user['id'])
    else:state['payrollRoles'].append(dict(id=secrets.token_hex(6),branch=branch,role=role,salary=salary,at=at,user=user['id']))

def late_policy(data):
    enabled=data.get('lateEnabled')=='yes'
    if not enabled:return {'enabled':False}
    entry=cinema.text(data.get('shiftStart'),5);datetime.strptime(entry,'%H:%M')
    hours=amount(data.get('shiftHours'),False);cinema.check(hours<=16,'La jornada debe tener hasta 16 horas.')
    tiers=[]
    for i in range(1,4):
        minutes=cinema.integer(data.get(f'lateMinutes{i}'),0,720)
        comparison=data.get(f'lateCompare{i}');cinema.check(comparison in ['gt','gte'],'Comparación de atraso inválida.')
        penalty=hours if i==3 else amount(data.get(f'lateHours{i}'),False)
        cinema.check(penalty<=hours,'El descuento en horas no puede superar la jornada.')
        tiers.append(dict(minutes=minutes,comparison=comparison,hours=penalty,wholeDay=i==3))
    cinema.check(tiers[0]['minutes']<tiers[1]['minutes']<tiers[2]['minutes'],'Los tres umbrales deben aumentar.')
    cinema.check(tiers[0]['hours']<=tiers[1]['hours'],'El segundo descuento no puede ser menor al primero.')
    return dict(enabled=True,start=entry,hours=hours,tiers=tiers)

def lateness(employee,punches,worked_days,daily):
    policy=employee.get('latePolicy',{'enabled':False});rows=[]
    if not policy['enabled']:return Decimal(0),rows,policy
    scheduled=parse_time(policy['start'])
    for day in sorted(worked_days):
        first=min(p['absolute']%86400 for p in punches if p['date']==day)
        delay=max(0,first-scheduled)
        chosen=None
        for tier in policy['tiers']:
            threshold=tier['minutes']*60
            if delay>=threshold if tier['comparison']=='gte' else delay>threshold:chosen=tier
        if chosen:
            value=(daily*Decimal(str(chosen['hours']))/Decimal(str(policy['hours']))).quantize(Decimal('.01'),rounding=ROUND_HALF_UP)
            value=min(value,daily.quantize(Decimal('.01'),rounding=ROUND_HALF_UP))
            rows.append(dict(date=day,entry=f'{first//3600:02d}:{first%3600//60:02d}:{first%60:02d}',minutes=round(delay/60,2),hours=chosen['hours'],wholeDay=chosen['wholeDay'],amount=float(value)))
    return sum((Decimal(str(r['amount'])) for r in rows),Decimal(0)),rows,policy

def employee_save(state,data,branch,at,user):
    old=get(state,'payrollEmployees',data['id'],branch) if data.get('id') else None
    code=cinema.text(data.get('code'),80);name=cinema.text(data.get('name'),120);role=cinema.text(data.get('role'),80)
    cinema.check(not any(e['branch']==branch and e['code'].casefold()==code.casefold() and e['id']!=data.get('id') for e in state['payrollEmployees']),'Ya hay un empleado con ese código biométrico en la sucursal.')
    reference=next((r for r in state['payrollRoles'] if r['branch']==branch and r['role']==role),None)
    salary=amount(data['salary'],False) if data.get('salary') not in ['',None] else (reference or {}).get('salary')
    cinema.check(salary is not None,'Define un sueldo para el empleado o un sueldo de referencia para su rol.')
    rest=data.get('restWeekday');cinema.check(str(rest) in [str(i) for i in range(7)],'Selecciona el día de descanso semanal del empleado.')
    values=dict(latePolicy=late_policy(data),restWeekday=int(rest),code=code,name=name,role=role,salary=salary,email=email(data.get('email')),active=data.get('active','yes')=='yes',updated=at)
    if old:
        old.setdefault('history',[]).append(dict(at=at,by=user['id'],previous={k:old.get(k) for k in values}));old.update(values)
    else:state['payrollEmployees'].append(dict(id=secrets.token_hex(6),branch=branch,created=at,**values))

def extra_save(state,data,branch,at,user):
    period=month(data.get('month'));day=date.fromisoformat(data.get('date','')).isoformat()
    cinema.check(day[:7]==period,'La función especial debe pertenecer al mes seleccionado.')
    cinema.check(not any(r['branch']==branch and r['month']==period and r['status']=='Validada' for r in state['payrollRuns']),'La planilla del mes ya fue validada; no admite nuevos extras.')
    ids=data.get('employees');cinema.check(isinstance(ids,list) and 1<=len(ids)<=500,'Selecciona uno o varios empleados.')
    ids=list(dict.fromkeys(ids))
    for id in ids:cinema.check(get(state,'payrollEmployees',id,branch)['active'],'El empleado está inactivo.')
    token=cinema.text(data.get('requestId'),100)
    if any(e.get('requestId')==token and e['branch']==branch for e in state['payrollExtras']):return
    extra_type=data.get('extraType','special');cinema.check(extra_type in ['special','day'],'Tipo de extra inválido.')
    if extra_type=='day':
        cinema.check(not any(x['branch']==branch and x.get('extraType')=='day' and x['date']==day and not x['voided'] and set(x['employees'])&set(ids) for x in state['payrollExtras']),'Ya existe un día extra para uno de estos empleados en esa fecha.')
    state['payrollExtras'].append(dict(extraType=extra_type,id=secrets.token_hex(6),requestId=token,branch=branch,month=period,date=day,reason=cinema.text(data.get('reason'),300),amount=amount(data.get('amount'),False),employees=ids,user=user['id'],at=at,voided=False))

def extra_void(state,data,branch,at,user):
    row=get(state,'payrollExtras',data.get('id'),branch)
    cinema.check(not row['voided'],'El extra ya fue anulado.')
    cinema.check(not any(r['branch']==branch and r['month']==row['month'] and r['status']=='Validada' for r in state['payrollRuns']),'El extra pertenece a una planilla validada.')
    row.update(voided=True,voidAt=at,voidBy=user['id'],voidReason=cinema.text(data.get('reason'),300))

def parse_day(value,epoch,format):
    text=str(value).strip()
    try:
        n=float(text)
        if 0<=n<100000:return (date.fromisoformat(epoch)+timedelta(days=int(n))).isoformat()
    except ValueError:pass
    for pattern in (['%Y-%m-%d','%Y-%m-%d %H:%M:%S','%Y-%m-%dT%H:%M:%S']+(['%d/%m/%Y','%d-%m-%Y'] if format=='DMY' else ['%m/%d/%Y'])):
        try:return datetime.strptime(text,pattern).date().isoformat()
        except ValueError:pass
    raise ValueError('Fecha no reconocida')

def parse_time(value):
    text=str(value).strip();cinema.check(bool(text),'Falta entrada o salida')
    try:
        n=float(text)
        if 0<=n<100000:return round((n%1)*86400)
    except ValueError:pass
    text=text.split('T')[-1].split(' ')[-1]
    for fmt in ['%H:%M:%S','%H:%M']:
        try:t=datetime.strptime(text,fmt);return t.hour*3600+t.minute*60+t.second
        except ValueError:pass
    raise ValueError('Hora no reconocida')

def calculate(state,source,mapping):
    header_text=' '.join(map(str,source['headers']+source['rows'][0])).casefold()
    cinema.check(not ('sueldo' in header_text and 'entrada' not in header_text and 'salida' not in header_text),'Este archivo contiene fichas de empleados, no marcaciones. Usa el reporte con código, fecha, entrada y salida.')
    period=month(source['start'][:7]);start=period+'-01';last=calendar.monthrange(int(period[:4]),int(period[5:]))[1]
    cinema.check(source['start']==start and source['end']==f'{period}-{last:02d}','Para sueldo mensual importa el mes completo (primer a último día).')
    employees=[e for e in state['payrollEmployees'] if e['branch']==source['branch'] and e['active']]
    cinema.check(bool(employees),'Registra los empleados de esta sucursal.')
    cols=[int(mapping[k]) for k in ['code','date','entry','exit']]
    cinema.check(len(set(cols))==4 and all(0<=i<len(source['headers']) for i in cols),'Selecciona cuatro columnas distintas.')
    bycode={e['code'].casefold():e for e in employees};attendance={e['id']:[] for e in employees};issues=[];seen=set();unmatched=set();source_dates=[]
    for number,row in enumerate(source['rows'],2):
        try:
            try:source_dates.append(parse_day(row[cols[1]],source.get('epoch','1899-12-30'),mapping.get('format','DMY')))
            except (ValueError,IndexError):pass
            code=str(row[cols[0]]).strip();employee=bycode.get(code.casefold())
            if employee is None:unmatched.add(code)
            cinema.check(employee is not None,f'Código no asociado a empleado activo: {code}')
            day=parse_day(row[cols[1]],source.get('epoch','1899-12-30'),mapping.get('format','DMY'))
            cinema.check(start<=day<=source['end'],'Marcación fuera del mes')
            entry=parse_time(row[cols[2]]);exit=parse_time(row[cols[3]])
            duration=(exit-entry)%86400
            cinema.check(0<duration<=16*3600,'Duración cero o mayor a 16 horas: revisar turno')
            key=(employee['id'],day,entry,exit)
            cinema.check(key not in seen,'Marcación duplicada (no sumada)');seen.add(key)
            absolute=date.fromisoformat(day).toordinal()*86400+entry
            for prior in attendance[employee['id']]:
                cinema.check(absolute+duration<=prior['absolute'] or absolute>=prior['absolute']+prior['seconds'],'Turnos superpuestos (no sumados): revisar marcaciones')
            attendance[employee['id']].append(dict(date=day,entry=str(row[cols[2]]),exit=str(row[cols[3]]),seconds=duration,absolute=absolute,overnight=exit<entry))
        except (ValueError,IndexError,TypeError) as error:issues.append(dict(row=number,message=str(error)))
    lines=[]
    all_days=[date.fromisoformat(start)+timedelta(days=i) for i in range(last)]
    for e in employees:
        punches=attendance[e['id']]
        cinema.check(e.get('restWeekday') in range(7),f'Define el descanso semanal de {e["name"]} en Empleados y sueldos.')
        rest_dates={d.isoformat() for d in all_days if d.weekday()==e['restWeekday']}
        scheduled={d.isoformat() for d in all_days}-rest_dates
        worked={p['date'] for p in punches}
        worked_regular=worked&scheduled;missing=scheduled-worked;worked_rest=worked&rest_dates
        if not punches:issues.append(dict(row='—',message=f'{e["name"]}: sin marcaciones válidas; sueldo devengado cero'))
        extras=[dict(id=x['id'],date=x['date'],reason=x['reason'],amount=x['amount'],extraType=x.get('extraType','special')) for x in state['payrollExtras'] if x['branch']==source['branch'] and x['month']==period and e['id'] in x['employees'] and not x['voided']]
        for extra in extras:
            if extra['extraType']=='day':
                cinema.check(extra['date'] in rest_dates,f'{e["name"]}: el día extra {extra["date"]} debe ser un descanso programado para no duplicar el sueldo normal.')
                cinema.check(extra['date'] in worked,f'{e["name"]}: el día extra {extra["date"]} no tiene entrada y salida válidas.')
        credited={x['date'] for x in extras if x['extraType']=='day'}
        for d in worked_rest-credited:issues.append(dict(row='—',message=f'{e["name"]}: trabajó en descanso {d}; no tiene un día extra registrado'))
        bonus=sum((Decimal(str(x['amount'])) for x in extras),Decimal(0))
        base=Decimal(str(e['salary']));earned=(base*len(worked_regular)/len(scheduled)).quantize(Decimal('.01'),rounding=ROUND_HALF_UP)
        deduction,late_rows,policy=lateness(e,punches,worked_regular,base/len(scheduled));deduction=min(deduction,earned)
        lines.append(dict(latePolicy=copy.deepcopy(policy),lateRows=late_rows,lateDeduction=float(deduction),netBase=float(earned-deduction),employee=e['id'],code=e['code'],name=e['name'],role=e['role'],email=e['email'],base=e['salary'],earnedBase=float(earned),unearnedBase=float(base-earned),expectedDays=len(scheduled),workedDays=len(worked_regular),missingDates=sorted(missing),restDates=sorted(rest_dates),workedRestDates=sorted(worked_rest),extras=extras,extraTotal=float(bonus),total=float(earned-deduction+bonus),days=len(worked),hours=round(sum(p['seconds'] for p in punches)/3600,2),attendance=punches))
    result=dict(calculationVersion=3,sourceStart=min(source_dates) if source_dates else '',sourceEnd=max(source_dates) if source_dates else '',unmatchedCodes=sorted(unmatched),month=period,lines=lines,issues=issues,total=float(sum((Decimal(str(l['total'])) for l in lines),Decimal(0))))
    result['fingerprint']=hashlib.sha256(json.dumps(result,sort_keys=True,ensure_ascii=False).encode()).hexdigest();return result

def delete_record(state,user,data,branch,at):
    kind=data.get('kind')
    keys={'employee':'payrollEmployees','role':'payrollRoles','extra':'payrollExtras','import':'payrollImports','run':'payrollRuns'}
    cinema.check(kind in keys,'Tipo de registro inválido.')
    key=keys[kind];row=get(state,key,data.get('id'),branch)
    runs=state['payrollRuns']
    if kind=='employee':
        cinema.check(not any(any(l['employee']==row['id'] for l in r['lines']) for r in runs) and not any(row['id'] in x['employees'] for x in state['payrollExtras']),'Este empleado tiene extras o planillas. Conserva su historial y cambia su estado a Inactivo.')
    elif kind=='import':
        cinema.check(not any(r['source']==row['id'] for r in runs),'Este archivo está asociado a una planilla. Borra primero su borrador; los archivos de planillas aprobadas se conservan.')
    elif kind=='run':
        cinema.check(row['status']=='Borrador' and not row.get('history') and not any(j['run']==row['id'] for j in state['payrollMail']),'Solo se pueden borrar borradores sin aprobaciones ni historial de correos.')
    elif kind=='extra':
        cinema.check(not any(r['branch']==branch and r['month']==row['month'] for r in runs),'Este extra tiene una planilla asociada. Anúlalo si aún no fue aprobada y recalcula el borrador.')
    state.setdefault('payrollDeleted',[]).append(dict(kind=kind,record=copy.deepcopy(row),at=at,by=user['id'],branch=branch))
    state[key].remove(row)

def mutate(state,user,action,data,branch,at):
    ensure(state)
    if action=='payroll_delete':delete_record(state,user,data,branch,at)
    elif action=='payroll_role':role_save(state,data,branch,at,user)
    elif action=='payroll_employee':employee_save(state,data,branch,at,user)
    elif action=='payroll_extra':extra_save(state,data,branch,at,user)
    elif action=='payroll_extra_void':extra_void(state,data,branch,at,user)
    elif action=='payroll_calculate':
        source=get(state,'payrollImports',data.get('id'),branch)
        mapping={k:data.get(k) for k in ['code','date','entry','exit','format']}
        result=calculate(state,source,mapping)
        cinema.check(not any(r['branch']==branch and r['month']==result['month'] and r['status']=='Validada' for r in state['payrollRuns']),'Ese mes ya tiene una planilla validada.')
        existing=next((r for r in state['payrollRuns'] if r['branch']==branch and r['month']==result['month']),None)
        values=dict(source=source['id'],mapping=mapping,at=at,user=user['id'],status='Borrador',**result)
        if existing:existing.update(values)
        else:state['payrollRuns'].append(dict(id=secrets.token_hex(8),branch=branch,**values))
        source.update(status='Calculado',mapping=mapping,note='Sueldo proporcional a días laborables con asistencia válida, excluyendo descansos programados, más extras.')
    elif action=='payroll_validate':
        run=get(state,'payrollRuns',data.get('id'),branch)
        cinema.check(run['status']=='Borrador','La planilla ya fue validada.')
        source=get(state,'payrollImports',run['source'],branch)
        cinema.check(calculate(state,source,run['mapping'])['fingerprint']==run['fingerprint'],'Cambió la información: vuelve a calcular antes de validar.')
        cinema.check(data.get('confirm')=='yes','Confirma la revisión de empleados, importes e incidencias.')
        cinema.check(not run.get('unmatchedCodes'),'Hay códigos sin empleado activo: registra o corrige los empleados y recalcula.')
        cinema.check(source['end']<at[:10],'El mes aún no terminó: esta planilla es una vista previa, no puede validarse.')
        cinema.check(data.get('attendanceConfirmed')=='yes','Confirma que el biométrico del mes está completo y revisaste los días sin marcación.')
        note=cinema.text(data.get('note'),500)
        run.update(status='Validada',validatedAt=at,validatedBy=user['id'],validationNote=note)
        for line in run['lines']:
            state['payrollMail'].append(dict(id=secrets.token_hex(8),branch=branch,run=run['id'],employee=line['employee'],name=line['name'],recipient=line['email'],subject=f'Reporte salarial {run["month"]} · Multicine Universal',status='Pendiente de conectar correo' if line['email'] else 'Falta correo del empleado',at=at))
    elif action=='payroll_mail_update':
        job=get(state,'payrollMail',data.get('id'),branch)
        cinema.check(job['status'] not in ['Enviado','Enviando','Cancelado por corrección'],'Este envío no se puede modificar.')
        recipient=email(data.get('email'));cinema.check(bool(recipient),'Completa el correo del empleado.')
        if job['status']=='Revisar envío':cinema.check(data.get('retry')=='yes','Comprueba primero que el correo anterior no llegó; el resultado del envío es incierto.')
        job.setdefault('history',[]).append(dict(at=at,by=user['id'],recipient=job['recipient'],status=job['status']))
        job.update(recipient=recipient,status='Pendiente de conectar correo',updated=at)
    elif action=='payroll_reopen':
        run=get(state,'payrollRuns',data.get('id'),branch)
        cinema.check(run['status']=='Validada','Solo se puede corregir una planilla validada.')
        jobs=[j for j in state['payrollMail'] if j['run']==run['id'] and j['status']!='Cancelado por corrección']
        cinema.check(not any(j['status'] in ['Enviado','Enviando','Revisar envío'] for j in jobs),'Hay correos enviados o con entrega incierta. La planilla debe conservarse; no se puede sobrescribir.')
        note=cinema.text(data.get('reason'),500)
        run.setdefault('history',[]).append(dict(at=at,by=user['id'],reason=note,previous=copy.deepcopy({k:v for k,v in run.items() if k!='history'})))
        for job in jobs:job.update(status='Cancelado por corrección',finishedAt=at)
        run.update(status='Borrador',correctionNote=note)
    else:raise ValueError('Operación de salarios no disponible.')
    return {}
