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

  // Reviewer role: inspect committee membership only; do not build reviewer data.
  const reviewerCommittees = getCommitteeNumbersForReviewer(email);
  if (reviewerCommittees.length > 0) {
    const committeeSet = new Set(reviewerCommittees.map(normalizeText_));
    if (statusRows.some(r => committeeSet.has(normalizeText_(r[TS.COMMITTEE_NUMBER])))) {
      views.push({ key: 'reviewer', label: 'Reviewer', contentId: 'reviewerContent' });
    }
  }

  if (statusRows.some(r => emailsMatch(r[TS.GUIDE_EMAIL], email))) {
    views.push({ key: 'guide', label: 'My Teams (Guide)', contentId: 'guideContent' });
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
<link href="https://fonts.googleapis.com/css2?family=Space+Grotesk:wght@600;700&family=Inter:wght@400;500;600&family=JetBrains+Mono:wght@400;500&display=swap" rel="stylesheet">
<style>
${getGuideStyles()}
${getCoordinatorStyles()}
${getStudentPageStyles()}
${getReviewerStyles()}
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
  .dashboard-navigation { background:#fff; border:1px solid #e4e7ec; border-radius:12px; padding:0 4px; }
  .dashboard-navigation .role-tabs { gap:0; flex-wrap:nowrap; overflow-x:auto; }
  .dashboard-navigation .role-tab-btn { flex:1 0 auto; min-height:48px; padding:12px 14px; border:0; border-radius:0; background:transparent; color:#667085; white-space:nowrap; }
  .dashboard-navigation .role-tab-btn:hover { background:#f8fafc; color:#344054; }
  .dashboard-navigation .role-tab-btn.active { background:#f5f3ff; color:#6941c6; box-shadow:inset 0 -3px #6941c6; }
  .dashboard-navigation .role-tab-btn:focus-visible { outline-offset:-3px; }
}
.role-panel { display: none; }
.role-panel.active { display: block; }
.role-load-error { margin:20px 0; padding:14px 16px; border:1px solid #fecaca; background:#fef2f2; color:#991b1b; border-radius:10px; }
</style>
</head>
<body>
${multiRole ? '<h1>Dashboard</h1>' : ''}
<p class="signed-in-as">Signed in as ${escapeHtml(email)}</p>
<nav class="dashboard-navigation" id="dashboardNavigation" aria-label="Dashboard sections">
<button type="button" class="role-menu-toggle" id="roleMenuToggle" aria-expanded="false" aria-controls="roleMenuItems" onclick="DashboardUI.toggleRoleMenu()"><span id="roleMenuIcon">${renderLucideIcon_('menu')}</span><span class="role-menu-label" id="roleMenuLabel">${escapeHtml(views[0].label)}</span><span class="role-menu-caption">Menu</span></button>
<div class="role-tabs" id="roleMenuItems">${roleButtons}${announcementsButton}${systemButton}</div>
</nav>
<section id="sharedProjectTimeline" class="shared-timeline" aria-label="Project timeline" aria-busy="true"><div class="timeline-heading"><h2>Project timeline</h2></div>${getSkeletonMarkup_('timeline', 'Loading project timeline')}</section>
${rolePanels}
${announcementsPanel}
${systemPanel}
<script>
${getDashboardClientScript()}
${getGuideEvaluationClientScript()}
${getReviewerMarkingScript_()}
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
