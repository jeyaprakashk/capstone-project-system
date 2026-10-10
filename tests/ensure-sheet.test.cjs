// ensureSheet_ (ensure-sheet.js): creation, header checks, repair, runtime mode, locking and caches.
// Uses a fake spreadsheet; there are no live calls. Specified in ENSURE-SHEET-PLAN.md.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const SOURCE = fs.readFileSync('ensure-sheet.js', 'utf8');
const REPAIR_FLAG = 'const ENSURE_SHEET_REPAIR_ENABLED_ = true;';
const HEADERS = ['Activity', 'Kind', 'Item', 'Label', 'Active'];
const plain = value => JSON.parse(JSON.stringify(value));
const WRITE_CALLS = ['setValues', 'insertColumnsAfter', 'setTabColor', 'hideSheet'];

class FakeSheet {
  constructor(name, rows = []) {
    this.name = name; this.rows = rows.map(row => row.slice()); this.maxColumns = 26;
    this.hidden = false; this.color = null; this.calls = [];
  }
  getName() { return this.name; }
  getLastRow() {
    let last = 0;
    this.rows.forEach((row, index) => { if (row.some(value => value !== '' && value != null)) last = index + 1; });
    return last;
  }
  getLastColumn() {
    let last = 0;
    this.rows.forEach(row => row.forEach((value, index) => { if (value !== '' && value != null) last = Math.max(last, index + 1); }));
    return last;
  }
  getMaxColumns() { return this.maxColumns; }
  insertColumnsAfter(position, count) { this.calls.push(['insertColumnsAfter', position, count]); this.maxColumns += count; }
  getRange(row, column, numRows, numColumns) {
    const sheet = this;
    return {
      getValues() {
        sheet.calls.push(['getValues', row, column, numRows, numColumns]);
        return Array.from({length: numRows}, (_, r) => Array.from({length: numColumns}, (_, c) => {
          const value = (sheet.rows[row - 1 + r] || [])[column - 1 + c];
          return value === undefined ? '' : value;
        }));
      },
      setValues(values) {
        sheet.calls.push(['setValues', row, column, numRows, numColumns]);
        values.forEach((valueRow, r) => {
          const target = (sheet.rows[row - 1 + r] = sheet.rows[row - 1 + r] || []);
          valueRow.forEach((value, c) => { target[column - 1 + c] = value; });
        });
      }
    };
  }
  setTabColor(color) { this.color = color; this.calls.push(['setTabColor', color]); }
  hideSheet() { this.hidden = true; this.calls.push(['hideSheet']); }
  isSheetHidden() { return this.hidden; }
  writes() { return this.calls.filter(call => WRITE_CALLS.includes(call[0])); }
}

class FakeSpreadsheet {
  constructor(sheets) { this.sheets = sheets; this.inserted = []; this.flushes = 0; }
  getSheets() { return this.sheets; }
  getSheetByName(name) { return this.sheets.find(sheet => sheet.name === name) || null; }
  insertSheet(name) { const sheet = new FakeSheet(name); this.sheets.push(sheet); this.inserted.push(name); return sheet; }
}

function makeEnv(options = {}) {
  const spreadsheet = new FakeSpreadsheet(options.sheets || [new FakeSheet('Home', [['x']])]);
  const lock = {
    held: !!options.lockHeld, acquired: 0, released: 0, allow: options.lockAllow !== false, beforeAcquire: null,
    hasLock() { return this.held; },
    waitLock() { if (!this.allow) throw new Error('Lock wait timed out'); if (this.beforeAcquire) this.beforeAcquire(); this.held = true; this.acquired++; },
    releaseLock() { this.held = false; this.released++; }
  };
  const logs = [];
  const context = vm.createContext({
    console: {log: line => logs.push(line)},
    PropertiesService: {getScriptProperties: () => ({getProperty: () => 'SHEET_ID'})},
    SpreadsheetApp: {openById: () => spreadsheet, flush() { spreadsheet.flushes++; }},
    LockService: {getScriptLock: () => lock}
  });
  ['common-helpers.js', 'sheet-reads.js'].forEach(file => vm.runInContext(fs.readFileSync(file, 'utf8'), context, {filename: file}));
  // Repair ships enabled; a test can switch it off with { repair: false } to check the refusal path.
  let source = SOURCE;
  if (options.repair === false) {
    assert.ok(SOURCE.includes(REPAIR_FLAG), 'the repair flag line changed; update this test');
    source = SOURCE.replace(REPAIR_FLAG, 'const ENSURE_SHEET_REPAIR_ENABLED_ = false;');
  }
  vm.runInContext(source, context, {filename: 'ensure-sheet.js'});
  return {context, spreadsheet, lock, logs, ensure: spec => context.ensureSheet_(spec), sheet: name => spreadsheet.getSheetByName(name)};
}

const setupSpec = (extra = {}) => ({name: 'ActivityDependencies', headers: HEADERS, access: 'edit', mode: 'setup', ...extra});
const touched = env => env.spreadsheet.sheets.reduce((sum, sheet) => sum + sheet.calls.length, 0);

test('a specification problem throws before anything is read or written', () => {
  const cases = [
    [{name: 'S', headers: HEADERS, access: 'edit'}, /needs mode/],
    [{name: 'S', headers: HEADERS, access: 'edit', mode: 'both'}, /needs mode/],
    [undefined, /needs a specification/],
    [setupSpec({name: '  '}), /needs a sheet name/],
    [setupSpec({headers: []}), /required headers/],
    [setupSpec({headers: ['A', '']}), /blank/],
    [setupSpec({headers: ['A', ' a ']}), /duplicate required header/],
    [setupSpec({access: 'public'}), /access must be/],
    [setupSpec({onCreate: 'no'}), /onCreate must be a function/],
    [{name: 'S', headers: HEADERS, access: 'edit', mode: 'runtime'}, /Runtime creation is not allowed for S/],
    [{name: 'S', headers: HEADERS, access: 'edit', mode: 'runtime', createAtRuntime: false}, /Runtime creation is not allowed/],
    [{name: 'S', headers: HEADERS, access: 'edit', mode: 'runtime', createAtRuntime: true, onCreate() {}}, /not allowed in runtime mode/]
  ];
  for (const [spec, pattern] of cases) {
    const env = makeEnv();
    assert.throws(() => env.ensure(spec), pattern);
    assert.equal(touched(env), 0);
    assert.equal(env.spreadsheet.inserted.length, 0);
    assert.equal(env.lock.acquired, 0);
  }
});

test('an absent sheet is created with its headers and the colour and visibility of its access mode', () => {
  for (const [access, hidden, color] of [['system', true, '#d93025'], ['view', false, '#d93025'], ['edit', false, '#188038']]) {
    const env = makeEnv();
    assert.deepEqual(plain(env.ensure(setupSpec({name: 'Sheet ' + access, access}))), {created: true, repaired: []});
    const sheet = env.sheet('Sheet ' + access);
    assert.deepEqual(plain(sheet.rows), [HEADERS]);
    assert.equal(sheet.hidden, hidden);
    assert.equal(sheet.color, color);
    assert.equal(sheet.rows.length, 1, 'no data row is written');
    assert.equal(env.lock.acquired, 1);
    assert.equal(env.lock.released, 1);
  }
});

test('a new sheet gets room for headers beyond the default columns, in one header write', () => {
  const env = makeEnv();
  const headers = Array.from({length: 30}, (_, i) => 'H' + (i + 1));
  env.ensure(setupSpec({name: 'Wide', headers}));
  const sheet = env.sheet('Wide');
  assert.deepEqual(plain(sheet.rows[0]), headers);
  assert.equal(sheet.calls.filter(call => call[0] === 'setValues').length, 1);
});

test('onCreate runs once, after the headers, and only when the sheet was created', () => {
  const env = makeEnv();
  const seen = [];
  const spec = setupSpec({onCreate: sheet => seen.push(plain(sheet.rows))});
  env.ensure(spec);
  assert.deepEqual(seen, [[HEADERS]]);
  env.ensure(spec);
  assert.equal(seen.length, 1);
  const other = makeEnv({sheets: [new FakeSheet('Home', [['x']]), new FakeSheet('ActivityDependencies', [HEADERS])]});
  other.ensure(spec);
  assert.equal(seen.length, 1, 'an existing sheet does not run onCreate');
});

test('if onCreate throws, the sheet stays created and a rerun does not run it again', () => {
  const env = makeEnv();
  let runs = 0;
  const spec = setupSpec({onCreate() { runs++; throw new Error('boom'); }});
  assert.throws(() => env.ensure(spec), /ActivityDependencies was created, but its setup formatting failed: boom/);
  assert.equal(env.lock.released, 1);
  assert.deepEqual(plain(env.sheet('ActivityDependencies').rows), [HEADERS]);
  assert.deepEqual(plain(env.ensure(spec)), {created: false, repaired: []});
  assert.equal(runs, 1);
});

test('hiding is refused before anything is changed if it would hide the only visible sheet', () => {
  const hiddenHome = new FakeSheet('Home', [['x']]);
  hiddenHome.hidden = true;
  const env = makeEnv({sheets: [hiddenHome]});
  assert.throws(() => env.ensure(setupSpec({access: 'system'})), /only visible sheet/);
  assert.equal(env.spreadsheet.inserted.length, 0);
  assert.equal(env.lock.released, 1);
});

test('an existing sheet with no rows gets its header row; colour and visibility are left alone', () => {
  const empty = new FakeSheet('ActivityDependencies');
  empty.color = '#123456';
  const env = makeEnv({sheets: [new FakeSheet('Home', [['x']]), empty]});
  assert.deepEqual(plain(env.ensure(setupSpec({access: 'system'}))), {created: false, repaired: HEADERS});
  assert.deepEqual(plain(empty.rows), [HEADERS]);
  assert.equal(empty.color, '#123456');
  assert.equal(empty.hidden, false);
});

test('a sheet that already has every header is not touched, takes no lock, and is remembered', () => {
  const existing = new FakeSheet('ActivityDependencies', [[' activity ', 'KIND', 'Item', 'Label ', 'ACTIVE'], ['a', 'b', 'c', 'd', 'Yes']]);
  const env = makeEnv({sheets: [new FakeSheet('Home', [['x']]), existing]});
  assert.deepEqual(plain(env.ensure(setupSpec())), {created: false, repaired: []});
  assert.equal(existing.writes().length, 0);
  assert.equal(env.lock.acquired, 0);
  const calls = touched(env);
  env.ensure(setupSpec());
  assert.equal(touched(env), calls, 'a repeat call in the same execution reads and writes nothing');
});

test('extra columns with nothing missing are left alone', () => {
  const existing = new FakeSheet('ActivityDependencies', [[...HEADERS, 'Notes', 'Notes'], ['a', 'b', 'c', 'd', 'Yes', 'n', 'm']]);
  const env = makeEnv({sheets: [new FakeSheet('Home', [['x']]), existing]});
  assert.deepEqual(plain(env.ensure(setupSpec())), {created: false, repaired: []});
  assert.equal(existing.writes().length, 0);
});

test('with repair switched off, a missing header on an existing sheet throws and changes nothing', () => {
  const existing = new FakeSheet('ActivityDependencies', [HEADERS.slice(0, 3), ['a', 'b', 'c']]);
  const env = makeEnv({repair: false, sheets: [new FakeSheet('Home', [['x']]), existing]});
  assert.throws(() => env.ensure(setupSpec()), /ActivityDependencies header mismatch\. Missing: Label, Active\. Fix the header row by hand; nothing was changed\./);
  assert.equal(existing.writes().length, 0);
  assert.equal(env.lock.acquired, 0);
});

test('repair appends only the missing headers at the right end, in order, and never touches data', () => {
  const existing = new FakeSheet('ActivityDependencies', [['Item', 'Activity', 'Kind'], ['i', 'a', 'k']]);
  existing.maxColumns = 3;
  const env = makeEnv({repair: true, sheets: [new FakeSheet('Home', [['x']]), existing]});
  assert.deepEqual(plain(env.ensure(setupSpec())), {created: false, repaired: ['Label', 'Active']});
  assert.deepEqual(plain(existing.rows), [['Item', 'Activity', 'Kind', 'Label', 'Active'], ['i', 'a', 'k']]);
  assert.deepEqual(plain(existing.calls.filter(call => call[0] === 'insertColumnsAfter')), [['insertColumnsAfter', 3, 2]]);
  assert.equal(existing.calls.filter(call => call[0] === 'setValues').length, 1);
  assert.equal(existing.color, null, 'a repair does not change colour or visibility');
  assert.equal(env.lock.acquired, 1);
  assert.equal(env.lock.released, 1);
  assert.match(env.logs.join(' '), /ensureSheet_repair.*Label.*Active/);
});

test('a missing header together with an unrecognised one throws, even with repair on (possible typo)', () => {
  for (const repair of [false, true]) {
    const existing = new FakeSheet('ActivityDependencies', [['Actvity', 'Kind', 'Item', 'Label', 'Active'], ['a', 'b', 'c', 'd', 'Yes']]);
    const env = makeEnv({repair, sheets: [new FakeSheet('Home', [['x']]), existing]});
    assert.throws(() => env.ensure(setupSpec()), /Missing: Activity\. Unrecognised: Actvity\./);
    assert.equal(existing.writes().length, 0);
  }
});

test('a duplicate required header throws and changes nothing', () => {
  const existing = new FakeSheet('ActivityDependencies', [['Activity', 'Kind', 'Item', 'Label', 'Active', 'kind'], ['a', 'b', 'c', 'd', 'Yes', 'x']]);
  const env = makeEnv({repair: true, sheets: [new FakeSheet('Home', [['x']]), existing]});
  assert.throws(() => env.ensure(setupSpec()), /Duplicate header in ActivityDependencies: Kind\. Nothing was changed\./);
  assert.equal(existing.writes().length, 0);
});

test('a blank header cell, or content right of the header cells, throws and changes nothing', () => {
  const shapes = [
    [['Activity', '', 'Item', 'Label', 'Active'], ['a', 'b', 'c', 'd', 'Yes']],
    [[...HEADERS], ['a', 'b', 'c', 'd', 'Yes', 'stray']]
  ];
  for (const rows of shapes) {
    const existing = new FakeSheet('ActivityDependencies', rows);
    const env = makeEnv({repair: true, sheets: [new FakeSheet('Home', [['x']]), existing]});
    assert.throws(() => env.ensure(setupSpec()), /has content outside its header row\. Nothing was changed\./);
    assert.equal(existing.writes().length, 0);
  }
});

test('runtime mode creates an absent sheet and validates an existing one by header name, without repair', () => {
  const spec = {name: 'CommitCollectionStatus', headers: ['Team ID', 'Status', 'Updated At'], access: 'system', mode: 'runtime', createAtRuntime: true};
  const env = makeEnv({repair: true});
  assert.deepEqual(plain(env.ensure(spec)), {created: true, repaired: []});
  assert.deepEqual(plain(env.sheet('CommitCollectionStatus').rows), [spec.headers]);
  assert.equal(env.sheet('CommitCollectionStatus').hidden, true);

  const shuffled = new FakeSheet('CommitCollectionStatus', [['Updated At', 'Notes', 'Team ID', 'Status', ''], ['t', 'n', 'T1', 'ok', '']]);
  const env2 = makeEnv({repair: true, sheets: [new FakeSheet('Home', [['x']]), shuffled]});
  assert.deepEqual(plain(env2.ensure(spec)), {created: false, repaired: []});
  assert.equal(shuffled.writes().length, 0, 'a shuffled or extended sheet is accepted without a write');
});

test('runtime mode never appends a missing header, even when repair is enabled', () => {
  const spec = {name: 'CommitCollectionStatus', headers: ['Team ID', 'Status', 'Updated At'], access: 'system', mode: 'runtime', createAtRuntime: true};
  const existing = new FakeSheet('CommitCollectionStatus', [['Team ID', 'Status'], ['T1', 'ok']]);
  const env = makeEnv({repair: true, sheets: [new FakeSheet('Home', [['x']]), existing]});
  assert.throws(() => env.ensure(spec), /CommitCollectionStatus header mismatch\. Missing: Updated At\./);
  assert.equal(existing.writes().length, 0);
  assert.equal(env.lock.acquired, 0);
  const dup = new FakeSheet('CommitCollectionStatus', [['Team ID', 'Status', 'Updated At', 'status']]);
  const env2 = makeEnv({repair: true, sheets: [new FakeSheet('Home', [['x']]), dup]});
  assert.throws(() => env2.ensure(spec), /Duplicate header in CommitCollectionStatus: Status/);
});

test('a busy lock throws the setup message and writes nothing; the lock is released after success and after an error', () => {
  const busy = makeEnv({lockAllow: false});
  assert.throws(() => busy.ensure(setupSpec()), /Another setup is running\. Try again shortly\./);
  assert.equal(busy.spreadsheet.inserted.length, 0);
  assert.equal(busy.lock.released, 0, 'a lock that was never taken is not released');

  const ok = makeEnv();
  ok.ensure(setupSpec());
  assert.equal(ok.lock.acquired, ok.lock.released);

  const failing = makeEnv();
  assert.throws(() => failing.ensure(setupSpec({onCreate() { throw new Error('x'); }})), /formatting failed/);
  assert.equal(failing.lock.acquired, failing.lock.released);
});

test('a lock already held by this execution is reused and left held', () => {
  const env = makeEnv({lockHeld: true});
  env.ensure(setupSpec());
  assert.equal(env.lock.acquired, 0);
  assert.equal(env.lock.released, 0);
  assert.equal(env.lock.held, true);
  assert.ok(env.sheet('ActivityDependencies'));
});

test('the decision is repeated under the lock: a sheet created meanwhile is not created again', () => {
  const env = makeEnv();
  env.lock.beforeAcquire = () => {
    const sheet = env.spreadsheet.insertSheet('ActivityDependencies');
    sheet.rows = [HEADERS.slice()];
    env.spreadsheet.inserted.length = 0;
  };
  assert.deepEqual(plain(env.ensure(setupSpec())), {created: false, repaired: []});
  assert.equal(env.spreadsheet.inserted.length, 0, 'no second sheet is inserted');
  assert.equal(env.spreadsheet.sheets.filter(sheet => sheet.name === 'ActivityDependencies').length, 1);
});

test('after a write the sheet handle, column maps and read snapshots are cleared', () => {
  const existing = new FakeSheet('ActivityDependencies', [['Activity', 'Kind', 'Item'], ['a', 'b', 'c']]);
  const env = makeEnv({repair: true, sheets: [new FakeSheet('Home', [['x']]), existing]});
  const inside = expression => vm.runInContext(expression, env.context);
  env.context.getColumnMap_('ActivityDependencies', {a: 'Activity', k: 'Kind', i: 'Item'});
  assert.ok(inside('sheetExecutionHandles_.activitydependencies'), 'the handle is cached by the first read');
  assert.equal(inside('Object.keys(_columnMapCache).length'), 1);
  env.ensure(setupSpec());
  assert.equal(inside('sheetExecutionHandles_.activitydependencies'), undefined);
  assert.equal(inside('Object.keys(_columnMapCache).length'), 0);
  assert.deepEqual(plain(env.context.getColumnMap_('ActivityDependencies', {l: 'Label', v: 'Active'})), {l: 3, v: 4});
});

test('invalidateSheetCaches_ clears one sheet and leaves others, including read snapshots', () => {
  const env = makeEnv();
  const inside = expression => vm.runInContext(expression, env.context);
  inside(`sheetExecutionHandles_.alpha = {}; sheetExecutionHandles_.beta = {};
    _columnMapCache['Alpha{"a":"A"}'] = {}; _columnMapCache['Beta{"b":"B"}'] = {};
    dashboardReadSnapshot_ = {alpha: [], beta: []}; dashboardHeaderSnapshot_ = {alpha: [], beta: []};`);
  env.context.invalidateSheetCaches_('ALPHA');
  assert.deepEqual(plain(inside('Object.keys(sheetExecutionHandles_)')), ['beta']);
  assert.deepEqual(plain(inside('Object.keys(_columnMapCache)')), ['Beta{"b":"B"}']);
  assert.deepEqual(plain(inside('Object.keys(dashboardReadSnapshot_)')), ['beta']);
  assert.deepEqual(plain(inside('Object.keys(dashboardHeaderSnapshot_)')), ['beta']);
});

test('the helper never deletes, clears or reorders: the fake sheet has no such methods', () => {
  const methods = Object.getOwnPropertyNames(FakeSheet.prototype);
  for (const forbidden of ['deleteColumn', 'deleteRow', 'deleteColumns', 'deleteRows', 'clear', 'clearContent', 'moveColumns', 'sort']) {
    assert.ok(!methods.includes(forbidden));
    assert.ok(!new RegExp('\\.' + forbidden + '\\(').test(SOURCE), forbidden + ' appears in ensure-sheet.js');
  }
});

test('source rules: headers are read only through the shared reader, no public function is added, repair ships enabled under AGENTS.md', () => {
  assert.doesNotMatch(SOURCE, /\.(?:getValue|getValues|getDisplayValue|getDisplayValues|getFormula|getFormulas)\s*\(/);
  const publicFunctions = [...SOURCE.matchAll(/^function ([A-Za-z0-9$]+)\s*\(/gm)].map(match => match[1]).filter(name => !name.endsWith('_'));
  assert.deepEqual(publicFunctions, []);
  assert.ok(SOURCE.includes(REPAIR_FLAG));
  const agents = fs.readFileSync('AGENTS.md', 'utf8');
  assert.ok(agents.includes('## Creating and repairing sheets'), 'repair may be enabled only while AGENTS.md permits it');
  assert.match(agents, /ensureSheet_\` may initialize an empty existing sheet or append missing headers/);
  assert.ok(SOURCE.includes('waitLock(ENSURE_SHEET_LOCK_WAIT_MS_)') && SOURCE.includes('const ENSURE_SHEET_LOCK_WAIT_MS_ = 30000;'));
});
