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
  const delegated = new WeakSet();
  const state = {dto:null, host:null, busyTeam:null, commits:{}};
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
  const BUTTON = 'border-0 rounded-md bg-paper px-3 py-1.5 text-sm font-semibold text-ink ring-1 ring-inset ring-line hover:bg-tint disabled:opacity-50';
  const PRIMARY = 'border-0 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-paper hover:bg-primary-hover disabled:opacity-50';
  const PILL = 'flex items-center gap-2 border-0 rounded-lg bg-transparent px-3 py-1.5 text-sm text-ink-2 aria-pressed:bg-paper aria-pressed:text-primary aria-pressed:shadow-selected';
  const STEP = 'flex w-full flex-col gap-0.5 border-0 rounded-lg bg-transparent px-3 py-2 text-left text-sm hover:bg-tint aria-pressed:bg-tint disabled:opacity-60';
  // Below md the workspace tabs become a bottom bar (icon over label); Guide Evaluation moves into a "More" sheet.
  const TAB_BASE = 'relative items-center border-0 bg-transparent text-ink hover:bg-tint aria-pressed:text-primary disabled:text-muted disabled:hover:bg-transparent max-md:justify-center max-md:border-t-2 max-md:border-t-transparent max-md:px-1 max-md:py-2 max-md:text-xs max-md:aria-pressed:border-t-primary md:gap-1 md:border-b-2 md:border-b-transparent md:px-4 md:py-3 md:text-sm md:aria-pressed:border-b-primary [&_[data-guide-tab-attention]]:max-md:absolute [&_[data-guide-tab-attention]]:max-md:right-2 [&_[data-guide-tab-attention]]:max-md:top-0.5';
  const TAB = 'flex ' + TAB_BASE;
  const TAB_SHEET = 'hidden group-data-[more-open]/tabs:flex max-md:absolute max-md:inset-x-0 max-md:bottom-full max-md:justify-start max-md:border-t max-md:border-edge max-md:bg-paper max-md:px-5 max-md:py-4 max-md:text-sm md:flex ' + TAB_BASE;
  const TAB_MORE = 'flex flex-col items-center justify-center gap-1 border-0 border-t-2 border-t-transparent bg-transparent px-1 py-2 text-xs text-ink hover:bg-tint aria-expanded:border-t-primary aria-expanded:text-primary group-has-[[data-guide-tab=evaluation][aria-pressed=true]]/tabs:border-t-primary group-has-[[data-guide-tab=evaluation][aria-pressed=true]]/tabs:text-primary md:hidden';
  const LINK = 'border-0 bg-transparent p-0 text-sm font-semibold text-primary underline';
  const TILE ='flex w-full flex-col gap-1 rounded-card border border-edge border-l-4 shadow-card border-l-transparent bg-paper p-3 text-left text-sm hover:bg-tint aria-pressed:border-l-primary aria-pressed:bg-tint disabled:opacity-60';

  const timingBadge = (state, label) => '<span class="' + TONE[(TIMING[state] || TIMING.unknown)[0]] + '">' + escape(label || (TIMING[state] || TIMING.unknown)[1]) + '</span>';

  /** "2 days earlier" / "On time" / "2 days late" from the signed day difference to the deadline. */
  function timingLabel(timing) {
    const days = timing.days;
    if (!Number.isFinite(days) || timing.state === 'unknown') return undefined;
    return days < 0 ? plural(-days, 'day') + ' earlier' : days > 0 ? plural(days, 'day') + ' late' : 'On time';
  }
  function memberTiming(timing) {
    if (!timing) return '';
    return '<span class="inline-flex items-center gap-1">' + (timing.date ? '<small class="text-xs text-muted">' + escape(timing.date) + '</small>' : '') + timingBadge(timing.state, timingLabel(timing)) + '</span>';
  }
  const commitCountText = n => n === null ? 'Commits unavailable' : n + (n === 1 ? ' commit' : ' commits');
  function githubMemberMarkup(m) {
    const status = m.state === 'missing' ? ['Submit GitHub Account', 'triangle-alert'] : m.state === 'joined' ? ['Joined', 'check'] : ['Accept Invitation Email', 'clock'];
    const regno = escape(m.regno);
    return '<li data-member-status="' + m.state + '" data-github-member="' + regno + '" class="border-t border-edge first:border-t-0"><details class="group">' +
      '<summary class="grid cursor-pointer list-none grid-cols-[1fr_auto] items-center gap-x-4 gap-y-1 py-3 sm:grid-cols-[1fr_1fr_auto] [&::-webkit-details-marker]:hidden">' +
        '<span data-member-register class="min-w-0"><strong class="block font-semibold capitalize text-ink">' + escape(String(m.name || '').toLowerCase()) + '</strong><span class="font-mono text-xs text-muted">' + regno + '</span></span>' +
        '<span data-member-state class="order-last col-span-2 inline-flex flex-wrap items-center gap-2 text-sm text-ink-2 sm:order-none sm:col-span-1">' + icon(status[1]) + '<span>' + status[0] + '</span>' + (m.timing ? memberTiming(m.timing) : '') + '</span>' +
        '<span class="inline-flex items-center gap-2 text-sm text-ink-2"><span data-commit-count aria-live="polite"></span><span class="inline-flex group-open:rotate-180">' + icon('chevron-down') + '</span></span>' +
      '</summary><div data-commit-list class="pb-3"></div></details></li>';
  }
  function repositoryLine(repoUrl) {
    const match = String(repoUrl || '').match(/^https:\/\/github\.com\/([^/]+)\/([^/?#]+)/i);
    if (!match) return '<span class="text-sm text-muted">' + icon('git-branch', 'Team repository') + ' Repository not available</span>';
    return '<span class="text-sm">' + icon('git-branch', 'Team repository') + ' <a class="font-mono text-primary underline" href="' + escape(safeUrl(repoUrl)) + '" title="' + escape(match[1]) + '" target="_blank" rel="noopener">' + escape(match[2]) + ' ' + icon('external-link') + '</a></span>';
  }
  /** `team.github` is undefined while the live status is still being read, null when it could not be read. */
  function githubCard(team, githubDue) {
    const g = team.github;
    return '<aside><div class="flex flex-wrap items-center justify-between gap-2 border-b border-edge pb-3">' + repositoryLine(team.repoUrl) +
      '<span class="text-sm text-muted">Due ' + escape(githubDue || 'date unavailable') + '</span></div>' +
      (g === undefined ? '<div data-github-loading role="status" class="mt-2">' + getUi().renderSkeleton('inline', 'Reading GitHub status') + '</div>'
        : g ? '<ul aria-label="Team GitHub status" class="m-0 list-none p-0">' + g.members.map(githubMemberMarkup).join('') + '</ul>' : '<p role="status" class="mt-2 text-sm text-muted">GitHub status unavailable. Refresh the dashboard to retry.</p>') + '</aside>';
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

  const wbsLink = team => { const w = team.documents.find(d => d.label === 'Work Breakdown'); return w ? ' <a class="font-semibold text-primary underline" href="' + escape(safeUrl(w.url)) + '" target="_blank" rel="noopener">See Work Breakdown</a>' : ''; };
  function approvedMain(team) {
    const a = team.approval, timing = a.timing, problem = team.problem || '';
    return '<div class="flex flex-wrap items-center gap-3 text-success">' + icon('check') +
      '<strong class="font-semibold">Approved on ' + escape(a.approvedOn || 'date unavailable') + '</strong>' +
      timingBadge(timing.state, timingLabel(timing)) + '</div>' +
      (problem ? '<h4 class="mt-5 text-xs font-semibold uppercase tracking-wide text-muted">Problem statement</h4>' +
        '<p data-problem-text class="mt-2 line-clamp-4 text-base leading-7 text-ink-2">' + escape(problem) + '</p>' +
        '<button type="button" class="mt-3 ' + LINK + '" data-action="toggle-problem" aria-expanded="false" hidden>Show more</button>' : '');
  }
  function approvalSide(team) {
    const row = (label, value) => '<div class="px-4 py-3"><dt class="text-muted">' + label + '</dt><dd class="m-0 mt-1 text-ink">' + value + '</dd></div>';
    return '<dl class="m-0 divide-y divide-edge rounded-card border border-edge bg-paper text-sm">' +
      row('Approved by', '<strong class="font-semibold">' + escape(team.approval.approvedBy || 'Not recorded') + '</strong>') +
      row('Scope', 'Not recorded separately.' + wbsLink(team)) +
      row('Reviewer comment', team.reviewerNotes ? escape(team.reviewerNotes) : '<em class="text-muted">No comment recorded</em>') + '</dl>';
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
    if (team.status.key === 'APPROVED') {
      return '<div id="card-' + escape(team.teamId) + '">' + (team.overdueLogs ? p(team.overdueLogs + ' student weekly log(s) overdue', 'mb-3 text-danger') : '') +
        (team.titleDue ? p('Title approval due ' + escape(team.titleDue.date) + (team.titleDue.overdue ? ' · Overdue' : ''), 'mb-3 ' + (team.titleDue.overdue ? 'text-danger' : 'text-ink-2')) : '') + approvedMain(team) + '</div>';
    }
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
    return '<div id="card-' + id + '">' +
      '<div class="flex flex-wrap items-center gap-2"><span class="' + (TONE[status.tone] || TONE.gray) + '">Team ' + id + ' · ' + escape(status.text) + '</span>' +
      (team.titleTiming ? '<span class="inline-flex items-center gap-2">' + timingBadge(team.titleTiming.state) + '<small class="text-xs text-muted">' + escape(team.titleTiming.explanation) + '</small></span>' : '') + '</div>' +
      (team.overdueLogs ? p(team.overdueLogs + ' student weekly log(s) overdue', 'text-danger') : '') +
      (team.titleDue ? p('Title approval due ' + escape(team.titleDue.date) + (team.titleDue.overdue ? ' · Overdue' : ''), team.titleDue.overdue ? 'text-danger' : 'text-ink-2') : '') +
      body + '</div>';
  }
  function documentsView(team) {
    return (team.documents.length
      ? '<ul class="m-0 list-none p-0 divide-y divide-edge">' + team.documents.map(d => '<li class="flex items-center justify-between gap-3 py-2 text-sm"><strong>' + escape(d.label) + '</strong><a class="' + BUTTON + '" href="' + escape(safeUrl(d.url)) + '" target="_blank" rel="noopener">Open document</a></li>').join('') + '</ul>'
      : p('No documents submitted yet.') + p('Last document submission: ' + escape(team.lastDocumentSubmission || 'None recorded'))) +
      p('Open the submitted files to review the team’s work.');
  }

  function selectorMarkup(team, index) {
    const id = escape(team.teamId), attention = team.status.key === 'NEEDS_REVIEW';
    return '<button type="button" class="' + PILL + '" data-guide-select="' + id + '" data-title-attention="' + attention + '" data-documents-attention="' + team.documents.length + '" aria-pressed="' + (index === 0) + '" title="' + escape(team.title || 'No title submitted yet') + '">' +
      '<strong data-team-label hidden>' + id + '</strong><span data-team-spinner role="status">' + getUi().renderSkeleton('inline', 'Checking team actions') + '</span></button>';
  }
  const initials = name => String(name || '?').trim().split(/\s+/).slice(0, 2).map(w => w.charAt(0).toUpperCase()).join('');
  const AVATAR = ['bg-info-tint text-primary', 'bg-success-tint text-success', 'bg-warning-tint text-warning', 'bg-danger-tint text-danger'];
  const memberChip = (m, index) => '<li class="inline-flex items-center gap-2 text-sm"><span aria-hidden="true" class="inline-flex size-8 items-center justify-center rounded-full text-xs font-semibold ' + AVATAR[index % AVATAR.length] + '">' + escape(initials(m.name)) + '</span>' +
    '<strong class="font-semibold capitalize text-ink">' + escape(String(m.name || '').toLowerCase()) + '</strong>' + (m.regno ? '<span class="font-mono text-xs text-muted">' + escape(m.regno) + '</span>' : '') + '</li>';
  const memberChips = team => '<ul aria-label="Team members" class="m-0 flex list-none flex-wrap items-center gap-x-6 gap-y-2 p-0">' + team.members.map(memberChip).join('') + '</ul>';
  function headingMarkup(team, index) {
    return '<header data-guide-heading="' + escape(team.teamId) + '"' + (index ? ' hidden' : '') + '><h3 class="text-lg font-semibold text-ink">' + escape(team.title || 'No title submitted yet') + '</h3>' +
      '<div class="mt-3 flex flex-wrap items-center justify-between gap-3">' + memberChips(team) +
      '<a class="' + BUTTON + '" href="mailto:' + escape(team.memberEmails.join(',')) + '?subject=' + escape(encodeURIComponent('Team ' + team.teamId + ' — Capstone Project')) + '">Email Team</a></div></header>';
  }
  function panelMarkup(team, index, githubDue) {
    return '<section data-guide-team="' + escape(team.teamId) + '" data-guide-students="' + escape(JSON.stringify(team.registerNumbers)) + '" data-guide-members="' + escape(JSON.stringify(team.members)) + '"' + (index ? ' hidden' : '') + '>' +
      '<div data-guide-view="github" hidden>' + githubCard(team, githubDue) + '</div>' +
      '<div data-guide-view="title">' + (team.status.key === 'APPROVED'
        ? '<div class="grid gap-4 lg:grid-cols-3"><div class="lg:col-span-2">' + titleCard(team) + '</div><div>' + approvalSide(team) + '</div></div>'
        : titleCard(team)) + '</div>' +
      '<div data-guide-view="documents" hidden>' + documentsView(team) + '</div></section>';
  }
  function tabMarkup(view, iconName, title, selected, locked, short, sheet) {
    const label = short ? '<span class="max-md:hidden">' + title + '</span><span class="md:hidden">' + short + '</span>' : title;
    return '<button type="button" class="' + (sheet ? TAB_SHEET : TAB) + '" data-guide-tab="' + view + '" aria-pressed="' + selected + '"' + (locked ? ' data-evaluation-locked' : '') + '><strong class="flex items-center gap-2 font-semibold max-md:flex-col max-md:gap-1 max-md:text-xs max-md:font-medium' + (sheet ? ' max-md:flex-row max-md:gap-3 max-md:text-sm' : '') + '">' + icon(iconName) + label + '</strong></button>';
  }
  function headerMarkup(teams) {
    return '<div class="flex flex-wrap items-center justify-between gap-4"><div><h2 class="text-xl font-semibold text-ink">Guide Dashboard</h2>' +
      '<p class="mt-1 text-sm text-muted">Pick a team to review its progress.</p>' +
      '<p id="guideRefreshStatus" class="mt-1 text-sm text-muted empty:hidden" data-refresh-status role="status" aria-live="polite"></p></div>' +
      '<div class="inline-flex flex-wrap gap-1 rounded-xl bg-tint p-1" aria-label="My teams">' + teams.map(selectorMarkup).join('') + '</div></div>';
  }
  const updatedLabel = () => 'Last updated: ' + new Date().toLocaleString('en-IN', {timeZone:'Asia/Kolkata', day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:true}) + ' IST';

  const lockedEvaluationMarkup = notice => '<div data-evaluation-locked-card class="flex items-center gap-3 text-ink-2">' + icon('lock-keyhole') +
    '<p class="m-0 text-sm text-muted">' + escape(notice) + '</p></div>';

  function workspaceMarkup(dto) {
    const teams = dto.teams, ui = getUi();
    const evaluation = dto.evaluation;
    return '<div data-guide-workspace class="flex flex-col gap-4 max-md:pb-16">' + headerMarkup(teams) +
      '<div class="rounded-card border border-edge bg-paper p-5 shadow-card">' + teams.map(headingMarkup).join('') + '</div>' +
      '<div class="rounded-card border border-edge bg-paper shadow-card"><nav class="group/tabs fixed inset-x-0 bottom-0 z-30 grid grid-cols-5 border-t border-edge bg-paper shadow-card md:static md:z-auto md:flex md:flex-wrap md:items-center md:gap-1 md:border-t-0 md:border-b md:px-4 md:shadow-none" aria-label="Team workspace">' +
        tabMarkup('github', 'git-branch', 'GitHub status', false, false, 'GitHub') + tabMarkup('title', 'tag', 'Title review', true, false, 'Title') + tabMarkup('weekly', 'trending-up', 'Weekly progress', false, false, 'Progress') +
        tabMarkup('documents', 'file-text', 'Documents', false, false, 'Docs') +
        '<button type="button" class="' + TAB_MORE + '" data-guide-more aria-expanded="false" aria-label="More sections">' + icon('ellipsis') + '<span>More</span></button>' +
        tabMarkup('evaluation', 'graduation-cap', 'Guide Evaluation', false, !evaluation.enabled, '', true) + '</nav>' +
      '<div class="p-5">' + teams.map((t, i) => panelMarkup(t, i, dto.githubDue)).join('') +
      '<section id="guideWeeklyProgress" data-guide-weeks="' + escape(JSON.stringify(dto.weeks)) + '" hidden aria-label="Weekly progress confirmation">' +
        '<p data-guide-weekly-status role="status" class="m-0 text-sm text-muted empty:hidden"></p>' +
        '<div data-guide-weekly-read>' + ui.renderSkeleton('panel', 'Reading weekly progress') + '</div></section>' +
      '<section id="guideEvaluationEditor" hidden aria-label="Guide evaluation editor">' + (evaluation.enabled ? '' : lockedEvaluationMarkup(evaluation.notice)) + '</section>' +
      '</div></div></div>';
  }

  /** "Show more" only appears while the clamped problem statement is actually cut off. */
  let problemObserver = null;
  function syncProblemToggle(text) {
    const button = text.parentElement && text.parentElement.querySelector('[data-action="toggle-problem"]');
    if (!button || !text.clientHeight || button.getAttribute('aria-expanded') === 'true') return;
    button.hidden = text.scrollHeight <= text.clientHeight + 1;
  }
  function watchProblems(host) {
    if (problemObserver) problemObserver.disconnect();
    problemObserver = null;
    const texts = host.querySelectorAll('[data-problem-text]');
    if (typeof ResizeObserver !== 'function' || !texts.length) return;
    // Fires when a hidden tab becomes visible and when the width (so the line count) changes.
    problemObserver = new ResizeObserver(entries => entries.forEach(entry => syncProblemToggle(entry.target)));
    texts.forEach(text => problemObserver.observe(text));
  }

  function render(host, dto) {
    state.host = host; state.dto = dto; state.commits = {};
    host.innerHTML = (dto.teams.length ? workspaceMarkup(dto) : headerMarkup([]) + '<p class="mt-4 text-sm text-muted">You have no teams assigned.</p>');
    watchProblems(host);
    if (dto.teams.some(team => team.github === undefined)) loadGithub(dto);
    if (!delegated.has(host)) { delegated.add(host); host.addEventListener('click', onClick); }
    if (!host.guideToggleBound) {
      host.guideToggleBound = true;
      // The toggle event does not bubble; capture it to position the timing explanation.
      host.addEventListener('toggle', event => { const weekly = getWeekly(); if (weekly && event.target && event.target.hasAttribute && event.target.hasAttribute('popover')) weekly.positionTitleInfo(event, event.target); }, true);
    }
  }

  const commitTime = iso => new Date(iso).toLocaleString('en-IN', {timeZone:'Asia/Kolkata', day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit', hour12:false});
  const teamSection = teamId => Array.from(state.host.querySelectorAll('[data-guide-team]')).find(el => el.getAttribute('data-guide-team') === teamId);
  function commitListMarkup(member, repoUrl) {
    const rows = member.commits.map(c => '<li class="flex flex-wrap items-baseline justify-between gap-x-4 border-t border-edge px-4 py-2 text-sm first:border-t-0"><span class="min-w-0 break-words text-ink">' + escape(c.message || '(no message)') + '</span>' +
      '<span class="inline-flex items-baseline gap-3"><a class="font-mono text-xs font-semibold text-primary underline" href="' + escape(safeUrl(c.url)) + '" target="_blank" rel="noopener">' + escape(c.shortSha) + '</a><span class="text-xs text-muted">' + escape(commitTime(c.timestamp)) + '</span></span></li>').join('');
    const all = member.username ? '<a class="inline-flex items-center gap-1 text-sm font-semibold text-primary underline" href="' + escape(safeUrl(repoUrl + '/commits?author=' + encodeURIComponent(member.username))) + '" target="_blank" rel="noopener">View all on GitHub ' + icon('external-link') + '</a>' : '';
    return '<div class="rounded-md bg-canvas"><ul class="m-0 list-none p-0">' + (rows || '<li class="px-4 py-3 text-sm text-muted">No commits yet.</li>') + '</ul>' + (all ? '<div class="border-t border-edge px-4 py-3">' + all + '</div>' : '') + '</div>';
  }
  function showCommits(teamId, dto) {
    const section = teamSection(teamId); if (!section) return;
    section.querySelectorAll('[data-github-member]').forEach(row => {
      const member = dto && dto.state === 'available' && dto.members.find(m => String(m.regno) === row.getAttribute('data-github-member'));
      const count = row.querySelector('[data-commit-count]'), list = row.querySelector('[data-commit-list]');
      count.textContent = member ? commitCountText(member.count) : 'Commits unavailable';
      list.innerHTML = member && member.count !== null ? commitListMarkup(member, dto.repositoryUrl) : '<p class="m-0 px-1 text-sm text-muted">' + escape((dto && dto.message) || 'Commit history is unavailable for this member.') + '</p>';
    });
  }
  /** Live GitHub status is read once after each render so first paint never waits on GitHub; a stale reply is ignored. */
  function loadGithub(dto) {
    const apply = byTeam => {
      if (state.dto !== dto || !state.host) return;
      dto.teams.forEach(team => {
        team.github = byTeam && byTeam[team.teamId] ? byTeam[team.teamId] : null;
        const section = teamSection(team.teamId), view = section && section.querySelector('[data-guide-view="github"]');
        if (view) view.innerHTML = githubCard(team, dto.githubDue);
      });
      syncCommits();
    };
    bridge.read('guide-github', 'API_guide_getGithub', [], {timeoutMs:120000}).then(data => apply(data && data.teams), () => apply(null));
  }

  /** Commit history is read the first time a team's GitHub status tab is shown, never in the background. */
  function ensureCommits(teamId) {
    const team = state.dto && state.dto.teams.find(item => item.teamId === teamId);
    if (state.commits[teamId] || !teamSection(teamId) || !team || team.github === undefined) return;
    state.commits[teamId] = 'loading';
    teamSection(teamId).querySelectorAll('[data-commit-count]').forEach(el => { el.innerHTML = getUi().renderSkeleton('inline', 'Reading commits'); });
    bridge.read('guide-commits:' + teamId, 'API_guide_getCommits', [teamId]).then(
      dto => { state.commits[teamId] = 'done'; showCommits(teamId, dto); },
      () => { delete state.commits[teamId]; showCommits(teamId, null); });
  }
  function syncCommits() {
    if (!state.host) return;
    const visible = Array.from(state.host.querySelectorAll('[data-guide-team]')).find(el => !el.hasAttribute('hidden'));
    const github = visible && visible.querySelector('[data-guide-view="github"]');
    if (github && !github.hasAttribute('hidden')) ensureCommits(visible.getAttribute('data-guide-team'));
  }

  function onClick(event) {
    const target = event.target.closest ? event.target.closest('[data-action],[data-guide-select],[data-guide-tab],[data-guide-more]') : null;
    if (!target || target.disabled) return;
    const nav = target.closest('nav');
    if (target.hasAttribute('data-guide-more')) {
      const open = !nav.hasAttribute('data-more-open');
      nav.toggleAttribute('data-more-open', open); target.setAttribute('aria-expanded', String(open));
      return;
    }
    if (nav && nav.hasAttribute('data-more-open')) { nav.removeAttribute('data-more-open'); const more = nav.querySelector('[data-guide-more]'); if (more) more.setAttribute('aria-expanded', 'false'); }
    const weekly = getWeekly();
    if (target.dataset.action === 'toggle-problem') {
      const text = target.parentElement.querySelector('[data-problem-text]'), open = target.getAttribute('aria-expanded') === 'true';
      text.classList.toggle('line-clamp-4', open); target.setAttribute('aria-expanded', String(!open)); target.textContent = open ? 'Show more' : 'Show less';
    } else if (target.dataset.action === 'decide') decide(target.dataset.team, target.dataset.decision);
    else if (target.hasAttribute('data-guide-select') && weekly) weekly.selectTeam(target.dataset.guideSelect);
    else if (target.hasAttribute('data-guide-tab') && weekly) weekly.selectView(target.dataset.guideTab);
    syncCommits();
  }

  function load() { return bridge.read('role:guide', 'API_guide_getDashboard', [], {timeoutMs:120000}); }

  function setStatus(team, text) { const el = document.getElementById('status-' + team); if (el) el.textContent = text; }
  function cardButtons(team) { const card = document.getElementById('card-' + team); return card ? Array.from(card.querySelectorAll('button')) : []; }

  /** Rejection needs a note; success re-reads the dashboard and restarts weekly progress. */
  function decide(team, decision) {
    if (state.busyTeam) return;
    const notesEl = document.getElementById('notes-' + team), titleEl = document.getElementById('title-' + team);
    const notes = notesEl ? notesEl.value : '', editedTitle = titleEl ? titleEl.value : '';
    if (decision === 'Rejected' && !notes.trim()) { setStatus(team, 'Please add a note explaining the rejection.'); return; }
    state.busyTeam = team;
    const done = getUi().busy.write(document.getElementById('status-' + team), 'Submitting…', cardButtons(team));
    bridge.write('API_guide_submitDecision', [team, decision, notes, editedTitle]).then(
      () => load().then(dto => {
        state.busyTeam = null; render(state.host, dto);
        const weekly = getWeekly(); if (weekly) weekly.load();
      }, error => { state.busyTeam = null; done('Refresh failed: ' + error.message); }),
      error => { state.busyTeam = null; done(error.message || 'Unable to submit decision.'); });
  }

  return {load, render, decide, ensureCommits, state};
}
