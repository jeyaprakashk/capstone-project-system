/* Read-only presentation adapters. Existing assessment engines own all writes. */
function internalPublishingConfig_(key) {
  const configs={
    review1:{key:'review1',title:'Review 1',publishMethod:'publishReview1Evaluation',reopenMethod:'reopenReview1Evaluation',teamPublication:'native',reopenScope:'team'},
    review2:{key:'review2',title:'Review 2',publishMethod:'publishReview2Evaluation',reopenMethod:'reopenReview2Evaluation',teamPublication:'native',reopenScope:'team'},
    guide_eval:{key:'guide_eval',title:'Guide Evaluation',publishMethod:'publishGuideEvaluation',reopenMethod:'reopenGuideEvaluation',teamPublication:'sequential',reopenScope:'student'}
  };
  if(!Object.prototype.hasOwnProperty.call(configs,key))throw new Error('Unknown assessment.');
  return configs[key];
}
function internalPublishingState_(team) {
  const students=team.students;
  if(team.issues.length || !students.length)return 'PARTIAL_OR_EXCEPTION';
  if(students.every(s=>s.publicationStatus==='PUBLISHED'))return 'PUBLISHED';
  if(students.some(s=>s.publicationStatus!=='NOT_PUBLISHED'))return 'PARTIALLY_PUBLISHED';
  if(students.every(s=>s.publicationPermission==='ALLOWED'))return 'READY_TO_PUBLISH';
  if(students.some(s=>s.publicationPermission==='ALLOWED' || s.submissionStatus==='Submitted'))return 'PARTIAL_OR_EXCEPTION';
  return 'AWAITING_EVALUATION';
}
function loadInternalAssessmentPublishing(key) {
  guideActor_(true);
  const config=internalPublishingConfig_(key),isGuide=key==='guide_eval';
  let records,assessmentConfig;
  try {
    if(isGuide){assessmentConfig=guideConfiguration_();records=guideRecords_().records;}
    else {assessmentConfig=review1Configuration_(key);const history=review1Records_(key);if(!history.sheet)throw new Error(reviewHistoryName_(key)+' is missing from the main spreadsheet.');records=history.records;}
  } catch(error){return {ready:false,config,error:error.message,teams:[]};}
  const cols=getColumnMap(SHEET_NAMES.TEAM_STATUS,FIELD_DEFINITIONS.TEAM_STATUS);
  const rows=getSheetRows(SHEET_NAMES.TEAM_STATUS).filter(row=>row[cols.TEAM_ID]);
  const normalize=isGuide?normalizeText_:normalizeReviewKey_;
  const teams=rows.map(row=>{
    const team=normalize(row[cols.TEAM_ID]),issues=[];
    const rosterStudents=getStudentsFromTeamStatusRow_(row,cols).map(s=>({register:normalize(s.regNo),name:String(s.name||''),email:normalizeEmail(s.email)}));
    if(rows.filter(r=>textEquals_(r[cols.TEAM_ID],row[cols.TEAM_ID])).length!==1)issues.push('Team is missing or ambiguous.');
    if(!rosterStudents.length || new Set(rosterStudents.map(s=>s.register)).size!==rosterStudents.length)issues.push('Student roster is missing or ambiguous.');
    const roster=isGuide?{team,guide:normalizeEmail(row[cols.GUIDE_EMAIL]),students:rosterStudents}:{team,committee:String(row[cols.COMMITTEE_NUMBER]||'').trim(),students:rosterStudents};
    const rosterHash=guideFingerprint_(roster);
    const latest=isGuide?null:review1Latest_(records,team);
    const history=isGuide?[]:records.filter(r=>r.team===team).sort((a,b)=>b.revision-a.revision);
    const reopened=history.find(r=>r.action==='reopen');
    if(latest && latest.rosterHash!==rosterHash)issues.push('Roster differs from the saved evaluation. Reopen the review to reconcile it.');
    if(latest && latest.students.some(s=>!rosterStudents.some(r=>r.register===normalize(s.register))))issues.push('Saved evaluation includes students outside the current roster.');
    const rosterIssue=issues[0]||'';
    const students=rosterStudents.map(member=>{
      const record=isGuide?guideLatest_(records,team,member.register):latest;
      const saved=isGuide?record:record && record.students.find(s=>normalize(s.register)===member.register);
      const effective=!isGuide && saved?reviewStudentView_(record.config,record.teamScores,saved):null;
      const published=isGuide?(record && record.status==='Published'?record:null):history.find(r=>(!reopened || r.revision>reopened.revision) && r.action==='publish' && (!r.publishedStudents || r.publishedStudents.includes(member.register)) && r.students.some(s=>normalize(s.register)===member.register));
      const submissionStatus=record?record.status:'Not started';
      const block=rosterIssue || (isGuide?guidePublicationBlock_(record,rosterHash):reviewPublicationBlock_(record,rosterHash,member.register));
      if(isGuide && record && record.rosterHash!==rosterHash)issues.push(member.register+': roster differs from the saved evaluation. Reopen this student evaluation to reconcile it.');
      if(!isGuide && record && !saved)issues.push(member.register+': no matching student in the saved evaluation.');
      // Legacy Review revisions can omit needsPublication. Infer their pending
      // presentation from publication snapshots, never from academic status.
      const pending=isGuide?submissionStatus==='Submitted':!!saved && (saved.needsPublication===true || saved.needsPublication===undefined && !published && submissionStatus==='Submitted');
      return {...member,submissionStatus,revision:record?record.revision:0,
        assessmentStatus:isGuide?(['Submitted','Published'].includes(submissionStatus)?'Complete':submissionStatus):(effective?effective.assessment.status:'Not started'),
        assessmentComplete:isGuide?['Submitted','Published'].includes(submissionStatus):!!(effective && effective.assessment.completed),
        publicationPermission:block?'BLOCKED':'ALLOWED',blockingReason:block,
        publicationStatus:published?(pending?'UPDATE_PENDING':'PUBLISHED'):'NOT_PUBLISHED',
        hasPublishedSnapshot:!!published,publishedRevision:published?published.revision:null,publishedRequestId:published?published.requestId:null,needsPublication:pending,
        total:isGuide?(record?record.total:null):(effective?effective.total:null),
        maximum:(record?record.config:assessmentConfig).maximum,
        weighted:isGuide?(record?record.weighted:null):(effective?effective.weighted:null),
        decisions:effective?effective.assessment.decisions||[]:[],
        canReopen:!rosterIssue && !!record && ['Submitted','Published'].includes(submissionStatus)};
    });
    const nativeBlock=isGuide?'':rosterIssue || reviewPublicationBlock_(latest,rosterHash);
    const result={team,displayTeam:String(row[cols.TEAM_ID]),students,issues:Array.from(new Set(issues)),totalStudents:rosterStudents.length,
      completedStudents:students.filter(s=>s.assessmentComplete).length,
      eligibleStudents:students.filter(s=>s.publicationPermission==='ALLOWED').length,
      publishedStudents:students.filter(s=>s.publicationStatus==='PUBLISHED').length,
      revision:latest?latest.revision:0,
      canPublishTeam:isGuide?students.some(s=>s.publicationPermission==='ALLOWED' && s.needsPublication):!nativeBlock,
      canReopen:!isGuide && !rosterIssue && !!latest && ['Submitted','Published'].includes(latest.status)};
    // A changed roster blocks publishing, but the existing reopen operation is
    // precisely how a valid current roster can replace that historical roster.
    if(!isGuide && issues.length && rosterStudents.length && rows.filter(r=>textEquals_(r[cols.TEAM_ID],row[cols.TEAM_ID])).length===1 && new Set(rosterStudents.map(s=>s.register)).size===rosterStudents.length)
      result.canReopen=!!latest && ['Submitted','Published'].includes(latest.status);
    if(isGuide && !rosterIssue)students.forEach(s=>{s.canReopen=['Submitted','Published'].includes(s.submissionStatus);});
    result.publicationState=internalPublishingState_(result);
    result.publicationPermission=result.canPublishTeam?'ALLOWED':'BLOCKED';
    result.publicationStatus=students.some(s=>s.publicationStatus==='UPDATE_PENDING')?'UPDATE_PENDING':students.length && students.every(s=>s.publicationStatus==='PUBLISHED')?'PUBLISHED':students.some(s=>s.hasPublishedSnapshot)?'PARTIALLY_PUBLISHED':'NOT_PUBLISHED';
    return result;
  });
  return {ready:true,config,teams};
}
