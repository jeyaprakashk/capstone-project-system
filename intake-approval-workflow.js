/**
 * INTAKE & APPROVAL WORKFLOW
 * Form handlers, validation, decision logic, email reminders
 * Uses common-helpers, common-constants
 */

const COORDINATOR_EMAIL = getCoordinatorEmail_();
const ACADEMIC_YEAR = getAcademicYear_();
const HUB_SHEET_ID = getConfig_('HUB_SHEET_ID');

// ===================================================================
// TEAM INTAKE FORM HANDLER
// ===================================================================
function onTeamIntakeSubmit(e) {
  requireTriggerOrOperator_();
  if (!textEquals_(e.range.getSheet().getName(), SHEET_NAMES.TEAM_INTAKE_RAW)) return;
  // Release 0 (TITLE-REVISION-PLAN.md, section 11): the write takes the script lock and rereads TITLE_CUTOVER under it.
  return withTitleWriteLock_(30000, 'Title updates are busy. This submission was not applied.', () => applyTeamIntakeSubmission_(e));
}

function applyTeamIntakeSubmission_(e) {
  const normalizeLabel = (s) => String(s).trim().toLowerCase();
  const namedValuesNormalized = {};
  Object.keys(e.namedValues).forEach(k => { namedValuesNormalized[normalizeLabel(k)] = e.namedValues[k]; });
  const nv = (label) => {
    const match = namedValuesNormalized[normalizeLabel(label)];
    return (match && match[0]) || '';
  };

  const submitterEmail = nv('Email Address');
  const teamId = nv('Team ID');
  const title = nv('Project Title');
  const problem = nv('Problem Statement');
  const workBreakdownLink = driveFileUrl_(nv('Work Breakdown Document'));
  const needAnalysisLink = driveFileUrl_(nv('Need Analysis Report'));

  const TS = getColumnMap_(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const statusSheet = getSheet_(SHEET_NAMES.TEAM_STATUS);
  const statusRow = findTeamStatusRow_(statusSheet, teamId, TS);

  if (statusRow === -1) {
    MailApp.sendEmail(submitterEmail, 'Team ID Not Recognized',
      `The Team ID "${teamId}" does not match any team on record. Please check with your guide and resubmit.`);
    return;
  }

  // Header-based columns can be reordered; decisions may follow Reviewer Notes.
  const rosterRow = readSheetRows_(statusSheet, statusRow, 1)[0];
  const validEmails = [rosterRow[TS.S1_EMAIL], rosterRow[TS.S2_EMAIL], rosterRow[TS.S3_EMAIL], rosterRow[TS.S4_EMAIL]]
    .filter(Boolean).map(normalizeEmail_);
  if (!validEmails.includes(normalizeEmail_(submitterEmail))) {
    const guideEmail = rosterRow[TS.GUIDE_EMAIL];
    MailApp.sendEmail(submitterEmail, `Team ID Mismatch — Not a Member of Team ${teamId}`,
      `Your email is not on record as a member of Team ${teamId}. This submission was NOT applied.`);
    MailApp.sendEmail(guideEmail, `Intake Mismatch Attempt — Team ${teamId}`,
      `${submitterEmail} attempted to submit a title for Team ${teamId} but is not on that team's roster.`);
    return;
  }

  if (textEquals_(rosterRow[TS.GUIDE_DECISION], 'Approved')) {
    MailApp.sendEmail(submitterEmail, `Title Already Approved by Guide — Team ${teamId}`,
      `Team ${teamId}'s title has already been approved and cannot be changed.`);
    return;
  }
  if (textEquals_(rosterRow[TS.REVIEWER_DECISION], 'Approved')) {
    MailApp.sendEmail(submitterEmail, `Title Already Approved — Team ${teamId}`,
      `Team ${teamId}'s title has already been fully approved and cannot be changed.`);
    return;
  }

  if (rosterRow[TS.TITLE] && !rosterRow[TS.GUIDE_DECISION] && !textEquals_(rosterRow[TS.REVIEWER_DECISION], 'Revise')) {
    MailApp.sendEmail(submitterEmail, `Title Currently Under Review — Team ${teamId}`,
      `Team ${teamId}'s title is currently awaiting your guide's review and cannot be changed right now.`);
    return;
  }

  const registry = getHubRegistrySheet_().getDataRange().getValues().slice(1);
  let bestMatchHub = { score: 0, title: '', context: '' };
  registry.forEach(r => {
    const score = similarity_(title, r[4]);
    if (score > bestMatchHub.score) bestMatchHub = { score, title: r[4], context: `${r[0]} - ${r[1]}` };
  });

  if (bestMatchHub.score >= 0.75) {
    MailApp.sendEmail(submitterEmail, `Title Too Similar to a Past Project — Team ${teamId}`,
      `Your proposed title is ${Math.round(bestMatchHub.score * 100)}% similar to: "${bestMatchHub.title}" (${bestMatchHub.context}). ` +
      `Please revise and resubmit via your team dashboard:\n\n${getDashboardUrl_()}`);
    return;
  }

  let bestMatchOverall = bestMatchHub;
  const allStatusRows = statusSheet.getDataRange().getValues();
  allStatusRows.forEach((r, i) => {
    if (i === 0 || textEquals_(r[TS.TEAM_ID], teamId) || !r[TS.TITLE]) return;
    const score = similarity_(title, r[TS.TITLE]);
    if (score > bestMatchOverall.score) bestMatchOverall = { score, title: r[TS.TITLE], context: `Team ${r[TS.TEAM_ID]}, this semester` };
  });

  setStatusFields_(statusSheet, statusRow, {
    TITLE: title.replace(/^[\s'"\u2018\u2019\u201c\u201d]+|[\s'"\u2018\u2019\u201c\u201d]+$/g, '').toUpperCase(), PROBLEM: problem,
    WORK_BREAKDOWN_LINK: workBreakdownLink, NEED_ANALYSIS_LINK: needAnalysisLink
  }, TS);
  setStatusFields_(statusSheet, statusRow, {
    SIMILARITY_FLAG: '', GUIDE_DECISION: '', GUIDE_NOTES: '', REVIEWER_DECISION: '', REVIEWER_NOTES: ''
  }, TS);

  if (bestMatchOverall.score > 0) {
    const flagText = `${Math.round(bestMatchOverall.score * 100)}% similar to "${bestMatchOverall.title}" (${bestMatchOverall.context})`;
    statusSheet.getRange(statusRow, TS.SIMILARITY_FLAG + 1).setValue(flagText);
  }

  const guideEmail = rosterRow[TS.GUIDE_EMAIL];
  MailApp.sendEmail(guideEmail, `New/Updated Title Submission — Team ${teamId}`,
    `Team ${teamId} submitted "${title}" for your review.\n\nReview it here:\n${getDashboardUrl_()}`);
}

// ===================================================================
// GUIDE DECISION LOGIC
// ===================================================================
function applyGuideDecision_(teamId, decision, notes, submitterEmail, editedTitle) {
  decision = ['Approved','Rejected','Revise'].find(value => textEquals_(value, decision)) || decision;
  const TS = getColumnMap_(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const statusSheet = getSheet_(SHEET_NAMES.TEAM_STATUS);
  const statusRow = findTeamStatusRow_(statusSheet, teamId, TS);
  if (statusRow === -1) return { ok: false, message: `Team ${teamId} not found.` };

  const rowData = readSheetRows_(statusSheet, statusRow, 1)[0];
  const recordedGuideEmail = rowData[TS.GUIDE_EMAIL];
  if (!emailsMatch_(submitterEmail, recordedGuideEmail)) {
    MailApp.sendEmail(COORDINATOR_EMAIL, `Unauthorized Guide Decision Attempt — Team ${teamId}`,
      `${submitterEmail} submitted a Guide Decision for Team ${teamId}, but the recorded guide is ${recordedGuideEmail}.`);
    return { ok: false, message: `You are not the recorded guide for Team ${teamId}.` };
  }

  let title = rowData[TS.TITLE];
  const studentEmails = [
    rowData[TS.S1_EMAIL],
    rowData[TS.S2_EMAIL],
    rowData[TS.S3_EMAIL],
    rowData[TS.S4_EMAIL]
  ].filter(Boolean);

  let titleWasEdited = false;
  if (editedTitle && editedTitle.trim() && editedTitle.trim() !== String(title).trim()) {
    const originalTitle = title;
    title = editedTitle.trim().toUpperCase();
    
    // RECALCULATE SIMILARITY FLAG WITH NEW TITLE (check both master registry and current semester teams)
    let bestMatch = { score: 0, title: '', context: '' };
    
    // Check master registry
    try {
      const registry = getHubRegistrySheet_().getDataRange().getValues().slice(1);
      registry.forEach(r => {
        const score = similarity_(title, r[4]);
        if (score > bestMatch.score) bestMatch = { score, title: r[4], context: `${r[0]} - ${r[1]}` };
      });
    } catch (err) {
      return { ok: false, message: 'Could not check the master registry for title similarity. Please try again. Your title and decision were not saved.' };
    }

    if (bestMatch.score >= 0.75) {
      return { ok: false, message:
        `The edited title is ${Math.round(bestMatch.score * 100)}% similar to: "${bestMatch.title}" (${bestMatch.context}). ` +
        'Please revise the title. Your title and decision were not saved.' };
    }
    
    // Check other team titles in current semester
    const allStatusRows = statusSheet.getDataRange().getValues();
    allStatusRows.forEach((r, i) => {
      if (i === 0 || textEquals_(r[TS.TEAM_ID], teamId) || !r[TS.TITLE]) return;
      const score = similarity_(title, r[TS.TITLE]);
      if (score > bestMatch.score) bestMatch = { score, title: r[TS.TITLE], context: `Team ${r[TS.TEAM_ID]}, this semester` };
    });
    
    statusSheet.getRange(statusRow, TS.TITLE + 1).setValue(title);
    titleWasEdited = true;
    MailApp.sendEmail(studentEmails.join(','), `Your Guide Updated Your Project Title — Team ${teamId}`,
      `Original: "${originalTitle}"\nUpdated: "${title}"`);

    // Clear and update similarity flag
    statusSheet.getRange(statusRow, TS.SIMILARITY_FLAG + 1).setValue('');
    if (bestMatch.score > 0) {
      const flagText = `${Math.round(bestMatch.score * 100)}% similar to "${bestMatch.title}" (${bestMatch.context})`;
      statusSheet.getRange(statusRow, TS.SIMILARITY_FLAG + 1).setValue(flagText);
    }
  }

  setStatusFields_(statusSheet, statusRow, { GUIDE_DECISION: decision, GUIDE_NOTES: notes || '' }, TS);

  if (decision === 'Approved') {
    MailApp.sendEmail(COORDINATOR_EMAIL, `Guide-Approved Title — Team ${teamId}`,
      `Team ${teamId}'s title "${title}" has been approved by the guide.\n\nReview it here: ${getDashboardUrl_()}`);
  } else if (decision === 'Rejected') {
    MailApp.sendEmail(studentEmails.join(','), `Title Rejected by Guide — Team ${teamId}`,
      `Your proposed title "${title}" was not approved.\n\nGuide's note: ${notes || '(see guide for details)'}\n\n` +
      `Please update your title via your team dashboard:\n\n${getDashboardUrl_()}`);
  }

  return { ok: true, message: titleWasEdited ? `Decision recorded and title updated for Team ${teamId}.` : `Decision recorded for Team ${teamId}.` };
}

// ===================================================================
// REVIEWER DECISION LOGIC
// ===================================================================
function applyReviewerDecision_(teamId, decision, notes, submitterEmail) {
  decision = ['Approved','Rejected','Revise'].find(value => textEquals_(value, decision)) || decision;
  const TS = getColumnMap_(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const statusSheet = getSheet_(SHEET_NAMES.TEAM_STATUS);
  const statusRow = findTeamStatusRow_(statusSheet, teamId, TS);
  if (statusRow === -1) return { ok: false, message: `Team ${teamId} not found.` };

  const rowData = readSheetRows_(statusSheet, statusRow, 1)[0];
  const committee = getCommitteeInfo_(rowData[TS.COMMITTEE_NUMBER]);
  const validReviewerEmails = committee
    ? [committee.reviewer1Email, committee.reviewer2Email, committee.reviewer3Email, committee.reviewer4Email]
        .filter(Boolean).map(normalizeEmail_)
    : [];

  if (!validReviewerEmails.includes(normalizeEmail_(submitterEmail))) {
    MailApp.sendEmail(COORDINATOR_EMAIL, `Unauthorized Reviewer Decision Attempt — Team ${teamId}`,
      `${submitterEmail} submitted a Reviewer decision for Team ${teamId}, but is not an assigned reviewer.`);
    return { ok: false, message: `You are not an assigned reviewer for Team ${teamId}.` };
  }

  const guideEmail = rowData[TS.GUIDE_EMAIL];
  const semester = rowData[TS.SEMESTER];
  const title = rowData[TS.TITLE];
  const repoUrl = getRepoUrlForTeam_(teamId);
  const studentEmails = [rowData[TS.S1_EMAIL], rowData[TS.S2_EMAIL], rowData[TS.S3_EMAIL], rowData[TS.S4_EMAIL]].filter(Boolean);

  setStatusFields_(statusSheet, statusRow, { REVIEWER_DECISION: decision, REVIEWER_NOTES: notes || '' }, TS);

  if (decision === 'Approved') {
    setStatusFields_(statusSheet, statusRow, { TITLE_APPROVED_BY: submitterEmail }, TS);
    getHubRegistrySheet_().appendRow([ACADEMIC_YEAR, semester, teamId, guideEmail, title, repoUrl, buildTeamMembersField_(rowData, TS), new Date(), submitterEmail]);
    MailApp.sendEmail([guideEmail, ...studentEmails].join(','), `Project Title Approved — Team ${teamId}`,
      `Your project title "${title}" has final approval. Begin weekly logging.`);
  } else if (decision === 'Revise') {
    statusSheet.getRange(statusRow, TS.GUIDE_DECISION + 1).setValue('');
    MailApp.sendEmail(guideEmail, `Reviewer Requested Revision — Team ${teamId}`,
      `Reviewer's note on "${title}": ${notes || '(see sheet for details)'}\n\nThe team has been notified to resubmit.`);
    MailApp.sendEmail(studentEmails.join(','), `Reviewer Requested Revision — Team ${teamId}`,
      `The Reviewer Committee has asked for changes to your project.\n\nNote: ${notes || '(see your guide for details)'}\n\n` +
      `Please resubmit via your team dashboard:\n\n${getDashboardUrl_()}`);
  }

  return { ok: true, message: `Decision recorded for Team ${teamId}.` };
}

// ===================================================================
// TEAM STATUS SYNC
// ===================================================================
// ===================================================================
// EMAIL DIGESTS
// ===================================================================
function sendReviewerApprovalDigest() {
  requireTriggerOrOperator_();
  const TS = getColumnMap_(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const rows = getSheetRows_(SHEET_NAMES.TEAM_STATUS);
  const pending = rows.filter(r => textEquals_(r[TS.GUIDE_DECISION], 'Approved') && !textEquals_(r[TS.REVIEWER_DECISION], 'Approved'));
  if (pending.length === 0) return;

  const digestByReviewer = {};
  pending.forEach(r => {
    const flag = r[TS.SIMILARITY_FLAG] ? `  [FLAG: ${r[TS.SIMILARITY_FLAG]}]` : '';
    const line = `Team ${r[TS.TEAM_ID]} (Guide: ${r[TS.GUIDE_EMAIL]}) — "${r[TS.TITLE]}"${flag}`;
    const committee = getCommitteeInfo_(r[TS.COMMITTEE_NUMBER]);
    const reviewerEmails = committee
      ? [committee.reviewer1Email, committee.reviewer2Email, committee.reviewer3Email, committee.reviewer4Email]
      : [];
    reviewerEmails.filter(Boolean).forEach(reviewerEmail => {
      digestByReviewer[reviewerEmail] = digestByReviewer[reviewerEmail] || [];
      digestByReviewer[reviewerEmail].push(line);
    });
  });

  Object.entries(digestByReviewer).forEach(([reviewerEmail, lines]) => {
    MailApp.sendEmail(reviewerEmail, `Capstone Title Approvals — ${lines.length} pending`,
      `Guide-approved titles awaiting your decision:\n\n${lines.join('\n')}\n\nReview here: ${getDashboardUrl_()}`);
  });
}

function sendGuideReminderDigest() {
  requireTriggerOrOperator_();
  const TS = getColumnMap_(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const rows = getSheetRows_(SHEET_NAMES.TEAM_STATUS);
  const stillPending = rows.filter(r => r[TS.TITLE] && !r[TS.GUIDE_DECISION]);
  const byGuide = groupBy_(stillPending, r => r[TS.GUIDE_EMAIL]);
  Object.entries(byGuide).forEach(([guideEmail, teams]) => {
    const lines = teams.map(r => `Team ${r[TS.TEAM_ID]} — "${r[TS.TITLE]}"`);
    MailApp.sendEmail(guideEmail, `Reminder: ${teams.length} title(s) awaiting your review`,
      `${lines.join('\n')}\n\nReview here: ${getDashboardUrl_()}`);
  });
}

// ===================================================================
// TRIGGER SETUP
// ===================================================================
