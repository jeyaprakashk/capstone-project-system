// For test contexts that exercise something other than the title (Review marking, publishing, schedules): a stand-in for the title
// reader whose answer comes from the old-style team row the fixture already keeps, so a test can still say "this team's title is
// approved" or "is not" without a TitleLog sheet. The real gate is tested in title-gate.test.cjs and through the weekly fixture.
// It also stands in for the activity engine, which Review entry asks for the team's ActivityDependencies rows. The stand-in acts as if the
// review has one `title` / `approved` row: the review is allowed exactly when the title is. A test of other rows replaces
// `activityPreconditions_` after calling this.
function stubTitleGate(context, read) {
  context.activityContext_ = () => ({});
  context.activityPreconditions_ = () => read().approved ? {allowed: true, requirements: [], reason: ''}
    : {allowed: false, requirements: [{label: 'Project title approved', met: false, reason: 'The project title has not been approved yet.'}],
      reason: 'Project title approved: The project title has not been approved yet.'};
  context.readTitleIndex_ = () => ({teams: {}});
  context.titleGate_ = () => {
    const state = read();
    return {approved: !!state.approved, title: String(state.title || ''), problem: String(state.problem || ''), approvedAt: null};
  };
  return context;
}
module.exports = {stubTitleGate};

const fs = require('node:fs');
const vm = require('node:vm');
const { titleRowsFor } = require('./title-baseline/titlelog.cjs');

/**
 * Installs the real title modules in a context and replaces only the sheet read, so the gate, the index and the history rules run for
 * real on rows translated from the old-style team data the fixture keeps. `teams()` returns [{teamId, title, guide, reviewer, problem?}].
 */
function installTitleLog(context, teams) {
  if (typeof context.apiFail_ !== 'function') context.apiFail_ = (code, message) => Object.assign(new Error(message), {apiCode: code});
  for (const file of ['title-log.js', 'title-history.js', 'title-gate.js', 'title-service.js']) {
    const marker = {'title-log.js': 'readTitleLog_', 'title-history.js': 'validateTitleHistory_', 'title-gate.js': 'titleGate_', 'title-service.js': 'titleCanDo_'}[file];
    if (typeof context[marker] !== 'function') vm.runInContext(fs.readFileSync(file, 'utf8'), context, {filename: file});
  }
  context.readTitleLog_ = () => ({
    rows: teams().flatMap(team => titleRowsFor(team)).map((row, index) => ({...row, row: index + 2})), columns: {}, sheet: {}
  });
  return context;
}

module.exports.installTitleLog = installTitleLog;
