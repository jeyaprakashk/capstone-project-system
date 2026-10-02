/* Guide evaluation: live reads, immutable per-student revisions, no cross-request cache. */
const GUIDE_EVAL_POLICY_ = 'guide-bands-v3-target-level-2';
const GUIDE_EVAL_HEADERS_ = ['Assessment','Team','Student','Revision','Action','Actor','At','Request ID','Payload'];
const GUIDE_EVAL_BANDS_ = [0,40,60,75,85,95,100];
function guideActor_(coordinator) {
  const email = Session.getActiveUser().getEmail();
  if (!email) throw new Error('Sign in with your institutional account.');
  if (coordinator && !activityIsCoordinator_(email)) throw new Error('Coordinator access is required.');
  return email;
}
function guideRoster_(teamId, actor, staff) {
  const cols = getColumnMap(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const rows = getSheetRows(SHEET_NAMES.TEAM_STATUS).filter(r => textEquals_(r[cols.TEAM_ID], teamId));
  if (rows.length !== 1) throw new Error('Team is missing or ambiguous.');
  const row = rows[0];
  if (!staff && !emailsMatch(row[cols.GUIDE_EMAIL], actor)) throw new Error('Only the assigned guide can evaluate this team.');
  const students = getStudentsFromTeamStatusRow_(row, cols).map(s => ({register:normalizeText_(s.regNo), name:String(s.name || ''), email:normalizeEmail(s.email)}));
  if (!students.length || new Set(students.map(s => s.register)).size !== students.length) throw new Error('Student roster is missing or ambiguous.');
  return {team:normalizeText_(row[cols.TEAM_ID]), guide:normalizeEmail(row[cols.GUIDE_EMAIL]), students};
}
function guideFingerprint_(value) {
  return Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, JSON.stringify(value)));
}
function guideConfiguration_() {
  const definition=assessmentDefinition_('guide_eval');
  if(definition.type!=='GUIDE_EVALUATION')throw new Error('Configure guide_eval as GUIDE_EVALUATION in AssessmentDefinitions.');
  const criteria=assessmentRubric_(definition);
  if(criteria.some(c=>c.type!=='Individual'||c.descriptors.some(t=>!t)))throw new Error('Guide rubric requires individual criteria with all Level 0–5 descriptors.');
  return {key:definition.key,label:definition.label,criteria,maximum:criteria.reduce((n,c)=>n+c.maxMarks,0),due:definition.day,opens:definition.opens,timezone:getSpreadsheet().getSpreadsheetTimeZone(),policy:definition.academicPolicyVersion,weight:definition.weight/100};
}

function guideEnsureRows_(sheet, lastRow) {
  const capacity = sheet.getMaxRows();
  if (lastRow > capacity) sheet.insertRowsAfter(capacity, Math.max(100, lastRow - capacity));
}
function guideJournalName_() {return assessmentJournal_(assessmentDefinition_('guide_eval')).name;}
function guideRecords_() {
  const sheet = getSheet(guideJournalName_());
  if (!sheet) throw new Error(assessmentStorageMissing_(guideJournalName_()));
  const values = sheet.getDataRange().getValues();
  if (GUIDE_EVAL_HEADERS_.some((h,i) => values[0][i] !== h)) throw new Error('GuideEvaluations headers do not match.');
  const seen=new Set();
  const records=values.slice(1).filter(r => r[0] && r[4]!=='publish').map(r => {
    if (r[0] !== 'guide_eval') throw new Error('Unexpected assessment in GuideEvaluations.');
    const identity=JSON.stringify([normalizeText_(r[1]),normalizeText_(r[2]),Number(r[3])]);
    if(seen.has(identity)||!Number.isSafeInteger(Number(r[3]))||Number(r[3])<1)throw new Error('Conflicting or invalid Guide revision.');
    seen.add(identity);
    const value = JSON.parse(r[8]);
    return {...value, team:normalizeText_(r[1]), student:normalizeText_(r[2]), revision:Number(r[3]), action:String(r[4]), actor:String(r[5]), at:String(r[6]), requestId:String(r[7])};
  });
  return {sheet,records:publicationProject_(records,values,'guide_eval')};
}
function guideLatest_(records, team, student) {
  return records.filter(r => r.team === team && r.student === student).reduce((best,r) => !best || r.revision > best.revision ? r : best, null);
}
function guideScore_(criteria, scores, complete, weight) {
  if (!scores || typeof scores !== 'object' || Array.isArray(scores) || Object.keys(scores).some(pi => !criteria.some(c => c.pi === pi))) throw new Error('Invalid criterion scores.');
  let cents = 0;
  const clean = {};
  criteria.forEach(c => {
    const value = scores[c.pi] || {};
    const remark = String(value.remark || '').trim();
    if (remark.length > 2000) throw new Error(c.pi + ': remark is too long.');
    const blankLevel = value.level === '' || value.level === null || value.level === undefined;
    const blankMarks = value.marks === '' || value.marks === null || value.marks === undefined;
    if (blankLevel || blankMarks) {
      if (complete) throw new Error(c.pi + ': level and marks are required.');
      if (!blankLevel && (!Number.isInteger(value.level) || value.level < 0 || value.level > 5)) throw new Error(c.pi + ': invalid level.');
      if (!blankMarks) throw new Error(c.pi + ': select a level before marks.');
      clean[c.pi] = {level:blankLevel ? null : value.level, marks:null, remark}; return;
    }
    if (!Number.isInteger(value.level) || value.level < 0 || value.level > 5 || typeof value.marks === 'boolean' || !/^\d+(\.\d{1,2})?$/.test(String(value.marks))) throw new Error(c.pi + ': use level 0â€“5 and marks with at most two decimals.');
    const marks = Number(value.marks), scaled = Math.round(marks * 100);
    const lower = GUIDE_EVAL_BANDS_[value.level] * c.maxMarks;
    const upper = GUIDE_EVAL_BANDS_[value.level+1] * c.maxMarks;
    if (scaled < lower || (value.level === 5 ? scaled > upper : scaled >= upper)) throw new Error(c.pi + ': marks are outside the selected level band.');
    if (complete && value.level < 2 && !remark) throw new Error(c.pi + ': a remark is required below Level 2.');
    clean[c.pi] = {level:value.level, marks, remark}; cents += scaled;
  });
  return {scores:clean, total:cents/100, weighted:Math.round(cents / criteria.reduce((sum,c)=>sum+c.maxMarks,0) * weight * 100)/100};
}
function loadGuideEvaluation(teamId, register) {
  const actor = guideActor_(false), roster = guideRoster_(teamId, actor, false);
  const config = guideConfiguration_(), {records} = guideRecords_();
  const student = register ? roster.students.find(s => s.register === normalizeText_(register)) : roster.students[0];
  if (!student) throw new Error('Student is not in the current team.');
  const latest = guideLatest_(records, roster.team, student.register);
  const overdue = projectDay_(new Date(),config.timezone) > config.due;
  const repository = typeof getRepoUrlForTeam === 'function' ? getRepoUrlForTeam(roster.team) : '';
  return {roster, student, config, overdue, repository, token:guideFingerprint_({roster,config}), revision:latest ? latest.revision : 0,
    evaluation:latest, statuses:roster.students.map(s => ({register:s.register,status:(guideLatest_(records,roster.team,s.register)||{}).status || 'Not started'}))};
}
function guideWrite_(action, input) {
  if(action==='publish')return publishInternalAssessment({...input,assessmentId:'guide_eval'});
  const staff = action === 'reopen';
  const actor = guideActor_(staff);
  return evaluationCommand_(action,input,fingerprint=>{
    const roster = guideRoster_(input.team, actor, staff);
    const student = roster.students.find(s => s.register === normalizeText_(input.student));
    if (!student) throw new Error('Student is no longer assigned to this team.');
    const {sheet,records} = guideRecords_();
    const duplicate = evaluationDuplicate_(records,actor,input,fingerprint);
    if (duplicate) {
      if (duplicate.fingerprint !== fingerprint) throw new Error('Request ID was already used for different data.');
      return {revision:duplicate.revision,status:duplicate.status,total:duplicate.total,weighted:duplicate.weighted};
    }
    const latest = guideLatest_(records,roster.team,student.register);
    evaluationRevision_(latest,input);
    let payload;
    if (staff) {
      if (!latest || !['Submitted','Published'].includes(latest.status)) throw new Error('This action is not available for the current status.');
      if (action === 'reopen' && (!String(input.reason || '').trim() || String(input.reason).length > 2000)) throw new Error('A reopening reason is required (maximum 2000 characters).');
      payload = {...latest, status:'Draft', reason:action === 'reopen' ? String(input.reason).trim() : '', fingerprint};
      if (action === 'reopen') {
        payload.config = guideConfiguration_(); payload.scores = {}; payload.total = 0; payload.weighted = 0;
        payload.submittedAt = null; payload.late = false; payload.rosterHash = guideFingerprint_(roster); payload.membership=evaluationMembership_(roster);
      }
    } else {
      if (latest && latest.status !== 'Draft') throw new Error('Submitted evaluations are locked. Ask the coordinator to reopen.');
      const config = guideConfiguration_();
      if(Number.isInteger(config.opens)&&projectDay_(new Date(),config.timezone)<config.opens)throw new Error('Guide assessment is not open.');
      if (input.token !== guideFingerprint_({roster,config})) throw new Error('Roster or rubric changed. Reload and review the evaluation.');
      const score = guideScore_(config.criteria, input.scores, action === 'submit', config.weight);
      const now = new Date();
      payload = {...score, config, membership:evaluationMembership_(roster), rosterHash:guideFingerprint_(roster), status:action === 'submit' ? 'Submitted' : 'Draft', fingerprint,
        submittedAt:action === 'submit' ? now.toISOString() : null,
        late:action === 'submit' && projectDay_(now,config.timezone) > config.due};
    }
    const at = new Date().toISOString(), revision = input.revision + 1;
    // One append holds both the audit event and complete revision: no split-write state.
    ['publication','academicRevision','team','student','revision','action','actor','at','requestId'].forEach(key => delete payload[key]);
    const json = JSON.stringify(payload);
    if (json.length > 45000) throw new Error('Evaluation payload is too large. Shorten remarks.');
    evaluationAppend_(sheet,[['guide_eval',roster.team,student.register,revision,action,actor,at,input.requestId,json]]);
    return {revision,status:payload.status,total:payload.total,weighted:payload.weighted};
  });
}
function saveGuideEvaluationDraft(input) { return guideWrite_('draft',input); }
function submitGuideEvaluation(input) { return guideWrite_('submit',input); }
function publishGuideEvaluation(input) { return guideWrite_('publish',input); }
function reopenGuideEvaluation(input) { return guideWrite_('reopen',input); }
function loadCoordinatorGuideEvaluations() {
  guideActor_(true);
  let config;
  try { config = guideConfiguration_(); } catch(err) { return {ready:false,error:err.message,students:[]}; }
  let records;
  try { records = guideRecords_().records; } catch(err) { return {ready:false,error:err.message,students:[]}; }
  const cols = getColumnMap(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const students = getSheetRows(SHEET_NAMES.TEAM_STATUS).filter(r=>r[cols.TEAM_ID]).flatMap(row => {
    const team = normalizeText_(row[cols.TEAM_ID]);
    return getStudentsFromTeamStatusRow_(row,cols).map(s => {
      const register = normalizeText_(s.regNo), last = guideLatest_(records,team,register);
      return {team,student:register,name:String(s.name || ''),status:last ? last.status : 'Not started',overdue:(!last || last.status === 'Draft') && projectDay_(new Date(),config.timezone) > config.due,revision:last ? last.revision : 0,total:last ? last.total : null,late:!!(last && last.late)};
    });
  });
  return {ready:true,students,due:config.due};
}
function loadPublishedGuideEvaluation() {return loadPublishedAssessment_('guide_eval');}

function guideCompletion_() {
  try {
    const report = loadCoordinatorGuideEvaluations();
    if (!report.ready) return {available:false,completed:0,teams:{}};
    const teams = {};
    report.students.forEach(s => { if (!(s.team in teams)) teams[s.team]=true; teams[s.team] = teams[s.team] && ['Submitted','Published'].includes(s.status); });
    return {available:true,completed:Object.values(teams).filter(Boolean).length,teams};
  } catch(err) { return {available:false,completed:0,teams:{}}; }
}
