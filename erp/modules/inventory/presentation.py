"""Printable physical count worksheet (including zero/negative system stock)."""
def audit_pdf(audit):
    def esc(s): return str(s).replace('\\','\\\\').replace('(','\\(').replace(')','\\)').encode('cp1252','replace').decode('latin1')
    pages=[]
    for start in range(0,len(audit['rows']),20):
        ops=[]
        def txt(x,y,s,size=10): ops.append(f'BT /F1 {size} Tf {x} {y} Td ({esc(s)}) Tj ET')
        txt(40,790,'UNIVERSAL / ARQUEO DE INVENTARIO',18); txt(40,764,f"{audit['branch']} - {'Candy bar' if audit['kind']=='candy' else 'Boveda de Administracion'}",12)
        txt(40,744,f"Nro. {audit['id']} | {audit['at']} | {audit['user']}",9); txt(40,725,'Conteo fisico manual. Incluye existencias cero y negativas.',9)
        for x,label in [(45,'Producto'),(300,'Unidad'),(370,'Sistema'),(455,'Fisico')]: txt(x,697,label)
        ops.append('40 688 m 555 688 l S')
        for i,row in enumerate(audit['rows'][start:start+20]):
            y=666-i*25; txt(45,y,row['name'][:43],9); txt(300,y,row['unit'][:10],9); txt(380,y,row['system']); ops.append(f'40 {y-9} m 555 {y-9} l S')
        txt(40,115,'Responsable del conteo: __________________________________________'); txt(40,85,'Firma: _______________________    Observaciones: __________________'); txt(40,45,f'Pagina {start//20+1} / {(len(audit["rows"])+19)//20}',9); pages.append('\n'.join(ops).encode('latin1'))
    objects=[b'<< /Type /Catalog /Pages 2 0 R >>',b'',b'<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>']; kids=[]
    for stream in pages:
        n=len(objects)+1; kids.append(f'{n} 0 R'); objects.append(f'<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents {n+1} 0 R >>'.encode()); objects.append(f'<< /Length {len(stream)} >>\nstream\n'.encode()+stream+b'\nendstream')
    objects[1]=f'<< /Type /Pages /Kids [{" ".join(kids)}] /Count {len(pages)} >>'.encode(); body=b'%PDF-1.4\n'; offsets=[0]
    for i,obj in enumerate(objects,1): offsets.append(len(body)); body+=f'{i} 0 obj\n'.encode()+obj+b'\nendobj\n'
    offset=len(body); body+=f'xref\n0 {len(objects)+1}\n0000000000 65535 f \n'.encode()
    for n in offsets[1:]: body+=f'{n:010} 00000 n \n'.encode()
    return body+f'trailer\n<< /Size {len(objects)+1} /Root 1 0 R >>\nstartxref\n{offset}\n%%EOF'.encode()

