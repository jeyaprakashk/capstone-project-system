// common-styles.js hand edits: mixed selector lists and multi-line legacy button skins.
const F = 'common-styles.js';
const e = (find, replace) => ({ file: F, find, replace });
module.exports = [
  // Legacy generic button skin -> layout only; link buttons keep no underline (framework gap, recorded).
  e(`  button,
  .btn-outline {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: var(--space-2) var(--space-4);
    border-radius:var(--radius-btn);
    font-size: var(--fs-meta);
    font-weight: var(--fw-semibold);
    cursor: pointer;
    text-decoration: none;
    border: 1px solid var(--border);
  }
  .btn-outline {
    background: var(--paper);
    color: var(--primary-hover);
  }
  .btn-outline.reject {
    color: var(--danger);
    border-color: var(--danger-tint);
  }
  .btn-outline:hover {
    background: var(--canvas);
  }
  .btn-solid {
    background: var(--text);
    color: var(--paper);
    border: none;
  }
  .btn-solid:hover {
    background: var(--primary-hover);
  }
  .mini {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    padding: 6px 14px;
    border-radius:var(--radius-btn);
    font-size: var(--fs-meta);
    font-weight: var(--fw-semibold);
    cursor: pointer;
    border: 1px solid var(--border);
    background: var(--paper);
    color: var(--primary-hover);
    margin-right: 6px;
    margin-bottom: var(--space-1);
  }
  .mini:last-child { margin-right: 0; }
  .mini.approve {
    background: var(--text);
    color: var(--paper);
    border: none;
  }
  .mini.approve:hover { background: var(--primary-hover); }
  .mini.revise {
    color: var(--warning);
    border-color: var(--warning-tint);
    background: var(--canvas);
  }
  .mini.revise:hover { background: var(--border); }
`, `  /* Layout only: appearance comes from the framework .btn classes. */
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
`),
  e(`  .filter-tab {
    padding: 7px 14px;
    border-radius:var(--radius-btn);
    font-size: var(--fs-meta);
    font-weight: var(--fw-semibold);
    border: 1px solid var(--border);
    background: var(--paper);
    color: var(--primary-hover);
    cursor: pointer;
  }
  .filter-tab:hover { background: var(--canvas); }
  .filter-tab.active {
    background: var(--text);
    color: var(--paper);
    border-color: var(--text);
  }\`;`, `\`;`),
  e(`  .workflow-btn {
    display: inline-block;
    margin-top: var(--space-2);
    padding: 9px 18px;
    border-radius:var(--radius-btn);
    font-size: var(--fs-meta);
    font-weight: var(--fw-semibold);
    background: var(--primary);
    color: var(--paper);
    text-decoration: none;
  }

  .workflow-btn:hover {
    background: var(--primary-hover);
  }
  .workflow-btn[hidden] { display: none; }`, `  .workflow-btn {
    margin-top: var(--space-2);
  }
  .workflow-btn[hidden] { display: none; }`),
  e(`  .workflow-btn.secondary {
    background: transparent;
    color: var(--text);
    border: 1px solid var(--border);
  }

  .workflow-btn.secondary:hover {
    border-color: var(--primary);
    color: var(--primary);
  }
`, ``),
  e(`  \${scope} :is(button,a.btn):is(:disabled,[aria-disabled="true"]) {
    color:var(--muted); background:var(--soft); border-color:var(--border);
    cursor:not-allowed; opacity:1;
  }
`, ``),
  e(`  :is(.announcement-tab-surface, .dashboard-body-surface) button {
    font-family:inherit; font-size:var(--fs-meta); font-weight:var(--fw-semibold); line-height:var(--lh-heading); border-radius:var(--radius-btn);
  }
`, ``),
  e(`\${rule('button|input|select|textarea|.btn-outline|.mini|.announcement-add-btn|.announcement-link', 'font-family:var(--font); accent-color:var(--primary);')}`,
    `\${rule('input|select|textarea', 'font-family:var(--font); accent-color:var(--primary);')}`),
  e(`\${rule('.drawer-status-bad|.btn-outline.reject|.coordinator-stats-grid`, `\${rule('.drawer-status-bad|.coordinator-stats-grid`),
  e(`\${rule('.review-levels|.review-stepper', 'background:var(--soft);`, `\${rule('.review-stepper', 'background:var(--soft);`),
  e(`.review-criterion-meta span:first-child|.review-drawer .review-other-feedback[aria-pressed="true"]', 'background:var(--tint)`, `.review-criterion-meta span:first-child', 'background:var(--tint)`),
  e(`|.review-drawer .review-pi-pills [data-complete="true"]:not([aria-pressed="true"])', 'background:var(--success-tint)`, `', 'background:var(--success-tint)`),
  e(`\${rule('.announcement-link|.announcement-empty-icon|`, `\${rule('.announcement-empty-icon|`),
];
