const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
function fixture(system=false) {
 const loadingNode=()=>({attrs:{},children:[],inert:false,setAttribute(k,v){this.attrs[k]=v;},classList:{add(){},remove(){},toggle(){}},appendChild(node){this.children.push(node);node.remove=()=>{this.children=this.children.filter(child=>child!==node);};}});
 const requests=[], timers=new Map(), listeners={}; let id=0;
 const panels=['guide','reviewer','coord'].map(key=>({...loadingNode(),innerHTML:'',getAttribute:()=>key}));
 const announcement={...loadingNode(),innerHTML:'',querySelector:()=>null,querySelectorAll:()=>[]};
 const systemContent={...loadingNode(),innerHTML:'',querySelectorAll:()=>[]};
 const systemMessage={textContent:''}, systemRefresh={disabled:false};
 const document={createElement:loadingNode,hidden:false,readyState:'loading',addEventListener(name,fn){(listeners[name] ||= []).push(fn);},getElementById:id=>id==='announcementsContent'?announcement:system?({systemStatusContent:systemContent,systemStatusMessage:systemMessage,systemStatusRefresh:systemRefresh}[id]||null):null,
 querySelector:selector=>panels.find(p=>selector.includes('"'+p.getAttribute()+'"'))||null,
 querySelectorAll:selector=>selector==='[data-role-content]'?panels:[]};
 function runner(success,failure) { return new Proxy({}, {get:(_,key)=>key==='withSuccessHandler'?fn=>runner(fn,failure):key==='withFailureHandler'?fn=>runner(success,fn):(...args)=>requests.push({key,args,success,failure})}); }
 const c=vm.createContext({GuideEvaluation:{admin(){},student(){}},document,window:{},performance:{now:()=>Date.now()},console,Date,Promise,setTimeout:fn=>{timers.set(++id,fn);return id;},clearTimeout:key=>timers.delete(key),google:{script:{run:runner()}},getSkeletonMarkup_:()=>''});
 for(const file of ['lucide-icons.js','icon-renderer.js']) vm.runInContext(fs.readFileSync(file,'utf8'),c);
 vm.runInContext(fs.readFileSync('dashboard-client-scripts.js','utf8'),c);
 vm.runInContext(c.getDashboardClientScript(),c);
 return {c,requests,systemContent,systemMessage,fire:(name,event)=>listeners[name].forEach(fn=>fn(event)),click:key=>c.showRoleTab(key),tick:()=>{const jobs=[...timers.values()];timers.clear();jobs.forEach(fn=>fn());},done:(key,html='ok')=>{const req=requests.find(r=>r.key===key&&!r.done);assert(req,key);req.done=true;req.success(html);}};
}

function rubricClientFixture() {
 const f=fixture(), nodes={}, document=f.c.document;
 for(const id of ['sharedRubrics','rubricDrawer','rubricDrawerBackdrop','rubricDrawerTitle','rubricDrawerContent','rubricDrawerClose','teamDrawer','teamDrawerBackdrop']) {
  const classes=new Set();nodes[id]={innerHTML:'',attrs:{},isConnected:true,setAttribute(k,v){this.attrs[k]=v;},
   classList:{add:k=>classes.add(k),remove:k=>classes.delete(k),contains:k=>classes.has(k)},
   querySelectorAll:()=>[],focus(){document.activeElement=this;}};
 }
 const retry={addEventListener(name,fn){this.click=fn;}};
 nodes.sharedRubrics.querySelector=()=>retry;
 nodes.rubricDrawer.querySelectorAll=()=>[nodes.rubricDrawerClose];
 nodes.rubricDrawer.contains=el=>el===nodes.rubricDrawerClose;
 document.body={classList:{add(){},remove(){}}};
 const lookup=document.getElementById;document.getElementById=id=>nodes[id]||lookup(id);
 const ui=vm.runInContext('DashboardUI',f.c);
 const data={assessments:[{key:'review1',label:'Review 1',weight:12.5,available:true,criterionCount:1,totalMarks:100,criteria:[{pi:'PI1',co:'CO1',type:'Team',maxMarks:100,name:'<unsafe>',descriptors:['<level>','','','','','Excellent']}]},
  {key:'see',label:'SEE',weight:40,available:false,status:'Rubric not configured'}]};
 return {...f,nodes,ui,data,retry};
}

test('rubrics start alongside pending role and timeline, deduplicate and survive role switches',async()=>{
 const f=rubricClientFixture();const query=f.c.document.querySelector;
 f.c.document.querySelector=selector=>selector==='[data-role-panel].active'?{getAttribute:()=> 'guide'}:query(selector);
 f.c.initializeFirstRoleTab();
 for(const key of ['loadDashboardRoleContent','loadSharedProjectTimeline','loadSharedRubrics']) assert(f.requests.some(r=>r.key===key),key);
 const promise=f.ui.loadSharedRubrics();assert.equal(f.ui.loadSharedRubrics(),promise);
 f.done('loadSharedRubrics',f.data);await promise;
 f.click('reviewer');await f.ui.loadSharedRubrics();
 assert.equal(f.requests.filter(r=>r.key==='loadSharedRubrics').length,1);
 assert.match(f.nodes.sharedRubrics.innerHTML,/12.5%<span class="rubric-mobile-hidden"> weight<\/span>/);
 assert.match(f.nodes.sharedRubrics.innerHTML,/<span class="rubric-mobile-hidden">View rubric<\/span>/);
 const mobileRows=[...f.nodes.sharedRubrics.innerHTML.matchAll(/<div class="rubric-mobile-row">([\s\S]*?)<\/button><\/div>/g)];
 assert.equal(mobileRows.length,2);
 assert.match(mobileRows[0][1],/<strong>Review 1<\/strong><span class="rubric-mobile-weight"/);
 assert.match(mobileRows[0][1],/<button type="button" class="rubric-view-button" data-rubric-key="review1"/);
 assert.equal((mobileRows[0][1].match(/data-rubric-key=/g)||[]).length,1,'only the action button opens the mobile rubric');
 assert.match(mobileRows[1][1],/Rubric not configured/);
 assert.match(mobileRows[1][1],/ disabled>View rubric/);
 assert.match(f.nodes.sharedRubrics.innerHTML,/disabled/);
});

test('shared rubric shell follows timeline and reuses responsive drawer styles',()=>{
 const router=fs.readFileSync('dashboard-router.js','utf8'), coordinator=fs.readFileSync('coordinator-dashboard.js','utf8');
 assert(router.indexOf('id="sharedRubrics"')>router.indexOf('id="sharedProjectTimeline"'));
 assert(router.indexOf('id="sharedRubrics"')<router.indexOf('${rolePanels}'));
 assert.match(router,/id="rubricDrawer" class="team-drawer" role="dialog"/);
 assert.match(router,/id="rubricDrawerBackdrop"[^>]+DashboardUI.closeRubricDrawer/);
 assert.match(coordinator,/width: min\(520px, 92vw\)/);
 assert.match(coordinator,/@media \(max-width: 600px\)\s*\{\s*\.team-drawer\s*\{\s*width: 100%/);
 assert(!coordinator.includes('${buildRubricsStatusCard_()}'));
});

test('rubric request failures release loading state and retry successfully',async()=>{
 const f=rubricClientFixture();const promise=f.ui.loadSharedRubrics();
 f.requests[0].done=true;f.requests[0].failure(new Error('offline'));
 await assert.rejects(promise,/offline/);assert.equal(f.nodes.sharedRubrics.attrs['aria-busy'],'false');
 f.retry.click();const retried=f.ui.loadSharedRubrics();f.done('loadSharedRubrics',f.data);await retried;
 assert.equal(f.requests.filter(r=>r.key==='loadSharedRubrics').length,2);
});

test('rubric drawer escapes text, traps focus, closes on Escape and excludes team drawer',async()=>{
 const f=rubricClientFixture();const promise=f.ui.loadSharedRubrics();f.done('loadSharedRubrics',f.data);await promise;
 const trigger={isConnected:true,focus(){f.c.document.activeElement=this;}};
 f.nodes.teamDrawer.classList.add('open');f.ui.openRubricDrawer('review1',trigger);
 assert(!f.nodes.teamDrawer.classList.contains('open'));assert(f.nodes.rubricDrawer.classList.contains('open'));
 assert.match(f.nodes.rubricDrawerContent.innerHTML,/&lt;unsafe&gt;/);assert.match(f.nodes.rubricDrawerContent.innerHTML,/Level 5/);
 assert.equal(f.c.document.activeElement,f.nodes.rubricDrawerClose);
 let prevented=0;for(const shiftKey of [true,false])f.fire('keydown',{key:'Tab',shiftKey,preventDefault(){prevented++;}});
 assert.equal(prevented,2);
 f.fire('keydown',{key:'Escape',preventDefault(){}});assert.equal(f.c.document.activeElement,trigger);assert.equal(f.nodes.rubricDrawer.inert,true);
 f.ui.openRubricDrawer('see',trigger);assert(!f.nodes.rubricDrawer.classList.contains('open'));
 f.ui.openRubricDrawer('review1',trigger);f.ui.focusCoordinatorTeam('1');assert(!f.nodes.rubricDrawer.classList.contains('open'));
 assert.equal(f.requests.filter(r=>r.key==='loadSharedRubrics').length,1);
});
test('preload waits for announcements, loads one adjacent role, and is reused',()=>{
 const f=fixture();f.click('guide');f.done('loadDashboardRoleContent');f.tick();
 assert.equal(f.requests.filter(r=>r.key==='loadDashboardRoleContent').length,1);
 // Failure also releases the scheduler without automatically retrying announcements.
 const announcement=f.requests.find(r=>r.key==='loadAnnouncementsForCurrentUser');announcement.failure(new Error('offline'));
 f.tick();assert.equal(f.requests.at(-1).args[0],'reviewer');
 f.done('loadDashboardRoleContent');f.tick();
 assert.equal(f.requests.filter(r=>r.key==='loadDashboardRoleContent').length,2);
 f.click('reviewer');assert.equal(f.requests.filter(r=>r.key==='loadDashboardRoleContent').length,2);
});
test('clicking a pending preload does not duplicate the request; hidden page skips preload',()=>{
 const f=fixture();f.click('guide');f.c.document.hidden=true;f.done('loadDashboardRoleContent');
 f.requests.find(r=>r.key==='loadAnnouncementsForCurrentUser').failure(new Error('offline'));f.tick();
 assert.equal(f.requests.filter(r=>r.key==='loadDashboardRoleContent').length,1);
 f.c.document.hidden=false;f.click('guide');f.tick();f.click('reviewer');
 assert.equal(f.requests.filter(r=>r.key==='loadDashboardRoleContent').length,2);
});
test('diagnostics record errors and preloading can be disabled for baseline measurements',()=>{
 const f=fixture();f.c.window.DashboardPerformance.setPreloading(false);f.click('guide');
 f.done('loadDashboardRoleContent');f.requests.find(r=>r.key==='loadAnnouncementsForCurrentUser').failure(new Error('offline'));f.tick();
 assert.equal(f.requests.filter(r=>r.key==='loadDashboardRoleContent').length,1);
 assert(f.c.window.DashboardPerformance.snapshot().some(e=>e.event==='request'&&!e.ok));
});
test('Coordinator shell preload does not start expensive sections',()=>{
 const f=fixture();f.click('reviewer');f.done('loadDashboardRoleContent');
 f.requests.find(r=>r.key==='loadAnnouncementsForCurrentUser').failure(new Error('offline'));f.tick();
 assert.equal(f.requests.at(-1).args[0],'coord');f.done('loadDashboardRoleContent');
 assert(!f.requests.some(r=>['loadCoordinatorSection','loadAllTeamsWeeklyActivity','getCoordinatorReviewConfiguration'].includes(r.key)));
});
test('failed role can be retried by selecting it again',()=>{
 const f=fixture();f.click('guide');f.requests[0].failure(new Error('offline'));f.click('guide');
 assert.equal(f.requests.filter(r=>r.key==='loadDashboardRoleContent').length,2);
});

test('shared loading preserves live children and restores interaction on repeated cleanup',()=>{
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

test('System Status waits for foreground requests, loads once and precedes adjacent preload',()=>{
 const f=fixture(true);f.click('guide');f.done('loadDashboardRoleContent');f.tick();
 assert(!f.requests.some(r=>r.key==='loadCoordinatorSystemStatus'));
 f.requests.find(r=>r.key==='loadAnnouncementsForCurrentUser').failure(new Error('offline'));
 f.tick();assert.equal(f.requests.at(-1).key,'loadCoordinatorSystemStatus');
 f.click('system-status');assert.equal(f.requests.filter(r=>r.key==='loadCoordinatorSystemStatus').length,1);
 f.done('loadCoordinatorSystemStatus','system cards');f.click('system-status');
 assert.equal(f.requests.filter(r=>r.key==='loadCoordinatorSystemStatus').length,1);
 assert.equal(f.systemContent.innerHTML,'system cards');
});
test('System Status click retries failures; failed refresh preserves cards',()=>{
 const f=fixture(true);f.click('system-status');f.requests[0].failure(new Error('offline'));f.requests[0].done=true;
 f.click('system-status');f.done('loadCoordinatorSystemStatus','cards');
 vm.runInContext('DashboardUI.refreshSystemStatus()',f.c);
 f.requests.at(-1).failure(new Error('refresh failed'));
 assert.equal(f.systemContent.innerHTML,'cards');assert.match(f.systemMessage.textContent,/refresh failed/);
});


test('non-student dashboard refresh replaces content once and preserves content on failure',()=>{
 const f=fixture();f.c.window.DashboardPerformance.setPreloading(false);
 f.click('reviewer');f.done('loadDashboardRoleContent','original reviewer');
 f.requests.find(r=>r.key==='loadAnnouncementsForCurrentUser').failure(new Error('offline'));
 const panel=f.c.document.querySelector('[data-role-content="reviewer"]');
 vm.runInContext("DashboardUI.refreshRoleDashboard('reviewer')",f.c);
 vm.runInContext("DashboardUI.refreshRoleDashboard('reviewer')",f.c);
 assert.equal(f.requests.filter(r=>r.key==='loadDashboardRoleContent').length,2);
 const refresh=f.requests.at(-1);refresh.done=true;refresh.failure(new Error('offline'));
 assert.equal(panel.innerHTML,'original reviewer');
 vm.runInContext("DashboardUI.refreshRoleDashboard('reviewer')",f.c);
 f.done('loadDashboardRoleContent','updated reviewer');
 assert.equal(panel.innerHTML,'updated reviewer');
});

test('shared refresh entry point excludes the student dashboard',()=>{
 const f=fixture();
 vm.runInContext("DashboardUI.refreshRoleDashboard('student')",f.c);
 assert.equal(f.requests.length,0);
});


test('reviewer assigned table includes all assigned stages and excludes other committees',()=>{
 const keys=['TEAM_ID','COMMITTEE_NUMBER','GUIDE_DECISION','REVIEWER_DECISION','GUIDE_NAME','TITLE','S1_REGNO'];
 const columns=Object.fromEntries(keys.map((key,i)=>[key,i]));
 const rows=[['T1','C1','Approved','','Guide','<script>title</script>','R1'],['T2','C1','Approved','Approved','Guide','Approved title'],['T3','C1','','Revise','Guide','Revision title'],['OTHER','C2','','']];
 const c=vm.createContext({buildTeamPagination_:()=>'',SHEET_NAMES:{},FIELD_DEFINITIONS:{},getColumnMap:()=>columns,getSheetRows:()=>rows,getCommitteeNumbersForReviewer:()=>['C1'],getCommitteeInfo:()=>null,normalizeText_:v=>String(v||'').toLowerCase(),textEquals_:(a,b)=>String(a||'').toLowerCase()===b.toLowerCase(),escapeHtml:v=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')});
 vm.runInContext(fs.readFileSync('reviewer-dashboard.js','utf8'),c);
 const data=c.getReviewerDashboardData('reviewer@example.com');
 assert.equal(data.assigned.length,3);
 const html=c.buildReviewerAssignedTeams_(data);
 assert(html.includes('Assigned Teams (3 teams)'));assert(html.includes('T1'));assert(html.includes('T2'));assert(html.includes('T3'));assert(!html.includes('OTHER'));
 assert(html.includes('R1'));assert(html.includes('&lt;script&gt;title&lt;/script&gt;'));assert(!html.includes('<script>'));
 assert(html.includes('Pending review'));assert(html.includes('Approved'));assert(html.includes('Revision requested'));
 const unsubmitted=c.buildReviewerAssignedTeams_({assigned:[['T4','C1','','','Guide','   ']]});
 assert(unsubmitted.includes('status-badge gray">Not submitted</span>'));assert(!unsubmitted.includes('Awaiting guide'));
 const submitted=c.buildReviewerAssignedTeams_({assigned:[['T5','C1','','','Guide','Submitted title']]});
 assert(submitted.includes('Awaiting guide'));
 assert(c.buildReviewerAssignedTeams_({assigned:[]}).includes('No teams are assigned to you.'));
});


test('shared team pagination handles All, empty results, page clamping and navigation',()=>{
 const nodes={demoPaginationInfo:{},demoPageSize:{},demoPaginationButtons:{children:[],set innerHTML(value){this.children=[];},appendChild(node){this.children.push(node);}}};
 let changes=0;
 const c=vm.createContext({byId:id=>nodes[id],document:{createElement:()=>({classList:{add(){}},setAttribute(){},addEventListener(event,fn){this.click=fn;}})}});
 const source=fs.readFileSync('dashboard-client-scripts.js','utf8');
 for(const file of ['lucide-icons.js','icon-renderer.js']) vm.runInContext(fs.readFileSync(file,'utf8'),c);
 vm.runInContext(source.slice(source.indexOf('  function renderTeamPagination('),source.indexOf('  function changeTeamPageSize(')),c);
 const state={page:1,size:10};
 let bounds=c.renderTeamPagination(15,state,'demo',()=>changes++);
 assert.equal(bounds.start,0);assert.equal(bounds.end,10);
 nodes.demoPaginationButtons.children.at(-1).click();assert.equal(state.page,2);assert.equal(changes,1);
 bounds=c.renderTeamPagination(15,state,'demo',()=>{});assert.equal(bounds.start,10);assert.equal(bounds.end,15);
 state.size='all';bounds=c.renderTeamPagination(57,state,'demo',()=>{});
 assert.equal(state.page,1);assert.equal(bounds.end,57);assert.equal(nodes.demoPageSize.value,'all');
 assert(nodes.demoPaginationButtons.children.at(-1).disabled);
 state.size=25;state.page=9;bounds=c.renderTeamPagination(26,state,'demo',()=>{});
 assert.equal(state.page,2);assert.equal(bounds.start,25);assert.equal(bounds.end,26);
 bounds=c.renderTeamPagination(0,state,'demo',()=>{});assert.equal(state.page,1);assert.equal(bounds.start,0);assert.equal(bounds.end,0);
 assert.equal(nodes.demoPaginationInfo.textContent,'Showing 0 - 0 of 0 teams');
});


test('responsive menu toggles, dismisses and resets focus across breakpoints',()=>{
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
