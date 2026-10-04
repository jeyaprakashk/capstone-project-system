// Student weekly view: ported from the former DashboardUI weekly module; reads and saves now use the data bridge.
const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {parseHTML}=require('linkedom');
const {randomUUID}=require('node:crypto');

const {Sync}=require('./sync-promise.cjs');

function fixture() {
 const {document,window}=parseHTML('<html><body><section id="studentWeeklyProgress"><div data-weekly-read><span>Skeleton</span></div><p data-weekly-status></p><button data-weekly-refresh>Refresh weekly progress</button><div data-weekly-form></div></section></body></html>');
 const host=document.querySelector('section'),requests=[];let starts=0,finishes=0;
 const bridge={
  read:(key,method)=>{const p=new Sync();requests.push({method:'load',success:v=>p.resolve(v),failure:e=>p.reject(e)});return p;},
  write:(method,args)=>{const p=new Sync();requests.push({method:'save',input:args[0],success:v=>p.resolve(v),failure:e=>p.reject(e)});return p;}
 };
 const ui={ask:async()=>true,openContentDrawer(){},renderIcon:name=>'<svg data-icon="'+name+'" aria-hidden="true"></svg>',
  beginContentLoading:(target,label,options)=>{assert.equal(target,host);assert.equal(options.compact,true);starts++;target.setAttribute('aria-busy','true');let done=false;return()=>{if(!done){finishes++;done=true;target.setAttribute('aria-busy','false');}};}};
 const context=vm.createContext({document,Date,Intl,crypto:{randomUUID}});
 vm.runInContext(fs.readFileSync('student-weekly-view.js','utf8'),context);
 const api=context.studentWeeklyViewBrowser_(bridge,()=>ui);
 const data={ready:true,eligibleFrom:'W1',timezone:'Asia/Kolkata',summary:{expectedWeeks:1,missing:0},history:[],message:'',
  evidence:['W1','W0'].map(weekId=>({weekId,state:'available',count:1,commits:[{timestamp:'2026-01-02T12:00:00Z',message:'Project work',shortSha:'abcdef0',url:'https://github.com/org/team/commit/'+'a'.repeat(40)}]})),
  actions:[{weekId:'W1',state:'OPEN',editable:true,deadline:'2026-01-05T18:00:00Z',cutoff:'2026-01-14T23:59:59Z'}]};
 function form() {const el=host.querySelector('form');const elements=Array.from(el.querySelectorAll('textarea,button'));elements.forEach(e=>{if(e.name)elements[e.name]=e;});Object.defineProperty(el,'elements',{value:elements,configurable:true});el.reportValidity=()=>true;return el;}
 return {c:context,api,ui,document,host,requests,data,form,counts:()=>[starts,finishes],load:()=>api.load(),reply:(d=data)=>requests.at(-1).success({...d,weeks:d.weeks || d.actions}),
  click:async target=>{target.dispatchEvent(new window.Event('click',{bubbles:true,cancelable:true}));await new Promise(r=>setImmediate(r));},
  submit:formElement=>formElement.dispatchEvent(new window.Event('submit',{bubbles:true,cancelable:true}))};
}

test('guide confirmation makes a submitted week read-only with an explicit explanation',()=>{
 const f=fixture();f.data.history=[{weekId:'W1',entryStatus:'SUBMITTED',timeliness:'ON_TIME',workCompleted:'Saved',guideDiscussion:'Decision',blockers:'None',nextAction:'Next'}];
 f.data.weeks=[{...f.data.actions[0],state:'SUBMITTED ON TIME',editable:false,guideFrozen:true}];f.data.actions=[];
 f.load();f.reply();assert.equal(f.host.querySelector('[data-weekly-edit]'),null);assert.equal(f.host.querySelector('form'),null);
 assert.match(f.host.textContent,/Guide confirmed; further revisions are frozen/);assert.match(f.host.textContent,/Saved/);
});

test('weekly status uses spreadsheet calendar days and changes to danger after the deadline',()=>{
 const f=fixture(),deadline='2026-10-02T17:00:00+05:30';
 for(const [now,tone] of [['2026-09-30T23:59:59+05:30','success'],['2026-10-01T00:00:00+05:30','warning'],['2026-10-02T17:00:00+05:30','warning'],['2026-10-02T17:00:00.001+05:30','danger']]) {
  f.data.checkedAt=now;f.data.actions[0].deadline=deadline;f.load();f.reply();f.form();
  assert.equal(f.host.querySelector('[data-weekly-state] [data-tone]').dataset.tone,tone);
 }
 assert.equal(f.api.statusTone('SUBMITTED ON TIME',deadline,'Asia/Kolkata',Date.parse('2026-10-03')), 'success');
 assert.equal(f.api.statusTone('LATE',deadline,'Asia/Kolkata',Date.parse('2026-10-03')), 'danger');
});

test('commit count is a collapsed native disclosure between the week header and form',()=>{
 const f=fixture();f.load();f.reply();
 const panel=f.host.querySelector('[data-weekly-github]'),details=panel.querySelector('details');
 assert.equal(panel.previousElementSibling.hasAttribute('data-weekly-header'),true);
 assert.equal(panel.nextElementSibling.hasAttribute('data-weekly-form'),true);
 assert.equal(details.hasAttribute('open'),false);
 assert.equal(details.querySelector('summary').textContent,'1 commit this week');
 assert.match(details.querySelector('ul').textContent,/Project work/);
 assert.equal(details.querySelector('a').textContent,'abcdef0');
 assert.equal(panel.querySelector('[data-weekly-github-refresh]').closest('details'),null);
});

test('submitted summary supports prefilled editing, cancel confirmation, and save recovery',async()=>{
 const f=fixture();f.data.history=[{weekId:'W1',entryStatus:'SUBMITTED',timeliness:'ON_TIME',workCompleted:'Saved\ntext',guideDiscussion:'<script>Discussion</script>',blockers:'None',nextAction:'Next'}];
 f.load();f.reply();
 assert.equal(f.host.querySelector('form'),null);
 assert.equal(f.host.querySelector('[data-submission-summary]').querySelectorAll('section').length,4);
 assert.equal(f.host.querySelector('[data-submission-summary] script'),null);
 f.click(f.host.querySelector('[data-weekly-edit]'));let form=f.form();
 assert.equal(form.elements.workCompleted.value,'Saved\ntext');
 form.elements.workCompleted.value='New draft';
 f.ui.ask=async()=>false;await f.click(form.querySelector('[data-weekly-cancel]'));
 assert.equal(f.host.querySelector('form'),form);
 f.ui.ask=async()=>true;await f.click(form.querySelector('[data-weekly-cancel]'));
 assert.equal(f.host.querySelector('form'),null);
 f.click(f.host.querySelector('[data-weekly-edit]'));form=f.form();
 assert.equal(form.elements.workCompleted.value,'Saved\ntext');
 form.elements.workCompleted.value='Updated';
 f.load();f.reply();assert.equal(f.host.querySelector('form'),form);assert.equal(form.elements.workCompleted.value,'Updated');
 f.submit(form);f.requests.at(-1).failure(Error('offline'));
 assert.equal(f.host.querySelector('form'),form);assert.equal(form.elements.workCompleted.value,'Updated');
 f.submit(form);f.requests.at(-1).success({weekId:'W1',entryStatus:'REVISED',timeliness:'ON_TIME',message:'Saved'});
 assert.equal(f.host.querySelector('form'),null);assert.match(f.host.querySelector('[data-submission-summary]').textContent,/Updated/);
 f.requests.at(-1).failure(Error('refresh offline'));assert.match(f.host.querySelector('[data-submission-summary]').textContent,/Updated/);
});

test('saved summaries stay readable while evidence and deadline restrictions prevent editing',()=>{
 for(const restriction of ['deadline','evidence','readiness']) {
  const f=fixture();f.data.history=[{weekId:'W1',entryStatus:'SUBMITTED',timeliness:'LATE',workCompleted:'Saved answer'}];
  f.data.weeks=[{...f.data.actions[0],state:'SUBMITTED LATE'}];
  if(restriction==='deadline')f.data.actions=[];
  if(restriction==='evidence')f.data.evidence=[{weekId:'W1',state:'available',count:0,commits:[]}];
  if(restriction==='readiness')f.data.ready=false;
  f.load();f.reply();assert.equal(f.host.querySelector('form'),null);
  assert.match(f.host.querySelector('[data-submission-summary]').textContent,/Saved answer/);
  assert.equal(f.host.querySelector('[data-weekly-edit]'),null);
 }
});

test('deadline expiry preserves the edit draft and permits returning to the saved summary',async()=>{
 const f=fixture();f.data.history=[{weekId:'W1',entryStatus:'SUBMITTED',timeliness:'ON_TIME',workCompleted:'Saved'}];
 f.load();f.reply();f.click(f.host.querySelector('[data-weekly-edit]'));const form=f.form();form.elements.workCompleted.value='Draft';
 f.data.weeks=[{...f.data.actions[0],state:'SUBMITTED ON TIME',editable:false}];f.data.actions=[];f.load();f.reply();
 assert.equal(form.elements.workCompleted.value,'Draft');assert.equal(form.elements.workCompleted.disabled,true);
 assert.equal(form.querySelector('[type="submit"]').hidden,true);
 assert.equal(form.querySelector('[data-weekly-cancel]').disabled,false);
 await f.click(form.querySelector('[data-weekly-cancel]'));
 assert.equal(f.host.querySelector('form'),null);assert.match(f.host.querySelector('[data-submission-summary]').textContent,/Saved/);
 assert.equal(f.host.querySelector('[data-weekly-edit]'),null);
});

test('backend readiness hides the weekly form and preserves drafts through a readiness change',()=>{
 const f=fixture();f.data.ready=false;f.load();f.reply();
 assert.equal(f.host.querySelector('form'),null);
 assert.equal(f.host.querySelector('[data-weekly-form]').hidden,true);
 f.data.ready=true;f.load();f.reply();const form=f.form();form.elements.workCompleted.value='Draft';
 f.data.ready=false;f.load();f.reply();
 assert.equal(f.host.querySelector('[data-weekly-form]').hidden,true);
 assert.equal(form.elements.workCompleted.value,'Draft');assert.equal(form.elements.workCompleted.disabled,true);
 f.data.ready=true;f.load();f.reply();assert.equal(f.host.querySelector('[data-weekly-form]').hidden,false);
 assert.equal(form.elements.workCompleted.value,'Draft');
});

test('personal GitHub activity stays visible before the gated form across week changes',async()=>{
 const f=fixture();f.load();f.reply();
 const check=()=>{const form=f.form(),panel=f.host.querySelector('[data-weekly-github]');
  assert(panel);assert.equal(panel.nextElementSibling,form.parentElement);
  assert.match(panel.textContent,/Your GitHub activity/);
  assert.equal(f.host.querySelectorAll('[data-weekly-github]').length,1);};
 check();f.data.actions.push({...f.data.actions[0],weekId:'W0',state:'LATE'});f.load();f.reply();
 await f.click(f.host.querySelector('[data-week="W0"]'));check();
});

test('weekly read deduplicates, preserves unsaved form and history on failed refresh, and retries',()=>{
 const f=fixture();f.load();f.load();assert.equal(f.requests.length,1);f.reply();
 const form=f.form();form.elements.workCompleted.value='Unsaved';form.weeklyDirty=true;
 const old=f.host.querySelector('[data-weekly-read]').innerHTML;
 f.load();f.requests.at(-1).failure(Error('offline'));
 assert.equal(form.elements.workCompleted.value,'Unsaved');assert.equal(f.host.querySelector('[data-weekly-read]').innerHTML,old);
 assert.match(f.host.querySelector('[data-weekly-status]').textContent,/retry/);assert.equal(f.host.querySelector('[data-weekly-refresh]').disabled,false);
 f.load();f.reply();assert.equal(f.host.querySelector('form'),form);assert.equal(form.elements.workCompleted.value,'Unsaved');assert.deepEqual(f.counts(),[3,3]);
});

test('weekly refresh retains string errors and clears the failure after a successful retry',()=>{
 const f=fixture();
 f.load();f.requests.at(-1).failure('Permission denied');
 assert.match(f.host.querySelector('[data-weekly-status]').textContent,/Permission denied/);
 assert.equal(f.host.weeklyBusy,false);
 f.load();f.reply();assert.equal(f.host.querySelector('[data-weekly-status]').textContent,'');
 f.load();f.requests.at(-1).failure(null);assert.match(f.host.querySelector('[data-weekly-status]').textContent,/The server did not provide error details/);
});

test('weekly save retains text and request identity on failure, prevents duplicate clicks, and refreshes after success',()=>{
 const f=fixture();f.load();f.reply();const form=f.form();
 for(const name of ['workCompleted','guideDiscussion','blockers','nextAction'])form.elements[name].value='Notes';
 const event={preventDefault(){}};
 f.submit(form);f.submit(form);
 assert.equal(f.requests.filter(r=>r.method==='save').length,1);const first=f.requests.at(-1);
 assert.equal(first.input.email,undefined);assert.equal(first.input.weekId,'W1');assert.equal(first.input.submittedAt,undefined);
 first.failure(Error('network'));assert.equal(form.elements.workCompleted.value,'Notes');assert(!form.elements.workCompleted.disabled);
 f.submit(form);assert.equal(f.requests.at(-1).input.requestId,first.input.requestId);
 f.requests.at(-1).success({message:'Saved',weekId:'W1',entryStatus:'SUBMITTED',timeliness:'ON_TIME'});
 assert.equal(f.requests.at(-1).method,'load');assert.equal(form.weeklyDirty,false);f.reply();assert.deepEqual(f.counts(),[2,2]);
});

test('LATE opens the same form automatically; frozen forms retain text and hide submit; history escapes content',async()=>{
 const f=fixture();f.data.actions[0].state='LATE';f.data.history=[{weekId:'W0',entryStatus:'SUBMITTED',timeliness:'ON_TIME',recordedAt:'2026-01-01T00:00:00Z',firstSubmittedAt:'2026-01-01T00:00:00Z',workCompleted:'<script>bad()</script>'}];
 f.load();f.reply();assert.equal(f.host.querySelector('script'),null);
 const form=f.form();assert.equal(form.dataset.week,'W1');assert.match(f.host.querySelector('[data-weekly-state]').textContent,/LATE · Submission available until/);
 form.elements.workCompleted.value='Retain';f.load();f.reply({...f.data,actions:[]});
 assert.equal(form.elements.workCompleted.value,'Retain');assert.equal(form.elements.workCompleted.disabled,true);
 assert.equal(form.querySelector('[type="submit"]').hidden,true);
 assert.match(f.host.querySelector('[data-weekly-status]').textContent,/no longer available/);
});

test('superseded weekly responses cannot render into a replacement dashboard',()=>{
 const f=fixture();f.load();const read=f.requests.at(-1);f.host.remove();read.success(f.data);
 assert.equal(f.host.querySelector('form'),null);assert.deepEqual(f.counts(),[1,1]);
});

test('GitHub evidence renders safe details, neutral mapping, zero and failure states independently',()=>{
 const f=fixture();f.data.evidence=[{weekId:'W1',state:'available',count:1,commits:[{timestamp:'2026-01-02T12:00:00Z',message:'<script>bad()</script>',shortSha:'abcdef0',url:'https://github.com/org/team/commit/'+'a'.repeat(40)}]}];
 f.load();f.reply();f.form();const panel=f.host.querySelector('[data-weekly-github]');
 assert.match(panel.textContent,/Your GitHub activity · Week 01/);
 assert.equal(panel.querySelector('script'),null);assert.equal(panel.querySelector('a').textContent,'abcdef0');
 assert.equal(panel.querySelector('a').getAttribute('rel'),'noopener noreferrer');
 assert.match(panel.querySelector('time').textContent,/2 Jan/);
 for(const [state,count,message] of [['available',0,/No GitHub activity found for you this week/],['unmapped',null,/mapping is unavailable or unverified/],['unavailable',null,/activity is unavailable/]]) {
  f.data.evidence=[{weekId:'W1',state,count,commits:[]}];f.load();f.reply();assert.match(panel.textContent,message);
  if(state!=='available')assert(!panel.textContent.includes('0 commits'));
 }
});

test('GitHub evidence switches to a selected late week and survives refresh failure',async()=>{
 const f=fixture();f.data.actions.push({...f.data.actions[0],weekId:'W0',state:'LATE'});
 f.data.evidence=[{weekId:'W1',state:'available',count:0,commits:[]},{weekId:'W0',state:'unmapped',count:null,commits:[]}];
 f.load();f.reply();await f.click(f.host.querySelector('[data-week="W0"]'));
 const panel=f.host.querySelector('[data-weekly-github]');assert.match(panel.textContent,/Week 00/);const before=panel.innerHTML;
 f.load();f.requests.at(-1).failure(Error('offline'));assert.equal(panel.innerHTML,before);
});


test('weekly form shows configured range, concise deadlines, accessible guidance and submit label',()=>{
 const f=fixture();
 f.c.Date=class extends Date {static now(){return Date.parse('2026-09-29T00:00:00Z');}};
 f.data.actions[0].opens='2026-09-28T00:00:00+05:30';
 f.data.actions[0].deadline='2026-10-02T18:00:00+05:30';f.data.actions[0].cutoff='2026-10-05T18:00:00+05:30';
 f.load();f.reply();const form=f.form();
 assert.equal(f.host.querySelector('h4[data-weekly-heading]').textContent,'Week 01 '+String.fromCharCode(183)+' 28 Sep '+String.fromCharCode(8211)+' 2 Oct');
 assert.match(f.host.querySelector('[data-weekly-dates]').textContent,/Due 2 Oct/);
 assert(f.host.querySelector('[data-weekly-dates]').textContent.includes('Late submission until'));
 assert.equal(f.host.querySelector('[data-weekly-state]').textContent,'OPEN · Not submitted');
 assert.equal(form.querySelector('[type="submit"]').textContent,'Submit Week 01 Progress');
 assert.equal(form.querySelector('[name="evidenceLinks"]'),null);
 for(const input of form.querySelectorAll('textarea')) {
  assert(input.hasAttribute('required'));assert.equal(input.getAttribute('maxlength'),'10000');assert(input.getAttribute('placeholder'));
  assert.equal(input.hasAttribute('aria-describedby'),false);
 }
 assert.equal(form.querySelectorAll('textarea').length,4);
 assert(!f.host.textContent.includes(' ? '));assert(!f.host.textContent.includes('Evidence Link(s)'));
});

test('status and update label refresh without replacing unsaved input or changing immutable timeliness',()=>{
 const f=fixture();f.load();f.reply();const form=f.form();form.elements.workCompleted.value='Unsaved changes';
 for(const [state,timing,expected] of [['SUBMITTED','ON_TIME','SUBMITTED ON TIME'],['REVISED','ON_TIME','SUBMITTED ON TIME'],['REVISED','LATE','SUBMITTED LATE']]) {
  f.data.history=[{id:'entry',weekId:'W1',entryStatus:state,timeliness:timing,recordedAt:'2026-01-05T00:00:00Z',firstSubmittedAt:'2026-01-05T00:00:00Z'}];
  f.load();f.reply();
  assert.equal(f.host.querySelector('form'),form);assert.equal(form.elements.workCompleted.value,'Unsaved changes');
  assert.equal(f.host.querySelector('[data-weekly-state]').textContent,expected);
  assert.equal(form.querySelector('[type="submit"]').textContent,'Update Week 01 Progress');
 }
});

test('OPEN to LATE preserves the same draft form and submits its selected Week ID',()=>{
 const f=fixture();f.load();f.reply();const form=f.form();
 for(const name of ['workCompleted','guideDiscussion','blockers','nextAction'])form.elements[name].value='Preserved draft';
 f.data.actions[0].state='LATE';f.load();f.reply();
 assert.equal(f.host.querySelector('form'),form);assert.equal(form.elements.workCompleted.value,'Preserved draft');
 assert.match(f.host.querySelector('[data-weekly-state]').textContent,/LATE · Submission available until/);
 assert.equal(form.querySelector('[type="submit"]').textContent,'Submit Week 01 Progress');
 f.submit(form);
 assert.deepEqual(Object.keys(f.requests.at(-1).input).sort(),['blockers','guideDiscussion','nextAction','requestId','weekId','workCompleted']);
 assert.equal(f.requests.at(-1).input.weekId,'W1');
});

test('submitted reports freeze without an Update button and remain readable after reload',()=>{
 for(const timeliness of ['ON_TIME','LATE']) {
  const f=fixture();f.load();f.reply();const form=f.form();form.elements.workCompleted.value='Draft kept';
  const state=timeliness==='ON_TIME'?'SUBMITTED ON TIME':'SUBMITTED LATE';
  f.data.history=[{weekId:'W1',entryStatus:'REVISED',timeliness,recordedAt:'2026-01-05T00:00:00Z',firstSubmittedAt:'2026-01-02T00:00:00Z',workCompleted:'Saved work'}];
  f.data.weeks=[{...f.data.actions[0],state,editable:false}];f.data.actions=[];
  f.load();f.reply();assert.equal(form.elements.workCompleted.value,'Draft kept');assert.equal(form.elements.workCompleted.disabled,true);
  assert.equal(form.querySelector('[type="submit"]').hidden,true);assert.equal(f.host.querySelector('[data-weekly-state]').textContent,state);
  form.remove();f.load();f.reply();assert.equal(f.host.querySelector('form'),null);
  assert(f.host.querySelector('[data-weekly-read]').textContent.includes(state));
  let content;f.ui.openContentDrawer=(title,html)=>{content=html;};f.api.openActivity();assert(content.includes('Saved work'));
 }
});

test('MISSED weeks have no editable form or action button',()=>{
 const f=fixture();f.data.weeks=[{...f.data.actions[0],state:'MISSED',editable:false}];f.data.actions=[];
 f.load();f.reply();assert.equal(f.host.querySelector('form'),null);assert.equal(f.host.querySelector('button[data-week]'),null);
 assert.match(f.host.querySelector('[data-weekly-read]').textContent,/Week 01 · MISSED/);
});

test('simple weekly layout avoids a redundant week selector, empty history and repeated guidance',()=>{
 const f=fixture();f.load();f.reply();const form=f.form();
 assert.equal(f.host.querySelector('button[data-week]'),null);
 assert(!f.host.textContent.includes('Expected weeks:'));
 assert.equal(f.host.querySelector('[data-weekly-history]'),null);
 assert.equal(f.host.querySelector('[data-weekly-github] details').hasAttribute('open'),false);
 assert.equal(form.querySelector('.weekly-helper'),null);
 assert.equal(form.querySelector('textarea[aria-describedby]'),null);
 f.data.history=[{weekId:'W1',entryStatus:'SUBMITTED',timeliness:'ON_TIME',recordedAt:'2026-01-02T12:00:00Z',firstSubmittedAt:'2026-01-02T12:00:00Z'}];
 f.load();f.reply();const history=f.host.querySelector('[data-weekly-history]');
 assert.equal(history,null);
});

test('recent logs own submission history and open details in the shared drawer',()=>{
 const f=fixture(),recent=f.document.createElement('div');recent.id='studentRecentActivity';f.document.body.appendChild(recent);
 f.data.checkedAt='2026-01-03T00:00:00Z';
 f.data.allWeeks=[{weekId:'W1',opens:'2026-01-01T00:00:00Z',deadline:'2026-01-05T00:00:00Z'},{weekId:'W2',opens:'2026-01-08T00:00:00Z',deadline:'2026-01-12T00:00:00Z'}];
 f.data.history=[{weekId:'W1',entryStatus:'SUBMITTED',timeliness:'ON_TIME',recordedAt:'2026-01-02T00:00:00Z',workCompleted:'<script>unsafe</script>'},{weekId:'W1',entryStatus:'REVISED',timeliness:'ON_TIME',recordedAt:'2026-01-02T12:00:00Z',workCompleted:'Revised work'}];
 f.load();f.reply();
 assert.equal(recent.querySelectorAll('[data-activity-row]').length,1);
 assert.match(recent.textContent,/Submitted on time/);
 assert.equal(f.host.querySelector('[data-weekly-history]'),null);
 let content;f.ui.openContentDrawer=(title,html)=>{assert.equal(title,'All weekly logs');content=html;};f.api.openActivity();
 const {document}=parseHTML('<html><body>'+content+'</body></html>');
 assert.equal(document.querySelectorAll('details').length,2);
 assert.match(document.querySelector('details').textContent,/Revised work/);
 assert.match(document.querySelector('details').textContent,/Project work/);
 assert.match(document.querySelector('[data-future]').textContent,/Week 02/);
 assert.equal(document.querySelector('script'),null);
 const saved=recent.innerHTML;f.load();f.requests.at(-1).failure(Error('offline'));assert.equal(recent.innerHTML,saved);
});

test('zero commits hide the form and expose the exact guidance and GitHub refresh action',()=>{
 const f=fixture();f.data.evidence=[{weekId:'W1',state:'available',count:0,commits:[]}];f.load();f.reply();
 assert.equal(f.host.querySelector('form'),null);assert.equal(f.host.querySelector('[data-weekly-form]').hidden,true);
 const panel=f.host.querySelector('[data-weekly-github]');assert.equal(panel.hidden,false);
 assert.equal(panel.querySelector('p').textContent,'No GitHub activity found for you this week. Commit your project work/evidence to the team repository, then refresh.');
 assert.equal(panel.querySelector('[data-weekly-github-refresh]').getAttribute('title'),'Refresh GitHub Activity');
 assert.equal(panel.querySelector('[data-weekly-github-refresh]').getAttribute('aria-label'),'Refresh GitHub Activity');
 assert.equal(panel.querySelector('[data-weekly-github-refresh]').previousElementSibling.tagName,'H5');
 assert.equal(panel.querySelector('[data-weekly-github-refresh] svg').dataset.icon,'refresh-cw');
 assert.equal(panel.querySelector('[data-weekly-github-refresh]').hasAttribute('onclick'),false);assert.equal(panel.querySelector('[data-weekly-github-refresh]').getAttribute('data-action'),'github-evidence-refresh');
 f.load();assert.equal(panel.querySelector('button').disabled,true);f.load();assert.equal(f.requests.length,2);
 f.data.evidence=[{weekId:'W1',state:'available',count:1,commits:[{timestamp:'2026-01-02T12:00:00Z',message:'Lab results',shortSha:'abcdef0',url:'https://github.com/org/team/commit/'+'a'.repeat(40)}]}];
 f.reply();assert(f.host.querySelector('form'));assert.equal(f.host.querySelector('[data-weekly-form]').hidden,false);
 assert.match(panel.textContent,/Your GitHub activity/);assert.match(panel.textContent,/Lab results/);
 assert.equal(panel.querySelector('a').textContent,'abcdef0');assert.equal(panel.querySelector('details').hasAttribute('open'),false);
});

test('mapping and collection errors hide the form without claiming zero commits',()=>{
 for(const evidence of [{weekId:'W1',state:'unmapped',count:null,commits:[]},
   {weekId:'W1',state:'unavailable',message:'Complete your GitHub username setup.',count:null,commits:[]},
   {weekId:'W1',state:'unavailable',count:null,commits:[]}]) {
  const f=fixture();f.data.evidence=[evidence];f.load();f.reply();
  assert.equal(f.host.querySelector('form'),null);assert.equal(f.host.querySelector('[data-weekly-form]').hidden,true);
  const text=f.host.querySelector('[data-weekly-github]').textContent;assert(!text.includes('No GitHub activity found'));
  assert.match(text,/unavailable|setup/);assert(!text.includes('0 commits'));
 }
 const f=fixture();f.data.ready=false;f.data.actions=[];f.data.weeks=[];
 f.data.evidence=[{weekId:'W1',state:'unmapped',count:null,commits:[]}];f.load();f.reply();
 assert.match(f.host.querySelector('[data-weekly-github]').textContent,/mapping/);
});

test('evidence loss hides and disables the draft, and a successful refresh restores its text',()=>{
 const f=fixture();f.load();f.reply();const form=f.form();form.elements.workCompleted.value='Keep my draft';
 const evidence=f.data.evidence;f.data.evidence=[{weekId:'W1',state:'unavailable',count:null,commits:[]}];f.load();f.reply();
 assert.equal(form.parentElement.hidden,true);assert.equal(form.elements.workCompleted.disabled,true);
 f.submit(form);assert.equal(f.requests.filter(r=>r.method==='save').length,0);
 const panel=f.host.querySelector('[data-weekly-github]'),before=panel.innerHTML;
 f.load();f.requests.at(-1).failure(Error('offline'));assert.equal(panel.innerHTML,before);assert.equal(form.elements.workCompleted.value,'Keep my draft');
 f.data.evidence=evidence;f.load();f.reply();assert.equal(form.parentElement.hidden,false);assert.equal(form.elements.workCompleted.disabled,false);
 assert.equal(form.elements.workCompleted.value,'Keep my draft');assert.equal(f.host.querySelector('form'),form);
});

test('week switching cannot reuse another weeks qualifying commits',async()=>{
 const f=fixture();f.data.actions.push({...f.data.actions[0],weekId:'W0',state:'LATE'});
 f.data.evidence=f.data.evidence.map(e=>e.weekId==='W0'?{...e,count:0,commits:[]}:e);
 f.load();f.reply();f.form();await f.click(f.host.querySelector('button[data-week="W0"]'));
 assert.equal(f.host.querySelector('[data-weekly-form]').hidden,true);
 assert.match(f.host.querySelector('[data-weekly-github]').textContent,/Week 00/);
 f.load();f.reply();assert.equal(f.host.querySelector('[data-weekly-form]').hidden,true);
 await f.click(f.host.querySelector('button[data-week="W1"]'));
 assert.equal(f.host.querySelector('[data-weekly-form]').hidden,false);assert.equal(f.host.querySelector('form').dataset.week,'W1');
});

test('markup uses only compiled Tailwind utilities and no inline handlers', () => {
 const {missingClasses,renderedClasses}=require('./compiled-css.cjs');
 const f=fixture();f.data.history=[{weekId:'W1',entryStatus:'SUBMITTED',timeliness:'ON_TIME',workCompleted:'Saved',guideDiscussion:'D',blockers:'None',nextAction:'N'}];
 f.data.actions.push({...f.data.actions[0],weekId:'W0',state:'LATE'});
 f.load();f.reply();
 assert.deepEqual(missingClasses(renderedClasses(f.host).filter(c=>!c.startsWith('lucide'))),[]);
 f.click(f.host.querySelector('[data-weekly-edit]'));
 assert.deepEqual(missingClasses(renderedClasses(f.host).filter(c=>!c.startsWith('lucide'))),[]);
 assert.deepEqual(Array.from(f.host.querySelectorAll('*')).flatMap(n=>Array.from(n.attributes).map(a=>a.name)).filter(name=>/^on/i.test(name)),[]);
 // the source also carries only compiled classes
 const src=fs.readFileSync('student-weekly-view.js','utf8');
 const literal=[...src.matchAll(/(?:BUTTON|PRIMARY|FIELD|BADGE) = '([^']+)'/g)].flatMap(m=>m[1].split(/\s+/));
 assert.deepEqual(missingClasses(literal),[]);
});

test('reads and saves use the bridge endpoints with the request identity the server de-duplicates on', async () => {
 const {document}=parseHTML('<html><body><section id="studentWeeklyProgress"><div data-weekly-read></div><p data-weekly-status></p><div data-weekly-form></div></section></body></html>');
 const calls=[];
 const context=vm.createContext({document,Date,Intl,crypto:{randomUUID}});
 vm.runInContext(fs.readFileSync('student-weekly-view.js','utf8'),context);
 const bridge={read:(key,method,args,options)=>{calls.push(['read',key,method,options]);return Promise.resolve({ready:false,weeks:[],actions:[],history:[],evidence:[],timezone:'Asia/Kolkata',message:'Not ready'});},
  write:(method,args)=>{calls.push(['write',method,args[0]]);return Promise.resolve({});}};
 const api=context.studentWeeklyViewBrowser_(bridge,()=>({beginContentLoading:()=>()=>{},renderIcon:()=>'',ask:async()=>true,openContentDrawer(){}}));
 api.load();await new Promise(r=>setImmediate(r));
 assert.deepEqual(calls[0].slice(0,3),['read','student-weekly','API_student_getWeekly']);
 assert.equal(calls[0][3].timeoutMs,60000);
 assert.match(document.querySelector('[data-weekly-read]').textContent,/Not ready/);
});
