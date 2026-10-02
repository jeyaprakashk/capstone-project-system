const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {parseHTML}=require('linkedom');
function fixture() {
  const {document}=parseHTML('<html><body><section id="guideWeeklyProgress"><p id="guide-weeklyUpdated"></p><button>Refresh</button><p data-guide-weekly-status></p><div data-guide-weekly-read>Initial skeleton</div></section></body></html>');
  const requests=[],timers=new Map();let starts=0,finishes=0,timerId=0;
  const {Sync}=require('./sync-promise.cjs');
  const bridge={read:(key,method,args)=>{const p=new Sync();requests.push({method:method==='API_guide_getEvaluation'?'loadGuideEvaluation':'loadGuideWeeklyProgress',args:args||[],success:v=>p.resolve(v),failure:e=>p.reject(e)});return p;},
    write:(method,args)=>{const p=new Sync();requests.push({method:'submitWeeklyGuideSignoff',args,success:v=>p.resolve(v),failure:e=>p.reject(e)});return p;}};
  const c=vm.createContext({document,Date,setTimeout:(fn,delay)=>{assert.equal(delay,5000);timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id),DashboardUI:{renderSkeleton:()=>'<span>Skeleton</span>',beginContentLoading:(target,label,options)=>{
    starts++;assert.equal(options.compact,true);target.setAttribute('aria-busy','true');let done=false;
    return()=>{if(!done){done=true;finishes++;target.removeAttribute('aria-busy');}};
  },guideRun:()=>{const request={};const runner=new Proxy({withSuccessHandler(fn){request.success=fn;return runner;},withFailureHandler(fn){request.failure=fn;return runner;}},{get(target,key){return target[key]||((...args)=>{request.method=key;request.args=args;requests.push(request);});}});return runner;}}});
  vm.runInContext(fs.readFileSync('guide-weekly-client.js','utf8'),c);
  new vm.Script(c.getGuideWeeklyClientScript_());const api=c.guideWeeklyBrowser_(bridge);
  const data={weeks:['W2','W1'],checkedAt:'2026-01-08T12:00:00Z',timezone:'Asia/Kolkata',entries:[
    {entryId:'e2',weekId:'W2',student:'Student <script>alert(1)</script>',regNo:'001',discussion:'Measured <b>signal</b>',status:'PENDING',score:null},
    {entryId:'e1',weekId:'W1',student:'Student',regNo:'001',discussion:'Decision',status:'DISCUSSED',score:0}]};
  return {api,c,document,requests,data,flush:()=>{const pending=[...timers.values()];timers.clear();pending.forEach(fn=>fn());},host:document.getElementById('guideWeeklyProgress'),counts:()=>[starts,finishes],reply:()=>requests.at(-1).success(data)};
}

test('guide list defaults latest week, escapes content, renders absent score and uses shared buttons',()=>{
  const f=fixture();f.api.load();f.api.load();assert.equal(f.requests.length,1);f.reply();
  assert.equal(f.host.week,'W2');assert.equal(f.host.querySelectorAll('[data-entry]').length,1);
  assert.match(f.host.textContent,/—/);assert.equal(f.host.querySelector('[data-decision-status]'),null);assert.equal(f.host.querySelector('script'),null);
  assert.equal(f.host.querySelector('[data-entry] b'),null);
  f.host.querySelectorAll('[data-sign],[data-details]').forEach(button=>assert.match(button.className,/\btext-xs\b.*\bpx-2\b|\bpx-2\b.*\btext-xs\b/));
  f.host.querySelector('[data-week-step="1"]').onclick();
  assert(f.host.querySelector('[data-weekly-student-header] > [data-weekly-deadline]'));
  assert.match(f.host.textContent,/0\/10/);assert.equal(f.host.querySelector('[data-sign="DISCUSSED"]').getAttribute('aria-pressed'),'true');
  assert.deepEqual(f.counts(),[1,1]);
});

test('guide required counts exclude ineligible and voluntary students without hiding their logs',()=>{
 const f=fixture();f.data.requiredByWeek=[{weekId:'W2',regNos:['001']},{weekId:'W1',regNos:[]}];
 f.data.entries.push({...f.data.entries[0],entryId:'voluntary',regNo:'002',student:'Voluntary student',status:'DISCUSSED'});
 f.api.load();f.reply();assert.match(f.host.querySelector('[data-week-status]').title,/1\/1 required submitted/);
 assert.equal(f.host.querySelectorAll('[data-entry]').length,2);
 f.host.querySelector('[data-week-step="1"]').onclick();assert.match(f.host.querySelector('[data-week-status]').title,/0\/0 required submitted/);
});

test('weekly timeliness badges use recorded status and shared semantic colors',()=>{
  for(const [timeliness,label,classes] of [['ON_TIME','On-time submission','bg-success-tint text-success'],['LATE','Late submission','bg-danger-tint text-danger'],[undefined,'Timing unavailable','bg-soft text-ink-2']]) {
    const f=fixture();f.data.entries[0].timeliness=timeliness;f.api.load();f.reply();
    const badge=f.host.querySelector('[data-submission-timing]');
    assert.equal(badge.textContent,label);assert(badge.className.includes(classes),badge.className);
  }
});

test('late badge counts calendar days from first submission rather than a later revision',()=>{
  const f=fixture();f.host.dataset.guideWeeks=JSON.stringify([{weekId:'W2',opensAt:Date.parse('2026-01-04T00:00:00Z'),deadlineAt:Date.parse('2026-01-06T18:29:59Z')}]);
  Object.assign(f.data.entries[0],{timeliness:'LATE',firstSubmittedAt:'2026-01-08T10:00:00Z',submittedAt:'2026-01-10T10:00:00Z'});
  f.api.load();f.reply();assert.equal(f.host.querySelector('[data-submission-timing]').textContent,'2 days late');
  f.data.entries[0].firstSubmittedAt='2026-01-07T10:00:00Z';f.api.load();f.reply();
  assert.equal(f.host.querySelector('[data-submission-timing]').textContent,'1 day late');
});

test('title explanation positions beside its button and stays inside a narrow viewport',()=>{
  const f=fixture(),listeners=new Map();f.c.window={innerWidth:360,innerHeight:640,addEventListener:(name,fn)=>listeners.set(name,fn),removeEventListener:name=>listeners.delete(name)};
  const button=f.document.createElement('button');button.setAttribute('popovertarget','timing');f.document.body.appendChild(button);
  button.getBoundingClientRect=()=>({right:345,top:570,bottom:600});
  const popup=f.document.createElement('span');popup.id='timing';popup.getBoundingClientRect=()=>({width:328,height:100});
  let dismissed=false;popup.hidePopover=()=>{dismissed=true;};
  f.api.positionTitleInfo({newState:'open'},popup);
  assert.equal(popup.style.left,'17px');assert.equal(popup.style.top,'462px');
  listeners.get('resize')();assert.equal(dismissed,true);
  f.api.positionTitleInfo({newState:'closed'},popup);assert.equal(listeners.size,0);
});

test('sticky decision bars reserve their measured height only on tall cards',()=>{
  const f=fixture();let measure,contentHeight=800,barHeight=70;
  f.c.window={innerHeight:600,addEventListener(){},removeEventListener(){}};
  f.c.ResizeObserver=class {constructor(callback){measure=callback;}observe(){}disconnect(){}};
  f.api.load();f.reply();
  const card=f.host.querySelector('[data-weekly-card]');
  card.querySelector('[data-weekly-summary]').getBoundingClientRect=()=>({height:contentHeight+Number(card.dataset.actionReserve || 0),bottom:900+Number(card.dataset.actionReserve || 0)});
  card.querySelector('[data-weekly-actions]').getBoundingClientRect=()=>({height:barHeight});
  let headerBottom=650;
  card.querySelector('[data-weekly-student-header]').getBoundingClientRect=()=>({bottom:headerBottom});
  card.getBoundingClientRect=()=>({bottom:900});
  measure();assert.equal(card.style.getPropertyValue('--guide-action-reserve'),'70px');
  assert.equal(card.dataset.stickyDecision,'false');
  headerBottom=600;measure();assert.equal(card.dataset.stickyDecision,'false');
  headerBottom=300;measure();assert.equal(card.dataset.stickyDecision,'false');
  headerBottom=240;measure();assert.equal(card.dataset.stickyDecision,'true');
  headerBottom=100;measure();assert.equal(card.dataset.stickyDecision,'true');
  headerBottom=650;measure();assert.equal(card.dataset.stickyDecision,'false');
  barHeight=110;measure();assert.equal(card.style.getPropertyValue('--guide-action-reserve'),'110px');
  contentHeight=300;measure();assert.equal(card.style.getPropertyValue('--guide-action-reserve'),'0px');
});

test('AI quality handles blank scores and explains the actual rating calculation',()=>{
  for(const value of [null,undefined,'','  ',NaN,'invalid',-1,11,0,'0',7]) {
    const f=fixture();f.data.entries[0].score=value;f.api.load();f.reply();
    const score=f.host.querySelector('[data-ai-quality]');
    assert.equal(score.textContent,value===0 || value==='0'?'0/10':value===7?'7/10':'—');
    assert.match(score.title,/technical substance, specificity, outcome, next action, and GitHub support/);
    assert.match(score.title,/High \(2\), Medium \(1\), or Low \(0\)/);
    assert.equal(f.host.querySelector('[data-details]'),null);
  }
});

test('refresh failure retains successful DOM, settles controls, and retries cleanly',()=>{
  const f=fixture();f.api.load();f.reply();const row=f.host.querySelector('[data-entry]');
  f.api.load();assert.equal(f.host.querySelector('button').disabled,true);f.requests.at(-1).failure(Error('offline'));
  assert.equal(f.host.querySelector('[data-entry]'),row);assert.equal(f.host.querySelector('button').disabled,false);
  assert.match(f.host.querySelector('[data-guide-weekly-status]').textContent,/offline.*Refresh/);
  f.api.load();f.reply();assert.equal(f.host.querySelector('[data-guide-weekly-status]').textContent,'');assert.deepEqual(f.counts(),[3,3]);
});

test('initial read failure retries and detached responses do not update the screen',()=>{
  const f=fixture();f.api.load();f.requests[0].failure('Unavailable');assert.equal(f.host.busy,false);
  f.api.load();f.host.remove();f.reply();assert.equal(f.host.data,undefined);assert.deepEqual(f.counts(),[2,2]);
});

test('guide sign-off blocks duplicates, retains choice on failure and displays successful confirmation',()=>{
  const f=fixture();f.api.load();f.reply();let button=f.host.querySelector('[data-sign="NOT_DISCUSSED"]');
  button.onclick();button.onclick();assert.equal(f.requests.length,1);f.flush();assert.equal(f.requests.length,2);assert.equal(f.requests[1].method,'submitWeeklyGuideSignoff');
  assert.deepEqual(Array.from(f.requests[1].args),['e2','NOT_DISCUSSED']);
  f.requests[1].failure(Error('stale entry'));assert.equal(f.host.busy,false);assert.match(f.host.textContent,/stale entry/);
  button.onclick();f.flush();f.requests[2].success({status:'NOT_DISCUSSED',message:'Saved; revisions frozen.'});
  button=f.host.querySelector('[data-sign="NOT_DISCUSSED"]');assert.equal(button.getAttribute('aria-pressed'),'true');assert.match(f.host.textContent,/revisions frozen/);assert.equal(f.host.querySelector('[data-decision-status]'),null);
});

test('undo cancels before persistence and releases controls; detached notices never save',()=>{
  const f=fixture();f.api.load();f.reply();
  const discussed=f.host.querySelector('[data-sign="DISCUSSED"]');
  assert.match(discussed.className,/\bbg-primary\b/);
  assert.match(f.host.querySelector('[data-sign="NOT_DISCUSSED"]').className,/\bring-line\b/);
  discussed.onclick();assert.match(f.host.textContent,/will save in 5 seconds/);
  f.api.load();assert.equal(f.requests.length,1);
  f.host.querySelector('[data-sign-undo]').onclick();f.flush();
  assert.equal(f.requests.length,1);assert.equal(f.host.busy,false);assert.equal(discussed.disabled,false);
  assert.equal(f.data.entries[0].status,'PENDING');assert.match(f.host.textContent,/No changes saved/);
  discussed.onclick();f.host.remove();f.flush();assert.equal(f.requests.length,1);
});

test('full answers, AI ratings and commit date/message/SHA are visible without disclosure buttons',()=>{
  const f=fixture();
  const sha='4fa79515b076b1fc2ca764338761bb347e4f547c',url='https://github.com/org/team/commit/'+sha;
  Object.assign(f.data.entries[0],{score:7,workCompleted:'<img src=x>',guideDiscussion:'Decision\nNext …',blockers:'None',nextAction:'Measure',analysis:{score:7,comment:'Concrete work',technical_substance:'HIGH',specificity:'HIGH',outcome:'MEDIUM',next_action:'HIGH',github_support:'LOW'},evidence:{state:'available',commits:[{timestamp:'2026-01-02T12:00:00Z',message:'Added plots',sha,shortSha:sha.slice(0,7),url}]}});
  f.api.load();f.reply();
  assert.equal(f.host.querySelector('img'),null);assert.match(f.host.textContent,/7\/10/);assert.match(f.host.textContent,/Technical substance/);
  assert.match(f.host.textContent,/Added plots/);assert.match(f.host.textContent,/2026/);assert.deepEqual(f.counts(),[1,1]);
  assert.equal(f.host.querySelectorAll('[data-answer] > strong').length,4);
  assert(!f.host.querySelector('[data-answer="guideDiscussion"]').textContent.includes('Next …'));
  const link=f.host.querySelector('[data-commit-list] a');
  assert.equal(link.textContent,'4fa7951');assert.equal(link.getAttribute('href'),url);
  assert.equal(link.getAttribute('target'),'_blank');assert.equal(link.getAttribute('rel'),'noopener noreferrer');
  assert(!f.host.textContent.includes(sha));
  assert.equal(f.host.querySelector('[data-details]'),null);assert.equal(f.requests.length,1);
});

test('empty guide list and unavailable details never invent an AI score or commit count',()=>{
  const f=fixture();f.api.load();f.requests[0].success({...f.data,entries:[],weeks:[]});assert.match(f.host.textContent,/No weekly submissions/);
  f.api.load();f.reply();assert.match(f.host.textContent,/GitHub evidence unavailable/);assert(!f.host.textContent.includes('0/10'));
});

test('empty selected week reports the last submission across weeks for the selected team',()=>{
  const f=fixture();f.data.entries[0].submittedAt='2026-09-29T18:45:00Z';
  f.data.weeks=['W3','W2','W1'];f.data.entries.forEach(entry=>entry.status='DISCUSSED');
  f.api.load();f.reply();assert.match(f.host.textContent,/Last submission: 30 Sept 2026/);
  f.data.entries=[];f.api.load();f.reply();assert.match(f.host.textContent,/Last submission: None recorded/);
});

test('guide approval context matches the current title, reviewer and year and reads document submission history',()=>{
  const TS={TEAM_ID:0,SEMESTER:1,GUIDE_EMAIL:2,TITLE:3,TITLE_APPROVED_BY:4,REVIEWER_NOTES:5,WORK_BREAKDOWN_LINK:6};
  const row=['G33','Odd','guide@test','Approved title','reviewer@test','Looks good','https://example.test/work'];
  const norm=value=>String(value || '').trim().toLowerCase();
  const records=[['2026-27','Odd','G33','guide@test','Approved title','','','2026-09-29T12:00:00Z','reviewer@test'],
    ['2025-26','Odd','G33','guide@test','Old title','','','2026-09-30T12:00:00Z','reviewer@test']];
  const c=vm.createContext({normalizeText_:norm,textEquals_:(a,b)=>norm(a)===norm(b),emailsMatch:(a,b)=>norm(a)===norm(b),getAcademicYear:()=> '2026-27',
    getSpreadsheet:()=>({getSpreadsheetTimeZone:()=> 'Asia/Kolkata'}),getHubRegistrySheet:()=> 'registry',getSheet:()=> 'intake',SHEET_NAMES:{TEAM_INTAKE_RAW:'intake'},
    readSheetRows_:(sheet,start)=>sheet==='registry'?records:start===1?[['Timestamp','Team ID','Work Breakdown Document']]:[['2026-09-28T12:00:00Z','G33','file']],escapeHtml:value=>String(value)});
  vm.runInContext(fs.readFileSync('guide-dashboard.js','utf8'),c);
  const context=c.readGuideRecordContext_([row],TS);
  assert.match(context.approvals.g33,/29 Sept 2026/);assert.match(context.documentSubmissions.g33,/28 Sept 2026/);
  vm.runInContext(fs.readFileSync('guide-api.js','utf8'),c);
  c.projectDay_=date=>Math.floor(date.getTime()/86400000);
  c.formatProjectDay_=day=>new Date(day*86400000).toISOString().slice(0,10);
  const deadline=Math.floor(Date.parse('2026-09-29')/86400000),schedule={title:deadline,timezone:'UTC'},clock={today:deadline+2,now:new Date('2026-10-01T12:00:00Z')};
  const title=(status,at,override)=>c.guideTitleTimingDto_(status,at,schedule,override||clock);
  assert.equal(title('APPROVED',Date.parse('2026-09-29T23:59:59Z')).state,'on-time');
  assert.equal(title('APPROVED',Date.parse('2026-09-30T00:00:00Z')).state,'late');
  assert.equal(title('APPROVED',undefined).state,'unknown');
  assert.equal(title('AWAITING_REVIEWER',undefined).state,'overdue');
  assert.equal(title('NEEDS_REVIEW',undefined,{...clock,today:deadline}).state,'pending');
  assert.match(title('APPROVED',Date.parse('2026-09-30T00:00:00Z')).explanation,/1 day after the deadline \(2026-09-29\)/);
  const git=(member,extra)=>c.guideGithubTimingDto_(member,{...schedule,git:deadline,formation:deadline-20,...extra},clock);
  const late=git({githubId:'123',status:'valid',access:'active',submittedAt:Date.parse('2026-09-30')});
  assert.equal(late.state,'late');assert.equal(late.daysLate,1);assert.match(late.explanation,/GitHub account submitted 2026-09-30, 1 day after/);
  const joined=git({githubId:'123',status:'valid',access:'active',submittedAt:Date.parse('2026-09-29')});
  assert.equal(joined.state,'on-time');assert.equal(joined.daysLate,0);assert.match(joined.date,/29 Sep/);
  assert.equal(git({githubId:'123',status:'valid',access:'invited',submittedAt:Date.parse('2026-09-29')}),null);
  assert.equal(git({githubId:'',status:'missing',access:'none'}),null);
  c.readSheetRows_=()=>{throw Error('offline');};
  const unavailable=c.readGuideRecordContext_([row],TS);
  assert.equal(unavailable.approvals.g33,undefined);assert.equal(unavailable.documentSubmissions.g33,'Date unavailable');
});

test('full student answers are retained without arbitrary truncation',()=>{
  const f=fixture();f.data.entries[0].guideDiscussion='x'.repeat(1000);f.api.load();f.reply();
  const text=f.host.querySelector('[data-answer="guideDiscussion"]').textContent;assert.match(text,/x{1000}/);
});

test('student answers join soft line breaks while retaining paragraphs and list items',()=>{
  const f=fixture();f.data.entries[0].workCompleted='HUMAN\r\nKINEMATICS-BASED study\n\nFindings:\n- First finding\n- Second finding';
  f.api.load();f.reply();const answer=f.host.querySelector('[data-answer="workCompleted"]').textContent;
  assert.match(answer,/HUMAN KINEMATICS-BASED study\n\nFindings:\n- First finding\n- Second finding/);
});

function setupFixture() {
  const f=fixture();f.host.id='weeklyPhase2Setup';f.host.innerHTML='<div data-weekly-setup-read>Skeleton</div><p data-weekly-setup-status></p>';
  f.c.DashboardUI.beginContentLoading=()=>()=>{};
  const { Sync } = require('./sync-promise.cjs');
  const record = (method, args) => { const p = new Sync(); f.requests.push({ method, args, success: v => p.resolve(v), failure: e => p.reject(e) }); return p; };
  f.api = f.c.weeklyPhase2SetupBrowser_({ read: (key, method, args, options) => { f.readOptions = { key, options }; return record(method, args); }, write: (method, args) => record(method, args) });
  f.report={storageReady:false,triggerReady:false,canSetupStorage:true,canSetupTriggers:false,issues:[]};return f;
}

test('weekly setup hides each completed action and rechecks after setup without duplicate requests',()=>{
  const f=setupFixture();f.api.load();f.api.load();assert.equal(f.requests.length,1);f.requests[0].success(f.report);
  let buttons=f.host.querySelectorAll('button');assert.equal(buttons.length,2);assert.equal(buttons[0].disabled,false);assert.equal(buttons[1].disabled,true);
  buttons[0].onclick();buttons[0].onclick();assert.equal(f.requests.length,2);assert.equal(f.requests[1].method,'API_coordinator_setupWeekly');assert.deepEqual(Array.from(f.requests[1].args),['storage']);
  f.requests[1].success({ok:true});assert.equal(f.requests[2].method,'API_coordinator_getWeeklySetup');
  f.requests[2].success({...f.report,storageReady:true,canSetupStorage:false,canSetupTriggers:true});
  buttons=f.host.querySelectorAll('button');assert.equal(buttons.length,1);assert.match(buttons[0].textContent,/schedule/);
  buttons[0].onclick();assert.equal(f.requests[3].method,'API_coordinator_setupWeekly');assert.deepEqual(Array.from(f.requests[3].args),['triggers']);f.requests[3].success({ok:true});
  f.requests[4].success({...f.report,storageReady:true,triggerReady:true,canSetupStorage:false});assert.equal(f.host.querySelectorAll('button').length,0);
});

test('weekly setup read failures preserve content; failed mutations settle and allow retry',()=>{
  const f=setupFixture();f.api.load();f.requests[0].success(f.report);const button=f.host.querySelector('button');
  f.api.load();f.requests[1].failure(Error('offline'));assert.equal(f.host.querySelector('button'),button);assert.equal(button.disabled,false);
  assert.match(f.host.textContent,/Recheck/);f.api.load();f.requests[2].success(f.report);assert(!f.host.textContent.includes('offline'));
  f.host.querySelector('button').onclick();f.requests[3].failure(Error('denied'));f.requests[4].success(f.report);
  assert.match(f.host.textContent,/Setup stopped: denied/);assert.equal(f.host.querySelector('button').disabled,false);
});

test('team workspace filters weekly cards, preserves title drafts and retains selection after refresh',()=>{
  const f=fixture();
  const root=f.document.createElement('div');root.setAttribute('data-guide-workspace','');
  root.innerHTML=['A','B'].map(id=>'<button data-guide-select="'+id+'"></button><header data-guide-heading="'+id+'"></header><section data-guide-team="'+id+'" data-guide-students=\''+JSON.stringify([id==='A'?'001':'002'])+'\'><div data-guide-view="title"><input value="Draft '+id+'"></div><div data-guide-view="documents"></div></section>').join('')+['title','weekly','documents'].map(view=>'<button data-guide-tab="'+view+'"></button>').join('');
  f.document.body.appendChild(root);root.appendChild(f.host);
  f.data.entries.push({...f.data.entries[0],entryId:'other',regNo:'002',student:'Other student'});
  const refresh=f.document.createElement('button');refresh.id='guideRefresh';root.appendChild(refresh);
  const updated=f.document.createElement('p');updated.id='guideUpdated';root.appendChild(updated);
  f.api.load();f.reply();
  assert.equal(f.host.hidden,false);
  const draft=root.querySelector('input');draft.value='Unsaved title';
  f.api.selectView('weekly');assert.equal(f.host.hidden,false);
  assert.equal(refresh.hidden,false);assert.equal(updated.hidden,false);
  assert.equal(f.host.querySelectorAll('[data-entry]').length,1);
  assert.equal(f.host.querySelector('[data-entry]').dataset.entry,'e2');
  f.api.selectTeam('B');assert.equal(f.host.querySelector('[data-entry]').dataset.entry,'other');
  assert.equal(root.querySelector('[data-guide-tab="weekly"]').getAttribute('aria-pressed'),'true');
  f.api.selectView('documents');assert.equal(f.host.hidden,true);
  assert.equal(refresh.hidden,false);assert.equal(updated.hidden,false);
  assert.equal(root.querySelector('[data-guide-team="B"]').hidden,false);
  assert.equal(root.querySelector('[data-guide-team="A"]').hidden,true);
  f.api.load();f.requests.at(-1).failure('offline');
  assert.equal(root.querySelector('[data-guide-select="B"]').getAttribute('aria-pressed'),'true');
  f.api.selectTeam('A');f.api.selectView('title');assert.equal(draft.value,'Unsaved title');
  f.api.selectTeam('A');assert.equal(f.host.hidden,false);
  assert.equal(root.querySelector('[data-guide-tab="weekly"]').getAttribute('aria-pressed'),'true');
  f.api.selectTeam('missing');assert.equal(root.querySelector('[data-guide-select="A"]').getAttribute('aria-pressed'),'true');
});


test('week arrows include empty configured weeks, exclude future weeks and retain boundaries after failure',()=>{
  const f=fixture();f.data.entries.forEach(entry=>{entry.status='DISCUSSED';});
  f.host.dataset.guideWeeks=JSON.stringify([
    {weekId:'W1',opensAt:Date.parse('2026-01-01')},
    {weekId:'W2',opensAt:Date.parse('2026-01-04')},
    {weekId:'W3',opensAt:Date.parse('2026-01-07')},
    {weekId:'W4',opensAt:Date.parse('2026-01-10')}]);
  f.api.load();f.reply();assert.equal(f.host.week,'W3');
  assert.match(f.host.textContent,/No weekly submissions for this team/);
  assert.equal(f.host.querySelector('[data-week-step="-1"]').disabled,true);
  assert.match(f.host.querySelector('[data-week-step="-1"]').title,/Latest available project week/);
  f.api.load();f.requests.at(-1).failure('offline');
  assert.equal(f.host.querySelector('[data-week-step="-1"]').disabled,true);
  f.host.querySelector('[data-week-step="1"]').onclick();assert.equal(f.host.week,'W2');
  f.host.querySelector('[data-week-step="1"]').onclick();assert.equal(f.host.week,'W1');
  assert.equal(f.host.querySelector('[data-week-step="1"]').disabled,true);
  assert.match(f.host.querySelector('[data-week-step="1"]').title,/First project week/);
  f.host.querySelector('[data-week-step="-1"]').onclick();assert.equal(f.host.week,'W2');
});


test('tab switches and failed refresh preserve full logs; successful refresh replaces them',()=>{
  const f=fixture();
  const root=f.document.createElement('div');root.setAttribute('data-guide-workspace','');
  root.innerHTML='<section data-guide-team="A" data-guide-students=\'["001"]\'><div data-guide-view="title"></div><div data-guide-view="documents"></div></section>';
  f.document.body.appendChild(root);root.appendChild(f.host);
  f.api.load();f.reply();f.api.selectView('weekly');
  const detail=f.host.querySelector('[data-weekly-evidence]');
  for(const view of ['title','documents','weekly'])f.api.selectView(view);
  assert.equal(f.requests.length,1);
  assert.equal(f.host.querySelector('[data-weekly-evidence]'),detail);
  assert.equal(detail.hidden,false);
  f.api.load();f.requests.at(-1).failure('offline');
  assert.equal(f.host.querySelector('[data-weekly-evidence]'),detail);assert.equal(detail.hidden,false);
  f.api.selectView('title');f.api.selectView('weekly');assert.equal(f.requests.length,2);
  f.api.load();f.reply();
  assert.notEqual(f.host.querySelector('[data-weekly-evidence]'),detail);
  assert.equal(f.requests.at(-1).method,'loadGuideWeeklyProgress');assert.equal(f.requests.length,3);
});


test('default week prioritizes oldest pending decision for the selected team, otherwise current week',()=>{
  const f=fixture();
  const root=f.document.createElement('div');root.setAttribute('data-guide-workspace','');
  root.innerHTML=['A','B'].map(id=>'<section data-guide-team="'+id+'" data-guide-students="'+(id==='A'?'[&quot;001&quot;]':'[&quot;002&quot;]')+'"></section>').join('');
  f.document.body.appendChild(root);root.appendChild(f.host);
  f.data.weeks=['W3','W2','W1'];f.data.entries[1].status='PENDING';
  f.api.load();f.reply();assert.equal(f.host.week,'W1');
  f.api.selectTeam('B');assert.equal(f.host.week,'W3');
  f.api.selectTeam('A');assert.equal(f.host.week,'W1');
  f.host.querySelector('[data-week-step="-1"]').onclick();assert.equal(f.host.week,'W2');
  f.api.selectView('documents');f.api.selectView('weekly');assert.equal(f.host.week,'W2');
  f.data.entries[1].status='NOT_DISCUSSED';f.api.load();f.reply();assert.equal(f.host.week,'W2');
  f.data.entries[0].status='DISCUSSED';f.api.load();f.reply();assert.equal(f.host.week,'W3');
});


test('evaluation tab respects disabled gate and preserves an already open editor across tabs',()=>{
  const f=fixture();const root=f.document.createElement('div');root.setAttribute('data-guide-workspace','');
  root.innerHTML='<section data-guide-team="A" data-guide-students="[&quot;001&quot;]"><div data-guide-view="title"></div></section><button data-guide-tab="evaluation" disabled></button><section id="guideEvaluationEditor" hidden></section>';
  f.document.body.appendChild(root);root.appendChild(f.host);
  const opened=[];f.c.GuideEvaluation={open:team=>opened.push(team)};
  f.api.load();f.reply();f.api.selectView('evaluation');assert.equal(opened.length,0);
  const tab=root.querySelector('[data-guide-tab="evaluation"]');tab.disabled=false;
  f.api.selectView('evaluation');assert.deepEqual(opened,['A']);
  const editor=f.document.getElementById('guideEvaluationEditor');editor.dataset.team='A';editor.textContent='Unsaved evaluation';
  f.api.selectView('evaluation',true);assert.equal(editor.hidden,false);assert.equal(f.host.hidden,true);
  f.api.selectView('weekly');assert.equal(editor.hidden,true);
  f.api.selectView('evaluation');assert.equal(editor.hidden,false);assert.equal(editor.textContent,'Unsaved evaluation');assert.equal(opened.length,1);
});


test('team attention combines only guide actions, updates after decisions and distinguishes unavailable evaluations',()=>{
  const f=fixture();f.c.DashboardUI.renderSkeleton=()=>'<span>Skeleton</span>';
  const root=f.document.createElement('div');root.setAttribute('data-guide-workspace','');
  root.innerHTML=['A','B'].map((id,i)=>'<button data-guide-select="'+id+'" data-title-attention="'+(i===0)+'" data-documents-attention="2"><span data-team-attention></span></button><section data-guide-team="'+id+'" data-guide-students="[&quot;00'+(i+1)+'&quot;]"></section>').join('')+['title','weekly','documents'].map(key=>'<button data-guide-tab="'+key+'"></button>').join('')+'<button data-guide-tab="evaluation" disabled></button>';
  f.document.body.appendChild(root);root.appendChild(f.host);
  const pill=id=>root.querySelector('[data-guide-select="'+id+'"] [data-team-attention]');
  f.api.load();assert.match(pill('A').textContent,/Skeleton/);assert.equal(pill('B').hidden,false);assert.equal(pill('A').getAttribute('aria-busy'),'true');
  f.reply();assert.equal(pill('A').textContent,'Title review · 1');assert.equal(pill('A').hasAttribute('aria-busy'),false);assert.equal(pill('A').hasAttribute('title'),false);assert.equal(root.querySelector('[data-guide-select="A"]').hasAttribute('title'),false);assert.equal(pill('B').hidden,true);assert.equal(f.requests.length,1);
  const tabBadge=key=>root.querySelector('[data-guide-tab="'+key+'"] [data-guide-tab-attention]');
  assert.equal(tabBadge('weekly').textContent,'1');assert.equal(tabBadge('documents').textContent,'2');
  assert.equal(root.querySelector('[data-guide-tab="title"]').getAttribute('aria-pressed'),'true');
  f.host.querySelector('[data-sign="DISCUSSED"]').onclick();f.flush();f.requests.at(-1).success({status:'DISCUSSED',message:'Saved'});
  assert.equal(pill('A').textContent,'Title review · 1');assert.equal(tabBadge('weekly').hidden,true);
  root.querySelector('[data-guide-tab="evaluation"]').disabled=false;
  f.api.load();f.reply();
  const reads=f.requests.filter(r=>r.method==='loadGuideEvaluation');assert.equal(reads.length,2);
  assert.match(pill('A').textContent,/Skeleton/);assert.match(pill('B').textContent,/Skeleton/);
  reads[0].success({statuses:[{status:'Draft'}]});assert.equal(pill('A').textContent,'Title review · 1');
  reads[1].failure('offline');assert.equal(pill('B').hidden,true);assert.match(root.querySelector('[data-guide-select="B"]').getAttribute('aria-description'),/could not be checked/);
  f.api.evaluationStatus('A',[{status:'Submitted'},{status:'Published'}]);assert.equal(pill('A').textContent,'Title review · 1');
  f.api.evaluationStatus('B',[{status:'Not started'}]);assert.equal(pill('B').textContent,'Guide Evaluation · 1');
  f.api.evaluationStatus('B',[{status:'Submitted'}]);assert.equal(pill('B').hidden,true);
  const count=f.requests.length;f.api.selectView('documents');f.api.selectView('weekly');assert.equal(f.requests.length,count);
  root.querySelector('[data-guide-tab="evaluation"]').disabled=true;
  f.api.load();assert.match(pill('A').textContent,/Skeleton/);f.requests.at(-1).failure('offline');
  assert.equal(pill('A').textContent,'Title review · 1');assert.equal(pill('A').hasAttribute('aria-busy'),false);
});

test('weekly setup card uses compiled Tailwind utilities and no legacy classes', () => {
  const { missingClasses, renderedClasses } = require('./compiled-css.cjs');
  const f = setupFixture(); f.api.load(); f.requests[0].success({ ...f.report, issues: ['Something to fix'] });
  assert.deepEqual(missingClasses(renderedClasses(f.host)), []);
  assert.equal(f.host.querySelector('.btn'), null);
  assert.equal(f.readOptions.key, 'weekly-setup');
  const src = fs.readFileSync('guide-weekly-client.js', 'utf8');
  assert.doesNotMatch(f.c.weeklyPhase2SetupBrowser_.toString(), /guideRun|google.script/);
  assert.deepEqual(missingClasses([...src.matchAll(/(?:PRIMARY|LINE)='([^']+)'/g)].flatMap(m => m[1].split(/\s+/))), []);
});
