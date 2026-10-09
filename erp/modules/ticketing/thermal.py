"""Windows RAW spooler adapter for Epson TM-T20III. No browser print dialog."""
import os, ctypes, textwrap, unicodedata
from ctypes import wintypes

from erp.modules.ticketing.admissions import tickets

def spooler():
    if os.name!='nt':raise RuntimeError('La impresión directa necesita Windows y la Epson instalada.')
    dll=ctypes.WinDLL('winspool.drv',use_last_error=True)
    dll.EnumPrintersW.argtypes=[wintypes.DWORD,wintypes.LPWSTR,wintypes.DWORD,wintypes.LPBYTE,wintypes.DWORD,ctypes.POINTER(wintypes.DWORD),ctypes.POINTER(wintypes.DWORD)]
    dll.OpenPrinterW.argtypes=[wintypes.LPWSTR,ctypes.POINTER(wintypes.HANDLE),wintypes.LPVOID]
    dll.StartDocPrinterW.argtypes=[wintypes.HANDLE,wintypes.DWORD,wintypes.LPBYTE];dll.StartDocPrinterW.restype=wintypes.DWORD
    dll.StartPagePrinter.argtypes=[wintypes.HANDLE];dll.EndPagePrinter.argtypes=[wintypes.HANDLE];dll.EndDocPrinter.argtypes=[wintypes.HANDLE];dll.AbortPrinter.argtypes=[wintypes.HANDLE];dll.ClosePrinter.argtypes=[wintypes.HANDLE]
    dll.WritePrinter.argtypes=[wintypes.HANDLE,wintypes.LPVOID,wintypes.DWORD,ctypes.POINTER(wintypes.DWORD)]
    return dll

def printer_name():
    dll=spooler()
    class INFO(ctypes.Structure):_fields_=[('name',wintypes.LPWSTR),('server',wintypes.LPWSTR),('attributes',wintypes.DWORD)]
    needed=wintypes.DWORD();count=wintypes.DWORD()
    dll.EnumPrintersW(6,None,4,None,0,ctypes.byref(needed),ctypes.byref(count))
    if not needed.value:raise RuntimeError('No hay impresoras instaladas. Instala la Epson TM-T20III.')
    buf=ctypes.create_string_buffer(needed.value)
    if not dll.EnumPrintersW(6,None,4,ctypes.cast(buf,wintypes.LPBYTE),needed,ctypes.byref(needed),ctypes.byref(count)):raise ctypes.WinError(ctypes.get_last_error())
    names=[row.name for row in ctypes.cast(buf,ctypes.POINTER(INFO*count.value)).contents]
    configured=os.environ.get('ERP_TICKET_PRINTER','')
    matches=[n for n in names if n==configured] if configured else [n for n in names if 'TM-T20III' in n.upper() and 'TM-T20IIIL' not in n.upper()]
    if len(matches)!=1:raise RuntimeError('Instala la Epson TM-T20III. Si hay varias, configura ERP_TICKET_PRINTER con su nombre exacto.')
    return matches[0]

def raw_bytes(order):
    width=32 if os.environ.get('ERP_TICKET_WIDTH')=='58' else 48
    def text(value,columns=width):
        clean=''.join(c for c in str(value) if c.isprintable())
        clean=unicodedata.normalize('NFKD',clean).encode('ascii','ignore').decode()
        return ('\n'.join(textwrap.wrap(clean,columns))+'\n').encode('ascii')
    payload=bytearray()
    for ticket in tickets(order):
        payload+=b'\x1b@\x1ba\x01\x1bE\x01'+text('MULTICINE UNIVERSAL')+b'\x1bE\x00'+text(order['branch'])
        payload+=text('ENTRADA INDIVIDUAL')+text('='*width)
        payload+=b'\x1bE\x01\x1d!\x11'+text(ticket['title'],width//2)+b'\x1d!\x00\x1bE\x00'
        payload+=text(ticket['date'])+b'\x1d!\x11'+text(ticket['time'],width//2)+b'\x1d!\x00'
        payload+=text(ticket['room']+' / '+ticket['format'])+text('ACCESO PARA 1 PERSONA')+text('-'*width)
        payload+=text('2x1 - Entrada incluida' if ticket['included'] else f'Precio: Bs {ticket["unitPrice"]:.2f}')
        if ticket.get('seatsPerTicket')==2:payload+=text('Promocion 2x1 - mismo precio por par')
        payload+=text(ticket['code'])+text('Cajero: '+order['user'])+text(order['at'][:16].replace('T',' '))+text('Sin butaca numerada')+text('No es factura fiscal' if order.get('production') else 'DEMO - No es factura fiscal')
        payload+=b'\n\n\n\x1dVB\x00'
    return bytes(payload)

def send(name,payload,title):
    dll=spooler();handle=wintypes.HANDLE()
    class DOC(ctypes.Structure):_fields_=[('name',wintypes.LPWSTR),('output',wintypes.LPWSTR),('type',wintypes.LPWSTR)]
    if not dll.OpenPrinterW(name,ctypes.byref(handle),None):raise ctypes.WinError(ctypes.get_last_error())
    job=0
    try:
        doc=DOC(title,None,'RAW');job=dll.StartDocPrinterW(handle,1,ctypes.cast(ctypes.byref(doc),wintypes.LPBYTE))
        if not job:raise ctypes.WinError(ctypes.get_last_error())
        if not dll.StartPagePrinter(handle):raise ctypes.WinError(ctypes.get_last_error())
        written=wintypes.DWORD();buf=ctypes.create_string_buffer(payload)
        if not dll.WritePrinter(handle,buf,len(payload),ctypes.byref(written)) or written.value!=len(payload):raise RuntimeError('Envío incompleto. Revisa la cola de impresión antes de reimprimir.')
        if not dll.EndPagePrinter(handle) or not dll.EndDocPrinter(handle):raise ctypes.WinError(ctypes.get_last_error())
        return job
    except:
        if job:dll.AbortPrinter(handle)
        raise
    finally:dll.ClosePrinter(handle)
