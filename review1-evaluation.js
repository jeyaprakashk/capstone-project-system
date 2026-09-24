/* Configurable Review 1/2 engine; existing Review 1 endpoint names remain compatible. */
const REVIEW1_HISTORY_ = 'Review1Evaluations';
const REVIEW1_HEADERS_ = ['Assessment','Team','Student','Revision','Action','Actor','At','Request ID','Payload'];
const REVIEW_ASSESSMENT_STATUS_ = Object.freeze({
  INCOMPLETE:'INCOMPLETE',
  COMPLETED:'COMPLETED',MAKEUP_PENDING:'MAKEUP_PENDING',COMPLETED_AFTER_MAKEUP:'COMPLETED_AFTER_MAKEUP',
  ABSENT_UNAPPROVED:'ABSENT_UNAPPROVED',ACADEMIC_DECISION_PENDING:'ACADEMIC_DECISION_PENDING',NON_PARTICIPATION:'NON_PARTICIPATION'
});

function reviewHistoryName_(key) {
  if (!['review1','review2'].includes(key)) throw new Error('Unknown assessment.');
  return key==='review1'?REVIEW1_HISTORY_:'Review2Evaluations';
}
function review1Configuration_(key='review1') {
  reviewHistoryName_(key);
  const review = getReviewDefinitions_().find(item => item.key === key);
  if (!review || !Number.isInteger(review.day)) throw new Error('Configure '+key+' and its date in Milestones.');
  return {key:review.key,label:review.label,criteria:review.rubric,maximum:review.rubric.reduce((n,c)=>n+c.maxMarks,0),
    due:review.day,opens:review.day-7,timezone:getSpreadsheet().getSpreadsheetTimeZone(),weight:review.weight/100,policy:GUIDE_EVAL_POLICY_};
}

/** Provisional academic eligibility policy; replace here when requirements are finalized. */
function review1Eligibility_(row, columns) {
  return String(row[columns.TITLE] || '').trim() && textEquals_(row[columns.REVIEWER_DECISION], 'Approved')
    ? {eligible:true,reason:''} : {eligible:false,reason:'Approve the project title before entering Review 1 marks.'};
}

function review1Context_(teamId, staff, key='review1') {
  const actor = guideActor_(staff);
  const columns = getColumnMap(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const rows = getSheetRows(SHEET_NAMES.TEAM_STATUS).filter(row=>textEquals_(row[columns.TEAM_ID],teamId));
  if (rows.length !== 1) throw new Error('Team is missing or ambiguous.');
  const row = rows[0], committee = String(row[columns.COMMITTEE_NUMBER] || '').trim();
  if (!staff && !getCommitteeNumbersForReviewer(actor).some(n=>textEquals_(n,committee))) throw new Error('You are not an assigned reviewer for this team.');
  if (key==='review2' && !staff) review1RequireCompleted_(row,columns,'Review 2');
  const students = getStudentsFromTeamStatusRow_(row,columns).map(s=>({register:normalizeReviewKey_(s.regNo),name:String(s.name || ''),email:normalizeEmail(s.email)}));
  if (!students.length || new Set(students.map(s=>s.register)).size !== students.length) throw new Error('Student roster is missing or ambiguous.');
  const roster = {team:normalizeReviewKey_(row[columns.TEAM_ID]),committee,students};
  const committeeInfo=getCommitteeInfo(committee) || {};
  return {actor,roster,eligibility:review1Eligibility_(row,columns),details:{team:String(row[columns.TEAM_ID]),
    title:String(row[columns.TITLE] || ''),problem:String(row[columns.PROBLEM] || ''),committee,
    reviewers:[1,2,3,4].map(n=>({name:String(committeeInfo['reviewer'+n+'Name'] || ''),email:String(committeeInfo['reviewer'+n+'Email'] || '')})).filter(r=>r.name || r.email),
    guideName:String(row[columns.GUIDE_NAME] || ''),guideEmail:String(row[columns.GUIDE_EMAIL] || '')}};
}

function review1Records_(key='review1') {
  const name=reviewHistoryName_(key), sheet = getSheet(name);
  if (!sheet) return {sheet:null,records:[]};
  const rows = sheet.getDataRange().getValues();
  if (REVIEW1_HEADERS_.some((h,i)=>(rows[0]||[])[i]!==h)) throw new Error(name+' headers must be: '+REVIEW1_HEADERS_.join(', ')+'.');
  const groups=new Map();
  rows.slice(1).filter(r=>r[0]).forEach(r=>{
    if (r[0] !== key) throw new Error('Unexpected assessment in '+name+' history.');
    const {scores,total,weighted,assessment,needsPublication,...common}=JSON.parse(r[8]);
    if (!scores || !common.config || !common.roster) throw new Error('Invalid student payload in Review1Evaluations.');
    const teamScores={},individualScores={};
    common.config.criteria.forEach(c=>{
      if (Object.prototype.hasOwnProperty.call(scores,c.pi)) (c.type==='Team'?teamScores:individualScores)[c.pi]=scores[c.pi];
    });
    const record={...common,team:String(r[1]),revision:Number(r[3]),action:String(r[4]),actor:String(r[5]),at:String(r[6]),requestId:String(r[7]),teamScores};
    const groupKey=JSON.stringify([record.team,record.revision]), signature=JSON.stringify(record);
    if (!groups.has(groupKey)) groups.set(groupKey,{record,signature,students:[]});
    const group=groups.get(groupKey),register=normalizeReviewKey_(r[2]);
    if (group.signature!==signature || group.students.some(s=>s.register===register)) throw new Error('Inconsistent or duplicate student rows in Review1Evaluations.');
    group.students.push({register,scores:individualScores,total,weighted,...(assessment?{assessment}:{}),...(needsPublication!==undefined?{needsPublication}:{})});
  });
  const records=Array.from(groups.values(),group=>{
    const roster=group.record.roster.students;
    if (group.students.length!==roster.length || !roster.every(s=>group.students.some(r=>r.register===s.register))) throw new Error('Incomplete student revision in Review1Evaluations. Check the team rows before retrying.');
    return {...group.record,students:roster.map(s=>group.students.find(r=>r.register===s.register))};
  });
  return {sheet,records};
}
function review1Latest_(records, team) {
  return records.filter(r=>r.team===normalizeReviewKey_(team)).reduce((best,r)=>!best || r.revision>best.revision?r:best,null);
}
function review1Timing_(config, evaluation) {
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
function review1WriteResult_(revision,payload) {
  return {revision,status:payload.status,submittedAt:payload.submittedAt,submittedDay:payload.submittedDay??null,
    late:payload.late,timing:review1Timing_(payload.config,payload),evaluation:payload};
}
function review1Availability_(context, config, latest) {
  const today = projectDay_(new Date(),config.timezone);
  const locked = !!latest && latest.status !== 'Draft';
  const reason = today < config.opens ? 'Opens '+new Date(config.opens*86400000).toISOString().slice(0,10) : context.eligibility.reason;
  return {editable:!locked && !reason,readable:locked || !reason,reason,opens:config.opens,late:today>config.due,timing:review1Timing_(config,latest)};
}
function getReview1Evaluation(teamId) {return getReviewEvaluation_(teamId,'review1');}
function getReview2Evaluation(teamId) {return getReviewEvaluation_(teamId,'review2');}
function reviewStudentView_(config,teamScores,student) {
  if(student.assessment && student.assessment.facts.type==='PROLONGED')return reviewEffectiveStudent_(config,teamScores,student);
  const assessment=student.assessment || reviewEffectiveStudent_(config,teamScores,student).assessment;
  // Preserve recorded, completed totals; normalize unresolved legacy display values only, without writing history.
  return {...student,total:assessment.completed?student.total:null,weighted:assessment.completed?student.weighted:null,assessment};
}
function getReviewEvaluation_(teamId,key) {
  const context = review1Context_(teamId,false,key), config = review1Configuration_(key);
  const latest = review1Latest_(review1Records_(key).records,context.roster.team);
  const availability = review1Availability_(context,config,latest);
  if (!availability.readable) throw new Error(availability.reason);
  return {details:context.details,roster:latest && latest.status!=='Draft'?latest.roster:context.roster,
    config:latest && latest.status!=='Draft'?latest.config:config,availability,
    token:guideFingerprint_({roster:context.roster,config:latest && latest.status!=='Draft'?latest.config:config}),revision:latest?latest.revision:0,
    status:latest?latest.status:'Not started',evaluation:latest?{...latest,students:latest.students.map(s=>reviewStudentView_(latest.config,latest.teamScores,s))}:null,
    assessmentResults:latest?null:context.roster.students.map(s=>reviewEffectiveStudent_(config,{}, {register:s.register,scores:{}}))};
}

function review1Score_(config, roster, input, complete, previous) {
  const teamCriteria=config.criteria.filter(c=>c.type==='Team'), individual=config.criteria.filter(c=>c.type==='Individual');
  const teamScores=guideScore_(teamCriteria,input.teamScores,complete,0).scores;
  if (!Array.isArray(input.students) || input.students.length!==roster.students.length ||
      new Set(input.students.map(s=>s && s.register)).size!==roster.students.length ||
      input.students.some(s=>!s || !roster.students.some(r=>r.register===s.register))) throw new Error('Provide one evaluation for every registered student.');
  const students=roster.students.map(student=>{
    const entry=input.students.find(s=>s.register===student.register);
    const prior=previous && previous.students.find(s=>s.register===student.register);
    const facts=reviewAbsenceFacts_(entry.absence || (prior && prior.assessment && prior.assessment.facts),true);
    if(complete && facts.type==='UNSELECTED')throw new Error('Select attendance for every student before submitting.');
    if((facts.absenceReason || facts.type==='PROLONGED') && prior && prior.assessment && prior.assessment.facts.reason)facts.reason=prior.assessment.facts.reason;
    const preserve=facts.type!=='NORMAL' && prior && reviewScoresComplete_(individual,prior.scores);
    const allowed=facts.type==='NORMAL' || (facts.type==='PROLONGED' && facts.attended);
    if (!allowed && !preserve && Object.values(entry.scores||{}).some(s=>s && s.marks!==null && s.marks!==undefined && s.marks!=='')) throw new Error('Absent students require an authorized targeted assessment; do not enter documentary-only marks.');
    const academicPending=facts.type==='PROLONGED' && facts.approved && !facts.verifiedContribution;
    const individualScores=guideScore_(individual,preserve?prior.scores:(entry.scores||{}),complete && (preserve || allowed && !academicPending),0).scores;
    const scored=guideScore_(config.criteria,{...teamScores,...individualScores},false,config.weight);
    if (Object.values(scored.scores).some(score=>score.marks!==null && !Number.isInteger(score.marks*2))) throw new Error('Review 1 marks must use whole or half marks (increments of 0.5).');
    return reviewEffectiveStudent_(config,teamScores,{register:student.register,scores:individualScores,assessment:{facts,decisions:[],teamDecision:null,makeupCompleted:false},needsPublication:true});
  });
  return {teamScores,students};
}

function review1Write_(action,input,key='review1') {
  const staff=action==='publish' || action==='reopen';
  const actor=guideActor_(staff);
  if (!input || typeof input.requestId!=='string' || !/^[A-Za-z0-9_-]{12,100}$/.test(input.requestId) || !Number.isSafeInteger(input.revision) || input.revision<0) throw new Error('Invalid request. Reload and retry.');
  const lock=LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error('Another evaluation is saving. Retry shortly.');
  try {
    const context=review1Context_(input.team,staff,key), {sheet,records}=review1Records_(key);
    if (!sheet) throw new Error(reviewHistoryName_(key)+' is missing from the main spreadsheet. Create the tab manually with the required headers.');
    const fingerprint=guideFingerprint_({action,input});
    const duplicate=records.find(r=>r.actor===actor && r.requestId===input.requestId);
    if (duplicate) {
      if (duplicate.fingerprint!==fingerprint) throw new Error('Request ID was already used for different data.');
      return review1WriteResult_(duplicate.revision,duplicate);
    }
    const latest=review1Latest_(records,context.roster.team);
    if ((latest?latest.revision:0)!==input.revision) throw new Error('This evaluation changed. Reload before saving.');
    const rosterHash=guideFingerprint_(context.roster);
    let payload;
    if (staff) {
      if (!latest || (action==='publish'?latest.status!=='Submitted':!['Submitted','Published'].includes(latest.status))) throw new Error('This action is not available for the current status.');
      if (action==='publish') {
        if (latest.rosterHash!==rosterHash) throw new Error('Roster changed; reopen and ask the reviewer to review.');
        if(input.student && !latest.students.some(s=>s.register===input.student)) throw new Error('Unknown student.');
        const students=latest.students.map(s=>(!input.student || s.register===input.student)?{...s,needsPublication:false}:s);
        payload={...latest,students,status:students.some(s=>s.needsPublication)?'Submitted':'Published',publishedStudents:students.filter(s=>!input.student || s.register===input.student).map(s=>s.register),fingerprint};
      } else {
        const reason=String(input.reason || '').trim();
        if (!reason || reason.length>2000) throw new Error('A reopening reason is required (maximum 2000 characters).');
        payload={config:review1Configuration_(key),roster:context.roster,rosterHash,teamScores:{},students:context.roster.students.map(s=>({register:s.register,scores:{},total:null,weighted:null})),
          status:'Draft',reason,submittedAt:null,submittedDay:null,late:false,fingerprint};
      }
    } else if (['decision','targetDraft','targetSubmit','exception'].includes(action)) {
      if(!latest || !['Submitted','Published'].includes(latest.status)) throw new Error('Submit the team evaluation before recording a targeted assessment.');
      if(latest.rosterHash!==rosterHash || input.token!==guideFingerprint_({roster:context.roster,config:latest.config})) throw new Error('Roster or rubric changed. Reload before recording the assessment.');
      payload=reviewTargeted_(latest,action,input,actor);
      payload.fingerprint=fingerprint;
    } else {
      const config=review1Configuration_(key), availability=review1Availability_(context,config,latest);
      if (latest && latest.status!=='Draft') throw new Error('Submitted evaluations are locked. Ask the coordinator to reopen.');
      if (!availability.editable) throw new Error(availability.reason);
      if (input.token!==guideFingerprint_({roster:context.roster,config})) throw new Error('Roster or rubric changed. Reload and review the evaluation.');
      const submittedAt=action==='submit'?new Date():null;
      const submittedDay=submittedAt?projectDay_(submittedAt,config.timezone):null;
      payload={...review1Score_(config,context.roster,input,action==='submit',latest),config,roster:context.roster,rosterHash,fingerprint,
        status:action==='submit'?'Submitted':'Draft',submittedAt:submittedAt?submittedAt.toISOString():null,
        submittedDay,late:submittedDay!==null && submittedDay>config.due};
    }
    ['team','revision','action','actor','at','requestId'].forEach(k=>delete payload[k]);
    const revision=input.revision+1,at=new Date().toISOString();
    const {teamScores,students,...common}=payload;
    const values=students.map(student=>{
      const {register,scores,...studentData}=student;
      const json=JSON.stringify({...common,...studentData,scores:{...teamScores,...scores}});
      if (json.length>45000) throw new Error('Evaluation payload is too large. Shorten feedback.');
      return [key,context.roster.team,student.register,revision,action,actor,at,input.requestId,json].map(v=>typeof v==='string' && v.startsWith('=')?"'"+v:v);
    });
    const firstRow=sheet.getLastRow()+1;
    guideEnsureRows_(sheet,firstRow+values.length-1);
    // One rectangular write saves the complete team revision, with no per-student RPCs.
    sheet.getRange(firstRow,1,values.length,REVIEW1_HEADERS_.length).setValues(values);
    SpreadsheetApp.flush();
    return review1WriteResult_(revision,payload);
  } finally {lock.releaseLock();}
}
function saveReview1EvaluationDraft(input) {return review1Write_('draft',input);}
function submitReview1Evaluation(input) {return review1Write_('submit',input);}
function publishReview1Evaluation(input) {return review1Write_('publish',input);}
function reopenReview1Evaluation(input) {return review1Write_('reopen',input);}
function saveReview2EvaluationDraft(input) {return review1Write_('draft',input,'review2');}
function submitReview2Evaluation(input) {return review1Write_('submit',input,'review2');}
function publishReview2Evaluation(input) {return review1Write_('publish',input,'review2');}
function reopenReview2Evaluation(input) {return review1Write_('reopen',input,'review2');}
function recordReviewAcademicDecision(input) {return review1Write_('decision',input,input.review);}
function recordReviewAbsence(input) {return review1Write_('exception',input,input.review);}
function saveReviewTargetedAssessment(input) {return review1Write_(input.submit===true?'targetSubmit':'targetDraft',input,input.review);}

/** Source facts only. Neither blank marks nor client-computed outcomes establish absence. */
function reviewAbsenceFacts_(value, writing=false) {
  const f=value || {type:'NORMAL'};
  if(f.type==='UNSELECTED')return {type:'UNSELECTED',attended:null};
  if(!['NORMAL','REVIEW_DAY_ABSENCE','PROLONGED'].includes(f.type)) throw new Error('Invalid absence type.');
  if(f.type==='NORMAL') return {type:'NORMAL',attended:true};
  if(typeof f.approved!=='boolean') throw new Error('Select whether the absence is approved.');
  if(f.type==='PROLONGED') {
    if(typeof f.verifiedContribution!=='boolean' || typeof f.attended!=='boolean')throw new Error('Record verified contribution and scheduled review attendance.');
    const structured=writing || Object.prototype.hasOwnProperty.call(f,'contributionEvidence') || Object.prototype.hasOwnProperty.call(f,'absenceReason');
    if(structured) {
      const evidence=f.contributionEvidence ?? [];
      const choices=['GUIDE_CONFIRMATION','PROJECT_LOG','GITHUB_ACTIVITY','ASSIGNED_TASK','TECHNICAL_DESIGN','OTHER'];
      if(!Array.isArray(evidence) || new Set(evidence).size!==evidence.length || evidence.some(e=>!choices.includes(e)))throw new Error('Invalid contribution evidence selection.');
      if(f.verifiedContribution && !evidence.length)throw new Error('At least one contribution evidence item is required.');
      if(!f.verifiedContribution && (evidence.length || f.otherContributionEvidenceText))throw new Error('Contribution evidence requires verified contribution.');
      if(f.supportingEvidence!=null && !Array.isArray(f.supportingEvidence))throw new Error('Invalid supporting absence evidence selection.');
      if(!f.approved && (f.absenceReason || (f.supportingEvidence||[]).length || f.otherReasonText || f.otherEvidenceText))throw new Error('Approved absence evidence requires absence approval.');
      if(f.otherReasonText && f.absenceReason!=='OTHER_APPROVED' || f.otherEvidenceText && !(f.supportingEvidence||[]).includes('OTHER'))throw new Error('Other absence details require the corresponding Other selection.');
      const other=String(f.otherContributionEvidenceText||'').trim();
      if(evidence.includes('OTHER') && !other || other.length>2000)throw new Error('Describe other contribution evidence (maximum 2000 characters).');
      if(other && !evidence.includes('OTHER'))throw new Error('Other contribution text requires Other contribution evidence.');
      const approval=f.approved?reviewAbsenceFacts_({...f,type:'REVIEW_DAY_ABSENCE',absenceReason:f.absenceReason??null}):{absenceReason:null,supportingEvidence:[],otherReasonText:null,otherEvidenceText:null};
      return {...approval,type:'PROLONGED',approved:f.approved,verifiedContribution:f.verifiedContribution,attended:f.attended,
        contributionEvidence:[...evidence],otherContributionEvidenceText:evidence.includes('OTHER')?other:null,...(f.reason?{reason:f.reason}:{})};
    }
  }
  // Unapproved review-day absence needs no justification. Prior revisions retain saved evidence.
  if(f.type==='REVIEW_DAY_ABSENCE' && !f.approved) return {type:f.type,approved:false,attended:false,absenceReason:null,supportingEvidence:[],otherReasonText:null,otherEvidenceText:null};
  const reason=String(f.reason || '').trim();
  if(f.type==='REVIEW_DAY_ABSENCE' && Object.prototype.hasOwnProperty.call(f,'absenceReason')) {
    if(!['MEDICAL','PERSONAL_FAMILY','OFFICIAL_ACADEMIC','OTHER_APPROVED'].includes(f.absenceReason)) throw new Error('Select one primary reason for absence.');
    const evidence=f.supportingEvidence ?? [];
    if(!Array.isArray(evidence) || new Set(evidence).size!==evidence.length || evidence.some(e=>!['MEDICAL_DOCUMENT','APPROVAL_DOCUMENT','OTHER'].includes(e))) throw new Error('Invalid supporting evidence selection.');
    const detail=(value,required,label)=>{
      const text=String(value || '').trim();
      if(required && !text || text.length>2000) throw new Error(label+' is required when Other is selected (maximum 2000 characters).');
      return required?text:null;
    };
    if(reason.length>2000) throw new Error('Historical reason exceeds 2000 characters.');
    return {type:f.type,approved:f.approved,attended:false,absenceReason:f.absenceReason,supportingEvidence:[...evidence],
      otherReasonText:detail(f.otherReasonText,f.absenceReason==='OTHER_APPROVED','Other approved reason'),
      otherEvidenceText:detail(f.otherEvidenceText,evidence.includes('OTHER'),'Other supporting evidence'),
      ...(f.reason?{reason:f.reason}:{})};
  }
  // Keep legacy free-text records readable; new Review-Day forms always send absenceReason.
  if(!reason || reason.length>2000) throw new Error('Exception evidence/reason is required (maximum 2000 characters).');
  if(f.type==='PROLONGED' && (typeof f.verifiedContribution!=='boolean' || typeof f.attended!=='boolean')) throw new Error('Record verified contribution and scheduled review attendance.');
  return {type:f.type,approved:f.approved,reason,attended:f.type==='PROLONGED'?f.attended:false,
    ...(f.type==='PROLONGED'?{verifiedContribution:f.verifiedContribution}:{})};
}
function reviewScoresComplete_(criteria,scores) {
  return criteria.every(c=>scores && scores[c.pi] && typeof scores[c.pi].marks==='number' && Number.isFinite(scores[c.pi].marks) && Number.isInteger(scores[c.pi].level) && (scores[c.pi].level>=2 || String(scores[c.pi].remark || '').trim()));
}
function reviewEffectiveStudent_(config,teamScores,student) {
  const S=REVIEW_ASSESSMENT_STATUS_;
  const a=student.assessment || {}, facts=reviewAbsenceFacts_(a.facts), team=config.criteria.filter(c=>c.type==='Team'), individual=config.criteria.filter(c=>c.type==='Individual');
  const sum=(criteria,scores)=>reviewScoresComplete_(criteria,scores)?Math.round(criteria.reduce((n,c)=>n+scores[c.pi].marks,0)*100)/100:null;
  const classification=facts.type==='PROLONGED'?'PROLONGED_'+(facts.approved?'APPROVED':'UNAPPROVED')+'_'+(facts.verifiedContribution?'WITH':'WITHOUT')+'_CONTRIBUTION':facts.type;
  let teamMark=sum(team,teamScores), individualMark=sum(individual,student.scores), teamSource='common', individualSource='assessment';
  if(facts.type==='PROLONGED' && !facts.verifiedContribution) {teamMark=facts.approved?null:0;teamSource=facts.approved?'pending':'policy';}
  if(a.teamDecision==='TEAM_MARK_APPLICABLE') {teamMark=sum(team,teamScores);teamSource='common';}
  if(a.teamDecision==='TEAM_MARK_NOT_APPLICABLE') {teamMark=0;teamSource='policy';}
  if(a.alternativeTeamScores) {teamMark=sum(team,a.alternativeTeamScores);teamSource='assessment';}
  const preserve=individualMark!==null && facts.type==='PROLONGED';
  if(facts.type!=='UNSELECTED' && !facts.attended && !a.makeupCompleted && !preserve) {
    individualMark=facts.approved?null:0;individualSource=facts.approved?'pending':'policy';
  }
  if(facts.type==='PROLONGED' && facts.approved && !facts.verifiedContribution && !facts.attended && !preserve && !a.makeupCompleted) {individualMark=null;individualSource='pending';}
  if(a.individualPending && !a.makeupCompleted) {individualMark=null;individualSource='pending';}
  if(facts.type==='UNSELECTED'){individualMark=null;individualSource='assessment';}
  const total=teamMark===null || individualMark===null?null:Math.round((teamMark+individualMark)*100)/100;
  let status=total===null?S.INCOMPLETE:S.COMPLETED;
  if(facts.type!=='UNSELECTED' && !facts.attended && !facts.approved && !a.makeupCompleted) status=S.ABSENT_UNAPPROVED;
  if(facts.type==='PROLONGED' && !facts.approved && !facts.verifiedContribution) status=S.NON_PARTICIPATION;
  if(individualMark===null && individualSource==='pending') status=S.MAKEUP_PENDING;
  if(teamMark===null && teamSource==='pending') status=S.ACADEMIC_DECISION_PENDING;
  if(total!==null && (a.makeupCompleted || a.alternativeTeamScores) && status!==S.NON_PARTICIPATION) status=S.COMPLETED_AFTER_MAKEUP;
  const state=(mark,source)=>mark!==null?'RESOLVED':source==='pending'?'PENDING':'UNASSESSED';
  const teamState=state(teamMark,teamSource),individualState=state(individualMark,individualSource);
  const assessmentComponents=a.authorized && a.authorized.length?a.authorized:(facts.approved && !facts.attended && status===S.MAKEUP_PENDING?['individual']:[]);
  const nextActions={assessmentComponents,academicDecision:teamState==='PENDING' || !assessmentComponents.length && individualSource==='policy' && !reviewScoresComplete_(individual,student.scores)};
  const effectiveScores={};
  config.criteria.forEach(c=>{
    const isTeam=c.type==='Team', mark=isTeam?teamMark:individualMark, source=isTeam?teamSource:individualSource;
    const evidence=(isTeam?(a.alternativeTeamScores || teamScores):student.scores)[c.pi];
    effectiveScores[c.pi]={marks:mark===null?null:source==='policy'?0:evidence?evidence.marks:null,maximum:c.maxMarks,co:c.co,state:state(mark,source),source};
  });
  return {...student,total,weighted:total===null?null:Math.round(total/config.criteria.reduce((n,c)=>n+c.maxMarks,0)*config.weight*10000)/100,
    assessment:{...a,facts,classification,status,teamMark,individualMark,teamState,individualState,nextActions,effectiveScores,completed:total!==null}};
}
function reviewTargeted_(latest,action,input,actor) {
  const original=latest.students.find(s=>s.register===input.student);
  if(!original) throw new Error('Unknown student.');
  let student=JSON.parse(JSON.stringify(original));
  student=reviewEffectiveStudent_(latest.config,latest.teamScores,student);
  const previousStatus=student.assessment.status;
  let a=student.assessment;
  const reason=String(input.reason || input.absence && (input.absence.type==='PROLONGED'?'Prolonged absence source facts updated.':input.absence.type==='REVIEW_DAY_ABSENCE' && input.absence.approved===false?'Review-day absence recorded as unapproved.':input.absence.reason || input.absence.absenceReason && 'Absence details recorded: '+input.absence.absenceReason) || '').trim();
  if(!reason || reason.length>2000) throw new Error('A reviewer reason is required (maximum 2000 characters).');
  const team=latest.config.criteria.filter(c=>c.type==='Team'), individual=latest.config.criteria.filter(c=>c.type==='Individual');
  if(action==='exception') {
    // A correction changes source facts, not prior decisions, authorizations or rubric evidence.
    const facts=reviewAbsenceFacts_(input.absence,true);
    if(facts.type==='UNSELECTED')throw new Error('Select attendance before saving absence details.');
    if((facts.absenceReason || facts.type==='PROLONGED') && a.facts.reason)facts.reason=a.facts.reason;
    const changed=['type','approved','verifiedContribution','attended'].some(key=>facts[key]!==a.facts[key]);
    if(changed && (a.teamDecision || a.alternativeTeamScores)) {
      const policy=reviewEffectiveStudent_(latest.config,latest.teamScores,{...student,assessment:{facts}}).assessment;
      const retained=reviewEffectiveStudent_(latest.config,latest.teamScores,{...student,assessment:{...a,facts}}).assessment;
      if(policy.teamMark!==null && policy.teamMark!==retained.teamMark) throw new Error('The corrected absence facts conflict with an existing team assessment decision. No changes were saved; the Review Committee must resolve the conflict.');
    }
    a={...a,facts};
  } else if(action==='decision') {
    if(!['MAKEUP_ALTERNATIVE_ASSESSMENT','DEFERRED_ASSESSMENT','TEAM_MARK_APPLICABLE','TEAM_MARK_NOT_APPLICABLE','OTHER'].includes(input.decision)) throw new Error('Invalid academic decision.');
    if(['TEAM_MARK_APPLICABLE','TEAM_MARK_NOT_APPLICABLE'].includes(input.decision)) {
      if(a.teamState!=='PENDING') throw new Error('Only a pending team component can be resolved by this decision.');
      a.teamDecision=input.decision;
    } else if(input.decision==='MAKEUP_ALTERNATIVE_ASSESSMENT') {
      const components=input.components || ['individual'];
      if(!Array.isArray(components) || !components.length || new Set(components).size!==components.length || components.some(c=>!['team','individual'].includes(c))) throw new Error('Select the assessment components.');
      components.forEach(c=>{
        if(c==='team' && a.teamState!=='PENDING') throw new Error('The team component is already resolved.');
        if(c==='individual' && reviewScoresComplete_(individual,student.scores)) throw new Error('Valid individual evidence must be preserved.');
        if(c==='individual' && a.individualState==='UNASSESSED')throw new Error('Complete the normal individual rubric for the attended review.');
      });
      a.authorized=components;
      if(components.includes('individual')) {a.individualPending=true;a.makeupCompleted=false;}
    } else if(input.decision==='DEFERRED_ASSESSMENT') {
      a.authorized=[];
      // Defer only unresolved components; never erase assessed evidence or turn a final zero into pending.
      if(a.individualState==='PENDING') a.individualPending=true;
    }
  } else {
    // An empty explicit list does not remove the makeup already permitted by absence policy.
    const authorized=a.nextActions.assessmentComponents;
    if(!authorized.length) throw new Error('No pending components are authorized for assessment.');
    if(input.teamScores && !authorized.includes('team') || input.scores && !authorized.includes('individual')) throw new Error('Only authorized components may be assessed.');
    const draft={};
    authorized.forEach(component=>{
      const criteria=component==='team'?team:individual, scores=component==='team'?input.teamScores:input.scores;
      const checked=guideScore_(criteria,scores || {},action==='targetSubmit',0).scores;
      if(Object.values(checked).some(s=>s.marks!==null && !Number.isInteger(s.marks*2))) throw new Error('Marks must use whole or half marks.');
      draft[component]=checked;
    });
    if(action==='targetDraft') a.targetDraft=draft;
    else {
      if(draft.individual) {student.scores=draft.individual;a.makeupCompleted=true;a.individualPending=false;}
      if(draft.team) a.alternativeTeamScores=draft.team;
      delete a.targetDraft;a.authorized=[];
    }
  }
  student=reviewEffectiveStudent_(latest.config,latest.teamScores,{...student,assessment:a,needsPublication:action==='targetDraft'?original.needsPublication:true});
  if(action==='exception' && student.assessment.facts.type==='NORMAL' && !student.assessment.completed) throw new Error('An unfinished assessment cannot replace a documented exception in a submitted review.');
  student.assessment.decisions=[...(a.decisions || []),{decision:action==='decision'?input.decision:action,reviewer:actor,at:new Date().toISOString(),reason,previousStatus,resultingStatus:student.assessment.status}];
  const payload={...latest,students:latest.students.map(s=>s.register===student.register?student:s),status:action==='targetDraft'?latest.status:'Submitted'};
  delete payload.publishedStudents;
  return payload;
}

function review1Progress_(row, columns, records, config) {
  const roster=getStudentsFromTeamStatusRow_(row,columns), totalStudents=roster.length;
  const latest=review1Latest_(records,row[columns.TEAM_ID]);
  const currentRoster={team:normalizeReviewKey_(row[columns.TEAM_ID]),committee:String(row[columns.COMMITTEE_NUMBER] || '').trim(),
    students:roster.map(s=>({register:normalizeReviewKey_(s.regNo),name:String(s.name || ''),email:normalizeEmail(s.email)}))};
  const submitted=!!latest && ['Submitted','Published'].includes(latest.status) && latest.rosterHash===guideFingerprint_(currentRoster);
  const isComplete=s=>s.assessment?s.assessment.completed:reviewScoresComplete_(latest.config.criteria,{...latest.teamScores,...s.scores});
  const markedStudents=submitted?latest.students.filter(isComplete).length:0;
  const recorded=submitted && latest.students.every(s=>isComplete(s) || s.assessment && s.assessment.facts.type!=='NORMAL' && !!(s.assessment.facts.reason || s.assessment.facts.absenceReason));
  const completed=submitted && markedStudents===totalStudents;
  const availability=review1Availability_({eligibility:review1Eligibility_(row,columns)},config,latest);
  return {...summarizeReviewCompletion_(new Set(roster.map(s=>normalizeReviewKey_(s.regNo))),null,config.criteria),
    completed,recorded,markedStudents,totalStudents,available:true,status:latest?latest.status:'Not started',...availability};
}
function loadCoordinatorReview1Evaluations() {return loadCoordinatorReviewEvaluations_('review1');}
function loadCoordinatorReview2Evaluations() {return loadCoordinatorReviewEvaluations_('review2');}
function loadCoordinatorReviewEvaluations_(key) {
  guideActor_(true);
  const config=review1Configuration_(key), {sheet,records}=review1Records_(key);
  const columns=getColumnMap(SHEET_NAMES.TEAM_STATUS,FIELD_DEFINITIONS.TEAM_STATUS);
  return {ready:!!sheet,teams:getSheetRows(SHEET_NAMES.TEAM_STATUS).filter(r=>r[columns.TEAM_ID]).map(row=>{
    const latest=review1Latest_(records,row[columns.TEAM_ID]);
    return {team:String(row[columns.TEAM_ID]),...review1Progress_(row,columns,records,config),revision:latest?latest.revision:0,
      late:!!(latest && latest.late),students:latest?latest.students.map(s=>reviewStudentView_(latest.config,latest.teamScores,s)):[]};
  })};
}
function review1RequireCompleted_(row, columns, label) {
  const progress=review1Progress_(row,columns,review1Records_().records,review1Configuration_());
  if (!progress.recorded) throw new Error('Complete Review 1 submission for the team before entering '+label+' marks.');
}
function loadPublishedReview1Evaluation() {return loadPublishedReviewEvaluation_('review1');}
function loadPublishedReview2Evaluation() {return loadPublishedReviewEvaluation_('review2');}
function loadPublishedReviewEvaluation_(key) {
  const actor=guideActor_(false), columns=getColumnMap(SHEET_NAMES.TEAM_STATUS,FIELD_DEFINITIONS.TEAM_STATUS);
  const matches=getSheetRows(SHEET_NAMES.TEAM_STATUS).filter(r=>r[columns.TEAM_ID]).flatMap(row=>
    getStudentsFromTeamStatusRow_(row,columns).filter(s=>emailsMatch(s.email,actor)).map(s=>({team:row[columns.TEAM_ID],register:normalizeReviewKey_(s.regNo)})));
  if (matches.length!==1) throw new Error('Student assignment is missing or ambiguous.');
  const match=matches[0], history=review1Records_(key).records.filter(r=>r.team===normalizeReviewKey_(match.team)).sort((a,b)=>b.revision-a.revision);
  const reopened=history.find(r=>r.action==='reopen');
  const latest=history.find(r=>(!reopened || r.revision>reopened.revision) && r.action==='publish' && (!r.publishedStudents || r.publishedStudents.includes(match.register)));
  if (!latest) return null;
  const student=latest.students.find(s=>s.register===match.register);
  if (!student) return null;
  const effective=reviewEffectiveStudent_(latest.config,latest.teamScores,student);
  const {targetDraft,authorized,...assessment}=effective.assessment;
  const evidence={...latest.teamScores,...(assessment.alternativeTeamScores || {}),...student.scores},scores={};
  latest.config.criteria.forEach(c=>{
    const result=assessment.effectiveScores[c.pi],original=evidence[c.pi] || {};
    scores[c.pi]={...original,marks:result.marks,level:result.state==='PENDING' || result.source==='policy'?null:original.level};
  });
  return {config:latest.config,scores,total:effective.total===null?null:student.total,weighted:effective.total===null?null:student.weighted,assessment};
}
