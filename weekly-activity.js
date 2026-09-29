/** Independent scoped readers; shared aggregation. No persistent activity cache or locks. */
function readActivityRows_(sheetName, column, value) {
  const sheet = getSheet(sheetName);
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
    const window = windows.find(w=>now.getTime() >= w.opens_at && now.getTime() <= w.closes_at);
    return {schedule, clock, window, state:window ? 'active' : now.getTime() < windows[0].opens_at ? 'not-started' : 'ended'};
  } catch (err) { return {state:'unavailable'}; }
}

function aggregateWeeklyActivity_(teamIds, logs, commits, context, student) {
  const teams = Object.create(null);
  teamIds.forEach(id => { teams[normalizeText_(id)] = {logs:0, commits:student && !student.username ? null : 0}; });
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
    if (value && normalizeText_(row.username) !== '(unknown)' && (!student || (student.username && textEquals_(row.username, student.username))) &&
        at >= context.window.opens_at && at <= context.window.closes_at) value.commits++;
  });
  return teams;
}

function activityResponse_(context, teams) {
  return {state:context.state, week:context.window ? context.window.weekId : null, checkedAt:new Date().toISOString(), teams};
}

function activityIsCoordinator_(email) {
  return emailsMatch(email, getCoordinatorEmail()) || emailsMatch(email, getConfig('CELL_PD_EMAIL'));
}

function authorizeActivityTeam_(email, row, columns, studentEmail) {
  if (!email || !row) throw new Error('Activity access denied.');
  if (activityIsCoordinator_(email) || emailsMatch(row[columns.GUIDE_EMAIL], email) ||
      getCommitteeNumbersForReviewer(email).some(number => textEquals_(number, row[columns.COMMITTEE_NUMBER]))) return;
  const member = [1,2,3,4].some(number => emailsMatch(row[columns['S' + number + '_EMAIL']], email));
  if (!member || (studentEmail && !emailsMatch(email, studentEmail))) throw new Error('Activity access denied.');
}

function loadAllTeamsWeeklyActivity() {
  return withDashboardRead_(() => {
    const email = Session.getActiveUser().getEmail();
    if (!email || !activityIsCoordinator_(email)) throw new Error('Coordinator access is required.');
    const columns = getColumnMap(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
    const ids = getSheetRows(SHEET_NAMES.TEAM_STATUS).map(row => row[columns.TEAM_ID]).filter(Boolean);
    const context = weeklyActivityContext_();
    const active = context.state === 'active';
    const teams = aggregateWeeklyActivity_(ids,
      active ? readLogEntries_() : [],
      active ? readCollectedCommits_() : [], context);
    return {...activityResponse_(context, teams), totalTeams:Object.keys(teams).length,
      activeTeams:active ? Object.values(teams).filter(value => value.logs > 0 || value.commits > 0).length : null};
  });
}

function loadTeamWeeklyActivity(teamId) {
  return withDashboardRead_(() => {
    const columns = getColumnMap(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
    const rows = readActivityRows_(SHEET_NAMES.TEAM_STATUS, columns.TEAM_ID + 1, teamId);
    if (rows.length !== 1) throw new Error('Team not found or duplicated.');
    authorizeActivityTeam_(Session.getActiveUser().getEmail(), rows[0], columns);
    const context = weeklyActivityContext_();
    return activityResponse_(context, getTeamWeeklyActivity_(teamId, context));
  });
}

function getTeamWeeklyActivity_(teamId, context, logs) {
  const active = context.state === 'active';
  return aggregateWeeklyActivity_([teamId],
    active ? (logs || readLogEntries_(teamId)) : [],
    active ? readCollectedCommits_(teamId) : [], context);
}

function loadStudentWeeklyActivity(studentEmail) {
  return withDashboardRead_(() => {
    const email = Session.getActiveUser().getEmail();
    studentEmail = normalizeEmail(studentEmail || email);
    if (!email || !studentEmail) throw new Error('Activity access denied.');
    const columns = getColumnMap(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
    const matches = getSheetRows(SHEET_NAMES.TEAM_STATUS).filter(row => [1,2,3,4].some(number => emailsMatch(row[columns['S' + number + '_EMAIL']], studentEmail)));
    if (matches.length !== 1) throw new Error('Student team not found or ambiguous.');
    const row = matches[0], teamId = row[columns.TEAM_ID];
    authorizeActivityTeam_(email, row, columns, studentEmail);
    const context = weeklyActivityContext_();
    let username = null, logs = [], commits = [];
    if (context.state === 'active') {
      // Latest submission per email; a username claimed by multiple people is ambiguous.
      const mappings = new Map();
      readActivityRows_(SHEET_NAMES.GITHUB_USERNAME_RAW, 3, teamId).forEach(item => mappings.set(normalizeEmail(item[1]), normalizeText_(item[3])));
      const candidate = mappings.get(studentEmail);
      if (candidate && /^[a-z\d](?:[a-z\d-]{0,38})$/.test(candidate) && [...mappings.values()].filter(value => value === candidate).length === 1) username = candidate;
      const slot = [1,2,3,4].find(n=>emailsMatch(row[columns['S'+n+'_EMAIL']],studentEmail));
      logs = readLogEntries_(teamId,row[columns['S'+slot+'_REGNO']]);
      if (username) commits = readCollectedCommits_(teamId);
    }
    return {...activityResponse_(context, aggregateWeeklyActivity_([teamId], logs, commits, context, {email:studentEmail, username,regNo:row[columns['S'+[1,2,3,4].find(n=>emailsMatch(row[columns['S'+n+'_EMAIL']],studentEmail))+'_REGNO']]})),
      studentEmail, commitAttribution:username ? 'mapped' : 'unavailable'};
  });
}

/** Collection health only, never a cache of commits or combined weekly data. */
function commitCollectionKey_(teamId) {
  return 'commit-collection:' + encodeURIComponent(normalizeText_(teamId));
}

function weeklyEvidenceRepo_(url) {
  const match = String(url || '').trim().match(/^https:\/\/github\.com\/([a-z0-9-]+)\/([a-z0-9_.-]+?)(?:\.git)?\/?$/i);
  return match ? 'https://github.com/' + match[1] + '/' + match[2] : null;
}

/** Private reader: callers authorize the roster-derived student before using it.
 * Optional source is request-local only, so multiple weeks reuse one team read.
 */
function readWeeklyProgressEvidence_(student, weekId, source) {
  source = source || weeklyEvidenceSource_(student);
  const window = getWeeklySubmissionWindows_().find(w=>w.weekId === weekId);
  if (!window) throw new Error('Unknown evidence Week ID.');
  const log = getEffectiveLogEntries_(source.logs.filter(r=>textEquals_(r.regNo,student.regNo) && textEquals_(r.teamId,student.teamId) && r.weekId === weekId))[0] || null;
  const result = {weekId,log,state:source.state,count:null,commits:[]};
  if (source.state !== 'available') return result;
  const seen = new Set();
  result.commits = source.commits.filter(row=>{
    const at = row.timestamp ? new Date(row.timestamp).getTime() : NaN;
    return textEquals_(row.teamId,student.teamId) && normalizeText_(row.username) !== '(unknown)' &&
      textEquals_(row.username,source.username) && weeklyEvidenceRepo_(row.repositoryUrl)?.toLowerCase() === source.repositoryUrl.toLowerCase() &&
      at >= window.opens_at && at <= window.closes_at;
  }).map(row=>{
    const sha = commitIdentity_(row.sha), timestamp = new Date(row.timestamp).toISOString();
    if (!sha) throw new Error('Commit identity is unavailable.');
    return {timestamp,message:String(row.message || ''),sha,shortSha:sha.slice(0,7),url:source.repositoryUrl + '/commit/' + sha};
  }).filter(row=>{if(seen.has(row.sha)) return false;seen.add(row.sha);return true;}).sort((a,b)=>b.timestamp.localeCompare(a.timestamp));
  result.count = result.commits.length;
  return result;
}

function weeklyEvidenceSource_(student, options) {
  options = options || {};
  const source = {logs:options.logs || readLogEntries_(student.teamId,student.regNo),state:'unmapped',commits:[]};
  try {
    const setup = options.setup || getTeamGithubSetup_(student.teamId,{inspectAccess:false});
    const members = setup.members || [], mine = members.filter(m=>emailsMatch(m.email,student.email) && textEquals_(m.label,student.regNo));
    if (mine.length !== 1 || mine[0].status !== 'valid' || !mine[0].username ||
        members.filter(m=>textEquals_(m.username,mine[0].username)).length !== 1) return source;
    source.username = mine[0].username;
    source.repositoryUrl = weeklyEvidenceRepo_(setup.repoUrl);
    source.state = 'unavailable';
    if (!source.repositoryUrl || PropertiesService.getScriptProperties().getProperty(commitCollectionKey_(student.teamId)) !== 'ok') return source;
    source.commits = readCollectedCommits_(student.teamId);
    source.state = 'available';
  } catch (error) { source.state = 'unavailable'; }
  return source;
}

function readStudentWeeklyEvidence_(student, windows, options) {
  const source = weeklyEvidenceSource_(student,options);
  return windows.map(window=>{
    try {
      const result = readWeeklyProgressEvidence_(student,window.weekId,source);
      // Logs are returned separately in the dashboard history; never duplicate them in storage.
      return {weekId:result.weekId,state:result.state,count:result.count,commits:result.commits};
    } catch (error) { return {weekId:window.weekId,state:'unavailable',count:null,commits:[]}; }
  });
}
