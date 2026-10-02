const r = String.raw;
const e = (file, find, replace) => ({ file, find, replace });
const G = 'guide-weekly-client.js', GT = 'tests/guide-weekly-browser.test.cjs';
module.exports = [
  e(G, `return '<div>'+submissionBadge(entry.timeliness`, `return '<div data-weekly-deadline>'+submissionBadge(entry.timeliness`),
  e(G, `(commits.length ? '<ul>'+commits.map(`, `(commits.length ? '<ul data-commit-list>'+commits.map(`),
  e(G, `return '<div><section><h4>GitHub evidence (auto-collected)'`, `return '<div data-weekly-evidence><section><h4>GitHub evidence (auto-collected)'`),
  e(GT, r`f.host.querySelector('.guide-weekly-student-header > .guide-weekly-deadline')`, r`f.host.querySelector('[data-weekly-student-header] > [data-weekly-deadline]')`),
  e(GT, r`const card=f.host.querySelector('.guide-weekly-card');`, r`const card=f.host.querySelector('[data-weekly-card]');`),
  e(GT, r`card.querySelector('.guide-weekly-summary').getBoundingClientRect`, r`card.querySelector('[data-weekly-summary]').getBoundingClientRect`),
  e(GT, r`card.querySelector('.guide-weekly-actions').getBoundingClientRect`, r`card.querySelector('[data-weekly-actions]').getBoundingClientRect`),
  e(GT, r`card.querySelector('.guide-weekly-student-header').getBoundingClientRect`, r`card.querySelector('[data-weekly-student-header]').getBoundingClientRect`),
  e(GT, r`f.host.querySelector('.guide-commit-list a')`, r`f.host.querySelector('[data-commit-list] a')`),
];
