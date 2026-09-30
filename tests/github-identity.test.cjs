const {test}=require('node:test');
const assert=require('node:assert/strict');
const vm=require('node:vm');
const fs=require('node:fs');
const {weeklyFixture}=require('./weekly-progress-fixture.cjs');
const {releaseSource}=require('../scripts/build-github-identity-release.cjs');
const accountHeaders=['Timestamp','Email address','Team ID','GitHub Username'];
const commitHeaders=['Date','Team ID','Commit Message','GitHub Username','Repository URL','Commit SHA'];
const sha=n=>String(n).padStart(40,'0');
const account=(id=101,login='canonical',name='Student')=>({status:200,body:{id,login,name,type:'User',html_url:'https://github.com/'+login,avatar_url:'https://avatars.githubusercontent.com/u/'+id}});
function fixture(release=2) {
  const f=weeklyFixture(),cache=new Map(),calls=[];
  for(const file of ['github-identity.js','student-github.js','team-github-setup.js','github-provisioning.js','weekly-activity.js'])vm.runInContext(releaseSource(file,release),f.c);
  f.c.Logger={log(){}};
  f.config.CELL_PD_EMAIL='pd@example.com';
  f.c.getCommitteeNumbersForReviewer=()=>[];
  f.c.getProjectSchedule_=()=>({});
  f.c.getProjectClock_=()=>({now:new f.c.Date()});
  f.c.CacheService={getScriptCache:()=>({get:k=>cache.get(k),put:(k,v)=>cache.set(k,v),remove:k=>cache.delete(k)})};
  let response=(method,path)=>path.startsWith('/user')?account(path.endsWith('102')?102:101,path.endsWith('102')?'second':'canonical'):
    path.includes('/invitations?')?{status:200,body:[]}:
    path.includes('/permission')?{status:200,body:{permission:'write',user:{id:path.includes('/second/')?102:101}}}:
    {status:200,body:{html_url:'https://github.com/org/team'}};
  f.c.makeGithubRequest=(...args)=>{calls.push(args);return response(...args);};
  const accounts=f.sheet('GithubUsernameRaw',[accountHeaders.slice()]),commits=f.sheet('Commits',[commitHeaders.slice()]);
  f.user('coord@example.com');f.c.setupGitHubIdentityMigrationStorage();f.user('one@example.com');
  const add=(id='101',email='one@example.com',login='old')=>accounts.rows.push(['2026-01-01T00:00:00Z',email,'T1',login,id,'Old Name','https://github.com/'+login]);
  const commit=(n,id='',extra={})=>commits.rows.push([extra.date||'2026-01-02T00:00:00Z','T1',extra.message||'Work','old','https://github.com/org/team',sha(n),id]);
  const admin=()=>f.user('coord@example.com');
  const migrate=()=>{admin();let result;for(let i=0;i<12;i++){result=f.c.applyGitHubIdentityMigration({limit:1});if(result.done)return result;}throw Error('Migration did not finish');};
  return {...f,accounts,commits,cache,calls,add,commit,admin,migrate,response:fn=>response=fn};
}

for (const release of [1,2]) {
  test('Release '+release+' accepts live GitHuB Username base headers without rewriting them',()=>{
    const f=fixture(release);
    const liveAccounts=[' timestamp ',' EMAIL ADDRESS\t',' Team ID ','GitHuB Username'];
    const liveCommits=[' date ',' TEAM ID ',' Commit Message\t',' GitHuB Username ',' repository url ',' COMMIT SHA '];
    f.accounts.rows[0]=liveAccounts.slice();f.commits.rows[0]=liveCommits.slice();
    f.admin();
    assert.equal(f.c.githubAccountColumns_(f.accounts,false).ID,-1);
    assert.equal(f.c.auditGitHubIdentityMigration().readOnly,true);
    assert.deepEqual(f.accounts.rows[0],liveAccounts);assert.deepEqual(f.commits.rows[0],liveCommits);
    f.c.setupGitHubIdentityMigrationStorage();f.c.setupGitHubIdentityMigrationStorage();
    assert.deepEqual(f.accounts.rows[0],liveAccounts.concat('GitHub ID','GitHub Display Name','GitHub Profile URL'));
    assert.deepEqual(f.commits.rows[0],liveCommits.concat('GitHub Author ID'));
    assert.equal(f.c.githubAccountColumns_(f.accounts,true).ID,4);
    assert.equal(f.c.commitColumns_(f.commits).SHA,5);
    assert.equal(f.c.auditGitHubIdentityMigration().commitAuthorIdPresent,true);
    f.c.appendCollectedCommits_(f.commits,'T1',[{sha:sha(1),author:{login:'canonical',id:101},commit:{committer:{date:'2026-01-02T00:00:00Z'},message:'Live header collection'}}],'https://github.com/org/team');
    assert.equal(f.c.readCollectedCommits_()[0].authorId,'101');
    assert.deepEqual(f.accounts.rows[0].slice(0,4),liveAccounts);assert.deepEqual(f.commits.rows[0].slice(0,6),liveCommits);
  });

  test('Release '+release+' base validation still rejects reordered, missing, and internally changed headers',()=>{
    for(const name of ['accounts','commits'])for(const invalid of ['GitHub  Username','GitHub-Username','GitHub Usernames','',null,'reordered']) {
      const f=fixture(release);f.admin();const sheet=f[name];
      if(invalid==='reordered') [sheet.rows[0][0],sheet.rows[0][1]]=[sheet.rows[0][1],sheet.rows[0][0]];
      else sheet.rows[0][3]=invalid;
      const before=JSON.stringify([f.accounts.rows,f.commits.rows]);
      assert.throws(()=>name==='accounts'?f.c.githubAccountColumns_(sheet,false):f.c.commitColumns_(sheet),/header mismatch/);
      assert.throws(()=>f.c.auditGitHubIdentityMigration(),/header mismatch/);
      assert.throws(()=>f.c.setupGitHubIdentityMigrationStorage(),/header mismatch/);
      assert.equal(JSON.stringify([f.accounts.rows,f.commits.rows]),before);
    }
  });
}

for(const release of [1,2])test('Release '+release+' unregistered status requests connection without borrowing teammate API errors',()=>{
  const f=fixture(release);f.add('102','two@example.com');f.response(()=>({status:503}));
  let state=f.c.getStudentGithubState_('one@example.com','T1',[],'');
  assert.equal(state.githubSetup.verificationUnavailable,true);
  assert.equal(state.githubText,'Waiting for GitHub account connection. Connect your GitHub account using your profile link.');
  f.add('101');state=f.c.getStudentGithubState_('one@example.com','T1',[],'');
  assert.match(state.githubText,/could not verify/);assert.equal(state.githubNeedsUsername,false);
});

test('IDs accept only positive decimal text or safe positive integers; blank IDs never match',()=>{
  const f=fixture();
  for(const value of ['',null,undefined,0,-1,'01','1e3',' 1','1.0',NaN,Number.MAX_SAFE_INTEGER+1])assert.equal(f.c.githubId_(value),'');
  assert.equal(f.c.githubId_(123),'123');assert.equal(f.c.githubId_('90071992547409930'),'90071992547409930');
  assert.equal(f.c.githubAuthorMatches_('',''),false);assert.equal(f.c.githubAuthorMatches_('101','102'),false);
});

test('profile preview canonicalizes metadata without saving; explicit confirmation saves and does not provision',()=>{
  const f=fixture();const preview=f.c.previewStudentGithubAccount('https://github.com/TypedName/');
  assert.equal(f.accounts.rows.length,1);assert.equal(preview.account.username,'canonical');assert.equal(preview.account.githubId,'101');
  assert.match(f.calls[0][1],/users\/TypedName$/);
  const result=f.c.confirmStudentGithubAccount(preview.token);
  assert(result.ok);assert.deepEqual(f.accounts.rows[1].slice(3),['canonical','101','Student','https://github.com/canonical']);
  assert.equal(f.calls.length,1);assert.throws(()=>f.c.confirmStudentGithubAccount(preview.token),/expired/);
});

test('null display names stay blank; invalid and non-profile inputs never call GitHub',()=>{
  const f=fixture();
  for(const link of ['canonical','http://github.com/user','https://evil.example/u','https://github.com/u/r','https://github.com/settings','https://github.com/u?tab=repositories','https://github.com/u#x','https://user@github.com/u','https://github.com/u/issues'])assert.throws(()=>f.c.previewStudentGithubAccount(link),/profile/);
  assert.equal(f.calls.length,0);f.response(()=>account(101,'canonical',null));
  f.c.confirmStudentGithubAccount(f.c.previewStudentGithubAccount('https://github.com/canonical').token);
  assert.equal(f.accounts.rows[1][5],'');
});

test('nonexistent, bot, organization, malformed and unavailable accounts never register',()=>{
  for(const response of [{status:404},{status:503},account(0),account(101,'canonical'),account(101,'canonical')]) {
    const f=fixture();if(response.body&&response.body.id===101)response.body.type='Organization';
    f.response(()=>response);assert.throws(()=>f.c.previewStudentGithubAccount('https://github.com/canonical'));
    assert.equal(f.accounts.rows.length,1);
  }
  const f=fixture();const bot=account();bot.body.type='Bot';f.response(()=>bot);assert.throws(()=>f.c.previewStudentGithubAccount('https://github.com/canonical'),/personal/);
});

test('confirmation tokens are student-bound, expire, and cannot bypass protected IDs or duplicate checks',()=>{
  const f=fixture(),p=f.c.previewStudentGithubAccount('https://github.com/canonical');
  f.user('two@example.com');assert.throws(()=>f.c.confirmStudentGithubAccount(p.token),/another student/);
  f.user('one@example.com');const cached=JSON.parse(f.cache.get('github-confirm:'+p.token));cached.expires=0;f.cache.set('github-confirm:'+p.token,JSON.stringify(cached));
  assert.throws(()=>f.c.confirmStudentGithubAccount(p.token),/expired/);
  const q=f.c.previewStudentGithubAccount('https://github.com/canonical');f.add('999');
  assert.throws(()=>f.c.confirmStudentGithubAccount(q.token),/cannot be replaced/);assert.equal(f.accounts.rows[1][4],'999');
  f.accounts.rows.splice(1);f.add('101','two@example.com');assert.throws(()=>f.c.confirmStudentGithubAccount(q.token),/another student/);
});

test('a competing save is rechecked; same-account confirmation preserves the timestamp; outages never erase IDs',()=>{
  const f=fixture(),p=f.c.previewStudentGithubAccount('https://github.com/canonical'),q=f.c.previewStudentGithubAccount('https://github.com/canonical');
  f.c.confirmStudentGithubAccount(p.token);const timestamp=f.accounts.rows[1][0];f.c.confirmStudentGithubAccount(q.token);
  assert.equal(f.accounts.rows.length,2);assert.equal(f.accounts.rows[1][0],timestamp);
  f.response(()=>({status:503}));assert.throws(()=>f.c.previewStudentGithubAccount('https://github.com/other'));
  assert.equal(f.accounts.rows[1][4],'101');assert.throws(()=>f.c.submitStudentGithubUsername('other'),/confirm/);
});

test('durable ID resolution refreshes metadata without changing ID or timestamp, and caches per request',()=>{
  const f=fixture();f.add();const original=f.accounts.rows[1][0];const cache=new Map();
  const resolved=f.c.resolveGithubAccountId_('101',f.c.makeGithubRequest,cache);f.c.resolveGithubAccountId_('101',f.c.makeGithubRequest,cache);
  f.c.refreshGithubAccountMetadata_(f.accounts.rows[1],resolved);
  assert.equal(f.calls.length,1);assert.equal(f.calls[0][1],'/user/101');assert.equal(f.accounts.rows[1][0],original);
  assert.deepEqual(f.accounts.rows[1].slice(3),['canonical','101','Student','https://github.com/canonical']);
  f.response(()=>({status:503}));assert.throws(()=>f.c.resolveGithubAccountId_('101'));
  assert.equal(f.accounts.rows[1][4],'101');assert(!f.calls.some(c=>c[1].startsWith('/users/')));
});

test('Release 2 provisioning starts from IDs and rejects collaborator/invitation ID mismatches',()=>{
  const f=fixture();f.add();f.add('102','two@example.com','old-second');
  const setup=f.c.getTeamGithubSetup_('T1');assert(setup.ready);assert.equal(setup.members[0].username,'canonical');
  assert(f.calls.some(c=>c[1].includes('/collaborators/canonical/permission')));
  f.response((method,path)=>path.startsWith('/user/')?account(Number(path.split('/').pop()),'current'):
    path.includes('/invitations?')?{status:200,body:[{invitee:{id:999,login:'current'},permissions:'write'}]}:
    path.includes('/permission')?{status:200,body:{permission:'write',user:{id:999}}}:{status:200,body:{}});
  assert.equal(f.c.getTeamGithubSetup_('T1').ready,false);
  assert.throws(()=>f.c.ensureGithubPermission_('org/team','current','push',[],'101'),/ID conflict/);
});

test('Release 2 missing IDs and failed ID lookup never trigger username provisioning fallback',()=>{
  const f=fixture();f.add('');f.add('102','two@example.com');f.response(()=>({status:503}));
  const setup=f.c.getTeamGithubSetup_('T1');assert.equal(setup.ready,false);assert(setup.verificationUnavailable);
  assert(f.calls.every(c=>!c[1].startsWith('/users/')));
});

test('ID evidence ignores names and system labels: only a positive match counts',()=>{
  const f=fixture();f.add();f.add('102','two@example.com');f.properties.set(f.c.commitCollectionKey_('T1'),'ok');
  f.commit(1,'101');f.commit(2,'102');f.commit(3,'999',{message:'Initial commit: Capstone project for Team T1'});f.commit(4,'101',{message:'System classification does not override matching ID'});
  f.commit(5,'');f.c.githubJournalWrite_('commit',f.c.githubCommitKey_('https://github.com/org/team',sha(5)),'','unlinked','',null,'');
  const student={email:'one@example.com',teamId:'T1',regNo:'001'};
  assert.equal(f.c.readWeeklyProgressEvidence_(student,'W1').count,2);
  f.accounts.rows[1][3]='renamed';f.commits.rows[1][3]='old-reassigned';
  assert.equal(f.c.readWeeklyProgressEvidence_(student,'W1').count,2);
  assert.equal(f.c.loadStudentWeeklyActivity().teams.t1.commits,2);
  f.commit(6,'');assert.equal(f.c.readWeeklyProgressEvidence_(student,'W1').count,null);assert.equal(f.c.loadStudentWeeklyActivity().teams.t1.commits,null);
});

test('schema setup is authorized, idempotent, preserves unrelated data and rejects duplicate headers',()=>{
  const f=fixture();assert.throws(()=>f.c.setupGitHubIdentityMigrationStorage(),/Coordinator/);f.admin();
  f.accounts.rows[0].push('Unrelated');f.add();f.accounts.rows[1].push('retain');const before=JSON.stringify(f.accounts.rows);
  f.c.setupGitHubIdentityMigrationStorage();assert.equal(JSON.stringify(f.accounts.rows),before);
  assert.equal(f.commits.rows[0].filter(x=>x==='GitHub Author ID').length,1);
  f.accounts.rows[0].push('GitHub ID');assert.throws(()=>f.c.setupGitHubIdentityMigrationStorage(),/Duplicate/);
});

test('audit performs no writes and reports canonical proposals, missing accounts and paged duplicate claims',()=>{
  const f=fixture();f.add('');f.add('','two@example.com','other');f.admin();
  const before=JSON.stringify([...f.sheets.values()].map(s=>s.rows));
  const first=f.c.auditGitHubIdentityMigration({limit:1});const second=f.c.auditGitHubIdentityMigration({limit:1,cursor:first.nextCursor,proposals:first.proposals});
  assert(second.completeDataset);assert.equal(second.duplicates.length,2);assert.equal(JSON.stringify([...f.sheets.values()].map(s=>s.rows)),before);
  f.response(()=>({status:404}));assert.equal(f.c.auditGitHubIdentityMigration().outcomes[0].outcome,'unresolvable');
});

test('account application stages all batches before writing and detects duplicates spanning batches',()=>{
  const f=fixture();f.add('');f.add('','two@example.com','other');f.admin();
  assert.equal(f.c.applyGitHubIdentityMigration({limit:1}).phase,'resolve');assert.equal(f.accounts.rows[1][4],'');
  f.c.applyGitHubIdentityMigration({limit:1});assert.equal(f.accounts.rows[1][4],'');
  const result=f.migrate();assert(result.requiresReview.some(r=>r.outcome==='conflict'));assert.equal(f.accounts.rows[1][4],'');assert.equal(f.accounts.rows[2][4],'');
});

test('account migration resumes, preserves timestamps and unrelated data, and is safe to repeat',()=>{
  const f=fixture();f.add('');f.add('','two@example.com','second');f.response((method,path)=>account(path.endsWith('second')?102:101,path.endsWith('second')?'second':'canonical'));
  f.accounts.rows[0].push('Extra');f.accounts.rows[1].push('retained');const timestamp=f.accounts.rows[1][0];
  const result=f.migrate();assert(result.done);assert.equal(f.accounts.rows[1][4],'101');assert.equal(f.accounts.rows[2][4],'102');
  assert.equal(f.accounts.rows[1][0],timestamp);assert.equal(f.accounts.rows[1][7],'retained');const before=JSON.stringify(f.accounts.rows);f.migrate();assert.equal(JSON.stringify(f.accounts.rows),before);
});

test('migration API failures and returned-ID conflicts cannot clear established IDs',()=>{
  const f=fixture();f.add();f.response(()=>({status:503}));f.migrate();assert.equal(f.accounts.rows[1][4],'101');
  f.response(()=>account(999));f.admin();const audit=f.c.auditGitHubIdentityMigration();assert.notEqual(audit.outcomes[0].outcome,'proposed');assert.equal(f.accounts.rows[1][4],'101');
});

test('historical backfill uses exact repository/SHA outside current window and preserves original columns',()=>{
  const f=fixture();f.commit(1,'',{date:'2020-01-01T00:00:00Z'});f.commit(2,'777');const before=JSON.stringify(f.commits.rows.map(r=>r.slice(0,6)));
  f.response((method,path)=>({status:200,body:{sha:path.split('/').pop(),author:{id:101}}}));f.admin();
  const result=f.c.backfillCommitAuthorIds({limit:1});assert.equal(result.outcomes[0].outcome,'resolved');assert(f.calls[0][1].endsWith('/commits/'+sha(1)));
  f.c.backfillCommitAuthorIds({cursor:result.nextCursor});assert.equal(f.commits.rows[2][6],'777');assert.equal(JSON.stringify(f.commits.rows.map(r=>r.slice(0,6))),before);
  const calls=f.calls.length;f.c.backfillCommitAuthorIds();assert.equal(f.calls.length,calls);
});

test('backfill separately reports unlinked, missing, inaccessible, transient and concurrent conflicting IDs',()=>{
  for(const kind of ['unlinked','missing-commit','inaccessible-repository','api-failure','conflict']) {
    const f=fixture();f.commit(1);f.admin();
    f.response((method,path)=>{
      if(kind==='conflict'){f.commits.rows[1][6]='999';return {status:200,body:{sha:sha(1),author:{id:101}}};}
      if(kind==='unlinked')return {status:200,body:{sha:sha(1),author:null}};
      if(kind==='api-failure')return {status:503};
      return path.includes('/commits/')?{status:404}:{status:kind==='missing-commit'?200:404,body:{}};
    });
    assert.equal(f.c.backfillCommitAuthorIds().outcomes[0].outcome,kind);
    assert.equal(f.commits.rows[1][6],kind==='conflict'?'999':'');
    const read=f.c.readCollectedCommits_()[0];assert.equal(read.authorResolution,kind==='unlinked'?'unlinked':'unavailable');
  }
});

test('backfill is resumable, retries failures, and includes commits appended while batches run',()=>{
  const f=fixture();f.commit(1);f.commit(2);f.admin();f.response(()=>({status:503}));const first=f.c.backfillCommitAuthorIds({limit:1});
  f.commit(3);f.response((m,p)=>({status:200,body:{sha:p.split('/').pop(),author:{id:101}}}));
  let result=f.c.backfillCommitAuthorIds({limit:1,cursor:first.nextCursor});assert.equal(result.done,false);
  result=f.c.backfillCommitAuthorIds({cursor:result.nextCursor});assert(result.done);
  f.c.backfillCommitAuthorIds({retryFailed:true});assert(f.commits.rows.slice(1).every(r=>r[6]==='101'));
});

for(const release of [1,2])test('Release '+release+' verification separates unregistered students from registration migration failures',()=>{
  const f=fixture(release);f.add();f.admin();
  const before=JSON.stringify([...f.sheets].map(([name,s])=>[name,s.rows]));
  let result=f.c.verifyGitHubIdentityMigration();
  assert.equal(result.ready,true);assert.equal(result.accountCounts.available,1);assert.equal(result.accountCounts.notRegistered,1);
  assert.equal(result.notRegistered[0].email,'two@example.com');assert.equal(result.notRegistered[0].state,'unavailable');
  assert.equal(JSON.stringify([...f.sheets].map(([name,s])=>[name,s.rows])),before);
  f.add('','two@example.com');result=f.c.verifyGitHubIdentityMigration();
  assert.equal(result.ready,false);assert.equal(result.accountCounts.migrationUnresolved,1);assert.equal(result.accountCounts.notRegistered,0);
  f.accounts.rows[2][4]='101';result=f.c.verifyGitHubIdentityMigration();
  assert.equal(result.ready,false);assert.equal(result.accountCounts.migrationConflict,2);
  f.accounts.rows[2][4]='102';assert.equal(f.c.verifyGitHubIdentityMigration().ready,true);
  f.add('103','orphan@example.com');result=f.c.verifyGitHubIdentityMigration();
  assert.equal(result.ready,false);assert.equal(result.registrations[2].status,'migrationConflict');
});

test('Release 2 unregistered activity and evidence remain null until normal confirmed registration',()=>{
  const f=fixture(2);f.time('2026-01-02T12:00:00Z');f.properties.set(f.c.commitCollectionKey_('T1'),'ok');f.commit(1,'101');f.commit(2,'999');
  const student=f.c.weeklyStudents_().find(s=>s.email==='one@example.com');
  assert.equal(f.c.loadStudentWeeklyActivity().teams.t1.commits,null);
  assert.equal(f.c.readWeeklyProgressEvidence_(student,'W1').count,null);
  assert.equal(f.c.readWeeklyProgressEvidence_(student,'W1').state,'unavailable');
  f.c.confirmStudentGithubAccount(f.c.previewStudentGithubAccount('https://github.com/canonical').token);
  f.response((method,path)=>{if(path.startsWith('/users/'))throw Error('Legacy lookup forbidden');return account(101,'renamed');});
  assert.equal(f.c.loadStudentWeeklyActivity().teams.t1.commits,1);
  const evidence=f.c.readWeeklyProgressEvidence_(student,'W1');assert.equal(evidence.state,'available');assert.equal(evidence.count,1);
});

test('unresolved commits block verification but confirmed unlinked history and unregistered students do not',()=>{
  const f=fixture();f.add();f.commit(1);f.admin();
  let result=f.c.verifyGitHubIdentityMigration();assert.equal(result.ready,false);assert.equal(result.commits.unresolved.length,1);
  f.response(()=>({status:200,body:{sha:sha(1),author:null}}));f.c.backfillCommitAuthorIds();
  result=f.c.verifyGitHubIdentityMigration();assert.equal(result.ready,true);assert.equal(result.commits.unlinked,1);assert.equal(result.commits.unresolved.length,0);assert.equal(result.notRegistered.length,1);
});

test('verification requires mapped registrations and complete resolution evidence, not just empty author-ID cells',()=>{
  const f=fixture();f.add();f.add('102','two@example.com');f.commit(1);f.admin();assert.equal(f.c.verifyGitHubIdentityMigration().ready,false);
  f.response(()=>({status:200,body:{sha:sha(1),author:null}}));f.c.backfillCommitAuthorIds();assert.equal(f.c.verifyGitHubIdentityMigration().ready,true);
});

test('Release 1 keeps pre-schema capture compatible; Release 2 package has no legacy student matching',()=>{
  const f=fixture(1);f.accounts.rows[0]=accountHeaders.slice();f.commits.rows[0]=commitHeaders.slice();
  assert.equal(f.c.githubIdentityRequiresSchema_(),false);assert.equal(f.c.commitColumns_(f.commits).AUTHOR_ID,-1);
  assert.match(releaseSource('weekly-activity.js',1),/textEquals_\(row.username,source.username\)/);
  assert.doesNotMatch(releaseSource('weekly-activity.js',2),/textEquals_\(row.username|student\.username|source\.username/);
  assert.doesNotMatch(releaseSource('github-identity.js',2),/validateStudentGithubUsername_\(/);
  for(const release of [1,2])for(const file of fs.readdirSync('.').filter(f=>f.endsWith('.js')))new vm.Script(releaseSource(file,release),{filename:file});
});

test('collector captures IDs, preserves null authors, and distinguishes malformed IDs without dedup regression',()=>{
  const f=fixture();
  const commits=[{id:101,login:'canonical'},null,{login:'unlinked',id:null},{id:0,login:'invalid'}].map((author,index)=>({sha:sha(index+1),author,
    commit:{committer:{date:'2026-01-02T00:00:00Z'},message:'Preserved message '+index+'\nExisting first-line policy'}}));
  f.response(()=>({status:200,body:commits}));
  assert.equal(f.c.fetchAllCommits()[0].count,4);assert.equal(f.c.fetchAllCommits()[0].count,0);
  assert.deepEqual(f.commits.rows.slice(1).map(r=>r[6]),['101','','','']);
  assert.deepEqual(Array.from(f.c.readCollectedCommits_(),r=>r.authorResolution),['resolved','unlinked','unlinked','unavailable']);
  assert.equal(f.commits.rows[1][2],'Preserved message 0');
});

test('account audit reports different established IDs for one student without changing either',()=>{
  const f=fixture();f.add('101');f.add('102');f.admin();f.response((m,p)=>account(Number(p.split('/').pop())));
  assert(f.c.auditGitHubIdentityMigration().conflicts.length>0);
  f.migrate();assert.deepEqual(f.accounts.rows.slice(1).map(r=>r[4]),['101','102']);
  assert.equal(f.c.verifyGitHubIdentityMigration().ready,false);
});

function stagingFixture(count=177) {
  const f=fixture(),students=[],writes=new Map(),formats=new Map();
  for(let i=0;i<count;i++) {
    const email='student'+i+'@example.com';students.push({email,teamId:'T1',regNo:'R'+i});
    f.accounts.rows.push(['2026-01-01T00:00:00Z',email,'T1','student'+i,'','','']);
  }
  f.c.weeklyStudents_=()=>students;
  f.response((method,path)=>{
    const value=path.split('/').pop(),n=path.startsWith('/user/')?Number(value)-1000:Number(value.replace(/\D/g,''));
    return account(n+1000,'student'+n);
  });
  const journal=f.sheets.get('GitHubIdentityMigration'),range=journal.getRange;
  journal.getRange=(r,c,n=1,w=1)=>{
    const cell=range(r,c,n,w),setValues=cell.setValues;
    cell.setNumberFormat=format=>{for(let i=0;i<n;i++)for(let j=0;j<w;j++)formats.set((r+i)+':'+(c+j),format);return cell;};
    cell.setValues=values=>{
      setValues(values);
      // Simulate Sheets' General-format coercion, which the original fixture omitted.
      values.forEach((row,i)=>row.forEach((value,j)=>{
        if(typeof value==='string'&&/^\d+$/.test(value)&&formats.get((r+i)+':'+(c+j))!=='@')journal.rows[r+i-1][c+j-1]=Number(value);
      }));
      return cell;
    };
    return cell;
  };
  const write=f.c.writeGithubAccount_;
  f.c.writeGithubAccount_=(sheet,row,...args)=>{writes.set(row,(writes.get(row)||0)+1);return write(sheet,row,...args);};
  f.admin();
  function seed(index,id=index+1000,source) {
    const row=f.c.readSheetRows_(f.accounts,index+2,1)[0];
    const resolved={githubId:String(id),username:'student'+index,displayName:'Student',profileUrl:'https://github.com/student'+index};
    journal.rows.push(['account',index+2,source||f.c.githubMigrationAccountSource_(row,students),'proposed',String(id),JSON.stringify(resolved),new Date(),'']);
  }
  return {...f,students,journal,writes,formats,seed};
}

test('177 General-format registration keys stage in four bounded batches and apply each registration once',()=>{
  const f=stagingFixture();
  for(const expected of [50,100,150,177]) {
    const result=f.c.applyGitHubIdentityMigration({limit:50});
    assert.equal(result.phase,'resolve');assert.equal(result.staging.effectiveStaged,expected);
    assert.equal(f.writes.size,0);assert.equal(f.journal.rows.length,expected+1);
  }
  const calls=f.calls.length;
  for(const expected of [50,100,150,177]) {
    const result=f.c.applyGitHubIdentityMigration({limit:50});
    assert.equal(result.phase,'apply');assert.equal(result.staging.effectiveStaged,177);
    assert.equal(f.writes.size,expected);assert.equal(result.done,expected===177);
  }
  assert.equal(f.calls.length,calls);assert([...f.writes.values()].every(n=>n===1));
  for(let i=0;i<3;i++)assert(f.c.applyGitHubIdentityMigration({limit:50}).done);
  assert.equal(f.journal.rows.length,178);assert([...f.writes.values()].every(n=>n===1));
  assert(f.journal.rows.slice(1).every((r,i)=>typeof r[1]==='string'&&f.formats.get((i+2)+':2')==='@'));
});

test('242 existing numeric/string duplicate account rows collapse by current source without deleting history',()=>{
  const f=stagingFixture();
  for(let i=0;i<100;i++)f.seed(i);
  for(let i=0;i<142;i++){f.seed(i%100);if(i%2)f.journal.rows.at(-1)[1]=String(i%100+2);}
  assert.equal(f.journal.rows.length-1,242);
  const before=JSON.stringify(f.journal.rows),inspection=f.c.inspectGitHubIdentityMigrationStaging();
  assert.equal(inspection.effectiveStaged,100);assert.equal(JSON.stringify(f.journal.rows),before);
  assert.equal(f.c.applyGitHubIdentityMigration({limit:50}).staging.effectiveStaged,150);
  assert.equal(f.writes.size,0);
  assert.equal(f.c.applyGitHubIdentityMigration({limit:50}).staging.effectiveStaged,177);
  const physical=f.journal.rows.length;let result;
  for(let i=0;i<4;i++)result=f.c.applyGitHubIdentityMigration({limit:50});
  assert(result.done);assert.equal(result.staging.effectiveStaged,177);assert.equal(f.journal.rows.length,physical);
  assert.equal(f.writes.size,177);assert([...f.writes.values()].every(n=>n===1));
  assert(f.journal.rows.some(r=>r[3]==='superseded'));
  assert(f.c.applyGitHubIdentityMigration({limit:50}).done);assert.equal(f.journal.rows.length,physical);
});

test('changed snapshots restage in place and block all application until unique staging is complete',()=>{
  const f=stagingFixture();for(let i=0;i<177;i++)f.seed(i);
  f.accounts.rows[1][3]='renamed0';
  const before=f.journal.rows.length;
  const result=f.c.applyGitHubIdentityMigration({limit:50});
  assert.equal(result.phase,'resolve');assert.equal(result.outcomes.length,1);assert.equal(result.outcomes[0].row,2);
  assert.equal(f.writes.size,0);assert.equal(result.staging.effectiveStaged,177);assert.equal(f.journal.rows.length,before);
  assert.equal(f.c.applyGitHubIdentityMigration({limit:50}).phase,'apply');
});

test('staging and account-write interruptions resume without duplicate proposals or repeated account application',()=>{
  const f=stagingFixture(),journalWrite=f.c.githubJournalWrite_;let staged=0;
  f.c.githubJournalWrite_=(...args)=>{if(++staged===18)throw Error('Interrupted staging');return journalWrite(...args);};
  assert.throws(()=>f.c.applyGitHubIdentityMigration({limit:50}),/Interrupted/);
  assert.equal(f.c.inspectGitHubIdentityMigrationStaging().effectiveStaged,17);
  f.c.githubJournalWrite_=journalWrite;
  while(!f.c.inspectGitHubIdentityMigrationStaging().complete)f.c.applyGitHubIdentityMigration({limit:50});
  assert.equal(f.journal.rows.length,178);assert.equal(f.writes.size,0);
  let interrupt=true;
  f.c.githubJournalWrite_=(...args)=>{if(args[3]==='migrated'&&interrupt){interrupt=false;throw Error('Interrupted after account write');}return journalWrite(...args);};
  assert.throws(()=>f.c.applyGitHubIdentityMigration({limit:50}),/Interrupted after/);
  assert.equal(f.writes.get(2),1);f.c.githubJournalWrite_=journalWrite;
  let result;for(let i=0;i<8;i++){result=f.c.applyGitHubIdentityMigration({limit:50});if(result.done)break;}
  assert(result.done);assert.equal(f.writes.size,177);assert([...f.writes.values()].every(n=>n===1));assert.equal(f.journal.rows.length,178);
});

test('conflicting duplicate proposals and established IDs remain protected during duplicate collapse',()=>{
  const f=stagingFixture(2);f.seed(0);f.seed(0,9999);f.seed(1,1000);
  const result=f.c.applyGitHubIdentityMigration({limit:50});
  assert.equal(f.writes.size,0);assert(result.requiresReview.every(r=>r.outcome==='conflict'));
  assert.equal(f.c.verifyGitHubIdentityMigration().ready,false);
  f.accounts.rows[1][4]='5555';f.response(()=>account(9999,'student0'));
  const retry=f.c.applyGitHubIdentityMigration({limit:50,retryFailed:true});
  assert.equal(retry.phase,'resolve');assert.equal(f.accounts.rows[1][4],'5555');assert.equal(f.writes.size,0);
});

test('an in-flight staging result cannot overwrite another invocation completed outcome',()=>{
  const f=stagingFixture(1);
  f.response(()=>{f.seed(0);return account(1000,'student0');});
  const result=f.c.applyGitHubIdentityMigration({limit:50});
  assert.equal(result.outcomes[0].outcome,'already-staged');assert.equal(f.journal.rows.length,2);
  assert.equal(f.c.applyGitHubIdentityMigration({limit:50}).done,true);assert.equal(f.writes.get(2),1);
});

test('a newly appended registration closes the global apply barrier until it is staged',()=>{
  const f=stagingFixture(1);f.seed(0);
  const lock=f.c.githubIdentityLock_;let added=false;
  f.c.githubIdentityLock_=run=>lock(()=>{
    if(!added) {
      added=true;f.students.push({email:'student1@example.com',teamId:'T1',regNo:'R1'});
      f.accounts.rows.push(['2026-01-01T00:00:00Z','student1@example.com','T1','student1','','','']);
    }
    return run();
  });
  const result=f.c.applyGitHubIdentityMigration({limit:50});
  assert.equal(result.phase,'resolve');assert.equal(result.staging.complete,false);assert.equal(f.writes.size,0);
  assert.equal(f.c.applyGitHubIdentityMigration({limit:50}).staging.effectiveStaged,2);assert.equal(f.writes.size,0);
  assert(f.c.applyGitHubIdentityMigration({limit:50}).done);assert.equal(f.writes.size,2);
});
