/** Existing commit collection; authentication is shared with repository readiness. */
function commitApiError_(slug, response) {
  const message = response.body && typeof response.body.message === 'string' ? response.body.message : '';
  let code = 'GITHUB_API_ERROR', detail = 'GitHub could not list commits.';
  if (response.status === 401) {
    code = 'AUTHENTICATION_FAILED'; detail = 'The authoritative GITHUB_ADMIN_TOKEN was rejected; check expiration/revocation.';
  } else if (response.status === 403 || response.status === 429) {
    code = /rate limit|abuse/i.test(message) || response.status === 429 ? 'RATE_LIMITED' : 'ACCESS_DENIED';
    detail = code === 'RATE_LIMITED' ? 'GitHub rate limit reached; retry after the limit resets.' : 'Check the existing token repository selection, Contents read access, and organization SSO/IP restrictions.';
  } else if (response.status === 404) {
    // A commits 404 is not evidence that a private repository was deleted.
    const repo = makeGithubRequest('GET', '/repos/' + slug);
    if (repo.status === 200) {
      code = 'COMMIT_ACCESS_OR_RESOURCE_UNAVAILABLE';
      detail = 'Repository metadata is accessible: the repository exists. Check Contents read access and its default branch; the commit endpoint returned 404.';
    } else if (repo.status === 401) {
      code = 'AUTHENTICATION_FAILED'; detail = 'Repository probe rejected GITHUB_ADMIN_TOKEN (HTTP 401).';
    } else if (repo.status === 403 || repo.status === 429) {
      return commitApiError_(slug,repo);
    } else if (repo.status === 404) {
      const identity = makeGithubRequest('GET','/user');
      if (identity.status === 401) {
        code = 'AUTHENTICATION_FAILED'; detail = 'Credential probe rejected GITHUB_ADMIN_TOKEN (HTTP 401).';
      } else {
        code = 'REPOSITORY_MISSING_OR_INACCESSIBLE';
        detail = 'Repository metadata also returned 404. GitHub hides private repositories without access; this cannot prove deletion. ' +
          (identity.status === 200 ? 'The token authenticates successfully. ' : 'Credential probe HTTP ' + identity.status + '. ') +
          'Check the existing token repository selection/organization authorization and verify the recorded repository exists.';
      }
    } else {
      code = 'REPOSITORY_PROBE_FAILED'; detail = 'Repository probe HTTP ' + repo.status + '; repository existence is unconfirmed.';
    }
  }
  const error = new Error(code + ' for ' + slug + ' (HTTP ' + response.status + '): ' + detail + (message ? ' GitHub: ' + message.slice(0,300) : ''));
  error.code = code; error.status = response.status;
  return error;
}

function fetchCommitsForTeam(repoOwner, repoName, hours) {
  hours = hours || 2;
  const sinceDate = new Date(Date.now() - hours * 60 * 60 * 1000);
  const slug = encodeURIComponent(repoOwner) + '/' + encodeURIComponent(repoName);
  const commits = [];
  for (let page = 1; ; page++) {
    const response = makeGithubRequest('GET', '/repos/' + slug + '/commits?since=' + encodeURIComponent(sinceDate.toISOString()) + '&per_page=100&page=' + page);
    if (response.status === 409 && response.body && /repository is empty/i.test(response.body.message || '')) return [];
    if (response.status !== 200) throw commitApiError_(slug,response);
    if (!Array.isArray(response.body)) throw new Error('Invalid commit response for ' + slug + ': expected an array.');
    commits.push(...response.body);
    if (response.body.length < 100) return commits;
  }
}

/** Six fixed base columns plus the required author ID; validation never rewrites historical rows. */
function commitColumns_(sheet) {
  if (!sheet) throw new Error('Commits sheet is missing.');
  const headers = readSheetRows_(sheet,1,1)[0] || [];
  const columns = Object.fromEntries(Object.keys(FIELD_DEFINITIONS.COMMITS).map((key,index)=>[key,index]));
  Object.entries(columns).forEach(([key,index])=>{
    if (!githubBaseHeaderEquals_(headers[index],FIELD_DEFINITIONS.COMMITS[key])) throw new Error('Commits header mismatch at column ' + (index+1) + '. Correct headers without moving historical data.');
  });
  const ids = headers.flatMap((h,i)=>String(h).trim().toLowerCase() === 'github author id' ? [i] : []);
  if (ids.length > 1) throw new Error('Duplicate GitHub Author ID header.');
  columns.AUTHOR_ID = ids.length ? ids[0] : -1;
  if (columns.AUTHOR_ID < 0) throw new Error('GitHub Author ID column missing.');
  return columns;
}

function commitIdentity_(sha) {
  return /^[a-f0-9]{40}$/i.test(String(sha || '')) ? String(sha).toLowerCase() : null;
}

function readCollectedCommits_(teamId) {
  const sheet = getSheet(SHEET_NAMES.COMMITS), columns = commitColumns_(sheet);
  const rows = teamId ? readActivityRows_(SHEET_NAMES.COMMITS,columns.TEAM_ID+1,teamId) : readSheetRows_(sheet,2);
  return rows.filter(row=>row[columns.TEAM_ID]).map(row=>{
    const rawAuthorId = row[columns.AUTHOR_ID], authorId = githubId_(rawAuthorId);
    const authorResolution = authorId ? 'resolved' : rawAuthorId === '' || rawAuthorId == null ? 'unlinked' : 'unavailable';
    return {teamId:row[columns.TEAM_ID],timestamp:row[columns.DATE],username:row[columns.USERNAME],
      sha:row[columns.SHA],message:row[columns.MESSAGE],repositoryUrl:row[columns.REPO_URL],authorId,authorResolution};
  });
}

function appendCollectedCommits_(sheet, teamId, commits, repoUrl) {
  // Validate the whole response before writing; repository URL comes from TeamStatus.
  if (!String(teamId || '').trim() || !parseGithubRepoUrl_(repoUrl)) throw new Error('Invalid recorded team or repository URL.');
  const incoming = commits.map(commit => {
    const key = commitIdentity_(commit.sha);
    const timestamp = new Date(commit.commit && commit.commit.committer && commit.commit.committer.date);
    if (!key || !Number.isFinite(timestamp.getTime()) || typeof commit.commit.message !== 'string') throw new Error('Invalid commit SHA, timestamp or message for ' + teamId);
    const values = [timestamp,teamId,commit.commit.message.split('\n')[0],commit.author ? commit.author.login : '(unknown)',repoUrl,key];
    const authorId = githubId_(commit.author && commit.author.id);
    if (commit.author && commit.author.id != null && !authorId) throw new Error('Invalid GitHub author ID for ' + teamId);
    return {key,authorId,
      values:values.map(value=>typeof value === 'string' && /^[=+@-]/.test(value) ? "'"+value : value)};
  });
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const columns = commitColumns_(sheet);
    const keys = new Set(readSheetRows_(sheet,2).map(row=>commitIdentity_(row[columns.SHA])).filter(Boolean));
    const pending = incoming.filter(commit=>{if(keys.has(commit.key))return false;keys.add(commit.key);return true;});
    if (pending.length) {
      const first = sheet.getLastRow()+1, last = first+pending.length-1;
      if (last > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(),last-sheet.getMaxRows());
      sheet.getRange(first,columns.AUTHOR_ID+1,pending.length).setNumberFormat('@');
      const width = Math.max(6,columns.AUTHOR_ID+1);
      sheet.getRange(first,1,pending.length,width).setValues(pending.map(commit=>{
        const row = Array(width).fill('');
        commit.values.forEach((value,index)=>{row[index]=value;});
        row[columns.AUTHOR_ID]=commit.authorId;
        return row;
      }));
    }
    SpreadsheetApp.flush();
    return {count:pending.length,fetched:commits.length,skipped:commits.length-pending.length};
  } finally { lock.releaseLock(); }
}

/** Read-only SHA audit: historical rows are never modified or deleted. */
function auditCommitHistory() {
  const sheet = getSheet(SHEET_NAMES.COMMITS), columns = commitColumns_(sheet);
  const confirmed = new Map(), unidentifiedRows = [], teams = new Set();
  let rowCount = 0;
  readSheetRows_(sheet,2).forEach((row,index) => {
    if (!row.some(value=>value !== '')) return;
    rowCount++;
    if (row[columns.TEAM_ID]) teams.add(normalizeText_(row[columns.TEAM_ID]));
    const rowNumber = index+2, key = commitIdentity_(row[columns.SHA]);
    if (key) { if (!confirmed.has(key)) confirmed.set(key,[]); confirmed.get(key).push(rowNumber); }
    else unidentifiedRows.push(rowNumber);
  });
  const report = {rowCount,uniqueSHAs:confirmed.size,teamCount:teams.size,
    confirmedDuplicates:[...confirmed.entries()].filter(([,rows])=>rows.length > 1).map(([sha,rows])=>({sha,rows})),
    unidentifiedRows
  };
  Logger.log('Commits history audit (no rows changed): ' + JSON.stringify(report));
  return report;
}

/** Call under the script lock when creating or writing collection status. */
function commitCollectionStatusSheet_(create) {
  const name = SHEET_NAMES.COMMIT_COLLECTION_STATUS;
  let sheet = getSheet(name);
  const headers = Object.values(FIELD_DEFINITIONS.COMMIT_COLLECTION_STATUS);
  if (!sheet && create) sheet = getSpreadsheet().insertSheet(name);
  if (!sheet) return null;
  if (!sheet.getLastRow() && create) sheet.getRange(1,1,1,headers.length).setValues([headers]);
  const actual = readSheetRows_(sheet,1,1)[0] || [];
  if (actual.length !== headers.length || headers.some((header,index)=>!textEquals_(header,actual[index]))) {
    throw new Error('CommitCollectionStatus header mismatch. Expected: ' + headers.join(' | '));
  }
  return sheet;
}

function readCommitCollectionStatus_(teamId) {
  const sheet = commitCollectionStatusSheet_(false);
  if (!sheet) return '';
  const matches = getSheetRows(SHEET_NAMES.COMMIT_COLLECTION_STATUS).filter(row=>textEquals_(row[0],teamId));
  return matches.length === 1 ? String(matches[0][1]) : '';
}

function upsertCommitCollectionStatus_(sheet, teamId, status, updatedAt) {
  const matches = readSheetRows_(sheet,2).map((row,index)=>({row,index})).filter(item=>textEquals_(item.row[0],teamId));
  if (matches.length > 1) throw new Error('Duplicate collection status for team ' + teamId);
  const rowNumber = matches.length ? matches[0].index+2 : sheet.getLastRow()+1;
  if (rowNumber > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(),rowNumber-sheet.getMaxRows());
  const id = String(teamId).trim();
  sheet.getRange(rowNumber,1).setNumberFormat('@');
  sheet.getRange(rowNumber,1,1,3).setValues([[/^[=+@-]/.test(id) ? "'"+id : id,status,updatedAt]]);
}

function writeCommitCollectionStatus_(teamId, status) {
  if (!String(teamId || '').trim() || !['ok','error'].includes(status)) throw new Error('Invalid commit collection status.');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    upsertCommitCollectionStatus_(commitCollectionStatusSheet_(true),teamId,status,new Date());
    SpreadsheetApp.flush();
  } finally { lock.releaseLock(); }
}

function fetchAllCommits() {
  const leaseKey = 'COMMITS_COLLECTION_LEASE';
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(0)) {
    Logger.log('Commit collection lock busy; skipping collection.');
    return [];
  }
  let properties, acquiredAt;
  try {
    properties = PropertiesService.getScriptProperties();
    acquiredAt = String(Date.now());
    const previous = Number(properties.getProperty(leaseKey));
    // Longer than Apps Script's six-minute execution limit; crashed runs expire.
    if (previous > 0 && Number(acquiredAt) - previous < 15 * 60 * 1000) {
      Logger.log('Commit collection already running; skipping collection.');
      return [];
    }
    properties.setProperty(leaseKey, acquiredAt);
  } finally { lock.releaseLock(); }
  try {
    return collectAllCommits_();
  } finally {
    // Clear only this run's lease. No lock is held during API work or appends.
    if (properties.getProperty(leaseKey) === acquiredAt) properties.deleteProperty(leaseKey);
  }
}

function collectAllCommits_() {
  const TS = getColumnMap(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const statusRows = getSheetRows(SHEET_NAMES.TEAM_STATUS);
  const commitSheet = getSheet(SHEET_NAMES.COMMITS);
  const repoMap = getRepoUrlMap();
  const processed = [];
  statusRows.forEach(row => {
    const teamId = row[TS.TEAM_ID], repoUrl = repoMap[normalizeText_(teamId)];
    if (!teamId || !repoUrl) return;
    try {
      const repo = parseGithubRepoUrl_(repoUrl);
      if (!repo) throw new Error('Invalid recorded GitHub repository URL for ' + teamId + '; URL was not changed.');
      const commits = fetchCommitsForTeam(repo.owner,repo.repo,2);
      processed.push({teamId,...appendCollectedCommits_(commitSheet,teamId,commits,repoUrl)});
      writeCommitCollectionStatus_(teamId, 'ok');
    } catch (error) {
      writeCommitCollectionStatus_(teamId, 'error');
      Logger.log('Commit collection failed for ' + teamId + ': ' + error.message);
      processed.push({teamId,count:0,error:error.message,code:error.code || 'COLLECTION_FAILED'});
    }
  });
  auditCommitHistory();
  Logger.log('Commit collection results: ' + JSON.stringify(processed));
  return processed;
}

// Phase 1 weekly progress. No form ingestion, assessments or notification side effects on save.
function getWeeklySubmissionWindows_() {
  const sheet = getSheet(SHEET_NAMES.WEEKLY_WINDOWS);
  if (!sheet) throw new Error('Configure the WeeklyWindows sheet before using weekly progress.');
  const headers = readSheetRows_(sheet,1,1)[0] || [];
  Object.values(FIELD_DEFINITIONS.WEEKLY_WINDOWS).forEach(header => {
    if (headers.filter(h=>textEquals_(h,header)).length !== 1) throw new Error('WeeklyWindows requires exactly one ' + header + ' column.');
  });
  const columns = buildColumnMap(sheet,FIELD_DEFINITIONS.WEEKLY_WINDOWS,headers);
  const values = readSheetRows_(sheet,2).filter(row=>row.some(value=>value !== '' && value != null));
  if (!values.length) throw new Error('At least one weekly window is required in WeeklyWindows.');
  const ids = new Set();
  const windows = values.map(row => {
    const weekId = String(row[columns.weekId] || '').trim();
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(weekId) || ids.has(normalizeText_(weekId))) throw new Error('Week IDs must be unique identifiers.');
    ids.add(normalizeText_(weekId));
    const result = {weekId};
    ['opens_at','deadline_at','late_until'].forEach(key => {
      const value = row[columns[key]];
      if (Object.prototype.toString.call(value) !== '[object Date]' || !Number.isFinite(value.getTime())) throw new Error('WeeklyWindows ' + FIELD_DEFINITIONS.WEEKLY_WINDOWS[key] + ' requires a native Google Sheets date/time value.');
      result[key] = value.getTime();
    });
    if (!(result.opens_at < result.deadline_at && result.deadline_at <= result.late_until)) throw new Error('Weekly window boundaries are out of order.');
    return result;
  }).sort((a,b) => a.opens_at - b.opens_at);
  windows.forEach((window,index) => { if (index && window.opens_at <= windows[index-1].deadline_at) throw new Error('OPEN weekly windows must not overlap.'); });
  return windows;
}

function weeklyLock_(run) {
  const lock = LockService.getScriptLock();
  const owned = lock.hasLock();
  if (!owned) lock.waitLock(30000);
  try { return run(); } finally { if (!owned) lock.releaseLock(); }
}

function weeklyTeam_(teamId) {
  const sheet = getSheet(SHEET_NAMES.TEAM_STATUS);
  const columns = buildColumnMap(sheet, FIELD_DEFINITIONS.TEAM_STATUS);
  const matches = readSheetRows_(sheet, 2).map((row,index) => ({row,rowNumber:index+2}))
    .filter(item => textEquals_(item.row[columns.TEAM_ID], teamId));
  if (matches.length !== 1) throw new Error('Team is missing or ambiguous.');
  return {...matches[0], sheet, columns, teamId:String(matches[0].row[columns.TEAM_ID])};
}

/** Validated current roster; no duplicated identity registry. */
function weeklyStudents_() {
  const collect = (name, definitions) => {
    const sheet = getSheet(name), columns = buildColumnMap(sheet, definitions);
    const rows = readSheetRows_(sheet, 2), students = [], teams = new Set();
    rows.forEach(row => {
      const teamId = String(row[columns.TEAM_ID] || '').trim();
      if (!teamId) return;
      if (teams.has(normalizeText_(teamId))) throw new Error('Duplicate team in ' + name);
      teams.add(normalizeText_(teamId));
      [1,2,3,4].forEach(n => {
        const email = normalizeEmail(row[columns['S'+n+'_EMAIL']]);
        const regNo = String(row[columns['S'+n+'_REGNO']] || '').trim();
        if (!email && !regNo && !row[columns['S'+n+'_NAME']]) return;
        if (!email || !regNo) throw new Error('Student email or Reg No is missing in ' + name);
        students.push({email,regNo,teamId});
      });
    });
    if (new Set(students.map(s=>s.email)).size !== students.length || new Set(students.map(s=>normalizeText_(s.regNo))).size !== students.length) throw new Error('Student membership is ambiguous in ' + name);
    return students;
  };
  const roster = collect(SHEET_NAMES.TEAM_ROSTER, FIELD_DEFINITIONS.TEAM_ROSTER);
  const status = collect(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  if (roster.length !== status.length || roster.some(student => !status.some(s => s.email === student.email && textEquals_(s.regNo,student.regNo) && textEquals_(s.teamId,student.teamId)))) throw new Error('Roster and TeamStatus membership differ. Synchronize the roster first.');
  return roster;
}

function authorizeWeeklyStudent_() {
  const email = normalizeEmail(Session.getActiveUser().getEmail());
  if (!email) throw new Error('Sign in with your institutional account.');
  const student = weeklyStudents_().find(item => item.email === email);
  if (!student) throw new Error('Student membership was not found.');
  return student;
}

function eligibleWeeklyWindows_(eligibleFrom, windows) {
  if (!eligibleFrom) return [];
  const index = windows.findIndex(w => w.weekId === eligibleFrom);
  if (index < 0) throw new Error('Eligibility references an unknown Week ID.');
  return windows.slice(index);
}

function resolveWeeklySubmissionWindow_(windows, eligibleFrom, now, weekId) {
  const allowed = eligibleWeeklyWindows_(eligibleFrom, windows), at = now.getTime();
  const window = allowed.find(w=>w.weekId === weekId && at >= w.opens_at && at <= w.late_until);
  if (!window) throw new Error('No eligible submission window for this Week ID.');
  return window;
}

/** The same permission rule drives the dashboard and every append. */
function weeklySubmissionState_(window, records, now) {
  const first = records.find(r=>r.weekId === window.weekId && r.entryStatus !== 'MISSED');
  const at = now.getTime();
  const editable = at >= window.opens_at && at <= (first && first.timeliness === 'ON_TIME' ? window.deadline_at : window.late_until);
  const state = first ? (first.timeliness === 'ON_TIME' ? 'SUBMITTED ON TIME' : 'SUBMITTED LATE')
    : at > window.late_until ? 'MISSED' : at > window.deadline_at ? 'LATE' : at >= window.opens_at ? 'OPEN' : 'UPCOMING';
  return {first,editable,state};
}

function weeklyLogColumns_(sheet) {
  if (!sheet) throw new Error('Initialize LogEntries first.');
  const headers = readSheetRows_(sheet,1,1)[0] || [];
  Object.values(FIELD_DEFINITIONS.LOG_ENTRIES).forEach(header => {
    if (headers.filter(h=>textEquals_(h,header)).length !== 1) throw new Error('LogEntries requires exactly one ' + header + ' column.');
  });
  return buildColumnMap(sheet,FIELD_DEFINITIONS.LOG_ENTRIES,headers);
}

function readLogEntries_(teamId, regNo) {
  const sheet = getSheet(SHEET_NAMES.LOG_ENTRIES);
  if (!sheet) throw new Error('Initialize LogEntries first.');
  const columns = weeklyLogColumns_(sheet);
  const source = regNo ? readActivityRows_(SHEET_NAMES.LOG_ENTRIES,columns.regNo+1,regNo) : teamId ? readActivityRows_(SHEET_NAMES.LOG_ENTRIES,columns.teamId+1,teamId) : readSheetRows_(sheet,2);
  return source.filter(row=>row.some(v=>v !== '')).map(row => {
    const record = Object.fromEntries(Object.keys(columns).map(key=>[key,row[columns[key]]]));
    if (!record.id || !record.regNo || !record.weekId || !['MISSED','SUBMITTED','REVISED'].includes(record.entryStatus)) throw new Error('Invalid LogEntries history.');
    return record;
  }).filter(r=>(!teamId || textEquals_(r.teamId,teamId)) && (!regNo || textEquals_(r.regNo,regNo)));
}

function getEffectiveLogEntries_(records) {
  const latest = new Map();
  records.forEach(record=>latest.set(JSON.stringify([normalizeText_(record.regNo),record.weekId]),record));
  return [...latest.values()];
}

function appendWeeklyEntry_(record) {
  const sheet = getSheet(SHEET_NAMES.LOG_ENTRIES), columns = weeklyLogColumns_(sheet);
  const values = new Array(sheet.getLastColumn()).fill('');
  Object.keys(columns).forEach(key => {
    const value = record[key] === undefined ? '' : record[key];
    values[columns[key]] = typeof value === 'string' && /^[=+@-]/.test(value) ? "'" + value : value;
  });
  const next = sheet.getLastRow()+1;
  if (next > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(),100);
  sheet.getRange(next,1,1,values.length).setValues([values]);
  SpreadsheetApp.flush();
}

function weeklyContent_(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Invalid weekly submission.');
  const permitted = ['requestId','weekId','workCompleted','guideDiscussion','blockers','nextAction'];
  if (Object.keys(input).some(key=>!permitted.includes(key))) throw new Error('Unexpected submission field. Identity and timing are server-derived.');
  if (typeof input.requestId !== 'string' || !/^[A-Za-z0-9_-]{12,100}$/.test(input.requestId)) throw new Error('Invalid request ID.');
  if (typeof input.weekId !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(input.weekId)) throw new Error('A valid Week ID is required.');
  const content = {};
  ['workCompleted','guideDiscussion','blockers','nextAction'].forEach(key => {
    if (typeof input[key] !== 'string' || !input[key].trim() || input[key].length > 10000) throw new Error('Each narrative field is required and must be at most 10000 characters.');
    content[key] = input[key].trim();
  });
  return content;
}

function weeklyEntryResponse_(record) {
  return {ok:true,entryId:record.id,weekId:record.weekId,entryStatus:record.entryStatus,timeliness:record.timeliness,
    firstSubmittedAt:new Date(record.firstSubmittedAt).toISOString(),message:'Weekly progress saved.'};
}

function submitWeeklyProgress(input) {
  const content = weeklyContent_(input);
  return weeklyLock_(() => {
    const student = authorizeWeeklyStudent_();
    const records = readLogEntries_(null,student.regNo);
    const duplicates = records.filter(r=>r.requestId === input.requestId);
    if (duplicates.length > 1) throw new Error('Conflicting request history.');
    if (duplicates.length) {
      const saved = duplicates[0];
      if (!textEquals_(saved.teamId,student.teamId) || saved.actor !== student.email || Object.keys(content).some(k=>saved[k] !== content[k]) || saved.weekId !== input.weekId) throw new Error('Request ID was already used for different data.');
      return weeklyEntryResponse_(saved);
    }
    const team = weeklyTeam_(student.teamId);
    if (weeklyGuideFrozen_(records,input.weekId,weeklySignedEntryIds_())) throw new Error('Guide confirmation has frozen this week. Further revisions are not allowed.');
    if (getTeamStatus(team.row) !== 'APPROVED') throw new Error('Your title must be approved before weekly submission.');
    const eligibility = progressStudentEligibility_(student);
    if (!getRepoUrlForTeam(student.teamId)) throw new Error('The team repository is unavailable.');
    const now = new Date(), windows = getWeeklySubmissionWindows_();
    const eligibleFrom = eligibility.eligibleFrom;
    const window = resolveWeeklySubmissionWindow_(windows,eligibleFrom,now,input.weekId);
    const {first,editable} = weeklySubmissionState_(window,records,now);
    if (!editable) throw new Error('This submission is frozen and cannot be revised after its deadline.');
    const evidence = readWeeklyProgressEvidence_(student,window.weekId,weeklyEvidenceSource_(student,{logs:records}));
    if (evidence.state !== 'available') throw new Error(evidence.message || 'GitHub activity is unavailable. Refresh GitHub Activity before submitting.');
    if (evidence.count < 1) throw new Error('No GitHub activity found for you this week. Commit your project work/evidence to the team repository, then refresh.');
    const record = {...content,id:Utilities.getUuid(),requestId:input.requestId,regNo:student.regNo,teamId:student.teamId,
      weekId:window.weekId,actor:student.email,recordedAt:now,submittedAt:now,
      firstSubmittedAt:first ? first.firstSubmittedAt : now,
      timeliness:first ? first.timeliness : now.getTime() <= window.deadline_at ? 'ON_TIME' : 'LATE',
      entryStatus:first ? 'REVISED' : 'SUBMITTED'};
    appendWeeklyEntry_(record);
    return weeklyEntryResponse_(record);
  });
}

function loadStudentWeeklyProgress() {
  const student = authorizeWeeklyStudent_(), team = weeklyTeam_(student.teamId);
  const eligibility = progressStudentEligibility_(student);
  const now = new Date(), windows = getWeeklySubmissionWindows_();
  const eligibleFrom = eligibility.eligibleFrom, enforcedFrom = eligibility.enforcedFrom;
  const ready = !!eligibleFrom && getTeamStatus(team.row) === 'APPROVED';
  const records = readLogEntries_(null,student.regNo);
  const allowed = eligibleWeeklyWindows_(eligibleFrom,windows);
  const signedIds = weeklySignedEntryIds_();
  const weeks = allowed.filter(w=>now.getTime() >= w.opens_at).map(w=>{
    const {state,editable} = weeklySubmissionState_(w,records,now);
    const guideFrozen = weeklyGuideFrozen_(records,w.weekId,signedIds);
    const obligatory = !!eligibleFrom && eligibleWeeklyWindows_(enforcedFrom,windows).some(value=>value.weekId === w.weekId);
    return {weekId:w.weekId,state:!obligatory && state === 'MISSED' ? 'NOT REQUIRED' : state,obligatory,guideFrozen,editable:ready && editable && !guideFrozen,opens:new Date(w.opens_at).toISOString(),
      deadline:new Date(w.deadline_at).toISOString(),cutoff:new Date(w.late_until).toISOString()};
  });
  const actions = weeks.filter(w=>w.editable);
  const serial = records.map(r=>({...r, recordedAt:new Date(r.recordedAt).toISOString(),
    submittedAt:r.submittedAt ? new Date(r.submittedAt).toISOString() : '',
    firstSubmittedAt:r.firstSubmittedAt ? new Date(r.firstSubmittedAt).toISOString() : ''}));
  return {checkedAt:now.toISOString(),eligibleFrom,enforcedFrom,eligibilityStatus:eligibility.status,ready,complete:!!eligibleFrom && windows.every(w=>now.getTime() > w.late_until) && getLogWeekSummary_(records,enforcedFrom,student.regNo,now).missing === 0,weeks,actions,history:serial,timezone:getSpreadsheet().getSpreadsheetTimeZone(),
    allWeeks:windows.map(w=>({weekId:w.weekId,opens:new Date(w.opens_at).toISOString(),deadline:new Date(w.deadline_at).toISOString()})),
    evidence:readStudentWeeklyEvidence_(student,windows.filter(w=>now.getTime() >= w.opens_at),{logs:records}),
    summary:getLogWeekSummary_(records,eligibleFrom ? enforcedFrom : '',student.regNo,now),
    message:ready ? (actions.length ? '' : 'No submission window is open.') : 'An approved title and fixed individual progress eligibility are required to submit.'};
}

function appendMissedWeeklyEntries_(students, windows, now) {
  // Caller holds the same script lock used by student writes.
  const records = readLogEntries_(), eligibilities = readProgressEligibility_();
  students.forEach(student => {
    const eligibility = progressStudentEligibility_(student,eligibilities);
    eligibleWeeklyWindows_(eligibility.eligibleFrom ? eligibility.enforcedFrom : '',windows).filter(w=>now.getTime() > w.late_until).forEach(window => {
      if (records.some(r=>textEquals_(r.regNo,student.regNo) && r.weekId === window.weekId)) return;
      const record = {id:Utilities.getUuid(),requestId:'',regNo:student.regNo,teamId:student.teamId,weekId:window.weekId,
        actor:'SYSTEM',recordedAt:now,submittedAt:'',firstSubmittedAt:'',timeliness:'MISSED',entryStatus:'MISSED'};
      appendWeeklyEntry_(record); records.push(record);
    });
  });
}

/** Reminder receipts are authoritative in this tab; callers hold the weekly lock. */
function weeklyReminderSheet_(create) {
  const name = SHEET_NAMES.WEEKLY_REMINDERS, headers = Object.values(FIELD_DEFINITIONS.WEEKLY_REMINDERS);
  let sheet = getSheet(name);
  if (!sheet && create) sheet = getSpreadsheet().insertSheet(name);
  if (!sheet) throw new Error('WeeklyReminders storage is missing. Run setupWeeklySubmissionStorage.');
  if (!sheet.getLastRow() && create) sheet.getRange(1,1,1,headers.length).setValues([headers]);
  const actual = readSheetRows_(sheet,1,1)[0] || [];
  if (actual.length !== headers.length || headers.some((header,index)=>!textEquals_(header,actual[index]))) {
    throw new Error('WeeklyReminders header mismatch. Expected: '+headers.join(' | '));
  }
  return sheet;
}

function weeklyReminderKey_(regNo,weekId) {
  return normalizeText_(regNo)+'\u0000'+normalizeText_(weekId);
}

function weeklyReminderReceipts_(sheet) {
  const seen = new Set();
  readSheetRows_(sheet,2).forEach(row=>{
    if (!row.some(value=>value !== '')) return;
    const regNo = normalizeText_(row[0]), weekId = normalizeText_(row[1]);
    const at = row[2];
    if (!regNo || !weekId || Object.prototype.toString.call(at) !== '[object Date]' || !Number.isFinite(at.getTime())) {
      throw new Error('Invalid WeeklyReminders receipt.');
    }
    const key = weeklyReminderKey_(regNo,weekId);
    if (seen.has(key)) throw new Error('Duplicate WeeklyReminders receipt.');
    seen.add(key);
  });
  return seen;
}

/** One-time transfer of previously sent reminders; repeatable after partial failure. */
function migrateWeeklyReminderProperties_(sheet,seen) {
  const properties = PropertiesService.getScriptProperties();
  const old = Object.entries(properties.getProperties()).filter(([key])=>key.startsWith('weekly-reminder:'));
  const pending = [];
  old.forEach(([key,value])=>{
    const match = /^weekly-reminder:([^:]+):([^:]+)$/.exec(key);
    if (!match) throw new Error('Invalid weekly reminder property key.');
    let regNo;
    try { regNo = decodeURIComponent(match[1]); } catch(error) { throw new Error('Invalid weekly reminder property identity.'); }
    const weekId = match[2], sentAt = new Date(value), identity = weeklyReminderKey_(regNo,weekId);
    if (!normalizeText_(regNo) || !normalizeText_(weekId) || !Number.isFinite(sentAt.getTime())) throw new Error('Invalid weekly reminder property receipt.');
    if (!seen.has(identity)) { pending.push([regNo,weekId,sentAt]); seen.add(identity); }
  });
  if (pending.length) {
    const first = sheet.getLastRow()+1, last = first+pending.length-1;
    if (last > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(),last-sheet.getMaxRows());
    sheet.getRange(first,1,pending.length,3).setValues(pending);
    SpreadsheetApp.flush();
  }
  old.forEach(([key])=>properties.deleteProperty(key));
  return pending.length;
}

function processWeeklySubmissionSchedule() {
  const windows = getWeeklySubmissionWindows_();
  const hours = Number(getConfig('SUBMISSION_REMINDER_HOURS'));
  if (!Number.isFinite(hours) || hours <= 0) throw new Error('SUBMISSION_REMINDER_HOURS must be positive.');
  return weeklyLock_(() => {
    const currentStudents = weeklyStudents_(), now = new Date();
    const reminderSheet = weeklyReminderSheet_(false), reminders = weeklyReminderReceipts_(reminderSheet);
    appendMissedWeeklyEntries_(currentStudents,windows,now);
    const records = readLogEntries_(), eligibilities = readProgressEligibility_();
    currentStudents.forEach(student => {
      const eligibility = progressStudentEligibility_(student,eligibilities);
      eligibleWeeklyWindows_(eligibility.eligibleFrom ? eligibility.enforcedFrom : '',windows).forEach(window => {
        const at = Date.now();
        if (at < window.opens_at || at < window.deadline_at-hours*3600000 || at >= window.deadline_at) return;
        if (records.some(r=>textEquals_(r.regNo,student.regNo) && r.weekId === window.weekId && r.entryStatus !== 'MISSED')) return;
        const key = weeklyReminderKey_(student.regNo,window.weekId);
        if (reminders.has(key)) return;
        const due = Utilities.formatDate(new Date(window.deadline_at),getSpreadsheet().getSpreadsheetTimeZone(),'dd MMM yyyy HH:mm z');
        try {
          MailApp.sendEmail(student.email,'Weekly progress reminder â€” ' + window.weekId,
            'Submit your weekly progress by ' + due + '.\n\nOpen your Student Dashboard:\n' + getDashboardUrl());
          const rowNumber = reminderSheet.getLastRow()+1;
          if (rowNumber > reminderSheet.getMaxRows()) reminderSheet.insertRowsAfter(reminderSheet.getMaxRows(),1);
          reminderSheet.getRange(rowNumber,1).setNumberFormat('@');
          reminderSheet.getRange(rowNumber,1,1,3).setValues([[student.regNo,window.weekId,new Date()]]);
          reminders.add(key);
        } catch (error) { console.error('Weekly reminder failed for ' + student.regNo + ': ' + error.message); }
      });
    });
  });
}

/** Run in the editor as coordinator before enabling the Phase 1 dashboard. */
function setupWeeklySubmissionStorage() {
  const email = Session.getActiveUser().getEmail();
  if (!email || !activityIsCoordinator_(email)) throw new Error('Coordinator access is required.');
  getWeeklySubmissionWindows_();
  const hours = Number(getConfig('SUBMISSION_REMINDER_HOURS'));
  if (!Number.isFinite(hours) || hours <= 0) throw new Error('SUBMISSION_REMINDER_HOURS must be positive.');
  return weeklyLock_(() => {
    let sheet = getSheet(SHEET_NAMES.LOG_ENTRIES);
    if (!sheet) sheet = getSpreadsheet().insertSheet(SHEET_NAMES.LOG_ENTRIES);
    if (!sheet.getLastRow()) sheet.getRange(1,1,1,Object.keys(FIELD_DEFINITIONS.LOG_ENTRIES).length).setValues([Object.values(FIELD_DEFINITIONS.LOG_ENTRIES)]);
    weeklyLogColumns_(sheet);
    const reminderSheet = weeklyReminderSheet_(true);
    migrateWeeklyReminderProperties_(reminderSheet,weeklyReminderReceipts_(reminderSheet));
    setupProgressEligibilityStorage();
    SpreadsheetApp.flush();
    return {ok:true};
  });
}

function setupWeeklySubmissionTriggers() {
  const email = Session.getActiveUser().getEmail();
  if (!email || !activityIsCoordinator_(email)) throw new Error('Coordinator access is required.');
  getWeeklySubmissionWindows_();
  weeklyLogColumns_(getSheet(SHEET_NAMES.LOG_ENTRIES));
  weeklyReminderReceipts_(weeklyReminderSheet_(false));
  const hours = Number(getConfig('SUBMISSION_REMINDER_HOURS'));
  if (!Number.isFinite(hours) || hours <= 0) throw new Error('SUBMISSION_REMINDER_HOURS must be positive.');
  readProgressEligibility_();
  return weeklyLock_(() => {
    const retired = ['onFormSubmit','sendWeeklyLogReminders','sendWeeklyAnalysisDigest'];
    const triggers = ScriptApp.getProjectTriggers();
    triggers.filter(t=>retired.includes(t.getHandlerFunction())).forEach(t=>ScriptApp.deleteTrigger(t));
    const current = triggers.filter(t=>t.getHandlerFunction() === 'processWeeklySubmissionSchedule');
    current.forEach(t=>ScriptApp.deleteTrigger(t));
    ScriptApp.newTrigger('processWeeklySubmissionSchedule').timeBased().everyHours(1).create();
  });
}
