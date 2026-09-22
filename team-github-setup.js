/** Bulk dashboard reads retain live verification without serial network calls per student. */
function getTeamsGithubSetup_(rows, columns, repoUrlMap, usernameRows) {
  const responses = new Map();
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_ADMIN_TOKEN');
  function prefetch(paths) {
    const unique = [...new Set(paths)].filter(path => !responses.has(path));
    for (let offset = 0; offset < unique.length; offset += 50) {
      const batch = unique.slice(offset, offset + 50);
      batch.forEach(path => responses.set(path, {status:503}));
      if (!token) continue;
      try {
        const results = UrlFetchApp.fetchAll(batch.map(path => ({url:'https://api.github.com' + path,
          method:'get', headers:{Authorization:'token ' + token, Accept:'application/vnd.github.v3+json'}, muteHttpExceptions:true})));
        results.forEach((response, index) => {
          let body = null;
          try { body = JSON.parse(response.getContentText()); } catch (err) { /* Unavailable response. */ }
          responses.set(batch[index], {status:response.getResponseCode(), body});
        });
      } catch (err) { /* Keep failed checks unavailable; never retry the whole batch serially. */ }
    }
  }
  const latest = new Map();
  usernameRows.forEach(row => latest.set(normalizeText_(row[2]) + ':' + normalizeEmail(row[1]), row));
  const names = [];
  rows.forEach(row => [1,2,3,4].forEach(n => {
    const saved = latest.get(normalizeText_(row[columns.TEAM_ID]) + ':' + normalizeEmail(row[columns['S' + n + '_EMAIL']]));
    const name = String(saved && saved[3] || '').trim();
    if (/^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i.test(name)) names.push('/users/' + encodeURIComponent(name));
  }));
  prefetch(names);
  const request = (method, path) => {
    if (!responses.has(path)) prefetch([path]); // Additional invitation pages only.
    return responses.get(path);
  };
  const validationCache = new Map();
  const options = row => ({row, columns, repoUrl:repoUrlMap[normalizeText_(row[columns.TEAM_ID])] || '', usernameRows, validationCache, request});
  const paths = [];
  rows.forEach(row => {
    const setup = getTeamGithubSetup_(row[columns.TEAM_ID], {...options(row), inspectAccess:false});
    const slug = getGithubRepoSlug_(setup.repoUrl);
    if (!setup.usernamesComplete || !slug) return;
    paths.push('/repos/' + slug, '/repos/' + slug + '/invitations?per_page=100&page=1');
    setup.members.forEach(member => paths.push('/repos/' + slug + '/collaborators/' + encodeURIComponent(member.username) + '/permission'));
  });
  prefetch(paths);
  return Object.fromEntries(rows.map(row => [normalizeText_(row[columns.TEAM_ID]), getTeamGithubSetup_(row[columns.TEAM_ID], options(row))]));
}

/** Shared, live team readiness. Read paths never create repositories or invitations. */
function getTeamGithubSetup_(teamId, options) {
  options = options || {};
  const request = options.request || makeGithubRequest;
  const columns = options.columns || getColumnMap(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const row = options.row || getSheetRows(SHEET_NAMES.TEAM_STATUS).find(row => textEquals_(row[columns.TEAM_ID], teamId));
  if (!row) throw new Error('Team not found: ' + teamId);
  const repoUrl = options.repoUrl !== undefined ? options.repoUrl : getRepoUrlForTeam(teamId);
  const latest = new Map();
  (options.usernameRows || getSheetRows(SHEET_NAMES.GITHUB_USERNAME_RAW)).forEach(item => {
    if (textEquals_(item[2], teamId)) latest.set(normalizeEmail(item[1]), item);
  });
  const validationCache = options.validationCache || new Map();
  const members = [1, 2, 3, 4].filter(n => String(row[columns['S' + n + '_EMAIL']] || '').trim()).map(n => {
    const email = String(row[columns['S' + n + '_EMAIL']]).trim();
    const submission = latest.get(normalizeEmail(email));
    const username = String(submission && submission[3] || '').trim();
    const member = { email, label: String(row[columns['S' + n + '_REGNO']] || row[columns['S' + n + '_NAME']] || email), username,
      status: 'missing', submittedAt: null, access: 'unchecked' };
    if (!username) return member;
    try {
      if (!validationCache.has(username.toLowerCase())) validationCache.set(username.toLowerCase(), validateStudentGithubUsername_(username, request));
      const check = validationCache.get(username.toLowerCase());
      member.status = check.valid ? 'valid' : 'invalid';
      if (check.valid) {
        member.username = check.username;
        const timestamp = submission[0];
        const ms = timestamp ? new Date(timestamp).getTime() : NaN;
        if (Number.isFinite(ms)) member.submittedAt = ms;
      }
    } catch (err) { member.status = 'unavailable'; }
    return member;
  });
  const result = { teamId, repoUrl: String(repoUrl || '').trim(), members,
    usernamesComplete: members.length > 0 && members.every(member => member.status === 'valid'),
    outstandingMembers: members.filter(member => member.status === 'missing' || member.status === 'invalid').map(member => member.label),
    verificationUnavailable: members.some(member => member.status === 'unavailable'),
    repositoryAvailable: false, ready: false, completedAt: null, accessError: '' };
  if (result.usernamesComplete && members.every(member => member.submittedAt !== null)) result.completedAt = Math.max(...members.map(member => member.submittedAt));
  if (result.repoUrl && result.usernamesComplete && options.inspectAccess !== false) {
    try {
      const slug = getGithubRepoSlug_(result.repoUrl);
      if (!slug) throw new Error('The saved repository URL is invalid. Contact your coordinator.');
      const repo = request('GET', '/repos/' + slug);
      if (repo.status !== 200) throw new Error('Repository could not be verified. Retry GitHub setup.');
      result.repositoryAvailable = true;
      const invitations = getGithubInvitations_(slug, request);
      members.forEach(member => {
        const permission = options.request
          ? request('GET', '/repos/' + slug + '/collaborators/' + encodeURIComponent(member.username) + '/permission')
          : getCollaboratorPermission_(slug, member.username);
        if (permission.status === 200 && githubPermissionSufficient_(permission.body)) member.access = 'active';
        else if (permission.status === 200 || permission.status === 404) {
          const invitation = invitations.find(invite => !invite.expired && textEquals_(invite.invitee && invite.invitee.login, member.username));
          member.access = invitation && githubPermissionSufficient_({ permission: invitation.permissions }) ? 'invited' : 'missing';
        } else { member.access = 'unavailable'; }
      });
      result.ready = members.every(member => member.access === 'active' || member.access === 'invited');
    } catch (err) { result.accessError = err.message; }
  }
  result.message = githubSetupMessage_(result);
  return result;
}

function githubPermissionSufficient_(body, required) {
  const ranks = { none: 0, read: 1, pull: 1, triage: 2, write: 3, push: 3, maintain: 4, admin: 5 };
  required = required || 'write';
  if (!body || !ranks[required]) return false;
  const permissions = body.user && body.user.permissions || {};
  const rank = permissions.admin ? 5 : permissions.maintain ? 4 : permissions.push ? 3 : 0;
  return Math.max(rank, ranks[body.permission] || 0) >= ranks[required];
}

function ensureGithubPermission_(slug, username, required, invitations) {
  const permission = getCollaboratorPermission_(slug, username);
  if (permission.status === 200 && githubPermissionSufficient_(permission.body, required)) return;
  if (permission.status !== 200 && permission.status !== 404) throw new Error('Could not verify access for ' + username + '. Retry GitHub setup.');
  const invitation = invitations.find(invite => !invite.expired && textEquals_(invite.invitee && invite.invitee.login, username));
  if (invitation && githubPermissionSufficient_({ permission: invitation.permissions }, required)) return;
  const permissions = required === 'push' ? 'write' : required === 'pull' ? 'read' : required;
  const response = invitation
    ? makeGithubRequest('PATCH', '/repos/' + slug + '/invitations/' + invitation.id, { permissions })
    : addCollaborator(slug, username, required);
  if (!(invitation ? response.status === 200 : [201, 204].includes(response.status))) throw new Error('Could not grant access to ' + username + '. Retry GitHub setup.');
}

function getGithubInvitations_(slug, request) {
  const invitations = [];
  for (let page = 1; ; page++) {
    const response = (request || makeGithubRequest)('GET', '/repos/' + slug + '/invitations?per_page=100&page=' + page);
    if (response.status !== 200 || !Array.isArray(response.body)) throw new Error('Repository invitations could not be verified. Retry GitHub setup.');
    invitations.push(...response.body);
    if (response.body.length < 100) return invitations;
  }
}

function githubSetupMessage_(setup) {
  if (setup.outstandingMembers.length) return 'Waiting for valid GitHub usernames from teammate(s): ' + setup.outstandingMembers.join(', ') + '.' + (setup.verificationUnavailable ? ' GitHub could not verify other saved usernames right now. Please try again shortly.' : '');
  if (setup.verificationUnavailable) return 'GitHub could not verify all teammates right now. Please try again shortly.';
  if (!setup.members.length) return 'No team members are configured. Contact your coordinator.';
  if (!setup.repoUrl) return 'All teammates have submitted valid GitHub usernames. Your repository is awaiting creation.';
  if (setup.ready) return setup.members.some(member => member.access === 'invited')
    ? 'GitHub setup is complete. Members with pending invitations must accept them in GitHub to access the repository.'
    : 'GitHub setup is complete. Every team member has repository access.';
  return setup.accessError || 'All usernames are valid. Repository access setup is pending. Retry GitHub setup.';
}

/** All mutation callers hold the script lock. No writes occur before all usernames validate. */
function repairTeamGithubSetup_(teamId) {
  const columns = getColumnMap(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const row = getSheetRows(SHEET_NAMES.TEAM_STATUS).find(row => textEquals_(row[columns.TEAM_ID], teamId));
  const setup = getTeamGithubSetup_(teamId, { row, columns, inspectAccess: false });
  if (!setup.usernamesComplete) return setup;
  const name = getTeamRepoName_(teamId, row[columns.SEMESTER]);
  const expectedSlug = String(getConfig('GITHUB_ORG_NAME')).trim() + '/' + name;
  const slug = setup.repoUrl ? getGithubRepoSlug_(setup.repoUrl) : expectedSlug;
  if (!slug) throw new Error('The saved repository URL is invalid. Contact your coordinator.');
  let repo = makeGithubRequest('GET', '/repos/' + slug);
  const created = repo.status === 404;
  if (created) {
    if (!textEquals_(slug, expectedSlug)) throw new Error('Saved repository was not found. Contact your coordinator before creating a replacement.');
    repo = createTeamRepo(name, teamId);
  }
  if (repo.status !== (created ? 201 : 200) || !repo.body || !repo.body.html_url) throw new Error('Repository lookup or creation failed: ' + repo.status);
  // Record the URL before access repair; readiness is always checked separately.
  updateTeamStatusRepoUrl_(teamId, repo.body.html_url);
  if (created) setReadmeHeading(slug, name, teamId, row[columns.TITLE] || 'Team ' + teamId + ' Capstone');
  const invitations = getGithubInvitations_(slug);
  setup.members.forEach(member => ensureGithubPermission_(slug, member.username, 'push', invitations));
  return getTeamGithubSetup_(teamId, { repoUrl: repo.body.html_url });
}

function githubSubmissionTiming_(setup, schedule, clock) {
  if (setup.verificationUnavailable || (setup.usernamesComplete && setup.completedAt === null)) return { state: 'unknown', text: 'Submission timing could not be verified.' };
  if (!setup.usernamesComplete) return clock.today > schedule.formation
    ? { state: 'overdue', text: 'GitHub username submissions overdue.' }
    : { state: 'pending', text: 'Waiting for all valid username submissions.' };
  const day = projectDay_(new Date(setup.completedAt), schedule.timezone);
  return day > schedule.formation ? { state: 'late', text: 'All valid usernames submitted late.' } : { state: 'on-time', text: 'All valid usernames submitted on time.' };
}

/** Title intake requires accepted access; provisioning may still finish with invitations pending. */
function githubAcceptedAccessMessage_(setup) {
  if (!setup.usernamesComplete) return setup.message;
  if (!setup.repoUrl) return 'Your team does not have a repository URL yet. Use Retry GitHub setup on the dashboard.';
  if (!setup.repositoryAvailable) return setup.accessError || 'Your team repository could not be verified. Retry GitHub setup; contact your coordinator if this persists.';
  if (setup.accessError || setup.members.some(member => member.access === 'unavailable' || member.access === 'unchecked')) {
    return 'GitHub repository access could not be verified right now. Please try again later; contact your coordinator if this persists.';
  }
  const missing = setup.members.filter(member => member.access === 'missing');
  const pending = setup.members.filter(member => member.access === 'invited');
  const messages = [];
  if (missing.length) messages.push('Required repository write access is missing for: ' + missing.map(member => member.label + ' (' + member.username + ')').join(', ') + '. Use Retry GitHub setup; contact your coordinator if access remains missing.');
  if (pending.length) messages.push('Repository invitations must be accepted by: ' + pending.map(member => member.label + ' (' + member.username + ')').join(', ') + '. Sign in to the matching GitHub account and accept the invitation at ' + setup.repoUrl + '/invitations.');
  return messages.join(' ') || (setup.members.length && setup.members.every(member => member.access === 'active')
    ? '' : 'Every team member must have verified repository write access before submitting a title.');
}

function requireTeamGithubReady_(teamId, email, options) {
  const setup = getTeamGithubSetup_(teamId);
  if (!setup.members.some(member => emailsMatch(member.email, email))) throw new Error('You are not a current member of this team.');
  const message = options && options.requireAcceptedInvitations
    ? githubAcceptedAccessMessage_(setup) : setup.ready ? '' : setup.message;
  if (message) {
    const error = new Error(message + ' Complete the GitHub step and submit again.');
    // Only attach team recipients after authenticating the submitter's membership.
    error.githubSetup = setup;
    throw error;
  }
  return setup;
}

function notifyGithubIntakeRejection_(teamId, submitterEmail, error) {
  const recipients = error.githubSetup
    ? [...new Set(error.githubSetup.members.map(member => normalizeEmail(member.email)).filter(Boolean))]
    : [submitterEmail];
  MailApp.sendEmail(recipients.join(','), `Title submission not applied — Team ${teamId}`,
    error.message + '\n\nThe raw response was retained, but no title or approval records were changed. After resolving the issue, submit the title again.\n\nDashboard: ' + getDashboardUrl());
}
