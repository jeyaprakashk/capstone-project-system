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
  return {TS,row,committee,students,team:String(row[TS.TEAM_ID]),title:titleGate_(row[TS.TEAM_ID]).title};
}

/** Progress for the given team rows. `onlyKey` limits the work to one Review; the journals it needs are still read once each. `gate` asks for
 * the review's ActivityDependencies rows too: an array of kinds evaluates only those (the dashboard's cheap first pass), `true` evaluates all
 * (slow: Drive and GitHub, so one team at a time). `hint` runs the rows as a yes-or-no label: a document with a journal row is answered from
 * the journal with no Drive read (the entry itself still runs the full gate). Without `gate` no row is read: counts and completion never need it. */
function getReviewerReviewProgress_(rows, onlyKey, gate, hint, timings) {
  // The definitions and rubrics are read once for the whole run. A registry that cannot be parsed is reported as `error`, as it always was.
  let started=false;
  try { return withAssessmentDefinitions_(()=>{started=true;return reviewerReviewProgressRead_(rows,onlyKey,gate,hint,timings);}); }
  catch(err){ if(started)throw err; return {reviews:[],teams:Object.create(null),error:err.message}; }
}
function reviewerReviewProgressRead_(rows, onlyKey, gate, hint, timings) {
  const TS=getColumnMap_(SHEET_NAMES.TEAM_STATUS,FIELD_DEFINITIONS.TEAM_STATUS);
  const result={reviews:[],teams:Object.create(null),error:''};
  // Phase timings (names and milliseconds only) when the caller asked for them.
  const time=(phase,run)=>{if(!timings)return run();const at=Date.now();try{return run();}finally{timings.push({phase,durationMs:Date.now()-at});}};
  let definitions;
  try {result.reviews=time('definitions:reviews',()=>getReviewDefinitions_());definitions=time('definitions:all',()=>getAssessmentDefinitions_());}
  catch(err){result.error=err.message;return result;}
  const histories=Object.create(null);
  const history=key=>{
    if(!Object.prototype.hasOwnProperty.call(histories,key)){try{histories[key]={value:time('journal:'+key,()=>reviewRecords_(key,{discover:false}))};}catch(err){histories[key]={error:err};}}
    if(histories[key].error)throw histories[key].error;
    return histories[key].value;
  };
  let guide=null;
  const loaded={
    definitions,
    definition:id=>{const found=definitions.find(d=>d.key===normalizeText_(id));if(!found)throw new Error('Unknown assessment. Configure '+id+' in AssessmentDefinitions.');return found;},
    reviewRecords:key=>history(key).records,
    guideRecords:()=>guide||(guide=guideRecords_().records)
  };
  if (timings) loaded.timings=timings;
  if (gate) { loaded.activityContext=activityContext_(); if (Array.isArray(gate)) loaded.activityContext.kinds=gate; if (hint) loaded.activityContext.hint=true; if (timings) loaded.activityContext.timings=timings; }
  result.reviews.filter(review=>!onlyKey||review.key===onlyKey).forEach(review=>{
    let current,config,error='';
    try {config=time('config:'+review.key,()=>reviewConfiguration_(review.key));current=history(review.key);if(!current.sheet)throw new Error(assessmentStorageMissing_(reviewHistoryName_(review.key)));}
    catch(err){error=err.message;}
    rows.forEach(row=>{
      const team=normalizeReviewKey_(row[TS.TEAM_ID]);
      if(!result.teams[team])result.teams[team]={};
      result.teams[team][review.key]=error?{available:false,completed:false,error}:time('progress:'+review.key,()=>reviewProgress_(row,TS,current.records,config,review,loaded));
    });
  });
  return result;
}
