// Coordinator dashboard migration: the DTO must carry every fact the server-rendered stats and tracker showed.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
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
      { filter: 'ontrack', text: 'On Track (' + (anyLoading ? LOADING : onTrack) + ')', disabled: anyLoading }
    ],
    headers: ['Team', 'Guide', 'Repo', 'Title', 'Weekly Activity', ...dto.reviewColumns.map(r => r.label.replace(/^Review\s+(\d+)$/i, 'R$1')), 'Guide Eval', 'Health', 'Actions'],
    rows: dto.teams.map(t => {
      const health = t.health === 'loading' ? LOADING : HEALTH_LABEL[t.health] || 'Needs attention';
      const repoLabel = [t.repoStatus === 'ready' ? 'Repository URL recorded' : 'Pending', t.githubMessage, t.githubTiming, t.repoUrl ? 'Repository available' : ''].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(' ? ');
      return {
        teamId: t.teamId, search: [t.teamId, t.guide, ...t.registerNumbers].join(' ').toLowerCase(), health: t.health, titleStatus: t.titleStatus, repoStatus: t.repoStatus,
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
const call = (g, name, ...args) => JSON.parse(g.c[name](...args)).data;
/** The overview with the progress sections merged in, as the view presents the completed dashboard. */
function progressFromSections(g) {
  const overview = call(g, 'API_coordinator_getOverview'), guide = call(g, 'API_coordinator_getGuideProgress'), health = call(g, 'API_coordinator_getHealth');
  const reviews = Object.fromEntries(overview.reviewColumns.map(c => [c.key, call(g, 'API_coordinator_getReviewProgress', c.key)]));
  return { ...overview, loading: false, partial: health.partial,
    stats: { ...overview.stats, needsAttention: health.needsAttention, guideEvaluation: { available: guide.available, completed: guide.completed },
      reviews: overview.stats.reviews.map(r => ({ ...r, completed: reviews[r.key].completed, unavailable: reviews[r.key].unavailable, known: true })) },
    teams: overview.teams.map(t => ({ ...t, health: health.teams[t.teamId].health, guideEvaluation: guide.teams[t.teamId],
      reviews: Object.fromEntries(Object.keys(reviews).map(key => [key, reviews[key].teams[t.teamId]])) })) };
}
function stage(g, name) {
  return { dto: name === 'overview' ? call(g, 'API_coordinator_getOverview') : progressFromSections(g) };
}

test('coordinator DTO preserves legacy facts except the deliberately removed deadline alerts', () => {
  const frozen = {};
  for (const name of ['overview', 'progress']) frozen[name] = normalize(dtoFacts(stage(coordinatorFixture(), name).dto));
  frozen.noReviews = normalize(dtoFacts(stage(coordinatorFixture({ reviewsConfigured: false }), 'progress').dto));
  // Keep the historical snapshot intact and explicitly remove only alert facts.
  const expected = JSON.parse(fs.readFileSync(path.join(__dirname,'invariants/snapshots/coordinator-legacy-facts.json'),'utf8'));
  for (const facts of Object.values(expected)) {
    facts.filters = facts.filters.filter(item => !item.filter.startsWith('deadline:'));
    facts.rows.forEach(row => { delete row.deadlines; });
  }
  assert.deepEqual(frozen,expected);
  for (const name of ['overview','progress']) {
    const dto = stage(coordinatorFixture(),name).dto;
    assert.equal(Object.hasOwn(dto,'deadlinePills'),false);
    assert(dto.teams.every(team => !Object.hasOwn(team,'pendingDeadlines')));
  }
});

module.exports = { dtoFacts, stage, normalize };

test('the overview reads no marks or logs; the progress reads report unavailable reviews as partial', () => {
  const g = coordinatorFixture();
  let marks = 0, logs = 0;
  const original = g.c.getAllReviewCompletionStatus_, readLogs = g.c.readLogEntries_;
  g.c.getAllReviewCompletionStatus_ = (...args) => { marks++; return original(...args); };
  g.c.readLogEntries_ = () => { logs++; return readLogs(); };
  const overview = call(g, 'API_coordinator_getOverview');
  assert.equal(overview.loading, true);
  assert.equal(marks + logs, 0);
  assert(overview.teams.every(t => t.health === 'loading' && Object.values(t.reviews).every(v => v === 'Loading…')));
  const progress = progressFromSections(g);
  assert.equal(progress.partial, true);
  assert.equal(marks, 3, 'one read per Review plus health, nothing more');
});

test('unavailable marks fail the Review read alone; health still answers and no DTO contains markup', () => {
  const g = coordinatorFixture({ progressFails: true });
  const review = JSON.parse(g.c.API_coordinator_getReviewProgress('review1'));
  assert.equal(review.ok, false);
  assert.equal(review.error.message, 'marks unavailable');
  const health = JSON.parse(g.c.API_coordinator_getHealth());
  assert.equal(health.ok, true);
  assert.doesNotMatch(JSON.stringify([review, health, call(g, 'API_coordinator_getGuideProgress')]), /<(div|td|tr|span|button)|class=|onclick=/);
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
  g.c.loadAllTeamsWeeklyActivity_ = () => ({ state: 'active', teams: {}, totalTeams: 5, activeTeams: 2, checkedAt: '2026-01-10T00:00:00.000Z' });
  assert.deepEqual(JSON.parse(g.c.API_coordinator_getActivity()).data.activeTeams, 2);
  g.f.user('guide@example.com');
  assert.equal(JSON.parse(g.c.API_coordinator_getActivity()).error.code, 'UNAUTHORIZED');
});

test('weekly setup endpoints check access, keep the existing rules and reject unknown requests', () => {
  const g = coordinatorFixture(), calls = [];
  g.c.getWeeklyProgressPhase2Readiness_ = () => ({ storageReady: false, triggerReady: null, canSetupStorage: true, canSetupTriggers: false, issues: ['Missing sheet'] });
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
  const map = { API_coordinator_getCommitteeConfiguration: 'getCoordinatorCommitteeConfiguration_', API_coordinator_getReviewConfiguration: 'getCoordinatorReviewConfiguration_', API_coordinator_createDefinitions: 'createAssessmentDefinitions_', API_coordinator_prepareStorage: 'prepareReviewAssessmentStorage_', API_coordinator_syncGithub: 'syncCoordinatorGithubAccess_' };
  for (const [endpoint, legacy] of Object.entries(map)) {
    g.c[legacy] = () => { seen.push(legacy); return { from: legacy }; };
    assert.deepEqual(JSON.parse(g.c[endpoint]()).data, { from: legacy });
  }
  g.c.resendExpiredStudentInvitations_ = cursor => ({ cursor });
  assert.deepEqual(JSON.parse(g.c.API_coordinator_resendInvitations('t4')).data, { cursor: 't4' });
  assert.deepEqual(JSON.parse(g.c.API_coordinator_resendInvitations()).data, { cursor: '' });
  g.c.createAssessmentDefinitions_ = () => { throw new Error('Coordinator access is required.'); };
  assert.deepEqual(JSON.parse(g.c.API_coordinator_createDefinitions()).error, { code: 'REJECTED', message: 'Coordinator access is required.' });
  assert.equal(seen.length, 5);
  const fs = require('node:fs'), src = fs.readFileSync('dashboard-client-scripts.js', 'utf8');
  for (const name of Object.values(map).concat('resendExpiredStudentInvitations_')) assert.equal(src.includes('.' + name + '('), false, name + ' must go through the bridge');
});
