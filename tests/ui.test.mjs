import { test } from 'vitest';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
const sandbox = { window: {}, document: { addEventListener() {} } };
vm.runInNewContext(fs.readFileSync(new URL('../ui.js', import.meta.url), 'utf8'), sandbox);
const ui = sandbox.window.UniversalUI;

test('untrusted text cannot introduce executable markup into empty states or progress', () => {
  const attack = '<img src=x onerror="alert(1)">';
  for (const markup of [ui.empty(attack, attack), ui.steps([attack], 0)]) {
    assert.ok(!markup.includes('<img'));
    assert.ok(markup.includes('&lt;img'));
    assert.ok(!markup.includes('onerror="'));
  }
});
test('null and numeric values remain printable without losing zero', () => {
  assert.equal(ui.escape(null), '');
  assert.equal(ui.escape(0), '0');
  assert.equal(ui.escape('"&\''), '&quot;&amp;&#39;');
});
test('all workflow states expose exactly one current step', () => {
  for (const index of [0, 1, 2]) {
    const html = ui.steps(['Función', 'Boletos', 'Confirmación'], index);
    assert.equal((html.match(/aria-current="step"/g) || []).length, 1);
    assert.equal((html.match(/class="complete"/g) || []).length, index);
  }
});
test('scrollable result tables retain column semantics and escaped markup', () => {
  const html = ui.table(['Nombre'], ['<tr><td>&lt;Ana&gt;</td></tr>']);
  assert.match(html, /tabindex="0"/);
  assert.match(html, /<th scope="col">Nombre<\/th>/);
  assert.match(html, /&lt;Ana&gt;/);
  assert.ok(!ui.table([], []).includes('<table'));
});
