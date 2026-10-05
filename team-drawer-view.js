/**
 * TEAM DRAWER VIEW — browser module serialized into the dashboard shell as `TeamDrawerView`.
 * Fills the coordinator's team drawer from three independent reads (basic, progress, activity; see
 * DATA-CONTRACTS.md). Each section settles, fails and retries on its own, and results that arrive after the
 * drawer closed or moved to another team are ignored. Opening, closing, focus and the backdrop stay with
 * DashboardUI's shared drawer; this module never calls google.script.run.
 */
function teamDrawerViewBrowser_(bridge, getUi) {
  'use strict';
  const delegated = new WeakSet();
  const READ = {timeoutMs:120000};
  const SECTIONS = {
    basic:['Project', 'Guide', 'Students', 'Review Committee', 'Repository'],
    progress:['Progress'],
    activity:['This Week']
  };
  let generation = 0, active = null;
  const escape = value => String(value == null ? '' : value).replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;'}[c]));

  const SMALL = 'border-0 inline-flex items-center rounded-md bg-paper px-2 py-1 text-xs font-semibold text-ink ring-1 ring-inset ring-line hover:bg-tint disabled:opacity-50';
  const LINK = 'inline-flex max-w-full items-center break-all rounded-md bg-paper px-3 py-1.5 text-sm font-semibold text-ink no-underline ring-1 ring-inset ring-line hover:bg-tint';
  const BADGE = 'inline-flex items-center rounded-badge px-2 py-0.5 text-xs font-semibold ';
  const TONE = {success:BADGE + 'bg-success-tint text-success', warning:BADGE + 'bg-warning-tint text-warning', danger:BADGE + 'bg-danger-tint text-danger'};
  const HEADING = 'mb-2 text-xs font-bold tracking-wider text-muted uppercase';
  const BLOCK = 'mb-5';
  const ROW = 'flex items-center justify-between gap-3 border-b border-edge py-1.5 text-sm';
  const CARD = 'rounded-card border border-edge bg-paper p-3 shadow-card';
  const CARD_LABEL = 'text-xs text-muted';
  const CARD_VALUE = 'mt-1 text-sm font-semibold text-ink break-words';
  const NOTE = 'text-sm text-muted';

  const block = (title, body) => '<div class="' + BLOCK + '"><h4 class="' + HEADING + '">' + title + '</h4>' + body + '</div>';
  const person = (primary, secondary) => '<div class="py-1.5 text-sm"><div class="font-semibold text-ink">' + escape(primary) + '</div><div class="text-xs text-muted">' + secondary + '</div></div>';
  const row = (label, value) => '<div class="' + ROW + '"><span class="text-muted">' + label + '</span><span class="text-right font-semibold text-ink">' + value + '</span></div>';
  const stat = (label, value) => '<div class="' + CARD + '"><div class="' + CARD_LABEL + '">' + label + '</div><div class="' + CARD_VALUE + '">' + escape(value) + '</div></div>';
  const health = value => value === 'ontrack' ? ['success', 'On Track'] : value === 'monitor' ? ['warning', 'Monitor'] : ['danger', 'Attention'];

  /** The markup for one section from its DTO. */
  function sectionMarkup(section, data) {
    if (section === 'progress') {
      const [tone, label] = health(data.health);
      return block('Progress',
        row('Title Status', escape(data.titleStatus || '—')) + row('Guide Decision', escape(data.guideDecision || '—')) +
        row('Reviewer Decision', escape(data.reviewerDecision || '—')) + row('Repository', escape(data.repoStatus || 'Pending')) +
        (data.reviews || []).map(review => row(escape(review.label), '<span class="' + (review.available === false ? TONE.danger : review.completed ? TONE.success : TONE.warning) + '">' +
          (review.available === false ? 'Unavailable' : review.completed ? 'Completed' : 'Pending') + '</span>')).join('') +
        row('Overall Health', '<span class="' + TONE[tone] + '">' + label + '</span>'));
    }
    if (section === 'activity') {
      return block('This Week', '<div class="grid grid-cols-2 gap-3">' + stat('Daily Logs', data.weekLogs) + stat('GitHub Commits', data.weekCommits) + '</div>');
    }
    const students = data.students && data.students.length
      ? data.students.map(s => person(s.name || 'Student', escape(s.regNo || '') + (s.regNo && s.email ? ' · ' : '') + escape(s.email || ''))).join('')
      : '<p class="' + NOTE + '">No student details available.</p>';
    const reviewers = data.reviewers && data.reviewers.length
      ? data.reviewers.map(r => person(r.name || 'Reviewer', escape(r.email || ''))).join('')
      : '<p class="' + NOTE + '">Committee details not available.</p>';
    const repository = data.repoUrl
      ? '<a class="' + LINK + '" href="' + escape(data.repoUrl) + '" target="_blank" rel="noopener">' + escape(data.repoUrl) + '</a>'
      : '<span class="' + NOTE + '">Pending</span>';
    return block('Project', '<div class="text-sm font-semibold text-ink">' + escape(data.title || '(Title not submitted)') + '</div>' +
        (data.problem ? '<div class="mt-1 text-sm text-ink-2">' + getUi().renderExpandableText(data.problem) + '</div>' : '')) +
      block('Guide', '<div class="grid grid-cols-2 gap-3">' + stat('Guide', data.guideName || '—') + stat('Email', data.guideEmail || '—') + '</div>') +
      block('Students', students) +
      block('Review Committee' + (data.committeeNumber ? ' · ' + escape(data.committeeNumber) : ''), reviewers) +
      block('Repository', repository);
  }

  const skeletonMarkup = section => '<div data-drawer-section="' + section + '" aria-busy="true">' +
    SECTIONS[section].map(label => block(escape(label), getUi().renderSkeleton('panel', 'Loading ' + label))).join('') + '</div>';

  function onClick(event) {
    const button = event.target.closest ? event.target.closest('[data-action="drawer-retry"]') : null;
    if (button && !button.disabled && active) active.load(button.getAttribute('data-section'));
  }

  /** Fills `content` with the three sections of `teamId`; `isOpen()` says whether the drawer still shows them. */
  function mount(content, teamId, isOpen) {
    const request = ++generation, pending = new Set();
    content.innerHTML = Object.keys(SECTIONS).map(skeletonMarkup).join('');
    if (!delegated.has(content)) { delegated.add(content); content.addEventListener('click', onClick); }
    const sectionHost = section => content.querySelector('[data-drawer-section="' + section + '"]');

    function load(section) {
      const target = sectionHost(section);
      if (request !== generation || pending.has(section) || !target) return;
      pending.add(section);
      getUi().busy.mark(target, true);
      const retry = target.querySelector('[data-action="drawer-retry"]');
      if (retry) retry.disabled = true;
      const current = () => request === generation && isOpen() && target === sectionHost(section);
      const showRetry = message => {
        target.insertAdjacentHTML('beforeend', '<div class="' + NOTE + '">' + escape(message) + ' <button type="button" class="' + SMALL + '" data-action="drawer-retry" data-section="' + section + '">Retry</button></div>');
      };
      bridge.read('team-drawer:' + teamId + ':' + section, 'API_coordinator_getTeamDrawer', [teamId, section], READ).then(data => {
        if (!current()) return;
        pending.delete(section);
        target.innerHTML = sectionMarkup(section, data);
        getUi().busy.mark(target, false);
        if (section === 'progress' && (data.reviews || []).some(review => review.available === false)) showRetry('Some review data is unavailable.');
      }, error => {
        if (!current()) return;
        pending.delete(section);
        target.innerHTML = '';
        getUi().busy.mark(target, false);
        showRetry('Unable to load ' + section + ': ' + (error && error.message || 'The server did not provide error details') + '.');
      });
    }
    active = {request, load};
    Object.keys(SECTIONS).forEach(load);
  }

  /** Invalidates every read still in flight, e.g. when the drawer closes. */
  function cancel() { generation++; active = null; }

  return {mount, cancel, sectionMarkup};
}
