/**
 * TEAM DOCUMENTS - read-only view of the two fixed documents in a team's Drive folder. Documents are placed in the folder outside this
 * system (there is no upload here); the `drive` requirement (activity-check-drive.js) and the coordinator's Title section read them.
 * The target folder is always found from the team, never from a request.
 */
const DOCUMENT_LABELS_ = Object.freeze({work: 'Work Breakdown document', need: 'Need Analysis document'});

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
 * The documents of a team for the Title DTO: [{key, label, present, uploadedBy, uploadedAt}]. `uploadedBy` and `uploadedAt` come from a
 * description on the file when one exists (an empty string and null otherwise) and are shown only when `showUploader` is true. An
 * unreachable folder shows every document as not present rather than failing the title screen.
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
