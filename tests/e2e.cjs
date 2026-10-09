/* Real HTTP + browser flows against a fresh, disposable database. */
const { chromium } = require('playwright');
const { default: AxeBuilder } = require('@axe-core/playwright');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const root = path.join(__dirname, '..');
const stamp = Date.now();
const port = Number(process.env.ERP_UI_PORT || 8771);
const base = `http://127.0.0.1:${port}`;
const output = process.env.ERP_UI_ARTIFACTS || path.join(root, 'tmp', `ui-artifacts-${stamp}`);
fs.mkdirSync(output, { recursive: true });
const environment = { ...process.env, ERP_ENV: 'test', ERP_DB: path.join(root, 'tmp', `ui-qa-${stamp}.sqlite3`),
  ERP_PORT: String(port), PORT: String(port), ERP_PRINT_MODE: 'manual', ERP_PAYROLL_MAIL_ENABLED: 'false',
  DATABASE_URL: '', ERP_USERS_JSON: '', ERP_ALLOWED_ORIGINS: '', PUBLIC_BASE_URL: '', ERP_PRINT_AGENTS_JSON: '{}' };
const python = process.env.PYTHON || 'python';
const fixture = spawnSync(python, [path.join(__dirname, 'fixture.py'), environment.ERP_DB], { cwd: root, env: environment, encoding: 'utf8', windowsHide: true });
assert.equal(fixture.status, 0, fixture.stderr || fixture.stdout);
const seeded = JSON.parse(fixture.stdout.trim());
const server = spawn(python, ['server.py'], { cwd: root, env: environment, windowsHide: true, stdio: ['ignore','pipe','pipe'] });
let serverErrors = '';
server.stderr.on('data', data => { serverErrors += data.toString(); });
const cases = [], errors = [], brokenLocal = [], externalFailures = [], expectedValidation = [], accessibility = [], consoleErrors = [];
const expectedStatus = new WeakMap();
let browser;
const viewports = { desktop: { width: 1440, height: 1000 }, tablet: { width: 834, height: 1112 }, mobile: { width: 390, height: 844 } };
async function context() {
  const ctx = await browser.newContext({ viewport: viewports.desktop, reducedMotion: 'reduce' });
  const page = await ctx.newPage();
  page.setDefaultTimeout(30000);
  page.on('dialog', dialog => dialog.accept()); // Confirmations act only on disposable data.
  page.on('pageerror', error => errors.push(error.message));
  page.on('console', message => {
    if (message.type() !== 'error') return;
    const text = message.text(), url = message.location().url;
    // These failures are intentionally exercised by the authentication,
    // duplicate-show and offline-recovery scenarios below.
    const expected = text.startsWith('Failed to load resource:') && (
      (url === base+'/api/state' && text.includes('401')) ||
      (url === base+'/api/action' && text.includes('400')) ||
      (url.includes('/api/public/catalog?branch=Oruro') && text.includes('ERR_INTERNET_DISCONNECTED'))
    );
    if (!expected) consoleErrors.push({text,url});
  });
  page.on('response', response => {
    if (response.status() >= 400 && response.url().startsWith(base) && !response.url().includes('/api/state')) {
      const record = `${response.status()} ${response.url()}`;
      if (response.url()===base+'/api/action' && response.status()===expectedStatus.get(page)) expectedValidation.push(record);
      else brokenLocal.push(record);
    }
  });
  page.on('requestfailed', request => {
    if (!request.url().startsWith(base)) externalFailures.push(`${request.url()} ${request.failure()?.errorText}`);
  });
  return { ctx, page };
}
async function login(page, user) {
  await page.goto(base + '/admin.html');
  await page.getByLabel('Usuario', { exact: true }).fill(user);
  await page.getByLabel('Contraseña', { exact: true }).fill('Cine2026!');
  await page.getByRole('button', { name: 'Entrar al sistema' }).click();
  if (['gerencia','contabilidad'].includes(user)) {
    await page.getByRole('heading', { name: 'Elige tu sucursal' }).waitFor();
    await page.locator('[data-enter-branch="Potosí"]').click();
  }
  await page.locator('#pageTitle').waitFor();
}
async function nav(page, key) {
  const button = page.locator(`#areaNav [data-page="${key}"]`);
  if (!await button.isVisible()) await page.locator('#menuToggle').click();
  await button.click();
  await page.locator(`#content[data-view="${key}"]`).waitFor();
}
async function state(page) { return (await page.request.get(base + '/api/state')).json(); }
async function submit(page, action, button, status=200) {
  expectedStatus.set(page,status);
  const [response] = await Promise.all([
    page.waitForResponse(r => r.url() === base + '/api/action' && r.request().method() === 'POST' && r.request().postDataJSON()?.action === action),
    button.click()
  ]);
  expectedStatus.delete(page);
  assert.equal(response.status(), status, await response.text());
  // The response precedes the UI refresh; do not open the next dialog mid-render.
  await page.waitForFunction(() => typeof busy === 'undefined' || !busy);
  return response.json();
}
async function inspect(page, label, screenshot = true) {
  await page.evaluate(() => document.fonts.ready);
  if (label.endsWith('-desktop') || label.endsWith('-mobile')) {
    const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21aa']).analyze();
    if (result.violations.length) accessibility.push({label, violations: result.violations.map(v => ({id:v.id, impact:v.impact, nodes:v.nodes.map(n=>({target:n.target,summary:n.failureSummary}))}))});
  }
  const issues = await page.evaluate(() => {
    const visible = e => e.getBoundingClientRect().width > 0 && e.getBoundingClientRect().height > 0 && getComputedStyle(e).visibility !== 'hidden' && !e.closest('[inert]');
    const controls = [...document.querySelectorAll('input:not([type=hidden]),select,textarea')].filter(visible);
    const unnamed = controls.filter(e => !e.labels?.length && !e.getAttribute('aria-label') && !e.getAttribute('aria-labelledby')).map(e => e.outerHTML.slice(0,150));
    const undersized = controls.filter(e => e.getAttribute('type') !== 'checkbox' && e.getBoundingClientRect().width < 50).map(e => e.name || e.id);
    const smallTouchButtons = innerWidth <= 420 ? [...document.querySelectorAll('button')].filter(visible).filter(e => {
      const box=e.getBoundingClientRect();return box.width<43||box.height<43;
    }).map(e => e.textContent.trim() || e.getAttribute('aria-label')) : [];
    const brokenImages = [...document.images].filter(visible).filter(e => e.src.startsWith(location.origin) && e.complete && !e.naturalWidth).map(e=>e.src);
    const bounds=[...document.querySelectorAll('body *')].filter(visible).map(e=>({tag:e.tagName,cls:e.className,right:Math.round(e.getBoundingClientRect().right),width:Math.round(e.getBoundingClientRect().width)})).filter(e=>e.right>innerWidth+1);
    return { overflow: document.documentElement.scrollWidth > innerWidth + 1, bounds, unnamed, undersized, smallTouchButtons, brokenImages, title: document.title, text: document.body.innerText.length };
  });
  if(screenshot) await page.screenshot({path:path.join(output,label+'.png'),fullPage:true});
  assert.equal(issues.overflow, false, `${label}: horizontal document overflow ${JSON.stringify(issues.bounds.slice(0,12))}`);
  assert.deepEqual(issues.unnamed, [], `${label}: missing input label`);
  assert.deepEqual(issues.undersized, [], `${label}: unusable narrow input`);
  assert.deepEqual(issues.smallTouchButtons, [], `${label}: small touch button`);
  assert.deepEqual(issues.brokenImages, [], `${label}: missing local image`);
  assert.ok(issues.text > 80 && /Universal|Entradas|Recibo|Cierre|Reporte salarial/i.test(issues.title), `${label}: blank or wrong route (${issues.title})`);
  cases.push(label);
}
async function responsive(page, label) {
  for (const [name, viewport] of Object.entries(viewports)) {
    await page.setViewportSize(viewport);
    await page.evaluate(() => window.scrollTo({top:0,behavior:'instant'}));
    await inspect(page, `${label}-${name}`);
  }
  await page.setViewportSize(viewports.desktop);
}
async function popupReport(page, link, name) {
  const [report] = await Promise.all([page.waitForEvent('popup'), link.click()]);
  await report.waitForLoadState('domcontentloaded');
  assert.equal((await report.request.get(report.url())).status(), 200);
  await responsive(report, name);
  await report.close();
}
async function publicFlow() {
  const { ctx, page } = await context();
  await page.goto(base + '/index.html');
  await page.locator('.movie-card').first().waitFor();
  await page.locator(`[data-date="${seeded.tomorrow}"]`).click();
  const dayButton=page.locator('.date-card.selected');await dayButton.focus();
  const focusedDay=await dayButton.elementHandle();
  await Promise.all([page.waitForResponse(r=>r.url().includes('/api/public/catalog')),page.evaluate(()=>window.dispatchEvent(new StorageEvent('storage',{key:'cinema-content-updated'})))]);
  await page.waitForFunction(()=>document.querySelector('.movie-track').getAttribute('aria-busy')==='false');
  assert.equal(await focusedDay.evaluate(e=>e.isConnected&&e===document.activeElement),true,'Polling must retain the focused date');
  await responsive(page, 'public');
  await page.screenshot({path:path.join(output,'gallery-public.png')});
  await page.locator('.position-center .showtime-trigger').click();
  await page.locator('.modal.open .public-functions article').first().waitFor();
  await responsive(page, 'movie-detail');
  await page.keyboard.press('Escape');
  assert.equal(await page.locator('.modal').getAttribute('aria-hidden'), 'true');
  assert.equal(await page.locator('.position-center .showtime-trigger').evaluate(e => e === document.activeElement), true);
  let resumeBranch;const heldBranch=new Promise(resolve=>{resumeBranch=resolve;});
  await page.route('**/api/public/catalog?branch=Sucre',async route=>{await heldBranch;await route.continue();});
  await page.getByLabel('Sucursal', { exact: true }).focus();
  await page.getByLabel('Sucursal', { exact: true }).selectOption('Sucre');
  await page.locator('.catalog-loading').waitFor();
  assert.equal(await page.locator('.movie-card').count(),0,'Do not show the previous branch during loading');
  assert.equal(await page.locator('#featuredMovie').isVisible(),false);
  resumeBranch();await page.locator('.movie-card').first().waitFor();
  await page.unroute('**/api/public/catalog?branch=Sucre');
  assert.equal(await page.getByLabel('Sucursal',{exact:true}).evaluate(e=>e===document.activeElement),true);
  assert.equal(await page.locator('#cinema-map').isVisible(), false);
  await page.setViewportSize(viewports.mobile);
  await page.getByRole('button', { name: 'Abrir menú', exact: true }).click();
  await page.locator('.mobile-nav a[href="#candy"]').click();
  assert.equal(await page.locator('.mobile-nav').evaluate(e => e.inert), true);
  await page.locator('[data-combo="Combo Universal"]').click();
  assert.match(await page.locator('.toast-text').textContent(), /Sucre/);
  await page.getByRole('button', { name: 'Cerrar aviso' }).click();
  await page.route('**/api/public/catalog?branch=Oruro',route=>route.abort('internetdisconnected'));
  await page.getByLabel('Sucursal',{exact:true}).selectOption('Oruro');
  await page.getByRole('button',{name:'Reintentar',exact:true}).waitFor();
  await responsive(page,'public-retry');
  await page.unroute('**/api/public/catalog?branch=Oruro');
  await page.getByRole('button',{name:'Reintentar',exact:true}).click();
  await page.locator('.movie-card').first().waitFor();
  await page.goto(base + '/admin.html');
  await responsive(page, 'login');
  await ctx.close();
}
async function ticketFlow() {
  const { ctx, page } = await context();
  await login(page, 'boleteria.potosi');
  const before = await state(page);
  await page.locator('[data-ticket-time]').first().click();
  const id = await page.locator('[data-ticket-add]').first().getAttribute('data-ticket-add');
  await page.locator(`[data-ticket-addqty="${id}"]`).fill('2');
  await page.locator(`[data-ticket-add="${id}"]`).click();
  await responsive(page, 'ticket-pos');
  await page.screenshot({path:path.join(output,'gallery-ticket.png')});
  await page.setViewportSize({ width: 1078, height: 930 });
  await inspect(page, 'ticket-laptop');
  await page.setViewportSize(viewports.desktop);
  await page.locator('.ticket-movie').nth(1).locator('[data-ticket-time]').first().click();
  await page.locator('.ticket-movie').nth(1).locator('[data-ticket-add]').click();
  const result = await submit(page, 'ticket_checkout', page.locator('#ticketFinish'));
  await page.locator('.ticket-success').waitFor();
  assert.equal(result.order.lines.reduce((n,r) => n+r.quantity,0), 3);
  const after = await state(page);
  assert.equal(after.state.availability[id], before.state.availability[id] - 2);
  await responsive(page, 'ticket-confirmation');
  await popupReport(page, page.locator('.ticket-success a').first(), 'ticket-print');
  const receipt = await page.request.get(base + '/api/receipt/' + result.order.id);
  assert.equal((await receipt.text()).match(/class="ticket"/g).length,3);
  await nav(page, 'closures');
  await page.locator('[data-cash-direction="in"]').click();
  await page.locator('#cashDialog [name=amount]').fill('20');
  await page.locator('#cashDialog [name=reason]').fill('Fondo de prueba');
  await responsive(page, 'cash-movement');
  await submit(page,'cash_movement',page.locator('#cashDialog button.primary'));
  await page.locator('#cashDialog').waitFor({ state:'detached' });
  await responsive(page, 'cash-close');
  await page.locator('[data-action=close] [name=physical]').fill(String(result.order.total+20));
  await submit(page,'close',page.locator('[data-action=close] button.primary'));
  await page.locator('[data-open-cash]').first().waitFor();
  await popupReport(page,page.locator('a[href^="/api/closing/"]').first(),'closing-print');
  await nav(page,'pos');
  assert.equal(await page.locator('#ticketFinish').isDisabled(),true);
  await page.locator('[data-open-cash]').first().click();
  await page.locator('#openingDialog').waitFor();
  await inspect(page,'cash-opening');
  await submit(page,'cash_open',page.locator('#openingDialog button.primary'));
  await page.locator('#openingDialog').waitFor({ state:'detached' });
  assert.ok((await state(page)).state.cashOpenings.some(o=>!o.closed));
  await ctx.close();
}
async function candyFlow() {
  const { ctx, page } = await context();
  await login(page,'candy.potosi');
  assert.equal(await page.locator('#areaNav [data-page=inventory]').count(),0);
  await page.locator('[data-candy-new]').click();
  await page.locator('#candySearch').fill('XXX1');
  await page.locator('#candySearch').press('Enter');
  await page.locator('[data-candy-qty]').fill('2');
  await page.locator('[data-candy-qty]').press('Tab');
  await responsive(page,'candy-sale');
  const sold = await submit(page,'candy_checkout',page.locator('[data-candy-finish]'));
  await page.locator('.candy-history').waitFor();
  await responsive(page,'candy-history');
  await popupReport(page,page.getByRole('link',{name:'Imprimir recibo'}).first(),'candy-print');
  await page.getByRole('button',{name:'Solicitar anulación',exact:true}).first().click();
  await page.locator('dialog [name=reason]').fill('Error de cantidad en prueba aislada');
  await submit(page,'candy_void_request',page.getByRole('button',{name:'Enviar solicitud'}));
  await page.locator('dialog').waitFor({state:'detached'});
  await page.getByRole('button',{name:'Todo el equipo',exact:true}).click();
  await page.locator('#candyHistorySeller').waitFor();
  await inspect(page,'candy-team');
  await nav(page,'closures');
  await inspect(page,'candy-closures');
  assert.ok(sold.ok);
  await ctx.close();
}
async function managementFlow(user, sections) {
  const {ctx,page}=await context();
  await login(page,user);
  if(user==='gerencia'||user==='contabilidad'){
    await page.locator('#changeBranch').click();
    await responsive(page,user+'-branches');
    await page.locator('[data-enter-branch="Sucre"]').click();
    assert.equal(await page.locator('.active-branch strong').textContent(),'Sucre');
    await page.locator('#changeBranch').click();
    await page.locator('[data-enter-branch="Potosí"]').click();
  }
  for(const section of sections){await nav(page,section);await responsive(page,user+'-'+section);}
  if(user==='gerencia'){
    await nav(page,'shows');
    await page.locator('[data-ui-dialog=scheduleEditor]').click();
    await responsive(page,'schedule-form');
    await page.keyboard.press('Escape');
    await page.locator('.secondary-panel>summary').click();
    await page.locator('[data-ui-dialog=newRoom]').click();
    await page.locator('dialog [name=name]').fill('Sala de prueba');
    await page.locator('dialog [name=capacity]').fill('246');
    const room=await submit(page,'room_save',page.locator('dialog button.primary'));
    await page.locator('dialog').waitFor({state:'detached'});
    await page.locator('[data-ui-dialog=scheduleEditor]').click();
    const schedule=page.locator('dialog [data-action=schedule]');
    await schedule.locator('[name=roomId]').selectOption(room.room);
    await schedule.locator('[name=date]').fill(seeded.tomorrow);
    await schedule.locator('[name=times]').fill('14:00, 14:00');
    const rejected=await submit(page,'schedule',schedule.locator('button.primary'),400);
    assert.match(rejected.error,/horarios distintos/);
    assert.equal(await schedule.locator('.form-error').evaluate(e=>e===document.activeElement),true);
    await responsive(page,'schedule-validation');
    await schedule.locator('[name=times]').fill('14:00');
    await schedule.locator('[name=wednesdayPromo]').selectOption('yes');
    const programmed=await submit(page,'schedule',schedule.locator('button.primary'));
    assert.equal(programmed.created,7);
    await page.locator('dialog').waitFor({state:'detached'});
    const potosi=await (await page.request.get(base+'/api/public/catalog?branch=Potos%C3%AD')).json();
    const scheduled=potosi.shows.filter(s=>s.room==='Sala de prueba');
    assert.equal(scheduled.length,7);
    const promo=scheduled.find(s=>s.promo);
    assert.equal(promo.available,123);assert.equal(promo.price,36);
    const sucre=await (await page.request.get(base+'/api/public/catalog?branch=Sucre')).json();
    assert.equal(sucre.shows.some(s=>s.room==='Sala de prueba'),false);
    const seller=await context();await login(seller.page,'boleteria.potosi');
    await seller.page.locator('#ticketDate').selectOption(promo.date);
    await seller.page.locator(`[data-ticket-time="${promo.id}"]`).click();
    assert.match(await seller.page.locator('.ticket-details').textContent(),/123/);
    await responsive(seller.page,'ticket-programmed-promo');await seller.ctx.close();
    await nav(page,'trailers');
    for(const name of ['newMovie','newTrailer']){
      await page.locator(`[data-ui-dialog=${name}]`).click();await responsive(page,name+'-form');await page.keyboard.press('Escape');
    }
  }
  if(user==='contabilidad'){
    await nav(page,'inventory');
    await page.locator('[data-ui-dialog=newProduct]').click();
    await page.locator('dialog button.primary').click();
    assert.equal(await page.locator('dialog [name=name]').getAttribute('aria-invalid'),'true');
    await page.locator('dialog [name=name]').fill('Pipocas de prueba');
    await page.locator('dialog [name=price]').fill('12.50');
    await responsive(page,'inventory-product-form');
    await submit(page,'product',page.locator('dialog button.primary'));
    await page.locator('dialog').waitFor({state:'detached'});
    const product=(await state(page)).state.products.find(p=>p.name==='Pipocas de prueba');
    assert.ok(product.code);
    await page.locator('[data-ui-dialog=newStock]').click();
    await page.locator('dialog [name=item]').selectOption(product.id);
    await page.locator('dialog [name=quantity]').fill('6');
    await page.locator('dialog [name=reason]').fill('Entrada de prueba');
    await responsive(page,'inventory-movement-form');
    await submit(page,'stock',page.locator('dialog button.primary'));
    await page.locator('dialog').waitFor({state:'detached'});
    assert.equal((await state(page)).state.products.find(p=>p.id===product.id).stock,6);
    await nav(page,'payroll');
    await page.locator('[data-payroll-tab=employees]').click();
    await responsive(page,'payroll-employees');
    await page.getByRole('button',{name:'Editar empleado',exact:true}).first().click();
    const input=page.locator('dialog [name=lateMinutes1]');
    await input.fill('6');await input.press('Tab');
    assert.equal(await input.inputValue(),'6');
    await responsive(page,'payroll-employee-form');
    await page.setViewportSize(viewports.mobile);
    await input.scrollIntoViewIfNeeded();
    await page.screenshot({path:path.join(output,'payroll-lateness-mobile.png')});
    await page.setViewportSize(viewports.desktop);
    await submit(page,'payroll_employee',page.getByRole('button',{name:'Guardar empleado',exact:true}));
    await page.locator('dialog').waitFor({state:'detached'});
    await page.locator('[data-payroll-tab=extras]').click();
    const extra=page.locator('[data-action=payroll_extra]');
    await extra.locator('[name=month]').fill(seeded.start.slice(0,7));
    await extra.locator('[name=date]').fill(seeded.start);
    await extra.locator('[name=reason]').fill('Función especial de prueba');
    await extra.locator('[name=amount]').fill('25');
    await extra.locator('[name=employees]').first().check();
    await submit(page,'payroll_extra',extra.locator('button.primary'));
    await responsive(page,'payroll-extras');
    await page.locator('[data-payroll-tab=imports]').first().click();
    const upload=page.locator('[data-action=payroll_import]');
    await upload.locator('[name=start]').fill(seeded.start);
    await upload.locator('[name=end]').fill(seeded.end);
    await upload.locator('[name=biometric]').setInputFiles(seeded.biometric);
    await submit(page,'payroll_import',upload.locator('button.primary'));
    await page.locator('details.trailer-editor>summary').first().click();
    await responsive(page,'payroll-imports');
    await submit(page,'payroll_calculate',page.locator('[data-action=payroll_calculate] button.primary').first());
    await page.locator('[data-payroll-tab=runs]').first().click();
    await page.locator('.payroll-person-result>summary').first().click();
    await responsive(page,'payroll-runs');
    await popupReport(page,page.getByRole('link',{name:'Reporte de planilla'}),'payroll-print');
    const approval=page.locator('[data-action=payroll_validate]');
    await approval.locator('[name=confirm]').check();
    await approval.locator('[name=attendanceConfirmed]').check();
    await approval.locator('[name=note]').fill('Mes completo de datos sintéticos para prueba visual.');
    await submit(page,'payroll_validate',approval.locator('button.primary'));
    await page.locator('[data-payroll-tab=mail]').first().click();await responsive(page,'payroll-mail');
    assert.ok((await state(page)).state.payrollMail.every(job=>job.status!=='Enviado'));
    await nav(page,'reports');
    const review=page.locator('[data-action=candy_void_review]').first();
    await review.locator('[name=status]').selectOption('Rechazado');
    await review.locator('[name=restoreStock]').selectOption('no');
    await review.locator('[name=note]').fill('Prueba visual revisada');
    await submit(page,'candy_void_review',review.getByRole('button',{name:'Guardar resolución'}));
    await nav(page,'audits');
    const result=await submit(page,'audit_start',page.locator('[data-action=audit_start] button.primary'));
    await page.locator('.count').first().waitFor();
    await responsive(page,'audit-count');
    assert.equal((await page.request.get(base+'/api/pdf/'+result.audit)).status(),200);
    const seller=await context();await login(seller.page,'candy.potosi');
    assert.equal(await seller.page.locator('[data-candy-new]').isDisabled(),true);
    await nav(seller.page,'inventory');await responsive(seller.page,'candy-audit-inventory');await seller.ctx.close();
    const current=await state(page),audit=current.state.audits.find(a=>a.id===result.audit);
    for(const row of audit.rows)await page.locator(`.count[name="${row.item}"]`).fill(String(Math.max(0,row.system)));
    await submit(page,'audit_finish',page.locator('[data-action=audit_save] button[name=finish]'));
    await page.locator('.count:disabled').first().waitFor();
    const reopened=await context();await login(reopened.page,'candy.potosi');
    assert.equal(await reopened.page.locator('#areaNav [data-page=inventory]').count(),0);
    assert.equal(await reopened.page.locator('[data-candy-new]').isDisabled(),false);
    await reopened.ctx.close();
  }
  if(user==='admin.potosi'){
    await nav(page,'inventory');
    await page.locator('[data-ui-dialog=newVaultReport]').click();
    const id=await page.locator('dialog [name=item]').inputValue();
    const before=(await state(page)).state.products.find(p=>p.id===id).stock;
    await page.locator('dialog [name=quantity]').fill('3');
    await page.locator('dialog [name=reason]').fill('Reporte de bóveda pendiente de aprobación');
    await responsive(page,'vault-report-form');
    await submit(page,'report',page.locator('dialog button.primary'));
    await page.locator('dialog').waitFor({state:'detached'});
    assert.equal((await state(page)).state.products.find(p=>p.id===id).stock,before);
    await page.setViewportSize(viewports.mobile);
    await page.locator('#menuToggle').click();await page.keyboard.press('Escape');
    assert.equal(await page.locator('#menuToggle').getAttribute('aria-label'),'Abrir menú de áreas');
    assert.equal(await page.locator('#menuToggle').evaluate(e=>e===document.activeElement),true);
  }
  await ctx.close();
}
(async()=>{
  try{
    await new Promise((resolve,reject)=>{server.stdout.on('data',data=>{if(data.toString().includes('Universal ERP:'))resolve();});server.on('error',reject);server.on('exit',code=>reject(Error('Test server exited '+code+' '+serverErrors)));});
    browser=await chromium.launch({channel:process.env.ERP_UI_BROWSER||(process.platform==='win32'?'msedge':undefined),headless:true});
    for(const [label,run] of [
      ['public / guest',publicFlow],['ticket sale and closing',ticketFlow],['candy sale and request',candyFlow],
      ['manager',()=>managementFlow('gerencia',['overview','shows','trailers','inventory','audits','closures','history'])],
      ['accounting',()=>managementFlow('contabilidad',['overview','payroll','inventory','reports','audits','closures','history'])],
      ['administrator',()=>managementFlow('admin.potosi',['overview','inventory','reports','closures','history'])]
    ]){console.log('Checking '+label);await run();}
    assert.deepEqual(errors,[],'Uncaught browser errors');
    assert.deepEqual(brokenLocal,[],'Broken local routes');
    fs.writeFileSync(path.join(output,'results.json'),JSON.stringify({cases,errors,brokenLocal,expectedValidation,externalFailures,accessibility,consoleErrors},null,2));
    assert.deepEqual(consoleErrors,[],'Unexpected console errors (see results.json)');
    assert.deepEqual(accessibility,[],'Accessibility regressions (see results.json)');
    console.log(JSON.stringify({passedScreens:cases.length,flows:6,errors,brokenLocal,expectedValidation,externalFailures,output},null,2));
  }catch(error){console.error(error);fs.writeFileSync(path.join(output,'failure.json'),JSON.stringify({message:error.message,cases,errors,brokenLocal,externalFailures},null,2));for(const [index,ctx] of (browser?.contexts()||[]).entries()){for(const [tab,p] of ctx.pages().entries())await p.screenshot({path:path.join(output,`failure-${index}-${tab}.png`),timeout:5000}).catch(()=>{});}process.exitCode=1;}
  finally{await browser?.close();server.kill();}
})();
