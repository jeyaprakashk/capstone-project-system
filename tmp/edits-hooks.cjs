// Move every JavaScript element lookup and state read off CSS class names onto ids, data-* and aria-* attributes.
const e = (file, find, replace) => ({ file, find, replace });
const D = 'dashboard-client-scripts.js', H = 'common-helpers.js', C = 'coordinator-dashboard.js', R = 'dashboard-router.js',
  V = 'review-evaluation-client.js', G = 'guide-weekly-client.js', I = 'icon-renderer.js', P = 'internal-assessment-publishing-client.js',
  W = 'reviewer-dashboard.js', S = 'student-dashboard.js', CS = 'common-styles.js';
module.exports = [
  // Dialog overlay
  e(D, `overlay.className='overlay';`, `overlay.className='overlay';overlay.setAttribute('data-dialog-overlay','');`),
  e(D, `focused.closest('.overlay')`, `focused.closest('[data-dialog-overlay]')`),

  // Project timeline
  e(D, `class="timeline-toggle btn btn-sm btn-outline" aria-expanded`, `class="timeline-toggle btn btn-sm btn-outline" data-timeline-toggle aria-expanded`),
  e(D, `class="timeline-track" style=`, `class="timeline-track" data-timeline-track style=`),
  e(D, `return '<li class="timeline-stop timeline-'`, `return '<li data-timeline-stop class="timeline-stop timeline-'`),
  e(D, `class="timeline-retry btn btn-sm btn-outline">Retry`, `class="timeline-retry btn btn-sm btn-outline" data-timeline-retry>Retry`),
  e(D, `target.querySelector('.timeline-toggle')`, `target.querySelector('[data-timeline-toggle]')`),
  e(D, `target.querySelector('.timeline-track').classList`, `target.querySelector('[data-timeline-track]').classList`),
  e(D, `target.querySelectorAll('.timeline-stop')`, `target.querySelectorAll('[data-timeline-stop]')`),
  e(D, `target.querySelector('.timeline-retry')`, `target.querySelector('[data-timeline-retry]')`),

  // Shared drawers: open state and close button
  e(D, `    drawer.classList.add('open');
    drawer.setAttribute('aria-hidden', 'false');`, `    drawer.classList.add('open');
    drawer.dataset.open = 'true';
    drawer.setAttribute('aria-hidden', 'false');`),
  e(D, `if (!drawer || !drawer.classList.contains('open')) return;`, `if (!drawer || drawer.dataset.open !== 'true') return;`),
  e(D, `    drawer.classList.remove('open');
    drawer.setAttribute('aria-hidden', 'true');`, `    drawer.classList.remove('open');
    delete drawer.dataset.open;
    drawer.setAttribute('aria-hidden', 'true');`),
  e(D, `request === coordinatorDrawerRequest && drawer.classList.contains('open')`, `request === coordinatorDrawerRequest && drawer.dataset.open === 'true'`),
  e(D, `(drawer.querySelector && drawer.querySelector('.drawer-header button, .team-drawer-close'))`, `(drawer.querySelector && drawer.querySelector('[data-drawer-close]'))`),
  e(D, `(state.drawer.querySelector && state.drawer.querySelector('.drawer-header button, .team-drawer-close'))`, `(state.drawer.querySelector && state.drawer.querySelector('[data-drawer-close]'))`),
  e(C, `class="team-drawer-close btn btn-sm btn-outline"`, `class="team-drawer-close btn btn-sm btn-outline" data-drawer-close`),
  e(R, `id="rubricDrawerClose" class="team-drawer-close`, `id="rubricDrawerClose" data-drawer-close class="team-drawer-close`),
  e(V, `class="team-drawer-close btn btn-sm btn-outline" data-close`, `class="team-drawer-close btn btn-sm btn-outline" data-close data-drawer-close`),

  // Drawer content regions
  e(C, `class="team-drawer-content drawer-body">`, `class="team-drawer-content drawer-body" data-drawer-content>`),
  e(R, `<div id="rubricDrawerContent" class="team-drawer-content drawer-body">`, `<div id="rubricDrawerContent" class="team-drawer-content drawer-body" data-drawer-content>`),
  e(V, `'<div class="team-drawer-content">'`, `'<div class="team-drawer-content" data-drawer-content>'`),
  e(V, `const content=drawer.querySelector('.team-drawer-content');`, `const content=drawer.querySelector('[data-drawer-content]');`),
  e(V, `DashboardUI.beginContentLoading(drawer.querySelector('.team-drawer-content'),`, `DashboardUI.beginContentLoading(drawer.querySelector('[data-drawer-content]'),`),

  // Announcements
  e(H, `class="announcement-refresh-btn tab-refresh-btn btn btn-sm btn-outline" id=`, `class="announcement-refresh-btn tab-refresh-btn btn btn-sm btn-outline" data-refresh-button id=`),
  e(H, `class="announcement-status" role="status"`, `class="announcement-status" data-refresh-status role="status"`),
  e(H, `class="announcement-item card" data-announcement-type`, `class="announcement-item card" data-announcement-item data-announcement-type`),
  e(H, `<section class="announcement-date-group">`, `<section class="announcement-date-group" data-announcement-group>`),
  e(H, `<p class="announcement-results" role="status"`, `<p class="announcement-results" data-announcement-results role="status"`),
  e(H, `<div class="announcement-no-results announcement-empty-state card" hidden>`, `<div class="announcement-no-results announcement-empty-state card" data-announcement-no-results hidden>`),
  e(D, `class="announcement-refresh-btn btn btn-sm btn-outline" onclick=`, `class="announcement-refresh-btn btn btn-sm btn-outline" data-refresh-button onclick=`),
  e(D, `target.querySelectorAll('.announcement-list .announcement-item')`, `target.querySelectorAll('#announcementList [data-announcement-item]')`),
  e(D, `target.querySelectorAll('.announcement-date-group')`, `target.querySelectorAll('[data-announcement-group]')`),
  e(D, `group.querySelectorAll('.announcement-item')`, `group.querySelectorAll('[data-announcement-item]')`),
  e(D, `target.querySelector('.announcement-results')`, `target.querySelector('[data-announcement-results]')`),
  e(D, `target.querySelector('.announcement-no-results')`, `target.querySelector('[data-announcement-no-results]')`),
  e(D, `const refreshButton = target.querySelector('.announcement-refresh-btn');
    const status = target.querySelector('.announcement-status');`, `const refreshButton = target.querySelector('[data-refresh-button]');
    const status = target.querySelector('[data-refresh-status]');`),
  e(D, `const updatedButton = target.querySelector('.announcement-refresh-btn');`, `const updatedButton = target.querySelector('[data-refresh-button]');`),

  // System status cards
  e(C, `<div class="coordinator-container system-status-cards">
      <div class="system-status-primary">`, `<div class="coordinator-container system-status-cards" data-status-cards>
      <div class="system-status-primary" data-status-primary>`),
  e(D, `target.querySelectorAll('.system-status-primary > *, .coordinator-container > .assessment-section')`, `target.querySelectorAll('[data-status-primary] > *, [data-status-cards] > section')`),

  // Role tabs and panels
  e(D, `nav.querySelector('.role-tab-btn.active')`, `nav.querySelector('[data-role-tab][aria-selected="true"]')`),
  e(D, `document.querySelector('[data-role-panel].active')`, `document.querySelector('[data-role-panel]:not([hidden])')`),

  // Loading skeletons (same elements that carried .skeleton)
  e(CS, `const line = '<span class="app-skeleton-bar skeleton skeleton-text" aria-hidden="true"></span>';`, `const line = '<span class="app-skeleton-bar skeleton skeleton-text" data-skeleton aria-hidden="true"></span>';`),
  e(CS, `const shortLine = '<span class="app-skeleton-bar skeleton skeleton-text skeleton-text--short" aria-hidden="true"></span>';`, `const shortLine = '<span class="app-skeleton-bar skeleton skeleton-text skeleton-text--short" data-skeleton aria-hidden="true"></span>';`),
  e(CS, `'<span class="app-skeleton-title"><span class="app-skeleton-bar skeleton skeleton-title" aria-hidden="true"></span></span>'`, `'<span class="app-skeleton-title"><span class="app-skeleton-bar skeleton skeleton-title" data-skeleton aria-hidden="true"></span></span>'`),
  e(D, `cell.querySelector('.skeleton, [aria-label^="Loading"]`, `cell.querySelector('[data-skeleton], [aria-label^="Loading"]`),

  // Team tracker filters: state moves to aria-pressed; .active stays for styling only
  e(C, `<div class="tracker-tabs">`, `<div class="tracker-tabs" data-tracker-filters>`),
  e(C, `<button class="filter-tab active" data-filter="all"`, `<button class="filter-tab active" data-filter="all" aria-pressed="true"`),
  e(C, `<button class="filter-tab" data-filter="attention"`, `<button class="filter-tab" data-filter="attention" aria-pressed="false"`),
  e(C, `<button class="filter-tab" data-filter="ontrack"`, `<button class="filter-tab" data-filter="ontrack" aria-pressed="false"`),
  e(C, `data-filter="deadline:\${escapeHtml(pill.key)}"`, `data-filter="deadline:\${escapeHtml(pill.key)}" aria-pressed="false"`),
  e(D, `const activeTab = document.querySelector('.tracker-tabs .filter-tab.active');`, `const activeTab = document.querySelector('[data-tracker-filters] [data-filter][aria-pressed="true"]');`),
  e(D, `const selected = document.querySelector('.tracker-tabs .filter-tab.active');`, `const selected = document.querySelector('[data-tracker-filters] [data-filter][aria-pressed="true"]');`),
  e(D, `    document.querySelectorAll('.tracker-tabs .filter-tab').forEach(function(tab) { tab.classList.remove('active'); });
    if (btn) {
      btn.classList.add('active');`, `    document.querySelectorAll('[data-tracker-filters] [data-filter]').forEach(function(tab) { tab.classList.remove('active'); tab.setAttribute('aria-pressed', 'false'); });
    if (btn) {
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');`),
  e(D, `    const tabs = document.querySelectorAll('.tracker-tabs .filter-tab');
    tabs.forEach(function(tab) { tab.classList.remove('active'); });
    if (tabs.length) {
      tabs[0].classList.add('active');`, `    const tabs = document.querySelectorAll('[data-tracker-filters] [data-filter]');
    tabs.forEach(function(tab) { tab.classList.remove('active'); tab.setAttribute('aria-pressed', 'false'); });
    if (tabs.length) {
      tabs[0].classList.add('active');
      tabs[0].setAttribute('aria-pressed', 'true');`),
  e(D, `const tabs = Array.from(document.querySelectorAll('.tracker-tabs .filter-tab'));`, `const tabs = Array.from(document.querySelectorAll('[data-tracker-filters] [data-filter]'));`),
  e(D, `tabs.forEach(function(tab) { tab.classList.toggle('active', tab.getAttribute('data-filter') === restoredFilter); });`, `tabs.forEach(function(tab) { const pressed = tab.getAttribute('data-filter') === restoredFilter; tab.classList.toggle('active', pressed); tab.setAttribute('aria-pressed', String(pressed)); });`),
  e(D, `document.querySelectorAll('.tracker-tabs button:disabled')`, `document.querySelectorAll('[data-tracker-filters] [data-filter]:disabled')`),

  // Team tracker section and columns
  e(C, 'return `<div class="team-tracker-section card"><div class="tracker-header">', 'return `<div class="team-tracker-section card" data-team-tracker="coordinator"><div class="tracker-header">'),
  e(D, `document.querySelector('.team-tracker-section')`, `document.querySelector('[data-team-tracker="coordinator"]')`),
  e(C, `<td class="col-activity">`, `<td class="col-activity" data-col="activity">`),
  e(C, `<td class="col-review" data-sort-value`, `<td class="col-review" data-col="review" data-sort-value`),
  e(C, `<td class="col-guide-evaluation" data-sort-value`, `<td class="col-guide-evaluation" data-col="guide-evaluation" data-sort-value`),
  e(C, `<td class="col-health" data-sort-value`, `<td class="col-health" data-col="health" data-sort-value`),
  e(D, `row.querySelectorAll('.col-review, .col-guide-evaluation, .col-health')`, `row.querySelectorAll('[data-col="review"], [data-col="guide-evaluation"], [data-col="health"]')`),
  e(D, `const cell = row.querySelector('.col-activity');
        if (cell)`, `const cell = row.querySelector('[data-col="activity"]');
        if (cell)`),
  e(D, `{ const cell = row.querySelector('.col-activity'); if (cell) {`, `{ const cell = row.querySelector('[data-col="activity"]'); if (cell) {`),

  // Coordinator stat cards (previously selected by colour class)
  e(C, 'const card = (label, value, color, note, icon, detail, ids) => `<div class="stat-card stat-card-${color}" data-completion-tone=', 'const card = (label, value, color, note, icon, detail, ids, progressStat) => `<div class="stat-card stat-card-${color}" data-stat-card${progressStat ? \' data-progress-stat\' : \'\'} data-completion-tone='),
  e(C, '<div class="stat-num"${ids', '<div class="stat-num" data-stat-value${ids'),
  e(C, `['clipboard-check', 'file-text', 'book-open'][index % 3], 'Team review completion');`, `['clipboard-check', 'file-text', 'book-open'][index % 3], 'Team review completion', false, true);`),
  e(C, `'graduation-cap', 'Guide assessment completion')}`, `'graduation-cap', 'Guide assessment completion', false, true)}`),
  e(C, `'triangle-alert', 'Teams with overdue requirements')}`, `'triangle-alert', 'Teams with overdue requirements', false, true)}`),
  e(D, `'#coordinatorStats .stat-card-teal .stat-num, #coordinatorStats .stat-card-red .stat-num'`, `'#coordinatorStats [data-progress-stat] [data-stat-value]'`),
  e(D, `activeValue.closest('.stat-card')`, `activeValue.closest('[data-stat-card]')`),

  // GitHub sync button (class was shared with the storage initialisation button)
  e(C, `        class="run-sync-btn btn btn-primary"
        onclick="runGithubSync()">`, `        id="githubSyncButton"
        class="run-sync-btn btn btn-primary"
        onclick="runGithubSync()">`),
  e(D, `const btn = document.querySelector('.run-sync-btn');`, `const btn = document.getElementById('githubSyncButton');`),

  // Student step card
  e(S, '<div class="step-card step-card-${state} card">', '<div class="step-card step-card-${state} card" data-step-card>'),
  e(D, `button.closest('.step-card')`, `button.closest('[data-step-card]')`),

  // Guide weekly cards
  e(G, `'<article class="guide-weekly-card">`, `'<article class="guide-weekly-card" data-weekly-card>`),
  e(G, `class="guide-weekly-summary"><header class="guide-weekly-student-header">`, `class="guide-weekly-summary" data-weekly-summary><header class="guide-weekly-student-header" data-weekly-student-header>`),
  e(G, `class="guide-weekly-actions" data-sign-entry=`, `class="guide-weekly-actions" data-weekly-actions data-sign-entry=`),
  e(G, `node.querySelectorAll('.guide-weekly-card')`, `node.querySelectorAll('[data-weekly-card]')`),
  e(G, `const content=card.querySelector('.guide-weekly-summary'),bar=card.querySelector('.guide-weekly-actions');`, `const content=card.querySelector('[data-weekly-summary]'),bar=card.querySelector('[data-weekly-actions]');`),
  e(G, `card.querySelector('.guide-weekly-student-header')`, `card.querySelector('[data-weekly-student-header]')`),
  e(G, `actionBarObserver.observe(card.querySelector('.guide-weekly-actions'));actionBarObserver.observe(card.querySelector('.guide-weekly-summary'));`, `actionBarObserver.observe(card.querySelector('[data-weekly-actions]'));actionBarObserver.observe(card.querySelector('[data-weekly-summary]'));`),

  // Review drawer
  e(V, `'<ul class="review-header-students" aria-label`, `'<ul class="review-header-students" data-review-students aria-label`),
  e(V, `drawer.querySelector('.review-header-students')`, `drawer.querySelector('[data-review-students]')`),
  e(V, `'<div class="review-actions">'`, `'<div class="review-actions" data-review-actions>'`),
  e(V, `drawer.querySelector('.review-actions')`, `drawer.querySelector('[data-review-actions]')`),

  // Publishing tables
  e(P, `<div class="publishing-table-wrap table-wrap"><table class="publishing-table table`, `<div class="publishing-table-wrap table-wrap" data-publishing-table-wrap data-tooltip-boundary><table class="publishing-table table`),
  e(P, `<div class="publishing-table-wrap table-wrap"><table class="publishing-students`, `<div class="publishing-table-wrap table-wrap" data-publishing-table-wrap data-tooltip-boundary><table class="publishing-students`),
  e(P, `host.querySelectorAll('.publishing-table-wrap')`, `host.querySelectorAll('[data-publishing-table-wrap]')`),
  e(P, `host.querySelector('.publishing-table-wrap').before(hint)`, `host.querySelector('[data-publishing-table-wrap]').before(hint)`),

  // Tooltip clipping boundaries (scroll regions and drawers)
  e(I, `owner.closest('.table-wrap,.tracker-table-scroll,.publishing-table-wrap,.team-drawer,.review-drawer')`, `owner.closest('[data-tooltip-boundary]')`),
  e(C, `<div class="tracker-table-scroll table-wrap" role="region" aria-label="Teams needing attention`, `<div class="tracker-table-scroll table-wrap" data-tooltip-boundary role="region" aria-label="Teams needing attention`),
  e(C, `<div class="tracker-table-scroll table-wrap" role="region" aria-label="Team tracker table`, `<div class="tracker-table-scroll table-wrap" data-tooltip-boundary role="region" aria-label="Team tracker table`),
  e(C, `<div data-resend-results class="tracker-table-scroll table-wrap"`, `<div data-resend-results data-tooltip-boundary class="tracker-table-scroll table-wrap"`),
  e(W, `<div class="tracker-table-scroll table-wrap" role="region"`, `<div class="tracker-table-scroll table-wrap" data-tooltip-boundary role="region"`),
  e(C, `class="team-drawer drawer"`, `class="team-drawer drawer" data-tooltip-boundary`),
  e(R, `<aside id="rubricDrawer" class="team-drawer drawer"`, `<aside id="rubricDrawer" class="team-drawer drawer" data-tooltip-boundary`),
  e(V, `drawer.className='team-drawer open review-drawer';`, `drawer.className='team-drawer open review-drawer';drawer.setAttribute('data-tooltip-boundary','');`),
];
