// Coordinator dashboard migration: the DTO must carry every fact the server-rendered stats and tracker showed.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const { expectGolden } = require('./invariants/golden.cjs');
const { coordinatorFixture } = require('./coordinator-fixture.cjs');

const text = n => n.textContent.replace(/\s+/g, ' ').trim();
const LOADING = 'loading';
const TITLE_BADGE = { APPROVED: 'Approved', NEEDS_REVIEW: 'Review', REJECTED_BY_GUIDE: 'Rejected' };
const HEALTH_LABEL = { ontrack: 'On track', monitor: 'Monitor' };
const isLoading = value => /^loading/i.test(value || '');

// Facts the stats grid and tracker show, derived from the DTO the way the view presents them.
function dtoFacts(dto) {
  const s = dto.stats, total = s.total, loading = dto.loading;
  const pct = n => total > 0 ? Math.round(n / total * 100) : 0;
  const tone = (value, color, note) => {
    if (!total || typeof value !== 'number' || /unavailable/i.test(note)) return 'neutral';
    const remaining = color === 'red' ? value : total - value;
    return remaining <= 0 ? 'complete' : remaining / total >= .6 ? 'danger' : remaining / total >= .3 ? 'warning' : 'neutral';
  };
  const card = (label, value, color, note, detail, progress) => ({ label, value: value === LOADING ? LOADING : String(value), note: note === LOADING ? LOADING : note, detail, tone: tone(value, color, note === LOADING ? '' : note), progress: !!progress });
  const cards = [
    card('Total Teams', total, 'blue', 'Teams Roster', '● Teams registered'),
    card('Repositories Available', s.reposReady, 'purple', pct(s.reposReady) + '% linked', s.reposReady + ' / ' + total + ' recorded' + Math.max(0, total - s.reposReady) + ' missing'),
    card('Title Approved', s.titleApproved, 'green', pct(s.titleApproved) + '% validated', s.titleApproved + ' approved' + Math.max(0, total - s.titleApproved) + ' pending approval'),
    card('Active This Week', LOADING, 'orange', LOADING, 'Weekly repository activity', false),
    ...s.reviews.map(r => {
      const value = loading ? LOADING : r.known ? r.completed : '—';
      const note = loading ? '' : !r.known ? 'Unavailable' : r.unavailable ? r.unavailable + ' unavailable' : pct(r.completed) + '% (' + r.completed + '/' + total + ')';
      return card(r.label + ' Completed', value, 'teal', note, 'Team review completion', true);
    }),
    card('Guide Evaluation Completed', loading ? LOADING : s.guideEvaluation && s.guideEvaluation.available ? s.guideEvaluation.completed : '—', 'teal',
      loading ? '' : s.guideEvaluation && s.guideEvaluation.available ? pct(s.guideEvaluation.completed) + '% evaluated' : 'Unavailable', 'Guide assessment completion', true),
    card('Need Attention', loading ? LOADING : s.needsAttention, 'red', loading ? '' : pct(s.needsAttention) + '% of cohort', 'Teams with overdue requirements', true)
  ];
  const anyLoading = dto.teams.some(t => t.health === 'loading');
  const attention = dto.teams.filter(t => t.health === 'attention').length, onTrack = dto.teams.filter(t => t.health === 'ontrack').length;
  const completion = value => value === LOADING ? LOADING : value === 'Completed' ? 'Completed' : value === 'Pending' ? 'Pending' : isLoading(value) ? LOADING : value || 'Unavailable';
  return {
    cards,
    heading: 'Team Tracker (' + dto.teams.length + ' teams)',
    filters: [
      { filter: 'all', text: 'All (' + dto.teams.length + ')', disabled: false },
      { filter: 'attention', text: 'Attention (' + (anyLoading ? LOADING : attention) + ')', disabled: anyLoading },
      { filter: 'ontrack', text: 'On Track (' + (anyLoading ? LOADING : onTrack) + ')', disabled: anyLoading },
      ...dto.deadlinePills.map(p => ({ filter: 'deadline:' + p.key, text: p.label + ' (' + p.count + ')' + (p.overdue ? ' Overdue' : ''), disabled: false, title: 'Due ' + p.due }))
    ],
    headers: ['Team', 'Guide', 'Repo', 'Title', 'Weekly Activity', ...dto.reviewColumns.map(r => r.label.replace(/^Review\s+(\d+)$/i, 'R$1')), 'Guide Eval', 'Health', 'Actions'],
    rows: dto.teams.map(t => {
      const health = t.health === 'loading' ? LOADING : HEALTH_LABEL[t.health] || 'Needs attention';
      const repoLabel = [t.repoStatus === 'ready' ? 'Repository URL recorded' : 'Pending', t.githubMessage, t.githubTiming, t.repoUrl ? 'Repository available' : ''].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' ? ');
      return {
        teamId: t.teamId, search: [t.teamId, t.guide, ...t.registerNumbers].join(' ').toLowerCase(), deadlines: t.pendingDeadlines.join(' '), health: t.health, titleStatus: t.titleStatus, repoStatus: t.repoStatus,
        team: t.teamId + (t.registerNumbers.length ? t.registerNumbers.join(', ') : '—'), guide: t.guide,
        repo: { text: t.repoStatus === 'ready' ? 'Ready' : 'Pending', label: repoLabel }, title: TITLE_BADGE[t.titleStatus] || 'Pending',
        activity: LOADING, reviews: dto.reviewColumns.map(r => t.health === 'loading' ? LOADING : completion(t.reviews[r.key])),
        guideEval: completion(t.guideEvaluation), healthText: health,
        email: t.emailRecipients.length ? 'mailto:' + t.emailRecipients.map(encodeURIComponent).join(',') + '?subject=' + encodeURIComponent('Capstone — Team ' + t.teamId) : 'disabled'
      };
    })
  };
}

const normalize = facts => JSON.parse(JSON.stringify(facts));
function stage(g, name) {
  const loading = name === 'overview';
  return { dto: JSON.parse(g.c[loading ? 'API_coordinator_getOverview' : 'API_coordinator_getProgress']()).data };
}

test('coordinator DTO carries the same facts the server-rendered stats and tracker showed', () => {
  const frozen = {};
  for (const name of ['overview', 'progress']) frozen[name] = normalize(dtoFacts(stage(coordinatorFixture(), name).dto));
  frozen.noReviews = normalize(dtoFacts(stage(coordinatorFixture({ reviewsConfigured: false }), 'progress').dto));
  // Captured from the legacy HTML (buildCoordinatorHeaderStats, buildTeamTrackerTable); see git history.
  expectGolden('coordinator-legacy-facts', frozen);
});

module.exports = { dtoFacts, stage, normalize };

test('the overview reads no marks or logs; progress reports unavailable reviews as partial', () => {
  const g = coordinatorFixture();
  let marks = 0, logs = 0;
  const original = g.c.getAllReviewCompletionStatus_, readLogs = g.c.readLogEntries_;
  g.c.getAllReviewCompletionStatus_ = () => { marks++; return original(); };
  g.c.readLogEntries_ = () => { logs++; return readLogs(); };
  const overview = JSON.parse(g.c.API_coordinator_getOverview()).data;
  assert.equal(overview.loading, true);
  assert.equal(marks + logs, 0);
  assert(overview.teams.every(t => t.health === 'loading' && Object.values(t.reviews).every(v => v === 'Loading…')));
  const progress = JSON.parse(g.c.API_coordinator_getProgress()).data;
  assert.equal(progress.loading, false);
  assert.equal(progress.partial, true);
  assert.equal(marks, 1);
});

test('progress survives unavailable marks and the DTO contains no markup', () => {
  const g = coordinatorFixture({ progressFails: true });
  const frame = JSON.parse(g.c.API_coordinator_getProgress());
  assert.equal(frame.ok, true);
  assert(frame.data.teams.every(t => Object.values(t.reviews).every(v => v === 'Unavailable')));
  assert.doesNotMatch(JSON.stringify(frame.data), /<(div|td|tr|span|button)\b|class=|onclick=/);
});

test('the split progress endpoints together carry what getProgress carries', () => {
  const g = coordinatorFixture(), call = (name, ...args) => JSON.parse(g.c[name](...args)).data;
  const progress = call('API_coordinator_getProgress'), guide = call('API_coordinator_getGuideProgress'), health = call('API_coordinator_getHealth');
  const reviews = Object.fromEntries(progress.reviewColumns.map(c => [c.key, call('API_coordinator_getReviewProgress', c.key)]));
  for (const review of progress.stats.reviews) {
    const part = reviews[review.key];
    assert.deepEqual({ completed: part.completed, unavailable: part.unavailable, label: part.label }, { completed: review.completed, unavailable: review.unavailable, label: review.label });
  }
  assert.deepEqual({ available: guide.available, completed: guide.completed }, progress.stats.guideEvaluation);
  assert.equal(health.needsAttention, progress.stats.needsAttention);
  assert.equal(health.partial, progress.partial);
  assert.deepEqual(health.deadlinePills, progress.deadlinePills);
  for (const team of progress.teams) {
    assert.equal(guide.teams[team.teamId], team.guideEvaluation, team.teamId);
    assert.deepEqual(health.teams[team.teamId], { health: team.health, pendingDeadlines: team.pendingDeadlines }, team.teamId);
    for (const key of Object.keys(team.reviews)) assert.equal(reviews[key].teams[team.teamId], team.reviews[key], team.teamId + ' ' + key);
  }
  assert.doesNotMatch(JSON.stringify([guide, health, reviews]), /<(div|td|tr|span|button)|class=|onclick=/);
});

test('the split endpoints check access, reject unknown reviews and fail independently', () => {
  const g = coordinatorFixture();
  const endpoints = [['API_coordinator_getReviewProgress', 'review1'], ['API_coordinator_getGuideProgress'], ['API_coordinator_getHealth']];
  assert.equal(JSON.parse(g.c.API_coordinator_getReviewProgress('nope')).error.code, 'REJECTED');
  g.c.guideCompletion_ = () => { throw new Error('guide journal unreadable'); };
  assert.equal(JSON.parse(g.c.API_coordinator_getGuideProgress()).error.message, 'guide journal unreadable');
  assert.equal(JSON.parse(g.c.API_coordinator_getReviewProgress('review1')).ok, true, 'a guide failure does not touch a review read');
  g.f.user('guide@example.com');
  for (const [name, ...args] of endpoints) assert.equal(JSON.parse(g.c[name](...args)).error.code, 'UNAUTHORIZED', name);
});

test('the activity endpoint returns the existing weekly activity and checks access', () => {
  const g = coordinatorFixture();
  g.c.loadAllTeamsWeeklyActivity = () => ({ state: 'active', teams: {}, totalTeams: 5, activeTeams: 2, checkedAt: '2026-01-10T00:00:00.000Z' });
  assert.deepEqual(JSON.parse(g.c.API_coordinator_getActivity()).data.activeTeams, 2);
  g.f.user('guide@example.com');
  assert.equal(JSON.parse(g.c.API_coordinator_getActivity()).error.code, 'UNAUTHORIZED');
});

test('weekly setup endpoints check access, keep the existing rules and reject unknown requests', () => {
  const g = coordinatorFixture(), calls = [];
  g.c.getWeeklyProgressPhase2Readiness = () => ({ storageReady: false, triggerReady: null, canSetupStorage: true, canSetupTriggers: false, issues: ['Missing sheet'] });
  g.c.setupWeeklyProgressPhase2Storage = () => { calls.push('storage'); return { ok: true }; };
  g.c.setupWeeklyProgressPhase2Triggers = () => { throw new Error('GEMINI_API_KEY not found.'); };
  assert.equal(JSON.parse(g.c.API_coordinator_getWeeklySetup()).data.issues[0], 'Missing sheet');
  assert.deepEqual(JSON.parse(g.c.API_coordinator_setupWeekly('storage')).data, { ok: true });
  assert.deepEqual(JSON.parse(g.c.API_coordinator_setupWeekly('triggers')).error, { code: 'REJECTED', message: 'GEMINI_API_KEY not found.' });
  assert.equal(JSON.parse(g.c.API_coordinator_setupWeekly('other')).error.code, 'INVALID_INPUT');
  g.f.user('guide@example.com');
  assert.equal(JSON.parse(g.c.API_coordinator_getWeeklySetup()).error.code, 'UNAUTHORIZED');
  assert.equal(JSON.parse(g.c.API_coordinator_setupWeekly('storage')).error.code, 'UNAUTHORIZED');
  assert.deepEqual(calls, ['storage']);
});

test('System Status card endpoints delegate to the existing functions and keep their messages', () => {
  const g = coordinatorFixture(), seen = [];
  const map = { API_coordinator_getCommitteeConfiguration: 'getCoordinatorCommitteeConfiguration', API_coordinator_getReviewConfiguration: 'getCoordinatorReviewConfiguration', API_coordinator_createDefinitions: 'createAssessmentDefinitions', API_coordinator_prepareStorage: 'prepareReviewAssessmentStorage', API_coordinator_syncGithub: 'syncCoordinatorGithubAccess' };
  for (const [endpoint, legacy] of Object.entries(map)) {
    g.c[legacy] = () => { seen.push(legacy); return { from: legacy }; };
    assert.deepEqual(JSON.parse(g.c[endpoint]()).data, { from: legacy });
  }
  g.c.resendExpiredStudentInvitations = cursor => ({ cursor });
  assert.deepEqual(JSON.parse(g.c.API_coordinator_resendInvitations('t4')).data, { cursor: 't4' });
  assert.deepEqual(JSON.parse(g.c.API_coordinator_resendInvitations()).data, { cursor: '' });
  g.c.createAssessmentDefinitions = () => { throw new Error('Coordinator access is required.'); };
  assert.deepEqual(JSON.parse(g.c.API_coordinator_createDefinitions()).error, { code: 'REJECTED', message: 'Coordinator access is required.' });
  assert.equal(seen.length, 5);
  const fs = require('node:fs'), src = fs.readFileSync('dashboard-client-scripts.js', 'utf8');
  for (const name of Object.values(map).concat('resendExpiredStudentInvitations')) assert.equal(src.includes('.' + name + '('), false, name + ' must go through the bridge');
});
