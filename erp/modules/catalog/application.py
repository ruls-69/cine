"""Public catalog queries on a read snapshot; never return private collections."""
from erp.modules.catalog import domain, social
from erp.shared.domain.records import require


class Catalog:
    def __init__(self, repository, branches, today):
        self.repository,self.branches,self.today=repository,branches,today

    def catalog(self, branch):
        require(branch in self.branches,'Sucursal inválida.')
        state=self.repository.read()
        domain.ensure_catalog(state)
        result=domain.public_catalog(state,branch,self.today())
        combos=sorted((r for r in state.get('webCombos',[]) if r.get('branch')==branch and r.get('published') and not r.get('deleted')),key=lambda r:(r['position'],r['id']))
        result['combos']=[{k:r[k] for k in ('id','title','description','price','image','position')} for r in combos]
        result['socialLinks']=social.public_links(state,branch)
        return result

    def trailers(self, branch):
        require(branch in self.branches,'Sucursal inválida.')
        state=self.repository.read()
        rows=sorted((r for r in state.get('trailers',[]) if r['branch']==branch and r['published'] and not r.get('deleted')),key=lambda r:(r['position'],r['id']))
        return {'branch':branch,'trailers':[{k:r[k] for k in ['id','title','videoId','position']} for r in rows]}
