/** Semester definitions, read once per execution; never cached across requests. */
let milestonesExecution_ = null;
const MILESTONE_HEADERS_ = ['Milestone ID','Milestone Name','Due Date','Graded By','Weight (%)'];
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
    if (['end','week1','timezone','reviews','reviewcount','milestones','assessments'].includes(key)) fail('Reserved Milestone ID ' + key + '.');
    if (!label) fail('Milestone Name is required.');
    const gradedBy = roles.find(role => normalizeText_(role) === normalizeText_(grader));
    if (!gradedBy) fail('Graded By must be ' + roles.join(', ') + '.');
    const raw = String(weight ?? '').trim();
    if (gradedBy !== 'Not Applicable') fail('Graded assessments belong in AssessmentDefinitions, not Milestones. Milestones is only for non-assessment events.');
    if (raw !== '' && Number(raw) !== 0) fail('Non-graded milestones must have blank or zero Weight (%).');
    let dateColumn = columns[2] + 1, letters = '';
    while (dateColumn > 0) { dateColumn--; letters = String.fromCharCode(65 + dateColumn % 26) + letters; dateColumn = Math.floor(dateColumn / 26); }
    const location = key + ' Due Date at ' + letters + (index + 2);
    const blankDate = date === null || date === undefined || String(date).trim() === '';
    if (blankDate) {
      fail(location + ' is blank. Enter the scheduled date as a date cell, DD/MM/YYYY or YYYY-MM-DD.');
    }
    let day = null;
    try { if (!blankDate) day = projectDay_(date,timezone,location); }
    catch(err) { fail(err.message + ' Received: ' + JSON.stringify(String(date).slice(0,100)) + '.'); }
    ids.add(key);
    result.push(Object.freeze({key,label,day,gradedBy,weight:0}));
  });
  if (!result.length) throw new Error('Milestones has no definitions.');
  return Object.freeze(result.sort((a,b)=>(a.day ?? Infinity)-(b.day ?? Infinity)));
}
function getMilestones_() {
  if (milestonesExecution_) return milestonesExecution_;
  const sheet = getSheet('Milestones');
  if (!sheet) throw new Error('Milestones tab is required.');
  return (milestonesExecution_=parseMilestoneRows_(sheet.getDataRange().getValues(),getSpreadsheet().getSpreadsheetTimeZone()));
}
/** Presentation composition only. Neither configuration source overrides the other. */
function composeProjectTimeline_(milestones, assessments) {
  const ids=new Set(milestones.map(item=>item.key));
  if(assessments.some(item=>ids.has(item.key)||['end','week1','timezone','reviews','reviewcount','milestones','assessments','assessments'].includes(item.key)))throw new Error('Assessment IDs must be distinct from lifecycle milestones and reserved schedule fields.');
  return Object.freeze([...milestones,...assessments].sort((a,b)=>a.day-b.day||(a.sequence||0)-(b.sequence||0)||a.key.localeCompare(b.key)));
}
