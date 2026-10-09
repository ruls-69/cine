"""Validation for operational records; preserves existing error contracts."""
def require(ok,message):
    if not ok: raise ValueError(message)


def number(value,minimum=0,integer=False):
    import math
    require(not isinstance(value,bool),'Cantidad inválida.'); n=float(value)
    require(math.isfinite(n) and minimum<=n<=10000000,'Importe o cantidad fuera de rango.')
    require(not integer or n.is_integer(),'La cantidad debe ser entera.')
    return int(n) if integer else round(n,2)


def text_value(value,limit=120):
    s=str(value or '').strip(); require(0<len(s)<=limit,f'Completa los campos de texto (máximo {limit} caracteres).'); return s


def find(state,collection,key):
    obj=next((x for x in state[collection] if x['id']==key),None); require(obj is not None,'Registro no encontrado.'); return obj

