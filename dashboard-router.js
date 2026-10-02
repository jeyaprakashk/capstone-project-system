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

  // Role tabs are followed by one common utility tab. Announcements is not a role.
  const roleIcons = { student:'graduation-cap', guide:'book-open', reviewer:'clipboard-check', coord:'network' };
  const roleButtons = views.map((view, index) =>
    `<button type="button" class="role-tab-btn tab${index === 0 ? ' active' : ''}" role="tab" id="roleTab-${escapeHtml(view.key)}" aria-controls="rolePanel-${escapeHtml(view.key)}" aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}" data-role-tab="${escapeHtml(view.key)}" onclick="showRoleTab('${escapeHtml(view.key)}')">${renderLucideIcon_(roleIcons[view.key])}${escapeHtml(view.label)}</button>`
  ).join('');
  const rubricsButton = `<button type="button" class="role-tab-btn tab" role="tab" id="roleTab-rubrics" aria-controls="rolePanel-rubrics" aria-selected="false" tabindex="-1" data-role-tab="rubrics" onclick="showRoleTab('rubrics')">${renderLucideIcon_('book-open')}Timeline &amp; Rubrics</button>`;
  const hasCoordinator = views.some(view => view.key === 'coord');
  const systemButton = hasCoordinator ? `<button type="button" class="role-tab-btn tab" role="tab" id="roleTab-system-status" aria-controls="rolePanel-system-status" aria-selected="false" tabindex="-1" data-role-tab="system-status" onclick="showRoleTab(&quot;system-status&quot;)">${renderLucideIcon_('activity')}System Status</button>` : '';
  const systemPanel = hasCoordinator ? `<section class="role-panel tabpanel dashboard-body-surface utility-body" id="rolePanel-system-status" role="tabpanel" aria-labelledby="roleTab-system-status" data-role-panel="system-status" hidden>${buildDashboardContainerHeader_('System Status', 'systemStatus')}<p id="systemStatusMessage" role="status" aria-live="polite"></p><div id="systemStatusContent">${getSkeletonMarkup_('panel', 'Loading system status')}</div></section>` : '';
  const announcementsButton = `<button type="button" class="role-tab-btn tab" role="tab" id="roleTab-announcements" aria-controls="rolePanel-announcements" aria-selected="false" tabindex="-1" data-role-tab="announcements" onclick="showRoleTab('announcements')">${renderLucideIcon_('megaphone')}Announcements</button>`;

  const rolePanels = views.map((view, index) =>
    `<section class="role-panel tabpanel${index === 0 ? ' active' : ''}" id="rolePanel-${escapeHtml(view.key)}" role="tabpanel" aria-labelledby="roleTab-${escapeHtml(view.key)}" data-role-panel="${escapeHtml(view.key)}"${index === 0 ? '' : ' hidden'}><div class="${view.key === 'student' ? '' : 'dashboard-body-surface'}" id="${escapeHtml(view.contentId)}" data-role-content="${escapeHtml(view.key)}">${getSkeletonMarkup_('panel', 'Loading ' + view.label)}</div></section>`
  ).join('');

  const announcementsPanel = `<section class="role-panel tabpanel" id="rolePanel-announcements" role="tabpanel" aria-labelledby="roleTab-announcements" data-role-panel="announcements" hidden><div id="announcementsContent">${getSkeletonMarkup_('panel', 'Loading announcements')}</div></section>`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<base target="_top">
<style>
${getGuideStyles()}
${getCoordinatorStyles()}
${getWorkflowStyles_()}
${getReviewerStyles()}
${getReviewEvaluationStyles_()}
${getSharedTimelineStyles_()}
${getLoadingStyles_()}
${getDashboardSurfaceStyles_()}
${getLucideStyles_()}
.dashboard-navigation { margin-bottom:var(--space-5); }
.role-tabs { display:flex; gap:var(--space-2); flex-wrap:wrap; }
.role-menu-toggle { display:none; }
.dashboard-navigation button:focus-visible { outline:3px solid var(--primary); outline-offset:3px; }
@media(max-width:1200px) {
  .dashboard-navigation { padding:var(--space-2); border:1px solid var(--border); border-radius:var(--radius-card); background:var(--paper); }
  .role-menu-toggle { display:flex; align-items:center; gap:10px; width:100%; min-height:44px; cursor:pointer; text-align:left; }
  .role-menu-toggle .role-menu-label { flex:1; }
  .role-menu-toggle .role-menu-caption { color:var(--primary); font-size:var(--fs-meta); font-weight:var(--fw-regular); }
  .dashboard-navigation .role-tabs { display:none; margin-top:var(--space-2); gap:var(--space-1); }
  .dashboard-navigation.menu-open .role-tabs { display:flex; flex-direction:column; }
  .dashboard-navigation .role-tab-btn { width:100%; min-height:44px; justify-content:flex-start; }
}
.role-tab-btn { display:inline-flex; align-items:center; justify-content:center; gap:var(--space-2); cursor: pointer; }
@media(min-width:1201px) {
  .dashboard-navigation { background:var(--paper); border:1px solid var(--border); border-radius:var(--radius-card); padding:0; }
  .dashboard-navigation .role-tabs { gap:0; flex-wrap:wrap; border-radius:var(--radius-card); }
  .dashboard-navigation .role-tab-btn { flex:1 0 auto; min-height:48px; white-space:nowrap; }
  .dashboard-navigation .role-tab-btn:focus-visible { outline-offset:-3px; }
}
.role-panel { display: none; }
.role-panel.active { display: block; }
.role-load-error { margin:var(--space-5) 0; padding:14px var(--space-4); border:1px solid var(--danger-tint); background:var(--canvas); color:var(--danger); border-radius:var(--radius-btn); }
.shared-rubrics { container:rubrics / inline-size; margin:0 0 var(--space-5); padding:var(--space-5) var(--space-6); border:1px solid var(--border); border-radius:var(--radius-card); background:var(--paper); color:var(--text); box-shadow:var(--shadow-card); }
.shared-rubrics h2 { margin:0 0 var(--space-3); font-family:var(--font); font-size:var(--fs-h2); color:var(--text); }
.rubric-assessments { display:grid; grid-template-columns:1fr; grid-auto-rows:1fr; gap:var(--space-3); }
.rubric-assessment { display:flex; flex-direction:column; align-items:stretch; justify-content:flex-start; min-width:0; gap:var(--space-4); text-align:left; cursor:pointer; overflow-wrap:anywhere; }
.rubric-assessment strong { flex:1 1 100px; min-width:0; font-size:var(--fs-h3); line-height:var(--lh-heading); color:var(--text); }
.rubric-assessment span { font-size:var(--fs-body); line-height:var(--lh-body); }
.rubric-assessment .rubric-weight { flex:0 0 auto; max-width:100%; box-sizing:border-box; padding:3px 9px; border:1px solid var(--border); border-radius:var(--radius-badge); background:var(--tint); color:var(--primary); font-size:var(--fs-body); font-weight:var(--fw-bold); }
.rubric-assessment .rubric-header, .rubric-assessment .rubric-footer { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px var(--space-4); width:100%; min-width:0; text-align:left; }
.rubric-assessment .rubric-footer { margin-top:auto; }
.rubric-assessment .rubric-metadata { color:var(--muted); font-weight:var(--fw-regular); }
.rubric-assessment .rubric-action { display:inline-flex; align-items:center; gap:6px; color:var(--primary); font-weight:var(--fw-semibold); }
.rubric-mobile-row { display:none; }
@container rubrics (width < 480px) {
  .rubric-assessments { gap:0; grid-auto-rows:auto; }
  .shared-rubrics .rubric-assessment { display:none; }
  .rubric-mobile-row { display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; min-height:64px; box-sizing:border-box; padding:var(--space-2) 0; gap:2px 10px; }
  .rubric-mobile-row ~ .rubric-mobile-row { border-top:1px solid var(--primary-hover); }
  .rubric-mobile-details { display:contents; }
  .rubric-mobile-title { display:contents; }
  .rubric-mobile-title strong { grid-column:1; grid-row:1; min-width:0; overflow-wrap:anywhere; font-size:var(--fs-body); line-height:var(--lh-heading); color:var(--text); }
  .rubric-mobile-weight { grid-column:2; grid-row:1; justify-self:end; padding:2px 7px; border:1px solid var(--border); border-radius:var(--radius-badge); background:var(--tint); color:var(--primary); font-size:var(--fs-meta); font-weight:var(--fw-bold); line-height:var(--lh-heading); white-space:nowrap; }
  .rubric-mobile-meta { grid-column:1; grid-row:2; color:var(--muted); font-size:var(--fs-meta); line-height:var(--lh-body); overflow-wrap:anywhere; }
  .shared-rubrics .rubric-view-button { grid-column:2; grid-row:2; justify-self:end; position:relative; isolation:isolate; min-width:44px; min-height:44px; line-height:var(--lh-heading); white-space:nowrap; cursor:pointer; }
  .shared-rubrics .rubric-view-button:focus-visible { outline:3px solid var(--border); outline-offset:3px; }
}
@container rubrics (min-width:480px) { .rubric-assessments { grid-template-columns:repeat(2,minmax(0,1fr)); } }
@container rubrics (min-width:960px) { .rubric-assessments { grid-template-columns:repeat(4,minmax(0,1fr)); } }
.shared-rubrics-heading > button, #sharedRubricsContent > button { cursor:pointer; }
.shared-rubrics-heading > button:focus-visible, #sharedRubricsContent > button:focus-visible { outline:3px solid var(--tint); outline-offset:3px; }
#sharedRubrics[hidden] { display:none; }
.rubric-assessment:focus-visible, #rubricDrawer button:focus-visible { outline:3px solid var(--primary); outline-offset:3px; }
.rubric-levels { margin:var(--space-3) 0 0; }
.rubric-levels dt { margin-top:10px; font-size:var(--fs-meta); font-weight:var(--fw-semibold); color:var(--primary-hover); }
.rubric-levels dd { margin:var(--space-1) 0 0; color:var(--primary); font-size:var(--fs-body); line-height:var(--lh-body); white-space:pre-wrap; overflow-wrap:anywhere; }
#rubricDrawer .drawer-project-title { white-space:pre-wrap; overflow-wrap:anywhere; }
@media(max-width:600px) { .shared-rubrics { padding:var(--space-4); } }
${getEditorialStyles_()}
</style>
${HtmlService.createHtmlOutputFromFile('app-styles').getContent()}
</head>
<body data-dashboard-theme="editorial">
<header class="dashboard-app-header">
<h1>Dashboard</h1>
<p class="signed-in-as">Signed in as ${escapeHtml(email)}</p>
<nav class="dashboard-navigation" id="dashboardNavigation" aria-label="Dashboard sections">
<button type="button" class="role-menu-toggle btn btn-outline" id="roleMenuToggle" aria-expanded="false" aria-controls="roleMenuItems" onclick="DashboardUI.toggleRoleMenu()"><span id="roleMenuIcon">${renderLucideIcon_('menu')}</span><span class="role-menu-label" id="roleMenuLabel">${escapeHtml(views[0].label)}</span><span class="role-menu-caption">Menu</span></button>
<div class="role-tabs tabs" id="roleMenuItems" role="tablist" aria-label="Dashboard sections">${roleButtons}${rubricsButton}${announcementsButton}${systemButton}</div>
</nav>
</header>
<section class="role-panel tabpanel" id="rolePanel-rubrics" role="tabpanel" aria-labelledby="roleTab-rubrics" data-role-panel="rubrics" hidden>
<section id="sharedProjectTimeline" hidden class="shared-timeline" aria-label="Project timeline" aria-busy="true"><div class="timeline-heading"><h2>Project timeline</h2></div>${getSkeletonMarkup_('timeline', 'Loading project timeline')}</section>
<section id="sharedRubrics" hidden class="shared-rubrics utility-body card" aria-labelledby="sharedRubricsHeading" aria-busy="true"><div class="shared-rubrics-heading utility-header"><h2 id="sharedRubricsHeading">Rubrics &amp; Guidelines</h2></div><div id="sharedRubricsContent">${getSkeletonMarkup_('panel', 'Loading assessment rubrics')}</div></section>
</section>
${rolePanels}
${announcementsPanel}
${systemPanel}
<div id="rubricDrawerBackdrop" class="team-drawer-backdrop drawer-scrim" hidden aria-hidden="true"></div>
<aside id="rubricDrawer" class="team-drawer drawer" data-tooltip-boundary role="dialog" aria-modal="true" aria-labelledby="rubricDrawerTitle" aria-hidden="true" inert hidden>
  <div class="team-drawer-header drawer-header"><div><div class="team-drawer-eyebrow">ASSESSMENT RUBRIC</div><h2 id="rubricDrawerTitle" class="team-drawer-title"></h2></div>
  <button type="button" id="rubricDrawerClose" data-drawer-close class="team-drawer-close btn btn-sm btn-outline" aria-label="Close rubric details" onclick="DashboardUI.closeRubricDrawer()">${renderLucideIcon_('x')}</button></div>
  <div id="rubricDrawerContent" class="team-drawer-content drawer-body" data-drawer-content></div>
  <div class="drawer-footer" hidden></div>
</aside>
<script>
${getDashboardClientScript()}
${getInternalAssessmentPublishingClientScript_()}
${getGuideEvaluationClientScript()}
${getGuideWeeklyClientScript_()}
${getReviewEvaluationClientScript_()}
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
  const windows = getWeeklySubmissionWindows_();
  const current = windows.find(w=>clock.now.getTime() >= w.opens_at && clock.now.getTime() <= w.deadline_at);
  const definitions = [...composeProjectTimeline_(schedule.milestones,schedule.assessments), {key:'week1',label:'Weekly logging starts',day:projectDay_(new Date(windows[0].opens_at),schedule.timezone)}];
  return {
    schedule, today:clock.today, todayLabel:formatProjectDay_(clock.today),
    week:current ? current.weekId : null, active:!!current, totalWeeks:windows.length,
    milestones:definitions.map(({key,label,day,opens,sequence}) => ({key,label,day,opens,sequence,date:formatProjectDay_(day),openingDate:Number.isFinite(opens)?formatProjectDay_(opens):null})).sort((a,b) => a.day - b.day)
  };
}
