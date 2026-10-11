// A fake TitleLog sheet and the real title modules loaded around it, shared by the title tests.
const fs = require('node:fs');
const vm = require('node:vm');

const HEADERS = ['Timestamp', 'Team ID', 'Revision', 'Action', 'Actor', 'Request ID', 'Fingerprint', 'Status', 'Proposed Title', 'Proposed Problem',
  'Notes', 'Similarity Note', 'Reopened', 'Approved Title', 'Approved Problem', 'Approved At', 'Approved By'];

/** A parsed row object (as tests/title-fixtures.cjs builds them) as the array a sheet row holds. */
function sheetRow(row) {
  return [new Date(row.timestamp), row.teamId, row.revision, row.action, row.actor, row.requestId, row.fingerprint, row.status, row.title, row.problem,
    row.notes, row.similarityNote, row.reopened ? 'Yes' : '', row.approvedTitle, row.approvedProblem, row.approvedAt === null ? '' : new Date(row.approvedAt), row.approvedBy];
}

const DEFAULT_FILES = ['common-constants.js', 'sheet-reads.js', 'common-helpers.js', 'api-envelope.js', 'sheet-columns.js', 'title-log.js', 'title-history.js', 'title-gate.js'];

/**
 * options: files (extra source files to load after the defaults), maxRows, now (ms, default a fixed time), globals (extra context globals).
 * Returns {context, sheet, calls, setNow}.
 */
function makeTitleEnv(initialRows, options = {}) {
  const rows = initialRows.map(row => row.slice());
  const calls = {setValues: [], insertRowsAfter: [], flush: 0, reads: 0};
  let now = options.now === undefined ? Date.parse('2026-02-01T00:00:00Z') : options.now;
  const sheet = {
    rows, maxRows: options.maxRows || 1000,
    getName: () => 'TitleLog',
    getLastRow() { let last = 0; this.rows.forEach((r, i) => { if (r.some(v => v !== '' && v != null)) last = i + 1; }); return last; },
    getLastColumn() { return Math.max(0, ...this.rows.map(r => r.length)); },
    getMaxRows() { return this.maxRows; },
    insertRowsAfter(position, count) { calls.insertRowsAfter.push([position, count]); this.maxRows += count; },
    getRange: (row, column, numRows, numColumns) => ({
      getValues: () => { calls.reads++; return Array.from({length: numRows}, (_, r) => Array.from({length: numColumns}, (_, c) => (rows[row - 1 + r] || [])[column - 1 + c] ?? '')); },
      setValues: values => { calls.setValues.push([row, column, numRows, numColumns]); values.forEach((vr, r) => { rows[row - 1 + r] = rows[row - 1 + r] || []; vr.forEach((v, c) => { rows[row - 1 + r][column - 1 + c] = v; }); }); }
    })
  };
  const book = {getId: () => 'book', getSheetByName: name => name === 'TitleLog' ? sheet : null, getSheets: () => [sheet]};
  class FakeDate extends Date { constructor(...args) { super(...(args.length ? args : [now])); } static now() { return now; } }
  const context = vm.createContext({
    console: options.console || console, Date: FakeDate,
    SpreadsheetApp: {getActiveSpreadsheet: () => book, flush() { calls.flush++; }},
    PropertiesService: {getScriptProperties: () => ({getProperty: () => null})},
    ...(options.globals || {})
  });
  [...DEFAULT_FILES, ...(options.files || [])].forEach(file => vm.runInContext(fs.readFileSync(file, 'utf8'), context, {filename: file}));
  return {context, sheet, calls, setNow: value => { now = value; }};
}

module.exports = {HEADERS, sheetRow, makeTitleEnv};
