"""Disposable UI environment. Never opens the user's operational database."""
import json
import os
import sys
from pathlib import Path
from datetime import date, timedelta
from xml.sax.saxutils import escape
from zipfile import ZipFile, ZIP_DEFLATED

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT))
target = Path(sys.argv[1]).resolve()
if not target.is_relative_to(ROOT / 'tmp') or not target.name.startswith('ui-qa-'):
    raise SystemExit('UI fixtures must use tmp/ui-qa-*.sqlite3')
if target.exists():
    raise SystemExit('Refusing to overwrite an existing database.')
target.parent.mkdir(exist_ok=True)
os.environ.update(ERP_DB=str(target), ERP_ENV='test', DATABASE_URL='', ERP_USERS_JSON='',
                  ERP_PRINT_MODE='manual', ERP_PAYROLL_MAIL_ENABLED='false',
                  PUBLIC_BASE_URL='', ERP_ALLOWED_ORIGINS='', ERP_PRINT_AGENTS_JSON='{}')
import server

server.init()
with server.connect() as db:
    state = json.loads(db.execute('SELECT body FROM state WHERE id=1').fetchone()[0])
    tomorrow = (date.fromisoformat(server.today()) + timedelta(days=1)).isoformat()
    for show in state['shows']:
        show['date'] = tomorrow
    # Existing catalog samples are used, not a copy of operational data.
    for movie in state['movies']:
        movie['poster'] = '/assets/cinema-atmosphere.png'
    account = server.USERS['contabilidad']
    for code, name, role, salary, rest in [('1001','Ana Pérez','Administración',3500,0),('1002','Luis Rojas','Candy bar',2800,1)]:
        server.mutate(state, account, 'payroll_employee', dict(branch='Potosí', code=code,
            name=name, role=role, salary=salary, restWeekday=rest, active='yes', email='',
            lateEnabled='yes', shiftStart='13:30', shiftHours=8,
            lateMinutes1=5,lateCompare1='gt',lateHours1=1,
            lateMinutes2=10,lateCompare2='gte',lateHours2=3,
            lateMinutes3=30,lateCompare3='gt'))
    # A pending vault report exercises table + review forms.
    vault = next(p for p in state['products'] if p['branch']=='Potosí' and p['kind']=='vault')
    server.mutate(state, server.USERS['admin.potosi'], 'report', dict(branch='Potosí',
        item=vault['id'], quantity=12, direction='in', reason='Recepción de prueba visual'))
    db.execute('UPDATE state SET body=? WHERE id=1', (json.dumps(state, ensure_ascii=False),))
    db.commit()
# A complete prior month, generated solely for testing the existing Excel import.
end = date.fromisoformat(server.today()).replace(day=1) - timedelta(days=1)
start = end.replace(day=1)
records = [['Código', 'Fecha', 'Entrada', 'Salida']]
day = start
while day <= end:
    for code, rest in [('1001', 0), ('1002', 1)]:
        if day.weekday() != rest:
            records.append([code, day.strftime('%d/%m/%Y'), '13:41' if day.day == 2 else '13:30', '21:30'])
    day += timedelta(days=1)
ns = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main'
xmlrows = ''.join('<row>' + ''.join(f'<c r="{chr(65+c)}{r}" t="inlineStr"><is><t>{escape(value)}</t></is></c>' for c, value in enumerate(row)) + '</row>' for r, row in enumerate(records, 1))
biometric = target.with_suffix('.xlsx')
with ZipFile(biometric, 'w', ZIP_DEFLATED) as workbook:
    workbook.writestr('xl/workbook.xml', f'<workbook xmlns="{ns}"><workbookPr date1904="0"/></workbook>')
    workbook.writestr('xl/worksheets/sheet1.xml', f'<worksheet xmlns="{ns}"><sheetData>{xmlrows}</sheetData></worksheet>')
print(json.dumps({'database': str(target), 'tomorrow': tomorrow, 'biometric': str(biometric), 'start': start.isoformat(), 'end': end.isoformat()}))
