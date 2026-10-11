/**
 * GITHUB PROVISIONING WORKFLOW
 * Repository provisioning, collaborator assignment, sync and repair utilities
 * Uses common-helpers, common-constants
 */

// ===================================================================
// GITHUB API HELPERS
// ===================================================================
function makeGithubRequest_(method, path, payload) {
  // Use admin token for organization operations (repo creation, adding collaborators)
  // Read directly from Script Properties - do NOT fall back to GITHUB_TOKEN
  const adminToken = PropertiesService.getScriptProperties().getProperty('GITHUB_ADMIN_TOKEN');
  if (!adminToken) {
    throw new Error('GITHUB_ADMIN_TOKEN not configured in Script Properties. Required for repo creation and collaborator management.');
  }
  
  const url = `https://api.github.com${path}`;
  const options = {
    method: method,
    headers: {
      Authorization: `token ${adminToken}`,
      Accept: 'application/vnd.github.v3+json'
    },
    muteHttpExceptions: true
  };
  if (payload) { options.payload = JSON.stringify(payload); options.contentType = 'application/json'; }
  
  Logger.log(`GitHub API Request:`);
  Logger.log(`  Method: ${method}`);
  Logger.log(`  URL: ${url}`);
  if (payload) Logger.log('  Payload fields: ' + Object.keys(payload).join(', '));
  
  const response = UrlFetchApp.fetch(url, options);
  const statusCode = response.getResponseCode();
  const responseBody = response.getContentText();
  
  Logger.log(`  Status: ${statusCode}`);
  // Responses may contain base64 blobs; log status only, never file contents.
  
  if (statusCode === 403) {
    Logger.log(`403 FORBIDDEN - Possible causes:`);
    Logger.log(`  - Token is expired or invalid`);
    Logger.log(`  - Token doesn't have 'repo' and 'admin:org_hook' scopes`);
    Logger.log(`  - Organization restrictions (SAML, IP whitelist)`);
    Logger.log(`  - Rate limiting (60 requests/hour for unauthenticated, 5000 for authenticated)`);
  }
  
  // return { status: statusCode, body: JSON.parse(responseBody) };
  let parsedBody = null;

  try {
    parsedBody = responseBody ? JSON.parse(responseBody) : null;
  } catch (err) {
    parsedBody = responseBody;
  }

  return {
    status: statusCode,
    body: parsedBody
  };
}

function getTeamRepoName_(teamId, semester) {
  const year = String(getAcademicYear_() || '').trim();
  if (!/^\d{4}-\d{2}$/.test(year)) throw new Error('Set ACADEMIC_YEAR to YYYY-YY (for example, 2026-27) before provisioning repositories.');
  const term = String(semester || '').trim().replace(/\s+/g, '-').toLowerCase();
  const team = String(teamId || '').trim();
  if (!term || !team) throw new Error('Semester and Team ID are required for repository naming.');
  return `capstone-${year}-${term}-team-${team}`;
}

function createTeamRepo_(repoName, teamId) {
  const ORG_NAME = getConfig_('GITHUB_ORG_NAME');
  const payload = {
    name: repoName,
    description: `Capstone project — Team ${teamId}`,
    private: true,
    auto_init: false
  };
  return makeGithubRequest_('POST', `/orgs/${ORG_NAME}/repos`, payload);
}

/**
 * Adds a GitHub user as a collaborator to a repository.
 *
 * @param {string} repoSlug   Repository in "owner/repository" format.
 * @param {string} username   GitHub username to add.
 * @param {string} permission GitHub repository permission.
 * @return {Object} GitHub API response.
 */
function addCollaborator_(repoSlug, username, permission) {
  if (!repoSlug || !String(repoSlug).trim()) {
    throw new Error('Repository slug is required.');
  }

  if (!username || !String(username).trim()) {
    throw new Error('GitHub username is required.');
  }

  permission = permission || 'push';

  const payload = {
    permission: permission
  };

  return makeGithubRequest_(
    'PUT',
    `/repos/${String(repoSlug).trim()}/collaborators/${encodeURIComponent(String(username).trim())}`,
    payload
  );
}

/**
 * Returns a repository slug (owner/repository) from a GitHub URL.
 *
 * @param {string} repoUrl
 * @return {string|null}
 */
function getGithubRepoSlug_(repoUrl) {
  const parsed = parseGithubRepoUrl_(repoUrl);
  return parsed ? `${parsed.owner}/${parsed.repo}` : null;
}

/**
 * Gets a collaborator's permission for a repository.
 *
 * @param {string} repoSlug Repository in "owner/repository" format.
 * @param {string} username GitHub username.
 * @return {Object} GitHub API response.
 */
function getCollaboratorPermission_(repoSlug, username) {
  return makeGithubRequest_(
    'GET',
    `/repos/${String(repoSlug).trim()}/collaborators/` +
      `${encodeURIComponent(String(username).trim())}/permission`
  );
}

/**
 * Returns all repositories visible to the admin token for the configured
 * organization. Handles GitHub pagination so the function is not limited
 * to the first 100 repositories.
 *
 * @return {Array<Object>}
 */
function getAllGithubOrgRepos_() {
  const orgName = String(getConfig_('GITHUB_ORG_NAME')).trim();
  const repos = [];
  let page = 1;

  while (true) {
    const response = makeGithubRequest_(
      'GET',
      `/orgs/${encodeURIComponent(orgName)}/repos?per_page=100&page=${page}`
    );

    if (response.status !== 200 || !Array.isArray(response.body)) {
      throw new Error(
        `Unable to read repositories for ${orgName}. ` +
        `GitHub returned ${response.status}.`
      );
    }

    repos.push(...response.body);

    if (response.body.length < 100) break;
    page++;
  }

  return repos;
}

// ===================================================================
// BULK PROVISIONING
// ===================================================================
function provisionAllTeamRepos() {
  requireTriggerOrOperator_();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return provisionTeamRepos_(); }
  finally { lock.releaseLock(); }
}

// Callers hold the script lock; an omitted team ID runs the coordinator batch.
function provisionTeamRepos_(onlyTeamId) {
  const TS = getColumnMap_(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const results = { success: [], failed: [], waiting: [] };
  getSheetRows_(SHEET_NAMES.TEAM_STATUS).filter(row => row[TS.TEAM_ID] && (!onlyTeamId || textEquals_(row[TS.TEAM_ID], onlyTeamId))).forEach(row => {
    const teamId = row[TS.TEAM_ID];
    try {
      const setup = repairTeamGithubSetup_(teamId);
      if (!setup.ready) {
        (setup.verificationUnavailable || setup.usernamesComplete ? results.failed : results.waiting).push({ teamId, reason: setup.message });
        return;
      }
      // Only the students' own access is set up here. Guides and the coordinator reach every repository through the faculty group.
      results.success.push({ teamId, repoUrl: setup.repoUrl, students: setup.members.length, message: setup.message });
    } catch (err) { results.failed.push({ teamId, reason: err.message }); }
  });
  Logger.log(JSON.stringify(results));
  return results;
}

// ===================================================================
// BACKFILL EXISTING GITHUB REPOS INTO TeamStatus
// ===================================================================
function backfillExistingRepos() {
  requireTriggerOrOperator_();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return backfillExistingRepos_(); }
  finally { lock.releaseLock(); }
}

function backfillExistingRepos_() {
  const results = { added: [], skipped: [], failed: [] };
  try {
    const TS = getColumnMap_(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
    const rows = getSheetRows_(SHEET_NAMES.TEAM_STATUS).filter(row => row[TS.TEAM_ID]);
    const repoMap = getRepoUrlMap_();
    const repos = getAllGithubOrgRepos_();
    rows.forEach(row => {
      const teamId = row[TS.TEAM_ID];
      if (repoMap[normalizeText_(teamId)]) {
        results.skipped.push({ teamId, reason: 'Already recorded in TeamStatus' });
        return;
      }
      const expectedName = getTeamRepoName_(teamId, row[TS.SEMESTER]);
      const repo = repos.find(repo => textEquals_(repo.name, expectedName));
      if (!repo) {
        results.skipped.push({ teamId, reason: 'No matching GitHub repository' });
        return;
      }
      try {
        updateTeamStatusRepoUrl_(teamId, repo.html_url);
        results.added.push({ teamId, repoUrl: repo.html_url });
      } catch (err) {
        results.failed.push({ teamId, repoUrl: repo.html_url, reason: err.message });
      }
    });
  } catch (err) { results.failed.push({ reason: err.message }); }
  Logger.log(`Existing repository backfill complete — ${results.added.length} added, ${results.skipped.length} skipped, ${results.failed.length} failed.`);
  return results;
}

// ===================================================================
// STUDENT COLLABORATOR BACKFILL
// Adds missing student collaborators to already-provisioned repos
// ===================================================================
function backfillMissingStudentCollaborators() {
  requireTriggerOrOperator_();
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return provisionTeamRepos_(); }
  finally { lock.releaseLock(); }
}

function parseGithubRepoUrl_(repoUrl) {
  const match = String(repoUrl || '')
    .trim()
    .match(/^https?:\/\/github\.com\/([^\/]+)\/([^\/?#]+?)(?:\.git)?\/?(?:[?#].*)?$/i);

  if (!match) return null;

  return {
    owner: match[1],
    repo: match[2]
  };
}
