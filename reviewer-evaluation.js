/** Reviewer authorization and progress use configured REVIEW assessments only. */
function reviewerTeamContext_(teamId) {
  const email = Session.getActiveUser().getEmail();
  if (!email) throw new Error('Sign in with your institutional account.');
  const TS = getColumnMap_(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const rows = getSheetRows_(SHEET_NAMES.TEAM_STATUS).filter(r => textEquals_(r[TS.TEAM_ID], teamId));
  if (rows.length !== 1) throw new Error('Team is missing or ambiguous.');
  const row = rows[0], committee = String(row[TS.COMMITTEE_NUMBER] || '').trim();
  if (!getCommitteeNumbersForReviewer_(email).some(number => textEquals_(number, committee))) throw new Error('You are not an assigned reviewer for this team.');
  const students = getStudentsFromTeamStatusRow_(row, TS).map(student => ({register:normalizeReviewKey_(student.regNo),name:String(student.name || '')}));
  return {TS,row,committee,students,team:String(row[TS.TEAM_ID]),title:String(row[TS.TITLE] || '')};
}

/** Progress for the given team rows. `onlyKey` limits the work to one Review; its prerequisites are still read once each. */
function getReviewerReviewProgress_(rows, onlyKey) {
  const TS=getColumnMap_(SHEET_NAMES.TEAM_STATUS,FIELD_DEFINITIONS.TEAM_STATUS);
  const result={reviews:[],teams:Object.create(null),error:''};
  let definitions;
  try {result.reviews=getReviewDefinitions_();definitions=getAssessmentDefinitions_();}
  catch(err){result.error=err.message;return result;}
  const histories=Object.create(null);
  const history=key=>{
    if(!Object.prototype.hasOwnProperty.call(histories,key)){try{histories[key]={value:reviewRecords_(key)};}catch(err){histories[key]={error:err};}}
    if(histories[key].error)throw histories[key].error;
    return histories[key].value;
  };
  let guide=null;
  const loaded={
    definition:id=>{const found=definitions.find(d=>d.key===normalizeText_(id));if(!found)throw new Error('Unknown assessment. Configure '+id+' in AssessmentDefinitions.');return found;},
    reviewRecords:key=>history(key).records,
    guideRecords:()=>guide||(guide=guideRecords_().records)
  };
  result.reviews.filter(review=>!onlyKey||review.key===onlyKey).forEach(review=>{
    let current,config,error='';
    try {config=reviewConfiguration_(review.key);current=history(review.key);if(!current.sheet)throw new Error(assessmentStorageMissing_(reviewHistoryName_(review.key)));}
    catch(err){error=err.message;}
    rows.forEach(row=>{
      const team=normalizeReviewKey_(row[TS.TEAM_ID]);
      if(!result.teams[team])result.teams[team]={};
      result.teams[team][review.key]=error?{available:false,completed:false,error}:reviewProgress_(row,TS,current.records,config,review,loaded);
    });
  });
  return result;
}
