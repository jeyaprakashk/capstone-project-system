/**
 * COMMON STYLES — dashboard styling comes only from app-styles.html.
 * This file keeps the shared skeleton renderer and the few rules the dashboard
 * needs to function (visibility toggles, overlay positioning, scroll regions,
 * screen-reader-only text). It defines no colours, spacing, typography or borders.
 */

/** Shared pure renderer, used on the server and embedded in the browser bundle. */
function getSkeletonMarkup_(variant, label) {
  variant = ['panel','drawer','inline','status','timeline'].includes(variant) ? variant : 'panel';
  const safeLabel = String(label || 'Loading content').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  const line = '<span class="app-skeleton-bar skeleton skeleton-text" data-skeleton aria-hidden="true"></span>';
  const shortLine = '<span class="app-skeleton-bar skeleton skeleton-text skeleton-text--short" data-skeleton aria-hidden="true"></span>';
  return '<span class="app-skeleton app-skeleton--' + variant + '" role="status" aria-label="' + safeLabel + '" aria-busy="true">' +
    (variant === 'inline' ? '<span class="spinner spinner--sm" aria-hidden="true"></span>' :
    '<span class="app-skeleton-title"><span class="app-skeleton-bar skeleton skeleton-title" data-skeleton aria-hidden="true"></span></span>' +
    '<span class="app-skeleton-lines skeleton-group">' + line.repeat(variant === 'drawer' ? 5 : variant === 'status' ? 0 : 2) + shortLine + '</span>') +
    '<span class="sr-only">Loading</span></span>';
}

/** Functional rules only; loaded before app-styles.html by the dashboard shell. */
function getFunctionalStyles_() {
  return `
  .publishing-stats { overflow:hidden; }
  .publishing-table-wrap { overflow-x:auto; }
  .publishing-scroll-hint { display:none; }
  .publishing-sr-only { position:absolute; width:1px; height:1px; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; }
  @media(max-width:640px) {
    .publishing-scroll-hint { display:block; }
  }
  .expandable-text > summary::-webkit-details-marker { display: none; }
  .expandable-text .expandable-text-full { display: none; }
  .expandable-text[open] .expandable-text-preview { display: none; }
  .expandable-text[open] .expandable-text-full { display: inline; }
  .event-card { overflow: hidden; }
  .guide-problem-mobile { display:none; }
  @media(max-width:760px) {
    .guide-problem-desktop { display:none; }
    .guide-problem-mobile { display:inline; }
  }
  .guide-title-github { overflow:hidden; }
  .guide-title-timing-popover { position:fixed; inset:auto; width:360px; max-height:calc(100dvh - 16px); overflow:auto; max-width:min(360px,calc(100vw - 32px)); }
  .guide-title-github .github-team-repository a { overflow:visible; }
  .guide-weekly-card { overflow:visible; position:relative; }
  .guide-weekly-actions { position:relative; bottom:0; z-index:var(--z-sticky); }
  .guide-weekly-card[data-sticky-decision="true"] .guide-weekly-actions { position:sticky; }
  @media(max-width:540px) {
    .guide-view-nav span { display:none; }
  }
  .coordinator-card-placeholder { overflow:hidden; }
  .coordinator-stat-placeholder .app-skeleton-lines > :last-child { display:none; }
  .committee-item { overflow:hidden; }
  .committee-item summary::-webkit-details-marker { display:none; }
  .committee-item[open] .committee-chevron { transform:rotate(180deg); }
  #assessmentStorageStatus:empty, #assessmentStorageResults:empty { display:none; }
  .coordinator-stats-grid .stat-pct:empty { display:none; }
  .tracker-table-scroll { max-width:100%; overflow-x:auto; overscroll-behavior-x:contain; }
  .review-drawer { position: fixed; top: 0; right: 0; width: min(520px, 92vw); height: 100vh; z-index:var(--z-drawer); }
  .review-drawer .team-drawer-content { overflow-y: auto; }
  body.team-drawer-open { overflow: hidden; }
  .student-project-setup > summary::-webkit-details-marker { display:none; }
  .student-project-setup .setup-hide, .student-project-setup[open] .setup-view { display:none; }
  .student-project-setup[open] .setup-hide { display:inline; }
  .student-setup-steps .step-line { display:none; }
  #studentWeeklyProgress [data-weekly-status]:empty, #studentWeeklyProgress [data-weekly-read]:empty { display:none; }
  .weekly-progress-form textarea { resize:vertical; }
  .github-member-separator { display:none; }
  #studentGithubProfile { scroll-margin-top:80px; }
  @media(min-width:1000px) {
    .github-team-repository a { overflow:hidden; }
  }
  @media(max-width:420px) {
    .github-member-separator { display:none; }
  }
  .announcement-status:empty { display:none; }
  .announcement-sr-only { position:absolute; width:1px; height:1px; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; }
  .review-drawer { inset:0 0 0 auto; max-width:100vw; max-height:100dvh; overflow:hidden; }
  .review-drawer:not([open]) { display:none; }
  .review-drawer.open { transform:none; }
  .review-project-title-row > summary::-webkit-details-marker { display:none; }
  .review-project-title-row > summary > span { overflow:hidden; }
  .review-project-title-row[open] .review-title-chevron { transform:rotate(180deg); }
  .review-project-title-row > p { max-height:15dvh; overflow:auto; }
  .review-card-title { display:none; }
  .review-criterion[data-index] { position:relative; }
  .review-criterion[data-index] > legend { position:absolute; width:1px; height:1px; overflow:hidden; clip-path:inset(50%); white-space:nowrap; }
  .review-drawer .team-drawer-content { overflow-y:auto; }
  .review-attendance-picker > summary::-webkit-details-marker { display:none; }
  .review-attendance-picker[open] > summary .lucide-icon { transform:rotate(180deg); }
  .review-accordion[data-criteria-group] > summary { display:none; }
  .review-student-accordion > summary { display:none; }
  .review-awarded-total { display:none; }
  .review-criterion :is(textarea) { resize:vertical; }
  .review-progress progress { max-width:100%; overflow:hidden; }
  .review-footer .review-message { overflow-y:auto; }
  @media(max-width:760px) {
    .timeline-track:not(.timeline-full) .timeline-stop[data-timeline-mobile="false"] { display:none; }
  }
  .app-content-loading { position:relative !important; overflow:hidden; }
  .app-content-loading > :not(.app-loading-overlay) { visibility:hidden !important; }
  .app-content-loading--compact > :not(.app-loading-overlay) { display:none !important; }
  .app-content-loading--compact > .app-loading-overlay { position:relative; inset:auto; }
  .app-loading-overlay { position:absolute; inset:0; z-index:var(--z-sticky); overflow:hidden; }
  .lucide-icon { pointer-events:none; }
  .lucide-icon[aria-label] { pointer-events:auto; }
  .dashboard-tooltip { position:fixed; z-index:var(--z-tooltip); max-width:min(280px,calc(100vw - 16px)); pointer-events:none; }
  .role-menu-toggle { display:none; }
  @media(max-width:1200px) {
    .role-menu-toggle { display:flex; }
    .dashboard-navigation .role-tabs { display:none; }
    .dashboard-navigation.menu-open .role-tabs { display:flex; }
  }
  .role-panel { display: none; }
  .role-panel.active { display: block; }
  .shared-rubrics { container:rubrics / inline-size; }
  .rubric-mobile-row { display:none; }
  @container rubrics (width < 480px) {
    .shared-rubrics .rubric-assessment { display:none; }
    .rubric-mobile-row { display:grid; }
  }
  .publishing-toggle[aria-expanded="true"] .lucide-icon { transform:rotate(180deg); }
  .student-assessments-card .student-assessment-result > summary::-webkit-details-marker { display:none; }
  @media(prefers-reduced-motion:reduce) {
    *, *::before, *::after { scroll-behavior:auto; }
  }
`;
}
