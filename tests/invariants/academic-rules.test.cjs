// Characterizes the Review attendance/marks policy over a fixed matrix. These outputs must not change.
const { test } = require('node:test');
const vm = require('node:vm');
const { loadSources, expectGolden } = require('./golden.cjs');

const config = {
  academicPolicyVersion: 'review-attendance-v1', weight: 20,
  criteria: [
    { pi: 'T1', type: 'Team', maxMarks: 10, co: 'CO1' }, { pi: 'T2', type: 'Team', maxMarks: 10, co: 'CO2' },
    { pi: 'I1', type: 'Individual', maxMarks: 10, co: 'CO1' }, { pi: 'I2', type: 'Individual', maxMarks: 5, co: 'CO3' }]
};
const level = (max, l, remark) => ({ marks: max * [0, 40, 60, 75, 85, 95, 100][l] / 100, level: l, remark: remark ?? (l < 2 ? 'needs work' : '') });
const scores = l => ({ T1: level(10, l), T2: level(10, l), I1: level(10, l), I2: level(5, l) });
const withScore = (base, pi, s) => ({ ...base, [pi]: s });

const factsMatrix = {
  unselected: undefined,
  normal: { type: 'NORMAL' },
  absentApproved: { type: 'REVIEW_DAY_ABSENCE', approved: true },
  absentApprovedEvidence: { type: 'REVIEW_DAY_ABSENCE', approved: true, supportingEvidence: ['MEDICAL_DOCUMENT', 'OTHER'], otherEvidenceText: ' note ' },
  absentRejected: { type: 'REVIEW_DAY_ABSENCE', approved: false },
  prolongedApprovedContribution: { type: 'PROLONGED', approved: true, verifiedContribution: true, attended: false },
  prolongedApprovedNoContribution: { type: 'PROLONGED', approved: true, verifiedContribution: false, attended: false },
  prolongedRejected: { type: 'PROLONGED', approved: false, verifiedContribution: true, attended: true },
  prolongedNotApplicable: { type: 'PROLONGED', verifiedContribution: false, attended: true }
};
const errors = [{ type: 'BOGUS' }, { type: 'REVIEW_DAY_ABSENCE' }, { type: 'PROLONGED', approved: true }];

test('Review academic policy outputs are unchanged across attendance and score scenarios', () => {
  const c = loadSources(['review-academic-policy.js']);
  const calc = vm.runInContext('reviewPolicyCalculate_', c);
  const makeup = { eventId: 'E1', scores: { I1: level(10, 3), I2: level(5, 3) } };
  const result = {};
  for (const [name, facts] of Object.entries(factsMatrix)) {
    for (const l of [0, 1, 2, 3, 5]) {
      const student = { scores: scores(l), assessment: { facts, ...(l === 3 ? { makeup } : {}) } };
      result[`${name}/level${l}`] = calc(config, scores(l), student);
    }
  }
  result['incomplete'] = calc(config, withScore(scores(3), 'T2', undefined), { scores: scores(3), assessment: { facts: { type: 'NORMAL' } } });
  result['halfMarks'] = calc(config, scores(3), { scores: withScore(scores(3), 'I1', { marks: 8.5, level: 4, remark: '' }), assessment: { facts: { type: 'NORMAL' } } });
  result['invalidBand'] = calc(config, scores(3), { scores: withScore(scores(3), 'I1', { marks: 9.5, level: 3, remark: '' }), assessment: { facts: { type: 'NORMAL' } } });
  result['frozenTeam'] = calc(config, scores(0), { scores: scores(4), assessment: { facts: { type: 'NORMAL' } } },
    { teamMark: 17, teamSource: 'common', teamState: 'RESOLVED', effectiveScores: { T1: { marks: 9 }, T2: { marks: 8 } } });
  for (const bad of errors) {
    try { calc(config, scores(3), { scores: scores(3), assessment: { facts: bad } }); result['error/' + bad.type + JSON.stringify(bad)] = 'no error'; }
    catch (e) { result['error/' + bad.type + JSON.stringify(bad)] = e.message; }
  }
  try { calc({ ...config, academicPolicyVersion: 'x' }, {}, {}); } catch (e) { result['error/version'] = e.message; }
  expectGolden('academic-review-policy', JSON.parse(JSON.stringify(result)));
});
