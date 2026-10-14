/** Instances are spreadsheet data; this file registers types and supported policies only. */
/**
 * The columns every assessment journal has, with the header each is found under. All journals share this layout. A journal is read
 * and written by header name, so column order does not matter and extra columns are kept.
 */
const ASSESSMENT_JOURNAL_FIELDS_ = {ASSESSMENT:'Assessment',TEAM:'Team',STUDENT:'Student',REVISION:'Revision',ACTION:'Action',ACTOR:'Actor',AT:'At',REQUEST_ID:'Request ID',PAYLOAD:'Payload'};
/** The journal columns of a header row by name, or null when a header is missing or repeated (the sheet is not a journal). */
function assessmentJournalColumns_(headerRow) {
  const columns={};
  for(const [key,name] of Object.entries(ASSESSMENT_JOURNAL_FIELDS_)){
    const matches=(headerRow||[]).flatMap((cell,index)=>textEquals_(cell,name)?[index]:[]);
    if(matches.length!==1)return null;
    columns[key]=matches[0];
  }
  return columns;
}
const ASSESSMENT_DEFINITION_HEADERS_ = ['Assessment ID','Type','Label','Sequence','Weight (%)','Opening','Due Date','Prerequisites','Academic Policy Version','Journal'];
function parseAssessmentDefinitions_(rows,timezone) {
  const headers=(rows[0]||[]).map(normalizeText_);
  const cols=ASSESSMENT_DEFINITION_HEADERS_.map(h=>{const i=headers.indexOf(normalizeText_(h));if(i<0||headers.lastIndexOf(normalizeText_(h))!==i)throw new Error('AssessmentDefinitions requires exactly one '+h+' column.');return i;});
  const definitions=rows.slice(1).filter(r=>r.some(v=>String(v??'').trim())).map((row,index)=>{
    const [id,type,label,sequence,weight,opening,due,,policy,journal]=cols.map(c=>row[c]); // the Prerequisites cell is kept for the header but not read: order comes from Sequence
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
    if(kind==='SEE' && String(journal??'').trim())fail('SEE Journal must be blank; no storage is required.');
    const storage=kind==='SEE'?'':String(journal||'').trim() || 'Assessment_'+key;
    if(storage.length>100 || /[\[\]:*?\/\\]/.test(storage) || ['teamstatus','rubrics','milestones','assessmentdefinitions'].includes(normalizeText_(storage)))fail('Invalid journal name.');
    return {key,type:kind,label:String(label).trim(),sequence:Number(sequence),weight:Number(weight),opens,day,academicPolicyVersion:kind==='SEE'?'':policy,journal:storage,journalConfigured:!!String(journal||'').trim(),gradedBy:kind==='SEE'?'SEE Committee (includes external members)':kind==='REVIEW'?'Review Committee':'Project Guide'};
  });
  if(new Set(definitions.map(d=>d.key)).size!==definitions.length)throw new Error('Duplicate assessment ID.');
  if(new Set(definitions.filter(d=>d.type!=='SEE').map(d=>normalizeText_(d.journal))).size!==definitions.filter(d=>d.type!=='SEE').length)throw new Error('Assessment journals must be distinct.');
  if(definitions.reduce((n,d)=>n+d.weight,0)>100.000001)throw new Error('Assessment weights exceed 100%.');
  return definitions.sort((a,b)=>a.sequence-b.sequence||a.key.localeCompare(b.key));
}
// Set only inside withAssessmentDefinitions_, so a request parses the definitions tab once.
let assessmentDefinitionsMemo_=null;
// Same scope: the Rubrics rows, read on first use, so a request reads that tab once however many assessments it configures.
let assessmentRubricRowsMemo_=null;
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
  assessmentRubricRowsMemo_={rows:null};
  try {return read();} finally {assessmentDefinitionsMemo_=null;assessmentRubricRowsMemo_=null;}
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
  const memo=assessmentRubricRowsMemo_;
  let rows=memo&&memo.rows;
  if(!rows){
    const sheet=getSheet_('Rubrics');if(!sheet)throw new Error('Rubrics tab is required.');
    rows=sheet.getDataRange().getValues();
    if(memo)memo.rows=rows;
  }
  const col=(rows[0]||[]).map(normalizeText_).indexOf('assessment id');
  if(col<0)throw new Error('Rubrics requires Assessment ID column.');
  const key=definition.key;
  return parseRubricRows_([rows[0],...rows.slice(1).filter(r=>normalizeText_(r[col])===key)],[{key}])[key];
}
/** An assessment opens only after every other graded assessment with a lower Sequence is recorded (Submitted or Published) for the team; SEE is
 * never recorded in this app, so it is skipped. Equal sequences do not block each other. Returns the first message, or ''.
 * `loaded` lets a bulk caller hand over what it already read: {definitions, reviewRecords(key), guideRecords()}. */
function assessmentSequenceBlock_(definition,team,loaded) {
  if(definition.type!=='REVIEW')return '';
  const source=loaded||{};
  const earlier=(source.definitions||requireAssessmentDefinitions_()).filter(d=>d.type!=='SEE'&&d.sequence<definition.sequence);
  for(const prior of earlier) {
    let recorded;
    if(prior.type==='REVIEW'){const latest=reviewLatest_((source.reviewRecords||(key=>reviewRecords_(key).records))(prior.key),team);recorded=!!latest&&['Submitted','Published'].includes(latest.status);}
    else {const roster=guideRoster_(team,guideActor_(false),true),records=(source.guideRecords||(()=>guideRecords_().records))();recorded=roster.students.every(s=>{const latest=guideLatest_(records,roster.team,s.register);return latest&&['Submitted','Published'].includes(latest.status);});}
    if(!recorded)return 'Submit '+prior.label+' before entering '+definition.label+' marks.';
  }
  return '';
}
/** Resolve configured storage, recognizing existing journals by assessment identity,
 * never by Review number. Reads do not create, rename, clear or migrate sheets. `options.discover === false` (reading for a dashboard or a marking
 * screen only) does not search the other sheets when the journal sheet exists: an empty journal there means nothing is marked yet. Setup and
 * saves keep the search. */
function assessmentJournal_(definition,options) {
  if(definition.type==='SEE')throw new Error('SEE is evaluated outside this app and has no assessment journal.');
  const configured=getSheet_(definition.journal);
  const inspect=(sheet,name)=>{
    if(!sheet)return {sheet:null,name,state:'MISSING'};
    const rows=sheet.getDataRange().getValues();
    if(!rows.some(r=>r.some(v=>String(v??'')!==''))){
      if(sheet.getLastRow()>0)throw new Error('Incompatible journal '+name+' contains blank-valued cells or formulas. Existing data was left unchanged.');
      return {sheet,name,state:'EMPTY'};
    }
    const columns=assessmentJournalColumns_(rows[0]);
    if(!columns)throw new Error('Incompatible journal '+name+'. Existing data was left unchanged.');
    const entries=rows.slice(1).filter(r=>r.some(v=>String(v??'')!==''));
    if(entries.some(r=>normalizeText_(r[columns.ASSESSMENT])!==definition.key))throw new Error('Journal '+name+' contains another assessment or unidentified data. Existing data was left unchanged.');
    // The rows ride along (not enumerable, so never spread or serialized) to spare reviewRecords_ a second full read.
    return Object.defineProperty({sheet,name,state:'READY',hasRecords:!!entries.length},'rows',{value:rows});
  };
  const direct=inspect(configured,definition.journal);
  if(direct.hasRecords||direct.state==='READY'&&definition.journalConfigured!==false||direct.sheet&&options&&options.discover===false)return direct;
  const candidates=getSpreadsheet_().getSheets().filter(sheet=>sheet!==configured).flatMap(sheet=>{
    const rows=sheet.getDataRange().getValues();
    const columns=assessmentJournalColumns_(rows[0]);
    if(!columns)return [];
    if(!rows.slice(1).some(r=>normalizeText_(r[columns.ASSESSMENT])===definition.key))return [];
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
    if(created||initialized){const headers=Object.values(ASSESSMENT_JOURNAL_FIELDS_);sheet.getRange(1,1,1,headers.length).setValues([headers]);}
    return {assessment:plan.definition.key,label:plan.definition.label,journal:plan.name,created,initialized,state:'READY'};
  });
  SpreadsheetApp.flush();
  return results;
}
