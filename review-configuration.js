/** Validate registry-backed assessments and independent lifecycle/rubric configuration. */
function validateReviewConfigurationRows_(milestoneRows, rubricRows, timezone, definitions = []) {
  const issues=[];
  let milestones=null,structure=null;
  try {
    milestones=milestoneRows ? parseMilestoneRows_(milestoneRows,timezone) : [];
    composeProjectTimeline_(milestones,definitions);
  }catch(err){issues.push({sheet:'Milestones',message:err.message});}
  try {
    if(!definitions.length)throw new Error('Configure graded assessments in AssessmentDefinitions.');
    const refs=[...new Set(definitions.map(d=>d.rubricReference))].map(key=>({key}));
    const parsed=parseRubricRows_(rubricRows,refs);
    structure=Object.freeze(Object.fromEntries(definitions.map(d=>[d.key,parsed[d.rubricReference]])));
    definitions.filter(d=>d.type==='INDIVIDUAL_RUBRIC').forEach(d=>{
      if(structure[d.key].some(c=>c.type!=='Individual'||c.descriptors.some(text=>!text)))throw new Error(d.label+' requires individual criteria and all Level 0–5 descriptors.');
    });
  }catch(err){issues.push({sheet:'Rubrics',message:err.message});}
  return {valid:!issues.length,count:definitions.filter(d=>d.type==='REVIEW').length,issues,milestones,structure};
}
function checkReviewConfiguration_() {
  const checkedAt=new Date().toISOString(),links={};
  let registryState='INVALID';
  const blocked=(state,summary,message)=>({valid:false,ready:false,state,registryState,canBootstrap:registryState==='MISSING',summary,count:0,issues:[{sheet:'AssessmentDefinitions',message}],checkedAt,links,storage:[]});
  try {
    const definitionsSheet=getSheet('AssessmentDefinitions'),rubrics=getSheet('Rubrics'),milestones=getSheet('Milestones');
    for(const [key,sheet] of [['definitions',definitionsSheet],['rubrics',rubrics],['config',milestones]])if(sheet)links[key]='https://docs.google.com/spreadsheets/d/'+SHEET_ID+'/edit#gid='+sheet.getSheetId();
    if(!definitionsSheet){
      registryState='MISSING';
      return blocked('definitions-missing','AssessmentDefinitions is missing','Use Create assessment definitions tab to create its schema, then configure your graded assessments.');
    }
    const definitions=getAssessmentDefinitions_();
    if(!definitions.length){
      registryState='EMPTY';
      return blocked('definitions-empty','Assessment definitions required','AssessmentDefinitions contains no graded assessments. Open Assessment definitions and configure the required instances before initializing storage.');
    }
    registryState='VALID';
    const result=validateReviewConfigurationRows_(milestones?milestones.getDataRange().getValues():null,rubrics?rubrics.getDataRange().getValues():[],getSpreadsheet().getSpreadsheetTimeZone(),definitions);
    const storage=definitions.map(d=>{
      const item={assessment:d.key,label:d.label,journal:d.journal};
      if(!result.valid)return {...item,state:'ERROR',error:result.issues.map(issue=>issue.message).join(' ')};
      try {const resolved=assessmentJournal_(d);return {...item,journal:resolved.name,state:resolved.state};}
      catch(err){return {...item,state:'ERROR',error:err.message};}
    });
    const issues=[...result.issues,...(result.valid?storage.filter(item=>item.state==='ERROR').map(item=>({sheet:item.label,message:item.error})):[])];
    const valid=!issues.length,ready=valid&&storage.every(item=>item.state==='READY');
    const missing=storage.filter(item=>item.state==='MISSING').length,empty=storage.filter(item=>item.state==='EMPTY').length;
    const summary=!valid?'Configuration needs attention':ready?storage.length+' assessment journals READY':'Configuration valid · '+missing+' missing journals · '+empty+' journals need initialization. Use Create missing assessment storage.';
    if(valid){rubricExecutionStructure_=result.structure;projectScheduleExecution_=null;}
    return {valid,ready,state:!valid?'invalid':ready?'ready':missing?'storage-missing':'storage-empty',registryState,canBootstrap:false,summary,count:result.count,issues,checkedAt,links,storage};
  }catch(err){return blocked('invalid','Configuration needs attention',err.message);}
}
function getCoordinatorReviewConfiguration() {
  const email=Session.getActiveUser().getEmail();
  if(!email||(!emailsMatch(email,getCoordinatorEmail())&&!emailsMatch(email,getConfig('CELL_PD_EMAIL'))))throw new Error('Coordinator access is required.');
  return checkReviewConfiguration_();
}
