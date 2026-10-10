// Shared tab strip: WAI-ARIA Tabs markup, keyboard, More sheet and badges; escaped, utility-only, no inline handlers.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { parseHTML } = require('linkedom');
const { missingClasses, renderedClasses } = require('./compiled-css.cjs');

const evil = '<img src=x onerror=alert(1)>"\'&';
const tab = (key, extra = {}) => ({ key, icon: 'tag', label: 'Label ' + key, ...extra });

function setup() {
  const { document, window } = parseHTML('<html><body><section id="host"></section></body></html>');
  const c = vm.createContext({});
  vm.runInContext(fs.readFileSync('shared-tabs.js', 'utf8'), c);
  const tabs = c.sharedTabsBrowser_(() => ({ renderIcon: name => '<svg class="lucide-' + name + '"></svg>' }));
  const host = document.getElementById('host');
  const clicks = [];
  host.addEventListener('click', event => { const t = event.target.closest('[role=tab]'); if (t) { clicks.push(t.dataset.tab); tabs.select(host.querySelectorAll('[role=tab]'), n => n === t); } });
  tabs.bind(host); tabs.bind(host);
  const press = (el, key) => { const event = new window.Event('keydown', { bubbles: true, cancelable: true }); Object.defineProperty(event, 'key', { value: key }); el.dispatchEvent(event); return event; };
  const render = options => { host.innerHTML = tabs.markup(options) + '<div ' + tabs.panelAttributes(options.id, (options.tabs.find(t => t.selected) || options.tabs[0]).key) + '></div>'; };
  return { tabs, host, document, clicks, press, render, click: el => el.dispatchEvent(new window.Event('click', { bubbles: true })) };
}

test('renders an ARIA tablist with linked tabs and panel, escapes values and uses compiled utilities only', () => {
  const f = setup();
  f.render({ id: 'demo', label: evil, tabs: [tab('a', { selected: true, short: evil, count: 3, countLabel: evil }), tab('b', { label: evil, attrs: { 'data-stage': evil } })] });
  const list = f.host.querySelector('[role=tablist]'), tabs = list.querySelectorAll('[role=tab]'), panel = f.host.querySelector('[role=tabpanel]');
  assert.equal(list.getAttribute('aria-label'), evil);
  assert.deepEqual(Array.from(tabs).map(t => [t.id, t.getAttribute('aria-selected'), t.getAttribute('tabindex'), t.getAttribute('aria-controls')]),
    [['demo-tab-a', 'true', '0', 'demo-panel'], ['demo-tab-b', 'false', '-1', 'demo-panel']]);
  assert.equal(panel.id, 'demo-panel'); assert.equal(panel.getAttribute('aria-labelledby'), 'demo-tab-a');
  assert.equal(tabs[1].getAttribute('data-stage'), evil); assert.equal(f.host.querySelector('img'), null);
  assert.equal(tabs[0].querySelector('[data-tab-badge]').textContent, '3'); assert.equal(tabs[1].querySelector('[data-tab-badge]'), null);
  assert.equal(f.host.querySelector('[data-tab-more]'), null, 'four or fewer tabs need no More');
  assert.equal(f.host.querySelector('[onclick],[onkeydown],[style]'), null);
  assert.deepEqual(missingClasses(renderedClasses(f.host)), []);
});

test('tabs past the fourth go in the sheet; More sits outside the tablist and toggles it; any other click closes it', () => {
  const f = setup();
  f.render({ id: 'demo', label: 'Demo', tabs: ['a', 'b', 'c', 'd', 'e', 'f'].map((k, i) => tab(k, { selected: i === 0 })) });
  const list = f.host.querySelector('[role=tablist]'), strip = f.host.querySelector('[data-tabs]'), more = f.host.querySelector('[data-tab-more]');
  assert.deepEqual(Array.from(list.children).filter(n => n.getAttribute('role') === 'tab').map(n => n.dataset.tab), ['a', 'b', 'c', 'd']);
  assert.deepEqual(Array.from(list.querySelectorAll('[data-tab-sheet] [role=tab]')).map(n => n.dataset.tab), ['e', 'f']);
  assert.equal(list.contains(more), false); assert.equal(more.getAttribute('aria-controls'), f.host.querySelector('[data-tab-sheet]').id);
  f.click(more); assert.equal(strip.hasAttribute('data-more-open'), true); assert.equal(more.getAttribute('aria-expanded'), 'true');
  f.click(more); assert.equal(strip.hasAttribute('data-more-open'), false); assert.equal(more.getAttribute('aria-expanded'), 'false');
  f.click(more); f.click(f.host.querySelector('[data-tab="f"]'));
  assert.equal(strip.hasAttribute('data-more-open'), false); assert.deepEqual(f.clicks, ['f']);
  f.click(more); f.press(f.host.querySelector('[data-tab="e"]'), 'Escape');
  assert.equal(strip.hasAttribute('data-more-open'), false);
});

test('arrow keys, Home and End move between enabled tabs and wrap; automatic activation selects, manual only focuses', () => {
  const f = setup();
  f.render({ id: 'demo', label: 'Demo', tabs: [tab('a', { selected: true }), tab('b'), tab('c')] });
  f.host.querySelector('[data-tab="b"]').disabled = true;
  const at = key => f.host.querySelector('[data-tab="' + key + '"]');
  assert.equal(f.press(at('a'), 'ArrowRight').defaultPrevented, true);
  assert.deepEqual(f.clicks, ['c'], 'the disabled tab is skipped');
  f.press(at('c'), 'ArrowRight'); f.press(at('a'), 'End'); f.press(at('c'), 'Home'); f.press(at('a'), 'ArrowLeft');
  assert.deepEqual(f.clicks, ['c', 'a', 'c', 'a', 'c']);
  assert.equal(at('c').getAttribute('tabindex'), '0'); assert.equal(at('a').getAttribute('tabindex'), '-1');
  assert.equal(f.press(at('c'), 'Enter').defaultPrevented, false, 'other keys are left to the button');

  const m = setup();
  m.render({ id: 'demo', label: 'Demo', activation: 'manual', tabs: [tab('a', { selected: true }), tab('b')] });
  m.press(m.host.querySelector('[data-tab="a"]'), 'ArrowRight');
  assert.deepEqual(m.clicks, [], 'manual activation waits for Enter or Space');
});

test('select moves selection, the roving tabindex and the panel label; setBadge creates, updates and hides the badge', () => {
  const f = setup();
  f.render({ id: 'demo', label: 'Demo', tabs: [tab('a', { selected: true }), tab('b')] });
  const b = f.host.querySelector('[data-tab="b"]');
  f.tabs.select(f.host.querySelectorAll('[role=tab]'), t => t.dataset.tab === 'b');
  assert.equal(b.getAttribute('aria-selected'), 'true'); assert.equal(b.getAttribute('tabindex'), '0');
  assert.equal(f.host.querySelector('[role=tabpanel]').getAttribute('aria-labelledby'), 'demo-tab-b');
  f.tabs.setBadge(b, 4, 'Four waiting');
  const badge = b.querySelector('[data-tab-label] [data-tab-badge]');
  assert.equal(badge.textContent, '4'); assert.equal(badge.title, 'Four waiting'); assert.equal(badge.hidden, false);
  f.tabs.setBadge(b, 0, '');
  assert.equal(b.querySelectorAll('[data-tab-badge]').length, 1); assert.equal(badge.hidden, true); assert.equal(badge.textContent, '');
  assert.deepEqual(missingClasses(renderedClasses(f.host)), []);
});
