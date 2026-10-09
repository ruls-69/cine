"""Integration checks against an isolated temporary database and local server."""
import unittest, tempfile, threading, json, http.client, copy, os
from pathlib import Path
from concurrent.futures import ThreadPoolExecutor
import server as erp
from unittest.mock import patch

class ERPTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.old_db=erp.DB; cls.tmp=tempfile.TemporaryDirectory(); erp.DB=Path(cls.tmp.name)/'test.sqlite3'; erp.init()
        cls.http=erp.ThreadingHTTPServer(('127.0.0.1',0),erp.Handler); cls.port=cls.http.server_port
        threading.Thread(target=cls.http.serve_forever,daemon=True).start()
    @classmethod
    def tearDownClass(cls): cls.http.shutdown(); cls.http.server_close(); erp.DB=cls.old_db; cls.tmp.cleanup()
    def setUp(self):
        printer=patch.object(erp.thermal,"printer_name",side_effect=RuntimeError("Impresora de prueba no conectada"));printer.start();self.addCleanup(printer.stop)
        with erp.connect() as db: db.execute('UPDATE state SET body=? WHERE id=1',(json.dumps(erp.seed()),))
    def request(self,path,body=None,cookie=''):
        conn=http.client.HTTPConnection('127.0.0.1',self.port)
        conn.request('POST' if body is not None else 'GET',path,json.dumps(body) if body is not None else None,{'Content-Type':'application/json','Cookie':cookie})
        response=conn.getresponse(); payload=response.read(); result=(response.status,dict(response.getheaders()),payload); conn.close(); return result
    def login(self,user):
        code,headers,_=self.request('/api/login',{'username':user,'password':'Cine2026!'}); self.assertEqual(code,200); return headers['Set-Cookie'].split(';')[0]
    def state(self,cookie): return json.loads(self.request('/api/state',cookie=cookie)[2])['state']
    def action(self,cookie,action,expected_status=200,branch='Potosí',**kw):
        code,_,body=self.request('/api/action',dict(action=action,branch=branch,**kw),cookie); self.assertEqual(code,expected_status,body); return json.loads(body)
    def test_cash_movements_closing_and_report(self):
        seller=self.login('boleteria.potosi');other=self.login('boleteria2.potosi');accountant=self.login('contabilidad')
        args=dict(direction='in',amount=100,reason='<fondo>',reference='',requestId='cash-1')
        first=self.action(seller,'cash_movement',**args)
        self.assertEqual(first,self.action(seller,'cash_movement',**args))
        self.action(seller,'cash_movement',400,branch='Sucre',**args)
        self.action(accountant,'cash_movement',400,**args)
        self.action(seller,'cash_movement',direction='out',amount=30,reason='Retiro',reference='R1',requestId='cash-2')
        self.action(seller,'cash_movement',400,direction='out',amount=100000,reason='Exceso',requestId='cash-3')
        self.assertEqual(len(self.state(seller)['cashMovements']),2)
        self.assertEqual(self.state(other)['cashMovements'],[])
        expected=erp.cash.summary(self.state(seller),'boleteria.potosi',erp.today())['expected']
        self.action(seller,'close',physical=expected,note='Entrega')
        close=self.state(seller)['closures'][0]
        self.assertEqual(close['detail']['incomeTotal'],100)
        self.assertEqual(close['detail']['expenseTotal'],30)
        self.assertEqual(close['difference'],0)
        self.action(seller,'cash_movement',400,direction='in',amount=1,reason='Tarde',requestId='late')
        path='/api/closing/'+close['id']
        self.assertEqual(self.request(path,cookie=other)[0],403)
        status,_,report=self.request(path,cookie=accountant)
        self.assertEqual(status,200);self.assertIn(b'&lt;fondo&gt;',report)
        self.action(accountant,'close_review',id=close['id'],physical=expected,note='Verificado')
        self.assertEqual(self.state(seller)['closures'][0]['status'],'Confirmado')

    def test_youtube_url_validation(self):
        for url in ['https://youtu.be/TTu_rks8mUc?t=2','https://www.youtube.com/watch?v=TTu_rks8mUc&list=abc','https://www.youtube.com/shorts/TTu_rks8mUc','https://www.youtube-nocookie.com/embed/TTu_rks8mUc']:
            self.assertEqual(erp.youtube_id(url),'TTu_rks8mUc')
        for url in ['javascript:alert(1)','https://youtube.com.evil.test/watch?v=TTu_rks8mUc','https://youtube.com@evil.test/watch?v=TTu_rks8mUc','https://youtube.com/playlist?list=abc','https://youtube.com/watch?v=bad','https://evil.test/TTu_rks8mUc']:
            with self.assertRaises(ValueError): erp.youtube_id(url)
    def test_trailers_permissions_publication_and_order(self):
        manager=self.login('gerencia'); accountant=self.login('contabilidad')
        body=dict(title='Robot salvaje',url='https://youtu.be/TTu_rks8mUc',position=2,published='yes')
        self.action(accountant,'trailer_save',400,**body)
        first=self.action(manager,'trailer_save',**body)['trailer']
        self.action(manager,'trailer_save',400,**body)
        self.action(manager,'trailer_save',title='Otro tráiler',url='https://youtu.be/abcdefghijk',position=1,published='yes')
        self.action(manager,'trailer_save',branch='Sucre',**body)
        code,_,raw=self.request('/api/public/trailers'); self.assertEqual(code,200); public=json.loads(raw)
        self.assertEqual(len(public['trailers']),2); self.assertEqual(public['trailers'][0]['position'],1)
        self.assertEqual(set(public['trailers'][0]),{'id','title','videoId','position'})
        self.assertNotIn('trailers',self.state(accountant))
        self.action(manager,'trailer_save',id=first,**dict(body,published='no'))
        self.assertEqual(len(json.loads(self.request('/api/public/trailers')[2])['trailers']),1)
        self.action(manager,'trailer_save',branch='Sucre',id=first,**body,expected_status=400)
        self.assertEqual(self.request('/api/public/trailers?branch=unknown')[0],400)
    def test_legacy_state_without_trailers(self):
        with erp.connect() as db:
            state=erp.seed();state.pop('trailers');db.execute('UPDATE state SET body=?',(json.dumps(state),))
        self.assertEqual(json.loads(self.request('/api/public/trailers')[2])['trailers'],[])
        self.action(self.login('gerencia'),'trailer_save',title='Prueba',url='https://youtu.be/TTu_rks8mUc',position=1,published='yes')
        self.assertEqual(len(json.loads(self.request('/api/public/trailers')[2])['trailers']),1)
    def test_auth_and_scope(self):
        self.assertEqual(self.request('/api/state')[0],401)
        self.assertEqual(self.request('/api/login',dict(username='gerencia',password='bad'))[0],401)
        cookie=self.login('admin.potosi'); state=self.state(cookie)
        self.assertTrue(all(p['branch']=='Potosí' for p in state['products']))
        self.action(cookie,'show',400)
        self.action(cookie,'report',400,branch='Sucre')
        self.assertEqual(self.request('/erp.sqlite3')[0],404)
    def test_sale_closure_and_physical_validation(self):
        candy=self.login('candy.potosi'); accountant=self.login('contabilidad'); p=self.state(accountant)['products'][0]
        self.action(candy,'sell',item=p['id'],quantity=2)
        self.assertNotIn('stock',self.state(candy)['products'][0])
        self.assertEqual(self.state(accountant)['products'][0]['stock'],p['stock']-2)
        self.action(candy,'sell',400,item=p['id'],quantity='NaN')
        self.action(candy,'sell',400,item=p['id'],quantity=1000)
        self.action(candy,'close',physical=130)
        close=self.state(candy)['closures'][0]; self.assertEqual(close['expected'],136)
        self.action(candy,'sell',400,item=p['id'],quantity=1)
        self.action(accountant,'close_review',id=close['id'],physical=130,note='Faltan 6 BOB')
        self.assertEqual(self.state(candy)['closures'][0]['status'],'Observado')
        self.action(accountant,'close_review',id=close['id'],physical=136,note='Conteo corregido y verificado')
        self.assertEqual(self.state(candy)['closures'][0]['status'],'Confirmado')
    def test_inventory_approval(self):
        admin=self.login('admin.potosi'); accountant=self.login('contabilidad'); p=next(p for p in self.state(admin)['products'] if p['kind']=='vault')
        self.action(admin,'report',item=p['id'],quantity=5,direction='in',reason='Recepción de prueba')
        self.assertEqual(next(x for x in self.state(admin)['products'] if x['id']==p['id'])['stock'],p['stock'])
        report=self.state(admin)['reports'][0]
        self.action(accountant,'audit_start',400,kind='vault')
        self.action(accountant,'review',id=report['id'],status='Aprobado',note='Verificado')
        self.assertEqual(next(x for x in self.state(admin)['products'] if x['id']==p['id'])['stock'],p['stock']+5)
        self.action(accountant,'review',400,id=report['id'],status='Aprobado',note='Duplicado')
    def test_audit_lock_count_pdf_and_resume(self):
        accountant=self.login('contabilidad'); candy=self.login('candy.potosi'); other=self.login('candy.sucre'); p=self.state(accountant)['products'][0]
        audit_id=self.action(accountant,'audit_start',kind='candy')['audit']
        self.action(accountant,'audit_start',400,kind='candy')
        self.action(candy,'sell',400,item=p['id'],quantity=1)
        self.action(other,'sell',branch='Sucre',item=self.state(other)['products'][0]['id'],quantity=1)
        audit=self.state(accountant)['audits'][0]; self.assertTrue(any(r['system']==0 for r in audit['rows'])); self.assertTrue(any(r['system']<0 for r in audit['rows']))
        code,headers,pdf=self.request('/api/pdf/'+audit_id,cookie=accountant); self.assertEqual(code,200); self.assertTrue(pdf.startswith(b'%PDF-1.4')); self.assertIn(b'Sistema',pdf); self.assertIn(b'Fisico',pdf)
        self.action(accountant,'audit_finish',400,id=audit_id,counts={})
        first=audit['rows'][0]['item']; self.action(accountant,'audit_save',id=audit_id,counts={first:7})
        self.assertEqual(self.state(accountant)['audits'][0]['rows'][0]['physical'],7)
        self.assertEqual(self.state(candy)['products'][0]['stock'],p['stock'])
        self.action(accountant,'audit_finish',id=audit_id,counts={r['item']:7 for r in audit['rows']})
        self.assertTrue(all('stock' not in x for x in self.state(candy)['products']))
        self.assertTrue(all(x['stock']==7 for x in self.state(accountant)['products'] if x['branch']=='Potosí' and x['kind']=='candy'))
        self.action(candy,'sell',item=p['id'],quantity=1)
    def test_concurrent_seat_sales(self):
        first=self.login('boleteria.potosi'); second=self.login('boleteria2.potosi'); show=self.state(first)['shows'][0]
        with erp.connect() as db:
            state=json.loads(db.execute('SELECT body FROM state').fetchone()[0]);state['shows'][0]['capacity']=1;db.execute('UPDATE state SET body=?',(json.dumps(state),))
        body=dict(action='sell',branch='Potosí',item=show['id'],quantity=1)
        with ThreadPoolExecutor(2) as pool: results=list(pool.map(lambda cookie:self.request('/api/action',body,cookie)[0],[first,second]))
        self.assertEqual(sorted(results),[200,400]); self.assertEqual(self.state(second)['availability'][show['id']],0)
    def test_both_inventories_and_programming(self):
        accountant=self.login('contabilidad'); admin=self.login('admin.potosi'); manager=self.login('gerencia')
        room=self.action(manager,'room_save',name='Sala nueva',capacity=12)['room']
        movie=self.state(manager)['movies'][0]['id']
        self.action(manager,'schedule',movieId=movie,roomId=room,date=erp.today(),times='23:00',price=25,days=1)
        audit_id=self.action(accountant,'audit_start',kind='vault')['audit']; p=next(p for p in self.state(admin)['products'] if p['kind']=='vault')
        self.action(admin,'report',400,item=p['id'],quantity=1,direction='out',reason='Bloqueado')
        self.action(accountant,'product',400,kind='vault',name='Nuevo',unit='Unidad',price=5)
        audit=self.state(accountant)['audits'][0]
        self.action(accountant,'audit_finish',id=audit_id,counts={r['item']:0 for r in audit['rows']})
        self.assertTrue(all(p['stock']==0 for p in self.state(admin)['products'] if p['kind']=='vault'))
    def test_polling_persistence_and_logout(self):
        candy=self.login('candy.potosi'); manager=self.login('gerencia'); p=self.state(candy)['products'][0]
        self.action(candy,'sell',item=p['id'],quantity=1)
        self.assertEqual(self.state(manager)['sales'][0]['total'],68)
        with erp.connect() as db: self.assertEqual(len(json.loads(db.execute('SELECT body FROM state').fetchone()[0])['sales']),1)
        self.request('/api/logout',{},candy); self.assertEqual(self.request('/api/state',cookie=candy)[0],401)

    def test_weekly_catalog_and_capacity(self):
        from datetime import date,timedelta
        manager=self.login('gerencia'); seller=self.login('boleteria.potosi')
        room=self.action(manager,'room_save',name='Sala semanal',capacity=2)['room']
        movie=self.action(manager,'movie_save',title='Estreno',poster='https://example.com/poster.jpg',duration=90,genre='Drama',rating='ATP',position=1,published='yes')['movie']
        start=date.fromisoformat(erp.today());start+=timedelta(days=(3-start.weekday())%7)
        args=dict(movieId=movie,roomId=room,date=start.isoformat(),times='14:00, 17:00',price=36,days=7,wednesdayPromo='yes')
        self.assertEqual(self.action(manager,'schedule',**args)['created'],14)
        before=len(self.state(manager)['shows'])
        self.action(manager,'schedule',400,**dict(args,times='12:00, 14:00'))
        self.assertEqual(len(self.state(manager)['shows']),before)
        self.action(manager,'schedule',400,branch='Sucre',**args)
        public=json.loads(self.request('/api/public/catalog')[2])
        shows=[s for s in public['shows'] if s['movieId']==movie]
        self.assertEqual(len(shows),14)
        self.assertEqual([s['price'] for s in shows if s['promo']],[36,36])
        self.action(manager,'show_cancel',id=shows[0]['id'])
        self.assertEqual(len([s for s in json.loads(self.request('/api/public/catalog')[2])['shows'] if s['movieId']==movie]),13)
        self.action(manager,'movie_save',id=movie,title='Estreno',poster='',duration=90,genre='Drama',rating='ATP',position=1,published='no')
        self.assertFalse(any(s['movieId']==movie for s in json.loads(self.request('/api/public/catalog')[2])['shows']))
        self.assertTrue(any(s['movieId']==movie for s in self.state(seller)['shows']))
    def test_wednesday_sale_double_seats(self):
        from unittest.mock import patch
        manager=self.login('gerencia'); seller=self.login('boleteria.potosi')
        room=self.action(manager,'room_save',name='Sala promo',capacity=246)['room']
        movie=self.state(manager)['movies'][0]['id']
        with patch.object(erp,'today',return_value='2030-01-02'):
            self.action(manager,'schedule',movieId=movie,roomId=room,date='2030-01-02',times='12:00',price=35,days=1,wednesdayPromo='yes')
            show=self.state(manager)['shows'][-1]
            self.action(seller,'sell',item=show['id'],quantity=3)
            self.assertEqual(self.state(seller)['sales'][-1]['total'],105)
            self.assertEqual(self.state(seller)['availability'][show['id']],120)
            self.action(seller,'sell',400,item=show['id'],quantity=121)
            self.assertEqual(self.state(seller)['sales'][-1]['seatQuantity'],6)
            self.action(manager,'show_cancel',400,id=show['id'])

    def test_deletion_permissions_and_dependencies(self):
        manager=self.login('gerencia');accountant=self.login('contabilidad')
        trailer=self.action(manager,'trailer_save',title='Temporal',url='https://youtu.be/TTu_rks8mUc',position=1,published='yes')['trailer']
        self.action(accountant,'trailer_delete',400,id=trailer)
        self.action(manager,'trailer_delete',400,branch='Sucre',id=trailer)
        self.action(manager,'trailer_delete',id=trailer)
        self.assertEqual(json.loads(self.request('/api/public/trailers')[2])['trailers'],[])
        show=self.state(manager)['shows'][0]
        self.action(manager,'room_delete',400,id=show['roomId'])
        self.action(manager,'movie_delete',400,id=show['movieId'])
        self.action(manager,'show_delete',id=show['id'])
        self.assertFalse(any(s['id']==show['id'] for s in self.state(manager)['shows']))
        self.action(manager,'room_delete',id=show['roomId'])
        self.action(manager,'movie_delete',id=show['movieId'])
        self.assertFalse(any(m['id']==show['movieId'] for m in json.loads(self.request('/api/public/catalog')[2])['movies']))

    def checkout_fixture(self):
        from datetime import date,timedelta
        day=date.fromisoformat(erp.today())+timedelta(days=7)
        day+=timedelta(days=(2-day.weekday())%7)
        with erp.connect() as db:
            state=json.loads(db.execute('SELECT body FROM state').fetchone()[0])
            for show in state['shows']:
                show.update(date=day.isoformat(),wednesdayPromo=True,capacity=246)
            db.execute('UPDATE state SET body=?',(json.dumps(state),))
        cookie=self.login('boleteria.potosi');shows=self.state(cookie)['shows'][:2]
        return cookie,[dict(item=s['id'],quantity=2,unitPrice=s['basePrice'],seatsPerTicket=2) for s in shows]
    def test_ticket_basket_receipt_and_idempotency(self):
        cookie,lines=self.checkout_fixture()
        order=self.action(cookie,'ticket_checkout',requestId='test-checkout-01',lines=lines,received=200)['order']
        self.assertEqual(order['total'],136);self.assertEqual(order['change'],64)
        self.assertEqual(len(order['lines']),2)
        self.assertEqual(self.state(cookie)['availability'][lines[0]['item']],121)
        self.assertEqual(self.action(cookie,'ticket_checkout',requestId='test-checkout-01',lines=lines)['order']['id'],order['id'])
        self.assertEqual(len(self.state(cookie)['sales']),2)
        code,headers,body=self.request('/api/receipt/'+order['id'],cookie=cookie)
        self.assertEqual(code,200);self.assertIn(b'136.00',body);self.assertIn(b'Imprimir boletos',body)
        self.assertEqual(self.request('/api/receipt/'+order['id'],cookie=self.login('boleteria2.potosi'))[0],403)
        self.assertEqual(self.request('/api/receipt/'+order['id'],cookie=self.login('gerencia'))[0],200)
        self.action(cookie,'close',physical=136)
        self.assertEqual(self.state(cookie)['closures'][0]['expected'],136)
        self.action(cookie,'ticket_checkout',400,requestId='new-after-close',lines=lines)
        self.assertTrue(self.action(cookie,'ticket_checkout',requestId='test-checkout-01',lines=lines)['repeated'])
    def test_ticket_basket_validation_is_atomic(self):
        cookie,lines=self.checkout_fixture()
        for bad in [dict(lines[1],quantity=124),dict(lines[1],quantity=1.5),dict(lines[1],unitPrice=1)]:
            self.action(cookie,'ticket_checkout',400,requestId='invalid-checkout',lines=[lines[0],bad])
            self.assertEqual(self.state(cookie)['sales'],[])
        self.action(cookie,'ticket_checkout',400,requestId='empty-checkout',lines=[])
        self.action(cookie,'ticket_checkout',400,requestId='duplicate-checkout',lines=[lines[0],lines[0]])
        self.action(cookie,'ticket_checkout',400,requestId='cash-short-checkout',lines=lines,received=10)
        other=self.state(self.login('boleteria.sucre'))['shows'][0]
        self.action(cookie,'ticket_checkout',400,requestId='cross-branch-checkout',lines=[dict(lines[0],item=other['id'])])
        self.action(self.login('gerencia'),'ticket_checkout',400,requestId='wrong-role-checkout',lines=lines)
    def test_concurrent_ticket_baskets(self):
        cookie,lines=self.checkout_fixture();second=self.login('boleteria2.potosi')
        lines[0]['quantity']=123
        body=dict(action='ticket_checkout',branch='Potosí',requestId='concurrent-basket',lines=lines)
        with ThreadPoolExecutor(2) as pool: results=list(pool.map(lambda c:self.request('/api/action',body,c)[0],[cookie,second]))
        self.assertEqual(sorted(results),[200,400])
        state=self.state(self.login('gerencia'));self.assertEqual(len(state['sales']),2)
        self.assertEqual(state['availability'][lines[0]['item']],0)
        self.assertEqual(state['availability'][lines[1]['item']],121)

    def test_individual_thermal_tickets_and_print_idempotency(self):
        cookie,lines=self.checkout_fixture()
        with patch.dict(os.environ,{'ERP_PRINT_MODE':'local'}),patch.object(erp.thermal,'printer_name',return_value='EPSON TM-T20III'),patch.object(erp.thermal,'send',return_value=123) as send:
            order=self.action(cookie,'ticket_checkout',requestId='thermal-checkout',lines=lines)['order']
            self.assertEqual(order['printing']['status'],'queued')
            self.action(cookie,'ticket_checkout',requestId='thermal-checkout',lines=lines)
            self.assertEqual(send.call_count,1)
            payload=send.call_args.args[1]
            self.assertEqual(payload.count(b'\x1dVB\x00'),8)
            self.assertEqual(len(list(erp.thermal.tickets(order))),8)
            html=erp.ticketing.receipt(order)
            self.assertEqual(html.count(b'class="ticket"'),8)
            self.assertIn(b'80mm',html)
            self.request('/api/print',{'order':order['id'],'reprint':True},cookie)
            self.assertEqual(send.call_count,2)
            self.assertEqual(self.request('/api/print',{'order':order['id']},self.login('boleteria2.potosi'))[0],400)

if __name__=='__main__': unittest.main(verbosity=2)

