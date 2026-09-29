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

function fetchCommitsForTeam(repoOwner, repoName, weeks) {
  weeks = weeks || 4;
  const sinceDate = new Date();
  sinceDate.setDate(sinceDate.getDate() - 7 * weeks);
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

/** Final six-column layout; validation never rewrites historical rows. */
function commitColumns_(sheet) {
  if (!sheet) throw new Error('Commits sheet is missing.');
  const headers = readSheetRows_(sheet,1,1)[0] || [];
  const columns = Object.fromEntries(Object.keys(FIELD_DEFINITIONS.COMMITS).map((key,index)=>[key,index]));
  Object.entries(columns).forEach(([key,index])=>{
    if (headers[index] !== FIELD_DEFINITIONS.COMMITS[key]) throw new Error('Commits header mismatch at column ' + (index+1) + '. Correct headers without moving historical data.');
  });
  if (headers.slice(6).some(header=>String(header || '').trim())) throw new Error('Commits requires exactly six columns. Existing data was not changed.');
  return columns;
}

function commitIdentity_(sha) {
  return /^[a-f0-9]{40}$/i.test(String(sha || '')) ? String(sha).toLowerCase() : null;
}

function readCollectedCommits_(teamId) {
  const sheet = getSheet(SHEET_NAMES.COMMITS), columns = commitColumns_(sheet);
  const rows = teamId ? readActivityRows_(SHEET_NAMES.COMMITS,columns.TEAM_ID+1,teamId) : readSheetRows_(sheet,2);
  return rows.filter(row=>row[columns.TEAM_ID]).map(row=>({teamId:row[columns.TEAM_ID],timestamp:row[columns.DATE],
    username:row[columns.USERNAME],sha:row[columns.SHA],message:row[columns.MESSAGE],repositoryUrl:row[columns.REPO_URL]}));
}

function appendCollectedCommits_(sheet, teamId, commits, repoUrl) {
  // Validate the whole response before writing; repository URL comes from TeamStatus.
  if (!String(teamId || '').trim() || !parseGithubRepoUrl_(repoUrl)) throw new Error('Invalid recorded team or repository URL.');
  const incoming = commits.map(commit => {
    const key = commitIdentity_(commit.sha);
    const timestamp = new Date(commit.commit && commit.commit.committer && commit.commit.committer.date);
    if (!key || !Number.isFinite(timestamp.getTime()) || typeof commit.commit.message !== 'string') throw new Error('Invalid commit SHA, timestamp or message for ' + teamId);
    const values = [timestamp,teamId,commit.commit.message.split('\n')[0],commit.author ? commit.author.login : '(unknown)',repoUrl,key];
    return {key,values:values.map(value=>typeof value === 'string' && /^[=+@-]/.test(value) ? "'"+value : value)};
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
      sheet.getRange(first,1,pending.length,Object.keys(FIELD_DEFINITIONS.COMMITS).length).setValues(pending.map(commit=>commit.values));
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

function fetchAllCommits() {
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
      const commits = fetchCommitsForTeam(repo.owner,repo.repo,4);
      processed.push({teamId,...appendCollectedCommits_(commitSheet,teamId,commits,repoUrl)});
      PropertiesService.getScriptProperties().setProperty(commitCollectionKey_(teamId), 'ok');
    } catch (error) {
      PropertiesService.getScriptProperties().setProperty(commitCollectionKey_(teamId), 'error');
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
  let values;
  try { values = JSON.parse(String(getConfig('WEEKLY_SUBMISSION_WINDOWS'))); }
  catch (error) { throw new Error('Configure WEEKLY_SUBMISSION_WINDOWS as a JSON array of explicit windows.'); }
  if (!Array.isArray(values) || !values.length) throw new Error('At least one weekly window is required.');
  const ids = new Set();
  const windows = values.map(value => {
    if (!value || typeof value.week_id !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(value.week_id) || ids.has(value.week_id)) throw new Error('Week IDs must be unique identifiers.');
    ids.add(value.week_id);
    const result = {weekId:value.week_id};
    ['opens_at','deadline_at','closes_at','late_until'].forEach(key => {
      const text = value[key];
      if (typeof text !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?(?:Z|[+-]\d{2}:\d{2})$/.test(text) || !Number.isFinite(Date.parse(text))) throw new Error(key + ' requires an ISO timestamp with offset.');
      const parts = text.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})/);
      const day = new Date(Date.UTC(Number(parts[1]),Number(parts[2])-1,Number(parts[3])));
      if (day.getUTCFullYear() !== Number(parts[1]) || day.getUTCMonth()+1 !== Number(parts[2]) || day.getUTCDate() !== Number(parts[3]) || Number(parts[4]) > 23 || Number(parts[5]) > 59 || Number(parts[6]) > 59) throw new Error(key + ' contains an invalid calendar timestamp.');
      result[key] = Date.parse(text);
    });
    if (!(result.opens_at < result.deadline_at && result.deadline_at <= result.closes_at && result.closes_at <= result.late_until)) throw new Error('Weekly window boundaries are out of order.');
    return result;
  }).sort((a,b) => a.opens_at - b.opens_at);
  windows.forEach((window,index) => { if (index && window.opens_at <= windows[index-1].closes_at) throw new Error('Normal weekly windows must not overlap.'); });
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
  const eligibilityColumn = getOptionalHeaderIndex_(sheet, WEEKLY_ELIGIBILITY_HEADER_);
  if (eligibilityColumn < 0) throw new Error('Initialize weekly progress storage first.');
  return {...matches[0], sheet, columns, eligibilityColumn, teamId:String(matches[0].row[columns.TEAM_ID]),
    eligibleFrom:String(matches[0].row[eligibilityColumn] || '')};
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

/** First applicable means the still-open normal window, or the next future one. */
function ensureWeeklyProgressEligibility_(teamId, ready, now) {
  return weeklyLock_(() => {
    const team = weeklyTeam_(teamId), windows = getWeeklySubmissionWindows_();
    if (team.eligibleFrom) {
      if (!windows.some(w=>w.weekId === team.eligibleFrom)) throw new Error('Eligibility references an unknown Week ID.');
      return team.eligibleFrom;
    }
    if (!ready || getTeamStatus(team.row) !== 'APPROVED') return '';
    const window = windows.find(w => w.closes_at >= (now || new Date()).getTime());
    if (!window) return '';
    team.sheet.getRange(team.rowNumber, team.eligibilityColumn+1).setValue(window.weekId);
    SpreadsheetApp.flush();
    return window.weekId;
  });
}

/** Hooks must not fail unrelated title/provisioning operations before Phase 1 setup. */
function recordWeeklyEligibilityIfConfigured_(teamId, setup) {
  try {
    if (getOptionalHeaderIndex_(getSheet(SHEET_NAMES.TEAM_STATUS), WEEKLY_ELIGIBILITY_HEADER_) < 0) return;
    const team = weeklyTeam_(teamId);
    if (team.eligibleFrom || getTeamStatus(team.row) !== 'APPROVED') return;
    const verified = setup || getTeamGithubSetup_(teamId);
    ensureWeeklyProgressEligibility_(teamId, verified.ready, new Date());
  } catch (error) { console.error('Weekly eligibility not recorded: ' + error.message); }
}

function eligibleWeeklyWindows_(eligibleFrom, windows) {
  if (!eligibleFrom) return [];
  const index = windows.findIndex(w => w.weekId === eligibleFrom);
  if (index < 0) throw new Error('Eligibility references an unknown Week ID.');
  return windows.slice(index);
}

function resolveWeeklySubmissionWindow_(windows, eligibleFrom, now, overdueWeekId) {
  const allowed = eligibleWeeklyWindows_(eligibleFrom, windows), at = now.getTime();
  const window = overdueWeekId ? allowed.find(w=>w.weekId === overdueWeekId && at > w.closes_at && at <= w.late_until)
    : allowed.find(w=>at >= w.opens_at && at <= w.closes_at);
  if (!window) throw new Error('No eligible submission window. After close, use the explicit overdue-week action before its cutoff.');
  return window;
}

function weeklyLogColumns_(sheet) {
  if (!sheet) throw new Error('Initialize LOG_ENTRIES first.');
  const headers = readSheetRows_(sheet,1,1)[0] || [];
  Object.values(FIELD_DEFINITIONS.LOG_ENTRIES).forEach(header => {
    if (headers.filter(h=>textEquals_(h,header)).length !== 1) throw new Error('LOG_ENTRIES requires exactly one ' + header + ' column.');
  });
  return buildColumnMap(sheet,FIELD_DEFINITIONS.LOG_ENTRIES,headers);
}

function readLogEntries_(teamId, regNo) {
  const sheet = getSheet(SHEET_NAMES.LOG_ENTRIES);
  if (!sheet) throw new Error('Initialize LOG_ENTRIES first.');
  const columns = weeklyLogColumns_(sheet);
  const source = regNo ? readActivityRows_(SHEET_NAMES.LOG_ENTRIES,columns.regNo+1,regNo) : teamId ? readActivityRows_(SHEET_NAMES.LOG_ENTRIES,columns.teamId+1,teamId) : readSheetRows_(sheet,2);
  return source.filter(row=>row.some(v=>v !== '')).map(row => {
    const record = Object.fromEntries(Object.keys(columns).map(key=>[key,row[columns[key]]]));
    if (!record.id || !record.regNo || !record.weekId || !['MISSED','SUBMITTED','REVISED'].includes(record.entryStatus)) throw new Error('Invalid LOG_ENTRIES history.');
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
  const permitted = ['requestId','overdueWeekId','workCompleted','guideDiscussion','blockers','nextAction'];
  if (Object.keys(input).some(key=>!permitted.includes(key))) throw new Error('Unexpected submission field. Identity and timing are server-derived.');
  if (typeof input.requestId !== 'string' || !/^[A-Za-z0-9_-]{12,100}$/.test(input.requestId)) throw new Error('Invalid request ID.');
  if (input.overdueWeekId !== undefined && typeof input.overdueWeekId !== 'string') throw new Error('Invalid overdue action.');
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
      if (!textEquals_(saved.teamId,student.teamId) || saved.actor !== student.email || Object.keys(content).some(k=>saved[k] !== content[k]) || (input.overdueWeekId && saved.weekId !== input.overdueWeekId)) throw new Error('Request ID was already used for different data.');
      return weeklyEntryResponse_(saved);
    }
    const team = weeklyTeam_(student.teamId);
    if (getTeamStatus(team.row) !== 'APPROVED') throw new Error('Your title must be approved before weekly submission.');
    requireTeamGithubReady_(student.teamId,student.email);
    if (!getRepoUrlForTeam(student.teamId)) throw new Error('The team repository is unavailable.');
    const now = new Date(), windows = getWeeklySubmissionWindows_();
    const eligibleFrom = ensureWeeklyProgressEligibility_(student.teamId,true,now);
    const window = resolveWeeklySubmissionWindow_(windows,eligibleFrom,now,input.overdueWeekId);
    const history = records.filter(r=>r.weekId === window.weekId);
    const first = history.find(r=>r.entryStatus !== 'MISSED');
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
  const setup = getTeamGithubSetup_(student.teamId);
  const now = new Date(), windows = getWeeklySubmissionWindows_();
  const eligibleFrom = ensureWeeklyProgressEligibility_(student.teamId,setup.ready,now);
  const ready = setup.ready && getTeamStatus(team.row) === 'APPROVED';
  const records = readLogEntries_(null,student.regNo);
  const allowed = eligibleWeeklyWindows_(eligibleFrom,windows);
  const actions = allowed.filter(w=>now.getTime() >= w.opens_at && now.getTime() <= w.late_until).map(w=>({
    weekId:w.weekId,overdue:now.getTime() > w.closes_at,deadline:new Date(w.deadline_at).toISOString(),
    cutoff:new Date(w.late_until).toISOString()}));
  const serial = records.map(r=>({...r, recordedAt:new Date(r.recordedAt).toISOString(),
    submittedAt:r.submittedAt ? new Date(r.submittedAt).toISOString() : '',
    firstSubmittedAt:r.firstSubmittedAt ? new Date(r.firstSubmittedAt).toISOString() : ''}));
  return {eligibleFrom,ready,complete:!!eligibleFrom && now.getTime() > windows[windows.length-1].closes_at && getLogWeekSummary_(records,eligibleFrom,student.regNo,now).missing === 0,actions:ready ? actions : [],history:serial,timezone:getSpreadsheet().getSpreadsheetTimeZone(),
    evidence:readStudentWeeklyEvidence_(student,windows.filter(w=>now.getTime() >= w.opens_at),{setup,logs:records}),
    summary:getLogWeekSummary_(records,eligibleFrom,student.regNo,now),
    message:ready ? (actions.length ? '' : 'No submission window is open.') : 'An approved title and ready GitHub repository are required to submit.'};
}

function appendMissedWeeklyEntries_(students, windows, now) {
  // Caller holds the same script lock used by student writes.
  const records = readLogEntries_();
  students.forEach(student => {
    const team = weeklyTeam_(student.teamId);
    eligibleWeeklyWindows_(team.eligibleFrom,windows).filter(w=>now.getTime() > w.closes_at).forEach(window => {
      if (records.some(r=>textEquals_(r.regNo,student.regNo) && r.weekId === window.weekId)) return;
      const record = {id:Utilities.getUuid(),requestId:'',regNo:student.regNo,teamId:student.teamId,weekId:window.weekId,
        actor:'SYSTEM',recordedAt:now,submittedAt:'',firstSubmittedAt:'',timeliness:'MISSED',entryStatus:'MISSED'};
      appendWeeklyEntry_(record); records.push(record);
    });
  });
}

function processWeeklySubmissionSchedule() {
  const windows = getWeeklySubmissionWindows_();
  const hours = Number(getConfig('SUBMISSION_REMINDER_HOURS'));
  if (!Number.isFinite(hours) || hours <= 0) throw new Error('SUBMISSION_REMINDER_HOURS must be positive.');
  // Discover first eligibility without making existing obligations depend on live GitHub.
  const students = weeklyStudents_();
  [...new Set(students.map(s=>s.teamId))].forEach(teamId=>recordWeeklyEligibilityIfConfigured_(teamId));
  return weeklyLock_(() => {
    const currentStudents = weeklyStudents_(), now = new Date();
    appendMissedWeeklyEntries_(currentStudents,windows,now);
    const records = readLogEntries_(), properties = PropertiesService.getScriptProperties();
    currentStudents.forEach(student => {
      const team = weeklyTeam_(student.teamId);
      eligibleWeeklyWindows_(team.eligibleFrom,windows).forEach(window => {
        const at = Date.now();
        if (at < window.opens_at || at < window.deadline_at-hours*3600000 || at >= window.deadline_at) return;
        if (records.some(r=>textEquals_(r.regNo,student.regNo) && r.weekId === window.weekId && r.entryStatus !== 'MISSED')) return;
        const key = 'weekly-reminder:' + encodeURIComponent(normalizeText_(student.regNo)) + ':' + window.weekId;
        if (properties.getProperty(key)) return;
        const due = Utilities.formatDate(new Date(window.deadline_at),getSpreadsheet().getSpreadsheetTimeZone(),'dd MMM yyyy HH:mm z');
        try {
          MailApp.sendEmail(student.email,'Weekly progress reminder â€” ' + window.weekId,
            'Submit your weekly progress by ' + due + '.\n\nOpen your Student Dashboard:\n' + getDashboardUrl());
          properties.setProperty(key,new Date().toISOString());
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
    const status = getSheet(SHEET_NAMES.TEAM_STATUS);
    if (getOptionalHeaderIndex_(status,WEEKLY_ELIGIBILITY_HEADER_) < 0) status.getRange(1,status.getLastColumn()+1).setValue(WEEKLY_ELIGIBILITY_HEADER_);
    SpreadsheetApp.flush();
    return {ok:true};
  });
}

function setupWeeklySubmissionTriggers() {
  const email = Session.getActiveUser().getEmail();
  if (!email || !activityIsCoordinator_(email)) throw new Error('Coordinator access is required.');
  getWeeklySubmissionWindows_();
  weeklyLogColumns_(getSheet(SHEET_NAMES.LOG_ENTRIES));
  const hours = Number(getConfig('SUBMISSION_REMINDER_HOURS'));
  if (!Number.isFinite(hours) || hours <= 0) throw new Error('SUBMISSION_REMINDER_HOURS must be positive.');
  if (getOptionalHeaderIndex_(getSheet(SHEET_NAMES.TEAM_STATUS),WEEKLY_ELIGIBILITY_HEADER_) < 0) throw new Error('Initialize weekly progress storage first.');
  return weeklyLock_(() => {
    const retired = ['onFormSubmit','sendWeeklyLogReminders','sendWeeklyAnalysisDigest'];
    const triggers = ScriptApp.getProjectTriggers();
    triggers.filter(t=>retired.includes(t.getHandlerFunction())).forEach(t=>ScriptApp.deleteTrigger(t));
    const current = triggers.filter(t=>t.getHandlerFunction() === 'processWeeklySubmissionSchedule');
    current.forEach(t=>ScriptApp.deleteTrigger(t));
    ScriptApp.newTrigger('processWeeklySubmissionSchedule').timeBased().everyHours(1).create();
  });
}
