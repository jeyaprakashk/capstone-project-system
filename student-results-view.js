/**
 * STUDENT RESULTS VIEW — browser module serialized into the dashboard shell as `StudentResults`.
 * Fills the published-results placeholders of the Student dashboard: one per Review
 * (#studentAssessment-<key>) and the Guide Evaluation (#studentGuideEvaluation). Reads go through the
 * data bridge (API_student_getReviewResult / API_student_getGuideResult); a failed refresh keeps the
 * content already shown and offers Retry. Markup uses Tailwind utilities.
 */
function studentResultsViewBrowser_(bridge, getUi) {
  'use strict';
  const busy = new Set();
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const mark = value => value === null || value === undefined || !Number.isFinite(Number(value)) ? 'Pending' : String(value);
  const BUTTON = 'border-0 rounded-md bg-paper px-2 py-1 text-xs font-semibold text-ink ring-1 ring-inset ring-line hover:bg-tint';
  const p = (html, extra) => '<p class="mt-1 text-sm ' + (extra || 'text-ink-2') + '">' + html + '</p>';

  function review(result) {
    const a = result.assessment || {};
    return '<h3 class="m-0 text-base font-semibold text-ink">' + esc(result.config.label) + '</h3>' + identity(result) +
      p('Team Mark: ' + mark(a.teamMark) + ' &middot; Individual Mark: ' + mark(a.individualMark) + ' &middot; Review Total: ' + mark(result.total) + ' / ' + result.config.maximum + ' &middot; Course contribution ' + mark(result.weighted) + ' / ' + (result.config.weight * 100) + ' &middot; Status: ' + esc(a.status || 'Pending')) +
      result.config.criteria.map(c => {
        const score = result.scores[c.pi] || {}, effective = a.effectiveScores && a.effectiveScores[c.pi] || score;
        return p('<strong class="text-ink">' + esc(c.name) + '</strong>: ' + mark(effective ? effective.marks : score.marks) + ' / ' + c.maxMarks) +
          (effective && effective.source === 'policy' ? p('Policy-assigned zero', 'text-muted') : (effective && effective.source === 'makeup' ? p('Individual Makeup result', 'text-muted') : '') + p(esc(score.remark), 'text-muted'));
      }).join('');
  }
  function guide(result) {
    return '<h3 class="m-0 text-base font-semibold text-ink">' + esc(result.config.label) + '</h3>' + identity(result) +
      p(result.total.toFixed(2) + ' / ' + result.config.maximum + ' · Course contribution ' + result.weighted.toFixed(2) + ' / ' + (result.config.weight * 100)) +
      result.config.criteria.map(c => {
        const score = result.scores[c.pi];
        return p('<strong class="text-ink">' + esc(c.name) + '</strong>: ' + score.marks + ' / ' + c.maxMarks + ' · Level ' + score.level) + p(esc(score.remark), 'text-muted');
      }).join('');
  }
  function identity(result) {
    return (result.identity ? p(esc(result.identity.name + ' (' + result.identity.register + ')')) : '') +
      (result.underCorrection ? '<p role="status" class="mt-1 text-sm text-warning">Under correction. These are the last published results.</p>' : '');
  }
  function summary(result, body) {
    return '<details><summary class="flex cursor-pointer list-none flex-wrap items-center gap-2 [&::-webkit-details-marker]:hidden"><strong class="text-sm text-ink">' + esc(result.config.label) + '</strong>' +
      '<span class="text-xs font-semibold text-success">' + (result.underCorrection ? 'Under correction' : 'Published') + '</span><span class="text-xs text-primary">View marks</span></summary><div class="mt-2">' + body + '</div></details>';
  }

  /** Loads one panel; the host decides what "current" means, so a re-rendered dashboard ignores stale replies. */
  function load(spec) {
    const host = document.getElementById(spec.id);
    if (!host || busy.has(spec.id)) return;
    const label = spec.label(host);
    busy.add(spec.id);
    const finish = getUi().beginContentLoading(host, 'Loading ' + label + ' results', {compact:true});
    const current = () => document.getElementById(spec.id) === host;
    bridge.read('student-result:' + spec.id, spec.method, spec.args, {timeoutMs:60000}).then(function(result) {
      finish(); busy.delete(spec.id);
      if (!current()) return;
      if (!result) { host.innerHTML = '<div class="flex items-center justify-between gap-2 text-sm"><strong class="text-ink">' + esc(label) + '</strong><span class="text-muted">Not published</span></div>'; return; }
      host.innerHTML = summary(result, spec.render(result));
    }, function(error) {
      finish(); busy.delete(spec.id);
      if (!current() || (error && error.superseded)) return;
      const notice = document.createElement('p');
      notice.className = 'mt-2 text-sm text-ink-2';
      notice.setAttribute('data-results-error', '');
      notice.textContent = spec.failure(label) + ' ' + (error && error.message || '') + ' ';
      const retry = document.createElement('button');
      retry.type = 'button'; retry.setAttribute('data-results-retry', ''); retry.className = BUTTON; retry.textContent = 'Retry';
      retry.addEventListener('click', function() { notice.remove(); load(spec); });
      notice.appendChild(retry);
      host.appendChild(notice);
    });
  }

  const reviewSpec = key => ({id:'studentAssessment-' + key, method:'API_student_getReviewResult', args:[key], render:review,
    label:host => host.dataset && host.dataset.assessmentLabel || key, failure:label => label + ' results unavailable.'});
  const guideSpec = {id:'studentGuideEvaluation', method:'API_student_getGuideResult', args:[], render:guide,
    label:host => host.dataset && host.dataset.assessmentLabel || 'Guide Evaluation', failure:() => 'Guide evaluation unavailable.'};

  return {
    review:key => load(reviewSpec(key)),
    guide:() => load(guideSpec),
    /** Every placeholder the Student dashboard rendered. */
    all:function() { document.querySelectorAll('[data-review-result]').forEach(host => load(reviewSpec(host.dataset.reviewResult))); load(guideSpec); }
  };
}
