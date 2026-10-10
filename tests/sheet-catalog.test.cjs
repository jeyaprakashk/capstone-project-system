// The sheet catalog (sheet-columns.js): shape, specifications, the call-site audits and the generated SHEETS.md.
// Catalog v1 lists the new sheets only, so the completeness test (every sheet the code touches is listed) is not switched on yet;
// it is switched on when the header-name migration completes the catalog (SHEET-HEADER-MATCHING-PLAN.md, phase 1).
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const plain = value => JSON.parse(JSON.stringify(value));
const ACCESS = ['system', 'view', 'edit'];
const STATUS = ['new', 'migrated', 'positional', 'retiring'];
const ROLES = ['setup', 'runtime-create', 'read', 'write'];
// Only these entries may carry createAtRuntime: true. A new runtime creator needs a reviewed change to this list.
const RUNTIME_CREATE_ALLOW_LIST = ['commitCollectionStatus'];

function load() {
  const context = vm.createContext({console, PropertiesService: {getScriptProperties: () => ({getProperty: () => 'SHEET_ID'})}});
  ['common-constants.js', 'common-helpers.js', 'sheet-columns.js'].forEach(file => vm.runInContext(fs.readFileSync(file, 'utf8'), context, {filename: file}));
  return context;
}
const rootScripts = () => fs.readdirSync('.').filter(name => name.endsWith('.js') && !name.startsWith('tailwind') && name !== 'ensure-sheet.js');
const stripComments = text => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1');

function enclosingFunction(text, index) {
  let name = null;
  for (const match of text.matchAll(/^function ([A-Za-z0-9_$]+)\s*\(/gm)) { if (match.index <= index) name = match[1]; else break; }
  return name;
}

test('the catalog is a frozen, memoised list of the new sheets', () => {
  const c = load();
  const catalog = c.sheetCatalog_();
  assert.equal(c.sheetCatalog_(), catalog, 'built once per execution');
  assert.deepEqual(Object.keys(catalog), ['activityDependencies', 'titleLog', 'formArchive']);
  const frozen = value => !value || typeof value !== 'object' || (Object.isFrozen(value) && Object.values(value).every(frozen));
  assert.ok(frozen(catalog));
  assert.equal(typeof c.sheetCatalog_, 'function');
});

test('every entry is well formed: unique keys and names, valid headers, access, status and code', () => {
  const c = load();
  const entries = Object.entries(c.sheetCatalog_());
  const names = [];
  for (const [key, entry] of entries) {
    assert.match(key, /^[a-z][A-Za-z0-9]*$/, key);
    assert.ok(entry.name && entry.name.trim() === entry.name, key + ' needs a trimmed name');
    assert.ok(!names.some(other => c.textEquals_(other, entry.name)), 'duplicate tab name ' + entry.name);
    names.push(entry.name);
    assert.ok(ACCESS.includes(entry.access), key + ' access');
    assert.ok(STATUS.includes(entry.status), key + ' status');
    assert.ok(entry.purpose && entry.purpose.trim(), key + ' needs a purpose');
    assert.equal(typeof entry.createAtRuntime, 'boolean', key + ' createAtRuntime');
    assert.ok(Array.isArray(entry.code), key + ' code');
    entry.code.forEach(item => {
      assert.ok(ROLES.includes(item.role), key + ' role');
      assert.ok(fs.existsSync(item.file), key + ' lists a missing file ' + item.file);
      const text = fs.readFileSync(item.file, 'utf8');
      item.functions.forEach(fn => assert.match(text, new RegExp('^function ' + fn + '\\s*\\(', 'm'), key + ': ' + fn + ' is not in ' + item.file));
      assert.ok(text.includes(entry.name) || text.includes("'" + key + "'"), key + ': ' + item.file + ' does not refer to the sheet');
    });
    const headers = c.sheetCatalogHeaders_(entry);
    if (entry.headersFrom === 'runtime') { assert.equal(headers, null); continue; }
    assert.ok(headers.length && headers.every(h => typeof h === 'string' && h.trim()), key + ' headers must be non-blank');
    headers.forEach((h, i) => assert.ok(!headers.some((o, j) => j < i && c.textEquals_(o, h)), key + ' duplicate header ' + h));
  }
});

test('the layouts of the new sheets are pinned', () => {
  const catalog = plain(load().sheetCatalog_());
  assert.deepEqual(catalog.activityDependencies.headers, ['Activity', 'Kind', 'Item', 'Label', 'Active']);
  assert.equal(catalog.activityDependencies.access, 'edit');
  assert.equal(catalog.titleLog.access, 'view');
  assert.deepEqual(catalog.titleLog.headers, ['Timestamp', 'Team ID', 'Revision', 'Action', 'Actor', 'Request ID', 'Fingerprint', 'Status',
    'Proposed Title', 'Proposed Problem', 'Notes', 'Similarity Note', 'Reopened', 'Approved Title', 'Approved Problem', 'Approved At', 'Approved By']);
  assert.equal(catalog.formArchive.name, 'TitleFormArchive');
  assert.equal(catalog.formArchive.headersFrom, 'runtime');
  assert.equal(catalog.formArchive.headers, undefined);
});

test('sheetSpec_ returns name, headers, access and createAtRuntime, never mode, as copies', () => {
  const c = load();
  const spec = plain(c.sheetSpec_('activityDependencies'));
  assert.deepEqual(spec, {name: 'ActivityDependencies', headers: ['Activity', 'Kind', 'Item', 'Label', 'Active'], access: 'edit', createAtRuntime: false});
  assert.ok(!('mode' in spec));
  const first = c.sheetSpec_('titleLog');
  first.headers.push('Extra');
  assert.equal(c.sheetSpec_('titleLog').headers.length, 17, 'mutating a returned spec never changes the catalog');
});

test('sheetSpec_ validates its arguments, and supplies run-time headers only where the entry allows them', () => {
  const c = load();
  assert.throws(() => c.sheetSpec_('nope'), /Unknown sheet in the catalog: nope/);
  assert.throws(() => c.sheetSpec_('activityDependencies', ['A']), /fixed in the catalog/);
  assert.throws(() => c.sheetSpec_('formArchive'), /must be supplied/);
  assert.throws(() => c.sheetSpec_('formArchive', []), /must be supplied/);
  const archive = plain(c.sheetSpec_('formArchive', ['Timestamp', 'Team ID']));
  assert.deepEqual(archive, {name: 'TitleFormArchive', headers: ['Timestamp', 'Team ID'], access: 'view', createAtRuntime: false});
});

test('headersFrom resolves a frozen definition by reference and rejects an unknown one', () => {
  const c = load();
  assert.deepEqual(plain(c.sheetCatalogHeaders_({headersFrom: 'FIELD_DEFINITIONS.COMMIT_COLLECTION_STATUS'})), ['Team ID', 'Status', 'Updated At']);
  assert.throws(() => c.sheetCatalogHeaders_({headersFrom: 'FIELD_DEFINITIONS.NO_SUCH'}), /Unknown header definition/);
  assert.throws(() => c.sheetCatalogHeaders_({headersFrom: 'SHEET_NAMES'}), /Unknown header definition/);
});

test('createAtRuntime is set only on allow-listed entries, and mode: runtime appears only in code listed under them', () => {
  const c = load();
  const flagged = Object.entries(c.sheetCatalog_()).filter(([, entry]) => entry.createAtRuntime).map(([key]) => key);
  flagged.forEach(key => assert.ok(RUNTIME_CREATE_ALLOW_LIST.includes(key), key + ' is not on the createAtRuntime allow-list'));
  const allowedFunctions = new Set();
  flagged.forEach(key => c.sheetCatalog_()[key].code.filter(item => item.role === 'runtime-create')
    .forEach(item => item.functions.forEach(fn => allowedFunctions.add(item.file + ':' + fn))));
  const offenders = [];
  for (const file of rootScripts()) {
    const text = stripComments(fs.readFileSync(file, 'utf8'));
    for (const match of text.matchAll(/mode:\s*['"]runtime['"]/g)) {
      const fn = enclosingFunction(text, match.index);
      if (!allowedFunctions.has(file + ':' + fn)) offenders.push(file + ':' + fn);
    }
  }
  assert.deepEqual(offenders, []);
});

test('ensureSheet_ is only called directly, from a function listed in the catalog as setup or runtime-create', () => {
  const c = load();
  const listed = new Set();
  Object.values(c.sheetCatalog_()).forEach(entry => entry.code
    .filter(item => item.role === 'setup' || item.role === 'runtime-create')
    .forEach(item => item.functions.forEach(fn => listed.add(item.file + ':' + fn))));
  const offenders = [];
  for (const file of rootScripts()) {
    const text = stripComments(fs.readFileSync(file, 'utf8'));
    for (const match of text.matchAll(/ensureSheet_(\s*\()?/g)) {
      if (!match[1]) { offenders.push(file + ': ensureSheet_ referenced other than by a direct call'); continue; }
      const fn = enclosingFunction(text, match.index);
      if (!listed.has(file + ':' + fn)) offenders.push(file + ':' + fn + ' calls ensureSheet_ but is not listed as setup or runtime-create');
    }
  }
  assert.deepEqual(offenders, []);
});

test('the catalog adds no public function and no entry to SHEET_NAMES or FIELD_DEFINITIONS', () => {
  const text = fs.readFileSync('sheet-columns.js', 'utf8');
  const publicFunctions = [...text.matchAll(/^function ([A-Za-z0-9$]+)\s*\(/gm)].map(match => match[1]).filter(name => !name.endsWith('_'));
  assert.deepEqual(publicFunctions, []);
  const c = load();
  const names = Object.values(plain(vm.runInContext('SHEET_NAMES', c)));
  Object.values(c.sheetCatalog_()).forEach(entry => assert.ok(!names.includes(entry.name), entry.name + ' must not be added to SHEET_NAMES'));
});

test('SHEETS.md is generated from the catalog and is up to date', () => {
  const {render} = require('../scripts/build-sheets-doc.cjs');
  const expected = render();
  assert.ok(fs.existsSync('SHEETS.md'), 'run npm run build:sheets-doc');
  assert.equal(fs.readFileSync('SHEETS.md', 'utf8'), expected, 'SHEETS.md is out of date; run npm run build:sheets-doc');
  assert.match(expected, /`ActivityDependencies`.*Visible, green tab \(`edit`\)/);
  assert.match(expected, /`TitleLog`.*Visible, red tab \(`view`\)/);
  assert.match(expected, /Taken from the source Form sheet at archive time/);
  assert.ok(!expected.includes('\r'), 'the generated file uses LF line endings');
});
