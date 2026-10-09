export function startPublicCatalog(client) {
const q=s=>document.querySelector(s),esc=window.UniversalUI.escape,money=n=>new Intl.NumberFormat('es-BO',{style:'currency',currency:'BOB'}).format(n);
let catalog={movies:[],shows:[]},selectedDate='',week=0,index=0,openMovie='',returnFocus,request=0,carouselPaused=false,catalogSignature='';
const modal=q('.modal');
const branchSelect=q('#public-branch'),initialBranch=new URL(location.href).searchParams.get('branch')||q('#trailer-screen').dataset.initialBranch;
if([...branchSelect.options].some(o=>o.value===initialBranch))branchSelect.value=initialBranch;
const potosiDetails=q('#cinema-details').innerHTML;
function branchInfo(){const name=branchSelect.value;document.querySelectorAll('[data-branch-name]').forEach(el=>el.textContent=name);q('#cinema-description').textContent=name==='Potosí'?'Tu próxima visita a Multicine Universal. Encuentra nuestra ubicación y consulta los horarios de cada película en la cartelera.':'Consulta la cartelera de '+name+' y elige tu próxima función. Los datos de ubicación y contacto de esta sucursal se publicarán próximamente.';q('#cinema-details').innerHTML=name==='Potosí'?potosiDetails:'<div><span>SUCURSAL</span><strong>'+esc(name)+', Bolivia</strong></div><div><span>UBICACIÓN Y CONTACTO</span><strong>Próximamente</strong></div>';q('#cinema-map').hidden=name!=='Potosí';q('.cinema-photo').hidden=name!=='Potosí';q('.cinema-info').classList.toggle('branch-contact-pending',name!=='Potosí');}

function day(offset){const d=new Date(catalog.today+'T12:00');d.setDate(d.getDate()+offset);return d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');}
function dates(){q('#catalog-month').textContent=q('#public-branch').value+' · '+new Date(selectedDate+'T12:00').toLocaleDateString('es-BO',{month:'long'});q('.date-picker').innerHTML='<button class="date-arrow" data-week="-1" '+(week===0?'disabled':'')+' aria-label="Semana anterior">←</button>'+Array.from({length:7},(_,i)=>{const iso=day(week*7+i),d=new Date(iso+'T12:00');return '<button class="date-card '+(iso===selectedDate?'selected':'')+'" data-date="'+iso+'" aria-pressed="'+(iso===selectedDate)+'"><small>'+d.toLocaleDateString('es-BO',{weekday:'short'})+'</small><strong>'+d.getDate()+'</strong>'+(iso===catalog.today?'<b>HOY</b>':'')+'</button>';}).join('')+'<button class="date-arrow" data-week="1" aria-label="Semana siguiente">→</button>';}
function carousel(){const cards=[...document.querySelectorAll('.movie-card')],n=cards.length;cards.forEach((c,i)=>{let o=i-index;if(o>Math.floor(n/2))o-=n;if(o<-Math.floor(n/2))o+=n;c.className='movie-card '+(o===0?'position-center':o===-1?'position-left':o===1?'position-right':'is-hidden');c.inert=Math.abs(o)>1;c.setAttribute('aria-hidden',String(Math.abs(o)>1));});q('.carousel-progress span').style.width=n?((index+1)/n*100)+'%':'0';q('#carousel-position').textContent=n?String(index+1).padStart(2,'0')+' / '+String(n).padStart(2,'0'):'';document.querySelectorAll('.carousel-arrow').forEach(b=>b.disabled=n<2);}
function cards(){
 const featured=catalog.movies[0],feature=q('#featuredMovie');feature.hidden=!featured;if(featured){feature.dataset.movie=featured.id;feature.innerHTML='<span><small>En cartelera</small>'+esc(featured.title)+'</span><span aria-hidden="true">↗</span>';}
 const todayShows=catalog.shows.filter(show=>show.date===selectedDate);
 q('#catalog-summary').textContent=todayShows.length?`${todayShows.length} funciones en ${branchSelect.value} · Selecciona una película`:'Sin funciones para este día. Consulta otra fecha para ver los próximos horarios.';
 q('.movie-track').innerHTML=catalog.movies.map(m=>`<article class="movie-card" data-id="${esc(m.id)}"><button class="poster-click" data-movie="${esc(m.id)}" aria-label="Horarios de ${esc(m.title)}">${m.poster?`<img src="${esc(m.poster)}" alt="" loading="lazy" width="240" height="360">`:`<span class="poster-empty">${esc(m.title)}</span>`}</button><div class="movie-copy"><h3>${esc(m.title)}</h3><p>${esc(m.genre)}</p><div class="poster-info"><span>${esc(m.rating)}</span><span>${m.duration} min</span></div><span class="movie-count">${catalog.shows.filter(show=>show.movieId===m.id&&show.date===selectedDate).length} funciones</span><button class="showtime-trigger" data-movie="${esc(m.id)}">Ver horarios <span aria-hidden="true">→</span></button></div></article>`).join('')||'<p class="catalog-empty">Pronto anunciaremos la cartelera de esta sucursal.</p>';
 index=Math.min(index,Math.max(0,catalog.movies.length-1));carousel();window.UniversalUI.enhance(q('.movie-track'));
}
function fillModal(){const m=catalog.movies.find(m=>m.id===openMovie);if(!m)return closeModal();q('#modal-title').textContent=m.title;q('.modal-film').innerHTML=(m.poster?`<img src="${esc(m.poster)}" alt="Póster de ${esc(m.title)}">`:'')+`<p>${esc(m.genre)}<br>${m.duration} min · ${esc(m.rating)}</p>`;window.UniversalUI.enhance(q('.modal-film'));q('.modal-subtitle').textContent=q('#public-branch').value+' · '+new Date(selectedDate+'T12:00').toLocaleDateString('es-BO',{weekday:'long',day:'numeric',month:'long'});const availableDates=[...new Set([selectedDate,...catalog.shows.filter(show=>show.movieId===openMovie).map(show=>show.date)])].sort();q('.modal-date-picker').innerHTML=`<label>Fecha de la función<select id="modalDate">${availableDates.map(date=>`<option value="${esc(date)}" ${date===selectedDate?'selected':''}>${new Date(date+'T12:00').toLocaleDateString('es-BO',{weekday:'long',day:'numeric',month:'long'})}</option>`).join('')}</select></label>`;q('.public-functions').innerHTML=catalog.shows.filter(s=>s.movieId===openMovie&&s.date===selectedDate).map(s=>'<article><div><strong>'+s.time+'</strong><small>'+esc(s.room)+' · '+s.format+'</small></div><div><b>'+money(s.price)+'</b><small>'+(s.promo?'2×1: dos butacas por boleto · ':'')+(s.available?s.available+' boletos disponibles':'Agotada')+'</small></div></article>').join('')||'<p>No hay funciones programadas para esta fecha. Elige otro día de la cartelera.</p>';}
function backgroundInert(value){document.querySelectorAll('.site-header,main,.site-footer').forEach(node=>node.inert=value);}
function closeModal(){const wasOpen=modal.classList.contains('open');backgroundInert(false);modal.classList.remove('open');modal.setAttribute('aria-hidden','true');modal.inert=true;document.body.style.overflow='';openMovie='';if(wasOpen)(returnFocus?.isConnected?returnFocus:q('.date-card.selected'))?.focus({preventScroll:true});}
function catalogFocus(){
 const active=document.activeElement;
 if(active.id==='modalDate')return '#modalDate';
 if(active.id==='featuredMovie')return '#featuredMovie';
 for(const key of ['date','week','movie'])if(active.dataset[key]){
  const type=active.classList.contains('poster-click')?'.poster-click':active.classList.contains('showtime-trigger')?'.showtime-trigger':'';
  return `${type}[data-${key}="${CSS.escape(active.dataset[key])}"]`;
 }
 return '';
}
function resetCatalog(){
 catalog={movies:[],shows:[]};catalogSignature='';q('#featuredMovie').hidden=true;
 q('.date-picker').innerHTML='';q('#catalog-month').textContent=branchSelect.value+' · Cartelera';
 q('#catalog-summary').textContent='Consultando horarios de esta sucursal…';
 q('.movie-track').innerHTML='<div class="catalog-loading" role="status">Cargando cartelera…</div>';carousel();
}
async function load(){
 branchInfo();const version=++request;q('.movie-track').setAttribute('aria-busy','true');
 try{
  const data=await client.catalog(branchSelect.value);if(version!==request)return;
  const signature=JSON.stringify(data);if(signature===catalogSignature)return;
  const focus=catalogFocus();catalog=data;catalogSignature=signature;
  if(!selectedDate||selectedDate<catalog.today)selectedDate=catalog.today;
  dates();cards();if(openMovie)fillModal();
  if(focus)q(focus)?.focus({preventScroll:true});
 }catch{
  if(version!==request)return;catalogSignature='';q('#featuredMovie').hidden=true;
  q('#catalog-summary').textContent='No pudimos actualizar los horarios. Vuelve a intentarlo.';
  q('.movie-track').innerHTML='<div class="catalog-empty" role="status"><p>No pudimos cargar la cartelera.</p><button id="catalogRetry" type="button">Reintentar</button></div>';
  if(openMovie)q('.public-functions').textContent='No pudimos actualizar la disponibilidad.';
 }finally{if(version===request)q('.movie-track').setAttribute('aria-busy','false');}
}
document.addEventListener('click',e=>{const b=e.target.closest('button');if(!b)return;if(b.id==='catalogRetry'){load();return;}if(b.dataset.date){selectedDate=b.dataset.date;dates();cards();}if(b.dataset.week){week=Math.max(0,week+Number(b.dataset.week));selectedDate=day(week*7);dates();cards();}if(b.dataset.movie){returnFocus=b;openMovie=b.dataset.movie;fillModal();modal.inert=false;backgroundInert(true);modal.classList.add('open');modal.setAttribute('aria-hidden','false');carouselPaused=true;document.body.style.overflow='hidden';q('.modal-close').focus();}if(b.matches('.carousel-arrow,.hero-next')&&catalog.movies.length){carouselPaused=true;index=(index+(b.classList.contains('prev')?-1:1)+catalog.movies.length)%catalog.movies.length;carousel();}if(b.matches('.hero-next'))q('#cartelera').scrollIntoView({behavior:matchMedia('(prefers-reduced-motion: reduce)').matches?'instant':'smooth'});});
document.querySelectorAll('[data-close-modal]').forEach(b=>b.addEventListener('click',closeModal));document.addEventListener('keydown',e=>{if(modal.classList.contains('open')){if(e.key==='Escape')closeModal();if(e.key==='Tab'){const nodes=[...modal.querySelectorAll('button:not(:disabled),select,a[href]')],first=nodes[0],last=nodes.at(-1);if(e.shiftKey&&document.activeElement===first){e.preventDefault();last.focus();}else if(!e.shiftKey&&document.activeElement===last){e.preventDefault();first.focus();}}}});q('#public-branch').addEventListener('change',()=>{week=0;selectedDate='';index=0;closeModal();resetCatalog();const url=new URL(location.href);url.searchParams.set('branch',branchSelect.value);history.replaceState(null,'',url);load();});
setInterval(()=>{if(!carouselPaused&&!document.hidden&&!openMovie&&!q('.movie-carousel').matches(':hover')&&!q('.movie-carousel').contains(document.activeElement)&&catalog.movies.length&&!matchMedia('(prefers-reduced-motion: reduce)').matches){index=(index+1)%catalog.movies.length;carousel();}},7000);setInterval(()=>{if(!document.hidden)load();},30000);
q('.menu-button').addEventListener('click',()=>{const open=q('.site-header').classList.toggle('menu-open');q('.menu-button').setAttribute('aria-expanded',open);q('.mobile-nav').inert=!open;});document.querySelectorAll('.mobile-nav a').forEach(a=>a.addEventListener('click',()=>{q('.site-header').classList.remove('menu-open');q('.menu-button').setAttribute('aria-expanded','false');q('.mobile-nav').inert=true;}));
q('.toast button').addEventListener('click',()=>q('.toast').classList.remove('visible'));document.querySelectorAll('.add-combo').forEach(b=>b.addEventListener('click',()=>{q('.toast-text').textContent='Consulta '+b.dataset.combo+', su precio y disponibilidad en Candy bar de '+branchSelect.value+'.';q('.toast').classList.add('visible');setTimeout(()=>q('.toast').classList.remove('visible'),3500);}));load();

window.addEventListener("storage",e=>{if(e.key==="cinema-content-updated")load();});document.addEventListener("visibilitychange",()=>{if(!document.hidden)load();});

modal.inert=true;
document.addEventListener('change',e=>{if(e.target.id==='modalDate'){selectedDate=e.target.value;week=Math.max(0,Math.floor((new Date(selectedDate+'T12:00')-new Date(catalog.today+'T12:00'))/604800000));dates();cards();fillModal();q('#modalDate').focus();}});

document.addEventListener('keydown',e=>{if(e.key==='Escape'&&q('.site-header').classList.contains('menu-open')){q('.site-header').classList.remove('menu-open');q('.menu-button').setAttribute('aria-expanded','false');q('.mobile-nav').inert=true;q('.menu-button').focus();}});

}
