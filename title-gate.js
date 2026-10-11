/**
 * TITLE GATE - the one yes/no answer "does this team have an approved title?" (TITLE-REVISION-PLAN.md, section 2, decision 1).
 * It is derived from TitleLog only. A team's history is validated whenever it is read; a team whose history fails is
 * UNAVAILABLE, and only that team. Nothing here writes.
 */

function titleTeamKey_(teamId) {
  return normalizeText_(teamId);
}

/** The per-team index of parsed rows, with each team's history validated: {teams: {key: {teamId, rows, errors}}}. */
function titleIndex_(rows, nowMs) {
  const teams = Object.create(null);
  rows.forEach(row => {
    const key = titleTeamKey_(row.teamId);
    if (!teams[key]) teams[key] = {teamId: row.teamId, rows: [], errors: []};
    teams[key].rows.push(row);
  });
  Object.keys(teams).forEach(key => {
    teams[key].rows.sort((a, b) => (a.revision - b.revision) || (a.row - b.row));
    teams[key].errors = validateTitleHistory_(teams[key].rows, nowMs);
  });
  return {teams};
}

/** Reads the log and indexes it. Bulk callers read once and pass the index to titleGate_ for each team. */
function readTitleIndex_() {
  return titleIndex_(readTitleLog_().rows, Date.now());
}

function emptyTitleState_(teamId) {
  return {
    teamId: String(teamId), revision: 0, status: 'NOT_SUBMITTED', reopened: false,
    proposal: {title: '', problem: ''}, notes: '', similarityNote: '',
    approved: {value: false, title: '', problem: '', at: null, by: ''}, reopen: null, rows: [], latest: null
  };
}

/** One team's current state from the index. Throws UNAVAILABLE when its history is not valid. */
function titleStateFromIndex_(index, teamId) {
  const team = index.teams[titleTeamKey_(teamId)];
  if (!team) return emptyTitleState_(teamId);
  if (team.errors.length) {
    console.error('Title history for team ' + teamId + ' is not valid: ' + team.errors.join(' | '));
    throw titleUnavailable_('The title history of team ' + teamId + ' is unavailable. Contact the coordinator.');
  }
  const latest = team.rows[team.rows.length - 1];
  const approvedValue = latest.approvedTitle !== '';
  let reopen = null;
  if (latest.reopened) {
    const opening = team.rows.slice().reverse().find(row => row.action === 'REOPEN');
    if (opening) reopen = {reason: opening.notes, by: opening.actor, at: opening.timestamp};
  }
  return {
    teamId: team.teamId, revision: latest.revision, status: latest.status, reopened: latest.reopened === true,
    proposal: {title: latest.title, problem: latest.problem}, notes: latest.notes, similarityNote: latest.similarityNote,
    approved: {value: approvedValue, title: latest.approvedTitle, problem: latest.approvedProblem, at: latest.approvedAt, by: latest.approvedBy},
    reopen, rows: team.rows, latest
  };
}

/** Like titleStateFromIndex_ but returns {state} or {error}, so a list can show one bad team and carry on. */
function titleTryState_(index, teamId) {
  try { return {state: titleStateFromIndex_(index, teamId)}; }
  catch (error) { return {error: error && error.message || String(error)}; }
}

/**
 * {approved, title, problem, approvedAt}. `approved` becomes true at the first final approval and stays true, including while the
 * title is reopened. `title` and `problem` are one pair from one source: the approved pair once approved, otherwise the
 * current proposal. `approvedAt` is the date of the first approval and never moves.
 */
function titleGate_(teamId, index) {
  const state = titleStateFromIndex_(index || readTitleIndex_(), teamId);
  const approved = state.approved.value;
  return {
    approved,
    title: approved ? state.approved.title : state.proposal.title,
    problem: approved ? state.approved.problem : state.proposal.problem,
    approvedAt: approved && state.approved.at !== null ? new Date(state.approved.at) : null
  };
}

/**
 * What a dashboard row needs about one team's title, from one read: the gate answer plus the workflow status, the latest note and
 * the similarity note. `title` and `problem` are the effective pair (the approved pair once approved, otherwise the proposal);
 * `proposal` is the pair the team is working on. Throws UNAVAILABLE like titleGate_.
 */
function titleSummary_(teamId, index) {
  return titleSummaryFromState_(titleStateFromIndex_(index || readTitleIndex_(), teamId));
}

function titleSummaryFromState_(state) {
  const approved = state.approved.value;
  return {
    teamId: state.teamId, revision: state.revision, status: state.status, reopened: state.reopened, approved,
    title: approved ? state.approved.title : state.proposal.title,
    problem: approved ? state.approved.problem : state.proposal.problem,
    approvedAt: approved && state.approved.at !== null ? new Date(state.approved.at) : null,
    approvedBy: approved ? state.approved.by : '',
    proposal: {title: state.proposal.title, problem: state.proposal.problem},
    notes: state.notes, similarityNote: state.similarityNote
  };
}

/** {summary} or {error}, so a list shows one bad team and carries on. */
function titleTrySummary_(teamId, index) {
  try { return {summary: titleSummary_(teamId, index)}; }
  catch (error) { return {error: error && error.message || String(error)}; }
}
