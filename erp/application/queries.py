"""Role-filtered read models, excluding private operational data."""
from erp.modules.catalog import domain as cinema
from erp.modules.inventory.domain import active

def visible(state,user,*,users,mail_configured):
    output={}
    for collection,rows in state.items():
        if collection=='printJobs': continue
        if collection.startswith('payroll') and user['role']!='accounting':continue
        if collection=='trailers' and user['role']!='manager': continue
        rows=[r for r in rows if not r.get('deleted') and (user['branch'] is None or r['branch']==user['branch'])]
        if user['role'] in ['ticketing','candy']:
            if collection in ['sales','closures','orders','cashMovements','cashOpenings']: rows=[r for r in rows if r['user']==user['id']]
            elif collection=='products': rows=[r for r in rows if r['kind']=='candy'] if user['role']=='candy' else []
            elif collection=='audits': rows=[{k:r[k] for k in ['id','branch','kind','status']} for r in rows if r['kind']=='candy']
            elif collection in ['reports','log']: rows=[]
        if collection=='products' and user['role']=='candy' and not active(state,user['branch'],'candy'):
            rows=[dict({k:v for k,v in r.items() if k!='stock'},available=r['stock']>0) for r in rows]
        if collection=='sales': rows=[r for r in rows if not r.get('voided')]
        if collection in ['candyOrders','candyRequests'] and user['role']=='ticketing':rows=[]
        output[collection]=rows
    if user['role']=='accounting':output['payrollMailConfigured']=mail_configured
    output['availability']={s['id']:cinema.available(state,s) for s in output['shows']}
    output['shows']=[dict(s,price=cinema.price(s),seatsPerTicket=cinema.ticket_seats(s),ticketCapacity=s['capacity']//cinema.ticket_seats(s)) for s in output['shows']]
    output['occupied']={s['id']:[n for sale in state['sales'] if sale['item']==s['id'] for n in sale['seats']] for s in output['shows']}
    output['users']=[{k:u[k] for k in ['id','role','branch']} for u in users.values() if (user['branch'] is None or u['branch']==user['branch']) and (user['role'] not in ['candy','ticketing'] or u['id']==user['id'])]
    return output

