"""Movies, rooms, programming and ticket capacity rules."""
from datetime import date, datetime, timedelta
from decimal import Decimal, ROUND_HALF_UP
from urllib.parse import urlparse
import hashlib, secrets, re
from erp.shared.domain.validation import check, find, integer, text, amount

def key(): return secrets.token_hex(6)

def ticket_seats(show): return 2 if show.get('wednesdayPromo') and date.fromisoformat(show['date']).weekday()==2 else 1

def price(show): return float(Decimal(str(show.get('basePrice',show['price']))).quantize(Decimal('.01'),rounding=ROUND_HALF_UP))

def occupied(state,show): return sum(s.get('seatQuantity',s['quantity']) for s in state['sales'] if s['area']=='ticketing' and s['item']==show['id'])

def available(state,show): return max(0,show['capacity']-occupied(state,show))//ticket_seats(show)

def remove(state,branch,kind,data):
    item=find(state,kind,data.get('id'));check(item['branch']==branch,'Registro de otra sucursal.')
    if kind=='shows': check(not sold(state,item['id']),'No puedes borrar una función con ventas registradas.')
    if kind in ['rooms','movies']:
        field='roomId' if kind=='rooms' else 'movieId'
        check(not any(s.get(field)==item['id'] and not s.get('deleted') and not s.get('cancelled') for s in state['shows']),'Primero borra o cancela las funciones asociadas. Los registros con ventas se conservan.')
    item['deleted']=True
    return {'deleted':item['id']}

def sold(state,show_id): return sum(s['quantity'] for s in state['sales'] if s['area']=='ticketing' and s['item']==show_id)

def ensure_catalog(state):
    state.setdefault('rooms',[]);state.setdefault('movies',[])
    posters=['https://images.unsplash.com/photo-1596727147705-61a532a659bd?auto=format&fit=crop&w=900&q=85','https://images.unsplash.com/photo-1489599849927-2ee91cede3ba?auto=format&fit=crop&w=900&q=85','https://images.unsplash.com/photo-1514525253161-7a46d19cd819?auto=format&fit=crop&w=900&q=85']
    for show in state['shows']:
        if not show.get('roomId'):
            room=next((r for r in state['rooms'] if r['branch']==show['branch'] and r['name']==show['room']),None)
            if not room:
                room=dict(id=hashlib.sha256((show['branch']+'room'+show['room']).encode()).hexdigest()[:12],branch=show['branch'],name=show['room'],capacity=show['capacity'],active=True);state['rooms'].append(room)
            show['roomId']=room['id']
        if not show.get('movieId'):
            movie=next((m for m in state['movies'] if m['branch']==show['branch'] and m['title']==show['title']),None)
            if not movie:
                movie=dict(id=hashlib.sha256((show['branch']+'movie'+show['title']).encode()).hexdigest()[:12],branch=show['branch'],title=show['title'],duration=120,genre='Cine',rating='ATP',poster=posters[len(state['movies'])%3],published=True,position=len([m for m in state['movies'] if m['branch']==show['branch']])+1);state['movies'].append(movie)
            show['movieId']=movie['id']
        show.setdefault('duration',120);show.setdefault('format','2D');show.setdefault('basePrice',show['price']);show.setdefault('wednesdayPromo',False)
    return state

def room_save(state,branch,data,today):
    room=find(state,'rooms',data['id']) if data.get('id') else None
    check(not room or room['branch']==branch,'Sala de otra sucursal.')
    name=text(data.get('name'),50);capacity=integer(data.get('capacity'))
    check(not any(r['branch']==branch and r['name'].casefold()==name.casefold() and not r.get('deleted') and r['id']!=data.get('id') for r in state['rooms']),'Ya existe una sala con ese nombre.')
    active=data.get('active','yes')=='yes'
    if room:
        linked=[s for s in state['shows'] if s['roomId']==room['id'] and s['date']>=today and not s.get('cancelled')]
        check(active or not linked,'No puedes desactivar una sala con funciones vigentes.')
        check(all(occupied(state,s)<=capacity for s in linked),'El aforo no puede ser menor que las entradas ya vendidas.')
        room.update(name=name,capacity=capacity,active=active)
        for show in linked: show.update(room=name,capacity=capacity)
    else: room=dict(id=key(),branch=branch,name=name,capacity=capacity,active=active);state['rooms'].append(room)
    return {'room':room['id']}

def movie_save(state,branch,data):
    movie=find(state,'movies',data['id']) if data.get('id') else None
    check(not movie or movie['branch']==branch,'Película de otra sucursal.')
    title=text(data.get('title'),80);poster=str(data.get('poster','')).strip()
    if poster:
        parsed=urlparse(poster);check(len(poster)<=2000 and parsed.scheme=='https' and bool(parsed.hostname) and not parsed.username and not parsed.password,'La imagen debe ser una URL HTTPS válida.')
    check(not any(m['branch']==branch and m['title'].casefold()==title.casefold() and not m.get('deleted') and m['id']!=data.get('id') for m in state['movies']),'Ya existe esta película en la sucursal. Edita su banner.')
    values=dict(title=title,poster=poster,duration=integer(data.get('duration'),1,400),genre=text(data.get('genre'),50),rating=text(data.get('rating'),15),position=integer(data.get('position'),1,999),published=data.get('published')=='yes')
    if movie: movie.update(values)
    else: movie=dict(id=key(),branch=branch,**values);state['movies'].append(movie)
    return {'movie':movie['id']}

def schedule(state,branch,data,today):
    room=find(state,'rooms',data.get('roomId'));movie=find(state,'movies',data.get('movieId'))
    check(room['branch']==branch and movie['branch']==branch,'La sala y película deben pertenecer a la sucursal seleccionada.')
    check(room['active'] and not room.get('deleted') and not movie.get('deleted'),'La sala o película no está disponible.')
    start=date.fromisoformat(str(data.get('date')));check(start.isoformat()>=today,'No puedes programar fechas pasadas.')
    days=integer(data.get('days',1),1,7);check(days in [1,7],'Selecciona un día o siete días.')
    times=[t.strip() for t in str(data.get('times','')).split(',') if t.strip()]
    check(0<len(times)<=10 and len(times)==len(set(times)),'Introduce de 1 a 10 horarios distintos, separados por comas.')
    check(all(re.fullmatch(r'\d{2}:\d{2}',t) for t in times),'Usa horarios HH:MM separados por comas.')
    for t in times: datetime.strptime(t,'%H:%M')
    base=amount(data.get('price'));fmt=data.get('format','2D');check(fmt in ['2D','3D'],'Formato inválido.')
    pending=[];batch=key()
    for day in range(days):
        for t in sorted(times):
            dt=datetime.combine(start+timedelta(days=day),datetime.strptime(t,'%H:%M').time());end=dt+timedelta(minutes=movie['duration']+15)
            for old in state['shows']+pending:
                if old['roomId']!=room['id'] or old.get('cancelled') or old.get('deleted'): continue
                old_start=datetime.fromisoformat(old['date']+'T'+old['time']);old_end=old_start+timedelta(minutes=old.get('duration',120)+15)
                check(not (dt<old_end and old_start<end),f'La sala {room["name"]} está ocupada el {dt.date()} a las {t}. Revisa la duración y los 15 min de limpieza.')
            show=dict(id=key(),branch=branch,movieId=movie['id'],roomId=room['id'],title=movie['title'],room=room['name'],date=dt.date().isoformat(),time=t,duration=movie['duration'],capacity=room['capacity'],basePrice=base,price=base,format=fmt,wednesdayPromo=data.get('wednesdayPromo')=='yes',batch=batch)
            show['price']=price(show);pending.append(show)
    state['shows'].extend(pending);return {'created':len(pending),'batch':batch}

def cancel_show(state,branch,data):
    show=find(state,'shows',data.get('id'));check(show['branch']==branch,'Función de otra sucursal.')
    check(not sold(state,show['id']),'No puedes cancelar una función con entradas vendidas.')
    show['cancelled']=True;return {'cancelled':show['id']}

def public_catalog(state,branch,today):
    movies=sorted([m for m in state['movies'] if m['branch']==branch and m['published'] and not m.get('deleted')],key=lambda m:(m['position'],m['title']))
    ids={m['id'] for m in movies};shows=[]
    for s in state['shows']:
        if s['branch']==branch and s['movieId'] in ids and s['date']>=today and not s.get('cancelled') and not s.get('deleted'):
            row={k:s[k] for k in ['id','movieId','room','date','time','format','capacity','basePrice']};row.update(price=price(s),available=available(state,s),seatsPerTicket=ticket_seats(s),promo=bool(s['wednesdayPromo'] and date.fromisoformat(s['date']).weekday()==2));shows.append(row)
    return {'branch':branch,'today':today,'movies':movies,'shows':sorted(shows,key=lambda s:(s['date'],s['time']))}
