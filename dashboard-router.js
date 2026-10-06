/**
 * CAPSTONE DASHBOARD ROUTER
 *
 * One HTML shell for every role combination. Dashboard modules provide
 * data, content and styles; dashboard-client-scripts.js provides the
 * browser behaviour exactly once.
 */
function doGet(e) {
  // TEMPORARY diagnostic: compare this execution's duration with a normal doGet to separate fixed web-app overhead from
  // page-size cost. Static text, no data read. Remove once the comparison is recorded.
  if (e && e.parameter && e.parameter.probe === 'empty') return HtmlService.createHtmlOutput('<p>ok</p>');
  const started = Date.now(), timings = [];
  try { return withDashboardRead_(() => buildDashboardResponse_(e, timings)); }
  finally { logPhases_('shell_phases', 'doGet', timings, started); }
}

function buildDashboardResponse_(e, timings) {
  const email = Session.getActiveUser().getEmail();
  if (!email) {
    return HtmlService.createHtmlOutput(
      '<p>Could not identify your account. Please sign in with your institutional Google account.</p>'
    );
  }

  // IMPORTANT: only detect roles here. Do NOT build dashboard data in doGet().
  const views = timedPhase_(timings, 'role_views', () => getDashboardRoleViews_(email, timings));

  if (views.length === 0) {
    return HtmlService.createHtmlOutput(
      '<p>No Student, Reviewer, Guide, or Coordinator role was found for this account.</p>'
    );
  }

  return HtmlService.createHtmlOutput(timedPhase_(timings, 'shell_build', () => buildDashboardShell_(email, views, timings)))
    .setTitle(views.length === 1 ? views[0].label + ' Dashboard' : 'Dashboard')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Lightweight role detection. TeamStatus and ReviewCommittee are each read
 * at most once in this Apps Script execution because getSheetRows_() is cached.
 */
function getDashboardRoleViews_(email, timings) {
  const views = [];
  const TS = timedPhase_(timings, 'role_team_status', () => { const map = getColumnMap_(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS); getSheetRows_(SHEET_NAMES.TEAM_STATUS); return map; });
  const statusRows = getSheetRows_(SHEET_NAMES.TEAM_STATUS).filter(r => r[TS.TEAM_ID]);

  const studentTeamId = statusRows.find(r =>
    [r[TS.S1_EMAIL], r[TS.S2_EMAIL], r[TS.S3_EMAIL], r[TS.S4_EMAIL]].some(e => emailsMatch_(e, email))
  );
  if (studentTeamId) {
    views.push({ key: 'student', label: 'My Team', contentId: 'studentContent' });
  }

  if (statusRows.some(r => emailsMatch_(r[TS.GUIDE_EMAIL], email))) {
    views.push({ key: 'guide', label: 'My Teams (Guide)', contentId: 'guideContent' });
  }

  // Reviewer role: inspect committee membership only; do not build reviewer data.
  const reviewerCommittees = timedPhase_(timings, 'role_committee', () => getCommitteeNumbersForReviewer_(email));
  if (reviewerCommittees.length > 0) {
    const committeeSet = new Set(reviewerCommittees.map(normalizeText_));
    if (statusRows.some(r => committeeSet.has(normalizeText_(r[TS.COMMITTEE_NUMBER])))) {
      views.push({ key: 'reviewer', label: 'Reviewer', contentId: 'reviewerContent' });
    }
  }

  const [coordinatorEmail, cellPdEmail] = timedPhase_(timings, 'role_config', () => [getCoordinatorEmail_(), String(getConfig_('CELL_PD_EMAIL') || '').trim()]);
  if (emailsMatch_(email, coordinatorEmail) || (cellPdEmail && emailsMatch_(email, cellPdEmail))) {
    views.push({ key: 'coord', label: 'Coordinator', contentId: 'coordinatorContent' });
  }

  return views;
}

// Role dashboards load as data: API_student_getCore (plus API_student_getProject on demand), API_reviewer_getDashboard, API_guide_getDashboard and
// API_coordinator_* (see DATA-CONTRACTS.md). Each re-checks authorization on the server. The shell below is the
// static page frame only: tabs, empty panels and loading placeholders; it carries no dashboard data.
const SYSTEM_STATUS_HEADER = '<h2>System Status</h2><p id="systemStatusRefreshStatus" class="empty:hidden" data-refresh-status role="status" aria-live="polite"></p>';

// Name as recorded in TeamStatus (student or guide) or ReviewCommittee (reviewer); else the email's local part.
function getDashboardUserName_(email) {
  try {
    const TS = getColumnMap_(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
    for (const r of getSheetRows_(SHEET_NAMES.TEAM_STATUS)) {
      for (const slot of ['S1', 'S2', 'S3', 'S4']) {
        if (emailsMatch_(r[TS[slot + '_EMAIL']], email) && String(r[TS[slot + '_NAME']] || '').trim()) return String(r[TS[slot + '_NAME']]).trim();
      }
      if (emailsMatch_(r[TS.GUIDE_EMAIL], email) && String(r[TS.GUIDE_NAME] || '').trim()) return String(r[TS.GUIDE_NAME]).trim();
    }
    const RC = getReviewCommitteeColumns_();
    for (const r of getAllCommitteeRows_()) {
      for (const n of [1, 2, 3, 4]) {
        if (emailsMatch_(r[RC['REVIEWER' + n + '_EMAIL']], email) && String(r[RC['REVIEWER' + n + '_NAME']] || '').trim()) return String(r[RC['REVIEWER' + n + '_NAME']]).trim();
      }
    }
  } catch (err) { /* fall back to the email below */ }
  return String(email).split('@')[0].split(/[._-]+/).filter(Boolean).map(p => p[0].toUpperCase() + p.slice(1)).join(' ') || String(email);
}

function buildDashboardShell_(email, views, timings) {
  const multiRole = views.length > 1;

  // Role tabs are followed by common utility tabs (Rubrics, System Status). They are not roles.
  const roleIcons = { student:'graduation-cap', guide:'book-open', reviewer:'clipboard-check', coord:'network' };
  const TAB = "border-0 inline-flex w-full items-center gap-2 rounded-lg bg-transparent px-3 py-2 text-left text-sm text-ink-2 hover:bg-tint aria-selected:bg-tint aria-selected:font-semibold aria-selected:text-primary disabled:opacity-50";
  // A student-only user has two menu items (My Team, Timeline & Rubrics): below md they are a fixed top bar of two tabs, like the bottom bar of the student screens, with no Menu toggle.
  const topBar = views.length === 1 && views[0].key === 'student';
  const TOP_TAB = "border-0 flex w-full flex-col items-center justify-center gap-1 border-b-2 border-b-transparent bg-transparent px-1 py-2 text-xs text-ink-2 hover:bg-tint aria-selected:border-b-primary aria-selected:font-semibold aria-selected:text-primary disabled:opacity-50 md:flex-row md:justify-start md:gap-2 md:rounded-lg md:border-b-0 md:px-3 md:text-left md:text-sm md:aria-selected:bg-tint";
  const tabClass = topBar ? TOP_TAB : TAB;
  const displayName = timedPhase_(timings, 'user_name', () => getDashboardUserName_(email));
  const stylesheet = timedPhase_(timings, 'stylesheet_file', () => HtmlService.createHtmlOutputFromFile('tailwind-styles').getContent());
  const initials = escapeHtml_(displayName.split(/\s+/).filter(Boolean).slice(0, 2).map(p => p[0]).join('').toUpperCase() || '?');
  const roleButtons = views.map((view, index) =>
    `<button type="button" class="${tabClass}${index === 0 ? ' active' : ''}" role="tab" id="roleTab-${escapeHtml_(view.key)}" aria-controls="rolePanel-${escapeHtml_(view.key)}" aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}" data-role-tab="${escapeHtml_(view.key)}">${renderLucideIcon_(roleIcons[view.key])}${escapeHtml_(view.label)}</button>`
  ).join('');
  const rubricsButton = `<button type="button" class="${tabClass}" role="tab" id="roleTab-rubrics" aria-controls="rolePanel-rubrics" aria-selected="false" tabindex="-1" data-role-tab="rubrics">${renderLucideIcon_('book-open')}Timeline &amp; Rubrics</button>`;
  // Student screens (Weeks, Assessments, Project) are rendered here by StudentView; shown only on the student tab.
  const studentNav = views.some(view => view.key === 'student') ? `<div id="studentSideNav" class="fixed inset-x-0 bottom-0 z-30 border-t border-edge bg-paper shadow-card md:static md:z-auto md:mt-2 md:pt-2 md:shadow-none" role="presentation"${views[0].key === 'student' ? '' : ' hidden'}></div>` : '';
  const menuToggle = topBar ? '' : `<button type="button" class="role-menu-toggle flex md:hidden border-0 items-center gap-2 rounded-md bg-paper px-3 py-1.5 text-sm font-semibold text-ink ring-1 ring-inset ring-line hover:bg-tint disabled:opacity-50 no-underline" id="roleMenuToggle" aria-expanded="false" aria-controls="roleMenuItems"><span id="roleMenuIcon">${renderLucideIcon_('menu')}</span><span id="roleMenuLabel">${escapeHtml_(views[0].label)}</span><span>Menu</span></button>`;
  const navClass = topBar ? 'dashboard-navigation group/nav max-md:fixed max-md:inset-x-0 max-md:top-0 max-md:z-30 max-md:border-b max-md:border-edge max-md:bg-paper max-md:shadow-card' : 'dashboard-navigation group/nav';
  const itemsClass = topBar ? 'role-tabs grid grid-cols-2 md:flex md:flex-col md:gap-1' : 'role-tabs hidden group-[.menu-open]/nav:flex md:flex flex-col gap-1 mt-2 md:mt-0';
  const separatorClass = topBar ? 'my-1 border-t border-edge max-md:hidden' : 'my-1 border-t border-edge';
  const hasCoordinator = views.some(view => view.key === 'coord');
  const systemButton = hasCoordinator ? `<button type="button" class="${TAB}" role="tab" id="roleTab-system-status" aria-controls="rolePanel-system-status" aria-selected="false" tabindex="-1" data-role-tab="system-status">${renderLucideIcon_('activity')}System Status</button>` : '';
  const systemPanel = hasCoordinator ? `<section class="role-panel hidden [&.active]:block pt-4" id="rolePanel-system-status" role="tabpanel" aria-labelledby="roleTab-system-status" data-role-panel="system-status" hidden>${SYSTEM_STATUS_HEADER}<p id="systemStatusMessage" role="status" aria-live="polite"></p><div id="systemStatusContent">${getSkeletonMarkup_('panel', 'Loading system status')}</div></section>` : '';

  const rolePanels = views.map((view, index) =>
    `<section class="role-panel hidden [&.active]:block pt-4${index === 0 ? ' active' : ''}" id="rolePanel-${escapeHtml_(view.key)}" role="tabpanel" aria-labelledby="roleTab-${escapeHtml_(view.key)}" data-role-panel="${escapeHtml_(view.key)}"${index === 0 ? '' : ' hidden'}><div id="${escapeHtml_(view.contentId)}" data-role-content="${escapeHtml_(view.key)}">${getSkeletonMarkup_('panel', 'Loading ' + view.label)}</div></section>`
  ).join('');


  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<base target="_top">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700&display=swap">
${stylesheet}
</head>
<body class="min-h-screen bg-canvas md:pl-60 ${topBar ? 'max-md:pt-14' : ''}">
<header class="border-b border-edge bg-paper px-4 py-3${topBar ? ' max-md:border-b-0 max-md:p-0' : ''} md:fixed md:inset-y-0 md:left-0 md:w-60 md:overflow-y-auto md:border-b-0 md:border-r">
<h1 class="m-0 mb-3 text-base font-semibold text-ink${topBar ? ' max-md:sr-only' : ''}">Dashboard</h1>
<nav class="${navClass}" id="dashboardNavigation" aria-label="Dashboard sections">
${menuToggle}
<div class="${itemsClass}" id="roleMenuItems" role="tablist" aria-label="Dashboard sections">${roleButtons}<div class="${separatorClass}" role="separator" aria-orientation="horizontal"></div>${rubricsButton}${systemButton}</div>
</nav>
${studentNav}
</header>
<div class="flex items-center justify-between gap-3 border-b border-edge bg-paper px-4 py-3"><div class="flex min-w-0 items-center gap-2"><span class="inline-flex size-9 shrink-0 items-center justify-center rounded-full bg-primary text-sm font-bold text-paper" id="userAvatar">${initials}</span><div class="min-w-0"><div class="truncate text-sm font-semibold text-ink" id="userName">${escapeHtml_(displayName)}</div><div class="truncate text-xs text-muted" id="userEmail">${escapeHtml_(email)}</div></div></div><div class="flex items-center gap-3"><span class="hidden text-xs text-muted sm:inline" id="shellUpdated" role="status" aria-live="polite"></span><button type="button" class="border-0 inline-flex items-center gap-1 rounded-md bg-paper px-3 py-1.5 text-sm font-semibold text-ink ring-1 ring-inset ring-line hover:bg-tint disabled:opacity-50" id="shellRefresh" data-shell-refresh-active aria-label="Refresh this page" disabled>${renderLucideIcon_('refresh-cw')}Refresh</button></div></div>
<main id="dashboardMain" class="mx-auto max-w-[1100px] px-4 pb-10 data-[role=student]:mx-0 data-[role=student]:max-md:pb-20">
<section class="role-panel hidden [&.active]:block pt-4" id="rolePanel-rubrics" role="tabpanel" aria-labelledby="roleTab-rubrics" data-role-panel="rubrics" hidden>
<section id="sharedProjectTimeline" hidden class="mb-4 rounded-card border border-edge bg-paper p-4 shadow-card" aria-label="Project timeline" aria-busy="true"><div><h2>Project timeline</h2></div>${getSkeletonMarkup_('timeline', 'Loading project timeline')}</section>
<section id="sharedRubrics" hidden class="shared-rubrics @container/rubrics rounded-card border border-edge bg-paper shadow-card" aria-labelledby="sharedRubricsHeading" aria-busy="true"><div><h2 id="sharedRubricsHeading">Rubrics &amp; Guidelines</h2></div><div id="sharedRubricsContent">${getSkeletonMarkup_('panel', 'Loading assessment rubrics')}</div></section>
</section>
${rolePanels}
${systemPanel}
</main>
<div id="rubricDrawerBackdrop" class="team-drawer-backdrop fixed inset-0 z-40 bg-scrim animate-[fade-in_.15s_cubic-bezier(.2,0,0,1)]" hidden aria-hidden="true"></div>
<aside id="rubricDrawer" class="fixed inset-y-0 right-0 z-40 flex w-full max-w-[420px] flex-col bg-paper shadow-overlay animate-[slide-in-right_.25s_cubic-bezier(.2,0,0,1)]" data-tooltip-boundary role="dialog" aria-modal="true" aria-labelledby="rubricDrawerTitle" aria-hidden="true" inert hidden>
  <div class="flex items-center justify-between gap-3 border-b border-edge px-5 py-4"><div><div>ASSESSMENT RUBRIC</div><h2 id="rubricDrawerTitle"></h2></div>
  <button type="button" id="rubricDrawerClose" data-drawer-close class="border-0 inline-flex items-center rounded-md bg-paper px-2 py-1 text-xs font-semibold text-ink ring-1 ring-inset ring-line hover:bg-tint disabled:opacity-50" aria-label="Close rubric details">${renderLucideIcon_('x')}</button></div>
  <div id="rubricDrawerContent" class="team-drawer-content flex-1 overflow-auto p-5" data-drawer-content></div>
  <div class="flex justify-end gap-2 border-t border-edge px-5 py-3" hidden></div>
</aside>
<script>
${getMigratedViewsClientScript_()}
${getDashboardClientScript_()}
${getInternalAssessmentPublishingClientScript_()}
${getGuideEvaluationClientScript_()}
${getGuideWeeklyClientScript_()}
${getReviewEvaluationClientScript_()}
</script>
</body>
</html>`;
}

/** Lightweight, serializable schedule data; never return user records or Date objects. */
function loadSharedProjectTimeline_() {
  return withDashboardRead_(() => {
    const email = Session.getActiveUser().getEmail();
    if (!email || !getDashboardRoleViews_(email).length) throw new Error('Dashboard access is required.');
    return getSharedProjectTimelineData_();
  });
}

function getSharedProjectTimelineData_() {
  const schedule = getProjectSchedule_();
  const clock = getProjectClock_(schedule);
  const windows = getWeeklySubmissionWindows_();
  const current = windows.find(w=>clock.now.getTime() >= w.opens_at && clock.now.getTime() <= w.deadline_at);
  const definitions = [...composeProjectTimeline_(schedule.milestones,schedule.assessments), {key:'week1',label:'Weekly logging starts',day:projectDay_(new Date(windows[0].opens_at),schedule.timezone)}];
  return {
    schedule, today:clock.today, todayLabel:formatProjectDay_(clock.today),
    week:current ? current.weekId : null, active:!!current, totalWeeks:windows.length,
    milestones:definitions.map(({key,label,day,opens,sequence}) => ({key,label,day,opens,sequence,date:formatProjectDay_(day),openingDate:Number.isFinite(opens)?formatProjectDay_(opens):null})).sort((a,b) => a.day - b.day)
  };
}

/** Shared Timeline and Rubrics tabs: the existing reads, returned as data. */
function API_shared_getTimeline() { return apiHandle_(() => loadSharedProjectTimeline_()); }
