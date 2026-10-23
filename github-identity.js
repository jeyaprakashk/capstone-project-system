/** Student GitHub identity. IDs are decimal text, never names or email addresses. */
function githubId_(value) {
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || value <= 0)) return '';
  const text = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  return /^[1-9][0-9]*$/.test(text) ? text : '';
}

/** The account a dashboard shows for a team member: {username, displayName, profileUrl, avatarUrl}, or null when no account is stored. The avatar is GitHub's own address for the stored account ID; none is stored in the sheet. */
function githubAccountDto_(member) {
  const id = member && githubId_(member.githubId);
  return id && member.username ? {username:String(member.username), displayName:String(member.displayName || ''), profileUrl:String(member.profileUrl || ''), avatarUrl:'https://avatars.githubusercontent.com/u/' + id} : null;
}

/** Headers are compared by case and outer whitespace only; the spelling stays as the sheet has it. */
function githubBaseHeaderEquals_(actual, expected) {
  return typeof actual === 'string' && actual.trim().toLowerCase() === expected.trim().toLowerCase();
}

/**
 * Every column of GitHubAccounts found by header name: TIMESTAMP, EMAIL, TEAM_ID, USERNAME, ID, NAME and URL. Column order does not
 * matter and extra columns are ignored. A missing or repeated required header throws, and nothing is repaired.
 */
function githubAccountColumns_(sheet) {
  if (!sheet) throw new Error('GitHub setup unavailable: GitHubAccounts is missing.');
  const headers = readSheetRows_(sheet, 1, 1)[0] || [];
  const result = {};
  [['TIMESTAMP','Timestamp'],['EMAIL','Email address'],['TEAM_ID','Team ID'],['USERNAME','GitHub Username'],
    ['ID','GitHub ID'],['NAME','GitHub Display Name'],['URL','GitHub Profile URL']].forEach(([key,name])=>{
    const indexes = headers.flatMap((header,i)=>githubBaseHeaderEquals_(typeof header === 'string' ? header : String(header == null ? '' : header),name) ? [i] : []);
    if (indexes.length > 1) throw new Error('Duplicate header: ' + name);
    result[key] = indexes.length ? indexes[0] : -1;
  });
  if (['TIMESTAMP','EMAIL','TEAM_ID','USERNAME'].some(key=>result[key] < 0)) throw new Error('GitHubAccounts header mismatch. Preserve existing columns.');
  if (['ID','NAME','URL'].some(key=>result[key] < 0)) throw new Error('GitHub setup unavailable: required account columns are missing.');
  return result;
}

function githubCaptureReady_() {
  try { githubAccountColumns_(getSheet_(SHEET_NAMES.GITHUB_ACCOUNTS)); return true; }
  catch (error) { return false; }
}

function githubProfileUsername_(value) {
  const match = String(value || '').trim().match(/^https:\/\/github\.com\/([a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38})\/?$/i);
  const reserved = ['settings','issues','pulls','notifications','explore','marketplace','topics','collections','events','sponsors','login','logout','join','signup','organizations','orgs','users','user','apps','codespaces','search','new','features','about','pricing','security','contact','site','account','sessions'];
  if (!match || reserved.includes(match[1].toLowerCase())) throw new Error('Paste your GitHub profile link, for example https://github.com/student123. Repository and settings links are not profiles.');
  return match[1];
}

function githubAccountResponse_(response, expectedId) {
  if (response.status === 404) throw new Error('GitHub account was not found or is inaccessible.');
  const body = response.body;
  if (response.status !== 200 || !body) throw new Error('GitHub account verification is unavailable. Please try again shortly.');
  if (body.type !== 'User') throw new Error('Choose a personal GitHub account, not an organization or bot.');
  const id = githubId_(body.id);
  if (!id || !/^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i.test(body.login || '') ||
      !/^https:\/\/github\.com\/[a-z\d-]+\/?$/i.test(body.html_url || '')) throw new Error('GitHub returned invalid account data.');
  if (expectedId && expectedId !== id) throw new Error('GitHub account ID conflict. Contact the coordinator.');
  return {valid:true,githubId:id,username:body.login,displayName:body.name == null ? '' : String(body.name),profileUrl:body.html_url,
    avatarUrl:/^https:\/\/avatars\.githubusercontent\.com\//.test(body.avatar_url || '') ? body.avatar_url : ''};
}

function resolveGithubAccountId_(id, request, cache) {
  id = githubId_(id);
  if (!id) throw new Error('GitHub setup unavailable: a valid GitHub ID is missing.');
  cache = cache || new Map();
  if (!cache.has(id)) {
    try { cache.set(id, githubAccountResponse_((request || makeGithubRequest_)('GET','/user/' + id), id)); }
    catch (error) { cache.set(id, error); }
  }
  const result = cache.get(id);
  if (result instanceof Error) throw result;
  return result;
}

function githubResolveSubmission_(submission, columns, request, cache) {
  return resolveGithubAccountId_(submission && submission[columns.ID], request, cache);
}

function githubIdentityLock_(run) {
  const lock = LockService.getScriptLock(), owned = lock.hasLock();
  if (!owned) lock.waitLock(30000);
  try { return run(); } finally { if (!owned) lock.releaseLock(); }
}

function githubLiteral_(value) { return /^[=+@-]/.test(String(value)) ? "'" + value : value; }

function writeGithubAccount_(sheet, rowNumber, columns, account) {
  sheet.getRange(rowNumber, columns.ID + 1).setNumberFormat('@').setValue(account.githubId);
  sheet.getRange(rowNumber, columns.USERNAME + 1).setValue(githubLiteral_(account.username));
  sheet.getRange(rowNumber, columns.NAME + 1).setValue(githubLiteral_(account.displayName));
  sheet.getRange(rowNumber, columns.URL + 1).setValue(account.profileUrl);
}

/** Refresh metadata only after a successful ID lookup. No timestamp/ID replacement. */
function refreshGithubAccountMetadata_(submission, account) {
  if (!submission || !account.githubId) return;
  githubIdentityLock_(()=>{
    const sheet = getSheet_(SHEET_NAMES.GITHUB_ACCOUNTS), columns = githubAccountColumns_(sheet);
    readSheetRows_(sheet,2).forEach((row,index)=>{
      if (emailsMatch_(row[columns.EMAIL],submission[columns.EMAIL]) && textEquals_(row[columns.TEAM_ID],submission[columns.TEAM_ID]) && githubId_(row[columns.ID]) === account.githubId) {
        if (row[columns.USERNAME] !== account.username) sheet.getRange(index+2,columns.USERNAME+1).setValue(githubLiteral_(account.username));
        if (row[columns.NAME] !== account.displayName) sheet.getRange(index+2,columns.NAME+1).setValue(githubLiteral_(account.displayName));
        if (row[columns.URL] !== account.profileUrl) sheet.getRange(index+2,columns.URL+1).setValue(account.profileUrl);
      }
    });
  });
}

/** Academic identity is still roster-owned. All registrations participate in conflict checks. */
function githubStudentIdentity_(student, rows, columns, students) {
  students = students || weeklyStudents_();
  const academic = students.filter(s=>emailsMatch_(s.email,student.email) && textEquals_(s.teamId,student.teamId));
  if (academic.length !== 1) return {state:'unavailable',reason:'Student membership is ambiguous.'};
  const mine = rows.filter(r=>emailsMatch_(r[columns.EMAIL],student.email) && textEquals_(r[columns.TEAM_ID],student.teamId));
  const ids = [...new Set(mine.map(r=>githubId_(r[columns.ID])).filter(Boolean))];
  if (ids.length !== 1 || mine.some(r=>r[columns.ID] !== '' && r[columns.ID] != null && !githubId_(r[columns.ID]))) return {state:'unavailable',reason:'GitHub setup unavailable: GitHub identity is missing or conflicting.'};
  const id = ids[0];
  const conflict = rows.some(r=>{
    if (githubId_(r[columns.ID]) !== id) return false;
    const owners = students.filter(s=>emailsMatch_(s.email,r[columns.EMAIL]) && textEquals_(s.teamId,r[columns.TEAM_ID]));
    return owners.length !== 1 || !textEquals_(owners[0].regNo,academic[0].regNo);
  });
  if (conflict) return {state:'unavailable',reason:'GitHub ID is assigned to conflicting students. Contact the coordinator.'};
  return {state:'available',githubId:id,regNo:academic[0].regNo};
}

function githubAuthorMatches_(studentId, authorId) {
  const id = githubId_(studentId);
  return !!id && id === githubId_(authorId);
}

