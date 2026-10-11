"""Individual payroll PDF report: one validated employee, never a whole payroll."""
from html import escape
from io import BytesIO

from reportlab.lib import colors
from reportlab.lib.enums import TA_CENTER, TA_LEFT, TA_RIGHT
from reportlab.lib.pagesizes import A4
from reportlab.lib.styles import ParagraphStyle
from reportlab.platypus import (
    HRFlowable, KeepTogether, Paragraph, SimpleDocTemplate, Spacer, Table, TableStyle,
)


INK = colors.HexColor("#182f40")
TEAL = colors.HexColor("#087d89")
LIGHT = colors.HexColor("#ecf5f6")
GRAY = colors.HexColor("#556574")


def money(value):
    """Bolivian formatting: Bs 2.133,32."""
    value = f"{float(value):,.2f}"
    return "Bs " + value.replace(",", "_").replace(".", ",").replace("_", ".")


def report(run, employee):
    """Return PDF bytes for a single employee belonging to a validated payroll."""
    if run.get("status") != "Validada" or not isinstance(employee, str) or not employee:
        raise ValueError("Solo pueden enviarse reportes individuales de planillas validadas.")
    matching = [line for line in run.get("lines", []) if line.get("employee") == employee]
    if len(matching) != 1:
        raise ValueError("El reporte debe identificar exactamente a un empleado.")

    line = matching[0]
    normal = ParagraphStyle("Body", fontName="Helvetica", fontSize=9, leading=14,
                            textColor=INK, spaceAfter=7)
    small = ParagraphStyle("Small", parent=normal, fontSize=7.6, leading=11,
                           textColor=GRAY, spaceAfter=5)
    heading = ParagraphStyle("Title", parent=normal, fontName="Helvetica-Bold",
                             fontSize=17, leading=23, textColor=INK, spaceAfter=10)
    section = ParagraphStyle("Section", parent=normal, fontName="Helvetica-Bold",
                             fontSize=11, leading=16, spaceBefore=13, spaceAfter=7)
    strong = ParagraphStyle("Strong", parent=normal, fontName="Helvetica-Bold",
                            fontSize=9, leading=13)
    amount = ParagraphStyle("Amount", parent=normal, fontName="Helvetica-Bold",
                            fontSize=13, leading=18, alignment=TA_RIGHT)
    cell = ParagraphStyle("Cell", parent=normal, fontSize=8, leading=11,
                          spaceAfter=0)
    headcell = ParagraphStyle("HeadCell", parent=cell, fontName="Helvetica-Bold")
    E = lambda x: escape(str(x))

    pdf = BytesIO()
    doc = SimpleDocTemplate(pdf, pagesize=A4, leftMargin=46, rightMargin=46,
                            topMargin=56, bottomMargin=52,
                            title=f'Reporte salarial {run["month"]}',
                            author="Multicine Universal", pageCompression=1)
    width = A4[0] - doc.leftMargin - doc.rightMargin
    story = [
        Paragraph("MULTICINE UNIVERSAL", heading),
        Paragraph("Reporte salarial individual | " + E(run["month"]), strong),
        Paragraph("Sucursal: " + E(run["branch"]) + " | Folio: " + E(run["id"]) +
                  " | Planilla: validada", small),
        HRFlowable(width="100%", thickness=1.5, color=TEAL, spaceAfter=15),
        Paragraph(E(line["name"]), section),
        Paragraph("Cargo: " + E(line["role"]) + " | Código biométrico: " + E(line["code"]), normal),
    ]

    summary = [
        ( "Sueldo mensual de referencia", money(line["base"]) ),
        ( "Días laborables cubiertos", f'{line.get("workedDays",line["days"])} / {line.get("expectedDays","-")}' ),
        ( "Sueldo devengado", money(line.get("earnedBase",line["base"])) ),
        ( "Descuento por atrasos", money(line.get("lateDeduction",0)) ),
        ( "Extras", money(line["extraTotal"]) ),
    ]
    summary_rows = [[Paragraph(E(k), cell), Paragraph(E(v), strong)] for k,v in summary]
    t = Table(summary_rows, colWidths=[width*.69,width*.31], hAlign="LEFT")
    t.setStyle(TableStyle([
        ("BACKGROUND", (0,0), (-1,-1), LIGHT),
        ("TOPPADDING", (0,0), (-1,-1), 8),
        ("BOTTOMPADDING", (0,0), (-1,-1), 8),
        ("LEFTPADDING", (0,0), (-1,-1), 12),
        ("LINEBELOW", (0,0), (-1,-2), .35, colors.HexColor("#d4e6e8")),
        ("VALIGN", (0,0), (-1,-1), "TOP"),
    ]))
    story += [Spacer(1,10), t, Spacer(1,11)]
    total_table = Table([[Paragraph("TOTAL CALCULADO", strong),
                          Paragraph(E(money(line["total"])), amount)]],
                        colWidths=[width*.55,width*.45])
    total_table.setStyle(TableStyle([
        ("BACKGROUND",(0,0),(-1,-1),colors.HexColor("#e3f1ed")),
        ("TOPPADDING",(0,0),(-1,-1),14),
        ("BOTTOMPADDING",(0,0),(-1,-1),14),
        ("LEFTPADDING",(0,0),(-1,-1),12),
        ("RIGHTPADDING",(0,0),(-1,-1),12),
        ("VALIGN",(0,0),(-1,-1),"MIDDLE"),
    ]))
    story.append(total_table)

    def details(title, headings, rows, widths, empty):
        story.append(Paragraph(title, section))
        if not rows:
            story.append(Paragraph(empty, small))
            return
        data = [[Paragraph(E(h), headcell) for h in headings]]
        for row in rows:
            data.append([Paragraph(E(v), cell) for v in row])
        table = Table(data, colWidths=widths, repeatRows=1, hAlign="LEFT")
        table.setStyle(TableStyle([
            ("BACKGROUND",(0,0),(-1,0),LIGHT),
            ("LINEBELOW",(0,0),(-1,0),.7,TEAL),
            ("ROWBACKGROUNDS",(0,1),(-1,-1),[colors.white, colors.HexColor("#f8fafa")]),
            ("TOPPADDING",(0,0),(-1,-1),7),
            ("BOTTOMPADDING",(0,0),(-1,-1),7),
            ("VALIGN",(0,0),(-1,-1),"TOP"),
            ("LINEBELOW",(0,1),(-1,-1),.25,colors.HexColor("#e7ecef")),
        ]))
        story.append(table)

    extras = [
        (x["date"],
         ("Día extra: " if x.get("extraType") == "day" else "Función especial: ") + str(x["reason"]),
         money(x["amount"]))
        for x in line.get("extras", [])
    ]
    details("Detalle de extras", ("Fecha", "Concepto", "Importe"), extras,
            [width*.21,width*.54,width*.25], "No se registraron extras.")

    delays = [
        (x["date"], f'{x["entry"]} | {x["minutes"]} min',
         "Día completo" if x["wholeDay"] else f'{x["hours"]} horas', money(x["amount"]))
        for x in line.get("lateRows", [])
    ]
    details("Detalle de atrasos", ("Fecha","Entrada / atraso","Descuento","Importe"),
            delays,[width*.19,width*.33,width*.23,width*.25],"No se registraron atrasos descontados.")

    story += [
        Spacer(1,12),
        Paragraph(f'Asistencia registrada: {E(line["days"])} días | {E(line["hours"])} horas.', normal),
        Paragraph("Criterio: el sueldo devengado se calcula sobre los días laborables con asistencia válida. "
                  "No se consideran faltas los días de descanso. Los atrasos se descuentan según "
                  "la política configurada, aplicando un solo nivel por jornada. "
                  "Los días sin marcación requieren revisión.", small),
        Paragraph("Este documento es informativo: no acredita una transferencia, "
                  "una liquidación bancaria ni un pago ejecutado.", strong),
    ]

    def footer(canvas, document):
        canvas.saveState()
        canvas.setStrokeColor(colors.HexColor("#d5e1e4"))
        canvas.line(46,37,A4[0]-46,37)
        canvas.setFont("Helvetica",7)
        canvas.setFillColor(GRAY)
        canvas.drawString(46,27,"Multicine Universal | Reporte individual confidencial")
        canvas.drawRightString(A4[0]-46,27,f'Página {document.page}')
        canvas.restoreState()

    doc.build(story, onFirstPage=footer, onLaterPages=footer)
    output = pdf.getvalue()
    if not output.startswith(b"%PDF-"):
        raise RuntimeError("No se generó un documento PDF válido.")
    return output
