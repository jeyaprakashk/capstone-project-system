/* Shared REVIEW engine. Every operation requires a configured assessment ID. */
const REVIEW_JOURNAL_HEADERS_ = ['Assessment','Team','Student','Revision','Action','Actor','At','Request ID','Payload'];
function reviewHistoryName_(key) { return assessmentJournal_(assessmentDefinition_(key)).name; }
function reviewConfiguration_(key) {
  const d=assessmentDefinition_(key);
  if(d.type!=='REVIEW')throw new Error('Expected REVIEW assessment.');
  const criteria=assessmentRubric_(d);
  return {key:d.key,label:d.label,criteria,maximum:criteria.reduce((n,c)=>n+c.maxMarks,0),due:d.day,opens:d.opens,
    timezone:getSpreadsheet_().getSpreadsheetTimeZone(),weight:d.weight/100,academicPolicyVersion:d.academicPolicyVersion,
    prerequisites:d.prerequisites,sequence:d.sequence};
}

/** Team readiness is independent of Review sequence. */
function reviewEligibility_(row, columns) {
  return String(row[columns.TITLE] || '').trim() && textEquals_(row[columns.REVIEWER_DECISION], 'Approved')
    ? {eligible:true,reason:''} : {eligible:false,reason:'Approve the project title before entering review marks.'};
}

function reviewContext_(teamId, staff, key) {
  const actor = guideActor_(staff);
  const columns = getColumnMap_(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const rows = getSheetRows_(SHEET_NAMES.TEAM_STATUS).filter(row=>textEquals_(row[columns.TEAM_ID],teamId));
  if (rows.length !== 1) throw new Error('Team is missing or ambiguous.');
  const row = rows[0], committee = String(row[columns.COMMITTEE_NUMBER] || '').trim();
  if (!staff && !getCommitteeNumbersForReviewer_(actor).some(n=>textEquals_(n,committee))) throw new Error('You are not an assigned reviewer for this team.');
  if(!staff){const block=assessmentPrerequisiteBlock_(assessmentDefinition_(key),row[columns.TEAM_ID]);if(block)throw new Error(block);}
  const students = getStudentsFromTeamStatusRow_(row,columns).map(s=>({register:normalizeReviewKey_(s.regNo),name:String(s.name || ''),email:normalizeEmail_(s.email)}));
  if (!students.length || new Set(students.map(s=>s.register)).size !== students.length) throw new Error('Student roster is missing or ambiguous.');
  const roster = {team:normalizeReviewKey_(row[columns.TEAM_ID]),committee,students};
  const committeeInfo=getCommitteeInfo_(committee) || {};
  return {actor,roster,eligibility:reviewEligibility_(row,columns),details:{team:String(row[columns.TEAM_ID]),
    title:String(row[columns.TITLE] || ''),problem:String(row[columns.PROBLEM] || ''),committee,
    reviewers:[1,2,3,4].map(n=>({name:String(committeeInfo['reviewer'+n+'Name'] || ''),email:String(committeeInfo['reviewer'+n+'Email'] || '')})).filter(r=>r.name || r.email),
    guideName:String(row[columns.GUIDE_NAME] || ''),guideEmail:String(row[columns.GUIDE_EMAIL] || '')}};
}

function reviewRecords_(key) {
  const storage=assessmentJournal_(assessmentDefinition_(key)),name=storage.name,sheet=storage.sheet;
  if (!sheet) return {sheet:null,records:[]};
  if(storage.state==='EMPTY')throw new Error(assessmentStorageMissing_(name));
  const rows = storage.rows || sheet.getDataRange().getValues();
  if (REVIEW_JOURNAL_HEADERS_.some((h,i)=>(rows[0]||[])[i]!==h)) throw new Error(name+' headers must be: '+REVIEW_JOURNAL_HEADERS_.join(', ')+'.');
  const groups=new Map();
  rows.slice(1).filter(r=>r[0]&&r[4]!=='publish').forEach(r=>{
    if (r[0] !== key) throw new Error('Unexpected assessment in '+name+' history.');
    const {scores,total,weighted,assessment,needsPublication,...common}=JSON.parse(r[8]);
    if (!scores || !common.config || !common.roster) throw new Error('Invalid student payload in '+name+'.');
    const teamScores={},individualScores={};
    common.config.criteria.forEach(c=>{
      if (Object.prototype.hasOwnProperty.call(scores,c.pi)) (c.type==='Team'?teamScores:individualScores)[c.pi]=scores[c.pi];
    });
    if(common.schemaVersion!==1 || !common.config.academicPolicyVersion || !Number.isSafeInteger(Number(r[3])) || Number(r[3])<1)throw new Error('Unsupported or invalid Review history revision.');
    const record={...common,team:normalizeReviewKey_(r[1]),revision:Number(r[3]),action:String(r[4]),actor:String(r[5]),at:String(r[6]),requestId:String(r[7]),teamScores};
    const groupKey=JSON.stringify([record.team,record.revision]), signature=JSON.stringify(record);
    if (!groups.has(groupKey)) groups.set(groupKey,{record,signature,students:[]});
    const group=groups.get(groupKey),register=normalizeReviewKey_(r[2]);
    if (group.signature!==signature || group.students.some(s=>s.register===register)) throw new Error('Inconsistent or duplicate student rows in '+name+'.');
    group.students.push({register,scores:individualScores,total,weighted,...(assessment?{assessment}:{}),...(needsPublication!==undefined?{needsPublication}:{})});
  });
  const records=Array.from(groups.values(),group=>{
    const roster=group.record.roster.students;
    if (group.students.length!==roster.length || !roster.every(s=>group.students.some(r=>r.register===s.register))) throw new Error('Incomplete student revision in '+name+'. Check the team rows before retrying.');
    return {...group.record,students:roster.map(s=>group.students.find(r=>r.register===s.register))};
  });
  return {sheet,records:publicationProject_(records,rows,key)};
}
function reviewLatest_(records, team) {
  return records.filter(r=>r.team===normalizeReviewKey_(team)).reduce((best,r)=>!best || r.revision>best.revision?r:best,null);
}
function reviewTiming_(config, evaluation) {
  if (evaluation && ['Submitted','Published'].includes(evaluation.status)) {
    const submittedConfig=evaluation.config || config;
    const submittedDay=Number.isInteger(evaluation.submittedDay)?evaluation.submittedDay:
      evaluation.submittedAt?projectDay_(new Date(evaluation.submittedAt),submittedConfig.timezone):null;
    if (submittedDay===null) return {tone:'neutral',label:'Submission timing unavailable'};
    return submittedDay<submittedConfig.due?{tone:'success',label:'Submitted early'}:
      submittedDay===submittedConfig.due?{tone:'success',label:'Submitted on time'}:{tone:'danger',label:'Submitted late'};
  }
  const today=projectDay_(new Date(),config.timezone);
  return today<config.due?{tone:'info',label:'Upcoming'}:today===config.due?{tone:'warning',label:'Due today'}:{tone:'danger',label:'Overdue'};
}
function reviewWriteResult_(revision,payload) {
  return {revision,status:payload.status,submittedAt:payload.submittedAt,submittedDay:payload.submittedDay??null,
    late:payload.late,timing:reviewTiming_(payload.config,payload),evaluation:payload};
}
function reviewAvailability_(context, config, latest) {
  const today = projectDay_(new Date(),config.timezone);
  const locked = !!latest && latest.status !== 'Draft';
  const reason = today < config.opens ? 'Opens '+new Date(config.opens*86400000).toISOString().slice(0,10) : context.eligibility.reason;
  return {editable:!locked && !reason,readable:locked || !reason,reason,opens:config.opens,late:today>config.due,timing:reviewTiming_(config,latest)};
}
function reviewStudentView_(config,teamScores,student) {
  if(!student.assessment || student.assessment.policyVersion!==config.academicPolicyVersion)throw new Error('Invalid finalized outcome policy.');
  return student;
}
function loadReviewEvaluation_(teamId,key) {return withAssessmentDefinitions_(()=>getReviewEvaluation_(teamId,key));}
function getReviewEvaluation_(teamId,key) {
  const context = reviewContext_(teamId,false,key), config = reviewConfiguration_(key);
  const history=reviewRecords_(key);
  if(!history.sheet)throw new Error(assessmentStorageMissing_(reviewHistoryName_(key)));
  const latest = reviewLatest_(history.records,context.roster.team);
  const availability = reviewAvailability_(context,config,latest);
  if (!availability.readable) throw new Error(availability.reason);
  return {details:context.details,roster:latest && latest.status!=='Draft'?latest.roster:context.roster,
    config:latest && latest.status!=='Draft'?latest.config:config,availability,
    token:guideFingerprint_({roster:context.roster,config:latest && latest.status!=='Draft'?latest.config:config}),revision:latest?latest.revision:0,
    status:latest?latest.status:'Not started',evaluation:latest?{...latest,students:latest.students.map(s=>reviewStudentView_(latest.config,latest.teamScores,s))}:null,
    assessmentResults:latest?null:context.roster.students.map(s=>reviewEffectiveStudent_(config,{}, {register:s.register,scores:{}}))};
}

function reviewScore_(config, roster, input, complete, previous) {
  const teamCriteria=config.criteria.filter(c=>c.type==='Team'),individual=config.criteria.filter(c=>c.type==='Individual');
  const teamScores=guideScore_(teamCriteria,input.teamScores,complete,0).scores;
  if(!Array.isArray(input.students)||input.students.length!==roster.students.length||new Set(input.students.map(s=>s&&s.register)).size!==roster.students.length||input.students.some(s=>!s||!roster.students.some(r=>r.register===s.register)))throw new Error('Provide one evaluation for every registered student.');
  const students=roster.students.map(member=>{
    const entry=input.students.find(s=>s.register===member.register),prior=previous&&previous.students.find(s=>s.register===member.register);
    const facts=reviewAbsenceFacts_(entry.absence);
    if(complete && facts.supportingEvidence?.includes('OTHER') && !facts.otherEvidenceText)throw new Error('Describe the other supporting absence evidence.');
    if(complete&&facts.type==='UNSELECTED')throw new Error('Select attendance for every student before submitting.');
    const normal=facts.type==='NORMAL'||facts.type==='PROLONGED'&&facts.attended;
    const supplied=entry.scores||{};
    if(!normal && JSON.stringify(supplied)!==JSON.stringify(prior?prior.scores:{}) && Object.values(supplied).some(s=>s&&s.marks!==null&&s.marks!==''&&s.marks!==undefined))throw new Error('Absent students require Individual Makeup, not normal marks.');
    const scores=guideScore_(individual,normal?supplied:prior?prior.scores:{},complete&&normal,0).scores;
    if(Object.values({...teamScores,...scores}).some(s=>s.marks!==null&&!Number.isInteger(s.marks*2)))throw new Error('Marks must use whole or half marks (increments of 0.5).');
    return reviewEffectiveStudent_(config,teamScores,{register:member.register,scores,assessment:{facts,...(prior&&prior.assessment.makeup?{makeup:prior.assessment.makeup}:{}),...(prior&&prior.assessment.events?{events:prior.assessment.events}:{})},needsPublication:true});
  });
  return {teamScores,students};
}

function reviewWrite_(action,input,key) {
  if(action==='publish'){const result=publishInternalAssessment_({...input,assessmentId:key});return reviewWriteResult_(result.revision,reviewRecords_(key).records.find(r=>r.team===normalizeText_(input.team)&&r.revision===result.revision));}
  const staff=action==='reopen';
  const actor=guideActor_(staff);
  if(!['draft','submit','publish','reopen','makeupDraft','makeupSubmit','absenceCorrection'].includes(action))throw new Error('Unsupported Review command.');
  return evaluationCommand_(action,input,fingerprint=>{
    const context=reviewContext_(input.team,staff,key), {sheet,records}=reviewRecords_(key);
    if (!sheet) throw new Error(assessmentStorageMissing_(reviewHistoryName_(key)));
    const duplicate=evaluationDuplicate_(records,actor,input,fingerprint);
    if (duplicate) {
      if (duplicate.fingerprint!==fingerprint) throw new Error('Request ID was already used for different data.');
      return reviewWriteResult_(duplicate.revision,duplicate);
    }
    const latest=reviewLatest_(records,context.roster.team);
    evaluationRevision_(latest,input);
    const rosterHash=guideFingerprint_(context.roster);
    let payload;
    if (staff) {
      if (!latest || !['Submitted','Published'].includes(latest.status)) throw new Error('This action is not available for the current status.');
        const reason=String(input.reason || '').trim();
        if (!reason || reason.length>2000) throw new Error('A reopening reason is required (maximum 2000 characters).');
        const currentConfig=reviewConfiguration_(key);
        evaluationAssertCompatible_(latest,currentConfig,context.roster);
        payload=JSON.parse(JSON.stringify(latest));
        Object.assign(payload,{status:'Draft',reason,copiedFromRevision:latest.revision,submittedAt:null,submittedDay:null,late:false,fingerprint});
        delete payload.publishedStudents;
        payload.students=payload.students.map(s=>reviewEffectiveStudent_(payload.config,payload.teamScores,{...s,needsPublication:true}));
    } else if (action==='absenceCorrection') {
      if(!latest || !['Submitted','Published'].includes(latest.status))throw new Error('Submit the evaluation before correcting absence details.');
      evaluationAssertCompatible_(latest,reviewConfiguration_(key),context.roster);
      if(input.token!==guideFingerprint_({roster:context.roster,config:latest.config}))throw new Error('Roster or rubric changed. Reload before correcting absence details.');
      payload=reviewAbsenceCorrection_(latest,input,actor);
      payload.fingerprint=fingerprint;
    } else if (['makeupDraft','makeupSubmit'].includes(action)) {
      if(!latest || !['Submitted','Published'].includes(latest.status))throw new Error('Submit the team evaluation before Individual Makeup.');
      evaluationAssertCompatible_(latest,reviewConfiguration_(key),context.roster);
      if(input.token!==guideFingerprint_({roster:context.roster,config:latest.config}))throw new Error('Roster or rubric changed. Reload before makeup.');
      payload=reviewMakeup_(latest,action,input,actor);
      payload.fingerprint=fingerprint;
    } else {
      const currentConfig=reviewConfiguration_(key);
      if(latest && latest.copiedFromRevision)evaluationAssertCompatible_(latest,currentConfig,context.roster);
      const config=latest&&latest.copiedFromRevision?latest.config:currentConfig, availability=reviewAvailability_(context,config,latest);
      if (latest && latest.status!=='Draft') throw new Error('Submitted evaluations are locked. Ask the coordinator to reopen.');
      if (!availability.editable) throw new Error(availability.reason);
      if (input.token!==guideFingerprint_({roster:context.roster,config})) throw new Error('Roster or rubric changed. Reload and review the evaluation.');
      const submittedAt=action==='submit'?new Date():null;
      const submittedDay=submittedAt?projectDay_(submittedAt,config.timezone):null;
      payload={...reviewScore_(config,context.roster,input,action==='submit',latest),config,roster:latest&&latest.copiedFromRevision?latest.roster:context.roster,rosterHash,fingerprint,...(latest&&latest.copiedFromRevision?{copiedFromRevision:latest.copiedFromRevision,reason:latest.reason}:{}),
        status:action==='submit'?'Submitted':'Draft',submittedAt:submittedAt?submittedAt.toISOString():null,
        submittedDay,late:submittedDay!==null && submittedDay>config.due};
    }
    payload.schemaVersion=1;
    ['publication','academicRevision','team','revision','action','actor','at','requestId'].forEach(k=>delete payload[k]);
    const revision=input.revision+1,at=new Date().toISOString();
    const {teamScores,students,...common}=payload;
    const values=students.map(student=>{
      const {register,scores,...studentData}=student;
      const json=JSON.stringify({...common,...studentData,scores:{...teamScores,...scores}});
      if (json.length>45000) throw new Error('Evaluation payload is too large. Shorten feedback.');
      return [key,context.roster.team,student.register,revision,action,actor,at,input.requestId,json].map(v=>typeof v==='string' && v.startsWith('=')?"'"+v:v);
    });
    evaluationAppend_(sheet,values);
    return reviewWriteResult_(revision,payload);
  });
}
function saveReviewEvaluationDraft_(input) {return reviewWrite_('draft',input,input.assessmentId);}
function submitReviewEvaluation_(input) {return reviewWrite_('submit',input,input.assessmentId);}
function reopenReviewEvaluation_(input) {return reviewWrite_('reopen',input,input.assessmentId);}
function saveReviewMakeupDraft_(input) {return reviewWrite_('makeupDraft',input,input.assessmentId);}
function submitReviewMakeup_(input) {return reviewWrite_('makeupSubmit',input,input.assessmentId);}
function recordReviewAbsence_(input) {return reviewWrite_('absenceCorrection',input,input.assessmentId);}
function reviewAbsenceCorrection_(latest,input,actor) {
  const allowed=['assessmentId','team','student','revision','token','requestId','absence'];
  if(Object.keys(input).some(key=>!allowed.includes(key)))throw new Error('Absence correction changes only absence details.');
  const original=latest.students.find(s=>s.register===normalizeReviewKey_(input.student));
  if(!original || !(['REVIEW_DAY_ABSENCE','PROLONGED'].includes(original.assessment.facts.type) || original.assessment.nextActions.makeup))throw new Error('Only existing absences or pending makeup can be corrected.');
  const facts=reviewAbsenceFacts_(input.absence);
  if(facts.type==='UNSELECTED')throw new Error('Select attendance before saving absence details.');
  if(facts.supportingEvidence?.includes('OTHER') && !facts.otherEvidenceText)throw new Error('Describe the other supporting absence evidence.');
  const student=JSON.parse(JSON.stringify(original));
  student.assessment.facts=facts;
  const result=reviewEffectiveStudent_(latest.config,latest.teamScores,student);
  if(facts.attended && result.assessment.individualState!=='RESOLVED')throw new Error('Normal individual marks are missing. Ask the coordinator to reopen the evaluation to enter those marks.');
  const outcome=s=>({total:s.total,weighted:s.weighted,...Object.fromEntries(['status','completed','teamMark','individualMark','teamState','individualState','teamSource','individualSource','effectiveScores'].map(key=>[key,s.assessment[key]]))});
  result.assessment.events=[...(result.assessment.events||[]),{action:'absenceCorrection',actor,at:new Date().toISOString(),requestId:input.requestId,
    before:{facts:original.assessment.facts,outcome:outcome(original)},after:{facts:result.assessment.facts,outcome:outcome(result)}}];
  result.needsPublication=true;
  const payload={...latest,students:latest.students.map(s=>s.register===original.register?result:s),status:'Submitted'};
  delete payload.publishedStudents;
  return payload;
}
function reviewAbsenceFacts_(value) {return reviewPolicyFacts_(value);}
function reviewEffectiveStudent_(config,teamScores,student) {return reviewPolicyCalculate_(config,teamScores,student);}
function reviewMakeup_(latest,action,input,actor) {
  if(input.teamScores || input.components || input.absence || input.decision)throw new Error('Makeup assesses only the pending Individual component.');
  const original=latest.students.find(s=>s.register===normalizeReviewKey_(input.student));
  if(!original || original.assessment.individualState!=='PENDING'||!original.assessment.nextActions.makeup)throw new Error('No Individual Makeup is pending.');
  const criteria=latest.config.criteria.filter(c=>c.type==='Individual');
  const scores=guideScore_(criteria,input.scores||{},action==='makeupSubmit',0).scores;
  if(Object.values(scores).some(s=>s.marks!==null&&!Number.isInteger(s.marks*2)))throw new Error('Marks must use whole or half marks.');
  const student=JSON.parse(JSON.stringify(original)),at=new Date().toISOString();
  if(action==='makeupDraft')student.assessment.makeupDraft={scores};
  else {
    student.assessment.makeup={scores,eventId:input.requestId,actor,at};delete student.assessment.makeupDraft;
    student.assessment.events=[...(student.assessment.events||[]),{action:'makeupSubmit',actor,at,requestId:input.requestId}];
  }
  const result=action==='makeupDraft'?student:reviewPolicyCalculate_(latest.config,null,student,original.assessment);
  if(action==='makeupSubmit'){
    result.total=original.assessment.teamMark+result.assessment.individualMark;
    result.weighted=Math.round(result.total/latest.config.maximum*latest.config.weight*10000)/100;
    result.needsPublication=true;
  }
  const payload={...latest,students:latest.students.map(s=>s.register===original.register?result:s),status:action==='makeupDraft'?latest.status:'Submitted'};
  delete payload.publishedStudents;return payload;
}

function reviewProgress_(row, columns, records, config, definition, loaded) {
  const roster=getStudentsFromTeamStatusRow_(row,columns), totalStudents=roster.length;
  const latest=reviewLatest_(records,row[columns.TEAM_ID]);
  const currentRoster={team:normalizeReviewKey_(row[columns.TEAM_ID]),committee:String(row[columns.COMMITTEE_NUMBER] || '').trim(),
    students:roster.map(s=>({register:normalizeReviewKey_(s.regNo),name:String(s.name || ''),email:normalizeEmail_(s.email)}))};
  const submitted=!!latest && ['Submitted','Published'].includes(latest.status) && evaluationHash_(evaluationMembership_(latest.roster))===evaluationHash_(evaluationMembership_(currentRoster));
  const isComplete=s=>s.assessment.completed;
  const markedStudents=submitted?latest.students.filter(isComplete).length:0;
  const recorded=submitted;
  const completed=submitted && markedStudents===totalStudents;
  const prerequisiteReason=assessmentPrerequisiteBlock_(definition||assessmentDefinition_(config.key),row[columns.TEAM_ID],loaded);
  const availability=reviewAvailability_({eligibility:{...reviewEligibility_(row,columns),...(prerequisiteReason?{reason:prerequisiteReason}:{})}},config,latest);
  return {completed,recorded,prerequisiteReason,markedStudents,totalStudents,available:true,status:latest?latest.status:'Not started',...availability};
}
function loadPublishedReviewEvaluation_(key) {return loadPublishedAssessment_(key);}

