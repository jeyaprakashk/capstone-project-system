/** Spreadsheet-owned rubric definitions. No persistent caching of student marks. */
let rubricExecutionStructure_ = null;

/** Read-only readiness check for every graded assessment, including guide and SEE. */
function getRubricsStatus_() {
  let summaries = [];
  try {
    const sheet = getSheet('Rubrics');
    if (!sheet) return {assessments:summaries,configured:false,detail:'The Rubrics tab is missing.'};
    const assessments = getMilestones_().filter(item=>item.gradedBy!=='Not Applicable');
    if (!assessments.length) return {assessments:summaries,configured:false,detail:'No graded assessments are defined in Milestones.'};
    const rows = sheet.getDataRange().getValues();
    if (!rows.slice(1).some(row=>row.some(value=>String(value??'').trim()))) return {assessments:summaries,configured:false,detail:'The Rubrics tab has no criteria yet.'};
    const column = (rows[0] || []).map(normalizeText_).indexOf('milestone id');
    summaries = assessments.map(item=>{
      const selected = column < 0 ? [] : rows.slice(1).filter(row=>normalizeText_(row[column])===item.key);
      if (column < 0) return {label:item.label,summary:'Check column headers'};
      if (!selected.length) return {label:item.label,summary:'Missing'};
      try {
        const criteria = parseRubricRows_([rows[0],...selected],[item])[item.key];
        if (item.gradedBy==='Project Guide' && criteria.some(c=>c.type!=='Individual' || c.descriptors.some(text=>!text))) return {label:item.label,summary:'Incomplete guide rubric'};
        const maximum = criteria.reduce((sum,c)=>sum+c.maxMarks,0);
        return {label:item.label,summary:criteria.length+' '+(criteria.length===1?'criterion':'criteria')+' · '+Number(maximum.toFixed(2))+' marks'};
      } catch(err) { return {label:item.label,summary:'Needs correction'}; }
    });
    if (column >= 0) {
      const groups = new Set(rows.slice(1).map(row=>normalizeText_(row[column])));
      const missing = assessments.filter(item=>!groups.has(item.key));
      if (missing.length) return {assessments:summaries,configured:false,detail:'Missing rubrics: '+missing.map(item=>item.label+' ('+item.key+')').join(', ')+'.'};
    }
    const structure = parseRubricRows_(rows,assessments);
    assessments.filter(item=>item.gradedBy==='Project Guide').forEach(item=>{
      if (structure[item.key].some(c=>c.type!=='Individual' || c.descriptors.some(text=>!text))) throw new Error(item.label+' requires individual criteria and all Level 0–5 descriptors.');
    });
    return {assessments:summaries,configured:true,detail:'Rubrics are available for all '+assessments.length+' graded assessments.'};
  } catch(err) {
    return {assessments:summaries,configured:false,detail:'Could not verify all rubrics: '+err.message};
  }
}

function parseRubricRows_(rows, reviews) {
  reviews = reviews || getMilestones_().filter(item => item.gradedBy !== 'Not Applicable');
  const required = ['Milestone ID','Order','PI','Criterion','CO','Max Marks','Type'];
  if (!Array.isArray(rows) || !rows.length) throw new Error('Rubrics Sheet is empty. Add the required column headers and review criteria.');
  const headers = rows[0].map(value => String(value).trim().toLowerCase());
  const columns = required.map(name => {
    const key = name.toLowerCase(), index = headers.indexOf(key);
    if (index < 0 || headers.lastIndexOf(key) !== index) throw new Error('Rubrics Sheet requires exactly one column named ' + name);
    return index;
  });
  const grouped = Object.create(null);
  rows.slice(1).forEach((row,index) => {
    const values = columns.map(column => row[column]);
    if (values.every(value => value === '' || value === null || value === undefined)) return;
    const [rawReview,order,rawPi,name,rawCo,maxMarks,rawType] = values.map(value => String(value == null ? '' : value).trim());
    const review = normalizeText_(rawReview);
    const pi = normalizeText_(rawPi).toUpperCase(), co = normalizeText_(rawCo).toUpperCase();
    const type = ({team:'Team',individual:'Individual'})[normalizeText_(rawType)] || rawType;
    const fail = message => { throw new Error('Rubrics Sheet row ' + (index + 2) + ': ' + message); };
    if (!reviews.some(item => item.key === review)) fail('Milestone ID must identify a graded row in Milestones.');
    if (!/^\d+$/.test(order) || !Number.isSafeInteger(Number(order)) || Number(order) < 1) fail('Order must be a positive integer.');
    if (!/^PI[1-9]\d*$/.test(pi) || !/^CO[1-9]\d*$/.test(co)) fail('Use PI1, PI2… and CO1, CO2… identifiers.');
    if (!name) fail('Criterion is required.');
    if (!/^\d+(\.\d+)?$/.test(maxMarks) || !Number.isFinite(Number(maxMarks)) || Number(maxMarks) <= 0) fail('Max Marks must be a positive number.');
    if (!['Team','Individual'].includes(type)) fail('Type must be Team or Individual.');
    if (!grouped[review]) grouped[review] = [];
    if (grouped[review].some(item => item.pi === pi || item.order === Number(order))) fail('Duplicate PI or Order within ' + review);
    const descriptors = Array.from({length:6}, (_,level) => {
      const key = 'level ' + level, column = headers.indexOf(key);
      if (column >= 0 && headers.lastIndexOf(key) !== column) fail('Duplicate ' + key + ' column.');
      return column < 0 ? '' : String(row[column] ?? '').trim();
    });
    grouped[review].push({order:Number(order),pi,name,co,maxMarks:Number(maxMarks),type,descriptors:Object.freeze(descriptors)});
  });
  const result = Object.create(null);
  reviews.forEach(({key:review}) => {
    if (!grouped[review] || !grouped[review].length) throw new Error('Rubrics Sheet has no criteria for ' + review);
    const sorted = grouped[review].sort((a,b) => a.order - b.order);
    if (sorted.some((item,index) => item.order !== index + 1)) throw new Error('Rubrics Sheet: Order in ' + review + ' must be consecutive starting at 1.');
    result[review] = Object.freeze(sorted.map(({order,...criterion}) => Object.freeze(criterion)));
  });
  return Object.freeze(result);
}

function getRubricStructure_() {
  if (rubricExecutionStructure_) return rubricExecutionStructure_;
  const sheet = getSheet('Rubrics');
  if (!sheet) throw new Error('Rubrics Sheet tab not found. Restore the Rubrics Sheet tab in the configured spreadsheet.');
  const rows = sheet.getDataRange().getValues();
  const structure = parseRubricRows_(rows);
  rubricExecutionStructure_ = structure;
  return structure;
}
