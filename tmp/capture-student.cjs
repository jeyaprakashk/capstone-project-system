const assert = require('node:assert/strict');
const { legacyFacts, dtoFacts, build, normalize } = require('../tests/student-migration.test.cjs');
const { SCENARIOS } = require('../tests/student-fixture.cjs');
let bad = 0;
for (const name of Object.keys(SCENARIOS)) {
  const { s, dto } = build(name);
  const legacy = normalize(legacyFacts(s.c.buildStudentContent('one@example.com', 'T1')));
  try { assert.deepEqual(normalize(dtoFacts(dto)), legacy); console.log('ok  ', name); }
  catch (e) { bad++; console.log('DIFF', name); console.log(e.message.split('\n').filter(l => /^[+-] /.test(l) || /^\s+[+-]/.test(l)).slice(0, 14).join('\n')); }
}
process.exit(bad ? 1 : 0);
