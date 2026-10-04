// Shared rubrics and timeline views: escaped, delegated, utility-only markup.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { parseHTML } = require('linkedom');
const { missingClasses, renderedClasses } = require('./compiled-css.cjs');

const evil = '<img src=x onerror=alert(1)>"\'&';
const DATA = { assessments: [
  { key: 'review1', label: 'Review 1', weight: 12.5, available: true, criterionCount: 1, totalMarks: 100, evaluator: evil, evaluationNotice: evil,
    criteria: [{ pi: 'PI1', co: 'CO1', type: 'Team', maxMarks: 100, name: evil, descriptors: [evil, '', '', '', '', 'Excellent'] }] },
  { key: 'see', label: 'SEE', weight: 40, available: false, status: 'Rubric not configured' }] };

function load(file, factory) {
  const { document, window } = parseHTML('<html><body><section id="host"></section></body></html>');
  const c = vm.createContext({});
  vm.runInContext(fs.readFileSync(file, 'utf8'), c);
  const view = c[factory](() => ({ renderIcon: name => '<svg class="lucide-' + name + '"></svg>' }));
  const host = document.getElementById('host');
  return { view, host, click: el => el.dispatchEvent(new window.Event('click', { bubbles: true })) };
}

test('rubric cards open the chosen rubric through one delegated listener and disabled ones do nothing', () => {
  const f = load('shared-rubrics-view.js', 'sharedRubricsViewBrowser_'), opened = [];
  f.view.render(f.host, DATA, (key, trigger) => opened.push([key, trigger.tagName]));
  f.view.render(f.host, DATA, (key, trigger) => opened.push([key, trigger.tagName]));
  const buttons = f.host.querySelectorAll('[data-rubric-key="review1"]');
  assert.equal(buttons.length, 2, 'desktop card and mobile action');
  f.click(buttons[0]);
  assert.deepEqual(opened, [['review1', 'BUTTON']], 're-rendering does not stack listeners');
  f.click(f.host.querySelector('[data-rubric-key="see"][disabled]'));
  assert.equal(opened.length, 1);
});

test('a failed load shows Retry that calls back once', () => {
  const f = load('shared-rubrics-view.js', 'sharedRubricsViewBrowser_');
  let retries = 0;
  f.view.renderError(f.host, () => retries++);
  assert.match(f.host.textContent, /Unable to load rubrics/);
  f.click(f.host.querySelector('[data-rubric-retry]'));
  assert.equal(retries, 1);
});

test('rubric cards and drawer details escape every value and use only compiled classes', () => {
  const f = load('shared-rubrics-view.js', 'sharedRubricsViewBrowser_');
  f.view.render(f.host, { assessments: DATA.assessments.map(a => ({ ...a, label: evil })) }, () => {});
  const drawer = parseHTML('<div id="d"></div>').document.getElementById('d');
  drawer.innerHTML = f.view.detailMarkup(DATA.assessments[0]);
  for (const root of [f.host, drawer]) {
    assert.equal(root.querySelectorAll('img').length, 0);
    assert.deepEqual(Array.from(root.querySelectorAll('*')).flatMap(n => Array.from(n.attributes).map(a => a.name)).filter(name => /^(on|style)/i.test(name)), []);
    assert.deepEqual(missingClasses(renderedClasses(root).filter(c => !c.startsWith('lucide'))), []);
  }
  assert(drawer.textContent.includes('Level 5') && drawer.textContent.includes('Excellent'));
  assert(drawer.textContent.includes(evil), 'text content is the literal, escaped value');
});

test('the timeline view escapes labels, toggles delegated and uses only compiled classes', () => {
  const f = load('shared-timeline-view.js', 'sharedTimelineViewBrowser_');
  const data = { today: 100, milestones: [-10, -8, -5, -2, 2, 5, 8].map((offset, i) => ({ key: 'm' + i, label: i === 0 ? evil : 'Milestone ' + i, day: 100 + offset, date: '30 Sep 2026' })) };
  f.view.render(f.host, data); f.view.render(f.host, data);
  assert.equal(f.host.querySelectorAll('img').length, 0);
  const visible = () => Array.from(f.host.querySelectorAll('[data-timeline-stop]')).filter(el => !el.hidden).length;
  assert.equal(visible(), 5);
  f.click(f.host.querySelector('[data-timeline-toggle]'));
  assert.equal(visible(), 7, 'one click expands once even after two renders');
  f.click(f.host.querySelector('[data-timeline-toggle]'));
  assert.equal(visible(), 5);
  assert.deepEqual(missingClasses(renderedClasses(f.host).filter(c => !c.startsWith('lucide'))), []);
  let retries = 0;
  f.view.renderError(f.host, () => retries++); f.click(f.host.querySelector('[data-timeline-retry]'));
  assert.equal(retries, 1);
});
