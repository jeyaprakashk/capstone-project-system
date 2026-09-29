const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {parseHTML}=require('linkedom');
const {randomUUID}=require('node:crypto');
function fixture() {
 const {document}=parseHTML('<html><body><section id="studentWeeklyProgress"><div data-weekly-read><span>Skeleton</span></div><p data-weekly-status></p><button data-weekly-refresh>Refresh weekly progress</button><div data-weekly-form></div></section></body></html>');
 const host=document.querySelector('section'),requests=[];let starts=0,finishes=0;
 const context=vm.createContext({document,Date,crypto:{randomUUID},byId:id=>document.getElementById(id),
  escapeClientHtml:value=>String(value??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),errorMessage:e=>e.message,
  dialogs:{ask:async()=>true},beginContentLoading:(target,label,options)=>{assert.equal(target,host);assert.equal(options.compact,true);starts++;target.setAttribute('aria-busy','true');let done=false;return()=>{if(!done){finishes++;done=true;target.setAttribute('aria-busy','false');}};},
  dashboardRun:()=>{const req={};const chain={withSuccessHandler(fn){req.success=fn;return chain;},withFailureHandler(fn){req.failure=fn;return chain;},loadStudentWeeklyProgress(){req.method='load';requests.push(req);},submitWeeklyProgress(input){req.method='save';req.input=input;requests.push(req);}};return chain;}
 });
 const source=fs.readFileSync('dashboard-client-scripts.js','utf8');
 vm.runInContext(source.slice(source.indexOf('  function errorMessage('),source.indexOf('  // Session-only diagnostics:')),context);
 vm.runInContext(source.slice(source.indexOf('  const weeklyFields ='),source.indexOf('  function refreshGithubStatus(')),context);
 const data={ready:true,eligibleFrom:'W1',timezone:'Asia/Kolkata',summary:{expectedWeeks:1,missing:0},history:[],message:'',
  actions:[{weekId:'W1',overdue:false,deadline:'2026-01-05T18:00:00Z',cutoff:'2026-01-14T23:59:59Z'}]};
 function form() {const el=host.querySelector('form');const elements=Array.from(el.querySelectorAll('textarea,button'));elements.forEach(e=>{if(e.name)elements[e.name]=e;});Object.defineProperty(el,'elements',{value:elements,configurable:true});el.reportValidity=()=>true;return el;}
 return {c:context,document,host,requests,data,form,counts:()=>[starts,finishes],load:()=>context.loadWeeklyProgress(),reply:(d=data)=>requests.at(-1).success(d)};
}

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
 assert.equal(f.c.errorMessage(null),'The server did not provide error details');
});

test('weekly save retains text and request identity on failure, prevents duplicate clicks, and refreshes after success',()=>{
 const f=fixture();f.load();f.reply();const form=f.form();
 for(const name of ['workCompleted','guideDiscussion','blockers','nextAction'])form.elements[name].value='Notes';
 const event={preventDefault(){}};
 f.c.submitWeeklyProgress(event,form);f.c.submitWeeklyProgress(event,form);
 assert.equal(f.requests.filter(r=>r.method==='save').length,1);const first=f.requests.at(-1);
 assert.equal(first.input.email,undefined);assert.equal(first.input.weekId,undefined);assert.equal(first.input.submittedAt,undefined);
 first.failure(Error('network'));assert.equal(form.elements.workCompleted.value,'Notes');assert(!form.elements.workCompleted.disabled);
 f.c.submitWeeklyProgress(event,form);assert.equal(f.requests.at(-1).input.requestId,first.input.requestId);
 f.requests.at(-1).success({message:'Saved',weekId:'W1',entryStatus:'SUBMITTED',timeliness:'ON_TIME'});
 assert.equal(f.requests.at(-1).method,'load');assert.equal(form.weeklyDirty,false);f.reply();assert.deepEqual(f.counts(),[2,2]);
});

test('overdue requires explicit selection, stale forms disable without dropping text, history escapes content',async()=>{
 const f=fixture();f.data.actions[0].overdue=true;f.data.history=[{weekId:'W1',entryStatus:'MISSED',timeliness:'MISSED',recordedAt:'2026-01-08T00:00:00Z',firstSubmittedAt:'',workCompleted:'<script>bad()</script>'}];
 f.load();f.reply();assert.equal(f.host.querySelector('form'),null);assert.equal(f.host.querySelector('script'),null);
 await f.c.chooseWeeklyAction(f.host.querySelector('[data-week]'));const form=f.form();assert.equal(form.dataset.overdue,'true');
 form.elements.workCompleted.value='Retain';f.load();f.reply({...f.data,actions:[]});
 assert.equal(form.elements.workCompleted.value,'Retain');assert.equal(form.elements.workCompleted.disabled,true);
 assert.match(f.host.querySelector('[data-weekly-status]').textContent,/no longer available/);
});

test('superseded weekly responses cannot render into a replacement dashboard',()=>{
 const f=fixture();f.load();const read=f.requests.at(-1);f.host.remove();read.success(f.data);
 assert.equal(f.host.querySelector('form'),null);assert.deepEqual(f.counts(),[1,1]);
});

test('GitHub evidence renders safe details, neutral mapping, zero and failure states independently',()=>{
 const f=fixture();f.data.evidence=[{weekId:'W1',state:'available',count:1,commits:[{timestamp:'2026-01-02T12:00:00Z',message:'<script>bad()</script>',shortSha:'abcdef0',url:'https://github.com/org/team/commit/'+'a'.repeat(40)}]}];
 f.load();f.reply();f.form();const panel=f.host.querySelector('[data-weekly-github]');
 assert.match(panel.textContent,/GitHub Activity · Week 01/);assert.match(panel.textContent,/1 commits this week/);
 assert.equal(panel.querySelector('script'),null);assert.equal(panel.querySelector('a').textContent,'abcdef0');
 assert.equal(panel.querySelector('a').getAttribute('rel'),'noopener noreferrer');
 assert.match(panel.querySelector('time').textContent,/2 Jan/);
 for(const [state,count,message] of [['available',0,/No GitHub activity recorded for you this week/],['unmapped',null,/mapping is unavailable or unverified/],['unavailable',null,/activity is unavailable/]]) {
  f.data.evidence=[{weekId:'W1',state,count,commits:[]}];f.load();f.reply();assert.match(panel.textContent,message);
  if(state!=='available')assert(!panel.textContent.includes('0 commits'));
 }
});

test('GitHub evidence switches to explicitly selected overdue week and survives refresh failure',async()=>{
 const f=fixture();f.data.actions.push({...f.data.actions[0],weekId:'W0',overdue:true});
 f.data.evidence=[{weekId:'W1',state:'available',count:0,commits:[]},{weekId:'W0',state:'unmapped',count:null,commits:[]}];
 f.load();f.reply();await f.c.chooseWeeklyAction(f.host.querySelector('[data-week="W0"]'));
 const panel=f.host.querySelector('[data-weekly-github]');assert.match(panel.textContent,/Week 00/);const before=panel.innerHTML;
 f.load();f.requests.at(-1).failure(Error('offline'));assert.equal(panel.innerHTML,before);
});


test('weekly form shows configured range, concise deadlines, accessible guidance and submit label',()=>{
 const f=fixture();
 f.c.Date=class extends Date {static now(){return Date.parse('2026-09-29T00:00:00Z');}};
 f.host.dataset.weeklyWindows=JSON.stringify([{weekId:'W1',opens:Date.parse('2026-09-28T00:00:00+05:30'),closes:Date.parse('2026-10-02T23:59:59+05:30')}]);
 f.data.actions[0].deadline='2026-10-02T18:00:00+05:30';f.data.actions[0].cutoff='2026-10-05T18:00:00+05:30';
 f.load();f.reply();const form=f.form();
 assert.equal(form.querySelector('h3').textContent,'Week 01 '+String.fromCharCode(183)+' 28 Sep '+String.fromCharCode(8211)+' 2 Oct');
 assert.match(form.querySelector('[data-weekly-dates]').textContent,/Due: 2 Oct.*Late submission until: 5 Oct/);
 assert.equal(form.querySelector('[data-weekly-state]').textContent,'OPEN');
 assert.equal(form.querySelector('[type="submit"]').textContent,'Submit Week 01 Progress');
 assert.equal(form.querySelector('[name="evidenceLinks"]'),null);
 for(const input of form.querySelectorAll('textarea')) {
  assert(input.hasAttribute('required'));assert.equal(input.getAttribute('maxlength'),'10000');assert(input.getAttribute('placeholder'));
  assert(f.document.getElementById(input.getAttribute('aria-describedby')));
 }
 assert.equal(form.querySelectorAll('textarea').length,4);
 assert(!f.host.textContent.includes(' ? '));assert(!f.host.textContent.includes('Evidence Link(s)'));
});

test('status and update label refresh without replacing unsaved input or changing immutable timeliness',()=>{
 const f=fixture();f.load();f.reply();const form=f.form();form.elements.workCompleted.value='Unsaved changes';
 for(const [state,timing,expected] of [['SUBMITTED','ON_TIME','SUBMITTED'],['REVISED','ON_TIME','REVISED'],['REVISED','LATE','REVISEDLATE']]) {
  f.data.history=[{id:'entry',weekId:'W1',entryStatus:state,timeliness:timing,recordedAt:'2026-01-05T00:00:00Z',firstSubmittedAt:'2026-01-05T00:00:00Z'}];
  f.load();f.reply();
  assert.equal(f.host.querySelector('form'),form);assert.equal(form.elements.workCompleted.value,'Unsaved changes');
  assert.equal(form.querySelector('[data-weekly-state]').textContent,expected);
  assert.equal(form.querySelector('[type="submit"]').textContent,'Update Week 01 Progress');
 }
});
