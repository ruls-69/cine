"""Operational controls: isolated test data; no production I/O or email."""
import itertools
import unittest
from erp.modules.cash import operations as close_operations
from erp.modules.cash.domain import can_sell
from erp.modules.cash.presentation import blind_receipt, report
from erp.modules.inventory import operations as inventory
from erp.modules.ticketing.worksheet import worksheet
from erp.modules.payroll import domain as payroll


class OperationalReformsTests(unittest.TestCase):
    def test_blind_close_archives_movements_and_prints_no_expected_amount(self):
        user={'id':'seller1','role':'ticketing','branch':'Potosí'}
        state={'cashOpenings':[{'id':'opening1','user':'seller1','branch':'Potosí','day':'2026-10-22','closed':False}],
               'closures':[],
               'cashMovements':[{'id':'mov1','user':'seller1','branch':'Potosí','day':'2026-10-22',
                                 'cashSession':'opening1','at':'2026-10-22T10:00:00-04:00','direction':'in',
                                 'total':30,'reason':'Fondo','reference':''}],
               'sales':[{'id':'sale1','user':'seller1','branch':'Potosí','day':'2026-10-22',
                         'cashSession':'opening1','at':'2026-10-22T11:00:00-04:00',
                         'item':'show1','quantity':1,'seatQuantity':1,'total':35,
                         'label':'Película · 11:00','format':'2D','unitPrice':35}],
               'log':[]}
        close_operations.execute(state,user,'close',{'physical':60,'note':'Entrega'},'Potosí',
                                 now=lambda:'2026-10-22T12:00:00-04:00',today=lambda:'2026-10-22',uid=lambda:'closing1')
        closed=state['closures'][0]
        self.assertEqual(closed['expected'],65)
        self.assertEqual(closed['difference'],-5)
        self.assertFalse(can_sell(state,user['id']))
        self.assertEqual(state['cashMovements'][0]['closureId'],'closing1')
        self.assertEqual(state['cashOpenings'][0]['closed'],True)
        receipt=blind_receipt(closed).decode()
        self.assertIn('Bs 60.00',receipt)
        self.assertNotIn('Bs 65.00',receipt)
        self.assertNotIn('Bs -5.00',receipt)
        internal=report(closed).decode()
        self.assertIn('Resumen de funciones por película',internal)
        self.assertIn('Bs 65.00',internal)

    def test_inventory_sku_is_four_digit_unique_by_branch(self):
        seq=iter(range(1,10))
        state={'products':[], 'audits':[], 'reports':[]}
        user={'id':'accountant','role':'accounting','branch':None}
        for name in ('Pipocas pequeñas','Pipocas medianas','Pipocas grandes'):
            inventory.execute(state,user,'product',{'kind':'candy','name':name,'unit':'Unidad','price':10},
                              'Potosí',now=lambda:'2026-10-22',uid=lambda:'product'+str(next(seq)))
        codes=[p['code'] for p in state['products']]
        self.assertEqual(len(set(codes)),3)
        self.assertTrue(all(len(code)==4 and code.isdigit() for code in codes))
        self.assertTrue(all(p['branch']=='Potosí' for p in state['products']))

    def test_admin_sheet_discloses_only_titles_prices_not_revenue(self):
        body=worksheet('Potosí','2026-10-22',[
            {'branch':'Potosí','date':'2026-10-22','title':'Película de prueba',
             'format':'3D','time':'15:00','price':35}]).decode()
        self.assertIn('Película de prueba',body)
        self.assertIn('3D',body)
        self.assertIn('35.0',body)
        self.assertIn('Boletos vendidos',body)
        self.assertNotIn('Total de ventas reales',body)

    def test_authorized_missing_punch_credits_day_without_inventing_time(self):
        employee={'id':'emp1','branch':'Potosí','active':True,'code':'EMP1','name':'Persona de prueba',
                  'role':'Boletería','salary':2400,'email':'','restWeekday':6,'latePolicy':{'enabled':False}}
        state={'payrollEmployees':[employee], 'payrollExtras':[], 'payrollRuns':[],
               'payrollAttendanceCredits':[], 'payrollMail':[]}
        source={'branch':'Potosí','start':'2026-09-01','end':'2026-09-30',
                'headers':['code','date','entry','exit'],
                'rows':[['EMP1','2026-09-02','','17:00']]}
        mapping={'code':'0','date':'1','entry':'2','exit':'3','format':'DMY'}
        before=payroll.calculate(state,source,mapping)
        self.assertIn('2026-09-02',before['lines'][0]['missingDates'])
        state['payrollRuns'].append(dict(id='run1',branch='Potosí',status='Borrador',**before))
        user={'id':'accountant','role':'accounting'}
        payload={'employee':'emp1','month':'2026-09','date':'2026-09-02',
                 'reason':'Incidente biométrico acreditado por supervisor','confirm':'yes'}
        payroll.mutate(state,user,'payroll_attendance_credit',payload,'Potosí','2026-10-22T12:00:00-04:00')
        with self.assertRaises(ValueError):
            payroll.mutate(state,user,'payroll_attendance_credit',payload,'Potosí','2026-10-22T12:00:00-04:00')
        after=payroll.calculate(state,source,mapping)
        self.assertIn('2026-09-02',after['lines'][0]['creditedDates'])
        self.assertEqual(after['lines'][0]['workedDays'],1)
        self.assertEqual(after['lines'][0]['hours'],0)
        self.assertGreater(after['lines'][0]['total'],before['lines'][0]['total'])
        self.assertEqual(after['lines'][0]['attendance'],[])
        credit=state['payrollAttendanceCredits'][0]
        payroll.mutate(state,user,'payroll_attendance_void',
                       {'id':credit['id'],'reason':'Documentación anulada'},'Potosí','2026-10-22T12:10:00-04:00')
        self.assertEqual(payroll.calculate(state,source,mapping)['lines'][0]['workedDays'],0)


if __name__=='__main__':
    unittest.main()
