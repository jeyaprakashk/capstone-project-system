const {test}=require('node:test');
const assert=require('node:assert/strict');
const {weeklyFixture}=require('./weekly-progress-fixture.cjs');

function fixture() {
 const f=weeklyFixture(), student={regNo:'001',teamId:'T1',email:'one@example.com'};
 const setup={ready:true,repoUrl:'https://github.com/org/team',members:[{email:student.email,label:'001',username:'Alice',githubId:'101',status:'valid'}]};
 f.c.getTeamGithubSetup_=()=>setup;
 f.properties.set(f.c.commitCollectionKey_('T1'),'ok');
 const sheet=f.sheet('Commits',[['Date','Team ID','Commit Message','GitHub Username','Repository URL','Commit SHA','GitHub Author ID']]);
 let seq=0;
 function commit(date,extra={}) {
  const row={date,team:'T1',message:'CAD and experimental results',username:'alice',repo:setup.repoUrl,sha:(++seq).toString(16).padStart(40,'0'),...extra};
  sheet.rows.push([row.date,row.team,row.message,row.username,row.repo,row.sha,extra.authorId === undefined ? row.username === 'bob' ? '102' : row.username === '(unknown)' ? '999' : '101' : extra.authorId]);return row;
 }
 return {...f,student,setup,commit,commitSheet:sheet,read:week=>f.c.readWeeklyProgressEvidence_(student,week||'W1')};
}

test('evidence uses inclusive configured normal boundaries, offsets and not late cutoff',()=>{
 const f=fixture();
 for(const date of ['2025-12-31T23:59:59.999Z','2026-01-01T05:30:00+05:30','2026-01-07T23:59:59Z','2026-01-07T23:59:59.001Z','2026-01-08T00:00:00Z','2026-01-14T23:59:59Z']) f.commit(date);
 assert.equal(f.read().count,2);assert.equal(f.read('W2').count,2);
 assert.throws(()=>f.read('unconfigured'),/Unknown/);
});

test('evidence requires team, verified roster mapping, repository and GitHub ID; unknown rows preserved',()=>{
 const f=fixture();f.commit('2026-01-02T00:00:00Z');
 for(const extra of [{team:'T2'},{username:'bob'},{username:'(unknown)'},{repo:'https://github.com/org/other'},{repo:'https://evil.example/org/team'}]) f.commit('2026-01-02T00:00:00Z',extra);
 assert.equal(f.read().count,1);assert.equal(f.commitSheet.rows.length,7);
 f.setup.members[0].label='002';assert.equal(f.read().state,'unavailable');
});

test('students on the same team only receive their own GitHub commit details',()=>{
 const f=fixture();
 const other={regNo:'002',teamId:'T1',email:'two@example.com'};
 f.setup.members.push({email:other.email,label:other.regNo,username:'bob',githubId:'102',status:'valid'});
 f.commit('2026-01-02T00:00:00Z',{message:'Alice work'});
 f.commit('2026-01-02T01:00:00Z',{username:'bob',message:'Bob work'});
 const mine=f.read(),theirs=f.c.readWeeklyProgressEvidence_(other,'W1');
 assert.equal(mine.count,1);assert.equal(mine.commits[0].message,'Alice work');
 assert.equal(theirs.count,1);assert.equal(theirs.commits[0].message,'Bob work');
});

test('shared reader returns effective log and safe commit details; scopes reads by Team ID once across weeks',()=>{
 const f=fixture();f.c.submitWeeklyProgress(f.input());f.c.submitWeeklyProgress(f.input({workCompleted:'Revised work'}));
 const row=f.commit('2026-01-02T00:00:00Z',{message:'<img src=x onerror=bad()>',sha:'A'.repeat(40)});
 f.commit('2026-01-02T00:00:00Z',{sha:row.sha});
 const result=f.read();assert.equal(result.log.workCompleted,'Revised work');assert.equal(result.count,1);
 assert.deepEqual(JSON.parse(JSON.stringify(result.commits[0])),{timestamp:'2026-01-02T00:00:00.000Z',message:row.message,sha:'a'.repeat(40),shortSha:'aaaaaaa',url:f.setup.repoUrl+'/commit/'+'a'.repeat(40)});
 const read=f.c.readCollectedCommits_;let calls=0;f.c.readCollectedCommits_=team=>{assert.equal(team,'T1');calls++;return read(team);};
 f.c.loadStudentWeeklyProgress();assert.equal(calls,1);
 assert.equal(f.entries().length,2);assert(!Object.hasOwn(f.entries()[0],'commits'));
});

test('no commits, unavailable collection, failed reads and unmapped states remain distinct',()=>{
 const f=fixture();assert.equal(f.read().state,'available');assert.equal(f.read().count,0);
 for(const health of ['error','']) {f.properties.set(f.c.commitCollectionKey_('T1'),health);assert.equal(f.read().state,'unavailable');assert.equal(f.read().count,null);}
 f.properties.set(f.c.commitCollectionKey_('T1'),'ok');f.commitSheet.rows[0][0]='Broken';assert.equal(f.read().state,'unavailable');
 for(const status of ['missing','invalid','unavailable']) {f.setup.members[0].status=status;assert.equal(f.read().state,'unavailable');assert.equal(f.read().count,null);}
 f.setup.members[0].status='valid';f.setup.members.push({email:'two@example.com',label:'002',username:'ALICE',githubId:'101',status:'valid'});assert.equal(f.read().state,'unavailable');
});

test('invalid matched SHA produces unavailable dashboard evidence instead of a false zero',()=>{
 const f=fixture();f.commit('2026-01-02T00:00:00Z',{sha:'javascript:bad'});
 const result=f.c.loadStudentWeeklyProgress().evidence[0];assert.equal(result.state,'unavailable');assert.equal(result.count,null);
});
