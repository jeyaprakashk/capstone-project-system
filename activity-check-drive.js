/**
 * ACTIVITY CHECK: drive (ACTIVITY-DEPENDENCIES-PLAN.md, section 5). The item is an upload name from TEAM_DOCUMENT_FILE_NAMES_. It is
 * met when exactly one non-trashed file with that exact name is in the team folder. It tells a confirmed absence apart from a lookup
 * that could not be resolved, which the shared findTeamFolder_ cannot (it returns null for both), so it composes the helpers under it.
 */
function activityDriveFolder_(team, ctx) {
  const key = String(team.teamId);
  if (ctx.drive[key]) return ctx.drive[key];
  let answer;
  try {
    const base = teamFoldersBase_();
    if (base.issue) answer = {unresolved: 'TEAM_DOCUMENTS_UNRESOLVED'};
    else {
      const documents = teamDocumentsFolder_(base.folder, false);
      if (documents.issue) answer = {unresolved: 'TEAM_DOCUMENTS_UNRESOLVED'};
      else if (!documents.folder) answer = {absent: true};
      else {
        const found = teamFolderIn_(documents.folder, team.teamId, team.semester);
        answer = found.count === 0 ? {absent: true} : found.count > 1 ? {unresolved: 'FOLDER_AMBIGUOUS'} : {folder: found.folder};
      }
    }
  } catch (error) {
    console.error('Drive lookup failed for team ' + team.teamId + ': ' + (error && error.message || error));
    answer = {unresolved: 'TEAM_DOCUMENTS_UNRESOLVED'};
  }
  ctx.drive[key] = answer;
  return answer;
}

function activityCheckDrive_() {
  return {
    needsApprovedTitle: false,
    perStudent: false,
    validItem: item => Object.values(TEAM_DOCUMENT_FILE_NAMES_).includes(item),
    isMet: (team, item, ctx) => {
      const located = activityDriveFolder_(team, ctx);
      if (located.unresolved) return {met: false, unverifiable: true, diagnostic: located.unresolved};
      if (located.absent) return {met: false, reason: 'Team folder not created yet.'};
      let live = 0;
      try {
        const files = located.folder.getFilesByName(item);
        while (files.hasNext()) if (!files.next().isTrashed()) live++;
      } catch (error) {
        console.error('Drive file lookup failed for team ' + team.teamId + ': ' + (error && error.message || error));
        return {met: false, unverifiable: true, diagnostic: 'TEAM_DOCUMENTS_UNRESOLVED'};
      }
      if (live === 1) return {met: true, reason: ''};
      if (live === 0) return {met: false, reason: 'Not uploaded yet.'};
      return {met: false, reason: 'More than one file has this name. Upload the document again to replace them.'};
    }
  };
}
