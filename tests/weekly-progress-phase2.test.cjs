const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');
const {weeklyFixture}=require('./weekly-progress-fixture.cjs');
const ratings={technical_substance:'HIGH',specificity:'MEDIUM',outcome:'LOW',next_action:'HIGH',github_support:'MEDIUM',comment:'Specific engineering work with a clear next step.'};
function fixture() {
  const f=weeklyFixture();let worker=false,fetches=[];
  f.c.Session.getEffectiveUser=()=>({getEmail:()=> 'coord@example.com'});
  f.c.LockService.getUserLock=()=>({tryLock:()=>{if(worker)return false;worker=true;return true;},releaseLock:()=>{worker=false;}});
  f.set('Guide Email','guide@example.com');
  f.sheet('GitHubAccounts',[['Timestamp','Email address','Team ID','GitHub Username','GitHub ID','GitHub Display Name','GitHub Profile URL'],
    ['', 'one@example.com','T1','alice','101','Alice Person','https://github.com/alice'],
    ['', 'two@example.com','T1','bob','102','Bob Person','https://github.com/bob']]);
  f.user('coord@example.com');f.c.setupWeeklyProgressPhase2Storage();
  f.properties.set('GEMINI_API_KEY','secret-key');f.c.setupWeeklyProgressPhase2Triggers();f.user('one@example.com');
  let respond=()=>({code:200,body:JSON.stringify({steps:[{type:'model_output',content:[{type:'text',text:JSON.stringify(ratings)}]}]})});
  f.c.UrlFetchApp={fetch:(url,options)=>{
    assert.equal(f.locked(),false,'network request must not hold student-write lock');
    assert(worker,'worker lock must be held');
    fetches.push({url,...options});const response=respond(fetches.length,options);
    return {getResponseCode:()=>response.code,getContentText:()=>response.body};
  }};
  // Production runs the worker from a time trigger, where no signed-in user is visible.
  const aiWorker=f.c.processWeeklyProgressAI;
  f.c.processWeeklyProgressAI=(...args)=>{const session=f.c.Session.getActiveUser;f.c.Session.getActiveUser=()=>({getEmail:()=> ''});try{return aiWorker(...args);}finally{f.c.Session.getActiveUser=session;}};
  return {...f,fetches,respond:fn=>{respond=fn;},worker:()=>worker,occupy:()=>{worker=true;},
    signs:()=>f.c.weeklyPhase2Rows_('GuideSignoff'),analyses:()=>f.c.weeklyPhase2Rows_('AIProgressAnalysis')};
}

test('Phase 2 provisioning is coordinator-only, idempotent, and preserves existing sheets/triggers',()=>{
  const f=fixture(),before=JSON.stringify([...f.sheets].map(([name,sheet])=>[name,sheet.rows]));
  assert.throws(()=>f.c.setupWeeklyProgressPhase2Storage(),/Coordinator/);
  f.user('coord@example.com');f.c.setupWeeklyProgressPhase2Storage();f.c.setupWeeklyProgressPhase2Triggers();
  assert.equal(JSON.stringify([...f.sheets].map(([name,sheet])=>[name,sheet.rows])),before);
  assert.equal(f.triggers.length,1);assert.equal(f.triggers[0].hours,1);
  const unrelated={getHandlerFunction:()=> 'processWeeklySubmissionSchedule'};f.triggers.push(unrelated);
  f.c.setupWeeklyProgressPhase2Triggers();assert(f.triggers.includes(unrelated));assert.equal(f.triggers.length,2);
  assert.equal(f.sheets.get('GuideSignoff').rows[0].join('|'),'Signoff ID|Entry ID|Status|Guide Email|Signed At');
  assert.equal(f.sheets.get('AIProgressAnalysis').rows[0].length,10);
});

test('normalized and reordered Phase 2 headers work; duplicate headers fail closed',()=>{
  const f=fixture(),sheet=f.sheets.get('GuideSignoff');sheet.rows[0].reverse();sheet.rows[0]=sheet.rows[0].map(h=>' '+h.toUpperCase()+' ');
  const entry=f.c.submitWeeklyProgress_(f.input());f.user('guide@example.com');f.c.submitWeeklyGuideSignoff_(entry.entryId,'DISCUSSED');
  assert.equal(f.signs()[0].entryId,entry.entryId);assert.equal(f.signs()[0].guideEmail,'guide@example.com');
  sheet.rows[0].push(' ENTRY ID ');assert.throws(()=>f.signs(),/exactly one/);
});

test('Phase 2 trigger setup retains an existing installation and creates only when absent',()=>{
  const f=fixture();f.user('coord@example.com');
  const installed=f.triggers[0],phase1={getHandlerFunction:()=> 'processWeeklySubmissionSchedule'},unrelated={getHandlerFunction:()=> 'collectCommits'};
  f.triggers.push(phase1,unrelated);
  const create=f.c.ScriptApp.newTrigger;let created=0;
  f.c.ScriptApp.newTrigger=name=>{created++;assert(f.locked());return create(name);};
  f.c.ScriptApp.deleteTrigger=()=>assert.fail('Setup must not delete existing triggers');
  f.c.setupWeeklyProgressPhase2Triggers();f.c.setupWeeklyProgressPhase2Triggers();
  assert.equal(created,0);assert.deepEqual(f.triggers,[installed,phase1,unrelated]);
  f.triggers.splice(0,1);f.c.setupWeeklyProgressPhase2Triggers();
  assert.equal(created,1);assert.equal(f.triggers.length,3);assert(f.triggers.includes(phase1));assert(f.triggers.includes(unrelated));
  const replacement=f.triggers[2];assert.equal(replacement.hours,1);
  f.c.setupWeeklyProgressPhase2Triggers();assert.equal(created,1);assert.equal(f.triggers[2],replacement);
});

test('guide decisions append immutable history; both choices freeze student revisions and retain replay',()=>{
  for(const status of ['DISCUSSED','NOT_DISCUSSED']) {
    const f=fixture(),input=f.input(),entry=f.c.submitWeeklyProgress_(input),log=JSON.stringify(f.entries());
    f.user('guide@example.com');const saved=f.c.submitWeeklyGuideSignoff_(entry.entryId,status),first=JSON.stringify(f.signs()[0]);
    assert.equal(saved.status,status);f.c.submitWeeklyGuideSignoff_(entry.entryId,status);assert.equal(f.signs().length,1);
    f.c.submitWeeklyGuideSignoff_(entry.entryId,status==='DISCUSSED'?'NOT_DISCUSSED':'DISCUSSED');
    assert.equal(f.signs().length,2);assert.equal(JSON.stringify(f.signs()[0]),first);assert.equal(JSON.stringify(f.entries()),log);
    f.user('one@example.com');assert.equal(f.c.submitWeeklyProgress_(input).entryId,entry.entryId);
    assert.throws(()=>f.c.submitWeeklyProgress_(f.input()),/Guide confirmation/);
    const data=f.c.loadStudentWeeklyProgress_();assert.equal(data.weeks[0].guideFrozen,true);assert.equal(data.actions.length,0);
    assert.equal(f.locked(),false);
  }
});

test('guide authorization, stale revision, invalid status and MISSED rejection',()=>{
  const f=fixture(),first=f.c.submitWeeklyProgress_(f.input());
  assert.throws(()=>f.c.submitWeeklyGuideSignoff_(first.entryId,'DISCUSSED'),/assigned guide/);
  const second=f.c.submitWeeklyProgress_(f.input());f.user('guide@example.com');
  assert.throws(()=>f.c.submitWeeklyGuideSignoff_(first.entryId,'DISCUSSED'),/no longer current/);
  assert.throws(()=>f.c.submitWeeklyGuideSignoff_(second.entryId,'PENDING'),/Invalid/);
  f.c.appendWeeklyEntry_({id:'missed',regNo:'002',teamId:'T1',weekId:'W1',entryStatus:'MISSED'});
  assert.throws(()=>f.c.submitWeeklyGuideSignoff_('missed','DISCUSSED'),/no longer current/);
  assert.equal(f.signs().length,0);
  f.set('Guide Email','replacement@example.com');assert.equal(f.c.loadGuideWeeklyProgress_().entries.length,0);
});

test('revision/signoff races re-read under the shared lock in either ordering',()=>{
  const f=fixture(),first=f.c.submitWeeklyProgress_(f.input());let revised;
  const original=f.c.weeklyLock_;
  f.c.weeklyLock_=fn=>{f.c.weeklyLock_=original;f.user('one@example.com');revised=f.c.submitWeeklyProgress_(f.input());f.user('guide@example.com');return original(fn);};
  assert.throws(()=>f.c.submitWeeklyGuideSignoff_(first.entryId,'DISCUSSED'),/no longer current/);
  f.user('one@example.com');
  f.c.weeklyLock_=fn=>{f.c.weeklyLock_=original;f.user('guide@example.com');f.c.submitWeeklyGuideSignoff_(revised.entryId,'NOT_DISCUSSED');f.user('one@example.com');return original(fn);};
  assert.throws(()=>f.c.submitWeeklyProgress_(f.input()),/Guide confirmation/);assert.equal(f.entries().length,2);
});

test('guide reads show only assigned effective submissions with their own evidence',()=>{
  const f=fixture(),old=f.c.submitWeeklyProgress_(f.input()),latest=f.c.submitWeeklyProgress_(f.input({guideDiscussion:'Measured noise'}));
  f.user('guide@example.com');const data=f.c.loadGuideWeeklyProgress_();
  assert.equal(data.entries.length,1);assert.equal(data.entries[0].entryId,latest.entryId);assert.notEqual(latest.entryId,old.entryId);
  assert.equal(data.entries[0].status,'PENDING');assert.equal(data.entries[0].score,null);
  assert.equal(data.entries[0].guideDiscussion,'Measured noise');assert.equal(data.entries[0].evidence.commits.length,1);
  assert.equal(data.entries[0].workCompleted,'Work');
  f.user('outsider@example.com');assert.equal(f.c.loadGuideWeeklyProgress_().entries.length,0);
});

test('guide reads use stored mapping and commits with zero GitHub requests and unchanged payload',()=>{
  const f=fixture(),entry=f.c.submitWeeklyProgress_(f.input({guideDiscussion:'Measured noise'}));
  f.c.appendWeeklyPhase2_('AIProgressAnalysis',{...ratings,score:6,id:'analysis',entryId:entry.entryId,analyzedAt:new Date('2026-01-06T00:00:00Z')});
  f.user('guide@example.com');
  // Exercise the real readiness/identity chain, not the fixture's readiness stub.
  vm.runInContext(fs.readFileSync('team-github-setup.js','utf8'),f.c);
  const requests=[];
  f.c.makeGithubRequest_=(...args)=>{requests.push(args);throw Error('GitHub unavailable');};
  f.c.UrlFetchApp={fetch:(...args)=>{requests.push(args);throw Error('Unexpected network read');},
    fetchAll:(...args)=>{requests.push(args);throw Error('Unexpected batch read');}};
  const before=JSON.stringify([...f.sheets].map(([name,sheet])=>[name,sheet.rows]));
  const expected={state:'available',message:'',commits:[{timestamp:'2026-01-01T00:00:00.000Z',message:'Project work',
      sha:'1'.padStart(40,'0'),shortSha:'0000000',url:'https://github.com/org/team/commit/'+'1'.padStart(40,'0')}]};
  for(let i=0;i<2;i++) assert.deepEqual(JSON.parse(JSON.stringify(f.c.loadGuideWeeklyProgress_().entries.find(item=>item.entryId===entry.entryId).evidence)),expected);
  assert.deepEqual(requests,[]);
  assert.equal(JSON.stringify([...f.sheets].map(([name,sheet])=>[name,sheet.rows])),before);
});

test('guide weekly read shares the roster, windows and each team\'s mapping, commits and collection status across students and entries',()=>{
  const f=fixture();
  f.c.submitWeeklyProgress_(f.input());f.user('two@example.com');f.c.submitWeeklyProgress_(f.input({guideDiscussion:'Second student'}));f.user('guide@example.com');
  const reference=JSON.stringify(f.c.loadGuideWeeklyProgress_().entries.map(entry=>[entry.regNo,entry.evidence]));
  const counts={};
  for(const name of ['weeklyStudents_','weeklyStoredGithubMapping_','readCollectedCommits_','readCommitCollectionStatus_','getWeeklySubmissionWindows_','readLogEntries_']) {
    const original=f.c[name];counts[name]=0;f.c[name]=(...args)=>{counts[name]++;return original(...args);};
  }
  const data=f.c.loadGuideWeeklyProgress_();
  assert.equal(data.entries.length,2);
  assert.equal(JSON.stringify(data.entries.map(entry=>[entry.regNo,entry.evidence])),reference,'evidence is unchanged');
  assert.deepEqual(counts,{weeklyStudents_:1,weeklyStoredGithubMapping_:1,readCollectedCommits_:1,readCommitCollectionStatus_:1,getWeeklySubmissionWindows_:1,readLogEntries_:1});
});

test('stored guide evidence retains mapping conflicts and collection failures as unavailable',()=>{
  const cases=[
    f=>{f.sheets.get('GitHubAccounts').rows[1][4]='';},
    f=>{f.sheets.get('GitHubAccounts').rows[1][4]='invalid';},
    f=>{f.sheets.get('GitHubAccounts').rows[1][3]='';},
    f=>{f.sheets.get('GitHubAccounts').rows[2][4]='101';},
    f=>{f.sheets.get('GitHubAccounts').rows.push(['','one@example.com','T1','other','103','','']);},
    f=>{f.sheets.get('GitHubAccounts').rows.push(['','outsider@example.com','T2','alice','101','','']);},
    f=>{f.collectionStatus('error');}
  ];
  for(const mutate of cases) {
    const f=fixture(),entry=f.c.submitWeeklyProgress_(f.input());f.user('guide@example.com');mutate(f);
    const requests=[];f.c.makeGithubRequest_=(...args)=>{requests.push(args);throw Error('Unexpected GitHub request');};
    const evidence=f.c.loadGuideWeeklyProgress_().entries.find(item=>item.entryId===entry.entryId).evidence;
    assert.equal(evidence.state,'unavailable');assert.equal(evidence.commits.length,0);assert.deepEqual(requests,[]);
  }
});

test('AI waits past Deadline even with early signoff; saves once without dashboard API calls',()=>{
  const f=fixture(),entry=f.c.submitWeeklyProgress_(f.input());f.user('guide@example.com');f.c.submitWeeklyGuideSignoff_(entry.entryId,'DISCUSSED');
  f.c.loadGuideWeeklyProgress_();assert.equal(f.fetches.length,0);
  f.time('2026-01-05T18:00:00Z');assert.equal(f.c.processWeeklyProgressAI().selected,0);
  f.time('2026-01-05T18:00:00.001Z');assert.equal(f.c.processWeeklyProgressAI().analyzed,1);
  assert.equal(f.analyses()[0].score,6);assert.equal(f.analyses()[0].entryId,entry.entryId);
  f.c.processWeeklyProgressAI();assert.equal(f.fetches.length,1);assert.equal(f.worker(),false);
});

test('unsigned on-time and late entries use their normal freeze; late signoff can freeze earlier',()=>{
  const ontime=fixture();ontime.c.submitWeeklyProgress_(ontime.input());ontime.time('2026-01-06T00:00:00Z');assert.equal(ontime.c.processWeeklyProgressAI().analyzed,1);
  for(const sign of [false,true]) {
    const f=fixture();f.setEligibility('W1');f.time('2026-01-06T00:00:00Z');const entry=f.c.submitWeeklyProgress_(f.input());
    assert.equal(f.c.processWeeklyProgressAI().selected,0);
    if(sign){f.user('guide@example.com');f.c.submitWeeklyGuideSignoff_(entry.entryId,'NOT_DISCUSSED');}
    else {f.time('2026-01-14T23:59:59Z');assert.equal(f.c.processWeeklyProgressAI().selected,0);f.time('2026-01-15T00:00:00Z');}
    assert.equal(f.c.processWeeklyProgressAI().analyzed,1);
  }
});

test('privacy filters known roster and GitHub identifiers in all evidence fields without identity metadata',()=>{
  const f=fixture(),text='One 001 one@example.com alice Alice Person @bob T1 https://github.com/org/team. Measured MAX30102 at 50 Hz.';
  f.c.submitWeeklyProgress_(f.input({workCompleted:text,guideDiscussion:text,blockers:text,nextAction:text}));
  f.sheets.get('Commits').rows[1][2]=text;f.time('2026-01-06T00:00:00Z');assert.equal(f.c.processWeeklyProgressAI().analyzed,1);
  const call=f.fetches[0],payload=JSON.parse(call.payload),evidence=payload.input.split('EVIDENCE JSON:\n')[1];
  assert.equal(call.url,'https://generativelanguage.googleapis.com/v1beta/interactions');assert.equal(payload.model,'gemini-3.8-flash');
  assert.equal(call.headers['x-goog-api-key'],'secret-key');
  for(const value of ['One','001','one@example.com','alice','Alice Person','bob','T1','https://github.com'])assert(!evidence.includes(value),value);
  assert.match(evidence,/MAX30102 at 50 Hz/);assert.equal(Object.keys(JSON.parse(evidence)).length,5);
  assert(!evidence.includes(f.entries()[0].id));assert(!evidence.includes('2026-01'));
});

test('privacy identifier read failure sends nothing and releases the worker lock',()=>{
  const f=fixture();f.c.submitWeeklyProgress_(f.input());f.time('2026-01-06T00:00:00Z');f.sheets.get('GitHubAccounts').rows[0][3]='missing';
  assert.throws(()=>f.c.processWeeklyProgressAI(),/Missing expected/);assert.equal(f.fetches.length,0);assert.equal(f.analyses().length,0);assert.equal(f.worker(),false);
});

test('strict AI JSON rejects extra fields, scores, invalid ratings and malformed comments',()=>{
  const f=fixture();
  for(const value of [{...ratings,score:10},{...ratings,technical_substance:'high'},{...ratings,comment:''},{...ratings,comment:'x'.repeat(301)}, {...ratings,comment:'two\nlines'},[],null])assert.throws(()=>f.c.parseWeeklyAIReply_(JSON.stringify(value)));
  assert.throws(()=>f.c.parseWeeklyAIReply_('```json\n'+JSON.stringify(ratings)+'\n```'));
  assert.equal(f.c.parseWeeklyAIReply_(JSON.stringify({...ratings,...Object.fromEntries(Object.keys(ratings).filter(k=>k!=='comment').map(k=>[k,'HIGH']))})).score,10);
});

function batchFixture() {
  const f=fixture();f.c.submitWeeklyProgress_(f.input());const template=f.entries()[0];f.sheets.get('LogEntries').rows.splice(1);
  // Distinct weeks and real journal rows; isolate batch orchestration from evidence collection.
  const windows=Array.from({length:7},(_,i)=>({weekId:'B'+i,opens_at:0,deadline_at:1,late_until:2}));
  f.c.getWeeklySubmissionWindows_=()=>windows;
  [6,0,2,1,3,4,5].forEach(i=>f.c.appendWeeklyEntry_({...template,id:'entry-'+i,weekId:'B'+i,submittedAt:new Date(1000+(i===2?1:i))}));
  f.c.readWeeklyProgressEvidence_=()=>({state:'available',commits:[{message:'Measured signal',sha:'abcdef',shortSha:'abcdef'}]});
  f.time('2026-02-01T00:00:00Z');return f;
}

test('oldest-first batch selects five, tie-breaks by sheet order, continues failures, and retries later',()=>{
  const f=batchFixture(),order=[],request=f.c.requestWeeklyAI_;
  f.c.requestWeeklyAI_=(entry,...args)=>{order.push(entry.id);return request(entry,...args);};
  f.respond(n=>n===2?{code:429,body:'sensitive payload'}:{code:200,body:JSON.stringify({steps:[{type:'model_output',content:[{type:'text',text:JSON.stringify(ratings)}]}]})});
  const result=f.c.processWeeklyProgressAI();assert.equal(result.selected,5);assert.equal(result.analyzed,4);
  assert.deepEqual(order,['entry-0','entry-2','entry-1','entry-3','entry-4']);assert.equal(f.fetches.length,5);
  assert(!JSON.stringify(f.errors).includes('sensitive'));assert(!f.analyses().some(row=>row.entryId==='entry-2'));
  const next=f.c.processWeeklyProgressAI();assert.equal(next.selected,3);assert.equal(next.analyzed,3);
  assert.deepEqual(order.slice(5),['entry-2','entry-5','entry-6']);assert.equal(f.analyses().length,7);
});

test('API exceptions, invalid output and unavailable evidence leave no result and continue the batch',()=>{
  const f=batchFixture();let evidence=0;
  f.c.readWeeklyProgressEvidence_=()=>++evidence===1?{state:'unavailable',commits:[]}:{state:'available',commits:[{message:'Work'}]};
  f.respond(n=>{if(n===1)throw Error('secret');return n===2?{code:200,body:'not json'}:{code:200,body:JSON.stringify({steps:[{type:'model_output',content:[{type:'text',text:JSON.stringify(ratings)}]}]})};});
  assert.equal(f.c.processWeeklyProgressAI().analyzed,2);assert.equal(f.fetches.length,4);assert.equal(f.worker(),false);
});

test('overlapping workers skip; duplicate persistence and changed effective entry are rechecked',()=>{
  const f=batchFixture();let calls=0;
  f.c.requestWeeklyAI_=(entry)=>{
    calls++;assert.equal(f.c.processWeeklyProgressAI().skipped,true);
    if(calls===1)f.c.appendWeeklyPhase2_('AIProgressAnalysis',{...ratings,score:6,id:'concurrent',entryId:entry.id,analyzedAt:new Date()});
    if(calls===2)f.c.appendWeeklyEntry_({...entry,id:'replacement',entryStatus:'REVISED'});
    return {...ratings,score:6};
  };
  assert.equal(f.c.processWeeklyProgressAI().analyzed,3);assert.equal(f.analyses().length,4);assert.equal(f.worker(),false);
  f.occupy();assert.equal(f.c.processWeeklyProgressAI().skipped,true);
});

test('MISSED and superseded entries are never analyzed',()=>{
  const f=fixture();f.c.submitWeeklyProgress_(f.input());const latest=f.c.submitWeeklyProgress_(f.input());
  f.c.appendWeeklyEntry_({id:'missed',regNo:'002',teamId:'T1',weekId:'W1',entryStatus:'MISSED'});f.time('2026-01-06T00:00:00Z');
  assert.equal(f.c.processWeeklyProgressAI().selected,1);assert.equal(f.analyses()[0].entryId,latest.entryId);
});

test('equal submission timestamps use effective physical row order, including revised entries',()=>{
  const f=batchFixture(),first=f.entries().find(row=>row.id==='entry-0');
  f.c.appendWeeklyEntry_({...first,id:'latest-zero',entryStatus:'REVISED',submittedAt:new Date(1001)});
  const order=[];f.c.requestWeeklyAI_=entry=>{order.push(entry.id);return {...ratings,score:6};};
  f.c.processWeeklyProgressAI();assert.deepEqual(order,['entry-2','entry-1','latest-zero','entry-3','entry-4']);
});

test('failed persistence leaves entry retryable and does not stop remaining batch entries',()=>{
  const f=batchFixture(),append=f.c.appendWeeklyPhase2_;let calls=0;
  f.c.appendWeeklyPhase2_=(...args)=>{if(++calls===1)throw Error('write failed');return append(...args);};
  assert.equal(f.c.processWeeklyProgressAI().analyzed,4);assert(!f.analyses().some(row=>row.entryId==='entry-0'));
  assert.equal(f.c.processWeeklyProgressAI().analyzed,3);assert.equal(f.analyses().length,7);
});

test('privacy includes historical commit usernames as well as current accounts',()=>{
  const f=fixture();f.sheets.get('Commits').rows.push([new Date(),'T1','Historical evidence','old-handle','https://github.com/org/team','deadbeef']);
  const cleaned=f.c.weeklyAIPrivateText_('old-handle and ALICE designed a 50 Hz filter',f.c.weeklyAIIdentifiers_());
  assert(!cleaned.includes('old-handle'));assert(!cleaned.includes('ALICE'));assert.match(cleaned,/50 Hz filter/);
});

test('coordinator readiness independently detects storage and schedule setup and validates prerequisites',()=>{
  const f=fixture();assert.throws(()=>f.c.getWeeklyProgressPhase2Readiness_(),/Coordinator/);f.user('coord@example.com');
  let report=f.c.getWeeklyProgressPhase2Readiness_();assert.equal(report.storageReady,true);assert.equal(report.triggerReady,true);
  assert.equal(report.canSetupStorage,false);assert.equal(report.canSetupTriggers,false);
  f.triggers.splice(0);report=f.c.getWeeklyProgressPhase2Readiness_();assert.equal(report.triggerReady,false);assert.equal(report.canSetupTriggers,true);
  f.sheets.get('GuideSignoff').rows.splice(0);report=f.c.getWeeklyProgressPhase2Readiness_();assert.equal(report.canSetupStorage,true);assert.equal(report.canSetupTriggers,false);
  f.c.setupWeeklyProgressPhase2Storage();f.properties.delete('GEMINI_API_KEY');report=f.c.getWeeklyProgressPhase2Readiness_();assert.equal(report.canSetupTriggers,false);assert.match(report.issues.join(' '),/GEMINI_API_KEY/);
  f.sheets.get('GuideSignoff').rows[0][0]='Wrong';report=f.c.getWeeklyProgressPhase2Readiness_();assert.equal(report.storageReady,false);assert.equal(report.canSetupStorage,false);assert.match(report.issues.join(' '),/Signoff ID/);
});

test('readiness does not infer missing triggers owned by another execution account',()=>{
  const f=fixture();f.user('coord@example.com');f.c.Session.getEffectiveUser=()=>({getEmail:()=> 'other@example.com'});
  const report=f.c.getWeeklyProgressPhase2Readiness_();assert.equal(report.triggerReady,null);assert.equal(report.canSetupTriggers,false);
  assert.throws(()=>f.c.setupWeeklyProgressPhase2Triggers(),/execution owner/);
  f.c.Session.getEffectiveUser=()=>({getEmail:()=> 'coord@example.com'});f.properties.set('WEEKLY_AI_TRIGGER_OWNER','previous@example.com');
  assert.equal(f.c.getWeeklyProgressPhase2Readiness_().triggerReady,null);
});
