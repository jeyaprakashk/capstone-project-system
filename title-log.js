/**
 * TITLE LOG - reading and writing the TitleLog sheet (TITLE-REVISION-PLAN.md, section 4).
 * The sheet is append-only and script-owned. Its name and headers live in the sheet catalog (sheet-columns.js);
 * TITLE_LOG_KEYS_ names each column in the same order. Columns are found by header name. Runtime code never creates,
 * appends or repairs a header: a missing or duplicated header makes every title read and write fail with UNAVAILABLE.
 */
const TITLE_LOG_KEYS_ = Object.freeze(['timestamp', 'teamId', 'revision', 'action', 'actor', 'requestId', 'fingerprint', 'status',
  'title', 'problem', 'notes', 'similarityNote', 'reopened', 'approvedTitle', 'approvedProblem', 'approvedAt', 'approvedBy']);
const TITLE_ACTIONS_ = Object.freeze(['BASELINE', 'SUBMIT', 'GUIDE_APPROVE', 'RETURN', 'REVIEWER_APPROVE', 'REOPEN', 'CANCEL_REOPEN']);
const TITLE_STATUSES_ = Object.freeze(['NOT_SUBMITTED', 'NEEDS_REVIEW', 'AWAITING_REVIEWER', 'RETURNED', 'APPROVED', 'REOPENED']);

/** An error the envelope turns into UNAVAILABLE: storage, headers or history that cannot be trusted. */
function titleUnavailable_(message) {
  return apiFail_('UNAVAILABLE', message);
}

function titleLogHeaders_() {
  return sheetSpec_('titleLog').headers;
}

/** key -> 0-based column index from the sheet's header row. Throws when a required header is missing or duplicated. */
function titleLogColumns_(headerRow) {
  const headers = titleLogHeaders_();
  if (headers.length !== TITLE_LOG_KEYS_.length) throw new Error('The TitleLog keys and the catalog headers differ.');
  const cells = (headerRow || []).map(cell => String(cell === null || cell === undefined ? '' : cell).trim());
  const columns = {}, problems = [];
  headers.forEach((header, position) => {
    const indexes = [];
    cells.forEach((cell, index) => { if (textEquals_(cell, header)) indexes.push(index); });
    if (indexes.length !== 1) problems.push(header + (indexes.length ? ' (duplicated)' : ' (missing)'));
    columns[TITLE_LOG_KEYS_[position]] = indexes[0];
  });
  if (problems.length) throw titleUnavailable_('The TitleLog headers are not usable: ' + problems.join(', ') + '. Contact the coordinator.');
  return columns;
}

/** Text written to a cell is escaped when it could be read as a formula. */
function escapeTitleCell_(value) {
  const text = String(value === null || value === undefined ? '' : value);
  return /^[=+@-]/.test(text) ? "'" + text : text;
}

function unescapeTitleCell_(value) {
  const text = String(value === null || value === undefined ? '' : value);
  return /^'[=+@-]/.test(text) ? text.slice(1) : text;
}

/** A date cell as milliseconds: null when blank, NaN when it is not a real date. */
function titleDateMs_(value) {
  if (value === '' || value === null || value === undefined) return null;
  if (Object.prototype.toString.call(value) !== '[object Date]') return NaN;
  return value.getTime();
}

/** One sheet row as a typed object, or null for a blank row. */
function parseTitleLogRow_(raw, columns, rowNumber) {
  if (!TITLE_LOG_KEYS_.some(key => String(raw[columns[key]] === undefined || raw[columns[key]] === null ? '' : raw[columns[key]]).trim() !== '')) return null;
  const text = key => unescapeTitleCell_(raw[columns[key]]);
  const revisionCell = raw[columns.revision];
  const revision = revisionCell === '' || revisionCell === null || revisionCell === undefined ? NaN : Number(revisionCell);
  const reopenedText = String(raw[columns.reopened] === undefined || raw[columns.reopened] === null ? '' : raw[columns.reopened]).trim().toLowerCase();
  return {
    row: rowNumber,
    timestamp: titleDateMs_(raw[columns.timestamp]),
    teamId: text('teamId').trim(),
    revision: Number.isInteger(revision) ? revision : NaN,
    action: text('action').trim(),
    actor: text('actor').trim(),
    requestId: text('requestId').trim(),
    fingerprint: text('fingerprint').trim(),
    status: text('status').trim(),
    title: text('title'),
    problem: text('problem'),
    notes: text('notes'),
    similarityNote: text('similarityNote'),
    reopened: reopenedText === 'yes' ? true : reopenedText === '' ? false : null,
    approvedTitle: text('approvedTitle'),
    approvedProblem: text('approvedProblem'),
    approvedAt: titleDateMs_(raw[columns.approvedAt]),
    approvedBy: text('approvedBy').trim()
  };
}

/** Reads the whole log in one call. Returns {rows, columns, sheet}. Nothing is cached between calls. */
function readTitleLog_() {
  const name = sheetSpec_('titleLog').name;
  const sheet = getSheet_(name);
  if (!sheet) throw titleUnavailable_('The TitleLog sheet is missing. Contact the coordinator.');
  const all = readSheetRows_(sheet, 1);
  const columns = titleLogColumns_(all[0] || []);
  const rows = [];
  all.slice(1).forEach((raw, index) => {
    const parsed = parseTitleLogRow_(raw, columns, index + 2);
    if (parsed) rows.push(parsed);
  });
  return {rows, columns, sheet};
}

/** The cell values of a row object, in the sheet's column order, ready for one setValues call. */
function titleLogValues_(row, columns) {
  const width = Math.max(...TITLE_LOG_KEYS_.map(key => columns[key])) + 1;
  const values = Array(width).fill('');
  const put = (key, value) => { values[columns[key]] = value; };
  put('timestamp', new Date(row.timestamp));
  put('teamId', escapeTitleCell_(row.teamId));
  put('revision', row.revision);
  ['action', 'actor', 'requestId', 'fingerprint', 'status', 'title', 'problem', 'notes', 'similarityNote', 'approvedTitle', 'approvedProblem', 'approvedBy']
    .forEach(key => put(key, escapeTitleCell_(row[key])));
  put('reopened', row.reopened ? 'Yes' : '');
  put('approvedAt', row.approvedAt === null || row.approvedAt === undefined ? '' : new Date(row.approvedAt));
  return values;
}

/** Appends one row after the last used row. The caller holds the script lock. */
function appendTitleLogRow_(log, row) {
  const sheet = log.sheet;
  const values = titleLogValues_(row, log.columns);
  const target = sheet.getLastRow() + 1;
  if (target > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), target - sheet.getMaxRows());
  sheet.getRange(target, 1, 1, values.length).setValues([values]);
  SpreadsheetApp.flush();
  return target;
}
