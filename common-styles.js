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
  :root { --font-size-body:14px; --font-size-small:12px; }
  .internal-publishing { --publishing-border:var(--color-border,#dce4e5); color:var(--color-ink,#172f35); }
  .publishing-heading { display:flex; align-items:center; justify-content:space-between; gap:12px; margin-bottom:14px; }
  .publishing-eyebrow { display:block; color:var(--color-accent-primary,#0f766e); font-size:var(--font-size-small); font-weight:700; letter-spacing:.1em; text-transform:uppercase; margin-bottom:6px; }
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
  .publishing-score { display:inline-block; flex-shrink:0; padding:1px 6px; border-radius:5px; background:var(--color-soft,#eef2f4); color:var(--color-ink,#172f35); font-size:var(--font-size-small); line-height:1.4; font-variant-numeric:tabular-nums; white-space:nowrap; }
  .internal-publishing small { display:block; margin-top:2px; font-size:var(--font-size-small); font-weight:400; line-height:1.35; color:var(--color-ink-muted,#52636c); overflow-wrap:anywhere; }
  .publishing-badge { display:inline-block; padding:3px 6px; font-size:var(--font-size-small); line-height:1.3; border-radius:5px; background:var(--color-soft,#eef2f4); white-space:nowrap; }
  .publishing-badge[data-state="READY_TO_PUBLISH"] { color:#235e8c; background:#edf5fc; }
  .publishing-badge[data-state="PUBLISHED"] { color:#17634a; background:#eaf6ef; }
  .internal-publishing span[data-tooltip] { cursor:help; }
  .internal-publishing span[data-tooltip]:focus-visible { outline:3px solid var(--color-accent-primary,#0f766e); outline-offset:3px; }
  .internal-publishing span[data-tooltip] { cursor:help; }
  .internal-publishing span[data-tooltip]:focus-visible { outline:3px solid var(--color-accent-primary,#0f766e); outline-offset:3px; }
  .publishing-badge[data-state="PARTIAL_OR_EXCEPTION"],.publishing-badge[data-state="PARTIALLY_PUBLISHED"] { color:#80520c; background:#fff4dc; }
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
  .review1-history { margin-top:16px; border-top:1px solid var(--color-border,#e2e8f0); padding-top:12px; font-size:12px; }
  .review1-history summary { cursor:pointer; font-weight:600; color:var(--color-ink-muted,#475569); }
  .review1-history summary span { margin-left:6px; padding:2px 7px; border-radius:var(--editorial-radius,12px); background:var(--color-border,#e2e8f0); font-size:11px; }
  .review1-history ol { list-style:none; padding:0; margin:8px 0 0; }
  .review1-history li { padding:10px 0; border-bottom:1px solid var(--color-border,#e2e8f0); overflow-wrap:anywhere; }
  .review1-history li:last-child { border-bottom:0; }
  .review1-history-heading { display:flex; flex-wrap:wrap; justify-content:space-between; gap:4px 12px; }
  .review1-history time, .review1-history small { color:var(--color-ink-muted,#64748b); font-size:11px; }
  .review1-history-status { margin-top:4px; color:var(--color-ink-muted,#475569); }
  .review1-history li p { margin:4px 0; white-space:pre-line; }
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
    .publishing-heading { align-items:flex-start; flex-direction:column; gap:10px; }
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
    border-radius: 999px;
    font-size: 11px;
    font-weight: 600;
    text-decoration: none;
    white-space: nowrap;
  }
  .status-badge.green { background: #dcfce7; color: #16a34a; }
  .status-badge.orange { background: #ffedd5; color: #c2410c; }
  .status-badge.blue { background: #e0e7ff; color: #4338ca; }
  .status-badge.gray { background: #f1f2f4; color: #6b7280; }
  .status-badge.red { background: #fee2e2; color: #dc2626; }
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
  .mini:disabled { opacity: 0.5; cursor: not-allowed; }`;
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
    border-radius: 999px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  .tag.gray { color: #5b5f6b; background: #eef0f3; }
  .tag.orange { color: #9a5b0c; background: #fef3e2; }
  .tag.blue { color: #3548b0; background: #eaecfc; }
  .tag.green { color: #15803d; background: #e6f7ec; }
  .tag.red { color: #b91c1c; background: #fdeaea; }
  .team-chip {
    font-size: 12px;
    color: #8b8f99;
    background: #f4f5f7;
    padding: 4px 10px;
    border-radius: 8px;
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
    color: #9a5b0c;
    background: #fef3e2;
    padding: 8px 10px;
    border-radius: 8px;
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
// STUDENT DASHBOARD — Dark theme
// ===================================================================
function getStudentColorTokens() {
  return `
  :root {
    --sd-bg: #0B0F17;
    --sd-surface: #131826;
    --sd-border: #232938;
    --sd-accent: #7C5CFC;
    --sd-accent-hover: #6A4CE0;
    --sd-accent-dim: rgba(124,92,252,0.15);
    --sd-success: #34D399;
    --sd-waiting: #F5A623;
    --sd-text: #F5F7FA;
    --sd-text-muted: #8B93A7;
  }`;
}

function getStudentPageStyles() {
  return `
  ${getStudentColorTokens()}
  body {
    font-family: 'Inter', 'Segoe UI', Helvetica, Arial, sans-serif;
    max-width: 640px;
    margin: 32px auto;
    padding: 0 16px;
    background: var(--sd-bg);
    color: var(--sd-text);
  }
  .student-dashboard-surface {
    background: var(--sd-bg);
    color: var(--sd-text);
    border-radius: 18px;
    padding: 24px;
    box-sizing: border-box;
  }
  .dash-hero { margin-bottom: 22px; }
  .dash-hero h1 {
    font-family: 'Space Grotesk', sans-serif;
    font-size: 26px;
    font-weight: 700;
    margin: 0 0 4px 0;
    color: var(--sd-text);
    display: flex;
    align-items: center;
    gap: 10px;
  }
  .mono-tag {
    font-family: 'JetBrains Mono', monospace;
    background: var(--sd-accent-dim);
    color: var(--sd-accent);
    padding: 3px 10px;
    border-radius: 6px;
    font-size: 20px;
    line-height: 1;
  }
  .hero-sub {
    font-size: 13px;
    color: var(--sd-text-muted);
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
    background: var(--sd-surface);
    border: 1px solid var(--sd-border);
    border-radius: 999px;
    padding: 6px 14px 6px 6px;
  }
  .avatar {
    width: 30px;
    height: 30px;
    border-radius: 50%;
    display: flex;
    align-items: center;
    justify-content: center;
    font-family: 'Space Grotesk', sans-serif;
    font-size: 12px;
    font-weight: 700;
    color: #0B0F17;
    flex-shrink: 0;
  }
  .member-name {
    font-size: 13px;
    font-weight: 600;
    color: var(--sd-text);
    line-height: 1.3;
  }
  .you-tag {
    font-size: 10px;
    font-weight: 600;
    color: var(--sd-accent);
  }
  .member-reg {
    font-family: 'JetBrains Mono', monospace;
    font-size: 11px;
    color: var(--sd-text-muted);
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
    font-family: 'Space Grotesk', sans-serif;
    font-weight: 700;
    font-size: 14px;
    flex-shrink: 0;
  }

  .step-node-done {
    background: var(--sd-success);
    color: #0B0F17;
  }

  .step-node-waiting {
    background: var(--sd-waiting);
    color: #0B0F17;
  }

  .step-node-active {
    background: var(--sd-accent);
    color: #fff;
  }

  .step-node-locked {
    background: #232938;
    color: var(--sd-text-muted);
    border: 1px solid #3A4257;
    font-size: 13px;
  }

  .step-line {
    width: 2px;
    flex: 1;
    min-height: 24px;
    background: var(--sd-border);
    margin: 4px 0;
  }

  .step-card {
    flex: 1;
    background: var(--sd-surface);
    border: 1px solid var(--sd-border);
    border-radius: 14px;
    padding: 16px 18px;
    margin-bottom: 16px;
  }

  .step-card-locked h3 {
    color: #6B7280;
  }

  .step-card-locked .step-body p {
    color: #6B7280;
  }

  .step-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    margin-bottom: 6px;
  }

  .step-header h3 {
    font-family: 'Space Grotesk', sans-serif;
    margin: 0;
    font-size: 15px;
    color: var(--sd-text);
    font-weight: 600;
  }

  .step-badge {
    font-size: 11px;
    font-weight: 600;
    padding: 3px 10px;
    border-radius: 999px;
    white-space: nowrap;
  }

  .step-badge.done {
    background: rgba(52,211,153,0.15);
    color: var(--sd-success);
  }

  .step-badge.waiting {
    background: rgba(245,166,35,0.15);
    color: var(--sd-waiting);
  }

  .step-badge.active {
    background: rgba(124,92,252,0.18);
    color: var(--sd-accent);
  }

  .step-badge.locked {
    background: #2A3142;
    color: #9AA2B5;
  }

  .step-body p {
    margin: 0 0 6px 0;
    font-size: 13.5px;
    color: var(--sd-text-muted);
    line-height: 1.5;
  }

  .step-detail {
    font-size: 12.5px;
  }

  .step-detail.note {
    color: var(--sd-waiting);
  }

  .mono-detail {
    font-family: 'JetBrains Mono', monospace;
    font-size: 12px;
    color: var(--sd-text);
    word-break: break-all;
  }

  a.mono-detail.link {
    display: inline-block;
    color: var(--sd-accent);
    text-decoration: underline;
    text-decoration-color: var(--sd-accent-dim);
    text-underline-offset: 3px;
  }

  a.mono-detail.link:hover {
    color: var(--sd-accent-hover);
  }

  .student-btn {
    display: inline-block;
    margin-top: 8px;
    padding: 9px 18px;
    border-radius: 8px;
    font-size: 13px;
    font-weight: 600;
    background: var(--sd-accent);
    color: #fff;
    text-decoration: none;
  }

  .student-btn:hover {
    background: var(--sd-accent-hover);
  }
  .student-btn[hidden] { display: none; }
  .student-btn[hidden] { display: none; }

  .github-username-form { margin-top: 14px; }
  .github-username-form[hidden] { display: none; }
  .github-username-form label { display: block; margin-bottom: 6px; }
  .github-username-form input {
    display: block; box-sizing: border-box; width: 100%; max-width: 360px;
    padding: 10px 12px; border: 1px solid var(--sd-border); border-radius: 8px;
    background: var(--sd-surface); color: var(--sd-text); font: inherit;
  }
  .github-username-form input:focus-visible { outline: 2px solid var(--sd-accent); outline-offset: 2px; }
  .github-username-form button { border: 0; cursor: pointer; font-family: inherit; }
  .github-username-form :disabled { opacity: .65; cursor: wait; }
  #githubSubmitStatus { font-size: 13px; }

  .student-btn.secondary {
    background: transparent;
    color: var(--sd-text);
    border: 1px solid var(--sd-border);
  }

  .student-btn.secondary:hover {
    border-color: var(--sd-accent);
    color: var(--sd-accent);
  }

  .marks-card {
    background: var(--sd-surface);
    border: 1px solid var(--sd-border);
    border-radius: 14px;
    padding: 16px 18px;
    margin-top: 4px;
  }

  .marks-card h3 {
    font-family: 'Space Grotesk', sans-serif;
    margin: 0 0 10px 0;
    font-size: 15px;
    color: var(--sd-text);
    font-weight: 600;
  }

  .marks-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 8px 0;
    border-top: 1px solid var(--sd-border);
    font-size: 13.5px;
    color: var(--sd-text);
  }

  .marks-row:first-of-type {
    border-top: none;
  }

  .marks-value {
    font-family: 'JetBrains Mono', monospace;
    font-weight: 600;
    color: var(--sd-success);
  }

  .marks-pending {
    font-size: 12px;
    color: var(--sd-text-muted);
    font-style: italic;
  }

  .announcement-card {
    margin-top: 18px;
    background: #fff;
    border: 1px solid var(--sd-border, #e5e7eb);
    border-radius: 14px;
    padding: 16px 18px;
    box-shadow: 0 1px 3px rgba(0,0,0,0.04);
  }
  .announcement-tab-surface {
    --sd-text:#182230; --sd-text-muted:#667085; --sd-border:#e4e7ec; --sd-accent:#6941c6;
  }
  .announcement-header { display:flex; align-items:center; justify-content:space-between; gap:20px; margin-bottom:24px; }
  .announcement-title-row { display:flex; align-items:center; gap:10px; }
  .announcement-tab-surface .announcement-header h2 { margin:0; color:#182230; font-size:24px; font-weight:700; letter-spacing:-.6px; }
  .announcement-count { display:inline-flex; align-items:center; justify-content:center; min-width:28px; height:26px; padding:0 8px; border-radius:8px; background:#ede9fe; color:#6941c6; font-size:12px; font-weight:700; }
  .announcement-subtitle { margin:7px 0 0; color:#667085; font-size:13px; line-height:1.5; }
  .announcement-actions { display:flex; align-items:center; gap:10px; flex-wrap:wrap; }
  .announcement-add-btn, .announcement-refresh-btn { display:inline-flex; align-items:center; justify-content:center; min-height:42px; padding:10px 15px; border:1px solid #d0d5dd; border-radius:10px; font-family:inherit; font-size:13px; font-weight:600; text-decoration:none; cursor:pointer; transition:background .15s, box-shadow .15s; }
  .announcement-refresh-btn { background:#fff; color:#344054; }
  .announcement-refresh-btn:hover { background:#f2f4f7; }
  .announcement-refresh-btn:disabled { cursor:wait; color:#667085; background:#f2f4f7; }
  .announcement-add-btn { background:#6941c6; border-color:#6941c6; color:#fff; box-shadow:0 2px 4px rgba(105,65,198,.16); }
  .announcement-add-btn:hover { background:#53389e; color:#fff; text-decoration:none; }
  .announcement-tab-surface :is(a,button,summary):focus-visible { outline:3px solid #9e77ed; outline-offset:4px; }
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
  .announcement-audience-chip { padding:2px 7px; background:#f2f4f7; border:1px solid #eaecf0; border-radius:6px; color:#475467; font-weight:600; }
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
  .announcement-loading { min-height:70px; }
  .announcement-sr-only { position:absolute; width:1px; height:1px; padding:0; margin:-1px; overflow:hidden; clip:rect(0,0,0,0); white-space:nowrap; border:0; }
  @media (max-width:640px) {
    .announcement-header { align-items:flex-start; flex-direction:column; gap:16px; margin-bottom:20px; }
    .announcement-tab-surface .announcement-header h2 { font-size:22px; }
    .announcement-actions { width:100%; }
    .announcement-actions > * { flex:1; }
    .announcement-item { padding:12px 14px; }
  }
  `;
}


function getSharedTimelineStyles_() {
  return `
  .shared-timeline { margin:0 0 20px; padding:14px 24px; min-height:180px; border:1px solid #30324d; border-radius:22px; background:radial-gradient(ellipse at top right,rgba(139,92,246,.20),transparent 60%),radial-gradient(ellipse at bottom left,rgba(34,211,238,.06),transparent 55%),#101523; color:#f5f7fa; box-shadow:0 8px 24px rgba(11,15,23,.14),inset 0 1px 0 rgba(255,255,255,.04); color-scheme:dark; }
  .timeline-heading { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; }
  .shared-timeline .timeline-heading h2 { display:block; margin:0; padding:0; border:0; min-height:0; color:#f5f7fa; font-family:'Space Grotesk','Inter',sans-serif; font-size:20px; line-height:1.15; font-weight:600; letter-spacing:-.6px; }
  .timeline-meta { display:flex; align-items:center; flex-wrap:wrap; gap:8px; font-size:11px; }
  .timeline-meta .timeline-today { padding:6px 10px; border:1px solid #655192; border-radius:999px; background:#34274f; color:#e2d9ff; font-weight:600; }
  .timeline-week { color:#a5f3fc; padding:6px 11px; border:1px solid #2d5361; border-radius:999px; background:#142d38; font-weight:500; }
  .timeline-body { position:relative; margin-top:14px; padding-top:12px; border-top:1px solid #202a3b; }
  .timeline-scroll { width:100%; max-width:100%; min-width:0; overflow-x:auto; overscroll-behavior-x:contain; scrollbar-width:none; margin-top:0; touch-action:pan-x pan-y pinch-zoom; -webkit-overflow-scrolling:touch; cursor:grab; user-select:none; -webkit-user-select:none; }
  .timeline-scroll[data-dragging="true"] { cursor:grabbing; scroll-behavior:auto; }
  .timeline-scroll::-webkit-scrollbar { display:none; }
  .timeline-scroll:focus-visible { outline:2px solid #c4b5fd; outline-offset:4px; border-radius:6px; }
  .timeline-navigation { position:absolute; top:12px; right:0; z-index:2; display:flex; justify-content:flex-end; gap:8px; }
  .timeline-navigation[hidden] { display:none; }
  .shared-timeline .timeline-nav { display:inline-flex; align-items:center; justify-content:center; flex:none; width:28px; height:28px; min-height:0; padding:0; border:1px solid #2b3548; border-radius:9px; background:#101827; color:#cbd5e1; cursor:pointer; }
  .shared-timeline .timeline-nav svg { width:14px; height:14px; }
  .shared-timeline .timeline-nav:hover:enabled { background:#202a3d; border-color:#756093; color:#fff; }
  .shared-timeline .timeline-nav:disabled { opacity:.35; cursor:default; }
  .shared-timeline .timeline-nav:focus-visible { outline:2px solid #c4b5fd; outline-offset:3px; }
  .timeline-track { display:grid; grid-template-columns:repeat(var(--timeline-stops),minmax(132px,1fr)); list-style:none; margin:0; padding:44px 0 8px; }
  .timeline-stop { position:relative; display:flex; flex-direction:column; align-items:center; gap:6px; padding:54px 10px 0; min-width:0; box-sizing:border-box; text-align:center; }
  .timeline-stop::before { content:''; position:absolute; height:2px; background:#263144; top:16px; left:50%; right:-50%; }
  .timeline-stop:last-child::before { display:none; }
  .timeline-dot { position:absolute; top:0; left:calc(50% - 17px); box-sizing:border-box; width:34px; height:34px; border-radius:50%; background:#101725; border:2px solid #2b3649; z-index:1; }
  .timeline-dot::after { content:''; position:absolute; width:9px; height:9px; top:50%; left:50%; transform:translate(-50%,-50%); border-radius:50%; background:#465267; }
  .timeline-past .timeline-dot, .timeline-imminent .timeline-dot { background:#0b292c; border-color:#16b8aa; box-shadow:0 0 16px rgba(20,184,166,.18); }
  .timeline-past .timeline-dot::after, .timeline-imminent .timeline-dot::after { width:11px; height:11px; background:#2dd4bf; }
  .timeline-past::before, .timeline-imminent::before { background:#2dd4bf; box-shadow:0 0 6px rgba(45,212,191,.3); }
  .timeline-approaching::before { background:linear-gradient(90deg,#2dd4bf,#a855f7); }
  .timeline-current .timeline-dot { top:-5px; left:calc(50% - 22px); width:44px; height:44px; display:flex; align-items:center; justify-content:center; border:0; background:transparent; }
  .timeline-current .timeline-dot::before { content:''; position:absolute; inset:6px; box-sizing:border-box; border-radius:50%; background:rgba(168,85,247,.32); pointer-events:none; transform-origin:center; animation:timeline-radiating-halo 2s linear infinite; }
  .timeline-current .timeline-dot::after { content:''; position:absolute; inset:3px; width:auto; height:auto; transform:none; border-radius:50%; background:transparent; box-shadow:0 0 12px rgba(168,85,247,.22); pointer-events:none; }
  .timeline-current .timeline-node-core { position:relative; z-index:2; box-sizing:border-box; width:32px; height:32px; display:flex; align-items:center; justify-content:center; border-radius:50%; background:#291540; border:2px solid #a855f7; box-shadow:0 0 0 3px rgba(168,85,247,.12),0 0 10px rgba(168,85,247,.3); }
  .timeline-current .timeline-node-core::after { content:''; width:14px; height:14px; border-radius:50%; background:#c084fc; box-shadow:0 0 0 4px rgba(168,85,247,.18); }
  @keyframes timeline-radiating-halo { 0% { transform:scale(1); opacity:0; } 20% { transform:scale(1.15); opacity:.35; } 50% { transform:scale(1.55); opacity:.85; } 70% { transform:scale(1.9); opacity:.45; } 100% { transform:scale(2.2); opacity:0; } }
  @media(prefers-reduced-motion:reduce) { .timeline-current .timeline-dot::before { animation:none; transform:none; opacity:0; } }
  .timeline-stop.timeline-today { background:transparent; border-radius:0; color:#f5f7fa; font-weight:inherit; }
  .timeline-date { display:inline-block; box-sizing:border-box; max-width:100%; padding:3px 10px; border:1px solid #30394b; border-radius:5px; background:rgba(15,23,42,.45); color:#94a3b8; font-family:ui-monospace,SFMono-Regular,Consolas,monospace; font-size:13px; line-height:1.4; font-variant-numeric:tabular-nums; white-space:nowrap; }
  .timeline-past .timeline-date, .timeline-imminent .timeline-date { color:#7de8dc; border-color:#155e59; background:rgba(13,148,136,.12); }
  .timeline-current .timeline-date { color:#f0dfff; border-color:#7e22ce; background:rgba(107,33,168,.3); }
  .timeline-stop strong { overflow-wrap:anywhere; color:#d4dbe7; font-size:11px; font-weight:600; line-height:1.4; margin:0; }
  .timeline-state { position:absolute; top:-37px; left:0; right:0; text-align:center; white-space:nowrap; color:#94a3b8; font-size:10px; line-height:1.5; }
  .timeline-future strong { color:#a8b3c7; }
  .timeline-current strong { color:#fff; }
  .timeline-current .timeline-state { color:#c084fc; font-weight:600; }
  .timeline-imminent strong { color:#f5f7fa; }
  .timeline-imminent .timeline-dot { border-color:transparent; background:linear-gradient(#142432,#142432) padding-box,linear-gradient(90deg,#2dd4bf,#a855f7) border-box; box-shadow:-4px 0 12px rgba(45,212,191,.18),4px 0 12px rgba(168,85,247,.2); }
  .timeline-imminent .timeline-dot::after { background:linear-gradient(90deg,#2dd4bf,#c084fc); }
  .timeline-imminent::before { background:linear-gradient(90deg,#2dd4bf,#a855f7); }
  .timeline-imminent.timeline-approaching::before { background:#a855f7; box-shadow:0 0 6px rgba(168,85,247,.3); }
  .timeline-imminent .timeline-date { color:#e2e8f0; border-color:#596887; background:linear-gradient(90deg,rgba(13,148,136,.2),rgba(107,33,168,.25)); }
  .timeline-imminent .timeline-state { color:#c4b5fd; font-weight:600; }
  .timeline-loading { color:#a8b3c7; font-size:13px; }
  .timeline-retry { padding:8px 14px; border:1px solid #655192; border-radius:8px; background:#34274f; color:#c4b5fd; cursor:pointer; }
  .timeline-retry:hover { background:#473568; }
  .timeline-retry:focus-visible { outline:3px solid #9e77ed; outline-offset:3px; }
  @media(max-width:760px) { .shared-timeline { padding:14px 18px; } }
  `;
}

/** Shared pure renderer, used on the server and embedded in the browser bundle. */
function getSkeletonMarkup_(variant, label) {
  variant = ['panel','drawer','inline','timeline'].includes(variant) ? variant : 'panel';
  const safeLabel = String(label || 'Loading content').replace(/[&<>"']/g, character => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[character]));
  const bar = '<span class="app-skeleton-bar" aria-hidden="true"></span>';
  return '<span class="app-skeleton app-skeleton--' + variant + '" role="status" aria-label="' + safeLabel + '">' +
    (variant === 'inline' ? bar : '<span class="app-skeleton-title" aria-hidden="true">' + bar + '</span>' +
    '<span class="app-skeleton-lines" aria-hidden="true">' + bar.repeat(variant === 'drawer' ? 6 : 3) + '</span>') + '</span>';
}

function getLoadingStyles_() {
  return `
  .app-content-loading { position:relative !important; overflow:hidden; }
  .app-content-loading > :not(.app-loading-overlay) { visibility:hidden !important; }
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
  .app-skeleton--timeline { --skeleton-base:#242e42; --skeleton-highlight:#39425c; --skeleton-edge:#303b51; padding:16px 0 0; }
  .app-skeleton--timeline .app-skeleton-lines { grid-template-columns:repeat(3,minmax(0,1fr)); }
  @keyframes appSkeletonShimmer { from { background-position:200% 0; } to { background-position:-200% 0; } }
  @media (prefers-reduced-motion:reduce) { .app-skeleton-bar { animation:none; } }
  `;
}

/**
 * Opt-in editorial theme. Keep every selector under the body theme boundary:
 * the student tab must retain the legacy cascade, including shared overlays.
 * Loaded last by the shell so component geometry and interaction rules survive.
 */
function getEditorialStyles_() {
  const scope = 'body[data-dashboard-theme="editorial"]';
  // Prefix selectors explicitly; do not rely on CSS nesting in Apps Script clients.
  const rule = (selectors, declarations) => selectors.split('|').map(s => scope + ' ' + s.trim()).join(',\n') + ' { ' + declarations + ' }';
  return `
  ${scope} {
    --color-canvas:#F5F6F8; --color-paper:#FFFEFC; --color-ink:#252C30; --color-ink-muted:#56636A;
    --color-accent-primary:#304B68; --color-accent-hover:#23394F; --color-accent-secondary:#C5B59E;
    --color-border:#E6E3DE; --color-control-border:#9A9F97; --color-soft:#F0EDE7; --color-accent-tint:#E9EEF5;
    --color-success:#3A5F43; --color-success-tint:#E9F0E7; --color-warning:#805600; --color-warning-tint:#F8EED8;
    --color-danger:#A12E29; --color-danger-tint:#F8E7E3; --color-info:#405C65; --color-info-tint:#E8EFF0;
    --editorial-radius:8px; --editorial-heading:'Source Serif 4',Georgia,serif;
    --editorial-body:'Source Sans 3','Segoe UI',Arial,sans-serif;
    --dashboard-section-gap:16px; --dashboard-content-gap:12px; --dashboard-small-gap:8px;
    --loading-surface:var(--color-paper); --skeleton-base:#E6E3DE; --skeleton-highlight:#F4F1EB; --skeleton-edge:#DEDAD2;
    --muted-text:var(--color-ink-muted);
    max-width:1200px; margin:0 auto; padding:32px 24px 56px;
    background:var(--color-canvas); color:var(--color-ink); color-scheme:light;
    font-family:var(--editorial-body); font-size:15px; line-height:1.55;
  }
  ${rule('h1|h2|h3|h4|.card-title|.assessment-title|.pipeline-title|.tracker-title|.team-drawer-title|.drawer-project-title|.shared-timeline .timeline-heading h2|.shared-rubrics h2|.announcement-tab-surface .announcement-header h2|.dashboard-body-surface h1|.dashboard-body-surface :is(h2,h3)|.review1-drawer .team-drawer-title', 'font-family:var(--editorial-heading); color:var(--color-ink); font-weight:600; letter-spacing:-.025em; text-transform:none; overflow-wrap:anywhere;')}
  ${rule('h1|.dashboard-body-surface h1|.announcement-tab-surface .announcement-header h2', 'font-size:32px; line-height:1.2;')}
  ${rule('h2|.shared-timeline .timeline-heading h2|.shared-rubrics h2|.assessment-title|.pipeline-title|.tracker-title', 'font-size:23px; line-height:1.3;')}
  ${rule('h3|.card-title|.team-drawer-title|.review1-drawer .team-drawer-title', 'font-size:20px; line-height:1.35;')}
  ${rule('a|.card-sub a|.doc-links a|.coord-table.read-only a|.expand-hint|.announcement-expand|.announcement-collapse|.drawer-repo-link|.view-link', 'color:var(--color-accent-primary); text-underline-offset:3px;')}
  ${rule('a:hover', 'color:var(--color-accent-hover);')}
  ${rule('.signed-in-as', 'font-size:13px; color:var(--color-ink-muted); margin:8px 0 24px; overflow-wrap:anywhere;')}
  ${rule('.dashboard-body-surface|.announcement-tab-surface', '--sd-text:var(--color-ink); --sd-text-muted:var(--color-ink-muted); --sd-border:var(--color-border); --sd-accent:var(--color-accent-primary); background:transparent; color:var(--color-ink); border:0; border-radius:0; box-shadow:none; padding:24px 0 0; font-family:var(--editorial-body); font-size:14px; line-height:1.55;')}
  ${rule('.dashboard-container-header|.announcement-header', 'padding-bottom:20px; margin-bottom:24px; border-bottom:1px solid var(--color-border);')}
  ${rule('.dashboard-body-surface', 'padding-top:var(--dashboard-small-gap);')}
  ${rule('.dashboard-container-header', 'padding-bottom:var(--dashboard-content-gap); margin-bottom:var(--dashboard-section-gap); gap:var(--dashboard-content-gap);')}
  ${rule('.dashboard-container-header .announcement-subtitle', 'margin:4px 0 0;')}
  ${rule('.dashboard-navigation', 'background:var(--color-paper); border:1px solid var(--color-border); border-radius:6px; margin-bottom:28px; box-shadow:none;')}
  ${rule('.dashboard-navigation .role-tabs', 'border-radius:6px;')}
  ${rule('.dashboard-navigation .role-tab-btn|.role-menu-toggle', 'font-family:var(--editorial-body); background:transparent; color:var(--color-ink-muted); border-radius:0; box-shadow:none; font-size:14px;')}
  ${rule('.dashboard-navigation .role-tab-btn:hover|.role-menu-toggle:hover', 'background:var(--color-soft); color:var(--color-ink);')}
  ${rule('.dashboard-navigation .role-tab-btn.active', 'background:var(--color-accent-tint); color:var(--color-accent-primary); box-shadow:inset 0 -3px var(--color-accent-primary); border-color:var(--color-accent-primary);')}

  /* Paper surfaces, with structure supplied by fine rules rather than elevation. */
  ${rule('.shared-timeline|.shared-rubrics|.event-card|.pipeline-section|.assessment-section|.github-section|.team-tracker-section|.reviewer-assigned-teams|.system-status-primary > .system-status-card|.coordinator-card-placeholder|.committee-item|.review-config-card|.announcement-item|.announcement-empty-state|.drawer-info-card|.guide-eval-criterion|.review1-assessment-summary', 'background:var(--color-paper); color:var(--color-ink); border:1px solid var(--color-border); border-radius:8px; box-shadow:none; color-scheme:light;')}
  ${rule('.shared-timeline|.shared-rubrics', 'padding:24px; margin-bottom:var(--dashboard-section-gap); border-top:2px solid var(--color-accent-secondary);')}
  ${rule('.shared-rubrics h2', 'margin-bottom:20px;')}
  ${rule('.shared-rubrics-heading', 'display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:var(--dashboard-content-gap);')}
  ${rule('.shared-rubrics-heading h2', 'margin:0;')}
  ${rule('#sharedRubricsToggle', 'width:44px; min-height:44px; padding:0; flex:none; display:inline-flex; align-items:center; justify-content:center;')}
  ${rule('#sharedRubricsToggle[hidden]', 'display:none;')}
  ${rule('#sharedRubricsToggle[aria-expanded="true"] .lucide-icon', 'transform:rotate(180deg);')}
  ${rule('#sharedRubricsContent:not([hidden])', 'margin-top:var(--dashboard-section-gap);')}
  ${rule('#sharedRubricsToggle|#sharedRubricsContent > button', 'background:var(--color-paper); color:var(--color-accent-primary); border-color:var(--color-control-border); border-radius:var(--editorial-radius); font-family:var(--editorial-body);')}
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
  ${rule('.card-divider|.timeline-body|.committee-body|.drawer-section|.drawer-person|.drawer-status-row|.review1-history|.review1-history li|.review1-project-title-row|.review1-criterion[data-index] .review1-feedback-heading', 'border-color:var(--color-border);')}
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
  ${rule('.stat-label|.coord-stat-label|.coordinator-stats-grid .stat-label|.drawer-section-title|.drawer-info-label|.team-drawer-eyebrow|.review1-control-title', 'font-family:var(--editorial-body); font-size:11px; font-weight:600; text-transform:uppercase; letter-spacing:.08em; color:var(--color-ink-muted);')}
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
  ${rule('.btn-solid|.run-sync-btn|.announcement-add-btn|.swal2-confirm|.pagination-buttons button.active|.tracker-tabs .tab.active|.tab.active|.filter-tab.active', 'background:var(--color-accent-primary); color:#fff; border-color:var(--color-accent-primary); box-shadow:none;')}
  ${rule('.btn-solid:hover:enabled|.run-sync-btn:hover:enabled|.announcement-add-btn:hover|.swal2-confirm:hover|.tracker-tabs .tab.active:hover', 'background:var(--color-accent-hover); color:#fff; border-color:var(--color-accent-hover);')}
  ${rule('input:not([type=checkbox]):not([type=radio]):not([type=range])|select|textarea|.dashboard-body-surface :is(input:not([type=checkbox]):not([type=radio]):not([type=range]),select,textarea)|.announcement-tab-surface :is(input,select,textarea)', 'max-width:100%; box-sizing:border-box; background:var(--color-paper); color:var(--color-ink); border:1px solid var(--color-control-border); border-radius:6px; font-family:var(--editorial-body); font-size:14px; line-height:1.45;')}
  ${rule('input::placeholder|textarea::placeholder|.dashboard-body-surface :is(input,textarea)::placeholder', 'color:var(--color-ink-muted); opacity:1;')}
  ${rule('input[aria-invalid="true"]|.review1-criterion input[aria-invalid="true"]', 'border-color:var(--color-danger); background:var(--color-danger-tint);')}
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
  ${rule('.card-top-row|.footer-actions|.pagination', 'flex-wrap:wrap; gap:10px;')}
  ${rule('.card-title|.drawer-project-title|.announcement-message|.announcement-preview', 'overflow-wrap:anywhere;')}
  ${rule('.card-sub|.card-desc|.status-label|.status-cell|.footer-count|.empty|.coord-empty|.doc-links|.team-progress-note|.team-progress-count|.drawer-person-meta|.drawer-problem|.drawer-status-label|.rubric-levels dd|.announcement-date|.announcement-results|.announcement-status|.announcement-empty|.announcement-audience-label|.reviewer-setup-intro|.rubrics-status-detail|.committee-email|.committee-teams|.review1-project-meta-row|.review1-tab-caption|.review1-slider-values|.review1-history time|.review1-history small|#systemStatusMessage', 'color:var(--color-ink-muted);')}
  ${rule('.announcement-message|.announcement-preview|.announcement-details p|.drawer-info-value|.drawer-person-name|.rubric-levels dt', 'color:var(--color-ink);')}
  ${rule('.team-chip|.committee-team-chip|.announcement-audience-chip|.review-config-pill|.review1-graded-pill', 'background:var(--color-soft); color:var(--color-ink-muted); border-color:var(--color-border); border-radius:4px;')}
  ${rule('.status-badge|.tag|.health-badge|.rubrics-status-pill', 'border-radius:4px; font-size:12px;')}
  ${rule('.status-badge.green|.tag.green|.health-badge.green|.tracker-health.green|.committee-sheet-status.linked|.rubrics-status-pill[data-configured="true"]|.review-config-card[data-state="ready"] .review-config-pill|.review1-graded-pill[data-completion="complete"]|.review1-header-line .review1-header-due[data-timing="success"]', 'color:var(--color-success); background:var(--color-success-tint); border-color:var(--color-success);')}
  ${rule('.status-badge.orange|.tag.orange|.health-badge.orange|.tracker-health.orange|.flag|.committee-sheet-status|.rubrics-status-pill[data-configured="false"]|.review-config-card[data-state="invalid"] .review-config-pill|.review1-header-line .review1-header-due[data-timing="warning"]', 'color:var(--color-warning); background:var(--color-warning-tint); border-color:var(--color-warning);')}
  ${rule('.status-badge.red|.tag.red|.health-badge.red|.tracker-health.red|.role-load-error|.drawer-error|.review1-marks-error|.review1-header-line .review1-header-due[data-timing="danger"]', 'color:var(--color-danger); background:var(--color-danger-tint); border-color:var(--color-danger);')}
  ${rule('.status-badge.blue|.tag.blue|.committee-avatar|.review1-header-line .review1-header-due[data-timing="info"]', 'color:var(--color-info); background:var(--color-info-tint); border-color:var(--color-info);')}
  ${rule('.status-badge.gray|.tag.gray', 'color:var(--color-ink-muted); background:var(--color-soft);')}
  ${rule('.drawer-status-good|.stat.green .stat-num|.coord-stat.green .coord-stat-num', 'color:var(--color-success);')}
  ${rule('.drawer-status-warn|.flag-text|.stat.orange .stat-num|.coord-stat.orange .coord-stat-num', 'color:var(--color-warning);')}
  ${rule('.drawer-status-bad|.btn-outline.reject|.coordinator-stats-grid .stat-detail-row .stat-outstanding|.stat.red .stat-num|.coord-stat.red .coord-stat-num', 'color:var(--color-danger);')}
  ${rule('.stat.blue .stat-num|.coord-stat.blue .coord-stat-num', 'color:var(--color-info);')}

  /* Shared timeline and rubric surfaces follow the active role, including retries. */
  ${rule('.timeline-stop strong|.timeline-current strong|.timeline-imminent strong|.timeline-stop.timeline-today|.rubric-assessment strong|.rubric-mobile-title strong', 'color:var(--color-ink);')}
  ${rule('.timeline-state|.timeline-future strong|.timeline-loading|.rubric-mobile-meta|.rubric-assessment .rubric-metadata', 'color:var(--color-ink-muted);')}
  ${rule('.timeline-meta .timeline-today|.timeline-week|.timeline-date|.timeline-current .timeline-date|.timeline-imminent .timeline-date|.timeline-past .timeline-date|.rubric-assessment .rubric-weight|.rubric-mobile-weight', 'background:var(--color-soft); border-color:var(--color-border); color:var(--color-ink-muted); border-radius:4px; font-family:var(--editorial-body); font-variant-numeric:tabular-nums;')}
  ${rule('.timeline-current .timeline-date|.timeline-meta .timeline-today|.rubric-assessment .rubric-weight|.rubric-mobile-weight', 'background:var(--color-accent-tint); color:var(--color-accent-primary); border-color:var(--color-accent-secondary);')}
  ${rule('.timeline-current .timeline-state|.timeline-imminent .timeline-state|.rubric-assessment .rubric-action', 'color:var(--color-accent-primary);')}
  ${rule('.timeline-stop::before', 'background:var(--color-border); box-shadow:none;')}
  ${rule('.timeline-past::before|.timeline-imminent::before|.timeline-approaching::before|.timeline-imminent.timeline-approaching::before', 'background:var(--color-accent-secondary); box-shadow:none;')}
  ${rule('.timeline-dot', 'background:var(--color-paper); border-color:var(--color-control-border); box-shadow:none;')}
  ${rule('.timeline-dot::after', 'background:var(--color-ink-muted);')}
  ${rule('.timeline-past .timeline-dot|.timeline-imminent .timeline-dot', 'background:var(--color-success-tint); border-color:var(--color-success); box-shadow:none;')}
  ${rule('.timeline-past .timeline-dot::after|.timeline-imminent .timeline-dot::after', 'background:var(--color-success);')}
  ${rule('.timeline-current .timeline-node-core', 'background:var(--color-accent-tint); border-color:var(--color-accent-primary); box-shadow:none;')}
  ${rule('.timeline-current .timeline-node-core::after', 'background:var(--color-accent-primary); box-shadow:none;')}
  ${rule('.timeline-current .timeline-dot::before|.timeline-current .timeline-dot::after', 'background:transparent; box-shadow:none; animation:none;')}
  ${rule('.shared-timeline .timeline-nav|.timeline-retry|.shared-rubrics > button|.shared-rubrics .rubric-view-button', 'background:var(--color-paper); color:var(--color-accent-primary); border-color:var(--color-control-border);')}
  ${rule('.shared-timeline .timeline-nav:hover:enabled|.timeline-retry:hover|.shared-rubrics > button:hover|.shared-rubrics .rubric-view-button:hover:enabled', 'background:var(--color-accent-tint); color:var(--color-accent-primary); border-color:var(--color-accent-primary);')}
  ${rule('.rubric-assessment', 'background:var(--color-canvas); color:var(--color-ink-muted); border-color:var(--color-border); border-radius:6px; padding:20px; font-family:var(--editorial-body);')}
  ${rule('.rubric-assessment:hover:enabled', 'background:var(--color-accent-tint); border-color:var(--color-accent-secondary);')}
  ${rule('.rubric-assessment:disabled|.rubric-assessment:disabled strong', 'background:var(--color-soft); color:var(--color-ink-muted);')}
  ${rule('.rubric-mobile-row ~ .rubric-mobile-row', 'border-color:var(--color-border);')}
  ${rule('.shared-rubrics .rubric-view-button::before|.shared-rubrics .rubric-view-button:hover:enabled::before', 'background:transparent; border-color:var(--color-control-border);')}
  ${rule('.app-skeleton|.shared-rubrics .app-skeleton|.app-skeleton--timeline', '--skeleton-base:#E6E3DE; --skeleton-highlight:#F4F1EB; --skeleton-edge:#DEDAD2;')}
  ${rule('.app-content-loading', '--loading-surface:var(--color-paper);')}

  /* Body-mounted drawers, native dialogs and SweetAlert share the same typography. */
  ${rule('.team-drawer|.review1-drawer|.swal2-popup', 'font-family:var(--editorial-body); background:var(--color-paper); color:var(--color-ink); border-color:var(--color-border); box-shadow:0 16px 48px rgba(30,37,34,.12);')}
  ${rule('.team-drawer-header|.review1-assessment-navigation|.review1-footer', 'background:var(--color-canvas); border-color:var(--color-border);')}
  ${rule('.team-drawer-backdrop|dialog::backdrop', 'background:rgba(30,37,34,.3);')}
  ${rule('.swal2-popup', 'border-radius:8px;')}
  ${rule('.swal2-title', 'font-family:var(--editorial-heading); color:var(--color-ink);')}
  ${rule('.swal2-html-container|.swal2-input-label', 'color:var(--color-ink-muted);')}
  ${rule('.swal2-styled.swal2-confirm', 'background:var(--color-accent-primary); color:#fff; border-radius:6px;')}
  ${rule('.swal2-styled.swal2-cancel', 'background:var(--color-soft); color:var(--color-ink); border-radius:6px;')}
  ${rule('.announcement-link|.announcement-empty-icon|.review1-header-review|.review1-criterion-meta span|.review1-graded-pill[data-completion="partial"]', 'color:var(--color-accent-primary); background:var(--color-accent-tint); border-color:var(--color-accent-secondary);')}
  ${rule('.review1-criterion[data-index]|.review1-individual-rubric[data-index]', 'background:var(--color-paper); border-color:var(--color-border); border-top:3px solid var(--color-accent-secondary); border-radius:8px;')}
  ${rule('.review1-criterion[data-index] .review1-card-title', 'font-family:var(--editorial-heading); font-size:18px; color:var(--color-ink);')}
  ${rule('.review1-criteria-tabs|.review1-levels|.review1-stepper', 'background:var(--color-soft); border-color:var(--color-border); border-radius:6px;')}
  ${rule('.review1-drawer .review1-criteria-tabs [role="tab"]|.review1-drawer .review1-levels button|.review1-drawer .review1-pi-pills button', 'font-family:var(--editorial-body); color:var(--color-ink-muted); background:var(--color-paper); border-color:var(--color-border); box-shadow:none;')}
  ${rule('.review1-drawer .review1-criteria-tabs [aria-selected="true"]|.review1-drawer .review1-criteria-tabs [data-criteria-tab="individual"][aria-selected="true"]', 'background:var(--color-accent-tint); color:var(--color-accent-primary); border-color:var(--color-accent-secondary);')}
  ${rule('.review1-drawer .review1-pi-pills button[aria-pressed="true"]|.review1-drawer .review1-pi-pills button[aria-pressed="true"]:hover|.review1-drawer .review1-pi-pills[data-individual-pills] button[aria-pressed="true"]|.review1-drawer .review1-pi-pills[data-individual-pills] button[aria-pressed="true"]:hover|.review1-drawer .review1-levels button[aria-pressed="true"]|.review1-criterion[data-index] .review1-levels button[aria-pressed="true"]', 'background:var(--color-accent-primary); color:#fff; border-color:var(--color-accent-primary); box-shadow:none;')}
  ${rule('.review1-descriptor|.review1-accordion > summary', 'background:var(--color-accent-tint); color:var(--color-accent-hover); border-color:var(--color-accent-secondary); border-radius:6px;')}
  ${rule('.review1-criterion .review1-feedback-options', '--pill-border:var(--color-accent-secondary); --pill-bg:var(--color-accent-tint); --pill-text:var(--color-accent-primary); --pill-active:var(--color-accent-primary); --pill-hover:var(--color-accent-hover);')}
  ${rule('.review1-criterion:is([data-level="0"],[data-level="1"]) .review1-feedback-options', '--pill-border:var(--color-warning); --pill-bg:var(--color-warning-tint); --pill-text:var(--color-warning); --pill-active:var(--color-warning); --pill-hover:#644300;')}
  ${rule('.review1-criterion [data-marks-slider]', 'accent-color:var(--color-accent-primary);')}
  ${rule('.review1-progress-students|.review1-slider-values .is-selected|.review1-project-title-row .lucide-icon|.review1-criterion details', 'color:var(--color-accent-primary);')}
  ${rule('.review1-actions|.collapsible summary', 'background:var(--color-paper); border-color:var(--color-border); border-radius:6px; box-shadow:none;')}
  ${rule('.review1-actions [data-submit]|.review1-drawer [data-target]|.filter-tab.active:hover:enabled|.pagination-buttons button.active:hover:enabled', 'background:var(--color-accent-primary); color:#fff; border-color:var(--color-accent-primary);')}
  ${rule('.review1-actions [data-submit]:hover:enabled|.review1-drawer [data-target]:hover:enabled', 'background:var(--color-accent-hover); color:#fff;')}
  ${rule('.review1-progress progress|.review1-progress progress::-webkit-progress-bar', 'background:var(--color-soft); accent-color:var(--color-accent-primary);')}
  ${rule('.review1-progress progress::-webkit-progress-value', 'background:var(--color-accent-primary);')}
  ${rule('.review1-progress progress::-moz-progress-bar', 'background:var(--color-accent-primary);')}
  ${rule('.review1-progress-students::before', 'background:var(--color-accent-primary);')}
  ${rule('.review1-progress-completion > span::before', 'background:var(--color-warning);')}
  /* Secondary staff tools and semantic variants use the same palette. */
  ${rule('.needs-attention|.assessment-overview|.github-config|.pipeline-stage|.reviewer-marks-dialog fieldset', 'background:var(--color-paper); color:var(--color-ink); border:1px solid var(--color-border); border-radius:8px; box-shadow:none;')}
  ${rule('.reviewer-marks-dialog|.reviewer-marks-footer', 'background:var(--color-canvas); color:var(--color-ink); font-family:var(--editorial-body);')}
  ${rule('.reviewer-marks-dialog .marks-save|.mini.approve', 'background:var(--color-accent-primary); color:#fff; border-color:var(--color-accent-primary);')}
  ${rule('.reviewer-marks-dialog .marks-save:hover:enabled|.mini.approve:hover:enabled', 'background:var(--color-accent-hover); color:#fff; border-color:var(--color-accent-hover);')}
  ${rule('.mini.revise|.tracker-tabs .deadline-pill|.tracker-tabs .tab[data-filter="ontrack"]', 'background:var(--color-soft); color:var(--color-ink-muted); border-color:var(--color-control-border);')}
  ${rule('.tracker-tabs .tab[data-filter="attention"]|.tracker-tabs .deadline-pill.deadline-overdue', 'background:var(--color-danger-tint); color:var(--color-danger); border-color:var(--color-danger);')}
  ${rule('.tracker-tabs .tab.active|.tracker-tabs .tab.active:hover', 'background:var(--color-accent-primary); color:#fff; border-color:var(--color-accent-primary);')}
  ${rule('.stage-label|.stage-count|.assessment-name|.github-title|.system-status-card .github-label|.system-status-card .rubrics-assessment-list dt', 'color:var(--color-ink);')}
  ${rule('.stage-subtitle|.stage-percent|.semester-dates|.development-legend|.assessment-pct|.github-label|.github-value|.system-status-card .github-value|.system-status-card .rubrics-assessment-list dd|.reviewer-review-cell small|.reviewer-marks-dialog small|.role-menu-toggle .role-menu-caption', 'color:var(--color-ink-muted);')}
  ${rule('.progress-bar|.stage-icon|.coordinator-stats-grid .lucide-icon.stat-icon|.coordinator-stats-grid .stat-pct', 'background:var(--color-soft); color:var(--color-ink-muted); border-color:var(--color-border);')}
  ${rule('.progress-fill.blue|.progress-fill.green|.progress-fill.gray', 'background:var(--color-success);')}
  ${rule('.stage-icon.completed|.github-status.configured|.system-status-card .github-status.configured|.coordinator-stats-grid .stat-registered', 'background:var(--color-success-tint); color:var(--color-success); border-color:var(--color-success);')}
  ${rule('.stage-icon.pending|.stage-icon.development', 'background:var(--color-warning-tint); color:var(--color-warning); border-color:var(--color-warning);')}
  ${rule('.coordinator-stats-grid .stat-card[data-completion-tone] .stat-icon|.coordinator-stats-grid .stat-card[data-completion-tone] .stat-pct', 'background:var(--stat-tint); color:var(--stat-tone);')}
  ${rule('.review1-header-line|.review1-project-title-row > summary|.review1-project-title-row > p|.review1-progress|.review1-feedback-title strong|.review1-assessment-summary dd', 'color:var(--color-ink);')}
  ${rule('.review1-drawer .review1-pi-pills button[aria-pressed="false"]:not(:disabled):hover|.review1-drawer .review1-pi-pills[data-individual-pills] button[aria-pressed="false"]:not(:disabled):hover', 'background:var(--color-accent-tint); color:var(--color-accent-primary); border-color:var(--color-accent-secondary);')}
  ${rule('.review1-individual-rubric[data-index] .review1-criterion-meta span:first-child|.review1-drawer .review1-other-feedback[aria-pressed="true"]', 'background:var(--color-accent-tint); color:var(--color-accent-primary); border-color:var(--color-accent-secondary);')}
  ${rule('.review1-criterion:is([data-level="0"],[data-level="1"]) .review1-descriptor|.review1-feedback-heading [data-feedback-required]|.review1-assessment-summary .review1-summary-status[data-tone="pending"] dd', 'background:var(--color-warning-tint); color:var(--color-warning); border-color:var(--color-warning);')}
  ${rule('.review1-criterion:is([data-level="3"],[data-level="4"],[data-level="5"]) [data-feedback-status]|.review1-assessment-summary .review1-summary-status[data-tone="complete"] dd|.review1-drawer .review1-pi-pills [data-complete="true"]:not([aria-pressed="true"])', 'background:var(--color-success-tint); color:var(--color-success); border-color:var(--color-success);')}
  ${rule('.review1-assessment-summary .review1-summary-status[data-tone="exception"] dd', 'background:var(--color-danger-tint); color:var(--color-danger);')}
  ${rule('.review1-criterion[data-index] .review1-control-title|.review1-criterion-meta span:last-child|.review1-history summary|.review1-history-status', 'color:var(--color-ink-muted);')}
  ${rule('.review1-assessment-summary .review1-summary-total', 'border-color:var(--color-accent-secondary);')}
  ${rule('.review1-assessment-summary .review1-summary-total[data-resolved="true"] dd', 'color:var(--color-ink);')}
  ${rule('.review1-drawer .review1-header-students button', 'background:var(--color-paper); color:var(--color-ink); border-color:var(--color-control-border); border-radius:var(--editorial-radius); box-shadow:none; font-family:var(--editorial-body);')}
  ${rule('.review1-drawer .review1-header-students button[aria-pressed="false"]:not(:disabled):hover', 'background:var(--color-soft); border-color:var(--color-ink-muted);')}
  ${rule('.review1-drawer .review1-header-students button[aria-pressed="true"]|.review1-drawer .review1-header-students button[aria-pressed="true"]:hover', 'background:var(--color-accent-tint); color:var(--color-accent-primary); border-color:var(--color-accent-primary); box-shadow:inset 0 0 0 1px var(--color-accent-primary);')}
  ${rule('.review1-header-students .review1-avatar', 'background:var(--color-soft); color:var(--color-ink-muted);')}
  ${rule('.review1-header-students [aria-pressed="true"] .review1-avatar', 'background:var(--color-accent-primary); color:var(--color-paper);')}
  ${rule('.review1-header-students .review1-student-score', 'color:var(--color-ink); border-color:var(--color-border);')}
  ${rule('.review1-drawer :is(button,input,summary,textarea):focus-visible|.review1-criterion .review1-feedback-options button:focus-visible|.reviewer-marks-dialog :is(button,select,textarea):focus-visible', 'outline:3px solid var(--color-accent-primary); outline-offset:3px;')}
  @media(max-width:760px) {
    ${scope} { padding:20px 16px 40px; }
    ${rule('h1|.dashboard-body-surface h1|.announcement-tab-surface .announcement-header h2', 'font-size:28px;')}
    ${rule('.shared-timeline|.shared-rubrics', 'padding:18px 16px;')}
    ${rule('.dashboard-navigation', 'padding:6px;')}
    ${rule('.dashboard-navigation .role-tab-btn', 'border-radius:4px;')}
    ${rule('.dashboard-navigation .role-tab-btn.active', 'box-shadow:inset 3px 0 var(--color-accent-primary);')}
    ${rule('button|.dashboard-body-surface button|.announcement-tab-surface button|.review1-drawer button|.review1-drawer .review1-pi-pills button|.review1-criterion[data-index] .review1-feedback-options button|.shared-timeline .timeline-nav|.btn-outline|.mini|.team-action-icon|.announcement-link', 'min-height:44px;')}
    ${rule('.shared-timeline .timeline-nav|.team-action-icon|.team-drawer-close', 'min-width:44px;')}
    ${rule('input:not([type=checkbox]):not([type=radio]):not([type=range])|select|textarea', 'font-size:16px;')}
    ${rule('.card-body', 'padding:var(--dashboard-content-gap) var(--dashboard-section-gap) 6px;')}
    ${rule('.card-footer-row', 'padding:var(--dashboard-content-gap) var(--dashboard-section-gap);')}
    ${rule('.system-status-primary', 'grid-template-columns:minmax(0,1fr);')}
    ${rule('.stats|.coord-stats:not(.coordinator-stats-grid)|[data-role-content="guide"] .stats|[data-role-content="reviewer"] .coord-stats', 'display:grid; grid-template-columns:repeat(2,minmax(0,1fr));')}
    ${rule('.stat|.coord-stat|.coordinator-stats-grid .stat-card', 'padding:var(--dashboard-content-gap); min-width:0;')}
  }
  @media(prefers-reduced-motion:reduce) {
    ${rule('*|*::before|*::after', 'scroll-behavior:auto; transition:none;')}
  }
  `;
}

/** Shared light surfaces for Announcements and non-student dashboard content. */
function getDashboardSurfaceStyles_() {
  return `
  .announcement-tab-surface, .dashboard-body-surface {
    --sd-text:#182230; --sd-text-muted:#667085; --sd-border:#e4e7ec; --sd-accent:#6941c6;
    margin-top:4px; padding:28px; background:#f8fafc; color:#182230;
    border:1px solid #e4e7ec; border-radius:20px; box-shadow:0 4px 20px rgba(16,24,40,.04);
    font-family:'Inter','Segoe UI',Helvetica,Arial,sans-serif; font-size:13px; line-height:1.5;
  }
  .announcement-tab-surface .announcement-header h2, .dashboard-body-surface h1 {
    margin:0; color:#182230; font-family:inherit; font-size:24px; font-weight:700; line-height:1.3; letter-spacing:-.6px;
  }
  .dashboard-body-surface h1 { margin-bottom:24px; }
  .team-page-size { display:flex; align-items:center; gap:8px; white-space:nowrap; font-size:12px; }
  .dashboard-body-surface .team-page-size select { width:auto; min-height:34px; padding:5px 9px; font-size:12px; }
  .dashboard-body-surface .dashboard-container-header h1 { margin-bottom:0; }
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
    .announcement-tab-surface .announcement-header h2, .dashboard-body-surface h1 { font-size:22px; }
  }
  `;
}
