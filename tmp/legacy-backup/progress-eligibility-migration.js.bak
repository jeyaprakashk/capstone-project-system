/** MIGRATION ONLY. Remove this entire file after separately authorized migration cleanup.
 * No production caller uses this module. Verify fixed results and hold unresolved
 * exceptions before daily reconciliation; there is no migration policy in the daily job.
 */
function readProgressEligibilityMigration_() {
  const properties = PropertiesService.getScriptProperties(), raw = properties.getProperty('PROGRESS_ELIGIBILITY_MIGRATION');
  if (!raw) return null;
  const plan = JSON.parse(raw), students = [];
  for (let index=0;index<plan.chunks;index++) {
    const chunk = properties.getProperty('PROGRESS_ELIGIBILITY_MIGRATION_COHORT_'+index);
    if (!chunk) throw new Error('Migration cohort snapshot is incomplete.');
    students.push(...JSON.parse(chunk));
  }
  return {...plan,students};
}

/** MIGRATION ONLY: timestamp must belong to this student's verified numeric identity and team. */
function progressMigrationRegistration_(student, githubId, rows, columns, now) {
  const candidates = rows.map((row,index)=>({row,rowNumber:index+2}))
    .filter(item=>emailsMatch(item.row[1],student.email) && textEquals_(item.row[2],student.teamId) &&
      githubAuthorMatches_(githubId,item.row[columns.ID]) && Number.isFinite(progressDateMs_(item.row[0])) &&
      progressDateMs_(item.row[0]) <= now.getTime())
    .sort((a,b)=>progressDateMs_(a.row[0])-progressDateMs_(b.row[0]));
  return candidates.length ? {date:new Date(candidates[0].row[0]),sheet:'GitHubAccounts',row:candidates[0].rowNumber,userId:githubId} : null;
}

/** MIGRATION ONLY: registration can benefit existing students, never future students. */
function calculateProgressEligibilityMigration_(record, registration, windows, cutoverWeek, now) {
  if (record.eligibleFrom) return record;
  const next = {...record,...progressSelectEvidenceDate_(record),enforcedFrom:cutoverWeek};
  const evidence = next.evidence ? JSON.parse(next.evidence) : {};
  if (registration && Number.isFinite(progressDateMs_(registration.date)) && progressDateMs_(registration.date) <= now.getTime()) {
    evidence.migrationRegistration = {...registration,date:new Date(registration.date).toISOString()};
    if (!next.effectiveDate || progressDateMs_(registration.date) < progressDateMs_(next.effectiveDate)) {
      next.effectiveDate = new Date(registration.date); next.source = 'MIGRATION_REGISTRATION';
    }
  }
  next.evidence = JSON.stringify(evidence);
  const floor = windows.findIndex(window=>window.weekId === cutoverWeek);
  if (floor < 0) throw new Error('Unknown migration cutover Week ID.');
  const fixed = next.error ? next : calculateProgressEligibility_(next,windows,now);
  if (fixed.eligibleFrom) {
    const historical = windows.findIndex(window=>window.weekId === fixed.eligibleFrom);
    fixed.enforcedFrom = windows[Math.max(historical,floor)].weekId;
  }
  return fixed;
}

/** MIGRATION ONLY, READ ONLY. Includes full-history evidence reads; never persists observations. */
function previewProgressEligibilityMigrationEvidence(cutoverIso) {
  progressEligibilityCoordinator_();
  const plan = previewProgressEligibilityMigration(cutoverIso), roster = weeklyStudents_(), records = readProgressEligibility_();
  const accounts = getSheet(SHEET_NAMES.GITHUB_ACCOUNTS), columns = githubAccountColumns_(accounts), rows = readSheetRows_(accounts,2);
  const registry = readSheetRows_(getHubRegistrySheet(),2), windows = getWeeklySubmissionWindows_();
  // MIGRATION ONLY: leave time for persistence within the Apps Script execution limit.
  const context = {request:progressGithubGet_,cache:new Map(),deadline:Date.now()+90000};
  let selected = 0;
  const members = plan.students.slice().sort((a,b)=>{
    const x = records.find(r=>textEquals_(r.regNo,a.regNo)), y = records.find(r=>textEquals_(r.regNo,b.regNo));
    return (progressDateMs_(x && x.checkedAt)||0)-(progressDateMs_(y && y.checkedAt)||0);
  });
  const results = members.map(member=>{
    const student = roster.find(s=>textEquals_(s.regNo,member.regNo) && textEquals_(s.teamId,member.teamId));
    if (!student) throw new Error('Migration cohort membership changed; coordinator review required.');
    let record = {...progressStudentEligibility_(student,records,windows),error:''};
    if (record.eligibleFrom) return {student,record,alreadyFixed:true};
    if (selected >= 20 || Date.now() >= context.deadline) return {student,record,deferred:true};
    selected++;
    record.checkedAt = new Date();
    try {
      const identity = githubStudentIdentity_(student,rows,columns,roster);
      if (identity.state !== 'available') throw new Error(identity.reason);
      if (record.githubId && record.githubId !== identity.githubId) throw new Error('Eligibility GitHub identity changed.');
      record.githubId = identity.githubId;
      const repo = parseGithubRepoUrl_(getRepoUrlForTeam(student.teamId));
      if (!repo) throw new Error('Team repository is unavailable.');
      const slug = repo.owner+'/'+repo.repo;
      if (record.evidence && String(JSON.parse(record.evidence).repo).toLowerCase() !== slug.toLowerCase()) throw new Error('Eligibility repository changed.');
      record = progressResolveEvidence_(record,slug,context);
      const team = weeklyTeam_(student.teamId);
      const slot = [1,2,3,4].find(n=>textEquals_(team.row[team.columns['S'+n+'_REGNO']],student.regNo));
      record.name = team.row[team.columns['S'+slot+'_NAME']] || '';
      record.titleStatus = getTeamStatus(team.row); record.titleDate = progressTitleDate_(team,registry);
      record = calculateProgressEligibilityMigration_(record,progressMigrationRegistration_(student,identity.githubId,rows,columns,new Date()),windows,plan.cutoverWeek,new Date());
    } catch(error) { record.status = 'CHECK_ERROR'; record.error = error.message; }
    return {student,record};
  });
  return {...plan,results,unresolved:results.filter(item=>!item.record.eligibleFrom).length,
    deferred:results.filter(item=>item.deferred).length};
}

/** MIGRATION ONLY. Explicit manual execution after preview/authorization; safe to resume. */
function executeProgressEligibilityMigration() {
  progressEligibilityCoordinator_();
  const plan = readProgressEligibilityMigration_();
  if (!plan || plan.state !== 'INITIALIZED') throw new Error('Initialize and verify the migration cohort first.');
  const preview = previewProgressEligibilityMigrationEvidence(); // Network reads outside the lock.
  let fixed = 0;
  preview.results.forEach(item=>{
    if (item.alreadyFixed || item.deferred) return;
    weeklyLock_(()=>{
      const roster = weeklyStudents_(), student = roster.find(s=>textEquals_(s.regNo,item.student.regNo) && textEquals_(s.teamId,item.student.teamId) && emailsMatch(s.email,item.student.email));
      if (!student) throw new Error('Migration cohort membership changed.');
      const current = progressStudentEligibility_(student);
      if (current.eligibleFrom) return;
      const accounts = getSheet(SHEET_NAMES.GITHUB_ACCOUNTS), columns = githubAccountColumns_(accounts), rows = readSheetRows_(accounts,2);
      const identity = githubStudentIdentity_(student,rows,columns,roster);
      let next = {...item.record,rowNumber:current.rowNumber,eligibleFrom:'',fixedAt:''};
      if (!next.error && (identity.state !== 'available' || identity.githubId !== next.githubId)) throw new Error('GitHub identity changed during migration.');
      if (current.firstDetected) next.firstDetected = current.firstDetected;
      if (!next.error) {
        const repo = parseGithubRepoUrl_(getRepoUrlForTeam(student.teamId));
        if (!repo || (repo.owner+'/'+repo.repo).toLowerCase() !== String(JSON.parse(next.evidence).repo).toLowerCase()) throw new Error('Repository changed during migration.');
        const team = weeklyTeam_(student.teamId);
        next.titleStatus = getTeamStatus(team.row); next.titleDate = progressTitleDate_(team,readSheetRows_(getHubRegistrySheet(),2));
        next = calculateProgressEligibilityMigration_(next,progressMigrationRegistration_(student,identity.githubId,rows,columns,new Date()),getWeeklySubmissionWindows_(),plan.cutoverWeek,new Date());
      }
      writeProgressEligibility_(next);
      if (next.eligibleFrom) fixed++;
    });
  });
  const records = readProgressEligibility_(), windows = getWeeklySubmissionWindows_();
  const unresolved = plan.students.filter(student=>!progressStudentEligibility_(student,records,windows).eligibleFrom).length;
  const report = {fixed,unresolved,deferred:preview.deferred,complete:unresolved === 0};
  console.log('Progress eligibility migration: '+JSON.stringify(report));
  return report;
}

/** Retain unresolved cohort members for manual migration; never clear existing holds. */
function holdProgressEligibilityMigrationExceptions() {
  progressEligibilityCoordinator_();
  return weeklyLock_(()=>{
    const plan = readProgressEligibilityMigration_();
    if (!plan || plan.state !== 'INITIALIZED') throw new Error('Initialize and verify the migration cohort first.');
    const records = readProgressEligibility_(), holds = progressEligibilityHolds_(), windows = getWeeklySubmissionWindows_();
    const unresolved = plan.students.filter(student=>!progressStudentEligibility_(student,records,windows).eligibleFrom);
    unresolved.forEach(student=>holds.add(normalizeText_(student.regNo)));
    PropertiesService.getScriptProperties().setProperty('PROGRESS_ELIGIBILITY_RECONCILIATION_HOLDS',JSON.stringify([...holds]));
    const report = {held:unresolved.length,totalHolds:holds.size,cutover:plan.cutover,cutoverWeek:plan.cutoverWeek};
    console.log('Progress eligibility holds: '+JSON.stringify(report));
    return report;
  });
}

function previewProgressEligibilityMigration(cutoverIso) {
  progressEligibilityCoordinator_();
  const saved = readProgressEligibilityMigration_();
  if (saved) return {...saved,alreadyInitialized:true};
  const cutover = cutoverIso ? new Date(cutoverIso) : new Date();
  if (!Number.isFinite(cutover.getTime()) || cutover.getTime() > Date.now()) throw new Error('Cutover must be a valid timestamp no later than now.');
  const window = getWeeklySubmissionWindows_().find(w=>w.deadline_at >= cutover.getTime());
  if (!window) throw new Error('No cutover WeeklyWindow exists. Configure a future window before migration.');
  const records = readProgressEligibility_(), students = weeklyStudents_();
  if (records.some(row=>row.eligibleFrom || row.enforcedFrom)) throw new Error('Individual boundaries already exist. Review before one-time migration.');
  students.forEach(student=>progressStudentEligibility_(student,records));
  return {cutover:cutover.toISOString(),cutoverWeek:window.weekId,students:students.map(s=>({regNo:s.regNo,teamId:s.teamId}))};
}

function initializeProgressEligibilityMigration(cutoverIso) {
  progressEligibilityCoordinator_();
  return weeklyLock_(()=>{
    const properties = PropertiesService.getScriptProperties();
    const saved = readProgressEligibilityMigration_();
    const plan = saved || previewProgressEligibilityMigration(cutoverIso);
    if (!getWeeklySubmissionWindows_().some(w=>w.weekId === plan.cutoverWeek)) throw new Error('Migration cutover Week ID no longer exists.');
    const chunks = Math.ceil(plan.students.length/25);
    const manifest = {cutover:plan.cutover,cutoverWeek:plan.cutoverWeek,chunks};
    // Persist the immutable cohort before cell writes, so a failed initialization can resume.
    if (!saved) {
      const values = Array.from({length:chunks},(_,index)=>JSON.stringify(plan.students.slice(index*25,(index+1)*25)));
      if (values.some(value=>value.length>2000)) throw new Error('Migration identity snapshot exceeds safe property size.');
      values.forEach((value,index)=>properties.setProperty('PROGRESS_ELIGIBILITY_MIGRATION_COHORT_'+index,value));
      properties.setProperty('PROGRESS_ELIGIBILITY_MIGRATION',JSON.stringify({...manifest,state:'INITIALIZING'}));
    }
    const records = readProgressEligibility_(), roster = weeklyStudents_();
    plan.students.forEach(student=>{
      if (!roster.some(s=>textEquals_(s.regNo,student.regNo) && textEquals_(s.teamId,student.teamId))) throw new Error('Migration cohort membership changed; coordinator review required.');
      const current = progressStudentEligibility_(student,records);
      if (current.eligibleFrom) {
        const windows = getWeeklySubmissionWindows_();
        if (windows.findIndex(w=>w.weekId === current.enforcedFrom) < windows.findIndex(w=>w.weekId === plan.cutoverWeek)) throw new Error('Fixed row predates migration enforcement.');
        return;
      }
      if (current.enforcedFrom && current.enforcedFrom !== plan.cutoverWeek) throw new Error('Migration enforcement conflict.');
      writeProgressEligibility_({...current,enforcedFrom:plan.cutoverWeek,status:current.status || 'PENDING'});
    });
    properties.setProperty('PROGRESS_ELIGIBILITY_MIGRATION',JSON.stringify({...manifest,state:'INITIALIZED'}));
    return {ok:true,students:plan.students.length,cutover:plan.cutover,cutoverWeek:plan.cutoverWeek};
  });
}
