/**
 * DOCUMENT SETUP - the editor-run entry points of the template-document work (TEMPLATE-DOCUMENT-SUBMISSION-PLAN.md, sections 9 and 11).
 *   setupDocumentStorage  creates the document sheets built so far (each phase adds its own). It installs no trigger.
 *   setupDocumentTriggers installs the daily triggers built so far, once each. Phase 1: the template scan.
 * Both start with requireTriggerOrOperator_(); neither changes or deletes data.
 */
const DOCUMENT_TRIGGER_OWNER_KEY_ = 'DOCUMENT_TRIGGER_OWNER';

function setupDocumentStorage() {
  requireTriggerOrOperator_();
  return {
    templateFiles: ensureSheet_({...sheetSpec_('templateFiles'), mode: 'setup', onCreate: formatDocumentSheet_})
  };
}

/** The daily triggers, each installed once; running it again adds none. The first run's account owns them (as for the weekly AI schedule). */
function setupDocumentTriggers() {
  requireTriggerOrOperator_();
  const properties = PropertiesService.getScriptProperties();
  const email = normalizeEmail_(Session.getEffectiveUser().getEmail());
  const owner = properties.getProperty(DOCUMENT_TRIGGER_OWNER_KEY_);
  if (owner && !emailsMatch_(owner, email)) throw new Error('The existing document triggers belong to ' + owner + '. They must manage them.');
  const installed = ScriptApp.getProjectTriggers().map(trigger => trigger.getHandlerFunction());
  const created = [];
  [['scanTemplateFiles', 2]].forEach(([handler, hour]) => {
    if (installed.includes(handler)) return;
    ScriptApp.newTrigger(handler).timeBased().everyDays(1).atHour(hour).create();
    created.push(handler);
  });
  properties.setProperty(DOCUMENT_TRIGGER_OWNER_KEY_, email);
  return {created, owner: email};
}
