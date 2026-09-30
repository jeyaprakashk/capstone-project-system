/** Explicit administrator tools. Never invoked by dashboard reads. */
const GITHUB_MIGRATION_SHEET_ = 'GitHubIdentityMigration';
const GITHUB_MIGRATION_HEADERS_ = ['Kind','Key','Source','Outcome','GitHub ID','Account JSON','Checked At','Detail'];

function authorizeGithubMigration_() {
  const email = Session.getActiveUser().getEmail();
  if (!email || !activityIsCoordinator_(email)) throw new Error('Coordinator access is required.');
}

function githubMigrationJournal_(required) {
  const sheet = getSheet(GITHUB_MIGRATION_SHEET_);
  if (!sheet) { if (required) throw new Error('Migration required: initialize the migration journal.'); return null; }
  const headers = readSheetRows_(sheet,1,1)[0] || [];
  if (GITHUB_MIGRATION_HEADERS_.some((h,i)=>headers[i] !== h)) throw new Error('Migration journal header mismatch.');
  return sheet;
}

function githubJournalRows_() {
  const sheet = githubMigrationJournal_(false);
  return sheet ? readSheetRows_(sheet,2) : [];
}

/** Sheets may return old account row keys as numbers. Never compare those with string keys directly. */
function githubJournalKey_(kind,key) {
  if (kind !== 'account') return typeof key === 'string' ? key : '';
  if (typeof key === 'number') return Number.isSafeInteger(key) && key >= 2 ? String(key) : '';
  return typeof key === 'string' && /^[1-9][0-9]*$/.test(key) && Number.isSafeInteger(Number(key)) && Number(key) >= 2 ? key : '';
}

function githubValidAccountJournal_(row) {
  if (!['proposed','migrated','api-failure','unresolvable','conflict'].includes(row[3])) return false;
  if (!['proposed','migrated'].includes(row[3])) return true;
  try {
    const account=JSON.parse(row[5]), id=githubId_(row[4]);
    return !!id && account.githubId===id && typeof account.username==='string' && !!account.username &&
      typeof account.displayName==='string' && /^https:\/\/github\.com\/[a-z\d-]+\/?$/i.test(account.profileUrl);
  } catch(error) { return false; }
}

/** One effective outcome per current source snapshot; physical history is never a claim count. */
function githubAccountStaging_(rows,students,journal) {
  const byKey=new Map();
  journal.forEach((entry,index)=>{
    const key=entry[0]==='account' && githubJournalKey_('account',entry[1]);
    if (!key || entry[3]==='superseded') return;
    if (!byKey.has(key)) byKey.set(key,[]);
    byKey.get(key).push({entry,index});
  });
  const records=rows.map((row,i)=>{
    const key=String(i+2),source=githubMigrationAccountSource_(row,students);
    const matches=(byKey.get(key)||[]).filter(item=>item.entry[2]===source && githubValidAccountJournal_(item.entry));
    let saved=null;
    if(matches.length) {
      // Preserve conflicting outcomes rather than choosing an arbitrary account from duplicate proposals.
      const ids=new Set(matches.map(item=>githubId_(item.entry[4])).filter(Boolean));
      const conflict=matches.find(item=>item.entry[3]==='conflict');
      if(ids.size>1 || conflict) saved=['account',key,source,'conflict','','','',
        ids.size>1?'Duplicate journal proposals disagree on GitHub ID; retry after administrator review.':conflict.entry[7]];
      else {
        const migrated=matches.filter(item=>item.entry[3]==='migrated');
        const proposed=matches.filter(item=>item.entry[3]==='proposed');
        const candidates=migrated.length?migrated:proposed.length?proposed:matches;
        saved=candidates[candidates.length-1].entry.slice();
        saved[1]=key;saved[4]=githubId_(saved[4]);
      }
    }
    return {row,rowNumber:i+2,key,source,saved,claimIds:[...new Set(matches.map(item=>githubId_(item.entry[4])).filter(Boolean))]};
  });
  return records;
}

function githubStagingSummary_(records,journal) {
  const counts=new Map();
  journal.filter(r=>r[0]==='account').forEach(r=>{const key=githubJournalKey_('account',r[1]);if(key)counts.set(key,(counts.get(key)||0)+1);});
  return {total:records.length,effectiveStaged:records.filter(r=>r.saved).length,
    complete:records.every(r=>r.saved),remainingProposals:records.filter(r=>r.saved&&r.saved[3]==='proposed').length,
    physicalAccountRows:journal.filter(r=>r[0]==='account').length,
    duplicateKeys:[...counts].filter(([,count])=>count>1).map(([key,count])=>({key,count})),
    requiresReview:records.filter(r=>r.saved&&!['proposed','migrated'].includes(r.saved[3])).map(r=>({row:r.rowNumber,outcome:r.saved[3],detail:r.saved[7]}))};
}

/** Read-only local diagnostic: no GitHub calls, no normalization writes, no application. */
function inspectGitHubIdentityMigrationStaging() {
  authorizeGithubMigration_();
  const sheet=getSheet(SHEET_NAMES.GITHUB_USERNAME_RAW);
  githubAccountColumns_(sheet,true);
  const journal=githubJournalRows_();
  return githubStagingSummary_(githubAccountStaging_(readSheetRows_(sheet,2),weeklyStudents_(),journal),journal);
}

function githubJournalWrite_(kind,key,source,outcome,id,account,detail) {
  return githubIdentityLock_(()=>{
    const sheet = githubMigrationJournal_(true), rows = readSheetRows_(sheet,2);
    key=githubJournalKey_(kind,key);
    if(!key)throw new Error('Invalid migration journal key.');
    const indexes=rows.flatMap((r,i)=>r[0]===kind&&githubJournalKey_(kind,r[1])===key?[i]:[]);
    const row = indexes.length ? indexes[indexes.length-1]+2 : sheet.getLastRow()+1;
    sheet.getRange(row,2).setNumberFormat('@');
    sheet.getRange(row,5).setNumberFormat('@');
    sheet.getRange(row,1,1,8).setValues([[kind,key,source,outcome,id || '',account ? JSON.stringify(account) : '',new Date(),githubLiteral_(detail || '')]]);
    // Retain duplicate history but make deliberate restaging/application supersede earlier outcomes.
    if(kind==='account')indexes.slice(0,-1).forEach(index=>sheet.getRange(index+2,4).setValue('superseded'));
  });
}

function setupGitHubIdentityMigrationStorage() {
  authorizeGithubMigration_();
  return githubIdentityLock_(()=>{
    const accounts = getSheet(SHEET_NAMES.GITHUB_USERNAME_RAW), commits = getSheet(SHEET_NAMES.COMMITS);
    githubAccountColumns_(accounts,false);
    // Validate the existing six columns independently of release-specific strictness.
    const headers = readSheetRows_(commits,1,1)[0] || [];
    const base = ['Date','Team ID','Commit Message','GitHub Username','Repository URL','Commit SHA'];
    if (base.some((h,i)=>!githubBaseHeaderEquals_(headers[i],h))) throw new Error('Commits header mismatch. No columns moved.');
    const additions = [[accounts,['GitHub ID','GitHub Display Name','GitHub Profile URL']],[commits,['GitHub Author ID']]];
    additions.forEach(([sheet,names])=>{
      const existing = readSheetRows_(sheet,1,1)[0] || [];
      names.forEach(name=>{if(existing.filter(h=>String(h).trim().toLowerCase() === name.toLowerCase()).length > 1) throw new Error('Duplicate header: '+name);});
    });
    githubMigrationJournal_(false);
    additions.forEach(([sheet,names])=>names.forEach(name=>{
      const existing = readSheetRows_(sheet,1,1)[0] || [];
      let index = existing.findIndex(h=>String(h).trim().toLowerCase() === name.toLowerCase());
      if (index < 0) { index = sheet.getLastColumn(); sheet.getRange(1,index+1).setValue(name); }
      if (name.endsWith(' ID')) sheet.getRange(2,index+1,Math.max(1,sheet.getMaxRows()-1)).setNumberFormat('@');
    }));
    if (!getSheet(GITHUB_MIGRATION_SHEET_)) getSpreadsheet().insertSheet(GITHUB_MIGRATION_SHEET_).getRange(1,1,1,8).setValues([GITHUB_MIGRATION_HEADERS_]);
    return {ok:true,message:'Identity capture storage prepared. No account or commit identities migrated.'};
  });
}

function githubMigrationOptions_(options) {
  options = options || {};
  const limit = options.limit === undefined ? 50 : Number(options.limit), cursor = options.cursor === undefined ? 0 : Number(options.cursor);
  if (!Number.isInteger(limit) || limit < 1 || limit > 100 || !Number.isInteger(cursor) || cursor < 0) throw new Error('Use limit 1–100 and a nonnegative cursor.');
  return {limit,cursor,retryFailed:!!options.retryFailed,deadline:Date.now()+180000};
}

function githubMigrationAccountSource_(row,students) {
  return JSON.stringify({row,owners:students.filter(s=>emailsMatch(s.email,row[1]) && textEquals_(s.teamId,row[2])).map(s=>({email:s.email,teamId:s.teamId,regNo:s.regNo}))});
}

function githubMigrationResolveAccount_(row,columns,students,cache) {
  const owners = students.filter(s=>emailsMatch(s.email,row[1]) && textEquals_(s.teamId,row[2]));
  if (owners.length !== 1) return {outcome:'conflict',detail:'Missing or ambiguous academic identity.'};
  const existing = columns.ID >= 0 ? row[columns.ID] : '';
  if (existing !== '' && existing != null && !githubId_(existing)) return {outcome:'conflict',detail:'Invalid established GitHub ID; administrator correction required.'};
  try {
    let account;
    if (githubId_(existing)) account = resolveGithubAccountId_(existing,makeGithubRequest,cache);
    else {
      const username = String(row[3] || '').trim();
      if (!/^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i.test(username)) return {outcome:'unresolvable',detail:'Missing or invalid username.'};
      const key = 'login:'+username.toLowerCase();
      if (!cache.has(key)) {
        try { cache.set(key,githubAccountResponse_(makeGithubRequest('GET','/users/'+encodeURIComponent(username)))); }
        catch(error) { cache.set(key,error); }
      }
      account = cache.get(key);
      if (account instanceof Error) throw account;
    }
    return {outcome:'proposed',account,regNo:owners[0].regNo,detail:'Current account claim; historical username ownership is not proven.'};
  } catch(error) { return {outcome:/conflict/.test(error.message)?'conflict':/not found|inaccessible/.test(error.message)?'unresolvable':'api-failure',detail:error.message}; }
}

/** Pure audit, including no journal/cursor writes. Supply earlier proposals to compare paged results. */
function auditGitHubIdentityMigration(options) {
  authorizeGithubMigration_();
  const batch = githubMigrationOptions_(options), sheet = getSheet(SHEET_NAMES.GITHUB_USERNAME_RAW), columns = githubAccountColumns_(sheet,false);
  const rows = readSheetRows_(sheet,2), students = weeklyStudents_(), cache = new Map(), outcomes = [];
  const commitSheet = getSheet(SHEET_NAMES.COMMITS), commitHeaders = readSheetRows_(commitSheet,1,1)[0] || [];
  if (['Date','Team ID','Commit Message','GitHub Username','Repository URL','Commit SHA'].some((h,i)=>!githubBaseHeaderEquals_(commitHeaders[i],h))) throw new Error('Commits header mismatch.');
  if (commitHeaders.filter(h=>String(h).trim().toLowerCase()==='github author id').length>1) throw new Error('Duplicate GitHub Author ID header.');
  let cursor = batch.cursor;
  for (;cursor<rows.length && outcomes.length<batch.limit && Date.now()<batch.deadline;cursor++) {
    const row = rows[cursor];
    const result = githubMigrationResolveAccount_(row,columns,students,cache);
    outcomes.push({row:cursor+2,source:githubMigrationAccountSource_(row,students),...result});
  }
  const proposals = (options && options.proposals || []).concat(outcomes);
  const claims = proposals.filter(p=>p.account).map(p=>({id:p.account.githubId,regNo:p.regNo,row:p.row}));
  rows.forEach((r,i)=>{const owner=students.find(s=>emailsMatch(s.email,r[1])&&textEquals_(s.teamId,r[2]));if(githubId_(r[columns.ID]))claims.push({id:githubId_(r[columns.ID]),regNo:owner?owner.regNo:'unknown-row-'+i,row:i+2});});
  const duplicates = claims.filter(a=>claims.some(b=>a.id===b.id && !textEquals_(a.regNo,b.regNo)));
  const conflicts = claims.filter(a=>claims.some(b=>textEquals_(a.regNo,b.regNo) && a.id!==b.id));
  return {readOnly:true,columns,commitAuthorIdPresent:commitHeaders.includes('GitHub Author ID'),outcomes,proposals,duplicates,conflicts,
    nextCursor:cursor,done:cursor>=rows.length,completeDataset:cursor>=rows.length && new Set(proposals.map(p=>p.row)).size===rows.length};
}

/** Stage every account proposal before applying any, detecting cross-batch duplicate IDs. */
function applyGitHubIdentityMigration(options) {
  authorizeGithubMigration_();
  const batch=githubMigrationOptions_(options),sheet=getSheet(SHEET_NAMES.GITHUB_USERNAME_RAW),columns=githubAccountColumns_(sheet,true);
  githubMigrationJournal_(true);
  const students=weeklyStudents_(),journal=githubJournalRows_(),cache=new Map(),outcomes=[];
  const records=githubAccountStaging_(readSheetRows_(sheet,2),students,journal);
  const pending=records.filter(r=>!r.saved || (batch.retryFailed && ['api-failure','unresolvable','conflict'].includes(r.saved[3])));
  if(pending.length) {
    for(const record of pending.slice(0,batch.limit)) {
      if(Date.now()>=batch.deadline)break;
      const result=githubMigrationResolveAccount_(record.row,columns,students,cache);
      githubIdentityLock_(()=>{
        const currentRows=readSheetRows_(sheet,2),currentStudents=weeklyStudents_();
        const current=githubAccountStaging_(currentRows,currentStudents,githubJournalRows_())[record.rowNumber-2];
        if(!current||current.source!==record.source) {outcomes.push({row:record.rowNumber,outcome:'changed-retry'});return;}
        // Another invocation may have completed staging/application while the API call was in flight.
        if(current.saved && (!batch.retryFailed || !['api-failure','unresolvable','conflict'].includes(current.saved[3]))) {
          outcomes.push({row:record.rowNumber,outcome:'already-staged'});return;
        }
        githubJournalWrite_('account',record.key,record.source,result.outcome,result.account&&result.account.githubId,result.account,result.detail);
        outcomes.push({row:record.rowNumber,...result});
      });
    }
    return {phase:'resolve',outcomes,done:false,nextCursor:0,staging:inspectGitHubIdentityMigrationStaging(),
      message:'Rerun to finish global proposal staging, then apply.'};
  }
  let stagingChanged=false;
  for(const record of records.filter(r=>r.saved[3]==='proposed').slice(0,batch.limit)) {
    if(Date.now()>=batch.deadline)break;
    githubIdentityLock_(()=>{
      const currentRows=readSheetRows_(sheet,2),currentStudents=weeklyStudents_();
      const currentRecords=githubAccountStaging_(currentRows,currentStudents,githubJournalRows_());
      // Recheck the global barrier as well as this record, including newly appended registrations.
      if(currentRecords.some(r=>!r.saved)) {stagingChanged=true;return;}
      const current=currentRecords[record.rowNumber-2];
      if(!current||current.source!==record.source) {outcomes.push({row:record.rowNumber,outcome:'changed-retry'});return;}
      if(current.saved[3]!=='proposed') {outcomes.push({row:record.rowNumber,outcome:'already-processed'});return;}
      const account=JSON.parse(current.saved[5]),own=JSON.parse(current.source).owners[0];
      const claims=currentRecords.flatMap(r=>r.claimIds.map(id=>({id,owner:JSON.parse(r.source).owners[0]})));
      const conflict=claims.some(c=>!c.owner||!own||
        (c.id===account.githubId&&!textEquals_(c.owner.regNo,own.regNo))||
        (c.id!==account.githubId&&textEquals_(c.owner.regNo,own.regNo)));
      if(conflict) {
        githubJournalWrite_('account',record.key,current.source,'conflict',account.githubId,account,'GitHub ID claimed by different students or conflicting IDs for one student.');
        outcomes.push({row:record.rowNumber,outcome:'conflict'});return;
      }
      if(current.row[columns.ID] !== '' && current.row[columns.ID] != null && githubId_(current.row[columns.ID])!==account.githubId) {
        outcomes.push({row:record.rowNumber,outcome:'conflict'});return;
      }
      const duplicate=currentRows.some(r=>githubId_(r[columns.ID])===account.githubId&&!currentStudents.some(s=>emailsMatch(s.email,r[1])&&textEquals_(s.teamId,r[2])&&textEquals_(s.regNo,own.regNo)));
      if(duplicate) {outcomes.push({row:record.rowNumber,outcome:'conflict'});return;}
      // Recover from interruption after the account write but before the migrated journal outcome.
      const alreadyApplied=githubId_(current.row[columns.ID])===account.githubId&&current.row[3]===account.username&&
        current.row[columns.NAME]===account.displayName&&current.row[columns.URL]===account.profileUrl;
      if(!alreadyApplied)writeGithubAccount_(sheet,record.rowNumber,columns,account);
      const updated=readSheetRows_(sheet,record.rowNumber,1)[0];
      githubJournalWrite_('account',record.key,githubMigrationAccountSource_(updated,currentStudents),'migrated',account.githubId,account,'');
      outcomes.push({row:record.rowNumber,outcome:'migrated',alreadyApplied});
    });
    if(stagingChanged)break;
  }
  const staging=inspectGitHubIdentityMigrationStaging();
  return {phase:stagingChanged||!staging.complete?'resolve':'apply',outcomes,
    done:staging.complete&&staging.remainingProposals===0,nextCursor:0,staging,requiresReview:staging.requiresReview};
}

function githubCommitKey_(repoUrl,sha) {
  const repo=parseGithubRepoUrl_(repoUrl), id=commitIdentity_(sha);
  return repo&&id ? (repo.owner+'/'+repo.repo).toLowerCase()+'@'+id : '';
}

function githubCommitResolutionMap_() {
  return new Map(githubJournalRows_().filter(r=>r[0]==='commit').map(r=>[r[1],r]));
}

function backfillCommitAuthorIds(options) {
  authorizeGithubMigration_();
  const batch=githubMigrationOptions_(options), sheet=getSheet(SHEET_NAMES.COMMITS), columns=commitColumns_(sheet);
  if(columns.AUTHOR_ID<0)throw new Error('Migration required: GitHub Author ID column missing.');
  githubMigrationJournal_(true);
  const rows=readSheetRows_(sheet,2), outcomes=[], journal=githubCommitResolutionMap_();
  let cursor=batch.cursor;
  for(;cursor<rows.length&&outcomes.length<batch.limit&&Date.now()<batch.deadline;cursor++) {
    const row=rows[cursor], key=githubCommitKey_(row[columns.REPO_URL],row[columns.SHA]), established=githubId_(row[columns.AUTHOR_ID]);
    if(established)continue;
    if(!key){outcomes.push({row:cursor+2,outcome:'invalid-source'});continue;}
    const saved=journal.get(key);
    if(saved&&saved[3]==='unlinked'&&!batch.retryFailed)continue;
    let id='',outcome='api-failure',detail='';
    try {
      const repo=parseGithubRepoUrl_(row[columns.REPO_URL]), slug=encodeURIComponent(repo.owner)+'/'+encodeURIComponent(repo.repo);
      const response=makeGithubRequest('GET','/repos/'+slug+'/commits/'+commitIdentity_(row[columns.SHA]));
      if(response.status===200) {
        if(!response.body||commitIdentity_(response.body.sha)!==commitIdentity_(row[columns.SHA]))throw new Error('Returned commit SHA mismatch.');
        id=githubId_(response.body.author&&response.body.author.id);
        if(response.body.author&&response.body.author.id!=null&&!id)throw new Error('Invalid author ID returned.');
        outcome=id?'resolved':'unlinked';
      } else if(response.status===404) {
        const repoResponse=makeGithubRequest('GET','/repos/'+slug);
        outcome=repoResponse.status===200?'missing-commit':[401,403,404].includes(repoResponse.status)?'inaccessible-repository':'api-failure';
        detail='Commit HTTP 404; repository HTTP '+repoResponse.status+'. GitHub resource/access ambiguity may require administrator review.';
      } else if(response.status===403 && /rate limit|abuse/i.test(response.body && response.body.message || '')) {outcome='api-failure';detail='GitHub rate limit; retry later.';}
      else if(response.status===401||response.status===403) {outcome='inaccessible-repository';detail='GitHub HTTP '+response.status;}
      else detail='GitHub HTTP '+response.status;
    } catch(error){detail=error.message;}
    githubIdentityLock_(()=>{
      const current=readSheetRows_(sheet,cursor+2,1)[0];
      if(!current||githubCommitKey_(current[columns.REPO_URL],current[columns.SHA])!==key){outcome='changed-retry';return;}
      const existing=current[columns.AUTHOR_ID];
      if(existing!==''&&existing!=null) {
        if(!githubId_(existing)||(id&&githubId_(existing)!==id))outcome='conflict';
        else outcome='resolved';
      } else if(id)sheet.getRange(cursor+2,columns.AUTHOR_ID+1).setNumberFormat('@').setValue(id);
      githubJournalWrite_('commit',key,'',outcome,id,null,detail);
    });
    outcomes.push({row:cursor+2,key,outcome,detail});
  }
  return {outcomes,nextCursor:cursor,done:cursor>=rows.length};
}

function verifyGitHubIdentityMigration() {
  authorizeGithubMigration_();
  const sheet=getSheet(SHEET_NAMES.GITHUB_USERNAME_RAW),columns=githubAccountColumns_(sheet,true),rows=readSheetRows_(sheet,2),students=weeklyStudents_();
  const commits=readCollectedCommits_(), unresolved=commits.filter(c=>c.authorResolution==='unavailable');
  const journal=githubJournalRows_();
  const effective=githubAccountStaging_(rows,students,journal);
  const conflicts=journal.filter(r=>r[0]!=='account'&&r[3]==='conflict').concat(effective.filter(r=>r.saved&&r.saved[3]==='conflict').map(r=>r.saved));
  // Classify every registration, including orphaned/ambiguous academic mappings.
  // A roster member with no registration is not an incomplete migration record.
  const registrations=effective.map(record=>{
    const owners=students.filter(s=>emailsMatch(s.email,record.row[1])&&textEquals_(s.teamId,record.row[2]));
    const mine=rows.filter(r=>emailsMatch(r[1],record.row[1])&&textEquals_(r[2],record.row[2]));
    const ids=new Set(mine.map(r=>githubId_(r[columns.ID])).filter(Boolean));
    const identity=owners.length===1?githubStudentIdentity_(owners[0],rows,columns,students):null;
    const conflict=owners.length!==1||ids.size>1||(record.saved&&record.saved[3]==='conflict')||
      (ids.size===1&&identity.state!=='available'&&mine.every(r=>githubId_(r[columns.ID])));
    const status=conflict?'migrationConflict':!githubId_(record.row[columns.ID])||identity.state!=='available'?'migrationUnresolved':'available';
    return {row:record.rowNumber,email:record.row[1],teamId:record.row[2],status};
  });
  const accounts=students.map(s=>{
    const mine=registrations.filter(r=>emailsMatch(r.email,s.email)&&textEquals_(r.teamId,s.teamId));
    const identity=githubStudentIdentity_(s,rows,columns,students);
    const status=mine.some(r=>r.status==='migrationConflict')?'migrationConflict':mine.some(r=>r.status==='migrationUnresolved')?'migrationUnresolved':
      mine.length?'available':students.filter(other=>emailsMatch(other.email,s.email)&&textEquals_(other.teamId,s.teamId)).length===1?'notRegistered':'migrationConflict';
    return {email:s.email,regNo:s.regNo,...identity,status,state:status==='available'?'available':'unavailable',
      ...(status==='notRegistered'?{reason:'GitHub account is not registered.'}:{})};
  });
  const categories={};
  ['available','notRegistered','migrationConflict','migrationUnresolved'].forEach(status=>{categories[status]=accounts.filter(a=>a.status===status);});
  const accountCounts=Object.fromEntries(Object.entries(categories).map(([status,list])=>[status,list.length]));
  return {ready:registrations.every(r=>r.status==='available')&&!accountCounts.migrationConflict&&!accountCounts.migrationUnresolved&&!unresolved.length&&!conflicts.length,
    accounts,accountCounts,...categories,registrations,
    commits:{total:commits.length,resolved:commits.filter(c=>githubId_(c.authorId)).length,unlinked:commits.filter(c=>c.authorResolution==='unlinked').length,unresolved:unresolved.map(c=>({teamId:c.teamId,sha:c.sha,repositoryUrl:c.repositoryUrl}))},conflicts};
}
