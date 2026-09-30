const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {weeklyFixture}=require('./weekly-progress-fixture.cjs');
const headers=['Date','Team ID','Commit Message','GitHub Username','Repository URL','Commit SHA','GitHub Author ID'];
const sha=n=>n.toString(16).padStart(40,'0');
const commit=(n,extra={})=>({sha:sha(n),author:{login:'github-user',id:123},commit:{author:{name:'Student Name',email:'github@example.com'},committer:{date:'2026-01-01T12:00:00Z'},message:'Commit '+n+'\nMore details'},...extra});
function fixture() {
 const f=weeklyFixture(),calls=[],logs=[];
 f.sheet('Commits',[headers.slice()]);f.set('Repo URL','https://github.com/org/team.repo.git');
 f.c.Logger={log:message=>logs.push(message)};
 vm.runInContext(fs.readFileSync('github-provisioning.js','utf8'),f.c);
 f.properties.set('GITHUB_ADMIN_TOKEN','authoritative-test-token');f.properties.set('GITHUB_TOKEN','obsolete-test-token');
 let response=()=>({status:200,body:[commit(1)]});
 f.c.UrlFetchApp={fetch:(url,options)=>{calls.push({url,options});const value=response(url,options);return {getResponseCode:()=>value.status,getContentText:()=>JSON.stringify(value.body)};}};
 return {...f,calls,logs,response:fn=>{response=fn;},commits:()=>f.sheets.get('Commits').rows};
}

test('schema preserves A:F and requires a unique appended author ID without moving history',()=>{
 const f=fixture(),sheet=f.sheets.get('Commits');
 assert.equal(f.c.commitColumns_(sheet).SHA,5);
 assert.equal(Object.keys(f.c.commitColumns_(sheet)).length,7);
 for(const invalid of [headers.slice(0,5).concat('',headers[5]),headers.concat('GitHub Author ID')]) {
  sheet.rows[0]=invalid;
  const before=JSON.stringify(sheet.rows);
  assert.throws(()=>f.c.auditCommitHistory(),/header mismatch|Duplicate|Migration required/);
  assert.throws(()=>f.c.appendCollectedCommits_(sheet,'T1',[commit(1)],'https://github.com/org/team'),/header mismatch|Duplicate|Migration required/);
  assert.equal(JSON.stringify(sheet.rows),before);
 }
});

test('commit collection reuses authoritative helper/token, preserves dotted URL, and appends once by SHA',()=>{
 const f=fixture(),url=f.status.rows[1][f.ts.indexOf('Repo URL')];
 const first=f.c.fetchAllCommits();assert.equal(first[0].count,1);assert.equal(f.commits().length,2);
 assert.equal(f.properties.get(f.c.commitCollectionKey_('T1')),'ok');
 assert.match(f.calls[0].url,/\/repos\/org\/team\.repo\/commits\?/);
 assert.equal(f.calls[0].options.headers.Authorization,'token authoritative-test-token');
 assert.equal(f.status.rows[1][f.ts.indexOf('Repo URL')],url);
 assert.deepEqual(f.commits()[0],headers);
 assert.equal(f.commits()[1][0].toISOString(),'2026-01-01T12:00:00.000Z');assert.equal(f.commits()[1][1],'T1');assert.equal(f.commits()[1][2],'Commit 1');assert.equal(f.commits()[1][3],'github-user');assert.equal(f.commits()[1][4],url);assert.equal(f.commits()[1][5],sha(1));
 const second=f.c.fetchAllCommits();assert.equal(second[0].count,0);assert.equal(second[0].skipped,1);assert.equal(f.commits().length,2);
 assert(!f.logs.join('\n').includes('authoritative-test-token'));assert(!f.logs.join('\n').includes('obsolete-test-token'));
});

test('missing authoritative token never falls back to legacy token',()=>{
 const f=fixture();f.properties.delete('GITHUB_ADMIN_TOKEN');const result=f.c.fetchAllCommits();
 assert.match(result[0].error,/GITHUB_ADMIN_TOKEN not configured/);assert.equal(f.calls.length,0);assert.equal(f.commits().length,1);
 assert.equal(f.properties.get(f.c.commitCollectionKey_('T1')),'error');
});

test('401, access denial, rate limits and empty repository are distinct from missing repositories',()=>{
 for(const [status,message,code] of [[401,'Bad credentials','AUTHENTICATION_FAILED'],[403,'Resource not accessible by personal access token','ACCESS_DENIED'],[403,'API rate limit exceeded','RATE_LIMITED'],[429,'Too many requests','RATE_LIMITED']]) {
  const f=fixture();f.response(()=>({status,body:{message}}));const result=f.c.fetchAllCommits();assert.equal(result[0].code,code);assert.equal(f.commits().length,1);
 }
 const f=fixture();f.response(()=>({status:409,body:{message:'Git Repository is empty.'}}));assert.equal(f.c.fetchAllCommits()[0].count,0);assert.equal(f.commits().length,1);
});

test('404 probes demonstrate repository existence, rejected credentials, or explicit missing/access ambiguity',()=>{
 for(const [repoStatus,identityStatus,code] of [[200,200,'COMMIT_ACCESS_OR_RESOURCE_UNAVAILABLE'],[404,401,'AUTHENTICATION_FAILED'],[404,200,'REPOSITORY_MISSING_OR_INACCESSIBLE'],[404,403,'REPOSITORY_MISSING_OR_INACCESSIBLE'],[401,200,'AUTHENTICATION_FAILED']]) {
  const f=fixture();f.response(url=>({status:url.includes('/commits?')?404:url.endsWith('/user')?identityStatus:repoStatus,body:{message:'Not Found'}}));
  const result=f.c.fetchAllCommits();assert.equal(result[0].code,code);assert.equal(f.commits().length,1);
  if(repoStatus===200)assert.match(result[0].error,/repository exists/);
  if(code==='REPOSITORY_MISSING_OR_INACCESSIBLE')assert.match(result[0].error,/cannot prove deletion/);
  assert(f.calls.every(call=>call.options.method==='GET'));
 }
});

test('pagination collects all pages and deduplicates repeated API SHAs',()=>{
 const f=fixture();f.response(url=>({status:200,body:url.includes('&page=1')?Array.from({length:100},(_,i)=>commit(i+1)):[commit(100),commit(101)]}));
 const result=f.c.fetchAllCommits();assert.equal(result[0].fetched,102);assert.equal(result[0].count,101);assert.equal(result[0].skipped,1);assert.equal(f.calls.length,2);
 const again=f.c.fetchAllCommits();assert.equal(again[0].count,0);assert.equal(f.commits().length,102);
});

test('later page failure and malformed response never write partial collection',()=>{
 const f=fixture();f.response(url=>url.includes('&page=1')?{status:200,body:Array.from({length:100},(_,i)=>commit(i+1))}:{status:500,body:{message:'Server error'}});
 assert.equal(f.c.fetchAllCommits()[0].code,'GITHUB_API_ERROR');assert.equal(f.commits().length,1);
 f.response(()=>({status:200,body:{unexpected:true}}));assert.match(f.c.fetchAllCommits()[0].error,/expected an array/);
 f.response(()=>({status:200,body:[commit(1),commit(2,{sha:'bad'})]}));assert.match(f.c.fetchAllCommits()[0].error,/Invalid commit/);assert.equal(f.commits()[0].length,7);
});

test('76 historical rows across 61 teams are preserved; SHA is global and readers retain date/team/username',()=>{
 const f=fixture(),sheet=f.sheets.get('Commits');
 for(let i=1;i<=76;i++)sheet.rows.push([new Date('2026-01-01'),'T'+((i-1)%61+1),'Historical '+i,'old-user','https://github.com/org/old',''+sha(i)]);
 const before=JSON.stringify(sheet.rows);
 f.response(()=>({status:200,body:[commit(1),commit(76)]}));
 assert.equal(f.c.fetchAllCommits()[0].count,0);assert.equal(f.c.fetchAllCommits()[0].count,0);
 assert.equal(JSON.stringify(sheet.rows),before);
 const audit=f.c.auditCommitHistory();assert.equal(audit.rowCount,76);assert.equal(audit.uniqueSHAs,76);assert.equal(audit.teamCount,61);assert.equal(audit.confirmedDuplicates.length,0);
 const read=f.c.readCollectedCommits_('T1');assert.equal(read.length,2);assert.equal(read[0].username,'old-user');assert.equal(read[0].timestamp.toISOString(),'2026-01-01T00:00:00.000Z');
 f.response(()=>({status:200,body:[commit(77,{author:null})]}));assert.equal(f.c.fetchAllCommits()[0].count,1);
 assert.equal(JSON.stringify(sheet.rows.slice(0,77)),before);assert.equal(sheet.rows[77][3],'(unknown)');assert.equal(sheet.rows[77][5],sha(77));
});

test('stale headers fail closed; correcting only A1:F1 makes unchanged history readable',()=>{
 const f=fixture(),sheet=f.sheets.get('Commits');
 sheet.rows[0]=['Team ID','SHA','Author Name','| Author Email','Date','Message'];
 sheet.rows.push([new Date('2026-01-01'),'T1','Historical','user','https://github.com/org/team.repo.git',sha(1)]);
 const before=JSON.stringify(sheet.rows);
 assert.throws(()=>f.c.appendCollectedCommits_(sheet,'T1',[commit(2)],'https://github.com/org/team.repo.git'),/header mismatch/);
 assert.equal(JSON.stringify(sheet.rows),before);assert.equal(f.locked(),false);
 sheet.getRange(1,1,1,6).setValues([headers.slice()]);
 assert.equal(JSON.stringify(sheet.rows.slice(1)),JSON.stringify(JSON.parse(before).slice(1)));
 assert.equal(f.c.fetchAllCommits()[0].count,0);assert.equal(f.c.readCollectedCommits_('T1')[0].username,'user');
});

test('read-only audit reports duplicate SHA row numbers and unidentified rows without deleting',()=>{
 const f=fixture(),sheet=f.sheets.get('Commits'),date=new Date('2026-01-01');
 sheet.rows.push([date,'T1','Message','user','https://github.com/org/repo',sha(1).toUpperCase()],[date,'T2','Message','user','https://github.com/org/repo',sha(1)],[date,'T1','Old','user','https://github.com/org/repo','']);
 const before=JSON.stringify(sheet.rows),report=f.c.auditCommitHistory();
 assert.equal(report.confirmedDuplicates.length,1);assert.deepEqual(Array.from(report.confirmedDuplicates[0].rows),[2,3]);
 assert.deepEqual(Array.from(report.unidentifiedRows),[4]);
 assert.equal(JSON.stringify(sheet.rows),before);f.c.fetchAllCommits();assert.equal(JSON.stringify(sheet.rows),before);
});

test('dedup reads history after acquiring lock, including a competing run append',()=>{
 const f=fixture(),sheet=f.sheets.get('Commits');let held=false;
 f.c.LockService={getScriptLock:()=>({hasLock:()=>held,waitLock:()=>{held=true;sheet.rows.push([new Date('2026-01-01'),'T9','Concurrent','user','https://github.com/org/repo',sha(1)]);},releaseLock:()=>{held=false;}})};
 assert.equal(f.c.fetchAllCommits()[0].count,0);assert.equal(sheet.rows.length,2);assert.equal(held,false);
});

test('commit writer holds lock for read/dedup/append and releases it on sheet failure',()=>{
 const f=fixture(),sheet=f.sheets.get('Commits'),getRange=sheet.getRange;
 sheet.getRange=(...args)=>{const range=getRange(...args),write=range.setValues;range.setValues=function(values){assert.equal(f.locked(),true);if(args[0]>1)throw Error('write failed');return write.call(this,values);};return range;};
 const result=f.c.fetchAllCommits();assert.match(result[0].error,/write failed/);assert.equal(f.locked(),false);assert.equal(sheet.rows.length,1);
});
