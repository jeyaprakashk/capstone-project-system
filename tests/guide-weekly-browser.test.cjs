const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {parseHTML}=require('linkedom');
function fixture() {
  const {document}=parseHTML('<html><body><section id="guideWeeklyProgress"><p id="guide-weeklyUpdated"></p><button>Refresh</button><p data-guide-weekly-status></p><div data-guide-weekly-read>Initial skeleton</div></section></body></html>');
  const requests=[];let starts=0,finishes=0;
  const c=vm.createContext({document,Date,DashboardUI:{beginContentLoading:(target,label,options)=>{
    starts++;assert.equal(options.compact,true);target.setAttribute('aria-busy','true');let done=false;
    return()=>{if(!done){done=true;finishes++;target.removeAttribute('aria-busy');}};
  },guideRun:()=>{const request={};const runner=new Proxy({withSuccessHandler(fn){request.success=fn;return runner;},withFailureHandler(fn){request.failure=fn;return runner;}},{get(target,key){return target[key]||((...args)=>{request.method=key;request.args=args;requests.push(request);});}});return runner;}}});
  vm.runInContext(fs.readFileSync('guide-weekly-client.js','utf8'),c);
  new vm.Script(c.getGuideWeeklyClientScript_());const api=c.guideWeeklyBrowser_();
  const data={weeks:['W2','W1'],checkedAt:'2026-01-08T12:00:00Z',timezone:'Asia/Kolkata',entries:[
    {entryId:'e2',weekId:'W2',student:'Student <script>alert(1)</script>',regNo:'001',discussion:'Measured <b>signal</b>',status:'PENDING',score:null},
    {entryId:'e1',weekId:'W1',student:'Student',regNo:'001',discussion:'Decision',status:'DISCUSSED',score:0}]};
  return {api,c,document,requests,data,host:document.getElementById('guideWeeklyProgress'),counts:()=>[starts,finishes],reply:()=>requests.at(-1).success(data)};
}

test('guide list defaults latest week, escapes content, renders absent score and uses shared buttons',()=>{
  const f=fixture();f.api.load();f.api.load();assert.equal(f.requests.length,1);f.reply();
  assert.equal(f.host.week,'W2');assert.equal(f.host.querySelectorAll('[data-entry]').length,1);
  assert.match(f.host.textContent,/—/);assert.match(f.host.textContent,/PENDING/);assert.equal(f.host.querySelector('script'),null);
  assert.equal(f.host.querySelector('[data-entry] b'),null);
  assert.match(f.host.querySelector('#guide-weeklyUpdated').textContent,/Updated/);
  f.host.querySelectorAll('[data-sign],[data-details]').forEach(button=>assert.match(button.className,/app-btn btn-sm/));
  const select=f.host.querySelector('[data-week]');select.onchange({target:{value:'W1'}});
  assert.match(f.host.textContent,/0\/10/);assert.equal(f.host.querySelector('[data-sign="DISCUSSED"]').getAttribute('aria-pressed'),'true');
  assert.deepEqual(f.counts(),[1,1]);
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
  button.onclick();button.onclick();assert.equal(f.requests.length,2);assert.equal(f.requests[1].method,'submitWeeklyGuideSignoff');
  assert.deepEqual(Array.from(f.requests[1].args),['e2','NOT_DISCUSSED']);
  f.requests[1].failure(Error('stale entry'));assert.equal(f.host.busy,false);assert.match(f.host.textContent,/stale entry/);
  button.onclick();f.requests[2].success({status:'NOT_DISCUSSED',message:'Saved; revisions frozen.'});
  button=f.host.querySelector('[data-sign="NOT_DISCUSSED"]');assert.equal(button.getAttribute('aria-pressed'),'true');assert.match(f.host.textContent,/revisions frozen/);
});

test('details use shared loading, escape logs, expose ratings and commit date/message/SHA, and recover failures',()=>{
  const f=fixture();f.api.load();f.reply();const button=f.host.querySelector('[data-details]');
  button.onclick();button.onclick();assert.equal(f.requests.length,2);assert.equal(f.requests[1].method,'loadGuideWeeklyProgressDetails');
  f.requests[1].failure(Error('offline'));assert.equal(f.host.busy,false);assert.match(f.host.textContent,/reopen View Details/);
  button.onclick();button.onclick();assert.equal(f.requests.length,3);
  const sha='4fa79515b076b1fc2ca764338761bb347e4f547c',url='https://github.com/org/team/commit/'+sha;
  f.requests[2].success({workCompleted:'<img src=x>',guideDiscussion:'Decision',blockers:'None',nextAction:'Measure',analysis:{score:7,comment:'Concrete work',technical_substance:'HIGH',specificity:'HIGH',outcome:'MEDIUM',next_action:'HIGH',github_support:'LOW'},timezone:'Asia/Kolkata',evidence:{state:'available',commits:[{timestamp:'2026-01-02T12:00:00Z',message:'Added plots',sha,shortSha:sha.slice(0,7),url}]}});
  assert.equal(f.host.querySelector('img'),null);assert.match(f.host.textContent,/7\/10/);assert.match(f.host.textContent,/Technical substance/);
  assert.match(f.host.textContent,/Added plots \| 4fa7951/);assert.match(f.host.textContent,/2026/);assert.deepEqual(f.counts(),[3,3]);
  const link=f.host.querySelector('[data-detail-row] a');
  assert.equal(link.textContent,'4fa7951');assert.equal(link.getAttribute('href'),url);
  assert.equal(link.getAttribute('target'),'_blank');assert.equal(link.getAttribute('rel'),'noopener noreferrer');
  assert(!f.host.textContent.includes(sha));
  button.onclick();button.onclick();assert.equal(f.requests.length,3);
});

test('empty guide list and unavailable details never invent an AI score or commit count',()=>{
  const f=fixture();f.api.load();f.requests[0].success({...f.data,entries:[],weeks:[]});assert.match(f.host.textContent,/No weekly submissions/);
  f.api.load();f.reply();f.host.querySelector('[data-details]').onclick();
  f.requests.at(-1).success({evidence:{state:'unavailable'},timezone:'Asia/Kolkata'});assert.match(f.host.textContent,/GitHub evidence unavailable/);assert(!f.host.textContent.includes('0/10'));
});

test('long discussions stay compact in the table',()=>{
  const f=fixture();f.data.entries[0].discussion='x'.repeat(1000);f.api.load();f.reply();
  const text=f.host.querySelector('[data-entry] td').textContent;assert.match(text,/x{240}…/);assert(text.length<260);
});

function setupFixture() {
  const f=fixture();f.host.id='weeklyPhase2Setup';f.host.innerHTML='<div data-weekly-setup-read>Skeleton</div><p data-weekly-setup-status></p>';
  f.c.DashboardUI.beginContentLoading=()=>()=>{};
  f.api=f.c.weeklyPhase2SetupBrowser_();
  f.report={storageReady:false,triggerReady:false,canSetupStorage:true,canSetupTriggers:false,issues:[]};return f;
}

test('weekly setup hides each completed action and rechecks after setup without duplicate requests',()=>{
  const f=setupFixture();f.api.load();f.api.load();assert.equal(f.requests.length,1);f.requests[0].success(f.report);
  let buttons=f.host.querySelectorAll('button');assert.equal(buttons.length,2);assert.equal(buttons[0].disabled,false);assert.equal(buttons[1].disabled,true);
  buttons[0].onclick();buttons[0].onclick();assert.equal(f.requests.length,2);assert.equal(f.requests[1].method,'setupWeeklyProgressPhase2Storage');
  f.requests[1].success({ok:true});assert.equal(f.requests[2].method,'getWeeklyProgressPhase2Readiness');
  f.requests[2].success({...f.report,storageReady:true,canSetupStorage:false,canSetupTriggers:true});
  buttons=f.host.querySelectorAll('button');assert.equal(buttons.length,1);assert.match(buttons[0].textContent,/schedule/);
  buttons[0].onclick();assert.equal(f.requests[3].method,'setupWeeklyProgressPhase2Triggers');f.requests[3].success({ok:true});
  f.requests[4].success({...f.report,storageReady:true,triggerReady:true,canSetupStorage:false});assert.equal(f.host.querySelectorAll('button').length,0);
});

test('weekly setup read failures preserve content; failed mutations settle and allow retry',()=>{
  const f=setupFixture();f.api.load();f.requests[0].success(f.report);const button=f.host.querySelector('button');
  f.api.load();f.requests[1].failure(Error('offline'));assert.equal(f.host.querySelector('button'),button);assert.equal(button.disabled,false);
  assert.match(f.host.textContent,/Recheck/);f.api.load();f.requests[2].success(f.report);assert(!f.host.textContent.includes('offline'));
  f.host.querySelector('button').onclick();f.requests[3].failure(Error('denied'));f.requests[4].success(f.report);
  assert.match(f.host.textContent,/Setup stopped: denied/);assert.equal(f.host.querySelector('button').disabled,false);
});
