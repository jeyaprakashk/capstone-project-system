/** Instances are spreadsheet data; this file registers types and supported policies only. */
const ASSESSMENT_DEFINITION_HEADERS_ = ['Assessment ID','Type','Label','Sequence','Weight (%)','Opening','Due Date','Prerequisites','Academic Policy Version','Journal'];
function parseAssessmentDefinitions_(rows,timezone) {
  const headers=(rows[0]||[]).map(normalizeText_);
  const cols=ASSESSMENT_DEFINITION_HEADERS_.map(h=>{const i=headers.indexOf(normalizeText_(h));if(i<0||headers.lastIndexOf(normalizeText_(h))!==i)throw new Error('AssessmentDefinitions requires exactly one '+h+' column.');return i;});
  const definitions=rows.slice(1).filter(r=>r.some(v=>String(v??'').trim())).map((row,index)=>{
    const [id,type,label,sequence,weight,opening,due,prerequisites,policy,journal]=cols.map(c=>row[c]);
    const key=normalizeText_(id),kind=String(type||'').trim().toUpperCase();
    const fail=message=>{throw new Error('AssessmentDefinitions row '+(index+2)+': '+message);};
    if(!/^[a-z][a-z0-9_-]{0,39}$/.test(key))fail('Invalid assessment ID.');
    if(!['REVIEW','GUIDE_EVALUATION','SEE'].includes(kind))fail('Unsupported assessment type.');
    if(kind==='GUIDE_EVALUATION' && key!=='guide_eval')fail('Only the assigned-guide individual strategy is currently supported.');
    if((kind==='SEE')!==(key==='see'))fail('Type SEE must use Assessment ID see, which is reserved for SEE.');
    if(!String(label||'').trim())fail('Label is required.');
    if(!Number.isSafeInteger(Number(sequence)) || Number(sequence)<1)fail('Sequence must be a positive integer.');
    if(!String(weight??'').trim() || !Number.isFinite(Number(weight)) || Number(weight)<=0 || Number(weight)>100)fail('Weight must be greater than zero and at most 100.');
    const expected=kind==='REVIEW'?'review-attendance-v1':'guide-bands-v3-target-level-2';
    if(kind==='SEE'){if(String(policy??'').trim())fail('SEE Academic Policy Version must be blank; evaluation is outside this app.');}
    else if(policy!==expected)fail('Unsupported academic policy version.');
    if(String(opening??'').trim()==='' || String(due??'').trim()==='')fail('Opening and due date are required.');
    const opens=projectDay_(opening,timezone),day=projectDay_(due,timezone);
    if(opens>day)fail('Opening must not follow due date.');
    let required=[];
    try{required=String(prerequisites||'').trim()?JSON.parse(prerequisites):[];}catch(e){fail('Prerequisites must be a JSON array.');}
    if(!Array.isArray(required) || required.some(p=>!p || typeof p.assessmentId!=='string'||p.condition!=='RECORDED'))fail('Prerequisites require assessmentId and condition RECORDED.');
    required=required.map(p=>({assessmentId:normalizeText_(p.assessmentId),condition:p.condition}));
    if(new Set(required.map(p=>p.assessmentId)).size!==required.length)fail('Duplicate prerequisite.');
    if(kind==='SEE' && required.length)fail('SEE Prerequisites must be blank or [].');
    if(kind==='SEE' && String(journal??'').trim())fail('SEE Journal must be blank; no storage is required.');
    const storage=kind==='SEE'?'':String(journal||'').trim() || 'Assessment_'+key;
    if(storage.length>100 || /[\[\]:*?\/\\]/.test(storage) || ['teamstatus','rubrics','milestones','assessmentdefinitions'].includes(normalizeText_(storage)))fail('Invalid journal name.');
    return {key,type:kind,label:String(label).trim(),sequence:Number(sequence),weight:Number(weight),opens,day,prerequisites:required,academicPolicyVersion:kind==='SEE'?'':policy,journal:storage,journalConfigured:!!String(journal||'').trim(),gradedBy:kind==='SEE'?'SEE Committee (includes external members)':kind==='REVIEW'?'Review Committee':'Project Guide'};
  });
  if(new Set(definitions.map(d=>d.key)).size!==definitions.length)throw new Error('Duplicate assessment ID.');
  if(new Set(definitions.filter(d=>d.type!=='SEE').map(d=>normalizeText_(d.journal))).size!==definitions.filter(d=>d.type!=='SEE').length)throw new Error('Assessment journals must be distinct.');
  if(definitions.reduce((n,d)=>n+d.weight,0)>100.000001)throw new Error('Assessment weights exceed 100%.');
  const visiting=new Set(),done=new Set();
  const visit=d=>{if(visiting.has(d.key))throw new Error('Cyclic assessment prerequisites.');if(done.has(d.key))return;visiting.add(d.key);d.prerequisites.forEach(p=>{const prior=definitions.find(x=>x.key===p.assessmentId);if(!prior)throw new Error('Unknown prerequisite '+p.assessmentId);if(prior.type==='SEE')throw new Error('SEE cannot be a RECORDED prerequisite; completion is not recorded in this app.');visit(prior);});visiting.delete(d.key);done.add(d.key);};
  definitions.forEach(visit);
  return definitions.sort((a,b)=>a.sequence-b.sequence||a.key.localeCompare(b.key));
}
// Set only inside withAssessmentDefinitions_, so a request parses the definitions tab once.
let assessmentDefinitionsMemo_=null;
function getAssessmentDefinitions_() {
  if(assessmentDefinitionsMemo_)return assessmentDefinitionsMemo_;
  const sheet=getSheet_('AssessmentDefinitions');
  if(!sheet)return [];
  return parseAssessmentDefinitions_(sheet.getDataRange().getValues(),getSpreadsheet_().getSpreadsheetTimeZone());
}
/** Runs a read with AssessmentDefinitions parsed once; nested calls share the outer copy. */
function withAssessmentDefinitions_(read) {
  if(assessmentDefinitionsMemo_)return read();
  assessmentDefinitionsMemo_=getAssessmentDefinitions_();
  try {return read();} finally {assessmentDefinitionsMemo_=null;}
}
/** Required consumers distinguish unfinished setup from a configured registry. */
function requireAssessmentDefinitions_() {
  const definitions=getAssessmentDefinitions_();
  if(!definitions.length&&!getSheet_('AssessmentDefinitions'))throw new Error('AssessmentDefinitions is missing. Ask the Coordinator to create the assessment definitions tab in System Status.');
  if(!definitions.length)throw new Error('AssessmentDefinitions contains no graded assessments. Configure assessment definitions using the System Status definitions link.');
  return definitions;
}
function assessmentDefinition_(id) {
  const definition=requireAssessmentDefinitions_().find(d=>d.key===normalizeText_(id));
  if(!definition)throw new Error('Unknown assessment. Configure '+id+' in AssessmentDefinitions.');
  return definition;
}
function assessmentRubric_(definition) {
  const sheet=getSheet_('Rubrics');if(!sheet)throw new Error('Rubrics tab is required.');
  const rows=sheet.getDataRange().getValues(),col=(rows[0]||[]).map(normalizeText_).indexOf('assessment id');
  if(col<0)throw new Error('Rubrics requires Assessment ID column.');
  const key=definition.key;
  return parseRubricRows_([rows[0],...rows.slice(1).filter(r=>normalizeText_(r[col])===key)],[{key}])[key];
}
/** `loaded` lets a bulk caller hand over records it already read: {definition(id), reviewRecords(key), guideRecords()}. */
function assessmentPrerequisiteBlock_(definition,team,loaded) {
  const source=loaded||{};
  for(const prerequisite of definition.prerequisites) {
    const prior=(source.definition||assessmentDefinition_)(prerequisite.assessmentId);
    let recorded;
    if(prior.type==='REVIEW'){const latest=reviewLatest_((source.reviewRecords||(key=>reviewRecords_(key).records))(prior.key),team);recorded=!!latest&&['Submitted','Published'].includes(latest.status);}
    else {const roster=guideRoster_(team,guideActor_(false),true),records=(source.guideRecords||(()=>guideRecords_().records))();recorded=roster.students.every(s=>{const latest=guideLatest_(records,roster.team,s.register);return latest&&['Submitted','Published'].includes(latest.status);});}
    if(!recorded)return 'Submit '+prior.label+' before entering '+definition.label+' marks.';
  }
  return '';
}
/** Resolve configured storage, recognizing existing journals by assessment identity,
 * never by Review number. Reads do not create, rename, clear or migrate sheets. */
function assessmentJournal_(definition) {
  if(definition.type==='SEE')throw new Error('SEE is evaluated outside this app and has no assessment journal.');
  const configured=getSheet_(definition.journal);
  const inspect=(sheet,name)=>{
    if(!sheet)return {sheet:null,name,state:'MISSING'};
    const rows=sheet.getDataRange().getValues();
    if(!rows.some(r=>r.some(v=>String(v??'')!==''))){
      if(sheet.getLastRow()>0)throw new Error('Incompatible journal '+name+' contains blank-valued cells or formulas. Existing data was left unchanged.');
      return {sheet,name,state:'EMPTY'};
    }
    if(REVIEW_JOURNAL_HEADERS_.some((h,i)=>(rows[0]||[])[i]!==h))throw new Error('Incompatible journal '+name+'. Existing data was left unchanged.');
    const entries=rows.slice(1).filter(r=>r.some(v=>String(v??'')!==''));
    if(entries.some(r=>normalizeText_(r[0])!==definition.key))throw new Error('Journal '+name+' contains another assessment or unidentified data. Existing data was left unchanged.');
    // The rows ride along (not enumerable, so never spread or serialized) to spare reviewRecords_ a second full read.
    return Object.defineProperty({sheet,name,state:'READY',hasRecords:!!entries.length},'rows',{value:rows});
  };
  const direct=inspect(configured,definition.journal);
  if(direct.hasRecords||direct.state==='READY'&&definition.journalConfigured!==false)return direct;
  const candidates=getSpreadsheet_().getSheets().filter(sheet=>sheet!==configured).flatMap(sheet=>{
    const rows=sheet.getDataRange().getValues();
    if(REVIEW_JOURNAL_HEADERS_.some((h,i)=>(rows[0]||[])[i]!==h))return [];
    if(!rows.slice(1).some(r=>normalizeText_(r[0])===definition.key))return [];
    return [inspect(sheet,sheet.getName())];
  });
  if(candidates.length>1)throw new Error('Multiple journals contain '+definition.key+'. Set Journal to the authoritative existing sheet; no data was changed.');
  if(candidates.length){
    if(definition.journalConfigured!==false)throw new Error('Existing history for '+definition.key+' is in '+candidates[0].name+'. Set Journal to that sheet instead of '+definition.journal+'; no data was changed.');
    return candidates[0];
  }
  return direct;
}
function assessmentStorageMissing_(name) {
  return 'Error in Initialization';
}
/** Called only while the coordinator setup lock is held. Preflight before writing. */
function provisionAssessmentJournals_(definitions) {
  definitions.forEach(d=>assessmentRubric_(d));
  const plans=definitions.filter(d=>d.type!=='SEE').map(d=>({definition:d,...assessmentJournal_(d)}));
  const results=plans.map(plan=>{
    const created=plan.state==='MISSING',initialized=plan.state==='EMPTY';
    const sheet=created?getSpreadsheet_().insertSheet(plan.name):plan.sheet;
    if(initialized&&sheet.getLastRow()>0)throw new Error('Journal '+plan.name+' changed during setup. Retry; existing data was left unchanged.');
    if(created||initialized)sheet.getRange(1,1,1,REVIEW_JOURNAL_HEADERS_.length).setValues([REVIEW_JOURNAL_HEADERS_]);
    return {assessment:plan.definition.key,label:plan.definition.label,journal:plan.name,created,initialized,state:'READY'};
  });
  SpreadsheetApp.flush();
  return results;
}
