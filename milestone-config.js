/** Semester definitions, read once per execution; never cached across requests. */
let milestonesExecution_ = null;
const MILESTONE_HEADERS_ = ['Milestone ID','Milestone Name','Due Date','Graded By','Weight (%)'];
// Stable storage names are keyed by milestone ID, never label or due-date order.
const EVALUATION_SHEET_NAMES_ = Object.freeze({
  review1: 'Review1Evaluations',
  review2: 'Review2Evaluations',
  guide_eval: 'GuideEvaluations'
});
function parseMilestoneRows_(rows, timezone) {
  const headers = (rows[0] || []).map(normalizeText_);
  const columns = MILESTONE_HEADERS_.map(name => {
    const key = normalizeText_(name), index = headers.indexOf(key);
    if (index < 0 || headers.lastIndexOf(key) !== index) throw new Error('Milestones requires exactly one ' + name + ' column.');
    return index;
  });
  const ids = new Set(), roles = ['Review Committee','Project Guide','SEE Committee','Not Applicable'];
  const result = [];
  rows.slice(1).forEach((row,index) => {
    if (!row.some(value => String(value ?? '').trim())) return;
    const [id,name,date,grader,weight] = columns.map(col => row[col]);
    const key = normalizeText_(id), label = String(name ?? '').trim();
    const fail = message => {throw new Error('Milestones row ' + (index + 2) + ': ' + message);};
    if (!/^[a-z][a-z0-9_-]{0,39}$/.test(key)) fail('Milestone ID must start with a letter and use up to 40 letters, digits, underscores or hyphens.');
    if (ids.has(key)) fail('Duplicate Milestone ID ' + key + '.');
    if (['end','week1','timezone','reviews','reviewcount','milestones'].includes(key)) fail('Reserved Milestone ID ' + key + '.');
    if (!label) fail('Milestone Name is required.');
    const gradedBy = roles.find(role => normalizeText_(role) === normalizeText_(grader));
    if (!gradedBy) fail('Graded By must be ' + roles.join(', ') + '.');
    const raw = String(weight ?? '').trim();
    const graded = gradedBy !== 'Not Applicable';
    if (graded && (!/^\d+(\.\d{1,2})?$/.test(raw) || Number(raw) <= 0 || Number(raw) > 100)) fail('Graded milestones need Weight (%) greater than 0 and at most 100.');
    if (!graded && raw !== '' && Number(raw) !== 0) fail('Non-graded milestones must have blank or zero Weight (%).');
    if (gradedBy === 'Project Guide' && key !== 'guide_eval') fail('Use guide_eval as the ID for the individual guide evaluation workflow.');
    if (key === 'guide_eval' && gradedBy !== 'Project Guide') fail('guide_eval must be graded by Project Guide.');
    let dateColumn = columns[2] + 1, letters = '';
    while (dateColumn > 0) { dateColumn--; letters = String.fromCharCode(65 + dateColumn % 26) + letters; dateColumn = Math.floor(dateColumn / 26); }
    const location = key + ' Due Date at ' + letters + (index + 2);
    const blankDate = date === null || date === undefined || String(date).trim() === '';
    if (blankDate && gradedBy !== 'SEE Committee') {
      fail(location + ' is blank. Enter the scheduled date as a date cell, DD/MM/YYYY or YYYY-MM-DD.');
    }
    let day = null;
    try { if (!blankDate) day = projectDay_(date,timezone,location); }
    catch(err) { fail(err.message + ' Received: ' + JSON.stringify(String(date).slice(0,100)) + '.'); }
    ids.add(key);
    result.push(Object.freeze({key,label,day,gradedBy,weight:graded ? Number(raw) : 0}));
  });
  if (!result.length) throw new Error('Milestones has no definitions.');
  if (result.reduce((sum,item)=>sum+item.weight,0) > 100.000001) throw new Error('Milestones weights must not total more than 100%.');
  return Object.freeze(result.sort((a,b)=>(a.day ?? Infinity)-(b.day ?? Infinity)));
}
function getMilestones_() {
  if (milestonesExecution_) return milestonesExecution_;
  const sheet = getSheet('Milestones');
  if (!sheet) throw new Error('Milestones tab is required.');
  return (milestonesExecution_ = parseMilestoneRows_(sheet.getDataRange().getValues(),getSpreadsheet().getSpreadsheetTimeZone()));
}
function reviewsFromMilestones_(milestones) {
  return Object.freeze(milestones.filter(item=>item.gradedBy==='Review Committee').map(item=>Object.freeze({...item})));
}
function committeeReviewTabName_(committee, review) {
  if (Object.prototype.hasOwnProperty.call(EVALUATION_SHEET_NAMES_, review.key)) {
    return EVALUATION_SHEET_NAMES_[review.key];
  }
  const name = 'Committee ' + committee + ' - ' + review.key;
  if (name.length > 100 || /[\[\]:*?\/\\]/.test(name)) throw new Error('Committee identifier cannot be used in a marking-sheet tab name.');
  return name;
}
