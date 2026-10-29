/**
 * TEAM DRAWER VIEW — browser module serialized into the dashboard shell as `TeamDrawerView`.
 * Fills the coordinator's team drawer from three independent reads (basic, progress, activity; see
 * DATA-CONTRACTS.md). Each section settles, fails and retries on its own, and results that arrive after the
 * drawer closed or moved to another team are ignored. Opening, closing, focus and the backdrop stay with
 * DashboardUI's shared drawer; this module never calls google.script.run.
 */
function teamDrawerViewBrowser_(bridge, getUi, getRequests, getDocuments, table) {
  'use strict';
  const delegated = new WeakSet();
  const READ = {timeoutMs:120000};
  const SECTIONS = {
    basic:['Project', 'Guide', 'Students', 'Review Committee', 'Repository'],
    title:['Title'],
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

  const block = (title, body, card) => '<div class="' + BLOCK + '"><h4 class="' + HEADING + '">' + title + '</h4>' + (card ? '<div class="' + CARD + ' p-4">' + body + '</div>' : body) + '</div>';
  const person = (primary, secondary) => '<div class="py-1.5 text-sm"><div class="font-semibold text-ink">' + escape(primary) + '</div><div class="text-xs text-muted">' + secondary + '</div></div>';
  const personCard = (primary, lines) => '<li class="' + CARD + ' min-w-0"><div class="text-sm font-semibold text-ink break-words">' + escape(primary) + '</div>' +
    lines.filter(Boolean).map(line => '<div class="mt-0.5 text-xs text-muted break-all">' + escape(line) + '</div>').join('') + '</li>';
  const PEOPLE = '<ul class="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 xl:grid-cols-3">';
  const PEOPLE_NARROW = '<ul class="m-0 grid list-none gap-3 p-0 sm:grid-cols-2 lg:grid-cols-1">';
  /** Where each section sits in the page grid (lg and up; below lg the sections stack). The Title section spans the rows of Progress and This Week beside it. */
  const PLACE = {basic:'lg:col-span-2', title:'lg:col-start-1 lg:row-span-2', progress:'lg:col-start-2', activity:'lg:col-start-2'};
  const PLACE_DOCUMENTS = 'lg:col-span-2';
  const row = (label, value) => '<div class="' + ROW + '"><span class="text-muted">' + label + '</span><span class="text-right font-semibold text-ink">' + value + '</span></div>';
  const stat = (label, value) => '<div class="' + CARD + '"><div class="' + CARD_LABEL + '">' + label + '</div><div class="' + CARD_VALUE + '">' + escape(value) + '</div></div>';
  const health = value => value === 'ontrack' ? ['success', 'On Track'] : value === 'monitor' ? ['warning', 'Monitor'] : ['danger', 'Attention'];

  const TITLE_STATUS = {NOT_SUBMITTED:'Not submitted', NEEDS_REVIEW:'Awaiting guide', AWAITING_REVIEWER:'Awaiting reviewers', RETURNED:'Returned for revision', APPROVED:'Approved', REOPENED:'Reopened', UNAVAILABLE:'Unavailable'};
  const ACTION_LABEL = {BASELINE:'Imported', SUBMIT:'Submitted', GUIDE_APPROVE:'Guide approved', RETURN:'Returned', REVIEWER_APPROVE:'Reviewer approved', REOPEN:'Reopened', CANCEL_REOPEN:'Reopening cancelled'};
  const FIELD = 'mt-1 block w-full rounded-md border border-control px-3 py-2 text-sm';
  const PRIMARY = 'border-0 rounded-md bg-primary px-3 py-1.5 text-sm font-semibold text-paper hover:bg-primary-hover disabled:opacity-50';
  const when = value => { const date = value ? new Date(value) : null; return date && Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 16).replace('T', ' ') + ' UTC' : '—'; };

  /** The coordinator's title section: state, checklist, history and the reopen controls. */
  function titleMarkup(data) {
    const title = data.title, id = escape(title.teamId);
    const status = TITLE_STATUS[title.status] || title.status;
    const summary = row('Status', escape(status)) + row('Title in effect', escape((title.approved.value ? title.approved.title : title.proposal.title) || '—')) +
      (title.approved.value ? row('First approved', escape(when(title.approved.at)) + (title.approved.by ? ' · ' + escape(title.approved.by) : '')) : '') +
      (title.reopened && title.proposal.title ? row('Proposed change', escape(title.proposal.title)) : '') +
      (title.reopen ? row('Reopened', escape(title.reopen.reason)) : '') +
      (title.similarityNote ? row('Similarity', escape(title.similarityNote)) : '') +
      (title.notes ? row('Latest note', escape(title.notes)) : '') +
      (title.folderUrl ? row('Documents', '<a class="' + LINK + '" href="' + escape(title.folderUrl) + '" target="_blank" rel="noopener">Open team folder</a>') : '') +
      (title.documents || []).map(doc => row(escape(doc.label), '<span class="' + (doc.present ? TONE.success : TONE.warning) + '">' + (doc.present ? 'Present' : 'Missing') + '</span>')).join('');
    const activities = data.requirements && data.requirements.activities || {};
    const errors = data.requirements && data.requirements.errors || [];
    const checklist = Object.keys(activities).filter(key => activities[key].requirements.length || !activities[key].allowed).map(key => {
      const result = activities[key];
      return '<div class="mb-2"><div class="text-xs font-semibold text-muted">' + escape(key) + '</div>' + (result.requirements.length ? result.requirements.map(item =>
        row(escape(item.label), '<span class="' + (item.met ? TONE.success : TONE.warning) + '">' + (item.met ? 'Met' : escape(item.reason || 'Not met')) + '</span>' + (item.diagnostic ? ' <span class="text-xs text-muted">' + escape(item.diagnostic) + '</span>' : ''))).join('') : '<p class="' + NOTE + '">' + escape(result.reason) + '</p>') + '</div>';
    }).join('');
    const history = (title.history || []).slice().reverse().map(item => table.row([table.td(escape(item.revision)), table.td(escape(ACTION_LABEL[item.action] || item.action)), table.td('<span class="break-all">' + escape(item.actor) + '</span>'), table.td('<span class="whitespace-nowrap">' + escape(when(item.at)) + '</span>'), table.td('<span class="break-words">' + escape(item.notes) + '</span>')])).join('');
    const controls = (title.can.reopen.allowed ? '<label class="text-xs font-semibold text-muted" for="title-reason-' + id + '">Reason for reopening</label><textarea id="title-reason-' + id + '" rows="2" maxlength="500" class="' + FIELD + '" data-title-reason></textarea>' +
        '<div class="mt-2"><button type="button" class="' + PRIMARY + '" data-action="title-reopen" data-team="' + id + '" data-revision="' + escape(title.revision) + '">Reopen title</button></div>' : '') +
      (title.can.cancel.allowed ? '<label class="text-xs font-semibold text-muted" for="title-reason-' + id + '">Reason for cancelling the reopening</label><textarea id="title-reason-' + id + '" rows="2" maxlength="500" class="' + FIELD + '" data-title-reason></textarea>' +
        '<div class="mt-2"><button type="button" class="' + PRIMARY + '" data-action="title-cancel" data-team="' + id + '" data-revision="' + escape(title.revision) + '">Cancel reopening</button></div>' : '');
    return block('Title', summary + (controls ? '<div class="mt-3">' + controls + '</div><p class="mt-2 text-sm text-danger" role="status" data-title-status></p>' : '')) +
      (checklist || errors.length ? block('Submission requirements', (errors.length ? '<p class="text-sm text-danger">' + errors.map(escape).join('<br>') + '</p>' : '') + checklist) : '') +
      (history ? block('Title history', table.table({label:'Title history', head:table.head(['Rev', 'Action', 'By', 'When', 'Notes']), body:table.tbody(history)})) : '');
  }

  /** The markup for one section from its DTO. */
  function sectionMarkup(section, data) {
    if (section === 'title') return titleMarkup(data);
    if (section === 'progress') {
      const [tone, label] = health(data.health);
      return block('Progress',
        row('Title Status', escape(TITLE_STATUS[data.titleStatus] || data.titleStatus || '—')) + row('Repository', escape(data.repoStatus || 'Pending')) +
        (data.reviews || []).map(review => row(escape(review.label), '<span class="' + (review.available === false ? TONE.danger : review.completed ? TONE.success : TONE.warning) + '">' +
          (review.available === false ? 'Unavailable' : review.completed ? 'Completed' : 'Pending') + '</span>')).join('') +
        row('Overall Health', '<span class="' + TONE[tone] + '">' + label + '</span>'));
    }
    if (section === 'activity') {
      return block('This Week', '<div class="grid grid-cols-2 gap-3">' + stat('Daily Logs', data.weekLogs) + stat('GitHub Commits', data.weekCommits) + '</div>');
    }
    const students = data.students && data.students.length
      ? PEOPLE + data.students.map(s => personCard(s.name || 'Student', [s.regNo, s.email])).join('') + '</ul>'
      : '<p class="' + NOTE + '">No student details available.</p>';
    const reviewers = data.reviewers && data.reviewers.length
      ? PEOPLE_NARROW + data.reviewers.map(r => personCard(r.name || 'Reviewer', [r.email])).join('') + '</ul>'
      : '<p class="' + NOTE + '">Committee details not available.</p>';
    const repository = data.repoUrl
      ? '<a class="' + LINK + '" href="' + escape(data.repoUrl) + '" target="_blank" rel="noopener">' + escape(data.repoUrl) + '</a>'
      : '<span class="' + NOTE + '">Pending</span>';
    const guide = '<div class="grid gap-3 sm:grid-cols-2 lg:grid-cols-1">' + stat('Guide', data.guideName || '—') + stat('Email', data.guideEmail || '—') + '</div>';
    return '<div class="grid gap-x-6 lg:grid-cols-3">' + '<div class="lg:col-span-2">' + block('Project', '<div class="text-base font-semibold text-ink">' + escape(data.title || '(Title not submitted)') + '</div>' +
        (data.problem ? '<div class="mt-2 text-sm text-ink-2">' + getUi().renderExpandableText(data.problem) + '</div>' : ''), true) +
      '</div>' + block('Guide', guide) +
      '<div class="lg:col-span-2">' + block('Students', students) + '</div>' +
      block('Review Committee' + (data.committeeNumber ? ' · ' + escape(data.committeeNumber) : ''), reviewers) +
      '<div class="lg:col-span-3">' + block('Repository', repository) + '</div></div>';
  }

  const skeletonMarkup = section => '<div class="min-w-0 ' + PLACE[section] + '" data-drawer-section="' + section + '" aria-busy="true">' +
    SECTIONS[section].map(label => block(escape(label), getUi().renderSkeleton('panel', 'Loading ' + label))).join('') + '</div>';

  /** Reopen or cancel a reopening: one write with the revision the section showed; success reloads the section. */
  function titleWrite(button, method, kind) {
    const host = button.closest('[data-drawer-section="title"]'), reason = host && host.querySelector('[data-title-reason]');
    const status = host && host.querySelector('[data-title-status]');
    const text = reason ? reason.value.trim() : '';
    if (!text) { if (status) status.textContent = 'Enter a reason.'; return; }
    const teamId = button.getAttribute('data-team'), revision = Number(button.getAttribute('data-revision'));
    const scope = kind + ':' + teamId, requestId = getRequests().idFor(scope, [revision, text].join('|'));
    const done = getUi().busy.write(status, 'Saving…', [button]);
    bridge.write(method, [{requestId, expectedRevision: revision, teamId, reason: text}]).then(() => {
      getRequests().settle(scope);
      done();
      if (active) active.load('title');
    }, error => {
      getRequests().settle(scope, error);
      done(error && error.message || 'Unable to save.');
      if (error && (error.code === 'CONFLICT' || error.code === 'REJECTED') && active) active.load('title', error.message);
    });
  }

  function onClick(event) {
    const target = event.target.closest ? event.target.closest('[data-action]') : null;
    if (!target || target.disabled) return;
    const action = target.getAttribute('data-action');
    if (action === 'drawer-retry' && active) active.load(target.getAttribute('data-section'));
    else if (action === 'title-reopen') titleWrite(target, 'API_coordinator_reopenTitle', 'reopen');
    else if (action === 'title-cancel') titleWrite(target, 'API_coordinator_cancelReopen', 'cancel');
  }

  /** Fills `content` with the three sections of `teamId`; `isOpen()` says whether the drawer still shows them. */
  function mount(content, teamId, isOpen) {
    const request = ++generation, pending = new Set();
    content.innerHTML = Object.keys(SECTIONS).map(skeletonMarkup).join('') + '<div class="min-w-0 ' + PLACE_DOCUMENTS + '" data-documents-host></div>';
    getDocuments().mount(content.querySelector('[data-documents-host]'), teamId, {single:true});
    if (!delegated.has(content)) { delegated.add(content); content.addEventListener('click', onClick); }
    const sectionHost = section => content.querySelector('[data-drawer-section="' + section + '"]');

    function load(section, message) {
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
        if (message) { const note = target.querySelector('[data-title-status]'); if (note) note.textContent = message; }
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
    Object.keys(SECTIONS).forEach(name => load(name));
  }

  /** Invalidates every read still in flight, e.g. when the drawer closes. */
  function cancel() { generation++; active = null; }

  return {mount, cancel, sectionMarkup};
}
