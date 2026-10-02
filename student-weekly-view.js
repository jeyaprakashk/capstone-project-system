/**
 * STUDENT WEEKLY VIEW — browser module serialized into the dashboard shell as `StudentWeekly`.
 * Owns the weekly-progress panel inside the Student dashboard (#studentWeeklyProgress), the Recent logs
 * list (#studentRecentActivity) and the "All weekly logs" drawer. Reads and saves go through the data
 * bridge (API_student_getWeekly / API_student_submitWeekly); markup uses Tailwind utilities and
 * delegated events. Panel state lives on the host element so a re-rendered dashboard starts clean.
 */
function studentWeeklyViewBrowser_(bridge, getUi) {
  'use strict';
  const FIELDS = [
    ['workCompleted', 'Work Completed', 'Built, tested, learned — share your progress.'],
    ['guideDiscussion', 'Guide Discussion/Decision', 'What did you discuss or decide?'],
    ['blockers', 'Problems/Blockers', 'Need help? Add it here. Otherwise, write None.'],
    ['nextAction', 'Next Week Plan', 'Your next few steps. Keep it specific.']
  ];
  const SEP = ' ' + String.fromCharCode(183) + ' ';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const byId = id => document.getElementById(id);
  const icon = (name, label) => getUi().renderIcon(name, label);
  const errorMessage = err => typeof err === 'string' && err.trim() ? err.trim() : err && typeof err.message === 'string' && err.message.trim() ? err.message.trim() : 'The server did not provide error details';

  const BUTTON = 'border-0 rounded-md bg-paper px-3 py-1.5 text-sm font-semibold text-ink ring-1 ring-inset ring-line hover:bg-tint disabled:opacity-50';
  const PRIMARY = 'border-0 rounded-md bg-primary px-4 py-2 text-sm font-semibold text-paper hover:bg-primary-hover disabled:opacity-50';
  const BADGE = 'inline-flex items-center rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ';
  const TONE = {
    success:BADGE + 'bg-success-tint text-success ring-success/20', warning:BADGE + 'bg-warning-tint text-warning ring-warning/20',
    danger:BADGE + 'bg-danger-tint text-danger ring-danger/20'
  };
  const FIELD = 'mt-1 block w-full rounded-md border border-control px-3 py-2 text-sm';
  const p = (html, extra) => '<p class="mt-2 text-sm ' + (extra || 'text-ink-2') + '">' + html + '</p>';

  function weeklyDate(value, timezone) {
    return value ? new Date(value).toLocaleString('en-IN', {timeZone:timezone, day:'numeric', month:'short', hour:'numeric', minute:'2-digit', hour12:true, timeZoneName:'short'}).replace('Sept', 'Sep').replace('am', 'AM').replace('pm', 'PM') : 'Not submitted';
  }
  function weekLabel(weekId) {
    const match = String(weekId).match(/[0-9]+$/);
    return match ? 'Week ' + match[0].padStart(2, '0') : String(weekId);
  }
  function heading(host, action) {
    const label = weekLabel(action.weekId);
    if (!action.opens) return label;
    const shortDate = value => new Date(value).toLocaleDateString('en-GB', {timeZone:host.weeklyData.timezone, day:'numeric', month:'short'}).replace('Sept', 'Sep');
    return label + SEP + shortDate(action.opens) + ' ' + String.fromCharCode(8211) + ' ' + shortDate(action.deadline);
  }
  function stateLabel(week, timezone) {
    if (week.guideFrozen) return week.state + SEP + 'Guide confirmed; further revisions are frozen';
    if (week.state === 'OPEN') return 'OPEN' + SEP + 'Not submitted';
    if (week.state === 'LATE') return 'LATE' + SEP + 'Submission available until ' + weeklyDate(week.cutoff, timezone);
    return week.state;
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
  function updateFormPresentation(host, form, action, saved) {
    const data = host.weeklyData;
    const latest = saved || data.history.filter(r => r.weekId === action.weekId && r.entryStatus !== 'MISSED').slice(-1)[0];
    const state = latest ? (latest.timeliness === 'ON_TIME' ? 'SUBMITTED ON TIME' : 'SUBMITTED LATE') : action.state;
    const label = stateLabel({...action, state}, data.timezone);
    host.querySelector('[data-weekly-heading]').textContent = heading(host, action);
    const dates = host.querySelector('[data-weekly-dates]');
    dates.innerHTML = '<span class="mr-3">Due ' + esc(weeklyDate(action.deadline, data.timezone)) + '</span><span>Late submission until ' + esc(weeklyDate(action.cutoff, data.timezone)) + '</span>';
    dates.hidden = !dates.textContent;
    const tone = statusTone(state, action.deadline, data.timezone, data.checkedAt ? Date.parse(data.checkedAt) : Date.now());
    host.querySelector('[data-weekly-state]').innerHTML = '<span class="' + TONE[tone] + '" data-tone="' + tone + '" data-state="' + esc(state) + '">' + esc(label) + '</span>';
    if (form && form.dataset.week === action.weekId) form.querySelector('[type="submit"]').textContent = (latest ? 'Update ' : 'Submit ') + weekLabel(action.weekId) + ' Progress';
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
  function renderGithub(host, weekId) {
    let panel = host.querySelector('[data-weekly-github]');
    if (!panel) {
      panel = document.createElement('section'); panel.setAttribute('data-weekly-github', '');
      panel.className = 'mt-3 rounded-lg border border-edge bg-canvas p-3';
    }
    // Keep the gate visible even when its form is hidden; never discard draft text.
    host.insertBefore(panel, host.querySelector('[data-weekly-form]'));
    const data = host.weeklyData, evidence = (data.evidence || []).find(item => item.weekId === weekId);
    panel.hidden = !weekId;
    let header = host.querySelector('[data-weekly-header]');
    if (!header) {
      header = document.createElement('header'); header.className = 'mt-3'; header.setAttribute('data-weekly-header', '');
      header.innerHTML = '<h4 data-weekly-heading class="m-0 text-base font-semibold text-ink"></h4><div data-weekly-state role="status" aria-label="Submission status" class="mt-1"></div><p data-weekly-dates class="mt-1 text-sm text-muted"></p>';
    }
    host.insertBefore(header, panel);
    const week = data.weeks.find(w => w.weekId === weekId);
    header.hidden = !week;
    if (week) updateFormPresentation(host, host.querySelector('form'), week);
    if (!weekId) return;
    let body = p(esc(evidence && evidence.message || 'GitHub activity is unavailable. Refresh GitHub Activity to retry.'));
    if (evidence && evidence.state === 'unmapped') body = p('Your GitHub username mapping is unavailable or unverified. Complete GitHub setup, then refresh.');
    if (evidence && evidence.state === 'available') {
      body = evidence.count > 0 ? '<details class="mt-2"><summary class="cursor-pointer text-sm font-semibold">' + evidence.count + (evidence.count === 1 ? ' commit' : ' commits') + ' this week</summary><ul class="mt-1 list-none p-0 text-sm">' + evidence.commits.map(commit =>
        '<li class="flex flex-wrap gap-2 py-0.5"><time datetime="' + esc(commit.timestamp) + '">' + esc(weeklyDate(commit.timestamp, data.timezone)) + '</time><span>' + esc(commit.message) + '</span><a class="text-primary underline" href="' + esc(commit.url) + '" target="_blank" rel="noopener noreferrer">' + esc(commit.shortSha) + '</a></li>').join('') + '</ul></details>'
        : p('No GitHub activity found for you this week. Commit your project work/evidence to the team repository, then refresh.');
    }
    panel.innerHTML = '<div class="flex items-center justify-between gap-2"><h5 class="m-0 text-sm font-semibold text-ink">Your GitHub activity' + SEP + esc(weekLabel(weekId)) + '</h5>' +
      '<button type="button" class="' + BUTTON + '" data-weekly-github-refresh data-action="github-evidence-refresh" title="Refresh GitHub Activity" aria-label="Refresh GitHub Activity">' + icon('refresh-cw') + '</button></div>' + body;
  }

  // ---- read ----
  function recentMarkup(data) {
    const latest = new Map();
    data.history.slice().reverse().forEach(entry => { if (!latest.has(entry.weekId)) latest.set(entry.weekId, entry); });
    return Array.from(latest.values()).slice(0, 3).map(entry => '<div data-activity-row class="flex flex-wrap items-baseline gap-2 border-b border-edge py-1.5 text-sm"><strong>' + esc(weekLabel(entry.weekId)) + '</strong><span>' +
      esc(entry.entryStatus === 'MISSED' ? 'Missed' : entry.timeliness === 'ON_TIME' ? 'Submitted on time' : 'Submitted late') + '</span><time class="text-xs text-muted">' + esc(weeklyDate(entry.recordedAt, data.timezone)) + '</time></div>').join('') || '<p class="text-sm text-muted">No weekly submissions yet.</p>';
  }
  function bind(host) {
    host.onclick = onClick;
    host.onsubmit = onSubmit;
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
      const recent = byId('studentRecentActivity');
      if (recent) recent.innerHTML = recentMarkup(data);
      target.innerHTML = (data.message && (!data.ready || !data.weeks.length) ? p(esc(data.message)) : '') +
        data.weeks.filter(week => week.weekId !== host.querySelector('form')?.dataset.week && !data.actions.some(action => action.weekId === week.weekId)).map(function(week) {
          return p(esc(weekLabel(week.weekId) + SEP + stateLabel(week, data.timezone)));
        }).join('') + (data.actions.length > 1 ? '<nav aria-label="Choose progress week" class="mt-2 flex flex-wrap gap-2">' +
        data.actions.map(function(action) { return '<button type="button" class="' + BUTTON + '" data-week="' + esc(action.weekId) + '" data-action="choose-week">' + esc(weekLabel(action.weekId)) + '</button>'; }).join(' ') + '</nav>' : '');
      const formContainer = host.querySelector('[data-weekly-form]');
      const form = host.querySelector('form');
      const selectedWeek = host.weeklySelectedWeek || form?.dataset.week || (data.actions.find(a => a.state === 'OPEN') || data.actions[0] || data.weeks.slice(-1)[0])?.weekId || (data.evidence || []).slice(-1)[0]?.weekId;
      host.weeklySelectedWeek = selectedWeek;
      const gated = hasEvidence(host, selectedWeek);
      formContainer.hidden = !data.ready || !gated;
      const action = data.actions.find(a => a.weekId === selectedWeek);
      if (form && form.dataset.week === selectedWeek) {
        const stillAllowed = data.ready && gated && !!action;
        Array.from(form.elements).forEach(el => { el.disabled = !stillAllowed; });
        const week = data.weeks.find(a => a.weekId === selectedWeek);
        if (week) updateFormPresentation(host, form, week);
        form.querySelector('[type="submit"]').hidden = !stillAllowed;
        const cancel = form.querySelector('[data-weekly-cancel]'); if (cancel) cancel.disabled = false;
        if (!action && gated) status.textContent = 'This action is no longer available. Your unsaved text is retained. Choose an available week to continue.';
      } else if (action || (latestSubmission(host, selectedWeek) && data.weeks.some(w => w.weekId === selectedWeek))) {
        renderForm(host, action || data.weeks.find(w => w.weekId === selectedWeek));
      }
      renderGithub(host, selectedWeek);
    }).catch(function(error) {
      if (error && error.superseded) { settle(); return; }
      settle();
      if (host.isConnected && byId('studentWeeklyProgress') === host) {
        const recent = byId('studentRecentActivity');
        if (recent && !host.weeklyData) recent.innerHTML = '<p class="text-sm text-muted">Logs unavailable. Refresh weekly progress to retry.</p>';
        host.weeklyRefreshError = 'Could not refresh weekly progress: ' + errorMessage(error) + '. Use Refresh weekly progress to retry.';
        status.textContent = host.weeklyRefreshError;
      }
    });
  }

  // ---- form ----
  function latestSubmission(host, weekId) {
    return host.weeklyData.history.filter(r => r.weekId === weekId && r.entryStatus !== 'MISSED').slice(-1)[0];
  }
  function renderForm(host, action, editing) {
    host.weeklySelectedWeek = action.weekId;
    const container = host.querySelector('[data-weekly-form]');
    const saved = latestSubmission(host, action.weekId);
    if (saved && !editing) {
      const editable = host.weeklyData.ready && hasEvidence(host, action.weekId) && host.weeklyData.actions.some(a => a.weekId === action.weekId);
      container.hidden = false;
      container.innerHTML = '<div data-submission-summary class="mt-3">' + FIELDS.map(field => '<section class="mt-2"><h5 class="m-0 text-sm font-semibold text-ink">' + esc(field[1]) + '</h5><p class="m-0 whitespace-pre-line break-words text-sm text-ink-2">' + esc(saved[field[0]] || '') + '</p></section>').join('') + '</div>' +
        (editable ? '<div class="mt-3"><button type="button" class="' + BUTTON + '" data-weekly-edit data-action="edit-submission">Edit submission</button></div>' : '');
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
    container.innerHTML = '<form class="mt-3 flex flex-col gap-3" data-week="' + esc(action.weekId) + '">' +
      FIELDS.map(function(field) { return '<div><label class="text-sm font-semibold text-ink" for="weekly-' + field[0] + '">' + esc(field[1]) + ' <span aria-hidden="true">*</span></label><textarea class="' + FIELD + '" id="weekly-' + field[0] + '" name="' + field[0] + '" rows="3" required maxlength="10000" placeholder="' + esc(field[2]) + '">' + esc(latest[field[0]] || '') + '</textarea></div>'; }).join('') +
      '<div class="flex flex-wrap items-center gap-2"><button type="submit" class="' + PRIMARY + '"></button>' + (saved ? '<button type="button" class="' + BUTTON + '" data-weekly-cancel data-action="cancel-edit">Cancel</button>' : '') + '</div></form>';
    renderGithub(host, action.weekId);
    host.querySelector('form').addEventListener('input', function() { this.weeklyDirty = true; });
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
  async function chooseWeek(button) {
    const host = byId('studentWeeklyProgress');
    if (!host || host.weeklyBusy || host.weeklySaving) return;
    const action = host.weeklyData.actions.find(a => a.weekId === button.dataset.week);
    if (!action) return;
    const form = host.querySelector('form');
    if (form && form.dataset.week === action.weekId && host.weeklySelectedWeek === action.weekId) return;
    if (form && form.weeklyDirty && !await getUi().ask('Discard unsaved weekly text and open the selected week?')) return;
    if (!host.isConnected || host.weeklySaving) return;
    renderForm(host, action);
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
    status.textContent = 'Saving weekly progress...';
    function settle() { host.weeklySaving = false; Array.from(form.elements).forEach(el => { el.disabled = false; }); }
    bridge.write('API_student_submitWeekly', [input]).then(function(result) {
      settle();
      if (!host.isConnected) return;
      form.weeklyDirty = false; form.weeklyRequest = null;
      status.textContent = result.message + ' ' + weekLabel(result.weekId) + SEP + result.entryStatus + SEP + result.timeliness;
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
    if (action === 'choose-week') return chooseWeek(target);
    if (action === 'edit-submission') return editSubmission(target);
    if (action === 'cancel-edit') return cancelEdit(target);
    if (action === 'github-evidence-refresh') return load();
  }
  function onSubmit(event) {
    const form = event.target.closest ? event.target.closest('form[data-week]') : null;
    if (form) submit(event, form);
  }

  return {load, openActivity, statusTone, weekLabel};
}
