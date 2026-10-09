/** Reviewer dashboard view. The DTO and review actions remain authoritative. */
function reviewerViewBrowser_(bridge, getUi, getMarking) {
  'use strict';
  const delegated = new WeakSet();
  const PAGE_SIZES = [10, 25, 50, 'all'];
  const state = {dto:null, host:null, query:'', guide:'', status:'All', stage:null, page:1, size:10, busyTeam:null, panelTeam:null, decision:'', notes:'', more:false, toast:''};
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeUrl = url => /^https?:\/\//i.test(String(url)) ? String(url) : '#';
  const icon = (name, label) => getUi().renderIcon(name, label);
  const q = selector => state.host.querySelector(selector);
  const BUTTON = 'inline-flex min-h-10 items-center justify-center rounded-md bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50';
  const SECONDARY = 'inline-flex min-h-10 items-center justify-center rounded-md border border-gray-300 bg-white px-4 py-2 text-sm font-semibold text-gray-900 hover:bg-gray-50 disabled:opacity-50';
  const FIELD = 'min-w-0 rounded-md border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900';
  const PILL = 'inline-flex items-center rounded-full bg-gray-100 px-2 py-1 text-xs font-medium text-gray-700';
  const TAG = 'inline-flex rounded bg-gray-100 px-2 py-1 text-xs text-gray-700';
  const tone = {success:'bg-green-100 text-green-800', warning:'bg-amber-100 text-amber-800', neutral:'bg-gray-100 text-gray-700'};

  function stages() { return [{key:'title', label:'Title approval'}, ...state.dto.reviews.map(r => ({key:r.key, label:r.label}))]; }
  function review(team, key) { return team.reviews.find(r => r.key === key); }
  function stageStatus(team, key) { const cell = review(team, key); return key === 'title' ? team.titleApproval.status.label : cell ? cell.actionLabel : 'Unavailable'; }
  function displayStatus(team, key) {
    if (key === 'title') return team.titleApproval.status.label;
    const cell = review(team, key);
    if (!cell) return 'Unavailable';
    if (!cell.enabled && team.titleApproval.status.label !== 'Approved') return 'Waiting for title';
    return cell.note && cell.note !== cell.actionLabel ? cell.note : '—';
  }
  function pending(team, key) { return key === 'title' ? team.titleApproval.canDecide : !!review(team, key)?.enabled && !['View marks', 'Edit marks'].includes(review(team, key).actionLabel); }
  function count(key) { return state.dto.teams.filter(team => pending(team, key)).length; }
  function filters() { return ['All', ...new Set(state.dto.teams.map(team => stageStatus(team, state.stage)))]; }
  function searchText(team) { return [team.teamId, team.guideName, ...team.registerNumbers, team.title, team.committee, team.titleApproval.status.label].join(' ').toLowerCase(); }
  function matches() { const query = state.query.trim().toLowerCase(); return state.dto.teams.filter(team => searchText(team).includes(query) && (!state.guide || team.guideName === state.guide) && (state.status === 'All' || stageStatus(team, state.stage) === state.status)); }
  function pageBounds(total) { const size = state.size === 'all' ? Math.max(1,total) : state.size; const pages = Math.max(1,Math.ceil(total/size)); state.page = Math.min(Math.max(1,state.page),pages); return {size,pages,start:(state.page-1)*size,end:Math.min(state.page*size,total)}; }
  function documentsMarkup(documents) { return documents.length ? '<div class="mt-4 flex flex-wrap gap-3 text-sm">' + documents.map(d => '<a class="text-blue-600 underline" href="' + escape(safeUrl(d.url)) + '" target="_blank" rel="noopener">' + escape(d.label) + '</a>').join('') + '</div>' : ''; }
  function stageChips(team) { return stages().map(s => '<span class="' + TAG + '">' + escape(s.key === 'title' ? 'Title' : s.label) + ': ' + escape(displayStatus(team,s.key)) + '</span>').join(''); }
  function registerTags(team) { return team.registerNumbers.length ? team.registerNumbers.map(r => '<span class="' + TAG + '">' + escape(r) + '</span>').join('') : '<span class="text-gray-500">—</span>'; }
  function actionMarkup(team, full) {
    const id = escape(team.teamId);
    if (state.stage === 'title') return '<button type="button" class="' + (full ? 'w-full ' : '') + SECONDARY + '" data-action="open-title" data-team="' + id + '">' + (team.titleApproval.canDecide ? 'Review title' : 'View') + '</button>';
    const cell = review(team,state.stage);
    if (!cell || !cell.enabled && team.titleApproval.status.label !== 'Approved') return '';
    return '<button type="button" class="' + (full ? 'w-full ' : '') + SECONDARY + '" data-action="marks" data-team="' + id + '" data-review="' + escape(state.stage) + '"' + (cell.enabled ? '' : ' disabled') + '>' + escape(cell.actionLabel) + '</button>';
  }
  function teamRow(team, next) {
    const id = escape(team.teamId), status = displayStatus(team,state.stage), highlight = next === team.teamId ? 'bg-blue-50' : '';
    const statusPill = '<span class="' + PILL + ' ' + (state.stage === 'title' ? tone[team.titleApproval.status.tone] || tone.neutral : '') + '">' + escape(status) + '</span>';
    const registers = '<div class="flex flex-wrap gap-1">' + registerTags(team) + '</div>';
    const row = '<tr class="border-b border-gray-200 ' + highlight + '" data-team-id="' + id + '">' +
      '<td class="w-20 px-4 py-4 align-top"><strong class="text-sm text-gray-900">' + id + '</strong></td>' +
      '<td class="w-64 px-4 py-4 align-top"><div class="text-xs text-gray-500">Committee ' + escape(team.committee || '—') + '</div><div class="mt-1 text-sm text-gray-700">' + escape(team.guideName || '—') + '</div><div class="mt-2">' + registers + '</div><div class="mt-2 flex flex-wrap gap-1">' + stageChips(team) + '</div></td>' +
      '<td class="px-4 py-4 align-top font-medium text-gray-900 break-words">' + escape(team.title || 'Not submitted') + '</td>' +
      '<td class="w-40 px-4 py-4 align-top">' + statusPill + '</td>' +
      '<td class="w-32 px-4 py-4 align-top">' + actionMarkup(team,false) + '</td></tr>';
    const card = '<div class="border-b border-gray-200 p-4 ' + highlight + '" data-team-card="' + id + '"><div class="flex items-start justify-between gap-2"><div><strong class="text-sm text-gray-900">' + id + '</strong><div class="text-xs text-gray-500">Committee ' + escape(team.committee || '—') + '</div></div>' + statusPill + '</div><p class="mt-3 font-medium text-gray-900 break-words">' + escape(team.title || 'Not submitted') + '</p><p class="mt-1 text-sm text-gray-500">' + escape(team.guideName || '—') + '</p><div class="mt-2">' + registers + '</div><div class="mt-3 flex flex-wrap gap-1">' + stageChips(team) + '</div><div class="mt-3">' + actionMarkup(team,true) + '</div></div>';
    return {row,card};
  }
  function paginationMarkup(total,bounds) {
    const start = total ? bounds.start+1 : 0;
    let first = Math.max(1,state.page-2); const last = Math.min(bounds.pages,first+4); first = Math.max(1,last-4);
    const button = (label,page,disabled,active) => '<button type="button" class="rounded-md border border-gray-300 px-2 py-1 text-sm ' + (active ? 'bg-blue-600 text-white' : 'bg-white text-gray-900') + ' disabled:opacity-50" data-action="page" data-page="' + page + '"' + (disabled ? ' disabled' : '') + (active ? ' aria-current="page"' : '') + '>' + label + '</button>';
    const numbers=[]; for(let p=first;p<=last;p++) numbers.push(button(String(p),p,false,p===state.page));
    return '<nav aria-label="Pagination" class="flex flex-wrap items-center justify-between gap-3 border-t border-gray-200 p-4 text-sm text-gray-500"><span id="reviewerAssignedPaginationInfo">Showing ' + start + ' - ' + bounds.end + ' of ' + total + ' teams</span><label class="flex items-center gap-2">Rows per page <select id="reviewerAssignedPageSize" data-action="size" class="' + FIELD + '">' + PAGE_SIZES.map(s => '<option value="' + s + '"' + (String(s)===String(state.size)?' selected':'') + '>' + (s==='all'?'All':s) + '</option>').join('') + '</select></label><div class="flex items-center gap-1">' + button('Previous',state.page-1,state.page===1,false) + numbers.join('') + button('Next',state.page+1,state.page===bounds.pages,false) + '</div></nav>';
  }
  function tabsMarkup() {
    const items=stages();
    const tab=s => '<button type="button" role="tab" aria-selected="' + (s.key===state.stage) + '" class="inline-flex min-h-11 shrink-0 items-center gap-2 border-0 border-b-2 bg-transparent px-4 py-3 text-sm font-semibold hover:bg-gray-50 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ' + (s.key===state.stage?'border-b-blue-700 text-blue-700':'border-b-transparent text-gray-900 hover:text-blue-700') + '" data-action="stage" data-stage="' + escape(s.key) + '">' + icon(s.key==='title'?'tag':'clipboard-check') + '<span>' + escape(s.label) + '</span>' + (count(s.key)?'<span class="rounded-md border border-orange-200 bg-orange-100 px-1.5 py-0.5 text-xs font-medium text-amber-900">' + count(s.key) + '</span>':'<span class="inline-flex items-center justify-center rounded-full bg-gray-100 p-1 text-gray-600">' + icon('check','No pending work') + '</span>') + '</button>';
    const mobile=s => '<button type="button" class="flex min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1 py-2 text-xs ' + (s.key===state.stage?'text-blue-700':'text-gray-600') + '" data-action="stage" data-stage="' + escape(s.key) + '">' + icon(s.key==='title'?'clipboard-check':'book-open') + '<span class="truncate">' + escape(s.key==='title'?'Title':s.label) + '</span>' + (count(s.key)?'<span class="' + PILL + '">' + count(s.key) + '</span>':'') + '</button>';
    return '<div class="hidden overflow-x-auto border-b border-gray-200 bg-white md:flex md:gap-1 md:px-4" role="tablist">' + items.map(tab).join('') + '</div><nav aria-label="Reviewer stages" class="fixed inset-x-0 bottom-0 z-30 flex border-t border-gray-200 bg-white md:hidden">' + items.slice(0,items.length>4?3:4).map(mobile).join('') + (items.length>4?'<button type="button" class="flex flex-1 flex-col items-center justify-center text-xs text-gray-600" data-action="more">' + icon('ellipsis') + 'More</button>':'') + '</nav>' + (state.more?'<div class="fixed inset-0 z-40 bg-black/40 md:hidden" data-action="close-more"><div class="absolute inset-x-0 bottom-0 rounded-t-lg bg-white p-4" data-more-sheet><h3 class="mb-3 font-semibold">More stages</h3>' + items.slice(3).map(tab).join('') + '<button type="button" class="mt-3 ' + SECONDARY + '" data-action="close-more">Close</button></div></div>':'');
  }
  function toolbarMarkup(found) {
    const guides=[...new Set(state.dto.teams.map(t=>t.guideName).filter(Boolean))].sort();
    const dotTone=label=>{
      if(state.stage==='title'){
        const team=state.dto.teams.find(t=>t.titleApproval.status.label===label);
        return team?.titleApproval.status.tone==='success'?'bg-green-600':team?.titleApproval.status.tone==='warning'?'bg-amber-500':'bg-gray-400';
      }
      return label==='View marks'?'bg-blue-600':label==='Edit marks'?'bg-amber-500':'bg-gray-400';
    };
    const chips=filters().map(label=>{
      const active=state.status===label;
      const amount=label==='All'?state.dto.teams.length:state.dto.teams.filter(t=>stageStatus(t,state.stage)===label).length;
      return '<button type="button" aria-pressed="' + active + '" class="inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 py-1.5 text-sm font-medium ' + (active?'border-blue-700 bg-blue-700 text-white':'border-gray-300 bg-white text-gray-900 hover:border-blue-400 hover:bg-blue-50') + '" data-action="filter" data-status="' + escape(label) + '">' + (label==='All'?'':'<span class="size-2 shrink-0 rounded-full ' + dotTone(label) + '"></span>') + '<span>' + escape(label) + '</span><span class="' + (active?'text-blue-100':'text-gray-500') + '">' + amount + '</span></button>';
    }).join('');
    return '<div class="space-y-4 p-4"><div class="flex min-w-0 items-center gap-2"><input type="search" id="reviewerAssignedSearch" aria-label="Search assigned teams" placeholder="Search teams" value="' + escape(state.query) + '" class="' + FIELD + ' w-full flex-1" data-action="search"><select aria-label="Filter by guide" class="' + FIELD + ' w-32 shrink-0 sm:w-48" data-action="guide"><option value="">All guides</option>' + guides.map(g=>'<option value="' + escape(g) + '"' + (g===state.guide?' selected':'') + '>' + escape(g) + '</option>').join('') + '</select><span class="hidden shrink-0 text-sm text-gray-500 lg:inline">Showing ' + found.length + ' of ' + state.dto.teams.length + '</span></div><div class="flex gap-2 overflow-x-auto whitespace-nowrap" aria-label="Status filters">' + chips + '</div></div>';
  }
  function listMarkup() {
    const found=matches(), bounds=pageBounds(found.length), shown=found.slice(bounds.start,bounds.end);
    const next=found.find(t=>pending(t,state.stage))?.teamId;
    const empty='<div class="px-4 py-12 text-center text-sm text-gray-500">' + (state.dto.teams.length?'No teams match your filters.':'No teams are assigned to you.') + '</div>';
    const rows=shown.map(t=>teamRow(t,next));
    return toolbarMarkup(found) + '<div data-reviewer-list><div class="hidden md:block"><table class="w-full table-auto border-t border-gray-200 text-left text-sm"><thead class="bg-gray-50 text-xs uppercase text-gray-500"><tr><th class="w-20 px-4 py-3">ID</th><th class="w-64 px-4 py-3">Team</th><th class="px-4 py-3">Title</th><th class="w-40 px-4 py-3">Status</th><th class="w-32 px-4 py-3">Action</th></tr></thead><tbody data-reviewer-body>' + rows.map(item=>item.row).join('') + '</tbody></table></div><div class="md:hidden" data-reviewer-cards>' + rows.map(item=>item.card).join('') + '</div>' + (found.length?'':empty) + '</div><div data-reviewer-pagination>' + paginationMarkup(found.length,bounds) + '</div>';
  }
  function panelMarkup() {
    const team=state.dto.teams.find(t=>t.teamId===state.panelTeam); if(!team)return '';
    const t=team.titleApproval, id=escape(team.teamId), editable=t.canDecide;
    const choice=value=>'<button type="button" class="flex-1 rounded-md border p-3 text-left text-sm ' + (state.decision===value?'border-blue-600 bg-blue-50':'border-gray-300 bg-white') + '" data-action="choice" data-decision="' + value + '" aria-pressed="' + (state.decision===value) + '">' + (value==='Approved'?'Approve':'Request revision') + '</button>';
    return '<div class="fixed inset-0 z-50 bg-black/50" data-action="close-panel"><section role="dialog" aria-modal="true" aria-label="Title decision" class="absolute inset-x-0 bottom-0 flex max-h-full flex-col rounded-t-lg bg-white shadow-xl sm:inset-auto sm:left-1/2 sm:top-1/2 sm:w-full sm:max-w-xl sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-lg" data-title-panel><header class="flex items-center justify-between border-b border-gray-200 p-4"><div><strong>' + id + '</strong><div class="text-sm text-gray-500">Committee ' + escape(team.committee||'—') + '</div></div><button type="button" aria-label="Close" class="' + SECONDARY + '" data-action="close-panel">✕</button></header><div class="min-h-0 overflow-y-auto p-4"><h3 class="text-lg font-semibold text-gray-900">' + escape(t.submittedTitle||'Not submitted') + '</h3><p class="mt-2 text-sm text-gray-600">Guide: ' + escape(team.guideName||'—') + '</p><div class="mt-2 flex flex-wrap gap-1">' + registerTags(team) + '</div>' + documentsMarkup(t.documents) + (t.similarityFlag?'<p class="mt-4 text-sm text-amber-700">' + icon('triangle-alert') + ' ' + escape(t.similarityFlag) + '</p>':'') + '<p class="mt-4 text-sm text-gray-700">' + escape(t.status.label) + '</p>' + (t.reviewerNotes?'<p class="mt-2 text-sm text-gray-600">Reviewer notes: ' + escape(t.reviewerNotes) + '</p>':'') + (editable?'<div class="mt-5 flex gap-2">' + choice('Approved') + choice('Revise') + '</div><label class="mt-4 block text-sm font-medium" for="reviewer-notes-' + id + '">Reviewer notes' + (state.decision==='Revise'?' (required)':' (optional)') + '</label><textarea id="reviewer-notes-' + id + '" rows="3" class="mt-1 w-full ' + FIELD + '" data-action="notes">' + escape(state.notes) + '</textarea>':'') + '<p id="reviewer-status-' + id + '" class="mt-2 text-sm text-red-700" role="status"></p></div><footer class="flex justify-end gap-2 border-t border-gray-200 bg-white p-4"><button type="button" class="' + SECONDARY + '" data-action="close-panel">' + (editable?'Cancel':'Close') + '</button>' + (editable?'<button type="button" class="' + BUTTON + '" data-action="submit-decision"' + (!state.decision || state.decision==='Revise'&&!state.notes.trim()?' disabled':'') + '>Submit decision</button>':'') + '</footer></section></div>';
  }
  function render(host,dto) {
    state.host=host;state.dto=dto;
    if(!stages().some(s=>s.key===state.stage)) state.stage=dto.teams.some(t=>t.titleApproval.canDecide)?'title':(dto.reviews[0]?.key||'title');
    if(!filters().includes(state.status))state.status='All';
    host.innerHTML='<div class="min-w-0 pb-24 md:pb-0"><h2 class="text-xl font-semibold text-gray-900">Reviewer Dashboard</h2><p class="mt-1 text-sm text-gray-500">Review titles and assessments for your assigned teams.</p><p id="reviewerRefreshStatus" class="mt-1 text-sm text-gray-500" data-refresh-status role="status" aria-live="polite"></p>' + (dto.reviewError?'<p class="mt-3 text-sm text-red-700" role="status">Review marks are unavailable: ' + escape(dto.reviewError) + '</p>':'') + '<section class="mt-4 min-w-0 overflow-hidden rounded-lg border border-gray-200 bg-white shadow-sm" aria-label="Assigned teams">' + tabsMarkup() + '<div data-reviewer-content>' + listMarkup() + '</div></section><div data-reviewer-panel>' + panelMarkup() + '</div>' + (state.toast?'<div class="fixed right-4 top-4 z-50 rounded-md bg-green-700 px-4 py-3 text-sm text-white shadow-lg" role="status" data-reviewer-toast>' + escape(state.toast) + '</div>':'') + '</div>';
    if(!delegated.has(host)){delegated.add(host);host.addEventListener('click',onClick);host.addEventListener('input',onInput);host.addEventListener('change',onChange);host.addEventListener('keydown',onKeydown);}
  }
  function updateList() { q('[data-reviewer-content]').innerHTML=listMarkup(); }
  function updatePanel() { q('[data-reviewer-panel]').innerHTML=panelMarkup(); }
  function onInput(event) {
    if(event.target.dataset.action==='search'){state.query=event.target.value;state.page=1;updateList();q('#reviewerAssignedSearch').focus();}
    if(event.target.dataset.action==='notes'){state.notes=event.target.value;const button=q('[data-action="submit-decision"]');if(button)button.disabled=!state.decision || state.decision==='Revise'&&!state.notes.trim();}
  }
  function onChange(event){if(event.target.dataset.action==='size'){state.size=event.target.value==='all'?'all':Number(event.target.value);state.page=1;updateList();}if(event.target.dataset.action==='guide'){state.guide=event.target.value;state.page=1;updateList();}}
  function onClick(event){
    const target=event.target.closest?.('[data-action]');if(!target||target.disabled)return;
    const action=target.dataset.action;
    if(action==='close-panel' && event.target.closest('[data-title-panel]') && event.target!==target)return;
    if(action==='close-more' && event.target.closest('[data-more-sheet]') && event.target!==target)return;
    if(action==='stage'){state.stage=target.dataset.stage;state.status='All';state.page=1;state.more=false;render(state.host,state.dto);}
    else if(action==='filter'){state.status=target.dataset.status;state.page=1;updateList();}
    else if(action==='page'){state.page=Number(target.dataset.page);updateList();}
    else if(action==='marks')getMarking().open(target.dataset.team,target.dataset.review,target);
    else if(action==='open-title'){state.panelTeam=target.dataset.team;state.decision='';state.notes='';updatePanel();}
    else if(action==='close-panel'){if(state.busyTeam)return;state.panelTeam=null;updatePanel();}
    else if(action==='choice'){state.decision=target.dataset.decision;updatePanel();}
    else if(action==='submit-decision')decide(state.panelTeam,state.decision);
    else if(action==='more'){state.more=true;render(state.host,state.dto);}
    else if(action==='close-more'){state.more=false;render(state.host,state.dto);}
  }
  function onKeydown(event){if(event.key==='Escape'&&state.panelTeam&&!state.busyTeam){state.panelTeam=null;updatePanel();}else if(event.key==='Escape'&&state.more){state.more=false;render(state.host,state.dto);}}
  function statusElement(team){return state.host.ownerDocument.getElementById('reviewer-status-'+team);}
  function setStatus(team,text){const el=statusElement(team);if(el)el.textContent=text;}
  function load(){return bridge.read('role:reviewer','API_reviewer_getDashboard',[]);}
  function refresh(){const host=state.host;if(!host||host.getAttribute('aria-busy')==='true')return Promise.resolve(false);const finish=getUi().beginContentLoading(host,'Refreshing assigned teams',{compact:true});return load().then(dto=>{finish();render(host,dto);return true;},()=>{finish();return false;});}
  function decide(team,decision){
    if(state.busyTeam)return;
    const notes=state.notes;if(decision==='Revise'&&!notes.trim()){setStatus(team,'Note required.');return;}
    state.busyTeam=team;const button=q('[data-action="submit-decision"]');const done=getUi().busy.write(statusElement(team),'Submitting…',button?[button]:[]);
    bridge.write('API_reviewer_submitDecision',[team,decision,notes]).then(result=>{const host=state.host,finish=getUi().beginContentLoading(host,'Refreshing assigned teams',{compact:true});return load().then(dto=>{finish();state.busyTeam=null;state.panelTeam=null;state.toast=result?.message||'Decision saved.';render(host,dto);setTimeout(()=>{state.toast='';q('[data-reviewer-toast]')?.remove();},4000);},error=>{finish();state.busyTeam=null;done('Refresh failed: '+error.message);});},error=>{state.busyTeam=null;done(error.message||'Unable to submit decision.');});
  }
  function evaluationTeams(key){return(state.dto?.teams||[]).filter(team=>team.reviews.some(r=>r.key===key&&r.enabled)).map(team=>team.teamId);}
  return {load,render,refresh,decide,evaluationTeams,state};
}
