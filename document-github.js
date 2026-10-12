/**
 * DOCUMENT GITHUB - the live reads a submission needs (TEMPLATE-DOCUMENT-SUBMISSION-PLAN.md, sections 5 and 6). Nothing here writes. It
 * reuses the team-file scan's helpers (team-files.js), so "changed by the team" means the same thing on the screen and at Submit.
 * Anything GitHub cannot answer is UNAVAILABLE ("Could not verify"): the answer is never guessed.
 */

function documentUnverified_(document) {
  return apiFail_('UNAVAILABLE', 'Could not verify: ' + document.fileName + '. Try again later.');
}

/**
 * The live facts of one document in one team repository: {slug, branch, present, blobSha, teamChanged, latestCommit, latestAuthor,
 * latestDate, lastTeamCommit, teamAuthor}. Throws REJECTED when the team has no repository, UNAVAILABLE when GitHub cannot be read.
 */
function documentLiveFile_(team, document) {
  const slug = getGithubRepoSlug_(getRepoUrlMap_()[documentTeamKey_(team.teamId)] || '');
  if (!slug) throw apiFail_('REJECTED', 'This team does not have a repository yet.');
  let tree;
  try { tree = teamRepositoryTree_(slug); }
  catch (error) { console.error('Document check: ' + team.teamId + ': ' + (error && error.message || error)); throw documentUnverified_(document); }
  const none = {login: '', id: ''};
  const base = {slug, branch: tree.branch, path: document.path, latestAuthor: none, teamAuthor: none, latestCommit: '', lastTeamCommit: '', latestDate: ''};
  const blobSha = tree.blobs.get(document.path);
  if (!blobSha) return Object.assign(base, {present: false, blobSha: '', teamChanged: 'No'});
  const linked = teamLinkedGithubIds_().get(documentTeamKey_(team.teamId)) || new Set();
  if (blobSha === teamFileBaselines_().get(document.path) || !linked.size) return Object.assign(base, {present: true, blobSha, teamChanged: 'No'});
  const history = teamFileHistory_(slug, tree.branch, document.path, linked);
  return Object.assign(base, history, {present: true, blobSha});
}

/** The bytes of the file at one commit, as Apps Script's signed byte array. UNAVAILABLE on any GitHub failure; INVALID_INPUT when too large. */
function documentFileBytes_(live, document) {
  const meta = makeGithubRequest_('GET', '/repos/' + live.slug + '/contents/' + document.path.split('/').map(encodeURIComponent).join('/') + '?ref=' + encodeURIComponent(live.latestCommit));
  if (meta.status !== 200 || !meta.body || !meta.body.sha) throw documentUnverified_(document);
  if (Number(meta.body.size) > DOCUMENT_MAX_BYTES_) throw apiFail_('INVALID_INPUT', 'The file is larger than ' + Math.round(DOCUMENT_MAX_BYTES_ / 1048576) + ' MB.');
  const blob = makeGithubRequest_('GET', '/repos/' + live.slug + '/git/blobs/' + encodeURIComponent(meta.body.sha));
  if (blob.status !== 200 || !blob.body || typeof blob.body.content !== 'string') throw documentUnverified_(document);
  return {blobSha: String(meta.body.sha), bytes: Utilities.base64Decode(blob.body.content.replace(/\s+/g, ''))};
}

/** One GitHub call: the newest commit that touched the path, for the check under the lock. */
function documentLatestCommit_(live, document) {
  const response = makeGithubRequest_('GET', '/repos/' + live.slug + '/commits?sha=' + encodeURIComponent(live.branch) + '&path=' + encodeURIComponent(document.path) + '&per_page=1');
  if (response.status !== 200 || !Array.isArray(response.body)) throw documentUnverified_(document);
  return response.body.length ? String(response.body[0].sha) : '';
}

/** GitHub numeric ID -> {name, email} for the students of a team who linked an account. */
function documentTeamPeople_(teamId, row, TS) {
  const students = [1, 2, 3, 4].map(n => ({name: String(row[TS['S' + n + '_NAME']] || '').trim(), email: normalizeEmail_(row[TS['S' + n + '_EMAIL']])})).filter(student => student.email);
  const sheet = getSheet_(SHEET_NAMES.GITHUB_ACCOUNTS), columns = githubAccountColumns_(sheet), people = new Map();
  readSheetRows_(sheet, 2).forEach(account => {
    if (!textEquals_(account[columns.TEAM_ID], teamId)) return;
    const id = githubId_(account[columns.ID]), student = students.find(candidate => candidate.email === normalizeEmail_(account[columns.EMAIL]));
    if (id && student) people.set(id, student);
  });
  return people;
}

/** "Committed by" for a person-facing line: the student's name when the author is a linked student of the team, otherwise an outside member. */
function documentAuthorLine_(author, people) {
  const student = author && author.id ? people.get(String(author.id)) : null;
  return {name: student ? student.name || student.email : null, login: author && author.login ? String(author.login) : '', outsideMember: !student};
}
