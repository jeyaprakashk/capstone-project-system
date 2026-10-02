const F = 'review-evaluation-client.js';
const e = (find, replace) => ({ file: F, find, replace });
module.exports = [
  // Containers: .segmented supplies the surface; keep layout, and outrank .segmented's display.
  e(`  .review-pi-pills { display:flex; flex-wrap:wrap; align-items:center; justify-content:flex-start; gap:6px; padding:0; margin-top:6px; }`,
    `  .review-drawer .review-pi-pills { display:flex; flex-wrap:wrap; align-items:center; justify-content:flex-start; gap:6px; margin-top:6px; }`),
  e(`  .review-drawer .review-pi-pills button { display:flex; flex:0 0 auto; align-items:center; justify-content:flex-start; gap:5px; width:auto; min-width:0; max-width:100%; min-height:34px; box-sizing:border-box; padding:var(--space-1) var(--space-2); margin:0; border:1px solid var(--control-border); border-radius:var(--radius-btn); background:var(--paper); color:var(--muted); font-size:var(--fs-meta); text-align:left; }`,
    `  .review-drawer .review-pi-pills button { display:flex; flex:0 0 auto; align-items:center; justify-content:flex-start; gap:5px; width:auto; min-width:0; max-width:100%; min-height:34px; box-sizing:border-box; margin:0; text-align:left; }`),
  e(`  .review-drawer .review-pi-pills button[aria-pressed="false"]:not(:disabled):hover { border-color:var(--primary); background:var(--tint); color:var(--muted); }
  .review-drawer .review-pi-pills [data-complete="true"] { color:var(--success); background:var(--success-tint); border-color:var(--success); }
  .review-drawer .review-pi-pills button[aria-pressed="true"],.review-drawer .review-pi-pills button[aria-pressed="true"]:hover { border-color:var(--primary); background:var(--primary); color:var(--paper); box-shadow:var(--shadow-selected); }
  .review-drawer .review-pi-pills[data-individual-pills] button[aria-pressed="false"]:not(:disabled):hover { border-color:var(--border); background:var(--tint); color:var(--primary); }
  .review-drawer .review-pi-pills[data-individual-pills] button[aria-pressed="true"], .review-drawer .review-pi-pills[data-individual-pills] button[aria-pressed="true"]:hover { border-color:var(--border); background:var(--tint); color:var(--primary); box-shadow:inset 0 0 0 1px var(--primary); }
`, ``),
  e(`  .review-criterion[data-index] .review-levels button[aria-pressed="true"] { background:var(--primary); color:var(--paper); border-color:var(--border); }
`, ``),
  e(`  .review-criterion[data-index] .review-feedback-options button { border-radius:var(--radius-btn); padding:5px var(--space-2); min-height:28px; }
`, ``),
  e(`  .review-drawer .review-header-students button { display:grid; grid-template-columns:20px minmax(0,1fr); align-content:start; align-items:center; gap:var(--space-1); width:100%; height:100%; min-height:44px; box-sizing:border-box; border:1px solid var(--control-border); border-radius:var(--radius-btn); padding:var(--space-2) 6px; background:var(--paper); color:var(--text); font-size:var(--fs-meta); text-align:left; cursor:pointer; }
  .review-drawer .review-header-students button { border-color:var(--border); background:var(--tint); color:var(--primary); }
  .review-drawer .review-header-students button[aria-pressed="false"]:not(:disabled):hover { border-color:var(--border); background:var(--tint); }
  .review-drawer .review-header-students button[aria-pressed="true"] { background:var(--tint); border-color:var(--primary); color:var(--primary); box-shadow:inset 0 0 0 1px var(--primary); }
`, `  .review-drawer .review-header-students button { display:grid; grid-template-columns:20px minmax(0,1fr); align-content:start; align-items:center; gap:var(--space-1); width:100%; height:100%; min-height:44px; box-sizing:border-box; text-align:left; cursor:pointer; }
`),
  e(`  .review-drawer button { font:inherit; cursor:pointer; }`, `  .review-drawer button { cursor:pointer; }`),
  e(`  .review-levels { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:var(--space-1); padding:var(--space-1); border-radius:var(--radius-btn); background:var(--soft); }
  .review-drawer .review-levels button { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; min-width:0; min-height:44px; padding:6px 1px; border:1px solid transparent; border-radius:var(--radius-btn); background:transparent; color:var(--muted); }`,
    `  .review-drawer .review-levels { display:grid; grid-template-columns:repeat(6,minmax(0,1fr)); gap:var(--space-1); }
  .review-drawer .review-levels button { display:flex; flex-direction:column; align-items:center; justify-content:center; gap:2px; min-width:0; min-height:44px; }`),
  e(`  .review-drawer .review-levels button[aria-pressed="true"] { background:var(--primary); border-color:var(--primary); color:var(--paper); box-shadow:var(--shadow-selected); }
`, ``),
  e(`  .review-stepper button { display:flex; align-items:center; justify-content:center; box-sizing:border-box; width:100%; min-width:0; height:28px; margin:0; padding:0; border:0; background:var(--paper); color:var(--primary); font-size:var(--fs-body); line-height:var(--lh-tight); }
  .review-stepper button:first-child { border-radius:var(--radius-btn) 0 0 var(--radius-badge); }
  .review-stepper button:last-child { border-radius:0 var(--radius-badge) var(--radius-badge) 0; }
`, `  .review-stepper button { display:flex; align-items:center; justify-content:center; box-sizing:border-box; width:100%; min-width:0; height:28px; margin:0; padding:0; }
`),
  e(`  .review-drawer .review-other-feedback { margin:var(--space-1) 0 0; padding:5px 9px; border:1px solid var(--control-border); border-radius:var(--radius-btn); background:var(--paper); color:var(--muted); font-size:var(--fs-body); }
  .review-drawer .review-other-feedback[aria-pressed="true"] { border-color:var(--border); background:var(--tint); color:var(--primary); }
`, `  .review-drawer .review-other-feedback { margin:var(--space-1) 0 0; }
`),
  e(`  .review-feedback-options { display:flex; flex-wrap:wrap; gap:6px; margin:10px 0; }
  .review-feedback-options { --pill-border:var(--border); --pill-bg:var(--tint); --pill-text:var(--primary); --pill-active:var(--primary); --pill-hover:var(--primary-hover); }
  .review-feedback-options button { max-width:100%; min-height:32px; padding:6px var(--space-3); border:1px solid var(--pill-border); border-radius:var(--radius-btn); background:var(--pill-bg); color:var(--pill-text); text-align:left; font-size:var(--fs-meta); line-height:var(--lh-body); overflow-wrap:anywhere; }
  .review-feedback-options button[aria-pressed="true"] { border-color:var(--pill-active); background:var(--pill-active); color:var(--paper); }
  .review-feedback-options button:is(:hover,:focus-visible):enabled { border-color:var(--pill-hover); background:var(--pill-hover); color:var(--paper); }
`, `  .review-criterion .review-feedback-options { display:flex; flex-wrap:wrap; gap:6px; margin:10px 0; }
  .review-feedback-options button { max-width:100%; text-align:left; overflow-wrap:anywhere; }
`),
  e(`  .review-criterion:is([data-level="0"],[data-level="1"]) .review-feedback-options { --pill-border:var(--warning); --pill-bg:var(--warning-tint); --pill-text:var(--warning); --pill-active:var(--warning); --pill-hover:var(--warning); }
`, ``),
  e(`  .review-actions button { padding:10px var(--space-3); border:1px solid var(--control-border); border-radius:var(--radius-btn); background:var(--paper); }
  .review-actions [data-submit] { background:var(--primary); color:var(--paper); }
  .review-drawer [data-target] { background:var(--primary); color:var(--paper); margin-right:var(--space-2); }`,
    `  .review-drawer [data-target] { margin-right:var(--space-2); }`),
];
