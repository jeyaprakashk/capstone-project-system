const fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
function publishingFixture(key='review1') {
  let actor='reviewer@x',locked=false;
  const students=[{regNo:'S1',name:'Alex One',email:'one@x'},{regNo:'S2',name:'Bea Two',email:'two@x'},{regNo:'S3',name:'Casey Three',email:'three@x'}];
  const row=['G18','C1','Project','Approved','guide@x'],rows=[row];
  const cols={TEAM_ID:0,COMMITTEE_NUMBER:1,TITLE:2,REVIEWER_DECISION:3,GUIDE_EMAIL:4};
  const criteria=[{pi:'T',name:'Team',maxMarks:60,type:'Team',descriptors:Array(6).fill('Descriptor')},{pi:'I',name:'Individual',maxMarks:40,type:'Individual',descriptors:Array(6).fill('Descriptor')}];
  const normalize=value=>String(value??'').trim().toLowerCase(),sheets={},tables={};
  const c=vm.createContext({Date,console,Set,Map,
    Session:{getActiveUser:()=>({getEmail:()=>actor})},activityIsCoordinator_:email=>email==='coord@x',normalizeText_:normalize,normalizeReviewKey_:normalize,normalizeEmail:normalize,
    textEquals_:(a,b)=>normalize(a)===normalize(b),emailsMatch:(a,b)=>normalize(a)===normalize(b),
    SHEET_NAMES:{TEAM_STATUS:'teams'},FIELD_DEFINITIONS:{TEAM_STATUS:{}},getColumnMap:()=>cols,getSheetRows:()=>rows,getStudentsFromTeamStatusRow_:()=>students,
    getCommitteeNumbersForReviewer:()=>['C1'],getCommitteeInfo:()=>({}),getReviewDefinitions_:()=>['review1','review2'].map(key=>({key,label:key,day:20000,weight:25,rubric:criteria})),
    getSpreadsheet:()=>({getSpreadsheetTimeZone:()=> 'UTC',getSheets:()=>Object.values(sheets)}),getSheet:name=>sheets[name]||null,projectDay_:()=>20000,
    Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(_,text)=>crypto.createHash('sha256').update(text).digest(),base64EncodeWebSafe:value=>value.toString('base64url')},
    LockService:{getScriptLock:()=>({tryLock:()=>{if(locked)return false;locked=true;return true;},releaseLock:()=>locked=false})},SpreadsheetApp:{flush(){}},
    summarizeReviewCompletion_:registers=>({totalStudents:registers.size,markedStudents:0}),escapeHtml:normalize,getSkeletonMarkup_:()=>'<div>Skeleton</div>'
  });
  for(const file of ['lucide-icons.js','icon-renderer.js','review-academic-policy.js','evaluation-lifecycle.js','publication-events.js','assessment-registry.js','guide-evaluation.js','review-evaluation.js','internal-assessment-publishing.js','internal-assessment-publishing-client.js'])vm.runInContext(fs.readFileSync(file,'utf8'),c,{filename:file});
  c.getMilestones_=()=>[];
  c.guideConfiguration_=()=>({criteria:[criteria[1]],maximum:40,weight:.2,due:20000,timezone:'UTC'});
  c.getAssessmentDefinitions_=()=>['review1','review2'].map((key,i)=>({key,type:'REVIEW',label:key,sequence:i+1,day:20000,opens:19993,weight:25,academicPolicyVersion:'review-attendance-v1',journal:'Review'+(i+1)+'Evaluations',prerequisites:[]})).concat([{key:'guide_eval',type:'GUIDE_EVALUATION',label:'Guide Evaluation',sequence:3,day:20000,opens:19990,weight:20,academicPolicyVersion:'guide-bands-v3-target-level-2',journal:'GuideEvaluations',prerequisites:[]}]);
  c.requireAssessmentDefinitions_=()=>c.getAssessmentDefinitions_();
  c.assessmentRubric_=()=>criteria;
  for(const name of ['Review1Evaluations','Review2Evaluations','GuideEvaluations']){
    const data=tables[name]=[['Assessment','Team','Student','Revision','Action','Actor','At','Request ID','Payload']];
    sheets[name]={getName:()=>name,getDataRange:()=>({getValues:()=>data.map(row=>row.slice())}),getLastRow:()=>data.length,getMaxRows:()=>1000,
      getRange:(r,col)=>({setValues:values=>values.forEach((row,i)=>{data[r-1+i]=row.slice();})})};
  }
  const input=()=>{const loaded=c.getReviewEvaluation_('G18',key);return {team:'G18',revision:loaded.revision,token:loaded.token,requestId:crypto.randomUUID(),teamScores:{T:{level:3,marks:48,remark:''}},students:students.map(s=>({register:normalize(s.regNo),absence:{type:'NORMAL'},scores:{I:{level:3,marks:32,remark:''}}}))};};
  const submit=value=>{actor='reviewer@x';return c.reviewWrite_('submit',value||input(),key);};
  const report=()=>{actor='coord@x';return c.loadInternalAssessmentPublishing(key);};
  const publish=student=>{actor='coord@x';const latest=c.reviewLatest_(c.reviewRecords_(key).records,'G18');return c.reviewWrite_('publish',{team:'G18',revision:latest.revision,requestId:crypto.randomUUID(),...(student?{student}:{})},key);};
  const guideSubmit=register=>{actor='guide@x';const d=c.loadGuideEvaluation('G18',register);return c.submitGuideEvaluation({team:'G18',student:register,revision:d.revision,token:d.token,requestId:crypto.randomUUID(),scores:{I:{level:3,marks:32,remark:''}}});};
  return {c,key,rows,row,students,tables,input,submit,publish,report,guideSubmit,actor:value=>actor=value};
}
module.exports={publishingFixture};
