"""Domain and application tests independent of HTTP, SMTP and printers."""
import copy
import json
import sqlite3
import tempfile
import unittest
import subprocess
import sys
from contextlib import contextmanager
from pathlib import Path
from erp.application.service import Operations
from erp.application.commands import mutate
from erp.infrastructure.state_repository import SqlStateRepository
from erp.modules.catalog.domain import available, price
from erp.modules.ticketing.admissions import tickets
from erp.modules.payroll.application import import_file
from scripts.check_architecture import check
from erp.application.documents import Documents
from erp.modules.catalog.application import Catalog


class MemoryRepository:
    def __init__(self, state): self.state=state
    def read(self): return copy.deepcopy(self.state)
    def read_serialized(self): return json.dumps(self.state)
    def transact(self, operation):
        candidate=self.read()
        result=operation(candidate)
        self.state=candidate
        return result


class ArchitectureTests(unittest.TestCase):
    def test_document_port_rejects_other_seller_before_rendering(self):
        rendered=[]
        repository=MemoryRepository({'orders':[dict(id='order',branch='Potosí',user='seller')]})
        documents=Documents(repository,['Potosí'],{'ticket':lambda row:rendered.append(row) or b'receipt'})
        with self.assertRaises(PermissionError):
            documents.get('ticket','order',dict(id='other',role='ticketing',branch='Potosí'))
        self.assertEqual(rendered,[])
        self.assertEqual(documents.get('ticket','order',dict(id='seller',role='ticketing',branch='Potosí')).content,b'receipt')

    def test_public_trailers_filter_branch_and_private_fields(self):
        repository=MemoryRepository({'trailers':[
            dict(id='one',branch='Potosí',published=True,position=1,title='Film',videoId='video',internal='private'),
            dict(id='two',branch='Sucre',published=True,position=2,title='Other',videoId='other'),
        ]})
        client=Catalog(repository,['Potosí','Sucre'],lambda:'2026-10-08')
        self.assertEqual(client.trailers('Potosí')['trailers'],[dict(id='one',position=1,title='Film',videoId='video')])
        with self.assertRaises(ValueError):client.trailers('unknown')

    def test_architecture_checker_rejects_outward_dependency_and_cycles(self):
        with tempfile.TemporaryDirectory() as directory:
            root=Path(directory)
            feature=root/'erp/modules/example';feature.mkdir(parents=True)
            (feature/'domain.py').write_text('import sqlite3\nfrom erp.modules.example import presentation\n')
            (feature/'presentation.py').write_text('from erp.modules.example import domain\n')
            errors,_=check(root)
            self.assertTrue(any('domain -> sqlite3' in error for error in errors))
            self.assertTrue(any('Cycle:' in error for error in errors))

    def test_existing_password_hash_cli_still_exposes_its_command(self):
        root=Path(__file__).resolve().parent
        result=subprocess.run([sys.executable,str(root/'auth_config.py'),'--help'],capture_output=True,text=True,cwd=root,check=False)
        self.assertEqual(result.returncode,0,result.stderr)
        self.assertIn('hash-password',result.stdout)

    def test_promotion_consumes_two_places_without_changing_price(self):
        show=dict(id='s',date='2026-10-07',capacity=246,price=45,basePrice=45,wednesdayPromo=True)
        self.assertEqual(available({'sales':[]},show),123)
        self.assertEqual(price(show),45)
        state={'sales':[dict(area='ticketing',item='s',quantity=1,seatQuantity=2)]}
        self.assertEqual(available(state,show),122)

    def test_admissions_do_not_depend_on_printer_or_html(self):
        rows=list(tickets({'id':'order','lines':[{'quantity':2,'seatQuantity':4,'seatsPerTicket':2}]}))
        self.assertEqual(len(rows),4)
        self.assertEqual(len({row['code'] for row in rows}),4)
        self.assertEqual([row['included'] for row in rows],[False,True,False,True])

    def test_import_uses_reader_port_and_preserves_epoch(self):
        seen=[]
        def reader(data):
            seen.append(data)
            return 'clock.xlsx',[['code','date'],['1001','1']],'1904-01-01'
        state={};data={'start':'2026-09-01','end':'2026-09-30','requestId':'request-id'}
        import_file(state,{'id':'accountant'},data,'Potosí','2026-10-08',reader=reader)
        self.assertEqual(seen,[data]);self.assertEqual(state['payrollImports'][0]['epoch'],'1904-01-01')

    def test_commands_work_with_memory_repository(self):
        state={'products':[],'shows':[],'sales':[],'closures':[],'log':[],'audits':[]}
        repository=MemoryRepository(state)
        def command(state,user,action,data):
            return mutate(state,user,action,data,now=lambda:'2026-10-08T10:00:00',today=lambda:'2026-10-08',uid=lambda:'id',branches=['Potosí'],biometric_reader=lambda _:None)
        app=Operations(repository,command)
        user={'id':'seller','role':'candy','branch':'Potosí'}
        app.execute(user,'cash_open',{'branch':'Potosí','requestId':'opening','amount':20})
        self.assertEqual(repository.state['cashMovements'][0]['total'],20)
        before=repository.read()
        with self.assertRaises(ValueError):app.execute(user,'cash_movement',{'branch':'Potosí','direction':'out','requestId':'expense','amount':21,'reason':'Test'})
        self.assertEqual(repository.state,before)

    def test_sql_transaction_rolls_back_partial_mutation(self):
        with tempfile.TemporaryDirectory() as directory:
            path=Path(directory)/'state.sqlite3'
            @contextmanager
            def connect():
                connection=sqlite3.connect(path)
                try:
                    with connection: yield connection
                finally: connection.close()
            with connect() as connection:
                connection.execute('CREATE TABLE state(id INTEGER PRIMARY KEY, body TEXT)')
                connection.execute('INSERT INTO state VALUES(1,?)',(json.dumps({'stock':10}),))
            repository=SqlStateRepository(connect)
            def fail(state):state['stock']=0;raise ValueError('failed validation')
            with self.assertRaises(ValueError):repository.transact(fail)
            self.assertEqual(repository.read(),{'stock':10})
            repository.transact(lambda state:state.update(stock=9))
            self.assertEqual(repository.read(),{'stock':9})
