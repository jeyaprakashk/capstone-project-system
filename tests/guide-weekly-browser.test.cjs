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
  assert.match(f.host.textContent,/—/);assert.match(f.host.textContent,/Awaiting Decision/);assert.match(f.host.querySelector('[data-decision-status]').className,/orange/);assert.equal(f.host.querySelector('script'),null);
  assert.equal(f.host.querySelector('[data-entry] b'),null);
  assert.match(f.host.querySelector('#guide-weeklyUpdated').textContent,/Updated/);
  f.host.querySelectorAll('[data-sign],[data-details]').forEach(button=>assert.match(button.className,/app-btn btn-sm/));
  f.host.querySelector('[data-week-step="1"]').onclick();
  assert.match(f.host.querySelector('[data-decision-status]').className,/green/);
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
  button=f.host.querySelector('[data-sign="NOT_DISCUSSED"]');assert.equal(button.getAttribute('aria-pressed'),'true');assert.match(f.host.textContent,/revisions frozen/);assert.equal(f.host.querySelector('[data-decision-status]').textContent,'Not Discussed');assert.match(f.host.querySelector('[data-decision-status]').className,/gray/);
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

test('long discussions stay compact in the card',()=>{
  const f=fixture();f.data.entries[0].discussion='x'.repeat(1000);f.api.load();f.reply();
  const text=f.host.querySelector('[data-entry] .weekly-log-answer').textContent;assert.match(text,/x{240}…/);assert(text.length<260);
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

test('team workspace filters weekly cards, preserves title drafts and retains selection after refresh',()=>{
  const f=fixture();
  const root=f.document.createElement('div');root.setAttribute('data-guide-workspace','');
  root.innerHTML=['A','B'].map(id=>'<button data-guide-select="'+id+'"></button><header data-guide-heading="'+id+'"></header><section data-guide-team="'+id+'" data-guide-students=\''+JSON.stringify([id==='A'?'001':'002'])+'\'><div data-guide-view="title"><input value="Draft '+id+'"></div><div data-guide-view="documents"></div></section>').join('')+['title','weekly','documents'].map(view=>'<button data-guide-tab="'+view+'"></button>').join('');
  f.document.body.appendChild(root);root.appendChild(f.host);
  f.data.entries.push({...f.data.entries[0],entryId:'other',regNo:'002',student:'Other student'});
  f.api.load();f.reply();
  assert.equal(f.host.hidden,true);
  const draft=root.querySelector('input');draft.value='Unsaved title';
  f.api.selectView('weekly');assert.equal(f.host.hidden,false);
  assert.equal(f.host.querySelectorAll('[data-entry]').length,1);
  assert.equal(f.host.querySelector('[data-entry]').dataset.entry,'e2');
  f.api.selectTeam('B');assert.equal(f.host.querySelector('[data-entry]').dataset.entry,'other');
  f.api.selectView('documents');assert.equal(f.host.hidden,true);
  assert.equal(root.querySelector('[data-guide-team="B"]').hidden,false);
  assert.equal(root.querySelector('[data-guide-team="A"]').hidden,true);
  f.api.load();f.requests.at(-1).failure('offline');
  assert.equal(root.querySelector('[data-guide-select="B"]').getAttribute('aria-pressed'),'true');
  f.api.selectTeam('A');f.api.selectView('title');assert.equal(draft.value,'Unsaved title');
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
  f.api.load();f.requests.at(-1).failure('offline');
  assert.equal(f.host.querySelector('[data-week-step="-1"]').disabled,true);
  f.host.querySelector('[data-week-step="1"]').onclick();assert.equal(f.host.week,'W2');
  f.host.querySelector('[data-week-step="1"]').onclick();assert.equal(f.host.week,'W1');
  assert.equal(f.host.querySelector('[data-week-step="1"]').disabled,true);
  f.host.querySelector('[data-week-step="-1"]').onclick();assert.equal(f.host.week,'W2');
});


test('tab switches preserve expanded details without requests; refresh success invalidates them',()=>{
  const f=fixture();
  const root=f.document.createElement('div');root.setAttribute('data-guide-workspace','');
  root.innerHTML='<section data-guide-team="A" data-guide-students=\'["001"]\'><div data-guide-view="title"></div><div data-guide-view="documents"></div></section>';
  f.document.body.appendChild(root);root.appendChild(f.host);
  f.api.load();f.reply();f.api.selectView('weekly');
  const button=f.host.querySelector('[data-details]');button.onclick();
  f.requests.at(-1).success({workCompleted:'Saved details',evidence:{state:'unavailable'},timezone:'Asia/Kolkata'});
  const detail=f.host.querySelector('[data-detail-row]');
  for(const view of ['title','documents','weekly'])f.api.selectView(view);
  assert.equal(f.requests.length,2);
  assert.equal(f.host.querySelector('[data-detail-row]'),detail);
  assert.equal(detail.hidden,false);assert.equal(button.getAttribute('aria-expanded'),'true');
  button.onclick();button.onclick();assert.equal(f.requests.length,2);
  f.api.load();f.requests.at(-1).failure('offline');
  assert.equal(f.host.querySelector('[data-detail-row]'),detail);assert.equal(detail.hidden,false);
  f.api.selectView('title');f.api.selectView('weekly');assert.equal(f.requests.length,3);
  f.api.load();f.reply();
  assert.notEqual(f.host.querySelector('[data-detail-row]'),detail);
  f.host.querySelector('[data-details]').onclick();
  assert.equal(f.requests.at(-1).method,'loadGuideWeeklyProgressDetails');assert.equal(f.requests.length,5);
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
  root.innerHTML=['A','B'].map((id,i)=>'<button data-guide-select="'+id+'" data-title-attention="'+(i===0)+'"><span data-team-attention></span></button><section data-guide-team="'+id+'" data-guide-students="[&quot;00'+(i+1)+'&quot;]"></section>').join('')+'<button data-guide-tab="evaluation" disabled></button>';
  f.document.body.appendChild(root);root.appendChild(f.host);
  const pill=id=>root.querySelector('[data-guide-select="'+id+'"] [data-team-attention]');
  f.api.load();f.reply();assert.equal(pill('A').textContent,'2 actions');assert.match(pill('A').title,/Title review, Weekly progress/);assert.equal(pill('B').hidden,true);assert.equal(f.requests.length,1);
  f.host.querySelector('[data-sign="DISCUSSED"]').onclick();f.requests.at(-1).success({status:'DISCUSSED',message:'Saved'});
  assert.equal(pill('A').textContent,'Title review');
  root.querySelector('[data-guide-tab="evaluation"]').disabled=false;
  f.api.load();f.reply();
  const reads=f.requests.filter(r=>r.method==='loadGuideEvaluation');assert.equal(reads.length,2);
  reads[0].success({statuses:[{status:'Draft'}]});assert.equal(pill('A').textContent,'2 actions');
  reads[1].failure('offline');assert.equal(pill('B').textContent,'Status unavailable');
  f.api.evaluationStatus('A',[{status:'Submitted'},{status:'Published'}]);assert.equal(pill('A').textContent,'Title review');
  f.api.evaluationStatus('B',[{status:'Not started'}]);assert.equal(pill('B').textContent,'Guide Evaluation');
  f.api.evaluationStatus('B',[{status:'Submitted'}]);assert.equal(pill('B').hidden,true);
  const count=f.requests.length;f.api.selectView('documents');f.api.selectView('weekly');assert.equal(f.requests.length,count);
});
