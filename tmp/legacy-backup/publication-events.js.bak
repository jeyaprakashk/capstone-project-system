/** Publication records contain references and released data, never academic evidence. */
const PUBLICATION_SCHEMA_ = 1;
function publicationAdapters_() {
  return {
    REVIEW: {teamPublication:'native',reopenScope:'team',
      read:key=>reviewRecords_(key), config:key=>reviewConfiguration_(key),
      latest:(records,team)=>reviewLatest_(records,team),
      reopen:input=>reopenReviewEvaluation(input),
      reopenDescription:'Copies evidence into a correction draft. The previous publication remains visible under correction.',
      reopenChanges:(record,key,roster)=>evaluationReopenChanges_(record,reviewConfiguration_(key),roster)},
    GUIDE_EVALUATION: {teamPublication:'sequential',reopenScope:'student',
      read:()=>guideRecords_(),config:()=>guideConfiguration_(),
      latest:(records,team,student)=>guideLatest_(records,team,student),
      reopen:input=>reopenGuideEvaluation(input),
      reopenDescription:'Opens a new Guide correction draft. The previous publication remains visible under correction.',
      reopenChanges:()=>[]}
  };
}
function publicationDefinitions_() {
  const definitions=getAssessmentDefinitions_().filter(d=>publicationAdapters_()[d.type]);
  return definitions.sort((a,b)=>a.sequence-b.sequence||a.key.localeCompare(b.key));
}
function publicationDefinition_(key) {
  const d=getAssessmentDefinitions_().find(d=>d.key===key);
  if(!d||!publicationAdapters_()[d.type])throw new Error('Unknown assessment.');
  return d;
}
function publicationRoster_(team) {
  const columns=getColumnMap(SHEET_NAMES.TEAM_STATUS,FIELD_DEFINITIONS.TEAM_STATUS);
  const rows=getSheetRows(SHEET_NAMES.TEAM_STATUS).filter(r=>textEquals_(r[columns.TEAM_ID],team));
  if(rows.length!==1)throw new Error('Team is missing or ambiguous.');
  const row=rows[0],roster={team:normalizeText_(team),students:getStudentsFromTeamStatusRow_(row,columns).map(s=>({register:normalizeText_(s.regNo),name:String(s.name||''),email:normalizeEmail(s.email)}))};
  evaluationMembership_(roster);
  return roster;
}
function publicationMembershipBlock_(record,roster) {
  if(!record)return 'This action is not available for the current status.';
  const membership=record.membership||(record.roster&&evaluationMembership_(record.roster));
  return !membership||evaluationHash_(membership)!==evaluationHash_(evaluationMembership_(roster))?'Roster membership differs from the assessed membership. Publishing is blocked.':'';
}
function publicationSnapshot_(definition,record,member) {
  const review=definition.type==='REVIEW',student=review?record.students.find(s=>s.register===member.register):record;
  if(!student)throw new Error('Unknown student.');
  const a=review?student.assessment:null,criteria=[],scores={};
  record.config.criteria.forEach(c=>{
    const effective=review?a.effectiveScores[c.pi]:null;
    const evidence=review?(c.type==='Team'?record.teamScores:a.individualSource==='makeup'?a.makeup.scores:student.scores):student.scores;
    const score=evidence[c.pi]||{},source=effective?effective.source:'assessment';
    criteria.push({pi:c.pi,name:c.name,maxMarks:c.maxMarks,type:c.type});
    scores[c.pi]={marks:effective?effective.marks:score.marks,level:effective&&(effective.state!=='RESOLVED'||source==='policy')?null:score.level,
      remark:effective&&(effective.state!=='RESOLVED'||source==='policy')?'':String(score.remark||''),source,state:effective?effective.state:'RESOLVED'};
  });
  return {identity:{team:record.team,register:member.register,name:member.name},
    config:{key:definition.key,label:record.config.label||definition.label,maximum:record.config.maximum,weight:record.config.weight,criteria},
    scores,total:student.total,weighted:student.weighted,
    assessment:review?{status:a.status,completed:a.completed,teamMark:a.teamMark,individualMark:a.individualMark,teamState:a.teamState,individualState:a.individualState,teamSource:a.teamSource,individualSource:a.individualSource}:{status:'COMPLETED',completed:true}};
}
/** Merge publication metadata in memory for existing evaluation lifecycle callers.
 * Only original academic records are used to verify source references. */
function publicationProject_(academic,rows,key) {
  const records=academic.slice(),seen=new Set(academic.map(r=>JSON.stringify([r.team,r.student||'',r.revision])));
  rows.slice(1).filter(r=>r[0]&&String(r[4])==='publish').sort((a,b)=>Number(a[3])-Number(b[3])).forEach(row=>{
    const event=JSON.parse(row[8]);
    if(row[0]!==key||event.kind!=='PUBLICATION'||event.schemaVersion!==PUBLICATION_SCHEMA_||event.presentationVersion!==1)throw new Error('Unsupported publication record.');
    const team=normalizeText_(row[1]),student=row[2]==='*'?'':normalizeText_(row[2]),revision=Number(row[3]);
    const identity=JSON.stringify([team,student,revision]);
    if(seen.has(identity)||!Number.isSafeInteger(revision)||revision<1)throw new Error('Conflicting publication revision.');seen.add(identity);
    const source=academic.find(r=>r.team===team&&(r.student||'')===student&&r.revision===event.sourceRevision);
    if(!source||source.status!=='Submitted'||evaluationHash_(source)!==event.sourceHash||event.sourceRevision>=revision)throw new Error('Publication source integrity mismatch.');
    if(!Array.isArray(event.releases)||!event.releases.length||new Set(event.releases.map(r=>r.student)).size!==event.releases.length)throw new Error('Invalid publication scope.');
    event.releases.forEach(release=>{if(release.snapshot.identity.team!==team||release.snapshot.identity.register!==release.student||evaluationHash_(release.snapshot)!==release.snapshotHash)throw new Error('Publication snapshot integrity mismatch.');});
    const previous=records.filter(r=>r.team===team&&(r.student||'')===student&&r.revision<revision).sort((a,b)=>b.revision-a.revision)[0];
    if(!previous||previous.status==='Draft'||(previous.academicRevision||previous.revision)!==source.revision)throw new Error('Publication source is not the current finalized revision.');
    if(event.releases.some(r=>student?r.student!==student:!source.students.some(s=>s.register===r.student)))throw new Error('Invalid publication student.');
    const projected={...previous,revision,academicRevision:source.revision,action:'publish',actor:String(row[5]),at:String(row[6]),requestId:String(row[7]),fingerprint:event.fingerprint,publication:event};
    if(student)projected.status='Published';
    else {projected.students=previous.students.map(s=>event.releases.some(r=>r.student===s.register)?{...s,needsPublication:false}:s);projected.status=projected.students.some(s=>s.needsPublication)?'Submitted':'Published';}
    records.push(projected);
  });
  return records;
}
function publicationLatestRelease_(records,team,student) {
  const record=records.filter(r=>r.team===team&&r.publication&&r.publication.releases.some(s=>s.student===student)).sort((a,b)=>b.revision-a.revision)[0];
  return record?{record,release:record.publication.releases.find(s=>s.student===student)}:null;
}
function publishInternalAssessment(input) {
  const actor=guideActor_(true),definition=publicationDefinition_(input&&input.assessmentId),adapter=publicationAdapters_()[definition.type];
  return evaluationCommand_('publish',input,fingerprint=>{
    const roster=publicationRoster_(input.team),{sheet,records}=adapter.read(definition.key);
    if(!sheet)throw new Error('Assessment journal is missing.');
    const duplicate=evaluationDuplicate_(records,actor,input,fingerprint);if(duplicate)return {revision:duplicate.revision,status:duplicate.status};
    const student=input.student?normalizeText_(input.student):null;
    if(student&&!roster.students.some(s=>s.register===student))throw new Error('Unknown student.');
    if(adapter.reopenScope==='student'&&!student)throw new Error('Select a student for this publication.');
    const latest=adapter.latest(records,roster.team,student);evaluationRevision_(latest,input);
    if(!latest||latest.status!=='Submitted')throw new Error('This action is not available for the current status.');
    const block=publicationMembershipBlock_(latest,roster);if(block)throw new Error(block);
    const source=records.find(r=>r.team===roster.team&&(r.student||'')===(latest.student||'')&&r.revision===(latest.academicRevision||latest.revision)&&!r.publication);
    if(!source||source.status!=='Submitted')throw new Error('A finalized source assessment revision is required.');
    const members=student?roster.students.filter(s=>s.register===student):roster.students;
    const releases=members.map(member=>{const snapshot=publicationSnapshot_(definition,source,member);return {student:member.register,snapshot,snapshotHash:evaluationHash_(snapshot)};});
    const event={kind:'PUBLICATION',eventId:evaluationHash_({assessmentId:definition.key,team:roster.team,student,revision:latest.revision+1,requestId:input.requestId}),schemaVersion:PUBLICATION_SCHEMA_,presentationVersion:1,sourceRevision:source.revision,sourceHash:evaluationHash_(source),
      policyVersion:source.config.academicPolicyVersion||source.config.policy,configurationHash:evaluationHash_(source.config),rubricHash:evaluationHash_(source.config.criteria),fingerprint,releases};
    const revision=latest.revision+1;
    evaluationAppend_(sheet,[[definition.key,roster.team,adapter.reopenScope==='team'?'*':student,revision,'publish',actor,new Date().toISOString(),input.requestId,JSON.stringify(event)]]);
    return {revision,status:adapter.reopenScope==='student'||!student||latest.students.every(s=>s.register===student||!s.needsPublication)?'Published':'Submitted'};
  });
}
function reopenInternalAssessment(input) {
  guideActor_(true);const d=publicationDefinition_(input&&input.assessmentId);
  return publicationAdapters_()[d.type].reopen(input);
}
function loadPublishedAssessment_(key) {
  const actor=guideActor_(false),d=publicationDefinition_(key),adapter=publicationAdapters_()[d.type];
  const columns=getColumnMap(SHEET_NAMES.TEAM_STATUS,FIELD_DEFINITIONS.TEAM_STATUS);
  const matches=getSheetRows(SHEET_NAMES.TEAM_STATUS).filter(r=>r[columns.TEAM_ID]).flatMap(row=>getStudentsFromTeamStatusRow_(row,columns).filter(s=>emailsMatch(s.email,actor)).map(s=>({team:normalizeText_(row[columns.TEAM_ID]),student:normalizeText_(s.regNo)})));
  if(matches.length!==1)throw new Error('Student assignment is missing or ambiguous.');
  const match=matches[0],roster=publicationRoster_(match.team);evaluationMembership_(roster);
  const {records}=adapter.read(key),published=publicationLatestRelease_(records,match.team,match.student);if(!published)return null;
  const latest=adapter.latest(records,match.team,match.student);
  const correction=records.some(r=>r.team===match.team&&(!r.student||r.student===match.student)&&r.action==='reopen'&&r.revision>published.record.revision);
  return {...published.release.snapshot,publication:{revision:published.record.revision,sourceRevision:published.record.publication.sourceRevision,at:published.record.at,presentationVersion:1},underCorrection:correction,
    updatePending:latest.revision>published.record.revision&&(d.type==='REVIEW'?!!latest.students.find(s=>s.register===match.student)?.needsPublication:latest.status==='Submitted')};
}
