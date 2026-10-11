// Phase 0 of TITLE-REVISION-PLAN.md: every TeamStatus title/decision combination that today's downstream code can see.
// The old model stores a title (blank or not), a Guide Decision and a Reviewer Decision; getTeamStatus_ turns them into a status.
// These states are the inputs of the golden masters in ./snapshots (captured from the code before any title change).
const TITLES = [{key: 'no', value: ''}, {key: 'yes', value: 'Project'}];
const GUIDE_DECISIONS = ['', 'Approved', 'Rejected', 'Revise'];
const REVIEWER_DECISIONS = ['', 'Approved', 'Revise', 'Rejected'];

function combos() {
  const list = [];
  for (const title of TITLES) for (const guide of GUIDE_DECISIONS) for (const reviewer of REVIEWER_DECISIONS) {
    list.push({id: `title=${title.key} guide=${guide || '-'} reviewer=${reviewer || '-'}`, title: title.value, guide, reviewer});
  }
  return list;
}

/** Evaluates an expression inside a vm context; top-level const and let declarations are not properties of the context. */
const inside = (context, expression) => require('node:vm').runInContext(expression, context);

module.exports = {combos, inside};
