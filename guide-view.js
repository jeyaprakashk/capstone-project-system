/**
 * GUIDE VIEW — browser module serialized into the dashboard shell as `GuideView`.
 * Renders the guide DTO (DATA-CONTRACTS.md) with Tailwind utilities and keeps the DOM
 * contract used by GuideWeekly / GuideEvaluation: [data-guide-workspace], [data-guide-select],
 * [data-guide-heading], [data-guide-team], [data-guide-view], [data-guide-tab],
 * #guideWeeklyProgress and #guideEvaluationEditor. It never calls google.script.run.
 * Elements that GuideWeekly toggles with `hidden` carry no display utilities.
 */
function guideViewBrowser_(bridge, getUi, getWeekly) {
  'use strict';
  const state = {dto:null, host:null, busyTeam:null};
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeUrl = url => /^https?:\/\//i.test(String(url)) ? String(url) : '#';
  const icon = (name, label) => getUi().renderIcon(name, label);
  const plural = (n, word) => n + ' ' + word + (n === 1 ? '' : 's');

  const BADGE_BASE = 'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-medium ring-1 ring-inset ';
  const TONE = {
    green:BADGE_BASE + 'bg-success-tint text-success ring-success/20',
    orange:BADGE_BASE + 'bg-warning-tint text-warning ring-warning/20',
    blue:BADGE_BASE + 'bg-info-tint text-primary ring-info/20',
    red:BADGE_BASE + 'bg-danger-tint text-danger ring-danger/20',
    gray:BADGE_BASE + 'bg-soft text-ink-2 ring-control/20'
  };
  const TIMING = {'on-time':['green', 'On time'], late:['red', 'Late'], overdue:['red', 'Overdue'], pending:['gray', 'Pending'], unknown:['gray', 'Timing unavailable']};
  const CARD_EDGE = {green:'border-l-success', orange:'border-l-accent', red:'border-l-danger', gray:'border-l-control'};
  const BUTTON = 'border-0 rounded-md bg-paper px-3 py-1.5 text-sm font-semibold text-ink ring-1 ring-inset ring-line hover:bg-tint disabled:opacity-50';
  const PRIMARY = 'border-0 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-paper hover:bg-primary-hover disabled:opacity-50';
  const PILL = 'flex items-center gap-2 border-0 rounded-lg bg-transparent px-3 py-1.5 text-sm text-ink-2 aria-pressed:bg-paper aria-pressed:text-primary aria-pressed:shadow-selected';
  const STEP = 'flex w-full flex-col gap-0.5 border-0 rounded-lg bg-transparent px-3 py-2 text-left text-sm hover:bg-tint aria-pressed:bg-tint disabled:opacity-60';
  const TILE ='flex w-full flex-col gap-1 rounded-lg border border-edge border-l-4 border-l-transparent bg-paper p-3 text-left text-sm hover:bg-tint aria-pressed:border-l-primary aria-pressed:bg-tint disabled:opacity-60';

  const timingBadge = (state, label) => '<span class="' + TONE[(TIMING[state] || TIMING.unknown)[0]] + '">' + escape(label || (TIMING[state] || TIMING.unknown)[1]) + '</span>';
  let tooltipSequence = 0;

  function memberTiming(timing) {
    if (!timing) return '';
    const id = 'guideTimingTooltip' + (++tooltipSequence);
    const label = timing.daysLate > 0 ? plural(timing.daysLate, 'day') + ' late' : '';
    return '<span class="group relative"><span tabindex="0" aria-describedby="' + id + '" class="inline-flex items-center gap-1">' +
      (timing.date ? '<small class="text-xs text-muted">' + escape(timing.date) + '</small>' : '') + timingBadge(timing.state, label) + '</span>' +
      '<span id="' + id + '" role="tooltip" class="absolute left-0 top-full z-10 mt-1 hidden w-64 rounded-md bg-ink p-2 text-xs text-paper group-hover:block group-focus-within:block">' + escape(timing.explanation) + '</span></span>';
  }
  function githubMemberMarkup(m) {
    const status = m.state === 'missing' ? ['Submit GitHub Account', 'triangle-alert'] : m.state === 'joined' ? ['Repository joined', 'check'] : ['Accept Invitation Email', 'clock'];
    return '<li data-member-status="' + m.state + '" class="flex flex-wrap items-center gap-x-2 gap-y-1 py-1 text-sm"><span data-member-register class="min-w-24">' + (m.name ? '<strong>' + escape(m.name) + '</strong><br>' : '') + escape(m.regno) + '</span>' +
      '<span data-member-state class="inline-flex items-center gap-1">' + icon(status[1]) + '<span>' + status[0] + '</span></span>' + (m.timing ? '<span>' + memberTiming(m.timing) + '</span>' : '') + '</li>';
  }
  function repositoryLine(repoUrl) {
    const match = String(repoUrl || '').match(/^https:\/\/github\.com\/([^/]+)\/([^/?#]+)/i);
    if (!match) return '<div class="mt-3 text-sm text-muted">' + icon('git-branch', 'Team repository') + ' Not available</div>';
    return '<div class="mt-3 text-sm">' + icon('git-branch', 'Team repository') + ' <a class="text-primary underline" href="' + escape(safeUrl(repoUrl)) + '" title="' + escape(match[1]) + '" target="_blank" rel="noopener">' + escape(match[2]) + ' ' + icon('external-link') + '</a></div>';
  }
  function githubCard(team, githubDue) {
    const g = team.github;
    return '<aside class="rounded-lg border border-edge border-l-4 bg-paper p-4 ' + (g ? CARD_EDGE[g.tone] || CARD_EDGE.gray : CARD_EDGE.gray) + '"><div><h3 class="text-base font-semibold text-ink">GitHub status</h3><p class="text-sm text-muted">Due: ' + escape(githubDue || 'Date unavailable') + '</p></div>' +
      (g ? '<ul aria-label="Team GitHub status" class="mt-2 divide-y divide-edge">' + g.members.map(githubMemberMarkup).join('') + '</ul>' : '<p role="status" class="mt-2 text-sm text-muted">GitHub status unavailable. Refresh the dashboard to retry.</p>') +
      repositoryLine(team.repoUrl) + '</aside>';
  }
  function expandable(text, max) {
    if (text.length <= max) return escape(text);
    return '<details><summary class="cursor-pointer">' + escape(text.slice(0, max).trim()) + '&hellip; <em>more</em></summary>' + escape(text) + '</details>';
  }
  function problemBlock(problem) {
    if (!problem) return '';
    return '<div class="mt-3 text-sm"><strong>Problem statement:</strong> <span class="hidden md:inline">' + escape(problem) + '</span><div class="md:hidden">' + expandable(problem, 130) + '</div></div>';
  }
  const p = (html, extra) => '<p class="mt-2 text-sm ' + (extra || 'text-ink-2') + '">' + html + '</p>';

  function approvalDetails(team) {
    const a = team.approval, wbs = team.documents.find(d => d.label === 'Work Breakdown');
    const timing = a.timing;
    return '<div class="mt-3 rounded-md bg-canvas p-3">' +
      p('<strong>Approved title:</strong> ' + escape(team.title)) +
      p('<strong>Scope:</strong> Not recorded separately.' + (wbs ? ' See <a class="text-primary underline" href="' + escape(safeUrl(wbs.url)) + '" target="_blank" rel="noopener">Work Breakdown</a>.' : '')) +
      p('<strong>Approved by:</strong> ' + escape(a.approvedBy || 'Not recorded')) +
      p('<strong>Approved on:</strong> ' + escape(a.approvedOn || 'Date unavailable') + ' ' + timingBadge(timing.state) +
        ' <button type="button" class="' + BUTTON + '" popovertarget="guideTitleTiming-' + escape(encodeURIComponent(team.teamId.toLowerCase())) + '" aria-controls="guideTitleTiming-' + escape(encodeURIComponent(team.teamId.toLowerCase())) + '" aria-label="Explain title approval timing">' + icon('circle-help') + '</button>' +
        '<span id="guideTitleTiming-' + escape(encodeURIComponent(team.teamId.toLowerCase())) + '" popover="auto" role="note" aria-label="Title approval timing" class="m-0 right-auto bottom-auto max-w-xs rounded-md border border-edge bg-paper p-3 text-sm shadow-lg">' + escape(timing.explanation) + '</span>') +
      p('<strong>Reviewer comment:</strong> ' + escape(team.reviewerNotes || 'No comment recorded')) + '</div>';
  }
  function decisionForm(team) {
    const id = escape(team.teamId);
    return '<label class="mt-3 block text-sm font-semibold text-ink-2" for="title-' + id + '">Title (editable)</label>' +
      '<input type="text" id="title-' + id + '" value="' + escape(team.title) + '" class="mt-1 block w-full rounded-md border border-control px-3 py-2 text-sm">' +
      problemBlock(team.problem) + (team.similarityFlag ? p(escape(team.similarityFlag), 'text-warning') : '') +
      '<textarea id="notes-' + id + '" rows="3" class="mt-3 block w-full rounded-md border border-control px-3 py-2 text-sm" placeholder="Notes (optional, required if rejecting)"></textarea>' +
      '<p class="mt-2 text-sm text-muted" id="status-' + id + '" role="status"></p>' +
      '<div class="mt-3 flex justify-end gap-2"><button type="button" class="' + BUTTON + '" data-action="decide" data-decision="Rejected" data-team="' + id + '">Reject</button>' +
      '<button type="button" class="' + PRIMARY + '" data-action="decide" data-decision="Approved" data-team="' + id + '">Approve</button></div>';
  }
  function titleCard(team) {
    const status = team.status, key = status.key, id = escape(team.teamId);
    let body = '';
    if (key === 'NEEDS_REVIEW') body = decisionForm(team);
    else {
      body = problemBlock(team.problem);
      if (key === 'AWAITING_REVIEWER') body += p('You approved — awaiting Reviewer.');
      else if (key === 'APPROVED') body += approvalDetails(team);
      else if (key === 'REJECTED_BY_GUIDE') body += p('<strong>Your note:</strong> ' + escape(team.guideNotes || '(none)')) + p('Waiting on the team to resubmit.');
      else if (key === 'REVISE_AWAITING_STUDENT') body += p('<strong>Reviewer\'s note:</strong> ' + escape(team.reviewerNotes || '(none)')) + p('Waiting for the team to resubmit — nothing for you to do until they do.');
    }
    return '<div id="card-' + id + '" class="rounded-lg border border-edge border-l-4 bg-paper p-4 ' + (CARD_EDGE[status.tone] || CARD_EDGE.gray) + '">' +
      '<div class="flex flex-wrap items-center gap-2"><h3 class="text-base font-semibold text-ink">Title approval</h3><span class="' + (TONE[status.tone] || TONE.gray) + '">Team ' + id + ' · ' + escape(status.text) + '</span>' +
      (team.titleTiming ? '<span class="inline-flex items-center gap-2">' + timingBadge(team.titleTiming.state) + '<small class="text-xs text-muted">' + escape(team.titleTiming.explanation) + '</small></span>' : '') + '</div>' +
      (team.overdueLogs ? p(team.overdueLogs + ' student weekly log(s) overdue', 'text-danger') : '') +
      (team.titleDue ? p('Title approval due ' + escape(team.titleDue.date) + (team.titleDue.overdue ? ' · Overdue' : ''), team.titleDue.overdue ? 'text-danger' : 'text-ink-2') : '') +
      body + '</div>';
  }
  function documentsView(team) {
    return '<h3 class="text-base font-semibold text-ink">Team documents</h3>' + (team.documents.length
      ? '<ul class="mt-2 divide-y divide-edge">' + team.documents.map(d => '<li class="flex items-center justify-between gap-3 py-2 text-sm"><strong>' + escape(d.label) + '</strong><a class="' + BUTTON + '" href="' + escape(safeUrl(d.url)) + '" target="_blank" rel="noopener">Open document</a></li>').join('') + '</ul>'
      : p('No documents submitted yet.') + p('Last document submission: ' + escape(team.lastDocumentSubmission || 'None recorded'))) +
      p('Open the submitted files to review the team’s work.');
  }

  function selectorMarkup(team, index) {
    const id = escape(team.teamId), attention = team.status.key === 'NEEDS_REVIEW';
    return '<button type="button" class="' + PILL + '" data-guide-select="' + id + '" data-title-attention="' + attention + '" data-documents-attention="' + team.documents.length + '" aria-pressed="' + (index === 0) + '" title="' + escape(team.title || 'No title submitted yet') + '">' +
      '<strong>' + id + '</strong><span data-team-attention role="status">' + (attention ? '<span class="' + TONE.orange + '">1</span>' : getUi().renderSkeleton('inline', 'Checking team actions')) + '</span></button>';
  }
  const memberNames = team => team.members.map(m => m.regno ? escape(m.name) + ' (' + escape(m.regno) + ')' : escape(m.name)).join(', ');
  function headingMarkup(team, index) {
    return '<header data-guide-heading="' + escape(team.teamId) + '"' + (index ? ' hidden' : '') + '><h3 class="text-lg font-semibold text-ink">' + escape(team.title || 'No title submitted yet') + '</h3>' +
      '<div class="mt-1 flex flex-wrap items-center justify-between gap-2"><span class="inline-flex items-center gap-1 text-sm text-muted">' + icon('users') + memberNames(team) + '</span>' +
      '<a class="' + BUTTON + '" href="mailto:' + escape(team.memberEmails.join(',')) + '?subject=' + escape(encodeURIComponent('Team ' + team.teamId + ' — Capstone Project')) + '">Email Team</a></div></header>';
  }
  function panelMarkup(team, index, githubDue) {
    return '<section data-guide-team="' + escape(team.teamId) + '" data-guide-students="' + escape(JSON.stringify(team.registerNumbers)) + '"' + (index ? ' hidden' : '') + '>' +
      '<div data-guide-view="title"><div class="grid gap-4 lg:grid-cols-3"><div class="lg:order-last">' + githubCard(team, githubDue) + '</div><div class="lg:col-span-2">' + titleCard(team) + '</div></div></div>' +
      '<div data-guide-view="documents" hidden class="rounded-lg border border-edge bg-paper p-4">' + documentsView(team) + '</div></section>';
  }
  function tabMarkup(view, iconName, title, subtitle, selected, disabled) {
    return '<button type="button" class="' + STEP + '" data-guide-tab="' + view + '" aria-pressed="' + selected + '"' + (disabled ? ' disabled title="' + escape(subtitle) + '"' : '') + '><strong class="flex items-center gap-1">' + icon(iconName) + title + '</strong><span class="text-xs text-muted">' + escape(disabled ? subtitle : subtitle) + '</span></button>';
  }
  function headerMarkup(updated) {
    return '<div class="flex items-start justify-between gap-4"><div><h2 class="text-lg font-semibold text-ink">Guide Dashboard</h2><p id="guideUpdated" class="text-sm text-muted">' + escape(updated) + '</p></div>' +
      '<button type="button" class="' + BUTTON + ' inline-flex items-center gap-1" data-refresh-button id="guideRefresh" aria-label="Refresh Guide Dashboard" data-action="refresh">' + icon('refresh-cw') + 'Refresh</button></div>' +
      '<p id="guideRefreshStatus" class="mt-1 text-sm text-muted" data-refresh-status role="status" aria-live="polite"></p>';
  }
  const updatedLabel = () => 'Last updated: ' + new Date().toLocaleString('en-IN', {timeZone:'Asia/Kolkata', day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:true}) + ' IST';

  function workspaceMarkup(dto) {
    const teams = dto.teams, ui = getUi();
    const evaluation = dto.evaluation;
    return '<div data-guide-workspace class="mt-4 flex flex-col gap-4">' +
      '<aside aria-label="My teams"><h3 class="text-base font-semibold text-ink">My Teams</h3><p class="text-sm text-muted">Pick a team to review its progress.</p>' +
      '<div class="mt-3 inline-flex flex-wrap gap-1 rounded-xl bg-tint p-1">' + teams.map(selectorMarkup).join('') + '</div></aside>' +
      '<div class="grid rounded-card border border-edge bg-paper shadow-card lg:grid-cols-3"><div class="p-5 lg:col-span-2">' + teams.map(headingMarkup).join('') + '</div>' +
      '<nav class="flex flex-col gap-1 border-t border-edge p-3 lg:border-l lg:border-t-0" aria-label="Team workspace">' +
        tabMarkup('title', 'tag', 'Title review', 'Submission & decision', true) + tabMarkup('weekly', 'trending-up', 'Weekly progress', 'Student updates & discussion', false) +
        tabMarkup('documents', 'file-text', 'Documents', 'Submitted files', false) +
        (evaluation.enabled ? tabMarkup('evaluation', 'graduation-cap', 'Guide Evaluation', 'Individual assessment', false) : tabMarkup('evaluation', 'lock-keyhole', 'Guide Evaluation', evaluation.notice, false, true)) + '</nav></div>' +
      '<div class="mt-3">' + teams.map((t, i) => panelMarkup(t, i, dto.githubDue)).join('') + '</div>' +
      '<section id="guideWeeklyProgress" data-guide-weeks="' + escape(JSON.stringify(dto.weeks)) + '" class="mt-3 rounded-lg border border-edge bg-paper p-4" hidden aria-label="Weekly progress confirmation">' +
        '<div><h2 class="text-lg font-semibold text-ink">Weekly Progress</h2></div><p data-guide-weekly-status role="status" class="text-sm text-muted"></p>' +
        '<div data-guide-weekly-read>' + ui.renderSkeleton('panel', 'Reading weekly progress') + '</div></section>' +
      '<section id="guideEvaluationEditor" class="mt-3 rounded-lg border border-edge bg-paper p-4" hidden aria-label="Guide evaluation editor"></section>' +
      '</div>';
  }

  function render(host, dto) {
    state.host = host; state.dto = dto;
    host.innerHTML = headerMarkup(updatedLabel()) + (dto.teams.length ? workspaceMarkup(dto) : '<p class="mt-4 text-sm text-muted">You have no teams assigned.</p>');
    host.onclick = onClick;
    if (!host.guideToggleBound) {
      host.guideToggleBound = true;
      // The toggle event does not bubble; capture it to position the timing explanation.
      host.addEventListener('toggle', event => { const weekly = getWeekly(); if (weekly && event.target && event.target.hasAttribute && event.target.hasAttribute('popover')) weekly.positionTitleInfo(event, event.target); }, true);
    }
  }

  function onClick(event) {
    const target = event.target.closest ? event.target.closest('[data-action],[data-guide-select],[data-guide-tab]') : null;
    if (!target || target.disabled) return;
    const weekly = getWeekly();
    if (target.dataset.action === 'decide') decide(target.dataset.team, target.dataset.decision);
    else if (target.dataset.action === 'refresh') getUi().refreshRoleDashboard('guide');
    else if (target.hasAttribute('data-guide-select') && weekly) weekly.selectTeam(target.dataset.guideSelect);
    else if (target.hasAttribute('data-guide-tab') && weekly) weekly.selectView(target.dataset.guideTab);
  }

  function load() { return bridge.read('role:guide', 'API_guide_getDashboard', []); }

  function setStatus(team, text) { const el = document.getElementById('status-' + team); if (el) el.textContent = text; }
  function setBusy(team, busy) { const card = document.getElementById('card-' + team); if (card) card.querySelectorAll('button').forEach(b => { b.disabled = busy; }); }

  /** Rejection needs a note; success re-reads the dashboard and restarts weekly progress. */
  function decide(team, decision) {
    if (state.busyTeam) return;
    const notesEl = document.getElementById('notes-' + team), titleEl = document.getElementById('title-' + team);
    const notes = notesEl ? notesEl.value : '', editedTitle = titleEl ? titleEl.value : '';
    if (decision === 'Rejected' && !notes.trim()) { setStatus(team, 'Please add a note explaining the rejection.'); return; }
    state.busyTeam = team;
    setBusy(team, true);
    setStatus(team, 'Submitting...');
    bridge.write('API_guide_submitDecision', [team, decision, notes, editedTitle]).then(
      () => load().then(dto => {
        state.busyTeam = null; render(state.host, dto);
        const weekly = getWeekly(); if (weekly) weekly.load();
      }, error => { state.busyTeam = null; setStatus(team, 'Refresh failed: ' + error.message); setBusy(team, false); }),
      error => { state.busyTeam = null; setStatus(team, error.message || 'Unable to submit decision.'); setBusy(team, false); });
  }

  return {load, render, decide, state};
}
