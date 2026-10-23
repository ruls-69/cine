"""Printable blank ticket-counting sheet for Administration.

Contains only published program/price metadata, never realized sales.
"""
from html import escape


def worksheet(branch, day, shows):
    e=lambda value:escape(str(value),quote=True)
    grouped={}
    for item in shows:
        if item.get('branch')!=branch or item.get('date')!=day or item.get('cancelled'):
            continue
        key=(item.get('title',''),item.get('format','2D'),float(item.get('price',0)))
        grouped.setdefault(key,[]).append(item.get('time',''))
    rows=''.join(
        f'<tr><td>{e(title)}</td><td>{e(fmt)}</td><td>{e(price):s}</td>'
        f'<td>{e(", ".join(sorted(times)))}</td><td class="blank"></td><td class="blank"></td></tr>'
        for (title,fmt,price),times in sorted(grouped.items())
    )
    if not rows:rows='<tr><td colspan="6">No hay funciones programadas para esta fecha.</td></tr>'
    return f"""<!doctype html><html lang="es"><head><meta charset="utf-8">
    <title>Control físico de boletería</title><style>
    body{{font:13px Arial,sans-serif;color:#182b39;margin:25px auto;max-width:1100px}}
    header{{border-bottom:3px solid #253b4a;margin-bottom:25px}}
    h1{{font-size:25px}}table{{width:100%;border-collapse:collapse;margin-top:24px}}
    td,th{{border:1px solid #b6c3cb;padding:13px;text-align:left}}
    th{{background:#eef2f4}}.blank{{min-width:90px}}
    .sign{{margin-top:65px;display:flex;justify-content:space-around}}
    button{{padding:12px}}@media print{{@page{{size:A4 landscape;margin:12mm}}
    body{{margin:0}}button{{display:none}}tr{{break-inside:avoid}}}}
    </style></head><body><button onclick="window.print()">Imprimir hoja</button>
    <header><p>MULTICINE UNIVERSAL · CONTROL FÍSICO DE BOLETERÍA</p>
    <h1>Conteo manual de boletos</h1>
    <p>Sucursal: {e(branch)} · Fecha: {e(day)}</p></header>
    <p>Completar a mano la cantidad de boletos y el importe por fila.
    Este documento no contiene ventas registradas ni totales calculados.</p>
    <table><thead><tr><th>Película</th><th>Formato</th><th>Precio (Bs)</th>
    <th>Funciones / horarios</th><th>Boletos vendidos</th><th>Total calculado (Bs)</th></tr></thead>
    <tbody>{rows}</tbody></table>
    <p><strong>Total manual de boletería (Bs):</strong> ______________________</p>
    <p><strong>Observaciones:</strong> ___________________________________________________</p>
    <div class="sign"><p>___________________<br>Responsable de boletería</p>
    <p>___________________<br>Administración</p><p>___________________<br>Contabilidad / Gerencia</p></div>
    </body></html>""".encode("utf-8")
