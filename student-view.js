/**
 * STUDENT VIEW — browser module serialized into the dashboard shell as `StudentView`.
 * Renders the student DTO (DATA-CONTRACTS.md) with Tailwind utilities as five screens (Weeks,
 * Assessments, Title, GitHub, Team) whose links it renders into the shell sidebar
 * (#studentSideNav). It keeps the DOM
 * hooks the weekly-progress, assessment and GitHub-connection modules attach to
 * (#studentWeeklyProgress, #studentAssessment-*, #studentGuideEvaluation,
 * [data-step-card], #studentGithubProfile, #githubSubmitStatus, #githubStatusRefresh).
 * It never calls google.script.run; account-connection actions stay in DashboardUI.
 */
function studentViewBrowser_(bridge, getUi) {
  'use strict';
  const delegated = new WeakSet();
  const state = {dto:null, host:null, tab:null, loaded:{}, project:null, projectBusy:false};
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeUrl = url => /^https?:\/\//i.test(String(url)) ? String(url) : '#';
  const icon = (name, label, className) => getUi().renderIcon(name, label, className);

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
  const registerLabel = (regno, isMe) => escape(regno) + (isMe ? ' (You)' : '');
  const p = (html, extra) => '<p class="mt-2 text-sm ' + (extra || 'text-ink-2') + '">' + html + '</p>';

  function rosterMarkup(roster) {
    return '<div class="mt-3 flex flex-wrap gap-3">' + roster.map((r, i) =>
      '<div class="flex items-center gap-2 rounded-card border border-edge bg-paper shadow-card px-3 py-2"><span class="inline-flex size-9 items-center justify-center rounded-full text-sm font-bold text-paper ' + AVATAR[i % 3] + '">' + escape(r.initials) + '</span>' +
      '<div><div class="text-sm font-semibold text-ink">' + escape(r.name) + '</div><div class="text-xs text-muted">' + registerLabel(r.regno, r.isMe) + '</div></div></div>').join('') + '</div>';
  }
  function stepCard(title, stepState, body, cta) {
    return '<div data-step-row>' +
      '<div class="min-w-0 ' + CARD + ' p-4" data-step-card><div data-step-header class="flex items-center justify-between gap-2"><h4 class="m-0 text-base font-semibold text-ink">' + escape(title) + '</h4><span class="' + STEP_BADGE[stepState] + '">' + STEP_TEXT[stepState] + '</span></div>' +
      '<div data-step-body>' + body + '</div>' + (cta || '') + '</div></div>';
  }
  function memberRow(m) {
    const status = {missing:['Submit GitHub Account', 'triangle-alert'], joined:['Repository joined', 'check'], pending:['Accept Invitation Email', 'clock']}[m.status];
    const label = m.canConnect
      ? '<button type="button" class="' + BUTTON + '" data-github-form-jump>' + escape(status[0]) + '</button>'
      : '<span>' + escape(status[0]) + '</span>';
    return '<li data-member-status="' + m.status + '" class="flex flex-wrap items-center gap-x-3 gap-y-1 py-1 text-sm"><span data-member-register class="min-w-16 font-semibold">' + registerLabel(m.regno, m.isMe) + '</span>' +
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
      '<div><button class="' + PRIMARY + '" type="submit" data-github-submit' + disabled + '>Continue</button></div><div data-github-confirmation hidden class="flex max-w-md flex-col gap-3 rounded-tile border border-edge bg-paper p-4"></div>' +
      '<p id="githubSubmitStatus" role="status" aria-live="polite" class="text-sm text-ink-2"></p>' +
      '<div><button id="githubStatusRefresh" class="' + BUTTON + '" type="button" hidden data-action="github-refresh">Refresh GitHub status</button></div></form>';
  }
  function githubCard(dto) {
    const g = dto.github;
    return stepCard('GitHub setup', g.state,
      p('GitHub setup due ' + escape(g.due) + ' · ' + escape(g.statusText)) + '<ul aria-label="Team GitHub status" class="mt-2 divide-y divide-edge">' + g.members.map(memberRow).join('') + '</ul>' + repoLine(g.repoUrl),
      g.connected ? '' : githubForm(g));
  }
  function titleCard(dto) {
    const t = dto.title;
    let body;
    if (t.locked) body = p('Finish GitHub setup first.') + '<div class="mt-2"><button type="button" class="' + BUTTON + '" data-action="show-tab" data-tab="github">Open GitHub status</button></div>' + (t.currentTitle ? p('<strong>Current title:</strong> ' + escape(t.currentTitle)) + p(escape(t.statusText)) : '');
    else body = p(escape(t.statusText)) + (t.currentTitle ? p('<strong>Current title:</strong> ' + escape(t.currentTitle)) : '') + (t.note ? p(escape(t.note)) : '') +
      p('Approval due ' + escape(t.due.date) + (t.due.overdue ? ' · Overdue' : ''), t.due.overdue ? 'text-danger' : 'text-ink-2');
    const cta = t.intake ? '<div class="mt-4"><a class="' + PRIMARY + ' inline-block no-underline" href="' + escape(safeUrl(t.intake.url)) + '" target="_blank" rel="noopener">' + escape(t.intake.label) + '</a></div>' : '';
    return stepCard('Project title', t.state, body, cta);
  }
  // GitHub status screen: what is still pending for setup, then the GitHub card. The Title screen is the title card alone.
  function githubMarkup(project) {
    const pending = project.setup.complete ? '' : '<div data-setup-pending>' + project.setup.pendingSteps.map(text => p(escape(text))).join('') + '</div>';
    return pending + '<div class="mt-3">' + githubCard(project) + '</div>';
  }
  function titleMarkup(project) { return '<div>' + titleCard(project) + '</div>'; }
  const TABS = [['weeks', 'Weeks', 'calendar'], ['assessments', 'Assessments', 'clipboard-check'], ['title', 'Title', 'file-text'], ['github', 'GitHub', 'git-branch'], ['team', 'Team', 'users']];
  // The screen links live in the shell sidebar (#studentSideNav, below the role separator); the view fills it.
  // Below md the links become a bottom bar (icon over label); from md up they are a sidebar group after the last menu item.
  const TAB = 'border-0 flex w-full flex-col items-center justify-center gap-1 border-t-2 border-t-transparent bg-transparent px-1 py-2 text-xs text-ink-2 hover:bg-tint aria-[current=page]:border-t-primary aria-[current=page]:font-semibold aria-[current=page]:text-primary md:flex-row md:justify-start md:gap-2 md:rounded-lg md:border-t-0 md:px-3 md:text-left md:text-sm md:aria-[current=page]:bg-tint';
  function navMarkup(active) {
    return '<nav aria-label="Student sections" class="grid grid-cols-5 md:flex md:flex-col md:gap-1">' + TABS.map(t =>
      '<button type="button" class="' + TAB + '" id="studentTab-' + t[0] + '" aria-controls="studentPanel-' + t[0] + '"' + (t[0] === active ? ' aria-current="page"' : '') + ' data-student-tab="' + t[0] + '">' + icon(t[2]) + t[1] + '</button>').join('') + '</nav>';
  }
  function panelMarkup(key, active, body) {
    return '<section id="studentPanel-' + key + '" aria-labelledby="studentTab-' + key + '" data-student-panel="' + key + '" class="min-w-0"' + (key === active ? '' : ' hidden') + '>' + body + '</section>';
  }
  function weeklyMarkup(dto, ui) {
    if (!dto.titleApproved) return '<section data-weekly-locked class="' + CARD + ' p-5" aria-label="Weekly progress"><h3 class="text-base font-semibold text-ink">Weekly progress</h3>' + p('Weekly logs will appear after project setup.', 'text-muted') + '</section>';
    return '<section id="studentWeeklyProgress" aria-label="Weekly progress" data-weekly-view="list" class="group/weekly">' +
      '<p data-weekly-status role="status" aria-live="polite" class="sticky top-2 z-10 mb-3 rounded-md bg-paper px-3 py-2 text-sm text-ink-2 shadow-card ring-1 ring-inset ring-line empty:hidden"></p>' +
      '<div class="grid gap-4 xl:grid-cols-[minmax(0,21rem)_minmax(0,1fr)] xl:items-start">' +
      '<div data-weekly-read class="min-w-0 empty:hidden group-data-[weekly-view=detail]/weekly:max-xl:hidden">' + ui.renderSkeleton('panel', 'Loading weekly progress') + '</div>' +
      '<article data-weekly-detail hidden class="min-w-0 rounded-card border border-edge bg-paper p-5 shadow-card group-data-[weekly-view=list]/weekly:max-xl:hidden"><div data-weekly-form></div></article></div></section>';
  }
  function assessmentsMarkup(dto, ui) {
    const a = dto.assessments;
    return '<section class="' + CARD + ' p-5" aria-label="Assessments"><header><h3 class="text-base font-semibold text-ink">Assessments</h3></header><div class="mt-3 flex flex-col gap-3">' +
      a.reviews.map(r => '<section id="studentAssessment-' + escape(r.key) + '" data-review-result="' + escape(r.key) + '" data-assessment-label="' + escape(r.label) + '" class="rounded-card border border-edge p-3" aria-live="polite">' + ui.renderSkeleton('panel', 'Loading ' + r.label + ' results') + '</section>').join('') +
      '<section id="studentGuideEvaluation" data-assessment-label="' + escape(a.guideEvaluationLabel) + '" class="rounded-card border border-edge p-3" aria-live="polite">' + ui.renderSkeleton('panel', 'Loading guide evaluation') + '</section></div></section>';
  }
  // The team heading and roster come with the core DTO, so the Team screen needs no fetch.
  function teamMarkup(dto) {
    return '<h2 class="text-xl font-semibold text-ink">Team <span class="text-primary">' + escape(dto.teamId) + '</span></h2>' + rosterMarkup(dto.roster);
  }
  // The GitHub and Title screens share one fetch; each has a slot the project cards are drawn into.
  function projectSlot(key, ui) { return '<div data-project-slot="' + key + '">' + ui.renderSkeleton('panel', 'Loading ' + (key === 'github' ? 'GitHub status' : 'project title')) + '</div>'; }
  /** Loads (or reloads) both project screens. Content already shown stays on a failed refresh; Retry is offered. */
  function loadProject(onLoaded, onError) {
    const host = state.host, slots = host ? Array.from(host.querySelectorAll('[data-project-slot]')) : [], ui = getUi();
    if (!slots.length) { if (onError) onError(new Error('The dashboard panel is unavailable. Reload the page.')); return; }
    if (state.projectBusy) { if (onError) onError(new Error('A dashboard refresh is already in progress. Please retry shortly.')); return; }
    state.projectBusy = true; state.loaded.project = true;
    const finishers = slots.map(slot => ui.beginContentLoading(slot, 'Loading project setup', {compact:true}));
    const finish = () => { finishers.forEach(done => done()); state.projectBusy = false; };
    const current = () => slots[0].isConnected && state.host === host;
    bridge.read('student-project', 'API_student_getProject', [], {timeoutMs:120000}).then(function(project) {
      finish();
      if (!current()) return;
      state.project = project;
      slots.forEach(slot => { slot.innerHTML = slot.getAttribute('data-project-slot') === 'github' ? githubMarkup(project) : titleMarkup(project); });
      if (onLoaded) onLoaded();
    }, function(error) {
      finish();
      if (error && error.superseded) return;
      if (!current()) return;
      if (onError) { onError(error); return; }
      const message = error && typeof error.message === 'string' && error.message.trim() ? error.message.trim() : 'The server did not provide error details';
      const notice = '<p data-project-error role="alert" class="m-0 mb-3 flex flex-wrap items-center gap-2 rounded-md border border-danger/20 bg-danger-tint px-3 py-2 text-sm text-danger">Could not load project setup: ' + escape(message) + ' <button type="button" class="' + BUTTON + '" data-action="project-retry">Retry</button></p>';
      slots.forEach(slot => {
        const old = slot.querySelector('[data-project-error]');
        if (old) old.remove();
        if (state.project) slot.insertAdjacentHTML('afterbegin', notice); else slot.innerHTML = notice;
      });
    });
  }

  function render(host, dto) {
    state.host = host; state.dto = dto; state.loaded = {}; state.project = null; state.projectBusy = false;
    if (!state.tab) state.tab = dto.titleApproved ? 'weeks' : 'github';
    const ui = getUi();
    host.innerHTML = '<div class="min-w-0">' +
      panelMarkup('weeks', state.tab, weeklyMarkup(dto, ui)) + panelMarkup('assessments', state.tab, assessmentsMarkup(dto, ui)) +
      panelMarkup('title', state.tab, projectSlot('title', ui)) + panelMarkup('github', state.tab, projectSlot('github', ui)) +
      panelMarkup('team', state.tab, teamMarkup(dto)) + '</div>';
    if (!delegated.has(host)) { delegated.add(host); host.addEventListener('click', onClick); host.addEventListener('submit', onSubmit); }
    const side = document.getElementById('studentSideNav');
    if (side) {
      side.innerHTML = navMarkup(state.tab);
      if (!delegated.has(side)) { delegated.add(side); side.addEventListener('click', onNavClick); side.addEventListener('keydown', onKeydown); }
    }
  }
  /** Each screen fetches its own data the first time it is shown; a re-render starts clean. */
  function activate() {
    const key = state.tab, ui = getUi();
    if (!state.dto || state.loaded[key]) return;
    state.loaded[key] = true;
    if (key === 'weeks' && state.dto.titleApproved) ui.loadWeeklyProgress();
    else if (key === 'assessments') ui.loadStudentResults();
    else if ((key === 'github' || key === 'title') && !state.loaded.project) loadProject();
  }
  function showTab(key) {
    state.tab = key;
    document.querySelectorAll('#studentSideNav [data-student-tab]').forEach(tab => {
      if (tab.getAttribute('data-student-tab') === key) tab.setAttribute('aria-current', 'page'); else tab.removeAttribute('aria-current');
    });
    state.host.querySelectorAll('[data-student-panel]').forEach(panel => { panel.hidden = panel.getAttribute('data-student-panel') !== key; });
    activate();
  }

  function onNavClick(event) {
    const tab = event.target.closest ? event.target.closest('[data-student-tab]') : null;
    if (tab) showTab(tab.getAttribute('data-student-tab'));
  }
  function onClick(event) {
    const target = event.target.closest ? event.target.closest('[data-action],[data-github-form-jump]') : null;
    if (!target || target.disabled) return;
    const ui = getUi(), action = target.getAttribute('data-action');
    if (target.hasAttribute('data-github-form-jump')) ui.focusGithubAccountForm(target);
    else if (action === 'github-refresh') ui.refreshGithubStatus(target);
    else if (action === 'project-retry') loadProject();
    else if (action === 'show-tab') showTab(target.getAttribute('data-tab'));
  }
  function onKeydown(event) {
    const tab = event.target.closest ? event.target.closest('[data-student-tab]') : null;
    if (!tab || !['ArrowUp', 'ArrowDown', 'Home', 'End'].includes(event.key)) return;
    const tabs = Array.from(document.querySelectorAll('#studentSideNav [data-student-tab]')), index = tabs.indexOf(tab);
    const step = event.key === 'ArrowDown' ? 1 : -1;
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? tabs.length - 1 : (index + step + tabs.length) % tabs.length;
    event.preventDefault(); tabs[next].focus(); showTab(tabs[next].getAttribute('data-student-tab'));
  }
  function onSubmit(event) {
    const form = event.target.closest ? event.target.closest('[data-github-form]') : null;
    if (form) getUi().previewGithubAccount(event, form);
  }

  function load() { return bridge.read('role:student', 'API_student_getCore', []); }

  return {load, render, activate, reloadProject:loadProject, state};
}
