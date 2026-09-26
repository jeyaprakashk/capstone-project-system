const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const {parseHTML}=require('linkedom');
const {publishingFixture}=require('./internal-publishing-fixture.cjs');
const flush=async()=>{for(let i=0;i<15;i++)await Promise.resolve();};
function fixture(key='review1') {
  const server=publishingFixture(key);if(key==='guide_eval')server.students.forEach(s=>server.guideSubmit(s.regNo));else server.submit();
  const {window}=parseHTML('<html><body>'+server.c.buildInternalAssessmentPublishing_(key)+'</body></html>'),document=window.document;
  const calls=[],questions=[],loading={begun:0,settled:0},timers=new Map();let timerId=0,approve=true;
  function runner(ok,fail){return new Proxy({withSuccessHandler:fn=>runner(fn,fail),withFailureHandler:fn=>runner(ok,fn)},{get(target,name){return target[name]||((...args)=>calls.push({method:name,args,ok,fail}));}});}
  const c=vm.createContext({document,window:{crypto},Map,Set,setTimeout:fn=>{timers.set(++timerId,fn);return timerId;},clearTimeout:id=>timers.delete(id),DashboardUI:{
    guideRun:()=>runner(),ask:async text=>{questions.push(text);return approve;},requestText:async text=>{questions.push(text);return approve?'Correction':null;},
    beginContentLoading:host=>{loading.begun++;host.setAttribute('aria-busy','true');let done=false;return ()=>{if(done)return;done=true;loading.settled++;host.removeAttribute('aria-busy');};}
  }});
  for(const file of ['common-helpers.js','lucide-icons.js','icon-renderer.js','internal-assessment-publishing-client.js'])vm.runInContext(file==='common-helpers.js'?fs.readFileSync(file,'utf8').slice(fs.readFileSync(file,'utf8').indexOf('function renderAssessmentHistory_')):fs.readFileSync(file,'utf8'),c);c.DashboardUI.renderIcon=c.renderLucideIcon_;c.DashboardUI.renderAssessmentHistory=c.renderAssessmentHistory_;const api=c.internalAssessmentPublishingBrowser_();
  const section=()=>document.querySelector('[data-publishing]'),host=()=>document.querySelector('[data-publishing-content]');
  async function load(){const promise=api.refresh(key);calls.at(-1).ok(server.report());await promise;}
  async function settleMutation(call,fail){if(fail)call.fail({message:fail});else {server.report();call.ok(server.c[call.method](call.args[0]));}await flush();}
  async function settleRead(){const read=calls.at(-1);assert.equal(read.method,'loadInternalAssessmentPublishing');read.ok(server.report());await flush();}
  return {server,document,window,api,calls,questions,loading,timers,section,host,load,settleMutation,settleRead,initTooltips:()=>c.initializeDashboardTooltips_(),approve:value=>approve=value};
}

test('refresh lifecycle retains content, deduplicates reads, retries and restores controls',async()=>{
  const f=fixture();await f.load();const before=f.host().innerHTML,search=f.host().querySelector('[data-search]');search.value='Alex';search.dispatchEvent(new f.window.Event('input'));
  const pending=f.api.refresh('review1');await f.api.refresh('review1');assert.equal(f.calls.length,2);assert(f.section().querySelector('[data-refresh]').disabled);
  f.calls[1].fail({message:'Offline'});await pending;assert.equal(f.host().querySelector('[data-search]'),search);assert.equal(search.value,'Alex');assert.match(f.section().querySelector('[data-notice]').textContent,/Offline/);assert(!f.section().querySelector('[data-refresh]').disabled);assert.equal(f.loading.begun,f.loading.settled);
  f.section().querySelector('[data-notice] button').click();assert.equal(f.calls.length,3);f.calls[2].ok(f.server.report());await flush();assert.equal(f.host().querySelector('[data-search]').value,'Alex');assert.equal(f.loading.begun,f.loading.settled);assert(before.includes('Publish Team'));
});

test('failed initial read settles skeleton and retry; detached screen ignores stale response',async()=>{
  const f=fixture();const pending=f.api.refresh('review1');f.calls[0].fail({message:'Unavailable'});await pending;assert.match(f.host().textContent,/Publication data is unavailable/);assert.equal(f.loading.begun,f.loading.settled);
  const second=f.api.refresh('review1'),section=f.section();section.remove();f.calls[1].ok(f.server.report());await second;assert(!section.querySelector('[data-team]'));assert.equal(f.loading.begun,f.loading.settled);
});

test('search, publication filter and explicit details work without changing publication actions',async()=>{
  const f=fixture();await f.load();const host=f.host(),search=host.querySelector('[data-search]');search.value='Bea';search.dispatchEvent(new f.window.Event('input'));assert(!host.querySelector('[data-team]').hidden);
  search.value='unknown';search.dispatchEvent(new f.window.Event('input'));assert(host.querySelector('[data-team]').hidden);assert(!host.querySelector('[data-empty]').hidden);
  search.value='';search.dispatchEvent(new f.window.Event('input'));const filter=host.querySelector('[data-filter]');filter.querySelector('[value="PUBLISHED"]').selected=true;filter.dispatchEvent(new f.window.Event('change'));assert(host.querySelector('[data-team]').hidden);
  filter.querySelector('[value="all"]').selected=true;filter.dispatchEvent(new f.window.Event('change'));const details=host.querySelector('[data-details]');details.click();assert.equal(details.getAttribute('aria-expanded'),'true');assert(!host.querySelector('[data-detail-row]').hidden);details.click();assert(host.querySelector('[data-detail-row]').hidden);
});

for(const key of ['review1','review2'])test(key+': team UI calls native endpoint once and blocks double clicks',async()=>{
  const f=fixture(key);await f.load();const button=f.host().querySelector('[data-publish]:not([data-student])');button.click();button.click();await flush();assert.equal(f.questions.length,1);assert.equal(f.calls.length,2);assert.equal(f.calls[1].method,key==='review1'?'publishReview1Evaluation':'publishReview2Evaluation');assert.equal(f.calls[1].args[0].student,undefined);
  await f.settleMutation(f.calls[1]);await f.settleRead();assert.match(f.host().textContent,/Published/);assert(!f.host().querySelector('[data-publish]'));
});

test('Review individual UI publishes only selected register and displays partial state',async()=>{
  const f=fixture();await f.load();f.host().querySelector('[data-details]').click();f.host().querySelector('[data-publish][data-student="0"]').click();await flush();assert.equal(f.calls[1].args[0].student,'s1');await f.settleMutation(f.calls[1]);await f.settleRead();assert.match(f.host().textContent,/Partial \/ updates pending/);assert.equal(f.host().querySelector('[data-details]').getAttribute('aria-expanded'),'true');
});

test('cancelled confirmation sends nothing and restores controls',async()=>{
  const f=fixture();await f.load();f.approve(false);f.host().querySelector('[data-publish]').click();await flush();assert.equal(f.calls.length,1);assert(!f.section().querySelector('[data-refresh]').disabled);
});

test('Guide team UI serializes calls, reports failure, refreshes actual state and retries original request',async()=>{
  const f=fixture('guide_eval');await f.load();f.host().querySelector('[data-publish]:not([data-student])').click();await flush();assert.equal(f.calls.length,2);assert.equal(f.calls[1].args[0].student,'s1');
  await f.settleMutation(f.calls[1]);assert.equal(f.calls.length,3);assert.equal(f.calls[2].args[0].student,'s2');const failedInput=f.calls[2].args[0];await f.settleMutation(f.calls[2],'Another evaluation is saving. Retry shortly.');assert.equal(f.calls.length,4);await f.settleMutation(f.calls[3]);await f.settleRead();
  assert.match(f.host().textContent,/2\/3 students published successfully/);assert.match(f.host().textContent,/1 failed/);assert.match(f.host().textContent,/Needs attention/);f.host().querySelector('[data-retry-operation]').click();await flush();assert.deepEqual(f.calls.at(-1).args[0],failedInput);await f.settleMutation(f.calls.at(-1));await f.settleRead();assert.match(f.host().textContent,/Published/);assert(!f.host().querySelector('[data-retry-operation]'));
});

test('Guide unknown completion reconciles by request ID and never republishes confirmed writes',async()=>{
  const f=fixture('guide_eval');await f.load();f.host().querySelector('[data-publish]').click();await flush();const first=f.calls[1];f.server.c[first.method](first.args[0]);await f.settleMutation(first,'Network disconnected');await f.settleMutation(f.calls[2]);await f.settleMutation(f.calls[3]);await f.settleRead();assert.match(f.section().textContent,/3\/3 students published successfully/);assert(!f.host().querySelector('[data-retry-operation]'));assert.equal(f.server.tables.GuideEvaluations.length,7);
});

test('Guide individual action calls only the selected existing student endpoint',async()=>{
  const f=fixture('guide_eval');await f.load();f.host().querySelector('[data-details]').click();f.host().querySelector('[data-publish][data-student="1"]').click();await flush();
  assert.equal(f.calls[1].method,'publishGuideEvaluation');assert.equal(f.calls[1].args[0].student,'s2');await f.settleMutation(f.calls[1]);await f.settleRead();
  assert.equal(f.calls.filter(call=>call.method==='publishGuideEvaluation').length,1);const team=f.server.report().teams[0];assert.equal(team.publishedStudents,1);assert.equal(team.students[0].publicationStatus,'NOT_PUBLISHED');
});

test('reopening sends reason with team scope for Review and student scope for Guide',async()=>{
  for(const key of ['review1','guide_eval']){
    const f=fixture(key);await f.load();f.host().querySelector('[data-reopen]').click();await flush();const call=f.calls[1];assert.equal(call.args[0].reason,'Correction');assert.equal(call.args[0].student,key==='guide_eval'?'s1':undefined);await f.settleMutation(call);await f.settleRead();assert.match(f.section().textContent,/Evaluation reopened/);
  }
});

test('read timeout settles loading and offers retry',async()=>{
  const f=fixture(),pending=f.api.refresh('review1');Array.from(f.timers.values())[0]();await pending;assert.equal(f.loading.begun,f.loading.settled);assert.match(f.section().textContent,/No response received/);assert(f.section().querySelector('[data-notice] button'));
});

test('re-entered screen does not retain an initial skeleton after a failed read',async()=>{
  const f=fixture();await f.load();f.section().remove();f.document.body.innerHTML=f.server.c.buildInternalAssessmentPublishing_('review1');
  const pending=f.api.refresh('review1');f.calls.at(-1).fail({message:'Offline'});await pending;assert.match(f.host().textContent,/Publication data is unavailable/);assert(!f.host().textContent.includes('Skeleton'));
});

test('scrollable team and student tables are keyboard-focusable named regions',async()=>{
  const f=fixture();await f.load();const wrappers=f.host().querySelectorAll('.publishing-table-wrap');assert(wrappers.length>1);
  wrappers.forEach(wrapper=>{assert.equal(wrapper.getAttribute('tabindex'),'0');assert.equal(wrapper.getAttribute('role'),'region');assert.match(wrapper.getAttribute('aria-label'),/scroll horizontally/);});
  assert.match(f.host().querySelector('.publishing-scroll-hint').textContent,/publication status and actions/);
});

test('action icons retain accessible names and use the shared focus tooltip',async()=>{
  const f=fixture('guide_eval');await f.load();
  f.window.HTMLElement.prototype.getBoundingClientRect=()=>({left:10,top:80,bottom:112,width:32,height:32});
  f.initTooltips();
  const buttons=f.host().querySelectorAll('[data-publish],[data-details],[data-reopen]');assert(buttons.length>0);
  buttons.forEach(button=>{assert(button.querySelector('svg[aria-hidden="true"]'));assert.equal(button.textContent,'');assert.equal(button.getAttribute('aria-label'),button.getAttribute('data-tooltip'));});
  const button=buttons[0];button.dispatchEvent(new f.window.Event('focusin',{bubbles:true}));
  const tooltip=f.document.querySelector('#dashboardTooltip');assert.equal(tooltip.textContent,button.getAttribute('aria-label'));assert.equal(tooltip.hidden,false);assert.match(button.getAttribute('aria-describedby'),/dashboardTooltip/);
  button.dispatchEvent(new f.window.Event('focusout',{bubbles:true}));assert.equal(tooltip.hidden,true);
});

test('publication details use shared tooltips without adding text below the status',async()=>{
  const f=fixture();await f.load();const badge=f.host().querySelector('.publishing-badge');
  assert.equal(badge.parentNode.textContent,'Ready to publish');assert.equal(badge.getAttribute('data-tooltip'),'Publication permitted');assert.equal(badge.getAttribute('tabindex'),'0');assert.equal(badge.parentNode.querySelector('small'),null);
  f.window.HTMLElement.prototype.getBoundingClientRect=()=>({left:10,top:80,bottom:112,width:100,height:24});f.initTooltips();badge.dispatchEvent(new f.window.Event('focusin',{bubbles:true}));assert.equal(f.document.querySelector('#dashboardTooltip').textContent,'Publication permitted');
  const report=f.server.report();report.teams[0].students[0].publicationStatus='UPDATE_PENDING';report.teams[0].students[0].hasPublishedSnapshot=true;report.teams[0].students[0].needsPublication=true;
  const pending=f.api.refresh('review1');f.calls.at(-1).ok(report);await pending;
  const status=f.host().querySelector('[data-tooltip="Students still see the previous publication."]');assert(status);assert.equal(status.textContent,'Published · update pending');assert.equal(status.parentNode.querySelector('small'),null);
});

test('student result lines show name, bracketed register and the assessment-specific maximum',async()=>{
  for(const key of ['review1','review2','guide_eval']){
    const f=fixture(key);await f.load();const lines=f.host().querySelectorAll('.publishing-registers .publishing-student-results li');assert.equal(lines.length,3);
    assert.equal(lines[0].querySelector('.publishing-student-identity').textContent,'Alex One (s1)');assert.equal(f.host().querySelector('.publishing-results .publishing-score').textContent,key==='guide_eval'?'32 / 40':'80 / 100');
    assert.equal(f.host().querySelector('[data-team]').firstElementChild.children.length,6);assert.equal(f.host().querySelector('[data-detail-row] td').getAttribute('colspan'),'6');
    const report=f.server.report();report.teams[0].students[0].total=null;report.teams[0].students[0].assessmentComplete=false;report.teams[0].students[1].total=0;
    const pending=f.api.refresh(key);f.calls.at(-1).ok(report);await pending;const scores=f.host().querySelectorAll('.publishing-score');assert.equal(scores[0].textContent,'Pending');assert.match(scores[1].textContent,/^0 \/ /);
  }
});
