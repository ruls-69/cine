"""Inventory and stock-count rules for Candy and vault."""
from erp.shared.domain.records import require, number, text_value, find

def active(state,branch,kind): return next((x for x in state['audits'] if x['branch']==branch and x['kind']==kind and x['status']=='En curso'),None)

