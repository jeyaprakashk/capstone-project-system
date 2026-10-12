/**
 * ACTIVITY CHECK: title. The one item is `approved`: the team's project title has been finally approved. It stays met while the title is
 * reopened, the same rule as titleGate_. The title index is read once per request (kept in ctx). A history that cannot be read is
 * "Could not verify", so it fails closed. `needsApprovedTitle` is true, so the loader refuses this kind under `title.*`, which is the
 * activity that produces the approval.
 */
function activityCheckTitle_() {
  return {
    needsApprovedTitle: true,
    perStudent: false,
    validItem: item => item === 'approved',
    isMet: (team, item, ctx) => {
      let gate;
      try {
        if (!ctx.title) ctx.title = {index: readTitleIndex_()};
        gate = titleGate_(team.teamId, ctx.title.index);
      } catch (error) {
        console.error('Title requirement could not read the title history of team ' + team.teamId + ': ' + (error && error.message || error));
        return {met: false, unverifiable: true, diagnostic: 'TITLE_HISTORY_UNAVAILABLE'};
      }
      return gate.approved ? {met: true, reason: ''} : {met: false, reason: 'The project title has not been approved yet.'};
    }
  };
}
