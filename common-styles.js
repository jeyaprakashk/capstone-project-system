/**
 * COMMON STYLES — shared CSS tokens and base styles
 * Used by Guide, Reviewer, Coordinator, and Student dashboards
 */

// ===================================================================
// BASE STYLES — typography, spacing, colors
// ===================================================================
function getBaseStyles() {
  return `
  :root {
    /* Existing component values without a match in app-styles.html. */
  }
  .internal-publishing { color:var(--text); }
  .publishing-heading { display:flex; align-items:center; justify-content:space-between; gap:var(--space-3); margin-bottom:14px; }
  .publishing-eyebrow { display:block; color:var(--primary); font-size:var(--fs-meta); font-weight:var(--fw-bold); text-transform:uppercase; margin-bottom:6px; }
  .publishing-controls { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; margin:var(--space-3) 0; }
  .publishing-controls p { margin:0; font-size:var(--fs-body); color:var(--muted); }
  .publishing-heading h3 { margin:0 0 6px; font-size:var(--fs-h2); }
  .publishing-heading p { margin:0; font-size:var(--fs-body); color:var(--muted); }
  .internal-publishing button { min-height:36px; cursor:pointer; }
  .internal-publishing .publishing-reopen { color:var(--danger); font-weight:var(--fw-regular); }
  .internal-publishing :is(button,input,select,summary):focus-visible { outline:3px solid var(--primary); outline-offset:3px; }
  .publishing-stats { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); border:1px solid var(--border); border-radius:var(--radius-card); overflow:hidden; margin-bottom:var(--space-3); background:var(--canvas); }
  .publishing-stats > div { padding:9px var(--space-3); border-right:1px solid var(--border); }
  .publishing-stats > div:last-child { border:0; }
  .publishing-stats span { display:block; font-size:var(--fs-meta); color:var(--muted); margin-bottom:6px; }
  .publishing-stats strong { font-size:var(--fs-h1); font-weight:var(--fw-bold); font-variant-numeric:tabular-nums; }
  .publishing-toolbar { display:flex; flex-wrap:wrap; align-items:end; gap:10px; margin-bottom:10px; }
  .publishing-toolbar label { display:flex; flex-direction:column; gap:6px; font-size:var(--fs-meta); font-weight:var(--fw-semibold); }
  .publishing-toolbar label:first-child { flex:1; min-width:200px; }
  .publishing-toolbar input,.publishing-toolbar select { min-height:38px; padding:var(--space-2) 10px; border:1px solid var(--border); border-radius:var(--radius-btn); font:inherit; color:inherit; background:var(--paper); }
  .publishing-toolbar [data-count] { padding-bottom:10px; font-size:var(--fs-meta); color:var(--muted); }
  .publishing-table-wrap { overflow-x:auto; border:1px solid var(--border); border-radius:var(--radius-card); }
  .publishing-table-wrap:focus-visible { outline:3px solid var(--primary); outline-offset:3px; }
  .publishing-scroll-hint { display:none; }
  .internal-publishing table { width:100%; border-collapse:collapse; margin:0; font-size:var(--fs-body); text-align:left; background:var(--paper); }
  .internal-publishing th,.internal-publishing td { padding:6px 10px; border-bottom:1px solid var(--border); text-align:left; vertical-align:middle; line-height:var(--lh-heading); }
  .internal-publishing thead th { padding:var(--space-2) 10px; background:var(--canvas); color:var(--muted); font-size:var(--fs-meta); font-weight:var(--fw-semibold); white-space:nowrap; }
  .internal-publishing table button { min-height:28px; line-height:var(--lh-heading); }
  .publishing-table > tbody > tr:first-child:hover { background:var(--canvas); }
  .publishing-table > tbody > tr:first-child > th { font-weight:var(--fw-bold); white-space:nowrap; }
  .publishing-academic { min-width:155px; max-width:320px; line-height:var(--lh-heading); }
  .publishing-registers { min-width:240px; max-width:380px; overflow-wrap:anywhere; font-variant-numeric:tabular-nums; }
  .publishing-student-results { display:grid; gap:5px; list-style:none; margin:0; padding:0; }
  .publishing-student-results li { display:flex; align-items:center; min-height:22px; line-height:var(--lh-body); }
  .publishing-student-identity { min-width:0; white-space:nowrap; }
  .publishing-results { white-space:nowrap; }
  .publishing-score { display:inline-block; flex-shrink:0; padding:1px 6px; border-radius:var(--radius-badge); background:var(--soft); color:var(--text); font-size:var(--fs-meta); line-height:var(--lh-heading); font-variant-numeric:tabular-nums; white-space:nowrap; }
  .internal-publishing small { display:block; margin-top:2px; font-size:var(--fs-meta); font-weight:var(--fw-regular); line-height:var(--lh-heading); color:var(--muted); overflow-wrap:anywhere; }
  .publishing-badge { display:inline-block; padding:3px 6px; font-size:var(--fs-meta); line-height:var(--lh-heading); border-radius:var(--radius-badge); background:var(--soft); white-space:nowrap; }
  .publishing-badge[data-state="READY_TO_PUBLISH"] { color:var(--info); background:var(--info-tint); }
  .publishing-badge[data-state="PUBLISHED"] { color:var(--success); background:var(--success-tint); }
  .internal-publishing span[data-tooltip] { cursor:help; }
  .publishing-badge[data-state="PARTIAL_OR_EXCEPTION"],.publishing-badge[data-state="PARTIALLY_PUBLISHED"] { color:var(--warning); background:var(--warning-tint); }
  .publishing-actions { display:flex; align-items:center; gap:var(--space-1); flex-wrap:wrap; }
  .internal-publishing table .publishing-icon-action { display:inline-flex; align-items:center; justify-content:center; width:32px; min-width:32px; height:32px; }
  .publishing-icon-action .lucide-icon { width:18px; height:18px; vertical-align:middle; }
  .internal-publishing table .publishing-icon-action { display:inline-flex; align-items:center; justify-content:center; width:32px; min-width:32px; height:32px; }
  .publishing-icon-action .lucide-icon { width:18px; height:18px; vertical-align:middle; }
  .publishing-detail { padding:var(--space-1) 0; }
  .publishing-table [data-detail-row] > td { background:var(--canvas); padding:var(--space-2) 10px; }
  .publishing-students th,.publishing-students td { min-width:120px; overflow-wrap:anywhere; }
  .publishing-allowed { color:var(--text); }
  .publishing-secondary { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-top:10px; font-size:var(--fs-meta); color:var(--muted); }
  .review-history { margin-top:var(--space-4); border-top:1px solid var(--border); padding-top:var(--space-3); font-size:var(--fs-body); }
  .review-history summary { cursor:pointer; font-weight:var(--fw-semibold); color:var(--muted); }
  .review-history summary span { margin-left:6px; padding:2px 7px; border-radius:var(--radius-badge); background:var(--border); font-size:var(--fs-meta); }
  .review-history ol { list-style:none; padding:0; margin:var(--space-2) 0 0; }
  .review-history li { padding:10px 0; border-bottom:1px solid var(--border); overflow-wrap:anywhere; }
  .review-history li:last-child { border-bottom:0; }
  .review-history-heading { display:flex; flex-wrap:wrap; justify-content:space-between; gap:var(--space-1) var(--space-3); }
  .review-history time, .review-history small { color:var(--muted); font-size:var(--fs-meta); }
  .review-history-status { margin-top:var(--space-1); color:var(--muted); }
  .review-history li p { margin:var(--space-1) 0; white-space:pre-line; }
  .publishing-error { padding:var(--space-3); margin:0 0 var(--space-3); background:var(--border); color:var(--text); border-radius:var(--radius-badge); font-size:var(--fs-body); overflow-wrap:anywhere; }
  .publishing-result { padding:10px 0; font-size:var(--fs-body); }
  .internal-publishing [data-notice]:not(:empty) { margin-bottom:var(--space-3); font-size:var(--fs-body); }
  .publishing-empty { padding:var(--space-6); text-align:center; font-size:var(--fs-body); color:var(--muted); }
  .publishing-sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
  .internal-publishing [hidden] { display:none !important; }
  @media(max-width:640px) {
    .internal-publishing table .publishing-icon-action { width:36px; min-width:36px; height:36px; }
    .internal-publishing table .publishing-icon-action { width:36px; min-width:36px; height:36px; }
    .internal-publishing table button { min-height:36px; }
    .publishing-scroll-hint { display:block; margin:0 0 var(--space-2); font-size:var(--fs-meta); color:var(--muted); }
    .publishing-heading { align-items:center; flex-direction:row; gap:10px; }
    .publishing-stats { grid-template-columns:repeat(3,minmax(0,1fr)); }
    .publishing-stats > div { padding:10px; border-bottom:1px solid var(--border); }
    .publishing-toolbar label { flex:1; }
    .publishing-table { min-width:650px; }
    .publishing-students { min-width:700px; }
  }
  .expandable-text { display: inline; overflow-wrap: anywhere; }
  .expandable-text > summary { display: inline; cursor: pointer; list-style: none; white-space: pre-wrap; }
  .expandable-text > summary::-webkit-details-marker { display: none; }
  .expandable-text .expandable-text-full { display: none; }
  .expandable-text[open] .expandable-text-preview { display: none; }
  .expandable-text[open] .expandable-text-full { display: inline; }
  .expand-hint { font-size: var(--fs-meta); color: var(--primary); font-style: normal; }
  body {
    font-family: var(--font);
    font-size:var(--fs-body);
    color: var(--text);
    background: var(--canvas);
    margin: 0;
    padding: 0;
  }
  h1 {
    font-size: var(--fs-hero);
    font-weight: var(--fw-bold);
    color: var(--text);
    margin: 0 0 var(--space-1) 0;
  }
  h3 {
    font-size: var(--fs-h3);
    font-weight: var(--fw-semibold);
    margin: 0 0 var(--space-2) 0;
  }
  p {
    margin: 0 0 10px 0;
    line-height: var(--lh-body);
  }
  a {
    color: var(--primary);
    text-decoration: none;
  }
  a:hover {
    text-decoration: underline;
  }
  .signed-in-as {
    font-size: var(--fs-meta);
    color: var(--muted);
    margin: 0 0 var(--space-5) 0;
  }`;
}

// ===================================================================
// STAT CARDS (summary strip)
// ===================================================================
function getStatCardStyles() {
  return `
  .stats {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin: 0 0 22px 0;
  }
  .stat {
    flex: 1;
    min-width: 78px;
    text-align: center;
    padding: var(--space-3) 6px;
    border-radius:var(--radius-card);
    background: var(--paper);
    box-shadow:var(--shadow-card);
  }
  .stat-num {
    display: block;
    font-size: var(--fs-hero);
    font-weight: var(--fw-bold);
  }
  .stat-label {
    display: block;
    font-size: var(--fs-meta);
    margin-top: 0;
    color: var(--muted);
  }
  .stat.orange .stat-num { color: var(--warning); }
  .stat.blue .stat-num { color: var(--primary); }
  .stat.green .stat-num { color: var(--success); }
  .stat.red .stat-num { color: var(--danger); }
  .stat.gray .stat-num { color: var(--primary); }`;
}

// ===================================================================
// BUTTONS
// ===================================================================
function getButtonStyles() {
  return `
  /* Layout only: appearance comes from the framework .btn classes. */
  button, a.btn {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    cursor: pointer;
  }
  /* Framework gap: app-styles underlines every link, including link buttons. */
  a.btn { text-decoration: none; }
  .mini {
    margin-right: 6px;
    margin-bottom: var(--space-1);
  }
  .mini:last-child { margin-right: 0; }
  ${getStandardButtonStyles_()}`;
}

// ===================================================================
// FORM ELEMENTS
// ===================================================================
function getFormElementStyles() {
  return `
  input[type="text"],
  textarea,
  .title-input {
    width: 100%;
    box-sizing: border-box;
    padding: var(--space-2) 10px;
    margin-bottom: 10px;
    border: 1px solid var(--border);
    border-radius:var(--radius-btn);
    font-size:var(--fs-body);
    font-family: inherit;
  }
  textarea {
    min-height: 46px;
  }
  input:focus,
  textarea:focus {
    outline: none;
    border-color: var(--primary);
  }
  .field-label {
    display: block;
    font-size: var(--fs-meta);
    font-weight: var(--fw-semibold);
    color: var(--primary-hover);
    margin-bottom: var(--space-1);
  }
  .search-box {
    width: 100%;
    box-sizing: border-box;
    padding: 10px 14px;
    margin-bottom: var(--space-3);
    border: 1px solid var(--border);
    border-radius:var(--radius-btn);
    font-size:var(--fs-body);
  }`;
}

// ===================================================================
// CARDS (Guide/Reviewer dashboard)
// ===================================================================
function getCardStyles() {
  return `
  .event-card {
    background: var(--paper);
    border-radius:var(--radius-tile);
    margin-bottom: var(--space-4);
    box-shadow:var(--shadow-card);
    overflow: hidden;
  }
  .card-accent { height: 5px; }
  .card-accent.gray { background: var(--control-border); }
  .card-accent.orange { background: linear-gradient(90deg, var(--warning), var(--warning)); }
  .card-accent.blue { background: linear-gradient(90deg, var(--primary), var(--primary)); }
  .card-accent.green { background: linear-gradient(90deg, var(--success), var(--success)); }
  .card-accent.red { background: linear-gradient(90deg, var(--danger), var(--danger)); }
  .card-body { padding: 18px var(--space-5) var(--space-1) var(--space-5); }
  .card-top-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: var(--space-3);
  }
  .team-chip {
    font-size: var(--fs-meta);
    color: var(--muted);
    background: var(--canvas);
    padding: var(--space-1) 10px;
    border-radius:var(--radius-badge);
  }
  .card-title {
    font-size: var(--fs-h3);
    font-weight: var(--fw-bold);
    color: var(--text);
    margin: 0 0 10px 0;
    line-height: var(--lh-heading);
  }
  .card-sub {
    font-size: var(--fs-meta);
    color: var(--primary);
    margin: 0 0 var(--space-2) 0;
  }
  .card-sub a {
    color: var(--primary);
    word-break: break-all;
  }
  .card-sub a:hover { text-decoration: underline; }
  .card-desc {
    font-size:var(--fs-body);
    color: var(--primary-hover);
    line-height: var(--lh-body);
    margin: 0 0 10px 0;
  }
  .card-desc.clickable { cursor: pointer; }
  .flag {
    font-size:var(--fs-body);
    color:var(--warning);
    background:var(--warning-tint);
    padding: var(--space-2) 10px;
    border-radius:var(--radius-badge);
    margin: 0 0 10px 0;
  }
  .status-label {
    font-size:var(--fs-body);
    color: var(--muted);
    margin: 0 0 10px 0;
  }
  .card-divider {
    height: 1px;
    background: var(--canvas);
    margin: 6px var(--space-5) 0 var(--space-5);
  }
  .card-footer-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-3) var(--space-5);
  }
  .footer-count {
    font-size: var(--fs-meta);
    color: var(--primary);
    display: flex;
    align-items: center;
  }
  .footer-actions {
    display: flex;
    gap: var(--space-2);
  }
  .doc-links {
    font-size: var(--fs-meta);
    color: var(--primary);
    margin-top: 3px;
  }
  .doc-links a { color: var(--primary); }
  .empty {
    color: var(--muted);
    font-size:var(--fs-body);
    padding: var(--space-1) 0 var(--space-4) 0;
  }`;
}

// ===================================================================
// TABLES (Coordinator/Reviewer dashboard)
// ===================================================================
function getTableStyles() {
  return `
  .flag-text { color:var(--warning); margin-top:3px; }`;
}

// ===================================================================
// FILTER TABS
// ===================================================================
function getFilterTabStyles() {
  return `
  .filter-tabs {
    display: flex;
    gap: 6px;
    flex-wrap: wrap;
    margin-bottom: var(--space-3);
  }
`;
}

// ===================================================================
// COLLAPSIBLE SECTIONS
// ===================================================================
function getCollapsibleStyles() {
  return `
  .collapsible {
    margin-bottom: 14px;
  }
  .collapsible summary {
    cursor: pointer;
    font-size: var(--fs-body);
    font-weight: var(--fw-semibold);
    padding: 10px 14px;
    background: var(--paper);
    border-radius:var(--radius-tile);
    box-shadow:var(--shadow-card);
    list-style: none;
  }
  .collapsible summary::-webkit-details-marker { display: none; }
  .collapsible summary::before { content:''; display:inline-block; width:16px; height:16px; margin-right:5px; vertical-align:-3px; background:currentColor; mask:url("data:image/svg+xml,${encodeURIComponent(renderLucideIcon_('chevron-right'))}") center/contain no-repeat; }
  .collapsible[open] summary::before { transform:rotate(90deg); }
  .collapsible table { margin-top: var(--space-2); }`;
}

// ===================================================================
// SHARED WORKFLOW COMPONENTS
// ===================================================================
function getWorkflowStyles_() {
  return `
  .dash-hero { margin-bottom: 22px; }
  [data-role-content="student"] .assessment-section .app-skeleton--panel {
    padding:0;
    min-height:140px;
  }
  [data-role-content="student"] .assessment-section {
    background:var(--paper);
    color:var(--text);
    border:1px solid var(--border);
    margin-top:var(--space-3);
  }
  .dash-hero h2 {
    font-family: var(--font);
    font-size: var(--fs-kpi);
    font-weight: var(--fw-bold);
    margin: 0 0 var(--space-1) 0;
    color: var(--text);
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .mono-tag {
    font-family: var(--font);
    background: var(--tint);
    color: var(--primary);
    padding: 3px 10px;
    border-radius:var(--radius-badge);
    font-size: var(--fs-hero);
    line-height: var(--lh-tight);
  }
  .hero-sub {
    font-size: var(--fs-meta);
    color: var(--muted);
    margin: 0;
  }
  .team-roster {
    display: flex;
    flex-wrap: wrap;
    gap: 10px;
    margin-bottom: 28px;
  }
  .member-chip {
    display: flex;
    align-items: center;
    gap: 9px;
    background: var(--paper);
    border: 1px solid var(--border);
    border-radius:var(--radius-badge);
    padding: 6px 14px 6px 6px;
  }
  .member-name {
    font-size:var(--fs-body);
    font-weight: var(--fw-semibold);
    color: var(--text);
    line-height: var(--lh-heading);
  }
  .you-tag {
    font-size: var(--fs-meta);
    font-weight: var(--fw-semibold);
    color: var(--primary);
  }
  .member-reg {
    font-family: var(--font);
    font-size: var(--fs-meta);
    color: var(--muted);
  }
  /* Compact student roster, with consistent rows instead of separate chips. */
  .student-dashboard .dash-hero { margin-bottom:var(--space-2); }
  .student-dashboard .dash-hero h2 { font-size:var(--fs-hero); gap:var(--space-2); margin:0; }
  .student-dashboard .mono-tag { font-size:var(--fs-h3); padding:3px 7px; }
  .student-dashboard .team-roster { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:0; margin-bottom:var(--space-4); padding:var(--space-1) 10px; background:var(--paper); border:1px solid var(--border); border-radius:var(--radius-card); }
  .student-dashboard .member-chip { min-width:0; gap:7px; padding:6px var(--space-2); border:0; background:transparent; }
  .student-dashboard .member-info { min-width:0; }
  .student-dashboard .member-name { font-size:var(--fs-body); overflow-wrap:anywhere; }
  .student-dashboard .member-reg { font-size:var(--fs-meta); line-height:var(--lh-heading); }
  @media(max-width:760px) {
    .student-dashboard .team-roster { grid-template-columns:minmax(0,1fr); padding:2px 10px; margin-bottom:var(--space-3); }
    .student-dashboard .member-chip { padding:5px 0; }
    .student-dashboard .member-chip + .member-chip { border-top:1px solid var(--border); }
    .student-dashboard .member-info { display:flex; align-items:baseline; justify-content:space-between; flex-wrap:wrap; gap:0 var(--space-2); flex:1; }
    .student-dashboard .member-name { font-size:var(--fs-body); line-height:var(--lh-heading); }
    .student-dashboard .member-reg { white-space:nowrap; }
  }
  .stepper { position: relative; }

  .step-row {
    display: flex;
    gap: var(--space-4);
  }

  .step-rail {
    display: flex;
    flex-direction: column;
    align-items: center;
    flex-shrink: 0;
    width: 34px;
  }

  .step-node {
    width: 34px;
    height: 34px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--font);
    font-weight: var(--fw-bold);
    font-size: var(--fs-body);
    flex-shrink: 0;
  }

  .step-node-done {
    background: var(--success);
    color: var(--paper);
  }

  .step-node-waiting {
    background: var(--warning);
    color: var(--paper);
  }

  .step-node-active {
    background: var(--primary);
    color: var(--paper);
  }

  .step-node-locked {
    background: var(--soft);
    color: var(--muted);
    border: 1px solid var(--border);
    font-size: var(--fs-meta);
  }

  .step-line {
    width: 2px;
    flex: 1;
    min-height: 24px;
    background: var(--border);
    margin: var(--space-1) 0;
  }

  .step-card {
    flex: 1;
    background: var(--paper);
    border: 1px solid var(--border);
    border-radius:var(--radius-card);
    padding: var(--space-4) 18px;
    margin-bottom: var(--space-4);
  }

  .step-card-locked h4 {
    color: var(--muted);
  }

  .step-card-locked .step-body p {
    color: var(--muted);
  }

  .step-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
  }

  .step-header h4 {
    font-family: var(--font);
    margin: 0;
    font-size: var(--fs-h3);
    color: var(--text);
    font-weight: var(--fw-semibold);
  }

  .step-badge {
    font-size: var(--fs-meta);
    font-weight: var(--fw-semibold);
    padding: 3px 10px;
    border-radius:var(--radius-badge);
    white-space: nowrap;
  }

  .step-badge.done {
    background:var(--success-tint);
    color:var(--success);
  }

  .step-badge.waiting {
    background:var(--warning-tint);
    color:var(--warning);
  }

  .step-badge.active {
    background: var(--tint);
    color: var(--primary);
  }

  .step-badge.locked {
    background: var(--soft);
    color: var(--muted);
  }

  .step-body p {
    margin: 0 0 6px 0;
    font-size:var(--fs-body);
    color: var(--muted);
    line-height: var(--lh-body);
  }

  .step-detail {
    font-size:var(--fs-body);
  }

  .step-detail.note {
    color: var(--warning);
  }

  .mono-detail {
    font-family: var(--font);
    font-size: var(--fs-meta);
    color: var(--text);
    word-break: break-all;
  }

  a.mono-detail.link {
    display: inline-block;
    color: var(--primary);
    text-decoration: underline;
    text-decoration-color: var(--tint);
    text-underline-offset: 3px;
  }

  a.mono-detail.link:hover {
    color: var(--primary-hover);
  }

  .workflow-btn {
    margin-top: var(--space-2);
  }
  .workflow-btn[hidden] { display: none; }

  .student-project-setup, .student-weekly-card { margin:0 0 var(--space-6); padding:var(--space-6); border:1px solid var(--border); border-radius:var(--radius-card); background:var(--paper); }
  .student-project-setup > summary, .student-project-setup > header { display:flex; align-items:center; gap:var(--space-3); flex-wrap:wrap; }
  .student-project-setup > summary { cursor:pointer; list-style:none; }
  .student-project-setup > summary::-webkit-details-marker { display:none; }
  .student-setup-title { font-size:var(--fs-hero); font-weight:var(--fw-bold); margin-right:auto; }
  .setup-view, .setup-hide { padding:var(--space-2) 14px; border:1px solid var(--border); border-radius:var(--radius-btn); }
  .student-project-setup .setup-hide, .student-project-setup[open] .setup-view { display:none; }
  .student-project-setup[open] .setup-hide { display:inline; }
  .student-setup-steps { margin-top:var(--space-5); display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:var(--space-5); }
  .student-setup-steps .step-row { margin:0; min-width:0; }
  .student-setup-steps .step-card { min-width:0; }
  .student-setup-steps .step-line { display:none; }
  .student-setup-pending { margin-top:var(--space-4); padding:0 14px; border-left:3px solid var(--primary); }
  @media(min-width:1000px) {
    .student-setup-steps { display:flex; flex-wrap:wrap; }
    .student-setup-steps > .step-row { flex:1 1 18rem; }
    .student-setup-steps > .step-row:first-child { flex:2 1 44rem; }
    .student-team-overview { margin-bottom:var(--space-4); }
    .student-team-overview .student-project-setup { padding:14px var(--space-4); margin-bottom:0; }
    .student-team-overview:has(> details.student-project-setup:not([open])) { display:grid; grid-template-columns:minmax(0,1fr) 290px; gap:var(--space-3); align-items:stretch; }
    .student-team-overview:has(> details.student-project-setup:not([open])) .team-roster { margin-bottom:0; }
    .student-team-overview > details.student-project-setup:not([open]) { display:flex; align-items:center; padding:10px 14px; }
    .student-team-overview > details.student-project-setup:not([open]) > summary { width:100%; gap:var(--space-2); flex-wrap:nowrap; }
    .student-team-overview .setup-view, .student-team-overview .setup-hide { padding:5px 9px; }
  }
  .student-weekly-card > h3 { margin:0; font-size:var(--fs-hero); }
  .weekly-card-heading { display:flex; align-items:center; justify-content:space-between; gap:var(--space-3); }
  .weekly-card-heading h3 { margin:0; }
  #studentWeeklyProgress [data-weekly-status]:empty, #studentWeeklyProgress [data-weekly-read]:empty { display:none; }
  #studentWeeklyProgress .weekly-week-switcher { display:flex; flex-wrap:wrap; gap:6px; margin-top:var(--space-4); }
  #studentWeeklyProgress .weekly-closed-state { margin:var(--space-3) 0 0; font-size:var(--fs-body); }
  #studentWeeklyProgress .weekly-field textarea { min-height:88px; padding:var(--space-3) 14px; border:1px solid var(--border); border-radius:var(--radius-btn); background:var(--paper); font-size:var(--fs-body); line-height:var(--lh-body); }
  #studentWeeklyProgress .weekly-field label { margin:18px 0 var(--space-2); font-weight:var(--fw-semibold); font-size:var(--fs-body); }
  #studentWeeklyProgress .weekly-progress-form > button { margin:var(--space-4) 0 0; }
  #studentWeeklyProgress [data-weekly-history] { border-top:1px solid var(--border); margin-top:var(--space-5); padding-top:var(--space-1); }
  #studentWeeklyProgress summary { cursor:pointer; font-size:var(--fs-meta); color:var(--muted); }
  #studentWeeklyProgress .weekly-progress-form { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:0 var(--space-5); }
  .weekly-form-header, .weekly-progress-form .weekly-github-activity { grid-column:1 / -1; }
  .weekly-progress-form > button { grid-column:1 / -1; justify-self:start; margin-top:var(--space-4); }
  @media(max-width:640px) {
    .student-project-setup, .student-weekly-card { padding:var(--space-4); }
    .student-setup-steps, #studentWeeklyProgress .weekly-progress-form { grid-template-columns:minmax(0,1fr); }
  }
  .weekly-github-activity { margin-top:var(--space-4); padding:0; border:0; border-top:1px solid var(--border); background:transparent; }
  .weekly-github-activity .heading-row { margin-bottom:10px; }
  .weekly-github-activity ul { list-style:none; margin:0; padding:0; }
  .weekly-github-activity li { display:flex; flex-wrap:wrap; gap:var(--space-2) var(--space-3); padding:var(--space-2) 0; border-top:1px solid var(--border); }
  .weekly-github-activity li span { flex:1 1 220px; overflow-wrap:anywhere; }
  .weekly-github-activity time { font-size:var(--fs-meta); }
  .weekly-github-activity a { color:var(--primary); }
  .student-summary-grid { display:grid; grid-template-columns:minmax(0,2fr) minmax(0,1fr); gap:var(--space-6); margin-top:var(--space-6); align-items:stretch; }
  .student-activity-row { display:grid; grid-template-columns:auto minmax(0,1fr) auto; gap:var(--space-4); align-items:center; padding:var(--space-4) 0; border-bottom:1px solid var(--border); }
  .student-activity-row:last-child { border-bottom:0; }
  .student-activity-row time { color:var(--muted); font-size:var(--fs-meta); }
  .weekly-log-history.is-future { opacity:.65; color:var(--muted); }
  .weekly-log-answer { white-space:pre-wrap; overflow-wrap:anywhere; }
  .weekly-log-history details > h4 { margin:14px 0 var(--space-1); }
  .weekly-log-history details > .weekly-log-answer { margin:0; }
  .weekly-log-history details > h4 + :is(ul,p) { margin-top:var(--space-1); }
  @media(max-width:800px) { .student-summary-grid { grid-template-columns:1fr; } .student-activity-row { grid-template-columns:auto 1fr; } .student-activity-row time { grid-column:2; } }
  .student-summary-card { min-width:0; padding:var(--space-6) 28px; background:var(--paper); border:1px solid var(--border); border-radius:var(--radius-btn); }
  .student-summary-card > header { padding-bottom:var(--space-4); border-bottom:1px solid var(--border); }
  .student-summary-card > header h3 { margin:0; }
  .student-summary-card a, .student-view-marks { color:var(--primary); text-decoration:underline; }
  .student-assessments-card .assessment-section { margin:0; padding:0; border:0; background:transparent; box-shadow:none; }
  .student-assessment-row, .student-assessment-result > summary { display:flex; align-items:center; gap:10px; padding:14px 0; }
  .student-assessment-row strong, .student-assessment-result > summary strong { margin-right:auto; }
  .student-assessment-result > summary { cursor:pointer; flex-wrap:wrap; }
  .student-assessment-details { padding-bottom:var(--space-4); }
  .weekly-submission-summary { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:var(--space-5); margin:var(--space-5) 0; }
  .weekly-submission-summary h5 { margin:0 0 var(--space-2); }
  .weekly-submission-summary p { margin:0; white-space:pre-wrap; overflow-wrap:anywhere; }
  .weekly-form-actions { grid-column:1 / -1; display:flex; flex-wrap:wrap; align-items:center; gap:var(--space-3); margin-top:var(--space-4); }
  @media(max-width:640px) { .weekly-submission-summary { grid-template-columns:minmax(0,1fr); } }
  .weekly-progress-form { margin-top: 18px; }
  .weekly-form-header { margin-top:var(--space-4); padding-bottom:18px; border-bottom:1px solid var(--border); }
  .weekly-status-strip { display:flex; flex-wrap:wrap; gap:6px; }
  .weekly-state { padding:3px var(--space-2); border:1px solid var(--border); border-radius:var(--radius-badge); font-size:var(--fs-meta); font-weight:var(--fw-bold); color:var(--primary); background:var(--paper); }
  .weekly-state[data-state="LATE"] { color:var(--warning); background:var(--warning-tint); }
  #studentWeeklyProgress .weekly-state[data-tone="success"] { color:var(--success); background:var(--success-tint); border-color:var(--success-tint); }
  #studentWeeklyProgress .weekly-state[data-tone="warning"] { color:var(--warning); background:var(--warning-tint); border-color:var(--warning-tint); }
  #studentWeeklyProgress .weekly-state[data-tone="danger"] { color:var(--danger); background:var(--danger-tint); border-color:var(--danger-tint); }
  #studentWeeklyProgress .weekly-status-strip { margin-left:auto; }
  #studentWeeklyProgress .weekly-late-date { color:var(--muted); }
  #studentWeeklyProgress .weekly-required { color:var(--danger); }
  #studentWeeklyProgress .weekly-github-activity { border-top:0; }
  #studentWeeklyProgress .weekly-commit-details { padding:var(--space-3) 14px; border:1px solid var(--border); border-radius:var(--radius-btn); background:var(--soft); margin-bottom:var(--space-3); }
  #studentWeeklyProgress .weekly-commit-details > summary { color:var(--success); font-weight:var(--fw-semibold); }
  #studentWeeklyProgress .weekly-dates { display:flex; flex-wrap:wrap; gap:var(--space-1) var(--space-4); grid-column:1 / -1; margin:0; font-size:var(--fs-meta); line-height:var(--lh-body); }
  .weekly-field { min-width:0; }
  .weekly-progress-form textarea::placeholder { color:var(--muted); opacity:1; }

  .weekly-progress-form label { display:block; margin:14px 0 6px; color:var(--text); }
  .weekly-progress-form textarea { display:block; box-sizing:border-box; width:100%; padding:10px var(--space-3); border:1px solid var(--border); border-radius:var(--radius-btn); background:var(--paper); color:var(--text); font:inherit; resize:vertical; }
  .weekly-progress-form textarea:focus-visible { outline:2px solid var(--primary); outline-offset:2px; }
  .weekly-progress-form :disabled:not(button) { opacity:.65; }
  #studentWeeklyProgress details { margin-top:var(--space-3); overflow-wrap:anywhere; }
  #studentWeeklyProgress .workflow-btn { margin:var(--space-2) var(--space-2) 0 0; }
  .github-team-status { list-style:none; margin:6px 0; padding:0; }
  .github-member-status { display:grid; grid-template-columns:12ch 1fr; align-items:center; gap:10px; padding:6px 0; line-height:var(--lh-heading); }
  .github-member-status + .github-member-status { border-top:1px solid var(--border); }
  .github-member-register { flex-shrink:0; font-weight:var(--fw-semibold); font-variant-numeric:tabular-nums; }
  .github-member-separator { display:none; }
  .github-member-state { display:flex; align-items:center; gap:6px; min-width:0; font-size:var(--fs-meta); color:var(--warning); }
  .github-member-state .lucide-icon { margin:0; }
  .github-member-status.is-joined .github-member-state { color:var(--success); }
  .github-member-status.is-missing .github-member-state { color:var(--danger); }
  .github-form-jump { margin:0; line-height:inherit; text-align:left; text-underline-offset:3px; cursor:pointer; }
  .github-form-jump:focus-visible { outline:2px solid currentColor; outline-offset:3px; }
  #studentGithubProfile { scroll-margin-top:80px; }
  .github-team-repository { display:grid; grid-template-columns:16px minmax(0,1fr); align-items:start; gap:var(--space-2); padding:var(--space-2) 0; border-top:1px solid var(--border); font-size:var(--fs-meta); }
  .github-repository-label { display:flex; align-items:center; gap:7px; font-weight:var(--fw-semibold); }
  .github-team-repository a { display:block; min-width:0; white-space:normal; overflow-wrap:anywhere; word-break:normal; line-height:var(--lh-heading); }
  @media(min-width:1000px) {
    .github-team-repository a { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  }
  .github-username-form { margin-top:var(--space-2); padding-top:10px; border-top:1px solid var(--border); }
  .github-username-form > p { margin:var(--space-1) 0 var(--space-2); font-size:var(--fs-body); line-height:var(--lh-heading); }
  .github-username-form > button[type="submit"] { margin-top:var(--space-2); }
  @media(max-width:420px) {
    .github-member-status { grid-template-columns:11ch minmax(0,1fr); gap:var(--space-2); }
    .github-member-separator { display:none; }
  }
  .github-username-form[hidden] { display: none; }
  .github-username-form label { display: block; margin-bottom: 6px; }
  .github-username-form input {
    display: block; box-sizing: border-box; width: 100%; max-width: 360px;
    padding: 10px var(--space-3); border: 1px solid var(--border); border-radius:var(--radius-btn);
    background: var(--paper); color: var(--text); font: inherit;
  }
  .github-username-form input:focus-visible { outline: 2px solid var(--primary); outline-offset: 2px; }
  .github-username-form button { cursor: pointer; }
  .github-username-form :disabled:not(button) { opacity: .65; cursor: wait; }
  #githubSubmitStatus { font-size:var(--fs-body); }


  .marks-card {
    background: var(--paper);
    border: 1px solid var(--border);
    border-radius:var(--radius-card);
    padding: var(--space-4) 18px;
    margin-top: var(--space-1);
  }

  .marks-card h3 {
    font-family: var(--font);
    margin: 0 0 10px 0;
    font-size: var(--fs-h3);
    color: var(--text);
    font-weight: var(--fw-semibold);
  }

  .marks-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: var(--space-2) 0;
    border-top: 1px solid var(--border);
    font-size:var(--fs-body);
    color: var(--text);
  }

  .marks-row:first-of-type {
    border-top: none;
  }

  .marks-value {
    font-family: var(--font);
    font-weight: var(--fw-semibold);
    color: var(--success);
  }

  .marks-pending {
    font-size:var(--fs-body);
    color: var(--muted);
  }

  .announcement-card {
    margin-top: 18px;
    background: var(--paper);
    border: 1px solid var(--border);
    border-radius:var(--radius-card);
    padding: var(--space-4) 18px;
    box-shadow:var(--shadow-card);
  }
  .announcement-header { display:flex; flex-direction:row; flex-wrap:nowrap; align-items:flex-start; justify-content:space-between; gap:var(--space-3); margin-bottom:var(--space-6); }
  .announcement-header > div:first-child { min-width:0; flex:1; }
  .announcement-header > .announcement-refresh-btn { flex-shrink:0; white-space:nowrap; }
  .announcement-title-row { display:flex; align-items:center; gap:10px; }
  .announcement-tab-surface .announcement-header h2 { margin:0; color:var(--text); font-size:var(--fs-h1); font-weight:var(--fw-semibold); }
  .announcement-count { display:inline-flex; align-items:center; justify-content:center; min-width:28px; height:26px; padding:0 var(--space-2); border-radius:var(--radius-badge); background:var(--canvas); color:var(--primary); font-size:var(--fs-meta); font-weight:var(--fw-bold); }
  .announcement-subtitle { margin:7px 0 0; color:var(--primary); font-size:var(--fs-meta); line-height:var(--lh-body); }
  .announcement-actions { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
  .announcement-add-btn, .announcement-refresh-btn { display:inline-flex; align-items:center; justify-content:center; min-height:42px; cursor:pointer; }
  .announcement-tab-surface :is(a,button,summary):focus-visible { outline:3px solid var(--primary); outline-offset:4px; }
  .announcement-feed-card { min-width:0; padding:var(--space-4); background:var(--paper); border:1px solid var(--border); border-radius:var(--radius-card); }
  .announcement-list { display:grid; gap:10px; }
  .announcement-tab-surface [hidden] { display:none !important; }
  .announcement-search-bar { display:flex; align-items:center; flex-wrap:wrap; gap:10px; }
  .announcement-search-bar label { width:100%; color:var(--primary-hover); font-size:var(--fs-meta); font-weight:var(--fw-semibold); }
  .announcement-search-bar input { flex:1; min-width:160px; width:auto; min-height:44px; margin:0; padding:10px 14px; border:1px solid var(--border); border-radius:var(--radius-btn); background:var(--paper); color:var(--text); font:inherit; font-size:var(--fs-body); }
  .announcement-search-bar input::placeholder { color:var(--primary); }
  .announcement-search-bar input:focus-visible { outline:3px solid var(--primary); outline-offset:2px; }
  .announcement-results { margin:14px 0; color:var(--primary); font-size:var(--fs-meta); }
  .announcement-pagination { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:var(--space-3); margin-top:var(--space-5); color:var(--primary-hover); font-size:var(--fs-meta); }
  .announcement-item { padding:14px var(--space-4); background:var(--paper); border:1px solid var(--border); border-radius:var(--radius-card); box-shadow:var(--shadow-card); overflow-wrap:anywhere; }
  .announcement-meta { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:6px var(--space-4); margin-bottom:7px; }
  .announcement-date { color:var(--primary); font-size:var(--fs-meta); font-weight:var(--fw-semibold); }
  .announcement-message, .announcement-details p, .announcement-preview { margin:0; color:var(--text); font-size:var(--fs-body); line-height:var(--lh-body); white-space:pre-wrap; }
  .announcement-footer { display:flex; align-items:center; justify-content:flex-start; flex-wrap:wrap; gap:var(--space-2) var(--space-4); margin-top:10px; }
  .announcement-audience { display:flex; align-items:center; flex-wrap:wrap; gap:5px; margin:0; font-size:var(--fs-meta); }
  .announcement-audience-label { color:var(--primary); margin-right:2px; }
  .announcement-audience-chip { padding:2px 7px; background:var(--canvas); border:1px solid var(--border); border-radius:var(--radius-badge); color:var(--primary-hover); font-weight:var(--fw-semibold); }
  .announcement-details summary { cursor:pointer; list-style:none; }
  .announcement-details summary::-webkit-details-marker { display:none; }
  .announcement-expand, .announcement-collapse { display:block; width:fit-content; margin-top:var(--space-2); color:var(--primary); font-size:var(--fs-meta); font-weight:var(--fw-semibold); }
  .announcement-collapse, .announcement-details[open] .announcement-preview, .announcement-details[open] .announcement-expand { display:none; }
  .announcement-details[open] .announcement-collapse { display:block; margin:0 0 10px; }
  .announcement-link { display:inline-flex; align-items:center; gap:var(--space-2); margin:0; min-height:32px; }
  .announcement-empty-state { padding:36px var(--space-5); text-align:center; background:var(--paper); border:1px dashed var(--border); border-radius:var(--radius-card); }
  .announcement-empty-icon { display:inline-flex; align-items:center; justify-content:center; width:48px; height:48px; margin-bottom:14px; border-radius:var(--radius-tile); background:var(--canvas); color:var(--primary); }
  .announcement-empty-state h3 { color:var(--text); margin:0 0 var(--space-2); font-size:var(--fs-h3); }
  .announcement-empty { margin:0; color:var(--primary); font-size:var(--fs-body); line-height:var(--lh-body); }
  .announcement-status { color:var(--primary-hover); font-size:var(--fs-body); margin:0 0 var(--space-4); }
  .announcement-status:empty { display:none; }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-results { margin:var(--space-2) 0; }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-toolbar { display:flex; align-items:center; flex-wrap:wrap; gap:var(--space-2); padding:var(--space-2); border:1px solid var(--border); border-radius:var(--radius-card); background:var(--paper); }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-toolbar-filters { display:flex; align-items:center; flex-wrap:wrap; gap:var(--space-2); flex:1 1 500px; min-width:0; }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-toolbar > .announcement-add-btn { flex:none; margin-left:auto; white-space:nowrap; }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-search-field { display:flex; align-items:center; gap:10px; flex:1 1 260px; min-width:0; }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-search-field input { width:100%; min-width:0; margin:0; background:var(--canvas); border:0; padding:var(--space-2) 10px; }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-audience-filters { display:flex; flex-wrap:wrap; gap:6px; }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-audience-filters button,body[data-dashboard-theme="editorial"] .announcement-hub .announcement-load-more button { cursor:pointer; }
  body[data-dashboard-theme="editorial"] .announcement-hub select { padding:10px; min-height:40px; }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-columns { display:grid; grid-template-columns:minmax(0,1fr) 300px; align-items:start; gap:var(--space-6); }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-columns > * { min-width:0; }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-list { gap:var(--space-5); }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-date-group,body[data-dashboard-theme="editorial"] .announcement-hub .announcement-templates { background:var(--paper); border:1px solid var(--border); border-radius:var(--radius-card); }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-group-heading { padding:13px 22px; margin:0; background:var(--canvas); color:var(--muted); font:var(--fw-semibold) var(--fs-meta) var(--font); text-transform:uppercase; border-radius:var(--radius-card) 12px 0 0; }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-item { display:flex; align-items:flex-start; gap:var(--space-4); padding:18px 22px; border:0; border-top:1px solid var(--border); border-radius:0; box-shadow:none; background:transparent; }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-row-icon { display:grid; place-items:center; flex:none; width:42px; height:42px; border-radius:var(--radius-tile); background:var(--tint); color:var(--primary); font-size:var(--fs-meta); font-weight:var(--fw-bold); }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-row-copy { flex:1; min-width:0; }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-row-copy h3 { margin:0 0 5px; font:var(--fw-semibold) var(--fs-h3)/var(--lh-heading) var(--font); color:var(--text); letter-spacing:normal; }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-meta { display:block; color:var(--muted); font-size:var(--fs-meta); margin:0; }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-date,body[data-dashboard-theme="editorial"] .announcement-hub .announcement-audience { display:inline; font:inherit; color:inherit; }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-row-actions { display:flex; align-items:center; gap:var(--space-3); flex:none; }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-link { white-space:nowrap; min-height:40px; }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-full { margin-top:var(--space-2); }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-full summary { color:var(--primary); cursor:pointer; }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-full p { white-space:pre-wrap; overflow-wrap:anywhere; margin:var(--space-2) 0 0; color:var(--text); }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-templates { padding:var(--space-5); }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-templates h3 { font-size:var(--fs-h2); margin:0 0 6px; }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-templates p { color:var(--muted); font-size:var(--fs-body); }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-templates ol { list-style:none; margin:var(--space-5) 0 0; padding:0; display:grid; gap:18px; }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-templates li a { display:flex; align-items:center; gap:var(--space-3); color:var(--text); }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-templates li a > span:nth-child(2) { flex:1; overflow-wrap:anywhere; }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-step-number { display:grid; place-items:center; flex:none; width:28px; height:28px; background:var(--primary); color:var(--paper); font-weight:var(--fw-semibold); }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-load-more { display:flex; justify-content:center; margin-top:var(--space-5); }
  @media(max-width:900px) { body[data-dashboard-theme="editorial"] .announcement-hub .announcement-columns { grid-template-columns:minmax(0,1fr); } }
  @media(max-width:640px) {
    body[data-dashboard-theme="editorial"] .announcement-hub .announcement-item { padding:var(--space-4); gap:10px; flex-wrap:wrap; }
    body[data-dashboard-theme="editorial"] .announcement-hub .announcement-row-copy { flex-basis:calc(100% - 52px); }
    body[data-dashboard-theme="editorial"] .announcement-hub .announcement-row-actions { margin-left:52px; }
    body[data-dashboard-theme="editorial"] .announcement-hub .announcement-actions > * { flex:initial; }
  }
  .announcement-loading { min-height:70px; }
  .announcement-sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
  @media (max-width:640px) {
    .announcement-header { margin-bottom:var(--space-5); }
    .announcement-actions { width:100%; }
    .announcement-actions > * { flex:1; }
    .announcement-item { padding:var(--space-3) 14px; }
  }
  `;
}


function getSharedTimelineStyles_() {
  return `
  .shared-timeline { margin:0 0 var(--space-4); padding:var(--space-2) 14px; border:1px solid var(--border); border-radius:var(--radius-card); background:var(--paper); color:var(--text); }
  .timeline-heading { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:var(--space-2); }
  .shared-timeline .timeline-heading h2 { margin:0; padding:0; border:0; min-height:0; font-size:var(--fs-hero); }
  .timeline-track { display:grid; grid-template-columns:repeat(var(--timeline-stops),minmax(0,1fr)); list-style:none; margin:22px 0 0; padding:0; }
  .timeline-stop { position:relative; min-width:0; padding:0 var(--space-2); display:flex; flex-direction:column; align-items:center; gap:2px; text-align:center; }
  .timeline-stop[hidden] { display:none; }
  .timeline-stop:has(~ .timeline-stop:not([hidden]))::after { content:''; position:absolute; left:50%; right:-50%; top:11px; height:2px; background:var(--tint); }
  .stage-dot { position:relative; z-index:var(--z-sticky); flex-shrink:0; display:flex; align-items:center; justify-content:center; box-sizing:border-box; width:22px; height:22px; margin-bottom:0; border:1px solid var(--control-border); background:var(--paper); color:var(--muted); }
  .stage-dot svg { width:14px; height:14px; }
  .timeline-past .stage-dot { border-color:var(--text); background:var(--text); color:var(--paper); }
  .timeline-past:has(~ .timeline-stop:not([hidden]))::after { background:var(--text); }
  .timeline-stop strong { min-height:22px; display:flex; align-items:center; justify-content:center; font-size:var(--fs-meta); font-weight:var(--fw-semibold); line-height:var(--lh-heading); overflow-wrap:anywhere; }
  .timeline-date, .timeline-timing { font-size:var(--fs-meta); line-height:var(--lh-heading); color:var(--muted); }
  .timeline-date { display:inline-block; padding:0 7px; border:1px solid var(--control-border); border-radius:var(--radius-badge); background:var(--paper); font-variant-numeric:tabular-nums; }
  .timeline-current .timeline-date { border-color:var(--primary); background:var(--canvas); color:var(--primary); font-weight:var(--fw-semibold); }
  .timeline-timing { position:absolute; top:-20px; left:0; right:0; }
  .timeline-past, .timeline-future { color:var(--muted); }
  .timeline-current strong { color:var(--primary); font-weight:var(--fw-bold); }
  .timeline-current .stage-dot { border:2px solid var(--primary); background:var(--canvas); box-shadow:var(--shadow-selected); }
  .timeline-node-core { width:8px; height:8px; background:var(--primary); }
  .timeline-current .timeline-timing { color:var(--primary); font-size:var(--fs-meta); font-weight:var(--fw-semibold); }
  .timeline-toggle { cursor:pointer; }
  .timeline-retry { cursor:pointer; }
  .timeline-toggle:focus-visible, .timeline-retry:focus-visible { outline:2px solid var(--primary); outline-offset:3px; }
  .timeline-track.timeline-full { grid-template-columns:1fr; }
  .timeline-full .timeline-stop { padding:0 0 var(--space-2) 30px; align-items:flex-start; text-align:left; gap:2px; }
  .timeline-full .timeline-stop strong { min-height:0; justify-content:flex-start; }
  .timeline-full .timeline-timing { position:static; order:-1; }
  .timeline-full .stage-dot { position:absolute; left:0; top:0; }
  .timeline-full .timeline-stop:has(~ .timeline-stop:not([hidden]))::after { left:10px; right:auto; top:11px; height:100%; width:2px; }
  @media(max-width:760px) {
    .shared-timeline { padding:var(--space-2) var(--space-3); }
    .timeline-heading { gap:var(--space-1); }
    .timeline-track { grid-template-columns:1fr; margin-top:6px; }
    .timeline-stop { padding:0 0 var(--space-2) 30px; align-items:flex-start; text-align:left; gap:2px; }
    .timeline-stop strong { min-height:0; justify-content:flex-start; }
    .timeline-timing { position:static; order:-1; }
    .stage-dot { position:absolute; left:0; top:0; }
    .timeline-stop:has(~ .timeline-stop:not([hidden]))::after { left:10px; right:auto; top:11px; height:100%; width:2px; }
    .timeline-track:not(.timeline-full) .timeline-stop[data-timeline-mobile="false"] { display:none; }
    .timeline-stop { display:grid; grid-template-columns:minmax(0,1fr) auto; column-gap:var(--space-2); row-gap:0; padding:0 0 var(--space-2) 28px; }
    .timeline-stop strong { font-size:var(--fs-meta); line-height:var(--lh-heading); }
    .timeline-date { align-self:start; padding:0 5px; font-size:var(--fs-meta); line-height:var(--lh-heading); }
    .timeline-timing { grid-column:1 / -1; font-size:var(--fs-meta); line-height:var(--lh-heading); }
    .timeline-current .timeline-timing { font-size:var(--fs-meta); }
    .timeline-track:not(.timeline-full) .timeline-stop::after { display:none; }
    .timeline-track:not(.timeline-full) .timeline-stop[data-timeline-mobile="true"]:has(~ .timeline-stop[data-timeline-mobile="true"]:not([hidden]))::after { display:block; }
    .timeline-toggle { min-height:44px; }
  }
  `;
}

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

function getLoadingStyles_() {
  return `
  .app-content-loading { position:relative !important; overflow:hidden; }
  .app-content-loading > :not(.app-loading-overlay) { visibility:hidden !important; }
  .app-content-loading--compact > :not(.app-loading-overlay) { display:none !important; }
  .app-content-loading--compact > .app-loading-overlay { position:relative; inset:auto; }
  .dashboard-dialog-icon .lucide-icon { width:40px; height:40px; }
  .app-loading-overlay { position:absolute; inset:0; z-index:var(--z-sticky); display:grid; overflow:hidden; border-radius:inherit; background:var(--paper); color:inherit; }
  .app-loading-overlay > .app-skeleton--inline { place-self:center; }
  .app-skeleton { display:block; width:100%; padding:var(--space-5); box-sizing:border-box; }
  .app-skeleton-title { display:block; margin-bottom:var(--space-5); }
  .app-skeleton--panel { min-height:180px; }
  .app-skeleton--drawer { min-height:260px; padding:var(--space-3) 0; }
  .app-skeleton--inline { display:inline-block; width:72px; padding:0; vertical-align:middle; }
  .app-skeleton--status { max-width:420px; padding:var(--space-2) 0; }
  .app-skeleton--status .app-skeleton-title { margin-bottom:var(--space-3); }
  .app-skeleton--timeline { padding:var(--space-4) 0 0; }
  .app-skeleton--timeline .app-skeleton-lines { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); }
  `;
}

/**
 * Common dashboard theme for every role, including shared overlays.
 * Loaded last by the shell so component geometry and interaction rules survive.
 */
function getEditorialStyles_() {
  const scope = 'body[data-dashboard-theme="editorial"]';
  // Prefix selectors explicitly; do not rely on CSS nesting in Apps Script clients.
  const rule = (selectors, declarations) => selectors.split('|').map(s => scope + ' ' + s.trim()).join(',\n') + ' { ' + declarations + ' }';
  return `
  ${scope} {
    max-width:1200px; margin:0 auto; padding:var(--space-8) var(--space-6) 56px;
    background:var(--canvas); color:var(--text); color-scheme:light;
    font-family:var(--font); font-size:var(--fs-body); line-height:var(--lh-body);
  }
  ${rule('h1|h2|h3|h4|.card-title|.assessment-title|.pipeline-title|.tracker-title|.team-drawer-title|.drawer-project-title|.shared-timeline .timeline-heading h2|.shared-rubrics h2|.announcement-tab-surface .announcement-header h2|.dashboard-body-surface h1|.dashboard-body-surface :is(h2,h3)|.review-drawer .team-drawer-title', 'font-family:var(--font); color:var(--text); font-weight:var(--fw-semibold); text-transform:none; overflow-wrap:anywhere;')}
  ${rule('h1|.dashboard-body-surface h1', 'font-size:var(--fs-h1); line-height:var(--lh-tight);')}
  ${rule('h2|.shared-timeline .timeline-heading h2|.shared-rubrics h2|.assessment-title|.pipeline-title|.tracker-title', 'font-size:var(--fs-h1); line-height:var(--lh-heading);')}
  ${rule('h3|.card-title|.team-drawer-title|.review-drawer .team-drawer-title', 'font-size:var(--fs-hero); line-height:var(--lh-heading);')}
  ${rule('a|.card-sub a|.doc-links a|.coord-table.read-only a|.expand-hint|.announcement-expand|.announcement-collapse|.view-link', 'color:var(--primary); text-underline-offset:3px;')}
  ${rule('a:hover', 'color:var(--primary-hover);')}
  ${rule('.signed-in-as', 'font-size:var(--fs-meta); color:var(--muted); margin:var(--space-2) 0 var(--space-6); overflow-wrap:anywhere;')}
  ${rule('.dashboard-app-header', 'display:flex; align-items:center; justify-content:space-between; gap:var(--space-2) var(--space-6); margin-bottom:var(--space-4);')}
  ${rule('.dashboard-app-header h1', 'margin:0;')}
  ${rule('.dashboard-app-header .signed-in-as', 'margin:0; text-align:right; min-width:0;')}
  @media(max-width:760px) {
    ${rule('.dashboard-app-header', 'display:block; margin-bottom:var(--space-6);')}
    ${rule('.dashboard-app-header .signed-in-as', 'margin:2px 0 0; text-align:left;')}
  }
  ${rule('.dashboard-body-surface|.announcement-tab-surface', 'background:transparent; color:var(--text); border:0; border-radius:0; box-shadow:none; margin:0; padding:0; font-family:var(--font); line-height:var(--lh-body);')}
  ${rule('.dashboard-container-header|.announcement-header', 'padding-bottom:var(--space-5); margin-bottom:var(--space-6); border-bottom:1px solid var(--border);')}
  ${rule('.dashboard-container-header', 'padding-bottom:var(--space-3); margin-bottom:var(--space-4); gap:var(--space-3);')}
  ${rule('.dashboard-container-header .announcement-subtitle', 'margin:var(--space-1) 0 0;')}
  ${rule('.dashboard-navigation', 'background:var(--paper); border:1px solid var(--border); border-radius:var(--radius-card); margin-bottom:var(--space-5); box-shadow:none;')}
  ${rule('.dashboard-navigation .role-tabs', 'border-radius:var(--radius-btn);')}

  ${rule('.step-node-done|.step-node-waiting', 'color:var(--paper);')}
  ${rule('.step-node-active', 'background:var(--primary); color:var(--paper);')}
  /* Paper surfaces, with structure supplied by fine rules rather than elevation. */
  ${rule('.shared-rubrics|.event-card|.pipeline-section|.assessment-section|.github-section|.team-tracker-section|.reviewer-assigned-teams|.system-status-primary > .system-status-card|.coordinator-card-placeholder|.committee-item|.review-config-card|.announcement-item|.announcement-empty-state|.drawer-info-card|.guide-eval-criterion|.review-assessment-summary', 'color-scheme:light;')}
  ${rule('.shared-rubrics', 'padding:var(--space-6); margin-bottom:var(--space-4); border-top:2px solid var(--border);')}
  ${rule('.shared-rubrics h2', 'margin-bottom:var(--space-5);')}
  ${rule('.shared-rubrics-heading', 'display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:var(--space-3);')}
  ${rule('.shared-rubrics-heading h2', 'margin:0;')}
  ${rule('#sharedRubricsToggle|.publishing-toggle', 'width:44px; min-height:44px; flex:none; display:inline-flex; align-items:center; justify-content:center;')}
  ${rule('#sharedRubricsToggle[hidden]', 'display:none;')}
  ${rule('#sharedRubricsToggle[aria-expanded="true"] .lucide-icon|.publishing-toggle[aria-expanded="true"] .lucide-icon', 'transform:rotate(180deg);')}
  ${rule('#sharedRubricsContent:not([hidden])', 'margin-top:var(--space-4);')}
  ${rule('#sharedRubricsToggle:focus-visible|#sharedRubricsContent > button:focus-visible', 'outline:3px solid var(--primary); outline-offset:3px;')}
  ${rule('.event-card', 'margin-bottom:var(--space-4);')}
  ${rule('.card-body', 'padding:var(--space-4) var(--space-4) var(--space-2);')}
  ${rule('.card-footer-row', 'padding:var(--space-3) var(--space-4); flex-wrap:wrap; gap:var(--space-3);')}
  ${rule('.card-accent', 'height:3px; background:var(--border);')}
  ${rule('.card-accent.green', 'background:var(--success);')}
  ${rule('.card-accent.orange', 'background:var(--border);')}
  ${rule('.card-accent.blue', 'background:var(--info);')}
  ${rule('.card-accent.red', 'background:var(--danger);')}
  ${rule('.card-divider|.committee-body|.drawer-section|.drawer-person|.drawer-status-row|.review-history|.review-history li|.review-project-title-row|.review-criterion[data-index] .review-feedback-heading', 'border-color:var(--border);')}
  ${rule('.card-divider', 'background:var(--border);')}
  ${rule('.coordinator-container', 'gap:var(--space-4);')}
  ${rule('.stats|.coord-stats|.coord-stats.coordinator-stats-grid', 'gap:var(--space-3); margin-bottom:var(--space-4);')}
  ${rule('.dashboard-body-surface :is(.team-tracker-section,.pipeline-section,.assessment-section,.needs-attention)', 'padding:var(--space-4);')}
  ${rule('.dashboard-body-surface :is(.tracker-title,.assessment-title,.table-title)', 'margin-top:0; margin-bottom:var(--space-3);')}
  ${rule('.dashboard-body-surface :is(.tracker-search,.pipeline-heading)', 'margin-bottom:var(--space-3);')}
  /* Reserve the original columns even when zero-count cards are omitted. */
  ${rule('[data-role-content="guide"] .stats', 'display:grid; grid-template-columns:repeat(6,minmax(0,1fr));')}
  ${rule('[data-role-content="reviewer"] .coord-stats', 'display:grid; grid-template-columns:repeat(4,minmax(0,1fr));')}
  ${rule('[data-role-content="guide"] .stat|[data-role-content="reviewer"] .coord-stat', 'min-width:0;')}
  ${rule('.stat|.coord-stat|.coordinator-stats-grid .stat-card', 'padding:var(--space-3) var(--space-4); border:1px solid var(--border); border-radius:var(--radius-card); background:var(--paper); box-shadow:none; text-align:left;')}
  ${rule('.stat-num|.coord-stat-num|.coordinator-stats-grid .stat-card .stat-num', 'font-family:var(--font); font-size:var(--fs-kpi); font-weight:var(--fw-semibold); line-height:var(--lh-tight); font-variant-numeric:tabular-nums; color:var(--text);')}
  ${rule('.stat-label|.coord-stat-label|.coordinator-stats-grid .stat-label|.drawer-section-title|.drawer-info-label|.team-drawer-eyebrow|.review-control-title', 'font-family:var(--font); font-size:var(--fs-meta); font-weight:var(--fw-semibold); text-transform:uppercase; color:var(--muted);')}
  ${rule('.coordinator-stats-grid .stat-detail|.coordinator-stats-grid .stat-detail-row', 'font-size:var(--fs-meta); color:var(--muted);')}
  ${rule('.coordinator-stats-grid .stat-card[data-completion-tone]', '--stat-tone:var(--info); --stat-tint:var(--info-tint); background:var(--paper);')}
  ${rule('.coordinator-stats-grid .stat-card[data-completion-tone="complete"]', '--stat-tone:var(--success); --stat-tint:var(--success-tint);')}
  ${rule('.coordinator-stats-grid .stat-card[data-completion-tone="warning"]', '--stat-tone:var(--warning); --stat-tint:var(--warning-tint);')}
  ${rule('.coordinator-stats-grid .stat-card[data-completion-tone="danger"]', '--stat-tone:var(--danger); --stat-tint:var(--danger-tint);')}
  ${rule('.coordinator-stats-grid .stat-card[data-completion-tone] .stat-num', 'color:var(--stat-tone);')}
  ${rule('.coordinator-stats-grid .stat-track|.team-progress-track|.assessment-bar-inner', 'background:var(--soft);')}
  ${rule('.team-progress-track > div|.assessment-fill', 'background:var(--success);')}

  /* Common controls retain their existing layout and event hooks. */
  ${rule('input|select|textarea', 'font-family:var(--font); accent-color:var(--primary);')}
  ${rule('input:not([type=checkbox]):not([type=radio]):not([type=range])|select|textarea|.dashboard-body-surface :is(input:not([type=checkbox]):not([type=radio]):not([type=range]),select,textarea)|.announcement-tab-surface :is(input,select,textarea)', 'max-width:100%; box-sizing:border-box; background:var(--paper); color:var(--text); border:1px solid var(--control-border); border-radius:var(--radius-btn); font-family:var(--font); font-size:var(--fs-body); line-height:var(--lh-heading);')}
  ${rule('input::placeholder|textarea::placeholder|.dashboard-body-surface :is(input,textarea)::placeholder', 'color:var(--muted); opacity:1;')}
  ${rule('input[aria-invalid="true"]|.review-criterion input[aria-invalid="true"]', 'border-color:var(--danger); background:var(--danger-tint);')}
  ${rule(':is(a,button,summary,input,select,textarea,[tabindex]):focus-visible|.dashboard-navigation button:focus-visible|.dashboard-body-surface :is(a,button,summary,input,select,textarea):focus-visible|.announcement-tab-surface :is(a,button,summary,input,select,textarea):focus-visible|#rubricDrawer button:focus-visible', 'outline:3px solid var(--primary); outline-offset:3px;')}

  ${rule('table', 'font-family:var(--font); font-variant-numeric:tabular-nums; color:var(--text);')}
  ${rule('.internal-publishing table th|.internal-publishing table td', 'padding:6px 10px; font-size:var(--fs-body); line-height:var(--lh-heading); letter-spacing:normal;')}
  ${rule('.internal-publishing table thead th', 'padding:var(--space-2) 10px; font-size:var(--fs-meta); ')}
  ${rule('.internal-publishing table tbody th', 'background:transparent; color:var(--text);')}
  ${rule('.internal-publishing .publishing-table [data-detail-row] > td', 'padding:var(--space-2) 10px;')}
  ${rule('tbody tr:hover', 'background:var(--canvas);')}
  ${rule('.tracker-table-scroll|.reviewer-assigned-table-scroll', 'max-width:100%; overflow-x:auto; overscroll-behavior-x:contain;')}
  ${rule('.reviewer-assigned-teams .team-tracker-table th|.reviewer-assigned-teams .team-tracker-table td', 'padding:10px var(--space-2);')}
  ${rule('.card-top-row|.footer-actions|.pagination', 'flex-wrap:wrap; gap:10px;')}
  ${rule('.card-title|.drawer-project-title|.announcement-message|.announcement-preview', 'overflow-wrap:anywhere;')}
  ${rule('.card-sub|.card-desc|.status-label|.status-cell|.footer-count|.empty|.coord-empty|.doc-links|.team-progress-note|.team-progress-count|.drawer-person-meta|.drawer-problem|.drawer-status-label|.rubric-levels dd|.announcement-date|.announcement-results|.announcement-status|.announcement-empty|.announcement-audience-label|.reviewer-setup-intro|.rubrics-status-detail|.committee-email|.committee-teams|.review-project-meta-row|.review-tab-caption|.review-slider-values|.review-history time|.review-history small|#systemStatusMessage', 'color:var(--muted);')}
  ${rule('.announcement-message|.announcement-preview|.announcement-details p|.drawer-info-value|.drawer-person-name|.rubric-levels dt', 'color:var(--text);')}
  ${rule('.team-chip|.committee-team-chip|.announcement-audience-chip|.review-config-pill|.review-graded-pill', 'background:var(--soft); color:var(--muted); border-color:var(--border); border-radius:var(--radius-badge);')}
  ${rule('.health-badge|.rubrics-status-pill', 'border-radius:var(--radius-badge); font-size:var(--fs-meta);')}
  ${rule('.health-badge.green|.rubrics-status-pill[data-configured="true"]|.review-config-card[data-state="ready"] .review-config-pill|.review-graded-pill[data-completion="complete"]|.review-header-line .review-header-due[data-timing="success"]', 'color:var(--success); background:var(--success-tint); border-color:var(--success);')}
  ${rule('.health-badge.orange|.flag|.rubrics-status-pill[data-configured="false"]|.review-config-card[data-state="invalid"] .review-config-pill|.review-config-card[data-state="definitions-missing"] .review-config-pill|.review-config-card[data-state="definitions-empty"] .review-config-pill|.review-config-card[data-state="storage-missing"] .review-config-pill|.review-config-card[data-state="storage-empty"] .review-config-pill|.review-config-card[data-state="error"] .review-config-pill|.review-header-line .review-header-due[data-timing="warning"]', 'color:var(--warning); background:var(--warning-tint); border-color:var(--warning);')}
  ${rule('.health-badge.red|.role-load-error|.drawer-error|.review-marks-error|.review-header-line .review-header-due[data-timing="danger"]', 'color:var(--danger); background:var(--danger-tint); border-color:var(--danger);')}
  ${rule('.review-header-line .review-header-due[data-timing="info"]', 'color:var(--info); background:var(--info-tint); border-color:var(--info);')}
  ${rule('.drawer-status-good|.stat.green .stat-num|.coord-stat.green .coord-stat-num', 'color:var(--success);')}
  ${rule('.drawer-status-warn|.flag-text|.stat.orange .stat-num|.coord-stat.orange .coord-stat-num', 'color:var(--warning);')}
  ${rule('.drawer-status-bad|.coordinator-stats-grid .stat-detail-row .stat-outstanding|.stat.red .stat-num|.coord-stat.red .coord-stat-num', 'color:var(--danger);')}
  ${rule('.stat.blue .stat-num|.coord-stat.blue .coord-stat-num', 'color:var(--info);')}

  /* Shared timeline and rubric surfaces follow the active role, including retries. */
  ${rule('.rubric-assessment strong|.rubric-mobile-title strong', 'color:var(--text);')}
  ${rule('.rubric-mobile-meta|.rubric-assessment .rubric-metadata', 'color:var(--muted);')}
  ${rule('.rubric-assessment .rubric-weight|.rubric-mobile-weight', 'background:var(--soft); border-color:var(--border); color:var(--muted); border-radius:var(--radius-badge); font-family:var(--font); font-variant-numeric:tabular-nums;')}
  ${rule('.rubric-assessment .rubric-weight|.rubric-mobile-weight', 'background:var(--tint); color:var(--primary); border-color:var(--border);')}
  ${rule('.rubric-assessment .rubric-action', 'color:var(--primary);')}
  ${rule('.rubric-mobile-row ~ .rubric-mobile-row', 'border-color:var(--border);')}

  /* Body-mounted drawers and native dialogs share the same typography. */
  ${rule('.team-drawer|.review-drawer', 'font-family:var(--font); font-size:var(--fs-body); background:var(--paper); color:var(--text); border-color:var(--border); box-shadow:var(--shadow-card);')}
  ${rule('.team-drawer-header|.review-assessment-navigation|.review-footer', 'background:var(--canvas); border-color:var(--border);')}
  ${rule('dialog::backdrop', 'background:var(--scrim);')}
  ${rule('.announcement-empty-icon|.review-header-review|.review-criterion-meta span|.review-graded-pill[data-completion="partial"]', 'color:var(--primary); background:var(--tint); border-color:var(--border);')}
  ${rule('.review-criterion[data-index]|.review-individual-rubric[data-index]', 'background:var(--paper); border-color:var(--border); border-top:3px solid var(--border); border-radius:var(--radius-tile);')}
  ${rule('.review-criterion[data-index] .review-card-title', 'font-family:var(--font); font-size:var(--fs-h2); color:var(--text);')}
  ${rule('.review-stepper', 'background:var(--soft); border-color:var(--border); border-radius:var(--radius-btn);')}
  ${rule('.review-descriptor|.review-accordion > summary', 'background:var(--tint); color:var(--primary-hover); border-color:var(--border); border-radius:var(--radius-tile);')}
  /* Preserve pill geometry after the theme's general button rule. */
  ${rule('.review-criterion [data-marks-slider]', 'accent-color:var(--primary);')}
  ${rule('.review-progress-students|.review-slider-values .is-selected|.review-project-title-row .lucide-icon|.review-criterion details', 'color:var(--primary);')}
  ${rule('.review-actions|.collapsible summary', 'background:var(--paper); border-color:var(--border); border-radius:var(--radius-tile); box-shadow:none;')}
  ${rule('.review-progress progress|.review-progress progress::-webkit-progress-bar', 'background:var(--soft); accent-color:var(--primary);')}
  ${rule('.review-progress progress::-webkit-progress-value', 'background:var(--primary);')}
  ${rule('.review-progress progress::-moz-progress-bar', 'background:var(--primary);')}
  ${rule('.review-progress-students::before', 'background:var(--primary);')}
  ${rule('.review-progress-completion > span::before', 'background:var(--warning);')}
  /* Secondary staff tools and semantic variants use the same palette. */
  ${rule('.needs-attention|.assessment-overview|.github-config|.pipeline-stage', 'background:var(--paper); color:var(--text); border:1px solid var(--border); border-radius:var(--radius-card); box-shadow:none;')}
  ${rule('.stage-label|.stage-count|.assessment-name|.github-title|.system-status-card .github-label|.system-status-card .rubrics-assessment-list dt', 'color:var(--text);')}
  ${rule('.announcement-subtitle|.stage-subtitle|.stage-percent|.semester-dates|.development-legend|.assessment-pct|.github-label|.github-value|.system-status-card .github-value|.system-status-card .rubrics-assessment-list dd|.reviewer-review-cell small|.role-menu-toggle .role-menu-caption', 'color:var(--muted);')}
  ${rule('.progress-bar|.coordinator-stats-grid .lucide-icon.stat-icon|.coordinator-stats-grid .stat-pct', 'background:var(--soft); color:var(--muted); border-color:var(--border);')}
  ${rule('.progress-fill.blue|.progress-fill.green|.progress-fill.gray', 'background:var(--success);')}
  ${rule('.github-status.configured|.system-status-card .github-status.configured|.coordinator-stats-grid .stat-registered', 'background:var(--success-tint); color:var(--success); border-color:var(--success);')}
  ${rule('.coordinator-stats-grid .stat-card[data-completion-tone] .stat-icon|.coordinator-stats-grid .stat-card[data-completion-tone] .stat-pct', 'background:var(--stat-tint); color:var(--stat-tone);')}
  ${rule('.review-header-line|.review-project-title-row > summary|.review-project-title-row > p|.review-progress|.review-feedback-title strong|.review-assessment-summary dd', 'color:var(--text);')}
  ${rule('.review-individual-rubric[data-index] .review-criterion-meta span:first-child', 'background:var(--tint); color:var(--primary); border-color:var(--border);')}
  ${rule('.review-criterion:is([data-level="0"],[data-level="1"]) .review-descriptor|.review-feedback-heading [data-feedback-required]|.review-assessment-summary .review-summary-status[data-tone="pending"] dd', 'background:var(--warning-tint); color:var(--warning); border-color:var(--warning);')}
  ${rule('.review-criterion:is([data-level="3"],[data-level="4"],[data-level="5"]) [data-feedback-status]|.review-assessment-summary .review-summary-status[data-tone="complete"] dd', 'background:var(--success-tint); color:var(--success); border-color:var(--success);')}
  ${rule('.review-assessment-summary .review-summary-status[data-tone="exception"] dd', 'background:var(--danger-tint); color:var(--danger);')}
  ${rule('.review-criterion[data-index] .review-control-title|.review-criterion-meta span:last-child|.review-history summary|.review-history-status', 'color:var(--muted);')}
  ${rule('.review-assessment-summary .review-summary-total', 'border-color:var(--border);')}
  ${rule('.review-assessment-summary .review-summary-total[data-resolved="true"] dd', 'color:var(--text);')}
  ${rule('.review-header-students .review-student-score', 'color:var(--text); border-color:var(--border);')}
  ${rule('.review-drawer :is(button,input,summary,textarea):focus-visible|.review-criterion .review-feedback-options button:focus-visible', 'outline:3px solid var(--primary); outline-offset:3px;')}
  @media(max-width:760px) {
    ${scope} { padding:var(--space-5) var(--space-4) var(--space-10); }
    ${rule('h1|.dashboard-body-surface h1', 'font-size:var(--fs-h1);')}
    ${rule('.shared-rubrics', 'padding:18px var(--space-4);')}
    ${rule('.dashboard-navigation', 'padding:6px;')}
    ${rule('button|.dashboard-body-surface button|.announcement-tab-surface button|.review-drawer button|.review-drawer .review-pi-pills button|.review-criterion[data-index] .review-feedback-options button|.btn-outline|.mini|.team-action-icon|.announcement-link', 'min-height:44px;')}
    ${rule('.team-action-icon|.team-drawer-close', 'min-width:44px;')}
    ${rule('input:not([type=checkbox]):not([type=radio]):not([type=range])|select|textarea', 'font-size:var(--fs-body);')}
    ${rule('.card-body', 'padding:var(--space-3) var(--space-4) 6px;')}
    ${rule('.card-footer-row', 'padding:var(--space-3) var(--space-4);')}
    ${rule('.system-status-primary', 'grid-template-columns:minmax(0,1fr);')}
    ${rule('.stats|.coord-stats:not(.coordinator-stats-grid)|[data-role-content="guide"] .stats|[data-role-content="reviewer"] .coord-stats', 'display:grid; grid-template-columns:repeat(2,minmax(0,1fr));')}
    ${rule('.stat|.coord-stat|.coordinator-stats-grid .stat-card', 'padding:var(--space-3); min-width:0;')}
  }
  /* Announcements: lighter filters and a consistent feed/action rhythm. */
  ${rule('.announcement-hub .announcement-toolbar', 'padding:var(--space-2) 10px; gap:10px; border-radius:var(--radius-tile);')}
  ${rule('.announcement-hub .announcement-search-field', 'gap:var(--space-2); padding-left:2px;')}
  ${rule('.announcement-hub .announcement-toolbar .announcement-search-field input', 'min-height:38px; padding:var(--space-2) 10px; border:1px solid transparent; background:var(--canvas); border-radius:var(--radius-btn);')}
  ${rule('.announcement-hub .announcement-audience-filters', 'gap:2px;')}
  ${rule('.announcement-hub .announcement-audience-filters button', 'min-height:34px;')}
  ${rule('.announcement-hub .announcement-toolbar select', 'min-height:38px; padding:7px 10px; border-color:var(--border); font-size:var(--fs-meta);')}
  ${rule('.announcement-hub .announcement-columns', 'gap:var(--space-5);')}
  ${rule('.announcement-hub .announcement-results', 'margin:10px 0; font-size:var(--fs-meta);')}
  ${rule('.announcement-hub .announcement-date-group|.announcement-hub .announcement-templates', 'border-radius:var(--radius-card);')}
  ${rule('.announcement-hub .announcement-group-heading', 'padding:10px 18px; font-size:var(--fs-meta); border-radius:var(--radius-tile) var(--radius-btn) 0 0;')}
  ${rule('.announcement-hub .announcement-item', 'padding:var(--space-4) 18px; gap:var(--space-3); align-items:center;')}
  ${rule('.announcement-hub .announcement-item:hover', 'background:var(--canvas);')}
  ${rule('.announcement-hub .announcement-item:last-child', 'border-radius:0 0 var(--radius-btn) var(--radius-btn);')}
  ${rule('.announcement-hub .announcement-row-icon', 'width:34px; height:34px; border-radius:var(--radius-tile); font-size:var(--fs-meta);')}
  ${rule('.announcement-hub .announcement-row-copy h3', 'font-size:var(--fs-h3); margin-bottom:var(--space-1); line-height:var(--lh-heading);')}
  ${rule('.announcement-hub .announcement-meta', 'font-size:var(--fs-meta); line-height:var(--lh-body);')}
  ${rule('.announcement-hub .announcement-row-actions .announcement-link', 'box-sizing:border-box; min-width:96px; min-height:34px; justify-content:center;')}
  ${rule('.announcement-hub .announcement-templates', 'padding:var(--space-4);')}
  ${rule('.announcement-hub .announcement-templates h3', 'font-size:var(--fs-h3); margin:0 0 var(--space-1);')}
  ${rule('.announcement-hub .announcement-templates p', 'font-size:var(--fs-body); margin:0;')}
  ${rule('.announcement-hub .announcement-templates ol', 'margin-top:var(--space-3); gap:0;')}
  ${rule('.announcement-hub .announcement-templates li + li', 'border-top:1px solid var(--border);')}
  ${rule('.announcement-hub .announcement-templates li a', 'padding:10px 0; gap:10px; text-decoration:none; font-size:var(--fs-meta); line-height:var(--lh-body);')}
  ${rule('.announcement-hub .announcement-templates li a:hover', 'color:var(--primary);')}
  ${rule('.announcement-hub .announcement-step-number', 'width:24px; height:24px; border-radius:var(--radius-badge); background:var(--tint); color:var(--primary); font-size:var(--fs-meta);')}
  @media(max-width:640px) {
    ${rule('.announcement-hub .announcement-item', 'padding:14px; align-items:flex-start;')}
    ${rule('.announcement-hub .announcement-row-copy', 'flex-basis:calc(100% - 46px);')}
    ${rule('.announcement-hub .announcement-row-actions', 'margin-left:46px;')}
    ${rule('.announcement-hub .announcement-audience-filters button|.announcement-hub .announcement-row-actions .announcement-link|.announcement-hub .announcement-toolbar select', 'min-height:44px;')}
  }
  /* Utility pages share compact headers; only rubrics retain a paper container. */
  ${rule('.utility-body.announcement-tab-surface|.utility-body.dashboard-body-surface', 'margin:0; padding:0; border:0; border-radius:0; background:transparent; box-shadow:none; color:var(--text);')}
  ${rule('.utility-body.shared-rubrics', 'margin:0; padding:var(--space-5) var(--space-6); border:1px solid var(--border); border-top:2px solid var(--border); border-radius:var(--radius-card); background:var(--paper); box-shadow:none; color:var(--text);')}
  ${rule('.utility-body .utility-header', 'display:flex; flex-direction:row; align-items:flex-start; justify-content:space-between; flex-wrap:nowrap; gap:10px var(--space-4); padding:0; margin:0 0 var(--space-4); border:0;')}
  ${rule('.dashboard-body-surface .dashboard-container-header h2|.announcement-tab-surface .tab-header h2|.student-dashboard .dash-hero h2|.utility-body .utility-header :is(h1,h2)|.shared-timeline .timeline-heading h2', 'font-family:var(--font); font-size:var(--fs-h1); line-height:var(--lh-heading); font-weight:var(--fw-semibold); color:var(--text); margin:0; padding:0;')}
  ${rule('.utility-body .utility-header .announcement-subtitle', 'margin:var(--space-1) 0 0; font-size:var(--fs-meta);')}
  ${rule('.utility-body #sharedRubricsContent:not([hidden])', 'margin-top:0;')}
  ${rule('.utility-body .utility-header .announcement-actions', 'display:flex; align-items:center; flex-wrap:wrap; gap:var(--space-2); margin:0;')}
  @media(max-width:640px) {
    ${rule('.utility-body.shared-rubrics', 'padding:var(--space-4);')}
    ${rule('.utility-body .utility-header', 'gap:var(--space-2); margin-bottom:var(--space-3);')}
  }
  /* One tab-header template across dashboard and utility surfaces. */
  ${rule('.tab-header', 'display:flex; flex-direction:row; flex-wrap:nowrap; align-items:flex-start; justify-content:space-between; gap:var(--space-3); padding:0 0 var(--space-4); margin:0 0 var(--space-5); border:0; border-bottom:1px solid var(--border);')}
  ${rule('.tab-header > div', 'flex:1; min-width:0;')}
  ${rule('.tab-header [hidden]', 'display:none;')}
  ${rule('.tab-header h2', 'margin:0; padding:0; font-family:var(--font); font-size:var(--fs-h1); line-height:var(--lh-heading); font-weight:var(--fw-semibold); color:var(--text);')}
  ${rule('.tab-header .announcement-subtitle', 'margin:var(--space-1) 0 0; font-size:var(--fs-meta); line-height:var(--lh-body); color:var(--text);')}
  /* Shared heading hierarchy: app > tab content > card > subsection. */
  @media(min-width:1201px) {
    ${rule('.dashboard-app-header', 'display:grid; grid-template-columns:auto minmax(0,1fr); gap:var(--space-2) var(--space-6); margin-bottom:var(--space-5); padding:0 var(--space-3); background:var(--paper); border:1px solid var(--border); border-radius:var(--radius-card);')}
    ${rule('.dashboard-app-header h1', 'font-size:var(--fs-h1); grid-column:1; grid-row:1;')}
    ${rule('.dashboard-app-header .dashboard-navigation', 'grid-column:1 / -1; grid-row:2; min-width:0; margin:0; padding:0; border:0; border-radius:0; background:transparent;')}
    ${rule('.dashboard-app-header .signed-in-as', 'grid-column:2; grid-row:1; font-size:var(--fs-meta); color:var(--text); white-space:normal; overflow-wrap:anywhere; padding:var(--space-3) 0;')}
    ${rule('.dashboard-app-header .role-tab-btn', 'gap:var(--space-2);')}
    ${rule('.dashboard-app-header .role-tab-btn .lucide-icon', 'width:14px; height:14px;')}
  }
  @media(max-width:1200px) {
    ${rule('.dashboard-app-header', 'display:block; margin-bottom:var(--space-5);')}
    ${rule('.dashboard-app-header .signed-in-as', 'margin:2px 0 0; text-align:left;')}
    ${rule('.dashboard-app-header .dashboard-navigation', 'margin-top:var(--space-6); margin-bottom:0;')}
  }
  ${rule('.dashboard-body-surface .student-assessments-card > .assessment-section', 'margin:0; padding:0; border:0; border-radius:0; background:transparent; box-shadow:none;')}
  ${rule('.dashboard-body-surface .student-assessments-card > .assessment-section + .assessment-section', 'border-top:1px solid var(--border);')}
  ${rule('.student-assessments-card .student-assessment-result > summary', 'list-style:none;')}
  ${rule('.student-assessments-card .student-assessment-result > summary::-webkit-details-marker', 'display:none;')}
  ${rule('.heading-row', 'display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; gap:var(--space-2) var(--space-3);')}
  ${rule('.heading-row > :is(h2,h3,h4,h5)', 'margin:0; min-width:0;')}
  ${rule('.dashboard-body-surface h5|.weekly-github-activity h5', 'font-family:var(--font); font-size:var(--fs-h3); line-height:var(--lh-heading); font-weight:var(--fw-semibold); color:var(--text);')}
  ${rule('.dashboard-body-surface .dashboard-container-header h2|.announcement-tab-surface .tab-header h2|.student-dashboard .dash-hero h2|.utility-body .utility-header :is(h1,h2)|.shared-timeline .timeline-heading h2', 'font-size:var(--fs-h1); line-height:var(--lh-heading); font-weight:var(--fw-semibold);')}
  ${rule('.dashboard-body-surface h3|.card-title|.assessment-title|.pipeline-title|.tracker-title|.system-status-card .system-card-title|.student-dashboard .student-setup-title|.student-dashboard .student-weekly-card > h3|.announcement-hub .announcement-templates h3|.announcement-hub .announcement-row-copy h3|.announcement-empty-state h3|.review-drawer h3|.drawer-section h3|.review-criterion[data-index] .review-card-title', 'font-size:var(--fs-h2); line-height:var(--lh-heading); font-weight:var(--fw-semibold);')}
  ${rule('.dashboard-body-surface h4|.student-dashboard .step-card h4|.weekly-github-activity h4|.weekly-form-header h4|.drawer-section h4', 'font-family:var(--font); font-size:var(--fs-h3); line-height:var(--lh-heading); font-weight:var(--fw-semibold); color:var(--text);')}
  ${rule('.student-setup-title', 'margin:0 auto 0 0;')}
  @media(prefers-reduced-motion:reduce) {
    ${rule('*|*::before|*::after', 'scroll-behavior:auto; transition:none;')}
  }
  ${getStandardButtonStyles_(scope)}
  `;
}

/** Only controls without an attached-stylesheet counterpart remain here. */
function getStandardButtonStyles_(scope = '') {
  return `
  ${scope} .disabled-button-label { display:flex; align-items:center; justify-content:center; gap:6px; }
  ${scope} .disabled-button-label .lucide-icon { width:14px; height:14px; flex:none; }
  ${scope} .disabled-button-caption { color:var(--muted); }
  `;
}

function getDashboardSurfaceStyles_() {
  return `
  .announcement-tab-surface, .dashboard-body-surface {
    margin-top:var(--space-1); padding:28px; background:var(--canvas); color:var(--text);
    border:1px solid var(--border); border-radius:var(--radius-card); box-shadow:var(--shadow-card);
    font-family:var(--font); line-height:var(--lh-body);
  }
  .dashboard-body-surface h1 {
    margin:0; color:var(--text); font-family:inherit; font-size:var(--fs-h1); font-weight:var(--fw-bold); line-height:var(--lh-heading); }
  .dashboard-body-surface h1 { margin-bottom:var(--space-6); }
  .team-page-size { display:flex; align-items:center; gap:var(--space-2); white-space:nowrap; font-size:var(--fs-meta); }
  .dashboard-body-surface .team-page-size select { width:auto; min-height:34px; padding:5px 9px; font-size:var(--fs-meta); }
  .dashboard-body-surface .dashboard-container-header h2 { margin-bottom:0; }
  :is(.announcement-tab-surface, .dashboard-body-surface) :is(h2,h3) { font-family:inherit; }
  :is(.announcement-tab-surface, .dashboard-body-surface) :is(input:not([type=checkbox]):not([type=radio]),select,textarea) {
    box-sizing:border-box; padding:10px 14px; min-height:44px; border:1px solid var(--border);
    border-radius:var(--radius-btn); background:var(--paper); color:var(--text); font-family:inherit; font-size:var(--fs-body); line-height:var(--lh-heading);
  }
  :is(.announcement-tab-surface, .dashboard-body-surface) :is(input,textarea)::placeholder { color:var(--primary); }
  :is(.announcement-tab-surface, .dashboard-body-surface) :is(a,button,summary,input,select,textarea):focus-visible {
    outline:3px solid var(--primary); outline-offset:3px;
  }
  @media(max-width:640px) {
    .announcement-tab-surface, .dashboard-body-surface { padding:18px 14px; border-radius:var(--radius-card); }
    .dashboard-body-surface h1 { font-size:var(--fs-h2); }
  }
  `;
}
