/** Reviewer marks use the existing committee sheets and rubric levels (0–5). */
function reviewerTeamContext_(teamId) {
  const email = Session.getActiveUser().getEmail();
  if (!email) throw new Error('Sign in with your institutional account.');
  const TS = getColumnMap(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const rows = getSheetRows(SHEET_NAMES.TEAM_STATUS).filter(r => textEquals_(r[TS.TEAM_ID], teamId));
  if (rows.length !== 1) throw new Error('Team is missing or ambiguous.');
  const row = rows[0], committee = String(row[TS.COMMITTEE_NUMBER] || '').trim();
  if (!getCommitteeNumbersForReviewer(email).some(number => textEquals_(number, committee))) throw new Error('You are not an assigned reviewer for this team.');
  const students = getStudentsFromTeamStatusRow_(row, TS).map(student => ({register:normalizeReviewKey_(student.regNo),name:String(student.name || '')}));
  return {TS,row,committee,students,team:String(row[TS.TEAM_ID]),title:String(row[TS.TITLE] || '')};
}

function reviewerReviewRows_(spreadsheet, committee, review) {
  const sheet = getNamedSheet_(spreadsheet, committeeReviewTabName_(committee, review));
  if (!sheet) throw new Error('The marking sheet for ' + review.label + ' is not available.');
  const width = REVIEW_MARK_COLUMNS_.criteria + review.rubric.length;
  if (sheet.getLastColumn() < width) throw new Error('Rubric columns are missing. Ask the coordinator to check the marking sheet.');
  const values = readSheetRows_(sheet, 1, Math.max(1, sheet.getLastRow()));
  const expected = buildHeaderRow(review.rubric);
  if (expected.some((header,index) => String(values[0][index]) !== String(header))) throw new Error('The marking sheet does not match the current rubric. Ask the coordinator to check it.');
  return {sheet,rows:values.slice(1)};
}

function reviewerEvaluationContext_(teamId, reviewKey) {
  const context = reviewerTeamContext_(teamId);
  if (!context.title.trim() || !textEquals_(context.row[context.TS.REVIEWER_DECISION], 'Approved')) throw new Error('Approve the project title before entering review marks.');
  if (!context.students.length || new Set(context.students.map(s => s.register)).size !== context.students.length) throw new Error('Student roster is missing or ambiguous.');
  const reviews = getReviewDefinitions_();
  const index = reviews.findIndex(review => review.key === reviewKey);
  if (index < 0) throw new Error('Unknown review.');
  if (reviewKey === 'review2') review1RequireCompleted_(context.row,context.TS,reviews[index].label);
  const info = getCommitteeInfo(context.committee);
  if (!info || !info.marksSheetId) throw new Error('The coordinator has not created the committee marking spreadsheet.');
  const spreadsheet = SpreadsheetApp.openById(info.marksSheetId);
  const registers = new Set(context.students.map(s => s.register));
  for (let i=0;i<index;i++) {
    if (reviews[i].key === 'review1') {
      if (reviewKey !== 'review2') review1RequireCompleted_(context.row,context.TS,reviews[index].label);
      continue;
    }
    const previous = reviewerReviewRows_(spreadsheet,context.committee,reviews[i]);
    const indexed = indexReviewRows_(previous.rows).get(normalizeReviewKey_(context.team));
    if (!summarizeReviewCompletion_(registers,indexed,reviews[i].rubric).completed) throw new Error('Complete ' + reviews[i].label + ' for every student before entering ' + reviews[index].label + ' marks.');
  }
  const review = reviews[index], result = reviewerReviewRows_(spreadsheet,context.committee,review);
  const matched = context.students.map(student => {
    const matches = result.rows.map((row,i) => ({row,number:i+2})).filter(item => textEquals_(item.row[1],context.team) && normalizeReviewKey_(item.row[2]) === student.register);
    if (matches.length !== 1 || !textEquals_(matches[0].row[4],context.committee)) throw new Error('Student marking rows are missing or ambiguous. Ask the coordinator to check the sheet.');
    return {...student,...matches[0]};
  });
  const revision = Utilities.base64EncodeWebSafe(Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256,JSON.stringify({team:context.team,committee:context.committee,title:context.title,review,students:matched})));
  return {...context,review,sheet:result.sheet,matched,revision};
}

function getReviewerEvaluation(teamId, reviewKey) {
  if (reviewKey === 'review1') return getReview1Evaluation(teamId);
  const context = reviewerEvaluationContext_(teamId,reviewKey);
  return {team:context.team,title:context.title,review:{key:context.review.key,label:context.review.label},criteria:context.review.rubric,revision:context.revision,
    students:context.matched.map(student => ({register:student.register,name:student.name,comments:String(student.row[6] || ''),levels:context.review.rubric.map((pi,i) => isReviewMarkEntered_(student.row[7+i]) ? Number(student.row[7+i]) : null)}))};
}

function saveReviewerEvaluation(teamId, reviewKey, payload) {
  if (reviewKey === 'review1') throw new Error('Use the Review 1 draft and submission workflow.');
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw new Error('Another save is in progress. Try again.');
  try {
    const context = reviewerEvaluationContext_(teamId,reviewKey);
    if (!payload || payload.revision !== context.revision) throw new Error('Marks, roster, or rubric changed since you opened the drawer. Close and reopen it before saving.');
    if (!Array.isArray(payload.students) || payload.students.length !== context.students.length) throw new Error('Submit marks for every registered student.');
    const ids = payload.students.map(s => s && normalizeReviewKey_(s.register));
    if (new Set(ids).size !== ids.length) throw new Error('Duplicate student marks.');
    const updates = context.matched.map(student => {
      const entry = payload.students.find(s => s && normalizeReviewKey_(s.register) === student.register);
      if (!entry || !Array.isArray(entry.levels) || entry.levels.length !== context.review.rubric.length || !entry.levels.every(isReviewMarkEntered_)) throw new Error('Select a level from 0 to 5 for every criterion and student.');
      if (typeof entry.comments !== 'string' || entry.comments.length > 5000) throw new Error('Comments must be text with at most 5000 characters.');
      return {number:student.number,levels:entry.levels.map(Number),comments:entry.comments};
    });
    context.review.rubric.forEach((criterion,i) => {
      if (criterion.type === 'Team' && updates.some(update => update.levels[i] !== updates[0].levels[i])) throw new Error('Team criteria must have the same level for all students.');
    });
    // Validate everything first. Only comments and criterion inputs are written; totals remain formulas.
    try {
      updates.forEach(update => context.sheet.getRange(update.number,7,1,1+update.levels.length).setValues([[ /^[=+@-]/.test(update.comments) ? "'" + update.comments : update.comments,...update.levels]]));
      SpreadsheetApp.flush();
    } catch (err) {
      throw new Error('Could not save all marks. Some rows may have saved; close and reopen the drawer to check before retrying. ' + err.message);
    }
    return {ok:true,message:context.review.label + ' marks saved.'};
  } finally { lock.releaseLock(); }
}

/** Read each assigned committee once; never fetch unrelated committees' marks. */
function getReviewerReviewProgress_(rows) {
  const TS = getColumnMap(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const result = {reviews:[],teams:Object.create(null),error:''};
  try { result.reviews = getReviewDefinitions_(); }
  catch (err) { result.error = err.message; return result; }
  let review1Records = [], review1Config, review1Error = '';
  if (result.reviews.some(r=>r.key==='review1')) {
    try {review1Config=review1Configuration_(); const history=review1Records_(); review1Records=history.records; if (!history.sheet) throw new Error('Review1Evaluations is missing from the main spreadsheet. Create the tab manually with the required headers.');}
    catch(err) {review1Error=err.message;}
  }
  const grouped = new Map();
  rows.forEach(row => { const key=String(row[TS.COMMITTEE_NUMBER] || ''); if (!grouped.has(key)) grouped.set(key,[]); grouped.get(key).push(row); });
  grouped.forEach((teams,committee) => {
    let spreadsheet, issue='';
    try { const info=getCommitteeInfo(committee); if (!info || !info.marksSheetId) throw new Error('Marking spreadsheet not created.'); spreadsheet=SpreadsheetApp.openById(info.marksSheetId); }
    catch(err) { issue=err.message; }
    result.reviews.forEach(review => {
      if (review.key === 'review1') {
        teams.forEach(row=>{
          const team=normalizeReviewKey_(row[TS.TEAM_ID]);
          if (!result.teams[team]) result.teams[team]={};
          result.teams[team][review.key]=review1Error?{available:false,completed:false,error:review1Error}:review1Progress_(row,TS,review1Records,review1Config);
        });
        return;
      }
      let indexed, error=issue;
      if (!error) { try { indexed=indexReviewRows_(reviewerReviewRows_(spreadsheet,committee,review).rows); } catch(err) {error=err.message;} }
      teams.forEach(row => {
        const team=normalizeReviewKey_(row[TS.TEAM_ID]);
        if (!result.teams[team]) result.teams[team]={};
        const registers=new Set(getStudentsFromTeamStatusRow_(row,TS).map(s=>normalizeReviewKey_(s.regNo)));
        result.teams[team][review.key]={...summarizeReviewCompletion_(registers,indexed && indexed.get(team),review.rubric),available:!error,error};
      });
    });
  });
  return result;
}
