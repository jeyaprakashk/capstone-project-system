// Team folders card: rendering from the DTO and the check/create actions, through a scripted bridge.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const { parseHTML } = require('linkedom');
const { loadSources } = require('./invariants/golden.cjs');

const FOLDERS = { configured: true, baseFolder: { name: 'Capstone <Files>', url: 'https://drive.example/base' }, teamDocuments: { exists: true, url: 'https://drive.example/docs' },
  total: 4, existing: 1, missing: ['T2', 'T3'], duplicates: ['T1'], collisions: ['A-1', 'A/1'], issues: ['Check this'], canCreate: true };
const STATUS_DTO = { github: { coordUsername: 'coord', reposWithAccess: 1, totalRepos: 1 }, publishing: { configured: true, items: [] } };

function setup() {
  const { document, window } = parseHTML('<html><body><div id="systemStatusContent"></div></body></html>');
  const calls = [];
  const c = loadSources(['data-bridge-client.js', 'system-status-view.js', 'system-status-actions.js'], { document, Promise, JSON, setTimeout, clearTimeout });
  const bridge = vm.runInContext('(' + c.dataBridgeBrowser_.toString() + ')()', c);
  const record = name => () => calls.push(name);
  const ui = { busy:require('./busy-fixture.cjs')(), renderIcon: n => '<svg class="lucide-' + n + '"></svg>', renderSkeleton: (v, l) => '<span data-skeleton>' + l + '</span>' };
  const actions = { recheckTeamFolders: record('recheck'), createTeamFolders: record('create') };
  vm.runInContext('globalThis.__view = ' + c.systemStatusViewBrowser_.toString(), c);
  const view = c.__view(bridge, () => ui, () => null, () => actions);
  const host = document.getElementById('systemStatusContent');
  view.render(host, STATUS_DTO);
  c.SystemStatusView = view;
  return { c, view, host, calls, click: el => el.dispatchEvent(new window.Event('click', { bubbles: true, cancelable: true })) };
}
const norm = n => n.textContent.replace(/\s+/g, ' ').trim();
const isHidden = (f, id) => f.host.querySelector('#' + id).hasAttribute('hidden');

test('the card renders its hooks while loading, and its buttons hand off to the dashboard', () => {
  const f = setup();
  for (const id of ['teamFoldersCard', 'teamFoldersSummary', 'teamFoldersRecheck', 'teamFoldersCreate', 'teamFoldersIssues', 'teamFoldersStatus', 'teamFoldersLists', 'teamDocumentsLink']) assert(f.host.querySelector('#' + id), id);
  assert.equal(f.host.querySelector('#teamFoldersCard').getAttribute('aria-busy'), 'true');
  assert(f.host.querySelector('#teamFoldersSummary [data-skeleton]'));
  for (const id of ['teamFoldersCreate', 'teamFoldersIssues', 'teamFoldersLists', 'teamDocumentsLink']) assert.equal(isHidden(f, id), true, id);
  assert.equal(f.host.querySelector('#teamFoldersCard').parentNode, f.host.querySelector('#committeeConfigurationCard').parentNode);
  f.click(f.host.querySelector('[data-action="team-folders-recheck"]'));
  const create = f.host.querySelector('[data-action="team-folders-create"]');
  create.disabled = false;
  f.click(create);
  assert.deepEqual(f.calls, ['recheck', 'create']);
  assert.deepEqual(Array.from(f.host.querySelectorAll('*')).flatMap(n => Array.from(n.attributes).map(a => a.name)).filter(name => /^on/i.test(name)), []);
});

test('summary, links, lists and the create button follow the DTO, with every value escaped', () => {
  const f = setup();
  f.view.renderTeamFolders(FOLDERS);
  assert.equal(norm(f.host.querySelector('#teamFoldersSummary')), '1 of 4 teams have folders');
  assert.equal(f.host.querySelector('#teamDocumentsLink').getAttribute('href'), 'https://drive.example/docs');
  assert.equal(f.host.querySelector('#teamBaseFolderLink'), null);
  assert.equal(norm(f.host.querySelector('#teamFoldersIssues')), 'Check this');
  assert.deepEqual(Array.from(f.host.querySelectorAll('[data-team-folders-list]')).map(n => n.getAttribute('data-team-folders-list') + ':' + norm(n.querySelector('summary'))),
    ['missing:Missing folders (2)', 'duplicates:Duplicate folders (1)', 'collisions:Skipped (same folder name) (2)']);
  assert.equal(f.host.querySelector('#teamFoldersCreate').disabled, false);
  assert.equal(isHidden(f, 'teamFoldersCreate'), false);
  f.view.renderTeamFolders({ ...FOLDERS, missing: ['<img src=x onerror=alert(1)>'], issues: ['<img src=x onerror=alert(1)>'] });
  assert.equal(f.host.querySelectorAll('img').length, 0);
  f.view.renderTeamFolders({ ...FOLDERS, existing: 4, missing: [], duplicates: [], collisions: [], issues: [], canCreate: false });
  assert.equal(f.host.querySelector('#teamFoldersCreate').disabled, true);
  assert.equal(isHidden(f, 'teamFoldersCreate'), true); assert.equal(isHidden(f, 'teamFoldersLists'), true); assert.equal(isHidden(f, 'teamFoldersIssues'), true);
  f.view.renderTeamFolders({ ...FOLDERS, teamDocuments: { exists: false, url: null }, existing: 0, canCreate: true });
  assert.equal(norm(f.host.querySelector('#teamFoldersSummary')), 'Team Documents folder not created yet');
  assert.equal(isHidden(f, 'teamDocumentsLink'), true);
  f.view.renderTeamFolders({ ...FOLDERS, configured: false, baseFolder: null, teamDocuments: { exists: false, url: null }, missing: [], canCreate: false, issues: ['No folder'] });
  assert.equal(norm(f.host.querySelector('#teamFoldersSummary')), 'Folder location unavailable');
  assert.equal(isHidden(f, 'teamFoldersCreate'), true); assert.equal(isHidden(f, 'teamFoldersLists'), true);
});

test('every class on the card, including its lists, is compiled into the stylesheet', () => {
  const { missingClasses, renderedClasses } = require('./compiled-css.cjs');
  const f = setup();
  f.view.renderTeamFolders(FOLDERS);
  assert.deepEqual(missingClasses(renderedClasses(f.host.querySelector('#teamFoldersCard')).filter(c => !c.startsWith('lucide'))), []);
});

/** The actions module against a scripted bridge, a recording confirm dialog and a fake loading overlay. */
function actionsSetup({ confirmed = true, read = () => FOLDERS, write = () => ({}) } = {}) {
  const f = setup(), log = [];
  const bridge = {
    read: (key, name) => { log.push(['read', name]); try { return Promise.resolve(read()); } catch (error) { return Promise.reject(error); } },
    write: (name, args) => { log.push(['write', name, ...args]); try { return Promise.resolve(write(args[0])); } catch (error) { return Promise.reject(error); } }
  };
  const ui = { busy:require('./busy-fixture.cjs')(), beginContentLoading: () => () => log.push('loaded'), confirmDialog: options => { log.push(['confirm', options.body]); return Promise.resolve(confirmed); } };
  vm.runInContext('globalThis.__actions = ' + f.c.systemStatusActionsBrowser_.toString(), f.c);
  const actions = f.c.__actions(bridge, () => ui);
  const settle = async () => { for (let i = 0; i < 8; i++) await new Promise(resolve => setTimeout(resolve, 0)); };
  return { f, log, actions, settle, status: () => norm(f.host.querySelector('#teamFoldersStatus')) };
}

test('recheck fills the card; a failed refresh keeps what it shows and reports the failure', async () => {
  let fail = false;
  const a = actionsSetup({ read: () => { if (fail) throw new Error('timed out'); return FOLDERS; } });
  a.actions.recheckTeamFolders(); await a.settle();
  assert.equal(norm(a.f.host.querySelector('#teamFoldersSummary')), '1 of 4 teams have folders');
  assert.equal(a.f.host.querySelector('#teamFoldersCard').getAttribute('aria-busy'), 'false');
  fail = true;
  a.actions.recheckTeamFolders(); await a.settle();
  assert.equal(norm(a.f.host.querySelector('#teamFoldersSummary')), '1 of 4 teams have folders');
  assert.match(norm(a.f.host.querySelector('#teamFoldersIssues')), /Unable to check team folders: timed out/);
  assert.equal(a.f.host.querySelector('#teamFoldersRecheck').disabled, false);
  assert.equal(a.f.host.querySelector('#teamFoldersCreate').disabled, false);
});

test('create asks first naming the folder; declining writes nothing', async () => {
  const a = actionsSetup({ confirmed: false });
  a.actions.recheckTeamFolders(); await a.settle();
  a.actions.createTeamFolders(); await a.settle();
  const confirm = a.log.find(entry => entry[0] === 'confirm');
  assert.equal(confirm[1], 'Create the folder "Team Documents" (if it does not exist) inside "Capstone <Files>", and 2 team folders inside it?');
  assert.equal(a.log.filter(entry => entry[0] === 'write').length, 0);
});

test('create runs batch by batch from the cursor, reports failures and rechecks', async () => {
  const batches = [{ created: ['T2'], failed: [], nextCursor: 't2' }, { created: [], failed: [{ teamId: 'T3', reason: 'Quota exceeded' }], nextCursor: null }];
  const a = actionsSetup({ write: () => batches.shift() });
  a.actions.recheckTeamFolders(); await a.settle();
  a.actions.createTeamFolders(); await a.settle();
  assert.deepEqual(a.log.filter(entry => entry[0] === 'write'), [['write', 'API_coordinator_createTeamFolders', ''], ['write', 'API_coordinator_createTeamFolders', 't2']]);
  assert.match(a.status(), /1 team folder created\. Failed: T3 \(Quota exceeded\)/);
  assert.equal(a.log.filter(entry => entry[0] === 'read').length, 2);
  assert.equal(a.f.host.querySelector('#teamFoldersRecheck').disabled, false);
});

test('a stopped run says how many were created and how to resume', async () => {
  const a = actionsSetup({ write: () => { throw new Error('Service unavailable'); } });
  a.actions.recheckTeamFolders(); await a.settle();
  a.actions.createTeamFolders(); await a.settle();
  assert.match(a.status(), /Folder creation stopped: Service unavailable\. 0 created before the stop\./);
});

test('create does nothing when the DTO says it cannot create', async () => {
  const a = actionsSetup({ read: () => ({ ...FOLDERS, canCreate: false }) });
  a.actions.recheckTeamFolders(); await a.settle();
  a.actions.createTeamFolders(); await a.settle();
  assert.equal(a.log.filter(entry => entry[0] === 'confirm' || entry[0] === 'write').length, 0);
});
