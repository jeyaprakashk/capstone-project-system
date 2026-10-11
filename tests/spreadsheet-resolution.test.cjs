// Which spreadsheet the project works on: the one the script is attached to when there is one, otherwise the SHEET_ID script
// property (common-helpers.js, getSpreadsheet_ and getSpreadsheetId_). A copy of the spreadsheet and its script must work on
// the copy, never on the original, even if a copied SHEET_ID property points at the original.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

function fakeBook(id, rows) {
  const configRows = rows || [['Key', 'Value', 'Description'], ['SUBMISSION_REMINDER_HOURS', '24', '']];
  const config = {
    getName: () => 'Config',
    getLastRow: () => configRows.length,
    getLastColumn: () => Math.max(...configRows.map(row => row.length)),
    getRange: (row, column, numRows, numColumns) => ({
      getValues: () => Array.from({length: numRows}, (_, r) => Array.from({length: numColumns}, (_, c) => (configRows[row - 1 + r] || [])[column - 1 + c] ?? '')),
      setValue: value => { configRows[row - 1][column - 1] = value; }
    })
  };
  return {getId: () => id, getSheetByName: name => name === 'Config' ? config : null, getSheets: () => [config]};
}

function load({active, property, books = {}}) {
  const calls = {active: 0, openById: [], property: 0};
  const context = vm.createContext({
    console,
    SpreadsheetApp: {
      getActiveSpreadsheet: () => { calls.active++; return active || null; },
      openById: id => { calls.openById.push(id); return books[id] || fakeBook(id); }
    },
    PropertiesService: {getScriptProperties: () => ({getProperty: key => { calls.property++; return key === 'SHEET_ID' ? property : null; }})}
  });
  ['common-constants.js', 'sheet-reads.js', 'common-helpers.js'].forEach(file => vm.runInContext(fs.readFileSync(file, 'utf8'), context, {filename: file}));
  return {context, calls};
}

test('the spreadsheet the script is attached to wins, even if SHEET_ID points at another one (a copy never reaches the original)', () => {
  const copy = fakeBook('copy-id');
  const {context, calls} = load({active: copy, property: 'original-id'});
  assert.equal(context.getSpreadsheet_(), copy);
  assert.equal(context.getSpreadsheetId_(), 'copy-id');
  assert.deepEqual(calls.openById, [], 'the original is never opened');
  assert.equal(calls.property, 0, 'the property is not even read when there is an active spreadsheet');
});

test('with no active spreadsheet the SHEET_ID property is used', () => {
  const standalone = fakeBook('property-id');
  const {context, calls} = load({active: null, property: 'property-id', books: {'property-id': standalone}});
  assert.equal(context.getSpreadsheet_(), standalone);
  assert.equal(context.getSpreadsheetId_(), 'property-id');
  assert.deepEqual(calls.openById, ['property-id']);
});

test('with neither an active spreadsheet nor the property, it fails with the existing message and opens nothing', () => {
  for (const property of [null, undefined, '']) {
    const {context, calls} = load({active: null, property});
    assert.throws(() => context.getSpreadsheet_(), /SHEET_ID is not configured in Script Properties\./);
    assert.throws(() => context.getSpreadsheetId_(), /SHEET_ID is not configured/);
    assert.deepEqual(calls.openById, []);
  }
});

test('the spreadsheet is resolved once per execution', () => {
  const {context, calls} = load({active: fakeBook('copy-id'), property: 'original-id'});
  for (let i = 0; i < 5; i++) { context.getSpreadsheet_(); context.getSpreadsheetId_(); }
  assert.equal(calls.active, 1);
});

test('configuration reads work from the active spreadsheet alone, with no SHEET_ID property', () => {
  const {context} = load({active: fakeBook('copy-id'), property: undefined});
  assert.equal(context.getConfig_('SUBMISSION_REMINDER_HOURS'), '24');
});

test('source rules: only getSpreadsheet_ reads the SHEET_ID property, and no other file uses a SHEET_ID constant', () => {
  const helpers = fs.readFileSync('common-helpers.js', 'utf8');
  assert.equal([...helpers.matchAll(/getProperty\('SHEET_ID'\)/g)].length, 1);
  assert.doesNotMatch(helpers, /^const SHEET_ID\b/m);
  const offenders = [];
  for (const file of fs.readdirSync('.').filter(name => name.endsWith('.js') && !name.startsWith('tailwind'))) {
    // Comments and string literals (the property name, the error message) are not uses of a constant.
    const code = fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
      .replace(/'(?:[^'\\\n]|\\.)*'/g, "''");
    if (/(?<![A-Za-z0-9_])SHEET_ID(?![A-Za-z0-9_])/.test(code)) offenders.push(file);
  }
  assert.deepEqual(offenders, [], 'use getSpreadsheetId_() instead of a SHEET_ID constant');
  for (const file of ['team-folders.js', 'coordinator-dashboard.js', 'review-configuration.js']) {
    assert.match(fs.readFileSync(file, 'utf8'), /getSpreadsheetId_\(\)/, file);
  }
});

// Config is found by header name: the Key and Value columns (SHEET-HEADER-MATCHING-PLAN.md, phase 4).
test('Config: Key and Value are found by name, in any order, with other columns ignored', () => {
  const book = fakeBook('b', [['Notes', 'Value', 'Description', 'Key'], ['n', '24', 'd', 'SUBMISSION_REMINDER_HOURS'], ['n', 'x', 'd', ' Other_Key ']]);
  const {context} = load({active: book});
  context.SpreadsheetApp.flush = () => {};
  assert.equal(context.getConfig_('SUBMISSION_REMINDER_HOURS'), '24');
  assert.equal(context.getConfig_('other_key'), 'x');
  context.setConfig_('submission_reminder_hours', '36');
  assert.equal(context.getConfig_('SUBMISSION_REMINDER_HOURS'), '36');
  assert.equal(book.getSheetByName('Config').getRange(2, 2, 1, 1).getValues()[0][0], '36', 'the Value column is written, not column B by position');
  assert.equal(book.getSheetByName('Config').getRange(2, 4, 1, 1).getValues()[0][0], 'SUBMISSION_REMINDER_HOURS', 'the Key column is untouched');
});

test('Config: a missing or repeated Key or Value header throws, naming it', () => {
  for (const [header, pattern] of [[['Name', 'Value', 'Description'], /Missing: Key/], [['Key', 'Val', 'Description'], /Missing: Value/],
    [['Key', 'Value', 'key'], /Duplicate header in Config: Key/]]) {
    const {context} = load({active: fakeBook('b', [header, ['A', '1', '']])});
    assert.throws(() => context.getConfig_('A'), pattern);
  }
});

test('Config: one read per execution, header row included', () => {
  const book = fakeBook('b');
  const config = book.getSheetByName('Config'), reads = [], getRange = config.getRange;
  config.getRange = (...args) => { reads.push(args.join(',')); return getRange(...args); };
  const {context} = load({active: book});
  context.getConfig_('SUBMISSION_REMINDER_HOURS');
  context.getConfig_('SUBMISSION_REMINDER_HOURS');
  assert.deepEqual(reads, ['1,1,2,3']);
});
