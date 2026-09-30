/**
 * COMMON STYLES — shared CSS tokens and base styles
 * Used by Guide, Reviewer, Coordinator, and Student dashboards
 */

// ===================================================================
// BASE STYLES — typography, spacing, colors
// ===================================================================
function getBaseStyles() {
  return `
  * { box-sizing: border-box; }
  :root {
    --font-size-body:14px; --font-size-small:12px; --pill-radius:0;
    /* Shared semantic palette for every role and status component. */
    --color-success:#3A5F43; --color-success-tint:#E9F0E7;
    --color-warning:#9A4D12; --color-warning-tint:#FFF0DF;
    --color-danger:#A12E29; --color-danger-tint:#F8E7E3;
    --color-info:#405C65; --color-info-tint:#E8EFF0;
  }
  .internal-publishing { --publishing-border:var(--color-border,#dce4e5); color:var(--color-ink,#172f35); }
  .publishing-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:14px; }
  .publishing-eyebrow { display:block; color:var(--color-accent-primary,#0f766e); font-size:var(--font-size-small); font-weight:700; letter-spacing:.1em; text-transform:uppercase; margin-bottom:6px; }
  .publishing-controls { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:10px; margin:12px 0; }
  .publishing-controls p { margin:0; font-size:var(--font-size-body); color:var(--color-ink-muted,#52636c); }
  .publishing-heading h3 { margin:0 0 6px; font-size:22px; }
  .publishing-heading p { margin:0; font-size:var(--font-size-body); color:var(--color-ink-muted,#52636c); }
  .internal-publishing button { min-height:36px; padding:7px 11px; border:1px solid var(--publishing-border); border-radius:6px; background:var(--color-paper,#fff); color:inherit; font:inherit; font-size:var(--font-size-body); font-weight:600; cursor:pointer; }
  .internal-publishing button:hover { border-color:var(--color-accent-primary,#0f766e); background:var(--color-soft,#eef5f3); }
  .internal-publishing .publishing-primary { background:var(--color-accent-primary,#0f766e); color:#fff; border-color:var(--color-accent-primary,#0f766e); white-space:nowrap; }
  .internal-publishing .publishing-primary:hover { background:#115e59; }
  .internal-publishing .publishing-details { border-color:transparent; background:transparent; }
  .internal-publishing .publishing-reopen { color:var(--color-danger,#a33c32); font-weight:400; }
  .internal-publishing button:disabled { opacity:.55; cursor:wait; }
  .internal-publishing :is(button,input,select,summary):focus-visible { outline:3px solid var(--color-accent-primary,#0f766e); outline-offset:3px; }
  .publishing-stats { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); border:1px solid var(--publishing-border); border-radius:8px; overflow:hidden; margin-bottom:12px; background:var(--color-canvas,#f8faf9); }
  .publishing-stats > div { padding:9px 12px; border-right:1px solid var(--publishing-border); }
  .publishing-stats > div:last-child { border:0; }
  .publishing-stats span { display:block; font-size:var(--font-size-small); color:var(--color-ink-muted,#52636c); margin-bottom:6px; }
  .publishing-stats strong { font-size:23px; font-weight:650; font-variant-numeric:tabular-nums; }
  .publishing-toolbar { display:flex; flex-wrap:wrap; align-items:end; gap:10px; margin-bottom:10px; }
  .publishing-toolbar label { display:flex; flex-direction:column; gap:6px; font-size:var(--font-size-small); font-weight:600; }
  .publishing-toolbar label:first-child { flex:1; min-width:200px; }
  .publishing-toolbar input,.publishing-toolbar select { min-height:38px; padding:8px 10px; border:1px solid var(--publishing-border); border-radius:6px; font:inherit; color:inherit; background:var(--color-paper,#fff); }
  .publishing-toolbar [data-count] { padding-bottom:10px; font-size:var(--font-size-small); color:var(--color-ink-muted,#52636c); }
  .publishing-table-wrap { overflow-x:auto; border:1px solid var(--publishing-border); border-radius:8px; }
  .publishing-table-wrap:focus-visible { outline:3px solid var(--color-accent-primary,#0f766e); outline-offset:3px; }
  .publishing-scroll-hint { display:none; }
  .internal-publishing table { width:100%; border-collapse:collapse; margin:0; font-size:var(--font-size-body); text-align:left; background:var(--color-paper,#fff); }
  .internal-publishing th,.internal-publishing td { padding:6px 10px; border-bottom:1px solid var(--publishing-border); text-align:left; vertical-align:middle; line-height:1.4; }
  .internal-publishing thead th { padding:8px 10px; background:var(--color-canvas,#f8faf9); color:var(--color-ink-muted,#52636c); font-size:var(--font-size-small); font-weight:600; white-space:nowrap; }
  .internal-publishing table button { min-height:28px; padding:4px 9px; font-size:var(--font-size-body); line-height:1.4; }
  .publishing-table > tbody > tr:first-child:hover { background:var(--color-canvas,#f8faf9); }
  .publishing-table > tbody > tr:first-child > th { font-weight:650; white-space:nowrap; }
  .publishing-academic { min-width:155px; max-width:320px; line-height:1.4; }
  .publishing-registers { min-width:240px; max-width:380px; overflow-wrap:anywhere; font-variant-numeric:tabular-nums; }
  .publishing-student-results { display:grid; gap:5px; list-style:none; margin:0; padding:0; }
  .publishing-student-results li { display:flex; align-items:center; min-height:22px; line-height:22px; }
  .publishing-student-identity { min-width:0; white-space:nowrap; }
  .publishing-results { white-space:nowrap; }
  .publishing-score { display:inline-block; flex-shrink:0; padding:1px 6px; border-radius:var(--pill-radius); background:var(--color-soft,#eef2f4); color:var(--color-ink,#172f35); font-size:var(--font-size-small); line-height:1.4; font-variant-numeric:tabular-nums; white-space:nowrap; }
  .internal-publishing small { display:block; margin-top:2px; font-size:var(--font-size-small); font-weight:400; line-height:1.35; color:var(--color-ink-muted,#52636c); overflow-wrap:anywhere; }
  .publishing-badge { display:inline-block; padding:3px 6px; font-size:var(--font-size-small); line-height:1.3; border-radius:var(--pill-radius); background:var(--color-soft,#eef2f4); white-space:nowrap; }
  .publishing-badge[data-state="READY_TO_PUBLISH"] { color:var(--color-info); background:var(--color-info-tint); }
  .publishing-badge[data-state="PUBLISHED"] { color:var(--color-success); background:var(--color-success-tint); }
  .internal-publishing span[data-tooltip] { cursor:help; }
  .internal-publishing span[data-tooltip]:focus-visible { outline:3px solid var(--color-accent-primary,#0f766e); outline-offset:3px; }
  .internal-publishing span[data-tooltip] { cursor:help; }
  .internal-publishing span[data-tooltip]:focus-visible { outline:3px solid var(--color-accent-primary,#0f766e); outline-offset:3px; }
  .publishing-badge[data-state="PARTIAL_OR_EXCEPTION"],.publishing-badge[data-state="PARTIALLY_PUBLISHED"] { color:var(--color-warning); background:var(--color-warning-tint); }
  .publishing-actions { display:flex; align-items:center; gap:4px; flex-wrap:wrap; }
  .internal-publishing table .publishing-icon-action { display:inline-flex; align-items:center; justify-content:center; width:32px; min-width:32px; height:32px; padding:6px; }
  .publishing-icon-action .lucide-icon { width:18px; height:18px; vertical-align:middle; }
  .internal-publishing table .publishing-icon-action { display:inline-flex; align-items:center; justify-content:center; width:32px; min-width:32px; height:32px; padding:6px; }
  .publishing-icon-action .lucide-icon { width:18px; height:18px; vertical-align:middle; }
  .publishing-detail { padding:4px 0; }
  .publishing-table [data-detail-row] > td { background:var(--color-canvas,#f8faf9); padding:8px 10px; }
  .publishing-students th,.publishing-students td { min-width:120px; overflow-wrap:anywhere; }
  .publishing-allowed { color:var(--color-ink,#172f35); }
  .publishing-secondary { display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px; margin-top:10px; font-size:var(--font-size-small); color:var(--color-ink-muted,#52636c); }
  .review-history { margin-top:16px; border-top:1px solid var(--color-border,#e2e8f0); padding-top:12px; font-size:12px; }
  .review-history summary { cursor:pointer; font-weight:600; color:var(--color-ink-muted,#475569); }
  .review-history summary span { margin-left:6px; padding:2px 7px; border-radius:var(--pill-radius); background:var(--color-border,#e2e8f0); font-size:11px; }
  .review-history ol { list-style:none; padding:0; margin:8px 0 0; }
  .review-history li { padding:10px 0; border-bottom:1px solid var(--color-border,#e2e8f0); overflow-wrap:anywhere; }
  .review-history li:last-child { border-bottom:0; }
  .review-history-heading { display:flex; flex-wrap:wrap; justify-content:space-between; gap:4px 12px; }
  .review-history time, .review-history small { color:var(--color-ink-muted,#64748b); font-size:11px; }
  .review-history-status { margin-top:4px; color:var(--color-ink-muted,#475569); }
  .review-history li p { margin:4px 0; white-space:pre-line; }
  .publishing-error { padding:12px; margin:0 0 12px; background:#fff4dc; color:#80520c; border-radius:6px; font-size:var(--font-size-body); overflow-wrap:anywhere; }
  .publishing-result { padding:10px 0; font-size:var(--font-size-body); }
  .internal-publishing [data-notice]:not(:empty) { margin-bottom:12px; font-size:var(--font-size-body); }
  .publishing-empty { padding:24px; text-align:center; font-size:var(--font-size-body); color:var(--color-ink-muted,#52636c); }
  .publishing-sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
  .internal-publishing [hidden] { display:none !important; }
  @media(max-width:640px) {
    .internal-publishing table .publishing-icon-action { width:36px; min-width:36px; height:36px; padding:8px; }
    .internal-publishing table .publishing-icon-action { width:36px; min-width:36px; height:36px; padding:8px; }
    .internal-publishing table button { min-height:36px; padding:7px 10px; }
    .publishing-scroll-hint { display:block; margin:0 0 8px; font-size:var(--font-size-small); color:var(--color-ink-muted,#52636c); }
    .publishing-heading { align-items:center; flex-direction:row; gap:10px; }
    .publishing-stats { grid-template-columns:repeat(3,minmax(0,1fr)); }
    .publishing-stats > div { padding:10px; border-bottom:1px solid var(--publishing-border); }
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
  .expand-hint { font-size: 12px; color: #3b5bdb; font-style: normal; }
  body {
    font-family: 'Segoe UI', Helvetica, Arial, sans-serif;
    color: #1f2430;
    background: #f4f5f7;
    margin: 0;
    padding: 0;
  }
  h1 {
    font-size: 20px;
    font-weight: 700;
    color: #1f2430;
    margin: 0 0 4px 0;
  }
  h3 {
    font-size: 15px;
    font-weight: 600;
    margin: 0 0 8px 0;
  }
  p {
    margin: 0 0 10px 0;
    line-height: 1.5;
  }
  a {
    color: #3b5bdb;
    text-decoration: none;
  }
  a:hover {
    text-decoration: underline;
  }
  .signed-in-as {
    font-size: 12.5px;
    color: #8b8f99;
    margin: 0 0 20px 0;
  }`;
}

// ===================================================================
// BADGE & STATUS COLORS
// ===================================================================
function getStatusBadgeStyles() {
  return `
  .status-badge {
    display: inline-block;
    padding: 3px 10px;
    border-radius:var(--pill-radius);
    font-size: 11px;
    font-weight: 600;
    text-decoration: none;
    white-space: nowrap;
  }
  .status-badge.green { background:var(--color-success-tint); color:var(--color-success); }
  .status-badge.orange { background:var(--color-warning-tint); color:var(--color-warning); }
  .status-badge.blue { background:var(--color-info-tint); color:var(--color-info); }
  .status-badge.gray { background: #f1f2f4; color: #6b7280; }
  .status-badge.red { background:var(--color-danger-tint); color:var(--color-danger); }
  a.status-badge:hover { filter: brightness(0.95); }
  .status-badge.empty-inline { color: #b0b4bc; font-style: italic; }`;
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
    padding: 12px 6px;
    border-radius: 12px;
    background: #ffffff;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
  }
  .stat-num {
    display: block;
    font-size: 20px;
    font-weight: 700;
  }
  .stat-label {
    display: block;
    font-size: 12px;
    margin-top: 0;
    letter-spacing: 0.4px;
    color: #8b8f99;
  }
  .stat.orange .stat-num { color: #f97316; }
  .stat.blue .stat-num { color: #6366f1; }
  .stat.green .stat-num { color: #16a34a; }
  .stat.red .stat-num { color: #dc2626; }
  .stat.gray .stat-num { color: #6b7280; }`;
}

// ===================================================================
// BUTTONS
// ===================================================================
function getButtonStyles() {
  return `
  button,
  .btn-outline {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 8px 16px;
    border-radius: 999px;
    font-size: 13px;
    font-weight: 600;
    cursor: pointer;
    text-decoration: none;
    border: 1px solid #dcdfe4;
  }
  .btn-outline {
    background: #ffffff;
    color: #4b5160;
  }
  .btn-outline.reject {
    color: #b91c1c;
    border-color: #f3c6c6;
  }
  .btn-outline:hover {
    background: #f4f5f7;
  }
  .btn-solid {
    background: #1f2430;
    color: #ffffff;
    border: none;
  }
  .btn-solid:hover {
    background: #333a4a;
  }
  button:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
  .mini {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 6px 14px;
    border-radius: 999px;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    border: 1px solid #dcdfe4;
    background: #fff;
    color: #4b5160;
    margin-right: 6px;
    margin-bottom: 4px;
  }
  .mini:last-child { margin-right: 0; }
  .mini.approve {
    background: #1f2430;
    color: #ffffff;
    border: none;
  }
  .mini.approve:hover { background: #333a4a; }
  .mini.revise {
    color: #9a5b0c;
    border-color: #f3dcae;
    background: #fff8ec;
  }
  .mini.revise:hover { background: #fdf1da; }
  .mini:disabled { opacity: 0.5; cursor: not-allowed; }
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
    padding: 8px 10px;
    margin-bottom: 10px;
    border: 1px solid #dcdfe4;
    border-radius: 8px;
    font-size: 14px;
    font-family: inherit;
  }
  textarea {
    min-height: 46px;
  }
  input:focus,
  textarea:focus {
    outline: none;
    border-color: #3b5bdb;
  }
  .field-label {
    display: block;
    font-size: 12px;
    font-weight: 600;
    color: #4b5160;
    margin-bottom: 4px;
  }
  .search-box {
    width: 100%;
    box-sizing: border-box;
    padding: 10px 14px;
    margin-bottom: 12px;
    border: 1px solid #dcdfe4;
    border-radius: 10px;
    font-size: 14px;
  }`;
}

// ===================================================================
// CARDS (Guide/Reviewer dashboard)
// ===================================================================
function getCardStyles() {
  return `
  .event-card {
    background: #ffffff;
    border-radius: 14px;
    margin-bottom: 16px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04);
    overflow: hidden;
  }
  .card-accent { height: 5px; }
  .card-accent.gray { background: #b9bcc4; }
  .card-accent.orange { background: linear-gradient(90deg, #f59e0b, #f97316); }
  .card-accent.blue { background: linear-gradient(90deg, #3b82f6, #6366f1); }
  .card-accent.green { background: linear-gradient(90deg, #22c55e, #16a34a); }
  .card-accent.red { background: linear-gradient(90deg, #ef4444, #dc2626); }
  .card-body { padding: 18px 20px 4px 20px; }
  .card-top-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 12px;
  }
  .tag {
    display: inline-flex;
    align-items: center;
    font-size: 11px;
    font-weight: 700;
    padding: 5px 11px;
    border-radius:var(--pill-radius);
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  .tag.gray { color: #5b5f6b; background: #eef0f3; }
  .tag.orange { color:var(--color-warning); background:var(--color-warning-tint); }
  .tag.blue { color:var(--color-info); background:var(--color-info-tint); }
  .tag.green { color:var(--color-success); background:var(--color-success-tint); }
  .tag.red { color:var(--color-danger); background:var(--color-danger-tint); }
  .team-chip {
    font-size: 12px;
    color: #8b8f99;
    background: #f4f5f7;
    padding: 4px 10px;
    border-radius:var(--pill-radius);
  }
  .card-title {
    font-size: 17px;
    font-weight: 700;
    color: #1f2430;
    margin: 0 0 10px 0;
    line-height: 1.35;
  }
  .card-sub {
    font-size: 13px;
    color: #6b7280;
    margin: 0 0 8px 0;
  }
  .card-sub a {
    color: #3b5bdb;
    word-break: break-all;
  }
  .card-sub a:hover { text-decoration: underline; }
  .card-desc {
    font-size: 13.5px;
    color: #4b5160;
    line-height: 1.5;
    margin: 0 0 10px 0;
  }
  .card-desc.clickable { cursor: pointer; }
  .flag {
    font-size: 12.5px;
    color:var(--color-warning);
    background:var(--color-warning-tint);
    padding: 8px 10px;
    border-radius:var(--pill-radius);
    margin: 0 0 10px 0;
  }
  .status-label {
    font-size: 12.5px;
    color: #8b8f99;
    margin: 0 0 10px 0;
  }
  .card-divider {
    height: 1px;
    background: #eef0f3;
    margin: 6px 20px 0 20px;
  }
  .card-footer-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 12px 20px;
  }
  .footer-count {
    font-size: 12.5px;
    color: #6b7280;
    display: flex;
    align-items: center;
  }
  .footer-actions {
    display: flex;
    gap: 8px;
  }
  .doc-links {
    font-size: 11px;
    color: #6b7280;
    margin-top: 3px;
  }
  .doc-links a { color: #3b5bdb; }
  .empty {
    color: #8b8f99;
    font-size: 14px;
    padding: 4px 0 16px 0;
  }`;
}

// ===================================================================
// TABLES (Coordinator/Reviewer dashboard)
// ===================================================================
function getTableStyles() {
  return `
  .coord-table {
    width: 100%;
    border-collapse: collapse;
    background: #fff;
    border-radius: 10px;
    overflow: hidden;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    margin-bottom: 18px;
  }
  .coord-table th {
    text-align: left;
    font-size: 11px;
    text-transform: uppercase;
    letter-spacing: 0.4px;
    color: #8b8f99;
    padding: 10px 12px;
    background: #f9fafb;
    border-bottom: 1px solid #eef0f3;
  }
  .coord-table td {
    padding: 8px 12px;
    font-size: 13px;
    border-bottom: 1px solid #f2f3f5;
    vertical-align: middle;
  }
  .coord-table tr:last-child td { border-bottom: none; }
  .coord-table.read-only td { color: #4b5160; }
  .team-cell {
    font-weight: 600;
    white-space: nowrap;
  }
  .flag-text {
    font-size: 11px;
    color: #9a5b0c;
    margin-top: 3px;
  }
  .title-cell {
    max-width: 260px;
    white-space: normal;
    word-wrap: break-word;
    line-height: 1.4;
  }
  .repo-cell a,
  .coord-table.read-only a {
    color: #3b5bdb;
    text-decoration: none;
    font-size: 12px;
  }
  .actions-cell { white-space: nowrap; }
  .notes-cell { min-width: 200px; }
  .notes-cell input {
    width: 100%;
    box-sizing: border-box;
    padding: 8px 10px;
    border: 1px solid #dcdfe4;
    border-radius: 8px;
    font-size: 13px;
    font-family: inherit;
  }
  .notes-cell input:focus {
    outline: none;
    border-color: #3b5bdb;
  }
  .status-cell { font-size: 12px; color: #6b7280; }
  .coord-empty {
    color: #8b8f99;
    font-style: italic;
    text-align: center;
    padding: 16px !important;
  }`;
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
    margin-bottom: 12px;
  }
  .filter-tab {
    padding: 7px 14px;
    border-radius: 999px;
    font-size: 12.5px;
    font-weight: 600;
    border: 1px solid #dcdfe4;
    background: #fff;
    color: #4b5160;
    cursor: pointer;
  }
  .filter-tab:hover { background: #f4f5f7; }
  .filter-tab.active {
    background: #1f2430;
    color: #fff;
    border-color: #1f2430;
  }`;
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
    font-size: 14px;
    font-weight: 600;
    padding: 10px 14px;
    background: #fff;
    border-radius: 10px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.05);
    list-style: none;
  }
  .collapsible summary::-webkit-details-marker { display: none; }
  .collapsible summary::before { content:''; display:inline-block; width:16px; height:16px; margin-right:5px; vertical-align:-3px; background:currentColor; mask:url("data:image/svg+xml,${encodeURIComponent(renderLucideIcon_('chevron-right'))}") center/contain no-repeat; }
  .collapsible[open] summary::before { transform:rotate(90deg); }
  .collapsible table { margin-top: 8px; }`;
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
    background:var(--color-paper);
    color:var(--color-ink);
    border:1px solid var(--color-border);
    margin-top:12px;
    --loading-surface:var(--color-paper);
  }
  .dash-hero h2 {
    font-family: var(--editorial-body);
    font-size: 26px;
    font-weight: 700;
    margin: 0 0 4px 0;
    color: var(--color-ink);
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .mono-tag {
    font-family: 'JetBrains Mono', monospace;
    background: var(--color-accent-tint);
    color: var(--color-accent-primary);
    padding: 3px 10px;
    border-radius: 6px;
    font-size: 20px;
    line-height: 1;
  }
  .hero-sub {
    font-size: 13px;
    color: var(--color-ink-muted);
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
    background: var(--color-paper);
    border: 1px solid var(--color-border);
    border-radius:var(--pill-radius);
    padding: 6px 14px 6px 6px;
  }
  .avatar {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--editorial-body);
    font-size: 12px;
    font-weight: 700;
    color: var(--color-accent-primary);
    background: var(--color-accent-tint);
    flex-shrink: 0;
  }
  .member-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--color-ink);
    line-height: 1.3;
  }
  .you-tag {
    font-size: 10px;
    font-weight: 600;
    color: var(--color-accent-primary);
  }
  .member-reg {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: var(--color-ink-muted);
  }
  /* Compact student roster, with consistent rows instead of separate chips. */
  .student-dashboard .dash-hero { margin-bottom:8px; }
  .student-dashboard .dash-hero h2 { font-size:20px; gap:8px; margin:0; }
  .student-dashboard .mono-tag { font-size:15px; padding:3px 7px; }
  .student-dashboard .team-roster { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:0; margin-bottom:16px; padding:4px 10px; background:var(--color-paper); border:1px solid var(--color-border); border-radius:8px; }
  .student-dashboard .member-chip { min-width:0; gap:7px; padding:6px 8px; border:0; background:transparent; }
  .student-dashboard .member-info { min-width:0; }
  .student-dashboard .member-name { font-size:12px; overflow-wrap:anywhere; }
  .student-dashboard .avatar { width:26px; height:26px; font-size:10px; }
  .student-dashboard .member-reg { font-size:10px; line-height:15px; }
  @media(max-width:760px) {
    .student-dashboard .team-roster { grid-template-columns:minmax(0,1fr); padding:2px 10px; margin-bottom:12px; }
    .student-dashboard .member-chip { padding:5px 0; }
    .student-dashboard .member-chip + .member-chip { border-top:1px solid var(--color-border); }
    .student-dashboard .member-info { display:flex; align-items:baseline; justify-content:space-between; flex-wrap:wrap; gap:0 8px; flex:1; }
    .student-dashboard .member-name { font-size:11px; line-height:16px; }
    .student-dashboard .member-reg { white-space:nowrap; }
  }
  .stepper { position: relative; }

  .step-row {
    display: flex;
    gap: 16px;
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
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: var(--editorial-body);
    font-weight: 700;
    font-size: 14px;
    flex-shrink: 0;
  }

  .step-node-done {
    background: var(--color-success);
    color: #fff;
  }

  .step-node-waiting {
    background: var(--color-warning);
    color: #fff;
  }

  .step-node-active {
    background: var(--color-accent-primary);
    color: #fff;
  }

  .step-node-locked {
    background: var(--color-soft);
    color: var(--color-ink-muted);
    border: 1px solid var(--color-border);
    font-size: 13px;
  }

  .step-line {
    width: 2px;
    flex: 1;
    min-height: 24px;
    background: var(--color-border);
    margin: 4px 0;
  }

  .step-card {
    flex: 1;
    background: var(--color-paper);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 16px 18px;
    margin-bottom: 16px;
  }

  .step-card-locked h4 {
    color: var(--color-ink-muted);
  }

  .step-card-locked .step-body p {
    color: var(--color-ink-muted);
  }

  .step-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
  }

  .step-header h4 {
    font-family: var(--editorial-body);
    margin: 0;
    font-size: 15px;
    color: var(--color-ink);
    font-weight: 600;
  }

  .step-badge {
    font-size: 11px;
    font-weight: 600;
    padding: 3px 10px;
    border-radius:var(--pill-radius);
    white-space: nowrap;
  }

  .step-badge.done {
    background:var(--color-success-tint);
    color:var(--color-success);
  }

  .step-badge.waiting {
    background:var(--color-warning-tint);
    color:var(--color-warning);
  }

  .step-badge.active {
    background: var(--color-accent-tint);
    color: var(--color-accent-primary);
  }

  .step-badge.locked {
    background: var(--color-soft);
    color: var(--color-ink-muted);
  }

  .step-body p {
    margin: 0 0 6px 0;
    font-size: 13.5px;
    color: var(--color-ink-muted);
    line-height: 1.5;
  }

  .step-detail {
    font-size: 12.5px;
  }

  .step-detail.note {
    color: var(--color-warning);
  }

  .mono-detail {
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    color: var(--color-ink);
    word-break: break-all;
  }

  a.mono-detail.link {
    display: inline-block;
    color: var(--color-accent-primary);
    text-decoration: underline;
    text-decoration-color: var(--color-accent-tint);
    text-underline-offset: 3px;
  }

  a.mono-detail.link:hover {
    color: var(--color-accent-hover);
  }

  .workflow-btn {
    display: inline-block;
    margin-top: 8px;
    padding: 9px 18px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    background: var(--color-accent-primary);
    color: #fff;
    text-decoration: none;
  }

  .workflow-btn:hover {
    background: var(--color-accent-hover);
  }
  .workflow-btn[hidden] { display: none; }

  .student-project-setup, .student-weekly-card { margin:0 0 24px; padding:24px; border:1px solid var(--color-border); border-radius:12px; background:var(--color-paper); }
  .student-project-setup > summary, .student-project-setup > header { display:flex; align-items:center; gap:12px; flex-wrap:wrap; }
  .student-project-setup > summary { cursor:pointer; list-style:none; }
  .student-project-setup > summary::-webkit-details-marker { display:none; }
  .student-setup-title { font-size:20px; font-weight:700; margin-right:auto; }
  .setup-view, .setup-hide { padding:8px 14px; border:1px solid var(--color-border); border-radius:8px; }
  .student-project-setup .setup-hide, .student-project-setup[open] .setup-view { display:none; }
  .student-project-setup[open] .setup-hide { display:inline; }
  .student-setup-steps { margin-top:20px; display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:20px; }
  .student-setup-steps .step-row { margin:0; min-width:0; }
  .student-setup-steps .step-card { min-width:0; }
  .student-setup-steps .step-line { display:none; }
  .student-setup-pending { margin-top:16px; padding:0 14px; border-left:3px solid var(--color-accent-primary); }
  @media(min-width:1000px) {
    .student-setup-steps { display:flex; flex-wrap:wrap; }
    .student-setup-steps > .step-row { flex:1 1 18rem; }
    .student-setup-steps > .step-row:first-child { flex:2 1 44rem; }
    .student-team-overview { margin-bottom:16px; }
    .student-team-overview .student-project-setup { padding:14px 16px; margin-bottom:0; }
    .student-team-overview:has(> details.student-project-setup:not([open])) { display:grid; grid-template-columns:minmax(0,1fr) 290px; gap:12px; align-items:stretch; }
    .student-team-overview:has(> details.student-project-setup:not([open])) .team-roster { margin-bottom:0; }
    .student-team-overview > details.student-project-setup:not([open]) { display:flex; align-items:center; padding:10px 14px; }
    .student-team-overview > details.student-project-setup:not([open]) > summary { width:100%; gap:8px; flex-wrap:nowrap; }
    .student-team-overview .setup-view, .student-team-overview .setup-hide { padding:5px 9px; }
  }
  .student-weekly-card > h3 { margin:0; font-size:20px; }
  .weekly-card-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; }
  .weekly-card-heading h3 { margin:0; }
  #studentWeeklyProgress [data-weekly-status]:empty, #studentWeeklyProgress [data-weekly-read]:empty { display:none; }
  #studentWeeklyProgress .weekly-week-switcher { display:flex; flex-wrap:wrap; gap:6px; margin-top:16px; }
  #studentWeeklyProgress .weekly-closed-state { margin:12px 0 0; font-size:13px; }
  #studentWeeklyProgress .weekly-field textarea { min-height:88px; padding:12px 14px; border:1px solid var(--color-border); border-radius:10px; background:var(--color-paper); font-size:14px; line-height:1.5; }
  #studentWeeklyProgress .weekly-field label { margin:18px 0 8px; font-weight:600; font-size:14px; }
  #studentWeeklyProgress .weekly-progress-form > button { margin:16px 0 0; }
  #studentWeeklyProgress [data-weekly-history] { border-top:1px solid var(--color-border); margin-top:20px; padding-top:4px; }
  #studentWeeklyProgress summary { cursor:pointer; font-size:13px; color:var(--color-ink-muted); }
  #studentWeeklyProgress .weekly-progress-form { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:0 20px; }
  .weekly-form-header, .weekly-progress-form .weekly-github-activity { grid-column:1 / -1; }
  .weekly-progress-form > button { grid-column:1 / -1; justify-self:start; margin-top:16px; }
  @media(max-width:640px) {
    .student-project-setup, .student-weekly-card { padding:16px; }
    .student-setup-steps, #studentWeeklyProgress .weekly-progress-form { grid-template-columns:minmax(0,1fr); }
  }
  .weekly-github-activity { margin-top:16px; padding:0; border:0; border-top:1px solid var(--color-border); background:transparent; }
  .weekly-github-activity .heading-row { margin-bottom:10px; }
  .weekly-github-activity ul { list-style:none; margin:0; padding:0; }
  .weekly-github-activity li { display:flex; flex-wrap:wrap; gap:8px 12px; padding:8px 0; border-top:1px solid var(--color-border); }
  .weekly-github-activity li span { flex:1 1 220px; overflow-wrap:anywhere; }
  .weekly-github-activity time { font-size:.85rem; }
  .weekly-github-activity a { color:var(--color-accent-primary); }
  .student-summary-grid { display:grid; grid-template-columns:minmax(0,2fr) minmax(0,1fr); gap:24px; margin-top:24px; align-items:stretch; }
  .student-activity-row { display:grid; grid-template-columns:auto minmax(0,1fr) auto; gap:16px; align-items:center; padding:16px 0; border-bottom:1px solid var(--color-border); }
  .student-activity-row:last-child { border-bottom:0; }
  .student-activity-row time { color:var(--color-ink-muted); font-size:var(--font-size-small); }
  .weekly-log-history.is-future { opacity:.65; color:var(--color-ink-muted); }
  .weekly-log-answer { white-space:pre-wrap; overflow-wrap:anywhere; }
  .weekly-log-history details > h4 { margin:14px 0 4px; }
  .weekly-log-history details > .weekly-log-answer { margin:0; }
  .weekly-log-history details > h4 + :is(ul,p) { margin-top:4px; }
  @media(max-width:800px) { .student-summary-grid { grid-template-columns:1fr; } .student-activity-row { grid-template-columns:auto 1fr; } .student-activity-row time { grid-column:2; } }
  .student-summary-card { min-width:0; padding:24px 28px; background:var(--color-paper); border:1px solid var(--color-border); border-radius:var(--editorial-radius); }
  .student-summary-card > header { padding-bottom:16px; border-bottom:1px solid var(--color-border); }
  .student-summary-card > header h3 { margin:0; }
  .student-summary-card a, .student-view-marks { color:var(--color-accent-primary); text-decoration:underline; }
  .student-assessments-card .assessment-section { margin:0; padding:0; border:0; background:transparent; box-shadow:none; }
  .student-assessment-row, .student-assessment-result > summary { display:flex; align-items:center; gap:10px; padding:14px 0; }
  .student-assessment-row strong, .student-assessment-result > summary strong { margin-right:auto; }
  .student-assessment-result > summary { cursor:pointer; flex-wrap:wrap; }
  .student-assessment-details { padding-bottom:16px; }
  .weekly-submission-summary { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:20px; margin:20px 0; }
  .weekly-submission-summary h5 { margin:0 0 8px; }
  .weekly-submission-summary p { margin:0; white-space:pre-wrap; overflow-wrap:anywhere; }
  .weekly-form-actions { grid-column:1 / -1; display:flex; flex-wrap:wrap; align-items:center; gap:12px; margin-top:16px; }
  @media(max-width:640px) { .weekly-submission-summary { grid-template-columns:minmax(0,1fr); } }
  .weekly-progress-form { margin-top: 18px; }
  .weekly-form-header { margin-top:16px; padding-bottom:18px; border-bottom:1px solid var(--color-border); }
  .weekly-status-strip { display:flex; flex-wrap:wrap; gap:6px; }
  .weekly-state { padding:3px 8px; border:1px solid var(--color-border); border-radius:6px; font-size:11px; font-weight:700; letter-spacing:.04em; color:var(--color-accent-primary); background:var(--color-paper); }
  .weekly-state[data-state="LATE"] { color:var(--color-warning,#92400e); background:var(--color-warning-tint,#fffbeb); }
  #studentWeeklyProgress .weekly-state[data-tone="success"] { color:var(--color-success); background:var(--color-success-tint); border-color:var(--color-success-tint); }
  #studentWeeklyProgress .weekly-state[data-tone="warning"] { color:var(--color-warning); background:var(--color-warning-tint); border-color:var(--color-warning-tint); }
  #studentWeeklyProgress .weekly-state[data-tone="danger"] { color:var(--color-danger); background:var(--color-danger-tint); border-color:var(--color-danger-tint); }
  #studentWeeklyProgress .weekly-status-strip { margin-left:auto; }
  #studentWeeklyProgress .weekly-late-date { color:var(--color-ink-muted); }
  #studentWeeklyProgress .weekly-required { color:var(--color-danger); }
  #studentWeeklyProgress .weekly-github-activity { border-top:0; }
  #studentWeeklyProgress .weekly-commit-details { padding:12px 14px; border:1px solid var(--color-border); border-radius:var(--editorial-radius); background:var(--color-soft); margin-bottom:12px; }
  #studentWeeklyProgress .weekly-commit-details > summary { color:var(--color-success); font-weight:600; }
  #studentWeeklyProgress .weekly-dates { display:flex; flex-wrap:wrap; gap:4px 16px; grid-column:1 / -1; margin:0; font-size:12px; line-height:1.6; }
  .weekly-field { min-width:0; }
  .weekly-progress-form textarea::placeholder { color:var(--color-ink-muted,var(--color-ink)); opacity:.65; }

  .weekly-progress-form label { display:block; margin:14px 0 6px; color:var(--color-ink); }
  .weekly-progress-form textarea { display:block; box-sizing:border-box; width:100%; padding:10px 12px; border:1px solid var(--color-border); border-radius:8px; background:var(--color-paper); color:var(--color-ink); font:inherit; resize:vertical; }
  .weekly-progress-form textarea:focus-visible { outline:2px solid var(--color-accent-primary); outline-offset:2px; }
  .weekly-progress-form :disabled { opacity:.65; }
  #studentWeeklyProgress details { margin-top:12px; overflow-wrap:anywhere; }
  #studentWeeklyProgress .workflow-btn { margin:8px 8px 0 0; }
  .github-team-status { list-style:none; margin:6px 0; padding:0; }
  .github-member-status { display:grid; grid-template-columns:12ch 1fr; align-items:center; gap:10px; padding:6px 0; line-height:1.4; }
  .github-member-status + .github-member-status { border-top:1px solid var(--color-border); }
  .github-member-register { flex-shrink:0; font-weight:600; font-variant-numeric:tabular-nums; }
  .github-member-separator { display:none; }
  .github-member-state { display:flex; align-items:center; gap:6px; min-width:0; font-size:13px; color:var(--color-warning); }
  .github-member-state .lucide-icon { margin:0; }
  .github-member-status.is-joined .github-member-state { color:var(--color-success); }
  .github-member-status.is-missing .github-member-state { color:var(--color-danger); }
  .github-form-jump { appearance:none; border:0; background:none; padding:0; margin:0; color:inherit; font:inherit; line-height:inherit; text-align:left; text-decoration:underline; text-underline-offset:3px; cursor:pointer; }
  .github-form-jump:focus-visible { outline:2px solid currentColor; outline-offset:3px; }
  #studentGithubProfile { scroll-margin-top:80px; }
  .github-team-repository { display:grid; grid-template-columns:16px minmax(0,1fr); align-items:start; gap:8px; padding:8px 0; border-top:1px solid var(--color-border); font-size:13px; }
  .github-repository-label { display:flex; align-items:center; gap:7px; font-weight:600; }
  .github-team-repository a { display:block; min-width:0; white-space:normal; overflow-wrap:anywhere; word-break:normal; line-height:1.4; }
  @media(min-width:1000px) {
    .github-team-repository a { white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }
  }
  .github-username-form { margin-top:8px; padding-top:10px; border-top:1px solid var(--color-border); }
  .github-username-form > p { margin:4px 0 8px; font-size:13px; line-height:1.4; }
  .github-username-form > button[type="submit"] { margin-top:8px; }
  @media(max-width:420px) {
    .github-member-status { grid-template-columns:11ch minmax(0,1fr); gap:8px; }
    .github-member-separator { display:none; }
  }
  .github-username-form[hidden] { display: none; }
  .github-username-form label { display: block; margin-bottom: 6px; }
  .github-username-form input {
    display: block; box-sizing: border-box; width: 100%; max-width: 360px;
    padding: 10px 12px; border: 1px solid var(--color-border); border-radius: 8px;
    background: var(--color-paper); color: var(--color-ink); font: inherit;
  }
  .github-username-form input:focus-visible { outline: 2px solid var(--color-accent-primary); outline-offset: 2px; }
  .github-username-form button { border: 0; cursor: pointer; font-family: inherit; }
  .github-username-form :disabled { opacity: .65; cursor: wait; }
  #githubSubmitStatus { font-size: 13px; }

  .workflow-btn.secondary {
    background: transparent;
    color: var(--color-ink);
    border: 1px solid var(--color-border);
  }

  .workflow-btn.secondary:hover {
    border-color: var(--color-accent-primary);
    color: var(--color-accent-primary);
  }

  .marks-card {
    background: var(--color-paper);
    border: 1px solid var(--color-border);
    border-radius: 8px;
    padding: 16px 18px;
    margin-top: 4px;
  }

  .marks-card h3 {
    font-family: var(--editorial-body);
    margin: 0 0 10px 0;
    font-size: 15px;
    color: var(--color-ink);
    font-weight: 600;
  }

  .marks-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
    border-top: 1px solid var(--color-border);
    font-size: 13.5px;
    color: var(--color-ink);
  }

  .marks-row:first-of-type {
    border-top: none;
  }

  .marks-value {
    font-family: 'JetBrains Mono', monospace;
    font-weight: 600;
    color: var(--color-success);
  }

  .marks-pending {
    font-size: 12px;
    color: var(--color-ink-muted);
    font-style: italic;
  }

  .announcement-card {
    margin-top: 18px;
    background: #fff;
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: 14px;
    padding: 16px 18px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  }
  .announcement-header { display:flex; flex-direction:row; flex-wrap:nowrap; align-items:flex-start; justify-content:space-between; gap:12px; margin-bottom:24px; }
  .announcement-header > div:first-child { min-width:0; flex:1; }
  .announcement-header > .announcement-refresh-btn { flex-shrink:0; white-space:nowrap; }
  .announcement-title-row { display:flex; align-items:center; gap:10px; }
  .announcement-tab-surface .announcement-header h2 { margin:0; color:#182230; font-size:var(--heading-content, 23px); font-weight:600; letter-spacing:-.025em; }
  .announcement-count { display:inline-flex; align-items:center; justify-content:center; min-width:28px; height:26px; padding:0 8px; border-radius:var(--pill-radius); background:#ede9fe; color:#6941c6; font-size:12px; font-weight:700; }
  .announcement-subtitle { margin:7px 0 0; color:#667085; font-size:13px; line-height:1.5; }
  .announcement-actions { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
  .announcement-add-btn, .announcement-refresh-btn { display:inline-flex; align-items:center; justify-content:center; min-height:42px; padding:10px 15px; border:1px solid #d0d5dd; border-radius:10px; font-family:inherit; font-size:13px; font-weight:600; text-decoration:none; cursor:pointer; transition:background .15s, box-shadow .15s; }
  .announcement-refresh-btn { background:#fff; color:#344054; }
  .announcement-refresh-btn:hover { background:#f2f4f7; }
  .announcement-refresh-btn:disabled { cursor:wait; color:#667085; background:#f2f4f7; }
  .announcement-add-btn { background:#6941c6; border-color:#6941c6; color:#fff; box-shadow:0 2px 4px rgba(105,65,198,.16); }
  .announcement-add-btn:hover { background:#53389e; color:#fff; text-decoration:none; }
  .announcement-tab-surface :is(a,button,summary):focus-visible { outline:3px solid #9e77ed; outline-offset:4px; }
  .announcement-feed-card { min-width:0; padding:16px; background:var(--color-paper, #fff); border:1px solid var(--color-border, #e4e7ec); border-radius:12px; }
  .announcement-list { display:grid; gap:10px; }
  .announcement-tab-surface [hidden] { display:none !important; }
  .announcement-search-bar { display:flex; align-items:center; flex-wrap:wrap; gap:10px; }
  .announcement-search-bar label { width:100%; color:#344054; font-size:13px; font-weight:600; }
  .announcement-search-bar input { flex:1; min-width:160px; width:auto; min-height:44px; margin:0; padding:10px 14px; border:1px solid #d0d5dd; border-radius:10px; background:#fff; color:#182230; font:inherit; font-size:14px; }
  .announcement-search-bar input::placeholder { color:#667085; }
  .announcement-search-bar input:focus-visible { outline:3px solid #9e77ed; outline-offset:2px; }
  .announcement-results { margin:14px 0; color:#667085; font-size:13px; }
  .announcement-pagination { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; margin-top:20px; color:#475467; font-size:13px; }
  .announcement-pagination button:disabled { cursor:default; opacity:.55; }
  .announcement-item { padding:14px 16px; background:#fff; border:1px solid #e4e7ec; border-radius:10px; box-shadow:0 2px 4px rgba(16,24,40,.025); overflow-wrap:anywhere; }
  .announcement-meta { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:6px 16px; margin-bottom:7px; }
  .announcement-date { color:#667085; font-size:12px; font-weight:500; }
  .announcement-message, .announcement-details p, .announcement-preview { margin:0; color:#182230; font-size:14px; line-height:1.55; white-space:pre-wrap; }
  .announcement-footer { display:flex; align-items:center; justify-content:flex-start; flex-wrap:wrap; gap:8px 16px; margin-top:10px; }
  .announcement-audience { display:flex; align-items:center; flex-wrap:wrap; gap:5px; margin:0; font-size:11px; }
  .announcement-audience-label { color:#667085; margin-right:2px; }
  .announcement-audience-chip { padding:2px 7px; background:#f2f4f7; border:1px solid #eaecf0; border-radius:var(--pill-radius); color:#475467; font-weight:600; }
  .announcement-details summary { cursor:pointer; list-style:none; }
  .announcement-details summary::-webkit-details-marker { display:none; }
  .announcement-expand, .announcement-collapse { display:block; width:fit-content; margin-top:8px; color:#6941c6; font-size:13px; font-weight:600; }
  .announcement-collapse, .announcement-details[open] .announcement-preview, .announcement-details[open] .announcement-expand { display:none; }
  .announcement-details[open] .announcement-collapse { display:block; margin:0 0 10px; }
  .announcement-link { display:inline-flex; align-items:center; gap:8px; margin:0; min-height:32px; padding:5px 9px; background:#f4f0ff; border:1px solid #e9dfff; border-radius:8px; color:#6941c6; font-size:13px; font-weight:600; text-decoration:none; }
  .announcement-link:hover { background:#ede9fe; text-decoration:none; }
  .announcement-empty-state { padding:36px 20px; text-align:center; background:#fff; border:1px dashed #d0d5dd; border-radius:14px; }
  .announcement-empty-icon { display:inline-flex; align-items:center; justify-content:center; width:48px; height:48px; margin-bottom:14px; border-radius:14px; background:#ede9fe; color:#6941c6; }
  .announcement-empty-state h3 { color:#182230; margin:0 0 8px; font-size:16px; }
  .announcement-empty { margin:0; color:#667085; font-size:13px; line-height:1.6; }
  .announcement-status { color:#475467; font-size:13px; margin:0 0 16px; }
  .announcement-status:empty { display:none; }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-results { margin:8px 0; }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-toolbar { display:flex; align-items:center; flex-wrap:wrap; gap:8px; padding:8px; border:1px solid var(--color-border); border-radius:12px; background:var(--color-paper); }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-toolbar-filters { display:flex; align-items:center; flex-wrap:wrap; gap:8px; flex:1 1 500px; min-width:0; }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-toolbar > .announcement-add-btn { flex:none; margin-left:auto; white-space:nowrap; }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-search-field { display:flex; align-items:center; gap:10px; flex:1 1 260px; min-width:0; }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-search-field input { width:100%; min-width:0; margin:0; background:var(--color-canvas); border:0; padding:8px 10px; }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-audience-filters { display:flex; flex-wrap:wrap; gap:6px; }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-audience-filters button,body[data-dashboard-theme="editorial"] .announcement-hub .announcement-load-more button { background:var(--color-paper); color:var(--color-accent-primary); border:1px solid var(--color-border); padding:9px 13px; cursor:pointer; }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-audience-filters button[aria-pressed="true"] { background:var(--color-accent-primary); color:#fff; border-color:var(--color-accent-primary); }
  body[data-dashboard-theme="editorial"] .announcement-hub select { padding:10px; min-height:40px; }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-columns { display:grid; grid-template-columns:minmax(0,1fr) 300px; align-items:start; gap:24px; }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-columns > * { min-width:0; }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-list { gap:20px; }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-date-group,body[data-dashboard-theme="editorial"] .announcement-hub .announcement-templates { background:var(--color-paper); border:1px solid var(--color-border); border-radius:12px; }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-group-heading { padding:13px 22px; margin:0; background:var(--color-canvas); color:var(--color-ink-muted); font:600 12px var(--editorial-body); letter-spacing:.06em; text-transform:uppercase; border-radius:12px 12px 0 0; }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-item { display:flex; align-items:flex-start; gap:16px; padding:18px 22px; border:0; border-top:1px solid var(--color-border); border-radius:0; box-shadow:none; background:transparent; }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-row-icon { display:grid; place-items:center; flex:none; width:42px; height:42px; border-radius:10px; background:var(--color-accent-tint); color:var(--color-accent-primary); font-size:12px; font-weight:700; }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-row-copy { flex:1; min-width:0; }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-row-copy h3 { margin:0 0 5px; font:600 16px/1.4 var(--editorial-body); color:var(--color-ink); letter-spacing:normal; }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-meta { display:block; color:var(--color-ink-muted); font-size:13px; margin:0; }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-date,body[data-dashboard-theme="editorial"] .announcement-hub .announcement-audience { display:inline; font:inherit; color:inherit; }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-row-actions { display:flex; align-items:center; gap:12px; flex:none; }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-link { white-space:nowrap; min-height:40px; padding:8px 12px; background:var(--color-paper); color:var(--color-accent-primary); border:1px solid var(--color-border); }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-full { margin-top:8px; }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-full summary { color:var(--color-accent-primary); cursor:pointer; }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-full p { white-space:pre-wrap; overflow-wrap:anywhere; margin:8px 0 0; color:var(--color-ink); }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-templates { padding:20px; }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-templates h3 { font-size:22px; margin:0 0 6px; }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-templates p { color:var(--color-ink-muted); font-size:13px; }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-templates ol { list-style:none; margin:20px 0 0; padding:0; display:grid; gap:18px; }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-templates li a { display:flex; align-items:center; gap:12px; color:var(--color-ink); }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-templates li a > span:nth-child(2) { flex:1; overflow-wrap:anywhere; }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-step-number { display:grid; place-items:center; flex:none; width:28px; height:28px; border-radius:50%; background:var(--color-accent-primary); color:#fff; font-weight:600; }
  body[data-dashboard-theme="editorial"] .announcement-hub .announcement-load-more { display:flex; justify-content:center; margin-top:20px; }
  @media(max-width:900px) { body[data-dashboard-theme="editorial"] .announcement-hub .announcement-columns { grid-template-columns:minmax(0,1fr); } }
  @media(max-width:640px) {
    body[data-dashboard-theme="editorial"] .announcement-hub .announcement-item { padding:16px; gap:10px; flex-wrap:wrap; }
    body[data-dashboard-theme="editorial"] .announcement-hub .announcement-row-copy { flex-basis:calc(100% - 52px); }
    body[data-dashboard-theme="editorial"] .announcement-hub .announcement-row-actions { margin-left:52px; }
    body[data-dashboard-theme="editorial"] .announcement-hub .announcement-actions > * { flex:initial; }
  }
  .announcement-loading { min-height:70px; }
  .announcement-sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
  @media (max-width:640px) {
    .announcement-header { margin-bottom:20px; }
    .announcement-actions { width:100%; }
    .announcement-actions > * { flex:1; }
    .announcement-item { padding:12px 14px; }
  }
  `;
}


function getSharedTimelineStyles_() {
  return `
  .shared-timeline { --timeline-accent:#2563EB; --timeline-accent-tint:#EFF6FF; --timeline-complete:#16805D; --timeline-line:#B8C9E8; margin:0 0 16px; padding:8px 14px; border:1px solid var(--color-border); border-radius:12px; background:var(--color-paper); color:var(--color-ink); }
  .timeline-heading { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:8px; }
  .shared-timeline .timeline-heading h2 { margin:0; padding:0; border:0; min-height:0; font-size:20px; }
  .timeline-track { display:grid; grid-template-columns:repeat(var(--timeline-stops),minmax(0,1fr)); list-style:none; margin:22px 0 0; padding:0; }
  .timeline-stop { position:relative; min-width:0; padding:0 8px; display:flex; flex-direction:column; align-items:center; gap:2px; text-align:center; }
  .timeline-stop[hidden] { display:none; }
  .timeline-stop:has(~ .timeline-stop:not([hidden]))::after { content:''; position:absolute; left:50%; right:-50%; top:11px; height:2px; background:var(--timeline-line); }
  .timeline-dot { position:relative; z-index:1; flex-shrink:0; display:flex; align-items:center; justify-content:center; box-sizing:border-box; width:22px; height:22px; margin-bottom:0; border:1px solid var(--color-control-border); border-radius:50%; background:var(--color-paper); color:var(--color-ink-muted); }
  .timeline-dot svg { width:14px; height:14px; }
  .timeline-past .timeline-dot { border-color:var(--timeline-complete); background:var(--timeline-complete); color:#FFFFFF; }
  .timeline-past:has(~ .timeline-stop:not([hidden]))::after { background:var(--timeline-complete); }
  .timeline-stop strong { min-height:22px; display:flex; align-items:center; justify-content:center; font-size:13px; font-weight:600; line-height:18px; overflow-wrap:anywhere; }
  .timeline-date, .timeline-timing { font-size:12px; line-height:18px; color:var(--color-ink-muted); }
  .timeline-date { display:inline-block; padding:0 7px; border:1px solid var(--color-control-border); border-radius:4px; background:var(--color-paper); font-variant-numeric:tabular-nums; }
  .timeline-current .timeline-date { border-color:var(--timeline-accent); background:var(--timeline-accent-tint); color:var(--timeline-accent); font-weight:600; }
  .timeline-timing { position:absolute; top:-20px; left:0; right:0; }
  .timeline-past, .timeline-future { color:var(--color-ink-muted); }
  .timeline-current strong { color:var(--timeline-accent); font-weight:700; }
  .timeline-current .timeline-dot { border:2px solid var(--timeline-accent); background:var(--timeline-accent-tint); box-shadow:0 0 0 4px rgba(37,99,235,.12); }
  .timeline-node-core { width:8px; height:8px; border-radius:50%; background:var(--timeline-accent); }
  .timeline-current .timeline-timing { color:var(--timeline-accent); font-size:11px; font-weight:600; }
  .timeline-toggle { padding:4px 0; border:0; background:transparent; color:var(--timeline-accent); font:inherit; font-size:12px; cursor:pointer; }
  .timeline-toggle:hover { text-decoration:underline; }
  .timeline-retry { padding:8px 12px; border:1px solid var(--color-border); border-radius:8px; background:var(--color-paper); color:var(--timeline-accent); font:inherit; cursor:pointer; }
  .timeline-toggle:focus-visible, .timeline-retry:focus-visible { outline:2px solid var(--timeline-accent); outline-offset:3px; }
  .timeline-track.timeline-full { grid-template-columns:1fr; }
  .timeline-full .timeline-stop { padding:0 0 8px 30px; align-items:flex-start; text-align:left; gap:2px; }
  .timeline-full .timeline-stop strong { min-height:0; justify-content:flex-start; }
  .timeline-full .timeline-timing { position:static; order:-1; }
  .timeline-full .timeline-dot { position:absolute; left:0; top:0; }
  .timeline-full .timeline-stop:has(~ .timeline-stop:not([hidden]))::after { left:10px; right:auto; top:11px; height:100%; width:2px; }
  @media(max-width:760px) {
    .shared-timeline { padding:8px 12px; }
    .timeline-heading { gap:4px; }
    .timeline-track { grid-template-columns:1fr; margin-top:6px; }
    .timeline-stop { padding:0 0 8px 30px; align-items:flex-start; text-align:left; gap:2px; }
    .timeline-stop strong { min-height:0; justify-content:flex-start; }
    .timeline-timing { position:static; order:-1; }
    .timeline-dot { position:absolute; left:0; top:0; }
    .timeline-stop:has(~ .timeline-stop:not([hidden]))::after { left:10px; right:auto; top:11px; height:100%; width:2px; }
    .timeline-track:not(.timeline-full) .timeline-stop[data-timeline-mobile="false"] { display:none; }
    .timeline-stop { display:grid; grid-template-columns:minmax(0,1fr) auto; column-gap:8px; row-gap:0; padding:0 0 8px 28px; }
    .timeline-stop strong { font-size:12px; line-height:18px; }
    .timeline-date { align-self:start; padding:0 5px; font-size:11px; line-height:17px; }
    .timeline-timing { grid-column:1 / -1; font-size:10px; line-height:15px; }
    .timeline-current .timeline-timing { font-size:10px; }
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
  const bar = '<span class="app-skeleton-bar" aria-hidden="true"></span>';
  return '<span class="app-skeleton app-skeleton--' + variant + '" role="status" aria-label="' + safeLabel + '">' +
    (variant === 'inline' ? bar : '<span class="app-skeleton-title" aria-hidden="true">' + bar + '</span>' +
    '<span class="app-skeleton-lines" aria-hidden="true">' + bar.repeat(variant === 'drawer' ? 6 : variant === 'status' ? 1 : 3) + '</span>') + '</span>';
}

function getLoadingStyles_() {
  return `
  .app-content-loading { position:relative !important; overflow:hidden; }
  .app-content-loading > :not(.app-loading-overlay) { visibility:hidden !important; }
  .app-content-loading--compact > :not(.app-loading-overlay) { display:none !important; }
  .app-content-loading--compact > .app-loading-overlay { position:relative; inset:auto; }
  .swal2-icon.dashboard-dialog-icon { border:0; color:var(--color-accent-primary,#7C5CFC); }
  .dashboard-dialog-icon .lucide-icon { width:40px; height:40px; }
  .app-loading-overlay { position:absolute; inset:0; z-index:1; display:grid; overflow:hidden; border-radius:inherit; background:var(--loading-surface,#fff); color:inherit; }
  .app-loading-overlay > .app-skeleton--inline { place-self:center; }
  .app-skeleton { display:block; width:100%; padding:20px; box-sizing:border-box; }
  .app-skeleton-bar { display:block; height:14px; border-radius:6px; background:linear-gradient(90deg,var(--skeleton-base,#e4e8ef) 25%,var(--skeleton-highlight,#f2f4f7) 50%,var(--skeleton-base,#e4e8ef) 75%); box-shadow:inset 0 0 0 1px var(--skeleton-edge,#dde3eb); background-size:200% 100%; animation:appSkeletonShimmer 1.6s ease-in-out infinite; }
  .app-skeleton-title { display:block; width:38%; margin-bottom:22px; }
  .app-skeleton-title .app-skeleton-bar { height:20px; }
  .app-skeleton-lines { display:grid; gap:14px; }
  .app-skeleton-lines > :last-child { width:65%; }
  .app-skeleton--panel { min-height:180px; }
  .app-skeleton--drawer { min-height:260px; padding:12px 0; }
  .app-skeleton--inline { display:inline-block; width:72px; padding:0; vertical-align:middle; }
  .app-skeleton--status { max-width:420px; padding:8px 0; }
  .app-skeleton--status .app-skeleton-title { width:85%; margin-bottom:12px; }
  .app-skeleton--status .app-skeleton-title .app-skeleton-bar { height:14px; }
  .app-skeleton--timeline { --skeleton-base:#242e42; --skeleton-highlight:#39425c; --skeleton-edge:#303b51; padding:16px 0 0; }
  .app-skeleton--timeline .app-skeleton-lines { grid-template-columns:repeat(3,minmax(0,1fr)); }
  @keyframes appSkeletonShimmer { from { background-position:200% 0; } to { background-position:-200% 0; } }
  @media (prefers-reduced-motion:reduce) { .app-skeleton-bar { animation:none; } }
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
    --color-canvas:#C6C8CA; --color-paper:#FFFEFC; --color-ink:#252C30; --color-ink-muted:#414B52;
    --color-accent-primary:#304B68; --color-accent-hover:#23394F; --color-accent-secondary:#C5B59E; --color-accent-highlight:#304B68;
    --color-accent-fill:#304B68; --color-accent-fill-hover:#23394F; --color-on-accent:#FFFFFF;
    --color-border:#E6E3DE; --color-control-border:#9A9F97; --color-soft:#F0EDE7; --color-accent-tint:#E9EEF5;
    --color-success:#3A5F43; --color-success-tint:#E9F0E7; --color-warning:#9A4D12; --color-warning-tint:#FFF0DF;
    --color-danger:#A12E29; --color-danger-tint:#F8E7E3; --color-info:#405C65; --color-info-tint:#E8EFF0;
    --editorial-radius:8px; --editorial-heading:'Source Sans 3','Segoe UI',Arial,sans-serif;
    --editorial-body:'Source Sans 3','Segoe UI',Arial,sans-serif;
    --dashboard-section-gap:16px; --dashboard-content-gap:12px; --dashboard-small-gap:8px;
    --loading-surface:var(--color-paper); --skeleton-base:#E6E3DE; --skeleton-highlight:#F4F1EB; --skeleton-edge:#DEDAD2;
    --muted-text:var(--color-ink-muted);
    max-width:1200px; margin:0 auto; padding:32px 24px 56px;
    background:var(--color-canvas); color:var(--color-ink); color-scheme:light;
    font-family:var(--editorial-body); font-size:15px; line-height:1.55;
  }
  ${rule('h1|h2|h3|h4|.card-title|.assessment-title|.pipeline-title|.tracker-title|.team-drawer-title|.drawer-project-title|.shared-timeline .timeline-heading h2|.shared-rubrics h2|.announcement-tab-surface .announcement-header h2|.dashboard-body-surface h1|.dashboard-body-surface :is(h2,h3)|.review-drawer .team-drawer-title', 'font-family:var(--editorial-heading); color:var(--color-ink); font-weight:600; letter-spacing:-.025em; text-transform:none; overflow-wrap:anywhere;')}
  ${rule('h1|.dashboard-body-surface h1', 'font-size:32px; line-height:1.2;')}
  ${rule('h2|.shared-timeline .timeline-heading h2|.shared-rubrics h2|.assessment-title|.pipeline-title|.tracker-title', 'font-size:23px; line-height:1.3;')}
  ${rule('h3|.card-title|.team-drawer-title|.review-drawer .team-drawer-title', 'font-size:20px; line-height:1.35;')}
  ${rule('a|.card-sub a|.doc-links a|.coord-table.read-only a|.expand-hint|.announcement-expand|.announcement-collapse|.drawer-repo-link|.view-link', 'color:var(--color-accent-primary); text-underline-offset:3px;')}
  ${rule('a:hover', 'color:var(--color-accent-hover);')}
  ${rule('.signed-in-as', 'font-size:13px; color:var(--color-ink-muted); margin:8px 0 24px; overflow-wrap:anywhere;')}
  ${rule('.dashboard-app-header', 'display:flex; align-items:center; justify-content:space-between; gap:8px 24px; margin-bottom:16px;')}
  ${rule('.dashboard-app-header h1', 'margin:0;')}
  ${rule('.dashboard-app-header .signed-in-as', 'margin:0; text-align:right; min-width:0;')}
  @media(max-width:760px) {
    ${rule('.dashboard-app-header', 'display:block; margin-bottom:24px;')}
    ${rule('.dashboard-app-header .signed-in-as', 'margin:2px 0 0; text-align:left;')}
  }
  ${rule('.dashboard-body-surface|.announcement-tab-surface', 'background:transparent; color:var(--color-ink); border:0; border-radius:0; box-shadow:none; margin:0; padding:0; font-family:var(--editorial-body); font-size:14px; line-height:1.55;')}
  ${rule('.dashboard-container-header|.announcement-header', 'padding-bottom:20px; margin-bottom:24px; border-bottom:1px solid var(--color-border);')}
  ${rule('.dashboard-container-header', 'padding-bottom:var(--dashboard-content-gap); margin-bottom:var(--dashboard-section-gap); gap:var(--dashboard-content-gap);')}
  ${rule('.dashboard-container-header .announcement-subtitle', 'margin:4px 0 0;')}
  ${rule('.dashboard-navigation', 'background:var(--color-paper); border:1px solid var(--color-border); border-radius:6px; margin-bottom:20px; box-shadow:none;')}
  ${rule('.dashboard-navigation .role-tabs', 'border-radius:6px;')}
  ${rule('.dashboard-navigation .role-tab-btn|.role-menu-toggle', 'font-family:var(--editorial-body); background:transparent; color:var(--color-ink-muted); border-radius:0; box-shadow:none; font-size:14px;')}
  ${rule('.dashboard-navigation .role-tab-btn:hover|.role-menu-toggle:hover', 'background:var(--color-soft); color:var(--color-ink);')}
  ${rule('.dashboard-navigation .role-tab-btn.active', 'background:var(--color-accent-tint); color:var(--color-accent-primary); box-shadow:inset 0 -3px var(--color-accent-highlight); border-color:var(--color-accent-primary);')}

  ${rule('.step-node-done|.step-node-waiting', 'color:var(--color-on-accent);')}
  ${rule('.step-node-active', 'background:var(--color-accent-fill); color:var(--color-on-accent);')}
  /* Paper surfaces, with structure supplied by fine rules rather than elevation. */
  ${rule('.shared-rubrics|.event-card|.pipeline-section|.assessment-section|.github-section|.team-tracker-section|.reviewer-assigned-teams|.system-status-primary > .system-status-card|.coordinator-card-placeholder|.committee-item|.review-config-card|.announcement-item|.announcement-empty-state|.drawer-info-card|.guide-eval-criterion|.review-assessment-summary', 'background:var(--color-paper); color:var(--color-ink); border:1px solid var(--color-border); border-radius:8px; box-shadow:none; color-scheme:light;')}
  ${rule('.shared-rubrics', 'padding:24px; margin-bottom:var(--dashboard-section-gap); border-top:2px solid var(--color-accent-secondary);')}
  ${rule('.shared-rubrics h2', 'margin-bottom:20px;')}
  ${rule('.shared-rubrics-heading', 'display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:var(--dashboard-content-gap);')}
  ${rule('.shared-rubrics-heading h2', 'margin:0;')}
  ${rule('#sharedRubricsToggle|.publishing-toggle', 'width:44px; min-height:44px; padding:0; flex:none; display:inline-flex; align-items:center; justify-content:center;')}
  ${rule('#sharedRubricsToggle[hidden]', 'display:none;')}
  ${rule('#sharedRubricsToggle[aria-expanded="true"] .lucide-icon|.publishing-toggle[aria-expanded="true"] .lucide-icon', 'transform:rotate(180deg);')}
  ${rule('#sharedRubricsContent:not([hidden])', 'margin-top:var(--dashboard-section-gap);')}
  ${rule('#sharedRubricsToggle|.publishing-toggle|#sharedRubricsContent > button', 'background:var(--color-paper); color:var(--color-accent-primary); border-color:var(--color-control-border); border-radius:var(--editorial-radius); font-family:var(--editorial-body);')}
  ${rule('#sharedRubricsToggle:hover:enabled|#sharedRubricsContent > button:hover:enabled', 'background:var(--color-accent-tint); color:var(--color-accent-primary); border-color:var(--color-accent-primary);')}
  ${rule('#sharedRubricsToggle:focus-visible|#sharedRubricsContent > button:focus-visible', 'outline:3px solid var(--color-accent-primary); outline-offset:3px;')}
  ${rule('.event-card', 'margin-bottom:var(--dashboard-section-gap);')}
  ${rule('.card-body', 'padding:var(--dashboard-section-gap) var(--dashboard-section-gap) var(--dashboard-small-gap);')}
  ${rule('.card-footer-row', 'padding:var(--dashboard-content-gap) var(--dashboard-section-gap); flex-wrap:wrap; gap:var(--dashboard-content-gap);')}
  ${rule('.card-accent', 'height:3px; background:var(--color-border);')}
  ${rule('.card-accent.green', 'background:var(--color-success);')}
  ${rule('.card-accent.orange', 'background:var(--color-accent-secondary);')}
  ${rule('.card-accent.blue', 'background:var(--color-info);')}
  ${rule('.card-accent.red', 'background:var(--color-danger);')}
  ${rule('.card-divider|.committee-body|.drawer-section|.drawer-person|.drawer-status-row|.review-history|.review-history li|.review-project-title-row|.review-criterion[data-index] .review-feedback-heading', 'border-color:var(--color-border);')}
  ${rule('.card-divider', 'background:var(--color-border);')}
  ${rule('.coordinator-container', 'gap:var(--dashboard-section-gap);')}
  ${rule('.stats|.coord-stats|.coord-stats.coordinator-stats-grid', 'gap:var(--dashboard-content-gap); margin-bottom:var(--dashboard-section-gap);')}
  ${rule('.dashboard-body-surface :is(.team-tracker-section,.pipeline-section,.assessment-section,.needs-attention)', 'padding:var(--dashboard-section-gap);')}
  ${rule('.dashboard-body-surface :is(.tracker-title,.assessment-title,.table-title)', 'margin-top:0; margin-bottom:var(--dashboard-content-gap);')}
  ${rule('.dashboard-body-surface :is(.tracker-search,.pipeline-heading)', 'margin-bottom:var(--dashboard-content-gap);')}
  /* Reserve the original columns even when zero-count cards are omitted. */
  ${rule('[data-role-content="guide"] .stats', 'display:grid; grid-template-columns:repeat(6,minmax(0,1fr));')}
  ${rule('[data-role-content="reviewer"] .coord-stats', 'display:grid; grid-template-columns:repeat(4,minmax(0,1fr));')}
  ${rule('[data-role-content="guide"] .stat|[data-role-content="reviewer"] .coord-stat', 'min-width:0;')}
  ${rule('.stat|.coord-stat|.coordinator-stats-grid .stat-card', 'padding:var(--dashboard-content-gap) var(--dashboard-section-gap); border:1px solid var(--color-border); border-radius:6px; background:var(--color-paper); box-shadow:none; text-align:left;')}
  ${rule('.stat-num|.coord-stat-num|.coordinator-stats-grid .stat-card .stat-num', 'font-family:var(--editorial-heading); font-size:32px; font-weight:600; line-height:1.15; font-variant-numeric:tabular-nums; color:var(--color-ink);')}
  ${rule('.stat-label|.coord-stat-label|.coordinator-stats-grid .stat-label|.drawer-section-title|.drawer-info-label|.team-drawer-eyebrow|.review-control-title', 'font-family:var(--editorial-body); font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.08em; color:var(--color-ink-muted);')}
  ${rule('.coordinator-stats-grid .stat-detail|.coordinator-stats-grid .stat-detail-row', 'font-size:12px; color:var(--color-ink-muted);')}
  ${rule('.coordinator-stats-grid .stat-card[data-completion-tone]', '--stat-tone:var(--color-info); --stat-tint:var(--color-info-tint); background:var(--color-paper);')}
  ${rule('.coordinator-stats-grid .stat-card[data-completion-tone="complete"]', '--stat-tone:var(--color-success); --stat-tint:var(--color-success-tint);')}
  ${rule('.coordinator-stats-grid .stat-card[data-completion-tone="warning"]', '--stat-tone:var(--color-warning); --stat-tint:var(--color-warning-tint);')}
  ${rule('.coordinator-stats-grid .stat-card[data-completion-tone="danger"]', '--stat-tone:var(--color-danger); --stat-tint:var(--color-danger-tint);')}
  ${rule('.coordinator-stats-grid .stat-card[data-completion-tone] .stat-num', 'color:var(--stat-tone);')}
  ${rule('.coordinator-stats-grid .stat-track|.team-progress-track|.assessment-bar-inner', 'background:var(--color-soft);')}
  ${rule('.team-progress-track > div|.assessment-fill', 'background:var(--color-success);')}

  /* Common controls retain their existing layout and event hooks. */
  ${rule('button|input|select|textarea|.btn-outline|.mini|.announcement-add-btn|.announcement-link', 'font-family:var(--editorial-body); accent-color:var(--color-accent-primary);')}
  ${rule('button|.dashboard-body-surface button|.announcement-tab-surface button|.btn-outline|.mini|.announcement-add-btn', 'border-radius:6px; font-size:14px; font-weight:600;')}
  ${rule('button|.btn-outline|.mini', 'border-color:var(--color-control-border); background:var(--color-paper); color:var(--color-ink);')}
  ${rule('button:hover:enabled|.btn-outline:hover|.mini:hover', 'background:var(--color-soft); border-color:var(--color-ink-muted); color:var(--color-ink);')}
  ${rule('.workflow-btn:not(.secondary)|.btn-solid|.run-sync-btn|.announcement-add-btn|.swal2-confirm|.pagination-buttons button.active|.tracker-tabs .tab.active|.tab.active|.filter-tab.active', 'background:var(--color-accent-fill); color:var(--color-on-accent); border-color:var(--color-accent-fill); box-shadow:none;')}
  ${rule('.workflow-btn:not(.secondary):hover|.btn-solid:hover:enabled|.run-sync-btn:hover:enabled|.announcement-add-btn:hover|.swal2-confirm:hover|.tracker-tabs .tab.active:hover', 'background:var(--color-accent-fill-hover); color:var(--color-on-accent); border-color:var(--color-accent-fill-hover);')}
  ${rule('input:not([type=checkbox]):not([type=radio]):not([type=range])|select|textarea|.dashboard-body-surface :is(input:not([type=checkbox]):not([type=radio]):not([type=range]),select,textarea)|.announcement-tab-surface :is(input,select,textarea)', 'max-width:100%; box-sizing:border-box; background:var(--color-paper); color:var(--color-ink); border:1px solid var(--color-control-border); border-radius:6px; font-family:var(--editorial-body); font-size:14px; line-height:1.45;')}
  ${rule('input::placeholder|textarea::placeholder|.dashboard-body-surface :is(input,textarea)::placeholder', 'color:var(--color-ink-muted); opacity:1;')}
  ${rule('input[aria-invalid="true"]|.review-criterion input[aria-invalid="true"]', 'border-color:var(--color-danger); background:var(--color-danger-tint);')}
  ${rule('button:disabled', 'cursor:not-allowed;')}
  ${rule(':is(a,button,summary,input,select,textarea,[tabindex]):focus-visible|.dashboard-navigation button:focus-visible|.dashboard-body-surface :is(a,button,summary,input,select,textarea):focus-visible|.announcement-tab-surface :is(a,button,summary,input,select,textarea):focus-visible|#rubricDrawer button:focus-visible', 'outline:3px solid var(--color-accent-primary); outline-offset:3px;')}

  ${rule('table', 'font-family:var(--editorial-body); font-variant-numeric:tabular-nums; color:var(--color-ink);')}
  ${rule('.coord-table', 'background:var(--color-paper); border-radius:6px; box-shadow:none;')}
  ${rule('table th|.coord-table th|.team-tracker-table th', 'background:var(--color-soft); color:var(--color-ink-muted); border-color:var(--color-border); padding:12px; font-size:11px; font-weight:600; letter-spacing:.07em;')}
  ${rule('table td|.coord-table td|.team-tracker-table td', 'border-color:var(--color-border); padding:12px; font-size:var(--font-size-body);')}
  ${rule('.internal-publishing table th|.internal-publishing table td', 'padding:6px 10px; font-size:var(--font-size-body); line-height:1.4; letter-spacing:normal;')}
  ${rule('.internal-publishing table thead th', 'padding:8px 10px; font-size:var(--font-size-small); letter-spacing:.025em;')}
  ${rule('.internal-publishing table tbody th', 'background:transparent; color:var(--color-ink);')}
  ${rule('.internal-publishing .publishing-table [data-detail-row] > td', 'padding:8px 10px;')}
  ${rule('tbody tr:hover', 'background:var(--color-canvas);')}
  ${rule('.tracker-table-scroll|.reviewer-assigned-table-scroll', 'max-width:100%; overflow-x:auto; overscroll-behavior-x:contain;')}
  ${rule('.reviewer-assigned-teams .team-tracker-table th|.reviewer-assigned-teams .team-tracker-table td', 'padding:10px 8px;')}
  ${rule('.card-top-row|.footer-actions|.pagination', 'flex-wrap:wrap; gap:10px;')}
  ${rule('.card-title|.drawer-project-title|.announcement-message|.announcement-preview', 'overflow-wrap:anywhere;')}
  ${rule('.card-sub|.card-desc|.status-label|.status-cell|.footer-count|.empty|.coord-empty|.doc-links|.team-progress-note|.team-progress-count|.drawer-person-meta|.drawer-problem|.drawer-status-label|.rubric-levels dd|.announcement-date|.announcement-results|.announcement-status|.announcement-empty|.announcement-audience-label|.reviewer-setup-intro|.rubrics-status-detail|.committee-email|.committee-teams|.review-project-meta-row|.review-tab-caption|.review-slider-values|.review-history time|.review-history small|#systemStatusMessage', 'color:var(--color-ink-muted);')}
  ${rule('.announcement-message|.announcement-preview|.announcement-details p|.drawer-info-value|.drawer-person-name|.rubric-levels dt', 'color:var(--color-ink);')}
  ${rule('.team-chip|.committee-team-chip|.announcement-audience-chip|.review-config-pill|.review-graded-pill', 'background:var(--color-soft); color:var(--color-ink-muted); border-color:var(--color-border); border-radius:var(--pill-radius);')}
  ${rule('.status-badge|.tag|.health-badge|.rubrics-status-pill', 'border-radius:var(--pill-radius); font-size:12px;')}
  ${rule('.status-badge.green|.tag.green|.health-badge.green|.tracker-health.green|.rubrics-status-pill[data-configured="true"]|.review-config-card[data-state="ready"] .review-config-pill|.review-graded-pill[data-completion="complete"]|.review-header-line .review-header-due[data-timing="success"]', 'color:var(--color-success); background:var(--color-success-tint); border-color:var(--color-success);')}
  ${rule('.status-badge.orange|.tag.orange|.health-badge.orange|.tracker-health.orange|.flag|.rubrics-status-pill[data-configured="false"]|.review-config-card[data-state="invalid"] .review-config-pill|.review-config-card[data-state="definitions-missing"] .review-config-pill|.review-config-card[data-state="definitions-empty"] .review-config-pill|.review-config-card[data-state="storage-missing"] .review-config-pill|.review-config-card[data-state="storage-empty"] .review-config-pill|.review-config-card[data-state="error"] .review-config-pill|.review-header-line .review-header-due[data-timing="warning"]', 'color:var(--color-warning); background:var(--color-warning-tint); border-color:var(--color-warning);')}
  ${rule('.status-badge.red|.tag.red|.health-badge.red|.tracker-health.red|.role-load-error|.drawer-error|.review-marks-error|.review-header-line .review-header-due[data-timing="danger"]', 'color:var(--color-danger); background:var(--color-danger-tint); border-color:var(--color-danger);')}
  ${rule('.status-badge.blue|.tag.blue|.committee-avatar|.review-header-line .review-header-due[data-timing="info"]', 'color:var(--color-info); background:var(--color-info-tint); border-color:var(--color-info);')}
  ${rule('.status-badge.gray|.tag.gray', 'color:var(--color-ink-muted); background:var(--color-soft);')}
  ${rule('.drawer-status-good|.stat.green .stat-num|.coord-stat.green .coord-stat-num', 'color:var(--color-success);')}
  ${rule('.drawer-status-warn|.flag-text|.stat.orange .stat-num|.coord-stat.orange .coord-stat-num', 'color:var(--color-warning);')}
  ${rule('.drawer-status-bad|.btn-outline.reject|.coordinator-stats-grid .stat-detail-row .stat-outstanding|.stat.red .stat-num|.coord-stat.red .coord-stat-num', 'color:var(--color-danger);')}
  ${rule('.stat.blue .stat-num|.coord-stat.blue .coord-stat-num', 'color:var(--color-info);')}

  /* Shared timeline and rubric surfaces follow the active role, including retries. */
  ${rule('.rubric-assessment strong|.rubric-mobile-title strong', 'color:var(--color-ink);')}
  ${rule('.rubric-mobile-meta|.rubric-assessment .rubric-metadata', 'color:var(--color-ink-muted);')}
  ${rule('.rubric-assessment .rubric-weight|.rubric-mobile-weight', 'background:var(--color-soft); border-color:var(--color-border); color:var(--color-ink-muted); border-radius:var(--pill-radius); font-family:var(--editorial-body); font-variant-numeric:tabular-nums;')}
  ${rule('.rubric-assessment .rubric-weight|.rubric-mobile-weight', 'background:var(--color-accent-tint); color:var(--color-accent-primary); border-color:var(--color-accent-secondary);')}
  ${rule('.rubric-assessment .rubric-action', 'color:var(--color-accent-primary);')}
  ${rule('.shared-rubrics > button|.shared-rubrics .rubric-view-button', 'background:var(--color-paper); color:var(--color-accent-primary); border-color:var(--color-control-border);')}
  ${rule('.shared-rubrics > button:hover|.shared-rubrics .rubric-view-button:hover:enabled', 'background:var(--color-accent-tint); color:var(--color-accent-primary); border-color:var(--color-accent-primary);')}
  ${rule('.rubric-assessment', 'background:var(--color-canvas); color:var(--color-ink-muted); border-color:var(--color-border); border-radius:6px; padding:20px; font-family:var(--editorial-body);')}
  ${rule('.rubric-assessment:hover:enabled', 'background:var(--color-accent-tint); border-color:var(--color-accent-secondary);')}
  ${rule('.rubric-assessment:disabled|.rubric-assessment:disabled strong', 'background:var(--color-soft); color:var(--color-ink-muted);')}
  ${rule('.rubric-mobile-row ~ .rubric-mobile-row', 'border-color:var(--color-border);')}
  ${rule('.shared-rubrics .rubric-view-button::before|.shared-rubrics .rubric-view-button:hover:enabled::before', 'background:transparent; border-color:var(--color-control-border);')}
  ${rule('.app-skeleton|.shared-rubrics .app-skeleton', '--skeleton-base:#E6E3DE; --skeleton-highlight:#F4F1EB; --skeleton-edge:#DEDAD2;')}
  ${rule('.app-content-loading', '--loading-surface:var(--color-paper);')}

  /* Body-mounted drawers, native dialogs and SweetAlert share the same typography. */
  ${rule('.team-drawer|.review-drawer|.swal2-popup', 'font-family:var(--editorial-body); background:var(--color-paper); color:var(--color-ink); border-color:var(--color-border); box-shadow:0 16px 48px rgba(30,37,34,.12);')}
  ${rule('.team-drawer-header|.review-assessment-navigation|.review-footer', 'background:var(--color-canvas); border-color:var(--color-border);')}
  ${rule('.team-drawer-backdrop|dialog::backdrop', 'background:rgba(30,37,34,.3);')}
  ${rule('.swal2-popup', 'border-radius:8px;')}
  ${rule('.swal2-title', 'font-family:var(--editorial-heading); color:var(--color-ink);')}
  ${rule('.swal2-html-container|.swal2-input-label', 'color:var(--color-ink-muted);')}
  ${rule('.swal2-styled.swal2-confirm', 'background:var(--color-accent-fill); color:var(--color-on-accent); border-radius:6px;')}
  ${rule('.swal2-styled.swal2-cancel', 'background:var(--color-soft); color:var(--color-ink); border-radius:6px;')}
  ${rule('.announcement-link|.announcement-empty-icon|.review-header-review|.review-criterion-meta span|.review-graded-pill[data-completion="partial"]', 'color:var(--color-accent-primary); background:var(--color-accent-tint); border-color:var(--color-accent-secondary);')}
  ${rule('.review-criterion[data-index]|.review-individual-rubric[data-index]', 'background:var(--color-paper); border-color:var(--color-border); border-top:3px solid var(--color-accent-secondary); border-radius:8px;')}
  ${rule('.review-criterion[data-index] .review-card-title', 'font-family:var(--editorial-heading); font-size:18px; color:var(--color-ink);')}
  ${rule('.review-criteria-tabs|.review-levels|.review-stepper', 'background:var(--color-soft); border-color:var(--color-border); border-radius:6px;')}
  ${rule('.review-drawer .review-criteria-tabs [role="tab"]|.review-drawer .review-levels button|.review-drawer .review-pi-pills button', 'font-family:var(--editorial-body); color:var(--color-ink-muted); background:var(--color-paper); border-color:var(--color-border); box-shadow:none;')}
  ${rule('.review-drawer .review-criteria-tabs [aria-selected="true"]|.review-drawer .review-criteria-tabs [data-criteria-tab="individual"][aria-selected="true"]', 'background:var(--color-accent-tint); color:var(--color-accent-primary); border-color:var(--color-accent-secondary);')}
  ${rule('.review-drawer .review-pi-pills button[aria-pressed="true"]|.review-drawer .review-pi-pills button[aria-pressed="true"]:hover|.review-drawer .review-pi-pills[data-individual-pills] button[aria-pressed="true"]|.review-drawer .review-pi-pills[data-individual-pills] button[aria-pressed="true"]:hover|.review-drawer .review-levels button[aria-pressed="true"]|.review-criterion[data-index] .review-levels button[aria-pressed="true"]', 'background:var(--color-accent-fill); color:var(--color-on-accent); border-color:var(--color-accent-fill); box-shadow:none;')}
  ${rule('.review-descriptor|.review-accordion > summary', 'background:var(--color-accent-tint); color:var(--color-accent-hover); border-color:var(--color-accent-secondary); border-radius:6px;')}
  /* Preserve pill geometry after the theme's general button rule. */
  ${rule('.review-drawer .review-pi-pills button|.review-criterion[data-index] .review-feedback-options button|.tracker-tabs .tab', 'border-radius:var(--pill-radius);')}
  ${rule('.review-criterion .review-feedback-options', '--pill-border:var(--color-accent-secondary); --pill-bg:var(--color-accent-tint); --pill-text:var(--color-accent-primary); --pill-active:var(--color-accent-fill); --pill-hover:var(--color-accent-fill-hover);')}
  ${rule('.review-criterion:is([data-level="0"],[data-level="1"]) .review-feedback-options', '--pill-border:var(--color-warning); --pill-bg:var(--color-warning-tint); --pill-text:var(--color-warning); --pill-active:var(--color-warning); --pill-hover:#644300;')}
  ${rule('.review-criterion [data-marks-slider]', 'accent-color:var(--color-accent-primary);')}
  ${rule('.review-progress-students|.review-slider-values .is-selected|.review-project-title-row .lucide-icon|.review-criterion details', 'color:var(--color-accent-primary);')}
  ${rule('.review-actions|.collapsible summary', 'background:var(--color-paper); border-color:var(--color-border); border-radius:6px; box-shadow:none;')}
  ${rule('.review-actions [data-submit]|.review-drawer [data-target]|.filter-tab.active:hover:enabled|.pagination-buttons button.active:hover:enabled', 'background:var(--color-accent-fill); color:var(--color-on-accent); border-color:var(--color-accent-fill);')}
  ${rule('.review-actions [data-submit]:hover:enabled|.review-drawer [data-target]:hover:enabled', 'background:var(--color-accent-fill-hover); color:var(--color-on-accent);')}
  ${rule('.review-progress progress|.review-progress progress::-webkit-progress-bar', 'background:var(--color-soft); accent-color:var(--color-accent-primary);')}
  ${rule('.review-progress progress::-webkit-progress-value', 'background:var(--color-accent-primary);')}
  ${rule('.review-progress progress::-moz-progress-bar', 'background:var(--color-accent-primary);')}
  ${rule('.review-progress-students::before', 'background:var(--color-accent-primary);')}
  ${rule('.review-progress-completion > span::before', 'background:var(--color-warning);')}
  /* Secondary staff tools and semantic variants use the same palette. */
  ${rule('.needs-attention|.assessment-overview|.github-config|.pipeline-stage', 'background:var(--color-paper); color:var(--color-ink); border:1px solid var(--color-border); border-radius:8px; box-shadow:none;')}
  ${rule('.mini.approve', 'background:var(--color-accent-fill); color:var(--color-on-accent); border-color:var(--color-accent-fill);')}
  ${rule('.mini.approve:hover:enabled', 'background:var(--color-accent-fill-hover); color:var(--color-on-accent); border-color:var(--color-accent-fill-hover);')}
  ${rule('.mini.revise', 'background:var(--color-soft); color:var(--color-ink-muted); border-color:var(--color-control-border);')}
  ${rule('.tracker-tabs .deadline-pill', 'background:var(--color-warning-tint); color:var(--color-warning); border-color:var(--color-warning);')}
  ${rule('.tracker-tabs .tab[data-filter="ontrack"]', 'background:var(--color-success-tint); color:var(--color-success); border-color:var(--color-success);')}
  ${rule('.tracker-tabs .tab[data-filter="attention"]|.tracker-tabs .deadline-pill.deadline-overdue', 'background:var(--color-danger-tint); color:var(--color-danger); border-color:var(--color-danger);')}
  ${rule('.tracker-tabs .tab.active|.tracker-tabs .tab.active:hover', 'background:var(--color-accent-fill); color:var(--color-on-accent); border-color:var(--color-accent-fill);')}
  ${rule('.stage-label|.stage-count|.assessment-name|.github-title|.system-status-card .github-label|.system-status-card .rubrics-assessment-list dt', 'color:var(--color-ink);')}
  ${rule('.announcement-subtitle|.stage-subtitle|.stage-percent|.semester-dates|.development-legend|.assessment-pct|.github-label|.github-value|.system-status-card .github-value|.system-status-card .rubrics-assessment-list dd|.reviewer-review-cell small|.role-menu-toggle .role-menu-caption', 'color:var(--color-ink-muted);')}
  ${rule('.progress-bar|.stage-icon|.coordinator-stats-grid .lucide-icon.stat-icon|.coordinator-stats-grid .stat-pct', 'background:var(--color-soft); color:var(--color-ink-muted); border-color:var(--color-border);')}
  ${rule('.progress-fill.blue|.progress-fill.green|.progress-fill.gray', 'background:var(--color-success);')}
  ${rule('.stage-icon.completed|.github-status.configured|.system-status-card .github-status.configured|.coordinator-stats-grid .stat-registered', 'background:var(--color-success-tint); color:var(--color-success); border-color:var(--color-success);')}
  ${rule('.stage-icon.pending|.stage-icon.development', 'background:var(--color-warning-tint); color:var(--color-warning); border-color:var(--color-warning);')}
  ${rule('.coordinator-stats-grid .stat-card[data-completion-tone] .stat-icon|.coordinator-stats-grid .stat-card[data-completion-tone] .stat-pct', 'background:var(--stat-tint); color:var(--stat-tone);')}
  ${rule('.review-header-line|.review-project-title-row > summary|.review-project-title-row > p|.review-progress|.review-feedback-title strong|.review-assessment-summary dd', 'color:var(--color-ink);')}
  ${rule('.review-drawer .review-pi-pills button[aria-pressed="false"]:not(:disabled):hover|.review-drawer .review-pi-pills[data-individual-pills] button[aria-pressed="false"]:not(:disabled):hover', 'background:var(--color-accent-tint); color:var(--color-accent-primary); border-color:var(--color-accent-secondary);')}
  ${rule('.review-individual-rubric[data-index] .review-criterion-meta span:first-child|.review-drawer .review-other-feedback[aria-pressed="true"]', 'background:var(--color-accent-tint); color:var(--color-accent-primary); border-color:var(--color-accent-secondary);')}
  ${rule('.review-criterion:is([data-level="0"],[data-level="1"]) .review-descriptor|.review-feedback-heading [data-feedback-required]|.review-assessment-summary .review-summary-status[data-tone="pending"] dd', 'background:var(--color-warning-tint); color:var(--color-warning); border-color:var(--color-warning);')}
  ${rule('.review-criterion:is([data-level="3"],[data-level="4"],[data-level="5"]) [data-feedback-status]|.review-assessment-summary .review-summary-status[data-tone="complete"] dd|.review-drawer .review-pi-pills [data-complete="true"]:not([aria-pressed="true"])', 'background:var(--color-success-tint); color:var(--color-success); border-color:var(--color-success);')}
  ${rule('.review-assessment-summary .review-summary-status[data-tone="exception"] dd', 'background:var(--color-danger-tint); color:var(--color-danger);')}
  ${rule('.review-criterion[data-index] .review-control-title|.review-criterion-meta span:last-child|.review-history summary|.review-history-status', 'color:var(--color-ink-muted);')}
  ${rule('.review-assessment-summary .review-summary-total', 'border-color:var(--color-accent-secondary);')}
  ${rule('.review-assessment-summary .review-summary-total[data-resolved="true"] dd', 'color:var(--color-ink);')}
  ${rule('.review-drawer .review-header-students button', 'background:var(--color-paper); color:var(--color-ink); border-color:var(--color-control-border); border-radius:var(--editorial-radius); box-shadow:none; font-family:var(--editorial-body);')}
  ${rule('.review-drawer .review-header-students button[aria-pressed="false"]:not(:disabled):hover', 'background:var(--color-soft); border-color:var(--color-ink-muted);')}
  ${rule('.review-drawer .review-header-students button[aria-pressed="true"]|.review-drawer .review-header-students button[aria-pressed="true"]:hover', 'background:var(--color-accent-tint); color:var(--color-accent-primary); border-color:var(--color-accent-primary); box-shadow:inset 0 0 0 1px var(--color-accent-primary);')}
  ${rule('.review-header-students .review-avatar', 'background:var(--color-soft); color:var(--color-ink-muted);')}
  ${rule('.review-header-students [aria-pressed="true"] .review-avatar', 'background:var(--color-accent-primary); color:var(--color-paper);')}
  ${rule('.review-header-students .review-student-score', 'color:var(--color-ink); border-color:var(--color-border);')}
  ${rule('.review-drawer :is(button,input,summary,textarea):focus-visible|.review-criterion .review-feedback-options button:focus-visible', 'outline:3px solid var(--color-accent-primary); outline-offset:3px;')}
  @media(max-width:760px) {
    ${scope} { padding:20px 16px 40px; }
    ${rule('h1|.dashboard-body-surface h1', 'font-size:28px;')}
    ${rule('.shared-rubrics', 'padding:18px 16px;')}
    ${rule('.dashboard-navigation', 'padding:6px;')}
    ${rule('.dashboard-navigation .role-tab-btn', 'border-radius:4px;')}
    ${rule('.dashboard-navigation .role-tab-btn.active', 'box-shadow:inset 3px 0 var(--color-accent-highlight);')}
    ${rule('button|.dashboard-body-surface button|.announcement-tab-surface button|.review-drawer button|.review-drawer .review-pi-pills button|.review-criterion[data-index] .review-feedback-options button|.btn-outline|.mini|.team-action-icon|.announcement-link', 'min-height:44px;')}
    ${rule('.team-action-icon|.team-drawer-close', 'min-width:44px;')}
    ${rule('input:not([type=checkbox]):not([type=radio]):not([type=range])|select|textarea', 'font-size:16px;')}
    ${rule('.card-body', 'padding:var(--dashboard-content-gap) var(--dashboard-section-gap) 6px;')}
    ${rule('.card-footer-row', 'padding:var(--dashboard-content-gap) var(--dashboard-section-gap);')}
    ${rule('.system-status-primary', 'grid-template-columns:minmax(0,1fr);')}
    ${rule('.stats|.coord-stats:not(.coordinator-stats-grid)|[data-role-content="guide"] .stats|[data-role-content="reviewer"] .coord-stats', 'display:grid; grid-template-columns:repeat(2,minmax(0,1fr));')}
    ${rule('.stat|.coord-stat|.coordinator-stats-grid .stat-card', 'padding:var(--dashboard-content-gap); min-width:0;')}
  }
  /* Announcements: lighter filters and a consistent feed/action rhythm. */
  ${rule('.announcement-hub .announcement-toolbar', 'padding:8px 10px; gap:10px; border-radius:8px;')}
  ${rule('.announcement-hub .announcement-search-field', 'gap:8px; padding-left:2px;')}
  ${rule('.announcement-hub .announcement-toolbar .announcement-search-field input', 'min-height:38px; padding:8px 10px; border:1px solid transparent; background:var(--color-canvas); border-radius:6px;')}
  ${rule('.announcement-hub .announcement-audience-filters', 'padding:3px; gap:2px; background:var(--color-canvas); border-radius:6px;')}
  ${rule('.announcement-hub .announcement-audience-filters button', 'min-height:34px; padding:6px 10px; border:1px solid transparent; background:transparent; font-size:12px; color:var(--color-ink-muted);')}
  ${rule('.announcement-hub .announcement-audience-filters button[aria-pressed="true"]', 'background:var(--color-paper); border-color:var(--color-border); color:var(--color-accent-primary); box-shadow:0 1px 2px rgba(37,44,48,.05);')}
  ${rule('.announcement-hub .announcement-toolbar select', 'min-height:38px; padding:7px 10px; border-color:var(--color-border); font-size:12px;')}
  ${rule('.announcement-hub .announcement-columns', 'gap:20px;')}
  ${rule('.announcement-hub .announcement-results', 'margin:10px 0; font-size:12px;')}
  ${rule('.announcement-hub .announcement-date-group|.announcement-hub .announcement-templates', 'border-radius:8px;')}
  ${rule('.announcement-hub .announcement-group-heading', 'padding:10px 18px; font-size:11px; border-radius:8px 8px 0 0;')}
  ${rule('.announcement-hub .announcement-item', 'padding:16px 18px; gap:12px; align-items:center;')}
  ${rule('.announcement-hub .announcement-item:hover', 'background:var(--color-canvas);')}
  ${rule('.announcement-hub .announcement-item:last-child', 'border-radius:0 0 8px 8px;')}
  ${rule('.announcement-hub .announcement-row-icon', 'width:34px; height:34px; border-radius:8px; font-size:11px;')}
  ${rule('.announcement-hub .announcement-row-copy h3', 'font-size:15px; margin-bottom:4px; line-height:1.4;')}
  ${rule('.announcement-hub .announcement-meta', 'font-size:12px; line-height:1.5;')}
  ${rule('.announcement-hub .announcement-row-actions .announcement-link', 'box-sizing:border-box; min-width:96px; min-height:34px; justify-content:center; padding:6px 10px; font-size:12px; background:transparent; border-color:var(--color-border);')}
  ${rule('.announcement-hub .announcement-row-actions .announcement-link:hover', 'background:var(--color-accent-tint); border-color:var(--color-accent-secondary);')}
  ${rule('.announcement-hub .announcement-templates', 'padding:16px;')}
  ${rule('.announcement-hub .announcement-templates h3', 'font-size:19px; margin:0 0 4px;')}
  ${rule('.announcement-hub .announcement-templates p', 'font-size:12px; margin:0;')}
  ${rule('.announcement-hub .announcement-templates ol', 'margin-top:12px; gap:0;')}
  ${rule('.announcement-hub .announcement-templates li + li', 'border-top:1px solid var(--color-border);')}
  ${rule('.announcement-hub .announcement-templates li a', 'padding:10px 0; gap:10px; text-decoration:none; font-size:13px; line-height:1.5;')}
  ${rule('.announcement-hub .announcement-templates li a:hover', 'color:var(--color-accent-primary);')}
  ${rule('.announcement-hub .announcement-step-number', 'width:24px; height:24px; border-radius:6px; background:var(--color-accent-tint); color:var(--color-accent-primary); font-size:12px;')}
  @media(max-width:640px) {
    ${rule('.announcement-hub .announcement-item', 'padding:14px; align-items:flex-start;')}
    ${rule('.announcement-hub .announcement-row-copy', 'flex-basis:calc(100% - 46px);')}
    ${rule('.announcement-hub .announcement-row-actions', 'margin-left:46px;')}
    ${rule('.announcement-hub .announcement-audience-filters button|.announcement-hub .announcement-row-actions .announcement-link|.announcement-hub .announcement-toolbar select', 'min-height:44px;')}
  }
  /* Utility pages share compact headers; only rubrics retain a paper container. */
  ${rule('.utility-body.announcement-tab-surface|.utility-body.dashboard-body-surface', 'margin:0; padding:0; border:0; border-radius:0; background:transparent; box-shadow:none; color:var(--color-ink);')}
  ${rule('.utility-body.shared-rubrics', 'margin:0; padding:20px 24px; border:1px solid var(--color-border); border-top:2px solid var(--color-accent-secondary); border-radius:8px; background:var(--color-paper); box-shadow:none; color:var(--color-ink);')}
  ${rule('.utility-body .utility-header', 'display:flex; flex-direction:row; align-items:flex-start; justify-content:space-between; flex-wrap:nowrap; gap:10px 16px; padding:0; margin:0 0 16px; border:0;')}
  ${rule('.dashboard-body-surface .dashboard-container-header h2|.announcement-tab-surface .tab-header h2|.student-dashboard .dash-hero h2|.utility-body .utility-header :is(h1,h2)|.shared-timeline .timeline-heading h2', 'font-family:var(--editorial-heading); font-size:23px; line-height:1.3; font-weight:600; letter-spacing:-.025em; color:var(--color-ink); margin:0; padding:0;')}
  ${rule('.utility-body .utility-header .announcement-subtitle', 'margin:4px 0 0; font-size:12px;')}
  ${rule('.utility-body #sharedRubricsContent:not([hidden])', 'margin-top:0;')}
  ${rule('.utility-body .utility-header .announcement-actions', 'display:flex; align-items:center; flex-wrap:wrap; gap:8px; margin:0;')}
  ${rule('.utility-body .utility-header .announcement-refresh-btn', 'background:var(--color-paper); border:1px solid var(--color-control-border); color:var(--color-accent-primary);')}
  ${rule('.utility-body .utility-header .announcement-refresh-btn:hover:enabled', 'background:var(--color-accent-tint); border-color:var(--color-accent-primary);')}
  @media(max-width:640px) {
    ${rule('.utility-body.shared-rubrics', 'padding:16px;')}
    ${rule('.utility-body .utility-header', 'gap:8px; margin-bottom:12px;')}
  }
  /* One tab-header template across dashboard and utility surfaces. */
  ${rule('.tab-header', 'display:flex; flex-direction:row; flex-wrap:nowrap; align-items:flex-start; justify-content:space-between; gap:12px; padding:0 0 16px; margin:0 0 20px; border:0; border-bottom:1px solid var(--color-border);')}
  ${rule('.tab-header > div', 'flex:1; min-width:0;')}
  ${rule('.tab-header h2', 'margin:0; padding:0; font-family:var(--editorial-heading); font-size:var(--heading-content); line-height:1.3; font-weight:600; color:var(--color-ink);')}
  ${rule('.tab-header .announcement-subtitle', 'margin:4px 0 0; font-size:12px; line-height:1.5; color:var(--color-ink-muted);')}
  /* Shared heading hierarchy: app > tab content > card > subsection. */
  @media(min-width:1201px) {
    ${rule('.dashboard-app-header', 'display:grid; grid-template-columns:auto minmax(0,1fr) minmax(100px,150px); gap:12px; margin-bottom:20px; padding:0 12px; background:var(--color-paper); border:1px solid var(--color-border); border-radius:6px;')}
    ${rule('.dashboard-app-header h1', 'font-size:23px; grid-column:1; grid-row:1;')}
    ${rule('.dashboard-app-header .dashboard-navigation', 'grid-column:2; grid-row:1; min-width:0; margin:0; padding:0; border:0; border-radius:0; background:transparent;')}
    ${rule('.dashboard-app-header .signed-in-as', 'grid-column:3; grid-row:1; font-size:11px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;')}
    ${rule('.dashboard-app-header .role-tab-btn', 'font-size:12px; padding:12px 7px; gap:5px;')}
    ${rule('.dashboard-app-header .role-tab-btn .lucide-icon', 'width:14px; height:14px;')}
  }
  @media(max-width:1200px) {
    ${rule('.dashboard-app-header', 'display:block; margin-bottom:20px;')}
    ${rule('.dashboard-app-header .signed-in-as', 'margin:2px 0 0; text-align:left;')}
    ${rule('.dashboard-app-header .dashboard-navigation', 'margin-top:24px; margin-bottom:0;')}
  }
  ${rule('.dashboard-body-surface .student-assessments-card > .assessment-section', 'margin:0; padding:0; border:0; border-radius:0; background:transparent; box-shadow:none;')}
  ${rule('.dashboard-body-surface .student-assessments-card > .assessment-section + .assessment-section', 'border-top:1px solid var(--color-border);')}
  ${rule('.student-assessments-card .student-assessment-result > summary', 'list-style:none;')}
  ${rule('.student-assessments-card .student-assessment-result > summary::-webkit-details-marker', 'display:none;')}
  ${scope} { --heading-content:23px; --heading-card:18px; --heading-subsection:15px; }
  ${rule('.heading-row', 'display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; gap:8px 12px;')}
  ${rule('.heading-row > :is(h2,h3,h4,h5)', 'margin:0; min-width:0;')}
  ${rule('.dashboard-body-surface h5|.weekly-github-activity h5', 'font-family:var(--editorial-heading); font-size:var(--heading-subsection); line-height:1.4; font-weight:600; color:var(--color-ink);')}
  ${rule('.dashboard-body-surface .dashboard-container-header h2|.announcement-tab-surface .tab-header h2|.student-dashboard .dash-hero h2|.utility-body .utility-header :is(h1,h2)|.shared-timeline .timeline-heading h2', 'font-size:var(--heading-content); line-height:1.3; font-weight:600;')}
  ${rule('.dashboard-body-surface h3|.card-title|.assessment-title|.pipeline-title|.tracker-title|.system-status-card .system-card-title|.student-dashboard .student-setup-title|.student-dashboard .student-weekly-card > h3|.announcement-hub .announcement-templates h3|.announcement-hub .announcement-row-copy h3|.announcement-empty-state h3|.review-drawer h3|.drawer-section h3|.review-criterion[data-index] .review-card-title', 'font-size:var(--heading-card); line-height:1.35; font-weight:600;')}
  ${rule('.dashboard-body-surface h4|.student-dashboard .step-card h4|.weekly-github-activity h4|.weekly-form-header h4|.drawer-section h4', 'font-family:var(--editorial-heading); font-size:var(--heading-subsection); line-height:1.4; font-weight:600; color:var(--color-ink);')}
  ${rule('.student-setup-title', 'margin:0 auto 0 0;')}
  @media(prefers-reduced-motion:reduce) {
    ${rule('*|*::before|*::after', 'scroll-behavior:auto; transition:none;')}
  }
  ${getStandardButtonStyles_(scope)}
  `;
}

/** Action-button contract. Navigation and assessment selectors retain their layouts. */
function getStandardButtonStyles_(scope = '') {
  const selectors = [scope + ' :is(button,a).app-btn'];
  if (scope) selectors.push(scope + ' :is(.dashboard-body-surface,.announcement-tab-surface,.utility-body,.review-drawer,.internal-publishing,.system-status-cards,.swal2-container) :is(button,a).app-btn');
  const rule = (suffix, declarations) => selectors.map(selector => selector.trim() + suffix).join(',\n') + ' { ' + declarations + ' }';
  return `
  ${rule('', '--btn-height:36px; --btn-font:13px; --btn-pad-y:7px; --btn-pad-x:12px; --btn-icon:16px; --btn-bg:var(--color-paper,#fff); --btn-fg:var(--color-accent-primary,#304B68); --btn-border:var(--color-control-border,#9A9F97); --btn-hover-bg:var(--color-accent-tint,#E9EEF5); --btn-hover-fg:var(--btn-fg); --btn-hover-border:var(--color-accent-primary,#304B68); box-sizing:border-box; display:inline-flex; align-items:center; justify-content:center; gap:6px; min-height:var(--btn-height); height:auto; min-width:0; padding:var(--btn-pad-y) var(--btn-pad-x); border:1px solid var(--btn-border); border-radius:6px; background:var(--btn-bg); color:var(--btn-fg); font-family:var(--editorial-body,"Segoe UI",Arial,sans-serif); font-size:var(--btn-font); line-height:1.2; font-weight:600; text-align:center; text-decoration:none; box-shadow:none; cursor:pointer; vertical-align:middle;')}
  ${rule('.btn-sm', '--btn-height:30px; --btn-font:12px; --btn-pad-y:5px; --btn-pad-x:9px; --btn-icon:14px;')}
  ${rule('.btn-md', '--btn-height:36px; --btn-font:13px; --btn-pad-y:7px; --btn-pad-x:12px; --btn-icon:16px;')}
  ${rule('.btn-lg', '--btn-height:44px; --btn-font:14px; --btn-pad-y:10px; --btn-pad-x:16px; --btn-icon:18px;')}
  ${rule('.btn-primary', '--btn-bg:var(--color-accent-fill,#304B68); --btn-fg:var(--color-on-accent,#fff); --btn-border:var(--btn-bg); --btn-hover-bg:var(--color-accent-fill-hover,#23394F); --btn-hover-border:var(--btn-hover-bg);')}
  ${rule('.btn-secondary', '--btn-bg:var(--color-paper,#fff); --btn-fg:var(--color-accent-primary,#304B68); --btn-border:var(--color-control-border,#9A9F97); --btn-hover-bg:var(--color-accent-tint,#E9EEF5); --btn-hover-border:var(--color-accent-primary,#304B68);')}
  ${['success','warning','danger'].map(variant => rule('.btn-' + variant, '--btn-bg:var(--color-' + variant + '-tint); --btn-fg:var(--color-' + variant + '); --btn-border:var(--color-' + variant + '); --btn-hover-bg:var(--color-' + variant + '); --btn-hover-fg:#fff; --btn-hover-border:var(--color-' + variant + ');')).join('\n')}
  ${rule('.btn-custom', '--btn-bg:var(--button-custom-bg,var(--color-info-tint,#E8EFF0)); --btn-fg:var(--button-custom-color,var(--color-info,#405C65)); --btn-border:var(--button-custom-border,var(--btn-fg)); --btn-hover-bg:var(--button-custom-hover-bg,var(--color-info,#405C65)); --btn-hover-fg:var(--button-custom-hover-color,#fff); --btn-hover-border:var(--button-custom-hover-border,var(--btn-hover-bg));')}
  ${rule(':hover:not(:disabled):not([aria-disabled="true"])', 'background:var(--btn-hover-bg); color:var(--btn-hover-fg); border-color:var(--btn-hover-border); text-decoration:none; box-shadow:none;')}
  ${rule(':is(:disabled,[aria-disabled="true"])', 'opacity:.5; cursor:not-allowed; box-shadow:none;')}
  ${rule(':focus-visible', 'outline:3px solid var(--color-accent-primary,#304B68); outline-offset:3px;')}
  ${rule('[hidden]', 'display:none;')}
  ${rule('.btn-icon', 'width:var(--btn-height); min-width:var(--btn-height); padding:var(--btn-pad-y); aspect-ratio:1;')}
  ${rule(' .lucide-icon', 'width:var(--btn-icon); height:var(--btn-icon); flex:none; margin:0;')}
  ${rule('.btn-table-sort', '--btn-height:32px; width:100%; justify-content:flex-start; gap:5px; padding:0; border:0; border-radius:0; background:transparent; color:inherit; font:inherit; letter-spacing:inherit; text-transform:inherit; text-align:left; line-height:1.35;')}
  ${rule('.btn-table-sort::after', 'content:"↕"; flex:none; font-size:12px; line-height:1; opacity:.35;')}
  ${rule('.btn-table-sort[data-sort-direction="ascending"]::after', 'content:"↑"; opacity:1;')}
  ${rule('.btn-table-sort[data-sort-direction="descending"]::after', 'content:"↓"; opacity:1;')}
  ${rule('.btn-table-sort:hover:not(:disabled):not([aria-disabled="true"])', 'background:transparent; color:var(--color-accent-primary,#304B68); border-color:transparent; box-shadow:none;')}
  ${rule('.btn-table-sort:hover::after', 'opacity:1;')}
  ${rule('.btn-table-sort:not([data-sort-direction="none"])', 'color:var(--color-accent-primary,#304B68);')}
  @media (pointer:coarse) {
    ${rule('.btn-sm', '--btn-height:36px;')}
  }
  `;
}

/** Shared light surfaces for Announcements and all dashboard content. */
function getDashboardSurfaceStyles_() {
  return `
  .announcement-tab-surface, .dashboard-body-surface {
    margin-top:4px; padding:28px; background:#f8fafc; color:#182230;
    border:1px solid #e4e7ec; border-radius:20px; box-shadow:0 4px 20px rgba(16,24,40,.04);
    font-family:'Inter','Segoe UI',Helvetica,Arial,sans-serif; font-size:13px; line-height:1.5;
  }
  .dashboard-body-surface h1 {
    margin:0; color:#182230; font-family:inherit; font-size:24px; font-weight:700; line-height:1.3; letter-spacing:-.6px;
  }
  .dashboard-body-surface h1 { margin-bottom:24px; }
  .team-page-size { display:flex; align-items:center; gap:8px; white-space:nowrap; font-size:12px; }
  .dashboard-body-surface .team-page-size select { width:auto; min-height:34px; padding:5px 9px; font-size:12px; }
  .dashboard-body-surface .dashboard-container-header h2 { margin-bottom:0; }
  :is(.announcement-tab-surface, .dashboard-body-surface) :is(h2,h3) { font-family:inherit; }
  :is(.announcement-tab-surface, .dashboard-body-surface) button {
    font-family:inherit; font-size:13px; font-weight:600; line-height:1.4; border-radius:10px;
  }
  :is(.announcement-tab-surface, .dashboard-body-surface) :is(input:not([type=checkbox]):not([type=radio]),select,textarea) {
    box-sizing:border-box; padding:10px 14px; min-height:44px; border:1px solid #d0d5dd;
    border-radius:10px; background:#fff; color:#182230; font-family:inherit; font-size:14px; line-height:1.4;
  }
  :is(.announcement-tab-surface, .dashboard-body-surface) :is(input,textarea)::placeholder { color:#667085; }
  :is(.announcement-tab-surface, .dashboard-body-surface) :is(a,button,summary,input,select,textarea):focus-visible {
    outline:3px solid #9e77ed; outline-offset:3px;
  }
  @media(max-width:640px) {
    .announcement-tab-surface, .dashboard-body-surface { padding:18px 14px; border-radius:16px; }
    .dashboard-body-surface h1 { font-size:22px; }
  }
  `;
}
