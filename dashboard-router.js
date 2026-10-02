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
  // The student role loads as a DTO through API_student_getDashboard (student-api.js).
  if (key === 'student') throw new Error('The student dashboard loads through its data endpoint.');

  // The reviewer role loads as a DTO through API_reviewer_getDashboard (reviewer-api.js).
  if (key === 'reviewer') throw new Error('The reviewer dashboard loads through its data endpoint.');

  // The guide role loads as a DTO through API_guide_getDashboard (guide-api.js).
  if (key === 'guide') throw new Error('The guide dashboard loads through its data endpoint.');

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
    `<button type="button" class="tab${index === 0 ? ' active' : ''}" role="tab" id="roleTab-${escapeHtml(view.key)}" aria-controls="rolePanel-${escapeHtml(view.key)}" aria-selected="${index === 0}" tabindex="${index === 0 ? 0 : -1}" data-role-tab="${escapeHtml(view.key)}" onclick="showRoleTab('${escapeHtml(view.key)}')">${renderLucideIcon_(roleIcons[view.key])}${escapeHtml(view.label)}</button>`
  ).join('');
  const rubricsButton = `<button type="button" class="tab" role="tab" id="roleTab-rubrics" aria-controls="rolePanel-rubrics" aria-selected="false" tabindex="-1" data-role-tab="rubrics" onclick="showRoleTab('rubrics')">${renderLucideIcon_('book-open')}Timeline &amp; Rubrics</button>`;
  const hasCoordinator = views.some(view => view.key === 'coord');
  const systemButton = hasCoordinator ? `<button type="button" class="tab" role="tab" id="roleTab-system-status" aria-controls="rolePanel-system-status" aria-selected="false" tabindex="-1" data-role-tab="system-status" onclick="showRoleTab(&quot;system-status&quot;)">${renderLucideIcon_('activity')}System Status</button>` : '';
  const systemPanel = hasCoordinator ? `<section class="role-panel tabpanel" id="rolePanel-system-status" role="tabpanel" aria-labelledby="roleTab-system-status" data-role-panel="system-status" hidden>${buildDashboardContainerHeader_('System Status', 'systemStatus')}<p id="systemStatusMessage" role="status" aria-live="polite"></p><div id="systemStatusContent">${getSkeletonMarkup_('panel', 'Loading system status')}</div></section>` : '';
  const announcementsButton = `<button type="button" class="tab" role="tab" id="roleTab-announcements" aria-controls="rolePanel-announcements" aria-selected="false" tabindex="-1" data-role-tab="announcements" onclick="showRoleTab('announcements')">${renderLucideIcon_('megaphone')}Announcements</button>`;

  const rolePanels = views.map((view, index) =>
    `<section class="role-panel tabpanel${index === 0 ? ' active' : ''}" id="rolePanel-${escapeHtml(view.key)}" role="tabpanel" aria-labelledby="roleTab-${escapeHtml(view.key)}" data-role-panel="${escapeHtml(view.key)}"${index === 0 ? '' : ' hidden'}><div id="${escapeHtml(view.contentId)}" data-role-content="${escapeHtml(view.key)}">${getSkeletonMarkup_('panel', 'Loading ' + view.label)}</div></section>`
  ).join('');

  const announcementsPanel = `<section class="role-panel tabpanel" id="rolePanel-announcements" role="tabpanel" aria-labelledby="roleTab-announcements" data-role-panel="announcements" hidden><div id="announcementsContent">${getSkeletonMarkup_('panel', 'Loading announcements')}</div></section>`;

  return `<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<base target="_top">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Source+Sans+3:wght@400;600;700&display=swap">
${HtmlService.createHtmlOutputFromFile('tailwind-styles').getContent()}
</head>
<body>
<header>
<h1>Dashboard</h1>
<p>Signed in as ${escapeHtml(email)}</p>
<nav class="dashboard-navigation" id="dashboardNavigation" aria-label="Dashboard sections">
<button type="button" class="role-menu-toggle btn btn-outline" id="roleMenuToggle" aria-expanded="false" aria-controls="roleMenuItems" onclick="DashboardUI.toggleRoleMenu()"><span id="roleMenuIcon">${renderLucideIcon_('menu')}</span><span id="roleMenuLabel">${escapeHtml(views[0].label)}</span><span>Menu</span></button>
<div class="role-tabs tabs" id="roleMenuItems" role="tablist" aria-label="Dashboard sections">${roleButtons}${rubricsButton}${announcementsButton}${systemButton}</div>
</nav>
</header>
<section class="role-panel tabpanel" id="rolePanel-rubrics" role="tabpanel" aria-labelledby="roleTab-rubrics" data-role-panel="rubrics" hidden>
<section id="sharedProjectTimeline" hidden aria-label="Project timeline" aria-busy="true"><div><h2>Project timeline</h2></div>${getSkeletonMarkup_('timeline', 'Loading project timeline')}</section>
<section id="sharedRubrics" hidden class="shared-rubrics card" aria-labelledby="sharedRubricsHeading" aria-busy="true"><div><h2 id="sharedRubricsHeading">Rubrics &amp; Guidelines</h2></div><div id="sharedRubricsContent">${getSkeletonMarkup_('panel', 'Loading assessment rubrics')}</div></section>
</section>
${rolePanels}
${announcementsPanel}
${systemPanel}
<div id="rubricDrawerBackdrop" class="team-drawer-backdrop drawer-scrim" hidden aria-hidden="true"></div>
<aside id="rubricDrawer" class="drawer" data-tooltip-boundary role="dialog" aria-modal="true" aria-labelledby="rubricDrawerTitle" aria-hidden="true" inert hidden>
  <div class="drawer-header"><div><div>ASSESSMENT RUBRIC</div><h2 id="rubricDrawerTitle"></h2></div>
  <button type="button" id="rubricDrawerClose" data-drawer-close class="btn btn-sm btn-outline" aria-label="Close rubric details" onclick="DashboardUI.closeRubricDrawer()">${renderLucideIcon_('x')}</button></div>
  <div id="rubricDrawerContent" class="team-drawer-content drawer-body" data-drawer-content></div>
  <div class="drawer-footer" hidden></div>
</aside>
<script>
${getMigratedViewsClientScript_()}
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
