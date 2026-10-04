/**
 * SHARED TIMELINE VIEW — browser module serialized into the dashboard shell as `SharedTimelineView`.
 * Renders the project timeline DTO (API_shared_getTimeline) with Tailwind utilities. DashboardUI owns the
 * single-flight read and the snapshot; this module only renders, and one delegated listener per host
 * handles "View full timeline" and Retry. It never calls the server.
 */
function sharedTimelineViewBrowser_(getUi) {
  'use strict';
  const handlers = new WeakMap();
  const escape = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));
  const SMALL = 'border-0 inline-flex items-center rounded-md bg-paper px-2 py-1 text-xs font-semibold text-ink ring-1 ring-inset ring-line hover:bg-tint disabled:opacity-50';
  const HEADER = 'flex flex-wrap items-center justify-between gap-2';
  const TITLE = 'm-0 text-base font-semibold text-ink';
  const STOP = 'timeline-stop flex min-w-0 flex-col gap-1 rounded-tile border p-3 text-sm ';
  const TONE = {
    past:'border-edge bg-soft text-muted',
    current:'border-primary bg-paper text-ink ring-1 ring-primary',
    future:'border-edge bg-paper text-ink-2'
  };
  const MARK = 'inline-flex size-5 items-center justify-center rounded-full ';
  const MARK_TONE = {past:'bg-success-tint text-success', current:'bg-primary text-paper', future:'bg-tint text-muted'};

  const header = extra => '<div class="' + HEADER + '"><h2 class="' + TITLE + '">Project timeline</h2>' + (extra || '') + '</div>';

  function bind(target) {
    if (handlers.has(target)) return;
    handlers.set(target, {retry:null});
    target.addEventListener('click', event => {
      const toggle = event.target.closest ? event.target.closest('[data-timeline-toggle]') : null;
      if (toggle) { setExpanded(target, toggle, toggle.getAttribute('aria-expanded') !== 'true'); return; }
      const retry = event.target.closest ? event.target.closest('[data-timeline-retry]') : null;
      if (retry && handlers.get(target).retry) handlers.get(target).retry();
    });
  }

  /** "View full timeline" shows every stop; otherwise only the stops around the next due date. */
  function setExpanded(target, toggle, expanded) {
    toggle.setAttribute('aria-expanded', String(expanded));
    toggle.textContent = expanded ? 'Show less' : 'View full timeline';
    target.querySelector('[data-timeline-track]').classList.toggle('timeline-full', expanded);
    target.querySelectorAll('[data-timeline-stop]').forEach(item => {
      item.hidden = !expanded && item.dataset.timelineContext !== 'true';
      item.classList.toggle('max-[760px]:hidden', !expanded && item.dataset.timelineMobile === 'false');
    });
  }

  /** Presentation only: the authoritative snapshot, including weekly scheduling, stays with the caller. */
  function render(target, data) {
    bind(target);
    const milestones = data.milestones.filter(m => !['week1', 'end'].includes(m.key));
    const next = milestones.findIndex(m => m.day >= data.today);
    const start = Math.max(0, (next < 0 ? milestones.length : next) - 2);
    const finish = next < 0 ? milestones.length : Math.min(milestones.length, next + 3);
    const icon = getUi().renderIcon;
    const stops = milestones.map((m, index) => {
      const past = m.day < data.today, current = index === next, state = past ? 'past' : current ? 'current' : 'future';
      const mobileContext = next < 0 ? index >= Math.max(0, milestones.length - 2) : Math.abs(index - next) <= 1;
      const description = m.openingDate ? 'Opens ' + m.openingDate + '; due ' + m.date : m.date;
      const days = m.day - data.today;
      const timing = current ? 'CURRENT · ' + (days === 0 ? 'Due today' : days === 1 ? 'Due tomorrow' : 'Due in ' + days + ' days')
        : !past ? (days === 0 ? 'Due today' : 'In ' + days + (days === 1 ? ' day' : ' days')) : '';
      return '<li data-timeline-stop class="' + STOP + TONE[state] + (mobileContext ? '' : ' max-[760px]:hidden') + '" data-timeline-state="' + state + '" data-timeline-mobile="' + mobileContext +
        '" data-timeline-context="' + (index >= start && index < finish) + '"' + (index < start || index >= finish ? ' hidden' : '') + (current ? ' aria-current="step"' : '') + '>' +
        '<span class="' + MARK + MARK_TONE[state] + '" aria-hidden="true">' + (past ? icon('check') : current ? '<span class="size-2 rounded-full bg-paper"></span>' : '') + '</span>' +
        '<strong class="font-semibold">' + escape(m.label) + '</strong>' +
        '<span class="text-xs" data-timeline-date title="' + escape(description) + '" aria-label="' + escape(description) + '">' + escape(m.date) + '</span>' +
        (timing ? '<span class="text-xs font-semibold text-primary" data-timeline-timing>' + escape(timing) + '</span>' : '') + '</li>';
    }).join('');
    target.innerHTML = header(milestones.length ? '<button type="button" class="' + SMALL + '" data-timeline-toggle aria-expanded="false" aria-controls="projectTimelineMilestones">View full timeline</button>' : '') +
      (milestones.length ? '' : '<p class="timeline-empty m-0 mt-2 text-sm text-muted">No project milestones scheduled</p>') +
      '<ol id="projectTimelineMilestones" class="timeline-track m-0 mt-3 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-5" data-timeline-track>' + stops + '</ol>';
  }

  /** Shows the failure with a Retry that calls `retry`. */
  function renderError(target, retry) {
    bind(target);
    handlers.get(target).retry = retry;
    target.innerHTML = header('<span class="text-sm text-danger" role="status">Schedule unavailable</span><button type="button" class="' + SMALL + '" data-timeline-retry>Retry</button>');
  }

  return {render, renderError};
}
