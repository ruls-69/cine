import { prepareCommand } from './prepare-command.ts';
import { SessionClient } from '../modules/identity/application.ts';
import { createCatalogViews } from '../modules/catalog/presentation.js';
import { createInventoryViews } from '../modules/inventory/presentation.js';
import { createCashViews } from '../modules/cash/presentation.js';
import { createOperationsViews } from '../modules/operations/presentation.js';
import { createTicketingController } from '../modules/ticketing/presentation.js';
import { createCandyController } from '../modules/candy/presentation.js';
import { createPayrollController } from '../modules/payroll/presentation.js';

const demoMode=window.ERP_CONFIG?.production===false;
const $=s=>document.querySelector(s);
const esc=window.UniversalUI.escape;
const money=n=>new Intl.NumberFormat('es-BO',{style:'currency',currency:'BOB'}).format(n||0);
const roles={manager:'Dueño / Gerencia',accounting:'Contabilidad',administrator:'Administración',ticketing:'Boletería',candy:'Candy bar'};
const kinds={candy:'Candy bar',vault:'Bóveda de Administración'};
const menus={manager:['overview','shows','trailers','inventory','audits','closures','history'],accounting:['overview','payroll','inventory','reports','audits','closures','history'],administrator:['overview','inventory','reports','closures','history'],ticketing:['pos','closures'],candy:['pos','inventory','closures']};
const titles={payroll:'Salarios y biométrico',trailers:'Cartelera y tráileres',overview:'Panorama de operación',shows:'Programación de funciones',inventory:'Inventarios',reports:'Reportes de movimientos',audits:'Arqueos de inventario',closures:'Cierres de caja',history:'Historial de operaciones',pos:'Punto de venta'};
let model,page,branch='Todas',kind='candy',selected='',selectedAudit='',lastState='',busy=false,dirty=false;
function notify(message,type='success'){const notice=$('#notice');notice.innerHTML=`<span>${esc(message)}</span><button type="button" aria-label="Cerrar aviso" data-notice-dismiss>×</button>`;notice.dataset.type=type;notice.setAttribute('role',type==='error'?'alert':'status');notice.classList.add('visible');clearTimeout(notify.timer);notify.timer=setTimeout(()=>notice.classList.remove('visible'),6000);}
const uiBrand=()=>`<a class="brand" href="index.html" aria-label="Multicine Universal · página pública"><img src="assets/logo-multicine-universal.png" alt=""><span>UNIVERSAL<small>CONTROL DE OPERACIONES</small></span></a>`;
const uiIcons={overview:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',shows:'M4 5h16v16H4z M8 2v6 M16 2v6 M4 11h16',trailers:'M3 5h18v14H3z M10 9l5 3-5 3z',inventory:'M3 7l9-4 9 4-9 4z M3 7v10l9 4 9-4V7 M12 11v10',reports:'M6 3h12v18H6z M9 8h6 M9 12h6 M9 16h3',audits:'M8 5H4v16h16V5h-4 M8 3h8v4H8z M8 13l3 3 5-6',closures:'M3 6h18v14H3z M3 10h18 M15 15h3',history:'M4 6v5h5 M4 11a8 8 0 1 1 2 7 M12 7v5l3 2',payroll:'M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2 M9 11a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M18 8v6 M15 11h6',pos:'M3 7h18v4a2 2 0 0 0 0 4v4H3v-4a2 2 0 0 0 0-4z M15 7v12'};
const uiIcon=name=>`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${uiIcons[name]||uiIcons.overview}"/></svg>`;
const pageHelp={overview:'Lo que está pasando hoy en tu sucursal.',shows:'Organiza la semana, las salas y cada horario.',trailers:'Elige lo que verá el público en la web de esta sucursal.',inventory:'Consulta las existencias y registra los movimientos de tu área.',reports:'Revisa los movimientos antes de actualizar las existencias.',audits:'Compara el conteo físico con las existencias del sistema.',closures:'Revisa los movimientos, cuenta el efectivo y registra la entrega.',history:'Consulta quién registró cada operación y cuándo.',payroll:'Asistencia, extras y salarios del equipo.',pos:'Todo listo para atender la siguiente venta.'};
let scheduleWeek='',inventoryQuery='',inventoryStock='all';

function uiDialogButton(id,title,body,label,primary=false){return `<button type="button" data-ui-dialog="${esc(id)}" data-dialog-title="${esc(title)}" class="${primary?'primary':''}">${label}</button><template id="${esc(id)}">${body}</template>`;}
function openUIDialog(button){const source=document.getElementById(button.dataset.uiDialog);if(!source)return;const dialog=document.createElement('dialog');dialog.className='cash-dialog editor-dialog';dialog.setAttribute('aria-labelledby','editorTitle');dialog.innerHTML=`<div class="panel-head"><div><p class="eyebrow">${esc(branch)} · ${esc(roles[model.user.role])}</p><h2 id="editorTitle">${esc(button.dataset.dialogTitle)}</h2></div><button type="button" data-cash-dismiss="yes" aria-label="Cerrar ventana">✕</button></div>`;const body=document.createElement('div');body.className='dialog-body';body.append(source.content.cloneNode(true));dialog.append(body);$('#root').append(dialog);dialog.showModal();schedulePreview();dialog.addEventListener('close',()=>{dirty=false;dialog.remove();button.focus();});}
const sessionClient=new SessionClient((url,init)=>fetch(url,init),()=>{model=null;login();});
const api=(path,data)=>sessionClient.request(path,data);
function demoLoginOptions(){return `<details open><summary>Explorar las áreas de la demo</summary><p class="muted">Contraseña de prueba: <strong>Cine2026!</strong></p><div class="demo-accounts">${[['gerencia','Gerencia','overview'],['contabilidad','Contabilidad','payroll'],['admin.potosi','Administración','inventory'],['boleteria.potosi','Boletería','pos'],['candy.potosi','Candy bar','closures']].map(([u,label,icon])=>`<button data-account="${u}">${uiIcon(icon)}<span>${label}<small>${u}</small></span></button>`).join('')}</div><p class="muted small">Para otras sucursales usa .sucre o .oruro. Segundos vendedores: boleteria2 y candy2 por sucursal.</p></details><p class="demo-label">DEMO LOCAL · Tus datos de prueba se conservan.</p>`;}
function login(){$('#root').innerHTML=`<main class="login" id="main-content" tabindex="-1"><section class="intro">${uiBrand()}<div class="intro-copy"><p class="eyebrow">EL CINE EMPIEZA CON TU EQUIPO</p><h1>Una gran experiencia.<br><em>Detrás de cada función.</em></h1><p>Ventas, personas y operación, conectadas en un espacio pensado para tu día a día.</p><div class="login-stats"><span><strong>03</strong>Sucursales</span><span><strong>05</strong>Áreas de trabajo</span></div></div><small class="muted">MULTICINE UNIVERSAL · CONTROL DE OPERACIONES</small></section><section class="login-card"><p class="eyebrow">BIENVENIDO</p><h2>Entra a tu espacio</h2><p class="muted">Usa tu cuenta para continuar con tu equipo.</p><form id="loginForm"><label>Usuario<input name="username" autocomplete="username" value="${demoMode?'gerencia':''}" required></label><label>Contraseña<input name="password" type="password" autocomplete="current-password" value="${demoMode?'Cine2026!':''}" required></label><button class="primary">Entrar al sistema →</button></form>${demoMode?demoLoginOptions():''}</section></main>`;}
const list=collection=>model.state[collection].filter(x=>branch==='Todas'||x.branch===branch);
const badge=status=>`<span class="badge ${['Confirmado','Aprobado','Finalizado','Enviado','Caja abierta','Publicado'].includes(status)?'good':['Observado','En curso','Pendiente','Pendiente de envío'].includes(status)?'warn':['Rechazado','Anulado','Error'].includes(status)?'bad':''}">${esc(status)}</span>`;
const empty=window.UniversalUI.empty;
const table=window.UniversalUI.table;
const field=(label,name,type='text',value='',extra='')=>`<label>${label}<input name="${name}" type="${type}" value="${esc(value)}" ${extra} required></label>`;
const productOptions=()=>list('products').filter(p=>p.kind===kind).map(p=>`<option value="${p.id}">${esc(p.code)} · ${esc(p.name)}</option>`).join('');
const specific=()=>branch!=='Todas';
const branchHint=()=>'<div class="banner">Selecciona una sucursal en la parte superior para registrar operaciones.</div>';
function branchChooser(){
 $('#root').innerHTML=`<main class="branch-chooser" id="main-content" tabindex="-1"><div class="chooser-top">${uiBrand()}<button id="logout">Cerrar sesión ↗</button></div><section><p class="eyebrow">${esc(roles[model.user.role])}</p><h1>Elige tu sucursal</h1><p class="muted">Un espacio para cada cine. ¿Dónde trabajarás hoy?</p><div class="branch-cards">${model.branches.map((b,i)=>`<button data-enter-branch="${esc(b)}"><span class="branch-symbol">${uiIcon('inventory')}<small>0${i+1}</small></span><strong>${esc(b)}</strong><span>Gestionar sucursal <b>→</b></span></button>`).join('')}</div><p class="muted small">Puedes cambiar de sucursal desde la cabecera cuando lo necesites.</p></section></main>`;
}
function resetBranchSelection(value){scheduleWeek='';inventoryQuery='';inventoryStock='all';branch=value;page='overview';selected='';selectedAudit='';kind='candy';refreshView();window.scrollTo(0,0);}
function render(){
 if(!model)return login();const user=model.user;if(page==='inventory'&&!candyAuditVisible())page='pos';if(['manager','accounting'].includes(user.role)&&!model.branches.includes(branch))return branchChooser();if(!menus[user.role].includes(page))page=menus[user.role][0];
 const title=user.role==='candy'&&page==='pos'?'Ventas de Candy bar':titles[page];
 $('#root').innerHTML=`<div class="shell"><aside id="workspaceNav"><div class="sidebar-top">${uiBrand()}<button id="menuToggle" aria-expanded="false" aria-controls="areaNav" aria-label="Abrir menú de áreas">☰</button></div><p class="nav-label">OPERACIONES</p><nav id="areaNav" aria-label="Áreas de trabajo">${menus[user.role].filter(p=>p!=='inventory'||candyAuditVisible()).map(p=>`<button data-page="${p}" class="${page===p?'active':''}" ${page===p?'aria-current="page"':''}>${uiIcon(p)}<span>${user.role==='candy'&&p==='pos'?'Ventas de Candy bar':titles[p]}</span></button>`).join('')}</nav><details class="profile-menu"><summary><span class="avatar">${user.id[0].toUpperCase()}</span><span><strong>${esc(user.id)}</strong><small>${roles[user.role]}</small></span><span class="profile-chevron">⌄</span></summary><div><a href="index.html?branch=${encodeURIComponent(branch)}" target="_blank" rel="noopener">Ver página del cine ↗</a><button class="logout" id="logout">Cerrar sesión ↗</button></div></details><small class="sidebar-note">MULTICINE UNIVERSAL${demoMode?' · DEMO':''}</small></aside><main class="workspace" id="main-content" tabindex="-1"><header><div><p class="eyebrow">${roles[user.role].toUpperCase()}</p><h1 id="pageTitle" tabindex="-1">${title}</h1><p class="page-help">${pageHelp[page]}</p></div><div class="header-tools"><div class="active-branch"><small>SUCURSAL</small><strong>${esc(branch)}</strong>${['manager','accounting'].includes(user.role)?'<button id="changeBranch">Cambiar ↗</button>':''}</div></div></header><div class="page-caption"><span id="connection" class="live">● Conectado · actualizado</span><span>${new Date(model.today+'T12:00').toLocaleDateString('es-BO',{day:'numeric',month:'long',year:'numeric'})} · BOB</span></div><div id="content" data-view="${page}">${({overview,shows,trailers,inventory,reports,audits,closures,history,pos,payroll}[page])()}</div><footer>Universal Control <span>${demoMode?'Entorno de prueba · Datos guardados en este equipo':'Operación de sucursal · Acceso personal'}</span></footer></main></div>`;
 filterInventory();
}
const deleteButton=(type,item)=>`<button type="button" class="danger" data-delete="${type}" data-id="${item.id}" data-branch="${item.branch}" data-title="${esc(item.title||item.name||'función')}">Borrar ${({room:'sala',movie:'película / banner',trailer:'tráiler',show:'función'})[type]}</button>`;
function payroll(){return features.payrollUI?features.payrollUI.render():'Cargando salarios…';}

function pos(){
 if(model.user.role==='candy'&&features.candyPOS)return features.candyPOS.render();
 if(model.user.role==='ticketing'&&features.ticketPOS)return features.ticketPOS.render();
 const candy=model.user.role==='candy',closed=cashClosed(),locked=candy&&list('audits').some(a=>a.kind==='candy'&&a.status==='En curso');
 const items=candy?list('products').filter(p=>p.kind==='candy'):list('shows').filter(s=>s.date===model.today&&!s.cancelled);const item=items.find(i=>i.id===selected),disabled=closed||locked;
 return `${closed?openingPanel():''}${disabled?`<div class="banner warning">${closed?'Tu caja está cerrada. Abre una nueva caja para vender. Puedes seguir imprimiendo tus cierres.':'Arqueo en curso: ventas bloqueadas por Contabilidad. Se habilitarán al finalizar.'}</div>`:''}<div class="product-grid">${items.map(i=>`<button class="product ${selected===i.id?'selected':''}" data-item="${i.id}" ${disabled?'disabled':''}><span class="product-icon">${candy?'C':'▶'}</span><small>${candy?'CANDY BAR':esc(i.room)+' · '+i.time}</small><h2>${esc(candy?i.name:i.title)}</h2><p>${candy?i.stock+' '+esc(i.unit)+' disponibles':model.state.availability[i.id]+' boletos disponibles'}</p><strong>${money(i.price)}</strong></button>`).join('')||empty('No hay funciones para hoy')}</div>${item?`<section class="panel"><h2>${esc(candy?item.name:item.title)}</h2><form data-action="sell"><input type="hidden" name="item" value="${item.id}">${field('Cantidad de '+(candy?'productos':'entradas'),'quantity','number',1,'min="1" step="1"'+(!candy?` max="${model.state.availability[item.id]}"`:''))}${candy?'':'<p class="muted">'+(item.seatsPerTicket===2?'Miércoles 2×1: cada boleto ocupa dos butacas. ':'')+'Precio por boleto: '+money(item.price)+'</p>'}<div class="actions"><strong id="saleTotal">Total: ${money(item.price)}</strong><button class="primary" ${disabled?'disabled':''}>Confirmar venta →</button></div></form></section>`:''}<section class="panel"><h2>Mis ventas del día</h2>${table(['Hora','Detalle','Cantidad / butacas','Total'],list('sales').filter(s=>s.day===model.today).slice().reverse().map(s=>`<tr><td>${s.at.slice(11,19)}</td><td>${esc(s.label)}</td><td>${s.quantity}${s.seats.length?' · '+s.seats.join(', '):''}</td><td>${money(s.total)}</td></tr>`))}</section>`;
}
function captureViewState(){return {details:[...document.querySelectorAll('#content details')].map(node=>node.open),filters:[...document.querySelectorAll('[data-filter-table]')].map(node=>[node.dataset.filterTable,node.value]),scroll:window.scrollY,menu:$('#workspaceNav')?.classList.contains('menu-open'),profile:$('.profile-menu')?.open};}
function restoreViewState(state){document.querySelectorAll('#content details').forEach((node,i)=>node.open=!!state.details[i]);for(const [target,value] of state.filters){const input=document.querySelector(`[data-filter-table="${target}"]`);if(input){input.value=value;input.dispatchEvent(new Event('input',{bubbles:true}));}}if(state.menu){$('#workspaceNav')?.classList.add('menu-open');$('#menuToggle')?.setAttribute('aria-expanded','true');}if($('.profile-menu'))$('.profile-menu').open=!!state.profile;window.scrollTo(0,state.scroll);}
function refreshView(){dirty=false;render();calculate();schedulePreview();}
async function refresh(force=false){try{if(force)sessionClient.invalidate();const next=await api('state');if(!next){if($('#connection'))$('#connection').textContent='● Conectado · actualizado';return;}const signature=JSON.stringify(next),change=signature!==lastState,changedUser=model?.user?.id!==next.user.id;model=next;if(page==='inventory'&&!candyAuditVisible()){page='pos';force=true;}if(!page||changedUser){features.ticketPOS?.reset();features.candyPOS?.reset();page=menus[model.user.role][0];branch=['manager','accounting'].includes(model.user.role)?'':model.user.branch||'Todas';dirty=false;selected='';}if(force||change){if(model.user.role==='ticketing'&&page==='pos'&&!force&&!changedUser){lastState=signature;features.ticketPOS?.live();if($('#connection'))$('#connection').textContent='● Conectado · cada 2 s';return;}if(!force&&!changedUser&&features.candyPOS?.editing()){if($('#connection'))$('#connection').textContent='● Conectado · venta en preparación';return;}if(!force&&!changedUser&&(dirty||document.querySelector('dialog[open]')||document.activeElement?.closest('form'))){if($('#connection'))$('#connection').textContent='● Datos recibidos · editando';return;}const uiSnapshot=!force&&!changedUser?captureViewState():null;lastState=signature;refreshView();if(uiSnapshot)restoreViewState(uiSnapshot);if(changedUser&&['candy','ticketing'].includes(model.user.role)&&cashClosed()&&list('closures').slice().reverse().find(c=>c.user===model.user.id)?.day<model.today)showOpeningDialog();}else if($('#connection'))$('#connection').textContent='● Conectado · cada 2 s';}catch{if(model&&$('#connection'))$('#connection').textContent='● Sin conexión';}}
const features={};
function viewPort(names){return Object.defineProperties({},Object.fromEntries(names.map(name=>[name,Object.getOwnPropertyDescriptor(context,name)])));}
const context={
get transport(){ return (url,init)=>fetch(url,init); },
get $(){ return $; },
get api(){ return api; },
get badge(){ return badge; },
get branch(){ return branch; }, set branch(value){ branch=value; },
get branchHint(){ return branchHint; },
get cashClosed(){ return cashClosed; },
get deleteButton(){ return deleteButton; },
get empty(){ return empty; },
get esc(){ return esc; },
get candyRequests(){ return ()=>features.candyPOS?.requests()||''; },
get field(){ return field; },
get inventoryQuery(){ return inventoryQuery; }, set inventoryQuery(value){ inventoryQuery=value; },
get inventoryStock(){ return inventoryStock; }, set inventoryStock(value){ inventoryStock=value; },
get kind(){ return kind; }, set kind(value){ kind=value; },
get kinds(){ return kinds; },
get list(){ return list; },
get menus(){ return menus; },
get model(){ return model; }, set model(value){ model=value; },
get money(){ return money; },
get notify(){ return notify; },
get openingPanel(){ return openingPanel; },
get page(){ return page; }, set page(value){ page=value; },
get productOptions(){ return productOptions; },
get refresh(){ return refresh; },
get refreshView(){ return refreshView; },
get roles(){ return roles; },
get scheduleWeek(){ return scheduleWeek; }, set scheduleWeek(value){ scheduleWeek=value; },
get selectedAudit(){ return selectedAudit; }, set selectedAudit(value){ selectedAudit=value; },
get specific(){ return specific; },
get table(){ return table; },
get uiDialogButton(){ return uiDialogButton; }
};
const { shows, schedulePreview, verifyPoster, trailers } = createCatalogViews(viewPort(['$','badge','branch','deleteButton','empty','esc','field','list','model','money','scheduleWeek','table','uiDialogButton']));
const { inventory, reports, audits, calculate, filterInventory, auditFilter, candyAuditVisible } = createInventoryViews(viewPort(['$','badge','branchHint','candyRequests','empty','esc','field','inventoryQuery','inventoryStock','kind','kinds','list','model','money','productOptions','selectedAudit','specific','table','uiDialogButton']));
const { cashClosed, openingPanel, showOpeningDialog, openCashDialog, cashPreview, closures } = createCashViews(viewPort(['$','badge','branch','esc','field','list','model','money','roles','table']));
const { overview, history } = createOperationsViews(viewPort(['badge','branch','empty','esc','list','menus','model','money','roles','table']));
features.ticketPOS = createTicketingController(viewPort(['transport','$','api','branch','cashClosed','esc','list','model','money','notify','openingPanel','page','refresh','refreshView','table']));
features.candyPOS = createCandyController(viewPort(['transport','$','badge','branch','cashClosed','esc','field','list','model','money','notify','openingPanel','page','refresh','refreshView','table']));
features.payrollUI = createPayrollController(viewPort(['$','badge','branch','branchHint','empty','esc','field','model','money','refreshView','specific','table','uiDialogButton']));

$('#root').addEventListener('click',async event=>{
 const button=event.target.closest('button');if(!button)return;
 if(button.dataset.uiDialog){openUIDialog(button);return;}
 if(button.id==='menuToggle'){const open=$('#workspaceNav').classList.toggle('menu-open');button.setAttribute('aria-expanded',String(open));button.setAttribute('aria-label',open?'Cerrar menú de áreas':'Abrir menú de áreas');return;}
 if(button.dataset.week){const d=new Date((scheduleWeek||model.today)+'T12:00');d.setDate(d.getDate()+Number(button.dataset.week||0)*7);scheduleWeek=button.dataset.week==='today'?model.today:d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');refreshView();return;}

 if(button.dataset.openCash){showOpeningDialog();return;}
 if(button.dataset.cashDirection){openCashDialog(button.dataset.cashDirection);return;}
 if(button.dataset.cashVoid){openCashDialog('void',button.dataset.cashVoid,button.dataset.branch);return;}
 if(button.dataset.cashDismiss){const dialog=button.closest('dialog');dirty=false;dialog.close();dialog.remove();return;}
 if(button.dataset.delete){if(busy)return;const type=button.dataset.delete;if(!confirm('¿Borrar '+button.dataset.title+' de '+button.dataset.branch+'? Dejará de aparecer en las listas. Las funciones con ventas no se pueden borrar.'))return;try{busy=true;await api('action',{action:type+'_delete',id:button.dataset.id,branch:button.dataset.branch});try{localStorage.setItem('cinema-content-updated',String(Date.now()));}catch{}await refresh(true);notify('Registro retirado correctamente.');}catch(e){notify(e.message,'error');}finally{busy=false;}return;}
 if(button.dataset.enterBranch&&['manager','accounting'].includes(model?.user.role)){if(model.branches.includes(button.dataset.enterBranch))resetBranchSelection(button.dataset.enterBranch);return;}
 if(button.id==='changeBranch'){resetBranchSelection('');return;}
 if(button.dataset.account){$('#loginForm [name=username]').value=button.dataset.account;$('#loginForm [name=password]').focus();document.querySelectorAll('[data-account]').forEach(b=>b.classList.toggle('selected',b===button));return;}
 if(button.dataset.page){page=button.dataset.page;selected='';refreshView();$('#pageTitle')?.focus({preventScroll:true});window.scrollTo({top:0});return;}
 if(button.dataset.kind){kind=button.dataset.kind;refreshView();return;}
 if(button.dataset.item){selected=button.dataset.item;refreshView();return;}
 if(button.id==='nextThursday'){const d=new Date(model.today+'T12:00');d.setDate(d.getDate()+(4-d.getDay()+7)%7);const f=button.closest('form');f.elements.date.value=d.getFullYear()+'-'+String(d.getMonth()+1).padStart(2,'0')+'-'+String(d.getDate()).padStart(2,'0');f.elements.days.value='7';dirty=true;schedulePreview();return;}
 if(button.id==='logout'){try{await api('logout',{});model=null;sessionClient.invalidate();lastState='';page=null;selected='';login();}catch(e){notify(e.message,'error');}}
});
$('#root').addEventListener('change',e=>{if(e.target.id==='inventoryStock'){inventoryStock=e.target.value;filterInventory();}if(e.target.id==='auditPending'||e.target.classList.contains('count'))auditFilter();if(e.target.id==='branch'){branch=e.target.value;selectedAudit='';refreshView();}if(e.target.id==='auditSelect'){selectedAudit=e.target.value;refreshView();}});
$('#root').addEventListener('input',e=>{if(e.target.id==='inventorySearch'){inventoryQuery=e.target.value;filterInventory();}if(e.target.dataset.filterTable){const query=e.target.value.toLocaleLowerCase('es');document.querySelectorAll('#'+e.target.dataset.filterTable+' tbody tr').forEach(row=>row.hidden=!row.textContent.toLocaleLowerCase('es').includes(query));}e.target.removeAttribute('aria-invalid');e.target.parentElement?.querySelector('.field-error')?.remove();if(e.target.closest('form'))dirty=true;if(e.target.closest('[data-action="close"]'))cashPreview();if(e.target.closest('[data-action="schedule"]'))schedulePreview();if(e.target.classList.contains('count'))calculate();if(e.target.name==='quantity'&&page==='pos'){const p=list(model.user.role==='ticketing'?'shows':'products').find(p=>p.id===selected);if(p&&$('#saleTotal'))$('#saleTotal').textContent='Total: '+money(p.price*Number(e.target.value));}});
$('#root').addEventListener('submit',async e=>{
 e.preventDefault();if(busy)return;const form=e.target;
 try{busy=true;form.querySelector('.form-error')?.remove();if(e.submitter){e.submitter.disabled=true;e.submitter.setAttribute('aria-busy','true');}if(form.id==='loginForm'){await api('login',Object.fromEntries(new FormData(form)));page=null;await refresh(true);return;}
 if(form.dataset.ticketForm||form.dataset.candyForm)return;
 const data=await prepareCommand(form,e.submitter,branch,kind,{confirm,notify,verifyPoster});if(!data)return;
 const result=await api('action',data);if(form.closest('dialog')){const dialog=form.closest('dialog');dialog.close();dialog.remove();}if(result.audit){selectedAudit=result.audit;const a=document.createElement('a');a.href='/api/pdf/'+result.audit;a.download='arqueo.pdf';document.body.append(a);a.click();a.remove();}try{localStorage.setItem('cinema-content-updated',String(Date.now()));}catch{}await refresh(true);notify(result.created?`${result.created} funciones creadas y disponibles en boletería y cartelera.`:'Operación guardada correctamente.');
 }catch(error){notify(error.message,'error');if(form.isConnected){let message=form.querySelector('.form-error');if(!message){message=document.createElement('p');message.className='form-error';message.setAttribute('role','alert');message.tabIndex=-1;form.prepend(message);}message.textContent=error.message;message.focus();}}finally{busy=false;if(e.submitter?.isConnected){e.submitter.disabled=false;e.submitter.removeAttribute('aria-busy');}}

});
$('#root').addEventListener('invalid',e=>{const input=e.target;input.setAttribute('aria-invalid','true');if(input.parentElement.querySelector('.field-error'))return;const error=document.createElement('small');error.className='field-error';error.textContent=input.validationMessage;input.parentElement.append(error);},true);
$('#root').addEventListener('keydown',e=>{if(e.key==='Enter'&&e.target.classList.contains('count')){e.preventDefault();const inputs=[...document.querySelectorAll('.count:not(:disabled)')].filter(input=>!input.closest('tr').hidden),next=inputs[inputs.indexOf(e.target)+1];next?.focus();next?.select();}if(e.key==='Escape'&&$('#workspaceNav')?.classList.contains('menu-open')){$('#workspaceNav').classList.remove('menu-open');$('#menuToggle')?.setAttribute('aria-expanded','false');$('#menuToggle')?.setAttribute('aria-label','Abrir menú de áreas');$('#menuToggle')?.focus();}});
$('#notice').addEventListener('click',event=>{if(event.target.closest('[data-notice-dismiss]')){clearTimeout(notify.timer);$('#notice').classList.remove('visible');}});
login();
refresh();
setInterval(()=>{if(model&&!busy)refresh();},2000);