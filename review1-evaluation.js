/* Review 1: shared team form, immutable student rows written together per revision. */
const REVIEW1_HISTORY_ = 'Review1Evaluations';
const REVIEW1_HEADERS_ = ['Assessment','Team','Student','Revision','Action','Actor','At','Request ID','Payload'];

function review1Configuration_() {
  const review = getReviewDefinitions_().find(item => item.key === 'review1');
  if (!review || !Number.isInteger(review.day)) throw new Error('Configure review1 and its date in Milestones.');
  return {key:review.key,label:review.label,criteria:review.rubric,maximum:review.rubric.reduce((n,c)=>n+c.maxMarks,0),
    due:review.day,opens:review.day-7,timezone:getSpreadsheet().getSpreadsheetTimeZone(),weight:review.weight/100,policy:GUIDE_EVAL_POLICY_};
}

/** Provisional academic eligibility policy; replace here when requirements are finalized. */
function review1Eligibility_(row, columns) {
  return String(row[columns.TITLE] || '').trim() && textEquals_(row[columns.REVIEWER_DECISION], 'Approved')
    ? {eligible:true,reason:''} : {eligible:false,reason:'Approve the project title before entering Review 1 marks.'};
}

function review1Context_(teamId, staff) {
  const actor = guideActor_(staff);
  const columns = getColumnMap(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const rows = getSheetRows(SHEET_NAMES.TEAM_STATUS).filter(row=>textEquals_(row[columns.TEAM_ID],teamId));
  if (rows.length !== 1) throw new Error('Team is missing or ambiguous.');
  const row = rows[0], committee = String(row[columns.COMMITTEE_NUMBER] || '').trim();
  if (!staff && !getCommitteeNumbersForReviewer(actor).some(n=>textEquals_(n,committee))) throw new Error('You are not an assigned reviewer for this team.');
  const students = getStudentsFromTeamStatusRow_(row,columns).map(s=>({register:normalizeReviewKey_(s.regNo),name:String(s.name || ''),email:normalizeEmail(s.email)}));
  if (!students.length || new Set(students.map(s=>s.register)).size !== students.length) throw new Error('Student roster is missing or ambiguous.');
  const roster = {team:normalizeReviewKey_(row[columns.TEAM_ID]),committee,students};
  const committeeInfo=getCommitteeInfo(committee) || {};
  return {actor,roster,eligibility:review1Eligibility_(row,columns),details:{team:String(row[columns.TEAM_ID]),
    title:String(row[columns.TITLE] || ''),problem:String(row[columns.PROBLEM] || ''),committee,
    reviewers:[1,2,3,4].map(n=>({name:String(committeeInfo['reviewer'+n+'Name'] || ''),email:String(committeeInfo['reviewer'+n+'Email'] || '')})).filter(r=>r.name || r.email),
    guideName:String(row[columns.GUIDE_NAME] || ''),guideEmail:String(row[columns.GUIDE_EMAIL] || '')}};
}

function review1Records_() {
  const sheet = getSheet(REVIEW1_HISTORY_);
  if (!sheet) return {sheet:null,records:[]};
  const rows = sheet.getDataRange().getValues();
  if (REVIEW1_HEADERS_.some((h,i)=>rows[0][i]!==h)) throw new Error('Review1Evaluations headers must be: '+REVIEW1_HEADERS_.join(', ')+'.');
  const groups=new Map();
  rows.slice(1).filter(r=>r[0]).forEach(r=>{
    if (r[0] !== 'review1') throw new Error('Unexpected assessment in Review 1 history.');
    const {scores,total,weighted,...common}=JSON.parse(r[8]);
    if (!scores || !common.config || !common.roster) throw new Error('Invalid student payload in Review1Evaluations.');
    const teamScores={},individualScores={};
    common.config.criteria.forEach(c=>{
      if (Object.prototype.hasOwnProperty.call(scores,c.pi)) (c.type==='Team'?teamScores:individualScores)[c.pi]=scores[c.pi];
    });
    const record={...common,team:String(r[1]),revision:Number(r[3]),action:String(r[4]),actor:String(r[5]),at:String(r[6]),requestId:String(r[7]),teamScores};
    const key=JSON.stringify([record.team,record.revision]), signature=JSON.stringify(record);
    if (!groups.has(key)) groups.set(key,{record,signature,students:[]});
    const group=groups.get(key),register=normalizeReviewKey_(r[2]);
    if (group.signature!==signature || group.students.some(s=>s.register===register)) throw new Error('Inconsistent or duplicate student rows in Review1Evaluations.');
    group.students.push({register,scores:individualScores,total,weighted});
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
    late:payload.late,timing:review1Timing_(payload.config,payload)};
}
function review1Availability_(context, config, latest) {
  const today = projectDay_(new Date(),config.timezone);
  const locked = !!latest && latest.status !== 'Draft';
  const reason = today < config.opens ? 'Opens '+new Date(config.opens*86400000).toISOString().slice(0,10) : context.eligibility.reason;
  return {editable:!locked && !reason,readable:locked || !reason,reason,opens:config.opens,late:today>config.due,timing:review1Timing_(config,latest)};
}
function getReview1Evaluation(teamId) {
  const context = review1Context_(teamId,false), config = review1Configuration_();
  const latest = review1Latest_(review1Records_().records,context.roster.team);
  const availability = review1Availability_(context,config,latest);
  if (!availability.readable) throw new Error(availability.reason);
  return {details:context.details,roster:latest && latest.status!=='Draft'?latest.roster:context.roster,
    config:latest && latest.status!=='Draft'?latest.config:config,availability,
    token:guideFingerprint_({roster:context.roster,config}),revision:latest?latest.revision:0,
    status:latest?latest.status:'Not started',evaluation:latest};
}

function review1Score_(config, roster, input, complete) {
  const teamCriteria=config.criteria.filter(c=>c.type==='Team'), individual=config.criteria.filter(c=>c.type==='Individual');
  const teamScores=guideScore_(teamCriteria,input.teamScores,complete,0).scores;
  if (!Array.isArray(input.students) || input.students.length!==roster.students.length ||
      new Set(input.students.map(s=>s && s.register)).size!==roster.students.length ||
      input.students.some(s=>!s || !roster.students.some(r=>r.register===s.register))) throw new Error('Provide one evaluation for every registered student.');
  const students=roster.students.map(student=>{
    const entry=input.students.find(s=>s.register===student.register);
    const individualScores=guideScore_(individual,entry.scores,complete,0).scores;
    const scored=guideScore_(config.criteria,{...teamScores,...individualScores},complete,config.weight);
    if (Object.values(scored.scores).some(score=>score.marks!==null && !Number.isInteger(score.marks*2))) throw new Error('Review 1 marks must use whole or half marks (increments of 0.5).');
    return {register:student.register,scores:individualScores,total:scored.total,weighted:scored.weighted};
  });
  return {teamScores,students};
}

function review1Write_(action,input) {
  const staff=action==='publish' || action==='reopen';
  const actor=guideActor_(staff);
  if (!input || typeof input.requestId!=='string' || !/^[A-Za-z0-9_-]{12,100}$/.test(input.requestId) || !Number.isSafeInteger(input.revision) || input.revision<0) throw new Error('Invalid request. Reload and retry.');
  const lock=LockService.getScriptLock();
  if (!lock.tryLock(5000)) throw new Error('Another evaluation is saving. Retry shortly.');
  try {
    const context=review1Context_(input.team,staff), {sheet,records}=review1Records_();
    if (!sheet) throw new Error('Review1Evaluations is missing from the main spreadsheet. Create the tab manually with the required headers.');
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
        payload={...latest,status:'Published',fingerprint};
      } else {
        const reason=String(input.reason || '').trim();
        if (!reason || reason.length>2000) throw new Error('A reopening reason is required (maximum 2000 characters).');
        payload={config:review1Configuration_(),roster:context.roster,rosterHash,teamScores:{},students:context.roster.students.map(s=>({register:s.register,scores:{},total:0,weighted:0})),
          status:'Draft',reason,submittedAt:null,submittedDay:null,late:false,fingerprint};
      }
    } else {
      const config=review1Configuration_(), availability=review1Availability_(context,config,latest);
      if (latest && latest.status!=='Draft') throw new Error('Submitted evaluations are locked. Ask the coordinator to reopen.');
      if (!availability.editable) throw new Error(availability.reason);
      if (input.token!==guideFingerprint_({roster:context.roster,config})) throw new Error('Roster or rubric changed. Reload and review the evaluation.');
      const submittedAt=action==='submit'?new Date():null;
      const submittedDay=submittedAt?projectDay_(submittedAt,config.timezone):null;
      payload={...review1Score_(config,context.roster,input,action==='submit'),config,roster:context.roster,rosterHash,fingerprint,
        status:action==='submit'?'Submitted':'Draft',submittedAt:submittedAt?submittedAt.toISOString():null,
        submittedDay,late:submittedDay!==null && submittedDay>config.due};
    }
    ['team','revision','action','actor','at','requestId'].forEach(k=>delete payload[k]);
    const revision=input.revision+1,at=new Date().toISOString();
    const {teamScores,students,...common}=payload;
    const values=students.map(student=>{
      const json=JSON.stringify({...common,scores:{...teamScores,...student.scores},total:student.total,weighted:student.weighted});
      if (json.length>45000) throw new Error('Evaluation payload is too large. Shorten feedback.');
      return ['review1',context.roster.team,student.register,revision,action,actor,at,input.requestId,json].map(v=>typeof v==='string' && v.startsWith('=')?"'"+v:v);
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

function review1Progress_(row, columns, records, config) {
  const roster=getStudentsFromTeamStatusRow_(row,columns), totalStudents=roster.length;
  const latest=review1Latest_(records,row[columns.TEAM_ID]);
  const currentRoster={team:normalizeReviewKey_(row[columns.TEAM_ID]),committee:String(row[columns.COMMITTEE_NUMBER] || '').trim(),
    students:roster.map(s=>({register:normalizeReviewKey_(s.regNo),name:String(s.name || ''),email:normalizeEmail(s.email)}))};
  const completed=!!latest && ['Submitted','Published'].includes(latest.status) && latest.rosterHash===guideFingerprint_(currentRoster);
  const availability=review1Availability_({eligibility:review1Eligibility_(row,columns)},config,latest);
  return {...summarizeReviewCompletion_(new Set(roster.map(s=>normalizeReviewKey_(s.regNo))),null,config.criteria),
    completed,markedStudents:completed?totalStudents:0,totalStudents,available:true,status:latest?latest.status:'Not started',...availability};
}
function loadCoordinatorReview1Evaluations() {
  guideActor_(true);
  const config=review1Configuration_(), {sheet,records}=review1Records_();
  const columns=getColumnMap(SHEET_NAMES.TEAM_STATUS,FIELD_DEFINITIONS.TEAM_STATUS);
  return {ready:!!sheet,teams:getSheetRows(SHEET_NAMES.TEAM_STATUS).filter(r=>r[columns.TEAM_ID]).map(row=>{
    const latest=review1Latest_(records,row[columns.TEAM_ID]);
    return {team:String(row[columns.TEAM_ID]),...review1Progress_(row,columns,records,config),revision:latest?latest.revision:0,
      late:!!(latest && latest.late),students:latest?latest.students:[]};
  })};
}
function review1RequireCompleted_(row, columns, label) {
  const progress=review1Progress_(row,columns,review1Records_().records,review1Configuration_());
  if (!progress.completed) throw new Error('Complete Review 1 for every student before entering '+label+' marks.');
}
function loadPublishedReview1Evaluation() {
  const actor=guideActor_(false), columns=getColumnMap(SHEET_NAMES.TEAM_STATUS,FIELD_DEFINITIONS.TEAM_STATUS);
  const matches=getSheetRows(SHEET_NAMES.TEAM_STATUS).filter(r=>r[columns.TEAM_ID]).flatMap(row=>
    getStudentsFromTeamStatusRow_(row,columns).filter(s=>emailsMatch(s.email,actor)).map(s=>({team:row[columns.TEAM_ID],register:normalizeReviewKey_(s.regNo)})));
  if (matches.length!==1) throw new Error('Student assignment is missing or ambiguous.');
  const match=matches[0], latest=review1Latest_(review1Records_().records,match.team);
  if (!latest || latest.status!=='Published') return null;
  const student=latest.students.find(s=>s.register===match.register);
  if (!student) return null;
  return {config:latest.config,scores:{...latest.teamScores,...student.scores},total:student.total,weighted:student.weighted};
}
