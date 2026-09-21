/**
 * INTAKE & APPROVAL WORKFLOW
 * Form handlers, validation, decision logic, email reminders
 * Uses common-helpers, common-constants
 */

const COORDINATOR_EMAIL = getCoordinatorEmail();
const ACADEMIC_YEAR = getAcademicYear();
const HUB_SHEET_ID = getConfig('HUB_SHEET_ID');

// ===================================================================
// TEAM INTAKE FORM HANDLER
// ===================================================================
function onTeamIntakeSubmit(e) {
  if (!textEquals_(e.range.getSheet().getName(), SHEET_NAMES.TEAM_INTAKE_RAW)) return;

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
  const workBreakdownLink = driveFileUrl(nv('Work Breakdown Document'));
  const needAnalysisLink = driveFileUrl(nv('Need Analysis Report'));

  const TS = getColumnMap(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const statusSheet = getSheet(SHEET_NAMES.TEAM_STATUS);
  const statusRow = findTeamStatusRow(statusSheet, teamId, TS);

  if (statusRow === -1) {
    MailApp.sendEmail(submitterEmail, 'Team ID Not Recognized',
      `The Team ID "${teamId}" does not match any team on record. Please check with your guide and resubmit.`);
    return;
  }

  const rosterRow = statusSheet.getRange(statusRow, 1, 1, TS.REVIEWER_NOTES + 1).getValues()[0];
  const validEmails = [rosterRow[TS.S1_EMAIL], rosterRow[TS.S2_EMAIL], rosterRow[TS.S3_EMAIL], rosterRow[TS.S4_EMAIL]]
    .filter(Boolean).map(normalizeEmail);
  if (!validEmails.includes(normalizeEmail(submitterEmail))) {
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

  const registry = getHubRegistrySheet().getDataRange().getValues().slice(1);
  let bestMatchHub = { score: 0, title: '', context: '' };
  registry.forEach(r => {
    const score = similarity(title, r[4]);
    if (score > bestMatchHub.score) bestMatchHub = { score, title: r[4], context: `${r[0]} - ${r[1]}` };
  });

  if (bestMatchHub.score >= 0.30) {
    MailApp.sendEmail(submitterEmail, `Title Too Similar to a Past Project — Team ${teamId}`,
      `Your proposed title is ${Math.round(bestMatchHub.score * 100)}% similar to: "${bestMatchHub.title}" (${bestMatchHub.context}). ` +
      `Please revise and resubmit via your team dashboard:\n\n${getDashboardUrl()}`);
    return;
  }

  let bestMatchOverall = bestMatchHub;
  const allStatusRows = statusSheet.getDataRange().getValues();
  allStatusRows.forEach((r, i) => {
    if (i === 0 || textEquals_(r[TS.TEAM_ID], teamId) || !r[TS.TITLE]) return;
    const score = similarity(title, r[TS.TITLE]);
    if (score > bestMatchOverall.score) bestMatchOverall = { score, title: r[TS.TITLE], context: `Team ${r[TS.TEAM_ID]}, this semester` };
  });

  setStatusFields(statusSheet, statusRow, {
    TITLE: title.toUpperCase(), PROBLEM: problem,
    WORK_BREAKDOWN_LINK: workBreakdownLink, NEED_ANALYSIS_LINK: needAnalysisLink
  }, TS);
  setStatusFields(statusSheet, statusRow, {
    SIMILARITY_FLAG: '', GUIDE_DECISION: '', GUIDE_NOTES: '', REVIEWER_DECISION: '', REVIEWER_NOTES: ''
  }, TS);

  if (bestMatchOverall.score > 0) {
    const flagText = `${Math.round(bestMatchOverall.score * 100)}% similar to "${bestMatchOverall.title}" (${bestMatchOverall.context})`;
    statusSheet.getRange(statusRow, TS.SIMILARITY_FLAG + 1).setValue(flagText);
  }

  const guideEmail = statusSheet.getRange(statusRow, TS.GUIDE_EMAIL + 1).getValue();
  MailApp.sendEmail(guideEmail, `New/Updated Title Submission — Team ${teamId}`,
    `Team ${teamId} submitted "${title}" for your review.\n\nReview it here:\n${getDashboardUrl()}`);
}

// ===================================================================
// GITHUB USERNAME REGISTRATION FORM HANDLER
// ===================================================================
function onGithubUsernameSubmit(e) {
  if (!textEquals_(e.range.getSheet().getName(), SHEET_NAMES.GITHUB_USERNAME_RAW)) return;
  const [, submitterEmail, teamId, githubUsername] = e.values;

  const TS = getColumnMap(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const statusSheet = getSheet(SHEET_NAMES.TEAM_STATUS);
  const statusRow = findTeamStatusRow(statusSheet, teamId, TS);

  if (statusRow === -1) {
    MailApp.sendEmail(submitterEmail, 'Team ID Not Recognized',
      `The Team ID "${teamId}" does not match any team on record. Please check with your guide and resubmit.`);
    return;
  }

  const rosterRow = statusSheet.getRange(statusRow, 1, 1, TS.S4_EMAIL + 1).getValues()[0];
  const validEmails = [rosterRow[TS.S1_EMAIL], rosterRow[TS.S2_EMAIL], rosterRow[TS.S3_EMAIL], rosterRow[TS.S4_EMAIL]]
    .filter(Boolean).map(normalizeEmail);

  if (!validEmails.includes(normalizeEmail(submitterEmail))) {
    MailApp.sendEmail(submitterEmail, `Team ID Mismatch — Not a Member of Team ${teamId}`,
      `Your email is not on record as a member of Team ${teamId}. This submission was NOT applied.`);
    return;
  }

  MailApp.sendEmail(submitterEmail, `GitHub Username Recorded — Team ${teamId}`,
    `Your GitHub username (${githubUsername}) has been recorded. Once every teammate has submitted theirs, ` +
    `your team's private repository will be created.`);

  provisionAllTeamRepos();
}

// ===================================================================
// GUIDE DECISION LOGIC
// ===================================================================
function applyGuideDecision(teamId, decision, notes, submitterEmail, editedTitle) {
  decision = ['Approved','Rejected','Revise'].find(value => textEquals_(value, decision)) || decision;
  const TS = getColumnMap(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const statusSheet = getSheet(SHEET_NAMES.TEAM_STATUS);
  const statusRow = findTeamStatusRow(statusSheet, teamId, TS);
  if (statusRow === -1) return { ok: false, message: `Team ${teamId} not found.` };

  const recordedGuideEmail = statusSheet.getRange(statusRow, TS.GUIDE_EMAIL + 1).getValue();
  if (!emailsMatch(submitterEmail, recordedGuideEmail)) {
    MailApp.sendEmail(COORDINATOR_EMAIL, `Unauthorized Guide Decision Attempt — Team ${teamId}`,
      `${submitterEmail} submitted a Guide Decision for Team ${teamId}, but the recorded guide is ${recordedGuideEmail}.`);
    return { ok: false, message: `You are not the recorded guide for Team ${teamId}.` };
  }

  let title = statusSheet.getRange(statusRow, TS.TITLE + 1).getValue();
  const studentEmails = [
    statusSheet.getRange(statusRow, TS.S1_EMAIL + 1, 1, 1).getValue(),
    statusSheet.getRange(statusRow, TS.S2_EMAIL + 1, 1, 1).getValue(),
    statusSheet.getRange(statusRow, TS.S3_EMAIL + 1, 1, 1).getValue(),
    statusSheet.getRange(statusRow, TS.S4_EMAIL + 1, 1, 1).getValue()
  ].filter(Boolean);

  let titleWasEdited = false;
  if (editedTitle && editedTitle.trim() && editedTitle.trim() !== String(title).trim()) {
    const originalTitle = title;
    title = editedTitle.trim().toUpperCase();
    statusSheet.getRange(statusRow, TS.TITLE + 1).setValue(title);
    titleWasEdited = true;
    MailApp.sendEmail(studentEmails.join(','), `Your Guide Updated Your Project Title — Team ${teamId}`,
      `Original: "${originalTitle}"\nUpdated: "${title}"`);
    
    // RECALCULATE SIMILARITY FLAG WITH NEW TITLE (check both master registry and current semester teams)
    let bestMatch = { score: 0, title: '', context: '' };
    
    // Check master registry
    try {
      const registry = getHubRegistrySheet().getDataRange().getValues().slice(1);
      registry.forEach(r => {
        const score = similarity(title, r[4]);
        if (score > bestMatch.score) bestMatch = { score, title: r[4], context: `${r[0]} - ${r[1]}` };
      });
    } catch (err) {
      Logger.log(`Warning: Could not check master registry: ${err.message}`);
    }
    
    // Check other team titles in current semester
    const allStatusRows = statusSheet.getDataRange().getValues();
    allStatusRows.forEach((r, i) => {
      if (i === 0 || textEquals_(r[TS.TEAM_ID], teamId) || !r[TS.TITLE]) return;
      const score = similarity(title, r[TS.TITLE]);
      if (score > bestMatch.score) bestMatch = { score, title: r[TS.TITLE], context: `Team ${r[TS.TEAM_ID]}, this semester` };
    });
    
    // Clear and update similarity flag
    statusSheet.getRange(statusRow, TS.SIMILARITY_FLAG + 1).setValue('');
    if (bestMatch.score > 0) {
      const flagText = `${Math.round(bestMatch.score * 100)}% similar to "${bestMatch.title}" (${bestMatch.context})`;
      statusSheet.getRange(statusRow, TS.SIMILARITY_FLAG + 1).setValue(flagText);
    }
  }

  setStatusFields(statusSheet, statusRow, { GUIDE_DECISION: decision, GUIDE_NOTES: notes || '' }, TS);

  if (decision === 'Approved') {
    MailApp.sendEmail(COORDINATOR_EMAIL, `Guide-Approved Title — Team ${teamId}`,
      `Team ${teamId}'s title "${title}" has been approved by the guide.\n\nReview it here: ${getDashboardUrl()}`);
  } else if (decision === 'Rejected') {
    MailApp.sendEmail(studentEmails.join(','), `Title Rejected by Guide — Team ${teamId}`,
      `Your proposed title "${title}" was not approved.\n\nGuide's note: ${notes || '(see guide for details)'}\n\n` +
      `Please update your title via your team dashboard:\n\n${getDashboardUrl()}`);
  }

  return { ok: true, message: titleWasEdited ? `Decision recorded and title updated for Team ${teamId}.` : `Decision recorded for Team ${teamId}.` };
}

// ===================================================================
// REVIEWER DECISION LOGIC
// ===================================================================
function applyReviewerDecision(teamId, decision, notes, submitterEmail) {
  decision = ['Approved','Rejected','Revise'].find(value => textEquals_(value, decision)) || decision;
  const TS = getColumnMap(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const statusSheet = getSheet(SHEET_NAMES.TEAM_STATUS);
  const statusRow = findTeamStatusRow(statusSheet, teamId, TS);
  if (statusRow === -1) return { ok: false, message: `Team ${teamId} not found.` };

  const rowData = statusSheet.getRange(statusRow, 1, 1, TS.TITLE_APPROVED_BY + 1).getValues()[0];
  const committee = getCommitteeInfo(rowData[TS.COMMITTEE_NUMBER]);
  const validReviewerEmails = committee
    ? [committee.reviewer1Email, committee.reviewer2Email, committee.reviewer3Email, committee.reviewer4Email]
        .filter(Boolean).map(normalizeEmail)
    : [];

  if (!validReviewerEmails.includes(normalizeEmail(submitterEmail))) {
    MailApp.sendEmail(COORDINATOR_EMAIL, `Unauthorized Reviewer Decision Attempt — Team ${teamId}`,
      `${submitterEmail} submitted a Reviewer decision for Team ${teamId}, but is not an assigned reviewer.`);
    return { ok: false, message: `You are not an assigned reviewer for Team ${teamId}.` };
  }

  const guideEmail = rowData[TS.GUIDE_EMAIL];
  const semester = rowData[TS.SEMESTER];
  const title = rowData[TS.TITLE];
  const repoUrl = getRepoUrlForTeam(teamId);
  const studentEmails = [rowData[TS.S1_EMAIL], rowData[TS.S2_EMAIL], rowData[TS.S3_EMAIL], rowData[TS.S4_EMAIL]].filter(Boolean);

  setStatusFields(statusSheet, statusRow, { REVIEWER_DECISION: decision, REVIEWER_NOTES: notes || '' }, TS);

  if (decision === 'Approved') {
    setStatusFields(statusSheet, statusRow, { TITLE_APPROVED_BY: submitterEmail }, TS);
    getHubRegistrySheet().appendRow([ACADEMIC_YEAR, semester, teamId, guideEmail, title, repoUrl, buildTeamMembersField(rowData, TS), new Date(), submitterEmail]);
    MailApp.sendEmail([guideEmail, ...studentEmails].join(','), `Project Title Approved — Team ${teamId}`,
      `Your project title "${title}" has final approval. Begin weekly logging.`);
  } else if (decision === 'Revise') {
    statusSheet.getRange(statusRow, TS.GUIDE_DECISION + 1).setValue('');
    MailApp.sendEmail(guideEmail, `Reviewer Requested Revision — Team ${teamId}`,
      `Reviewer's note on "${title}": ${notes || '(see sheet for details)'}\n\nThe team has been notified to resubmit.`);
    MailApp.sendEmail(studentEmails.join(','), `Reviewer Requested Revision — Team ${teamId}`,
      `The Reviewer Committee has asked for changes to your project.\n\nNote: ${notes || '(see your guide for details)'}\n\n` +
      `Please resubmit via your team dashboard:\n\n${getDashboardUrl()}`);
  }

  return { ok: true, message: `Decision recorded for Team ${teamId}.` };
}

// ===================================================================
// TEAM STATUS SYNC
// ===================================================================
function syncTeamStatusFromRoster() {
  const TR = getColumnMap(SHEET_NAMES.TEAM_ROSTER, FIELD_DEFINITIONS.TEAM_ROSTER);
  const TS = getColumnMap(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const roster = getSheetRows(SHEET_NAMES.TEAM_ROSTER);
  const statusSheet = getSheet(SHEET_NAMES.TEAM_STATUS);
  const statusRows = getSheetRows(SHEET_NAMES.TEAM_STATUS);
  const numCols = statusSheet.getLastColumn();

  const rosterTeamIds = new Set(roster.map(r => normalizeText_(r[TR.TEAM_ID])).filter(Boolean));
  const statusRowNumByTeamId = Object.create(null);
  statusRows.forEach((r, i) => {
    if (r[TS.TEAM_ID]) statusRowNumByTeamId[normalizeText_(r[TS.TEAM_ID])] = i + 2;
  });

  const created = [];
  const updated = [];

  roster.forEach(r => {
    const teamId = r[TR.TEAM_ID];
    if (!teamId) return;

    const rosterFields = {
      SEMESTER: r[TR.SEMESTER], GUIDE_NAME: r[TR.GUIDE_NAME], GUIDE_EMAIL: r[TR.GUIDE_EMAIL],
      S1_NAME: r[TR.S1_NAME], S1_REGNO: r[TR.S1_REGNO], S1_EMAIL: r[TR.S1_EMAIL],
      S2_NAME: r[TR.S2_NAME], S2_REGNO: r[TR.S2_REGNO], S2_EMAIL: r[TR.S2_EMAIL],
      S3_NAME: r[TR.S3_NAME], S3_REGNO: r[TR.S3_REGNO], S3_EMAIL: r[TR.S3_EMAIL],
      S4_NAME: r[TR.S4_NAME], S4_REGNO: r[TR.S4_REGNO], S4_EMAIL: r[TR.S4_EMAIL],
      COMMITTEE_NUMBER: r[TR.COMMITTEE_NUMBER]
    };

    const existingRow = statusRowNumByTeamId[normalizeText_(teamId)];
    if (existingRow) {
      const currentRow = statusSheet.getRange(existingRow, 1, 1, numCols).getValues()[0];
      Object.entries(rosterFields).forEach(([field, value]) => { currentRow[TS[field]] = value; });
      statusSheet.getRange(existingRow, 1, 1, numCols).setValues([currentRow]);
      updated.push(teamId);
    } else {
      const newRow = new Array(numCols).fill('');
      newRow[TS.TEAM_ID] = teamId;
      Object.entries(rosterFields).forEach(([field, value]) => { newRow[TS[field]] = value; });
      statusSheet.appendRow(newRow);
      created.push(teamId);
    }
  });

  const orphaned = Object.keys(statusRowNumByTeamId).filter(teamId => !rosterTeamIds.has(teamId));

  Logger.log(`Created: ${created.join(', ') || '(none)'}`);
  Logger.log(`Updated: ${updated.join(', ') || '(none)'}`);
  Logger.log(`Orphaned: ${orphaned.join(', ') || '(none)'}`);

  if (orphaned.length > 0) {
    MailApp.sendEmail(COORDINATOR_EMAIL, `TeamStatus Sync — ${orphaned.length} orphaned team(s)`,
      `The following teams exist in TeamStatus but no longer appear in TeamRoster:\n\n${orphaned.join('\n')}\n\n` +
      `These were NOT deleted automatically.`);
  }
}

// ===================================================================
// EMAIL DIGESTS
// ===================================================================
function sendReviewerApprovalDigest() {
  const TS = getColumnMap(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const rows = getSheetRows(SHEET_NAMES.TEAM_STATUS);
  const pending = rows.filter(r => textEquals_(r[TS.GUIDE_DECISION], 'Approved') && !textEquals_(r[TS.REVIEWER_DECISION], 'Approved'));
  if (pending.length === 0) return;

  const digestByReviewer = {};
  pending.forEach(r => {
    const flag = r[TS.SIMILARITY_FLAG] ? `  [FLAG: ${r[TS.SIMILARITY_FLAG]}]` : '';
    const line = `Team ${r[TS.TEAM_ID]} (Guide: ${r[TS.GUIDE_EMAIL]}) — "${r[TS.TITLE]}"${flag}`;
    const committee = getCommitteeInfo(r[TS.COMMITTEE_NUMBER]);
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
      `Guide-approved titles awaiting your decision:\n\n${lines.join('\n')}\n\nReview here: ${getDashboardUrl()}`);
  });
}

function sendGuideReminderDigest() {
  const TS = getColumnMap(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const rows = getSheetRows(SHEET_NAMES.TEAM_STATUS);
  const stillPending = rows.filter(r => r[TS.TITLE] && !r[TS.GUIDE_DECISION]);
  const byGuide = groupBy(stillPending, r => r[TS.GUIDE_EMAIL]);
  Object.entries(byGuide).forEach(([guideEmail, teams]) => {
    const lines = teams.map(r => `Team ${r[TS.TEAM_ID]} — "${r[TS.TITLE]}"`);
    MailApp.sendEmail(guideEmail, `Reminder: ${teams.length} title(s) awaiting your review`,
      `${lines.join('\n')}\n\nReview here: ${getDashboardUrl()}`);
  });
}

function sendWeeklyLogReminders() {
  const TR = getColumnMap(SHEET_NAMES.TEAM_ROSTER, FIELD_DEFINITIONS.TEAM_ROSTER);
  const roster = getSheetRows(SHEET_NAMES.TEAM_ROSTER);

  roster.forEach(r => {
    const teamId = r[TR.TEAM_ID];
    if (!teamId) return;
    const emails = [r[TR.S1_EMAIL], r[TR.S2_EMAIL], r[TR.S3_EMAIL], r[TR.S4_EMAIL]].filter(Boolean);
    emails.forEach(email => {
      MailApp.sendEmail(email, `Weekly Progress Log Reminder — Team ${teamId}`,
        `Don't forget to log your work for this week. Visit your team dashboard:\n\n${getDashboardUrl()}`);
    });
  });
}

function sendPersonalizedIntakeLinks() {
  const TR = getColumnMap(SHEET_NAMES.TEAM_ROSTER, FIELD_DEFINITIONS.TEAM_ROSTER);
  const roster = getSheetRows(SHEET_NAMES.TEAM_ROSTER);

  roster.forEach(r => {
    const teamId = r[TR.TEAM_ID];
    if (!teamId) return;
    const emails = [r[TR.S1_EMAIL], r[TR.S2_EMAIL], r[TR.S3_EMAIL], r[TR.S4_EMAIL]].filter(Boolean);

    emails.forEach(email => {
      MailApp.sendEmail(email, `Submit Your Team's Title — Team ${teamId}`,
        `Visit your team dashboard to submit your title:\n\n${getDashboardUrl()}\n\n` +
        `(Complete GitHub Setup first if not done already.)`);
    });
  });
}

// ===================================================================
// TRIGGER SETUP
// ===================================================================
function setupIntakeTriggers() {
  ScriptApp.newTrigger('sendReviewerApprovalDigest').timeBased().onWeekDay(ScriptApp.WeekDay.MONDAY).atHour(9).create();
  ScriptApp.newTrigger('sendGuideReminderDigest').timeBased().everyDays(2).create();
  ScriptApp.newTrigger('sendWeeklyLogReminders').timeBased().onWeekDay(ScriptApp.WeekDay.THURSDAY).atHour(8).create();
}