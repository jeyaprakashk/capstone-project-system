/** Inline GitHub registration. Sheet columns: timestamp, email, team, username. */
function validateStudentGithubUsername_(value) {
  const username = String(value || '').trim();
  if (!/^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i.test(username)) {
    return { valid: false, message: 'Enter a GitHub username, not a profile URL. Use letters, numbers, and single hyphens.' };
  }
  const response = makeGithubRequest('GET', '/users/' + encodeURIComponent(username));
  if (response.status === 404) return { valid: false, message: 'That GitHub username was not found. Check it and try again.' };
  if (response.status !== 200 || !response.body || !response.body.login) {
    throw new Error('GitHub could not verify usernames right now. Please try again shortly.');
  }
  if (response.body.type !== 'User') return { valid: false, message: 'Enter your personal GitHub username, not an organization or bot account.' };
  return { valid: true, username: response.body.login };
}

function getStudentGithubState_(email, teamId, roster, repoUrl) {
  const setup = getTeamGithubSetup_(teamId, { repoUrl });
  const mine = setup.members.find(member => emailsMatch(member.email, email));
  const githubNeedsUsername = !!mine && ['missing', 'invalid'].includes(mine.status);
  return { githubSetup: setup, githubReady: setup.ready,
    githubCanRetry: !setup.ready && (setup.usernamesComplete || setup.verificationUnavailable),
    githubUsername: mine ? mine.username : '', githubNeedsUsername,
    githubState: setup.ready ? 'done' : githubNeedsUsername ? 'active' : 'waiting',
    githubText: githubNeedsUsername ? (mine.status === 'invalid' ? 'Your saved GitHub username is invalid. Enter a valid personal GitHub username. ' : 'Enter your GitHub username. ') + setup.message : setup.message };
}

function authorizeStudentGithub_() {
  const email = Session.getActiveUser().getEmail();
  if (!email) throw new Error('Please sign in with your institutional Google account.');
  const columns = getColumnMap(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const row = getSheetRows(SHEET_NAMES.TEAM_STATUS).find(row => row[columns.TEAM_ID] &&
    [columns.S1_EMAIL, columns.S2_EMAIL, columns.S3_EMAIL, columns.S4_EMAIL].some(index => emailsMatch(row[index], email)));
  if (!row) throw new Error('Student team was not found for your account.');
  return { email, teamId: row[columns.TEAM_ID], row };
}

function submitStudentGithubUsername(username) {
  // Never accept a student email or team ID from the browser.
  const student = authorizeStudentGithub_();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const sheet = getSheet(SHEET_NAMES.GITHUB_USERNAME_RAW);
    if (!sheet) throw new Error('GitHub username storage is unavailable. Please contact your coordinator.');
    const rows = sheet.getLastRow() > 1 ? sheet.getRange(2, 1, sheet.getLastRow() - 1, 4).getValues() : [];
    let matchingRow = -1;
    rows.forEach((row, index) => {
      if (emailsMatch(row[1], student.email) && textEquals_(row[2], student.teamId)) matchingRow = index + 2;
    });
    // Check under the same lock as the write, including requests from stale tabs.
    if (matchingRow >= 2 && validateStudentGithubUsername_(rows[matchingRow - 2][3]).valid) {
      return { ok: false, alreadySubmitted: true, message: 'You have already submitted a valid GitHub username. Resubmission is not allowed.' };
    }
    const validation = validateStudentGithubUsername_(username);
    if (!validation.valid) return { ok: false, message: validation.message };
    if (!sheet.getLastRow()) sheet.appendRow(['Timestamp', 'Email address', 'Team ID', 'GitHub Username']);
    const values = [new Date(), student.email, student.teamId, validation.username];
    if (matchingRow >= 2) sheet.getRange(matchingRow, 1, 1, 4).setValues([values]);
    else sheet.appendRow(values);
    SpreadsheetApp.flush();
  } finally { lock.releaseLock(); }
  return { ok: true, message: 'GitHub username verified and saved.' };
}

/** Separate request keeps a successful save independent of provisioning failures. */
function completeStudentGithubSetup() {
  const student = authorizeStudentGithub_();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const result = provisionTeamRepos_(student.teamId);
    const issue = result.failed[0] || result.waiting[0];
    return { message: issue ? issue.reason : (result.success[0] ? result.success[0].message : 'Team setup could not be completed. Retry GitHub setup.') };
  } finally { lock.releaseLock(); }
}
