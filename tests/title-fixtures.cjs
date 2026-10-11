// Builders for TitleLog rows used by the title tests. They follow archive/plans/TITLE-REVISION-PLAN.md sections 4 and 5 directly and do not use
// the production code, so the history rules and the service are checked against an independent description of the log.
const HOUR = 3600000;
const T0 = Date.parse('2026-01-02T10:00:00Z');
const NOW = Date.parse('2026-02-01T00:00:00Z');

function row(overrides = {}) {
  return {
    row: 2, timestamp: T0, teamId: 'T1', revision: 1, action: 'SUBMIT', actor: 'student@example.com', requestId: 'req-1', fingerprint: 'fp-1',
    status: 'NEEDS_REVIEW', title: 'A TITLE', problem: 'A problem statement', notes: '', similarityNote: '', reopened: false,
    approvedTitle: '', approvedProblem: '', approvedAt: null, approvedBy: '', ...overrides
  };
}

const ACTOR_BY_ACTION = {BASELINE: 'coordinator@example.com', SUBMIT: 'student@example.com', GUIDE_APPROVE: 'guide@example.com', RETURN: 'guide@example.com',
  REVIEWER_APPROVE: 'reviewer@example.com', REOPEN: 'coordinator@example.com', CANCEL_REOPEN: 'coordinator@example.com'};

/**
 * A valid history from a list of steps. A step is an action name or {action, title?, problem?, actor?, notes?}.
 * 'BASELINE:STATUS' starts the history with a baseline of that status (an APPROVED baseline carries approved fields).
 */
function history(steps, {teamId = 'T1', start = T0, baselineTitle = 'BASE TITLE', baselineProblem = 'Base problem', approvedAtOffset = -HOUR} = {}) {
  const rows = [];
  let state = {status: 'NOT_SUBMITTED', reopened: false, title: '', problem: '', approvedTitle: '', approvedProblem: '', approvedAt: null, approvedBy: '', notes: '', similarityNote: ''};
  steps.forEach((step, index) => {
    const spec = typeof step === 'string' ? {action: step} : step;
    const timestamp = start + index * HOUR;
    const next = {...state};
    let action = spec.action;
    if (action.startsWith('BASELINE')) {
      const status = action.split(':')[1] || 'NOT_SUBMITTED';
      action = 'BASELINE';
      next.status = status;
      if (status !== 'NOT_SUBMITTED') { next.title = baselineTitle; next.problem = baselineProblem; }
      if (status === 'APPROVED') { next.approvedTitle = baselineTitle; next.approvedProblem = baselineProblem; next.approvedAt = timestamp + approvedAtOffset; next.approvedBy = 'reviewer@example.com'; }
    } else if (action === 'SUBMIT') {
      next.status = 'NEEDS_REVIEW'; next.title = spec.title || 'A TITLE'; next.problem = spec.problem === undefined ? 'A problem statement' : spec.problem; next.notes = ''; next.similarityNote = spec.similarityNote || '';
    } else if (action === 'GUIDE_APPROVE') {
      next.status = 'AWAITING_REVIEWER'; if (spec.title) next.title = spec.title; next.notes = spec.notes || '';
    } else if (action === 'RETURN') {
      next.status = 'RETURNED'; next.notes = spec.notes || 'Please revise.';
    } else if (action === 'REVIEWER_APPROVE') {
      next.status = 'APPROVED'; next.reopened = false;
      next.approvedTitle = next.title; next.approvedProblem = next.problem; next.approvedBy = spec.actor || 'reviewer@example.com';
      if (next.approvedAt === null) next.approvedAt = timestamp;
    } else if (action === 'REOPEN') {
      next.status = 'REOPENED'; next.reopened = true; next.notes = spec.notes || 'Reopened for a change.';
    } else if (action === 'CANCEL_REOPEN') {
      next.status = 'APPROVED'; next.reopened = false; next.title = next.approvedTitle; next.problem = next.approvedProblem; next.notes = spec.notes || 'Cancelled.';
    } else throw new Error('Unknown step ' + action);
    rows.push(row({
      row: index + 2, timestamp, teamId, revision: index + 1, action, actor: spec.actor || ACTOR_BY_ACTION[action],
      requestId: action === 'BASELINE' ? 'baseline:' + teamId : 'req-' + teamId + '-' + (index + 1),
      fingerprint: action === 'BASELINE' ? '' : 'fp-' + (index + 1), status: next.status, title: next.title, problem: next.problem, notes: next.notes,
      similarityNote: next.similarityNote, reopened: next.reopened, approvedTitle: next.approvedTitle, approvedProblem: next.approvedProblem,
      approvedAt: next.approvedAt, approvedBy: next.approvedBy
    }));
    state = next;
  });
  return rows;
}

module.exports = {HOUR, T0, NOW, row, history};
