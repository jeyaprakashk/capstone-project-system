/**
 * STUDENT VIEW — browser module serialized into the dashboard shell as `StudentView`.
 * Renders the student DTO (DATA-CONTRACTS.md) with Tailwind utilities. It keeps the DOM hooks the
 * weekly-progress, recent-logs, assessment and GitHub-connection modules attach to
 * (#studentWeeklyProgress, #studentRecentActivity, #studentAssessment-*, #studentGuideEvaluation,
 * [data-step-card], #studentGithubProfile, #githubSubmitStatus, #githubStatusRefresh).
 * It never calls google.script.run; account-connection actions stay in DashboardUI.
 */
function studentViewBrowser_(bridge, getUi) {
  'use strict';
  const delegated = new WeakSet();
  const state = {dto:null, host:null};
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeUrl = url => /^https?:\/\//i.test(String(url)) ? String(url) : '#';
  const icon = (name, label) => getUi().renderIcon(name, label);

  const CARD = 'rounded-card border border-edge bg-paper shadow-card';
  const BADGE = 'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ';
  const STEP_BADGE = {
    done:BADGE + 'bg-success-tint text-success ring-success/20', waiting:BADGE + 'bg-info-tint text-info ring-info/20',
    locked:BADGE + 'bg-soft text-muted ring-control/20', active:BADGE + 'bg-warning-tint text-warning ring-warning/20'
  };
  const STEP_TEXT = {done:'Done', waiting:'Waiting', locked:'Locked', active:'Action needed'};
  const BUTTON = 'border-0 rounded-md bg-paper px-3 py-1.5 text-sm font-semibold text-ink ring-1 ring-inset ring-line hover:bg-tint disabled:opacity-50';
  const PRIMARY = 'border-0 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-paper hover:bg-primary-hover disabled:opacity-50';
  const AVATAR = ['bg-teal-700', 'bg-purple-700', 'bg-primary'];
  const p = (html, extra) => '<p class="mt-2 text-sm ' + (extra || 'text-ink-2') + '">' + html + '</p>';

  function rosterMarkup(roster) {
    return '<div class="mt-3 flex flex-wrap gap-3">' + roster.map((r, i) =>
      '<div class="flex items-center gap-2 rounded-card border border-edge bg-paper shadow-card px-3 py-2"><span class="inline-flex size-9 items-center justify-center rounded-full text-sm font-bold text-paper ' + AVATAR[i % 3] + '">' + escape(r.initials) + '</span>' +
      '<div><div class="text-sm font-semibold text-ink">' + escape(r.name) + (r.isMe ? ' <span class="ml-1 rounded-md bg-tint px-1.5 py-0.5 text-xs font-semibold text-primary">you</span>' : '') + '</div><div class="text-xs text-muted">' + escape(r.regno) + '</div></div></div>').join('') + '</div>';
  }
  function stepNode(number, state) {
    const content = state === 'done' ? icon('check', 'Complete') : state === 'locked' ? icon('lock-keyhole', 'Locked') : number;
    const tone = state === 'done' ? 'border-success bg-success text-paper' : state === 'locked' ? 'border-control bg-soft text-muted' : 'border-primary bg-paper text-primary';
    return '<div class="inline-flex size-7 items-center justify-center rounded-full border-2 text-xs font-bold ' + tone + '">' + content + '</div>';
  }
  function stepCard(number, title, stepState, body, cta) {
    return '<div data-step-row class="flex gap-3"><div class="pt-3">' + stepNode(number, stepState) + '</div>' +
      '<div class="min-w-0 flex-1 ' + CARD + ' p-4" data-step-card><div data-step-header class="flex items-center justify-between gap-2"><h4 class="m-0 text-base font-semibold text-ink">' + escape(title) + '</h4><span class="' + STEP_BADGE[stepState] + '">' + STEP_TEXT[stepState] + '</span></div>' +
      '<div data-step-body>' + body + '</div>' + (cta || '') + '</div></div>';
  }
  function memberRow(m) {
    const status = {missing:['Submit GitHub Account', 'triangle-alert'], joined:['Repository joined', 'check'], pending:['Accept Invitation Email', 'clock']}[m.status];
    const label = m.canConnect
      ? '<button type="button" class="' + BUTTON + '" data-github-form-jump>' + escape(status[0]) + '</button>'
      : '<span>' + escape(status[0]) + '</span>';
    return '<li data-member-status="' + m.status + '" class="flex flex-wrap items-center gap-x-3 gap-y-1 py-1 text-sm"><span data-member-register class="min-w-16 font-semibold">' + escape(m.regno) + '</span>' +
      '<span data-member-state class="inline-flex items-center gap-1">' + icon(status[1]) + label + '</span></li>';
  }
  function repoLine(repoUrl) {
    return '<div class="mt-3 flex items-center gap-1 text-sm"><span>' + icon('git-branch', 'Team repository') + '</span>' + (repoUrl
      ? '<a class="break-all text-primary underline" href="' + escape(safeUrl(repoUrl)) + '" target="_blank" rel="noopener">' + escape(repoUrl) + ' ' + icon('external-link') + '</a>'
      : '<span class="text-muted">Not available yet</span>') + '</div>';
  }
  function githubForm(g) {
    const disabled = g.captureReady ? '' : ' disabled';
    return '<form data-github-form class="mt-4 flex flex-col gap-2"><label for="studentGithubProfile" class="text-sm font-semibold text-ink">Submit GitHub Account</label>' +
      '<p class="text-sm text-muted">GitHub → <strong>Your profile</strong> → copy the profile URL and paste below.</p>' +
      '<input id="studentGithubProfile" name="profileUrl" type="url" required maxlength="200" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="https://github.com/student123" aria-describedby="githubSubmitStatus"' + disabled + ' class="w-full max-w-md scroll-mt-20 rounded-md border border-control px-3 py-2 text-sm">' +
      '<div><button class="' + PRIMARY + '" type="submit"' + disabled + '>Continue</button></div><div data-github-confirmation hidden class="flex max-w-md flex-col gap-3 rounded-tile border border-edge bg-paper p-4"></div>' +
      '<p id="githubSubmitStatus" role="status" aria-live="polite" class="text-sm text-ink-2"></p>' +
      '<div><button id="githubStatusRefresh" class="' + BUTTON + '" type="button" hidden data-action="github-refresh">Refresh GitHub status</button></div></form>';
  }
  function githubCard(dto) {
    const g = dto.github;
    return stepCard(1, 'GitHub setup', g.state,
      p('GitHub setup due ' + escape(g.due) + ' · ' + escape(g.statusText)) + '<ul aria-label="Team GitHub status" class="mt-2 divide-y divide-edge">' + g.members.map(memberRow).join('') + '</ul>' + repoLine(g.repoUrl),
      g.connected ? '' : githubForm(g));
  }
  function titleCard(dto) {
    const t = dto.title;
    let body;
    if (t.locked) body = p('Finish GitHub setup first.') + (t.currentTitle ? p('<strong>Current title:</strong> ' + escape(t.currentTitle)) + p(escape(t.statusText)) : '');
    else body = p(escape(t.statusText)) + (t.currentTitle ? p('<strong>Current title:</strong> ' + escape(t.currentTitle)) : '') + (t.note ? p(escape(t.note)) : '') +
      p('Approval due ' + escape(t.due.date) + (t.due.overdue ? ' · Overdue' : ''), t.due.overdue ? 'text-danger' : 'text-ink-2');
    const cta = t.intake ? '<div class="mt-4"><a class="' + PRIMARY + ' inline-block no-underline" href="' + escape(safeUrl(t.intake.url)) + '" target="_blank" rel="noopener">' + escape(t.intake.label) + '</a></div>' : '';
    return stepCard(2, 'Project title', t.state, body, cta);
  }
  function setupMarkup(dto) {
    const done = dto.setup.complete;
    const header = '<h3 class="text-base font-semibold text-ink">Project Setup</h3><span class="' + (done ? STEP_BADGE.done : STEP_BADGE.waiting) + '">' + (done ? '&#10003; Complete' : 'Action needed') + '</span>';
    const steps = '<div class="mt-3 flex flex-col gap-3">' + githubCard(dto) + titleCard(dto) + '</div>';
    if (done) return '<details class="student-project-setup group ' + CARD + ' p-4"><summary class="flex cursor-pointer items-center gap-3 [&::-webkit-details-marker]:hidden">' + header + '<span class="setup-view text-sm text-primary group-open:hidden">View</span><span class="setup-hide hidden text-sm text-primary group-open:inline">Hide</span></summary>' + steps + '</details>';
    return '<section class="student-project-setup ' + CARD + ' p-4" aria-label="Project Setup"><header class="flex items-center gap-3">' + header + '</header><div data-setup-pending>' + dto.setup.pendingSteps.map(text => p(escape(text))).join('') + '</div>' + steps + '</section>';
  }
  function weeklyMarkup(ui) {
    return '<section class="mt-4 ' + CARD + ' p-4"><section id="studentWeeklyProgress" aria-label="Weekly progress"><div class="flex items-center justify-between gap-2"><h3 class="text-base font-semibold text-ink">Weekly progress</h3>' +
      '<button type="button" class="' + BUTTON + '" data-weekly-refresh aria-label="Refresh weekly progress" data-action="weekly-refresh">Refresh</button></div>' +
      '<div data-weekly-read class="empty:hidden">' + ui.renderSkeleton('panel', 'Loading weekly progress') + '</div><p data-weekly-status role="status" aria-live="polite" class="text-sm text-ink-2 empty:hidden"></p><div data-weekly-form></div></section></section>';
  }
  function sideMarkup(dto, ui) {
    const a = dto.assessments;
    return '<div class="mt-4 grid gap-4 lg:grid-cols-2"><section class="' + CARD + ' p-4" aria-label="Recent logs"><header class="flex items-center justify-between gap-2"><h3 class="text-base font-semibold text-ink">Recent logs</h3>' +
      (dto.titleApproved ? '<a class="text-sm text-primary underline" href="#studentWeeklyProgress" data-action="open-logs">View all logs</a>' : '') + '</header>' +
      '<div id="studentRecentActivity" class="mt-2">' + (dto.titleApproved ? ui.renderSkeleton('panel', 'Loading recent logs') : '<p class="text-sm text-muted">Weekly logs will appear after project setup.</p>') + '</div></section>' +
      '<section class="' + CARD + ' p-4" aria-label="Assessments"><header><h3 class="text-base font-semibold text-ink">Assessments</h3></header><div class="mt-2 flex flex-col gap-3">' +
      a.reviews.map(r => '<section id="studentAssessment-' + escape(r.key) + '" data-review-result="' + escape(r.key) + '" data-assessment-label="' + escape(r.label) + '" class="rounded-card border border-edge p-3" aria-live="polite">' + ui.renderSkeleton('panel', 'Loading ' + r.label + ' results') + '</section>').join('') +
      '<section id="studentGuideEvaluation" data-assessment-label="' + escape(a.guideEvaluationLabel) + '" class="rounded-card border border-edge p-3" aria-live="polite">' + ui.renderSkeleton('panel', 'Loading guide evaluation') + '</section></div></section></div>';
  }

  function render(host, dto) {
    state.host = host; state.dto = dto;
    const ui = getUi();
    host.innerHTML = '<div><h2 class="text-xl font-semibold text-ink">Team <span class="text-primary">' + escape(dto.teamId) + '</span></h2>' + rosterMarkup(dto.roster) + '<div class="mt-4">' + setupMarkup(dto) + '</div>' +
      (dto.titleApproved ? weeklyMarkup(ui) : '') + sideMarkup(dto, ui) + '</div>';
    if (!delegated.has(host)) { delegated.add(host); host.addEventListener('click', onClick); host.addEventListener('submit', onSubmit); }
  }

  function onClick(event) {
    const target = event.target.closest ? event.target.closest('[data-action],[data-github-form-jump]') : null;
    if (!target || target.disabled) return;
    const ui = getUi(), action = target.getAttribute('data-action');
    if (target.hasAttribute('data-github-form-jump')) ui.focusGithubAccountForm(target);
    else if (action === 'github-refresh') ui.refreshGithubStatus(target);
    else if (action === 'weekly-refresh') ui.loadWeeklyProgress();
    else if (action === 'open-logs') { if (event.preventDefault) event.preventDefault(); ui.openWeeklyActivity(target); }
  }
  function onSubmit(event) {
    const form = event.target.closest ? event.target.closest('[data-github-form]') : null;
    if (form) getUi().previewGithubAccount(event, form);
  }

  function load() { return bridge.read('role:student', 'API_student_getDashboard', []); }

  return {load, render, state};
}
