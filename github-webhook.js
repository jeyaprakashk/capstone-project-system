/** Authenticated relay only. GET/dashboard routing and commit collection are unchanged. */
function doPost(e) {
  let deliveryId = '';
  let result;
  try {
    if (!e || e.pathInfo !== 'github-push') githubWebhookFail_('UNKNOWN_ROUTE');
    const secret = PropertiesService.getScriptProperties().getProperty('APPS_SCRIPT_RELAY_SECRET');
    if (!secret) githubWebhookFail_('RELAY_NOT_CONFIGURED');
    let envelope;
    try { envelope = JSON.parse(e.postData.contents); } catch (_) { githubWebhookFail_('INVALID_ENVELOPE'); }
    if (!envelope || typeof envelope.message !== 'string' || !/^[a-f0-9]{64}$/.test(envelope.signature || '')) {
      githubWebhookFail_('INVALID_ENVELOPE');
    }
    const expected = Utilities.computeHmacSha256Signature(envelope.message, secret, Utilities.Charset.UTF_8)
      .map(byte => ((byte + 256) % 256).toString(16).padStart(2, '0')).join('');
    let difference = 0;
    for (let i = 0; i < expected.length; i++) difference |= expected.charCodeAt(i) ^ envelope.signature.charCodeAt(i);
    if (difference !== 0) githubWebhookFail_('UNAUTHORIZED');
    let message;
    try { message = JSON.parse(envelope.message); } catch (_) { githubWebhookFail_('INVALID_ENVELOPE'); }
    if (!message || message.version !== 1 || message.event !== 'push' ||
        typeof message.deliveryId !== 'string' || !/^[a-z0-9-]{1,128}$/i.test(message.deliveryId) ||
        typeof message.payload !== 'string' || !Number.isSafeInteger(message.sentAt)) githubWebhookFail_('INVALID_ENVELOPE');
    const age = Date.now() - message.sentAt;
    if (age > 300000 || age < -60000) githubWebhookFail_('EXPIRED_ENVELOPE');
    deliveryId = message.deliveryId;
    let payload;
    try { payload = JSON.parse(message.payload); } catch (_) { githubWebhookFail_('INVALID_PUSH'); }
    result = ingestGithubPush_(payload);
  } catch (error) {
    const code = error.githubWebhookCode || 'INGESTION_FAILED';
    Logger.log(JSON.stringify({event: 'github_webhook_failure', deliveryId, code}));
    result = {ok: false, status: 'error', code};
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(ContentService.MimeType.JSON);
}

function githubWebhookFail_(code) {
  const error = new Error(code);
  error.githubWebhookCode = code;
  throw error;
}

/** Read rows, not getRepoUrlMap(): its team-key overwrite would hide ambiguity. */
function githubWebhookRegistration_(owner, repo) {
  const sheet = getSheet(SHEET_NAMES.TEAM_STATUS);
  if (!sheet) githubWebhookFail_('REGISTRY_UNAVAILABLE');
  const headers = readSheetRows_(sheet, 1, 1)[0] || [];
  const index = name => {
    const matches = headers.flatMap((value, i) => normalizeText_(value) === name ? [i] : []);
    if (matches.length !== 1) githubWebhookFail_('INVALID_REGISTRY');
    return matches[0];
  };
  const teamColumn = index('team id'), repoColumn = index('repo url');
  const rows = readSheetRows_(sheet, 2);
  const matches = rows.filter(row => {
    const registered = parseGithubRepoUrl_(row[repoColumn]);
    return registered && registered.owner.toLowerCase() === owner && registered.repo.toLowerCase() === repo;
  });
  if (!matches.length) return null;
  const teamId = String(matches[0][teamColumn] || '').trim();
  if (matches.length !== 1 || !teamId || rows.filter(row => normalizeText_(row[teamColumn]) === normalizeText_(teamId)).length !== 1) {
    githubWebhookFail_('AMBIGUOUS_REGISTRATION');
  }
  return {teamId, repoUrl: String(matches[0][repoColumn]).trim()};
}

function ingestGithubPush_(payload) {
  const repository = payload && payload.repository;
  if (!repository || typeof repository.full_name !== 'string' ||
      !/^[a-z0-9-]+\/[a-z0-9_.-]+$/i.test(repository.full_name)) githubWebhookFail_('INVALID_PUSH');
  const [owner, repo] = repository.full_name.toLowerCase().split('/');
  if (!repository.owner || typeof repository.owner.login !== 'string' ||
      repository.owner.login.toLowerCase() !== owner || typeof repository.name !== 'string' ||
      repository.name.toLowerCase() !== repo) githubWebhookFail_('INVALID_PUSH');
  if (owner !== 'ece-kalasalingam') return {ok: true, status: 'ignored'};
  const registration = githubWebhookRegistration_(owner, repo);
  if (!registration) return {ok: true, status: 'ignored'};
  if (typeof payload.deleted !== 'boolean' || typeof payload.ref !== 'string' ||
      !/^refs\/(heads|tags)\/.+/.test(payload.ref) || !Array.isArray(payload.commits)) githubWebhookFail_('INVALID_PUSH');
  const shas = [...new Set(payload.commits.map(commit => {
    const sha = commit && commitIdentity_(commit.id);
    if (!sha || typeof commit.message !== 'string') githubWebhookFail_('INVALID_PUSH');
    return sha;
  }))];
  if (payload.deleted || !shas.length) return {ok: true, status: 'noop', count: 0};
  const sheet = getSheet(SHEET_NAMES.COMMITS), columns = commitColumns_(sheet);
  // Optimization only: the unchanged appender re-reads SHAs under its script lock.
  const existing = new Set(readSheetRows_(sheet, 2).map(row => commitIdentity_(row[columns.SHA])).filter(Boolean));
  const pending = shas.filter(sha => !existing.has(sha));
  // Push authors have no numeric GitHub ID. Resolve every unseen SHA via the
  // existing API helper; never substitute sender/pusher IDs or infer unlinked users.
  const commits = pending.map(sha => {
    const response = makeGithubRequest('GET', '/repos/' + encodeURIComponent(owner) + '/' + encodeURIComponent(repo) + '/commits/' + sha);
    if (response.status !== 200) githubWebhookFail_('COMMIT_HYDRATION_FAILED');
    const commit = response.body;
    if (!commit || commitIdentity_(commit.sha) !== sha ||
        !Object.prototype.hasOwnProperty.call(commit, 'author') ||
        (commit.author !== null && (!githubId_(commit.author.id) || typeof commit.author.login !== 'string' || !commit.author.login))) {
      githubWebhookFail_('INVALID_COMMIT_RESPONSE');
    }
    return commit;
  });
  const appended = appendCollectedCommits_(sheet, registration.teamId, commits, registration.repoUrl);
  return {ok: true, status: 'processed', count: appended.count, fetched: shas.length, skipped: shas.length - appended.count};
}
