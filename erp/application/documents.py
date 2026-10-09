"""Authorized document selection; rendering is supplied through adapters."""
from dataclasses import dataclass
from erp.modules.identity.domain import scoped
from erp.shared.domain.records import require, find


class DocumentMissing(Exception): pass


@dataclass(frozen=True)
class Document:
    content: bytes
    content_type: str = 'text/html; charset=utf-8'
    filename: str | None = None


class Documents:
    def __init__(self, repository, branches, renderers):
        self.repository,self.branches,self.renderers=repository,branches,renderers

    def get(self, kind, record_id, user, employee=None):
        state=self.repository.read()
        if kind=='payroll':
            if user['role']!='accounting': raise PermissionError('Solo Contabilidad puede consultar salarios.')
            row=next((r for r in state.get('payrollRuns',[]) if r['id']==record_id),None)
            if not row: raise DocumentMissing('Planilla no encontrada.')
            return Document(self.renderers[kind](row,employee))
        if kind=='audit':
            require(user['role'] in ['accounting','manager'],'Sin permiso para descargar el arqueo.')
            row=find(state,'audits',record_id)
            scoped(user,row['branch'],self.branches)
            return Document(self.renderers[kind](row),'application/pdf',f'arqueo-{row["id"]}.pdf')
        collection={'candy':'candyOrders','closing':'closures','ticket':'orders'}[kind]
        row=next((r for r in state.get(collection,[]) if r['id']==record_id),None)
        privileged=user['role'] in ['manager','accounting']
        allowed=False
        if row:
            if kind=='candy': allowed=privileged or user['role'] in ['candy','administrator'] and row['branch']==user['branch']
            if kind=='closing': allowed=privileged or row['user']==user['id'] or user['role']=='administrator' and row['branch']==user['branch']
            if kind=='ticket': allowed=privileged or user['role']=='ticketing' and row['user']==user['id'] and row['branch']==user['branch']
        if not allowed:
            raise PermissionError({'candy':'No tienes acceso a este recibo.','closing':'No tienes acceso a este cierre.','ticket':'No tienes acceso a este comprobante.'}[kind])
        return Document(self.renderers[kind](row))
