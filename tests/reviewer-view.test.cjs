// Reviewer view: renders DTO fixtures through the mock transport; no server involved.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { parseHTML } = require('linkedom');
const { loadSources } = require('./invariants/golden.cjs');

const team = (n, extra = {}) => ({
  teamId: 'T' + n, guideName: 'Guide ' + n, registerNumbers: ['R' + n + 'a', 'R' + n + 'b'], title: 'Title ' + n, committee: 'C1',
  titleApproval: { status: { tone: 'warning', label: 'Pending review' }, canDecide: true, submittedTitle: 'Title ' + n, similarityFlag: '', documents: [], reviewerNotes: '' },
  reviews: [{ key: 'review1', enabled: true, actionLabel: 'Enter marks', note: 'Open' }, { key: 'review2', enabled: false, actionLabel: 'Enter marks', note: 'Not yet' }],
  ...extra
});
const dtoOf = teams => ({ summary: { pending: teams.length, approved: 0, awaitingGuide: 0, total: teams.length }, reviews: [{ key: 'review1', label: 'Review 1' }, { key: 'review2', label: 'Review 2' }], reviewError: null, teams });

function setup(dto) {
  const { document, window } = parseHTML('<html><body><div id="reviewerContent"></div></body></html>');
  const calls = { marks: [], refresh: 0, loading: 0, finished: 0, writes: [] };
  const c = loadSources(['data-bridge-client.js', 'shared-tabs.js', 'reviewer-view.js'], { document, Promise, setTimeout, clearTimeout, Intl, Date });
  const bridge = vm.runInContext('(' + c.dataBridgeBrowser_.toString() + ')()', c);
  const state = { dto: dto || dtoOf([team(1)]), writeResult: { message: 'Saved' }, writeError: null, readError: null };
  bridge.useTransport(async (method, args) => {
    if (method === 'API_reviewer_getDashboard') return state.readError ? JSON.stringify({ ok: false, error: { code: 'UNAVAILABLE', message: state.readError } }) : JSON.stringify({ ok: true, data: state.dto });
    calls.writes.push([method, args]);
    return state.writeError ? JSON.stringify({ ok: false, error: { code: 'REJECTED', message: state.writeError } }) : JSON.stringify({ ok: true, data: state.writeResult });
  });
  const ui = { busy: require('./busy-fixture.cjs')(), renderIcon: name => { assert(['tag','clipboard-check','ellipsis','triangle-alert'].includes(name), 'Unknown icon: ' + name); return ''; }, refreshRoleDashboard: () => calls.refresh++, beginContentLoading: () => { calls.loading++; return () => { calls.finished++; }; } };
  vm.runInContext('globalThis.__make = ' + c.reviewerViewBrowser_.toString(), c);
  const tabs = c.sharedTabsBrowser_(() => ui);
  const view = c.__make(bridge, () => ui, () => ({ open: (...a) => calls.marks.push(a) }), () => tabs);
  const host = document.getElementById('reviewerContent');
  return { view, host, document, window, calls, state, ui, click: el => el.dispatchEvent(new window.Event('click', { bubbles: true, cancelable: true })), fire: (el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true })), settle: () => new Promise(r => setImmediate(r)) };
}
const rows = f => f.host.querySelectorAll('[data-reviewer-body] tr[data-team-id]');
const stage = (f,key) => f.click(f.host.querySelector('[role=tab][data-stage='+key+']'));
const panel = f => f.host.querySelector('[data-title-panel]');


test('stage tabs use configured reviews and separate title status from action', () => {
  const f=setup();f.view.render(f.host,dtoOf([team(1)]));
  assert.deepEqual(Array.from(f.host.querySelectorAll('[role=tab]')).map(n=>n.dataset.stage),['title','review1','review2']);
  const selected=f.host.querySelector('[role=tab][aria-selected=true]');
  assert.equal(selected.dataset.stage,'title');
  assert.deepEqual(Array.from(f.host.querySelectorAll('[role=tab]')).map(n=>n.getAttribute('tabindex')),['0','-1','-1']);
  assert.equal(f.host.querySelector('[role=tabpanel][data-reviewer-content]').getAttribute('aria-labelledby'),selected.id);
  assert.equal(f.host.querySelector('[role=tablist]').getAttribute('aria-label'),'Reviewer stages');
  assert.equal(f.host.querySelectorAll('[role=tab] [data-tab-badge]').length,2);
  assert.equal(f.host.querySelector('[role=tab][data-stage=review2] [data-tab-badge]'),null,'nothing pending shows no badge');
  assert.deepEqual(Array.from(f.host.querySelectorAll('thead th')).map(n=>n.textContent),['ID','Team','Title','Status','Action']);
  const titleCells=rows(f)[0].querySelectorAll('td');
  assert.equal(titleCells[0].textContent,'T1');
  assert.match(titleCells[1].textContent,/Committee C1.*Guide 1.*R1a.*Title: Pending review/);
  assert.equal(titleCells[2].textContent,'Title 1');
  assert.match(titleCells[3].textContent,/Pending review/);
  assert.equal(titleCells[3].querySelector('button'),null);
  assert.equal(titleCells[4].querySelector('button').textContent,'Review title');
  assert.equal(f.host.querySelectorAll('[data-team-card]').length,1);
  assert.equal(f.host.querySelector('[data-action=open-title]').textContent,'Review title');
  assert.equal(f.host.querySelector('[data-reviewer-list] [data-action=marks]'),null);
  const filters=f.host.querySelectorAll('[data-action=filter]');
  assert.equal(filters[0].getAttribute('aria-pressed'),'true');
  assert.equal(filters[0].querySelector('.rounded-full'),null);
  assert(filters[1].querySelector('.rounded-full'));
  stage(f,'review1');
  assert.deepEqual(Array.from(f.host.querySelectorAll('thead th')).map(n=>n.textContent),['ID','Team','Title','Status','Action']);
  assert.match(rows(f)[0].querySelectorAll('td')[3].textContent,/Open/);
  assert.equal(rows(f)[0].querySelectorAll('td')[3].querySelector('button'),null);
  assert.equal(rows(f)[0].querySelectorAll('td')[4].querySelector('button').textContent,'Enter marks');
  assert.equal(f.host.querySelector('[data-action=marks]').getAttribute('data-review'),'review1');
  assert.equal(f.host.querySelector('[data-action=open-title]'),null);
});
test('default review stage when no title is pending and stage change resets filter',()=>{
  const t=team(1);t.titleApproval.canDecide=false;t.titleApproval.status={tone:'success',label:'Approved'};
  const f=setup();f.view.render(f.host,dtoOf([t]));assert.equal(f.view.state.stage,'review1');
  f.click(f.host.querySelector('[data-action=filter][data-status="Enter marks"]'));
  assert.equal(f.view.state.status,'Enter marks');stage(f,'title');assert.equal(f.view.state.status,'All');
});
test('guide and search filters, empty state, and pagination',()=>{
  const f=setup();f.view.render(f.host,dtoOf(Array.from({length:23},(_,i)=>team(i+1))));
  assert.equal(rows(f).length,10);f.click(f.host.querySelector('[data-action=page][data-page="3"]'));assert.equal(rows(f).length,3);
  const select=f.host.querySelector('#reviewerAssignedPageSize');Object.defineProperty(select,'value',{value:'all',configurable:true});f.fire(select,'change');assert.equal(rows(f).length,23);
  const guide=f.host.querySelector('[data-action=guide]');Object.defineProperty(guide,'value',{value:'Guide 2',configurable:true});f.fire(guide,'change');assert.deepEqual(Array.from(rows(f)).map(r=>r.dataset.teamId),['T2']);
  const search=f.host.querySelector('#reviewerAssignedSearch');search.value='nothing';f.fire(search,'input');assert.equal(rows(f).length,0);assert.match(f.host.textContent,/No teams match your filters/);
});
test('title panel retains documents, similarity flag, and read-only outcome',()=>{
  const t=team(1);t.titleApproval.documents=[{label:'WBS',url:'https://example.com'},{label:'Bad',url:'javascript:bad()'}];t.titleApproval.similarityFlag='Check similarity';
  const f=setup();f.view.render(f.host,dtoOf([t]));f.click(f.host.querySelector('[data-action=open-title]'));
  assert.match(panel(f).textContent,/Title 1.*Guide: Guide 1/);assert.match(panel(f).textContent,/Check similarity/);
  assert.deepEqual(Array.from(panel(f).querySelectorAll('a')).map(a=>a.getAttribute('href')),['https://example.com','#']);
  f.click(panel(f).querySelector('[data-action=close-panel]'));assert.equal(panel(f),null);
  t.titleApproval.canDecide=false;t.titleApproval.status={tone:'success',label:'Approved'};f.view.render(f.host,dtoOf([t]));f.click(f.host.querySelector('[data-action=open-title]'));
  assert.equal(panel(f).querySelector('[data-action=submit-decision]'),null);
});
test('revision requires a note and sends one existing API write',async()=>{
  const f=setup();f.view.render(f.host,dtoOf([team(1)]));f.click(f.host.querySelector('[data-action=open-title]'));
  assert.equal(panel(f).querySelector('[data-action=submit-decision]').disabled,true);
  f.click(panel(f).querySelector('[data-decision=Revise]'));assert.equal(panel(f).querySelector('[data-action=submit-decision]').disabled,true);
  const note=panel(f).querySelector('[data-action=notes]');note.value='Needs revision';f.fire(note,'input');
  assert.equal(panel(f).querySelector('[data-action=submit-decision]').disabled,false);
  f.click(panel(f).querySelector('[data-action=submit-decision]'));await f.settle();
  assert.deepEqual(JSON.parse(JSON.stringify(f.calls.writes)),[['API_reviewer_submitDecision',['T1','Revise','Needs revision']]]);
  assert.equal(f.calls.loading,f.calls.finished);
  assert.equal(panel(f),null);
  assert.match(f.host.querySelector('[data-reviewer-toast]').textContent,/Saved/);
});
test('mobile bar shows four stages and More opens a sheet with the extra configured reviews',()=>{
  const dto=dtoOf([team(1)]);
  dto.reviews.push({key:'review3',label:'Review 3'},{key:'review4',label:'Review 4'});
  const f=setup();f.view.render(f.host,dto);
  const tablist=f.host.querySelector('[role=tablist]'),strip=()=>f.host.querySelector('[data-tabs]');
  assert.deepEqual(Array.from(tablist.children).filter(n=>n.getAttribute('role')==='tab').map(n=>n.dataset.stage),['title','review1','review2','review3']);
  assert.deepEqual(Array.from(tablist.querySelectorAll('[data-tab-sheet] [role=tab]')).map(n=>n.dataset.stage),['review4']);
  const more=f.host.querySelector('[data-tab-more]');
  assert.equal(tablist.contains(more),false,'More sits outside the tablist');
  f.click(more);assert.equal(more.getAttribute('aria-expanded'),'true');assert.equal(strip().hasAttribute('data-more-open'),true);
  f.click(more);assert.equal(strip().hasAttribute('data-more-open'),false);
  f.click(more);stage(f,'review4');
  assert.equal(f.host.querySelector('[role=tab][aria-selected=true]').dataset.stage,'review4');
  assert.equal(strip().hasAttribute('data-more-open'),false);
});
test('stage tabs follow the ARIA tabs keys: arrows select and wrap, Home and End jump',()=>{
  const f=setup();f.view.render(f.host,dtoOf([team(1)]));
  const press=key=>{const event=new f.window.Event('keydown',{bubbles:true,cancelable:true});Object.defineProperty(event,'key',{value:key});f.host.querySelector('[role=tab][aria-selected=true]').dispatchEvent(event);return f.host.querySelector('[role=tab][aria-selected=true]').dataset.stage;};
  assert.deepEqual(['ArrowRight','ArrowRight','ArrowRight','ArrowLeft','Home','End'].map(press),['review1','review2','title','review2','title','review2']);
  assert.equal(f.host.querySelector('[role=tab][aria-selected=true]').getAttribute('tabindex'),'0');
});
test('failed decision retains panel and server message',async()=>{
  const f=setup();f.view.render(f.host,dtoOf([team(1)]));f.state.writeError='Rejected by server';f.click(f.host.querySelector('[data-action=open-title]'));
  f.click(panel(f).querySelector('[data-decision=Approved]'));f.click(panel(f).querySelector('[data-action=submit-decision]'));await f.settle();
  assert.match(panel(f).textContent,/Rejected by server/);assert.equal(panel(f).querySelector('[data-action=submit-decision]').disabled,false);
});
test('review actions respect enabled and evaluation team candidates',()=>{
  const dto=dtoOf([team(1),team(2)]),f=setup();dto.teams[1].reviews[0].enabled=false;f.view.render(f.host,dto);stage(f,'review1');
  const enabled=f.host.querySelector('[data-action=marks]:not([disabled])');f.click(enabled);assert.deepEqual(f.calls.marks,[['T1','review1',enabled]]);
  assert.deepEqual(Array.from(f.view.evaluationTeams('review1')),['T1']);
});
test('review status and action stay separate for published and title-blocked teams',()=>{
  const published=team(1),blocked=team(2);
  published.titleApproval.status={tone:'success',label:'Approved'};
  published.titleApproval.canDecide=false;
  published.reviews[0]={key:'review1',enabled:true,actionLabel:'View marks',note:'Published'};
  published.reviews[1]={key:'review2',enabled:false,actionLabel:'Enter marks',note:'Opens 2026-10-20'};
  blocked.reviews[0]={key:'review1',enabled:false,actionLabel:'Enter marks',note:'Title approval required'};
  const f=setup();f.view.render(f.host,dtoOf([published,blocked]));
  const cells=()=>Array.from(rows(f)).map(row=>row.querySelectorAll('td'));
  assert.equal(f.view.state.stage,'title');stage(f,'review1');
  assert.equal(cells()[0][1].textContent.includes('Review 1: Published'),true);
  assert.equal(cells()[0][1].textContent.includes('Review 2: Opens 2026-10-20'),true);
  assert.equal(cells()[0][3].textContent,'Published');
  assert.equal(cells()[0][4].textContent,'View marks');
  assert.equal(cells()[1][3].textContent,'Waiting for title');
  assert.equal(cells()[1][4].querySelector('button'),null);
  assert.match(f.host.querySelector('[data-team-card="T1"]').textContent,/Published/);
});
test('escapes interpolated content and uses compiled utilities',()=>{
  const evil='<img src=x onerror=alert(1)>"',t=team(1,{title:evil,guideName:evil,committee:evil,teamId:'T"1'}),f=setup();
  f.view.render(f.host,dtoOf([t]));f.click(f.host.querySelector('[data-action=open-title]'));
  assert.equal(f.host.querySelector('img'),null);
  assert.deepEqual(Array.from(f.host.querySelectorAll('*')).flatMap(n=>Array.from(n.attributes).map(a=>a.name)).filter(n=>/^on/i.test(n)),[]);
  const {missingClasses,renderedClasses}=require('./compiled-css.cjs');assert.deepEqual(missingClasses(renderedClasses(f.host)),[]);
});
test('refresh preserves content on failure and reports review errors',async()=>{
  const f=setup();f.view.render(f.host,dtoOf([team(1)]));f.state.readError='offline';assert.equal(await f.view.refresh(),false);assert.equal(rows(f).length,1);
  f.state.readError=null;f.state.dto={...dtoOf([team(1),team(2)]),reviewError:'Unavailable'};assert.equal(await f.view.refresh(),true);
  assert.equal(rows(f).length,2);assert.match(f.host.textContent,/Review marks are unavailable: Unavailable/);
});
