// The sheet catalog (sheet-columns.js): shape, specifications, the call-site audits and the generated SHEETS.md.
// The catalog lists every sheet the code touches (SHEET-HEADER-MATCHING-PLAN.md, phase 1), and a completeness test keeps it so.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const plain = value => JSON.parse(JSON.stringify(value));
const ACCESS = ['system', 'view', 'edit'];
const STATUS = ['new', 'by-name', 'positional', 'migrated', 'retiring'];
// Sheets the code names that the catalog cannot list, each with its reason.
const NOT_LISTED = {
  MasterRegistry: 'it lives in the hub spreadsheet (HUB_SHEET_ID), not in this one, and the code reads it by position; its header names are not defined anywhere in this project'
};
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

test('the catalog is a frozen, memoised list', () => {
  const c = load();
  const catalog = c.sheetCatalog_();
  assert.equal(c.sheetCatalog_(), catalog, 'built once per execution');
  assert.ok(Object.keys(catalog).includes('activityDependencies') && Object.keys(catalog).includes('titleLog'));
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
    assert.ok(Boolean(entry.name) !== Boolean(entry.namePattern), key + ' needs a name or a namePattern, not both');
    const label = entry.name || entry.namePattern;
    assert.ok(label.trim() === label, key + ' needs a trimmed name');
    assert.ok(!names.some(other => c.textEquals_(other, label)), 'duplicate tab name ' + label);
    names.push(label);
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
      const constant = Object.entries(plain(vm.runInContext('SHEET_NAMES', c))).find(([, value]) => value === entry.name);
      if (entry.name) assert.ok(text.includes(entry.name) || text.includes("'" + key + "'") || (constant && text.includes('SHEET_NAMES.' + constant[0])), key + ': ' + item.file + ' does not refer to the sheet');
    });
    const headers = c.sheetCatalogHeaders_(entry);
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

test('sheetSpec_ validates its arguments', () => {
  const c = load();
  assert.throws(() => c.sheetSpec_('nope'), /Unknown sheet in the catalog: nope/);
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

test('a setup function is an editor-run entry point or is reached only from setup code', () => {
  const c = load();
  const guardSource = fs.readFileSync('tests/entry-point-guard.test.cjs', 'utf8');
  // GUARDED start with requireTriggerOrOperator_(); SELF_CHECKED are the coordinator-only setup and reconciliation entry points.
  const listOf = name => [...guardSource.match(new RegExp('const ' + name + ' = \\[([\\s\\S]*?)\\];'))[1].matchAll(/'([^']+)'/g)].map(match => match[1]);
  const guarded = new Set([...listOf('GUARDED'), ...listOf('SELF_CHECKED')]);
  const setupFunctions = [];
  Object.values(c.sheetCatalog_()).forEach(entry => entry.code.filter(item => item.role === 'setup')
    .forEach(item => item.functions.forEach(fn => setupFunctions.push({file: item.file, fn}))));
  const isSetup = (file, fn) => setupFunctions.some(item => item.file === file && item.fn === fn);
  const sources = rootScripts().map(file => ({file, text: stripComments(fs.readFileSync(file, 'utf8'))}));
  const problems = [];
  for (const {file, fn} of setupFunctions) {
    if (!fn.endsWith('_') && !fn.startsWith('API_')) {
      if (!guarded.has(fn)) problems.push(fn + ' is a public setup function but is not a guarded entry point');
      continue;
    }
    let callSites = 0;
    for (const source of sources) {
      for (const match of source.text.matchAll(new RegExp('(?<![A-Za-z0-9_$])' + fn + '\\s*\\(', 'g'))) {
        // the definition itself ("function name(") is not a call site
        if (source.text.slice(Math.max(0, match.index - 9), match.index) === 'function ') continue;
        callSites++;
        const caller = enclosingFunction(source.text, match.index);
        if (!isSetup(source.file, caller) && !(guarded.has(caller))) problems.push(fn + ' is called from ' + source.file + ':' + caller + ', which is not setup code or an entry point');
      }
    }
    if (!callSites) problems.push(fn + ' is a private setup function with no caller');
  }
  assert.deepEqual(problems, []);
});

test('the catalog adds no public function, and a new sheet is not added to SHEET_NAMES or FIELD_DEFINITIONS', () => {
  const text = fs.readFileSync('sheet-columns.js', 'utf8');
  const publicFunctions = [...text.matchAll(/^function ([A-Za-z0-9$]+)\s*\(/gm)].map(match => match[1]).filter(name => !name.endsWith('_'));
  assert.deepEqual(publicFunctions, []);
  const c = load();
  const names = Object.values(plain(vm.runInContext('SHEET_NAMES', c)));
  Object.values(c.sheetCatalog_()).filter(entry => entry.status === 'new').forEach(entry => assert.ok(!names.includes(entry.name), entry.name + ' must not be added to SHEET_NAMES'));
  Object.values(c.sheetCatalog_()).filter(entry => entry.headersFrom).forEach(entry => assert.ok(names.includes(entry.name), entry.name + ' is a frozen sheet and its name comes from SHEET_NAMES'));
});

test('completeness: every sheet the code names has a catalog entry', () => {
  const c = load();
  const constants = plain(vm.runInContext('SHEET_NAMES', c));
  const listed = new Set(Object.values(c.sheetCatalog_()).map(entry => entry.name).filter(Boolean));
  const named = new Map();
  const note = (name, where) => { if (!named.has(name)) named.set(name, []); named.get(name).push(where); };
  for (const file of rootScripts().filter(name => name !== 'sheet-columns.js' && name !== 'common-constants.js')) {
    const text = stripComments(fs.readFileSync(file, 'utf8'));
    for (const match of text.matchAll(/SHEET_NAMES\.([A-Za-z_]+)/g)) note(constants[match[1]], file);
    for (const match of text.matchAll(/(?:getSheet_|getNamedSheet_|insertSheet)\(\s*'([^']+)'/g)) note(match[1], file);
  }
  const missing = [...named.keys()].filter(name => !listed.has(name) && !NOT_LISTED[name]).map(name => name + ' (' + [...new Set(named.get(name))].join(', ') + ')');
  assert.deepEqual(missing, []);
  Object.keys(NOT_LISTED).forEach(name => assert.ok(named.has(name), name + ' is no longer used: remove it from NOT_LISTED'));
});

test('the headers listed in the catalog equal the constants the code validates against', () => {
  const c = load();
  ['assessment-registry.js', 'milestone-config.js', 'progress-eligibility.js', 'review-evaluation.js', 'guide-evaluation.js']
    .forEach(file => vm.runInContext(fs.readFileSync(file, 'utf8'), c, {filename: file}));
  const catalog = plain(c.sheetCatalog_());
  assert.deepEqual(catalog.assessmentDefinitions.headers, plain(vm.runInContext('ASSESSMENT_DEFINITION_HEADERS_', c)));
  assert.deepEqual(catalog.milestones.headers, plain(vm.runInContext('MILESTONE_HEADERS_', c)));
  assert.deepEqual(catalog.progressEligibility.headers, plain(vm.runInContext('Object.values(PROGRESS_ELIGIBILITY_FIELDS_)', c)));
  assert.deepEqual(catalog.assessmentJournal.headers, plain(vm.runInContext('Object.values(ASSESSMENT_JOURNAL_FIELDS_)', c)));
  assert.deepEqual(catalog.assessmentJournal.headers, plain(vm.runInContext('Object.values(ASSESSMENT_JOURNAL_FIELDS_)', c)));
});

test('a sheet with a generated name has no specification until the caller supplies the name', () => {
  assert.throws(() => load().sheetSpec_('assessmentJournal'), /generated name/);
});

// The sheet-access audit (SHEET-HEADER-MATCHING-PLAN.md, section 8). A text-level tripwire against positional access creeping back
// into a migrated sheet; it cannot see an index held in a variable. The shuffled-column tests are the proof. Writing a header row
// (getRange(1, ...)) when a sheet is created is allowed: new sheets get their headers in definition order. So is a whole-row write from
// column A whose width is a built row's length (getRange(n, 1, 1, row.length)): the row was built from the column map.
function functionSource(text, name) {
  const start = text.search(new RegExp('^function ' + name + '\\s*\\(', 'm'));
  assert.ok(start >= 0, name + ' not found');
  const next = text.slice(start + 1).search(/^function /m);
  return text.slice(start, next < 0 ? text.length : start + 1 + next);
}

test('audit: no function listed for a migrated sheet reads a row or a column by position', () => {
  const c = load();
  const offenders = [];
  for (const [key, entry] of Object.entries(c.sheetCatalog_()).filter(([, entry]) => entry.status === 'migrated')) {
    for (const item of entry.code) {
      const text = fs.readFileSync(item.file, 'utf8');
      for (const fn of item.functions) {
        const source = stripComments(functionSource(text, fn));
        for (const match of source.matchAll(/\b(?:row|r|item\.row|submission|saved|record|existingRow)\[\s*\d+\s*\]|getRange\((?!1\s*,)(?![^,()]+,\s*1\s*,\s*1\s*,\s*\w+\.length\s*\))[^,()]+,\s*\d+\s*[,)]/g)) {
          offenders.push(key + ': ' + item.file + ' ' + fn + ' uses ' + match[0]);
        }
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test('audit: a migrated sheet is named only in the functions the catalog lists for it', () => {
  const c = load();
  const constants = plain(vm.runInContext('SHEET_NAMES', c));
  const offenders = [];
  for (const [key, entry] of Object.entries(c.sheetCatalog_()).filter(([, entry]) => entry.status === 'migrated')) {
    const constant = Object.keys(constants).find(name => constants[name] === entry.name);
    if (!constant) continue;
    const listed = new Set(entry.code.flatMap(item => item.functions.map(fn => item.file + ':' + fn)));
    for (const file of rootScripts().filter(name => name !== 'sheet-columns.js' && name !== 'common-constants.js')) {
      const text = stripComments(fs.readFileSync(file, 'utf8'));
      for (const match of text.matchAll(new RegExp('SHEET_NAMES\\.' + constant + '\\b', 'g'))) {
        const fn = enclosingFunction(text, match.index);
        if (!listed.has(file + ':' + fn)) offenders.push(key + ': ' + file + ':' + fn + ' names the sheet but is not listed for it');
      }
    }
  }
  assert.deepEqual(offenders, []);
});

test('SHEETS.md is generated from the catalog and is up to date', () => {
  const {render} = require('../scripts/build-sheets-doc.cjs');
  const expected = render();
  assert.ok(fs.existsSync('SHEETS.md'), 'run npm run build:sheets-doc');
  assert.equal(fs.readFileSync('SHEETS.md', 'utf8'), expected, 'SHEETS.md is out of date; run npm run build:sheets-doc');
  assert.match(expected, /`ActivityDependencies`.*Visible, green tab \(`edit`\)/);
  assert.match(expected, /`TitleLog`.*Visible, red tab \(`view`\)/);
  assert.ok(!expected.includes('\r'), 'the generated file uses LF line endings');
});
