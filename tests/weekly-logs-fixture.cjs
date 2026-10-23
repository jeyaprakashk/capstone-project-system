// Fixed student weekly data for the "All weekly logs" drawer: the golden master of its markup and the shared-view tests use it.
const commit = (message, sha) => ({ timestamp: '2026-01-02T12:00:00Z', message, shortSha: sha, url: 'https://github.com/org/team/commit/' + sha.repeat(6).slice(0, 40) });
const studentData = () => ({
  ready: true, timezone: 'Asia/Kolkata', checkedAt: '2026-01-10T00:00:00Z',
  allWeeks: [
    { weekId: 'W1', opens: '2026-01-01T00:00:00Z', deadline: '2026-01-05T00:00:00Z' },
    { weekId: 'W2', opens: '2026-01-06T00:00:00Z', deadline: '2026-01-09T00:00:00Z' },
    { weekId: 'W3', opens: '2026-01-08T00:00:00Z', deadline: '2026-01-12T00:00:00Z' },
    { weekId: 'W4', opens: '2026-01-15T00:00:00Z', deadline: '2026-01-19T00:00:00Z' }
  ],
  history: [
    { weekId: 'W1', entryStatus: 'SUBMITTED', timeliness: 'ON_TIME', recordedAt: '2026-01-02T00:00:00Z', firstSubmittedAt: '2026-01-02T00:00:00Z', workCompleted: 'Built <b>parser</b>', guideDiscussion: 'Agreed scope', blockers: 'None', nextAction: 'Tests' },
    { weekId: 'W1', entryStatus: 'REVISED', timeliness: 'LATE', recordedAt: '2026-01-06T00:00:00Z', firstSubmittedAt: '2026-01-02T00:00:00Z', workCompleted: 'Built parser\nand lexer', guideDiscussion: 'Agreed scope', blockers: 'None', nextAction: 'Tests' },
    { weekId: 'W2', entryStatus: 'MISSED', timeliness: '', recordedAt: '2026-01-10T00:00:00Z' }
  ],
  evidence: [
    { weekId: 'W1', state: 'available', count: 2, commits: [commit('Add parser', 'abcdef0'), commit('Fix <lexer>', '1234567')] },
    { weekId: 'W2', state: 'unavailable', message: 'GitHub activity is unavailable.', commits: [] },
    { weekId: 'W3', state: 'available', count: 0, commits: [] }
  ],
  actions: [], weeks: []
});
module.exports = { studentData };
