const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function dialogFixture() {
 const {document,window}=require('linkedom').parseHTML('<html><body><button id="previous">Previous</button></body></html>');
 document.activeElement=document.getElementById('previous');
 window.HTMLElement.prototype.focus=function(){document.activeElement=this;};
 const c=vm.createContext({document});
 vm.runInContext(fs.readFileSync('dashboard-client-scripts.js','utf8'),c);
 return {document,api:c.dashboardDialogsBrowser_(),overlay:()=>document.querySelector('[data-dialog-overlay]')};
}
test('framework modal queues confirmations, preserves literal text and returns focus',async()=>{
 const f=dialogFixture(),previous=f.document.activeElement;
 const result=f.api.ask('<b>Discard?</b>');
 assert.equal(f.overlay().querySelector('[data-dialog-modal]').getAttribute('role'),'dialog');
 assert.equal(f.overlay().querySelector('[data-dialog-modal]').getAttribute('aria-modal'),'true');
 assert.equal(f.overlay().querySelector('[data-dialog-body]').textContent,'<b>Discard?</b>');
 const queued=f.api.ask('Duplicate');
 assert.doesNotMatch(f.overlay().textContent,/Duplicate/);
 f.overlay().querySelector('[data-dialog-cancel],[data-dialog-confirm]').click();
 assert.equal(await result,false);await Promise.resolve();
 assert.match(f.overlay().textContent,/Duplicate/);
 f.overlay().querySelector('[data-dialog-cancel],[data-dialog-confirm]').click();assert.equal(await queued,false);
 assert.equal(f.overlay(),null);assert.equal(f.document.activeElement,previous);
 const next=f.api.ask('Submit?');f.overlay().querySelector('[data-dialog-confirm]').click();assert.equal(await next,true);
});
test('framework modal traps focus and Escape cancels',async()=>{
 const f=dialogFixture(),result=f.api.ask('Close drawer?'),overlay=f.overlay();
 const buttons=overlay.querySelectorAll('[data-dialog-cancel],[data-dialog-confirm]');buttons[1].focus();
 const tab=new f.document.defaultView.Event('keydown',{bubbles:true,cancelable:true});
 Object.defineProperty(tab,'key',{value:'Tab'});Object.defineProperty(tab,'shiftKey',{value:false});
 overlay.dispatchEvent(tab);assert.equal(f.document.activeElement,buttons[0]);
 const esc=new f.document.defaultView.Event('keydown',{bubbles:true,cancelable:true});Object.defineProperty(esc,'key',{value:'Escape'});
 overlay.dispatchEvent(esc);assert.equal(await result,false);
});
test('framework prompt validates blank remarks and returns trimmed input',async()=>{
 const f=dialogFixture(),result=f.api.requestText('Reason');
 const input=f.overlay().querySelector('textarea');input.value='   ';
 f.overlay().querySelector('[data-dialog-confirm]').click();
 assert.equal(f.overlay().querySelector('[role="alert"]').textContent,'Please enter a remark.');
 input.value=' Evidence ';f.overlay().querySelector('[data-dialog-confirm]').click();
 assert.equal(await result,'Evidence');
 const cancelled=f.api.requestText('Reason');f.overlay().querySelector('[data-dialog-cancel],[data-dialog-confirm]').click();assert.equal(await cancelled,null);
});
test('framework confirmation works without a remote dialog library',async()=>{
 const f=dialogFixture(),result=f.api.ask('Publish?');
 assert.equal(f.document.querySelector('script[src*="sweetalert"]'),null);
 f.overlay().querySelector('[data-dialog-confirm]').click();assert.equal(await result,true);
});
test('danger confirmation uses framework notice, inerts the page and cancels on scrim click',async()=>{
 const f=dialogFixture(),previous=f.document.getElementById('previous');
 const result=f.api.confirmDialog({title:'Delete item',body:'This action removes the item.',confirmText:'Delete',cancelText:'Keep',tone:'danger'});
 const overlay=f.overlay();
 assert.equal(overlay.querySelector('[data-dialog-header] h2').textContent,'Delete item');
 assert.match(overlay.querySelector('.bg-danger-tint').textContent,/removes the item/);
 assert.equal(overlay.querySelector('[data-dialog-cancel]').textContent,'Keep');
 assert.equal(overlay.querySelector('[data-dialog-confirm]').textContent,'Delete');
 assert.equal(previous.inert,true);
 overlay.click();assert.equal(await result,false);
 assert.notEqual(previous.inert,true);assert.equal(f.document.activeElement,previous);
});
test('notifications wait for an existing confirmation',async()=>{
 const f=dialogFixture(),decision=f.api.ask('Discard?'),notice=f.api.notify('Sync completed','success');
 assert.match(f.overlay().textContent,/Discard/);
 f.overlay().querySelector('[data-dialog-cancel],[data-dialog-confirm]').click();await decision;await Promise.resolve();
 assert.match(f.overlay().textContent,/Sync completed/);
 f.overlay().querySelector('[data-dialog-cancel],[data-dialog-confirm]').click();await notice;
});
test('Coordinator storage setup displays journals, blocks duplicates and retries failures',async()=>{
 const f=fixture(),{document}=require('linkedom').parseHTML('<html><body>'+['reviewConfigurationCard','createAssessmentDefinitionsButton','reviewDefinitionsLink','reviewAssessmentReadiness','reviewConfigurationRecheck','initializeAssessmentStorageButton','reviewConfigurationSummary','reviewConfigurationIssues','reviewConfigurationCheckedAt','reviewConfigLink','reviewRubricsLink','assessmentStorageStatus','assessmentStorageResults'].map(id=>'<div id="'+id+'"></div>').join('')+'</body></html>');
 const original=f.c.document.getElementById;
 f.c.document.getElementById=id=>document.getElementById(id)||original(id);
 f.c.document.createElement=tag=>document.createElement(tag);
 const node=id=>document.getElementById(id),calls=()=>f.requests.filter(r=>r.key==='prepareReviewAssessmentStorage_');
 const readiness=()=>({valid:true,ready:false,state:'setup-required',summary:'Assessment journals need setup',count:3,issues:[],links:{},checkedAt:new Date().toISOString(),storage:[{assessment:'review3',label:'Review 3',journal:'Assessment_review3',state:'MISSING'}]});
 vm.runInContext('DashboardUI.recheckReviewConfiguration()',f.c);f.done('getCoordinatorReviewConfiguration_',readiness());await f.settle();
 assert.match(node('reviewConfigurationSummary').textContent,/need setup/);
 vm.runInContext('DashboardUI.initializeAssessmentStorage()',f.c);vm.runInContext('DashboardUI.initializeAssessmentStorage()',f.c);assert.equal(calls().length,1);
 const journals=[1,2,3].map(n=>({assessment:'review'+n,label:'Review '+n,journal:'Journal_review'+n,created:n===1,initialized:n===2}));
 calls()[0].success({done:true,journals});await f.settle();
 assert.equal(node('assessmentStorageResults').children.length,3);
 assert.match(node('assessmentStorageResults').textContent,/Review 3: Journal_review3 — existing storage retained/);
 assert.match(node('assessmentStorageStatus').textContent,/3 assessment journals ready/);
 f.done('getCoordinatorReviewConfiguration_',readiness());await f.settle();
 vm.runInContext('DashboardUI.initializeAssessmentStorage()',f.c);calls()[1].failure({message:'Temporary failure'});await f.settle();
 assert.match(node('assessmentStorageStatus').textContent,/Retry/);
 f.done('getCoordinatorReviewConfiguration_',readiness());await f.settle();
 vm.runInContext('DashboardUI.initializeAssessmentStorage()',f.c);assert.equal(calls().length,3);
 calls()[2].success({done:true,journals});await f.settle();f.done('getCoordinatorReviewConfiguration_',readiness());await f.settle();
 assert.equal(node('initializeAssessmentStorageButton').disabled,false);
});
test('assessment readiness renders server states and preserves results on failed refresh',async()=>{
 const f=fixture(),{document}=require('linkedom').parseHTML('<html><body>'+['reviewConfigurationCard','createAssessmentDefinitionsButton','reviewDefinitionsLink','reviewAssessmentReadiness','reviewConfigurationRecheck','initializeAssessmentStorageButton','reviewConfigurationSummary','reviewConfigurationIssues','reviewConfigurationCheckedAt','reviewConfigLink','reviewRubricsLink'].map(id=>'<div id="'+id+'"></div>').join('')+'</body></html>');
 const original=f.c.document.getElementById;f.c.document.getElementById=id=>document.getElementById(id)||original(id);f.c.document.createElement=tag=>document.createElement(tag);
 const node=id=>document.getElementById(id),states=['READY','MISSING','EMPTY','ERROR'];
 const report={valid:false,ready:false,state:'invalid',summary:'Server readiness summary',count:4,checkedAt:new Date().toISOString(),links:{definitions:'https://example.test/definitions'},issues:[{sheet:'Future Review',message:'Storage conflict'}],storage:states.map((state,i)=>({assessment:'gate_'+i,label:'Gate '+i,journal:'Assessment_gate_'+i,state,...(state==='ERROR'?{error:'Storage conflict'}:{})}))};
 vm.runInContext('DashboardUI.recheckReviewConfiguration()',f.c);vm.runInContext('DashboardUI.recheckReviewConfiguration()',f.c);assert.equal(f.requests.length,1);f.done('getCoordinatorReviewConfiguration_',report);await f.settle();
 assert.deepEqual(Array.from(node('reviewAssessmentReadiness').children,item=>item.getAttribute('data-state')),states);
 assert.equal(node('reviewConfigurationSummary').textContent,report.summary);assert.equal(node('initializeAssessmentStorageButton').disabled,true);
 assert.match(node('reviewAssessmentReadiness').textContent,/Storage conflict/);assert.equal(node('reviewDefinitionsLink').href,report.links.definitions);
 const before=node('reviewAssessmentReadiness').innerHTML;vm.runInContext('DashboardUI.recheckReviewConfiguration()',f.c);const failed=f.requests.at(-1);failed.done=true;failed.failure({message:'Offline'});await f.settle();
 assert.equal(node('reviewAssessmentReadiness').innerHTML,before);assert.equal(node('reviewConfigurationSummary').textContent,report.summary);
 assert.match(node('reviewConfigurationIssues').textContent,/Offline/);assert.equal(node('reviewConfigurationCard').getAttribute('aria-busy'),'false');assert.equal(node('reviewConfigurationRecheck').disabled,false);
 vm.runInContext('DashboardUI.recheckReviewConfiguration()',f.c);f.done('getCoordinatorReviewConfiguration_',{...report,valid:true,ready:true,state:'ready',summary:'All journals ready',issues:[],storage:report.storage.map(({error,...entry})=>({...entry,state:'READY'}))});await f.settle();
 assert.equal(node('initializeAssessmentStorageButton').disabled,false);assert.equal(node('reviewConfigurationCard').getAttribute('data-state'),'ready');assert.equal(node('reviewConfigurationIssues').hidden,true);
});

test('Reviewer dashboard opens the shared Review UI directly for arbitrary assessment IDs',async()=>{
 const f=fixture(),calls=[];
 f.c.ReviewEvaluations={open:(...args)=>calls.push(args)};
 const button={};vm.runInContext('DashboardUI',f.c).openReviewerMarks('T1','design_gate',button);
 assert.deepEqual(calls,[['T1','design_gate',button]]);assert.equal(f.requests.length,0);
});
function fixture(system=false,shipped=false) {
 const loadingNode=()=>({attrs:{},children:[],inert:false,addEventListener(){},querySelector(){return null;},setAttribute(k,v){this.attrs[k]=v;},removeAttribute(k){delete this.attrs[k];},classList:{add(){},remove(){},toggle(){}},appendChild(node){this.children.push(node);node.remove=()=>{this.children=this.children.filter(child=>child!==node);};}});
 const requests=[], early=[], timers=new Map(), listeners={}; let id=0;
 const panels=['guide','reviewer','coord'].map(key=>({...loadingNode(),innerHTML:'',getAttribute:()=>key}));
 const systemContent={...loadingNode(),innerHTML:'',querySelectorAll:()=>[]};
 const systemMessage={textContent:''}, systemRefresh={disabled:false};
 const document={body:loadingNode(),createElement:loadingNode,hidden:false,readyState:'loading',addEventListener(name,fn){(listeners[name] ||= []).push(fn);},getElementById:id=>system?({systemStatusContent:systemContent,systemStatusMessage:systemMessage,systemStatusRefresh:systemRefresh}[id]||null):null,
 querySelector:selector=>panels.find(p=>selector.includes('"'+p.getAttribute()+'"'))||null,
 querySelectorAll:selector=>selector==='[data-role-content]'?panels:[]};
 function runner(success,failure) { return new Proxy({}, {get:(_,key)=>key==='withSuccessHandler'?fn=>runner(fn,failure):key==='withFailureHandler'?fn=>runner(success,fn):(...args)=>{
  // Migrated reviewer role: log it like the role-content request, answering with an envelope.
  if(key==='API_coordinator_getSystemStatus')return requests.push({key:'loadCoordinatorSystemStatus',args,success:html=>success(JSON.stringify({ok:true,data:{html}})),failure});
  const legacy={API_coordinator_getCommitteeConfiguration:'getCoordinatorCommitteeConfiguration_',API_coordinator_getReviewConfiguration:'getCoordinatorReviewConfiguration_',API_coordinator_createDefinitions:'createAssessmentDefinitions_',API_coordinator_prepareStorage:'prepareReviewAssessmentStorage_',API_coordinator_syncGithub:'syncCoordinatorGithubAccess_',API_coordinator_resendInvitations:'resendExpiredStudentInvitations_',API_shared_getTimeline:'loadSharedProjectTimeline_',API_shared_getRubrics:'loadSharedRubrics_',API_coordinator_getTeamDrawer:'loadCoordinatorDrawerSection_'}[key];
  if(legacy)return requests.push({key:legacy,args,success:value=>success(JSON.stringify({ok:true,data:value})),failure});
  // The Guide role starts these two reads together with its dashboard read; they never block the role request.
  if(key==='API_guide_getWeekly'||key==='API_guide_getGithub'){early.push(key);return Promise.resolve().then(()=>success(JSON.stringify({ok:true,data:null})));}
  const migrated={API_reviewer_getDashboard:'reviewer',API_guide_getDashboard:'guide',API_student_getCore:'student',API_coordinator_getOverview:'coord'}[key];
  if(migrated)return requests.push({key:'loadDashboardRoleContent',args:[migrated],success:html=>success(JSON.stringify({ok:true,data:{html}})),failure});
  return requests.push({key,args,success,failure});}}); }
 const c=vm.createContext({GuideEvaluation:{admin(){},student(){}},document,window:{},performance:{now:()=>Date.now()},console,Date,Promise,setTimeout:(fn,delay)=>{timers.set(++id,Object.assign(()=>fn(),{delay}));return id;},clearTimeout:key=>timers.delete(key),google:{script:{run:runner()}},getSkeletonMarkup_:()=>''});
 for(const file of ['assessment-history-view.js','lucide-icons.js','icon-renderer.js']) vm.runInContext(fs.readFileSync(file,'utf8'),c);
 vm.runInContext(fs.readFileSync('common-styles.js','utf8'),c); vm.runInContext(fs.readFileSync('busy-state.js','utf8'),c);
 vm.runInContext(fs.readFileSync('dashboard-client-scripts.js','utf8'),c);
 for(const file of ['data-bridge-client.js','reviewer-view.js','guide-view.js','student-view.js','coordinator-view.js','team-drawer-view.js','shared-timeline-view.js','shared-rubrics-view.js','system-status-actions.js','student-github-actions.js','system-status-view.js','student-weekly-view.js','student-results-view.js','coordinator-view.js','team-drawer-view.js','shared-timeline-view.js','shared-rubrics-view.js','system-status-actions.js','student-github-actions.js'])vm.runInContext(fs.readFileSync(file,'utf8'),c);vm.runInContext(c.getMigratedViewsClientScript_(),c);vm.runInContext('ReviewerView.render=GuideView.render=StudentView.render=CoordinatorView.render=SystemStatusView.render=(host,dto)=>{host.innerHTML=dto.html;}',c);vm.runInContext(c.getDashboardClientScript_(),c);vm.runInContext(c.getDashboardStartScript_(),c);
 // Preloading ships disabled; the queue tests opt in so the machinery stays covered.
 if(!shipped)c.window.DashboardPerformance.preloading=true;
 return {c,requests,early,systemContent,systemMessage,fire:(name,event)=>listeners[name].forEach(fn=>fn(event)),click:key=>vm.runInContext('DashboardUI',c).showRoleTab(key),tick:()=>{ /* bridge read timeouts (30s+) are not part of idle/preload timing */ const entries=[...timers.entries()].filter(([,fn])=>!(fn.delay>=10000));entries.forEach(([key])=>timers.delete(key));entries.forEach(([,fn])=>fn());},done:(key,html='ok')=>{const req=requests.find(r=>r.key===key&&!r.done);assert(req,key);req.done=true;req.success(html);},settle:()=>new Promise(r=>setImmediate(r))};
}

test('common theme applies to all tabs immediately, cached content and late responses cannot change it',async()=>{
 const f=fixture(true), doc=f.c.document;
 const student={...doc.body,innerHTML:'',getAttribute:()=> 'student'};
 const query=doc.querySelector;
 doc.querySelector=selector=>selector.includes('data-role-content="student"')?student:query(selector);
 const theme=()=>doc.body.attrs['data-dashboard-theme'];
 f.click('student');assert.equal(theme(),undefined);
 f.click('guide');assert.equal(theme(),undefined);
 f.done('loadDashboardRoleContent','student content');await f.settle();assert.equal(theme(),undefined);
 f.done('loadDashboardRoleContent','guide content');await f.settle();
 const roleReads=()=>f.requests.filter(r=>r.key==='loadDashboardRoleContent').length;
 const count=roleReads();
 f.click('student');assert.equal(theme(),undefined);
 f.click('guide');assert.equal(theme(),undefined);assert.equal(roleReads(),count);
 f.click('student');f.click('rubrics');assert.equal(theme(),undefined);
 f.click('rubrics');assert.equal(theme(),undefined);
 f.click('guide');f.click('rubrics');assert.equal(theme(),undefined);
 f.click('student');f.click('system-status');assert.equal(theme(),undefined);
 f.click('student');assert.equal(theme(),undefined);
});

test('project timeline appears only in Timeline and Rubrics across tab switches',async()=>{
 const f=fixture(),timeline={hidden:false,setAttribute(){},removeAttribute(){},getAttribute:()=>null,children:[]},original=f.c.document.getElementById;
 f.c.document.getElementById=id=>id==='sharedProjectTimeline'?timeline:original(id);
 for(const role of ['student','guide','reviewer','coord']) {
  f.click(role);assert.equal(timeline.hidden,true);
  for(const utility of ['rubrics','system-status']) {
   f.click(utility);assert.equal(timeline.hidden,utility !== 'rubrics');
   f.click(role);assert.equal(timeline.hidden,true);
  }
 }
});

test('student rubric tab reuses shared content and switching back restores My Team',async()=>{
 const f=fixture(),{document}=require('linkedom').parseHTML('<html><body><button data-role-tab="student">My Team</button><button data-role-tab="rubrics">Rubrics &amp; Guidelines</button><section data-role-panel="student"></section><section id="sharedRubrics"><button id="sharedRubricsToggle"></button><div id="sharedRubricsContent"></div></section></body></html>');
 const original=f.c.document.getElementById;
 f.c.document.getElementById=id=>document.getElementById(id)||original(id);
 f.c.document.querySelector=selector=>document.querySelector(selector);
 f.c.document.querySelectorAll=selector=>document.querySelectorAll(selector);
 f.click('student');assert.equal(document.getElementById('sharedRubrics').hidden,true);
 f.click('rubrics');assert.equal(document.getElementById('sharedRubrics').hidden,false);
 assert.equal(document.querySelector('[data-role-panel="student"]').classList.contains('active'),false);
 assert.equal(document.querySelector('[data-role-tab="rubrics"]').getAttribute('aria-current'),'page');
 assert.equal(f.requests.filter(r=>r.key==='loadDashboardRoleContent').length,0);
 f.click('student');assert.equal(document.getElementById('sharedRubrics').hidden,true);
 assert(document.querySelector('[data-role-panel="student"]').classList.contains('active'));
});

test('shell selects the common theme before scripts or fonts load',async()=>{
 const c=vm.createContext({PropertiesService:{getScriptProperties:()=>({getProperty:()=>''})},HtmlService:{createHtmlOutputFromFile:name=>({getContent:()=>fs.readFileSync(name+'.html','utf8')})}});
 for(const file of ['common-styles.js','busy-state.js','common-helpers.js','common-constants.js','guide-dashboard.js','coordinator-dashboard.js','reviewer-dashboard.js','lucide-icons.js','icon-renderer.js','review-evaluation-client.js','dashboard-router.js']) vm.runInContext(fs.readFileSync(file,'utf8'),c);
 for(const name of ['getInternalAssessmentPublishingClientScript_','getMigratedViewsClientScript_','getDashboardClientScript_','getGuideEvaluationClientScript_','getGuideWeeklyClientScript_','getReviewEvaluationClientScript_','getDashboardStartScript_']) c[name]=()=>'';
 for(const key of ['student','guide','reviewer','coord']) {
  const html=c.buildDashboardShell_('preview@example.test',[{key,label:key,contentId:key+'Content'}]);
  assert.match(html,/<body class="[^"]*">/);
  const {document}=require('linkedom').parseHTML(html);
  assert.equal(document.querySelectorAll('h1').length,1);
  assert.equal(document.querySelector('h1').textContent,'Dashboard');
  assert.equal(document.querySelector('#sharedRubricsHeading').tagName,'H2');
  assert.equal(document.querySelector('#sharedProjectTimeline h2').textContent,'Project timeline');
  assert(html.indexOf('fonts.googleapis.com')<html.indexOf('<style>'),'fonts are linked before the compiled stylesheet');
  assert.equal(html.split('tailwindcss v').length,2,'the Tailwind build is included exactly once');
  assert.doesNotMatch(html,/app-styles|--fs-h1|--canvas:/);
  assert.match(html,/Source\+Sans\+3/);
  assert.doesNotMatch(html,/Source\+Serif\+4|Space\+Grotesk|JetBrains\+Mono|family=Inter/);
 }
 const html=c.buildDashboardShell_('preview@example.test',[{key:'student',label:'My Team',contentId:'studentContent'},{key:'guide',label:'Guide',contentId:'guideContent'}]);
 assert.match(html,/<body class="[^"]*">/);
 assert.match(html,/data-role-tab="rubrics"/);
 assert.match(html,/id="sharedRubrics" hidden/);
 assert.match(html,/data-role-panel="student"/);
 assert.match(html,/id="sharedProjectTimeline"/);
});

test('shared heading scale keeps content larger than cards and subsections',async()=>{
 const sheet=fs.readFileSync('scripts/tailwind-input.css','utf8');
 const size=level=>{
  const token=sheet.match(new RegExp('--text-'+level+':\\s*(\\d+)px'));
  assert(token,level);
  return Number(token[1]);
 };
 assert(size('h1')>size('h2'));
 assert(size('h2')>size('h3'));
});

test('text palette pairs meet normal-text contrast',async()=>{
 const palette=fs.readFileSync('scripts/tailwind-input.css','utf8');
 const token=name=>{
  const match=palette.match(new RegExp('--color-'+name+':\\s*(#[0-9a-f]{6})','i'));
  assert(match,name);
  return match[1];
 };
 const luminance=hex=>{
  const rgb=hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  return rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
 };
 for(const [foreground,background] of [['ink','canvas'],['ink','paper'],['muted','canvas'],['muted','paper'],['primary','tint'],['primary','paper'],['paper','primary'],['paper','primary-hover'],['success','success-tint'],['warning','warning-tint'],['danger','danger-tint'],['info','info-tint']]) {
  const values=[luminance(token(foreground)),luminance(token(background))].sort((a,b)=>a-b);
  assert((values[1]+.05)/(values[0]+.05)>=4.5,foreground+' on '+background);
 }
});

function rubricClientFixture() {
 const f=fixture(), nodes={}, document=f.c.document;
 for(const id of ['sharedRubrics','sharedRubricsContent','sharedRubricsToggle','rubricDrawer','rubricDrawerBackdrop','rubricDrawerTitle','rubricDrawerContent','rubricDrawerClose','teamDrawer','teamDrawerBackdrop','teamDrawerContent','teamDrawerTitle','teamDrawerClose']) {
  const classes=new Set();nodes[id]={innerHTML:'',attrs:{},dataset:{},isConnected:true,setAttribute(k,v){this.attrs[k]=v;},
   classList:{add:k=>classes.add(k),remove:k=>classes.delete(k),contains:k=>classes.has(k)},
   querySelectorAll:()=>[],querySelector:()=>null,addEventListener(){},focus(){document.activeElement=this;}};
 }
 nodes.sharedRubricsContent.addEventListener=function(name,fn){this.listeners=this.listeners||{};this.listeners[name]=fn;};
 nodes.rubricDrawer.querySelectorAll=()=>[nodes.rubricDrawerClose];
 nodes.rubricDrawer.contains=el=>el===nodes.rubricDrawerClose;
 nodes.teamDrawer.querySelectorAll=()=>[nodes.teamDrawerClose];
 nodes.teamDrawer.contains=el=>el===nodes.teamDrawerClose;
 document.body.classList={add(){},remove(){}};
 const lookup=document.getElementById;document.getElementById=id=>nodes[id]||lookup(id);
 const ui=vm.runInContext('DashboardUI',f.c);
 const data={assessments:[{key:'review1',label:'Review 1',weight:12.5,available:true,criterionCount:1,totalMarks:100,criteria:[{pi:'PI1',co:'CO1',type:'Team',maxMarks:100,name:'<unsafe>',descriptors:['<level>','','','','','Excellent']}]},
  {key:'see',label:'SEE',weight:40,available:false,status:'Rubric not configured'}]};
 // The view listens once on the content host; Retry is a delegated click on its data hook.
 const retry={click:()=>nodes.sharedRubricsContent.listeners.click({target:{closest:selector=>selector==='[data-rubric-retry]'?{}:null}})};
 return {...f,nodes,ui,data,retry};
}

test('timeline and rubrics load only when their tab opens, deduplicate and survive role switches',async()=>{
 const f=rubricClientFixture();const query=f.c.document.querySelector;
 f.c.document.querySelector=selector=>selector==='[data-role-panel]:not([hidden])'?{getAttribute:()=> 'guide'}:query(selector);
 f.c.initializeFirstRoleTab_();
 assert(f.requests.some(r=>r.key==='loadDashboardRoleContent'));
 for(const key of ['loadSharedProjectTimeline_','loadSharedRubrics_']) assert(!f.requests.some(r=>r.key===key),key+' must wait for its tab');
 f.click('rubrics');
 for(const key of ['loadSharedProjectTimeline_','loadSharedRubrics_']) assert.equal(f.requests.filter(r=>r.key===key).length,1,key);
 const promise=f.ui.loadSharedRubrics_();assert.equal(f.ui.loadSharedRubrics_(),promise);
 f.done('loadSharedRubrics_',f.data);await promise;
 f.click('reviewer');await f.ui.loadSharedRubrics_();
 assert.equal(f.requests.filter(r=>r.key==='loadSharedRubrics_').length,1);
 assert.match(f.nodes.sharedRubricsContent.innerHTML,/12.5%<span class="rubric-mobile-hidden"> weight<\/span>/);
 assert.match(f.nodes.sharedRubricsContent.innerHTML,/<span class="rubric-mobile-hidden">View rubric<\/span>/);
 const mobileRows=[...f.nodes.sharedRubricsContent.innerHTML.matchAll(/<div class="rubric-mobile-row[^"]*">([\s\S]*?)<\/button><\/div>/g)];
 assert.equal(mobileRows.length,2);
 assert.match(mobileRows[0][1],/<strong[^>]*>Review 1<\/strong><span[^>]*aria-label="[^"]*% weight">/);
 assert.match(mobileRows[0][1],/<button type="button" class="[^"]*" data-rubric-key="review1"/);
 assert.equal((mobileRows[0][1].match(/data-rubric-key=/g)||[]).length,1,'only the action button opens the mobile rubric');
 assert.match(mobileRows[1][1],/Rubric not configured/);
 assert.match(mobileRows[1][1],/ disabled>View rubric/);
 assert.match(f.nodes.sharedRubricsContent.innerHTML,/disabled/);
});

test('rubrics appear only in their dedicated tab for every role and after async loading',async()=>{
 const f=rubricClientFixture(),section=f.nodes.sharedRubrics,content=f.nodes.sharedRubricsContent;
 f.click('guide');assert.equal(section.hidden,true);
 const pending=f.ui.loadSharedRubrics_();
 f.done('loadSharedRubrics_',f.data);await pending;
 assert.equal(section.hidden,true);assert.match(content.innerHTML,/data-rubric-key="review1"/);
 for(const role of ['student','guide','reviewer','coord','system-status']) {
  f.click('rubrics');assert.equal(section.hidden,false);
  f.click(role);assert.equal(section.hidden,true);
 }
 assert.equal(f.requests.filter(r=>r.key==='loadSharedRubrics_').length,1);
});

test('rubrics remain hidden on role dashboards through failure and retry',async()=>{
 const f=rubricClientFixture();f.click('reviewer');
 const pending=f.ui.loadSharedRubrics_();
 const request=f.requests.find(r=>r.key==='loadSharedRubrics_');request.done=true;request.failure(new Error('offline'));
 await assert.rejects(pending,/offline/);
 assert.equal(f.nodes.sharedRubrics.hidden,true);
 assert.match(f.nodes.sharedRubricsContent.innerHTML,/Retry/);
 f.retry.click();const retried=f.ui.loadSharedRubrics_();
 f.done('loadSharedRubrics_',f.data);await retried;
 assert.equal(f.nodes.sharedRubrics.hidden,true);
 assert.equal(f.nodes.sharedRubrics.attrs['aria-busy'],'false');
});

test('shared rubric shell follows timeline and reuses responsive drawer styles',async()=>{
 const router=fs.readFileSync('dashboard-router.js','utf8'), coordinator=fs.readFileSync('coordinator-dashboard.js','utf8');
 assert(router.indexOf('id="sharedRubrics"')>router.indexOf('id="sharedProjectTimeline"'));
 assert(router.indexOf('id="sharedRubrics"')<router.indexOf('${rolePanels}'));
 assert.match(router,/id="rubricDrawer" class="[^"]*" data-tooltip-boundary role="dialog"/);
 assert.match(router,/id="rubricDrawerBackdrop" class="team-drawer-backdrop [^"]*" hidden/);
 assert(!coordinator.includes('${buildRubricsStatusCard_()}'));
});

test('rubric request failures release loading state and retry successfully',async()=>{
 const f=rubricClientFixture();const promise=f.ui.loadSharedRubrics_();
 f.requests[0].done=true;f.requests[0].failure(new Error('offline'));
 await assert.rejects(promise,/offline/);assert.equal(f.nodes.sharedRubrics.attrs['aria-busy'],'false');
 f.retry.click();const retried=f.ui.loadSharedRubrics_();f.done('loadSharedRubrics_',f.data);await retried;
 assert.equal(f.requests.filter(r=>r.key==='loadSharedRubrics_').length,2);
});

test('rubric drawer escapes text, traps focus, closes on Escape and excludes team drawer',async()=>{
 const f=rubricClientFixture();const promise=f.ui.loadSharedRubrics_();f.done('loadSharedRubrics_',f.data);await promise;
 const trigger={isConnected:true,focus(){f.c.document.activeElement=this;}};
 f.nodes.teamDrawer.classList.add('open');f.nodes.teamDrawer.dataset.open='true';f.ui.openRubricDrawer('review1',trigger);
 assert(!f.nodes.teamDrawer.classList.contains('open'));assert(f.nodes.rubricDrawer.classList.contains('open'));
 assert.match(f.nodes.rubricDrawerContent.innerHTML,/&lt;unsafe&gt;/);assert.match(f.nodes.rubricDrawerContent.innerHTML,/Level 5/);
 assert.equal(f.c.document.activeElement,f.nodes.rubricDrawerClose);
 let prevented=0;for(const shiftKey of [true,false])f.fire('keydown',{key:'Tab',shiftKey,preventDefault(){prevented++;}});
 assert.equal(prevented,2);
 f.fire('keydown',{key:'Escape',preventDefault(){}});assert.equal(f.c.document.activeElement,trigger);assert.equal(f.nodes.rubricDrawer.inert,true);
 f.ui.openRubricDrawer('see',trigger);assert(!f.nodes.rubricDrawer.classList.contains('open'));
 f.ui.openRubricDrawer('review1',trigger);f.ui.focusCoordinatorTeam('1');assert(!f.nodes.rubricDrawer.classList.contains('open'));
 assert.equal(f.requests.filter(r=>r.key==='loadSharedRubrics_').length,1);
});
test('coordinator drawer shares focus trap, Escape and trigger focus return',async()=>{
 const f=rubricClientFixture(),trigger={isConnected:true,focus(){f.c.document.activeElement=this;}};
 f.c.document.activeElement=trigger;
 f.ui.focusCoordinatorTeam('1');
 assert(f.nodes.teamDrawer.classList.contains('open'));
 assert.equal(f.nodes.teamDrawer.attrs['aria-hidden'],'false');
 assert.equal(f.c.document.activeElement,f.nodes.teamDrawerClose);
 f.fire('keydown',{key:'Escape',preventDefault(){}});
 assert.equal(f.nodes.teamDrawer.inert,true);
 assert.equal(f.c.document.activeElement,trigger);
 const source=fs.readFileSync('coordinator-view.js','utf8');
 assert.match(source,/id="teamDrawer"[\s\S]*?role="dialog" aria-modal="true" aria-labelledby="teamDrawerTitle"/);
});
test('all roles preload in order and are reused',async()=>{
 const f=fixture();f.click('guide');vm.runInContext('DashboardUI.initializeLoading()',f.c);
 assert.deepEqual(f.requests.map(r=>r.key),['loadDashboardRoleContent']);
 f.tick();assert.equal(f.requests.length,1);
 f.done('loadDashboardRoleContent');await f.settle();f.tick();assert.equal(f.requests.at(-1).args[0],'reviewer');
 f.done('loadDashboardRoleContent');await f.settle();f.tick();
 assert.equal(f.requests.at(-1).args[0],'coord');
 f.done('loadDashboardRoleContent');await f.settle();f.tick();
 assert.equal(f.requests.filter(r=>r.key==='loadDashboardRoleContent').length,3);
 f.click('reviewer');assert.equal(f.requests.filter(r=>r.key==='loadDashboardRoleContent').length,3);
});
test('clicking a pending preload does not duplicate the request; hidden page skips preload',async()=>{
 const f=fixture();f.click('guide');f.c.document.hidden=true;f.done('loadDashboardRoleContent');await f.settle();
 f.tick();
 assert.equal(f.requests.filter(r=>r.key==='loadDashboardRoleContent').length,1);
 f.c.document.hidden=false;f.click('guide');f.tick();f.click('reviewer');
 assert.equal(f.requests.filter(r=>r.key==='loadDashboardRoleContent').length,2);
});
test('diagnostics record errors and preloading can be disabled for baseline measurements',async()=>{
 const f=fixture();f.c.window.DashboardPerformance.setPreloading(false);f.click('guide');
 vm.runInContext('DashboardUI.initializeLoading()',f.c);
 f.requests.find(r=>r.key==='loadDashboardRoleContent').failure(new Error('offline'));await f.settle();f.tick();
 assert.equal(f.requests.filter(r=>r.key==='loadDashboardRoleContent').length,1);
 assert(f.c.window.DashboardPerformance.snapshot().some(e=>e.event==='request'&&!e.ok));
});
test('Coordinator load starts overview, health, guide progress and activity together; their failures do not stall preloading',async()=>{
 const f=fixture();
 f.click('guide');f.done('loadDashboardRoleContent');await f.settle();f.tick();
 assert.equal(f.requests.at(-1).args[0],'reviewer');f.done('loadDashboardRoleContent');await f.settle();f.tick();
 assert.equal(f.requests.at(-1).args[0],'coord');
 const coordinatorReads=f.requests.filter(r=>/^API_coordinator_/.test(r.key)||(r.key==='loadDashboardRoleContent'&&r.args[0]==='coord'));
 assert.equal(coordinatorReads.filter(r=>r.key==='API_coordinator_getHealth').length,1);
 assert.equal(coordinatorReads.filter(r=>r.key==='API_coordinator_getGuideProgress').length,1);
 assert.equal(coordinatorReads.filter(r=>r.key==='API_coordinator_getActivity').length,1);
 f.click('coord');
 assert.equal(f.requests.filter(r=>r.key==='API_coordinator_getHealth').length,1,'selecting the loading role does not repeat reads');
});

test('failed roles advance once; clicking ahead keeps earlier queued roles',async()=>{
 const f=fixture(),lastRole=()=>f.requests.filter(r=>r.key==='loadDashboardRoleContent').at(-1).args[0];f.click('guide');f.click('coord');
 f.requests[0].failure(new Error('offline'));f.requests[0].done=true;await f.settle();
 f.tick();assert.equal(f.requests.filter(r=>r.key==='loadDashboardRoleContent').length,2);
 f.done('loadDashboardRoleContent');await f.settle();
 // The coordinator's own section and activity reads share the role lane; settle them before the next preload.
 f.requests.filter(r=>/^API_coordinator_get(Health|GuideProgress|ReviewProgress|Activity)$/.test(r.key)).forEach(r=>{r.done=true;r.failure(new Error('offline'));});await f.settle();f.tick();
 assert.equal(lastRole(),'reviewer');
 f.done('loadDashboardRoleContent');await f.settle();f.tick();f.tick();
 assert.equal(f.requests.filter(r=>r.key==='loadDashboardRoleContent').length,3);
 f.click('guide');assert.equal(lastRole(),'guide');
});

test('Student background screen load finishes before the next role and is not repeated on click',async()=>{
 const f=fixture(),doc=f.c.document,query=doc.querySelector,queryAll=doc.querySelectorAll;
 const student={...doc.body,innerHTML:'',getAttribute:()=> 'student'};
 doc.querySelector=selector=>selector.includes('data-role-content="student"')?student:query(selector);
 doc.querySelectorAll=selector=>selector==='[data-role-content]'?[queryAll(selector)[0],student,queryAll(selector)[1]]:
  selector==='[data-review-result]'?[{dataset:{reviewResult:'review1'}}]:queryAll(selector);
 const ui=vm.runInContext('DashboardUI',f.c);
 vm.runInContext("StudentView.activate=()=>{DashboardUI.run().withSuccessHandler(()=>{}).loadPublishedGuideEvaluation_();DashboardUI.run().withSuccessHandler(()=>{}).loadPublishedReviewEvaluation_('review1');}",f.c);
 f.click('guide');f.done('loadDashboardRoleContent');await f.settle();f.tick();
 f.done('loadDashboardRoleContent');await f.settle();f.tick();
 assert.equal(f.requests.filter(r=>r.key==='loadDashboardRoleContent').length,2);
 assert.equal(doc.body.attrs['data-dashboard-theme'],undefined);
 f.done('loadPublishedGuideEvaluation_');f.tick();
 assert.equal(f.requests.filter(r=>r.key==='loadDashboardRoleContent').length,2);
 f.done('loadPublishedReviewEvaluation_');f.tick();assert.equal(f.requests.at(-1).args[0],'reviewer');
 f.click('student');assert.equal(f.requests.filter(r=>r.key==='loadPublishedGuideEvaluation_').length,1);
 assert.equal(f.requests.filter(r=>r.key==='loadPublishedReviewEvaluation_').length,1);
});

test('utilities and role queue resume after visibility and preload setting changes',async()=>{
 const f=fixture(true);f.click('guide');vm.runInContext('DashboardUI.initializeLoading()',f.c);
 f.c.document.hidden=true;f.done('loadDashboardRoleContent');await f.settle();f.tick();
 assert.equal(f.requests.length,2);
 f.c.window.DashboardPerformance.setPreloading(false);f.c.document.hidden=false;f.fire('visibilitychange');f.tick();
 assert.equal(f.requests.length,2);
 f.c.window.DashboardPerformance.setPreloading(true);
 assert.equal(f.requests.at(-1).key,'loadCoordinatorSystemStatus');
 f.tick();assert.equal(f.requests.at(-1).args[0],'reviewer');
});

test('System Status follow-up reads do not block roles or reset their idle timer',async()=>{
 const f=fixture(true);const ui=vm.runInContext('DashboardUI',f.c);
 f.systemContent.querySelectorAll=selector=>selector==='[data-publishing]'?[{dataset:{publishing:'review1'}}]:[];
 f.c.InternalAssessmentPublishing={refresh:()=>ui.run().withSuccessHandler(()=>{
  ui.run().withSuccessHandler(()=>{}).utilityFollowup();
 }).publishingRead()};
 f.click('guide');ui.initializeLoading();
 f.done('loadCoordinatorSystemStatus');f.done('loadDashboardRoleContent');await f.settle();
 f.done('publishingRead');f.tick();assert.equal(f.requests.at(-1).args[0],'reviewer');
 f.done('loadDashboardRoleContent');await f.settle();f.tick();assert.equal(f.requests.at(-1).args[0],'coord');
});
test('failed role can be retried by selecting it again',async()=>{
 const f=fixture();f.click('guide');f.requests[0].failure(new Error('offline'));await f.settle();f.click('guide');
 assert.equal(f.requests.filter(r=>r.key==='loadDashboardRoleContent').length,2);
});

test('hidden preloaded panels use full skeletons while visible short controls stay inline',async()=>{
 const f=fixture(),{document}=require('linkedom').parseHTML('<html><body><section><button>Existing content</button></section></body></html>');
 f.c.document.createElement=tag=>document.createElement(tag);
 const host=document.querySelector('section'),button=host.firstElementChild;
 let height=0;Object.defineProperty(host,'clientHeight',{get:()=>height});
 const ui=vm.runInContext('DashboardUI',f.c);
 for(const [initialHeight,compact,variant] of [[0,false,'panel'],[60,false,'inline'],[180,false,'panel'],[60,true,'panel']]) {
  height=initialHeight;
  const finish=ui.beginContentLoading(host,'Loading tab',{compact});
  const overlay=host.querySelector('[data-loading-overlay]');
  assert(overlay.querySelector('.app-skeleton--'+variant));
  assert.equal(overlay.querySelectorAll('.sr-only').length,1);
  assert.equal(overlay.querySelector('.sr-only').textContent,'Loading');
  assert.equal(overlay.querySelector('.app-skeleton').getAttribute('aria-busy'),'true');
  assert.equal(overlay.querySelectorAll('[data-skeleton]').length,1);assert.match(overlay.querySelector('[data-skeleton]').className,/animate-\[spin_/);
  assert.equal(button.inert,true);
  
  finish();finish();assert.equal(host.children.length,1);assert.equal(host.firstElementChild,button);
  assert.equal(button.inert,undefined);assert.equal(host.getAttribute('aria-busy'),'false');
 }
});

test('compact refresh uses the initial skeleton and restores the original content',async()=>{
 const f=fixture(),{document}=require('linkedom').parseHTML('<html><body><section><button>Existing team</button></section></body></html>');
 f.c.document.createElement=tag=>document.createElement(tag);
 const host=document.querySelector('section'),button=host.firstElementChild;
 Object.defineProperty(host,'clientHeight',{value:716});
 const finish=vm.runInContext('DashboardUI',f.c).beginContentLoading(host,'Refreshing assigned teams',{compact:true});
 assert.equal(host.querySelectorAll('[data-skeleton]').length,1);
 assert(host.hasAttribute('data-loading-compact'));
 assert.equal(host.firstElementChild,button);assert.equal(button.inert,true);
 finish();finish();
 assert.equal(host.children.length,1);assert.equal(host.firstElementChild,button);
 assert.equal(host.getAttribute('aria-busy'),'false');
 assert(!host.hasAttribute('data-loading-compact'));
});

test('GitHub status refresh reloads only the student Project cards and leaves other roles on the full reload',async()=>{
 const f=fixture(),ui=vm.runInContext('DashboardUI',f.c),calls=[];
 vm.runInContext('StudentView.reloadProject=(ok,fail)=>{globalThis.__reloads=(globalThis.__reloads||[]);globalThis.__reloads.push([ok,fail]);}',f.c);
 ui.refreshGithubStatus();
 const reloads=vm.runInContext('globalThis.__reloads',f.c);
 assert.equal(reloads.length,1);assert.equal(typeof reloads[0][0],'function');assert.equal(typeof reloads[0][1],'function');
 assert.equal(f.requests.filter(r=>r.key==='loadDashboardRoleContent').length,0);
 ui.reloadRole('guide',()=>{},()=>{});
 assert.equal(f.requests.filter(r=>r.key==='loadDashboardRoleContent').length,1);
});

test('shared loading preserves live children and restores interaction on repeated cleanup',async()=>{
 const f=fixture(true), host=f.systemContent;
 const active={inert:false}, locked={inert:true};host.children.push(active,locked);
 host.innerHTML='existing results';
 const finish=vm.runInContext('DashboardUI',f.c).beginContentLoading(host,'Refreshing results');
 assert.equal(host.innerHTML,'existing results');
 assert.equal(host.children[0],active);
 assert.equal(active.inert,true);assert.equal(locked.inert,true);
 assert.equal(host.attrs['aria-busy'],'true');assert.equal(host.children.length,3);
 finish();finish();
 assert.equal(active.inert,false);assert.equal(locked.inert,true);
 assert.equal(host.attrs['aria-busy'],'false');assert.equal(host.children.length,2);
});

test('System Status starts in the utility lane while the role is still pending',async()=>{
 const f=fixture(true);f.click('guide');vm.runInContext('DashboardUI.initializeLoading()',f.c);f.tick();
 assert.equal(f.requests.filter(r=>r.key==='loadCoordinatorSystemStatus').length,1);assert.equal(f.requests.filter(r=>r.key==='loadDashboardRoleContent').length,1);
 f.done('loadDashboardRoleContent');await f.settle();f.tick();assert.equal(f.requests.at(-1).args[0],'reviewer');
 f.click('system-status');assert.equal(f.requests.filter(r=>r.key==='loadCoordinatorSystemStatus').length,1);
 f.done('loadCoordinatorSystemStatus','system cards');await f.settle();f.click('system-status');
 assert.equal(f.requests.filter(r=>r.key==='loadCoordinatorSystemStatus').length,1);
 assert.equal(f.systemContent.innerHTML,'system cards');
});
test('System Status click retries failures; failed refresh preserves cards',async()=>{
 const f=fixture(true);f.click('system-status');f.requests[0].failure(new Error('offline'));f.requests[0].done=true;await f.settle();
 f.click('system-status');f.done('loadCoordinatorSystemStatus','cards');await f.settle();
 vm.runInContext('DashboardUI.refreshSystemStatus()',f.c);
 f.requests.at(-1).failure(new Error('refresh failed'));await f.settle();
 assert.equal(f.systemContent.innerHTML,'cards');assert.match(f.systemMessage.textContent,/refresh failed/);
});


test('non-student dashboard refresh replaces content once and preserves content on failure',async()=>{
 const f=fixture();f.c.window.DashboardPerformance.setPreloading(false);
 f.click('reviewer');f.done('loadDashboardRoleContent','original reviewer');await f.settle();
 const panel=f.c.document.querySelector('[data-role-content="reviewer"]');
 vm.runInContext("DashboardUI.refreshRoleDashboard('reviewer')",f.c);
 vm.runInContext("DashboardUI.refreshRoleDashboard('reviewer')",f.c);
 assert.equal(f.requests.filter(r=>r.key==='loadDashboardRoleContent').length,2);
 const refresh=f.requests.at(-1);refresh.done=true;refresh.failure(new Error('offline'));await f.settle();
 assert.equal(panel.innerHTML,'original reviewer');
 vm.runInContext("DashboardUI.refreshRoleDashboard('reviewer')",f.c);
 f.done('loadDashboardRoleContent','updated reviewer');await f.settle();
 assert.equal(panel.innerHTML,'updated reviewer');
});

test('shared refresh entry point excludes the student dashboard',async()=>{
 const f=fixture();
 vm.runInContext("DashboardUI.refreshRoleDashboard('student')",f.c);
 assert.equal(f.requests.length,0);
});

test('Coordinator bootstrap follows server state, blocks duplicate calls and refreshes to empty definitions',async()=>{
 const f=fixture(),{document}=require('linkedom').parseHTML('<html><body>'+['reviewConfigurationCard','createAssessmentDefinitionsButton','reviewDefinitionsLink','reviewAssessmentReadiness','reviewConfigurationRecheck','initializeAssessmentStorageButton','reviewConfigurationSummary','reviewConfigurationIssues','reviewConfigurationCheckedAt','reviewConfigLink','reviewRubricsLink','assessmentStorageStatus'].map(id=>'<div id="'+id+'"></div>').join('')+'</body></html>');
 const original=f.c.document.getElementById;f.c.document.getElementById=id=>document.getElementById(id)||original(id);f.c.document.createElement=tag=>document.createElement(tag);
 const api=vm.runInContext('DashboardUI',f.c),node=id=>document.getElementById(id);
 const missing={valid:false,ready:false,state:'definitions-missing',registryState:'MISSING',canBootstrap:true,summary:'AssessmentDefinitions is missing',issues:[{sheet:'AssessmentDefinitions',message:'Create the definitions tab'}],links:{},storage:[],checkedAt:new Date().toISOString()};
 api.bootstrapAssessmentDefinitions();assert.equal(f.requests.length,0);
 vm.runInContext('DashboardUI.recheckReviewConfiguration()',f.c);f.done('getCoordinatorReviewConfiguration_',missing);await f.settle();
 assert.equal(node('createAssessmentDefinitionsButton').hidden,false);assert.equal(node('createAssessmentDefinitionsButton').disabled,false);
 api.bootstrapAssessmentDefinitions();api.bootstrapAssessmentDefinitions();vm.runInContext('DashboardUI.recheckReviewConfiguration()',f.c);vm.runInContext('DashboardUI.initializeAssessmentStorage()',f.c);
 assert.equal(f.requests.filter(r=>r.key==='createAssessmentDefinitions_').length,1);
 assert.equal(f.requests.filter(r=>r.key==='prepareReviewAssessmentStorage_').length,0);
 assert.equal(node('reviewConfigurationCard').getAttribute('aria-busy'),'true');
 f.done('createAssessmentDefinitions_',{created:true});await f.settle();
 assert.match(node('assessmentStorageStatus').textContent,/headers only/);
 const empty={...missing,state:'definitions-empty',registryState:'EMPTY',canBootstrap:false,summary:'Assessment definitions required',links:{definitions:'https://example.test/definitions'}};
 f.done('getCoordinatorReviewConfiguration_',empty);await f.settle();
 assert.equal(node('reviewConfigurationCard').getAttribute('aria-busy'),'false');
 assert.equal(node('createAssessmentDefinitionsButton').hidden,true);assert.equal(node('initializeAssessmentStorageButton').disabled,true);
 assert.equal(node('reviewDefinitionsLink').href,empty.links.definitions);
 api.bootstrapAssessmentDefinitions();assert.equal(f.requests.filter(r=>r.key==='createAssessmentDefinitions_').length,1);
});

test('failed bootstrap settles loading, keeps results, and allows a server-confirmed retry',async()=>{
 const f=fixture(),{document}=require('linkedom').parseHTML('<html><body>'+['reviewConfigurationCard','createAssessmentDefinitionsButton','reviewDefinitionsLink','reviewAssessmentReadiness','reviewConfigurationRecheck','initializeAssessmentStorageButton','reviewConfigurationSummary','reviewConfigurationIssues','reviewConfigurationCheckedAt','reviewConfigLink','reviewRubricsLink','assessmentStorageStatus'].map(id=>'<div id="'+id+'"></div>').join('')+'</body></html>');
 const original=f.c.document.getElementById;f.c.document.getElementById=id=>document.getElementById(id)||original(id);f.c.document.createElement=tag=>document.createElement(tag);
 const api=vm.runInContext('DashboardUI',f.c),node=id=>document.getElementById(id);
 const missing={valid:false,state:'definitions-missing',canBootstrap:true,summary:'AssessmentDefinitions is missing',issues:[],links:{},storage:[],checkedAt:new Date().toISOString()};
 vm.runInContext('DashboardUI.recheckReviewConfiguration()',f.c);f.done('getCoordinatorReviewConfiguration_',missing);await f.settle();
 api.bootstrapAssessmentDefinitions();const failed=f.requests.at(-1);failed.done=true;failed.failure({message:'Permission denied'});await f.settle();
 assert.match(node('assessmentStorageStatus').textContent,/Permission denied/);
 f.done('getCoordinatorReviewConfiguration_',missing);await f.settle();
 assert.equal(node('reviewConfigurationSummary').textContent,missing.summary);assert.equal(node('reviewConfigurationCard').getAttribute('aria-busy'),'false');
 assert.equal(node('createAssessmentDefinitionsButton').disabled,false);
 api.bootstrapAssessmentDefinitions();assert.equal(f.requests.filter(r=>r.key==='createAssessmentDefinitions_').length,2);
 f.done('createAssessmentDefinitions_',{created:false});await f.settle();f.done('getCoordinatorReviewConfiguration_',{...missing,canBootstrap:false,state:'invalid',links:{definitions:'https://example.test/definitions'}});await f.settle();
 assert.equal(node('createAssessmentDefinitionsButton').hidden,true);assert.match(node('assessmentStorageStatus').textContent,/left unchanged/);
});


test('shared team pagination handles All, empty results, page clamping and navigation',async()=>{
 const {document,window}=require('linkedom').parseHTML('<html><body><span id="demoPaginationInfo"></span><select id="demoPageSize"></select><div id="demoPaginationButtons"></div></body></html>');
 const info=document.getElementById('demoPaginationInfo'),strip=document.getElementById('demoPaginationButtons'),select=document.getElementById('demoPageSize');
 Object.defineProperty(select,'value',{value:'',writable:true});
 let changes=0;
 const c=vm.createContext({document});
 for(const file of ['lucide-icons.js','icon-renderer.js','system-status-actions.js']) vm.runInContext(fs.readFileSync(file,'utf8'),c);
 const paginate=c.systemStatusActionsBrowser_(null,()=>({renderIcon:c.renderLucideIcon_})).renderTeamPagination;
 const click=el=>el.dispatchEvent(new window.Event('click',{bubbles:true}));
 const last=()=>strip.querySelector('button:last-of-type');
 const state={page:1,size:10};
 let bounds=paginate(15,state,'demo',()=>changes++);
 assert.equal(bounds.start,0);assert.equal(bounds.end,10);
 click(last());assert.equal(state.page,2);assert.equal(changes,1);
 bounds=paginate(15,state,'demo',()=>{changes++;});click(strip.querySelector('[data-page="1"]'));assert.equal(state.page,1);assert.equal(changes,2,'re-rendering keeps one listener');
 state.page=2;bounds=paginate(15,state,'demo',()=>{});assert.equal(bounds.start,10);assert.equal(bounds.end,15);
 state.size='all';bounds=paginate(57,state,'demo',()=>{});
 assert.equal(state.page,1);assert.equal(bounds.end,57);assert.equal(select.value,'all');
 assert(last().disabled);
 state.size=25;state.page=9;bounds=paginate(26,state,'demo',()=>{});
 assert.equal(state.page,2);assert.equal(bounds.start,25);assert.equal(bounds.end,26);
 bounds=paginate(0,state,'demo',()=>{});assert.equal(state.page,1);assert.equal(bounds.start,0);assert.equal(bounds.end,0);
 assert.equal(info.textContent,'Showing 0 - 0 of 0 teams');
 assert.deepEqual(require('./compiled-css.cjs').missingClasses(require('./compiled-css.cjs').renderedClasses(strip).filter(name=>!name.startsWith('lucide'))),[]);
});


test('responsive menu toggles, dismisses and resets focus across breakpoints',async()=>{
 const f=fixture(), events={}, classes=new Set();let expanded='false',focused=null,resize;
 const selected={focus(){focused=selected;}};
 const toggle={getAttribute:()=>expanded,setAttribute:(key,value)=>{expanded=value;},focus(){focused=toggle;f.c.document.activeElement=toggle;}};
 const icon={innerHTML:''};
 const nav={classList:{toggle(name,on){if(on)classes.add(name);else classes.delete(name);}},contains:node=>node===toggle||node===selected,querySelector:()=>selected,addEventListener:(name,fn)=>{events[name]=fn;}};
 const original=f.c.document.getElementById;
 f.c.document.getElementById=id=>({dashboardNavigation:nav,roleMenuToggle:toggle,roleMenuIcon:icon}[id]||original(id));
 f.c.document.addEventListener=(name,fn)=>{events[name]=fn;};
 f.c.window.matchMedia=()=>({addEventListener:(name,fn)=>{resize=fn;}});
 vm.runInContext('DashboardUI.initializeRoleMenu(); DashboardUI.toggleRoleMenu();',f.c);
 assert.equal(expanded,'true');assert(classes.has('menu-open'));assert.match(icon.innerHTML,/lucide-x/);
 events.keydown({key:'Escape',preventDefault(){}});assert.equal(expanded,'false');assert.equal(focused,toggle);
 vm.runInContext('DashboardUI.toggleRoleMenu()',f.c);events.click({target:{}});assert.equal(expanded,'false');
 vm.runInContext('DashboardUI.toggleRoleMenu()',f.c);resize({matches:false});assert.equal(expanded,'false');assert.equal(focused,selected);
 f.c.document.activeElement=selected;resize({matches:true});assert.equal(focused,toggle);
 assert.equal(f.requests.length,0);
});


test('SEE rubric cards omit external evaluation text while the drawer retains it',async()=>{
 const f=rubricClientFixture();f.data.assessments[1]={...f.data.assessments[0],key:'see',label:'End Review (SEE)',evaluator:'SEE Committee (includes external members)',evaluationNotice:'Evaluated outside this app'};
 const promise=f.ui.loadSharedRubrics_();f.done('loadSharedRubrics_',f.data);await promise;
 assert.equal((f.nodes.sharedRubricsContent.innerHTML.match(/Evaluated outside this app/g)||[]).length,0);
 f.ui.openRubricDrawer('see');assert(f.nodes.rubricDrawer.classList.contains('open'));
 assert.match(f.nodes.rubricDrawerContent.innerHTML,/SEE Committee \(includes external members\)/);
 assert.match(f.nodes.rubricDrawerContent.innerHTML,/Evaluated outside this app/);
 assert.doesNotMatch(f.nodes.rubricDrawerContent.innerHTML,/Submit|Publish|Enter marks/);
});

test('SEE-only readiness reports storage not required and prevents setup RPC',async()=>{
 const f=fixture(),{document}=require('linkedom').parseHTML('<html><body>'+['reviewConfigurationCard','createAssessmentDefinitionsButton','reviewDefinitionsLink','reviewAssessmentReadiness','reviewConfigurationRecheck','initializeAssessmentStorageButton','reviewConfigurationSummary','reviewConfigurationIssues','reviewConfigurationCheckedAt','reviewConfigLink','reviewRubricsLink'].map(id=>'<div id="'+id+'"></div>').join('')+'</body></html>');
 const original=f.c.document.getElementById;
 f.c.document.getElementById=id=>document.getElementById(id)||original(id);f.c.document.createElement=tag=>document.createElement(tag);
 vm.runInContext('DashboardUI.recheckReviewConfiguration()',f.c);f.done('getCoordinatorReviewConfiguration_',{valid:true,ready:true,canInitializeStorage:false,state:'ready',summary:'Configuration valid',issues:[],links:{},checkedAt:new Date().toISOString(),storage:[{assessment:'see',label:'End Review (SEE)',journal:'',state:'NOT_REQUIRED',detail:'Not required - evaluated outside this app.'}]});await f.settle();
 assert.equal(document.getElementById('initializeAssessmentStorageButton').disabled,true);
 assert.match(document.getElementById('reviewAssessmentReadiness').textContent,/Storage: Not required.*Evaluated outside this app/);
 assert.doesNotMatch(document.getElementById('reviewAssessmentReadiness').textContent,/Journal:/);
 vm.runInContext('DashboardUI.initializeAssessmentStorage()',f.c);assert(!f.requests.some(r=>r.key==='prepareReviewAssessmentStorage_'));
});


test('readiness cards render server rubric and overall states and preserve both on failed refresh',async()=>{
 const f=fixture(),{document}=require('linkedom').parseHTML('<html><body>'+['reviewConfigurationCard','createAssessmentDefinitionsButton','reviewDefinitionsLink','reviewAssessmentReadiness','reviewConfigurationRecheck','initializeAssessmentStorageButton','reviewConfigurationSummary','reviewConfigurationIssues','reviewConfigurationCheckedAt','reviewConfigLink','reviewRubricsLink'].map(id=>'<div id="'+id+'"></div>').join('')+'</body></html>');
 const original=f.c.document.getElementById;f.c.document.getElementById=id=>document.getElementById(id)||original(id);f.c.document.createElement=tag=>document.createElement(tag);
 const report={valid:false,ready:false,canInitializeStorage:false,state:'invalid',summary:'1 / 2 assessments ready',issues:[],links:{},checkedAt:new Date().toISOString(),storage:[
  {assessment:'review1',label:'Review 1',state:'READY',journal:'Assessment_review1',ready:false,rubric:{state:'INVALID',error:'Rubrics Sheet row 9: <invalid criterion>'}},
  {assessment:'see',label:'End Review (SEE)',state:'NOT_REQUIRED',journal:'',ready:true,rubric:{state:'READY',criterionCount:4,maximumMarks:100}}
 ]};
 vm.runInContext('DashboardUI.recheckReviewConfiguration()',f.c);f.done('getCoordinatorReviewConfiguration_',report);await f.settle();
 const host=document.getElementById('reviewAssessmentReadiness'),[review,see]=host.children;
 assert.match(review.textContent,/Review 1.*Needs attention/);assert.match(review.textContent,/Rubric: Invalid/);assert.match(review.textContent,/Storage: Ready/);assert.match(review.textContent,/row 9: <invalid criterion>/);assert.equal(review.querySelector('invalid'),null);
 assert.match(see.textContent,/End Review \(SEE\).*Ready/);assert.match(see.textContent,/Rubric: Ready.*4 criteria.*100 marks/);assert.match(see.textContent,/Storage: Not required.*Evaluated outside this app/);assert.doesNotMatch(see.textContent,/Journal:/);
 const before=host.innerHTML;vm.runInContext('DashboardUI.recheckReviewConfiguration()',f.c);const failed=f.requests.at(-1);failed.done=true;failed.failure({message:'Offline'});await f.settle();assert.equal(host.innerHTML,before);
});


function configurationCardsFixture(){
 const f=fixture(),{document}=require('linkedom').parseHTML('<html><body></body></html>');
 const viewContext=vm.createContext({});vm.runInContext(fs.readFileSync('system-status-view.js','utf8'),viewContext);
 viewContext.systemStatusViewBrowser_(null,()=>({renderIcon:()=>'',renderSkeleton:()=>'<span>Skeleton</span>'}),()=>null).render(document.body,{github:{coordUsername:'',reposWithAccess:0,totalRepos:0},publishing:{configured:false,items:[]}});
 const original=f.c.document.getElementById;f.c.document.getElementById=id=>document.getElementById(id)||original(id);f.c.document.createElement=tag=>document.createElement(tag);
 return {...f,document,ui:vm.runInContext('DashboardUI',f.c),node:id=>document.getElementById(id)};
}

test('configuration cards are siblings and committee refresh preserves expansion, retries and ignores replaced cards',async()=>{
 const f=configurationCardsFixture(),report={state:'ready',summary:'Review committees configured',issues:[],links:{committees:'https://example.test/committees'},checkedAt:new Date().toISOString(),committees:[{number:'C1',members:[{name:'Reviewer',email:'r@example.test'}],teams:['T1']}]};
 assert.equal(f.node('committeeConfigurationCard').parentNode,f.node('reviewConfigurationCard').parentNode);
 f.ui.recheckCommitteeConfiguration();f.ui.recheckCommitteeConfiguration();assert.equal(f.requests.filter(r=>r.key==='getCoordinatorCommitteeConfiguration_').length,1);
 assert.equal(f.requests.filter(r=>r.key==='getCoordinatorReviewConfiguration_').length,0);
 f.done('getCoordinatorCommitteeConfiguration_',report);await f.settle();
 f.node('committeeDirectoryContent').querySelector('details').setAttribute('open','');
 f.ui.recheckCommitteeConfiguration();f.done('getCoordinatorCommitteeConfiguration_',report);await f.settle();assert.equal(f.node('committeeDirectoryContent').querySelector('details').open,true);
 const before=f.node('committeeDirectoryContent').innerHTML;f.ui.recheckCommitteeConfiguration();const failed=f.requests.at(-1);failed.done=true;failed.failure({message:'Offline'});await f.settle();
 assert.equal(f.node('committeeDirectoryContent').innerHTML,before);assert.match(f.node('committeeConfigurationIssues').textContent,/Offline/);assert.equal(f.node('committeeConfigurationRecheck').disabled,false);
 f.ui.recheckCommitteeConfiguration();const old=f.node('committeeConfigurationCard'),replacement=old.cloneNode(true);old.replaceWith(replacement);replacement.querySelector('#committeeConfigurationSummary').textContent='New card';f.done('getCoordinatorCommitteeConfiguration_',report);await f.settle();assert.equal(f.node('committeeConfigurationSummary').textContent,'New card');
});

test('storage creation area hides only after confirmed readiness and preserves visibility on refresh failure',async()=>{
 const f=configurationCardsFixture(),report={valid:true,ready:true,state:'ready',canInitializeStorage:false,storageComplete:true,summary:'All ready',issues:[],links:{},checkedAt:new Date().toISOString(),storage:[]};
 vm.runInContext('DashboardUI.recheckReviewConfiguration()',f.c);f.done('getCoordinatorReviewConfiguration_',report);await f.settle();assert.equal(f.node('assessmentStorageSetup').hidden,true);assert.equal(f.node('initializeAssessmentStorageButton').disabled,true);
 vm.runInContext('DashboardUI.recheckReviewConfiguration()',f.c);f.done('getCoordinatorReviewConfiguration_',{...report,valid:false,ready:false,state:'invalid'});await f.settle();assert.equal(f.node('assessmentStorageSetup').hidden,true);
 vm.runInContext('DashboardUI.recheckReviewConfiguration()',f.c);f.done('getCoordinatorReviewConfiguration_',{...report,ready:false,storageComplete:false,canInitializeStorage:true,state:'storage-missing'});await f.settle();assert.equal(f.node('assessmentStorageSetup').hidden,false);assert.equal(f.node('initializeAssessmentStorageButton').disabled,false);
 vm.runInContext('DashboardUI.recheckReviewConfiguration()',f.c);const failed=f.requests.at(-1);failed.done=true;failed.failure({message:'Offline'});await f.settle();assert.equal(f.node('assessmentStorageSetup').hidden,false);
});

test('the shell markup has no inline handlers and no legacy component classes; actions are delegated',()=>{
  const router=fs.readFileSync('dashboard-router.js','utf8'),helpers=fs.readFileSync('common-helpers.js','utf8'),client=fs.readFileSync('dashboard-client-scripts.js','utf8');
  for(const [name,src] of [['router',router],['helpers',helpers]])assert.doesNotMatch(src,/\son(click|change|input|keydown|submit)=/i,name);
  assert.doesNotMatch(router,/class="(?:[^"]*\s)?(tab|tabs|tabpanel|card|drawer|drawer-header|drawer-body|drawer-footer|drawer-scrim)(?:\s[^"]*)?"/);
  for(const hook of ["closest('[data-role-tab]')","closest('#roleMenuToggle')","closest('#rubricDrawerClose')","closest('[data-shell-refresh-active]')"])assert(client.includes(hook),hook);
  assert(router.includes('id="shellRefresh"') && router.includes('data-shell-refresh-active'));
});

test('the shared spinner is the only loading animation in the project',()=>{
  const spin=/animate-(?:spin|pulse|bounce|ping)\b|animate-\[(?:spin|pulse|shimmer|bounce|ping)_|app-skeleton-(?:bar|lines|title)|@keyframes (?:shimmer|pulse|bounce)/;
  const sources=fs.readdirSync('.').filter(name=>/\.(js|css)$/.test(name)&&name!=='common-styles.js'&&name!=='busy-state.js'&&name!=='lucide-icons.js')
    .concat(fs.readdirSync('scripts').filter(name=>name.endsWith('.css')).map(name=>'scripts/'+name));
  for(const name of sources)assert.doesNotMatch(fs.readFileSync(name,'utf8'),spin,name+' defines its own loading animation');
  const html=getSkeletonMarkup_Source();
  for(const variant of ['panel','drawer','inline','status','timeline']){
    const markup=html(variant,'Loading x');
    assert.equal((markup.match(/data-skeleton/g)||[]).length,1,variant);
    assert.match(markup,/animate-\[spin_/,variant);
    assert.doesNotMatch(markup,/shimmer/,variant);
  }
});
function getSkeletonMarkup_Source(){return vm.runInNewContext(fs.readFileSync('common-styles.js','utf8')+';getSkeletonMarkup_');}

test('dashboards are not loaded in the background: only the viewed one is requested',async()=>{
 const f=fixture(false,true);f.click('guide');vm.runInContext('DashboardUI.initializeLoading()',f.c);
 f.done('loadDashboardRoleContent');await f.settle();f.tick();f.tick();
 assert.equal(f.c.window.DashboardPerformance.preloading,false);
 assert.deepEqual(f.requests.map(r=>r.key),['loadDashboardRoleContent']);
 assert.equal(f.requests.filter(r=>r.key==='loadCoordinatorSystemStatus').length,0);
});

test('a student-only user gets a two-tab top bar on small screens instead of a Menu toggle',()=>{
 const c=vm.createContext({PropertiesService:{getScriptProperties:()=>({getProperty:()=>''})},HtmlService:{createHtmlOutputFromFile:name=>({getContent:()=>fs.readFileSync(name+'.html','utf8')})}});
 for(const file of ['common-styles.js','busy-state.js','common-helpers.js','common-constants.js','guide-dashboard.js','coordinator-dashboard.js','reviewer-dashboard.js','lucide-icons.js','icon-renderer.js','review-evaluation-client.js','dashboard-router.js']) vm.runInContext(fs.readFileSync(file,'utf8'),c);
 for(const name of ['getInternalAssessmentPublishingClientScript_','getMigratedViewsClientScript_','getDashboardClientScript_','getGuideEvaluationClientScript_','getGuideWeeklyClientScript_','getReviewEvaluationClientScript_','getDashboardStartScript_']) c[name]=()=>'';
 const page=views=>require('linkedom').parseHTML(c.buildDashboardShell_('a@example.test',views)).document;
 const student=page([{key:'student',label:'My Team',contentId:'s'}]);
 const tabs=Array.from(student.querySelectorAll('#roleMenuItems [role="tab"]'));
 assert.deepEqual(tabs.map(t=>t.textContent.trim()),['My Team','Timeline & Rubrics']);
 assert.equal(student.querySelector('#roleMenuToggle'),null);
 const nav=student.querySelector('#dashboardNavigation');
 assert.match(nav.className,/max-md:fixed/);assert.match(nav.className,/max-md:top-0/);
 assert.match(student.querySelector('#roleMenuItems').className,/grid-cols-2/);
 assert.doesNotMatch(student.querySelector('#roleMenuItems').className,/(^|\s)hidden(\s|$)/);
 assert.match(student.body.className,/max-md:pt-14/);
 for(const tab of tabs){assert.match(tab.className,/flex-col/);assert.match(tab.className,/aria-selected:border-b-primary/);assert.equal(tab.hasAttribute('onclick'),false);}
 const multi=page([{key:'student',label:'My Team',contentId:'s'},{key:'guide',label:'Guide',contentId:'g'}]);
 assert(multi.querySelector('#roleMenuToggle'));assert.doesNotMatch(multi.querySelector('#dashboardNavigation').className,/max-md:fixed/);
 assert.doesNotMatch(multi.body.className,/max-md:pt-14/);
 assert(page([{key:'guide',label:'Guide',contentId:'g'}]).querySelector('#roleMenuToggle'));
 assert.doesNotThrow(()=>vm.runInContext(fs.readFileSync('dashboard-client-scripts.js','utf8').includes("toggle && toggle.getAttribute('aria-expanded')")?'0':'throw new Error("Escape handler must tolerate a missing toggle")',c));
});

test('the student sidebar links slot follows the last menu item and only exists for student users',()=>{
 const c=vm.createContext({PropertiesService:{getScriptProperties:()=>({getProperty:()=>''})},HtmlService:{createHtmlOutputFromFile:name=>({getContent:()=>fs.readFileSync(name+'.html','utf8')})}});
 for(const file of ['common-styles.js','busy-state.js','common-helpers.js','common-constants.js','guide-dashboard.js','coordinator-dashboard.js','reviewer-dashboard.js','lucide-icons.js','icon-renderer.js','review-evaluation-client.js','dashboard-router.js']) vm.runInContext(fs.readFileSync(file,'utf8'),c);
 for(const name of ['getInternalAssessmentPublishingClientScript_','getMigratedViewsClientScript_','getDashboardClientScript_','getGuideEvaluationClientScript_','getGuideWeeklyClientScript_','getReviewEvaluationClientScript_','getDashboardStartScript_']) c[name]=()=>'';
 const page=views=>require('linkedom').parseHTML(c.buildDashboardShell_('a@example.test',views)).document;
 const both=page([{key:'student',label:'My Team',contentId:'s'},{key:'guide',label:'Guide',contentId:'g'}]);
 const nav=both.querySelector('#studentSideNav');
 assert.equal(nav.hidden,false);assert.equal(nav.previousElementSibling.id,'dashboardNavigation');
 assert.equal(nav.parentElement.tagName,'HEADER');assert.match(nav.className,/border-t/);assert.match(nav.className,/max-md|bottom-0/);
 assert.equal(page([{key:'guide',label:'Guide',contentId:'g'},{key:'student',label:'My Team',contentId:'s'}]).querySelector('#studentSideNav').hidden,true);
 assert.equal(page([{key:'guide',label:'Guide',contentId:'g'}]).querySelector('#studentSideNav'),null);
});

test('the Guide role starts its weekly and GitHub reads together with its dashboard read, and a refresh starts them again',async()=>{
 const f=fixture();
 f.click('guide');await f.settle();
 assert.deepEqual(f.early,['API_guide_getWeekly','API_guide_getGithub']);
 assert.equal(f.requests.filter(r=>r.key==='loadDashboardRoleContent').length,1,'the dashboard is still read once');
 f.done('loadDashboardRoleContent','guide content');await f.settle();
 f.click('reviewer');await f.settle();
 assert.deepEqual(f.early,['API_guide_getWeekly','API_guide_getGithub'],'other roles start no Guide reads');
});
