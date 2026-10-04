/** Definition-driven Review discovery and dashboard completion. */
function getReviewDefinitions_() {
  const definitions=requireAssessmentDefinitions_().filter(d=>d.type==='REVIEW');
  if(!definitions.length)throw new Error('No REVIEW assessments are configured in AssessmentDefinitions. Ask the Coordinator to configure the required assessments.');
  return definitions.map(d=>({...d,rubric:assessmentRubric_(d)}));
}
function getAllReviewCompletionStatus_(timings,onlyKey) {return collectReviewCompletion_(undefined,timings,onlyKey);}
function getTeamReviewCompletionStatus_(teamId) {
  const key=normalizeReviewKey_(teamId);
  return key?collectReviewCompletion_(key)[key]||null:null;
}
function collectReviewCompletion_(requestedTeamId,timings,onlyKey) {
  const started=Date.now();let success=false;
  try {
    const TS=getColumnMap_(SHEET_NAMES.TEAM_STATUS,FIELD_DEFINITIONS.TEAM_STATUS);
    const rows=getSheetRows_(SHEET_NAMES.TEAM_STATUS).filter(row=>normalizeReviewKey_(row[TS.TEAM_ID])&&(!requestedTeamId||normalizeReviewKey_(row[TS.TEAM_ID])===requestedTeamId));
    const progress=getReviewerReviewProgress_(rows,onlyKey);
    if(progress.error)throw new Error(progress.error);
    const result=Object.create(null);
    rows.forEach(row=>{
      const key=normalizeReviewKey_(row[TS.TEAM_ID]);
      result[key]={teamId:String(row[TS.TEAM_ID]).trim(),committeeNumber:normalizeReviewKey_(row[TS.COMMITTEE_NUMBER]),totalStudents:getStudentsFromTeamStatusRow_(row,TS).length,...progress.teams[key]};
    });
    success=true;return result;
  }finally{if(timings)timings.push({phase:'review_journal_progress',durationMs:Date.now()-started,success,calls:1});}
}
function getStudentsFromTeamStatusRow_(row, TS) {
  return [
    {
      name: row[TS.S1_NAME],
      regNo: row[TS.S1_REGNO],
      email: row[TS.S1_EMAIL]
    },
    {
      name: row[TS.S2_NAME],
      regNo: row[TS.S2_REGNO],
      email: row[TS.S2_EMAIL]
    },
    {
      name: row[TS.S3_NAME],
      regNo: row[TS.S3_REGNO],
      email: row[TS.S3_EMAIL]
    },
    {
      name: row[TS.S4_NAME],
      regNo: row[TS.S4_REGNO],
      email: row[TS.S4_EMAIL]
    }
  ].filter(student => normalizeReviewKey_(student.regNo));
}


function normalizeReviewKey_(value) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return '';
  }

  return normalizeText_(value);
}
