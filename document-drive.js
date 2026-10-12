/**
 * DOCUMENT DRIVE - the team folder side of a submission (archive/plans/TEMPLATE-DOCUMENT-SUBMISSION-PLAN.md, decisions 6 and 7). The folder is found
 * with the existing findTeamFolder_; a document is the file with its exact name in that folder. One file updates in place (the earlier
 * content is kept forever first), none creates, several is refused. The content and the description are written in one Drive call, and
 * the description carries the submission record that settlement relies on.
 */

function documentDriveFolder_(team) {
  let folder = null;
  try { folder = findTeamFolder_(team.teamId, team.semester); }
  catch (error) { console.error('Team folder lookup failed: ' + (error && error.message || error)); }
  if (!folder) throw apiFail_('UNAVAILABLE', "The team's Drive folder was not found. Contact the coordinator.");
  return folder;
}

/** The live (not trashed) files with this exact name in the folder. */
function documentDriveFiles_(folder, fileName) {
  const found = [], iterator = folder.getFilesByName(fileName);
  while (iterator.hasNext()) found.push(iterator.next());
  return found;
}

/** The submission record in a file's description, or null when there is none or it is not ours. */
function documentDriveRecord_(file) {
  try {
    const parsed = JSON.parse(file.getDescription() || '');
    return parsed && typeof parsed === 'object' && parsed.v === 1 && typeof parsed.requestId === 'string' ? parsed : null;
  } catch (error) { return null; }
}

/** Writes the bytes and the record. Returns the Drive file ID. Throws if the previous content cannot be kept. */
function documentDriveWrite_(folder, files, fileName, extension, bytes, record) {
  const blob = Utilities.newBlob(bytes, DOCUMENT_MIME_[extension], fileName), description = JSON.stringify(record);
  if (files.length === 1) {
    const id = String(files[0].getId());
    const revisions = (Drive.Revisions.list(id, {fields: 'revisions(id)'}).revisions) || [];
    if (revisions.length) Drive.Revisions.update({keepForever: true}, id, revisions[revisions.length - 1].id);
    Drive.Files.update({description}, id, blob, {supportsAllDrives: true});
    return id;
  }
  const created = Drive.Files.create({name: fileName, mimeType: DOCUMENT_MIME_[extension], parents: [String(folder.getId())], description}, blob, {supportsAllDrives: true});
  return String(created.id);
}
