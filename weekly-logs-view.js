/**
 * WEEKLY LOGS VIEW — browser module serialized into the dashboard shell as `WeeklyLogsView`.
 * Renders the "All weekly logs" drawer: every week of the semester with its dates, each submission (status, time, the
 * four answers) and the GitHub activity for the week. The Student dashboard (the student's own logs) and the Guide
 * Evaluation (one student's logs) both use it, so the drawer looks the same for both. It reads no server data: callers
 * map their own DTO to the model below and the drawer is opened through the shared DashboardUI drawer.
 *
 * model = {title, timezone, now (ms), evidenceTitle, weeks: [{weekId, opens, deadline, entries, evidence}]}
 *   entries: newest first; {aiScore? (0-10, or null for "not scored yet"; the line is left out when it is undefined), entryStatus, timeliness, recordedAt, firstSubmittedAt, workCompleted, guideDiscussion, blockers, nextAction}
 *   evidence: {state, message, commits: [{timestamp, message, shortSha, url}], count?} or undefined
 */
function weeklyLogsViewBrowser_(getUi) {
  'use strict';
  const FIELDS = [['workCompleted', 'Work Completed'], ['guideDiscussion', 'Guide Discussion/Decision'], ['blockers', 'Problems/Blockers'], ['nextAction', 'Next Week Plan']];
  // Five AI ratings, each worth 0 to 2 points (weekly-progress-phase2.js).
  const AI_SCORE_MAX = 10;
  const SEP = ' ' + String.fromCharCode(183) + ' ';
  const esc = value => String(value ?? '').replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const FORMAT = {day:'numeric', month:'short', hour:'numeric', minute:'2-digit', hour12:true};
  const tidy = text => text.replace('Sept', 'Sep').replace(/\b([ap])m\b/, (m, c) => c.toUpperCase() + 'M');
  function weeklyDate(value, timezone) {
    return value ? tidy(new Date(value).toLocaleString('en-IN', {timeZone:timezone, ...FORMAT, timeZoneName:'short'})) : 'Not submitted';
  }
  function weekLabel(weekId) {
    const match = String(weekId).match(/[0-9]+$/);
    return match ? 'Week ' + match[0].padStart(2, '0') : String(weekId);
  }
  function githubList(evidence, timezone) {
    if (evidence && evidence.state === 'available') {
      const count = evidence.count === undefined ? evidence.commits.length : evidence.count;
      return count ? '<ul class="mt-1 list-disc pl-5 text-sm">' + evidence.commits.map(commit => '<li>' + esc(weeklyDate(commit.timestamp, timezone)) + ' | ' + esc(commit.message) + ' | <a class="text-primary underline" href="' + esc(commit.url) + '" target="_blank" rel="noopener noreferrer">' + esc(commit.shortSha) + '</a></li>').join('') + '</ul>'
        : '<p class="text-sm text-ink-2">No qualifying GitHub activity recorded.</p>';
    }
    return '<p class="text-sm text-ink-2">' + esc(evidence && evidence.message || (evidence && evidence.state === 'unmapped' ? 'GitHub username mapping is unavailable.' : 'GitHub activity is unavailable.')) + '</p>';
  }
  /** The drawer body for a model. Every interpolated value is escaped. */
  function markup(model) {
    const weeks = model.weeks, now = model.now || Date.now(), timezone = model.timezone;
    return '<p class="text-sm text-muted">' + weeks.length + ' weeks</p>' + weeks.map(week => {
      const future = Date.parse(week.opens) > now;
      return '<section class="mt-4 border-t border-edge pt-3"' + (future ? ' data-future' : '') + '><h3 class="m-0 text-base font-semibold">' + esc(weekLabel(week.weekId)) + (future ? ' · Upcoming' : '') + '</h3>' +
        '<p class="mt-1 text-sm text-muted">Opens ' + esc(weeklyDate(week.opens, timezone)) + '<br>Deadline ' + esc(weeklyDate(week.deadline, timezone)) + '</p>' +
        (week.entries.length ? week.entries.map(entry => entry.entryStatus === 'MISSED' ? '<p class="mt-2 text-sm text-danger">Missed</p>' :
          '<details class="mt-2"><summary class="cursor-pointer text-sm font-semibold">' + esc(weeklyDate(entry.recordedAt, timezone) + SEP + entry.entryStatus + SEP + entry.timeliness) + '</summary>' +
          '<p class="mt-1 text-sm text-muted">First submitted: ' + esc(weeklyDate(entry.firstSubmittedAt, timezone)) + '</p>' +
          (entry.aiScore !== undefined ? '<p class="mt-1 text-sm text-muted">AI score: ' + (entry.aiScore === null ? '—' : esc(entry.aiScore) + ' / ' + AI_SCORE_MAX) + '</p>' : '') +
          FIELDS.map(field => '<h4 class="m-0 mt-2 text-sm font-semibold">' + esc(field[1]) + '</h4><p class="m-0 whitespace-pre-line break-words text-sm">' + esc(entry[field[0]] || '') + '</p>').join('') +
          '<h4 class="m-0 mt-2 text-sm font-semibold">' + esc(model.evidenceTitle) + '</h4>' + githubList(week.evidence, timezone) + '</details>').join('')
          : '<p class="mt-2 text-sm text-muted">' + (future ? 'Not open yet' : 'No submission recorded') + '</p>') + '</section>';
    }).join('');
  }
  function open(model, trigger) {
    getUi().openContentDrawer(model.title, markup(model), trigger);
  }
  /** The drawer when there is nothing to show yet (for example the data is still loading). */
  function openMessage(title, text, trigger) {
    getUi().openContentDrawer(title, '<p>' + esc(text) + '</p>', trigger);
  }
  return {markup, open, openMessage, AI_SCORE_MAX, weeklyDate, weekLabel, tidy, FORMAT, esc};
}
