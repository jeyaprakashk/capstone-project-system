// The real dashboard page, assembled by the production serializers and started in a DOM.
// Guards the inline script before role bundles change what each page contains (ROLE-BUNDLES-PLAN.md, Stage 1).
const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const {parseHTML}=require('linkedom');

// Labels and order as getDashboardRoleViews_() returns them.
const VIEWS=[
 {key:'student',label:'My Team',contentId:'studentContent'},
 {key:'guide',label:'My Teams (Guide)',contentId:'guideContent'},
 {key:'reviewer',label:'Reviewer',contentId:'reviewerContent'},
 {key:'coord',label:'Coordinator',contentId:'coordinatorContent'}
];
const ROLE_READS={student:'API_student_getCore',guide:'API_guide_getDashboard',reviewer:'API_reviewer_getDashboard',coord:'API_coordinator_getOverview'};
// Every module a role's views or start-up registration use, by role.
const ROLE_MODULES={
 student:['StudentView','StudentWeekly','StudentResults','StudentGithub'],
 guide:['GuideView','GuideWeekly','GuideEvaluation'],
 reviewer:['ReviewerView','ReviewEvaluations'],
 coord:['CoordinatorView','SystemStatusView','SystemStatusActions','TeamDrawerView','InternalAssessmentPublishing','WeeklyPhase2Setup']
};
// Each page ships the modules of its own roles only.
const SHIPPED=views=>views.map(view=>view.key);
const COMBINATIONS=Array.from({length:15},(_,mask)=>VIEWS.filter((_,bit)=>(mask+1)&(1<<bit)));

// Every root module with Apps Script services stubbed. The intake workflow reads the Config sheet at load and builds no page.
function server() {
 const c=vm.createContext({console:{log(){},warn(){},error(){}},
  PropertiesService:{getScriptProperties:()=>({getProperty:()=>''})},
  Session:{getActiveUser:()=>({getEmail:()=>'user@example.test'})},
  HtmlService:{createHtmlOutput:html=>({html,setTitle(){return this;},addMetaTag(){return this;}}),createHtmlOutputFromFile:name=>({getContent:()=>fs.readFileSync(name+'.html','utf8')})}});
 for(const file of fs.readdirSync('.').filter(name=>name.endsWith('.js')&&name!=='intake-approval-workflow.js')) vm.runInContext(fs.readFileSync(file,'utf8'),c,{filename:file});
 return c;
}
const c=server();

// Runs the page's inline script against its own markup. Server calls are recorded and never answered.
function start(views,readyState,edit=html=>html) {
 const html=edit(c.buildDashboardShell_('user@example.test',views));
 const {window,document}=parseHTML(html);
 const scripts=Array.from(document.querySelectorAll('script'));
 assert.equal(scripts.length,1,'one inline script');
 Object.defineProperty(document,'readyState',{value:readyState,configurable:true});
 window.matchMedia=()=>({matches:false,addEventListener(){}});
 const calls=[];
 const runner=()=>new Proxy({},{get:(_,method)=>method==='withSuccessHandler'||method==='withFailureHandler'||method==='withUserObject'?()=>runner():(...args)=>{calls.push(method);}});
 const page=vm.createContext({window,document,navigator:window.navigator,performance,console,Promise,setTimeout:()=>0,clearTimeout(){},google:{script:{run:runner()}}});
 vm.runInContext(scripts[0].textContent,page,{filename:'page.js'});
 return {html,document,calls,page,ui:()=>vm.runInContext('DashboardUI',page),ready:()=>document.dispatchEvent(new window.Event('DOMContentLoaded'))};
}
const activePanel=document=>document.querySelector('[data-role-panel]:not([hidden])').getAttribute('data-role-panel');

for(const views of COMBINATIONS) {
 const name=views.map(view=>view.key).join('+');
 test('page assembles and starts for '+name,()=>{
  const first=views[0].key;
  // Script parsed before the DOM was ready: nothing loads until DOMContentLoaded.
  const loading=start(views,'loading');
  assert.deepEqual(loading.calls,[]);
  loading.ready();
  assert(loading.calls.includes(ROLE_READS[first]),first+' loads on start');
  assert.equal(activePanel(loading.document),first);
  // Script run after the DOM was ready: it starts at once.
  const complete=start(views,'complete');
  assert(complete.calls.includes(ROLE_READS[first]),first+' loads at once');
  // Every tab on the page opens and requests its own data.
  for(const view of views) {
   complete.ui().showRoleTab(view.key);
   assert.equal(activePanel(complete.document),view.key);
   assert(complete.calls.includes(ROLE_READS[view.key]),view.key+' loads when opened');
  }
  complete.ui().showRoleTab('rubrics');
  assert.equal(activePanel(complete.document),'rubrics');
  assert(complete.calls.includes('API_shared_getTimeline')&&complete.calls.includes('API_shared_getRubrics'));
  // Each role's modules ship exactly when the page includes that role.
  const shipped=SHIPPED(views);
  for(const [role,modules] of Object.entries(ROLE_MODULES)) for(const module of modules) {
   assert.equal(vm.runInContext('typeof '+module,complete.page),shipped.includes(role)?'object':'undefined',module+' on a '+name+' page');
  }
  const coordinator=views.some(view=>view.key==='coord');
  assert.equal(!!complete.document.querySelector('[data-role-tab="system-status"]'),coordinator);
  if(coordinator) {
   complete.ui().showRoleTab('system-status');
   assert.equal(activePanel(complete.document),'system-status');
   assert(complete.calls.includes('API_coordinator_getSystemStatus'));
  }
 });
}

test('role registration rejects duplicates and controllers without load and render',()=>{
 const {ui,page}=start(VIEWS,'complete');
 assert.throws(()=>ui().registerRole('student',vm.runInContext('StudentView',page)),/registered twice: student/);
 assert.throws(()=>ui().registerRole('extra',{load(){}}),/needs load and render/);
 assert.throws(()=>ui().registerRole('extra',{load(){},render(){},activate:true}),/needs load and render/);
});

test('a tab whose role never registered shows a reload message and settles loading',async()=>{
 const f=start(VIEWS.slice(0,2),'complete',html=>html.replace(/^DashboardUI\.registerRole\('guide'.*$/m,''));
 f.ui().showRoleTab('guide');
 await new Promise(resolve=>setImmediate(resolve));
 const content=f.document.querySelector('[data-role-content="guide"]');
 assert.match(content.textContent,/This dashboard could not initialize\. Reload the page\./);
 assert.equal(content.querySelector('[data-loading-overlay]'),null);
 assert(!f.calls.includes('API_guide_getDashboard'));
});

test('review-policy rules ship to the browser unchanged',()=>{
 const {html}=start(VIEWS,'complete');
 for(const rule of [c.reviewPolicyFacts_,c.reviewPolicyScoresComplete_,c.reviewPolicyCalculate_]) assert(html.includes(rule.toString()),rule.name);
});

test('an account with no role gets the denial page and no dashboard script',()=>{
 const local=server();
 local.getDashboardRoleViews_=()=>[];
 const {html}=local.doGet({parameter:{}});
 assert.match(html,/No Student, Reviewer, Guide, or Coordinator role was found for this account\./);
 assert.doesNotMatch(html,/<script/);
});
