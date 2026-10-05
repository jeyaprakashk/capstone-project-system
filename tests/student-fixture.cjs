// Student dashboard fixture: one team, scenarios covering GitHub setup and every title state.
const vm = require('node:vm');
const fs = require('node:fs');
const { weeklyFixture } = require('./weekly-progress-fixture.cjs');

const SCENARIOS = {
  githubActive: { ready: false, title: '', members: [{ email: 'one@example.com', label: '001', username: '', githubId: '', status: 'missing' }, { email: 'two@example.com', label: '002', username: 'bob', githubId: '102', status: 'valid', access: 'active' }], message: 'Waiting for GitHub account connection.' },
  githubWaiting: { ready: false, title: 'Project', members: [{ email: 'one@example.com', label: '001', username: 'alice', githubId: '101', status: 'valid', access: 'invited' }, { email: 'two@example.com', label: '002', username: 'bob', githubId: '102', status: 'valid', access: 'active' }], message: 'Repository invitations must be accepted.', usernamesComplete: true, completedAt: Date.parse('2026-01-09T00:00:00Z') },
  notSubmitted: { ready: true, title: '' },
  needsReview: { ready: true, title: 'Project', guide: '' },
  revise: { ready: true, title: 'Project', guide: 'Approved', reviewer: 'Revise', reviewerNotes: 'Narrow the scope <b>' },
  rejected: { ready: true, title: 'Project', guide: 'Rejected', guideNotes: 'Too broad' },
  awaitingReviewer: { ready: true, title: 'Project', guide: 'Approved' },
  approved: { ready: true, title: 'Project <i>X</i>', guide: 'Approved', reviewer: 'Approved' }
};

function studentFixture(name = 'approved', { review = true } = {}) {
  const s = SCENARIOS[name], f = weeklyFixture(), c = f.c;
  for (const file of ['milestone-config.js', 'assessment-registry.js', 'rubric-config.js', 'deadline-events.js', 'lucide-icons.js', 'icon-renderer.js', 'student-dashboard.js', 'student-github.js',
    'assessment-history-view.js','dashboard-client-scripts.js', 'api-envelope.js', 'student-api.js', 'common-styles.js', 'busy-state.js']) vm.runInContext(fs.readFileSync(file, 'utf8'), c, { filename: file });
  const day = Math.floor(Date.parse('2026-01-10') / 86400000);
  c.getProjectSchedule_ = () => ({ title: day, git: day - 2, timezone: 'Asia/Kolkata', assessments: [], milestones: [] });
  c.getProjectClock_ = () => ({ today: day + 1, now: new Date('2026-01-11T12:00:00Z') });
  c.getAssessmentDefinitions_ = () => [...(review ? [{ key: 'review1', type: 'REVIEW', label: 'Review 1' }, { key: 'review2', type: 'REVIEW', label: 'Review 2' }] : []), { key: 'guide_eval', type: 'GUIDE_EVALUATION', label: 'Guide Evaluation' }];
  c.buildTeamIntakeLink_ = team => 'https://forms.example/intake?team=' + team;
  f.user('one@example.com');
  f.set('Title', s.title); f.set('Guide Decision', s.guide || ''); f.set('Reviewer Decision', s.reviewer || '');
  f.set('Reviewer Notes', s.reviewerNotes || ''); f.set('Guide Notes', s.guideNotes || '');
  const members = s.members || [{ email: 'one@example.com', label: '001', username: 'alice', githubId: '101', status: 'valid', access: 'active' }, { email: 'two@example.com', label: '002', username: 'bob', githubId: '102', status: 'valid', access: 'active' }];
  c.getTeamGithubSetup_ = () => ({ repoUrl: 'https://github.com/org/team', members, ready: s.ready, message: s.message || 'Ready', usernamesComplete: s.usernamesComplete !== false, completedAt: s.completedAt ?? Date.parse('2026-01-05T00:00:00Z') });
  c.getTeamsGithubSetup_ = (rows, columns, repos) => Object.fromEntries(rows.map(row => [c.normalizeText_(row[columns.TEAM_ID]), c.getTeamGithubSetup_(row[columns.TEAM_ID], { repoUrl: repos[c.normalizeText_(row[columns.TEAM_ID])] })]));
  c.githubCaptureReady_ = () => name !== 'githubActive' || true;
  return { f, c, name };
}
/** The union of the two endpoints: what the page shows once both parts have loaded. */
function studentDto(name, options) {
  const s = studentFixture(name, options), call = method => JSON.parse(s.c[method]()).data;
  return { ...call('API_student_getCore'), ...call('API_student_getProject') };
}
module.exports = { studentFixture, studentDto, SCENARIOS };
