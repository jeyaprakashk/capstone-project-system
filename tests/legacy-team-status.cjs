const vm = require('node:vm');

// The old title columns were removed from FIELD_DEFINITIONS.TEAM_STATUS. A few fixtures still describe a team as one old-style row
// (title, decisions, notes) and translate it to TitleLog rows on demand, so they put the columns back, in their old order, in
// their own context only. The production definition and the schema snapshot do not have them.
const LEGACY_AFTER_S4_EMAIL = {
  TITLE: 'Title',
  PROBLEM: 'Problem Statement',
  SIMILARITY_FLAG: 'Similarity Flag',
  GUIDE_DECISION: 'Guide Decision',
  GUIDE_NOTES: 'Guide Notes',
  REVIEWER_DECISION: 'Reviewer Decision',
  REVIEWER_NOTES: 'Reviewer Notes'
};
const LEGACY_AFTER_COMMITTEE = {
  TITLE_APPROVED_BY: 'Title Approved By',
  WORK_BREAKDOWN_LINK: 'Work Breakdown Link',
  NEED_ANALYSIS_LINK: 'Need Analysis Link'
};

function withLegacyTitleColumns(context) {
  context.__legacyBefore = LEGACY_AFTER_S4_EMAIL;
  context.__legacyAfter = LEGACY_AFTER_COMMITTEE;
  vm.runInContext(`(function () {
    const team = FIELD_DEFINITIONS.TEAM_STATUS, kept = Object.assign({}, team);
    Object.keys(team).forEach(key => delete team[key]);
    Object.keys(kept).forEach(key => {
      team[key] = kept[key];
      if (key === 'S4_EMAIL') Object.assign(team, __legacyBefore);
    });
    Object.assign(team, __legacyAfter);
  })()`, context);
  delete context.__legacyBefore;
  delete context.__legacyAfter;
  return context;
}

module.exports = { withLegacyTitleColumns };
