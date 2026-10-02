/**
 * SYSTEM STATUS VIEW — browser module serialized into the dashboard shell as `SystemStatusView`.
 * Renders the System Status frame from the coordinator DTO (DATA-CONTRACTS.md) with Tailwind utilities.
 * Each card keeps the DOM contract its dashboard module attaches to (#githubSyncButton,
 * #studentInvitationResend, [data-publishing], #committeeConfigurationCard, #reviewConfigurationCard,
 * #assessmentStorageSetup, #weeklyPhase2Setup ...). It never calls google.script.run.
 */
function systemStatusViewBrowser_(bridge, getUi, getPublishing) {
  'use strict';
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const icon = (name, label) => getUi().renderIcon(name, label);
  const skeleton = (variant, label) => getUi().renderSkeleton(variant, label);

  const CARD = 'rounded-card border border-edge bg-paper p-4 shadow-card';
  const BUTTON = 'border-0 rounded-md bg-paper px-3 py-1.5 text-sm font-semibold text-ink ring-1 ring-inset ring-line hover:bg-tint disabled:opacity-50';
  const PRIMARY = 'border-0 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-paper hover:bg-primary-hover disabled:opacity-50';
  const BADGE = 'inline-flex items-center rounded-md bg-success-tint px-2 py-0.5 text-xs font-semibold text-success ring-1 ring-inset ring-success/20';
  const AVATAR = ['bg-teal-700', 'bg-purple-700', 'bg-primary'];
  const note = text => '<p class="mt-2 text-sm text-ink-2">' + text + '</p>';
  const link = (id, text) => '<a id="' + id + '" class="text-sm text-primary underline" hidden target="_blank" rel="noopener">' + text + ' ' + icon('external-link') + '</a>';

  function githubCard(g) {
    return '<div class="' + CARD + '"><div class="flex items-center justify-between gap-3"><div class="flex items-center gap-2"><h3 class="text-base font-semibold text-ink">GitHub Access for Coordinator</h3><span class="' + BADGE + '">Configured</span></div>' +
      '<button id="githubSyncButton" class="' + PRIMARY + '" type="button" data-action="github-sync">Run Sync</button></div>' +
      '<dl class="mt-3 grid gap-2 text-sm sm:grid-cols-2"><div class="flex flex-col"><dt class="text-muted">Coordinator GitHub Username</dt><dd class="m-0 font-semibold">' + escape(g.coordUsername) + '</dd></div>' +
      '<div class="flex flex-col"><dt class="text-muted">Repositories with access</dt><dd class="m-0 font-semibold" id="githubReposAccess">' + g.reposWithAccess + ' / ' + g.totalRepos + '</dd></div></dl></div>';
  }
  function invitationsCard() {
    return '<section class="' + CARD + '" id="studentInvitationResend"><h3 class="text-base font-semibold text-ink">Student GitHub invitations</h3>' +
      note('Renew expired or missing invitations for students in existing team repositories. Joined students and pending invitations are skipped.') +
      '<div class="mt-3"><button type="button" class="' + PRIMARY + '" data-action="resend">Resend expired student invitations</button></div>' +
      '<p data-resend-status role="status" aria-live="polite" class="mt-2 text-sm text-ink-2"></p>' +
      '<details data-resend-log hidden class="mt-2"><summary class="cursor-pointer text-sm font-semibold">View student invitation log</summary>' +
      '<div data-resend-results data-tooltip-boundary class="tracker-table-scroll mt-2 rounded-tile border border-edge" role="region" aria-label="Student invitation results" tabindex="0"></div>' +
      '<nav aria-label="Pagination" class="mt-3 flex flex-wrap items-center justify-between gap-3 text-sm text-muted"><span id="studentInvitationsPaginationInfo">Showing 0 - 0 of 0 students</span>' +
      '<label class="flex items-center gap-2">Rows per page <select id="studentInvitationsPageSize" data-action="resend-size" class="rounded-md border border-control px-2 py-1"><option value="10">10</option><option value="25">25</option><option value="50">50</option><option value="all">All</option></select></label>' +
      '<div id="studentInvitationsPaginationButtons" class="flex items-center gap-1" aria-label="Student table pages"></div></nav></details></section>';
  }
  function publishingCard(item) {
    const key = escape(item.key), title = escape(item.title);
    return '<section class="' + CARD + '" data-publishing="' + key + '" aria-labelledby="' + key + 'PublishingHeading"><header class="flex items-center justify-between gap-3"><h3 id="' + key + 'PublishingHeading" class="text-base font-semibold text-ink">' + title + '</h3>' +
      '<button type="button" class="publishing-toggle ' + BUTTON + '" data-publishing-toggle aria-expanded="false" aria-controls="' + key + 'PublishingBody" aria-label="Expand ' + title + ' publishing" data-action="publishing-toggle" data-key="' + key + '">' + icon('chevron-down') + '</button></header>' +
      '<div id="' + key + 'PublishingBody" data-publishing-body hidden><div class="mt-3 flex flex-wrap items-center gap-3"><p class="text-sm text-ink-2">Publish internal assessment results using the assessment\'s existing publication rules.</p>' +
      '<button class="' + BUTTON + '" type="button" data-refresh data-action="publishing-refresh" data-key="' + key + '">Refresh evaluations</button></div>' +
      '<div data-notice role="status" aria-live="polite"></div><div data-publishing-content>' + skeleton('panel', 'Reading ' + item.title + ' publication status') + '</div></div></section>';
  }
  function committeeCard() {
    return '<section id="committeeConfigurationCard" class="' + CARD + '" aria-labelledby="committeeConfigurationHeading" aria-busy="true"><div class="flex items-center justify-between gap-3"><div class="flex flex-wrap items-center gap-2"><h3 id="committeeConfigurationHeading" class="text-base font-semibold text-ink">Review Committees</h3>' +
      '<span id="committeeConfigurationSummary" role="status" aria-live="polite" class="text-sm text-ink-2">' + skeleton('inline', 'Checking review committees') + '</span></div>' +
      '<button class="' + BUTTON + '" id="committeeConfigurationRecheck" type="button" data-action="committee-recheck">Recheck</button></div>' +
      '<ul id="committeeConfigurationIssues" hidden class="mt-2 list-disc pl-5 text-sm text-danger"></ul>' + note('Select a committee to see reviewers and assigned teams.') +
      '<div id="committeeDirectoryContent" class="mt-2"></div><div class="mt-3 flex flex-wrap items-center gap-3">' + link('committeeConfigLink', 'Review committees') + link('committeeAssignmentsLink', 'Team assignments') + '<span id="committeeConfigurationCheckedAt" class="text-xs text-muted"></span></div></section>';
  }
  function reviewCard() {
    return '<section id="reviewConfigurationCard" class="' + CARD + '" aria-labelledby="reviewConfigurationHeading" aria-busy="true"><div class="flex items-center justify-between gap-3"><div class="flex flex-wrap items-center gap-2"><h3 id="reviewConfigurationHeading" class="text-base font-semibold text-ink">Assessment readiness</h3>' +
      '<span id="reviewConfigurationSummary" role="status" aria-live="polite" class="text-sm text-ink-2">' + skeleton('inline', 'Checking assessment readiness') + '</span></div>' +
      '<button class="' + BUTTON + '" id="reviewConfigurationRecheck" type="button" data-action="review-recheck">Recheck</button></div>' +
      '<ul id="reviewConfigurationIssues" hidden class="mt-2 list-disc pl-5 text-sm text-danger"></ul>' +
      '<div class="mt-2"><button class="' + BUTTON + '" type="button" id="createAssessmentDefinitionsButton" hidden disabled data-action="bootstrap-definitions">Create assessment definitions tab</button></div>' +
      note('First create the definitions schema, then use Assessment definitions to enter the academic configuration. Setup never supplies assessment instances or policy choices.') +
      '<ul id="reviewAssessmentReadiness" aria-label="Readiness by assessment" class="list mt-2 grid gap-2"></ul>' +
      note('Storage readiness is separate from team entry availability, which also checks reviewer assignment, opening dates and prerequisites.') +
      '<div id="assessmentStorageSetup" class="mt-3"><div>' + note('Prepare configured assessment journals. Existing assessment data stays unchanged.') +
      '<div class="mt-2"><button type="button" id="initializeAssessmentStorageButton" disabled aria-describedby="reviewConfigurationSummary" class="' + PRIMARY + '" data-action="storage-init">Create missing assessment storage</button></div></div>' +
      '<p id="assessmentStorageStatus" role="status" aria-live="polite" class="mt-2 text-sm text-ink-2"></p><ul id="assessmentStorageResults" class="mt-1 text-sm"></ul></div>' +
      '<div id="weeklyPhase2Setup" class="mt-4"><h4 class="m-0 text-sm font-semibold text-ink">Weekly progress setup</h4><div data-weekly-setup-read>' + skeleton('status', 'Checking weekly progress setup') + '</div>' +
      '<p data-weekly-setup-status role="status" aria-live="polite" class="text-sm text-ink-2"></p></div>' +
      '<div class="mt-3 flex flex-wrap items-center gap-3">' + link('reviewDefinitionsLink', 'Assessment definitions') + link('reviewConfigLink', 'Milestones') + link('reviewRubricsLink', 'Rubric criteria') + '<span id="reviewConfigurationCheckedAt" class="text-xs text-muted"></span></div></section>';
  }

  /** Reviewer directory used by the committee card; rebuilt from structured data on every recheck. */
  function committeeDirectory(committees) {
    const items = (committees || []).map(committee => {
      const members = committee.members.length
        ? committee.members.map((m, i) => '<li class="flex items-center gap-2 py-1"><span class="inline-flex size-9 items-center justify-center rounded-full text-sm font-bold text-paper ' + AVATAR[i % 3] + '" aria-hidden="true">' + escape((m.name || m.email).slice(0, 1).toUpperCase()) + '</span>' +
          '<div class="flex flex-col"><strong>' + escape(m.name || 'Name not provided') + '</strong><span class="text-xs text-muted">' + escape(m.email || 'Email not provided') + '</span></div></li>').join('')
        : '<li class="py-1 text-sm text-muted">No reviewers assigned.</li>';
      return '<details class="committee-item rounded-tile border border-edge bg-paper px-4 py-3" data-committee-key="' + escape(String(committee.number ?? '').trim().toLowerCase()) + '">' +
        '<summary class="flex cursor-pointer items-center justify-between gap-2"><span class="flex flex-col font-semibold">Committee ' + escape(committee.number) + '<small class="text-xs font-normal text-muted">' + committee.members.length + ' reviewers · ' + committee.teams.length + ' teams</small></span><span aria-hidden="true" class="committee-chevron">' + icon('chevron-down') + '</span></summary>' +
        '<div class="mt-2"><ul class="m-0 list-none p-0 text-sm">' + members + '</ul><div class="mt-2 text-sm"><span class="font-semibold text-ink-2">Assigned teams</span><div class="mt-1 flex flex-wrap gap-1">' +
        (committee.teams.length ? committee.teams.map(team => '<span class="rounded-md bg-tint px-2 py-0.5 text-xs font-semibold text-primary">' + escape(team) + '</span>').join('') : 'No teams assigned') + '</div></div></div></details>';
    }).join('');
    return '<div id="committeeReadinessGrid" class="grid gap-2">' + items + '</div>';
  }

  function render(target, dto) {
    const items = dto.publishing.configured ? dto.publishing.items.map(publishingCard).join('') : '<p role="status" class="text-sm text-warning">Assessment configuration needs attention. Use Assessment readiness below.</p>';
    target.innerHTML = '<div data-status-cards class="flex flex-col gap-4"><div data-status-primary class="grid gap-4 lg:grid-cols-2">' + githubCard(dto.github) + invitationsCard() + '</div>' + items + committeeCard() + reviewCard() + '</div>';
    target.onclick = onClick;
    target.onchange = onChange;
  }

  function onChange(event) {
    const el = event.target;
    if (el.getAttribute && el.getAttribute('data-action') === 'resend-size') getUi().changeTeamPageSize('invitations', el.value);
  }
  function onClick(event) {
    const el = event.target.closest ? event.target.closest('[data-action]') : null;
    if (!el || el.disabled) return;
    const ui = getUi(), action = el.getAttribute('data-action'), key = el.getAttribute('data-key');
    if (action === 'github-sync') ui.runGithubSync();
    else if (action === 'resend') ui.runStudentInvitationResend();
    else if (action === 'publishing-toggle') getPublishing().toggle(key);
    else if (action === 'publishing-refresh') getPublishing().refresh(key);
    else if (action === 'committee-recheck') ui.recheckCommitteeConfiguration();
    else if (action === 'review-recheck') ui.recheckReviewConfiguration();
    else if (action === 'bootstrap-definitions') ui.bootstrapAssessmentDefinitions();
    else if (action === 'storage-init') ui.initializeAssessmentStorage();
  }

  function load() { return bridge.read('system-status', 'API_coordinator_getSystemStatus', [], {timeoutMs:120000}); }

  return {load, render, committeeDirectory, publishingCard};
}
