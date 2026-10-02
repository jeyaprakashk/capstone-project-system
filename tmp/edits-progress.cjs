// Progress bars use the framework .progress > span; diagnostics panel uses framework classes.
const e = (file, find, replace) => ({ file, find, replace });
const C = 'coordinator-dashboard.js', S = 'student-dashboard.js';
module.exports = [
  e(C, '<div class="stat-track" aria-hidden="true"><span style="width:${pct(value)}%;background:var(--success)"></span></div>', '<div class="progress" aria-hidden="true"><span style="width:${pct(value)}%"></span></div>'),
  e(C, '<div class="team-progress-track" role="progressbar" aria-label="${name}: ${escapeHtml(note)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><div style="width:${percent}%"></div></div>', '<div class="progress" role="progressbar" aria-label="${name}: ${escapeHtml(note)}" aria-valuemin="0" aria-valuemax="100" aria-valuenow="${percent}"><span style="width:${percent}%"></span></div>'),
  e(C, '<div class="assessment-bar-inner"><div style="width:${pct}%"></div></div>', '<div class="progress"><span style="width:${pct}%"></span></div>'),
  e(S, `'<div style="display:flex;justify-content:space-between;gap:var(--space-6);padding:var(--space-1) 0;border-bottom:1px solid var(--border);"><span>' + escapeHtml(x.label) + '</span><strong style="font-family:var(--font);white-space:nowrap;">' + x.ms + ' ms</strong></div>'`, `'<div class="row row--between py-1"><span>' + escapeHtml(x.label) + '</span><strong class="num">' + x.ms + ' ms</strong></div>'`),
  e(S, `'<div style="margin:var(--space-6) 0;padding:var(--space-4) 18px;border:2px dashed var(--warning);border-radius:var(--radius-card);background:var(--canvas);color:var(--text);font:var(--fs-meta) var(--font);">' +
    '<div style="font-weight:var(--fw-bold);margin-bottom:10px;color:var(--warning);">TEMPORARY PERFORMANCE DIAGNOSTICS</div>'`, `'<div class="notice notice--warning mt-6 mb-6">' +
    '<div class="text-label text-label--warning mb-2">TEMPORARY PERFORMANCE DIAGNOSTICS</div>'`),
  e(S, `'<div style="display:flex;justify-content:space-between;gap:var(--space-6);padding-top:9px;font-size:var(--fs-body);"><strong>TOTAL STUDENT SERVER TIME</strong><strong style="font-family:var(--font);white-space:nowrap;">' + total + ' ms</strong></div>'`, `'<div class="row row--between mt-2"><strong>TOTAL STUDENT SERVER TIME</strong><strong class="num">' + total + ' ms</strong></div>'`),
];
