/** Student GitHub identity. IDs are decimal text, never names or email addresses. */
function githubId_(value) {
  if (typeof value === 'number' && (!Number.isSafeInteger(value) || value <= 0)) return '';
  const text = typeof value === 'string' || typeof value === 'number' ? String(value) : '';
  return /^[1-9][0-9]*$/.test(text) ? text : '';
}

function githubIdentityRequiresSchema_() { return true; }

/** Legacy base headers retain their positions and spelling; normalize only case and outer whitespace. */
function githubBaseHeaderEquals_(actual, expected) {
  return typeof actual === 'string' && actual.trim().toLowerCase() === expected.trim().toLowerCase();
}

function githubAccountColumns_(sheet, required) {
  if (!sheet) throw new Error('Migration required: GithubUsernameRaw is missing.');
  const headers = readSheetRows_(sheet, 1, 1)[0] || [];
  const base = ['Timestamp','Email address','Team ID','GitHub Username'];
  if (base.some((name,i)=>!githubBaseHeaderEquals_(headers[i],name))) throw new Error('GithubUsernameRaw header mismatch. Preserve existing columns.');
  const result = {ID:-1,NAME:-1,URL:-1};
  [['ID','GitHub ID'],['NAME','GitHub Display Name'],['URL','GitHub Profile URL']].forEach(([key,name])=>{
    const indexes = headers.flatMap((header,i)=>String(header).trim().toLowerCase() === name.toLowerCase() ? [i] : []);
    if (indexes.length > 1) throw new Error('Duplicate header: ' + name);
    result[key] = indexes.length ? indexes[0] : -1;
  });
  if (required && Object.values(result).some(i=>i < 0)) throw new Error('Migration required: prepare GitHub identity storage.');
  return result;
}

function githubCaptureReady_() {
  try { githubAccountColumns_(getSheet(SHEET_NAMES.GITHUB_USERNAME_RAW), true); return true; }
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
  if (!id) throw new Error('Migration required: a valid GitHub ID is missing.');
  cache = cache || new Map();
  if (!cache.has(id)) {
    try { cache.set(id, githubAccountResponse_((request || makeGithubRequest)('GET','/user/' + id), id)); }
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
  sheet.getRange(rowNumber, 4).setValue(githubLiteral_(account.username));
  sheet.getRange(rowNumber, columns.NAME + 1).setValue(githubLiteral_(account.displayName));
  sheet.getRange(rowNumber, columns.URL + 1).setValue(account.profileUrl);
}

/** Refresh metadata only after a successful ID lookup. No timestamp/ID replacement. */
function refreshGithubAccountMetadata_(submission, account) {
  if (!submission || !account.githubId) return;
  githubIdentityLock_(()=>{
    const sheet = getSheet(SHEET_NAMES.GITHUB_USERNAME_RAW), columns = githubAccountColumns_(sheet, true);
    readSheetRows_(sheet,2).forEach((row,index)=>{
      if (emailsMatch(row[1],submission[1]) && textEquals_(row[2],submission[2]) && githubId_(row[columns.ID]) === account.githubId) {
        if (row[3] !== account.username) sheet.getRange(index+2,4).setValue(githubLiteral_(account.username));
        if (row[columns.NAME] !== account.displayName) sheet.getRange(index+2,columns.NAME+1).setValue(githubLiteral_(account.displayName));
        if (row[columns.URL] !== account.profileUrl) sheet.getRange(index+2,columns.URL+1).setValue(account.profileUrl);
      }
    });
  });
}

/** Academic identity is still roster-owned. All registrations participate in conflict checks. */
function githubStudentIdentity_(student, rows, columns, students) {
  students = students || weeklyStudents_();
  const academic = students.filter(s=>emailsMatch(s.email,student.email) && textEquals_(s.teamId,student.teamId));
  if (academic.length !== 1) return {state:'unavailable',reason:'Student membership is ambiguous.'};
  const mine = rows.filter(r=>emailsMatch(r[1],student.email) && textEquals_(r[2],student.teamId));
  const ids = [...new Set(mine.map(r=>githubId_(r[columns.ID])).filter(Boolean))];
  if (ids.length !== 1 || mine.some(r=>r[columns.ID] !== '' && r[columns.ID] != null && !githubId_(r[columns.ID]))) return {state:'unavailable',reason:'Migration required: GitHub identity is missing or conflicting.'};
  const id = ids[0];
  const conflict = rows.some(r=>{
    if (githubId_(r[columns.ID]) !== id) return false;
    const owners = students.filter(s=>emailsMatch(s.email,r[1]) && textEquals_(s.teamId,r[2]));
    return owners.length !== 1 || !textEquals_(owners[0].regNo,academic[0].regNo);
  });
  if (conflict) return {state:'unavailable',reason:'GitHub ID is assigned to conflicting students. Contact the coordinator.'};
  return {state:'available',githubId:id,regNo:academic[0].regNo};
}

function githubAuthorMatches_(studentId, authorId) {
  const id = githubId_(studentId);
  return !!id && id === githubId_(authorId);
}

function githubCommitAttribution_(studentId, commit) {
  if (!githubId_(studentId)) return 'unavailable';
  if (commit.authorResolution === 'unavailable') return 'unavailable';
  if (!githubId_(commit.authorId)) return commit.authorResolution === 'unlinked' ? 'unlinked' : 'unavailable';
  return githubAuthorMatches_(studentId,commit.authorId) ? 'attributed' : 'other';
}
