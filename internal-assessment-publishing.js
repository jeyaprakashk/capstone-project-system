/** Type adapters normalize publication views; academic outcomes are persisted inputs. */
function internalPublishingConfig_(key) {
  const d=publicationDefinition_(key),a=publicationAdapters_()[d.type];
  return {key,title:d.label,type:d.type,publishMethod:'publishInternalAssessment_',reopenMethod:'reopenInternalAssessment_',teamPublication:a.teamPublication,reopenScope:a.reopenScope,reopenDescription:a.reopenDescription};
}
function internalPublishingState_(team) {
  const students=team.students;
  if(team.issues.length||!students.length)return 'PARTIAL_OR_EXCEPTION';
  if(students.every(s=>s.publicationStatus==='PUBLISHED'&&!s.underCorrection))return 'PUBLISHED';
  if(students.some(s=>s.hasPublishedSnapshot))return 'PARTIALLY_PUBLISHED';
  if(students.every(s=>s.publicationPermission==='ALLOWED'))return 'READY_TO_PUBLISH';
  if(students.some(s=>s.publicationPermission==='ALLOWED'||s.submissionStatus==='Submitted'))return 'PARTIAL_OR_EXCEPTION';
  return 'AWAITING_EVALUATION';
}
function loadInternalAssessmentPublishing_(key) {
  const actor=guideActor_(true),definition=publicationDefinition_(key),adapter=publicationAdapters_()[definition.type],config=internalPublishingConfig_(key);
  let records,assessmentConfig,configurationError='';
  try {const history=adapter.read(key);if(!history.sheet)throw new Error('Assessment journal is missing.');records=history.records;}
  catch(error){return {ready:false,config,error:error.message,teams:[]};}
  try {assessmentConfig=adapter.config(key);}catch(error){configurationError=error.message;}
  const cols=getColumnMap_(SHEET_NAMES.TEAM_STATUS,FIELD_DEFINITIONS.TEAM_STATUS),rows=getSheetRows_(SHEET_NAMES.TEAM_STATUS).filter(r=>r[cols.TEAM_ID]);
  const teams=rows.map(row=>{
    const team=normalizeText_(row[cols.TEAM_ID]),issues=[];
    let roster;
    try{roster=publicationRoster_(team);}catch(error){issues.push(error.message);roster={team,students:getStudentsFromTeamStatusRow_(row,cols).map(s=>({register:normalizeText_(s.regNo),name:String(s.name||''),email:normalizeEmail_(s.email)}))};}
    const rosterIssue=issues[0]||'',latest=adapter.reopenScope==='team'?adapter.latest(records,team):null;
    const reopenInfo=record=>{
      if(!record||!['Submitted','Published'].includes(record.status))return {canReopen:false,reopenChanges:[],reopenReason:'A submitted evaluation is required.'};
      if(rosterIssue)return {canReopen:false,reopenChanges:[],reopenReason:rosterIssue};
      try {const changes=adapter.reopenChanges(record,key,roster);return {canReopen:!changes.length,reopenChanges:changes,reopenReason:changes.map(c=>c.dimension+' changed').join(', ')};}
      catch(error){return {canReopen:false,reopenChanges:[],reopenReason:error.message};}
    };
    const students=roster.students.map(member=>{
      const record=adapter.latest(records,team,member.register),saved=definition.type==='REVIEW'?record&&record.students.find(s=>s.register===member.register):record;
      const published=publicationLatestRelease_(records,team,member.register),status=record?record.status:'Not started';
      const membershipBlock=rosterIssue||publicationMembershipBlock_(record,roster);
      if(record&&membershipBlock&&!issues.includes(membershipBlock))issues.push(membershipBlock);
      if(record&&!saved)issues.push(member.register+': no matching student in the saved evaluation.');
      const pending=!!saved&&(definition.type==='REVIEW'?!!saved.needsPublication:status==='Submitted');
      const underCorrection=!!published&&records.some(r=>r.team===team&&(!r.student||r.student===member.register)&&r.action==='reopen'&&r.revision>published.record.revision);
      const block=membershipBlock||(!record||status!=='Submitted'?'This action is not available for the current status.':'')||(!pending?'No publication needed':'');
      return {...member,submissionStatus:status,revision:record?record.revision:0,
        assessmentStatus:saved?(definition.type==='REVIEW'?saved.assessment.status:status==='Draft'?'INCOMPLETE':'COMPLETED'):'Not started',
        assessmentComplete:!!saved&&(definition.type==='REVIEW'?saved.assessment.completed:status!=='Draft'),
        publicationPermission:block?'BLOCKED':'ALLOWED',blockingReason:block,publicationStatus:published?(pending&&status==='Submitted'?'UPDATE_PENDING':'PUBLISHED'):'NOT_PUBLISHED',
        underCorrection,hasPublishedSnapshot:!!published,publishedRevision:published?published.record.revision:null,publishedRequestId:published?published.record.requestId:null,
        needsPublication:pending,total:saved?saved.total:null,maximum:record?record.config.maximum:assessmentConfig?assessmentConfig.maximum:null,weighted:saved?saved.weighted:null,
        components:saved&&definition.type==='REVIEW'?{team:{score:saved.assessment.teamMark,state:saved.assessment.teamState,source:saved.assessment.teamSource},individual:{score:saved.assessment.individualMark,state:saved.assessment.individualState,source:saved.assessment.individualSource}}:null,
        ...reopenInfo(record)};
    });
    if(latest&&latest.students.some(s=>!roster.students.some(r=>r.register===s.register)))issues.push('Saved evaluation includes students outside the current roster.');
    if(definition.type==='GUIDE_EVALUATION'&&records.some(r=>r.team===team&&!roster.students.some(s=>s.register===r.student)))issues.push('Saved evaluation includes students outside the current roster.');
    const result={team,displayTeam:String(row[cols.TEAM_ID]),students,issues:Array.from(new Set(issues)),totalStudents:students.length,
      completedStudents:students.filter(s=>s.assessmentComplete).length,eligibleStudents:students.filter(s=>s.publicationPermission==='ALLOWED').length,publishedStudents:students.filter(s=>s.publicationStatus==='PUBLISHED').length,
      revision:latest?latest.revision:0,canPublishTeam:!issues.length&&students.some(s=>s.publicationPermission==='ALLOWED'&&s.needsPublication),
      ...(adapter.reopenScope==='team'?reopenInfo(latest):{canReopen:false}),
      operations:records.filter(r=>r.team===team&&r.actor===actor).map(r=>({requestId:r.requestId,action:r.action,revision:r.revision,student:r.student||null}))};
    result.publicationState=internalPublishingState_(result);result.publicationPermission=result.canPublishTeam?'ALLOWED':'BLOCKED';
    result.publicationStatus=students.some(s=>s.publicationStatus==='UPDATE_PENDING')?'UPDATE_PENDING':students.length&&students.every(s=>s.hasPublishedSnapshot)?'PUBLISHED':students.some(s=>s.hasPublishedSnapshot)?'PARTIALLY_PUBLISHED':'NOT_PUBLISHED';
    return result;
  });
  return {ready:true,config,teams,configurationError};
}

/** Publication card: reads and the publish / reopen requests the card sends. The existing functions authorize and validate. */
const PUBLISHING_RUN_METHODS_ = {publishInternalAssessment_:true, reopenInternalAssessment_:true};

function API_publishing_get(key) {
  return apiHandle_(() => loadInternalAssessmentPublishing_(String(key || '')));
}

function API_publishing_run(method, input) {
  return apiHandle_(() => {
    if (!Object.prototype.hasOwnProperty.call(PUBLISHING_RUN_METHODS_, String(method))) throw apiFail_('INVALID_INPUT', 'Unknown publication request.');
    return globalThis[method](input);
  });
}
