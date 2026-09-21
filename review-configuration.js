/** Validate current Milestones and manually maintained rubric definitions. */
function validateReviewConfigurationRows_(milestoneRows, rubricRows, timezone) {
  const issues = [];
  let milestones = null, structure = null;
  try { milestones = parseMilestoneRows_(milestoneRows, timezone); }
  catch (err) { issues.push({sheet:'Milestones',message:err.message}); }
  if (milestones) {
    try { structure = parseRubricRows_(rubricRows, milestones.filter(item=>item.gradedBy!=='Not Applicable')); }
    catch (err) { issues.push({sheet:'Rubrics',message:err.message}); }
    if (!reviewsFromMilestones_(milestones).length) issues.push({sheet:'Milestones',message:'Add at least one milestone graded by Review Committee before creating marking sheets.'});
  }
  return {valid:issues.length===0, count:milestones ? reviewsFromMilestones_(milestones).length : null, issues, milestones, structure};
}
function checkReviewConfiguration_() {
  const checkedAt = new Date().toISOString(), links = {};
  try {
    const milestones = getSheet('Milestones'), rubrics = getSheet('Rubrics');
    if (milestones) links.config = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/edit#gid=' + milestones.getSheetId();
    if (rubrics) links.rubrics = 'https://docs.google.com/spreadsheets/d/' + SHEET_ID + '/edit#gid=' + rubrics.getSheetId();
    if (!milestones || !rubrics) throw new Error('Create the missing ' + (!milestones ? 'Milestones' : 'Rubrics') + ' tab.');
    const result = validateReviewConfigurationRows_(milestones.getDataRange().getValues(), rubrics.getDataRange().getValues(), getSpreadsheet().getSpreadsheetTimeZone());
    if (result.valid) {
      milestonesExecution_ = result.milestones;
      rubricExecutionStructure_ = result.structure;
      projectScheduleExecution_ = null;
    }
    return {valid:result.valid,count:result.count,issues:result.issues,checkedAt,links};
  } catch (err) {
    return {valid:false,count:null,issues:[{sheet:'Configuration',message:err.message}],checkedAt,links};
  }
}

function getCoordinatorReviewConfiguration() {
  const email = Session.getActiveUser().getEmail();
  if (!email || (!emailsMatch(email, getCoordinatorEmail()) && !emailsMatch(email, getConfig('CELL_PD_EMAIL')))) throw new Error('Coordinator access is required.');
  return checkReviewConfiguration_();
}
