/** Validate registry-backed assessments and independent lifecycle/rubric configuration. */
function validateReviewConfigurationRows_(milestoneRows, rubricRows, timezone, definitions = []) {
  const issues=[];
  let milestones=null,structure=null;
  try {
    milestones=milestoneRows ? parseMilestoneRows_(milestoneRows,timezone) : [];
    composeProjectTimeline_(milestones,definitions);
  }catch(err){issues.push({sheet:'Milestones',message:err.message});}
  const rubricReport=getAssessmentRubricReadiness_(rubricRows,definitions);
  if(!definitions.length)issues.push({sheet:'AssessmentDefinitions',message:'Configure graded assessments in AssessmentDefinitions.'});
  issues.push(...rubricReport.issues);
  structure=rubricReport.structure;
  return {valid:!issues.length,count:definitions.filter(d=>d.type==='REVIEW').length,issues,milestones,structure,rubrics:rubricReport.reports};
}
function checkReviewConfiguration_() {
  const checkedAt=new Date().toISOString(),links={};
  let registryState='INVALID';
  const blocked=(state,summary,message)=>({valid:false,ready:false,state,registryState,canBootstrap:registryState==='MISSING',summary,count:0,issues:[{sheet:'AssessmentDefinitions',message}],checkedAt,links,storage:[]});
  try {
    const definitionsSheet=getSheet_('AssessmentDefinitions'),rubrics=getSheet_('Rubrics'),milestones=getSheet_('Milestones');
    for(const [key,sheet] of [['definitions',definitionsSheet],['rubrics',rubrics],['config',milestones]])if(sheet)links[key]='https://docs.google.com/spreadsheets/d/'+getSpreadsheetId_()+'/edit#gid='+sheet.getSheetId();
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
    const result=validateReviewConfigurationRows_(milestones?milestones.getDataRange().getValues():null,rubrics?rubrics.getDataRange().getValues():null,getSpreadsheet_().getSpreadsheetTimeZone(),definitions);
    const storage=definitions.map(d=>{
      const item={assessment:d.key,label:d.label,journal:d.journal,rubric:result.rubrics[d.key]};
      if(d.type==='SEE')return {...item,state:'NOT_REQUIRED',detail:'Not required — evaluated outside this app.'};
      try {const resolved=assessmentJournal_(d);return {...item,journal:resolved.name,state:resolved.state};}
      catch(err){return {...item,state:'ERROR',error:err.message};}
    });
    storage.forEach(item=>{item.ready=item.rubric.state==='READY'&&['READY','NOT_REQUIRED'].includes(item.state);});
    const issues=[...result.issues,...storage.filter(item=>item.state==='ERROR').map(item=>({sheet:item.label,message:item.error}))];
    const valid=!issues.length,ready=valid&&storage.every(item=>item.ready);
    const missing=storage.filter(item=>item.state==='MISSING').length,empty=storage.filter(item=>item.state==='EMPTY').length;
    const storageComplete=storage.length>0&&storage.every(item=>['READY','NOT_REQUIRED'].includes(item.state));
    const canInitializeStorage=valid&&(missing>0||empty>0);
    const readyCount=storage.filter(item=>item.ready).length;
    const summary=readyCount+' / '+definitions.length+' assessments ready'+(!valid?' \u00b7 Configuration needs attention':ready?'': ' \u00b7 '+missing+' missing journals \u00b7 '+empty+' journals need initialization. Use Create missing assessment storage.');
    if(valid)projectScheduleExecution_=null;
    return {valid,ready,state:!valid?'invalid':ready?'ready':missing?'storage-missing':'storage-empty',registryState,canBootstrap:false,canInitializeStorage,storageComplete,summary,count:result.count,issues,checkedAt,links,storage};
  }catch(err){return blocked('invalid','Configuration needs attention',err.message);}
}
function getCoordinatorReviewConfiguration_() {
  const email=Session.getActiveUser().getEmail();
  if(!email||(!emailsMatch_(email,getCoordinatorEmail_())&&!emailsMatch_(email,getConfig_('CELL_PD_EMAIL'))))throw new Error('Coordinator access is required.');
  return checkReviewConfiguration_();
}
