/** Reviewer authorization and progress use configured REVIEW assessments only. */
function reviewerTeamContext_(teamId) {
  const email = Session.getActiveUser().getEmail();
  if (!email) throw new Error('Sign in with your institutional account.');
  const TS = getColumnMap(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const rows = getSheetRows(SHEET_NAMES.TEAM_STATUS).filter(r => textEquals_(r[TS.TEAM_ID], teamId));
  if (rows.length !== 1) throw new Error('Team is missing or ambiguous.');
  const row = rows[0], committee = String(row[TS.COMMITTEE_NUMBER] || '').trim();
  if (!getCommitteeNumbersForReviewer(email).some(number => textEquals_(number, committee))) throw new Error('You are not an assigned reviewer for this team.');
  const students = getStudentsFromTeamStatusRow_(row, TS).map(student => ({register:normalizeReviewKey_(student.regNo),name:String(student.name || '')}));
  return {TS,row,committee,students,team:String(row[TS.TEAM_ID]),title:String(row[TS.TITLE] || '')};
}

function getReviewerReviewProgress_(rows) {
  const TS=getColumnMap(SHEET_NAMES.TEAM_STATUS,FIELD_DEFINITIONS.TEAM_STATUS);
  const result={reviews:[],teams:Object.create(null),error:''};
  try {result.reviews=getReviewDefinitions_();}
  catch(err){result.error=err.message;return result;}
  result.reviews.forEach(review=>{
    let history,config,error='';
    try {config=reviewConfiguration_(review.key);history=reviewRecords_(review.key);if(!history.sheet)throw new Error(assessmentStorageMissing_(reviewHistoryName_(review.key)));}
    catch(err){error=err.message;}
    rows.forEach(row=>{
      const team=normalizeReviewKey_(row[TS.TEAM_ID]);
      if(!result.teams[team])result.teams[team]={};
      result.teams[team][review.key]=error?{available:false,completed:false,error}:reviewProgress_(row,TS,history.records,config);
    });
  });
  return result;
}
