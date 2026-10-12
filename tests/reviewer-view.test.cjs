// Reviewer view: renders DTO fixtures through the mock transport; no server involved.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const { parseHTML } = require('linkedom');
const { loadSources } = require('./invariants/golden.cjs');

const team = (n, extra = {}) => ({
  teamId: 'T' + n, guideName: 'Guide ' + n, registerNumbers: ['R' + n + 'a', 'R' + n + 'b'], title: 'Title ' + n, committee: 'C1',
  titleApproval: { status: { tone: 'warning', label: 'Pending review' }, canDecide: true, canApprove: true, approveBlockedReason: '', revision: 3, submittedTitle: 'Title ' + n, problem: '', similarityFlag: '', folderUrl: '', notes: '' },
  reviews: [{ key: 'review1', enabled: true, actionLabel: 'Enter marks', note: 'Open' }, { key: 'review2', enabled: false, actionLabel: 'Enter marks', note: 'Not yet' }],
  ...extra
});
const dtoOf = teams => ({ summary: { pending: teams.length, approved: 0, awaitingGuide: 0, total: teams.length }, reviews: [{ key: 'review1', label: 'Review 1' }, { key: 'review2', label: 'Review 2' }], reviewError: null, teams });

function setup(dto) {
  const { document, window } = parseHTML('<html><body><div id="reviewerContent"></div></body></html>');
  const calls = { marks: [], refresh: 0, loading: 0, finished: 0, writes: [], requirements: [], inflight: 0, peak: 0 };
  const c = loadSources(['data-bridge-client.js', 'shared-tabs.js', 'title-requests.js', 'reviewer-view.js'], { document, Promise, setTimeout, clearTimeout, Intl, Date });
  const bridge = vm.runInContext('(' + c.dataBridgeBrowser_.toString() + ')()', c);
  const state = { dto: dto || dtoOf([team(1)]), writeResult: { message: 'Saved' }, writeError: null, readError: null, requirements: null };
  bridge.useTransport(async (method, args) => {
    if (method === 'API_reviewer_getDashboard') return state.readError ? JSON.stringify({ ok: false, error: { code: 'UNAVAILABLE', message: state.readError } }) : JSON.stringify({ ok: true, data: state.dto });
    if (method === 'API_reviewer_getTeamRequirements') {
      calls.requirements.push(args[0]); calls.inflight++; calls.peak = Math.max(calls.peak, calls.inflight);
      await new Promise(resolve => setImmediate(resolve)); calls.inflight--;
      const answer = state.requirements ? state.requirements(args[0]) : { teamId: args[0], reviews: [] };
      return answer instanceof Error ? JSON.stringify({ ok: false, error: { code: 'UNAVAILABLE', message: answer.message } }) : JSON.stringify({ ok: true, data: answer });
    }
    calls.writes.push([method, args]);
    return state.writeError ? JSON.stringify({ ok: false, error: { code: 'REJECTED', message: state.writeError } }) : JSON.stringify({ ok: true, data: state.writeResult });
  });
  const ui = { busy: require('./busy-fixture.cjs')(), renderSkeleton: (variant, label) => '<span role="status" aria-label="' + label + '" data-skeleton></span>', renderIcon: name => { assert(['tag','clipboard-check','ellipsis','triangle-alert'].includes(name), 'Unknown icon: ' + name); return ''; }, refreshRoleDashboard: () => calls.refresh++, beginContentLoading: () => { calls.loading++; return () => { calls.finished++; }; } };
  vm.runInContext('globalThis.__make = ' + c.reviewerViewBrowser_.toString(), c);
  const tabs = c.sharedTabsBrowser_(() => ui);
  const requests = c.titleRequestsBrowser_();
  const view = c.__make(bridge, () => ui, () => ({ open: (...a) => calls.marks.push(a) }), () => tabs, () => requests);
  const host = document.getElementById('reviewerContent');
  return { view, host, document, window, calls, state, ui, click: el => el.dispatchEvent(new window.Event('click', { bubbles: true, cancelable: true })), fire: (el, type) => el.dispatchEvent(new window.Event(type, { bubbles: true })), settle: () => new Promise(r => setImmediate(r)) };
}
const text = node => node.textContent.replace(/\s+/g, ' ').trim();
const rows = f => f.host.querySelectorAll('[data-reviewer-body] tr[data-team-id]');
const stage = (f,key) => f.click(f.host.querySelector('[role=tab][data-stage='+key+']'));
const panel = f => f.host.querySelector('[data-title-panel]');


test('stage tabs use configured reviews and separate title status from action', async () => {
  const f=setup();f.view.render(f.host,dtoOf([team(1)]));
  assert.equal(f.host.querySelectorAll('[role=tab] [data-tab-badge]').length,1,'a team still being checked is not counted as awaiting action');
  await settleAll(f);
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
test('title panel retains the folder link, problem, similarity flag, and read-only outcome',()=>{
  const t=team(1);t.titleApproval.folderUrl='https://example.com/folder';t.titleApproval.problem='The problem';t.titleApproval.similarityFlag='Check similarity';
  const f=setup();f.view.render(f.host,dtoOf([t]));f.click(f.host.querySelector('[data-action=open-title]'));
  assert.match(panel(f).textContent,/Title 1.*Guide: Guide 1/);assert.match(panel(f).textContent,/Check similarity/);assert.match(panel(f).textContent,/The problem/);
  assert.deepEqual(Array.from(panel(f).querySelectorAll('a')).map(a=>a.getAttribute('href')),['https://example.com/folder']);
  const unsafe=team(2);unsafe.titleApproval.folderUrl='javascript:bad()';f.view.render(f.host,dtoOf([unsafe]));f.click(f.host.querySelector('[data-action=open-title]'));
  assert.deepEqual(Array.from(panel(f).querySelectorAll('a')).map(a=>a.getAttribute('href')),['#']);f.click(panel(f).querySelector('[data-action=close-panel]'));f.view.render(f.host,dtoOf([t]));f.click(f.host.querySelector('[data-action=open-title]'));
  f.click(panel(f).querySelector('[data-action=close-panel]'));assert.equal(panel(f),null);
  t.titleApproval.canDecide=false;t.titleApproval.status={tone:'success',label:'Approved'};f.view.render(f.host,dtoOf([t]));f.click(f.host.querySelector('[data-action=open-title]'));
  assert.equal(panel(f).querySelector('[data-action=submit-decision]'),null);
});
test('revision requires a note and sends one decideTitle write with the revision the page showed',async()=>{
  const f=setup();f.view.render(f.host,dtoOf([team(1)]));f.click(f.host.querySelector('[data-action=open-title]'));
  assert.equal(panel(f).querySelector('[data-action=submit-decision]').disabled,true);
  f.click(panel(f).querySelector('[data-decision=Revise]'));assert.equal(panel(f).querySelector('[data-action=submit-decision]').disabled,true);
  const note=panel(f).querySelector('[data-action=notes]');note.value='Needs revision';f.fire(note,'input');
  assert.equal(panel(f).querySelector('[data-action=submit-decision]').disabled,false);
  f.click(panel(f).querySelector('[data-action=submit-decision]'));await f.settle();
  const writes=JSON.parse(JSON.stringify(f.calls.writes));
  assert.equal(writes.length,1);assert.equal(writes[0][0],'API_reviewer_decideTitle');
  const sent=writes[0][1][0];assert.match(sent.requestId,/^\S{8,}$/);
  assert.deepEqual({...sent,requestId:'x'},{requestId:'x',expectedRevision:3,teamId:'T1',decision:'return',notes:'Needs revision'});
  assert.equal(f.calls.loading,f.calls.finished);
  assert.equal(panel(f),null);
  assert.match(f.host.querySelector('[data-reviewer-toast]').textContent,/Saved/);
});
test('a title that can be returned but not approved keeps the controls: Approve is disabled with the reason, Request revision works', async () => {
  const t = team(1); t.titleApproval.canApprove = false; t.titleApproval.approveBlockedReason = 'The problem statement is missing. Return the title so the team can resubmit it with one.';
  const f = setup(dtoOf([t])); f.view.render(f.host, dtoOf([t])); f.click(f.host.querySelector('[data-action=open-title]'));
  assert.equal(panel(f).querySelector('[data-decision=Approved]').disabled, true);
  assert.equal(panel(f).querySelector('[data-decision=Revise]').disabled, false);
  assert.match(text(panel(f).querySelector('[data-approve-blocked]')), /problem statement is missing/);
  f.click(panel(f).querySelector('[data-decision=Revise]'));
  const note = panel(f).querySelector('[data-action=notes]'); note.value = 'Add a problem statement'; f.fire(note, 'input');
  f.click(panel(f).querySelector('[data-action=submit-decision]')); await f.settle();
  assert.equal(f.calls.writes[0][1][0].decision, 'return');
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
test('review actions respect enabled and evaluation team candidates',async()=>{
  const dto=dtoOf([team(1),team(2)]),f=setup();dto.teams[1].reviews[0].enabled=false;f.view.render(f.host,dto);stage(f,'review1');
  assert.deepEqual(Array.from(f.view.evaluationTeams('review1')),[],'nothing is open while its requirements are being read');
  await settleAll(f);
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

const refused = (key, note) => ({ key, enabled: false, actionLabel: 'Enter marks', note });
const settleAll = async f => { for (let i = 0; i < 60; i++) await f.settle(); };

test('after first paint each team with an open review is asked for its full requirements, and a refused cell is disabled with the reason', async () => {
  const approved = { status: { tone: 'success', label: 'Approved' }, canDecide: false, canApprove: false, approveBlockedReason: '', revision: 3, submittedTitle: 'T', problem: '', similarityFlag: '', folderUrl: '', notes: '' };
  const f = setup(); const dto = dtoOf([team(1, { titleApproval: approved }), team(2, { reviews: [{ key: 'review1', enabled: false, actionLabel: 'Enter marks', note: 'Not yet' }] }), team(3, { titleApproval: approved })]);
  f.state.requirements = id => ({ teamId: id, reviews: id === 'T1' ? [refused('review1', 'Step3: Waiting for the guide to approve it.')] : [] });
  f.view.render(f.host, dto);
  stage(f, 'review1');
  assert.equal(Array.from(rows(f)).map(r => r.querySelector('button')).filter(b => b && !b.disabled).length, 0, 'no marks button is open until its answer arrives');
  assert.equal(f.host.querySelectorAll('[data-team-spinner]').length, 2 * 2, 'a spinner on each team being checked, in the table and in the card');
  await settleAll(f);
  assert.equal(f.host.querySelectorAll('[data-team-spinner]').length, 0, 'every spinner is gone once the answers are in');
  assert.deepEqual(f.calls.requirements.sort(), ['T1', 'T3'], 'a team with no open review is not asked');
  const t1 = Array.from(rows(f)).find(r => r.dataset.teamId === 'T1');
  assert.equal(dto.teams[0].reviews[0].enabled, false);
  assert.equal(dto.teams[0].reviews[0].note, 'Step3: Waiting for the guide to approve it.');
  assert.equal(t1.querySelector('button[data-action=marks]').disabled, true);
  assert.match(text(t1), /Step3: Waiting for the guide to approve it\./);
  assert.equal(dto.teams[2].reviews[0].enabled, true, 'an unchanged answer leaves the cell');
  const t3 = Array.from(rows(f)).find(r => r.dataset.teamId === 'T3');
  assert.equal(t3.querySelector('button[data-action=marks]').disabled, false, 'and opens it once the answer is in');
  assert.equal(f.host.querySelector('[role=tab][data-stage=review1] [data-tab-badge]').textContent.trim(), '1', 'the pending count follows the answers');
});

test('a failed requirements read leaves the cell as it was and does not disturb the dashboard', async () => {
  const f = setup(); const dto = dtoOf([team(1), team(2)]);
  f.state.requirements = id => id === 'T1' ? new Error('Drive is slow') : { teamId: id, reviews: [refused('review1', 'Waiting.')] };
  f.view.render(f.host, dto); await settleAll(f);
  assert.equal(dto.teams[0].reviews[0].enabled, true, 'the failed team keeps its cell');
  assert.equal(dto.teams[1].reviews[0].enabled, false);
  assert.equal(f.calls.writes.length, 0, 'a requirements read is never a write');
});

test('requirement reads run a few at a time, once per dashboard load, and a stale dashboard ignores its answers', async () => {
  const f = setup(); const dto = dtoOf([1, 2, 3, 4, 5, 6, 7].map(n => team(n)));
  f.state.requirements = id => ({ teamId: id, reviews: [refused('review1', 'Waiting.')] });
  f.view.render(f.host, dto);
  stage(f, 'review1'); stage(f, 'title'); stage(f, 'review1');
  await settleAll(f);
  assert.equal(f.calls.requirements.length, 7, 'switching stages does not read again');
  assert(f.calls.peak <= 3, 'at most three at a time, saw ' + f.calls.peak);
  const next = dtoOf([team(9)]); const f2 = setup();
  f2.state.requirements = id => ({ teamId: id, reviews: [refused('review1', 'Waiting.')] });
  f2.view.render(f2.host, dtoOf([team(1), team(2)])); f2.view.render(f2.host, next);
  await settleAll(f2);
  assert.equal(next.teams[0].reviews[0].enabled, false, 'the current dashboard is updated');
  assert.equal(f2.calls.requirements.includes('T1'), true, 'the first load started before it was replaced');
});

test('a team being checked shows the shared spinner beside its ID, and its marks button is disabled until the answer is in', async () => {
  const f = setup(); const dto = dtoOf([team(1), team(2, { reviews: [{ key: 'review1', enabled: false, actionLabel: 'Enter marks', note: 'Opens 2026-11-16' }] })]);
  f.state.requirements = id => ({ teamId: id, reviews: [] });
  f.view.render(f.host, dto); stage(f, 'review1');
  const row = id => Array.from(rows(f)).find(r => r.dataset.teamId === id);
  const spinner = row('T1').querySelector('[data-team-spinner]');
  assert.ok(spinner, 'the team being checked has a spinner');
  assert.match(spinner.innerHTML, /data-skeleton/, 'it is the shared spinner');
  assert.equal(row('T1').querySelector('strong').textContent, 'T1', 'the ID stays readable');
  assert.equal(row('T1').querySelector('button[data-action=marks]').disabled, true, 'disabled, not hidden');
  assert.equal(row('T2').querySelector('[data-team-spinner]'), null, 'a team with nothing to check has no spinner');
  assert.equal(f.host.querySelector('[data-team-card=T1] [data-team-spinner]') !== null, true, 'the mobile card shows it too');
  f.click(row('T1').querySelector('button[data-action=marks]'));
  assert.deepEqual(f.calls.marks, [], 'a disabled button opens nothing');
  await settleAll(f);
  assert.equal(row('T1').querySelector('[data-team-spinner]'), null);
  assert.equal(row('T1').querySelector('button[data-action=marks]').disabled, false, 'the same cell is open once its requirements are met');
  assert.deepEqual(Array.from(f.view.evaluationTeams('review1')), ['T1']);
});

test('a failed requirements read still settles the team: the spinner goes and the server-provided cell is used', async () => {
  const f = setup(); const dto = dtoOf([team(1)]);
  f.state.requirements = () => new Error('Drive is slow');
  f.view.render(f.host, dto); stage(f, 'review1');
  assert.ok(f.host.querySelector('[data-team-spinner]'));
  await settleAll(f);
  assert.equal(f.host.querySelector('[data-team-spinner]'), null, 'the spinner never stays');
  assert.equal(f.host.querySelector('button[data-action=marks]').disabled, false, 'the server still refuses the entry itself if it must');
});

test('a refreshed dashboard checks its teams again, and the older dashboard cannot clear the new spinners', async () => {
  const f = setup();
  f.state.requirements = id => ({ teamId: id, reviews: [] });
  f.view.render(f.host, dtoOf([team(1)]));
  f.view.render(f.host, dtoOf([team(1), team(2)]));
  assert.equal(f.host.querySelectorAll('[data-reviewer-body] [data-team-spinner]').length, 2, 'the new dashboard starts with both teams being checked');
  await settleAll(f);
  assert.equal(f.host.querySelectorAll('[data-team-spinner]').length, 0);
});
