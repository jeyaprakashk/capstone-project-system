// Tests: follow markup after legacy class removal (attribute hooks instead of legacy class names).
const r = String.raw;
const e = (file, find, replace) => ({ file, find, replace });
const DL = 'tests/dashboard-loading.test.cjs', AN = 'tests/announcements-ui.test.cjs';
module.exports = [
  // announcements
  e('common-helpers.js', '<span class="circle">${r.p.step}</span>', '<span class="circle" data-step-number>${r.p.step}</span>'),
  e(AN, r`querySelectorAll('.announcement-item')`, r`querySelectorAll('[data-announcement-item]')`),
  e(AN, r`querySelector('.announcement-no-results').hidden`, r`querySelector('[data-announcement-no-results]').hidden`),
  e(AN, r`querySelectorAll('.announcement-step-number')`, r`querySelectorAll('[data-step-number]')`),
  // dashboard shell and rubrics
  e(DL, r`document.querySelector('.timeline-heading h2')`, r`document.querySelector('#sharedProjectTimeline h2')`),
  e(DL, r`/<strong>Review 1<\/strong><span class="rubric-mobile-weight"/`, r`/<strong>Review 1<\/strong><span aria-label="[^"]*% weight">/`),
  e(DL, r`/<button type="button" class="rubric-view-button[^"]*" data-rubric-key="review1"/`, r`/<button type="button" class="btn btn-sm btn-outline" data-rubric-key="review1"/`),
  e(DL, r`assert.match(content.innerHTML,/rubric-assessments/);`, r`assert.match(content.innerHTML,/data-rubric-key="review1"/);`),
  e(DL, r`/id="rubricDrawer" class="team-drawer drawer" data-tooltip-boundary role="dialog"/`, r`/id="rubricDrawer" class="drawer" data-tooltip-boundary role="dialog"/`),
];
