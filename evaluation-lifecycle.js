/** Assessment-neutral command, snapshot and append infrastructure. */
function evaluationCanonical_(value) {
  if(Array.isArray(value))return value.map(evaluationCanonical_);
  if(value && typeof value==='object')return Object.fromEntries(Object.keys(value).sort().map(k=>[k,evaluationCanonical_(value[k])]));
  return value;
}
function evaluationHash_(value) {return guideFingerprint_(evaluationCanonical_(value));}
function evaluationMembership_(roster) {
  const students=roster.students.map(s=>normalizeText_(s.register)).sort();
  if(!students.length || students.some(s=>!s) || new Set(students).size!==students.length)throw new Error('Student roster is missing or ambiguous.');
  return {team:normalizeText_(roster.team),students};
}
function evaluationCommand_(action,input,run) {
  if(!input || typeof input.requestId!=='string' || !/^[A-Za-z0-9_-]{12,100}$/.test(input.requestId) || !Number.isSafeInteger(input.revision)||input.revision<0)throw new Error('Invalid request. Reload and retry.');
  const lock=LockService.getScriptLock();
  if(!lock.tryLock(5000))throw new Error('Another evaluation is saving. Retry shortly.');
  try{return run(evaluationHash_({action,input}));}finally{lock.releaseLock();}
}
function evaluationDuplicate_(records,actor,input,fingerprint) {
  const matches=records.filter(r=>r.actor===actor && r.requestId===input.requestId);
  if(matches.length>1)throw new Error('Conflicting duplicate request history.');
  const found=matches[0];
  if(found && found.fingerprint!==fingerprint)throw new Error('Request ID was already used for different data.');
  return found;
}
function evaluationRevision_(latest,input) {
  if((latest?latest.revision:0)!==input.revision)throw new Error('This evaluation changed. Reload before saving.');
}
/**
 * Appends rows given in the journal's canonical field order (ASSESSMENT_JOURNAL_FIELDS_); each lands under its header.
 * `columns` is the journal's column map, found by the reader that returned the sheet.
 */
function evaluationAppend_(sheet,columns,values) {
  const keys=Object.keys(ASSESSMENT_JOURNAL_FIELDS_),payload=keys.indexOf('PAYLOAD');
  if(values.some(row=>String(row[payload]).length>45000))throw new Error('Evaluation payload is too large. Shorten feedback.');
  const left=Math.min(...Object.values(columns)),width=Math.max(...Object.values(columns))-left+1;
  const first=sheet.getLastRow()+1;guideEnsureRows_(sheet,first+values.length-1);
  sheet.getRange(first,left+1,values.length,width).setValues(values.map(row=>{
    const cells=new Array(width).fill('');
    keys.forEach((key,i)=>{const v=row[i];cells[columns[key]-left]=typeof v==='string'&&v.startsWith('=')?"'"+v:v;});
    return cells;
  }));
  SpreadsheetApp.flush();
}
function evaluationReopenChanges_(latest,config,roster) {
  const strip=c=>Object.fromEntries(Object.entries(c).filter(([k])=>!['criteria','academicPolicyVersion','policy','maximum'].includes(k)));
  const changes=[];
  if(evaluationHash_(latest.config.criteria)!==evaluationHash_(config.criteria))changes.push({dimension:'rubric',code:'RUBRIC_CHANGED'});
  if(evaluationHash_(strip(latest.config))!==evaluationHash_(strip(config)))changes.push({dimension:'configuration',code:'CONFIGURATION_CHANGED'});
  if(evaluationHash_(evaluationMembership_(latest.roster))!==evaluationHash_(evaluationMembership_(roster)))changes.push({dimension:'roster',code:'ROSTER_CHANGED'});
  if(latest.config.academicPolicyVersion!==config.academicPolicyVersion)changes.push({dimension:'policy',code:'POLICY_CHANGED'});
  return changes;
}
function evaluationAssertCompatible_(latest,config,roster) {
  const changes=evaluationReopenChanges_(latest,config,roster);
  if(changes.length){const result={code:'REOPEN_INCOMPATIBLE',changes};const error=new Error(JSON.stringify(result));error.code=result.code;error.changes=changes;throw error;}
}
