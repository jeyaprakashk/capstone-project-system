// Coordinator dashboard fixture: five teams in different health states and a configured review pair.
const vm = require('node:vm');
const fs = require('node:fs');
const { weeklyFixture } = require('./weekly-progress-fixture.cjs');

function coordinatorFixture({ reviewsConfigured = true, progressFails = false } = {}) {
  const f = weeklyFixture(), c = f.c;
  for (const file of ['milestone-config.js', 'assessment-registry.js', 'rubric-config.js', 'deadline-events.js', 'lucide-icons.js', 'icon-renderer.js', 'dashboard-client-scripts.js',
    'coordinator-dashboard.js', 'api-envelope.js', 'coordinator-api.js', 'common-styles.js']) vm.runInContext(fs.readFileSync(file, 'utf8'), c, { filename: file });
  const day = Math.floor(Date.parse('2026-01-10') / 86400000);
  const reviews = [{ key: 'review1', label: 'Review 1' }, { key: 'review2', label: 'Review 2' }];
  c.getProjectSchedule_ = () => ({ formation: day - 30, git: day - 20, title: day - 10, timezone: 'Asia/Kolkata', assessments: [], milestones: [], reviews: reviews.map((r, i) => ({ ...r, day: day - 3 + i * 13 })) });
  c.getProjectClock_ = () => ({ today: day, now: new Date('2026-01-10T12:00:00Z') });
  c.getInternalReviews_ = () => { if (!reviewsConfigured) throw new Error('No reviews'); return reviews; };
  c.formatProjectDay_ = d => 'D' + (d - day);
  const base = { 'Guide Email': 'guide@example.com', Semester: 'Odd' };
  const teams = [
    { 'Team ID': 'T1', Title: 'Approved <b>', 'Reviewer Decision': 'Approved', 'Guide Decision': 'Approved', 'Guide Name': 'Dr. A', 'Student 1 Email': 'one@example.com', 'Student 1 Register No': '001', 'Student 2 Email': 'two@example.com', 'Student 2 Register No': '002', 'Review Committee Number': 'C1' },
    { 'Team ID': 'T2', Title: 'Pending', 'Guide Name': 'Dr. B', 'Student 1 Email': 'three@example.com', 'Student 1 Register No': '003', 'Review Committee Number': 'C1' },
    { 'Team ID': 'T3', Title: '', 'Guide Name': 'Dr. C', 'Student 1 Email': '', 'Student 1 Register No': '004' },
    { 'Team ID': 'T4', Title: 'Rejected', 'Guide Decision': 'Rejected', 'Guide Name': 'Dr. D', 'Student 1 Email': 'four@example.com', 'Student 1 Register No': '005', 'Student 2 Register No': '006' },
    { 'Team ID': 'T5', Title: 'Revise', 'Reviewer Decision': 'Revise', 'Guide Name': 'Dr. E', 'Student 1 Email': 'five@example.com', 'Student 1 Register No': '007' }
  ];
  f.status.rows.splice(1, f.status.rows.length, ...teams.map(t => f.ts.map(h => ({ ...base, ...t })[h] ?? '')));
  f.roster.rows.splice(1, f.roster.rows.length, ...teams.map(t => f.tr.map(h => ({ ...base, ...t })[h] ?? '')));
  c.getRepoUrlMap = () => ({ t1: 'https://github.com/org/t1', t2: 'https://github.com/org/t2', t4: 'https://github.com/org/t4' });
  c.getAllReviewCompletionStatus_ = () => {
    if (progressFails) throw new Error('marks unavailable');
    return { t1: { review1: { completed: true }, review2: { completed: false } }, t2: { review1: { completed: false }, review2: { completed: false } }, t3: { review1: { completed: false, available: false }, review2: { available: false } }, t4: { review1: { completed: true }, review2: { completed: true } } };
  };
  c.guideCompletion_ = () => ({ available: true, completed: 1, teams: { t1: true } });
  f.user('coord@example.com');
  return { f, c, day, reviews };
}
module.exports = { coordinatorFixture };
