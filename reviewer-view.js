/**
 * REVIEWER VIEW — browser module serialized into the dashboard shell as `ReviewerView`.
 * Renders the reviewer DTO (DATA-CONTRACTS.md) with Tailwind utilities. It never calls
 * google.script.run and never sees spreadsheet columns; all server access goes through
 * the injected data bridge. Class names are literal so the Tailwind build can scan them.
 */
function reviewerViewBrowser_(bridge, getUi) {
  'use strict';
  const PAGE_SIZES = [10, 25, 50, 'all'];
  const state = {dto:null, host:null, query:'', page:1, size:10, busyTeam:null};
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeUrl = url => /^https?:\/\//i.test(String(url)) ? String(url) : '#';
  const icon = (name, label) => getUi().renderIcon(name, label);
  const q = (selector, root) => (root || state.host).querySelector(selector);

  const TONE = {
    success:'bg-success-tint text-success ring-1 ring-inset ring-success/20',
    warning:'bg-warning-tint text-warning ring-1 ring-inset ring-warning/20',
    neutral:'bg-soft text-ink-2 ring-1 ring-inset ring-control/20'
  };
  const STAT = [
    ['pending', 'Pending Your Decision', 'text-warning'],
    ['approved', 'Approved', 'text-success'],
    ['awaitingGuide', 'Not Yet Guide-Approved', 'text-muted'],
    ['total', 'Total Assigned to You', 'text-primary']
  ];

  function searchText(team) {
    return [team.teamId, team.guideName, ...team.registerNumbers, team.title, team.committee, team.titleApproval.status.label].join(' ').toLowerCase();
  }
  function matches() {
    const query = state.query.trim().toLowerCase();
    return state.dto.teams.filter(team => searchText(team).includes(query));
  }
  function pageBounds(total) {
    const size = state.size === 'all' ? Math.max(1, total) : state.size;
    const pages = Math.max(1, Math.ceil(total / size));
    state.page = Math.min(Math.max(1, state.page), pages);
    return {size, pages, start:(state.page - 1) * size, end:Math.min(state.page * size, total)};
  }

  function documentsMarkup(documents) {
    if (!documents.length) return '';
    return '<div class="mt-2 text-sm">' + documents.map(d => '<a class="text-primary underline" href="' + escape(safeUrl(d.url)) + '" target="_blank" rel="noopener">' + escape(d.label) + '</a>').join(' &middot; ') + '</div>';
  }
  function titleApprovalMarkup(team) {
    const t = team.titleApproval, id = escape(team.teamId);
    const decide = t.canDecide
      ? '<label class="mt-3 block text-sm font-semibold text-ink-2" for="reviewer-notes-' + id + '">Reviewer notes</label>' +
        '<textarea id="reviewer-notes-' + id + '" rows="3" class="mt-1 block w-full rounded-md border border-control px-3 py-2 text-sm" placeholder="Notes (required for Revise)"></textarea>' +
        '<div class="mt-2 flex gap-2">' +
        '<button type="button" class="border-0 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-paper hover:bg-primary-hover disabled:opacity-50" data-action="decide" data-decision="Approved" data-team="' + id + '">Approve</button>' +
        '<button type="button" class="border-0 rounded-md bg-paper px-3 py-1.5 text-sm font-semibold text-ink ring-1 ring-inset ring-line hover:bg-tint disabled:opacity-50" data-action="decide" data-decision="Revise" data-team="' + id + '">Revise</button></div>'
      : '';
    return '<details><summary class="cursor-pointer text-sm"><span class="inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ' + (TONE[t.status.tone] || TONE.neutral) + '">' + escape(t.status.label) + '</span> ' + (t.canDecide ? 'Review title' : 'Details') + '</summary>' +
      '<div id="reviewer-decision-' + id + '" class="mt-2 min-w-64"><strong>' + escape(t.submittedTitle || 'Not submitted') + '</strong>' +
      (t.similarityFlag ? '<p class="mt-1 text-sm text-warning">' + icon('triangle-alert', 'Similarity warning') + ' ' + escape(t.similarityFlag) + '</p>' : '') +
      documentsMarkup(t.documents) +
      (t.reviewerNotes ? '<p class="mt-2 text-sm text-muted">' + escape(t.reviewerNotes) + '</p>' : '') +
      decide + '<p id="reviewer-status-' + id + '" class="mt-2 text-sm text-muted" role="status"></p></div></details>';
  }
  function reviewCellMarkup(team, review) {
    const cell = team.reviews.find(r => r.key === review.key) || {enabled:false, actionLabel:'Enter marks', note:'Marks unavailable.'};
    return '<td class="px-4 py-3 align-top"><button type="button" class="border-0 inline-flex items-center gap-1 rounded-md bg-paper px-2 py-1 text-xs font-semibold text-ink ring-1 ring-inset ring-line hover:bg-tint disabled:opacity-50" ' + (cell.enabled ? '' : 'disabled ') +
      'data-action="marks" data-team="' + escape(team.teamId) + '" data-review="' + escape(review.key) + '">' + icon(cell.enabled ? 'clipboard-check' : 'lock-keyhole') + ' ' + escape(cell.actionLabel) + '</button>' +
      '<small class="mt-1 block text-xs text-muted">' + escape(cell.note) + '</small></td>';
  }
  function rowMarkup(team, reviews) {
    return '<tr class="border-b border-edge hover:bg-tint" data-team-id="' + escape(team.teamId) + '">' +
      '<td class="px-4 py-3 align-top text-sm font-semibold text-ink">' + escape(team.teamId) + '</td>' +
      '<td class="px-4 py-3 align-top text-sm text-muted">' + escape(team.guideName || '—') + '</td>' +
      '<td class="px-4 py-3 align-top text-sm text-muted">' + (team.registerNumbers.length ? team.registerNumbers.map(r => '<span class="mr-2 inline-block">' + escape(r) + '</span>').join('') : '—') + '</td>' +
      '<td class="px-4 py-3 align-top text-sm text-ink">' + escape(team.title || 'Not submitted') + '</td>' +
      '<td class="px-4 py-3 align-top text-sm text-muted">' + escape(team.committee || '—') + '</td>' +
      '<td class="px-4 py-3 align-top">' + titleApprovalMarkup(team) + '</td>' +
      reviews.map(review => reviewCellMarkup(team, review)).join('') + '</tr>';
  }
  function statsMarkup(summary) {
    const chips = STAT.filter(([key]) => summary[key] > 0).map(([key, label, tone]) =>
      '<span class="inline-flex items-baseline gap-2 rounded-lg border border-edge bg-paper px-3 py-2"><span class="text-xl font-semibold ' + tone + '">' + summary[key] + '</span><span class="text-sm text-muted">' + label + '</span></span>').join('');
    return chips ? '<div class="mt-4 flex flex-wrap gap-2">' + chips + '</div>' : '';
  }
  function paginationMarkup(total, bounds) {
    const start = total ? bounds.start + 1 : 0;
    let first = Math.max(1, state.page - 2);
    const last = Math.min(bounds.pages, first + 4);
    first = Math.max(1, last - 4);
    const button = (label, page, disabled, active) => '<button type="button" class="border-0 rounded-md px-2.5 py-1 text-sm ring-1 ring-inset ring-line ' + (active ? 'bg-primary text-paper' : 'bg-paper text-ink hover:bg-tint') + ' disabled:opacity-50" data-action="page" data-page="' + page + '"' + (disabled ? ' disabled' : '') + (active ? ' aria-current="page"' : '') + '>' + label + '</button>';
    const numbers = [];
    for (let p = first; p <= last; p++) numbers.push(button(String(p), p, false, p === state.page));
    return '<nav aria-label="Pagination" class="mt-4 flex flex-wrap items-center justify-between gap-3 text-sm text-muted"><span id="reviewerAssignedPaginationInfo">Showing ' + start + ' - ' + bounds.end + ' of ' + total + ' teams</span>' +
      '<label class="flex items-center gap-2">Rows per page <select id="reviewerAssignedPageSize" data-action="size" class="rounded-md border border-control px-2 py-1">' + PAGE_SIZES.map(s => '<option value="' + s + '"' + (String(s) === String(state.size) ? ' selected' : '') + '>' + (s === 'all' ? 'All' : s) + '</option>').join('') + '</select></label>' +
      '<div class="flex items-center gap-1" aria-label="Team table pages">' + button(icon('chevron-left') + 'Previous', state.page - 1, state.page === 1, false) + numbers.join('') + button('Next' + icon('chevron-right'), state.page + 1, state.page === bounds.pages, false) + '</div></nav>';
  }

  function rowsAndPagination() {
    const found = matches(), bounds = pageBounds(found.length);
    const shown = found.slice(bounds.start, bounds.end);
    const reviews = state.dto.reviews;
    const empty = found.length ? '' : '<tr><td class="px-4 py-6 text-sm text-muted" colspan="' + (6 + reviews.length) + '">' + (state.dto.teams.length ? 'No teams match your search.' : 'No teams are assigned to you.') + '</td></tr>';
    return {rows:shown.map(team => rowMarkup(team, reviews)).join('') + empty, pagination:paginationMarkup(found.length, bounds)};
  }
  function updateTable() {
    const part = rowsAndPagination();
    q('[data-reviewer-body]').innerHTML = part.rows;
    q('[data-reviewer-pagination]').innerHTML = part.pagination;
  }

  function headerMarkup(updated) {
    return '<div class="flex items-start justify-between gap-4"><div><h2 class="text-lg font-semibold text-ink">Reviewer Dashboard</h2><p id="reviewerUpdated" class="text-sm text-muted">' + escape(updated) + '</p></div>' +
      '<button type="button" class="border-0 inline-flex items-center gap-1 rounded-md bg-paper px-3 py-1.5 text-sm font-semibold text-ink ring-1 ring-inset ring-line hover:bg-tint disabled:opacity-50" data-refresh-button id="reviewerRefresh" aria-label="Refresh Reviewer Dashboard" data-action="refresh">' + icon('refresh-cw') + 'Refresh</button></div>' +
      '<p id="reviewerRefreshStatus" class="mt-1 text-sm text-muted" data-refresh-status role="status" aria-live="polite"></p>';
  }
  function updatedLabel() {
    return 'Last updated: ' + new Date().toLocaleString('en-IN', {timeZone:'Asia/Kolkata', day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:true}) + ' IST';
  }

  /** Replaces the host content with the DTO, keeping the current search and page size. */
  function render(host, dto) {
    state.host = host;
    state.dto = dto;
    const part = rowsAndPagination();
    const head = dto.reviews.map(r => '<th scope="col" class="px-4 py-3">' + escape(r.label) + '</th>').join('');
    host.innerHTML = headerMarkup(updatedLabel()) + statsMarkup(dto.summary) +
      (dto.reviewError ? '<p class="mt-3 text-sm text-danger" role="status">Review marks are unavailable: ' + escape(dto.reviewError) + '</p>' : '') +
      '<section class="mt-4 rounded-lg border border-edge bg-paper p-4" aria-labelledby="reviewerAssignedHeading">' +
      '<h3 id="reviewerAssignedHeading" class="text-base font-semibold text-ink">Assigned Teams (' + dto.teams.length + ' teams)</h3>' +
      '<input type="search" id="reviewerAssignedSearch" aria-label="Search assigned teams" placeholder="Search team, guide, register number, or title…" value="' + escape(state.query) + '" class="mt-3 block w-full max-w-md rounded-md border border-control px-3 py-2 text-sm" data-action="search">' +
      '<p id="reviewerAssignedScrollHint" class="mt-2 text-xs text-muted">Scroll horizontally if more review columns are off-screen.</p>' +
      '<div class="mt-2 max-w-full overflow-x-auto rounded-lg border border-edge" data-tooltip-boundary role="region" aria-label="Assigned teams table, scroll horizontally for more columns" aria-describedby="reviewerAssignedScrollHint" tabindex="0">' +
      '<table class="min-w-full divide-y divide-edge bg-paper text-left"><thead class="bg-canvas text-xs font-semibold uppercase tracking-wider text-muted"><tr>' +
      '<th scope="col" class="px-4 py-3">Team</th><th scope="col" class="px-4 py-3">Guide</th><th scope="col" class="px-4 py-3">Register Numbers</th><th scope="col" class="px-4 py-3">Project Title</th><th scope="col" class="px-4 py-3">Committee</th><th scope="col" class="px-4 py-3">Title Approval</th>' + head +
      '</tr></thead><tbody data-reviewer-body>' + part.rows + '</tbody></table></div><div data-reviewer-pagination>' + part.pagination + '</div></section>';
    host.onclick = onClick;
    host.oninput = onInput;
    host.onchange = onChange;
  }

  function onInput(event) {
    if (event.target.dataset.action !== 'search') return;
    state.query = event.target.value;
    state.page = 1;
    updateTable();
  }
  function onChange(event) {
    if (event.target.dataset.action !== 'size') return;
    state.size = event.target.value === 'all' ? 'all' : Number(event.target.value);
    state.page = 1;
    updateTable();
  }
  function onClick(event) {
    const target = event.target.closest ? event.target.closest('[data-action]') : null;
    if (!target || target.disabled) return;
    const action = target.dataset.action;
    if (action === 'page') { state.page = Number(target.dataset.page); updateTable(); }
    else if (action === 'marks') getUi().openReviewerMarks(target.dataset.team, target.dataset.review, target);
    else if (action === 'refresh') getUi().refreshRoleDashboard('reviewer');
    else if (action === 'decide') decide(target.dataset.team, target.dataset.decision);
  }

  function setStatus(team, text) { const el = document.getElementById('reviewer-status-' + team); if (el) el.textContent = text; }
  function setBusy(team, busy) {
    const row = document.getElementById('reviewer-decision-' + team);
    if (row) row.querySelectorAll('button').forEach(b => { b.disabled = busy; });
  }
  function load() { return bridge.read('role:reviewer', 'API_reviewer_getDashboard', []); }

  /** Re-reads after a mutation or marks save; keeps content and reports on failure. */
  function refresh() {
    const host = state.host;
    if (!host || host.getAttribute('aria-busy') === 'true') return Promise.resolve(false);
    const finish = getUi().beginContentLoading(host, 'Refreshing assigned teams', {compact:true});
    return load().then(dto => { finish(); render(host, dto); return true; }, error => { finish(); return false; });
  }

  function decide(team, decision) {
    if (state.busyTeam) return;
    const notesEl = document.getElementById('reviewer-notes-' + team);
    const notes = notesEl ? notesEl.value : '';
    if (decision === 'Revise' && !notes.trim()) { setStatus(team, 'Note required.'); return; }
    state.busyTeam = team;
    setBusy(team, true);
    setStatus(team, 'Submitting…');
    bridge.write('API_reviewer_submitDecision', [team, decision, notes]).then(
      () => {
        const host = state.host, finish = getUi().beginContentLoading(host, 'Refreshing assigned teams', {compact:true});
        return load().then(dto => { finish(); state.busyTeam = null; render(host, dto); },
          error => { finish(); state.busyTeam = null; setStatus(team, 'Refresh failed: ' + error.message); setBusy(team, false); });
      },
      error => { state.busyTeam = null; setStatus(team, error.message || 'Unable to submit decision.'); setBusy(team, false); });
  }

  return {load, render, refresh, decide, state};
}
