"""Branch authorization policy; configuration is supplied by composition."""
from erp.shared.domain.records import require

def scoped(user,branch,branches): require(branch in branches and (user['branch'] is None or user['branch']==branch),'No tienes acceso a esta sucursal.')

