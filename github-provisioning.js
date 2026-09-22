/**
 * GITHUB PROVISIONING WORKFLOW
 * Repository provisioning, collaborator assignment, sync and repair utilities
 * Uses common-helpers, common-constants
 */

// ===================================================================
// GITHUB API HELPERS
// ===================================================================
function makeGithubRequest(method, path, payload) {
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
  if (payload) options.payload = JSON.stringify(payload);
  
  Logger.log(`📡 GitHub API Request:`);
  Logger.log(`  Method: ${method}`);
  Logger.log(`  URL: ${url}`);
  if (payload) Logger.log(`  Payload: ${JSON.stringify(payload)}`);
  
  const response = UrlFetchApp.fetch(url, options);
  const statusCode = response.getResponseCode();
  const responseBody = response.getContentText();
  
  Logger.log(`  Status: ${statusCode}`);
  Logger.log(`  Response: ${responseBody.substring(0, 200)}`);
  
  if (statusCode === 403) {
    Logger.log(`⚠️ 403 FORBIDDEN - Possible causes:`);
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

function createTeamRepo(repoName, teamId) {
  const ORG_NAME = getConfig('GITHUB_ORG_NAME');
  const payload = {
    name: repoName,
    description: `Capstone project — Team ${teamId}`,
    private: true,
    auto_init: false
  };
  return makeGithubRequest('POST', `/orgs/${ORG_NAME}/repos`, payload);
}

function setReadmeHeading(repoSlug, repoName, teamId, title) {
  const readme = `# Team ${teamId}: ${title}\n\nCapstone Project\n`;
  const content = Utilities.base64Encode(readme);

  const payload = {
    message: `Initial commit: Capstone project for Team ${teamId}`,
    content: content,
    committer: {
      name: 'System',
      email: 'system@capstone.local'
    }
  };

  try {
    const result = makeGithubRequest(
      'PUT',
      `/repos/${repoSlug}/contents/README.md`,
      payload
    );

    Logger.log(
      `✓ README.md created for ${repoName}: ${result.status}`
    );

    return result;

  } catch (err) {
    Logger.log(
      `❌ ERROR creating README for ${repoName}: ${err.message}`
    );
    throw err;
  }
}

/**
 * Adds a GitHub user as a collaborator to a repository.
 *
 * @param {string} repoSlug   Repository in "owner/repository" format.
 * @param {string} username   GitHub username to add.
 * @param {string} permission GitHub repository permission.
 * @return {Object} GitHub API response.
 */
function addCollaborator(repoSlug, username, permission) {
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

  return makeGithubRequest(
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
  return makeGithubRequest(
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
  const orgName = String(getConfig('GITHUB_ORG_NAME')).trim();
  const repos = [];
  let page = 1;

  while (true) {
    const response = makeGithubRequest(
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
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return provisionTeamRepos_(); }
  finally { lock.releaseLock(); }
}

// Callers hold the script lock; an omitted team ID runs the coordinator batch.
function provisionTeamRepos_(onlyTeamId) {
  const TS = getColumnMap(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const TR = getColumnMap(SHEET_NAMES.TEAM_ROSTER, FIELD_DEFINITIONS.TEAM_ROSTER);
  const roster = getSheetRows(SHEET_NAMES.TEAM_ROSTER);
  const results = { success: [], failed: [], waiting: [] };
  getSheetRows(SHEET_NAMES.TEAM_STATUS).filter(row => row[TS.TEAM_ID] && (!onlyTeamId || textEquals_(row[TS.TEAM_ID], onlyTeamId))).forEach(row => {
    const teamId = row[TS.TEAM_ID];
    try {
      const setup = repairTeamGithubSetup_(teamId);
      if (!setup.ready) {
        (setup.verificationUnavailable || setup.usernamesComplete ? results.failed : results.waiting).push({ teamId, reason: setup.message });
        return;
      }
      // Preserve the existing guide/coordinator provisioning behavior without changing student membership.
      const team = roster.find(item => textEquals_(item[TR.TEAM_ID], teamId));
      const guide = String(team && team[TR.GUIDE_GITHUB_USERNAME] || '').trim();
      const coordinator = String(getConfig('COLLABORATOR_GITHUB_USERNAME') || '').trim();
      const slug = getGithubRepoSlug_(setup.repoUrl);
      const staff = [[guide, getConfig('GUIDE_REPO_PERMISSION')], [coordinator, getConfig('COLLABORATOR_REPO_PERMISSION') || 'maintain']];
      if (staff.some(item => item[0])) {
        const invitations = getGithubInvitations_(slug);
        staff.filter(item => item[0]).forEach(([username, permission]) => ensureGithubPermission_(slug, username, permission, invitations));
      }
      results.success.push({ teamId, repoUrl: setup.repoUrl, students: setup.members.length, message: setup.message });
    } catch (err) { results.failed.push({ teamId, reason: err.message }); }
  });
  Logger.log(JSON.stringify(results));
  return results;
}

function addMissingGuideCollaborators() {
  const TR = getColumnMap(
    SHEET_NAMES.TEAM_ROSTER,
    FIELD_DEFINITIONS.TEAM_ROSTER
  );

  const rosterRows = getSheetRows(SHEET_NAMES.TEAM_ROSTER);
  const repoMap = getRepoUrlMap();

  // Configuration values are constant for this entire run.
  const guideRepoPermission = String(
    getConfig('GUIDE_REPO_PERMISSION')
  ).trim();

  const coordinatorUsername = String(
    getConfig('COLLABORATOR_GITHUB_USERNAME') || ''
  ).trim();

  const coordinatorRepoPermission = String(
    getConfig('COLLABORATOR_REPO_PERMISSION') || 'maintain'
  ).trim();

  const results = {
    updated: [],
    skipped: [],
    failed: []
  };

  rosterRows.forEach(row => {
    const teamId = row[TR.TEAM_ID];

    const guideUsername = String(
      row[TR.GUIDE_GITHUB_USERNAME] || ''
    ).trim();

    const repoUrl = repoMap[normalizeText_(teamId)];

    // ---------------------------------------------------------------
    // Validate required data
    // ---------------------------------------------------------------
    if (!guideUsername) {
      results.skipped.push({
        teamId,
        reason: 'No guide GitHub username'
      });
      return;
    }

    if (!repoUrl) {
      results.skipped.push({
        teamId,
        reason: 'No provisioned repository'
      });
      return;
    }

    // ---------------------------------------------------------------
    // Extract owner/repository from GitHub URL
    // ---------------------------------------------------------------
    const repoSlug = getGithubRepoSlug_(repoUrl);

    if (!repoSlug) {
      results.failed.push({
        teamId,
        reason: `Invalid GitHub repository URL: ${repoUrl}`
      });
      return;
    }


    try {
      // -------------------------------------------------------------
      // Add/update guide access
      // -------------------------------------------------------------
      addCollaborator(
        repoSlug,
        guideUsername,
        guideRepoPermission
      );

      // -------------------------------------------------------------
      // Ensure coordinator also has access
      // -------------------------------------------------------------
      if (coordinatorUsername) {
        addCollaborator(
          repoSlug,
          coordinatorUsername,
          coordinatorRepoPermission
        );
      }

      results.updated.push({
        teamId,
        guideUsername,
        repoSlug
      });

    } catch (err) {
      results.failed.push({
        teamId,
        reason: err.message
      });

      Logger.log(
        `❌ Error updating collaborators for Team ${teamId}: ` +
        `${err.message}`
      );
    }
  });

  // -----------------------------------------------------------------
  // Summary
  // -----------------------------------------------------------------
  Logger.log(
    `Guide collaborator update complete — ` +
    `${results.updated.length} updated, ` +
    `${results.skipped.length} skipped, ` +
    `${results.failed.length} failed.`
  );

  return results;
}


// ===================================================================
// BACKFILL README TO EXISTING EMPTY REPOS
// ===================================================================
function backfillReadmeToAllRepos() {
  const orgName = String(getConfig('GITHUB_ORG_NAME')).trim();
  const TS = getColumnMap(
    SHEET_NAMES.TEAM_STATUS,
    FIELD_DEFINITIONS.TEAM_STATUS
  );
  const statusRows = getSheetRows(SHEET_NAMES.TEAM_STATUS);

  const results = {
    success: [],
    failed: [],
    skipped: []
  };

  try {
    const repos = getAllGithubOrgRepos_();
    const teamRepos = repos.filter(repo =>
      normalizeText_(repo.name).includes('capstone') && normalizeText_(repo.name).includes('team')
    );

    Logger.log(`Found ${teamRepos.length} capstone team repos`);

    teamRepos.forEach(repo => {
      try {
        const match = repo.name.match(/team-([A-Z0-9]+)/i);
        const teamId = match ? match[1] : repo.name;

        const teamStatus = statusRows.find(row =>
          textEquals_(row[TS.TEAM_ID], teamId)
        );

        const title = teamStatus
          ? teamStatus[TS.TITLE]
          : teamId;

        const repoSlug = `${orgName}/${repo.name}`;

        const check = makeGithubRequest(
          'GET',
          `/repos/${repoSlug}/contents/README.md`
        );

        if (check.status === 200) {
          results.skipped.push({
            teamId,
            repo: repo.name,
            reason: 'README already exists'
          });
          return;
        }

        if (check.status !== 404) {
          results.failed.push({
            teamId,
            repo: repo.name,
            reason: `README check returned ${check.status}`
          });
          return;
        }

        const create = setReadmeHeading(
          repoSlug,
          repo.name,
          teamId,
          title
        );

        if (create.status === 201) {
          results.success.push({
            teamId,
            repo: repo.name
          });
        } else {
          results.failed.push({
            teamId,
            repo: repo.name,
            reason: `README creation returned ${create.status}`
          });
        }

      } catch (err) {
        results.failed.push({
          repo: repo.name,
          reason: err.message
        });
      }
    });

  } catch (err) {
    results.failed.push({
      reason: err.message
    });
  }

  Logger.log(
    `README backfill complete — ` +
    `${results.success.length} created, ` +
    `${results.skipped.length} skipped, ` +
    `${results.failed.length} failed.`
  );

  return results;
}

// ===================================================================
// BACKFILL EXISTING GITHUB REPOS INTO TeamStatus
// ===================================================================
function backfillExistingRepos() {
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return backfillExistingRepos_(); }
  finally { lock.releaseLock(); }
}

function backfillExistingRepos_() {
  const results = { added: [], skipped: [], failed: [] };
  try {
    const TS = getColumnMap(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
    const rows = getSheetRows(SHEET_NAMES.TEAM_STATUS).filter(row => row[TS.TEAM_ID]);
    const repoMap = getRepoUrlMap();
    const repos = getAllGithubOrgRepos_();
    rows.forEach(row => {
      const teamId = row[TS.TEAM_ID];
      if (repoMap[normalizeText_(teamId)]) {
        results.skipped.push({ teamId, reason: 'Already recorded in TeamStatus' });
        return;
      }
      const expectedName = `capstone-${String(row[TS.SEMESTER]).replace(/\s+/g, '-').toLowerCase()}-team-${teamId}`;
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
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try { return provisionTeamRepos_(); }
  finally { lock.releaseLock(); }
}
// ===================================================================
// COORDINATOR REPOSITORY ACCESS SYNC
// ===================================================================

/**
 * Verifies coordinator access to every provisioned repository.
 *
 * If access is missing, attempts to grant the configured permission.
 * The verified-access count is stored in:
 *
 *   COLLABORATOR_REPOS_ACCESS
 *
 * @return {Object} Summary suitable for the Coordinator Dashboard.
 */
function syncCoordinatorGithubAccess() {
  const lock = LockService.getScriptLock();

  try {
    lock.waitLock(30000);

    // ---------------------------------------------------------------
    // Configuration
    // ---------------------------------------------------------------
    const username = String(
      getConfig('COLLABORATOR_GITHUB_USERNAME')
    ).trim();

    const permission = String(
      getConfig('COLLABORATOR_REPO_PERMISSION')
    ).trim();

    if (!username) {
      throw new Error(
        'COLLABORATOR_GITHUB_USERNAME is missing or blank.'
      );
    }

    if (!permission) {
      throw new Error(
        'COLLABORATOR_REPO_PERMISSION is missing or blank.'
      );
    }

    // ---------------------------------------------------------------
    // Get all provisioned repository URLs
    // ---------------------------------------------------------------
    const repoUrls = [...new Set(Object.values(getRepoUrlMap()).filter(Boolean))];

    let verifiedAccess = 0;
    let alreadyAccessible = 0;
    let repaired = 0;

    const failed = [];

    // ---------------------------------------------------------------
    // Verify coordinator access repository by repository
    // ---------------------------------------------------------------
    repoUrls.forEach(repoUrl => {

      const repoSlug = getGithubRepoSlug_(repoUrl);

      if (!repoSlug) {
        failed.push({
          repoUrl,
          reason: 'Invalid GitHub repository URL'
        });
        return;
      }


      try {
        // -----------------------------------------------------------
        // Check current coordinator permission
        // -----------------------------------------------------------
        const check = getCollaboratorPermission_(
          repoSlug,
          username
        );

        if (check.status === 200) {
          verifiedAccess++;
          alreadyAccessible++;
          return;
        }

        // -----------------------------------------------------------
        // Missing collaborator — attempt to add coordinator
        // -----------------------------------------------------------
        if (check.status === 404) {

          const add = addCollaborator(
            repoSlug,
            username,
            permission
          );

          if (
            add.status === 201 ||
            add.status === 204
          ) {

            // -------------------------------------------------------
            // Verify after adding.
            //
            // Do not count the repository merely because the PUT
            // succeeded. Count it only when GitHub confirms access.
            // -------------------------------------------------------
            const verify = getCollaboratorPermission_(
              repoSlug,
              username
            );

            if (verify.status === 200) {
              verifiedAccess++;
              repaired++;

            } else {
              failed.push({
                repoUrl,
                reason:
                  `Access grant returned ${add.status}, ` +
                  `but verification returned ${verify.status}`
              });
            }

            return;
          }

          failed.push({
            repoUrl,
            reason:
              `Unable to grant access. ` +
              `GitHub returned ${add.status}`
          });

          return;
        }

        // -----------------------------------------------------------
        // Unexpected GitHub response
        // -----------------------------------------------------------
        failed.push({
          repoUrl,
          reason:
            `Access check returned GitHub status ${check.status}`
        });

      } catch (err) {
        failed.push({
          repoUrl,
          reason: err.message
        });
      }
    });

    // ---------------------------------------------------------------
    // Persist VERIFIED coordinator access count
    // ---------------------------------------------------------------
    setConfig(
      'COLLABORATOR_REPOS_ACCESS',
      verifiedAccess
    );

    // ---------------------------------------------------------------
    // Log summary
    // ---------------------------------------------------------------
    Logger.log(
      `Coordinator GitHub sync complete — ` +
      `${username}: ` +
      `${verifiedAccess}/${repoUrls.length} verified, ` +
      `${alreadyAccessible} already accessible, ` +
      `${repaired} repaired, ` +
      `${failed.length} failed.`
    );

    // ---------------------------------------------------------------
    // Return result to Coordinator Dashboard
    // ---------------------------------------------------------------
    return {
      success: failed.length === 0,
      username,
      permission,
      verifiedAccess,
      totalRepos: repoUrls.length,
      alreadyAccessible,
      repaired,
      failedCount: failed.length,
      failed
    };

  } catch (err) {

    Logger.log(
      `Coordinator GitHub sync failed: ` +
      `${err.message}\n${err.stack || ''}`
    );

    throw new Error(
      `Coordinator GitHub sync failed: ${err.message}`
    );

  } finally {

    try {
      lock.releaseLock();
    } catch (_) {
      // Lock may not have been acquired.
    }
  }
}
/**
 * Parses a standard GitHub repository URL.
 *
 * @param {string} repoUrl
 * @return {{owner:string, repo:string}|null}
 */
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
