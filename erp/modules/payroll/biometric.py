"""Infrastructure adapter for bounded XLSX/CSV/TXT decoding."""
import base64, csv, io, zipfile
from xml.etree import ElementTree as ET
from erp.shared.domain import validation as cinema

def read_file(data):
    name=cinema.text(data.get('filename'),180)
    try:raw=base64.b64decode(data.get('file',''),validate=True)
    except Exception:raise ValueError('Archivo inválido.')
    cinema.check(0<len(raw)<=2_000_000,'El archivo debe pesar entre 1 byte y 2 MB.')
    if name.lower().endswith('.xlsx'):
        ns={'s':'http://schemas.openxmlformats.org/spreadsheetml/2006/main'}
        try:
            with zipfile.ZipFile(io.BytesIO(raw)) as z:
                cinema.check(sum(i.file_size for i in z.infolist())<15_000_000,'El Excel es demasiado grande.')
                strings=[]
                if 'xl/sharedStrings.xml' in z.namelist():
                    strings=[''.join(n.itertext()) for n in ET.fromstring(z.read('xl/sharedStrings.xml')).findall('s:si',ns)]
                sheets=sorted(n for n in z.namelist() if n.startswith('xl/worksheets/sheet') and n.endswith('.xml'))
                cinema.check(bool(sheets),'No hay hojas en el Excel.')
                rows=[]
                for row in ET.fromstring(z.read(sheets[0])).findall('.//s:sheetData/s:row',ns):
                    cells=[]
                    for c in row.findall('s:c',ns):
                        col=0
                        for letter in ''.join(x for x in c.get('r','A') if x.isalpha()):col=col*26+ord(letter.upper())-64
                        cinema.check(col<=100,'Máximo 100 columnas.')
                        while len(cells)<col:cells.append('')
                        v=c.find('s:v',ns);value=v.text if v is not None else ''
                        if c.get('t')=='s':value=strings[int(value)]
                        elif c.get('t')=='inlineStr':value=''.join(c.find('s:is',ns).itertext())
                        cells[col-1]=value or ''
                    rows.append(cells)
        except (zipfile.BadZipFile,ET.ParseError,KeyError,IndexError,TypeError,AttributeError):raise ValueError('No se pudo leer el Excel. Exporta una hoja sencilla o CSV.')
    else:
        cinema.check(name.lower().endswith(('.csv','.txt','.tsv')),'Usa CSV, TXT, TSV o Excel .xlsx.')
        try:text=raw.decode('utf-8-sig')
        except UnicodeDecodeError:text=raw.decode('cp1252')
        try:dialect=csv.Sniffer().sniff(text[:8192],delimiters=',;\t|')
        except csv.Error:dialect=csv.excel
        rows=list(csv.reader(io.StringIO(text),dialect))
    rows=[r for r in rows if any(str(v).strip() for v in r)]
    cinema.check(2<=len(rows)<=10001,'Incluye una cabecera y entre 1 y 10.000 registros.')
    cinema.check(all(len(r)<=100 for r in rows),'Máximo 100 columnas.')
    cinema.check(all(len(str(v))<=1000 for r in rows for v in r),'Una celda supera el tamaño permitido.')
    return name,rows

def decode(data):
    name, rows = read_file(data)
    epoch = "1899-12-30"
    if name.lower().endswith(".xlsx"):
        with zipfile.ZipFile(io.BytesIO(base64.b64decode(data["file"]))) as archive:
            root = ET.fromstring(archive.read("xl/workbook.xml"))
            prop = root.find("{http://schemas.openxmlformats.org/spreadsheetml/2006/main}workbookPr")
            if prop is not None and prop.get("date1904") in ["1", "true"]:
                epoch = "1904-01-01"
    return name, rows, epoch
