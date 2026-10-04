/** Individual weekly eligibility. Only explicit setup and daily reconciliation write this sheet. */
const PROGRESS_ELIGIBILITY_FIELDS_ = {
  regNo:'Register Number', name:'Student Name', teamId:'Team', username:'GitHub Username', githubId:'GitHub Numeric ID',
  collaboratorStatus:'Collaborator Status', firstDetected:'Collaborator First Detected At',
  firstCommit:'First Qualifying Student Commit At', source:'Collaborator Date Source', effectiveDate:'Effective Collaborator Date',
  evidence:'Evidence Reference', titleStatus:'Title Status', titleDate:'Title Confirmation Date', fixingDate:'Progress Fixing Date',
  eligibleFrom:'Progress Eligible From Week ID', enforcedFrom:'Enforced From Week ID', fixedAt:'Eligibility Fixed At',
  status:'Status', checkedAt:'Last Checked At', error:'Last Check Error'
};

function progressEligibilityCoordinator_(scheduled) {
  const active = normalizeEmail_(Session.getActiveUser().getEmail());
  const effective = normalizeEmail_(Session.getEffectiveUser ? Session.getEffectiveUser().getEmail() : active);
  const email = scheduled ? effective : active;
  if (!email || !activityIsCoordinator_(email) || (active && !activityIsCoordinator_(active))) throw new Error('Coordinator access is required.');
  return email;
}

function progressEligibilityStorage_() {
  const sheet = getSheet_('ProgressEligibility');
  if (!sheet) throw new Error('Initialize ProgressEligibility storage first.');
  const headers = readSheetRows_(sheet,1,1)[0] || [];
  Object.values(PROGRESS_ELIGIBILITY_FIELDS_).forEach(header=>{
    if (headers.filter(value=>textEquals_(value,header)).length !== 1) throw new Error('ProgressEligibility requires exactly one ' + header + ' column.');
  });
  return {sheet,columns:buildColumnMap_(sheet,PROGRESS_ELIGIBILITY_FIELDS_,headers)};
}

function readProgressEligibility_() {
  const {sheet,columns} = progressEligibilityStorage_(), seen = new Set();
  return readSheetRows_(sheet,2).flatMap((row,index)=>{
    if (!row.some(value=>value !== '')) return [];
    const record = Object.fromEntries(Object.keys(columns).map(key=>[key,row[columns[key]] === undefined ? '' : row[columns[key]]]));
    const key = normalizeText_(record.regNo);
    if (!key || !record.teamId || seen.has(key)) throw new Error('Missing or duplicate ProgressEligibility student identity.');
    if (record.githubId && !githubId_(record.githubId)) throw new Error('Invalid ProgressEligibility GitHub numeric ID.');
    ['firstDetected','firstCommit','effectiveDate','titleDate','fixingDate','fixedAt','checkedAt'].forEach(field=>{
      if (record[field] && !Number.isFinite(progressDateMs_(record[field]))) throw new Error('Invalid ProgressEligibility '+field+' timestamp.');
    });
    seen.add(key);
    return [{...record,rowNumber:index+2}];
  });
}

function progressStudentEligibility_(student, records, windowSnapshot) {
  const record = (records || readProgressEligibility_()).find(row=>textEquals_(row.regNo,student.regNo));
  if (!record) return {regNo:student.regNo,teamId:student.teamId,eligibleFrom:'',enforcedFrom:'',status:'PENDING'};
  if (!textEquals_(record.teamId,student.teamId)) throw new Error('ProgressEligibility team identity conflict. Coordinator review required.');
  if (record.eligibleFrom) {
    const windows = windowSnapshot || getWeeklySubmissionWindows_();
    const historical = windows.findIndex(w=>w.weekId === record.eligibleFrom), enforced = windows.findIndex(w=>w.weekId === record.enforcedFrom);
    if (historical < 0 || enforced < historical || !record.fixedAt) throw new Error('Invalid fixed ProgressEligibility boundaries.');
  }
  return record;
}

function writeProgressEligibility_(record) {
  const {sheet,columns} = progressEligibilityStorage_();
  const number = record.rowNumber || sheet.getLastRow()+1;
  const row = record.rowNumber ? readSheetRows_(sheet,number,1)[0].slice() : new Array(sheet.getLastColumn()).fill('');
  Object.keys(columns).forEach(key=>{
    const value = record[key] === undefined ? '' : record[key];
    row[columns[key]] = typeof value === 'string' && /^[=+@-]/.test(value) ? "'"+value : value;
  });
  if (number > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(),100);
  ['regNo','githubId'].forEach(key=>sheet.getRange(number,columns[key]+1).setNumberFormat('@'));
  sheet.getRange(number,1,1,row.length).setValues([row]);
  SpreadsheetApp.flush();
}

function setupProgressEligibilityStorage() {
  progressEligibilityCoordinator_();
  return weeklyLock_(()=>{
    let sheet = getSheet_('ProgressEligibility');
    if (!sheet) sheet = getSpreadsheet_().insertSheet('ProgressEligibility');
    if (!sheet.getLastRow()) sheet.getRange(1,1,1,Object.keys(PROGRESS_ELIGIBILITY_FIELDS_).length).setValues([Object.values(PROGRESS_ELIGIBILITY_FIELDS_)]);
    readProgressEligibility_();
    return {ok:true};
  });
}

function progressDateMs_(value) {
  if (!value || (typeof value !== 'string' && Object.prototype.toString.call(value) !== '[object Date]')) return NaN;
  return new Date(value).getTime();
}

/** Steady-state calculation. Fixed boundaries are immutable; new obligations start at eligibility. */
function calculateProgressEligibility_(record, windows, now) {
  if (record.eligibleFrom) return record;
  const result = {...record};
  const collaborator = progressDateMs_(record.effectiveDate), title = progressDateMs_(record.titleDate);
  if (!Number.isFinite(collaborator)) return {...result,status:'WAITING_GITHUB'};
  if (!Number.isFinite(title) || record.titleStatus !== 'APPROVED') return {...result,status:'WAITING_TITLE'};
  const fixing = Math.max(collaborator,title);
  if (fixing > now.getTime()) return {...result,status:'CHECK_ERROR',error:'Milestone timestamp is in the future.'};
  result.fixingDate = new Date(fixing);
  const index = windows.findIndex(w=>w.deadline_at >= fixing);
  if (index < 0) return {...result,status:'WAITING_WINDOW'};
  return {...result,eligibleFrom:windows[index].weekId,enforcedFrom:windows[index].weekId,fixedAt:now,status:'FIXED',error:''};
}

function progressTitleDate_(team, registry) {
  const r = team.row, c = team.columns;
  if (getTeamStatus_(r) !== 'APPROVED') return '';
  const matches = registry.filter(a=>textEquals_(a[0],getAcademicYear_()) && textEquals_(a[1],r[c.SEMESTER]) &&
    textEquals_(a[2],team.teamId) && emailsMatch_(a[3],r[c.GUIDE_EMAIL]) && String(a[4]) === String(r[c.TITLE]) &&
    emailsMatch_(a[8],r[c.TITLE_APPROVED_BY]));
  const value = matches.length ? matches[matches.length-1][7] : '';
  return Number.isFinite(progressDateMs_(value)) ? new Date(value) : '';
}

/** Dedicated read-only transport: retain pagination headers, never log private audit bodies. */
function progressGithubGet_(path) {
  const token = PropertiesService.getScriptProperties().getProperty('GITHUB_ADMIN_TOKEN');
  if (!token) throw new Error('GitHub authentication is unavailable.');
  if (!/^\/(orgs|repos|user)\//.test(path)) throw new Error('Invalid GitHub read path.');
  const response = UrlFetchApp.fetch('https://api.github.com'+path,{method:'get',headers:{Authorization:'token '+token,Accept:'application/vnd.github+json'},muteHttpExceptions:true});
  let body;
  try { body = JSON.parse(response.getContentText()); } catch(error) { body = null; }
  return {status:response.getResponseCode(),body,headers:response.getAllHeaders()};
}

function progressCached_(cache,key,read) {
  if (!cache.has(key)) {
    try { cache.set(key,{value:read()}); } catch(error) { cache.set(key,{error}); }
  }
  const saved = cache.get(key);
  if (saved.error) throw saved.error;
  return saved.value;
}

/** Follow only GitHub's next link. A partial scan is never negative evidence. */
function progressGithubPages_(path, request, deadline) {
  const rows = [], visited = new Set();
  while (path) {
    if (Date.now() >= deadline || visited.has(path) || visited.size >= 100) throw new Error('GitHub history scan incomplete; retry or coordinator review required.');
    visited.add(path);
    const response = request(path);
    if (response.status !== 200 || !Array.isArray(response.body)) throw new Error('GitHub history unavailable (HTTP '+response.status+').');
    rows.push(...response.body);
    const headers = response.headers || {};
    const link = String(headers.Link || headers.link || '');
    const next = link.split(',').find(value=>/rel="next"/.test(value));
    if (!next) { path = ''; continue; }
    const match = next.match(/<https:\/\/api\.github\.com(\/[^>]+)>/);
    if (!match || match[1].split('?')[0] !== path.split('?')[0]) throw new Error('Invalid GitHub pagination link.');
    path = match[1];
  }
  return rows;
}

function progressCommitEvidence_(commits, slug, githubId, now) {
  const candidates = commits.filter(commit=>commit.author && commit.author.type === 'User' && githubAuthorMatches_(githubId,commit.author.id) &&
    commitIdentity_(commit.sha) && weeklyStudentCommit_({username:commit.author.login,message:commit.commit && commit.commit.message}) &&
    typeof (commit.commit && commit.commit.message) === 'string' && Number.isFinite(progressDateMs_(commit.commit.committer && commit.commit.committer.date)) &&
    progressDateMs_(commit.commit.committer.date) <= now);
  candidates.sort((a,b)=>progressDateMs_(a.commit.committer.date)-progressDateMs_(b.commit.committer.date) || a.sha.localeCompare(b.sha));
  if (!candidates.length) return null;
  const commit = candidates[0];
  return {date:new Date(commit.commit.committer.date),reference:{sha:commit.sha,repo:slug,userId:githubId}};
}

/** Steady-state evidence only: earliest reliable access observation or qualifying commit. */
function progressSelectEvidenceDate_(record) {
  const candidates = [{date:record.firstDetected,source:'FIRST_DETECTED'},{date:record.firstCommit,source:'FIRST_COMMIT'}]
    .filter(item=>Number.isFinite(progressDateMs_(item.date)) && progressDateMs_(item.date) <= Date.now())
    .sort((a,b)=>progressDateMs_(a.date)-progressDateMs_(b.date));
  return candidates.length ? {effectiveDate:new Date(candidates[0].date),source:candidates[0].source} : {effectiveDate:'',source:''};
}

function progressResolveEvidence_(record, slug, context) {
  const result = {...record,checkedAt:new Date(),error:''}, request = context.request;
  const evidence = record.evidence ? JSON.parse(record.evidence) : {repo:slug,userId:record.githubId};
  result.evidence = JSON.stringify(evidence);
  // Preserve the first positive observation even when the history read fails.
  try {
    if (Date.now() >= context.deadline) throw new Error('Reconciliation time budget reached.');
    const account = progressCached_(context.cache,'user:'+record.githubId,()=>githubAccountResponse_(request('/user/'+record.githubId),record.githubId));
    result.username = account.username;
    const permission = request('/repos/'+slug+'/collaborators/'+encodeURIComponent(account.username)+'/permission');
    if (permission.status === 200 && githubPermissionIdentityMatches_(permission.body,record.githubId) && githubPermissionSufficient_(permission.body,'read')) {
      result.collaboratorStatus = 'ACTIVE';
      if (!result.firstDetected) result.firstDetected = new Date();
    } else if (permission.status === 404 || (permission.status === 200 && githubPermissionIdentityMatches_(permission.body,record.githubId))) result.collaboratorStatus = 'NOT_ACTIVE';
    else throw new Error('Collaborator access could not be verified.');
  } catch(error) { result.collaboratorStatus = 'UNAVAILABLE'; }
  try {
    const commits = progressCached_(context.cache,'commits:'+slug,()=>progressGithubPages_('/repos/'+slug+'/commits?per_page=100',request,context.deadline));
    const first = progressCommitEvidence_(commits,slug,record.githubId,Date.now());
    if (first || (record.firstCommit && evidence.commit)) {
      if (first && (!record.firstCommit || !evidence.commit || first.date.getTime() < progressDateMs_(record.firstCommit))) {
        result.firstCommit = first.date; evidence.commit = {...first.reference,timestamp:first.date.toISOString()};
      }
      result.evidence = JSON.stringify(evidence);
    }
    Object.assign(result,progressSelectEvidenceDate_(result));
    return result;
  } catch(error) {
    result.status = 'CHECK_ERROR'; result.error = error.message;
    return result;
  }
}

function reconcileProgressEligibility() {
  const owner = progressEligibilityCoordinator_(true), props = PropertiesService.getScriptProperties();
  const installedOwner = props.getProperty('PROGRESS_ELIGIBILITY_TRIGGER_OWNER');
  if (installedOwner && !emailsMatch_(installedOwner,owner)) throw new Error('Eligibility trigger belongs to another coordinator.');
  const records = readProgressEligibility_(), students = weeklyStudents_(), windows = getWeeklySubmissionWindows_();
  const unresolved = students.map(student=>({student,record:progressStudentEligibility_(student,records,windows)})).filter(item=>!item.record.eligibleFrom);
  const held = unresolved.filter(item=>item.record.enforcedFrom).length;
  const pending = unresolved.filter(item=>!item.record.enforcedFrom)
    .sort((a,b)=>(progressDateMs_(a.record.checkedAt)||0)-(progressDateMs_(b.record.checkedAt)||0));
  if (!pending.length) {
    const report = {checked:0,fixed:0,deferred:0,held};
    console.log('Progress eligibility reconciliation: '+JSON.stringify(report));
    return report;
  }
  const context = {request:progressGithubGet_,cache:new Map(),deadline:Date.now()+240000};
  const accounts = getSheet_(SHEET_NAMES.GITHUB_ACCOUNTS), accountColumns = githubAccountColumns_(accounts), accountRows = readSheetRows_(accounts,2);
  let registry, registryError;
  try { registry = readSheetRows_(getHubRegistrySheet_(),2); } catch(error) { registryError = true; }
  const report = {checked:0,fixed:0,deferred:0,writeErrors:0,held};
  for (const item of pending) {
    if (Date.now() >= context.deadline) { report.deferred += pending.length-report.checked; break; }
    const {student,record} = item;
    let next = {...record,checkedAt:new Date(),error:''};
    try {
      const team = weeklyTeam_(student.teamId), c = team.columns;
      const slot = [1,2,3,4].find(n=>textEquals_(team.row[c['S'+n+'_REGNO']],student.regNo));
      next.name = team.row[c['S'+slot+'_NAME']] || '';
      next.titleStatus = getTeamStatus_(team.row);
      next.titleDate = registryError ? '' : progressTitleDate_(team,registry);
      const identity = githubStudentIdentity_(student,accountRows,accountColumns,students);
      if (identity.state !== 'available') throw new Error(identity.reason);
      if (record.githubId && record.githubId !== identity.githubId) throw new Error('Eligibility GitHub identity changed; coordinator review required.');
      next.githubId = identity.githubId;
      const repo = parseGithubRepoUrl_(getRepoUrlForTeam_(student.teamId));
      if (!repo) throw new Error('Team repository is unavailable.');
      const slug = repo.owner+'/'+repo.repo;
      if (record.evidence && String(JSON.parse(record.evidence).repo).toLowerCase() !== slug.toLowerCase()) throw new Error('Eligibility repository changed; coordinator review required.');
      next = progressResolveEvidence_(next,slug,context);
      if (!next.error && registryError) throw new Error('Title approval history is unavailable.');
      if (!next.error) next = calculateProgressEligibility_(next,windows,new Date());
    } catch(error) { next.status = 'CHECK_ERROR'; next.error = error.message; }
    try { weeklyLock_(()=>{
      const currentStudent = weeklyStudents_().find(s=>textEquals_(s.regNo,student.regNo) && textEquals_(s.teamId,student.teamId) && emailsMatch_(s.email,student.email));
      if (!currentStudent) throw new Error('Student membership changed during reconciliation.');
      const current = progressStudentEligibility_(student);
      if (current.eligibleFrom) return;
      if (current.enforcedFrom) return;
      const currentAccounts = getSheet_(SHEET_NAMES.GITHUB_ACCOUNTS);
      const currentIdentity = githubStudentIdentity_(student,readSheetRows_(currentAccounts,2),githubAccountColumns_(currentAccounts));
      if (!next.error && next.githubId && (currentIdentity.state !== 'available' || currentIdentity.githubId !== next.githubId)) throw new Error('GitHub identity changed during reconciliation.');
      if (!next.error) {
        const freshTeam = weeklyTeam_(student.teamId);
        if (next.evidence) {
          const repo = parseGithubRepoUrl_(getRepoUrlForTeam_(student.teamId));
          if (!repo || (repo.owner+'/'+repo.repo).toLowerCase() !== String(JSON.parse(next.evidence).repo).toLowerCase()) throw new Error('Repository changed during reconciliation.');
        }
        next.titleStatus = getTeamStatus_(freshTeam.row);
        next.titleDate = progressTitleDate_(freshTeam,readSheetRows_(getHubRegistrySheet_(),2));
      }
      if (current.firstDetected) next.firstDetected = current.firstDetected;
      // A concurrent run may have established the first observation.
      Object.assign(next,progressSelectEvidenceDate_(next));
      next.rowNumber = current.rowNumber;
      if (!next.error) next = calculateProgressEligibility_({...next,eligibleFrom:'',fixedAt:''},getWeeklySubmissionWindows_(),new Date());
      writeProgressEligibility_(next);
      if (next.eligibleFrom) report.fixed++;
    }); } catch(error) { report.writeErrors++; console.error('Progress eligibility persistence deferred; no boundary committed for this attempt.'); }
    report.checked++;
  }
  console.log('Progress eligibility reconciliation: '+JSON.stringify(report));
  return report;
}

