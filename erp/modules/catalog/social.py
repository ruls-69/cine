"""Validated, per-branch Facebook and TikTok destinations."""
from urllib.parse import urlsplit, urlunsplit
import re
from erp.shared.domain.records import require
HOSTS={'facebook':{'facebook.com','www.facebook.com','m.facebook.com'},'tiktok':{'tiktok.com','www.tiktok.com','m.tiktok.com','vm.tiktok.com','vt.tiktok.com'}}
def social_url(platform,value):
    require(platform in HOSTS and (value is None or isinstance(value,str)),'Enlace no válido.')
    url=(value or '').strip()
    if not url:return ''
    require(len(url)<=2000 and not re.search(r'[\\s\\\\\\x00-\\x1f\\x7f]|%(?:0[0-9a-f]|1[0-9a-f]|7f)',url,re.I),'Enlace inválido.')
    parsed=urlsplit(url)
    host=(parsed.hostname or '').lower()
    require(parsed.scheme=='https' and host in HOSTS[platform] and parsed.username is None and parsed.password is None and parsed.port in (None,443) and parsed.netloc.lower() in (host,host+':443'),'Usa HTTPS oficial de la plataforma.')
    return urlunsplit(('https',host,parsed.path or '/',parsed.query,parsed.fragment))
def save(state,user,data,branch,*,now,uid):
    prepared=[]
    for platform in HOSTS:
        url=social_url(platform,data.get(platform+'Url',''))
        active=data.get(platform+'Published','no')
        require(active in ('yes','no'),'Estado inválido.')
        prepared.append(dict(platform=platform,url=url,published=bool(url and active=='yes')))
    rows=state.setdefault('webSocialLinks',[])
    for value in prepared:
        matches=[row for row in rows if row.get('branch')==branch and row.get('platform')==value['platform']]
        row=matches[0] if matches else dict(id=uid(),branch=branch)
        row.update(**value,updated=now(),editor=user['id'])
        rows[:]=[old for old in rows if old not in matches]
        rows.append(row)
    return {'socialLinksSaved':True}
def public_links(state,branch):
    result=[]
    for platform in HOSTS:
        row=next((r for r in state.get('webSocialLinks',[]) if r.get('branch')==branch and r.get('platform')==platform and r.get('published') and not r.get('deleted')),None)
        if not row:continue
        try:url=social_url(platform,row.get('url'))
        except (ValueError,KeyError):continue
        if url:result.append(dict(platform=platform,url=url))
    return result
