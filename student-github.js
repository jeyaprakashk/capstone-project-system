/** Student GitHub account connection and separate repository setup. */
/** Same live verification as getTeamGithubSetup_, with the GitHub reads in parallel batches (the guide dashboard's path). */
function getStudentTeamGithubSetup_(teamId, row, repoUrl) {
  const columns = getColumnMap_(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const key = normalizeText_(teamId);
  return getTeamsGithubSetup_([row], columns, {[key]: repoUrl}, getSheetRows_(SHEET_NAMES.GITHUB_ACCOUNTS))[key];
}

function getStudentGithubState_(email, teamId, roster, repoUrl, teamStatusRow) {
  const setup = teamStatusRow ? getStudentTeamGithubSetup_(teamId, teamStatusRow, repoUrl) : getTeamGithubSetup_(teamId, { repoUrl });
  const mine = setup.members.find(member => emailsMatch_(member.email, email));
  const githubNeedsUsername = !!mine && !mine.githubId && !mine.username;
  const githubAccount = mine ? {githubId:mine.githubId || '',username:mine.username || '',displayName:mine.displayName || '',profileUrl:mine.profileUrl || ''} : null;
  return { githubAccount, githubCaptureReady:githubCaptureReady_(), githubSetup: setup, githubReady: setup.ready,
    githubCanRetry: !setup.ready && (setup.usernamesComplete || setup.verificationUnavailable),
    githubUsername: mine ? mine.username : '', githubNeedsUsername,
    githubState: setup.ready ? 'done' : githubNeedsUsername ? 'active' : 'waiting',
    githubText: githubNeedsUsername && mine.status === 'missing'
      ? 'Waiting for GitHub account connection. Connect your GitHub account using your profile link.'
      : setup.message };
}

function authorizeStudentGithub_() {
  const email = Session.getActiveUser().getEmail();
  if (!email) throw new Error('Please sign in with your institutional Google account.');
  const columns = getColumnMap_(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const row = getSheetRows_(SHEET_NAMES.TEAM_STATUS).find(row => row[columns.TEAM_ID] &&
    [columns.S1_EMAIL, columns.S2_EMAIL, columns.S3_EMAIL, columns.S4_EMAIL].some(index => emailsMatch_(row[index], email)));
  if (!row) throw new Error('Student team was not found for your account.');
  return { email, teamId: row[columns.TEAM_ID], row };
}

function previewStudentGithubAccount_(profileUrl) {
  const student = authorizeStudentGithub_();
  githubAccountColumns_(getSheet_(SHEET_NAMES.GITHUB_ACCOUNTS));
  const username = githubProfileUsername_(profileUrl);
  const account = githubAccountResponse_(makeGithubRequest_('GET','/users/' + encodeURIComponent(username)));
  const token = Utilities.getUuid();
  CacheService.getScriptCache().put('github-confirm:' + token, JSON.stringify({
    email:normalizeEmail_(student.email),teamId:String(student.teamId),account,expires:Date.now()+600000
  }),600);
  return {ok:true,token,account};
}

function confirmStudentGithubAccount_(token) {
  const student = authorizeStudentGithub_();
  if (!/^[a-z0-9-]{20,80}$/i.test(String(token || ''))) throw new Error('Account confirmation expired. Preview your profile again.');
  return githubIdentityLock_(()=>{
    const cache = CacheService.getScriptCache(), key = 'github-confirm:' + token, raw = cache.get(key);
    if (!raw) throw new Error('Account confirmation expired. Preview your profile again.');
    const preview = JSON.parse(raw);
    if (preview.expires < Date.now() || preview.email !== normalizeEmail_(student.email) || !textEquals_(preview.teamId,student.teamId)) throw new Error('Account confirmation expired or belongs to another student.');
    const current = authorizeStudentGithub_();
    if (!emailsMatch_(current.email,student.email) || !textEquals_(current.teamId,student.teamId)) throw new Error('Student membership changed. Reload the dashboard.');
    const sheet = getSheet_(SHEET_NAMES.GITHUB_ACCOUNTS), columns = githubAccountColumns_(sheet);
    const rows = readSheetRows_(sheet,2), students = weeklyStudents_();
    const owners = students.filter(s=>emailsMatch_(s.email,student.email) && textEquals_(s.teamId,student.teamId));
    if (owners.length !== 1) throw new Error('Student membership is ambiguous.');
    const account = preview.account;
    if (!githubId_(account.githubId)) throw new Error('Invalid account confirmation.');
    const mine = rows.flatMap((row,i)=>emailsMatch_(row[1],student.email) && textEquals_(row[2],student.teamId) ? [{row,index:i+2}] : []);
    if (mine.some(item=>item.row[columns.ID] !== '' && item.row[columns.ID] != null && githubId_(item.row[columns.ID]) !== account.githubId)) throw new Error('Your GitHub account cannot be replaced. Contact the coordinator.');
    const duplicate = rows.some(row=>{
      if (githubId_(row[columns.ID]) !== account.githubId) return false;
      const matches = students.filter(s=>emailsMatch_(s.email,row[1]) && textEquals_(s.teamId,row[2]));
      return matches.length !== 1 || !textEquals_(matches[0].regNo,owners[0].regNo);
    });
    if (duplicate) throw new Error('This GitHub account is assigned to another student. Contact the coordinator.');
    // Damaged existing account records require coordinator intervention, not student relinking.
    if (mine.some(item=>item.row[3] && !githubId_(item.row[columns.ID]))) throw new Error('Your existing registration has no valid GitHub ID. Contact the coordinator.');
    if (mine.length > 1) throw new Error('Conflicting registration rows. Contact the coordinator.');
    let rowNumber = mine.length ? mine[0].index : sheet.getLastRow()+1;
    if (!mine.length) sheet.getRange(rowNumber,1,1,3).setValues([[new Date(),student.email,student.teamId]]);
    writeGithubAccount_(sheet,rowNumber,columns,account);
    SpreadsheetApp.flush();
    cache.remove(key);
    return {ok:true,account,message:'GitHub account connected. Repository access is checked separately.'};
  });
}

/** Separate request keeps a successful save independent of provisioning failures. */
function completeStudentGithubSetup_() {
  const student = authorizeStudentGithub_();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const result = provisionTeamRepos_(student.teamId);
    const issue = result.failed[0] || result.waiting[0];
    return { message: issue ? issue.reason : (result.success[0] ? result.success[0].message : 'Team setup could not be completed. Retry GitHub setup.') };
  } finally { lock.releaseLock(); }
}
