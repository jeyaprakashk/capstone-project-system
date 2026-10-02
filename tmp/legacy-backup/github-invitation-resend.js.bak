/** Coordinator-only recovery. Reads current membership on every batch; never provisions repos. */
function resendExpiredStudentInvitations(cursor) {
  const email = Session.getActiveUser().getEmail();
  if (!email || !getDashboardRoleViews_(email).some(view => view.key === 'coord')) throw new Error('Coordinator access is required.');
  if (cursor != null && typeof cursor !== 'string') throw new Error('Invalid continuation cursor.');
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const columns = getColumnMap(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
    const teams = getSheetRows(SHEET_NAMES.TEAM_STATUS).filter(row => row[columns.TEAM_ID]);
    const keys = [...new Set(teams.map(row => normalizeText_(row[columns.TEAM_ID])))].sort();
    const batch = keys.filter(key => !cursor || key > cursor).slice(0, 5);
    const accounts = getSheetRows(SHEET_NAMES.GITHUB_ACCOUNTS);
    const accountColumns = githubAccountColumns_(getSheet(SHEET_NAMES.GITHUB_ACCOUNTS));
    const students = weeklyStudents_(), repos = getRepoUrlMap(), cache = new Map(), results = [];
    let nextCursor = cursor || '', stopped = false;
    const request = (method, path, payload) => {
      const response = makeGithubRequest(method, path, payload);
      // Stop on all forbidden responses as well: permission failures must not trigger a bulk retry storm.
      if (response.status === 429 || response.status === 403) {
        const error = new Error('GitHub paused this run (HTTP ' + response.status + '). Check token permissions or rate limits before retrying.');
        error.stopResend = true;
        throw error;
      }
      return response;
    };
    for (const key of batch) {
      const matches = teams.filter(row => normalizeText_(row[columns.TEAM_ID]) === key), row = matches[0];
      const teamId = String(row[columns.TEAM_ID]);
      const members = [1,2,3,4].filter(n => row[columns['S' + n + '_EMAIL']]).map(n => ({
        email: String(row[columns['S' + n + '_EMAIL']]).trim(),
        student: String(row[columns['S' + n + '_REGNO']] || row[columns['S' + n + '_NAME']] || row[columns['S' + n + '_EMAIL']])
      }));
      let slug, invitations, repositoryError;
      try {
        if (matches.length !== 1) throw new Error('Duplicate team records require correction.');
        slug = getGithubRepoSlug_(repos[key] || '');
        if (!slug) throw new Error('No valid existing repository URL.');
        if (request('GET', '/repos/' + slug).status !== 200) throw new Error('Existing repository could not be verified.');
        invitations = getGithubInvitations_(slug, request);
      } catch (error) { repositoryError = error; }
      for (const member of members) {
        const result = {teamId, student: member.student, email: member.email, username: '', status: 'skipped', reason: ''};
        results.push(result);
        try {
          if (repositoryError) throw repositoryError;
          const identity = githubStudentIdentity_({email: member.email, teamId}, accounts, accountColumns, students);
          if (identity.state !== 'available') { result.reason = identity.reason; continue; }
          let account;
          try { account = resolveGithubAccountId_(identity.githubId, request, cache); }
          catch (error) { if (error.stopResend) throw error; result.reason = error.message; continue; }
          result.username = account.username;
          const path = '/repos/' + slug;
          const permission = request('GET', path + '/collaborators/' + encodeURIComponent(account.username) + '/permission');
          if (permission.status === 200 && !githubAuthorMatches_(identity.githubId, permission.body && permission.body.user && permission.body.user.id)) throw new Error('Collaborator account ID could not be verified.');
          if (permission.status === 200 && githubPermissionSufficient_(permission.body)) {
            result.status = 'already joined'; result.reason = 'Repository write access is active.'; continue;
          }
          if (![200,404].includes(permission.status)) throw new Error('Repository access check failed (HTTP ' + permission.status + ').');
          const matching = invitations.filter(invite => githubAuthorMatches_(identity.githubId, invite.invitee && invite.invitee.id));
          const pending = matching.find(invite => !invite.expired);
          if (pending) { result.status = 'pending'; result.reason = githubPermissionSufficient_({permission:pending.permissions}) ? 'Accept the existing invitation in GitHub.' : 'Existing invitation has insufficient access; coordinator review required.'; continue; }
          for (const expired of matching) {
            const deletion = request('DELETE', path + '/invitations/' + expired.id);
            if (![204,404].includes(deletion.status)) throw new Error('Expired invitation could not be removed (HTTP ' + deletion.status + ').');
          }
          const sent = request('PUT', path + '/collaborators/' + encodeURIComponent(account.username), {permission:'push'});
          if (sent.status === 201 && sent.body && !sent.body.expired && githubAuthorMatches_(identity.githubId, sent.body.invitee && sent.body.invitee.id) && githubPermissionSufficient_({permission:sent.body.permissions})) {
            invitations.push(sent.body);
            result.status = 'invited'; result.reason = 'Fresh invitation created. Student must accept it in GitHub.';
          } else if (sent.status === 204) {
            const verified = request('GET', path + '/collaborators/' + encodeURIComponent(account.username) + '/permission');
            if (verified.status !== 200 || !githubAuthorMatches_(identity.githubId, verified.body && verified.body.user && verified.body.user.id) || !githubPermissionSufficient_(verified.body)) throw new Error('GitHub did not confirm repository write access.');
            result.status = 'already joined'; result.reason = 'Repository write access verified.';
          } else throw new Error('GitHub did not confirm the invitation and account identity (HTTP ' + sent.status + ').');
        } catch (error) {
          result.status = 'failed'; result.reason = error.message;
          if (error.stopResend) { stopped = true; break; }
        }
      }
      if (repositoryError && repositoryError.stopResend) stopped = true;
      if (stopped) break;
      nextCursor = key;
    }
    return {results, stopped, nextCursor: stopped || keys.some(key => key > nextCursor) ? nextCursor : null};
  } finally { lock.releaseLock(); }
}
