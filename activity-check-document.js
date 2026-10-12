/**
 * ACTIVITY CHECK: document (archive/plans/TEMPLATE-DOCUMENT-SUBMISSION-PLAN.md, decision 9 and Phase 5). The item is a Document ID of the scanned template
 * list. It is met when the team's document is approved (APPROVED, REOPENED, or a hand-placed file with no journal row) and exactly one live
 * file of that name stands in the team folder. It fails closed: a TemplateFiles sheet, a journal or a Drive folder that cannot be read is
 * "Could not verify", an outstanding Drive write that is not yet in the journal is unmet until it is settled, and an item that is not a
 * listed document is a misconfiguration. No ActivityDependencies row uses this kind until the coordinator enters one. The existing `drive`
 * kind is unchanged. In a `hint` context (a yes-or-no label, never a gate) a document with a journal row is answered from the journal alone, with no
 * Drive read: approved is met, anything else is unmet. Only a document with no row needs Drive, to tell a hand-placed file from nothing.
 */
const ACTIVITY_DOCUMENT_MET_ = Object.freeze(['APPROVED', 'REOPENED']);

/** The sentence for a document that is not approved. */
function activityDocumentReason_(status) {
  return status === 'NEEDS_REVIEW' ? 'Waiting for the guide to approve it.' : status === 'RETURNED' ? 'Returned by the guide. Submit it again.' : 'Not approved yet.';
}

/** Per request: the listed documents and the journal are read once (kept in ctx). Throws when either cannot be read. */
function activityDocumentSources_(ctx) {
  if (!ctx.document) ctx.document = {};
  if (!ctx.document.listed) ctx.document.listed = listedTemplateDocuments_(readTemplateFiles_().records);
  if (!ctx.document.journal) ctx.document.journal = readDocumentJournal_();
  return ctx.document;
}

function activityCheckDocument_() {
  return {
    needsApprovedTitle: false,
    perStudent: false,
    validItem: item => /^doc-\d{4,}$/.test(String(item)),
    isMet: (team, item, ctx) => {
      let sources;
      try { sources = activityDocumentSources_(ctx); }
      catch (error) {
        console.error('Document requirement sources could not be read: ' + (error && error.message || error));
        return {met: false, unverifiable: true, diagnostic: 'DOCUMENT_SOURCES_UNREADABLE'};
      }
      const document = sources.listed.find(candidate => candidate.documentId === item);
      if (!document) return {met: false, reason: ACTIVITY_MISCONFIGURED_, diagnostic: 'DOCUMENT_NOT_LISTED'};
      if (ctx.hint) {
        const recorded = sources.journal.rowsFor(team.teamId, document.documentId);
        const status = recorded.length ? documentStateFromRows_(recorded).status : '';
        if (ACTIVITY_DOCUMENT_MET_.includes(status)) return {met: true, reason: ''};
        if (status && status !== 'UNAVAILABLE') return {met: false, reason: activityDocumentReason_(status)};
      }
      const located = activityDriveFolder_(team, ctx);
      if (located.unresolved) return {met: false, unverifiable: true, diagnostic: located.unresolved};
      if (located.absent) return {met: false, reason: 'Team folder not created yet.'};
      let files;
      try { files = documentDriveFiles_(located.folder, document.fileName).filter(file => !file.isTrashed()); }
      catch (error) {
        console.error('Drive file lookup failed for team ' + team.teamId + ': ' + (error && error.message || error));
        return {met: false, unverifiable: true, diagnostic: 'TEAM_DOCUMENTS_UNRESOLVED'};
      }
      const rows = sources.journal.rowsFor(team.teamId, document.documentId);
      const state = documentStateFor_(rows, files.length);
      if (state.status === 'UNAVAILABLE') return {met: false, unverifiable: true, diagnostic: 'DOCUMENT_JOURNAL_INVALID'};
      const pending = files.some(file => {
        const record = documentDriveRecord_(file);
        return record && !sources.journal.rows.some(row => row.requestId === record.requestId);
      });
      if (pending) return {met: false, reason: 'A submission is still being recorded. Try again shortly.'};
      if (!ACTIVITY_DOCUMENT_MET_.includes(state.status)) {
        return {met: false, reason: activityDocumentReason_(state.status)};
      }
      if (files.length === 0) return {met: false, reason: 'The approved file is missing from the team folder.'};
      if (files.length > 1) return {met: false, reason: 'More than one file has this name in the team folder.'};
      return {met: true, reason: ''};
    }
  };
}
