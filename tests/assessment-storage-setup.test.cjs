const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
test('committee assignment and directory require only assignment columns',()=>{
 const c=vm.createContext({PropertiesService:{getScriptProperties:()=>({getProperty:()=>''})}});
 for(const file of ['common-constants.js','common-helpers.js','lucide-icons.js','icon-renderer.js','coordinator-dashboard.js'])vm.runInContext(fs.readFileSync(file,'utf8'),c);
 const fields=vm.runInContext('FIELD_DEFINITIONS.REVIEW_COMMITTEE',c);
 const headers=['Review Committee Number',...Array.from({length:4},(_,i)=>['Reviewer '+(i+1)+' Name','Reviewer '+(i+1)+' Email']).flat()];
 assert.deepEqual(Array.from(Object.values(fields)),headers);
 const row=['C1','Reviewer One','one@example.com','','','','','',''];
 c.getSheet=()=>({getName:()=> 'ReviewCommittee'});c.readSheetRows_=()=>[headers];c.getSheetRows=()=>[row];
 const columns=c.getReviewCommitteeColumns();assert.equal(Object.keys(columns).length,9);
 assert.deepEqual(Array.from(c.getCommitteeNumbersForReviewer('ONE@example.com')),['C1']);
 const info=c.getCommitteeInfo('C1');assert.equal(info.reviewer1Name,'Reviewer One');assert.equal(Object.keys(info).length,8);
 const data=c.buildCommitteeData_([row],[['T1','C1']],columns,{TEAM_ID:0,COMMITTEE_NUMBER:1});
 assert.deepEqual(Object.keys(data[0]).sort(),['members','number','teams']);
 vm.runInContext(fs.readFileSync('system-status-view.js','utf8'),c);
 const html=c.systemStatusViewBrowser_(null,()=>({renderIcon:()=>''}),()=>null).committeeDirectory(data),{document}=require('linkedom').parseHTML(html);
 assert.match(document.textContent||html,/Reviewer One/);assert.match(html,/T1/);assert.equal(document.querySelectorAll('a').length,0);
 assert.equal(document.querySelector('summary').textContent,'Committee C11 reviewers · 1 teams');
});
function setup(){
 let actor='coord@x',allowLock=true,valid=true,released=0,calls=0;
 const definitions=[{key:'review1',type:'REVIEW'},{key:'design_gate',type:'REVIEW'},{key:'guide',type:'GUIDE_EVALUATION'}];
 const c=vm.createContext({Session:{getActiveUser:()=>({getEmail:()=>actor})},getCoordinatorEmail:()=> 'coord@x',getConfig:()=> 'pd@x',emailsMatch:(a,b)=>a===b,
 LockService:{getScriptLock:()=>({tryLock:()=>allowLock,releaseLock:()=>released++})},checkReviewConfiguration_:()=>({valid,issues:[{message:'Invalid config'}]}),getAssessmentDefinitions_:()=>definitions,
 provisionAssessmentJournals_:defs=>{calls++;return defs.map(d=>({assessment:d.key}));},SpreadsheetApp:{openById:()=>{throw Error('External file access');}}});
 vm.runInContext(fs.readFileSync('assessment-storage-setup.js','utf8'),c);
 return {c,actor:v=>actor=v,lock:v=>allowLock=v,valid:v=>valid=v,calls:()=>calls,released:()=>released};
}
test('setup provisions all supported configured assessment journals without external file creation or Drive access',()=>{
 const f=setup();assert.deepEqual(Array.from(f.c.prepareReviewAssessmentStorage().journals,j=>j.assessment),['review1','design_gate','guide']);assert.equal(f.released(),1);
});
test('setup requires Coordinator or PD and obtains its lock before writes',()=>{
 const f=setup();f.actor('outsider');assert.throws(()=>f.c.prepareReviewAssessmentStorage(),/Coordinator/);assert.equal(f.calls(),0);
 f.actor('pd@x');f.lock(false);assert.throws(()=>f.c.prepareReviewAssessmentStorage(),/Another setup/);assert.equal(f.calls(),0);
 f.lock(true);f.c.prepareReviewAssessmentStorage();assert.equal(f.calls(),1);
});
test('invalid configuration and provisioning errors release lock without legacy fallback',()=>{
 const f=setup();f.valid(false);assert.throws(()=>f.c.prepareReviewAssessmentStorage(),/Invalid config/);assert.equal(f.calls(),0);assert.equal(f.released(),1);
 f.valid(true);f.c.provisionAssessmentJournals_=()=>{throw Error('Unsafe journal');};assert.throws(()=>f.c.prepareReviewAssessmentStorage(),/Unsafe journal/);assert.equal(f.released(),2);
});


test('committee readiness is authorized, read-only and distinguishes missing, empty and incomplete configuration',()=>{
 let actor='coord@x',mode='ready',reads=0;
 const rows=[['C1','Reviewer','one@example.com']],columns={COMMITTEE_NUMBER:0,REVIEWER1_NAME:1,REVIEWER1_EMAIL:2};
 const c=vm.createContext({Session:{getActiveUser:()=>({getEmail:()=>actor})},getCoordinatorEmail:()=> 'coord@x',getConfig:()=> 'pd@x',emailsMatch:(a,b)=>a.toLowerCase()===b.toLowerCase(),withDashboardRead_:fn=>fn(),SHEET_ID:'main',SHEET_NAMES:{REVIEW_COMMITTEE:'ReviewCommittee',TEAM_STATUS:'TeamStatus'},FIELD_DEFINITIONS:{REVIEW_COMMITTEE:{},TEAM_STATUS:{}},normalizeText_:v=>String(v||'').trim().toLowerCase(),textEquals_:(a,b)=>String(a).toLowerCase()===String(b).toLowerCase(),escapeHtml:v=>String(v),renderLucideIcon_:()=>'',
 getSheet:name=>{reads++;return name==='ReviewCommittee'&&mode==='missing'?null:{getSheetId:()=>1};},
 getColumnMap:name=>{if(mode==='headers'&&name==='ReviewCommittee')throw Error('Missing Reviewer 1 Email column');return name==='ReviewCommittee'?columns:{TEAM_ID:0,COMMITTEE_NUMBER:1};},
 getSheetRows:name=>name==='ReviewCommittee'?(mode==='empty'?[]:rows):[]});
 vm.runInContext(fs.readFileSync('coordinator-dashboard.js','utf8'),c);
 actor='outsider@x';assert.throws(()=>c.getCoordinatorCommitteeConfiguration(),/Coordinator access/);assert.equal(reads,0);
 for(const who of ['coord@x','PD@X']){actor=who;const r=c.getCoordinatorCommitteeConfiguration();assert.equal(r.valid,true);assert.equal(r.committees[0].teams.length,0);assert(r.links.committees);assert(r.links.assignments);}
 for(const [kind,state] of [['missing','definitions-missing'],['empty','definitions-empty'],['headers','invalid']]){mode=kind;const r=c.getCoordinatorCommitteeConfiguration();assert.equal(r.state,state);assert.equal(r.valid,false);assert(r.issues.length);}
 mode='ready';rows[0][2]='';const r=c.getCoordinatorCommitteeConfiguration();assert.equal(r.valid,false);assert.match(r.issues[0].message,/no reviewer email/);assert.equal(rows.length,1);
});
