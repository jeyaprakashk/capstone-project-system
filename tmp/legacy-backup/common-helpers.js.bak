/**
 * COMMON HELPERS — shared across all dashboards and workflows
 * Pure utilities: no dashboard-specific logic
 */

// ===================================================================
// CONFIGURATION
// ===================================================================
const SHEET_ID = PropertiesService.getScriptProperties().getProperty('SHEET_ID');

let configExecutionValues_ = null;
/** Reviews are registry instances, ordered by configured sequence. */
function getInternalReviewsCount_() {
  return getInternalReviews_().length;
}
function getInternalReviews_() {
  return Object.freeze(getAssessmentDefinitions_().filter(d=>d.type==='REVIEW'));
}

function getConfig(key) {
  const targetKey = normalizeText_(key);
  if (configExecutionValues_) return requireConfigValue_(targetKey);
  const sheetId =
    PropertiesService.getScriptProperties()
      .getProperty('SHEET_ID');

  if (!sheetId) {
    throw new Error(
      'SHEET_ID is not configured in Script Properties.'
    );
  }

  const configSheet = getSheet('Config');

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
function setConfig(key, value) {
  const sheetId = PropertiesService.getScriptProperties().getProperty('SHEET_ID');
  if (!sheetId) {
    throw new Error('SHEET_ID is not configured in Script Properties.');
  }

  const configSheet = getSheet('Config');
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
// spreadsheet again, but repeated getSheet() calls in the same request no
// longer repeat SpreadsheetApp.openById().
let _spreadsheetExecutionHandle = null;

function getSpreadsheet() {
  if (!_spreadsheetExecutionHandle) {
    _spreadsheetExecutionHandle = SpreadsheetApp.openById(SHEET_ID);
  }
  return _spreadsheetExecutionHandle;
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

function getSheet(sheetName) {
  const key = normalizeText_(sheetName);
  if (!sheetExecutionHandles_[key]) sheetExecutionHandles_[key] = getNamedSheet_(getSpreadsheet(), sheetName);
  return sheetExecutionHandles_[key];
}

/** Opt-in snapshots are limited to read-only dashboard endpoints. Writers stay live. */
function withDashboardRead_(read) {
  if (dashboardReadSnapshot_) return read();
  dashboardReadSnapshot_ = Object.create(null);
  dashboardHeaderSnapshot_ = Object.create(null);
  try { return read(); }
  finally { dashboardReadSnapshot_ = null; dashboardHeaderSnapshot_ = null; }
}

function getSheetRows(sheetName) {
  const key = normalizeText_(sheetName);
  if (dashboardReadSnapshot_ && Object.prototype.hasOwnProperty.call(dashboardReadSnapshot_, key)) {
    return dashboardReadSnapshot_[key];
  }
  const values = getSheet(sheetName).getDataRange().getValues();
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

function setStatusFields(sheet, row, fields, columnMap) {
  Object.entries(fields).forEach(([field, value]) => {
    sheet.getRange(row, columnMap[field] + 1).setValue(value);
  });
}

function findTeamStatusRow(statusSheet, teamId, columnMap) {
  const ids = readSheetRows_(statusSheet, 2);
  for (let i = 0; i < ids.length; i++) {
    if (textEquals_(ids[i][columnMap.TEAM_ID], teamId)) return i + 2;
  }
  return -1;
}

// ===================================================================
// COLUMN MAPPING — header-based, case-insensitive
// ===================================================================
function buildColumnMap(sheet, fieldNameMap, headers) {
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

function getColumnMap(sheetName, fieldMap) {
  const cacheKey = sheetName + JSON.stringify(fieldMap);
  if (!_columnMapCache[cacheKey]) {
    if (dashboardReadSnapshot_) getSheetRows(sheetName);
    _columnMapCache[cacheKey] = buildColumnMap(getSheet(sheetName), fieldMap, dashboardHeaderSnapshot_ && dashboardHeaderSnapshot_[normalizeText_(sheetName)]);
  }
  return _columnMapCache[cacheKey];
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

function normalizeEmail(e) {
  return normalizeText_(e);
}

function emailsMatch(a, b) {
  return normalizeEmail(a) === normalizeEmail(b);
}

// ===================================================================
// HTML & STRING UTILITIES
// ===================================================================
function escapeHtml(s) {
  return String(s || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function driveFileUrl(value) {
  if (!value) return '';
  return value.startsWith('http') ? value : `https://drive.google.com/file/d/${value}/view`;
}

function isValidUrl(str) {
  try { new URL(str); return true; } catch (_) { return false; }
}

function urlResolves(url) {
  try {
    const resp = UrlFetchApp.fetch(url, { muteHttpExceptions: true, followRedirects: true });
    return resp.getResponseCode() < 400;
  } catch (e) {
    return false;
  }
}

// ===================================================================
// TEXT SIMILARITY — trigram Jaccard
// ===================================================================
function similarity(a, b) {
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
function groupBy(arr, keyFn) {
  return arr.reduce((acc, item) => {
    const key = normalizeText_(keyFn(item));
    (acc[key] = acc[key] || []).push(item);
    return acc;
  }, Object.create(null));
}

function buildTeamMembersField(rowData, columnMap) {
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

function getRepoUrlMap(timings) {
  const measure = (phase, read) => {
    if (!timings) return read();
    const started = Date.now();
    let success = false;
    try { const value = read(); success = true; return value; }
    finally { timings.push({phase, durationMs:Date.now() - started, calls:1, success}); }
  };
  return measure('repository_detail_total', () => {
  // TeamStatus is the only repository registry.
  const statusSheet = getSheet(SHEET_NAMES.TEAM_STATUS);
  const snapshotRows = dashboardReadSnapshot_ ? getSheetRows(SHEET_NAMES.TEAM_STATUS) : null;
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

function getRepoUrlForTeam(teamId) {
  const wanted = String(teamId || '').trim();
  if (!wanted) return '';

  const statusSheet = getSheet(SHEET_NAMES.TEAM_STATUS);
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
  const sheet = getSheet(SHEET_NAMES.TEAM_STATUS);
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

function getReviewCommitteeColumns() {
  if (_rcColumnsCache) return _rcColumnsCache;
  _rcColumnsCache = getColumnMap(SHEET_NAMES.REVIEW_COMMITTEE, FIELD_DEFINITIONS.REVIEW_COMMITTEE);
  return _rcColumnsCache;
}

function getAllCommitteeRows() {
  if (_committeeRowsCache) return _committeeRowsCache;
  _committeeRowsCache = getSheetRows(SHEET_NAMES.REVIEW_COMMITTEE);
  return _committeeRowsCache;
}

function getCommitteeInfo(committeeNumber) {
  if (!committeeNumber) return null;
  const RC = getReviewCommitteeColumns();
  const row = getAllCommitteeRows().find(r => textEquals_(r[RC.COMMITTEE_NUMBER], committeeNumber));
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

function getCommitteeNumbersForReviewer(email) {
  const RC = getReviewCommitteeColumns();
  return getAllCommitteeRows()
    .filter(r => [
      r[RC.REVIEWER1_EMAIL],
      r[RC.REVIEWER2_EMAIL],
      r[RC.REVIEWER3_EMAIL],
      r[RC.REVIEWER4_EMAIL]
    ].some(e => emailsMatch(e, email)))
    .map(r => r[RC.COMMITTEE_NUMBER]);
}

// ===================================================================
// ANNOUNCEMENTS HELPERS
// ===================================================================
function getAllAnnouncements_() {
  const ANN = getColumnMap(SHEET_NAMES.ANNOUNCEMENTS, FIELD_DEFINITIONS.ANNOUNCEMENTS);
  return getSheetRows(SHEET_NAMES.ANNOUNCEMENTS)
    .filter(r => String(r[ANN.MESSAGE] || '').trim())
    .map(r => ({
      message: r[ANN.MESSAGE],
      fileLink: r[ANN.FILE_LINK],
      timestamp: r[ANN.TIMESTAMP],
      postedBy: r[ANN.EMAIL],
      studentVisible: String(r[ANN.STUDENT_VISIBLE] || '').trim().toLowerCase() === 'yes',
      guideVisible: String(r[ANN.GUIDE_VISIBLE] || '').trim().toLowerCase() === 'yes',
      reviewerVisible: String(r[ANN.REVIEWER_VISIBLE] || '').trim().toLowerCase() === 'yes'
    }))
    .reverse();
}

function formatAnnouncementTimestamp_(value) {
  if (!value) return '';
  const d = value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return String(value);
  return Utilities.formatDate(d, Session.getScriptTimeZone(), 'dd MMM yyyy, hh:mm a');
}

function buildAnnouncementAudience_(a) {
  const audiences = [];
  if (a.studentVisible) audiences.push('Project Teams');
  if (a.guideVisible) audiences.push('Guides');
  if (a.reviewerVisible) audiences.push('Reviewers');
  return audiences.length ? audiences.join(' • ') : 'No audience selected';
}

function announcementPresentation_(a) {
  const message=String(a.message || '').trim();
  const text=message;
  const firstLine=text.split(/\r?\n/)[0] || 'Announcement';
  const step=text.match(/\bstep\s*(\d+)\b/i);
  const type=/\btemplate\b/i.test(text)?'Template':/\bform\b/i.test(text)?'Form':'Notice';
  const link=/^https?:\/\//i.test(String(a.fileLink || '').trim())?String(a.fileLink).trim():'';
  return {message,text,title:firstLine.length>140?firstLine.slice(0,137)+'…':firstLine,step:step?Number(step[1]):null,type,link};
}

/** Shared tab header: title, successful-read timestamp, refresh action and divider. */
function buildTabHeader_(title, key, action, updated) {
  return `<div class="announcement-header dashboard-container-header tab-header"><div><h2>${escapeHtml(title)}</h2><p class="announcement-subtitle" id="${key}Updated">${escapeHtml(updated)}</p></div><button type="button" class="announcement-refresh-btn tab-refresh-btn btn btn-sm btn-outline" data-refresh-button id="${key}Refresh" aria-label="${escapeHtml('Refresh ' + title)}" onclick="${escapeHtml(action)}">${renderLucideIcon_('refresh-cw', '', 'icon-leading')}Refresh</button></div><p id="${key}RefreshStatus" class="announcement-status" data-refresh-status role="status" aria-live="polite"></p>`;
}

function buildAnnouncementsTabContent_(announcements, isCoordinator) {
  const formUrl=isCoordinator?String(getConfig('ANNOUNCEMENTS_FORM_URL') || '').trim():'';
  const addButton=isCoordinator && /^https?:\/\//i.test(formUrl)?`<a class="announcement-add-btn btn btn-primary" href="${escapeHtml(formUrl)}" target="_blank" rel="noopener">${renderLucideIcon_('plus')}New announcement</a>`:'';
  const records=announcements.map(a=>({a,p:announcementPresentation_(a),date:formatAnnouncementTimestamp_(a.timestamp)}));
  const header=buildTabHeader_('Announcements', 'announcements', 'refreshAnnouncements()', dashboardUpdatedLabel_());
  function item(record,index) {
    const {a,p,date}=record;
    const audience=buildAnnouncementAudience_(a);
    const audiences=[a.studentVisible?'teams':'',a.guideVisible?'guides':'',a.reviewerVisible?'reviewers':''].filter(Boolean).join(' ');
    const body=p.text!==p.title?`<details class="announcement-full"><summary>Read announcement</summary><p class="announcement-message">${escapeHtml(p.text)}</p></details>`:'';
    return `<article id="announcement-${index}" class="announcement-item card" data-announcement-item data-announcement-type="${p.type}" data-announcement-audiences="${audiences}" data-announcement-search="${escapeHtml(p.message+' '+date+' '+audience+' '+p.type)}"><span class="announcement-row-icon" aria-hidden="true">${p.step!==null?'S'+p.step:renderLucideIcon_(p.type==='Form'?'file-text':'megaphone')}</span><div class="announcement-row-copy"><h3>${escapeHtml(p.title)}</h3><div class="announcement-meta">${p.type} · <span class="announcement-date">${escapeHtml(date || 'Date unavailable')}</span> · <span class="announcement-audience">${escapeHtml(audience)}</span></div>${body}</div><div class="announcement-row-actions">${p.link?`<a class="announcement-link btn btn-sm btn-outline" href="${escapeHtml(p.link)}" target="_blank" rel="noopener">${p.type==='Form'?'Open form':'Open'} ${renderLucideIcon_('external-link')}<span class="announcement-sr-only"> (opens in a new tab)</span></a>`:''}</div></article>`;
  }
  const groups=new Map();
  records.forEach((r,i)=>{
    const day=r.date.split(',')[0] || 'Earlier';
    if(!groups.has(day))groups.set(day,[]);
    groups.get(day).push(item(r,i));
  });
  const feed=Array.from(groups,([day,items])=>`<section class="announcement-date-group" data-announcement-group><p class="announcement-group-heading">${escapeHtml(day)}</p>${items.join('')}</section>`).join('');
  const templates=[],seen=new Set();
  records.filter(r=>r.p.type==='Template' && r.p.step!==null && r.p.link).sort((a,b)=>a.p.step-b.p.step).forEach(r=>{
    if(seen.has(r.p.link))return;
    seen.add(r.p.link);templates.push(`<li><a href="${escapeHtml(r.p.link)}" target="_blank" rel="noopener"><span class="announcement-step-number circle">${r.p.step}</span><span>${escapeHtml(r.p.title)}</span>${renderLucideIcon_('external-link')}</a></li>`);
  });
  return `<div class="announcement-tab-surface announcement-hub utility-body">${header}
    <div class="announcement-toolbar"><div class="announcement-toolbar-filters"><label class="announcement-search-field"><span class="announcement-sr-only">Search announcements</span>${renderLucideIcon_('search')}<input id="announcementSearch" type="search" placeholder="Search titles, steps or dates" autocomplete="off" aria-controls="announcementList"></label><div class="announcement-audience-filters segmented" role="group" aria-label="Filter by audience">${[['all','All · '+announcements.length],['teams','Project Teams'],['guides','Guides'],['reviewers','Reviewers']].map(([key,label])=>`<button type="button" data-announcement-audience="${key}" aria-pressed="${key==='all'}">${label}</button>`).join('')}</div><label><span class="announcement-sr-only">Announcement type</span><select data-announcement-type-filter><option value="all">All types</option><option value="Template">Template</option><option value="Form">Form</option><option value="Notice">Notice</option></select></label></div>${addButton}</div>
    <p class="announcement-results" data-announcement-results role="status" aria-live="polite"></p><div class="announcement-columns"><div class="announcement-feed-card"><div id="announcementList" class="announcement-list">${feed}</div><div class="announcement-no-results announcement-empty-state card" data-announcement-no-results hidden><h3>${announcements.length?'No matching announcements':"You're all caught up"}</h3><p>${announcements.length?'Try another search or filter.':'New announcements will appear here when posted.'}</p></div><div class="announcement-load-more"><button class="btn btn-outline" type="button" data-announcement-more>Show older announcements</button></div></div><aside class="announcement-templates"><h3>Step templates</h3><p>Every available template, in step order.</p>${templates.length?'<ol>'+templates.join('')+'</ol>':'<p>No step templates have been shared yet.</p>'}</aside></div></div>`;
}

/**
 * Common Announcements tab endpoint.
 * It derives the signed-in user's complete role set server-side. Coordinator
 * sees every announcement; multi-role users see the union of their audiences.
 */
function loadAnnouncementsForCurrentUser() {
  return withDashboardRead_(() => loadAnnouncementsForCurrentUser_());
}

function loadAnnouncementsForCurrentUser_() {
  const email = Session.getActiveUser().getEmail();
  if (!email) throw new Error('Could not identify your account.');

  const views = getDashboardRoleViews_(email);
  if (!views.length) throw new Error('No dashboard role was found for this account.');

  const roleKeys = new Set(views.map(v => v.key));
  const isCoordinator = roleKeys.has('coord');
  const all = getAllAnnouncements_();

  const visible = isCoordinator ? all : all.filter(a =>
    (roleKeys.has('student') && a.studentVisible) ||
    (roleKeys.has('guide') && a.guideVisible) ||
    (roleKeys.has('reviewer') && a.reviewerVisible)
  );

  return buildAnnouncementsTabContent_(visible, isCoordinator);
}

// ===================================================================
// STUDENT ROSTER LOOKUP
// ===================================================================
function getStudentTeamId(email) {
  const TS = getColumnMap(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const rows = getSheetRows(SHEET_NAMES.TEAM_STATUS);

  const match = rows.find(r =>
    [r[TS.S1_EMAIL], r[TS.S2_EMAIL], r[TS.S3_EMAIL], r[TS.S4_EMAIL]]
      .some(e => emailsMatch(e, email))
  );
  return match ? match[TS.TEAM_ID] : null;
}

// ===================================================================
// FORM LINKS — pre-filled with Team ID
// ===================================================================
function buildTeamIntakeLink(teamId) {
  const base = getConfig('TEAM_INTAKE_FORM_URL_BASE');
  const entry = getConfig('TEAM_INTAKE_TEAMID_ENTRY');
  return `${base}?usp=pp_url&${entry}=${encodeURIComponent(teamId)}`;
}

function getDashboardUrl() {
  return getConfig('GUIDE_DASHBOARD_URL');
}

function getHubRegistrySheet() {
  const HUB_SHEET_ID = getConfig('HUB_SHEET_ID');
  return getNamedSheet_(SpreadsheetApp.openById(HUB_SHEET_ID), SHEET_NAMES.MASTER_REGISTRY);
}

// ===================================================================
// CONSTANTS (cached)
// ===================================================================
function getCoordinatorEmail() {
  return getConfig('COORDINATOR_EMAIL');
}

function getAcademicYear() {
  return getConfig('ACADEMIC_YEAR');
}
// Project dates are civil-day numbers in the spreadsheet timezone, not elapsed
// 24-hour periods. This avoids locale ambiguity and daylight-saving boundaries.
let projectScheduleExecution_ = null;
const PROJECT_DAY_MS_ = 86400000;
function validateProjectSchedule_(schedule) {
  if (schedule.start > schedule.end || schedule.title > schedule.end) throw new Error('Milestones start/title must be on or before report submission.');
  const weekday = new Date(schedule.title * PROJECT_DAY_MS_).getUTCDay();
  if (schedule.week1 !== schedule.title + ((8 - weekday) % 7 || 7) || schedule.week1 > schedule.end) throw new Error('Report submission must allow at least one logging week after title approval.');
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
  const timezone = getSpreadsheet().getSpreadsheetTimeZone();
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
  const weekday = new Date(schedule.title * PROJECT_DAY_MS_).getUTCDay();
  schedule.week1 = schedule.title + ((8 - weekday) % 7 || 7);
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
  const active = today >= schedule.week1 && today <= schedule.end;
  const week = today < schedule.week1 ? 0 : Math.floor((Math.min(today, schedule.end) - schedule.week1) / 7) + 1;
  const start = schedule.week1 + Math.max(0, week - 1) * 7;
  return { today, now, active, week, start, end:Math.min(start + 6, schedule.end),
    completedWeeks:today > schedule.end ? Math.ceil((schedule.end - schedule.week1 + 1) / 7) : Math.max(0, Math.floor((today - schedule.week1) / 7)) };
}

function activityProjectDay_(value, schedule) {
  if (value === '' || value === null || value === undefined) return null;
  try {
    if (value instanceof Date || /^\d{1,2}\/\d{1,2}\/\d{4}$/.test(String(value)) || /^\d{4}-\d{2}-\d{2}$/.test(String(value))) {
      return projectDay_(value, schedule.timezone);
    }
    // Only unambiguous timestamp strings are accepted; Sheets normally returns Date cells.
    if (!/^\d{4}-\d{2}-\d{2}T/.test(String(value))) return null;
    return projectDay_(new Date(value), schedule.timezone);
  } catch (err) { return null; }
}

function isFutureProjectTimestamp_(value, now) {
  const timestamp = value instanceof Date ? value : /^\d{4}-\d{2}-\d{2}T/.test(String(value)) ? new Date(value) : null;
  return timestamp !== null && timestamp.getTime() > now.getTime();
}

function isCurrentProjectWeek_(value, schedule, clock) {
  const day = activityProjectDay_(value, schedule);
  return clock.active && day !== null && day >= clock.start && day <= Math.min(clock.today, clock.end)
    && !isFutureProjectTimestamp_(value, clock.now);
}

function getLogWeekSummary_(records, eligibleFrom, regNo, now) {
  now = now || new Date();
  const windows = eligibleWeeklyWindows_(eligibleFrom,getWeeklySubmissionWindows_());
  const expected = windows.filter(w=>w.opens_at <= now.getTime());
  const effective = getEffectiveLogEntries_(records).filter(r=>!regNo || textEquals_(r.regNo,regNo));
  const submitted = new Set(effective.filter(r=>r.entryStatus !== 'MISSED').map(r=>r.weekId));
  const missing = expected.filter(w=>now.getTime() > w.late_until && !submitted.has(w.weekId));
  const current = expected.find(w=>now.getTime() <= w.deadline_at);
  const timezone = getSpreadsheet().getSpreadsheetTimeZone();
  return {expectedWeeks:expected.length, missing:missing.length,
    firstMissingDue:missing.length ? projectDay_(new Date(missing[0].deadline_at),timezone) : null,
    currentLogged:!!current && submitted.has(current.weekId), active:!!current, week:current ? current.weekId : null,
    due:current ? projectDay_(new Date(current.deadline_at),timezone) : null};
}

/** Roll up persisted individual obligations; students without an obligation do not prevent completion. */
function getTeamLogWeekSummary_(row, columns, logs, schedule, clock) {
  const registers = [1,2,3,4].filter(n=>row[columns['S'+n+'_EMAIL']]).map(n=>row[columns['S'+n+'_REGNO']]);
  if (registers.some(r=>!r) || new Set(registers.map(normalizeText_)).size !== registers.length) throw new Error('Student register numbers are missing or ambiguous.');
  const eligibility = readProgressEligibility_();
  const summaries = registers.map(regNo=>{
    const record = progressStudentEligibility_({regNo,teamId:row[columns.TEAM_ID]},eligibility);
    return getLogWeekSummary_(logs,record.eligibleFrom ? record.enforcedFrom : '',regNo,clock && clock.now);
  });
  const dueDates = summaries.filter(s=>s.firstMissingDue !== null).map(s=>s.firstMissingDue);
  const active = summaries.filter(s=>s.active), current = active[0];
  return {missing:summaries.reduce((n,s)=>n+s.missing,0), expectedWeeks:summaries.reduce((n,s)=>n+s.expectedWeeks,0),
    firstMissingDue:dueDates.length ? Math.min(...dueDates) : null,
    currentLogged:active.length > 0 && active.every(s=>s.currentLogged),
    loggedStudents:active.filter(s=>s.currentLogged).length,totalStudents:registers.length,
    active:active.length > 0,week:current ? current.week : null,due:current ? current.due : null};
}

/** Shared headers for refreshable, non-student dashboard containers. */
function dashboardUpdatedLabel_() {
  return 'Last updated: ' + new Date().toLocaleString('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: true }) + ' IST';
}

function buildDashboardContainerHeader_(title, key) {
  const action = key === 'systemStatus' ? 'DashboardUI.refreshSystemStatus()' : "DashboardUI.refreshRoleDashboard('" + key + "')";
  return buildTabHeader_(title, key, action, key === 'coord' || key === 'systemStatus' ? 'Waiting for data…' : dashboardUpdatedLabel_());
}

/** Shared controls for team tables; page state remains local to each table. */
function buildTeamPagination_(prefix, tableKey, total, rowLabel = 'teams') {
  return `<nav aria-label="Pagination" class="pagination"><span id="${prefix}PaginationInfo">Showing 0 - 0 of ${total} ${escapeHtml(rowLabel)}</span><label class="team-page-size" for="${prefix}PageSize">Rows per page <select id="${prefix}PageSize" onchange="DashboardUI.changeTeamPageSize('${tableKey}', this.value)"><option value="10">10</option><option value="25">25</option><option value="50">50</option><option value="all">All</option></select></label><div id="${prefix}PaginationButtons" class="pagination-buttons" aria-label="${rowLabel === 'teams' ? 'Team' : escapeHtml(rowLabel)} table pages"></div></nav>`;
}

/** Presentation only: preserves the Review drawer history labels and note filtering. */
function renderAssessmentHistory_(decisions) {
    const escape=value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    if(!decisions || !decisions.length)return '';
    const actions={exception:'Absence details updated',targetSubmit:'Assessment completed',targetDraft:'Assessment draft saved',MAKEUP_ALTERNATIVE_ASSESSMENT:'Assessment authorized',DEFERRED_ASSESSMENT:'Assessment deferred',TEAM_MARK_APPLICABLE:'Team mark approved',TEAM_MARK_NOT_APPLICABLE:'Team mark not applicable',OTHER:'Academic decision recorded'};
    const statuses={COMPLETED:'Completed',MAKEUP_PENDING:'Awaiting makeup',COMPLETED_AFTER_MAKEUP:'Completed after makeup',ABSENT_UNAPPROVED:'Unapproved absence',ACADEMIC_DECISION_PENDING:'Awaiting academic decision',NON_PARTICIPATION:'Non-participation',INCOMPLETE:'Incomplete'};
    const automaticReasons=['Prolonged absence source facts updated.','Review-day absence recorded as unapproved.'];
    return '<details class="review-history"><summary>Assessment history <span>'+decisions.length+'</span></summary><ol>'+decisions.slice().reverse().map(d=>{
      const date=new Date(d.at),valid=Number.isFinite(date.getTime());
      const when=valid?date.toLocaleString('en-GB',{day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}):'';
      const reason=String(d.reason||'');
      const note=reason && !automaticReasons.includes(reason) && !reason.startsWith('Absence details recorded: ')?'<p>'+escape(reason)+'</p>':'';
      return '<li><div class="review-history-heading"><strong>'+escape(actions[d.decision]||'Assessment updated')+'</strong>'+(when?'<time datetime="'+escape(date.toISOString())+'">'+escape(when)+'</time>':'')+'</div><div class="review-history-status">'+escape(statuses[d.previousStatus]||'Not assessed')+' <span>changed to</span> '+escape(statuses[d.resultingStatus]||'Updated')+'</div>'+note+(d.reviewer?'<small>'+escape(d.reviewer)+'</small>':'')+'</li>';
    }).join('')+'</ol></details>';
  }
