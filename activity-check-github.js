/**
 * ACTIVITY CHECK: github (archive/plans/ACTIVITY-DEPENDENCIES-PLAN.md, section 5). It reads getTeamGithubSetup_ in its read-only mode, so a
 * dashboard load never writes the GitHub accounts sheet. The items, from the narrowest to the whole:
 *   USERNAMES   every member's username is valid.
 *   REPOSITORY  the team repository is saved and verified.
 *   COMMITS     every member has a commit of their own in the Commits tab (the same filter as the weekly progress rule).
 *   READY       every member's username is valid, the repository is verified, every member has active or invited access, and template
 *               setup has finished.
 * The coordinator picks the items an activity needs; each is a row of its own, so each is its own line of the student's checklist.
 */
const ACTIVITY_GITHUB_ITEMS_ = Object.freeze(['USERNAMES', 'REPOSITORY', 'COMMITS', 'READY']);

/** The team's setup, read once per request (kept in ctx). Returns {setup} or {error}. */
function activityGithubSetup_(team, ctx) {
  const key = String(team.teamId);
  if (!ctx.github[key]) {
    try { ctx.github[key] = {setup: getTeamGithubSetup_(team.teamId, {readOnly: true})}; }
    catch (error) { ctx.github[key] = {error: String(error && error.message || error)}; }
  }
  return ctx.github[key];
}

function activityGithubUsernames_(setup) {
  if (setup.usernamesComplete) return {met: true, reason: ''};
  if ((setup.outstandingMembers || []).length) return {met: false, reason: String(setup.message || 'Waiting for valid GitHub usernames.')};
  if (setup.verificationUnavailable) return {met: false, unverifiable: true, diagnostic: 'GITHUB_MEMBER_UNVERIFIED'};
  return {met: false, reason: String(setup.message || 'Waiting for valid GitHub usernames.')};
}

function activityGithubRepository_(setup) {
  if (!setup.repoUrl) return {met: false, reason: 'The team repository has not been created yet.'};
  if (!setup.usernamesComplete) {
    if (setup.verificationUnavailable) return {met: false, unverifiable: true, diagnostic: 'GITHUB_MEMBER_UNVERIFIED'};
    return {met: false, reason: 'The repository is checked once every teammate has a valid GitHub username.'};
  }
  if (setup.repositoryAvailable) return {met: true, reason: ''};
  return {met: false, unverifiable: true, diagnostic: 'GITHUB_REPOSITORY_UNVERIFIED'};
}

/**
 * Met when each member's GitHub ID appears as the author of a counted commit. The Commits tab is filled by the collection trigger, so a
 * member without a commit is "Could not verify" (not "unmet") when the team's last collection failed or has never run.
 */
function activityGithubCommits_(team, setup) {
  const usernames = activityGithubUsernames_(setup);
  if (!usernames.met) return usernames;
  let commits, collection;
  try {
    commits = readCollectedCommits_(team.teamId);
    collection = readCommitCollectionStatus_(team.teamId);
  } catch (error) {
    console.error('Commit requirement could not read the Commits tab for team ' + team.teamId + ': ' + (error && error.message || error));
    return {met: false, unverifiable: true, diagnostic: 'COMMITS_UNREADABLE'};
  }
  const without = setup.members.filter(member => !commits.some(commit => githubAuthorMatches_(member.githubId, commit.authorId) && weeklyStudentCommit_(commit)));
  if (!without.length) return {met: true, reason: ''};
  if (collection !== 'ok') return {met: false, unverifiable: true, diagnostic: collection === 'error' ? 'COMMITS_COLLECTION_FAILED' : 'COMMITS_NOT_COLLECTED'};
  return {met: false, reason: 'No commit yet from: ' + without.map(member => member.label).join(', ') + '.'};
}

function activityGithubReady_(setup) {
  if (setup.verificationUnavailable || (setup.members || []).some(member => member.access === 'unavailable')) {
    return {met: false, unverifiable: true, diagnostic: 'GITHUB_MEMBER_UNVERIFIED'};
  }
  if (setup.repoUrl && setup.usernamesComplete && !setup.repositoryAvailable) {
    return {met: false, unverifiable: true, diagnostic: 'GITHUB_REPOSITORY_UNVERIFIED'};
  }
  if (setup.ready) return {met: true, reason: ''};
  return {met: false, reason: String(setup.message || 'GitHub setup is not complete.')};
}

function activityCheckGithub_() {
  return {
    needsApprovedTitle: false,
    perStudent: false,
    validItem: item => ACTIVITY_GITHUB_ITEMS_.includes(item),
    isMet: (team, item, ctx) => {
      const cached = activityGithubSetup_(team, ctx);
      if (cached.error) return {met: false, unverifiable: true, diagnostic: 'GITHUB_ERROR'};
      const setup = cached.setup;
      if (item === 'USERNAMES') return activityGithubUsernames_(setup);
      if (item === 'REPOSITORY') return activityGithubRepository_(setup);
      if (item === 'COMMITS') return activityGithubCommits_(team, setup);
      return activityGithubReady_(setup);
    }
  };
}
