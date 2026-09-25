/**
 * CAPSTONE DASHBOARD ROUTER
 *
 * One HTML shell for every role combination. Dashboard modules provide
 * data, content and styles; dashboard-client-scripts.js provides the
 * browser behaviour exactly once.
 */
function doGet(e) {
  return withDashboardRead_(() => buildDashboardResponse_(e));
}

function buildDashboardResponse_(e) {
  const email = Session.getActiveUser().getEmail();
  if (!email) {
    return HtmlService.createHtmlOutput(
      '<p>Could not identify your account. Please sign in with your institutional Google account.</p>'
    );
  }

  // IMPORTANT: only detect roles here. Do NOT build dashboard data in doGet().
  const views = getDashboardRoleViews_(email);

  if (views.length === 0) {
    return HtmlService.createHtmlOutput(
      '<p>No Student, Reviewer, Guide, or Coordinator role was found for this account.</p>'
    );
  }

  return HtmlService.createHtmlOutput(buildDashboardShell(email, views))
    .setTitle(views.length === 1 ? views[0].label + ' Dashboard' : 'Dashboard')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

/**
 * Lightweight role detection. TeamStatus and ReviewCommittee are each read
 * at most once in this Apps Script execution because getSheetRows() is cached.
 */
function getDashboardRoleViews_(email) {
  const views = [];
  const TS = getColumnMap(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const statusRows = getSheetRows(SHEET_NAMES.TEAM_STATUS).filter(r => r[TS.TEAM_ID]);

  const studentTeamId = statusRows.find(r =>
    [r[TS.S1_EMAIL], r[TS.S2_EMAIL], r[TS.S3_EMAIL], r[TS.S4_EMAIL]].some(e => emailsMatch(e, email))
  );
  if (studentTeamId) {
    views.push({ key: 'student', label: 'My Team', contentId: 'studentContent' });
  }

  if (statusRows.some(r => emailsMatch(r[TS.GUIDE_EMAIL], email))) {
    views.push({ key: 'guide', label: 'My Teams (Guide)', contentId: 'guideContent' });
  }

  // Reviewer role: inspect committee membership only; do not build reviewer data.
  const reviewerCommittees = getCommitteeNumbersForReviewer(email);
  if (reviewerCommittees.length > 0) {
    const committeeSet = new Set(reviewerCommittees.map(normalizeText_));
    if (statusRows.some(r => committeeSet.has(normalizeText_(r[TS.COMMITTEE_NUMBER])))) {
      views.push({ key: 'reviewer', label: 'Reviewer', contentId: 'reviewerContent' });
    }
  }

  const coordinatorEmail = getCoordinatorEmail();
  const cellPdEmail = String(getConfig('CELL_PD_EMAIL') || '').trim();
  if (emailsMatch(email, coordinatorEmail) || (cellPdEmail && emailsMatch(email, cellPdEmail))) {
    views.push({ key: 'coord', label: 'Coordinator', contentId: 'coordinatorContent' });
  }

  return views;
}

/**
 * Called asynchronously when a role tab is opened or selectively prefetched.
 * Authorization is rechecked server-side before returning content.
 */
function loadDashboardRoleContent(key) {
  return withDashboardRead_(() => loadDashboardRoleContent_(key));
}

function loadDashboardRoleContent_(key) {
  const email = Session.getActiveUser().getEmail();
  if (!email) throw new Error('Could not identify your account.');

  // IMPORTANT: authorize only the requested role. The previous version called
  // getDashboardRoleViews_() again, which needlessly checked every role and
  // reread unrelated sheets before loading one tab.
  if (key === 'student') {
    const TS = getColumnMap(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
    const rows = getSheetRows(SHEET_NAMES.TEAM_STATUS);
    const teamRow = rows.find(r =>
      r[TS.TEAM_ID] &&
      [r[TS.S1_EMAIL], r[TS.S2_EMAIL], r[TS.S3_EMAIL], r[TS.S4_EMAIL]]
        .some(e => emailsMatch(e, email))
    );
    if (!teamRow) throw new Error('Student team was not found.');
    return buildStudentContent(email, teamRow[TS.TEAM_ID], teamRow);
  }

  if (key === 'reviewer') {
    const committeeNumbers = getCommitteeNumbersForReviewer(email);
    if (!committeeNumbers.length) throw new Error('You do not have Reviewer access.');
    return buildReviewerContent(email, getReviewerDashboardData(email));
  }

  if (key === 'guide') {
    const TS = getColumnMap(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
    const rows = getSheetRows(SHEET_NAMES.TEAM_STATUS);
    if (!rows.some(r => r[TS.TEAM_ID] && emailsMatch(r[TS.GUIDE_EMAIL], email))) {
      throw new Error('You do not have Guide access.');
    }
    return buildDashboardContent(email, getGuideDashboardData(email));
  }

  if (key === 'coord') {
    const coordinatorEmail = getCoordinatorEmail();
    const cellPdEmail = String(getConfig('CELL_PD_EMAIL') || '').trim();
    if (!emailsMatch(email, coordinatorEmail) && !(cellPdEmail && emailsMatch(email, cellPdEmail))) {
      throw new Error('You do not have Coordinator access.');
    }
    return buildCoordinatorAsyncShell_();
  }

  throw new Error('Unknown dashboard role.');
}
function buildSingleRoleDashboardPage(email, key, label, contentId, html) {
  return buildDashboardShell(email, [{ key, label, contentId, html }]);
}

function buildDashboardShell(email, views) {
  const multiRole = views.length > 1;
  const rubricsCollapsible = ['guide','reviewer','coord'].includes(views[0].key);

  // Role tabs are followed by one common utility tab. Announcements is not a role.
  const roleIcons = { student:'graduation-cap', guide:'book-open', reviewer:'clipboard-check', coord:'network' };
  const roleButtons = views.map((view, index) =>
    `<button type="button" class="role-tab-btn${index === 0 ? ' active' : ''}" data-role-tab="${escapeHtml(view.key)}" onclick="showRoleTab('${escapeHtml(view.key)}')">${renderLucideIcon_(roleIcons[view.key])}${escapeHtml(view.label)}</button>`
  ).join('');
  const hasCoordinator = views.some(view => view.key === 'coord');
  const systemButton = hasCoordinator ? `<button type="button" class="role-tab-btn" data-role-tab="system-status" onclick="showRoleTab(&quot;system-status&quot;)">${renderLucideIcon_('activity')}System Status</button>` : '';
  const systemPanel = hasCoordinator ? `<section class="role-panel dashboard-body-surface" data-role-panel="system-status">${buildDashboardContainerHeader_('System Status', 'systemStatus')}<p id="systemStatusMessage" role="status" aria-live="polite"></p><div id="systemStatusContent">${getSkeletonMarkup_('panel', 'Loading system status')}</div></section>` : '';
  const announcementsButton = `<button type="button" class="role-tab-btn" data-role-tab="announcements" onclick="showRoleTab('announcements')">${renderLucideIcon_('megaphone')}Announcements</button>`;

  const rolePanels = views.map((view, index) =>
    `<section class="role-panel${index === 0 ? ' active' : ''}" data-role-panel="${escapeHtml(view.key)}"><div class="${view.key === 'student' ? '' : 'dashboard-body-surface'}" id="${escapeHtml(view.contentId)}" data-role-content="${escapeHtml(view.key)}">${getSkeletonMarkup_('panel', 'Loading ' + view.label)}</div></section>`
  ).join('');

  const announcementsPanel = `<section class="role-panel" data-role-panel="announcements"><div id="announcementsContent">${getSkeletonMarkup_('panel', 'Loading announcements')}</div></section>`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<base target="_top">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&family=Source+Serif+4:wght@400;500;600;700&family=Source+Sans+3:wght@400;500;600;700&display=swap" rel="stylesheet">
<style>
${getGuideStyles()}
${getCoordinatorStyles()}
${getStudentPageStyles()}
${getReviewerStyles()}
${getReview1EvaluationStyles_()}
${getSharedTimelineStyles_()}
${getLoadingStyles_()}
${getDashboardSurfaceStyles_()}
${getLucideStyles_()}
.dashboard-navigation { margin-bottom:20px; }
.role-tabs { display:flex; gap:8px; flex-wrap:wrap; }
.role-menu-toggle { display:none; }
.dashboard-navigation button:focus-visible { outline:3px solid #9e77ed; outline-offset:3px; }
@media(max-width:760px) {
  .dashboard-navigation { padding:8px; border:1px solid #e4e7ec; border-radius:14px; background:#fff; }
  .role-menu-toggle { display:flex; align-items:center; gap:10px; width:100%; min-height:44px; padding:10px 12px; border:0; border-radius:9px; background:#f8fafc; color:#182230; font:600 14px 'Inter','Segoe UI',sans-serif; cursor:pointer; text-align:left; }
  .role-menu-toggle .role-menu-label { flex:1; }
  .role-menu-toggle .role-menu-caption { color:#667085; font-size:12px; font-weight:400; }
  .dashboard-navigation .role-tabs { display:none; margin-top:8px; gap:4px; }
  .dashboard-navigation.menu-open .role-tabs { display:flex; flex-direction:column; }
  .dashboard-navigation .role-tab-btn { width:100%; min-height:44px; justify-content:flex-start; border-radius:9px; }
}
.role-tab-btn { display:inline-flex; align-items:center; justify-content:center; gap:8px; padding: 10px 20px; border-radius: 999px; font-size: 14px; font-weight: 600; border: 1px solid #dcdfe4; background: #fff; color: #6b7280; cursor: pointer; }
.role-tab-btn.active { background: #1f2430; color: #fff; border-color: #1f2430; }
@media(min-width:761px) {
  .dashboard-navigation { background:#fff; border:1px solid #e4e7ec; border-radius:12px; padding:0; }
  .dashboard-navigation .role-tabs { gap:0; flex-wrap:nowrap; overflow-x:auto; border-radius:11px; }
  .dashboard-navigation .role-tab-btn { flex:1 0 auto; min-height:48px; padding:12px 14px; border:0; border-radius:0; background:transparent; color:#667085; white-space:nowrap; }
  .dashboard-navigation .role-tab-btn:hover { background:#f8fafc; color:#344054; }
  .dashboard-navigation .role-tab-btn.active { background:#f5f3ff; color:#6941c6; box-shadow:inset 0 -3px #6941c6; }
  .dashboard-navigation .role-tab-btn:focus-visible { outline-offset:-3px; }
}
.role-panel { display: none; }
.role-panel.active { display: block; }
.role-load-error { margin:20px 0; padding:14px 16px; border:1px solid #fecaca; background:#fef2f2; color:#991b1b; border-radius:10px; }
.shared-rubrics { container:rubrics / inline-size; margin:0 0 20px; padding:20px 24px; border:1px solid #30324d; border-radius:16px; background:radial-gradient(ellipse at top right,rgba(139,92,246,.16),transparent 60%),#101523; color:#c5cee0; color-scheme:dark; box-shadow:0 8px 24px rgba(11,15,23,.14),inset 0 1px 0 rgba(255,255,255,.04); }
.shared-rubrics h2 { margin:0 0 12px; font-family:'Space Grotesk','Inter',sans-serif; font-size:16px; color:#f5f7fa; }
.rubric-assessments { display:grid; grid-template-columns:1fr; grid-auto-rows:1fr; gap:12px; }
.rubric-assessment { display:flex; flex-direction:column; align-items:stretch; justify-content:flex-start; min-width:0; gap:18px; padding:18px; border:1px solid #45526b; border-radius:10px; background:#1b2335; color:#c5cee0; font:inherit; text-align:left; cursor:pointer; overflow-wrap:anywhere; transition:background .18s ease,border-color .18s ease; }
.rubric-assessment strong { flex:1 1 100px; min-width:0; font-size:16px; line-height:1.4; color:#f5f7fa; }
.rubric-assessment:hover:enabled { border-color:#9e77ed; background:#302747; }
.rubric-assessment:disabled { cursor:default; color:#a8b3c7; background:#171e2c; opacity:1; }
.rubric-assessment:disabled strong { color:#bdc7da; }
.rubric-assessment span { font-size:14px; line-height:1.5; }
.rubric-assessment .rubric-weight { flex:0 0 auto; max-width:100%; box-sizing:border-box; padding:3px 9px; border:1px solid #705494; border-radius:6px; background:#332647; color:#e2d9ff; font-size:14px; font-weight:700; }
.rubric-assessment .rubric-header, .rubric-assessment .rubric-footer { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px 16px; width:100%; min-width:0; text-align:left; }
.rubric-assessment .rubric-footer { margin-top:auto; }
.rubric-assessment .rubric-metadata { color:#c5cee0; font-weight:400; }
.rubric-assessment .rubric-action { display:inline-flex; align-items:center; gap:6px; color:#e2d9ff; font-weight:600; }
.rubric-mobile-row { display:none; }
@container rubrics (width < 480px) {
  .rubric-assessments { gap:0; grid-auto-rows:auto; }
  .shared-rubrics .rubric-assessment { display:none; }
  .rubric-mobile-row { display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; min-height:64px; box-sizing:border-box; padding:8px 0; gap:2px 10px; }
  .rubric-mobile-row ~ .rubric-mobile-row { border-top:1px solid #354057; }
  .rubric-mobile-details { display:contents; }
  .rubric-mobile-title { display:contents; }
  .rubric-mobile-title strong { grid-column:1; grid-row:1; min-width:0; overflow-wrap:anywhere; font-size:14px; line-height:1.4; color:#f5f7fa; }
  .rubric-mobile-weight { grid-column:2; grid-row:1; justify-self:end; padding:2px 7px; border:1px solid #705494; border-radius:999px; background:#332647; color:#e2d9ff; font-size:12px; font-weight:700; line-height:1.4; white-space:nowrap; }
  .rubric-mobile-meta { grid-column:1; grid-row:2; color:#c5cee0; font-size:13px; line-height:1.5; overflow-wrap:anywhere; }
  .shared-rubrics .rubric-view-button { grid-column:2; grid-row:2; justify-self:end; position:relative; isolation:isolate; min-width:44px; min-height:44px; padding:6px 8px; border:0; border-radius:6px; background:transparent; color:#cbd5e1; font-family:inherit; font-size:12px; font-weight:600; line-height:1.4; white-space:nowrap; cursor:pointer; }
  .shared-rubrics .rubric-view-button::before { content:''; position:absolute; inset:6px 0; z-index:-1; border:1px solid #3b4556; border-radius:6px; background:#0b101a; }
  .shared-rubrics .rubric-view-button:hover:enabled { color:#f8fafc; }
  .shared-rubrics .rubric-view-button:hover:enabled::before { background:#1b2433; border-color:#64748b; }
  .shared-rubrics .rubric-view-button:focus-visible { outline:3px solid #cbd5e1; outline-offset:3px; }
  .shared-rubrics .rubric-view-button:disabled { opacity:.5; cursor:default; }
}
@container rubrics (min-width:480px) { .rubric-assessments { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@container rubrics (min-width:960px) { .rubric-assessments { grid-template-columns:repeat(4,minmax(0,1fr)); } }
.shared-rubrics-heading > button, #sharedRubricsContent > button { padding:8px 14px; border:1px solid #655192; border-radius:8px; background:#34274f; color:#e2d9ff; font:inherit; cursor:pointer; }
.shared-rubrics-heading > button:hover, #sharedRubricsContent > button:hover { background:#473568; }
.shared-rubrics-heading > button:focus-visible, #sharedRubricsContent > button:focus-visible { outline:3px solid #c4b5fd; outline-offset:3px; }
#sharedRubricsToggle[hidden], #sharedRubricsContent[hidden] { display:none; }
.shared-rubrics .app-skeleton { --skeleton-base:#242e42; --skeleton-highlight:#39425c; --skeleton-edge:#303b51; }
.rubric-assessment:focus-visible, #rubricDrawer button:focus-visible { outline:3px solid #9e77ed; outline-offset:3px; }
.rubric-levels { margin:12px 0 0; }
.rubric-levels dt { margin-top:10px; font-size:12px; font-weight:600; color:#344054; }
.rubric-levels dd { margin:4px 0 0; color:#667085; font-size:13px; line-height:1.6; white-space:pre-wrap; overflow-wrap:anywhere; }
#rubricDrawer .drawer-project-title { white-space:pre-wrap; overflow-wrap:anywhere; }
@media(max-width:600px) { .shared-rubrics { padding:16px; } }
${getEditorialStyles_()}
</style>
</head>
<body data-dashboard-theme="${views[0].key === 'student' ? 'student' : 'editorial'}">
${multiRole ? '<h1>Dashboard</h1>' : ''}
<p class="signed-in-as">Signed in as ${escapeHtml(email)}</p>
<nav class="dashboard-navigation" id="dashboardNavigation" aria-label="Dashboard sections">
<button type="button" class="role-menu-toggle" id="roleMenuToggle" aria-expanded="false" aria-controls="roleMenuItems" onclick="DashboardUI.toggleRoleMenu()"><span id="roleMenuIcon">${renderLucideIcon_('menu')}</span><span class="role-menu-label" id="roleMenuLabel">${escapeHtml(views[0].label)}</span><span class="role-menu-caption">Menu</span></button>
<div class="role-tabs" id="roleMenuItems">${roleButtons}${announcementsButton}${systemButton}</div>
</nav>
<section id="sharedProjectTimeline" class="shared-timeline" aria-label="Project timeline" aria-busy="true"><div class="timeline-heading"><h2>Project timeline</h2></div>${getSkeletonMarkup_('timeline', 'Loading project timeline')}</section>
<section id="sharedRubrics" class="shared-rubrics" aria-labelledby="sharedRubricsHeading" aria-busy="true"><div class="shared-rubrics-heading"><h2 id="sharedRubricsHeading">Assessment rubrics</h2><button type="button" id="sharedRubricsToggle" aria-expanded="${!rubricsCollapsible}" aria-label="${rubricsCollapsible ? 'Expand' : 'Collapse'} assessment rubrics" aria-controls="sharedRubricsContent" onclick="DashboardUI.toggleSharedRubrics()"${rubricsCollapsible ? '' : ' hidden'}>${renderLucideIcon_('chevron-down')}</button></div><div id="sharedRubricsContent"${rubricsCollapsible ? ' hidden' : ''}>${getSkeletonMarkup_('panel', 'Loading assessment rubrics')}</div></section>
${rolePanels}
${announcementsPanel}
${systemPanel}
<div id="rubricDrawerBackdrop" class="team-drawer-backdrop" onclick="DashboardUI.closeRubricDrawer()" aria-hidden="true"></div>
<aside id="rubricDrawer" class="team-drawer" role="dialog" aria-modal="true" aria-labelledby="rubricDrawerTitle" aria-hidden="true" inert>
  <div class="team-drawer-header"><div><div class="team-drawer-eyebrow">ASSESSMENT RUBRIC</div><h2 id="rubricDrawerTitle" class="team-drawer-title"></h2></div>
  <button type="button" id="rubricDrawerClose" class="team-drawer-close" aria-label="Close rubric details" onclick="DashboardUI.closeRubricDrawer()">${renderLucideIcon_('x')}</button></div>
  <div id="rubricDrawerContent" class="team-drawer-content"></div>
</aside>
<script>
${getDashboardClientScript()}
${getGuideEvaluationClientScript()}
${getReviewerMarkingScript_()}
${getReview1EvaluationClientScript_()}
</script>
</body>
</html>`;
}

/** Lightweight, serializable schedule data; never return user records or Date objects. */
function loadSharedProjectTimeline() {
  return withDashboardRead_(() => {
    const email = Session.getActiveUser().getEmail();
    if (!email || !getDashboardRoleViews_(email).length) throw new Error('Dashboard access is required.');
    return getSharedProjectTimelineData_();
  });
}

function getSharedProjectTimelineData_() {
  const schedule = getProjectSchedule_();
  const clock = getProjectClock_(schedule);
  const definitions = [...schedule.milestones.filter(item=>item.gradedBy!=='SEE Committee'), {key:'week1',label:'Weekly logging starts',day:schedule.week1}];
  return {
    schedule, today:clock.today, todayLabel:formatProjectDay_(clock.today),
    week:clock.week, active:clock.active, totalWeeks:Math.ceil((schedule.end - schedule.week1 + 1) / 7),
    milestones:definitions.map(({key,label,day}) => ({key,label,day,date:formatProjectDay_(day)})).sort((a,b) => a.day - b.day)
  };
}
