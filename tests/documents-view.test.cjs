// The Documents view (documents-view.js): what each role sees from the DTO, and the writes it sends through the bridge.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { parseHTML } = require('linkedom');
const { loadSources } = require('./invariants/golden.cjs');
const { missingClasses, renderedClasses } = require('./compiled-css.cjs');

const cap = (allowed, reason = '') => ({ allowed, reason, activity: null, requirements: [] });
const author = { name: 'Ann', login: 'ann', outsideMember: false };
const doc = (extra = {}) => ({
  documentId: 'doc-0001', fileName: 'Step1.docx', folder: '1_Documents', extension: 'docx', status: 'NOT_SUBMITTED', state: 'active', statusText: 'Not submitted yet', revision: 0,
  existing: false, teamChanged: 'Yes', checkedAt: '2030-01-01T00:00:00.000Z', returnedNotes: '', link: 'https://drive.google.com/file/d/f1/view', submittedBy: null,
  commit: null, history: [], can: { submit: cap(true), approve: cap(false), return: cap(false), reopen: cap(false) }, ...extra
});
const dto = (documents, roles = { student: true }) => ({ teamId: 'T1', scannedAt: '2030-01-01T00:00:00.000Z', roles, documents });

function setup(options = {}) {
  const { document, window } = parseHTML('<html><body><div id="host"></div></body></html>');
  const c = loadSources(['data-bridge-client.js', 'title-requests.js', 'documents-view.js'], { document, Promise, JSON, setTimeout, clearTimeout, setImmediate, Date });
  const bridge = vm.runInContext('(' + c.dataBridgeBrowser_.toString() + ')()', c);
  const calls = [], control = { dto: options.dto || dto([doc()]), error: null, code: 'REJECTED', confirm: true, preview: null, dialogs: [] };
  bridge.useTransport(async (method, args) => {
    calls.push([method, args]);
    if (method === 'API_documents_get') return JSON.stringify(control.dto ? { ok: true, data: control.dto } : { ok: false, error: { code: 'UNAVAILABLE', message: 'Down' } });
    if (method === 'API_student_previewDocument') return JSON.stringify({ ok: true, data: control.preview || { documentId: 'doc-0001', fileName: 'Step1.docx', commit: { sha: 'abcdef1234', shortSha: 'abcdef1', date: '2030-01-01T00:00:00.000Z', author }, lastTeamChange: author } });
    return control.error ? JSON.stringify({ ok: false, error: { code: control.code, message: control.error } }) : JSON.stringify({ ok: true, data: { ok: true, revision: 1, status: 'NEEDS_REVIEW', message: 'Done.' } });
  });
  const ui = {
    busy: require('./busy-fixture.cjs')(), renderSkeleton: (variant, label) => '<span data-skeleton>' + label + '</span>', beginContentLoading: () => () => {},
    confirmDialog: options => { control.dialogs.push(options); return Promise.resolve(control.confirm); }
  };
  vm.runInContext('globalThis.__make = ' + c.documentsViewBrowser_.toString(), c);
  const requests = c.titleRequestsBrowser_();
  const view = c.__make(bridge, () => ui, () => requests);
  const host = document.getElementById('host');
  const settle = () => new Promise(resolve => setTimeout(resolve, 10));
  const click = selector => { const el = host.querySelector(selector); el.dispatchEvent(new window.Event('click', { bubbles: true })); return settle(); };
  return { view, host, calls, control, settle, click, requests };
}
const text = node => node.textContent.replace(/\s+/g, ' ').trim();

test('a student sees the status, the file link and a Submit button when the DTO allows it, and no notes or reopen controls', async () => {
  const f = setup();
  await f.view.mount(f.host, '');
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls[0])), ['API_documents_get', []]);
  const card = f.host.querySelector('[data-document-card="doc-0001"]');
  assert(text(card).includes('Step1.docx') && text(card).includes('Not submitted yet'));
  assert.equal(card.querySelector('a').getAttribute('href'), 'https://drive.google.com/file/d/f1/view');
  assert(f.host.querySelector('[data-doc-action="submit"]'));
  for (const hook of ['approve', 'return', 'reopen']) assert.equal(f.host.querySelector('[data-doc-action="' + hook + '"]'), null);
  assert.deepEqual(missingClasses(renderedClasses(f.host)), []);
});

test('a student who cannot submit sees the reason, never a button', async () => {
  const f = setup({ dto: dto([doc({ can: { submit: cap(false, 'No team member has changed this file yet.'), approve: cap(false), return: cap(false), reopen: cap(false) } })]) });
  await f.view.mount(f.host, '');
  assert.equal(f.host.querySelector('[data-doc-action="submit"]'), null);
  assert(text(f.host).includes('No team member has changed this file yet.'));
});

test('submit previews the latest commit, asks the student to confirm, then sends the commit it showed', async () => {
  const f = setup();
  await f.view.mount(f.host, '');
  await f.click('[data-doc-action="submit"]');
  await f.settle();
  assert.equal(f.calls[1][0], 'API_student_previewDocument');
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls[1][1])), [{ documentId: 'doc-0001' }]);
  assert(f.control.dialogs[0].body.includes('abcdef1') && f.control.dialogs[0].body.includes('Ann (@ann)'));
  const write = f.calls.find(call => call[0] === 'API_student_submitDocument');
  assert(write, 'a write was sent');
  const input = write[1][0];
  assert.equal(input.expectedCommit, 'abcdef1234');
  assert.equal(input.expectedRevision, 0);
  assert.equal(input.documentId, 'doc-0001');
  assert.match(input.requestId, /\S{8}/);
  assert.equal(f.calls[f.calls.length - 1][0], 'API_documents_get', 'the list is read again after the write');
});

test('cancelling the confirmation sends no write', async () => {
  const f = setup();
  f.control.confirm = false;
  await f.view.mount(f.host, '');
  await f.click('[data-doc-action="submit"]');
  await f.settle();
  assert.equal(f.calls.some(call => call[0] === 'API_student_submitDocument'), false);
});

test('an outside committer is named as an outside member', async () => {
  const f = setup();
  f.control.preview = { documentId: 'doc-0001', fileName: 'Step1.docx', commit: { sha: 'abcdef1234', shortSha: 'abcdef1', date: '', author: { name: null, login: 'zed', outsideMember: true } }, lastTeamChange: author };
  await f.view.mount(f.host, '');
  await f.click('[data-doc-action="submit"]');
  await f.settle();
  assert(f.control.dialogs[0].body.includes('Outside member (@zed)'));
});

test('a guide approves or returns; return needs notes and sends the team and revision', async () => {
  const f = setup({ dto: dto([doc({ status: 'NEEDS_REVIEW', revision: 1, state: 'waiting', statusText: 'Waiting for your guide',
    submittedBy: { name: 'Bob', email: 'b@x', at: '2030-01-02T00:00:00.000Z' }, commit: { sha: 'abcdef1234', shortSha: 'abcdef1', committedBy: author, lastTeamChange: null },
    can: { submit: cap(false), approve: cap(true), return: cap(true), reopen: cap(false) } })], { guide: true }) });
  await f.view.mount(f.host, 'T1');
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls[0])), ['API_documents_get', ['T1']]);
  assert(text(f.host).includes('Submitted by: Bob (b@x)') && text(f.host).includes('Committed by: Ann (@ann)'));
  await f.click('[data-doc-action="return"]');
  assert(text(f.host.querySelector('[data-doc-status]')).includes('Say what the team should change'));
  assert.equal(f.calls.some(call => call[0] === 'API_guide_decideDocument'), false);
  f.host.querySelector('[data-doc-notes]').value = ' fix the table ';
  await f.click('[data-doc-action="return"]');
  const write = f.calls.find(call => call[0] === 'API_guide_decideDocument')[1][0];
  assert.deepEqual([write.teamId, write.documentId, write.decision, write.notes, write.expectedRevision], ['T1', 'doc-0001', 'return', 'fix the table', 1]);
});

test('the coordinator reopens with a reason', async () => {
  const f = setup({ dto: dto([doc({ status: 'APPROVED', revision: 2, state: 'done', statusText: 'Approved', can: { submit: cap(false), approve: cap(false), return: cap(false), reopen: cap(true) } })], { coordinator: true }) });
  await f.view.mount(f.host, 'T1');
  await f.click('[data-doc-action="reopen"]');
  assert(text(f.host).includes('Enter a reason for reopening.'));
  f.host.querySelector('[data-doc-reason]').value = 'correction';
  await f.click('[data-doc-action="reopen"]');
  const write = f.calls.find(call => call[0] === 'API_coordinator_reopenDocument')[1][0];
  assert.deepEqual([write.teamId, write.reason, write.expectedRevision], ['T1', 'correction', 2]);
});

test('a returned document shows the guide\'s notes; a failed write keeps the list and shows the server message', async () => {
  const f = setup({ dto: dto([doc({ status: 'RETURNED', revision: 2, returnedNotes: 'Add the diagram' })]) });
  await f.view.mount(f.host, '');
  assert(text(f.host).includes('Add the diagram'));
  f.control.error = 'Another submission is in progress.'; f.control.code = 'CONFLICT';
  await f.click('[data-doc-action="submit"]');
  await f.settle();
  assert(f.host.querySelector('[data-document-card]'), 'the list is still shown');
  assert(text(f.host).includes('Another submission is in progress.'));
});

test('a failed first load offers Retry, and the retry loads the list', async () => {
  const f = setup();
  const good = f.control.dto; f.control.dto = null;
  await f.view.mount(f.host, '');
  assert(text(f.host.querySelector('[data-doc-error]')).includes('Down'));
  f.control.dto = good;
  await f.click('[data-doc-action="retry"]');
  assert(f.host.querySelector('[data-document-card]'));
  assert.equal(f.host.querySelector('[data-doc-error]'), null);
});

test('markup is escaped and a non-http link is not followed', async () => {
  const f = setup({ dto: dto([doc({ fileName: '<img src=x onerror=1>.docx', link: 'javascript:alert(1)' })]) });
  await f.view.mount(f.host, '');
  assert.equal(f.host.querySelector('img'), null);
  assert.equal(f.host.querySelector('a').getAttribute('href'), '#');
  assert.equal(f.host.querySelector('[onclick],[onerror]'), null);
});
