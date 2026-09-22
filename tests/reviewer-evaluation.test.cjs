const { createSheetReadContext } = require('./sheet-read-fixture.cjs');
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const crypto=require('node:crypto');
function fixture() {
 const names=['TEAM_ID','COMMITTEE_NUMBER','TITLE','GUIDE_DECISION','REVIEWER_DECISION','S1_REGNO','S1_NAME','S2_REGNO','S2_NAME'];
 const TS=Object.fromEntries(names.map((n,i)=>[n,i]));
 const team=['T1','C1','A title','Approved','Approved','R1','Alice','R2','Bob'];
 const criteria=[{pi:'PI1',name:'Team design',co:'CO1',maxMarks:6,type:'Team',descriptors:[]},{pi:'PI2',name:'Presentation',co:'CO2',maxMarks:4,type:'Individual',descriptors:[]}];
 const reviews=[{key:'r1',label:'Review 1',rubric:criteria},{key:'r2',label:'Review 2',rubric:criteria}];
 const writes=[],sheets={};let actor='reviewer@example.com',opens=0,released=0;
 const c=createSheetReadContext({console,Date,Set,Map,Session:{getActiveUser:()=>({getEmail:()=>actor})},SHEET_NAMES:{TEAM_STATUS:'teams'},FIELD_DEFINITIONS:{TEAM_STATUS:{}},getColumnMap:()=>TS,getSheetRows:()=>[team],textEquals_:(a,b)=>String(a||'').trim().toLowerCase()===String(b||'').trim().toLowerCase(),normalizeText_:v=>String(v||'').trim().toLowerCase(),getCommitteeNumbersForReviewer:email=>email==='reviewer@example.com'?['C1']:[],getCommitteeInfo:()=>({marksSheetId:'sheet1'}),committeeReviewTabName_:(committee,review)=>review.key,getNamedSheet_:(ss,key)=>sheets[key],SpreadsheetApp:{openById:()=>{opens++;return {};},flush(){}},Utilities:{DigestAlgorithm:{SHA_256:'sha256'},computeDigest:(algorithm,input)=>crypto.createHash('sha256').update(input).digest(),base64EncodeWebSafe:value=>Buffer.from(value).toString('base64url')},LockService:{getScriptLock:()=>({tryLock:()=>true,releaseLock(){released++;}})}});
 for(const file of ['marks-tracker.js','reviewer-evaluation.js'])vm.runInContext(fs.readFileSync(file,'utf8'),c);
 c.getReviewDefinitions_=()=>reviews;
 for(const review of reviews) {
  const data=[c.buildHeaderRow(criteria),[1,'T1','R1','Alice','C1',0,'','',''],[2,'T1','R2','Bob','C1',0,'','',''],[3,'OTHER','R3','Other','C1',0,'untouched',2,3]];
  sheets[review.key]={data,getLastRow:()=>data.length,getLastColumn:()=>9,getRange:(r,col,n,width)=>({getValues:()=>data.slice(r-1,r-1+n).map(row=>row.slice(col-1,col-1+width)),setValues(values){writes.push({review:review.key,r,col,n,width,values});values.forEach((row,i)=>row.forEach((value,j)=>{data[r-1+i][col-1+j]=value;}));}})};
 }
 const payload=(data,levels=[0,0])=>({revision:data.revision,students:data.students.map(student=>({register:student.register,comments:'Feedback',levels:[...levels]}))});
 return {c,team,TS,reviews,sheets,writes,payload,setActor:v=>{actor=v;},opens:()=>opens,released:()=>released};
}

test('reviewer authorization and title approval are enforced before accessing marks',()=>{
 const f=fixture();f.setActor('outsider@example.com');assert.throws(()=>f.c.getReviewerEvaluation('T1','r1'),/not an assigned reviewer/);assert.equal(f.opens(),0);
 f.setActor('reviewer@example.com');f.team[f.TS.REVIEWER_DECISION]='';assert.throws(()=>f.c.getReviewerEvaluation('T1','r1'),/Approve the project title/);assert.equal(f.opens(),0);
 assert.throws(()=>f.c.saveReviewerEvaluation('T1','r1',{}),/Approve the project title/);assert.equal(f.writes.length,0);assert.equal(f.released(),1);
});

test('complete Review 1, including zero scores, unlocks Review 2 and preserves formulas/other teams',()=>{
 const f=fixture();assert.throws(()=>f.c.getReviewerEvaluation('T1','r2'),/Complete Review 1/);
 const data=f.c.getReviewerEvaluation('T1','r1');assert.equal(data.students.length,2);assert.equal(data.students[0].levels[0],null);
 f.c.saveReviewerEvaluation('T1','r1',f.payload(data));
 assert.equal(f.writes.length,2);assert(f.writes.every(w=>w.col===7 && w.width===3));
 assert.equal(f.sheets.r1.data[1][5],0);assert.equal(f.sheets.r1.data[3][6],'untouched');
 assert.equal(f.c.getReviewerEvaluation('T1','r2').review.key,'r2');
 const progress=f.c.getReviewerReviewProgress_([f.team]);assert.equal(progress.teams.t1.r1.completed,true);assert.equal(progress.teams.t1.r2.completed,false);
});

test('save rechecks prerequisites, stale marks, rubric and roster before writing',()=>{
 const f=fixture();let data=f.c.getReviewerEvaluation('T1','r1');
 f.sheets.r1.data[1][7]=2;assert.throws(()=>f.c.saveReviewerEvaluation('T1','r1',f.payload(data)),/changed since/);
 data=f.c.getReviewerEvaluation('T1','r1');f.team[f.TS.S1_NAME]='New name';assert.throws(()=>f.c.saveReviewerEvaluation('T1','r1',f.payload(data)),/changed since/);
 data=f.c.getReviewerEvaluation('T1','r1');f.reviews[0].rubric[0].maxMarks=9;assert.throws(()=>f.c.saveReviewerEvaluation('T1','r1',f.payload(data)),/does not match/);
 assert.equal(f.writes.length,0);
});

test('invalid, incomplete, duplicate and inconsistent team scores produce no writes',()=>{
 const f=fixture();const data=f.c.getReviewerEvaluation('T1','r1');
 for(const levels of [['',0],[6,1],[2.5,2],[true,1],[-1,0]])assert.throws(()=>f.c.saveReviewerEvaluation('T1','r1',f.payload(data,levels)),/level from 0 to 5/);
 const payload=f.payload(data);payload.students[1].levels[0]=1;assert.throws(()=>f.c.saveReviewerEvaluation('T1','r1',payload),/Team criteria/);
 payload.students[1].register=payload.students[0].register;assert.throws(()=>f.c.saveReviewerEvaluation('T1','r1',payload),/Duplicate/);
 assert.equal(f.writes.length,0);
});

test('missing and duplicate marking rows cannot be saved; comments are stored as literals',()=>{
 const f=fixture();const data=f.c.getReviewerEvaluation('T1','r1');const payload=f.payload(data,[3,4]);payload.students[0].comments='=IMPORTXML("url")';f.c.saveReviewerEvaluation('T1','r1',payload);
 assert.equal(f.sheets.r1.data[1][6],"'=IMPORTXML(\"url\")");
 f.sheets.r1.data.push([...f.sheets.r1.data[1]]);assert.throws(()=>f.c.getReviewerEvaluation('T1','r1'),/missing or ambiguous/);
});

test('Review 2 submission rechecks Review 1 even after its drawer was opened',()=>{
 const f=fixture();f.c.saveReviewerEvaluation('T1','r1',f.payload(f.c.getReviewerEvaluation('T1','r1')));
 const second=f.c.getReviewerEvaluation('T1','r2');f.sheets.r1.data[1][7]='';
 assert.throws(()=>f.c.saveReviewerEvaluation('T1','r2',f.payload(second)),/Complete Review 1/);assert.equal(f.writes.length,2);
});

test('marking drawer generates a standalone valid browser script',()=>{
 const c=createSheetReadContext({});for(const file of ['lucide-icons.js','icon-renderer.js','reviewer-evaluation-client.js'])vm.runInContext(fs.readFileSync(file,'utf8'),c);
 new vm.Script(c.getReviewerMarkingScript_());
});

function drawerFixture() {
 const requests=[],events={};let filters=0;
 const button=attribute=>({disabled:false,hidden:true,isConnected:true,hasAttribute:name=>name===attribute,closest(){return this;},focus(){}});
 const close=button('data-marks-close'),save=button('data-marks-save'),retry=button('data-marks-retry');
 const status={},comments={value:'Feedback'},select={value:'0'},form={reportValidity:()=>true};
 const dialog={open:false,innerHTML:'',setAttribute(){},addEventListener:(key,fn)=>events[key]=fn,showModal(){this.open=true;},close(){this.open=false;},querySelector(selector){if(selector==='[data-marks-status]')return status;if(selector==='[data-marks-close]')return close;if(selector==='[data-marks-retry]')return retry;if(selector==='form')return form;if(selector.startsWith('[data-comments'))return comments;return select;},querySelectorAll:()=>[close,save,retry,comments,select]};
 const content={innerHTML:''},search={value:'T1',focus(){}};
 function runner(success,failure){return new Proxy({},{get:(_,name)=>name==='withSuccessHandler'?fn=>runner(fn,failure):name==='withFailureHandler'?fn=>runner(success,fn):(...args)=>requests.push({name,args,success,failure})});}
 const c=createSheetReadContext({window:{confirm:()=>true},document:{createElement:()=>dialog,body:{appendChild(){}},getElementById:id=>id==='reviewerContent'?content:search},DashboardUI:{guideRun:()=>runner(),filterReviewerAssignedTeams(){filters++;}}});
 for(const file of ['lucide-icons.js','icon-renderer.js','reviewer-evaluation-client.js'])vm.runInContext(fs.readFileSync(file,'utf8'),c);
 vm.runInContext(fs.readFileSync('common-styles.js','utf8'),c);
 c.DashboardUI.renderSkeleton=c.getSkeletonMarkup_;
 vm.runInContext(c.getReviewerMarkingScript_()+'\nwindow.marks=ReviewerMarks;',c);
 const data={team:'T1',title:'Title',review:{key:'r1',label:'Review 1'},criteria:[{pi:'PI1',name:'Design',co:'CO1',maxMarks:10,type:'Team',descriptors:[]}],students:[{register:'r1',name:'Alice',comments:'',levels:[null]}],revision:'token'};
 return {requests,dialog,status,save,retry,filters:()=>filters,open:()=>c.window.marks.open('T1','r1',close),click:target=>events.click({target}),close,data};
}

test('drawer ignores late responses after close and blocks duplicate saves',()=>{
 const f=drawerFixture();f.open();f.click(f.close);assert.equal(f.dialog.open,false);
 f.requests[0].success(f.data);assert(!f.dialog.innerHTML.includes('reviewerMarksForm'));
 f.open();f.requests[1].success(f.data);assert(f.dialog.innerHTML.includes('reviewerMarksForm'));
 f.click(f.save);f.click(f.save);f.click(f.close);
 assert.equal(f.requests.filter(r=>r.name==='saveReviewerEvaluation').length,1);assert.equal(f.dialog.open,true);
 f.requests[2].failure(new Error('Offline'));assert.equal(f.save.disabled,false);assert.equal(f.status.textContent,'Offline');
});

test('saved marks refresh retry does not resubmit scores and restores table search',()=>{
 const f=drawerFixture();f.open();f.requests[0].success(f.data);f.click(f.save);
 f.requests[1].success({ok:true,message:'Saved'});assert.equal(f.requests[2].name,'refreshReviewerContentForCurrentUser');
 f.requests[2].failure(new Error('Offline'));assert.equal(f.retry.hidden,false);assert.match(f.status.textContent,/Marks saved/);
 f.click(f.save);assert.equal(f.requests.length,3);
 f.click(f.retry);assert.equal(f.requests[3].name,'refreshReviewerContentForCurrentUser');f.requests[3].success('updated table');
 assert.equal(f.dialog.open,false);assert.equal(f.filters(),1);assert.equal(f.requests.filter(r=>r.name==='saveReviewerEvaluation').length,1);
});
