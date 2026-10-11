// The student's title card (student-title.js): what it shows for each state, and the two student writes it sends.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { parseHTML } = require('linkedom');
const { loadSources } = require('./invariants/golden.cjs');
const { missingClasses, renderedClasses } = require('./compiled-css.cjs');

const cap = (allowed, reason = '', requirements = []) => ({ allowed, reason, activity: null, requirements });
const dto = (extra = {}) => ({
  teamId: 'T1', revision: 2, status: 'RETURNED', reopened: false, proposal: { title: 'OLD IDEA', problem: 'Old problem' }, notes: 'Too broad', approved: { value: false, title: '', problem: '', at: null, by: '' },
  reopen: null, folderUrl: 'https://drive.example.com/T1', state: 'active', statusText: 'Changes requested — update and resubmit', due: { date: '10 Jan', overdue: false },
  documents: [{ key: 'work', label: 'Work Breakdown document', present: true, uploadedBy: 'ann@x.edu', uploadedAt: '2026-01-02T10:00:00.000Z' }, { key: 'need', label: 'Need Analysis document', present: false, uploadedBy: null, uploadedAt: null }],
  can: { submit: cap(true), upload: { work: cap(true), need: cap(false, 'Documents cannot change while the title is under review.') } }, ...extra
});

function setup(options = {}) {
  const { document, window } = parseHTML('<html><body><div id="host"></div></body></html>');
  class FakeReader { readAsDataURL(file) { setImmediate(() => { this.result = 'data:application/octet-stream;base64,' + Buffer.from(file.content || 'PK-data').toString('base64'); this.onload(); }); } }
  const c = loadSources(['data-bridge-client.js', 'title-requests.js', 'student-title.js'], { document, Promise, JSON, setTimeout, clearTimeout, setImmediate, FileReader: FakeReader, Date });
  const bridge = vm.runInContext('(' + c.dataBridgeBrowser_.toString() + ')()', c);
  const writes = [], control = { error: null, code: 'REJECTED', reloads: 0, reloadResult: null };
  bridge.useTransport(async (method, args) => {
    writes.push([method, args]);
    return control.error ? JSON.stringify({ ok: false, error: { code: control.code, message: control.error } }) : JSON.stringify({ ok: true, data: { ok: true, revision: 3, status: 'NEEDS_REVIEW' } });
  });
  const ui = { busy: require('./busy-fixture.cjs')() };
  vm.runInContext('globalThis.__make = ' + c.studentTitleBrowser_.toString(), c);
  const requests = c.titleRequestsBrowser_();
  const view = { reloadProject: () => { control.reloads++; if (control.afterReload) control.afterReload(); return Promise.resolve(); } };
  const title = c.__make(bridge, () => ui, () => requests, () => view);
  const host = document.getElementById('host');
  const render = value => { host.innerHTML = title.markup(value); };
  render(options.dto || dto());
  const settle = () => new Promise(resolve => setTimeout(resolve, 5));
  return { c, title, host, writes, control, render, settle, window, document };
}
const text = node => node.textContent.replace(/\s+/g, ' ').trim();
const submitEvent = f => ({ preventDefault() { this.prevented = true; }, prevented: false });

test('a returned title shows the feedback, the proposal to edit, the documents and an enabled Resubmit button', () => {
  const f = setup();
  const body = text(f.host);
  for (const expected of ['Changes requested — update and resubmit', 'Submitted title: OLD IDEA', 'Feedback: Too broad', 'Approval due 10 Jan', 'Open team folder', 'Work Breakdown document', 'Uploaded', 'uploaded by ann@x.edu', 'Need Analysis document', 'Not uploaded']) assert(body.includes(expected), expected);
  assert.equal(f.host.querySelector('[data-title-field="title"]').value, 'OLD IDEA');
  assert.equal(f.host.querySelector('[data-title-field="problem"]').value, 'Old problem');
  assert.equal(text(f.host.querySelector('[data-title-form] button[type="submit"]')), 'Resubmit title');
  assert.equal(f.host.querySelector('[data-title-form] button[type="submit"]').disabled, false);
  const need = f.host.querySelector('[data-document="need"]');
  assert.equal(need.querySelector('[data-action="title-upload"]').disabled, true);
  assert(text(need).includes('Documents cannot change while the title is under review.'));
  assert.equal(f.host.querySelector('[data-document="work"] [data-action="title-upload"]').disabled, false);
  assert.equal(text(f.host.querySelector('[data-document="work"] [data-action="title-upload"]')), 'Replace (.docx)');
});

test('the states: not submitted, under review, approved, reopened and unavailable', () => {
  const f = setup({ dto: dto({ status: 'NOT_SUBMITTED', notes: '', proposal: { title: '', problem: '' }, statusText: 'Not submitted yet' }) });
  assert.equal(text(f.host.querySelector('[data-title-form] button[type="submit"]')), 'Submit title');
  assert.doesNotMatch(text(f.host), /Feedback/);
  f.render(dto({ status: 'NEEDS_REVIEW', statusText: "Submitted — awaiting your guide's review", state: 'waiting', can: { submit: cap(false, 'The title is under review and cannot be changed now.'), upload: { work: cap(false, 'x'), need: cap(false, 'x') } } }));
  assert.equal(f.host.querySelector('[data-title-form]'), null);
  assert(text(f.host).includes('The title is under review and cannot be changed now.'));
  f.render(dto({ status: 'APPROVED', state: 'done', statusText: 'Approved', approved: { value: true, title: 'GOOD IDEA', problem: 'p', at: '2026-01-02T00:00:00.000Z', by: 'r@x' }, notes: '',
    can: { submit: cap(false, 'The title is approved. Ask the coordinator to reopen it to change it.'), upload: { work: cap(false), need: cap(false) } } }));
  assert(text(f.host).includes('Approved title: GOOD IDEA'));
  assert.equal(f.host.querySelector('[data-title-form]'), null);
  f.render(dto({ status: 'REOPENED', reopened: true, state: 'active', statusText: 'Reopened by the coordinator — you may submit a change', approved: { value: true, title: 'GOOD IDEA', problem: 'p', at: 'x', by: 'r' }, proposal: { title: 'GOOD IDEA', problem: 'p' }, notes: '',
    reopen: { reason: 'Scope change', by: 'c@x', at: 'x' } }));
  assert(text(f.host).includes('Reopened: Scope change'));
  assert(f.host.querySelector('[data-title-form]'));
  f.render({ teamId: 'T1', status: 'UNAVAILABLE', state: 'waiting', statusText: 'The title cannot be shown right now — contact the coordinator', due: { date: 'x', overdue: false }, can: null });
  assert.equal(f.host.querySelector('[data-title-form]'), null);
  assert(text(f.host).includes('contact the coordinator'));
});

test('unmet requirements are listed with their reasons and the form is disabled with the reason', () => {
  const f = setup({ dto: dto({ status: 'NOT_SUBMITTED', notes: '', can: { submit: cap(false, 'GitHub setup complete: Waiting for teammates.', [{ label: 'GitHub setup complete', met: false, reason: 'Waiting for teammates.' }, { label: 'Work Breakdown document', met: true, reason: '' }]), upload: { work: cap(true), need: cap(true) } } }) });
  const list = text(f.host.querySelector('[data-title-checklist]'));
  assert(list.includes('GitHub setup complete') && list.includes('Waiting for teammates.') && list.includes('Work Breakdown document') && list.includes('Done'));
  assert.equal(f.host.querySelector('[data-title-form] button[type="submit"]').disabled, true);
  assert.equal(f.host.querySelector('[data-title-field="title"]').disabled, true);
  assert(text(f.host).includes('GitHub setup complete: Waiting for teammates.'));
});

test('submitting sends one write with the revision shown, then reloads the project', async () => {
  const f = setup();
  f.host.querySelector('[data-title-field="title"]').value = ' Better idea ';
  f.host.querySelector('[data-title-field="problem"]').value = 'A better problem';
  const event = submitEvent();
  const done = f.title.submit(event, f.host.querySelector('[data-title-form]'));
  assert.equal(event.prevented, true);
  await done;
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0][0], 'API_student_submitTitle');
  const sent = f.writes[0][1][0];
  assert.match(sent.requestId, /^\S{8,}$/);
  assert.deepEqual({ ...sent, requestId: 'x' }, { requestId: 'x', expectedRevision: 2, title: ' Better idea ', problem: 'A better problem' });
  assert.equal(f.control.reloads, 1);
});

test('an empty title or problem sends nothing', async () => {
  const f = setup();
  f.host.querySelector('[data-title-field="title"]').value = '  ';
  await f.title.submit(submitEvent(), f.host.querySelector('[data-title-form]'));
  assert.equal(f.host.querySelector('[data-title-status]').textContent, 'Enter a project title.');
  f.host.querySelector('[data-title-field="title"]').value = 'T';
  f.host.querySelector('[data-title-field="problem"]').value = '';
  await f.title.submit(submitEvent(), f.host.querySelector('[data-title-form]'));
  assert.equal(f.host.querySelector('[data-title-status]').textContent, 'Enter the problem statement.');
  assert.equal(f.writes.length, 0);
});

test('a failed submit shows the message and keeps the typed text; a retry of the same content keeps its request ID after an uncertain failure only', async () => {
  const f = setup();
  const form = () => f.host.querySelector('[data-title-form]');
  f.host.querySelector('[data-title-field="title"]').value = 'Idea';
  f.control.error = 'Busy, try again.'; f.control.code = 'UNAVAILABLE';
  await f.title.submit(submitEvent(), form());
  assert.equal(f.host.querySelector('[data-title-status]').textContent, 'Busy, try again.');
  assert.equal(f.host.querySelector('[data-title-field="title"]').value, 'Idea');
  assert.equal(f.control.reloads, 0);
  await f.title.submit(submitEvent(), form());
  assert.equal(f.writes[1][1][0].requestId, f.writes[0][1][0].requestId, 'same content, uncertain failure: same request ID');
  f.control.code = 'INVALID_INPUT'; f.control.error = 'Enter a project title.';
  await f.title.submit(submitEvent(), form());
  await f.title.submit(submitEvent(), form());
  assert.notEqual(f.writes[3][1][0].requestId, f.writes[2][1][0].requestId, 'after a definite refusal the next attempt is a new request');
});

test('a conflict or refusal reloads the project and the message survives the reload', async () => {
  const f = setup();
  f.control.error = 'This title changed since you opened it.'; f.control.code = 'CONFLICT';
  f.control.afterReload = () => f.render(dto());
  await f.title.submit(submitEvent(), f.host.querySelector('[data-title-form]'));
  assert.equal(f.control.reloads, 1);
  assert.equal(text(f.host.querySelector('[data-title-notice]')), 'This title changed since you opened it.');
  f.render(dto());
  assert.equal(f.host.querySelector('[data-title-notice]'), null, 'the notice is shown once');
});

test('choosing a file uploads it as base64 under its document key, then reloads', async () => {
  const f = setup();
  const input = f.host.querySelector('[data-doc-input="need"]');
  const file = { name: 'plan.DOCX', size: 1234, lastModified: 99, type: '', content: 'PK-hello' };
  Object.defineProperty(input, 'files', { value: [file], configurable: true });
  await f.title.upload(input);
  assert.equal(f.writes.length, 1);
  assert.equal(f.writes[0][0], 'API_student_uploadDocument');
  const sent = f.writes[0][1][0];
  assert.deepEqual({ ...sent, requestId: 'x' }, { requestId: 'x', documentKey: 'need', fileName: 'plan.DOCX', mimeType: '', dataBase64: Buffer.from('PK-hello').toString('base64') });
  assert.match(sent.requestId, /^\S{8,}$/);
  assert.equal(f.control.reloads, 1);
});

test('a file that is not .docx or is over 10 MB is refused before anything is sent', async () => {
  const f = setup();
  const input = f.host.querySelector('[data-doc-input="work"]');
  const status = f.host.querySelector('[data-document="work"] [data-document-status]');
  Object.defineProperty(input, 'files', { value: [{ name: 'plan.pdf', size: 10, lastModified: 1 }], configurable: true });
  await f.title.upload(input);
  assert.equal(status.textContent, 'Choose a Word document (.docx).');
  Object.defineProperty(input, 'files', { value: [{ name: 'plan.docx', size: 11 * 1024 * 1024, lastModified: 1 }], configurable: true });
  await f.title.upload(input);
  assert.equal(status.textContent, 'The file is larger than 10 MB.');
  assert.equal(f.writes.length, 0);
});

test('a failed upload shows the message; an upload retried with the same file keeps its request ID after an uncertain failure', async () => {
  const f = setup();
  const input = f.host.querySelector('[data-doc-input="work"]');
  const status = f.host.querySelector('[data-document="work"] [data-document-status]');
  Object.defineProperty(input, 'files', { value: [{ name: 'a.docx', size: 5, lastModified: 7, content: 'PK1' }], configurable: true });
  f.control.error = 'Drive is busy'; f.control.code = 'TRANSPORT';
  await f.title.upload(input);
  assert.equal(status.textContent, 'Drive is busy');
  await f.title.upload(input);
  assert.equal(f.writes[1][1][0].requestId, f.writes[0][1][0].requestId);
  assert.equal(f.control.reloads, 0);
});

test('pick opens the file chooser of its own document', () => {
  const f = setup();
  let clicked = null;
  f.host.querySelectorAll('[data-doc-input]').forEach(input => { input.click = () => { clicked = input.getAttribute('data-doc-input'); }; });
  f.title.pick(f.host.querySelector('[data-document="need"] [data-action="title-upload"]'));
  assert.equal(clicked, 'need');
});

test('escapes every value, makes no inline handlers and renders only compiled classes', () => {
  const evil = '<img src=x onerror=alert(1)>"\'&';
  const f = setup({ dto: dto({ statusText: evil, notes: evil, proposal: { title: evil, problem: evil }, folderUrl: 'javascript:alert(1)', due: { date: evil, overdue: true },
    documents: [{ key: 'work', label: evil, present: true, uploadedBy: evil, uploadedAt: 'bad' }, { key: 'need', label: evil, present: false, uploadedBy: null, uploadedAt: null }],
    can: { submit: cap(true, '', [{ label: evil, met: false, reason: evil }]), upload: { work: cap(false, evil), need: cap(true) } } }) });
  assert.equal(f.host.querySelectorAll('img').length, 0);
  assert.deepEqual(Array.from(f.host.querySelectorAll('*')).flatMap(n => Array.from(n.attributes).map(a => a.name)).filter(name => /^on/i.test(name)), []);
  assert(Array.from(f.host.querySelectorAll('a')).every(a => !/^javascript:/i.test(a.getAttribute('href'))));
  assert.equal(f.host.querySelector('[data-title-field="title"]').value, evil);
  const good = setup();
  assert.deepEqual(missingClasses(renderedClasses(good.host)), []);
});

test('source rules: no google.script.run, no inline handlers, no inline styles', () => {
  const source = fs.readFileSync('student-title.js', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '');
  assert.doesNotMatch(source, /google\.script|onclick=|onchange=|\bstyle="|\.style\./);
});
