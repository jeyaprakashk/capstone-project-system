/** Schema bootstrap and journal provisioning are deliberately separate setup stages. */
function createAssessmentDefinitions_() {
  const email=Session.getActiveUser().getEmail();
  if(!email||(!emailsMatch_(email,getCoordinatorEmail_())&&!emailsMatch_(email,getConfig_('CELL_PD_EMAIL'))))throw new Error('Coordinator access is required.');
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(1000))throw new Error('Another setup is running. Try again shortly.');
  try {
    const existing=getSheet_('AssessmentDefinitions');
    if(existing) {
      // Validate, but never repair, replace or append to an existing configuration.
      parseAssessmentDefinitions_(existing.getDataRange().getValues(),getSpreadsheet_().getSpreadsheetTimeZone());
      return {created:false};
    }
    const rows=[ASSESSMENT_DEFINITION_HEADERS_.slice()];
    parseAssessmentDefinitions_(rows,getSpreadsheet_().getSpreadsheetTimeZone());
    const sheet=getSpreadsheet_().insertSheet('AssessmentDefinitions');
    sheet.getRange(1,1,1,ASSESSMENT_DEFINITION_HEADERS_.length).setValues(rows);
    SpreadsheetApp.flush();
    return {created:true};
  }finally{lock.releaseLock();}
}

/** Explicit Coordinator setup for all supported, configured assessment journals. */
function prepareReviewAssessmentStorage_() {
  const email=Session.getActiveUser().getEmail();
  if(!email||(!emailsMatch_(email,getCoordinatorEmail_())&&!emailsMatch_(email,getConfig_('CELL_PD_EMAIL'))))throw new Error('Coordinator access is required.');
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(1000))throw new Error('Another setup is running. Try again shortly.');
  try {
    const validation=checkReviewConfiguration_();
    if(!validation.valid)throw new Error('Review configuration needs attention: '+validation.issues.map(issue=>issue.message).join(' '));
    return {journals:provisionAssessmentJournals_(getAssessmentDefinitions_())};
  }finally{lock.releaseLock();}
}
