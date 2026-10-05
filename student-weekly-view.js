/**
 * STUDENT WEEKLY VIEW — browser module serialized into the dashboard shell as `StudentWeekly`.
 * Owns the Weeks screen of the Student dashboard (#studentWeeklyProgress): the status card, the
 * "Your weeks" list, the selected week's detail (submission summary or form) and the "All weekly
 * logs" drawer. Reads and saves go through the data bridge (API_student_getWeekly /
 * API_student_submitWeekly); markup uses Tailwind utilities and delegated events. Panel state lives
 * on the host element so a re-rendered dashboard starts clean.
 */
function studentWeeklyViewBrowser_(bridge, getUi) {
  'use strict';
  const delegated = new WeakSet();
  const FIELDS = [
    ['workCompleted', 'Work Completed', 'What you finished this week.'],
    ['guideDiscussion', 'Guide Discussion/Decision', 'What you and your guide discussed or agreed on.'],
    ['blockers', 'Problems/Blockers', 'What slowed you down, and how you handled it. Write None if nothing.'],
    ['nextAction', 'Next Week Plan', 'What you plan to do next week.']
  ];
  const SEP = ' ' + String.fromCharCode(183) + ' ';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const byId = id => document.getElementById(id);
  const icon = (name, label, className) => getUi().renderIcon(name, label, className);
  const errorMessage = err => typeof err === 'string' && err.trim() ? err.trim() : err && typeof err.message === 'string' && err.message.trim() ? err.message.trim() : 'The server did not provide error details';

  const BUTTON = 'border-0 rounded-md bg-paper px-3 py-1.5 text-sm font-semibold text-ink ring-1 ring-inset ring-line hover:bg-tint disabled:opacity-50';
  const PRIMARY = 'border-0 rounded-btn bg-primary px-4 py-2.5 text-sm font-semibold text-paper hover:bg-primary-hover disabled:opacity-50';
  const WIDE_PRIMARY = 'w-full border-0 rounded-btn bg-primary px-4 py-3 text-sm font-semibold text-paper hover:bg-primary-hover disabled:opacity-50';
  const ICON_BUTTON = 'inline-flex size-8 shrink-0 items-center justify-center border-0 rounded-md bg-transparent text-ink-2 hover:bg-paper disabled:opacity-50';
  const BADGE = 'inline-flex items-center gap-1 rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ';
  const TONE = {
    success:BADGE + 'bg-success-tint text-success ring-success/20', warning:BADGE + 'bg-warning-tint text-warning ring-warning/20',
    danger:BADGE + 'bg-danger-tint text-danger ring-danger/20'
  };
  const CIRCLE = 'inline-flex shrink-0 items-center justify-center rounded-full ';
  const CIRCLE_TONE = {success:'bg-success-tint text-success', warning:'bg-warning-tint text-warning', danger:'bg-danger-tint text-danger'};
  const CARD = 'rounded-card border border-edge bg-paper shadow-card';
  const ROW = 'flex w-full cursor-pointer items-center gap-3 border-0 bg-transparent px-4 py-3 text-left text-ink hover:bg-tint aria-[current=true]:bg-tint';
  const NOTE = 'flex items-start gap-2 rounded-md border border-warning/20 bg-warning-tint px-3 py-2 text-sm text-warning';
  const FIELD = 'block w-full rounded-md border border-control px-3 py-2 text-body';
  const ACTIONS = 'sticky bottom-16 z-10 -mx-5 flex flex-wrap items-center justify-end gap-2 border-t border-edge bg-paper px-5 py-3 xl:bottom-0';
  const STATE = {
    'SUBMITTED ON TIME':{text:'Submitted on time', icon:'check'}, 'SUBMITTED LATE':{text:'Submitted late', icon:'clock'},
    OPEN:{text:'Open', icon:'pencil'}, LATE:{text:'Late', icon:'clock'}, MISSED:{text:'Missed', icon:'x'}
  };
  const p = (html, extra) => '<p class="mt-2 text-sm ' + (extra || 'text-ink-2') + '">' + html + '</p>';

  // ---- dates ----
  const FORMAT = {day:'numeric', month:'short', hour:'numeric', minute:'2-digit', hour12:true};
  const tidy = text => text.replace('Sept', 'Sep').replace(/\b([ap])m\b/, (m, c) => c.toUpperCase() + 'M');
  function weeklyDate(value, timezone) {
    return value ? tidy(new Date(value).toLocaleString('en-IN', {timeZone:timezone, ...FORMAT, timeZoneName:'short'})) : 'Not submitted';
  }
  function shortDate(value, timezone) {
    return value ? tidy(new Date(value).toLocaleString('en-IN', {timeZone:timezone, ...FORMAT})) : '';
  }
  function dayOnly(value, timezone) {
    return new Date(value).toLocaleDateString('en-GB', {timeZone:timezone, day:'numeric', month:'short'}).replace('Sept', 'Sep');
  }
  /** "tonight, 11:59 PM IST" when the moment falls on today's date, otherwise the full date. */
  function untilText(value, timezone, now) {
    const key = at => new Date(at).toLocaleDateString('en-CA', {timeZone:timezone});
    if (key(value) !== key(now)) return weeklyDate(value, timezone);
    const hour = Number(new Intl.DateTimeFormat('en-US', {timeZone:timezone, hour:'numeric', hour12:false}).format(new Date(value)));
    const time = tidy(new Date(value).toLocaleTimeString('en-IN', {timeZone:timezone, hour:'numeric', minute:'2-digit', hour12:true, timeZoneName:'short'}));
    return (hour >= 18 ? 'tonight' : 'today') + ', ' + time;
  }
  const nowOf = data => data.checkedAt ? Date.parse(data.checkedAt) : Date.now();
  function weekLabel(weekId) {
    const match = String(weekId).match(/[0-9]+$/);
    return match ? 'Week ' + match[0].padStart(2, '0') : String(weekId);
  }
  function statusTone(state, deadline, timezone, now) {
    if (state === 'SUBMITTED ON TIME') return 'success';
    if (state === 'LATE' || state === 'SUBMITTED LATE' || state === 'MISSED' || now > Date.parse(deadline)) return 'danger';
    const day = value => {
      const parts = new Intl.DateTimeFormat('en-US', {timeZone:timezone, year:'numeric', month:'numeric', day:'numeric'}).formatToParts(new Date(value));
      const part = name => Number(parts.find(x => x.type === name).value);
      return Date.UTC(part('year'), part('month') - 1, part('day')) / 86400000;
    };
    return day(deadline) - day(now) <= 1 ? 'warning' : 'success';
  }

  // ---- week state ----
  function latestSubmission(host, weekId) {
    return host.weeklyData.history.filter(r => r.weekId === weekId && r.entryStatus !== 'MISSED').slice(-1)[0];
  }
  function weekState(host, week) {
    const latest = latestSubmission(host, week.weekId);
    return latest ? (latest.timeliness === 'ON_TIME' ? 'SUBMITTED ON TIME' : 'SUBMITTED LATE') : week.state;
  }
  const stateView = state => STATE[state] || {text:String(state || ''), icon:'clock'};
  const isActionable = (host, weekId) => host.weeklyData.actions.some(a => a.weekId === weekId);
  function setView(host, view) { host.setAttribute('data-weekly-view', view); }

  function updateFormPresentation(host, form, action, saved) {
    const data = host.weeklyData, now = nowOf(data), tz = data.timezone;
    const latest = saved || latestSubmission(host, action.weekId);
    const state = latest ? (latest.timeliness === 'ON_TIME' ? 'SUBMITTED ON TIME' : 'SUBMITTED LATE') : action.state;
    const editing = !!form && form.dataset.week === action.weekId && !!latest;
    host.querySelector('[data-weekly-heading]').textContent = (editing ? 'Edit ' : '') + weekLabel(action.weekId);
    const range = host.querySelector('[data-weekly-range]');
    range.textContent = action.opens ? dayOnly(action.opens, tz) + ' ' + String.fromCharCode(8211) + ' ' + dayOnly(action.deadline, tz) : '';
    range.hidden = !range.textContent;
    const rows = [];
    if (action.guideFrozen) rows.push('<p class="m-0">Guide confirmed; further revisions are frozen.</p>');
    if (editing) rows.push('<p class="' + NOTE + '">' + icon('clock') + '<span>Edits close ' + esc(untilText(action.cutoff, tz, now)) + '.</span></p>');
    else if (latest) {
      const first = latest.firstSubmittedAt || latest.recordedAt;
      if (first) rows.push('<p class="m-0 text-ink">Submitted ' + esc(weeklyDate(first, tz)) + '</p>');
      if (latest.timeliness === 'LATE') rows.push('<p class="m-0">Was due ' + esc(weeklyDate(action.deadline, tz)) + '</p>');
      if (isActionable(host, action.weekId) && !action.guideFrozen) rows.push('<p class="m-0 font-semibold text-warning">You can edit until ' + esc(untilText(action.cutoff, tz, now)) + '</p>');
    } else if (isActionable(host, action.weekId)) {
      rows.push('<p class="m-0 text-ink">Due ' + esc(weeklyDate(action.deadline, tz)) + '</p><p class="m-0">Late submission until ' + esc(weeklyDate(action.cutoff, tz)) + '</p>');
    } else if (action.deadline) rows.push('<p class="m-0">Was due ' + esc(weeklyDate(action.deadline, tz)) + '</p>');
    const dates = host.querySelector('[data-weekly-dates]');
    dates.innerHTML = rows.join('');
    dates.hidden = !rows.length;
    const tone = statusTone(state, action.deadline, tz, now), view = stateView(state);
    host.querySelector('[data-weekly-state]').innerHTML = '<span class="' + TONE[tone] + '" data-tone="' + tone + '" data-state="' + esc(state) + '">' + icon(view.icon) + esc(view.text) + '</span>';
    const submit = form && form.dataset.week === action.weekId ? form.querySelector('[type="submit"]') : null;
    if (submit) submit.textContent = latest ? 'Save changes' : 'Submit ' + weekLabel(action.weekId);
  }

  // ---- all logs drawer ----
  function githubList(evidence, timezone) {
    if (evidence && evidence.state === 'available') {
      return evidence.count ? '<ul class="mt-1 list-disc pl-5 text-sm">' + evidence.commits.map(commit => '<li>' + esc(weeklyDate(commit.timestamp, timezone)) + ' | ' + esc(commit.message) + ' | <a class="text-primary underline" href="' + esc(commit.url) + '" target="_blank" rel="noopener noreferrer">' + esc(commit.shortSha) + '</a></li>').join('') + '</ul>'
        : '<p class="text-sm text-ink-2">No qualifying GitHub activity recorded.</p>';
    }
    return '<p class="text-sm text-ink-2">' + esc(evidence && evidence.message || (evidence && evidence.state === 'unmapped' ? 'GitHub username mapping is unavailable.' : 'GitHub activity is unavailable.')) + '</p>';
  }
  function openActivity(trigger) {
    const host = byId('studentWeeklyProgress'), data = host && host.weeklyData;
    if (!data) { getUi().openContentDrawer('All weekly logs', '<p>Logs unavailable. Refresh weekly progress and try again.</p>', trigger); return; }
    const weeks = data.allWeeks || data.weeks, now = Date.parse(data.checkedAt) || Date.now();
    const content = '<p class="text-sm text-muted">' + weeks.length + ' weeks</p>' + weeks.map(week => {
      const future = Date.parse(week.opens) > now;
      const entries = data.history.filter(entry => entry.weekId === week.weekId).slice().reverse();
      const evidence = (data.evidence || []).find(item => item.weekId === week.weekId);
      return '<section class="mt-4 border-t border-edge pt-3"' + (future ? ' data-future' : '') + '><h3 class="m-0 text-base font-semibold">' + esc(weekLabel(week.weekId)) + (future ? ' · Upcoming' : '') + '</h3>' +
        '<p class="mt-1 text-sm text-muted">Opens ' + esc(weeklyDate(week.opens, data.timezone)) + '<br>Deadline ' + esc(weeklyDate(week.deadline, data.timezone)) + '</p>' +
        (entries.length ? entries.map(entry => entry.entryStatus === 'MISSED' ? '<p class="mt-2 text-sm text-danger">Missed</p>' :
          '<details class="mt-2"><summary class="cursor-pointer text-sm font-semibold">' + esc(weeklyDate(entry.recordedAt, data.timezone) + SEP + entry.entryStatus + SEP + entry.timeliness) + '</summary>' +
          '<p class="mt-1 text-sm text-muted">First submitted: ' + esc(weeklyDate(entry.firstSubmittedAt, data.timezone)) + '</p>' +
          FIELDS.map(field => '<h4 class="m-0 mt-2 text-sm font-semibold">' + esc(field[1]) + '</h4><p class="m-0 whitespace-pre-line break-words text-sm">' + esc(entry[field[0]] || '') + '</p>').join('') +
          '<h4 class="m-0 mt-2 text-sm font-semibold">Your GitHub activity</h4>' + githubList(evidence, data.timezone) + '</details>').join('')
          : '<p class="mt-2 text-sm text-muted">' + (future ? 'Not open yet' : 'No submission recorded') + '</p>') + '</section>';
    }).join('');
    getUi().openContentDrawer('All weekly logs', content, trigger);
  }

  // ---- GitHub evidence gate ----
  function hasEvidence(host, weekId) {
    const evidence = (host.weeklyData.evidence || []).find(item => item.weekId === weekId);
    return !!evidence && evidence.state === 'available' && evidence.count > 0;
  }
  function markSelected(host) {
    host.querySelectorAll('[data-weekly-row]').forEach(row => {
      if (row.dataset.week === host.weeklySelectedWeek) row.setAttribute('aria-current', 'true'); else row.removeAttribute('aria-current');
    });
  }
  function renderGithub(host, weekId) {
    const container = host.querySelector('[data-weekly-form]'), parent = container.parentNode;
    let panel = host.querySelector('[data-weekly-github]');
    if (!panel) {
      panel = document.createElement('section'); panel.setAttribute('data-weekly-github', '');
      panel.className = 'mt-4 rounded-card border border-line bg-tint p-4';
    }
    // Keep the gate visible even when its form is hidden; never discard draft text.
    parent.insertBefore(panel, container);
    const data = host.weeklyData, evidence = (data.evidence || []).find(item => item.weekId === weekId);
    const week = data.weeks.find(w => w.weekId === weekId);
    // A closed week with no submission has nothing to gate, so its commit guidance would only mislead.
    panel.hidden = !weekId || (!!week && !isActionable(host, weekId) && !latestSubmission(host, weekId));
    const detail = host.querySelector('[data-weekly-detail]');
    if (detail) detail.hidden = !weekId;
    markSelected(host);
    let header = host.querySelector('[data-weekly-header]');
    if (!header) {
      header = document.createElement('header'); header.setAttribute('data-weekly-header', '');
      header.innerHTML = '<div class="mb-3 xl:hidden"><button type="button" class="inline-flex items-center gap-1 ' + BUTTON + '" data-action="weekly-back">' + icon('chevron-left') + 'All weeks</button></div>' +
        '<div class="flex items-start justify-between gap-3"><div class="min-w-0"><h4 data-weekly-heading class="m-0 text-h1 font-semibold text-ink"></h4><p data-weekly-range class="mt-0.5 text-sm text-muted"></p></div>' +
        '<div data-weekly-state role="status" aria-label="Submission status" class="shrink-0"></div></div>' +
        '<div data-weekly-dates class="mt-3 flex flex-col gap-1 text-sm text-ink-2"></div>';
    }
    parent.insertBefore(header, panel);
    header.hidden = !week;
    if (week) updateFormPresentation(host, host.querySelector('form'), week);
    if (!weekId) return;
    let body = p(esc(evidence && evidence.message || 'GitHub activity is unavailable. Refresh GitHub Activity to retry.'));
    if (evidence && evidence.state === 'unmapped') body = p('Your GitHub username mapping is unavailable or unverified. Complete GitHub setup, then refresh.');
    if (evidence && evidence.state === 'available') {
      body = evidence.count > 0 ? '<details class="group mt-2"><summary class="flex cursor-pointer list-none items-center gap-1 text-sm font-semibold [&::-webkit-details-marker]:hidden"><span class="inline-flex transition-transform group-open:rotate-90">' + icon('chevron-right') + '</span>' + evidence.count + (evidence.count === 1 ? ' commit' : ' commits') + ' this week</summary><ul class="mt-2 list-none p-0 text-sm text-ink-2">' + evidence.commits.map(commit =>
        '<li class="flex flex-wrap gap-2 py-0.5"><time datetime="' + esc(commit.timestamp) + '">' + esc(weeklyDate(commit.timestamp, data.timezone)) + '</time><span>' + esc(commit.message) + '</span><a class="text-primary underline" href="' + esc(commit.url) + '" target="_blank" rel="noopener noreferrer">' + esc(commit.shortSha) + '</a></li>').join('') + '</ul></details>'
        : p('No GitHub activity found for you this week. Commit your project work/evidence to the team repository, then refresh.');
    }
    panel.innerHTML = '<div class="flex items-center justify-between gap-2"><h5 class="m-0 text-sm font-semibold text-ink">Your GitHub activity</h5>' +
      '<button type="button" class="' + ICON_BUTTON + '" data-weekly-github-refresh data-action="github-evidence-refresh" title="Refresh GitHub Activity" aria-label="Refresh GitHub Activity">' + icon('refresh-cw') + '</button></div>' + body;
  }

  // ---- overview: status card and week list ----
  function statusCard(host, data, now) {
    if (!data.ready || !data.weeks.length) return '';
    const tz = data.timezone;
    const next = data.actions.find(a => !latestSubmission(host, a.weekId));
    const editable = data.actions.find(a => latestSubmission(host, a.weekId));
    const missed = data.weeks.filter(w => weekState(host, w) === 'MISSED').length;
    let tone = 'success', glyph = 'check', title, sub, note = '', cta = '';
    if (next) {
      const late = next.state === 'LATE';
      tone = late ? 'danger' : 'warning'; glyph = 'circle-alert';
      title = weekLabel(next.weekId) + (late ? ' is late' : ' is open');
      sub = late ? 'Late submission closes ' + untilText(next.cutoff, tz, now) + '.' : 'Due ' + untilText(next.deadline, tz, now) + '.';
      cta = '<button type="button" class="mt-4 ' + WIDE_PRIMARY + '" data-action="choose-week" data-week="' + esc(next.weekId) + '">Submit ' + esc(weekLabel(next.weekId)) + '</button>';
    } else {
      title = missed ? 'Nothing due right now' : "You're up to date";
      sub = missed ? missed + (missed === 1 ? ' earlier week was missed.' : ' earlier weeks were missed.') : 'Every week so far is submitted.';
      if (editable) {
        note = '<p class="mt-4 ' + NOTE + '">' + icon('clock') + '<span>' + esc(weekLabel(editable.weekId)) + ' can still be edited until ' + esc(untilText(editable.cutoff, tz, now)) + '.</span></p>';
        cta = '<button type="button" class="mt-4 ' + WIDE_PRIMARY + '" data-action="edit-week" data-week="' + esc(editable.weekId) + '">Edit ' + esc(weekLabel(editable.weekId)) + '</button>';
      }
    }
    return '<section data-weekly-status-card data-tone="' + tone + '" class="' + CARD + ' p-5" aria-label="Weekly status"><div class="flex items-center gap-3"><span class="' + CIRCLE + 'size-12 ' + CIRCLE_TONE[tone] + '">' + icon(glyph, null, 'size-6') + '</span>' +
      '<div class="min-w-0"><h3 class="m-0 text-hero font-semibold text-ink">' + esc(title) + '</h3><p class="m-0 text-sm text-muted">' + esc(sub) + '</p></div></div>' + note + cta + '</section>';
  }
  function weekRow(host, data, week, now) {
    const state = weekState(host, week), latest = latestSubmission(host, week.weekId), view = stateView(state), tz = data.timezone;
    const tone = statusTone(state, week.deadline, tz, now);
    const parts = [];
    if (latest) {
      parts.push(view.text, shortDate(latest.firstSubmittedAt || latest.recordedAt, tz));
      if (latest.entryStatus === 'REVISED') parts.push('edited');
    } else if (state === 'OPEN') parts.push('Not submitted', week.deadline ? 'due ' + shortDate(week.deadline, tz) : '');
    else if (state === 'LATE') parts.push('Late', week.cutoff ? 'closes ' + shortDate(week.cutoff, tz) : '');
    else parts.push(view.text);
    return '<li><button type="button" class="' + ROW + '" data-weekly-row data-action="choose-week" data-week="' + esc(week.weekId) + '">' +
      '<span class="' + CIRCLE + 'size-9 ' + CIRCLE_TONE[tone] + '">' + icon(view.icon) + '</span>' +
      '<span class="min-w-0 flex-1"><span class="block font-semibold text-ink">' + esc(weekLabel(week.weekId)) + '</span><span class="block text-sm text-muted">' + esc(parts.filter(Boolean).join(SEP)) + '</span></span>' +
      '<span class="text-muted">' + icon('chevron-right') + '</span></button></li>';
  }
  function overviewMarkup(host, data) {
    const now = nowOf(data), list = data.weeks.slice().reverse();
    const message = data.message && (!data.ready || !data.weeks.length) ? '<p class="m-0 text-sm text-ink-2 ' + CARD + ' p-5">' + esc(data.message) + '</p>' : '';
    const weeks = list.length ? '<section aria-labelledby="weeklyListHeading"><h3 id="weeklyListHeading" class="m-0 mb-2 px-1 text-sm font-semibold text-ink-2">Your weeks</h3>' +
      '<ul class="m-0 list-none divide-y divide-edge overflow-hidden p-0 ' + CARD + '">' + list.map(week => weekRow(host, data, week, now)).join('') + '</ul>' +
      '<div class="mt-3"><button type="button" class="' + BUTTON + '" data-action="open-logs">View all weekly logs</button></div></section>' : '';
    return '<div class="flex flex-col gap-4">' + message + statusCard(host, data, now) + weeks + '</div>';
  }
  function bind(host) {
    if (!delegated.has(host)) { delegated.add(host); host.addEventListener('click', onClick); host.addEventListener('submit', onSubmit); host.addEventListener('input', onInput); }
  }
  function load() {
    const host = byId('studentWeeklyProgress');
    if (!host || host.weeklyBusy || host.weeklySaving) return;
    bind(host);
    const target = host.querySelector('[data-weekly-read]'), status = host.querySelector('[data-weekly-status]');
    const buttons = host.querySelectorAll('[data-weekly-refresh], [data-weekly-github-refresh]');
    host.weeklyBusy = true; buttons.forEach(button => { button.disabled = true; });
    const finish = getUi().beginContentLoading(host, 'Refreshing weekly progress', {compact:true});
    function settle() { finish(); host.weeklyBusy = false; buttons.forEach(button => { button.disabled = false; }); }
    bridge.read('student-weekly', 'API_student_getWeekly', [], {timeoutMs:60000}).then(function(data) {
      settle();
      if (!host.isConnected || byId('studentWeeklyProgress') !== host) return;
      if (host.weeklyRefreshError) {
        if (status.textContent === host.weeklyRefreshError) status.textContent = '';
        host.weeklyRefreshError = null;
      }
      host.weeklyData = data;
      target.innerHTML = overviewMarkup(host, data);
      const formContainer = host.querySelector('[data-weekly-form]');
      const form = host.querySelector('form');
      const selectedWeek = host.weeklySelectedWeek || form?.dataset.week || (data.actions.find(a => a.state === 'OPEN') || data.actions[0] || data.weeks.slice(-1)[0])?.weekId || (data.evidence || []).slice(-1)[0]?.weekId;
      host.weeklySelectedWeek = selectedWeek;
      const gated = hasEvidence(host, selectedWeek);
      formContainer.hidden = !data.ready || !gated;
      const action = data.actions.find(a => a.weekId === selectedWeek);
      const week = data.weeks.find(a => a.weekId === selectedWeek);
      if (form && form.dataset.week === selectedWeek) {
        const stillAllowed = data.ready && gated && !!action;
        Array.from(form.elements).forEach(el => { el.disabled = !stillAllowed; });
        if (week) updateFormPresentation(host, form, week);
        form.querySelector('[type="submit"]').hidden = !stillAllowed;
        const cancel = form.querySelector('[data-weekly-cancel]'); if (cancel) cancel.disabled = false;
        if (!action && gated) status.textContent = 'This action is no longer available. Your unsaved text is retained. Choose an available week to continue.';
      } else if (action || week) {
        renderForm(host, action || week);
      }
      renderGithub(host, selectedWeek);
    }).catch(function(error) {
      if (error && error.superseded) { settle(); return; }
      settle();
      if (host.isConnected && byId('studentWeeklyProgress') === host) {
        host.weeklyRefreshError = 'Could not refresh weekly progress: ' + errorMessage(error) + '. Use Refresh weekly progress to retry.';
        status.textContent = host.weeklyRefreshError;
      }
    });
  }

  // ---- detail: summary and form ----
  function renderForm(host, action, editing) {
    host.weeklySelectedWeek = action.weekId;
    const container = host.querySelector('[data-weekly-form]');
    const saved = latestSubmission(host, action.weekId);
    if (saved && !editing) {
      const editable = host.weeklyData.ready && hasEvidence(host, action.weekId) && isActionable(host, action.weekId);
      container.hidden = false;
      container.innerHTML = '<div data-submission-summary class="mt-4 divide-y divide-edge">' + FIELDS.map(field => '<section class="py-3 first:pt-0"><h5 class="m-0 text-sm font-semibold text-ink">' + esc(field[1]) + '</h5><p class="m-0 mt-1 whitespace-pre-line break-words text-body text-ink">' + esc(saved[field[0]] || '') + '</p></section>').join('') + '</div>' +
        (editable ? '<div class="mt-2 flex justify-end"><button type="button" class="' + PRIMARY + '" data-weekly-edit data-action="edit-submission">Edit submission</button></div>' : '');
      renderGithub(host, action.weekId);
      return;
    }
    if (!saved && !isActionable(host, action.weekId)) {
      container.hidden = false;
      container.innerHTML = '<p class="m-0 mt-4 text-sm text-ink-2">No submission was recorded for this week.</p>';
      renderGithub(host, action.weekId);
      return;
    }
    container.hidden = !host.weeklyData.ready || !hasEvidence(host, action.weekId);
    if (container.hidden) {
      const form = host.querySelector('form');
      if (form) Array.from(form.elements).forEach(el => { el.disabled = true; });
      renderGithub(host, action.weekId);
      return;
    }
    const data = host.weeklyData;
    const latest = data.history.filter(r => r.weekId === action.weekId && r.entryStatus !== 'MISSED').slice(-1)[0] || {};
    container.innerHTML = '<form class="mt-5 flex flex-col gap-5" data-week="' + esc(action.weekId) + '">' +
      FIELDS.map(function(field) { return '<div class="flex flex-col gap-1"><label class="text-sm font-semibold text-ink" for="weekly-' + field[0] + '">' + esc(field[1]) + ' <span aria-hidden="true">*</span></label><p id="weekly-hint-' + field[0] + '" class="m-0 text-xs text-muted">' + esc(field[2]) + '</p><textarea class="' + FIELD + '" id="weekly-' + field[0] + '" name="' + field[0] + '" rows="4" required maxlength="10000" aria-describedby="weekly-hint-' + field[0] + '">' + esc(latest[field[0]] || '') + '</textarea></div>'; }).join('') +
      '<div class="' + ACTIONS + '"><span data-weekly-dirty hidden class="mr-auto text-xs font-semibold text-warning">Unsaved changes</span>' +
      (saved ? '<button type="button" class="' + BUTTON + '" data-weekly-cancel data-action="cancel-edit">Cancel</button>' : '') + '<button type="submit" class="' + PRIMARY + '"></button></div></form>';
    renderGithub(host, action.weekId);
  }
  function editSubmission(button) {
    const host = button.closest('#studentWeeklyProgress');
    if (!host || host.weeklyBusy || host.weeklySaving) return;
    const action = host.weeklyData.actions.find(a => a.weekId === host.weeklySelectedWeek);
    if (!action || !host.weeklyData.ready || !hasEvidence(host, action.weekId)) return;
    renderForm(host, action, true);
    host.querySelector('textarea')?.focus();
  }
  async function cancelEdit(button) {
    const host = button.closest('#studentWeeklyProgress'), form = host?.querySelector('form');
    if (!form || host.weeklyBusy || host.weeklySaving) return;
    const saved = latestSubmission(host, form.dataset.week);
    const changed = FIELDS.some(field => form.elements[field[0]].value !== (saved?.[field[0]] || ''));
    if (changed && !await getUi().ask('Discard unsaved changes to this weekly submission?')) return;
    if (!host.isConnected || host.weeklyBusy || host.weeklySaving || host.querySelector('form') !== form) return;
    const week = host.weeklyData.weeks.find(w => w.weekId === form.dataset.week);
    if (week) { renderForm(host, week); host.querySelector('[data-weekly-edit]')?.focus(); }
  }
  /** Opens a week from the list or the status card; `edit` goes straight to the form of a saved week. */
  async function chooseWeek(button, edit) {
    const host = byId('studentWeeklyProgress');
    if (!host || host.weeklyBusy || host.weeklySaving) return;
    const week = host.weeklyData.weeks.find(w => w.weekId === button.dataset.week);
    if (!week) return;
    const action = host.weeklyData.actions.find(a => a.weekId === week.weekId);
    const form = host.querySelector('form');
    const sameWeek = !!form && form.dataset.week === week.weekId && host.weeklySelectedWeek === week.weekId;
    if (!sameWeek && form && form.weeklyDirty && !await getUi().ask('Discard unsaved weekly text and open the selected week?')) return;
    if (!host.isConnected || host.weeklySaving) return;
    setView(host, 'detail');
    if (!sameWeek) renderForm(host, action || week, !!edit && !!action && !!latestSubmission(host, week.weekId) && host.weeklyData.ready && hasEvidence(host, week.weekId));
    else markSelected(host);
    if (edit) host.querySelector('textarea')?.focus();
  }
  function submit(event, form) {
    event.preventDefault();
    const host = form.closest('#studentWeeklyProgress');
    if (host.weeklySaving || host.weeklyBusy || !hasEvidence(host, form.dataset.week) || !host.weeklyData.actions.some(a => a.weekId === form.dataset.week) || !form.reportValidity()) return;
    const input = {};
    FIELDS.forEach(field => { input[field[0]] = form.elements[field[0]].value; });
    input.weekId = form.dataset.week;
    const content = JSON.stringify(input);
    if (!form.weeklyRequest || form.weeklyRequest.content !== content) form.weeklyRequest = {content:content, id:crypto.randomUUID()};
    input.requestId = form.weeklyRequest.id;
    host.weeklySaving = true;
    Array.from(form.elements).forEach(el => { el.disabled = true; });
    const status = host.querySelector('[data-weekly-status]');
    const stopBusy = getUi().busy.write(status, 'Saving weekly progress…');
    function settle() { stopBusy(); host.weeklySaving = false; Array.from(form.elements).forEach(el => { el.disabled = false; }); }
    bridge.write('API_student_submitWeekly', [input]).then(function(result) {
      settle();
      if (!host.isConnected) return;
      form.weeklyDirty = false; form.weeklyRequest = null;
      status.textContent = result.message + ' ' + weekLabel(result.weekId) + SEP + (result.timeliness === 'ON_TIME' ? 'On time' : 'Late');
      const saved = {...latestSubmission(host, input.weekId), ...input, ...result};
      host.weeklyData.history.push(saved);
      const week = host.weeklyData.weeks.find(w => w.weekId === input.weekId);
      if (week) renderForm(host, week);
      load();
    }, function(error) {
      settle();
      if (host.isConnected) status.textContent = errorMessage(error) + ' Your text is retained; retry when ready.';
    });
  }

  function onClick(event) {
    const target = event.target.closest ? event.target.closest('[data-action]') : null;
    if (!target || target.disabled) return;
    const action = target.getAttribute('data-action');
    // The returned promise lets callers (and tests) wait for confirmation dialogs.
    if (action === 'choose-week') return chooseWeek(target, false);
    if (action === 'edit-week') return chooseWeek(target, true);
    if (action === 'edit-submission') return editSubmission(target);
    if (action === 'cancel-edit') return cancelEdit(target);
    if (action === 'github-evidence-refresh') return load();
    if (action === 'weekly-back') { const host = target.closest('#studentWeeklyProgress'); if (host) setView(host, 'list'); return; }
    if (action === 'open-logs') return openActivity(target);
  }
  function onSubmit(event) {
    const form = event.target.closest ? event.target.closest('form[data-week]') : null;
    if (form) submit(event, form);
  }
  function onInput(event) {
    const form = event.target.closest ? event.target.closest('form[data-week]') : null;
    if (!form) return;
    form.weeklyDirty = true;
    const marker = form.querySelector('[data-weekly-dirty]'); if (marker) marker.hidden = false;
  }

  return {load, openActivity, statusTone, weekLabel};
}
