// TitleLog reading and writing (title-log.js): header lookup, typed rows, escaping and the append.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

const HEADERS = ['Timestamp', 'Team ID', 'Revision', 'Action', 'Actor', 'Request ID', 'Fingerprint', 'Status', 'Proposed Title', 'Proposed Problem',
  'Notes', 'Similarity Note', 'Reopened', 'Approved Title', 'Approved Problem', 'Approved At', 'Approved By'];
const plain = value => JSON.parse(JSON.stringify(value));

function makeEnv(initialRows, {maxRows = 1000} = {}) {
  const rows = initialRows.map(row => row.slice()); // the tests change cells; never share the HEADERS array
  const calls = {setValues: [], insertRowsAfter: [], flush: 0, reads: 0};
  const sheet = {
    rows, maxRows,
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
  const context = vm.createContext({
    console,
    SpreadsheetApp: {getActiveSpreadsheet: () => book, flush() { calls.flush++; }},
    PropertiesService: {getScriptProperties: () => ({getProperty: () => null})}
  });
  ['common-constants.js', 'sheet-reads.js', 'common-helpers.js', 'api-envelope.js', 'sheet-columns.js', 'title-log.js']
    .forEach(file => vm.runInContext(fs.readFileSync(file, 'utf8'), context, {filename: file}));
  return {context, sheet, calls};
}
const date = text => new Date(text);

test('the TitleLog keys line up with the catalog headers', () => {
  const {context} = makeEnv([HEADERS]);
  assert.deepEqual(plain(context.titleLogHeaders_()), HEADERS);
  assert.equal(vm.runInContext('TITLE_LOG_KEYS_.length', context), HEADERS.length);
  assert.deepEqual(plain(context.titleLogColumns_(HEADERS)), Object.fromEntries(vm.runInContext('TITLE_LOG_KEYS_', context).map((key, i) => [key, i])));
});

test('columns are found by header name: reordered, padded and differently cased headers work', () => {
  const {context} = makeEnv([HEADERS]);
  const shuffled = ['Extra', ...HEADERS.slice().reverse().map(h => h.toUpperCase() + '  '), ''];
  const columns = plain(context.titleLogColumns_(shuffled));
  assert.equal(columns.timestamp, 1 + HEADERS.length - 1);
  assert.equal(columns.approvedBy, 1);
  assert.equal(Object.keys(columns).length, HEADERS.length);
});

test('a missing or duplicated header is UNAVAILABLE and names the header', () => {
  const {context} = makeEnv([HEADERS]);
  for (const [row, pattern] of [[HEADERS.filter(h => h !== 'Revision'), /Revision \(missing\)/], [[...HEADERS, 'status'], /Status \(duplicated\)/]]) {
    let caught;
    try { context.titleLogColumns_(row); } catch (error) { caught = error; }
    assert.ok(caught, 'must throw');
    assert.equal(caught.apiCode, 'UNAVAILABLE');
    assert.match(caught.message, pattern);
  }
});

test('rows are typed: dates in milliseconds, numbers, Reopened, escaped text and blank rows skipped', () => {
  const stamp = date('2026-01-02T10:00:00Z');
  const {context} = makeEnv([HEADERS,
    [stamp, 'T1', 2, 'SUBMIT', 'a@example.com', 'req', 'fp', 'NEEDS_REVIEW', 'TITLE', "'=problem", 'n', '', 'Yes', 'AT', 'AP', date('2026-01-01T00:00:00Z'), 'by'],
    Array(HEADERS.length).fill(''),
    ['not a date', 'T2', '3', 'RETURN', '', '', '', 'RETURNED', '', '', '', '', 'maybe', '', '', '', '']]);
  const log = context.readTitleLog_();
  assert.equal(log.rows.length, 2, 'the blank row is skipped');
  const [first, second] = plain(log.rows);
  assert.equal(first.row, 2);
  assert.equal(first.timestamp, stamp.getTime());
  assert.equal(first.revision, 2);
  assert.equal(first.reopened, true);
  assert.equal(first.problem, '=problem', 'a single leading apostrophe before = + @ - is removed');
  assert.equal(first.approvedAt, Date.parse('2026-01-01T00:00:00Z'));
  assert.equal(second.row, 4);
  assert.equal(second.timestamp, null, 'NaN is serialised as null here; checked directly below');
  assert.equal(log.rows[1].revision, 3, 'a numeric string is a revision');
  assert.equal(Number.isNaN(log.rows[1].timestamp), true, 'a text value is not a real date');
  assert.equal(log.rows[1].reopened, null, 'an unknown Reopened value is invalid, not false');
  assert.equal(log.rows[1].approvedAt, null);
});

test('reading is one call, nothing is cached, and a missing sheet or header is UNAVAILABLE', () => {
  const env = makeEnv([HEADERS, [date('2026-01-02T10:00:00Z'), 'T1', 1, 'SUBMIT', 'a', 'r', 'f', 'NEEDS_REVIEW', 'T', 'P', '', '', '', '', '', '', '']]);
  env.context.readTitleLog_();
  assert.equal(env.calls.reads, 1);
  env.sheet.rows[1][1] = 'T9';
  assert.equal(env.context.readTitleLog_().rows[0].teamId, 'T9', 'the next read sees the change');
  env.sheet.rows[0][1] = 'Wrong';
  assert.throws(() => env.context.readTitleLog_(), error => error.apiCode === 'UNAVAILABLE' && /Team ID \(missing\)/.test(error.message));
  const noSheet = makeEnv([HEADERS]);
  noSheet.context.getSheet_ = () => null;
  assert.throws(() => noSheet.context.readTitleLog_(), error => error.apiCode === 'UNAVAILABLE' && /TitleLog sheet is missing/.test(error.message));
});

test('a row becomes cell values in the sheet column order, with dates, escaping and blanks', () => {
  const {context} = makeEnv([HEADERS]);
  const columns = context.titleLogColumns_(HEADERS);
  const values = context.titleLogValues_({timestamp: Date.parse('2026-01-02T10:00:00Z'), teamId: 'T1', revision: 3, action: 'SUBMIT', actor: '-weird@example.com', requestId: 'r',
    fingerprint: 'f', status: 'NEEDS_REVIEW', title: 'A', problem: '=SUM(1)', notes: '+x', similarityNote: '@y', reopened: true,
    approvedTitle: '', approvedProblem: '', approvedAt: null, approvedBy: ''}, columns);
  assert.equal(values.length, HEADERS.length);
  assert.equal(values[0].getTime(), Date.parse('2026-01-02T10:00:00Z'));
  assert.equal(values[2], 3);
  assert.equal(values[4], "'-weird@example.com");
  assert.equal(values[9], "'=SUM(1)");
  assert.equal(values[10], "'+x");
  assert.equal(values[11], "'@y");
  assert.equal(values[12], 'Yes');
  assert.equal(values[15], '');
  const reordered = context.titleLogColumns_(['Extra', ...HEADERS.slice().reverse()]);
  const shuffled = context.titleLogValues_({timestamp: 0, teamId: 'T1', revision: 1, action: 'SUBMIT', actor: '', requestId: '', fingerprint: '', status: 'NEEDS_REVIEW', title: 'A', problem: 'P',
    notes: '', similarityNote: '', reopened: false, approvedTitle: '', approvedProblem: '', approvedAt: null, approvedBy: ''}, reordered);
  assert.equal(shuffled[reordered.teamId], 'T1');
  assert.equal(shuffled[0], '', 'an unmapped column stays blank in a new row');
});

test('append writes one new row under the last used row, flushes, and grows the sheet when it is full', () => {
  const env = makeEnv([HEADERS, [date('2026-01-02T10:00:00Z'), 'T1', 1, 'SUBMIT', 'a', 'r', 'f', 'NEEDS_REVIEW', 'T', 'P', '', '', '', '', '', '', '']], {maxRows: 2});
  const log = env.context.readTitleLog_();
  const target = env.context.appendTitleLogRow_(log, {timestamp: Date.parse('2026-01-03T10:00:00Z'), teamId: 'T1', revision: 2, action: 'GUIDE_APPROVE', actor: 'g', requestId: 'r2',
    fingerprint: 'f2', status: 'AWAITING_REVIEWER', title: 'T', problem: 'P', notes: '', similarityNote: '', reopened: false, approvedTitle: '', approvedProblem: '', approvedAt: null, approvedBy: ''});
  assert.equal(target, 3);
  assert.deepEqual(env.calls.insertRowsAfter, [[2, 1]]);
  assert.deepEqual(env.calls.setValues, [[3, 1, 1, HEADERS.length]]);
  assert.equal(env.calls.flush, 1);
  assert.equal(env.context.readTitleLog_().rows.length, 2);
  assert.equal(env.context.readTitleLog_().rows[1].action, 'GUIDE_APPROVE');
});

test('source rules: header lookup is by name, reads go through the shared reader, and nothing here repairs a header', () => {
  const text = fs.readFileSync('title-log.js', 'utf8');
  assert.doesNotMatch(text, /\.(?:getValue|getValues|getDisplayValue|getDisplayValues|getFormula|getFormulas)\s*\(/);
  assert.doesNotMatch(text, /ensureSheet_|insertColumn|insertSheet|deleteColumn|deleteRow|\.clear/);
  const publicFunctions = [...text.matchAll(/^function ([A-Za-z0-9$]+)\s*\(/gm)].map(match => match[1]).filter(name => !name.endsWith('_'));
  assert.deepEqual(publicFunctions, []);
});
