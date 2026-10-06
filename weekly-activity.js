/** Independent scoped readers; shared aggregation. No persistent activity cache or locks. */
function readActivityRows_(sheetName, column, value) {
  const sheet = getSheet_(sheetName);
  const last = sheet.getLastRow();
  if (last < 2) return [];
  if (column === null) return readSheetRows_(sheet, 2, last - 1);
  const matches = sheet.getRange(2, column, last - 1, 1)
    .createTextFinder(normalizedTextPattern_(String(value))).useRegularExpression(true)
    .matchEntireCell(true).matchCase(false).findAll().sort((a,b)=>a.getRow()-b.getRow());
  return readMatchedRows_(sheet, matches);
}

function weeklyActivityContext_() {
  try {
    const schedule = getProjectSchedule_(), clock = getProjectClock_(schedule);
    const windows = getWeeklySubmissionWindows_(), now = clock.now || new Date();
    const window = windows.find(w=>now.getTime() >= w.opens_at && now.getTime() <= w.deadline_at);
    return {schedule, clock, window, state:window ? 'active' : now.getTime() < windows[0].opens_at ? 'not-started' : now.getTime() > windows[windows.length-1].deadline_at ? 'ended' : 'between'};
  } catch (err) { return {state:'unavailable'}; }
}

function aggregateWeeklyActivity_(teamIds, logs, commits, context, student) {
  const teams = Object.create(null);
  teamIds.forEach(id => { teams[normalizeText_(id)] = {logs:0, commits:student && (!githubId_(student.githubId) || student.unavailable) ? null : 0}; });
  if (context.state !== 'active') {
    Object.values(teams).forEach(value => { value.logs = null; value.commits = null; });
    return teams;
  }
  getEffectiveLogEntries_(logs).forEach(row => {
    const value = teams[normalizeText_(row.teamId)];
    if (value && row.entryStatus !== 'MISSED' && row.weekId === context.window.weekId &&
        (!student || textEquals_(row.regNo,student.regNo))) value.logs++;
  });
  commits.forEach(row => {
    const value = teams[normalizeText_(row.teamId)];
    const at = row.timestamp === '' || row.timestamp == null ? NaN : new Date(row.timestamp).getTime();
    if (student && value && at >= context.window.opens_at && at <= context.window.deadline_at && row.authorResolution === 'unavailable') value.commits = null;
    if (value && value.commits !== null && (student ? githubAuthorMatches_(student.githubId,row.authorId) : normalizeText_(row.username) !== '(unknown)') &&
        at >= context.window.opens_at && at <= context.window.deadline_at) value.commits++;
  });
  return teams;
}

function activityResponse_(context, teams) {
  return {state:context.state, week:context.window ? context.window.weekId : null, checkedAt:new Date().toISOString(), teams};
}

function activityIsCoordinator_(email) {
  return emailsMatch_(email, getCoordinatorEmail_()) || emailsMatch_(email, getConfig_('CELL_PD_EMAIL'));
}

function loadAllTeamsWeeklyActivity_() {
  return withDashboardRead_(() => {
    const email = Session.getActiveUser().getEmail();
    if (!email || !activityIsCoordinator_(email)) throw new Error('Coordinator access is required.');
    const columns = getColumnMap_(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
    const ids = getSheetRows_(SHEET_NAMES.TEAM_STATUS).map(row => row[columns.TEAM_ID]).filter(Boolean);
    const context = weeklyActivityContext_();
    const active = context.state === 'active';
    const teams = aggregateWeeklyActivity_(ids,
      active ? readLogEntries_() : [],
      active ? readCollectedCommits_() : [], context);
    return {...activityResponse_(context, teams), totalTeams:Object.keys(teams).length,
      activeTeams:active ? Object.values(teams).filter(value => value.logs > 0 || value.commits > 0).length : null};
  });
}

function getTeamWeeklyActivity_(teamId, context, logs) {
  const active = context.state === 'active';
  return aggregateWeeklyActivity_([teamId],
    active ? (logs || readLogEntries_(teamId)) : [],
    active ? readCollectedCommits_(teamId) : [], context);
}

/** Collection health only, never a cache of commits or combined weekly data. */

function weeklyEvidenceRepo_(url) {
  const match = String(url || '').trim().match(/^https:\/\/github\.com\/([a-z0-9-]+)\/([a-z0-9_.-]+?)(?:\.git)?\/?$/i);
  return match ? 'https://github.com/' + match[1] + '/' + match[2] : null;
}

/** Ignore unlinked/system authors and the repository bootstrap written by this app. */
function weeklyStudentCommit_(row) {
  const username = normalizeText_(row.username);
  return !!username && !['(unknown)','system'].includes(username) && !username.endsWith('[bot]') &&
    !/^Initial commit: Capstone project for Team\s/i.test(String(row.message || '').trim());
}

/** Private reader: callers authorize the roster-derived student before using it.
 * Optional source is request-local only, so multiple weeks reuse one team read.
 */
function readWeeklyProgressEvidence_(student, weekId, source) {
  source = source || weeklyEvidenceSource_(student);
  const window = (source.windows || getWeeklySubmissionWindows_()).find(w=>w.weekId === weekId);
  if (!window) throw new Error('Unknown evidence Week ID.');
  const log = getEffectiveLogEntries_(source.logs.filter(r=>textEquals_(r.regNo,student.regNo) && textEquals_(r.teamId,student.teamId) && r.weekId === weekId))[0] || null;
  const result = {weekId,log,state:source.state,message:source.message || '',count:null,commits:[]};
  if (source.state !== 'available') return result;
  if (!githubId_(source.githubId) || source.commits.some(row=>weeklyStudentCommit_(row) && textEquals_(row.teamId,student.teamId) &&
      weeklyEvidenceRepo_(row.repositoryUrl)?.toLowerCase() === source.repositoryUrl.toLowerCase() &&
      new Date(row.timestamp).getTime() >= window.opens_at && new Date(row.timestamp).getTime() <= window.deadline_at && row.authorResolution === 'unavailable')) {
    result.state = 'unavailable'; return result;
  }
  const seen = new Set();
  result.commits = source.commits.filter(row=>{
    const at = row.timestamp ? new Date(row.timestamp).getTime() : NaN;
    return weeklyStudentCommit_(row) && textEquals_(row.teamId,student.teamId) && githubAuthorMatches_(source.githubId,row.authorId) && weeklyEvidenceRepo_(row.repositoryUrl)?.toLowerCase() === source.repositoryUrl.toLowerCase() &&
      at >= window.opens_at && at <= window.deadline_at;
  }).map(row=>{
    const sha = commitIdentity_(row.sha), timestamp = new Date(row.timestamp).toISOString();
    if (!sha) throw new Error('Commit identity is unavailable.');
    return {timestamp,message:String(row.message || ''),sha,shortSha:sha.slice(0,7),url:source.repositoryUrl + '/commit/' + sha};
  }).filter(row=>{if(seen.has(row.sha)) return false;seen.add(row.sha);return true;}).sort((a,b)=>b.timestamp.localeCompare(a.timestamp));
  result.count = result.commits.length;
  return result;
}

/** Stored, previously verified identities only. Live profile checks belong to setup. */
function weeklyStoredGithubMapping_(teamId, knownStudents, knownRepoUrl) {
  const sheet = getSheet_(SHEET_NAMES.GITHUB_ACCOUNTS), columns = githubAccountColumns_(sheet);
  const rows = readSheetRows_(sheet,2), students = knownStudents || weeklyStudents_();
  const members = students.filter(student=>textEquals_(student.teamId,teamId)).map(student=>{
    const identity = githubStudentIdentity_(student,rows,columns,students);
    const submission = rows.filter(row=>emailsMatch_(row[1],student.email) && textEquals_(row[2],teamId)).slice(-1)[0];
    return {email:student.email,label:student.regNo,username:String(submission && submission[3] || '').trim(),
      githubId:githubId_(submission && submission[columns.ID]),status:identity.state === 'available' ? 'valid' : 'unavailable'};
  });
  return {members,repoUrl:knownRepoUrl !== undefined ? knownRepoUrl : getRepoUrlForTeam_(teamId)};
}

/** Runs `read` at most once; a failure is remembered and rethrown to every later caller. */
function memoizedRead_(read) {
  let done = false, value, error = null;
  return () => {
    if (!done) { done = true; try { value = read(); } catch (caught) { error = caught; } }
    if (error) throw error;
    return value;
  };
}

/**
 * `options.setup`, `options.commits` and `options.collectionStatus` may be functions so a caller serving many
 * students of one team can share one read per team (see loadGuideWeeklyProgress_); they run inside the same
 * error handling as the direct reads, so a failure still yields an unavailable source.
 */
function weeklyEvidenceSource_(student, options) {
  options = options || {};
  const source = {logs:options.logs || readLogEntries_(student.teamId,student.regNo),state:'unmapped',commits:[]};
  try {
    const setup = typeof options.setup === 'function' ? options.setup() : options.setup || weeklyStoredGithubMapping_(student.teamId, options.students, options.repoUrl);
    const members = setup.members || [], mine = members.filter(m=>emailsMatch_(m.email,student.email) && textEquals_(m.label,student.regNo));
    if (mine.length !== 1 || mine[0].status !== 'valid' || !String(mine[0].username || '').trim() || !githubId_(mine[0].githubId) ||
        members.filter(m=>githubAuthorMatches_(mine[0].githubId,m.githubId)).length !== 1) {
      source.state='unavailable'; source.message='Your GitHub username mapping is unavailable or unverified. Complete GitHub setup, then refresh.'; return source;
    }
    source.githubId = mine[0].githubId;
    source.repositoryUrl = weeklyEvidenceRepo_(setup.repoUrl);
    source.state = 'unavailable';
    if (!source.repositoryUrl) return source;
    if ((options.collectionStatus ? options.collectionStatus() : readCommitCollectionStatus_(student.teamId)) !== 'ok') return source;
    source.commits = options.commits ? options.commits() : readCollectedCommits_(student.teamId);
    source.state = 'available';
  } catch (error) { source.state = 'unavailable'; }
  return source;
}

function readStudentWeeklyEvidence_(student, windows, options) {
  const source = weeklyEvidenceSource_(student,options);
  // The windows this call already holds answer every per-week lookup; no need to re-read WeeklyWindows for each week.
  source.windows = windows;
  return windows.map(window=>{
    try {
      const result = readWeeklyProgressEvidence_(student,window.weekId,source);
      // Logs are returned separately in the dashboard history; never duplicate them in storage.
      return {weekId:result.weekId,state:result.state,message:result.message,count:result.count,commits:result.commits};
    } catch (error) { return {weekId:window.weekId,state:'unavailable',count:null,commits:[]}; }
  });
}
