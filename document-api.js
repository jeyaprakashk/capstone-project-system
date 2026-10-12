/**
 * DOCUMENT API - the endpoints of the template-document submission (TEMPLATE-DOCUMENT-SUBMISSION-PLAN.md, section 9). JSON only. Each
 * write endpoint resolves who the caller is for the team and hands the action to documentWrite_ with the callbacks it needs; nothing
 * here decides a workflow state (document-service.js does). Who a caller is for a team comes from the same functions the title
 * endpoints use (titleTeamRow_, titleTeamRowFor_, titleRolesFor_, titleAuthorizer_), so the roster is read in one way.
 */
const DOCUMENT_DECISIONS_ = Object.freeze({approve: 'approve', return: 'return'});

/** The listed template documents with their extension: [{documentId, fileName, folder, extension, path}]. An unreadable TemplateFiles sheet is UNAVAILABLE, not an empty list. */
function documentListed_() {
  let records;
  try { records = readTemplateFiles_().records; }
  catch (error) {
    console.error('Template files could not be read: ' + (error && error.message || error));
    throw apiFail_('UNAVAILABLE', 'Documents are not available right now. Contact the coordinator.');
  }
  return listedTemplateDocuments_(records).map(document => Object.assign({extension: templateExtension_(document.fileName)}, document));
}

/** The team and the document of a request, or NOT_FOUND. */
function documentContext_(teamId, documentId) {
  const {TS, row} = titleTeamRow_(teamId);
  const document = documentListed_().find(candidate => candidate.documentId === documentId);
  if (!document) throw apiFail_('NOT_FOUND', 'That document is not available.');
  return {team: {teamId: String(row[TS.TEAM_ID]).trim(), semester: row[TS.SEMESTER]}, document, TS, row};
}

/** The callbacks documentWrite_ needs, for a caller acting as one role. */
function documentDeps_(as) {
  return {
    authorize: titleAuthorizer_(as),
    context: documentContext_,
    folder: (ctx, required) => {
      try { return documentDriveFolder_(ctx.team); }
      catch (error) { if (required) throw error; return null; }
    },
    files: documentDriveFiles_,
    fileRecord: documentDriveRecord_,
    fileId: file => String(file.getId()),
    prepareSubmit: documentPrepareSubmit_,
    confirmSubmit: (ctx, prepared) => {
      if (documentLatestCommit_(prepared.live, ctx.document) !== prepared.live.latestCommit) {
        throw apiFail_('CONFLICT', 'A newer version was committed. Review it and submit again.');
      }
    },
    writeFile: (ctx, folder, files, prepared, record) => documentDriveWrite_(folder, files, ctx.document.fileName, ctx.document.extension, prepared.bytes, record)
  };
}

/** The slow reads of a submission: the live GitHub facts, the rules about the team's change, the exact commit, and the file checks. */
function documentPrepareSubmit_(ctx, input) {
  const live = documentLiveFile_(ctx.team, ctx.document);
  if (!live.present) throw apiFail_('REJECTED', 'This file is not in your team repository.');
  if (live.teamChanged === 'Unknown') throw documentUnverified_(ctx.document);
  if (live.teamChanged !== 'Yes') throw apiFail_('REJECTED', 'No team member has changed this file yet.');
  if (live.latestCommit !== input.expectedCommit) throw apiFail_('CONFLICT', 'A newer version was committed. Review it and submit again.');
  const file = documentFileBytes_(live, ctx.document);
  const problem = documentFileProblem_(file.bytes, ctx.document.extension);
  if (problem) throw apiFail_('INVALID_INPUT', problem);
  return {live, blobSha: file.blobSha, bytes: file.bytes};
}

function documentRun_(as, action, teamId, input) {
  input = input && typeof input === 'object' ? input : {};
  const team = titleTeamRowFor_(teamId, as);
  const resolved = String(team.row[team.TS.TEAM_ID]).trim();
  return documentWrite_({action, teamId: resolved, documentId: input.documentId, requestId: input.requestId, expectedRevision: input.expectedRevision, input}, documentDeps_(as));
}

function API_student_submitDocument(input) {
  return apiHandle_(() => {
    const student = studentAccessOrThrow_();
    return documentRun_('student', 'submit', student.teamId, input);
  });
}

function API_guide_decideDocument(input) {
  return apiHandle_(() => {
    const decision = input && typeof input === 'object' ? String(input.decision || '') : '';
    if (!DOCUMENT_DECISIONS_[decision]) throw apiFail_('INVALID_INPUT', 'Choose approve or return.');
    return documentRun_('guide', DOCUMENT_DECISIONS_[decision], input && input.teamId, input);
  });
}

function API_coordinator_reopenDocument(input) {
  return apiHandle_(() => documentRun_('coordinator', 'reopen', input && input.teamId, input));
}

/**
 * The version a student is about to submit, read live: the latest commit that touched the file, who made it, and who last changed it
 * among the team. The screen shows it for confirmation; the submit request carries its SHA as expectedCommit.
 */
function API_student_previewDocument(input) {
  return apiHandle_(() => {
    const student = studentAccessOrThrow_();
    const documentId = String(input && input.documentId || '').trim();
    const ctx = documentContext_(student.teamId, documentId);
    const live = documentLiveFile_(ctx.team, ctx.document);
    if (!live.present) throw apiFail_('REJECTED', 'This file is not in your team repository.');
    if (live.teamChanged === 'Unknown') throw documentUnverified_(ctx.document);
    if (live.teamChanged !== 'Yes') throw apiFail_('REJECTED', 'No team member has changed this file yet.');
    const people = documentTeamPeople_(ctx.team.teamId, ctx.row, ctx.TS);
    return {
      documentId, fileName: ctx.document.fileName,
      commit: {sha: live.latestCommit, shortSha: documentShortSha_(live.latestCommit), date: live.latestDate || null, author: documentAuthorLine_(live.latestAuthor, people)},
      lastTeamChange: documentAuthorLine_(live.teamAuthor, people)
    };
  });
}

// ---- reading ---------------------------------------------------------------------------------------------------------------

function documentCapability_(decision) {
  return {allowed: decision.allowed, reason: decision.reason, activity: null, requirements: []};
}

/** A person-facing line for one journal row's commit facts. */
function documentCommitLines_(row, people) {
  if (!row) return null;
  return {
    sha: row.commitSha, shortSha: documentShortSha_(row.commitSha),
    committedBy: documentAuthorLine_({login: row.commitAuthor, id: row.commitAuthorId}, people),
    lastTeamChange: row.teamCommitSha ? documentAuthorLine_({login: row.teamCommitAuthor, id: row.teamCommitAuthorId}, people) : null
  };
}

/**
 * The Documents DTO of one team for one viewer = {email, roles}. A student and the guide see every status with the file's link; a reviewer
 * and the coordinator see a link only while the content is approved (decision 7). A student sees names, never e-mail addresses.
 * Nothing is written. The journal rows break the rules for one document -> that document is UNAVAILABLE and the others still work.
 */
function buildDocumentsDto_(teamId, viewer) {
  const {TS, row} = titleTeamRow_(teamId);
  const team = {teamId: String(row[TS.TEAM_ID]).trim(), semester: row[TS.SEMESTER]}, roles = viewer.roles;
  const listed = documentListed_(), journal = documentReadJournal_();
  let teamFiles = null;
  try { teamFiles = readTeamFileStatus_(); } catch (error) { console.error('TeamFileStatus could not be read: ' + (error && error.message || error)); }
  let folder = null;
  try { folder = findTeamFolder_(team.teamId, team.semester); } catch (error) { folder = null; }
  const people = documentTeamPeople_(team.teamId, row, TS);
  const names = new Map([1, 2, 3, 4].map(n => [normalizeEmail_(row[TS['S' + n + '_EMAIL']]), String(row[TS['S' + n + '_NAME']] || '').trim()]).filter(pair => pair[0]));
  const seesStaffDetail = roles.guide || roles.coordinator;
  let scannedAt = '';
  const documents = listed.map(document => {
    const rows = journal.rowsFor(team.teamId, document.documentId);
    let files = null, url = '';
    if (folder) { try { files = documentDriveFiles_(folder, document.fileName); if (files.length === 1) url = String(files[0].getUrl()); } catch (error) { files = null; } }
    const state = documentStateFor_(rows, files ? files.length : null);
    const tracked = teamFiles ? teamFiles.index.get(documentJournalKey_(team.teamId, document.documentId)) : null;
    const teamChanged = tracked ? tracked.record.teamChanged : '';
    if (tracked && tracked.record.checkedAt > scannedAt) scannedAt = tracked.record.checkedAt;
    const approvedContent = ['APPROVED', 'REOPENED'].includes(state.status) || state.existing;
    const link = state.status === 'UNAVAILABLE' ? '' : ((roles.student || roles.guide || approvedContent) ? url : '');
    const lastSubmit = [...rows].reverse().find(item => item.action === 'SUBMIT') || null;
    const showLines = lastSubmit && (roles.student || roles.guide || roles.coordinator || approvedContent);
    const submitter = lastSubmit ? {name: names.get(normalizeEmail_(lastSubmit.actor)) || '', at: lastSubmit.timestamp} : null;
    if (submitter && seesStaffDetail) submitter.email = lastSubmit.actor;
    const user = {roles};
    const extra = {teamChanged, label: document.fileName};
    const dto = {
      documentId: document.documentId, fileName: document.fileName, folder: document.folder, extension: document.extension,
      status: state.status, state: DOCUMENT_TONE_[state.status], statusText: DOCUMENT_STATUS_TEXT_[state.status],
      revision: state.revision, existing: state.existing, teamChanged, checkedAt: tracked ? tracked.record.checkedAt : '', link,
      returnedNotes: state.status === 'RETURNED' && state.last ? state.last.notes : '',
      submittedBy: showLines ? submitter : null,
      commit: showLines ? documentCommitLines_(lastSubmit, people) : null,
      history: seesStaffDetail ? rows.map(item => ({revision: item.revision, action: item.action, actor: item.actor, at: item.timestamp, notes: item.notes})) : [],
      can: state.status === 'UNAVAILABLE' ? null : {
        submit: documentCapability_(documentCanDo_(state, 'submit', user, extra)),
        approve: documentCapability_(documentCanDo_(state, 'approve', user, extra)),
        return: documentCapability_(documentCanDo_(state, 'return', user, extra)),
        reopen: documentCapability_(documentCanDo_(state, 'reopen', user, extra))
      }
    };
    return dto;
  });
  return {teamId: team.teamId, scannedAt, roles: {student: !!roles.student, guide: !!roles.guide, reviewer: !!roles.reviewer, coordinator: !!roles.coordinator}, documents};
}

/** API_documents_get(teamId?): any signed-in person with a role on the team. A student sees its own team only. */
function API_documents_get(teamId) {
  return apiHandle_(() => {
    const email = Session.getActiveUser().getEmail();
    if (!email) throw apiFail_('UNAUTHENTICATED', 'Could not identify your account.');
    let id = String(teamId === null || teamId === undefined ? '' : teamId).trim();
    if (!id) id = String(studentAccessOrThrow_().teamId);
    const {TS, row} = titleTeamRowFor_(id, null);
    const roles = titleRolesFor_(email, row, TS);
    if (!roles.student && !roles.guide && !roles.reviewer && !roles.coordinator) throw apiFail_('UNAUTHORIZED', 'You do not have access to this team.');
    return buildDocumentsDto_(String(row[TS.TEAM_ID]).trim(), {email, roles});
  });
}
