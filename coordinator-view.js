/**
 * COORDINATOR VIEW — browser module serialized into the dashboard shell as `CoordinatorView`.
 * Renders the coordinator DTOs (DATA-CONTRACTS.md) with Tailwind utilities: summary cards and the
 * team tracker (search, filters, sorting, pagination). The overview renders first; then one read per
 * Review, the Guide Evaluation, health and weekly activity run in parallel, each settling (or failing,
 * with its own Retry) on its own.
 * It never calls google.script.run; the team drawer is rendered by TeamDrawerView.
 */
function coordinatorViewBrowser_(bridge, getUi) {
  'use strict';
  const PAGE_SIZES = [10, 25, 50, 'all'];
  const READ = {timeoutMs:120000};
  const persistent = {sort:{column:null, direction:'ascending', type:'text'}, size:10};
  const state = {};
  let generation = 0, pending = null, host = null;
  const delegated = new WeakSet();
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
  const DOT = {complete:'bg-success', danger:'bg-danger', warning:'bg-accent', neutral:'bg-control'};
  const STAT_TEXT = {complete:'text-success', danger:'text-danger', warning:'text-warning', neutral:'text-primary'};
  const STAT_TINT = {complete:'bg-success-tint', danger:'bg-danger-tint', warning:'bg-warning-tint', neutral:'bg-canvas'};
  const SORT_TYPE = {pair:'pair', text:'text'};
  const PROGRESS = 'block h-2 w-full appearance-none overflow-hidden rounded border-0 bg-tint [&::-webkit-progress-bar]:bg-tint [&::-webkit-progress-value]:rounded [&::-webkit-progress-value]:bg-primary [&::-moz-progress-bar]:bg-primary';

  const reviewStatus = key => state.reviews[key] ? 'ready' : state.reviewErrors[key] ? 'failed' : 'loading';
  const guideStatus = () => state.guide ? 'ready' : state.guideError ? 'failed' : 'loading';
  const healthStatus = () => state.health ? 'ready' : state.healthError ? 'failed' : 'loading';
  const settled = (map, id, status) => status === 'ready' ? (map[id] || 'Unavailable') : status === 'failed' ? 'Unavailable' : 'Loading…';
  /** The overview with every section that has arrived merged in; sections still pending or failed say so per value. */
  function effective() {
    const o = state.overview, health = state.health, h = healthStatus(), g = state.guide, gs = guideStatus();
    const healthOf = team => health ? health.teams[team.teamId] : null;
    return {
      ...o,
      healthStatus:h,
      stats:{...o.stats,
        needsAttention:health ? health.needsAttention : null,
        guideEvaluation:{status:gs, available:g ? g.available : false, completed:g ? g.completed : 0},
        reviews:o.stats.reviews.map(r => { const d = state.reviews[r.key]; return {...r, status:reviewStatus(r.key), known:!!d, completed:d ? d.completed : null, unavailable:d ? d.unavailable : 0}; })},
      teams:o.teams.map(t => ({...t,
        reviews:Object.fromEntries(o.reviewColumns.map(c => [c.key, settled(state.reviews[c.key] ? state.reviews[c.key].teams : {}, t.teamId, reviewStatus(c.key))])),
        guideEvaluation:settled(g ? g.teams : {}, t.teamId, gs),
        health:health ? (healthOf(t) ? healthOf(t).health : 'unavailable') : h === 'failed' ? 'unavailable' : 'loading',
        pendingDeadlines:healthOf(t) ? healthOf(t).pendingDeadlines : []})),
      deadlinePills:health ? health.deadlinePills : o.deadlinePills
    };
  }
  const activityLabel = result => result.state === 'active' ? 'Logs / commit records this week' : result.state === 'not-started' ? 'Weekly logging has not started' : result.state === 'between' ? 'Next weekly window has not opened yet' : result.state === 'ended' ? 'Weekly logging has ended' : 'Activity unavailable: check project dates';
  const pct = (n, total) => total > 0 ? Math.round(n / total * 100) : 0;
  const completionTone = (total, value, color, note) => {
    if (!total || typeof value !== 'number' || /unavailable/i.test(note)) return 'neutral';
    const remaining = color === 'red' ? value : total - value;
    return remaining <= 0 ? 'complete' : remaining / total >= .6 ? 'danger' : remaining / total >= .3 ? 'warning' : 'neutral';
  };

  // ---- summary cards ----
  function statCard(c) {
    return '<div class="rounded-card border border-edge bg-paper p-4 shadow-card" data-stat-card' + (c.progress ? ' data-progress-stat' : '') + ' data-completion-tone="' + c.tone + '">' +
      '<div class="flex items-center justify-between gap-2 text-sm font-semibold text-ink-2"><span class="inline-flex items-center gap-2"><span class="size-2 rounded-full ' + DOT[c.tone] + '"></span>' + c.label + '</span>' + '<span class="inline-flex rounded-md p-1.5 ' + STAT_TEXT[c.tone] + ' ' + STAT_TINT[c.tone] + '">' + icon(c.icon) + '</span></div>' +
      '<div class="mt-2 flex items-baseline gap-2"><div class="text-kpi font-semibold tabular-nums ' + STAT_TEXT[c.tone] + '" data-stat-value' + (c.ids ? ' id="coordinatorActiveTeams"' : '') + '>' + c.value + '</div>' +
      '<div class="stat-pct rounded-md px-1.5 text-sm empty:hidden ' + STAT_TEXT[c.tone] + ' ' + STAT_TINT[c.tone] + '"' + (c.ids ? ' id="coordinatorActiveTeamsPct"' : '') + '>' + c.note + '</div></div><div class="mt-2 text-xs text-muted">' + c.detail + '</div></div>';
  }
  function progressBar(value, total, left, right) {
    return '<progress class="' + PROGRESS + '" value="' + pct(value, total) + '" max="100" aria-hidden="true"></progress>' +
      '<div class="flex justify-between"><span>' + left + '</span><span>' + right + '</span></div>';
  }
  function statCards() {
    const dto = effective(), s = dto.stats, total = s.total;
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
      const value = r.status === 'failed' ? unavailable : r.status === 'loading' ? skeleton('Loading ' + r.label) : r.known ? r.completed : '—';
      const note = r.status !== 'ready' ? '' : !r.known ? 'Unavailable' : r.unavailable ? r.unavailable + ' unavailable' : pct(r.completed, total) + '% (' + r.completed + '/' + total + ')';
      add(escape(r.label) + ' Completed', value, 'teal', note, ['clipboard-check', 'file-text', 'book-open'][index % 3], 'Team review completion', {progress:true});
    });
    const g = s.guideEvaluation, gAvailable = g.status === 'ready' && g.available;
    add('Guide Evaluation Completed', g.status === 'failed' ? unavailable : g.status === 'loading' ? skeleton('Loading guide evaluation') : gAvailable ? g.completed : '—', 'teal', g.status !== 'ready' ? '' : gAvailable ? pct(g.completed, total) + '% evaluated' : 'Unavailable', 'graduation-cap', 'Guide assessment completion', {progress:true});
    const hs = dto.healthStatus;
    add('Need Attention', hs === 'failed' ? unavailable : hs === 'loading' ? skeleton('Loading attention count') : s.needsAttention, 'red', hs !== 'ready' ? '' : pct(s.needsAttention, total) + '% of cohort', 'triangle-alert', 'Teams with overdue requirements', {progress:true});
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
    const unavailableHealth = t.health === 'unavailable', loadingRow = t.health === 'loading';
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
      reviewColumns.map(r => '<td class="' + cell + '" data-col="review">' + (reviewStatus(r.key) === 'failed' ? unavailableCell() : completion(t.reviews[r.key])) + '</td>').join('') +
      '<td class="' + cell + '" data-col="guide-evaluation">' + (guideStatus() === 'failed' ? unavailableCell() : completion(t.guideEvaluation)) + '</td>' +
      '<td class="' + cell + '" data-col="health">' + (unavailableHealth ? unavailableCell() : loadingRow ? skeleton('Loading health') : '<span class="' + health[0] + '" tabindex="0" aria-label="' + health[1] + '" title="' + health[1] + '">' + health[1] + '</span>') + '</td>' +
      '<td class="' + cell + '">' + teamActions(t) + '</td></tr>';
  }
  function filterButtons() {
    const dto = effective(), teams = dto.teams, anyLoading = dto.healthStatus !== 'ready', failed = dto.healthStatus === 'failed';
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
      return '<th class="px-3 py-2 text-left text-xs font-semibold text-muted" scope="col"' + attr + '>' + (type
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
      '<div class="max-w-full overflow-x-auto overscroll-x-contain mt-3 rounded-card border border-edge" data-tooltip-boundary role="region" aria-label="Team tracker table, scroll horizontally for more columns" tabindex="0"><table class="w-full border-collapse text-sm"><thead class="bg-soft"></thead><tbody id="trackerBody"></tbody></table></div><div data-tracker-pagination></div></div>';
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
    return '<h2 class="text-xl font-semibold text-ink">Coordinator Dashboard</h2>' +
      '<p id="coordRefreshStatus" class="mt-1 text-sm text-muted" data-refresh-status role="status" aria-live="polite"></p>';
  }
  const updatedLabel = () => 'Last updated: ' + new Date().toLocaleString('en-IN', {timeZone:'Asia/Kolkata', day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:true}) + ' IST';

  /** Shows what failed (with Retry) or, when everything arrived, that some review data is partial. */
  function setProgressStatus() {
    const el = q('#coordinatorProgressStatus');
    if (!el) return;
    const failures = failedSections().map(item => 'Unable to load ' + item.label + ': ' + (item.error && item.error.message || 'The server did not provide error details') + '.');
    const partial = !failures.length && Object.values(state.reviews).some(review => review.unavailable);
    const message = failures.length ? failures.join(' ') : partial ? 'Some assessment data is unavailable. Counts are partial; unavailable reviews are excluded from overdue alerts.' : '';
    el.innerHTML = message ? '<span class="text-sm text-ink-2">' + escape(message) + '</span> <button type="button" class="' + SMALL + '" data-action="progress-retry">Retry</button>' : '';
  }
  function failedSections() {
    const failed = state.overview.reviewColumns.filter(c => state.reviewErrors[c.key]).map(c => ({label:c.label, error:state.reviewErrors[c.key]}));
    if (state.guideError) failed.push({label:'guide evaluation', error:state.guideError});
    if (state.healthError) failed.push({label:'health', error:state.healthError});
    return failed;
  }
  function refreshSections() {
    renderStats(); updateTracker(); setProgressStatus();
    const updated = q('#coordUpdated'); if (updated) updated.textContent = updatedLabel();
  }

  const readReview = key => bridge.read('coord:review:' + key, 'API_coordinator_getReviewProgress', [key], READ);
  const readGuide = () => bridge.read('coord:guide', 'API_coordinator_getGuideProgress', [], READ);
  const readHealth = () => bridge.read('coord:health', 'API_coordinator_getHealth', [], READ);
  const readActivity = () => bridge.read('coord:activity', 'API_coordinator_getActivity', [], READ);

  /** Applies a settled read to the current render only; a replaced render (or a superseded read) is ignored. */
  function settle(promise, gen, apply, fail) {
    promise.then(value => { if (gen === generation) apply(value); }, error => { if (gen === generation && !error.superseded) fail(error); });
  }
  const sections = {
    review: key => ({read:() => readReview(key), apply:dto => { state.reviews[key] = dto; delete state.reviewErrors[key]; refreshSections(); }, fail:error => { if (!state.reviews[key]) { state.reviewErrors[key] = error; refreshSections(); } }}),
    guide: () => ({read:readGuide, apply:dto => { state.guide = dto; state.guideError = null; refreshSections(); }, fail:error => { if (!state.guide) { state.guideError = error; refreshSections(); } }}),
    health: () => ({read:readHealth, apply:dto => {
      state.health = dto; state.healthError = null;
      if (state.filter !== 'all' && !(state.filter.indexOf('deadline:') === 0 ? dto.deadlinePills.some(p => 'deadline:' + p.key === state.filter) : ['attention', 'ontrack'].includes(state.filter))) state.filter = 'all';
      refreshSections();
    }, fail:error => { if (!state.health) { state.healthError = error; refreshSections(); } }})
  };

  /** Replaces the host content with the overview and attaches the parallel reads started by load(). */
  function render(target, overview) {
    host = target;
    const wasPending = pending && pending.gen === generation ? pending : null;
    Object.assign(state, {overview, reviews:{}, reviewErrors:{}, guide:null, guideError:null, health:null, healthError:null, activity:null, filter:'all', query:'', page:1});
    host.innerHTML = headerMarkup() + '<div id="coordinatorAsyncRoot" class="mt-4 flex flex-col gap-4"><div id="coordinatorOverviewStatus" role="status"></div>' +
      (overview.reviewConfigurationError ? '<p role="status" class="text-sm text-warning">Review configuration unavailable. Check System Status.</p>' : '') +
      '<div id="coordinatorStats"></div><div id="coordinatorProgressStatus" role="status"></div><div id="coordinatorTracker">' + trackerMarkup() + '</div></div>' + drawerMarkup();
    if (!delegated.has(host)) { delegated.add(host); host.addEventListener('click', onClick); host.addEventListener('input', onInput); host.addEventListener('change', onChange); }
    renderStats(); updateTracker();
    const gen = generation;
    if (wasPending) {
      Object.keys(wasPending.reviews).forEach(key => { const section = sections.review(key); settle(wasPending.reviews[key], gen, section.apply, section.fail); });
      const guide = sections.guide(), health = sections.health();
      settle(wasPending.guide, gen, guide.apply, guide.fail);
      settle(wasPending.health, gen, health.apply, health.fail);
      settle(wasPending.activity, gen, applyActivity, failActivity);
    }
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

  /** Re-reads the sections that failed; when none failed (partial data), re-reads them all. */
  function retryProgress() {
    const gen = generation, all = !failedSections().length;
    const reviewKeys = state.overview.reviewColumns.map(c => c.key).filter(key => all || state.reviewErrors[key]);
    const jobs = reviewKeys.map(key => sections.review(key));
    if (all || state.guideError) jobs.push(sections.guide());
    if (all || state.healthError) jobs.push(sections.health());
    reviewKeys.forEach(key => delete state.reviewErrors[key]);
    if (all || state.guideError) state.guideError = null;
    if (all || state.healthError) state.healthError = null;
    refreshSections();
    jobs.forEach(job => settle(job.read(), gen, job.apply, job.fail));
  }
  function retryActivity() {
    const gen = generation, retry = q('#weeklyActivityRetry'), status = q('#weeklyActivityStatus');
    if (retry) retry.hidden = true; if (status) status.innerHTML = skeleton('Loading weekly activity');
    settle(readActivity(), gen, applyActivity, failActivity);
  }

  /** Starts the overview read; health, guide and activity start with it, and each Review read as soon as the overview names it. */
  function load() {
    const gen = ++generation;
    const started = {health:readHealth(), guide:readGuide(), activity:readActivity()};
    Object.values(started).forEach(promise => promise.catch(() => {}));
    pending = {gen, ...started, reviews:{}};
    return bridge.read('role:coord', 'API_coordinator_getOverview', [], READ).then(overview => {
      if (pending && pending.gen === gen) (overview.reviewColumns || []).forEach(column => { const promise = readReview(column.key); promise.catch(() => {}); pending.reviews[column.key] = promise; });
      return overview;
    });
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
    else if (action === 'progress-retry') retryProgress();
    else if (action === 'activity-retry') retryActivity();
  }

  return {load, render, state, persistent};
}
