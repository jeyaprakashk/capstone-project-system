/**
 * TEAM DOCUMENT UPLOAD - students put their two .docx documents in their own team folder (TITLE-REVISION-PLAN.md, section 8).
 * The server writes as the deploying account; the target folder is always the session student's own team folder and no folder or team ID
 * is taken from the request. The stored name is the fixed name for the document key. A request is recognised by the request ID and
 * fingerprint recorded in the file description, so a retry never uploads twice and never trashes a newer file.
 */
const DOCX_MIME_ = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
const DOCUMENT_MAX_BYTES_ = 10 * 1024 * 1024;
const DOCUMENT_LABELS_ = Object.freeze({work: 'Work Breakdown document', need: 'Need Analysis document'});

function documentInvalid_(message) {
  return apiFail_('INVALID_INPUT', message);
}

/** The validated, decoded upload: {key, name, bytes, mimeType, fingerprint}. Throws INVALID_INPUT. */
function uploadInput_(input) {
  input = input && typeof input === 'object' ? input : {};
  const key = String(input.documentKey || '');
  if (!Object.prototype.hasOwnProperty.call(TEAM_DOCUMENT_FILE_NAMES_, key)) throw documentInvalid_('Choose which document you are uploading.');
  const requestId = String(input.requestId === null || input.requestId === undefined ? '' : input.requestId).trim();
  if (!requestId || requestId.length > TITLE_REQUEST_ID_MAX_) throw documentInvalid_('The request is missing its request ID.');
  if (!/\.docx$/i.test(String(input.fileName || '').trim())) throw documentInvalid_('Upload a Word document (.docx).');
  const mimeType = String(input.mimeType || '').trim();
  if (mimeType && mimeType !== DOCX_MIME_ && mimeType !== 'application/octet-stream') throw documentInvalid_('Upload a Word document (.docx).');
  const text = String(input.dataBase64 || '');
  if (!text) throw documentInvalid_('The file is empty.');
  if (text.length > Math.ceil(DOCUMENT_MAX_BYTES_ * 4 / 3) + 8) throw documentInvalid_('The file is larger than 10 MB.');
  let bytes;
  try { bytes = Utilities.base64Decode(text); }
  catch (error) { throw documentInvalid_('The file could not be read. Try again.'); }
  if (!bytes.length) throw documentInvalid_('The file is empty.');
  if (bytes.length > DOCUMENT_MAX_BYTES_) throw documentInvalid_('The file is larger than 10 MB.');
  // A .docx is a zip archive: it starts with "PK". This catches a renamed file of another type.
  if (bytes[0] !== 0x50 || bytes[1] !== 0x4B) throw documentInvalid_('This is not a valid Word document (.docx).');
  return {key, requestId, name: TEAM_DOCUMENT_FILE_NAMES_[key], bytes, mimeType: DOCX_MIME_, fingerprint: documentFingerprint_(key, bytes)};
}

function documentHex_(digest) {
  return digest.map(value => ('0' + ((value + 256) % 256).toString(16)).slice(-2)).join('');
}

/** SHA-256(documentKey + SHA-256(bytes)) as hex. The browser's own hash never decides anything on the server. */
function documentFingerprint_(key, bytes) {
  const content = documentHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, bytes));
  return documentHex_(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, key + content, Utilities.Charset.UTF_8));
}

function documentRecord_(file) {
  try { const parsed = JSON.parse(file.getDescription() || ''); return parsed && typeof parsed === 'object' ? parsed : {}; }
  catch (error) { return {}; }
}

/** Every file with the fixed name in the folder, live or trashed: [{file, trashed, record}]. */
function documentFiles_(folder, name) {
  const found = [], files = folder.getFilesByName(name);
  while (files.hasNext()) { const file = files.next(); found.push({file, trashed: file.isTrashed(), record: documentRecord_(file)}); }
  return found;
}

/**
 * Where this request stands in the folder: {state: none|conflict|replaced|complete|incomplete, mine}.
 *   conflict   - the request ID is on a file with a different fingerprint
 *   replaced   - the request's file is in the trash, because a newer upload replaced it
 *   complete   - the request's file is live and is the only live file with the name
 *   incomplete - the request's file is live but other live files with the name remain to be trashed
 */
function documentRequestState_(folder, upload) {
  const files = documentFiles_(folder, upload.name);
  // The request ID is looked for under every fixed name, so reusing it for the other document is a conflict, not a second upload.
  const everywhere = Object.values(TEAM_DOCUMENT_FILE_NAMES_).flatMap(name => name === upload.name ? files : documentFiles_(folder, name));
  const mine = everywhere.filter(item => item.record.requestId === upload.requestId);
  if (!mine.length) return {state: 'none', files};
  if (mine.some(item => item.record.fingerprint !== upload.fingerprint)) return {state: 'conflict', files};
  const live = mine.find(item => !item.trashed);
  if (!live) return {state: 'replaced', files, mine: mine[0]};
  const otherLive = files.filter(item => !item.trashed && item.file.getId() !== live.file.getId());
  return {state: otherLive.length ? 'incomplete' : 'complete', files, mine: live};
}

function documentUploadResult_(upload, item, replaced, warning) {
  const result = {ok: true, documentKey: upload.key, present: true, uploadedBy: String(item.record.uploadedBy || ''), uploadedAt: item.record.uploadedAt || null,
    replaced: !!replaced,
    message: replaced ? 'This upload was saved, and a newer upload has since replaced it.' : DOCUMENT_LABELS_[upload.key] + ' uploaded.'};
  if (warning) result.warning = warning;
  return result;
}

/** Resolves the student's team folder fresh. absent -> REJECTED, unresolved -> UNAVAILABLE. */
function documentTeamFolder_(team) {
  const located = activityDriveFolder_(team, activityContext_());
  if (located.absent) throw apiFail_('REJECTED', 'Your team folder has not been created yet. Ask the coordinator.');
  if (located.unresolved) throw apiFail_('UNAVAILABLE', 'Your team folder could not be reached right now. Try again shortly.');
  return located.folder;
}

function documentTitleBlocked_(teamId) {
  const state = titleStateFromIndex_(readTitleIndex_(), teamId);
  if (state.status === 'NEEDS_REVIEW' || state.status === 'AWAITING_REVIEWER') {
    throw apiFail_('REJECTED', 'Documents cannot change while the title is under review.');
  }
}

/**
 * Trashes every other live file with the name, then rereads. Returns the request's file, or throws UNAVAILABLE when cleanup did not
 * leave exactly that one live file (a retry finishes it).
 */
function documentFinish_(folder, upload, mine) {
  let live;
  try {
    documentFiles_(folder, upload.name).forEach(item => {
      if (!item.trashed && item.file.getId() !== mine.file.getId()) item.file.setTrashed(true);
    });
    live = documentFiles_(folder, upload.name).filter(item => !item.trashed);
  } catch (error) {
    console.error('Document cleanup failed: ' + (error && error.message || error));
    throw apiFail_('UNAVAILABLE', 'The upload could not be completed. Try again.');
  }
  if (live.length !== 1 || live[0].file.getId() !== mine.file.getId()) throw apiFail_('UNAVAILABLE', 'The upload could not be completed. Try again.');
  return live[0];
}

function documentWrite_(student, input) {
  titleRequireLive_();
  const upload = uploadInput_(input);
  const team = {teamId: String(student.teamId).trim(), semester: student.row[titleTeamColumns_().SEMESTER]};
  const folder = documentTeamFolder_(team);
  const pre = documentRequestState_(folder, upload);
  if (pre.state === 'conflict') throw apiFail_('CONFLICT', 'This request ID was already used for a different file.');
  if (pre.state === 'replaced') return documentUploadResult_(upload, pre.mine, true);
  if (pre.state === 'complete') return documentUploadResult_(upload, pre.mine, false);
  if (pre.state === 'none') {
    documentTitleBlocked_(team.teamId);
    const gate = activityPreconditions_('document.upload', team, activityContext_());
    if (!gate.allowed) {
      const again = documentRequestState_(folder, upload);
      if (again.state === 'conflict') throw apiFail_('CONFLICT', 'This request ID was already used for a different file.');
      if (again.state === 'replaced') return documentUploadResult_(upload, again.mine, true);
      if (again.state === 'complete') return documentUploadResult_(upload, again.mine, false);
      if (again.state === 'none') throw apiFail_('REJECTED', 'These requirements are not met yet: ' + activityUnmetMessages_(gate).join('; ') + '.');
    }
  }
  const lock = LockService.getScriptLock();
  const owned = lock.hasLock();
  if (!owned) {
    try { lock.waitLock(TITLE_LOCK_WAIT_MS_); }
    catch (error) { throw apiFail_('UNAVAILABLE', 'Busy, try again.'); }
  }
  try {
    titleRequireLive_();
    const fresh = studentAccessOrThrow_();
    if (String(fresh.teamId).trim() !== team.teamId) throw apiFail_('UNAUTHORIZED', 'You are not a member of this team.');
    documentTitleBlocked_(team.teamId);
    const freshFolder = documentTeamFolder_(team);
    const now = documentRequestState_(freshFolder, upload);
    if (now.state === 'conflict') throw apiFail_('CONFLICT', 'This request ID was already used for a different file.');
    if (now.state === 'replaced') return documentUploadResult_(upload, now.mine, true);
    let mine = now.mine;
    if (!mine) {
      const file = freshFolder.createFile(Utilities.newBlob(upload.bytes, upload.mimeType, upload.name));
      file.setDescription(JSON.stringify({requestId: upload.requestId, fingerprint: upload.fingerprint, uploadedBy: fresh.email, uploadedAt: new Date().toISOString()}));
      mine = {file, trashed: false, record: documentRecord_(file)};
    }
    return documentUploadResult_(upload, documentFinish_(freshFolder, upload, mine), false);
  } finally {
    if (!owned) lock.releaseLock();
  }
}

function titleTeamColumns_() {
  return getColumnMap_(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
}

function API_student_uploadDocument(input) {
  return apiHandle_(() => documentWrite_(studentAccessOrThrow_(), input));
}

/**
 * The documents of a team for the Title DTO: [{key, label, present, uploadedBy, uploadedAt}]. Only the student's own team shows who
 * uploaded; staff see presence only. A file placed by hand shows as present with the uploader unknown (''). An unreachable folder
 * shows every document as not present rather than failing the title screen.
 */
function documentStatusList_(team, showUploader, ctx) {
  const located = activityDriveFolder_(team, ctx);
  return Object.keys(TEAM_DOCUMENT_FILE_NAMES_).map(key => {
    const entry = {key, label: DOCUMENT_LABELS_[key], present: false, uploadedBy: null, uploadedAt: null};
    if (!located.folder) return entry;
    let live = [];
    try { live = documentFiles_(located.folder, TEAM_DOCUMENT_FILE_NAMES_[key]).filter(item => !item.trashed); } catch (error) { return entry; }
    if (live.length !== 1) return entry;
    entry.present = true;
    if (showUploader) { entry.uploadedBy = String(live[0].record.uploadedBy || ''); entry.uploadedAt = live[0].record.uploadedAt || null; }
    return entry;
  });
}

/** The upload capability for a team (the same for both documents): who may upload now, and what is still required. */
function documentUploadCapability_(state, roles, team, ctx) {
  const deny = reason => ({allowed: false, reason, activity: 'document.upload', requirements: []});
  if (!roles.student) return deny('Only a member of this team can upload documents.');
  if (state.status === 'NEEDS_REVIEW' || state.status === 'AWAITING_REVIEWER') return deny('Documents cannot change while the title is under review.');
  const located = activityDriveFolder_(team, ctx);
  if (located.absent) return deny('Your team folder has not been created yet. Ask the coordinator.');
  if (located.unresolved) return deny('Your team folder could not be reached right now. Try again shortly.');
  const result = studentRequirements_(activityPreconditions_('document.upload', team, ctx));
  return {allowed: result.allowed, reason: result.reason, activity: 'document.upload', requirements: result.requirements};
}
