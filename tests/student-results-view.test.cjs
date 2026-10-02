// Student published-results panels (Review and Guide Evaluation). Ported from the former per-module student() tests.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const vm = require('node:vm');
const { parseHTML } = require('linkedom');
const { Sync } = require('./sync-promise.cjs');
const { publishingFixture } = require('./internal-publishing-fixture.cjs');

const id = () => crypto.randomUUID();
function reopen(f, key, student) { const t = f.report().teams[0]; return f.c.reopenInternalAssessment({ assessmentId: key, team: 'g18', student, revision: student ? t.students.find(s => s.register === student).revision : t.revision, requestId: id(), reason: 'Private correction reason' }); }

function panel(html) {
  const { window } = parseHTML('<html><body>' + html + '</body></html>'), document = window.document, calls = [];
  let begun = 0, settled = 0;
  const bridge = { read: (key, method, args, options) => { const p = new Sync(); calls.push({ key, method, args, options, ok: v => p.resolve(v), fail: e => p.reject(e) }); return p; } };
  const ctx = vm.createContext({ window, document });
  vm.runInContext(fs.readFileSync('student-results-view.js', 'utf8'), ctx);
  const api = ctx.studentResultsViewBrowser_(bridge, () => ({ beginContentLoading: () => { begun++; let done = false; return () => { if (!done) { done = true; settled++; } }; } }));
  return { api, document, calls, counts: () => [begun, settled] };
}
const REVIEW = '<section id="studentAssessment-review1" data-review-result="review1" data-assessment-label="Review 1"></section>';
const GUIDE = '<section id="studentGuideEvaluation" data-assessment-label="Guide Evaluation"></section>';

for (const key of ['review1', 'guide_eval']) test(key + ' student release refresh preserves content, deduplicates, retries and ignores detached callbacks', () => {
  const f = publishingFixture(key);
  if (key === 'review1') { f.submit(); f.publish(); } else { f.guideSubmit('s1'); f.report(); f.c.publishGuideEvaluation({ team: 'g18', student: 's1', revision: 1, requestId: id() }); }
  reopen(f, key, key === 'guide_eval' ? 's1' : undefined); f.actor('one@x');
  const result = JSON.parse(JSON.stringify(f.c.loadPublishedAssessment_(key)));
  const p = panel(key === 'review1' ? REVIEW : GUIDE), host = p.document.querySelector('section');
  const load = () => key === 'review1' ? p.api.review('review1') : p.api.guide();
  load(); load(); assert.equal(p.calls.length, 1);
  assert.equal(p.calls[0].method, key === 'review1' ? 'API_student_getReviewResult' : 'API_student_getGuideResult');
  p.calls[0].ok(result); assert.match(host.textContent, /Under correction/); assert.doesNotMatch(host.textContent, /Private correction/);
  const heading = host.querySelector('h3'); load(); p.calls[1].fail({ message: 'Offline' });
  assert.equal(host.querySelector('h3'), heading); assert.match(host.textContent, /Offline/); assert.equal(p.counts()[0], p.counts()[1]);
  host.querySelector('button').click(); p.calls[2].ok(result); assert(!host.querySelector('button')); assert.equal(p.counts()[0], p.counts()[1]);
  load(); host.remove(); p.document.body.innerHTML = '<section id="' + host.id + '">Replacement screen</section>'; p.calls[3].ok(result);
  assert.equal(p.document.querySelector('section').textContent, 'Replacement screen'); assert.equal(p.counts()[0], p.counts()[1]);
});

test('student result refresh preserves published content on failure and renders pending without zero coercion', () => {
  const p = panel(REVIEW), host = p.document.querySelector('section');
  host.innerHTML = 'Existing published result';
  p.api.review('review1'); p.api.review('review1'); assert.equal(p.calls.length, 1); assert.equal(p.counts()[0], 1);
  p.calls[0].fail({ message: 'Offline' }); assert.match(host.textContent, /Existing published result/); assert.equal(p.counts()[1], 1);
  host.querySelector('button').click(); assert.equal(p.calls.length, 2);
  p.calls[1].ok({ config: { label: 'Review 1', maximum: 100, weight: .2, criteria: [] }, total: null, weighted: null, assessment: { teamMark: 48, individualMark: null, status: 'MAKEUP_PENDING' } });
  assert.equal(p.counts()[1], 2);
  assert.match(host.innerHTML, /Individual Mark: Pending/); assert.match(host.innerHTML, /Review Total: Pending/); assert.doesNotMatch(host.innerHTML, /Review Total: 0/);
});

test('an unpublished result says so, using the configured label', () => {
  const p = panel(REVIEW + GUIDE);
  p.api.all(); assert.deepEqual(p.calls.map(c => c.method), ['API_student_getReviewResult', 'API_student_getGuideResult']);
  p.calls.forEach(c => c.ok(null));
  assert.match(p.document.getElementById('studentAssessment-review1').textContent, /Review 1.*Not published/);
  assert.match(p.document.getElementById('studentGuideEvaluation').textContent, /Guide Evaluation.*Not published/);
});

test('review results show component marks, policy zeros and makeups; guide results show levels', () => {
  const config = { label: 'Review 1', maximum: 100, weight: .2, criteria: [{ pi: 'A', name: 'Design <b>', maxMarks: 50 }, { pi: 'B', name: 'Viva', maxMarks: 30 }, { pi: 'C', name: 'Report', maxMarks: 20 }] };
  const p = panel(REVIEW + GUIDE);
  p.api.review('review1');
  p.calls[0].ok({ config, identity: { name: 'Asha <i>', register: 'R1' }, total: 80, weighted: 16, scores: { A: { marks: 40, remark: 'Good <script>' }, B: { marks: 0, remark: 'zero' }, C: { marks: 15, remark: 'late' } },
    assessment: { teamMark: 40, individualMark: 40, status: 'COMPLETED', effectiveScores: { A: { marks: 40, source: 'common' }, B: { marks: 0, source: 'policy' }, C: { marks: 15, source: 'makeup' } } } });
  const review = p.document.getElementById('studentAssessment-review1');
  assert.match(review.textContent, /Team Mark: 40 · Individual Mark: 40 · Review Total: 80 \/ 100 · Course contribution 16 \/ 20 · Status: COMPLETED/);
  assert.match(review.textContent, /Policy-assigned zero/); assert.match(review.textContent, /Individual Makeup result/);
  assert.match(review.textContent, /Asha <i> \(R1\)/); assert.equal(review.querySelectorAll('i, script').length, 0);
  assert.match(review.querySelector('summary').textContent, /Review 1.*Published.*View marks/);
  assert.equal(review.querySelector('details').hasAttribute('open'), false);
  p.api.guide();
  p.calls[1].ok({ config: { label: 'Guide Evaluation', maximum: 40, weight: .6, criteria: [{ pi: 'G1', name: 'Initiative', maxMarks: 40 }] }, total: 32, weighted: 48, scores: { G1: { marks: 32, level: 4, remark: 'Strong' } } });
  assert.match(p.document.getElementById('studentGuideEvaluation').textContent, /32\.00 \/ 40 · Course contribution 48\.00 \/ 60/);
  assert.match(p.document.getElementById('studentGuideEvaluation').textContent, /Initiative: 32 \/ 40 · Level 4/);
});

test('failures name the panel and the markup uses only compiled Tailwind utilities', () => {
  const { missingClasses, renderedClasses } = require('./compiled-css.cjs');
  const p = panel(REVIEW + GUIDE);
  p.api.all(); p.calls[0].fail({ message: 'Offline' }); p.calls[1].fail({ message: 'Down' });
  assert.match(p.document.getElementById('studentAssessment-review1').textContent, /Review 1 results unavailable\. Offline/);
  assert.match(p.document.getElementById('studentGuideEvaluation').textContent, /Guide evaluation unavailable\. Down/);
  p.document.querySelectorAll('button').forEach(b => b.click());
  p.calls[2].ok({ config: { label: 'Review 1', maximum: 10, weight: .1, criteria: [] }, total: 5, weighted: 1, assessment: {} });
  p.calls[3].ok(null);
  assert.deepEqual(missingClasses(renderedClasses(p.document).filter(c => !c.startsWith('lucide'))), []);
  const src = fs.readFileSync('student-results-view.js', 'utf8');
  assert.deepEqual(missingClasses([...src.matchAll(/(?:BUTTON) = '([^']+)'/g)].flatMap(m => m[1].split(/\s+/))), []);
  assert.equal(p.calls[0].options.timeoutMs, 60000);
});
