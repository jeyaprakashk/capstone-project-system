// Guide dashboard fixture: one guide with a team in every title-approval state.
const vm = require('node:vm');
const fs = require('node:fs');
const { weeklyFixture } = require('./weekly-progress-fixture.cjs');

function guideFixture({ github = 'default' } = {}) {
  const f = weeklyFixture(), c = f.c;
  for (const file of ['milestone-config.js', 'assessment-registry.js', 'rubric-config.js', 'lucide-icons.js', 'icon-renderer.js', 'student-dashboard.js',
    'api-envelope.js', 'guide-api.js', 'common-styles.js', 'busy-state.js']) vm.runInContext(fs.readFileSync(file, 'utf8'), c, { filename: file });
  f.user('guide@example.com');
  const day = Math.floor(Date.parse('2026-01-10') / 86400000);
  const state = { schedule: { title: day, git: day - 2, timezone: 'Asia/Kolkata', assessments: [{ key: 'guide_eval', type: 'GUIDE_EVALUATION', opens: day + 5 }], milestones: [] }, today: day + 1 };
  c.getProjectSchedule_ = () => state.schedule;
  c.getProjectClock_ = () => ({ today: state.today, now: new Date('2026-01-11T12:00:00Z') });
  const ts = f.ts;
  const header = h => ts.indexOf(h);
  const base = { 'Guide Email': 'guide@example.com', 'Guide Name': 'Dr. Guide <b>', Semester: 'Odd' };
  const teams = [
    { 'Team ID': 'T1', Title: 'Approved <i>project</i>', 'Reviewer Decision': 'Approved', 'Guide Decision': 'Approved', 'Title Approved By': 'rev@example.com', 'Reviewer Notes': 'Solid scope', 'Student 1 Name': 'One', 'Student 1 Register No': '001', 'Student 1 Email': 'one@example.com', 'Student 2 Name': 'Two', 'Student 2 Register No': '002', 'Student 2 Email': 'two@example.com', 'Work Breakdown Link': 'https://example.com/wbs', 'Problem Statement': 'Short problem' },
    { 'Team ID': 'T2', Title: 'Needs review', 'Guide Decision': '', 'Student 1 Name': 'Three', 'Student 1 Register No': '003', 'Student 1 Email': 'three@example.com', 'Problem Statement': 'A long problem statement. '.repeat(12), 'Similarity Flag': 'Similar to T9 (80%)', 'Work Breakdown Link': 'https://example.com/w2', 'Need Analysis Link': 'https://example.com/n2' },
    { 'Team ID': 'T3', Title: '', 'Student 1 Name': 'Four', 'Student 1 Register No': '004', 'Student 1 Email': 'four@example.com' },
    { 'Team ID': 'T4', Title: 'Awaiting reviewer', 'Guide Decision': 'Approved', 'Student 1 Name': 'Five', 'Student 1 Register No': '005', 'Student 1 Email': 'five@example.com', 'Student 2 Name': 'Six', 'Student 2 Register No': '006' },
    { 'Team ID': 'T5', Title: 'Rejected', 'Guide Decision': 'Rejected', 'Guide Notes': 'Too broad', 'Student 1 Name': 'Seven', 'Student 1 Register No': '007', 'Student 1 Email': 'seven@example.com' },
    { 'Team ID': 'T6', Title: 'Revise me', 'Guide Decision': 'Approved', 'Reviewer Decision': 'Revise', 'Reviewer Notes': 'Narrow it', 'Student 1 Name': 'Eight', 'Student 1 Register No': '008', 'Student 1 Email': 'eight@example.com' }
  ];
  f.status.rows.splice(1, f.status.rows.length, ...teams.map(t => ts.map(h => ({ ...base, ...t })[h] ?? '')));
  c.getRepoUrlMap_ = () => ({ t1: 'https://github.com/org/team1', t2: 'https://github.com/org/team2' });
  const members = {
    t1: { members: [{ email: 'one@example.com', githubId: '1', status: 'valid', access: 'active', submittedAt: Date.parse('2026-01-07T10:00:00Z') }, { email: 'two@example.com', githubId: '2', status: 'valid', access: 'active', submittedAt: Date.parse('2026-01-09T10:00:00Z') }] },
    t2: { members: [{ email: 'three@example.com', githubId: '3', status: 'valid', access: 'invited', submittedAt: Date.parse('2026-01-07T10:00:00Z') }] },
    t3: { members: [{ email: 'four@example.com', githubId: '', status: 'missing', access: 'none' }] },
    t5: { members: [{ email: 'seven@example.com', githubId: '7', status: 'valid', access: 'unavailable' }] }
  };
  c.getTeamsGithubSetup_ = () => { if (github === 'throw') throw new Error('GitHub down'); return members; };
  c.getHubRegistrySheet_ = () => ({}); // approval date unavailable unless a test supplies a registry
  return { f, c, ts, state, members, header, user: 'guide@example.com', day };
}
/**
 * The dashboard DTO with each team's `github` (API_guide_getGithub) and each approved team's approval date and timing
 * (API_guide_getApprovals) filled in: the shape the view shows once all three reads have finished.
 */
function guideFullDto(g) {
  const dto = JSON.parse(g.c.API_guide_getDashboard()).data;
  const github = JSON.parse(g.c.API_guide_getGithub()).data;
  const approvals = JSON.parse(g.c.API_guide_getApprovals()).data;
  dto.teams.forEach(team => {
    team.github = github.teams[team.teamId] ?? null;
    if (team.approval) Object.assign(team.approval, approvals.teams[team.teamId]);
  });
  return dto;
}
module.exports = { guideFixture, guideFullDto };
