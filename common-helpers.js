/**
 * COMMON HELPERS — shared across all dashboards and workflows
 * Pure utilities: no dashboard-specific logic
 */

// ===================================================================
// CONFIGURATION
// ===================================================================
let configExecutionValues_ = null;
function getInternalReviews_() {
  return Object.freeze(getAssessmentDefinitions_().filter(d=>d.type==='REVIEW'));
}

function getConfig_(key) {
  const targetKey = normalizeText_(key);
  if (configExecutionValues_) return requireConfigValue_(targetKey);

  const configSheet = getSheet_('Config');

  if (!configSheet) {
    throw new Error('Config sheet not found.');
  }

  const lastRow = configSheet.getLastRow();

  if (lastRow < 2) {
    throw new Error(
      'Config sheet contains no configuration entries.'
    );
  }

  const rows = readSheetRows_(configSheet, 2, lastRow - 1);

  configExecutionValues_ = Object.create(null);
  rows.forEach(row => {
    const key = normalizeText_(row[0]);
    if (!key) return;
    if (Object.prototype.hasOwnProperty.call(configExecutionValues_, key)) throw new Error('Duplicate Config key: ' + key);
    configExecutionValues_[key] = row[1];
  });
  return requireConfigValue_(targetKey);
}

function requireConfigValue_(key) {
  const value = configExecutionValues_[key];
  if (value === '' || value === null || value === undefined) {
    throw new Error(`Config key "${key}" is missing or blank in the Config tab.`);
  }
  return value;
}

/**
 * Updates an existing key in the Config sheet.
 * The key must already exist; configuration keys are not silently created.
 *
 * @param {string} key
 * @param {*} value
 */
function setConfig_(key, value) {
  const configSheet = getSheet_('Config');
  if (!configSheet) {
    throw new Error('Config sheet not found.');
  }

  const lastRow = configSheet.getLastRow();
  if (lastRow < 2) {
    throw new Error('Config sheet contains no configuration entries.');
  }

  const keys = readSheetRows_(configSheet, 2, lastRow - 1);

  const targetKey = normalizeText_(key);

  for (let i = 0; i < keys.length; i++) {
    if (normalizeText_(keys[i][0]) === targetKey) {
      configSheet.getRange(i + 2, 2).setValue(value);
      SpreadsheetApp.flush();
      configExecutionValues_ = null;
      projectScheduleExecution_ = null;
      return;
    }
  }

  throw new Error(
    `Config key "${targetKey}" does not exist in the Config tab.`
  );
}
// ===================================================================
// SPREADSHEET OPERATIONS
// ===================================================================
// Reuse the Spreadsheet object only during the current Apps Script execution.
// This is NOT persistent data caching: every new web request opens the live
// spreadsheet again, but repeated getSheet_() calls in the same request no
// longer repeat the lookup of the spreadsheet.
let _spreadsheetExecutionHandle = null;

/**
 * The spreadsheet this project works on: the one the script is attached to when there is one (this project is
 * container-bound), otherwise the spreadsheet named by the SHEET_ID script property. A copy of the spreadsheet and its
 * script therefore works on the copy, never on the original, even if a SHEET_ID property points somewhere else.
 */
function getSpreadsheet_() {
  if (!_spreadsheetExecutionHandle) {
    const active = SpreadsheetApp.getActiveSpreadsheet();
    if (active) {
      _spreadsheetExecutionHandle = active;
    } else {
      const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
      if (!sheetId) throw new Error('SHEET_ID is not configured in Script Properties.');
      _spreadsheetExecutionHandle = SpreadsheetApp.openById(sheetId);
    }
  }
  return _spreadsheetExecutionHandle;
}

/** The ID of the spreadsheet getSpreadsheet_ returns, for Drive lookups and links. */
function getSpreadsheetId_() {
  return getSpreadsheet_().getId();
}

let sheetExecutionHandles_ = Object.create(null);
let dashboardReadSnapshot_ = null;
let dashboardHeaderSnapshot_ = null;

function getNamedSheet_(spreadsheet, name) {
  const exact = spreadsheet.getSheetByName(String(name).trim());
  if (exact) return exact;
  const matches = spreadsheet.getSheets().filter(sheet => textEquals_(sheet.getName(), name));
  if (matches.length > 1) throw new Error('Ambiguous sheet name: ' + name);
  return matches[0] || null;
}

function getSheet_(sheetName) {
  const key = normalizeText_(sheetName);
  if (!sheetExecutionHandles_[key]) sheetExecutionHandles_[key] = getNamedSheet_(getSpreadsheet_(), sheetName);
  return sheetExecutionHandles_[key];
}

/** Times one phase into `timings` (no-op when `timings` is absent). Names and durations only; no identifiers or sheet values. */
function timedPhase_(timings, phase, read) {
  if (!timings) return read();
  const started = Date.now();
  let success = false;
  try { const value = read(); success = true; return value; }
  finally { timings.push({phase, durationMs:Date.now() - started, success}); }
}

function logPhases_(event, operation, timings, startedAt) {
  if (typeof console !== 'undefined') console.log(JSON.stringify({event, operation, totalMs:Date.now() - startedAt, timings}));
}

/** Opt-in snapshots are limited to read-only dashboard endpoints. Writers stay live. */
function withDashboardRead_(read) {
  if (dashboardReadSnapshot_) return read();
  dashboardReadSnapshot_ = Object.create(null);
  dashboardHeaderSnapshot_ = Object.create(null);
  try { return read(); }
  finally { dashboardReadSnapshot_ = null; dashboardHeaderSnapshot_ = null; }
}

function getSheetRows_(sheetName) {
  const key = normalizeText_(sheetName);
  if (dashboardReadSnapshot_ && Object.prototype.hasOwnProperty.call(dashboardReadSnapshot_, key)) {
    return dashboardReadSnapshot_[key];
  }
  const values = getSheet_(sheetName).getDataRange().getValues();
  const rows = values.slice(1);
  if (dashboardHeaderSnapshot_) dashboardHeaderSnapshot_[key] = values[0] || [];
  if (dashboardReadSnapshot_) dashboardReadSnapshot_[key] = rows;
  return rows;
}

/** Batch matched records into one full-width read instead of one RPC per match. */
function readMatchedRows_(sheet, matches) {
  if (!matches.length) return [];
  const rows = matches.map(cell => cell.getRow());
  const first = rows.reduce((a,b) => Math.min(a,b));
  const last = rows.reduce((a,b) => Math.max(a,b));
  const values = readSheetRows_(sheet, first, last - first + 1);
  return rows.map(row => values[row - first]);
}

function setStatusFields_(sheet, row, fields, columnMap) {
  Object.entries(fields).forEach(([field, value]) => {
    sheet.getRange(row, columnMap[field] + 1).setValue(value);
  });
}

function findTeamStatusRow_(statusSheet, teamId, columnMap) {
  const ids = readSheetRows_(statusSheet, 2);
  for (let i = 0; i < ids.length; i++) {
    if (textEquals_(ids[i][columnMap.TEAM_ID], teamId)) return i + 2;
  }
  return -1;
}

// ===================================================================
// COLUMN MAPPING — header-based, case-insensitive
// ===================================================================
function buildColumnMap_(sheet, fieldNameMap, headers) {
  const headerRow = headers || (readSheetRows_(sheet, 1, 1)[0] || []);
  const normalize = s => String(s).trim().toLowerCase();
  const headerIndex = {};
  headerRow.forEach((h, i) => { headerIndex[normalize(h)] = i; });

  const result = {};
  const missing = [];
  Object.entries(fieldNameMap).forEach(([key, expectedHeader]) => {
    const idx = headerIndex[normalize(expectedHeader)];
    if (idx === undefined) missing.push(expectedHeader);
    else result[key] = idx;
  });

  if (missing.length > 0) {
    throw new Error(`Missing expected column(s) in "${sheet.getName()}": ${missing.join(', ')}`);
  }
  return result;
}

// Cached column maps per execution
let _columnMapCache = {};

function getColumnMap_(sheetName, fieldMap) {
  const cacheKey = sheetName + JSON.stringify(fieldMap);
  if (!_columnMapCache[cacheKey]) {
    if (dashboardReadSnapshot_) getSheetRows_(sheetName);
    _columnMapCache[cacheKey] = buildColumnMap_(getSheet_(sheetName), fieldMap, dashboardHeaderSnapshot_ && dashboardHeaderSnapshot_[normalizeText_(sheetName)]);
  }
  return _columnMapCache[cacheKey];
}

/** After a sheet is created or its header row changes: drop this execution's handle, column maps and read snapshots for it. */
function invalidateSheetCaches_(sheetName) {
  const key = normalizeText_(sheetName);
  delete sheetExecutionHandles_[key];
  Object.keys(_columnMapCache).forEach(cacheKey => {
    if (normalizeText_(cacheKey.slice(0, cacheKey.indexOf('{'))) === key) delete _columnMapCache[cacheKey];
  });
  if (dashboardReadSnapshot_) delete dashboardReadSnapshot_[key];
  if (dashboardHeaderSnapshot_) delete dashboardHeaderSnapshot_[key];
}

// ===================================================================
// EMAIL UTILITIES
// ===================================================================
function normalizeText_(value) {
  return String(value ?? '').trim().toLowerCase();
}

// TextFinder must tolerate whitespace in the cell, not only in the search input.
function normalizedTextPattern_(value) {
  const escaped = Array.from(normalizeText_(value), character =>
    '\\^$.*+?()[]{}|'.includes(character) ? '\\' + character : character).join('');
  return '^\\s*' + escaped + '\\s*$';
}

function textEquals_(left, right) {
  return normalizeText_(left) === normalizeText_(right);
}

/**
 * First statement of every public entry point that triggers or the editor run (and that is therefore callable
 * by name through google.script.run). It allows a trigger, an editor run or a coordinator, and rejects any
 * other signed-in user: the web app executes as its deployer, so the effective user is never the caller.
 */
function requireTriggerOrOperator_() {
  const active = normalizeEmail_(Session.getActiveUser().getEmail());
  if (!active) return;
  const effective = Session.getEffectiveUser ? normalizeEmail_(Session.getEffectiveUser().getEmail()) : active;
  if (active === effective || activityIsCoordinator_(active)) return;
  throw new Error('Coordinator access is required.');
}

function normalizeEmail_(e) {
  return normalizeText_(e);
}

function emailsMatch_(a, b) {
  return normalizeEmail_(a) === normalizeEmail_(b);
}

// ===================================================================
// HTML & STRING UTILITIES
// ===================================================================
function escapeHtml_(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function driveFileUrl_(value) {
  if (!value) return '';
  return value.startsWith('http') ? value : `https://drive.google.com/file/d/${value}/view`;
}

// ===================================================================
// TEXT SIMILARITY — trigram Jaccard
// ===================================================================
function similarity_(a, b) {
  if (!a || !b) return 0;

  // Normalize both strings
  const normalize = s => String(s).trim().toUpperCase();
  const strA = normalize(a);
  const strB = normalize(b);

  // EXACT MATCH - return 1.0 (100%)
  if (strA === strB) return 1.0;

  // EXTRACT WORDS (split by non-alphanumeric characters)
  const getWords = s => s.split(/\s+/).filter(w => w.length > 0);
  const wordsA = getWords(strA);
  const wordsB = getWords(strB);

  // CHECK FOR SAME WORDS IN DIFFERENT ORDER
  if (wordsA.length === wordsB.length && wordsA.length > 0) {
    const sortedA = wordsA.sort().join(' ');
    const sortedB = wordsB.sort().join(' ');
    if (sortedA === sortedB) return 1.0; // 100% - same words, different order
  }

  // WORD-LEVEL SIMILARITY (Jaccard Index on words)
  if (wordsA.length > 0 && wordsB.length > 0) {
    const setA = new Set(wordsA);
    const setB = new Set(wordsB);
    const intersection = [...setA].filter(w => setB.has(w)).length;
    const union = new Set([...setA, ...setB]).size;
    const wordSimilarity = intersection / union;

    // If word similarity is high (>50%), return it as the score
    if (wordSimilarity >= 0.5) {
      return wordSimilarity;
    }
  }

  // TRIGRAM-BASED SIMILARITY (fallback for character-level matching)
  const grams = s => new Set(s.replace(/\s+/g, '').match(/.{1,3}/g) || []);
  const A = grams(strA), B = grams(strB);
  const intersection = [...A].filter(x => B.has(x)).length;
  const union = new Set([...A, ...B]).size;
  return union === 0 ? 0 : intersection / union;
}

// ===================================================================
// DATA GROUPING & AGGREGATION
// ===================================================================
function groupBy_(arr, keyFn) {
  return arr.reduce((acc, item) => {
    const key = normalizeText_(keyFn(item));
    (acc[key] = acc[key] || []).push(item);
    return acc;
  }, Object.create(null));
}

function buildTeamMembersField_(rowData, columnMap) {
  return [
    rowData[columnMap.S1_REGNO],
    rowData[columnMap.S2_REGNO],
    rowData[columnMap.S3_REGNO],
    rowData[columnMap.S4_REGNO]
  ]
    .filter(Boolean)
    .join(', ');
}

// ===================================================================
// GITHUB PROVISIONING HELPERS
// ===================================================================
function getOptionalHeaderIndex_(sheet, headerName) {
  if (!sheet || sheet.getLastColumn() < 1) return -1;
  const headers = (readSheetRows_(sheet, 1, 1)[0] || []);
  const target = String(headerName || '').trim().toLowerCase();
  return headers.findIndex(h => String(h || '').trim().toLowerCase() === target);
}

function getRepoUrlMap_(timings) {
  const measure = (phase, read) => {
    if (!timings) return read();
    const started = Date.now();
    let success = false;
    try { const value = read(); success = true; return value; }
    finally { timings.push({phase, durationMs:Date.now() - started, calls:1, success}); }
  };
  return measure('repository_detail_total', () => {
  // TeamStatus is the only repository registry.
  const statusSheet = getSheet_(SHEET_NAMES.TEAM_STATUS);
  const snapshotRows = dashboardReadSnapshot_ ? getSheetRows_(SHEET_NAMES.TEAM_STATUS) : null;
  const headers = snapshotRows ? dashboardHeaderSnapshot_[normalizeText_(SHEET_NAMES.TEAM_STATUS)] : null;
  const repoCol = headers ? headers.findIndex(h => normalizeText_(h) === 'repo url') : getOptionalHeaderIndex_(statusSheet, 'Repo URL');
  const teamCol = headers ? headers.findIndex(h => normalizeText_(h) === 'team id') : getOptionalHeaderIndex_(statusSheet, 'Team ID');
  const map = {};

  if (repoCol >= 0 && teamCol >= 0 && (snapshotRows || statusSheet.getLastRow() >= 2)) {
    const rows = snapshotRows || readSheetRows_(statusSheet, 2);
    rows.forEach(r => {
      const teamId = normalizeText_(r[teamCol]);
      const repoUrl = String(r[repoCol] || '').trim();
      if (teamId && repoUrl) map[teamId] = repoUrl;
    });
  }

  return map;
  });
}

function getRepoUrlForTeam_(teamId) {
  const wanted = String(teamId || '').trim();
  if (!wanted) return '';

  const statusSheet = getSheet_(SHEET_NAMES.TEAM_STATUS);
  const repoCol = getOptionalHeaderIndex_(statusSheet, 'Repo URL');
  const teamCol = getOptionalHeaderIndex_(statusSheet, 'Team ID');
  if (repoCol >= 0 && teamCol >= 0 && statusSheet.getLastRow() >= 2) {
    const match = statusSheet.getRange(2, teamCol + 1, statusSheet.getLastRow() - 1, 1)
      .createTextFinder(normalizedTextPattern_(wanted)).useRegularExpression(true).matchEntireCell(true).matchCase(false).findNext();
    if (match) {
      const value = String(readSheetRows_(statusSheet, match.getRow(), 1)[0][repoCol] || '').trim();
      if (value) return value;
    }
  }

  return '';
}

function updateTeamStatusRepoUrl_(teamId, repoUrl) {
  const sheet = getSheet_(SHEET_NAMES.TEAM_STATUS);
  let repoCol = getOptionalHeaderIndex_(sheet, 'Repo URL');
  if (repoCol < 0) {
    repoCol = sheet.getLastColumn();
    sheet.getRange(1, repoCol + 1).setValue('Repo URL');
  }
  const teamCol = getOptionalHeaderIndex_(sheet, 'Team ID');
  if (teamCol < 0 || sheet.getLastRow() < 2) throw new Error('TeamStatus/Team ID not available.');
  const match = sheet.getRange(2, teamCol + 1, sheet.getLastRow() - 1, 1)
    .createTextFinder(normalizedTextPattern_(String(teamId))).useRegularExpression(true).matchEntireCell(true).matchCase(false).findNext();
  if (!match) throw new Error('Team not found in TeamStatus: ' + teamId);
  sheet.getRange(match.getRow(), repoCol + 1).setValue(repoUrl);
}

// ===================================================================
// REVIEW COMMITTEE HELPERS
// ===================================================================
let _rcColumnsCache = null;
let _committeeRowsCache = null;

function getReviewCommitteeColumns_() {
  if (_rcColumnsCache) return _rcColumnsCache;
  _rcColumnsCache = getColumnMap_(SHEET_NAMES.REVIEW_COMMITTEE, FIELD_DEFINITIONS.REVIEW_COMMITTEE);
  return _rcColumnsCache;
}

function getAllCommitteeRows_() {
  if (_committeeRowsCache) return _committeeRowsCache;
  _committeeRowsCache = getSheetRows_(SHEET_NAMES.REVIEW_COMMITTEE);
  return _committeeRowsCache;
}

function getCommitteeInfo_(committeeNumber) {
  if (!committeeNumber) return null;
  const RC = getReviewCommitteeColumns_();
  const row = getAllCommitteeRows_().find(r => textEquals_(r[RC.COMMITTEE_NUMBER], committeeNumber));
  if (!row) return null;
  return {
    reviewer1Name: row[RC.REVIEWER1_NAME],
    reviewer1Email: row[RC.REVIEWER1_EMAIL],
    reviewer2Name: row[RC.REVIEWER2_NAME],
    reviewer2Email: row[RC.REVIEWER2_EMAIL],
    reviewer3Name: row[RC.REVIEWER3_NAME],
    reviewer3Email: row[RC.REVIEWER3_EMAIL],
    reviewer4Name: row[RC.REVIEWER4_NAME],
    reviewer4Email: row[RC.REVIEWER4_EMAIL]
  };
}

function getCommitteeNumbersForReviewer_(email) {
  const RC = getReviewCommitteeColumns_();
  return getAllCommitteeRows_()
    .filter(r => [
      r[RC.REVIEWER1_EMAIL],
      r[RC.REVIEWER2_EMAIL],
      r[RC.REVIEWER3_EMAIL],
      r[RC.REVIEWER4_EMAIL]
    ].some(e => emailsMatch_(e, email)))
    .map(r => r[RC.COMMITTEE_NUMBER]);
}

// ===================================================================
// STUDENT ROSTER LOOKUP
// ===================================================================
// ===================================================================
// FORM LINKS — pre-filled with Team ID
// ===================================================================
function buildTeamIntakeLink_(teamId) {
  const base = getConfig_('TEAM_INTAKE_FORM_URL_BASE');
  const entry = getConfig_('TEAM_INTAKE_TEAMID_ENTRY');
  return `${base}?usp=pp_url&${entry}=${encodeURIComponent(teamId)}`;
}

function getDashboardUrl_() {
  return getConfig_('GUIDE_DASHBOARD_URL');
}

function getHubRegistrySheet_() {
  const HUB_SHEET_ID = getConfig_('HUB_SHEET_ID');
  return getNamedSheet_(SpreadsheetApp.openById(HUB_SHEET_ID), SHEET_NAMES.MASTER_REGISTRY);
}

// ===================================================================
// CONSTANTS (cached)
// ===================================================================
function getCoordinatorEmail_() {
  return getConfig_('COORDINATOR_EMAIL');
}

function getAcademicYear_() {
  return getConfig_('ACADEMIC_YEAR');
}
// Project dates are civil-day numbers in the spreadsheet timezone, not elapsed
// 24-hour periods. This avoids locale ambiguity and daylight-saving boundaries.
let projectScheduleExecution_ = null;
const PROJECT_DAY_MS_ = 86400000;
function validateProjectSchedule_(schedule) {
  if (schedule.start > schedule.end || schedule.title > schedule.end) throw new Error('Milestones start/title must be on or before report submission.');
}

function projectDay_(value, timezone, key) {
  let text;
  if (value instanceof Date && Number.isFinite(value.getTime())) {
    text = Utilities.formatDate(value, timezone, 'yyyy-MM-dd');
  } else {
    text = String(value || '').trim();
  }
  let match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (!match) {
    const local = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(text);
    if (local) match = [text, local[3], local[2], local[1]];
  }
  if (!match) throw new Error(`${key || 'Date'} must be a date cell or DD/MM/YYYY (or YYYY-MM-DD).`);
  const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
  const date = new Date(Date.UTC(year, month - 1, day));
  if (date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
    throw new Error(`${key || 'Date'} contains an invalid calendar date.`);
  }
  return date.getTime() / PROJECT_DAY_MS_;
}

function getProjectSchedule_() {
  if (projectScheduleExecution_) return projectScheduleExecution_;
  const timezone = getSpreadsheet_().getSpreadsheetTimeZone();
  const milestones = getMilestones_();
  const assessments=getAssessmentDefinitions_();
  composeProjectTimeline_(milestones,assessments);
  const schedule = { timezone, reviews:assessments.filter(d=>d.type==='REVIEW'), milestones, assessments };
  ['start','formation','title','report'].forEach(key => {
    const milestone = milestones.find(item=>item.key===key);
    if (!milestone) throw new Error('Milestones requires ' + key + '.');
    schedule[key] = milestone.day;
  });
  schedule.end = schedule.report;
  [...milestones,...assessments].forEach(item=>{ schedule[item.key] = item.day; });
  validateProjectSchedule_(schedule);
  return (projectScheduleExecution_ = Object.freeze(schedule));
}

function formatProjectDay_(day) {
  return Utilities.formatDate(new Date(day * PROJECT_DAY_MS_), 'UTC', 'dd MMM yyyy');
}

function getProjectClock_(schedule, now) {
  schedule = schedule || getProjectSchedule_();
  now = now || new Date();
  const today = projectDay_(now, schedule.timezone);
  return { today, now };
}

/** `knownWindows` and `knownTimezone` let a caller that already read them in this request share them. */
function getLogWeekSummary_(records, eligibleFrom, regNo, now, knownWindows, knownTimezone) {
  now = now || new Date();
  const windows = eligibleWeeklyWindows_(eligibleFrom,knownWindows || getWeeklySubmissionWindows_());
  const expected = windows.filter(w=>w.opens_at <= now.getTime());
  const effective = getEffectiveLogEntries_(records).filter(r=>!regNo || textEquals_(r.regNo,regNo));
  const submitted = new Set(effective.filter(r=>r.entryStatus !== 'MISSED').map(r=>r.weekId));
  const missing = expected.filter(w=>now.getTime() > w.late_until && !submitted.has(w.weekId));
  const current = expected.find(w=>now.getTime() <= w.deadline_at);
  const timezone = knownTimezone || getSpreadsheet_().getSpreadsheetTimeZone();
  return {expectedWeeks:expected.length, missing:missing.length,
    firstMissingDue:missing.length ? projectDay_(new Date(missing[0].deadline_at),timezone) : null,
    currentLogged:!!current && submitted.has(current.weekId), active:!!current, week:current ? current.weekId : null,
    due:current ? projectDay_(new Date(current.deadline_at),timezone) : null};
}

/** Roll up persisted individual obligations; students without an obligation do not prevent completion. */
function getTeamLogWeekSummary_(row, columns, logs, schedule, clock, shared) {
  const registers = [1,2,3,4].filter(n=>row[columns['S'+n+'_EMAIL']]).map(n=>row[columns['S'+n+'_REGNO']]);
  if (registers.some(r=>!r) || new Set(registers.map(normalizeText_)).size !== registers.length) throw new Error('Student register numbers are missing or ambiguous.');
  // `shared` ({eligibility, windows}) lets a caller summarising many teams read each sheet once per request, not once per team or student.
  shared = shared || {};
  // `shared.timings`, when present, receives one entry per one-time read below (names and durations only).
  const eligibility = shared.eligibility || (shared.eligibility = timedPhase_(shared.timings,'summary_eligibility_read',()=>readProgressEligibility_()));
  const summaries = registers.map(regNo=>{
    const record = progressStudentEligibility_({regNo,teamId:row[columns.TEAM_ID]},eligibility,shared.windows);
    const windows = shared.windows || (shared.windows = timedPhase_(shared.timings,'summary_windows_read',()=>getWeeklySubmissionWindows_()));
    const timezone = shared.timezone || (shared.timezone = timedPhase_(shared.timings,'summary_timezone_read',()=>getSpreadsheet_().getSpreadsheetTimeZone()));
    return getLogWeekSummary_(logs,record.eligibleFrom ? record.enforcedFrom : '',regNo,clock && clock.now,windows,timezone);
  });
  const dueDates = summaries.filter(s=>s.firstMissingDue !== null).map(s=>s.firstMissingDue);
  const active = summaries.filter(s=>s.active), current = active[0];
  return {missing:summaries.reduce((n,s)=>n+s.missing,0), expectedWeeks:summaries.reduce((n,s)=>n+s.expectedWeeks,0),
    firstMissingDue:dueDates.length ? Math.min(...dueDates) : null,
    currentLogged:active.length > 0 && active.every(s=>s.currentLogged),
    loggedStudents:active.filter(s=>s.currentLogged).length,totalStudents:registers.length,
    active:active.length > 0,week:current ? current.week : null,due:current ? current.due : null};
}
