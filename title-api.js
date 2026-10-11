/**
 * TITLE API - the endpoints of the title workflow (TITLE-REVISION-PLAN.md, section 10). JSON only. Each write endpoint resolves who the
 * caller is for the team, then hands the action to titleWrite_ (title-write.js) with the callbacks it needs. The rules themselves live in
 * title-service.js; nothing here decides a workflow state.
 */
const TITLE_DECISIONS_ = Object.freeze({
  guide: {approve: 'guideApprove', return: 'return'},
  reviewer: {approve: 'reviewerApprove', return: 'return'}
});

/** The team's TeamStatus row, by ID. NOT_FOUND when it is not on the roster. */
function titleTeamRow_(teamId) {
  const TS = getColumnMap_(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const row = getSheetRows_(SHEET_NAMES.TEAM_STATUS).find(candidate => candidate[TS.TEAM_ID] && textEquals_(candidate[TS.TEAM_ID], teamId));
  if (!row) throw apiFail_('NOT_FOUND', 'Team not found.');
  return {TS, row};
}

function titleStudentEmails_(row, TS) {
  return [row[TS.S1_EMAIL], row[TS.S2_EMAIL], row[TS.S3_EMAIL], row[TS.S4_EMAIL]].map(value => String(value || '').trim()).filter(Boolean);
}

function titleReviewerEmails_(row, TS) {
  const committee = getCommitteeInfo_(row[TS.COMMITTEE_NUMBER]);
  return committee ? [committee.reviewer1Email, committee.reviewer2Email, committee.reviewer3Email, committee.reviewer4Email].map(value => String(value || '').trim()).filter(Boolean) : [];
}

/**
 * The team's row for a signed-in caller. A team that does not exist is NOT_FOUND only for a coordinator; anyone else is told they have
 * no access, so the answer does not reveal which team IDs exist.
 */
function titleTeamRowFor_(teamId, as) {
  const email = Session.getActiveUser().getEmail();
  if (!email) throw apiFail_('UNAUTHENTICATED', 'Could not identify your account.');
  try { return titleTeamRow_(teamId); }
  catch (error) {
    if (error && error.apiCode === 'NOT_FOUND' && !activityIsCoordinator_(email)) throw apiFail_('UNAUTHORIZED', as ? TITLE_ROLE_REFUSALS_[as] : 'You do not have access to this team.');
    throw error;
  }
}

/** What the signed-in person is for this team, read fresh from the roster and the committee. */
function titleRolesFor_(email, row, TS) {
  return {
    student: titleStudentEmails_(row, TS).some(candidate => emailsMatch_(candidate, email)),
    guide: emailsMatch_(row[TS.GUIDE_EMAIL], email),
    reviewer: titleReviewerEmails_(row, TS).some(candidate => emailsMatch_(candidate, email)),
    coordinator: !!activityIsCoordinator_(email)
  };
}

const TITLE_ROLE_REFUSALS_ = Object.freeze({
  student: 'You are not a member of this team.', guide: 'You are not the recorded guide for this team.',
  reviewer: 'You are not an assigned reviewer for this team.', coordinator: 'Coordinator access is required.'
});

/**
 * The authorize callback for titleWrite_: signed in, on this team in the role the endpoint is for. Only that role is returned, so a
 * person who is a guide and a coordinator cannot act as one through the other's endpoint.
 */
function titleAuthorizer_(as) {
  return teamId => {
    const email = Session.getActiveUser().getEmail();
    if (!email) throw apiFail_('UNAUTHENTICATED', 'Could not identify your account.');
    const {TS, row} = titleTeamRow_(teamId);
    const roles = titleRolesFor_(email, row, TS);
    if (!roles[as]) throw apiFail_('UNAUTHORIZED', TITLE_ROLE_REFUSALS_[as]);
    return {actor: email, roles: {[as]: true}};
  };
}

/** Registry rows for the similarity check. A registry that cannot be read refuses the save. */
function titleRegistryRows_() {
  try { return getHubRegistrySheet_().getDataRange().getValues().slice(1); }
  catch (error) {
    console.error('Master registry could not be read: ' + (error && error.message || error));
    throw apiFail_('UNAVAILABLE', 'Could not check the master registry for title similarity. Please try again. Nothing was saved.');
  }
}

function titleSimilarityContext_(teamId, index, semester) {
  return {registryRows: titleRegistryRows_(), academicYear: getAcademicYear_(), semester, others: titleOtherTeamTitles_(index, teamId)};
}

/** Mail for an event (TITLE-REVISION-PLAN.md section 10). Runs after the lock is released; a failure becomes a warning. */
function titleNotify_(event) {
  const {TS, row} = titleTeamRow_(event.teamId);
  const students = titleStudentEmails_(row, TS), guide = String(row[TS.GUIDE_EMAIL] || '').trim();
  const url = getDashboardUrl_(), teamId = event.teamId, after = event.row;
  const send = (to, subject, body) => { const list = [].concat(to).filter(Boolean); if (list.length) MailApp.sendEmail(list.join(','), subject, body + '\n\nOpen the dashboard: ' + url); };
  const noted = after.notes ? '\n\nNote: ' + after.notes : '';
  if (event.action === 'submit') {
    send(guide, 'New/Updated Title Submission - Team ' + teamId, 'Team ' + teamId + ' submitted "' + after.title + '" for your review.');
  } else if (event.action === 'guideApprove') {
    send(getCoordinatorEmail_(), 'Guide-Approved Title - Team ' + teamId, 'Team ' + teamId + "'s title \"" + after.title + '" has been approved by the guide.');
    if (after.title !== event.state.proposal.title) {
      send(students, 'Your Guide Updated Your Project Title - Team ' + teamId, 'Original: "' + event.state.proposal.title + '"\nUpdated: "' + after.title + '"');
    }
  } else if (event.action === 'return') {
    const byReviewer = event.state.status === 'AWAITING_REVIEWER';
    send(byReviewer ? [guide, ...students] : students, (byReviewer ? 'Reviewer Requested Revision' : 'Title Returned by Guide') + ' - Team ' + teamId,
      'The title "' + after.title + '" was returned for changes. Please update it and resubmit.' + noted);
  } else if (event.action === 'reviewerApprove') {
    send([guide, ...students], 'Project Title Approved - Team ' + teamId, 'Your project title "' + after.approvedTitle + '" has final approval. Begin weekly logging.');
  } else if (event.action === 'reopen') {
    send([guide, ...students], 'Project Title Reopened - Team ' + teamId, 'The approved title was reopened by the coordinator so it can be changed.' + noted);
  } else if (event.action === 'cancelReopen') {
    send([guide, ...students], 'Title Reopening Cancelled - Team ' + teamId, 'The approved title "' + after.approvedTitle + '" stays in effect.' + noted);
  }
}

/** Tells the coordinator about an attempt by someone who is not allowed (the old paths did the same). Never fails the request. */
function titleReportRefusal_(error, label, teamId) {
  if (!error || error.apiCode !== 'UNAUTHORIZED') return;
  try {
    MailApp.sendEmail(getCoordinatorEmail_(), 'Unauthorized Title Attempt - Team ' + teamId,
      (Session.getActiveUser().getEmail() || 'Someone') + ' tried to ' + label + ' for Team ' + teamId + ' and was refused: ' + error.message);
  } catch (mailError) { console.error('Could not report a refused title attempt: ' + (mailError && mailError.message || mailError)); }
}

/** Runs one title action as `as`. `input` is the browser's object: {requestId, expectedRevision, ...fields}. */
function titleRun_(as, action, teamId, input, label) {
  input = input && typeof input === 'object' ? input : {};
  const team = titleTeamRowFor_(teamId, as);
  const semester = team.row[team.TS.SEMESTER], resolved = String(team.row[team.TS.TEAM_ID]).trim();
  const deps = {
    authorize: titleAuthorizer_(as),
    similarityContext: (id, index) => titleSimilarityContext_(id, index, semester),
    notify: titleNotify_
  };
  if (action === 'submit') {
    deps.unmetRequirements = state => {
      const activity = state.reopened ? 'title.resubmit' : 'title.submit';
      return activityUnmetMessages_(activityPreconditions_(activity, {teamId: resolved, semester}, activityContext_()));
    };
  }
  try {
    return titleWrite_({action, teamId: resolved, requestId: input.requestId, expectedRevision: input.expectedRevision, input}, deps);
  } catch (error) {
    titleReportRefusal_(error, label, resolved);
    throw error;
  }
}

function API_student_submitTitle(input) {
  return apiHandle_(() => {
    const student = studentAccessOrThrow_();
    return titleRun_('student', 'submit', student.teamId, input, 'submit a title');
  });
}

function titleDecisionAction_(as, input) {
  const decision = input && typeof input === 'object' ? String(input.decision || '') : '';
  const action = TITLE_DECISIONS_[as][decision];
  if (!action) throw apiFail_('INVALID_INPUT', 'Choose approve or return.');
  if (input.editedTitle && action !== 'guideApprove') throw apiFail_('INVALID_INPUT', 'Only a guide approval can edit the title.');
  return action;
}

function API_guide_decideTitle(input) {
  return apiHandle_(() => titleRun_('guide', titleDecisionAction_('guide', input), input && input.teamId, input, 'decide a title'));
}

function API_reviewer_decideTitle(input) {
  return apiHandle_(() => titleRun_('reviewer', titleDecisionAction_('reviewer', input), input && input.teamId, input, 'decide a title'));
}

function API_coordinator_reopenTitle(input) {
  return apiHandle_(() => titleRun_('coordinator', 'reopen', input && input.teamId, input, 'reopen a title'));
}

function API_coordinator_cancelReopen(input) {
  return apiHandle_(() => titleRun_('coordinator', 'cancelReopen', input && input.teamId, input, 'cancel a reopening'));
}

// ---- reading ---------------------------------------------------------------------------------------------------------------

function titleIso_(ms) {
  return ms === null || ms === undefined || !Number.isFinite(ms) ? null : new Date(ms).toISOString();
}

/** One capability: the built-in rule's answer, plus the activity's checklist where it applies (a student's own team only). */
function titleCapability_(state, action, user, activity, checklist) {
  const built = titleCanDo_(state, action, user);
  const cap = {allowed: built.allowed, reason: built.reason, activity: activity || null, requirements: []};
  if (built.allowed && activity && checklist) {
    const result = studentRequirements_(checklist);
    cap.requirements = result.requirements;
    if (!result.allowed) { cap.allowed = false; cap.reason = result.reason; }
  }
  return cap;
}

/** The approve and return capabilities depend on the stage, so each is asked as whichever role the stage needs. */
function titleDecisionCapability_(state, roles, which) {
  const stageAction = which === 'approve' ? (state.status === 'AWAITING_REVIEWER' ? 'reviewerApprove' : 'guideApprove') : 'return';
  return titleCapability_(state, stageAction, {roles}, null, null);
}

/**
 * The Title DTO (TITLE-REVISION-PLAN.md, section 10). `viewer` = {email, roles}. Staff see presence only of documents and a student sees
 * only its own team; the coordinator also gets the history.
 */
function buildTitleDto_(teamId, viewer, ctx) {
  const state = titleStateFromIndex_(readTitleIndex_(), teamId);
  const {TS, row} = titleTeamRow_(teamId);
  const semester = row[TS.SEMESTER], roles = viewer.roles;
  let checklist = null, activity = null;
  if (roles.student) {
    activity = state.reopened ? 'title.resubmit' : 'title.submit';
    if (titleCanDo_(state, 'submit', {roles}).allowed) checklist = activityPreconditions_(activity, {teamId: String(row[TS.TEAM_ID]).trim(), semester}, ctx);
  }
  const team = {teamId: String(row[TS.TEAM_ID]).trim(), semester};
  let folderUrl = '';
  try { const folder = findTeamFolder_(teamId, semester); folderUrl = folder ? String(folder.getUrl()) : ''; } catch (error) { folderUrl = ''; }
  const dto = {
    teamId: state.teamId, revision: state.revision, status: state.status, reopened: state.reopened,
    proposal: {title: state.proposal.title, problem: state.proposal.problem}, notes: state.notes, similarityNote: state.similarityNote,
    approved: {value: state.approved.value, title: state.approved.title, problem: state.approved.problem, at: titleIso_(state.approved.at), by: state.approved.by},
    reopen: state.reopen ? {reason: state.reopen.reason, by: state.reopen.by, at: titleIso_(state.reopen.at)} : null,
    folderUrl,
    documents: documentStatusList_(team, roles.student, ctx),
    history: roles.coordinator ? state.rows.map(item => ({revision: item.revision, action: item.action, actor: item.actor, at: titleIso_(item.timestamp), notes: item.notes})) : [],
    can: {
      submit: titleCapability_(state, 'submit', {roles}, activity, checklist),
      approve: titleDecisionCapability_(state, roles, 'approve'),
      return: titleDecisionCapability_(state, roles, 'return'),
      upload: (() => { const capability = documentUploadCapability_(state, roles, team, ctx); return {work: capability, need: capability}; })(),
      reopen: titleCapability_(state, 'reopen', {roles}, null, null),
      cancel: titleCapability_(state, 'cancelReopen', {roles}, null, null)
    }
  };
  return dto;
}

/** API_title_get(teamId?): any signed-in person with a role on the team. A student sees its own team only. */
function API_title_get(teamId) {
  return apiHandle_(() => {
    const email = Session.getActiveUser().getEmail();
    if (!email) throw apiFail_('UNAUTHENTICATED', 'Could not identify your account.');
    let id = String(teamId === null || teamId === undefined ? '' : teamId).trim();
    if (!id) {
      const own = studentAccessOrThrow_();
      id = String(own.teamId);
    }
    const {TS, row} = titleTeamRowFor_(id, null);
    const roles = titleRolesFor_(email, row, TS);
    if (!roles.student && !roles.guide && !roles.reviewer && !roles.coordinator) throw apiFail_('UNAUTHORIZED', 'You do not have access to this team.');
    return buildTitleDto_(String(row[TS.TEAM_ID]).trim(), {email, roles}, activityContext_());
  });
}
