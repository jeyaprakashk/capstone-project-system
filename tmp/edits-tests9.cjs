const r = String.raw;
const e = (file, find, replace) => ({ file, find, replace });
const D = 'dashboard-client-scripts.js', W = 'tests/weekly-progress-browser.test.cjs';
module.exports = [
  e(D, `container.innerHTML='<div>'+weeklyFields`, `container.innerHTML='<div data-submission-summary>'+weeklyFields`),
  e(D, `slice(0,3).map(entry=>'<div><strong>'+escapeClientHtml(weeklyWeekLabel(entry.weekId))+`, `slice(0,3).map(entry=>'<div data-activity-row><strong>'+escapeClientHtml(weeklyWeekLabel(entry.weekId))+`),
  e(D, `return '<section><h3>'+esc(weeklyWeekLabel(week.weekId))`, `return '<section'+(future?' data-future':'')+'><h3>'+esc(weeklyWeekLabel(week.weekId))`),
  e(W, r`f.host.querySelector('.weekly-state').dataset.tone`, r`f.host.querySelector('[data-weekly-state] [data-tone]').dataset.tone`),
  e(W, r`recent.querySelectorAll('.student-activity-row').length`, r`recent.querySelectorAll('[data-activity-row]').length`),
  e(W, r`document.querySelector('.is-future').textContent`, r`document.querySelector('[data-future]').textContent`),
];
