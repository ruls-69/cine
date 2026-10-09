"""Trailer metadata and YouTube URL validation."""
import re
from urllib.parse import urlparse, parse_qs
from erp.shared.domain.records import require, number, text_value, find

def youtube_id(value):
    url=urlparse(str(value or '').strip())
    require(url.scheme in ['http','https'] and not url.username and not url.password,'Introduce un enlace válido de YouTube.')
    host=(url.hostname or '').lower(); parts=url.path.strip('/').split('/')
    if host in ['youtu.be','www.youtu.be'] and len(parts)==1: video=parts[0]
    elif host in ['youtube.com','www.youtube.com','m.youtube.com','youtube-nocookie.com','www.youtube-nocookie.com']:
        video=parse_qs(url.query).get('v',[''])[0] if url.path=='/watch' else (parts[1] if len(parts)==2 and parts[0] in ['embed','shorts','live'] else '')
    else: video=''
    require(bool(re.fullmatch(r'[A-Za-z0-9_-]{11}',video)),'Usa el enlace de un video de YouTube, no el de un canal o una lista.')
    return video


def save(state,user,action,data,branch,*,now,uid):
    result={}
    if action=='trailer_save':
        rows=state.setdefault('trailers',[]); video=youtube_id(data.get('url'))
        require(data.get('published') in ['yes','no'],'Estado de publicación inválido.')
        item=find(state,'trailers',data['id']) if data.get('id') else None
        require(not item or item['branch']==branch,'El tráiler pertenece a otra sucursal.')
        require(not any(t['branch']==branch and t['videoId']==video and not t.get('deleted') and t['id']!=data.get('id') for t in rows),'Este video ya está registrado en la sucursal.')
        values=dict(title=text_value(data.get('title'),80),videoId=video,url='https://www.youtube.com/watch?v='+video,position=number(data.get('position'),1,True),published=data['published']=='yes',updated=now(),editor=user['id'])
        if item: item.update(values)
        else:
            require(len([t for t in rows if t['branch']==branch])<50,'Máximo 50 tráileres por sucursal.')
            item=dict(id=uid(),branch=branch,**values);rows.append(item)
        result={'trailer':item['id']}
    return result
