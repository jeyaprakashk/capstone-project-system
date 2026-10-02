/**
 * COORDINATOR VIEW — browser module serialized into the dashboard shell as `CoordinatorView`.
 * Renders the coordinator DTOs (DATA-CONTRACTS.md) with Tailwind utilities: summary cards and the
 * team tracker (search, filters, sorting, pagination). Three reads feed it in parallel — overview
 * (rendered first), progress (assessments, health) and weekly activity — each settling on its own.
 * It never calls google.script.run; the team drawer stays in DashboardUI.
 */
function coordinatorViewBrowser_(bridge, getUi) {
  'use strict';
  const PAGE_SIZES = [10, 25, 50, 'all'];
  const READ = {timeoutMs:120000};
  const persistent = {sort:{column:null, direction:'ascending', type:'text'}, size:10};
  const state = {};
  let generation = 0, pending = null, host = null;
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = (name, label) => getUi().renderIcon(name, label);
  const skeleton = label => getUi().renderSkeleton('inline', label);
  const q = selector => host && host.querySelector(selector);
  const isLoading = value => /^loading/i.test(String(value || ''));

  const BUTTON = 'border-0 rounded-md bg-paper px-3 py-1.5 text-sm font-semibold text-ink ring-1 ring-inset ring-line hover:bg-tint disabled:opacity-50';
  const SMALL = 'border-0 inline-flex items-center rounded-md bg-paper px-2 py-1 text-xs font-semibold text-ink ring-1 ring-inset ring-line hover:bg-tint disabled:opacity-50';
  const BADGE = 'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ';
  const TONE = {
    success:BADGE + 'bg-success-tint text-success ring-success/20', warning:BADGE + 'bg-warning-tint text-warning ring-warning/20',
    danger:BADGE + 'bg-danger-tint text-danger ring-danger/20', info:BADGE + 'bg-info-tint text-info ring-info/20'
  };
  const CARD_TONE = {complete:'border-l-success', danger:'border-l-danger', warning:'border-l-accent', neutral:'border-l-control'};
  const SORT_TYPE = {pair:'pair', text:'text'};

  const effective = () => state.progress || state.overview;
  const activityLabel = result => result.state === 'active' ? 'Logs / commit records this week' : result.state === 'not-started' ? 'Weekly logging has not started' : result.state === 'ended' ? 'Weekly logging has ended' : 'Activity unavailable: check project dates';
  const pct = (n, total) => total > 0 ? Math.round(n / total * 100) : 0;
  const completionTone = (total, value, color, note) => {
    if (!total || typeof value !== 'number' || /unavailable/i.test(note)) return 'neutral';
    const remaining = color === 'red' ? value : total - value;
    return remaining <= 0 ? 'complete' : remaining / total >= .6 ? 'danger' : remaining / total >= .3 ? 'warning' : 'neutral';
  };

  // ---- summary cards ----
  function statCard(c) {
    return '<div class="rounded-card border border-edge border-l-4 bg-paper p-4 shadow-card ' + CARD_TONE[c.tone] + '" data-stat-card' + (c.progress ? ' data-progress-stat' : '') + ' data-completion-tone="' + c.tone + '">' +
      '<div class="flex items-center justify-between gap-2 text-sm font-semibold text-ink-2"><span>' + c.label + '</span>' + icon(c.icon) + '</div>' +
      '<div class="mt-2 flex items-baseline gap-2"><div class="text-kpi font-semibold tabular-nums text-ink" data-stat-value' + (c.ids ? ' id="coordinatorActiveTeams"' : '') + '>' + c.value + '</div>' +
      '<div class="stat-pct text-sm text-muted empty:hidden"' + (c.ids ? ' id="coordinatorActiveTeamsPct"' : '') + '>' + c.note + '</div></div><div class="mt-2 text-xs text-muted">' + c.detail + '</div></div>';
  }
  function progressBar(value, total, left, right) {
    return '<div class="h-2 overflow-hidden rounded bg-tint" aria-hidden="true"><span class="block h-full rounded bg-primary" style="width:' + pct(value, total) + '%"></span></div>' +
      '<div class="flex justify-between"><span>' + left + '</span><span>' + right + '</span></div>';
  }
  function statCards() {
    const dto = effective(), s = dto.stats, total = s.total, loading = dto.loading, failed = state.progressError && !state.progress;
    const cards = [];
    const add = (label, value, color, note, iconName, detail, extra) => cards.push({label, value, color, note, icon:iconName, detail, tone:completionTone(total, typeof value === 'number' ? value : NaN, color, String(note)), ...extra});
    add('Total Teams', total, 'blue', 'Teams Roster', 'users', '<span>●</span> Teams registered');
    add('Repositories Available', s.reposReady, 'purple', pct(s.reposReady, total) + '% linked', 'git-branch', progressBar(s.reposReady, total, s.reposReady + ' / ' + total + ' recorded', Math.max(0, total - s.reposReady) + ' missing'));
    add('Title Approved', s.titleApproved, 'green', pct(s.titleApproved, total) + '% validated', 'tag', progressBar(s.titleApproved, total, s.titleApproved + ' approved', Math.max(0, total - s.titleApproved) + ' pending approval'));
    const a = state.activity;
    if (a && a.state) {
      const activeValue = a.activeTeams === null || a.activeTeams === undefined ? null : a.activeTeams;
      const remaining = a.totalTeams - activeValue;
      const tone = activeValue === null || !a.totalTeams || a.state !== 'active' ? 'neutral' : remaining <= 0 ? 'complete' : remaining / a.totalTeams >= .6 ? 'danger' : remaining / a.totalTeams >= .3 ? 'warning' : 'neutral';
      cards.push({label:'Active This Week', value:activeValue === null ? '—' : activeValue, note:activeValue === null ? activityLabel(a) : '(' + pct(activeValue, a.totalTeams || 0) + '%)', icon:'trending-up', detail:'Weekly repository activity', tone, ids:true});
    } else cards.push({label:'Active This Week', value:skeleton('Loading activity'), note:skeleton('Loading activity'), icon:'trending-up', detail:'Weekly repository activity', tone:'neutral', ids:true});
    const unavailable = '<span>Unavailable</span>';
    s.reviews.forEach((r, index) => {
      const value = failed ? unavailable : loading ? skeleton('Loading ' + r.label) : r.known ? r.completed : '—';
      const note = failed ? '' : loading ? '' : !r.known ? 'Unavailable' : r.unavailable ? r.unavailable + ' unavailable' : pct(r.completed, total) + '% (' + r.completed + '/' + total + ')';
      add(escape(r.label) + ' Completed', value, 'teal', note, ['clipboard-check', 'file-text', 'book-open'][index % 3], 'Team review completion', {progress:true});
    });
    const g = s.guideEvaluation, gAvailable = g && g.available;
    add('Guide Evaluation Completed', failed ? unavailable : loading ? skeleton('Loading guide evaluation') : gAvailable ? g.completed : '—', 'teal', failed || loading ? '' : gAvailable ? pct(g.completed, total) + '% evaluated' : 'Unavailable', 'graduation-cap', 'Guide assessment completion', {progress:true});
    add('Need Attention', failed ? unavailable : loading ? skeleton('Loading attention count') : s.needsAttention, 'red', failed || loading ? '' : pct(s.needsAttention, total) + '% of cohort', 'triangle-alert', 'Teams with overdue requirements', {progress:true});
    return '<div class="coordinator-stats-grid grid gap-4 sm:grid-cols-2 lg:grid-cols-4">' + cards.map(statCard).join('') + '</div>';
  }
  function renderStats() { const el = q('#coordinatorStats'); if (el) el.innerHTML = statCards(); }

  // ---- tracker ----
  function filteredTeams() {
    const query = state.query.trim().toLowerCase(), filter = state.filter;
    return effective().teams.filter(t => {
      const search = [t.teamId, t.guide, ...t.registerNumbers].join(' ').toLowerCase();
      if (!search.includes(query)) return false;
      if (filter === 'attention') return t.health === 'attention';
      if (filter === 'ontrack') return t.health === 'ontrack';
      if (filter.indexOf('deadline:') === 0) return t.pendingDeadlines.indexOf(filter.slice(9)) !== -1;
      return true;
    });
  }
  function activityOf(team) {
    const a = state.activity;
    if (!a || !a.teams) return null;
    const item = a.teams[String(team.teamId).trim().toLowerCase()];
    return item && a.state === 'active' ? item.logs + '/' + item.commits : '—';
  }
  function sortValue(team, column, columns) {
    const reviewCount = columns.length;
    let value;
    if (column === 0) value = team.teamId;
    else if (column === 1) value = team.guide;
    else if (column === 2) value = team.repoStatus || 'Unavailable';
    else if (column === 3) value = team.titleStatus || 'Unavailable';
    else if (column === 4) { value = activityOf(team); if (value === null) return null; }
    else if (column < 5 + reviewCount) value = team.health === 'loading' ? 'loading' : team.reviews[columns[column - 5].key] || 'Unavailable';
    else if (column === 5 + reviewCount) value = team.guideEvaluation || 'Unavailable';
    else value = team.health || 'Unavailable';
    value = String(value).trim();
    if (persistent.sort.type === 'pair' && !value.split('/').every(part => part.trim() !== '' && Number.isFinite(Number(part)))) return null;
    return !value || value === '—' || /^(loading|unavailable)$/i.test(value) ? null : value;
  }
  function sortedTeams(teams) {
    const sort = persistent.sort, columns = effective().reviewColumns;
    if (sort.column === null) return teams.slice();
    const collator = new Intl.Collator(undefined, {numeric:true, sensitivity:'base'});
    return teams.map((team, index) => ({team, index, value:sortValue(team, sort.column, columns)})).sort((a, b) => {
      if (a.value === null || b.value === null) return a.value === b.value ? a.index - b.index : a.value === null ? 1 : -1;
      let comparison = 0;
      if (sort.type === 'pair') {
        const av = a.value.split('/').map(Number), bv = b.value.split('/').map(Number);
        for (let i = 0; i < 2; i++) { comparison = (av[i] || 0) - (bv[i] || 0); if (comparison) break; }
      } else comparison = collator.compare(a.value, b.value);
      return comparison * (sort.direction === 'descending' ? -1 : 1) || a.index - b.index;
    }).map(item => item.team);
  }

  const completion = value => value === 'Completed' ? '<span class="' + TONE.success + '">Completed</span>' : value === 'Pending' ? '<span class="' + TONE.warning + '">Pending</span>'
    : isLoading(value) ? skeleton('Loading assessment') : '<span class="' + TONE.danger + '">' + escape(value || 'Unavailable') + '</span>';
  const unavailableCell = () => icon('triangle-alert', 'Unavailable');
  function teamActions(team) {
    const label = escape(team.teamId), recipients = team.emailRecipients;
    const email = recipients.length
      ? '<a class="' + SMALL + ' no-underline" href="' + escape('mailto:' + recipients.map(encodeURIComponent).join(',') + '?subject=' + encodeURIComponent('Capstone — Team ' + team.teamId)) + '" aria-label="Email guide and members of team ' + label + '" title="Email guide and team members">' + icon('mail') + '</a>'
      : '<button type="button" class="' + SMALL + '" disabled aria-label="No email addresses available for team ' + label + '" title="No email addresses available">' + icon('mail') + '</button>';
    return '<div class="flex gap-1"><button type="button" class="' + SMALL + '" data-action="view-team" data-team="' + label + '" aria-label="View team ' + label + '" title="View team details">' + icon('eye') + '</button>' + email + '</div>';
  }
  function rowMarkup(t, reviewColumns) {
    const failed = state.progressError && !state.progress, loadingRow = t.health === 'loading';
    const titleBadge = t.titleStatus === 'APPROVED' ? TONE.success + '">Approved' : t.titleStatus === 'NEEDS_REVIEW' ? TONE.warning + '">Review' : t.titleStatus === 'REJECTED_BY_GUIDE' ? TONE.danger + '">Rejected' : TONE.info + '">Pending';
    const repoLabel = escape([t.repoStatus === 'ready' ? 'Repository URL recorded' : 'Pending', t.githubMessage, t.githubTiming, t.repoUrl ? 'Repository available' : ''].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' · '));
    const health = t.health === 'ontrack' ? [TONE.success, 'On track'] : t.health === 'monitor' ? [TONE.warning, 'Monitor'] : [TONE.danger, 'Needs attention'];
    const activity = activityOf(t), cell = 'px-3 py-2 align-top text-sm';
    return '<tr class="border-b border-edge hover:bg-canvas" data-team-id="' + escape(t.teamId) + '" data-health="' + escape(t.health) + '">' +
      '<td class="' + cell + '"><strong>' + escape(t.teamId) + '</strong><div class="text-xs text-muted">' + (t.registerNumbers.length ? t.registerNumbers.map(escape).join(', ') : '—') + '</div></td>' +
      '<td class="' + cell + '">' + escape(t.guide) + '</td>' +
      '<td class="' + cell + '"><span class="' + (t.repoStatus === 'ready' ? TONE.success : TONE.danger) + '" tabindex="0" aria-label="' + repoLabel + '" title="' + repoLabel + '">' + (t.repoStatus === 'ready' ? 'Ready' : 'Pending') + '</span></td>' +
      '<td class="' + cell + '"><span class="' + titleBadge + '</span></td>' +
      '<td class="' + cell + '" data-col="activity"' + (activity === null ? '' : ' title="' + escape(activityLabel(state.activity)) + '"') + '>' + (activity === null ? skeleton('Loading weekly activity') : escape(activity)) + '</td>' +
      reviewColumns.map(r => '<td class="' + cell + '" data-col="review">' + (failed ? unavailableCell() : loadingRow ? skeleton('Loading ' + r.label) : completion(t.reviews[r.key])) + '</td>').join('') +
      '<td class="' + cell + '" data-col="guide-evaluation">' + (failed ? unavailableCell() : completion(t.guideEvaluation)) + '</td>' +
      '<td class="' + cell + '" data-col="health">' + (failed ? unavailableCell() : loadingRow ? skeleton('Loading health') : '<span class="' + health[0] + '" tabindex="0" aria-label="' + health[1] + '" title="' + health[1] + '">' + health[1] + '</span>') + '</td>' +
      '<td class="' + cell + '">' + teamActions(t) + '</td></tr>';
  }
  function filterButtons() {
    const dto = effective(), teams = dto.teams, anyLoading = teams.some(t => t.health === 'loading'), failed = state.progressError && !state.progress;
    const count = (predicate, label) => anyLoading ? (failed ? 'Unavailable' : skeleton('Loading ' + label)) : teams.filter(predicate).length;
    const tab = (filter, html, disabled, title) => '<button type="button" class="border-0 rounded-md px-3 py-1.5 text-sm font-semibold text-ink-2 aria-pressed:bg-paper aria-pressed:text-primary aria-pressed:shadow-selected disabled:opacity-50" data-action="filter" data-filter="' + escape(filter) + '" aria-pressed="' + (state.filter === filter) + '"' + (disabled ? ' disabled' : '') + (title ? ' title="' + escape(title) + '"' : '') + '>' + html + '</button>';
    return tab('all', 'All (' + teams.length + ')', false) + tab('attention', 'Attention (' + count(t => t.health === 'attention', 'attention count') + ')', anyLoading) + tab('ontrack', 'On Track (' + count(t => t.health === 'ontrack', 'on-track count') + ')', anyLoading) +
      dto.deadlinePills.map(p => tab('deadline:' + p.key, escape(p.label) + ' (' + p.count + ')' + (p.overdue ? ' <span class="' + TONE.danger + '">Overdue</span>' : ''), false, 'Due ' + p.due)).join('');
  }
  function headMarkup(reviewColumns) {
    const sort = persistent.sort;
    const th = (label, type, column, title) => {
      const selected = sort.column === column, direction = selected ? sort.direction : 'none';
      const attr = (type ? ' data-sort-type="' + type + '" aria-sort="' + direction + '"' : '') + (title ? ' title="' + escape(title) + '"' : '');
      return '<th class="px-3 py-2 text-left text-xs font-semibold text-ink-2" scope="col"' + attr + '>' + (type
        ? '<button type="button" class="' + SMALL + '" data-action="sort" data-column="' + column + '" data-type="' + type + '" data-sort-direction="' + direction + '" aria-label="Sort by ' + escape(label) + (selected && sort.direction === 'ascending' ? ' descending' : ' ascending') + '">' + escape(label) + '</button>'
        : escape(label)) + '</th>';
    };
    let i = 0;
    return '<tr>' + th('Team', 'text', i++) + th('Guide', 'text', i++) + th('Repo', 'text', i++) + th('Title', 'text', i++) + th('Weekly Activity', 'pair', i++, 'Sort by logs, then commit records') +
      reviewColumns.map(r => th(r.label.replace(/^Review\s+(\d+)$/i, 'R$1'), 'text', i++, r.label)).join('') + th('Guide Eval', 'text', i++) + th('Health', 'text', i++) + th('Actions', null, i++) + '</tr>';
  }
  function paginationMarkup(total, bounds) {
    const start = total ? bounds.start + 1 : 0;
    let first = Math.max(1, state.page - 2);
    const last = Math.min(bounds.pages, first + 4);
    first = Math.max(1, last - 4);
    const button = (label, page, disabled, active) => '<button type="button" class="border-0 rounded-md px-2.5 py-1 text-sm ring-1 ring-inset ring-line ' + (active ? 'bg-primary text-paper' : 'bg-paper text-ink hover:bg-tint') + ' disabled:opacity-50" data-action="page" data-page="' + page + '"' + (disabled ? ' disabled' : '') + (active ? ' aria-current="page"' : '') + '>' + label + '</button>';
    const numbers = [];
    for (let p = first; p <= last; p++) numbers.push(button(String(p), p, false, p === state.page));
    return '<nav aria-label="Pagination" class="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-muted"><span id="trackerPaginationInfo">Showing ' + start + ' - ' + bounds.end + ' of ' + total + ' teams</span>' +
      '<label class="flex items-center gap-2">Rows per page <select id="trackerPageSize" data-action="size" class="rounded-md border border-control px-2 py-1">' + PAGE_SIZES.map(s => '<option value="' + s + '"' + (String(s) === String(persistent.size) ? ' selected' : '') + '>' + (s === 'all' ? 'All' : s) + '</option>').join('') + '</select></label>' +
      '<div id="trackerPaginationButtons" class="flex items-center gap-1" aria-label="Team table pages">' + button(icon('chevron-left') + 'Previous', state.page - 1, state.page === 1, false) + numbers.join('') + button('Next' + icon('chevron-right'), state.page + 1, state.page === bounds.pages, false) + '</div></nav>';
  }
  function updateTracker() {
    const dto = effective(), found = sortedTeams(filteredTeams());
    const size = persistent.size === 'all' ? Math.max(1, found.length) : persistent.size, pages = Math.max(1, Math.ceil(found.length / size));
    state.page = Math.min(Math.max(1, state.page), pages);
    const bounds = {pages, start:(state.page - 1) * size, end:Math.min(state.page * size, found.length)};
    q('[data-tracker-heading]').textContent = 'Team Tracker (' + dto.teams.length + ' teams)';
    q('[data-tracker-filters]').innerHTML = filterButtons();
    q('#trackerBody').parentElement.querySelector('thead').innerHTML = headMarkup(dto.reviewColumns);
    q('#trackerBody').innerHTML = found.slice(bounds.start, bounds.end).map(t => rowMarkup(t, dto.reviewColumns)).join('') +
      (found.length ? '' : '<tr><td class="px-3 py-6 text-sm text-muted" colspan="' + (8 + dto.reviewColumns.length) + '">' + (dto.teams.length ? 'No teams match your search.' : 'No teams are registered.') + '</td></tr>');
    q('[data-tracker-pagination]').innerHTML = paginationMarkup(found.length, bounds);
  }
  function trackerMarkup() {
    return '<div class="rounded-card border border-edge bg-paper p-4 shadow-card" data-team-tracker="coordinator"><div><h3 class="text-base font-semibold text-ink" data-tracker-heading></h3></div>' +
      '<div class="mt-3 inline-flex flex-wrap gap-1 rounded-xl bg-tint p-1" data-tracker-filters></div>' +
      '<div class="mt-2"><button class="' + BUTTON + '" type="button" id="weeklyActivityRetry" data-action="activity-retry" hidden>Retry activity</button><p id="weeklyActivityStatus" class="text-xs text-muted" role="status" aria-live="polite"></p></div>' +
      '<div class="mt-3 flex flex-wrap gap-2"><input type="text" id="trackerSearch" class="w-full max-w-md rounded-md border border-control px-3 py-2 text-sm" aria-label="Search teams by team ID, register number, or guide" placeholder="Search team, register number, or guide…" data-action="search"><button class="' + BUTTON + '" type="button" data-action="reset">Reset</button></div>' +
      '<div class="tracker-table-scroll max-w-full overflow-x-auto overscroll-x-contain mt-3 rounded-tile border border-edge" data-tooltip-boundary role="region" aria-label="Team tracker table, scroll horizontally for more columns" tabindex="0"><table class="w-full border-collapse text-sm"><thead class="bg-soft"></thead><tbody id="trackerBody"></tbody></table></div><div data-tracker-pagination></div></div>';
  }

  // ---- frame ----
  function drawerMarkup() {
    return '<div id="teamDrawerBackdrop" class="fixed inset-0 z-40 bg-scrim animate-[fade-in_.15s_cubic-bezier(.2,0,0,1)]" hidden></div>' +
      '<aside id="teamDrawer" class="fixed inset-y-0 right-0 z-40 flex w-full max-w-[420px] flex-col bg-paper shadow-overlay animate-[slide-in-right_.25s_cubic-bezier(.2,0,0,1)]" data-tooltip-boundary role="dialog" aria-modal="true" aria-labelledby="teamDrawerTitle" aria-hidden="true" inert hidden>' +
      '<div class="flex items-center justify-between gap-3 border-b border-edge px-5 py-4"><div><div class="text-xs font-bold tracking-wider text-muted">TEAM DETAILS</div><div id="teamDrawerTitle" class="text-base font-semibold">Team</div></div>' +
      '<button type="button" class="' + SMALL + '" data-drawer-close data-action="close-drawer" aria-label="Close">' + icon('x') + '</button></div>' +
      '<div id="teamDrawerContent" class="team-drawer-content flex-1 overflow-auto p-5" data-drawer-content></div><div class="flex justify-end gap-2 border-t border-edge px-5 py-3" hidden></div></aside>';
  }
  function headerMarkup() {
    return '<div class="flex items-start justify-between gap-4"><div><h2 class="text-lg font-semibold text-ink">Coordinator Dashboard</h2><p id="coordUpdated" class="text-sm text-muted">Waiting for data…</p></div>' +
      '<button type="button" class="' + BUTTON + ' inline-flex items-center gap-1" data-refresh-button id="coordRefresh" aria-label="Refresh Coordinator Dashboard" data-action="refresh">' + icon('refresh-cw') + 'Refresh</button></div>' +
      '<p id="coordRefreshStatus" class="mt-1 text-sm text-muted" data-refresh-status role="status" aria-live="polite"></p>';
  }
  const updatedLabel = () => 'Last updated: ' + new Date().toLocaleString('en-IN', {timeZone:'Asia/Kolkata', day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:true}) + ' IST';

  function setProgressStatus(message, retryAction) {
    const el = q('#coordinatorProgressStatus');
    if (!el) return;
    el.innerHTML = message ? '<span class="text-sm text-ink-2">' + escape(message) + '</span> ' + (retryAction ? '<button type="button" class="' + SMALL + '" data-action="' + retryAction + '">Retry</button>' : '') : '';
  }

  /** Replaces the host content with the overview and attaches the parallel progress and activity reads. */
  function render(target, overview) {
    host = target;
    const wasPending = pending && pending.gen === generation ? pending : null;
    Object.assign(state, {overview, progress:null, progressError:null, activity:null, filter:'all', query:'', page:1, partial:false});
    host.innerHTML = headerMarkup() + '<div id="coordinatorAsyncRoot" class="mt-4 flex flex-col gap-4"><div id="coordinatorOverviewStatus" role="status"></div>' +
      (overview.reviewConfigurationError ? '<p role="status" class="text-sm text-warning">Review configuration unavailable. Check System Status.</p>' : '') +
      '<div id="coordinatorStats"></div><div id="coordinatorProgressStatus" role="status"></div><div id="coordinatorTracker">' + trackerMarkup() + '</div></div>' + drawerMarkup();
    host.onclick = onClick; host.oninput = onInput; host.onchange = onChange;
    renderStats(); updateTracker();
    const gen = generation;
    if (wasPending) {
      wasPending.progress.then(dto => { if (gen === generation) applyProgress(dto); }, error => { if (gen === generation && !error.superseded) failProgress(error); });
      wasPending.activity.then(result => { if (gen === generation) applyActivity(result); }, error => { if (gen === generation && !error.superseded) failActivity(error); });
    }
  }

  function applyProgress(dto) {
    state.progress = dto; state.progressError = null; state.partial = !!dto.partial;
    if (state.filter !== 'all' && !(state.filter.indexOf('deadline:') === 0 ? dto.deadlinePills.some(p => 'deadline:' + p.key === state.filter) : ['attention', 'ontrack'].includes(state.filter))) state.filter = 'all';
    renderStats(); updateTracker();
    const updated = q('#coordUpdated'); if (updated) updated.textContent = updatedLabel();
    setProgressStatus(dto.partial ? 'Some assessment data is unavailable. Counts are partial; unavailable reviews are excluded from overdue alerts.' : '', dto.partial ? 'progress-retry' : null);
  }
  function failProgress(error) {
    if (state.progress) return;
    state.progressError = error;
    renderStats(); updateTracker();
    setProgressStatus('Unable to load progress: ' + (error && error.message || 'The server did not provide error details'), 'progress-retry');
  }
  function applyActivity(result) {
    state.activity = result; renderStats(); updateTracker();
    const status = q('#weeklyActivityStatus'); if (status) status.textContent = activityLabel(result) + ' · Updated ' + new Date(result.checkedAt).toLocaleString();
    const retry = q('#weeklyActivityRetry'); if (retry) retry.hidden = result.state !== 'unavailable';
  }
  function failActivity(error) {
    state.activity = {state:'unavailable', teams:{}, activeTeams:null, totalTeams:0, checkedAt:new Date().toISOString()};
    renderStats(); updateTracker();
    const status = q('#weeklyActivityStatus'); if (status) status.textContent = 'Unable to load weekly activity: ' + (error && error.message || 'The server did not provide error details');
    const retry = q('#weeklyActivityRetry'); if (retry) retry.hidden = false;
  }

  function retryProgress() {
    const gen = generation;
    state.progressError = null; setProgressStatus('', null);
    bridge.read('coord:progress', 'API_coordinator_getProgress', [], READ).then(dto => { if (gen === generation) applyProgress(dto); }, error => { if (gen === generation && !error.superseded) failProgress(error); });
  }
  function retryActivity() {
    const gen = generation, retry = q('#weeklyActivityRetry'), status = q('#weeklyActivityStatus');
    if (retry) retry.hidden = true; if (status) status.innerHTML = skeleton('Loading weekly activity');
    bridge.read('coord:activity', 'API_coordinator_getActivity', [], READ).then(result => { if (gen === generation) applyActivity(result); }, error => { if (gen === generation && !error.superseded) failActivity(error); });
  }

  /** Starts the overview read; progress and activity start at once so all three overlap. */
  function load() {
    const gen = ++generation;
    const progress = bridge.read('coord:progress', 'API_coordinator_getProgress', [], READ), activity = bridge.read('coord:activity', 'API_coordinator_getActivity', [], READ);
    progress.catch(() => {}); activity.catch(() => {});
    pending = {gen, progress, activity};
    return bridge.read('role:coord', 'API_coordinator_getOverview', [], READ);
  }

  // ---- events ----
  function onInput(event) {
    if (event.target.getAttribute && event.target.getAttribute('data-action') !== 'search') return;
    state.query = event.target.value; state.page = 1; updateTracker();
  }
  function onChange(event) {
    if (event.target.getAttribute && event.target.getAttribute('data-action') !== 'size') return;
    persistent.size = event.target.value === 'all' ? 'all' : Number(event.target.value); state.page = 1; updateTracker();
  }
  function onClick(event) {
    const target = event.target.closest ? event.target.closest('[data-action]') : null;
    if (!target || target.disabled) return;
    const action = target.getAttribute('data-action'), ui = getUi();
    if (action === 'filter') { state.filter = target.getAttribute('data-filter'); state.page = 1; updateTracker(); }
    else if (action === 'sort') {
      const column = Number(target.getAttribute('data-column')), sort = persistent.sort;
      sort.direction = sort.column === column && sort.direction === 'ascending' ? 'descending' : 'ascending';
      sort.column = column; sort.type = SORT_TYPE[target.getAttribute('data-type')] || 'text'; state.page = 1; updateTracker();
    }
    else if (action === 'page') { state.page = Number(target.getAttribute('data-page')); updateTracker(); }
    else if (action === 'reset') { state.query = ''; state.filter = 'all'; state.page = 1; const box = q('#trackerSearch'); if (box) box.value = ''; updateTracker(); }
    else if (action === 'view-team') ui.focusCoordinatorTeam(target.getAttribute('data-team'));
    else if (action === 'close-drawer') ui.closeCoordinatorTeamDrawer();
    else if (action === 'refresh') ui.refreshRoleDashboard('coord');
    else if (action === 'progress-retry') retryProgress();
    else if (action === 'activity-retry') retryActivity();
  }

  return {load, render, state, persistent};
}
