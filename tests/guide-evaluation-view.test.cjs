// Guide Evaluation editor: reads and saves through the bridge; markup uses compiled Tailwind utilities.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { parseHTML } = require('linkedom');
const { Sync } = require('./sync-promise.cjs');

const criteria = [{ pi: 'G1', name: 'Initiative <b>', co: 'CO1', maxMarks: 20, descriptors: ['d0', 'd1', 'd2', 'd3', 'd4', 'd5'] }, { pi: 'G2', name: 'Communication', co: 'CO2', maxMarks: 20, descriptors: ['d0', 'd1', 'd2', 'd3', 'd4', 'd5'] }];
const config = { criteria, maximum: 40, weight: .6, due: 20454 };
const load = (register = 'S1', extra = {}) => ({
  roster: { team: 'T1', students: [{ register: 'S1', name: 'Asha' }, { register: 'S2', name: 'Ravi <i>' }] }, student: { register },
  statuses: [{ register: 'S1', status: 'Draft' }, { register: 'S2', status: 'Not started' }], config, evaluation: null, overdue: false, repository: 'https://github.com/org/team',
  revision: 0, token: 'tok', entries: [{ register: 'S1', revision: 0, evaluation: null }, { register: 'S2', revision: 2, evaluation: null }], ...extra });

function setup() {
  const { document, window } = parseHTML('<html><body><section id="guideEvaluationEditor" hidden></section></body></html>');
  const host = document.getElementById('guideEvaluationEditor');
  host.scrollIntoView = () => {};
  const requests = [], asked = [], events = { weekly: [], logs: [], ai: { weeks: 0, average: null, max: 10 } };
  let confirm = true;
  const bridge = {
    read: (key, method, args) => { const p = new Sync(); requests.push({ kind: 'read', key, method, args, ok: v => p.resolve(v), fail: e => p.reject(e) }); return p; },
    write: (method, args) => { const p = new Sync(); requests.push({ kind: 'write', method, input: args[0], ok: v => p.resolve(v), fail: e => p.reject(e) }); return p; }
  };
  const ctx = vm.createContext({ document, window: { addEventListener() {} }, crypto: { randomUUID: (() => { let n = 0; return () => 'req-' + (++n) + '-uuid'; })() }, Date, JSON,
    DashboardUI: { busy: require('./busy-fixture.cjs')(), renderSkeleton: () => '<span data-skeleton></span>', renderIcon: () => '<svg data-icon></svg>', ask: async text => { asked.push(text); return confirm; } },
    GuideWeekly: { selectView: v => events.weekly.push(['view', v]), evaluationStatus: (t, s) => events.weekly.push(['status', t, s]) } });
  vm.runInContext(fs.readFileSync('guide-evaluation-client.js', 'utf8'), ctx);
  const api = ctx.guideEvaluationBrowser_(bridge, () => ({ openWeeklyLogs: (...args) => events.logs.push(args), aiScoreFor: () => events.ai, whenData: fn => fn() }));
  const flush = () => new Promise(r => setImmediate(r));
  return { api, host, document, window, requests, asked, events, flush, setConfirm: v => { confirm = v; }, el: id => document.getElementById(id) };
}
const fieldset = (f, pi) => f.host.querySelector('fieldset[data-pi="' + pi + '"]');
// linkedom has no select.value setter; define the value the module reads.
const setValue = (node, value) => Object.defineProperty(node, 'value', { value: String(value), writable: true, configurable: true });
const fill = (f, pi, level, marks, remark) => {
  const fs_ = fieldset(f, pi); setValue(fs_.querySelector('[data-level]'), level); fs_.querySelector('[data-marks]').value = String(marks); fs_.querySelector('[data-marks-slider]').value = String(marks); fs_.querySelector('[data-remark]').value = remark;
  fs_.querySelectorAll('input,select,textarea').forEach(n => n.dispatchEvent(new f.window.Event('input', { bubbles: true })));
};

test('opening reads through the bridge, shows the editor and reports statuses to the weekly workspace', async () => {
  const f = setup();
  const opened = f.api.open('T1', 'S1'); await f.flush();
  assert.equal(f.host.hidden, false); assert.match(f.host.innerHTML, /data-skeleton/);
  assert.deepEqual(JSON.parse(JSON.stringify(f.requests[0].args)), ['T1', 'S1']); assert.equal(f.requests[0].method, 'API_guide_getEvaluation');
  f.requests[0].ok(load()); await opened;
  assert.equal(f.host.dataset.team, 'T1');
  assert.deepEqual(f.events.weekly[0], ['view', 'evaluation']);
  assert.equal(f.events.weekly.at(-1)[0], 'status');
  assert.equal(f.host.querySelectorAll('fieldset').length, 2);
  assert.equal(f.host.querySelector('h2, h3'), null); assert.match(f.host.textContent, /Not started/);
  assert.equal(f.host.querySelectorAll('#guideEvalStudent option').length, 2);
  assert.equal(f.host.querySelector('b'), null); assert.equal(f.host.querySelector('i'), null);
});

test('a failed read shows the reason with Retry and ignores superseded replies', async () => {
  const f = setup();
  const first = f.api.open('T1', 'S1'); f.requests[0].fail({ message: 'Offline' });
  assert.match(f.host.textContent, /Unable to load: Offline/);
  f.host.querySelector('[data-guide-retry]').click(); assert.equal(f.requests.length, 2);
  f.requests[1].ok(load('S1')); assert.equal(f.host.querySelectorAll('fieldset').length, 2);
  void first;
});

test('level and marks update the permitted range and the total preview', async () => {
  const f = setup(); f.api.open('T1', 'S1'); f.requests[0].ok(load());
  fill(f, 'G1', 3, 15, 'fine'); fill(f, 'G2', 2, 12, 'ok');
  assert.match(fieldset(f, 'G1').querySelector('[data-range]').textContent, /Permitted: 15–16\.5 pts/);
  assert.match(f.el('guideEvalTotal').textContent, /Preview: 27\.00 \/ 40 · 40\.50 \/ 60/);
});

test('draft save sends the form once, keeps the same request id until the form changes, and reloads on success', async () => {
  const f = setup(); f.api.open('T1', 'S1'); f.requests[0].ok(load('S1', { revision: 2 }));
  fill(f, 'G1', 3, 15, 'fine'); fill(f, 'G2', 2, 12, 'ok');
  f.el('guideEvalDraft').click(); await f.flush();
  const first = f.requests.at(-1);
  assert.equal(first.method, 'API_guide_saveEvaluationDraft'); assert.equal(first.input.team, 'T1'); assert.equal(first.input.student, 'S1'); assert.equal(first.input.revision, 2); assert.equal(first.input.token, 'tok');
  assert.deepEqual(JSON.parse(JSON.stringify(first.input.scores.G1)), { level: 3, marks: '15', remark: 'fine' });
  assert.equal(f.el('guideEvalDraft').disabled, true);
  first.fail({ message: 'network' }); await f.flush();
  assert.match(f.el('guideEvalMessage').textContent, /network.*same request ID/);
  assert.equal(f.el('guideEvalDraft').disabled, false); assert.equal(fieldset(f, 'G1').querySelector('[data-marks]').value, '15');
  f.el('guideEvalDraft').click(); await f.flush();
  assert.equal(f.requests.at(-1).input.requestId, first.input.requestId);
  f.requests.at(-1).fail({ message: 'again' }); await f.flush();
  fill(f, 'G1', 4, 17, 'better'); f.el('guideEvalDraft').click(); await f.flush();
  const third = f.requests.at(-1); assert.notEqual(third.input.requestId, first.input.requestId);
  const before = f.requests.length; third.ok({ status: 'Draft' }); await f.flush();
  assert.equal(f.requests.length, before + 1); assert.equal(f.requests.at(-1).method, 'API_guide_getEvaluation');
});

test('submit asks for confirmation first and sends the submit endpoint', async () => {
  const f = setup(); f.api.open('T1', 'S1'); f.requests[0].ok(load());
  fill(f, 'G1', 3, 15, 'fine'); fill(f, 'G2', 2, 12, 'ok');
  f.setConfirm(false); f.el('guideEvalSubmit').click(); await f.flush();
  assert.match(f.asked[0], /Submit this student/); assert.equal(f.requests.length, 1);
  f.setConfirm(true); f.el('guideEvalSubmit').click(); await f.flush();
  assert.equal(f.requests.at(-1).method, 'API_guide_submitEvaluation');
});

test('submitted evaluations are locked and explain how to get a correction', async () => {
  const f = setup(); f.api.open('T1', 'S1');
  f.requests[0].ok(load('S1', { evaluation: { status: 'Submitted', config, scores: { G1: { level: 3, marks: 15, remark: 'x' }, G2: { level: 2, marks: 12, remark: 'y' } } } }));
  assert(Array.from(f.host.querySelectorAll('fieldset input, fieldset select, fieldset textarea, #guideEvalDraft, #guideEvalSubmit')).every(n => n.disabled));
  assert.match(f.el('guideEvalMessage').textContent, /Submitted scores are locked/);
  assert.equal(fieldset(f, 'G1').querySelector('[data-marks]').value, '15');
});

test('switching students asks before discarding unsaved changes', async () => {
  const f = setup(); f.api.open('T1', 'S1'); f.requests[0].ok(load());
  fill(f, 'G1', 3, 15, 'fine');
  f.setConfirm(false);
  setValue(f.el('guideEvalStudent'), 'S2'); f.el('guideEvalStudent').dispatchEvent(new f.window.Event('change', { bubbles: true })); await f.flush();
  assert.match(f.asked.at(-1), /Discard unsaved evaluation changes/); assert.equal(f.requests.length, 1);
});

test('markup uses only compiled Tailwind utilities and no inline handlers', async () => {
  const { missingClasses, renderedClasses } = require('./compiled-css.cjs');
  const f = setup(); f.api.open('T1', 'S1'); f.requests[0].ok(load());
  assert.deepEqual(missingClasses(renderedClasses(f.host)), []);
  const src = fs.readFileSync('guide-evaluation-client.js', 'utf8');
  assert.deepEqual(missingClasses([...src.matchAll(/(?:FIELD|SMALL|BUTTON|PRIMARY)='([^']+)'/g)].flatMap(m => m[1].split(/\s+/))), []);
  assert.deepEqual(Array.from(f.host.querySelectorAll('*')).flatMap(n => Array.from(n.attributes).map(a => a.name)).filter(name => /^on/i.test(name)), []);
});

test('a student not opened yet starts on PI1 and moving needs no new read', async () => {
  const f = setup(); f.api.open('T1', 'S1'); f.requests[0].ok(load());
  f.host.querySelector('[data-select-pi="G2"]').click();
  f.host.querySelector('[data-student-step="1"]').click(); await f.flush();
  assert.equal(f.requests.length, 1);
  assert.equal(f.el('guideEvalStudent').value, 'S2');
  assert.equal(fieldset(f, 'G1').hidden, false); assert.equal(fieldset(f, 'G2').hidden, true);
});

test('a student with a saved draft starts on the first PI not yet completed', async () => {
  const f = setup(); f.api.open('T1', 'S1');
  const draft = { status: 'Draft', config, scores: { G1: { level: 3, marks: 15, remark: 'ok' } } };
  f.requests[0].ok(load('S1', { entries: [{ register: 'S1', revision: 0, evaluation: null }, { register: 'S2', revision: 2, evaluation: draft }] }));
  f.host.querySelector('[data-student-step="1"]').click(); await f.flush();
  assert.equal(fieldset(f, 'G2').hidden, false); assert.equal(fieldset(f, 'G1').hidden, true);
});

test('Reload from sheet and a save read again; moving between students does not', async () => {
  const f = setup(); f.api.open('T1', 'S1'); f.requests[0].ok(load());
  f.el('guideEvalReload').click(); await f.flush();
  assert.equal(f.requests.length, 2); assert.equal(f.requests[1].method, 'API_guide_getEvaluation');
});

test('each student continues from the PI they were last on', async () => {
  const f = setup(); f.api.open('T1', 'S1'); f.requests[0].ok(load());
  f.host.querySelector('[data-select-pi="G2"]').click();
  f.host.querySelector('[data-student-step="1"]').click(); await f.flush();
  f.host.querySelector('[data-student-step="-1"]').click(); await f.flush();
  assert.equal(fieldset(f, 'G2').hidden, false); assert.equal(fieldset(f, 'G1').hidden, true);
});

test('standard feedback suggestions can be picked and combined with custom remarks', async () => {
  const f = setup(); f.api.open('T1', 'S1'); f.requests[0].ok(load());
  const field = fieldset(f, 'G1'), remark = field.querySelector('[data-remark]');
  setValue(field.querySelector('[data-level]'), 2); field.querySelector('[data-level]').dispatchEvent(new f.window.Event('input', { bubbles: true }));
  const buttons = field.querySelectorAll('[data-feedback]');
  assert.equal(buttons.length, 3); assert.equal(field.querySelector('[data-feedback-required]').hidden, true);
  buttons[0].click(); buttons[1].click();
  const lines = remark.value.split('\n');
  assert.equal(lines.length, 2); assert.equal(field.querySelector('[data-feedback="0"]').getAttribute('aria-pressed'), 'true');
  field.querySelector('[data-other-feedback]').click();
  const custom = field.querySelector('[data-custom-feedback]'); custom.value = 'My own note';
  custom.dispatchEvent(new f.window.Event('input', { bubbles: true }));
  assert.equal(remark.value, lines.join('\n') + '\nMy own note');
  field.querySelector('[data-feedback="0"]').click();
  assert.equal(remark.value, lines[1] + '\nMy own note');
  field.querySelector('[data-pick-level="1"]').click();
  assert.equal(remark.value, ''); assert.equal(field.querySelector('[data-feedback-required]').hidden, false);
});

test('the header opens the weekly logs of the shown student instead of linking to the repository', async () => {
  const f = setup(); f.api.open('T1', 'S1'); f.requests[0].ok(load('S1', { student: { register: 'S1', name: 'Asha' } }));
  assert.equal(f.host.querySelector('a[href^="https://github.com/"]'), null); assert.doesNotMatch(f.host.textContent, /Open team repository/);
  const button = f.host.querySelector('[data-weekly-logs]'); assert.match(button.textContent, /View all weekly logs/);
  button.click();
  assert.equal(f.events.logs.length, 1); assert.deepEqual(f.events.logs[0].slice(0, 2), ['S1', 'Asha']);
});

test('the sidebar shows the AI score averaged over the scored weeks out of 100 in plain text', async () => {
  const f = setup(); f.events.ai = { weeks: 4, average: 7.5, max: 10 };
  f.api.open('T1', 'S1'); f.requests[0].ok(load());
  const text = () => f.host.querySelector('[data-criteria-rail] [data-ai-score]').textContent.replace(/\s+/g, ' ').trim();
  assert.equal(f.host.querySelector('header [data-ai-score]'), null);
  assert.equal(f.host.querySelector('[data-ai-score]').hidden, false); assert.equal(text(), 'Weekly progress AI score75 / 100');
  f.events.ai = { weeks: 0, average: null, max: 10 };
  f.host.querySelector('[data-student-step="1"]').click(); await f.flush();
  assert.equal(text(), 'Weekly progress AI scoreNot scored yet');
  f.events.ai = { weeks: 1, average: 10, max: 10 };
  f.host.querySelector('[data-student-step="-1"]').click(); await f.flush();
  assert.equal(text(), 'Weekly progress AI score100 / 100');
});

test('opening another team while one is still loading replaces it, and the late reply never shows the old team', async () => {
  const f = setup();
  f.api.open('T1', 'S1'); await f.flush();
  f.api.open('T2', 'S9'); await f.flush();
  assert.equal(f.requests.length, 2); assert.deepEqual(JSON.parse(JSON.stringify(f.requests[1].args)), ['T2', 'S9']);
  f.requests[0].ok(load()); await f.flush();
  assert.match(f.host.innerHTML, /data-skeleton/); assert.equal(f.host.querySelectorAll('fieldset').length, 0);
  f.requests[1].ok(load('S9', { roster: { team: 'T2', students: [{ register: 'S9', name: 'Mira' }] }, student: { register: 'S9', name: 'Mira' }, statuses: [{ register: 'S9', status: 'Not started' }], entries: [{ register: 'S9', revision: 0, evaluation: null }] })); await f.flush();
  assert.equal(f.host.dataset.team, 'T2'); assert.match(f.host.textContent, /Mira/); assert.doesNotMatch(f.host.textContent, /Asha|Ravi/);
});

test('asking for the same student again while it loads does not start a second read', async () => {
  const f = setup();
  f.api.open('T1', 'S1'); await f.flush(); f.api.open('T1', 'S1'); await f.flush();
  assert.equal(f.requests.length, 1);
});
