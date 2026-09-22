const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');

test('repository names require academic year and normalize semester',()=>{
  const c = vm.createContext({ getAcademicYear:()=> '2026-27' });
  vm.runInContext(fs.readFileSync('github-provisioning.js','utf8'),c);
  assert.equal(c.getTeamRepoName_('G2',' Odd '),'capstone-2026-27-odd-team-G2');
  c.getAcademicYear=()=>'';
  assert.throws(()=>c.getTeamRepoName_('G2','Odd'),/ACADEMIC_YEAR/);
});
