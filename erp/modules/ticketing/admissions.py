"""Expand purchased ticket quantities into individual admissions."""
def tickets(order):
    for line_index,line in enumerate(order['lines'],1):
        people=line.get('seatQuantity',line['quantity'])
        for person in range(people):
            per=line.get('seatsPerTicket',1)
            yield dict(line,code=f'{order["id"]}-{line_index:02}-{person+1:04}',person=person+1,people=people,included=per==2 and person%2==1)
