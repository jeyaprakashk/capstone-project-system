/**
 * SHARED RUBRICS VIEW — browser module serialized into the dashboard shell as `SharedRubricsView`.
 * Renders the shared rubrics DTO (API_shared_getRubrics) as assessment cards and renders one assessment's
 * criteria for the shared drawer. DashboardUI owns the read, the snapshot and the drawer; one delegated
 * listener per host opens a rubric or retries. It never calls the server.
 */
function sharedRubricsViewBrowser_(getUi) {
  'use strict';
  const handlers = new WeakMap();
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  const SMALL = 'border-0 inline-flex items-center rounded-md bg-paper px-2 py-1 text-xs font-semibold text-ink ring-1 ring-inset ring-line hover:bg-tint disabled:opacity-50';
  const BUTTON = 'border-0 inline-flex items-center rounded-md bg-paper px-3 py-1.5 text-sm font-semibold text-ink ring-1 ring-inset ring-line hover:bg-tint disabled:opacity-50';
  const CARD = 'rubric-assessment @max-[480px]/rubrics:hidden flex items-center justify-between gap-4 rounded-tile border border-edge px-5 py-4 text-left disabled:opacity-60 ';
  const ROW = 'rubric-mobile-row hidden @max-[480px]/rubrics:flex items-center justify-between gap-3 rounded-tile border border-edge bg-paper px-3 py-3';

  const summary = item => item.available ? escape(item.criterionCount) + ' criteria · ' + escape(item.totalMarks) + ' marks' : escape(item.status);

  function bind(target) {
    if (handlers.has(target)) return;
    handlers.set(target, {open:null, retry:null});
    target.addEventListener('click', event => {
      const rubric = event.target.closest ? event.target.closest('[data-rubric-key]') : null;
      if (rubric && !rubric.disabled) { if (handlers.get(target).open) handlers.get(target).open(rubric.getAttribute('data-rubric-key'), rubric); return; }
      const retry = event.target.closest ? event.target.closest('[data-rubric-retry]') : null;
      if (retry && handlers.get(target).retry) handlers.get(target).retry();
    });
  }

  /** The assessment cards; `open(key, trigger)` is called when a rubric is chosen. */
  function render(target, data, open) {
    bind(target);
    handlers.get(target).open = open;
    const icon = getUi().renderIcon;
    target.innerHTML = '<div class="flex flex-col gap-3 p-4">' + data.assessments.map(item => {
      const attrs = item.available ? ' aria-haspopup="dialog"' : ' disabled';
      return '<button type="button" class="' + CARD + (item.available ? 'bg-paper hover:bg-tint' : 'bg-soft') + '" data-rubric-key="' + escape(item.key) + '"' + attrs + '>' +
        '<span class="flex flex-col"><strong class="text-ink">' + escape(item.label) + '</strong><span class="text-sm text-muted">' + escape(item.weight) + '%<span class="rubric-mobile-hidden"> weight</span></span></span>' +
        '<span class="flex items-center gap-3 text-sm text-ink-2"><span>' + summary(item) + '</span>' +
        (item.available ? '<span class="inline-flex items-center gap-1 font-semibold text-primary"><span class="rubric-mobile-hidden">View rubric</span> ' + icon('arrow-right') + '</span>' : '') + '</span></button>' +
        '<div class="' + ROW + '"><div class="flex flex-col"><strong class="text-ink">' + escape(item.label) + '</strong><span class="text-xs text-muted" aria-label="' + escape(item.weight) + '% weight">' + escape(item.weight) + '% weight</span><span class="text-xs text-ink-2">' + summary(item) + '</span></div>' +
        '<button type="button" class="' + SMALL + '" data-rubric-key="' + escape(item.key) + '" aria-label="View rubric for ' + escape(item.label) + '"' + attrs + '>View rubric</button></div>';
    }).join('') + '</div>' + (data.assessments.length ? '' : '<p class="m-0 px-4 pb-4 text-sm text-muted">No graded assessments configured.</p>');
  }

  /** Shows the failure with a Retry that calls `retry`. */
  function renderError(target, retry) {
    bind(target);
    handlers.get(target).retry = retry;
    target.innerHTML = '<div class="flex items-center gap-3 p-4"><p class="m-0 text-sm text-danger" role="status">Unable to load rubrics.</p><button type="button" class="' + BUTTON + '" data-rubric-retry>Retry</button></div>';
  }

  /** One assessment's contribution and criteria, for the shared drawer. */
  function detailMarkup(item) {
    const label = 'text-xs font-bold tracking-wider text-muted uppercase';
    return '<div class="mb-5"><div class="' + label + '">Assessment contribution</div><div class="mt-1 text-sm font-semibold text-ink">' + escape(item.weight) + '% of overall assessment</div>' +
      '<p class="m-0 mt-1 text-sm text-ink-2">' + escape(item.criterionCount) + ' criteria · ' + escape(item.totalMarks) + ' marks</p>' +
      (item.evaluationNotice ? '<p class="m-0 mt-1 text-sm text-ink-2">' + escape(item.evaluator) + ' · ' + escape(item.evaluationNotice) + '</p>' : '') + '</div>' +
      item.criteria.map(c => '<section class="mb-4 rounded-card border border-edge bg-paper p-3 shadow-card"><div class="' + label + '">' + escape(c.pi) + ' · ' + escape(c.co) + ' · ' + escape(c.type) + ' · ' + escape(c.maxMarks) + ' marks</div>' +
        '<h3 class="m-0 mt-1 text-sm font-semibold text-ink">' + escape(c.name) + '</h3><dl class="m-0 mt-2 grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-sm">' +
        c.descriptors.map((text, level) => text ? '<dt class="font-semibold text-muted">Level ' + level + '</dt><dd class="m-0 text-ink-2">' + escape(text) + '</dd>' : '').join('') + '</dl></section>').join('');
  }

  return {render, renderError, detailMarkup};
}
