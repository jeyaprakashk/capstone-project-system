const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const busyFixture = require('./busy-fixture.cjs');

function element() {
  const attrs = {};
  return {disabled:false, innerHTML:'', textContent:'', setAttribute:(k, v) => { attrs[k] = v; }, getAttribute:k => attrs[k]};
}

test('write shows the spinner and label, disables triggers and restores them with the result text', () => {
  const busy = busyFixture((variant, label) => '<span data-skeleton>' + label + '</span>');
  const status = element(), save = element(), cancel = element(); cancel.disabled = true;
  const done = busy.write(status, 'Saving <draft>…', [save, cancel]);
  assert.match(status.innerHTML, /data-skeleton/);
  assert.match(status.innerHTML, /Saving &lt;draft&gt;…/);
  assert.equal(status.getAttribute('aria-busy'), 'true');
  assert.equal(save.disabled, true);
  done('Saved.'); done('ignored');
  assert.equal(status.textContent, 'Saved.');
  assert.equal(status.getAttribute('aria-busy'), 'false');
  assert.equal(save.disabled, false);
  assert.equal(cancel.disabled, true, 'a trigger that was already disabled stays disabled');
});

test('write tolerates a missing status element and done() clears the spinner', () => {
  const busy = busyFixture();
  assert.doesNotThrow(() => busy.write(null, 'x', [null])('y'));
  const status = element(); busy.write(status, 'x')();
  assert.equal(status.textContent, '');
});

test('read delegates to the shared content overlay and mark is the only aria-busy setter', () => {
  const calls = [];
  const busy = busyFixture(null, (target, label, options) => { calls.push([target, label, options]); return () => 'finish'; });
  const host = element();
  assert.equal(busy.read(host, 'Loading', {compact:true})(), 'finish');
  assert.deepEqual(calls, [[host, 'Loading', {compact:true}]]);
  busy.mark(host, true); assert.equal(host.getAttribute('aria-busy'), 'true');
  busy.mark(host, false); assert.equal(host.getAttribute('aria-busy'), 'false');
  assert.doesNotThrow(() => busy.mark(null, true));
});

test('only busy-state.js sets aria-busy or writes its own in-progress text', () => {
  const skip = new Set(['busy-state.js', 'lucide-icons.js']);
  for (const name of fs.readdirSync('.').filter(file => file.endsWith('.js') && !skip.has(file))) {
    const source = fs.readFileSync(name, 'utf8');
    assert.doesNotMatch(source, /(?:set|remove)Attribute\(\s*'aria-busy'/, name + ' sets aria-busy directly; use busy.mark');
    assert.doesNotMatch(source, /(?:textContent|innerHTML)\s*=\s*'(?:Saving|Submitting|Syncing|Creating|Preparing|Connecting|Processing|Publishing)[^']*(?:…|\.\.\.)'/, name + ' writes its own in-progress text; use busy.write');
    assert.doesNotMatch(source, /setText\([^,]+,\s*'(?:Saving|Submitting|Syncing|Creating|Preparing|Connecting|Processing|Publishing)[^']*(?:…|\.\.\.)'/, name + ' writes its own in-progress text; use busy.write');
  }
});
