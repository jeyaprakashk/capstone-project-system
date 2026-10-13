/**
 * DOCUMENT SETUP - the editor-run entry points of the template-document work (archive/plans/TEMPLATE-DOCUMENT-SUBMISSION-PLAN.md, sections 9 and 11).
 *   setupDocumentStorage  creates the document sheets built so far (each phase adds its own) and the four evidence sheets
 *                         (archive/plans/EVIDENCE-PLAN.md). It installs no trigger.
 *   setupDocumentTriggers installs the scan triggers built so far, once each: the daily template scan and the team-file scan every
 *                         TEAM_FILE_SCAN_EVERY_HOURS_ hours. A team-file trigger from an older schedule is replaced.
 * Both start with requireTriggerOrOperator_(); neither changes or deletes data.
 */
const DOCUMENT_TRIGGER_OWNER_KEY_ = 'DOCUMENT_TRIGGER_OWNER';
const DOCUMENT_TEAM_SCAN_SCHEDULE_KEY_ = 'DOCUMENT_TEAM_SCAN_SCHEDULE';

function setupDocumentStorage() {
  requireTriggerOrOperator_();
  return {
    templateFiles: ensureSheet_({...sheetSpec_('templateFiles'), mode: 'setup', onCreate: formatDocumentSheet_}),
    teamFileStatus: ensureSheet_({...sheetSpec_('teamFileStatus'), mode: 'setup', onCreate: formatDocumentSheet_}),
    documentSubmissions: ensureSheet_({...sheetSpec_('documentSubmissions'), mode: 'setup', onCreate: formatDocumentSheet_}),
    evidenceFolders: ensureSheet_({...sheetSpec_('evidenceFolders'), mode: 'setup', onCreate: formatDocumentSheet_}),
    activityEvidences: ensureSheet_({...sheetSpec_('activityEvidences'), mode: 'setup', onCreate: formatDocumentSheet_}),
    evidenceCopies: ensureSheet_({...sheetSpec_('evidenceCopies'), mode: 'setup', onCreate: formatDocumentSheet_}),
    evidenceStatus: ensureSheet_({...sheetSpec_('evidenceStatus'), mode: 'setup', onCreate: formatDocumentSheet_})
  };
}

/**
 * The scan triggers, each installed once; running it again adds none. The first run's account owns them (as for the weekly AI schedule).
 * The team-file trigger records its schedule; a trigger installed under another schedule (the former daily one) is deleted and created
 * again, so changing TEAM_FILE_SCAN_EVERY_HOURS_ and running this once is how its frequency changes.
 */
function setupDocumentTriggers() {
  requireTriggerOrOperator_();
  const properties = PropertiesService.getScriptProperties();
  const email = normalizeEmail_(Session.getEffectiveUser().getEmail());
  const owner = properties.getProperty(DOCUMENT_TRIGGER_OWNER_KEY_);
  if (owner && !emailsMatch_(owner, email)) throw new Error('The existing document triggers belong to ' + owner + '. They must manage them.');
  const triggers = ScriptApp.getProjectTriggers(), installed = triggers.map(trigger => trigger.getHandlerFunction());
  const created = [], replaced = [];
  if (!installed.includes('scanTemplateFiles')) {
    ScriptApp.newTrigger('scanTemplateFiles').timeBased().everyDays(1).atHour(2).create();
    created.push('scanTemplateFiles');
  }
  if (![1, 2, 4, 6, 8, 12].includes(TEAM_FILE_SCAN_EVERY_HOURS_)) throw new Error('TEAM_FILE_SCAN_EVERY_HOURS_ must be 1, 2, 4, 6, 8 or 12.');
  const schedule = 'every ' + TEAM_FILE_SCAN_EVERY_HOURS_ + ' hours';
  const teamScans = triggers.filter(trigger => trigger.getHandlerFunction() === 'scanTeamFiles');
  if (!teamScans.length || properties.getProperty(DOCUMENT_TEAM_SCAN_SCHEDULE_KEY_) !== schedule) {
    teamScans.forEach(trigger => ScriptApp.deleteTrigger(trigger));
    if (teamScans.length) replaced.push('scanTeamFiles');
    ScriptApp.newTrigger('scanTeamFiles').timeBased().everyHours(TEAM_FILE_SCAN_EVERY_HOURS_).create();
    created.push('scanTeamFiles');
    properties.setProperty(DOCUMENT_TEAM_SCAN_SCHEDULE_KEY_, schedule);
  }
  properties.setProperty(DOCUMENT_TRIGGER_OWNER_KEY_, email);
  return {created, replaced, owner: email, teamScan: schedule};
}
