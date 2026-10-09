"""Primitive business validation shared by sales, cash and payroll."""
from decimal import Decimal, InvalidOperation, ROUND_HALF_UP

def check(value,message):
    if not value: raise ValueError(message)

def find(state,kind,id):
    item=next((r for r in state[kind] if r['id']==id and not r.get('deleted')),None)
    check(item is not None,'Registro de catálogo no encontrado.');return item

def integer(value,lo=1,hi=2000):
    check(not isinstance(value,bool),'Cantidad inválida.')
    n=float(value);check(n.is_integer() and lo<=n<=hi,'Cantidad fuera de rango.');return int(n)

def text(value,maximum=100):
    s=str(value or '').strip();check(0<len(s)<=maximum,f'Completa el texto (máximo {maximum} caracteres).');return s

def amount(value):
    try: n=Decimal(str(value))
    except InvalidOperation: raise ValueError('Precio inválido.')
    check(n.is_finite() and Decimal('.01')<=n<=100000,'Precio inválido.');return float(n.quantize(Decimal('.01'),rounding=ROUND_HALF_UP))
