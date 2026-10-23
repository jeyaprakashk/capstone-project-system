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
    const result={team,displayTeam:String(row[cols.TEAM_ID]),guideName:String(row[cols.GUIDE_NAME]||''),students,issues:Array.from(new Set(issues)),totalStudents:students.length,
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

/**
 * The published results of one assessment for the coordinator's download: one row per roster student, sorted by register number,
 * with a mark for every PI of the assessment and the total. Only what was published is read (the released snapshot, which carries a
 * makeup's marks once a makeup was published). A student who was absent and has no makeup (the individual part is pending or was set by
 * policy) is `A`; with nothing published, a student is `NE` (the team is not eligible to be assessed yet: an earlier assessment or a requirement
 * is not met), `NA` (eligible, not assessed), `NS` (assessed, saved as a draft, not submitted) or `NP` (submitted, not yet published);
 * anything that cannot be read or calculated is `ERR`. Nothing is written.
 */
const PUBLICATION_EXPORT_LEGEND_ = Object.freeze([
  {code:'A', meaning:'Absent without a makeup: an absence with its makeup not yet done, or one for which no makeup is allowed.'},
  {code:'NE', meaning:'Not eligible: the team cannot be assessed yet (an earlier assessment or a requirement is not met).'},
  {code:'NA', meaning:'Eligible but not assessed.'},
  {code:'NS', meaning:'Eligible, assessed, saved as a draft but not submitted.'},
  {code:'NP', meaning:'Eligible, assessed and submitted, but not yet published.'},
  {code:'ERR', meaning:'The result could not be read or calculated.'}
]);
/** What the saved attendance facts say about an absent student, in words: the kind of absence, whether it was approved and the supporting evidence given. '' for a student who attended. */
function publicationAbsenceNote_(entry) {
  const facts=entry&&entry.assessment&&entry.assessment.facts;
  if(!facts||!['REVIEW_DAY_ABSENCE','PROLONGED'].includes(facts.type)||facts.attended===true)return '';
  const evidence={MEDICAL_DOCUMENT:'Medical document',APPROVAL_DOCUMENT:'Approval document'};
  const kind=facts.type==='REVIEW_DAY_ABSENCE'?'Review-day absence':'Prolonged absence';
  const approval=facts.approved===true?'approved':facts.approved===false?'not approved':'';
  const contribution=facts.type==='PROLONGED'&&typeof facts.verifiedContribution==='boolean'?(facts.verifiedContribution?'contribution established':'contribution not established'):'';
  const given=(facts.supportingEvidence||[]).map(item=>item==='OTHER'?'Other'+(facts.otherEvidenceText?': '+String(facts.otherEvidenceText).trim():''):evidence[item]||item);
  return 'Absence: '+[kind,approval,contribution].filter(Boolean).join(', ')+'.'+(given.length?' Supporting evidence: '+given.join('; ')+'.':'');
}
function publicationExportRow_(criteria,member,team,displayTeam,rosterOk,records,unpublished) {
  const fill=value=>Object.fromEntries(criteria.map(c=>[c.pi,value]));
  const row=(scores,total,name,comments)=>({register:member.register,name:name||member.name,team:displayTeam,scores,total,comments:comments||''});
  if(!rosterOk)return row(fill('ERR'),'ERR');
  let published;
  try{published=publicationLatestRelease_(records,team,member.register);}catch(error){return row(fill('ERR'),'ERR');}
  if(!published){const code=unpublished(member);return row(fill(code),code);}
  const snapshot=published.release.snapshot||{},assessment=snapshot.assessment||{},name=snapshot.identity&&snapshot.identity.name;
  // Every remark the reviewers gave, team and individual, one line per PI.
  const comments=criteria.map(c=>{const remark=String(snapshot.scores&&snapshot.scores[c.pi]&&snapshot.scores[c.pi].remark||'').trim();return remark?c.pi+': '+remark:'';}).filter(Boolean).join('\n');
  const absence=publicationAbsenceNote_(published.record.students&&published.record.students.find(s=>s.register===member.register));
  if(assessment.individualSource==='pending'||assessment.individualSource==='policy')return row(fill('A'),'A',name,absence);
  const scores={};
  for(const c of criteria){
    const score=snapshot.scores&&snapshot.scores[c.pi];
    if(!score||typeof score.marks!=='number'||!Number.isFinite(score.marks)||score.state!=='RESOLVED')return row(fill('ERR'),'ERR',name,comments);
    scores[c.pi]=score.marks;
  }
  if(typeof snapshot.total!=='number'||!Number.isFinite(snapshot.total))return row(fill('ERR'),'ERR',name,comments);
  return row(scores,snapshot.total,name,[comments,absence].filter(Boolean).join('\n'));
}
/** Whether a team may be assessed for a Review yet, as a reviewer would be told: the Sequence rule and the requirement rows (documents from the journal, no Drive read). 'NE' or 'NA'; 'ERR' when it cannot be told. */
function publicationEligibilityCode_(definition,statusRow,columns,loaded,context) {
  if(definition.type!=='REVIEW')return 'NA';
  try {
    if(assessmentSequenceBlock_(definition,statusRow[columns.TEAM_ID],loaded))return 'NE';
    return reviewEligibility_(statusRow,columns,{key:definition.key,ctx:context}).eligible?'NA':'NE';
  } catch(error){return 'ERR';}
}
function internalPublishingExport_(key) {
  guideActor_(true);
  const definition=publicationDefinition_(key),adapter=publicationAdapters_()[definition.type],history=adapter.read(key);
  if(!history.sheet)throw new Error('Assessment journal is missing.');
  const criteria=adapter.config(key).criteria.map(c=>({pi:String(c.pi),name:String(c.name),maxMarks:c.maxMarks,type:c.type}));
  const cols=getColumnMap_(SHEET_NAMES.TEAM_STATUS,FIELD_DEFINITIONS.TEAM_STATUS),rows=[];
  // One read of each journal and of the requirement rows serves every team.
  const journals={},definitions=requireAssessmentDefinitions_();let guide=null;
  const loaded={definitions,definition:id=>definitions.find(d=>d.key===normalizeText_(id)),reviewRecords:id=>journals[id]||(journals[id]=reviewRecords_(id).records),guideRecords:()=>guide||(guide=guideRecords_().records)};
  let context=null;
  getSheetRows_(SHEET_NAMES.TEAM_STATUS).filter(r=>r[cols.TEAM_ID]).forEach(statusRow=>{
    const team=normalizeText_(statusRow[cols.TEAM_ID]);
    let roster,rosterOk=true;
    try{roster=publicationRoster_(team);}
    catch(error){rosterOk=false;roster={team,students:getStudentsFromTeamStatusRow_(statusRow,cols).map(s=>({register:normalizeText_(s.regNo),name:String(s.name||'')}))};}
    let eligibility=null;
    const unpublished=member=>{
      let record;
      try{record=adapter.latest(history.records,team,member.register);}catch(error){return 'ERR';}
      if(record)return record.status==='Draft'?'NS':record.status==='Submitted'?'NP':'ERR';
      return eligibility||(eligibility=publicationEligibilityCode_(definition,statusRow,cols,loaded,context||(context=Object.assign(activityContext_(),{hint:true,title:{index:readTitleIndex_()}}))));
    };
    roster.students.filter(member=>member.register).forEach(member=>rows.push(publicationExportRow_(criteria,member,team,String(statusRow[cols.TEAM_ID]),rosterOk,history.records,unpublished)));
  });
  const numeric=value=>/^\d+$/.test(value);
  rows.sort((a,b)=>numeric(a.register)&&numeric(b.register)&&a.register.length!==b.register.length?a.register.length-b.register.length:a.register<b.register?-1:a.register>b.register?1:0);
  return {key:definition.key,label:definition.label,criteria,rows,legend:PUBLICATION_EXPORT_LEGEND_.map(item=>({code:item.code,meaning:item.meaning}))};
}

/** Publication card: reads and the publish / reopen requests the card sends. The existing functions authorize and validate. */
const PUBLISHING_RUN_METHODS_ = {publishInternalAssessment_:true, reopenInternalAssessment_:true};

function API_publishing_get(key) {
  return apiHandle_(() => loadInternalAssessmentPublishing_(String(key || '')));
}

function API_publishing_export(key) {
  return apiHandle_(() => internalPublishingExport_(String(key || '')));
}

function API_publishing_run(method, input) {
  return apiHandle_(() => {
    if (!Object.prototype.hasOwnProperty.call(PUBLISHING_RUN_METHODS_, String(method))) throw apiFail_('INVALID_INPUT', 'Unknown publication request.');
    return globalThis[method](input);
  });
}
