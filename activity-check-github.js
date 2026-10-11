/**
 * ACTIVITY CHECK: github (ACTIVITY-DEPENDENCIES-PLAN.md, section 5). The one item is READY: every member's username is valid, the
 * repository is verified, every member has active or invited access, and template setup has finished. It reads
 * getTeamGithubSetup_ in its read-only mode, so a dashboard load never writes the GitHub accounts sheet.
 */
function activityCheckGithub_() {
  return {
    needsApprovedTitle: false,
    perStudent: false,
    validItem: item => item === 'READY',
    isMet: (team, item, ctx) => {
      const key = String(team.teamId);
      if (!ctx.github[key]) {
        try { ctx.github[key] = {setup: getTeamGithubSetup_(team.teamId, {readOnly: true})}; }
        catch (error) { ctx.github[key] = {error: String(error && error.message || error)}; }
      }
      const cached = ctx.github[key];
      if (cached.error) return {met: false, unverifiable: true, diagnostic: 'GITHUB_ERROR'};
      const setup = cached.setup;
      if (setup.verificationUnavailable || (setup.members || []).some(member => member.access === 'unavailable')) {
        return {met: false, unverifiable: true, diagnostic: 'GITHUB_MEMBER_UNVERIFIED'};
      }
      if (setup.repoUrl && setup.usernamesComplete && !setup.repositoryAvailable) {
        return {met: false, unverifiable: true, diagnostic: 'GITHUB_REPOSITORY_UNVERIFIED'};
      }
      if (setup.ready) return {met: true, reason: ''};
      return {met: false, reason: String(setup.message || 'GitHub setup is not complete.')};
    }
  };
}
