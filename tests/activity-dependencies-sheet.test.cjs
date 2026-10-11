// The ActivityDependencies sheet setup (activity-dependencies-sheet.js): its call to ensureSheet_, the first-creation
// formatting and the editor-run entry point. The helper's own behaviour is tested in tests/ensure-sheet.test.cjs.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const plain = value => JSON.parse(JSON.stringify(value));
const HEADERS = ['Activity', 'Kind', 'Item', 'Label', 'Active'];

// `before` globals are set before the sources load (for services such as SpreadsheetApp); `after` replaces functions that the
// loaded files define themselves (such as requireTriggerOrOperator_), which a value set beforehand would not survive.
function load(before = {}, after = {}) {
  const context = vm.createContext({
    console,
    PropertiesService: {getScriptProperties: () => ({getProperty: () => 'SHEET_ID'})},
    ...before
  });
  ['common-constants.js', 'common-helpers.js', 'sheet-columns.js', 'activity-dependencies-sheet.js'].forEach(file =>
    vm.runInContext(fs.readFileSync(file, 'utf8'), context, {filename: file}));
  Object.assign(context, {requireTriggerOrOperator_: () => {}}, after);
  return {context};
}

function stubbedHelper(result = {created: true, repaired: []}) {
  const calls = [];
  return {calls, ensureSheet_: spec => { calls.push(spec); return result; }};
}

test('the catalog entry pins the name, the five headers in order and the edit access', () => {
  const {context} = load();
  assert.deepEqual(plain(context.sheetSpec_('activityDependencies')), {name: 'ActivityDependencies', headers: HEADERS, access: 'edit', createAtRuntime: false});
});

test('setup calls ensureSheet_ once with the catalog spec, mode setup and an onCreate, and nothing else', () => {
  const stub = stubbedHelper();
  const {context} = load({}, {ensureSheet_: stub.ensureSheet_});
  context.ensureActivityDependenciesSheet_();
  assert.equal(stub.calls.length, 1);
  const spec = stub.calls[0];
  assert.deepEqual(Object.keys(spec).sort(), ['access', 'createAtRuntime', 'headers', 'mode', 'name', 'onCreate']);
  assert.deepEqual(plain({name: spec.name, headers: spec.headers, access: spec.access, createAtRuntime: spec.createAtRuntime, mode: spec.mode}),
    {name: 'ActivityDependencies', headers: HEADERS, access: 'edit', createAtRuntime: false, mode: 'setup'});
  assert.equal(typeof spec.onCreate, 'function');
  assert.equal(spec.onCreate, context.formatActivityDependenciesSheet_);
});

test('the helper result is returned unchanged', () => {
  const result = {created: false, repaired: ['Active']};
  const {context} = load({}, {ensureSheet_: stubbedHelper(result).ensureSheet_});
  assert.equal(context.ensureActivityDependenciesSheet_(), result);
  assert.equal(context.setupActivityDependencies(), result);
});

test('first-creation formatting: plain-text columns, a frozen header row and a Yes/No list for Active from row 2', () => {
  const log = [];
  const validation = {values: null, allowInvalid: null};
  const builder = {
    requireValueInList(values, dropdown) { validation.values = values.slice(); validation.dropdown = dropdown; return this; },
    setAllowInvalid(flag) { validation.allowInvalid = flag; return this; },
    build() { return validation; }
  };
  const {context} = load({SpreadsheetApp: {newDataValidation: () => builder}});
  const sheet = {
    getMaxRows: () => 1000,
    getRange: (...args) => ({
      setNumberFormat: format => log.push(['format', args, format]),
      setDataValidation: rule => log.push(['validation', args, rule]),
      setValues: () => { throw new Error('no data row may be written'); },
      setValue: () => { throw new Error('no data row may be written'); }
    }),
    setFrozenRows: count => log.push(['frozen', count])
  };
  context.formatActivityDependenciesSheet_(sheet);
  assert.deepEqual(plain(log.filter(entry => entry[0] === 'format')), [['format', [1, 1, 1000, 5], '@']]);
  assert.deepEqual(plain(log.filter(entry => entry[0] === 'frozen')), [['frozen', 1]]);
  const applied = log.filter(entry => entry[0] === 'validation');
  assert.equal(applied.length, 1);
  assert.deepEqual(plain(applied[0][1]), [2, 5, 999, 1], 'column E, from row 2 down');
  assert.deepEqual(plain(validation.values), ['Yes', 'No']);
  assert.equal(validation.allowInvalid, false);
});

test('the sheet is correct without the formatting: an end-to-end run with onCreate stubbed out writes only the header row', () => {
  const writes = [];
  const sheets = [];
  const fakeSheet = name => ({
    name, rows: [], maxColumns: 26, hidden: false, color: null,
    getName() { return this.name; },
    getLastRow() { return this.rows.length; },
    getLastColumn() { return this.rows.reduce((max, row) => Math.max(max, row.length), 0); },
    getMaxColumns() { return this.maxColumns; },
    insertColumnsAfter() {},
    getRange(row, column, numRows, numColumns) {
      const sheet = this;
      return {setValues(values) { writes.push(['setValues', row, column, numRows, numColumns]); sheet.rows[row - 1] = values[0].slice(); }};
    },
    setTabColor(color) { this.color = color; },
    hideSheet() { this.hidden = true; },
    isSheetHidden() { return this.hidden; }
  });
  const home = fakeSheet('Home'); home.rows = [['x']]; sheets.push(home);
  const spreadsheet = {
    getSheets: () => sheets,
    getSheetByName: name => sheets.find(sheet => sheet.name === name) || null,
    insertSheet(name) { const sheet = fakeSheet(name); sheets.push(sheet); return sheet; }
  };
  const lock = {held: false, hasLock() { return this.held; }, waitLock() { this.held = true; }, releaseLock() { this.held = false; }};
  const context = vm.createContext({
    console, PropertiesService: {getScriptProperties: () => ({getProperty: () => 'SHEET_ID'})},
    SpreadsheetApp: {getActiveSpreadsheet: () => null, openById: () => spreadsheet, flush() {}}, LockService: {getScriptLock: () => lock}
  });
  ['common-constants.js', 'common-helpers.js', 'sheet-reads.js', 'ensure-sheet.js', 'sheet-columns.js', 'activity-dependencies-sheet.js']
    .forEach(file => vm.runInContext(fs.readFileSync(file, 'utf8'), context, {filename: file}));
  vm.runInContext('formatActivityDependenciesSheet_ = () => {};', context);
  const result = plain(context.ensureActivityDependenciesSheet_());
  assert.deepEqual(result, {created: true, repaired: []});
  const created = spreadsheet.getSheetByName('ActivityDependencies');
  assert.deepEqual(plain(created.rows), [HEADERS]);
  assert.equal(created.color, '#188038');
  assert.equal(created.hidden, false);
  assert.equal(writes.length, 1, 'only the header row is written: setup never inserts a data row');
});

test('setupActivityDependencies calls the guard first, then the ensure function, and rejects a non-coordinator', () => {
  const order = [];
  const stub = stubbedHelper({created: true, repaired: []});
  const {context} = load({}, {
    requireTriggerOrOperator_: () => order.push('guard'),
    ensureSheet_: spec => { order.push('ensure'); return stub.ensureSheet_(spec); }
  });
  context.setupActivityDependencies();
  assert.deepEqual(order, ['guard', 'ensure']);

  const denied = load({}, {
    requireTriggerOrOperator_: () => { throw new Error('Coordinator access is required.'); },
    ensureSheet_: () => { throw new Error('must not be reached'); }
  });
  assert.throws(() => denied.context.setupActivityDependencies(), /Coordinator access is required/);
});

test('source rules: the first statement is the guard, the module is the only listed setup entry point, no name or header is defined here', () => {
  const text = fs.readFileSync('activity-dependencies-sheet.js', 'utf8');
  const body = text.slice(text.indexOf('function setupActivityDependencies'));
  assert.equal(body.slice(body.indexOf('{') + 1).trim().split(/\r?\n/)[0].trim(), 'requireTriggerOrOperator_();');
  const code = text.replace(/\/\*[\s\S]*?\*\//g, '');
  assert.ok(!code.includes("'ActivityDependencies'"), 'the sheet name lives in the catalog');
  assert.ok(!code.includes("'Kind'"), 'the headers live in the catalog');
  const publicFunctions = [...text.matchAll(/^function ([A-Za-z0-9$]+)\s*\(/gm)].map(match => match[1]).filter(name => !name.endsWith('_'));
  assert.deepEqual(publicFunctions, ['setupActivityDependencies']);
});
