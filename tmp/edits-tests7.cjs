const r = String.raw;
const e = (file, find, replace) => ({ file, find, replace });
const S = 'student-dashboard.js', D = 'dashboard-client-scripts.js', PS = 'tests/project-schedule.test.cjs';
module.exports = [
  // Student setup markup hooks
  e(S, '  <div>\n    <div>\n      ${buildStepNode(stepNum, state)}', '  <div data-step-row>\n    <div>\n      ${buildStepNode(stepNum, state)}'),
  e(S, '    <div class="card" data-step-card>\n      <div>\n        <h4>', '    <div class="card" data-step-card>\n      <div data-step-header>\n        <h4>'),
  e(S, '      <div>${bodyHtml}</div>', '      <div data-step-body>${bodyHtml}</div>'),
  e(S, `'</header><div>' + pendingSteps.map(`, `'</header><div data-setup-pending>' + pendingSteps.map(`),
  e(S, '<button type="button" class="btn btn-outline" onclick="DashboardUI.focusGithubAccountForm(this)">', '<button type="button" class="btn btn-outline" data-github-form-jump onclick="DashboardUI.focusGithubAccountForm(this)">'),
  e(S, "return `<li><span>${showNames && student.name ?", "return `<li data-member-status=\"${missing ? 'missing' : joined ? 'joined' : 'pending'}\"><span data-member-register>${showNames && student.name ?"),
  e(S, '<span>${renderLucideIcon_(icon)}${statusText}</span>', '<span data-member-state>${renderLucideIcon_(icon)}${statusText}</span>'),
  // Timeline markup hooks
  e(D, `class="timeline-stop timeline-' + (past ? 'past' : current ? 'current' : 'future') + '"`, `class="timeline-stop" data-timeline-state="' + (past ? 'past' : current ? 'current' : 'future') + '"`),
  e(D, `'<span title="' + escapeClientHtml(description) + '" aria-label="' + escapeClientHtml(description) + '">' + escapeClientHtml(m.date) + '</span>'`, `'<span data-timeline-date title="' + escapeClientHtml(description) + '" aria-label="' + escapeClientHtml(description) + '">' + escapeClientHtml(m.date) + '</span>'`),
  e(D, `(timing ? '<span>' + timing + '</span>' : '') + '</li>';`, `(timing ? '<span data-timeline-timing>' + timing + '</span>' : '') + '</li>';`),
  // Tests
  e(PS, r`button.workflow-btn:not(.secondary)`, r`button.btn-primary`),
  e(PS, r`setup.querySelector('.student-setup-pending')`, r`setup.querySelector('[data-setup-pending]')`),
  e(PS, r`rendered.querySelector('.is-joined .lucide-check')`, r`rendered.querySelector('[data-member-status="joined"] .lucide-check')`),
  e(PS, r`rendered.querySelector('.is-missing .lucide-triangle-alert')`, r`rendered.querySelector('[data-member-status="missing"] .lucide-triangle-alert')`),
  e(PS, r`[...card.querySelector('.step-card').children].map(node=>node.className),['step-header','step-body']`, r`[...card.querySelector('[data-step-card]').children].map(node=>node.hasAttribute('data-step-header')?'step-header':node.hasAttribute('data-step-body')?'step-body':node.tagName),['step-header','step-body']`),
  e(PS, r`rendered.querySelector('a.workflow-btn')`, r`rendered.querySelector('a.btn-primary')`),
  e(PS, r`f.target.querySelectorAll('.timeline-current').length`, r`f.target.querySelectorAll('[data-timeline-state="current"]').length`),
  e(PS, r`f.target.querySelectorAll('.timeline-past svg').length`, r`f.target.querySelectorAll('[data-timeline-state="past"] svg').length`),
  e(PS, r`f.visible()[0].querySelector('.timeline-timing')`, r`f.visible()[0].querySelector('[data-timeline-timing]')`),
  e(PS, r`assert(f.target.querySelector('.timeline-heading .timeline-toggle'));`, r`assert(f.target.querySelector('[data-timeline-toggle]'));`),
  e(PS, r`current.querySelector('.timeline-date').title`, r`current.querySelector('[data-timeline-date]').title`),
  e(PS, r`const button=f.target.querySelector('.timeline-toggle');`, r`const button=f.target.querySelector('[data-timeline-toggle]');`),
  e(PS, r`assert(f.target.querySelector('.timeline-track').classList.contains('timeline-full'));`, r`assert(f.target.querySelector('[data-timeline-track]').classList.contains('timeline-full'));`),
  e(PS, r`(html.match(/class="stat-card stat-card-/g)||[]).length`, r`(html.match(/data-stat-card/g)||[]).length`),
];
