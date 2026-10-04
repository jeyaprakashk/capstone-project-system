/** Spreadsheet-owned rubric definitions. No persistent caching of student marks. */

/** Public dashboard definitions only; never reads assessment journals or student records. */
function loadSharedRubrics_() {
  return withDashboardRead_(() => {
    const email = Session.getActiveUser().getEmail();
    if (!email || !getDashboardRoleViews_(email).length) throw new Error('Dashboard access is required.');
    return getSharedRubricsData_();
  });
}

function getSharedRubricsData_() {
  const assessments = requireAssessmentDefinitions_();
  const sheet = getSheet_('Rubrics');
  const rows = sheet ? sheet.getDataRange().getValues() : [];
  const column = (rows[0] || []).map(normalizeText_).indexOf('assessment id');
  return {assessments: assessments.map(item => {
    const result = {key:item.key, label:item.label, weight:item.weight, available:false,
      evaluator:item.gradedBy, evaluationNotice:item.type==='SEE'?'Evaluated outside this app':'',
      criterionCount:0, totalMarks:0, criteria:[], status:'Rubric unavailable'};
    if (!sheet) return {...result, status:'Rubric not configured'};
    if (column < 0) return {...result, status:'Rubric needs correction'};
    const selected = rows.slice(1).filter(row => normalizeText_(row[column]) === (item.key));
    if (!selected.length) return {...result, status:'Rubric not configured'};
    try {
      const criteria = parseRubricRows_([rows[0], ...selected], [item])[item.key];
      if (item.gradedBy === 'Project Guide' && criteria.some(c => c.type !== 'Individual' || c.descriptors.some(text => !text))) {
        return {...result, status:'Guide rubric incomplete'};
      }
      return {...result, available:true, status:'Available', criteria,
        criterionCount:criteria.length, totalMarks:Number(criteria.reduce((sum,c) => sum + c.maxMarks, 0).toFixed(2))};
    } catch (err) { return {...result, status:'Rubric needs correction'}; }
  })};
}

function rubricColumns_(rows) {
  const required = ['Assessment ID','Order','PI','Criterion','CO','Max Marks','Type'];
  if (!Array.isArray(rows) || !rows.length) throw new Error('Rubrics Sheet is empty. Add the required column headers and review criteria.');
  const headers = rows[0].map(value => String(value).trim().toLowerCase());
  const columns = required.map(name => {
    const key = name.toLowerCase(), index = headers.indexOf(key);
    if (index < 0 || headers.lastIndexOf(key) !== index) throw new Error('Rubrics Sheet requires exactly one column named ' + name);
    return index;
  });
  for (let level=0;level<=5;level++) {
    const key='level '+level,index=headers.indexOf(key);
    if(index>=0 && headers.lastIndexOf(key)!==index)throw new Error('Rubrics Sheet has duplicate '+key+' column.');
  }
  return {headers,columns};
}

function parseRubricRows_(rows, reviews) {
  reviews = reviews || requireAssessmentDefinitions_();
  const {headers,columns}=rubricColumns_(rows);
  const grouped = Object.create(null);
  rows.slice(1).forEach((row,index) => {
    const values = columns.map(column => row[column]);
    if (values.every(value => value === '' || value === null || value === undefined)) return;
    const [rawReview,order,rawPi,name,rawCo,maxMarks,rawType] = values.map(value => String(value == null ? '' : value).trim());
    const review = normalizeText_(rawReview);
    const pi = normalizeText_(rawPi).toUpperCase(), co = normalizeText_(rawCo).toUpperCase();
    const type = ({team:'Team',individual:'Individual'})[normalizeText_(rawType)] || rawType;
    const fail = message => { throw new Error('Rubrics Sheet row ' + (index + 2) + ': ' + message); };
    if (!reviews.some(item => item.key === review)) fail('Assessment ID must identify an assessment in AssessmentDefinitions.');
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

/** Independent rubric reports; blank placeholders preserve original sheet row numbers. */
function getAssessmentRubricReadiness_(rows, definitions) {
  const issues=[],structure=Object.create(null),reports=Object.create(null);
  const report=(state,error)=>({state,criterionCount:0,maximumMarks:0,...(error?{error}:{})});
  if(!rows || !rows.length) {
    const message=rows?'The Rubrics tab has no criteria yet.':'The Rubrics tab is missing.';
    definitions.forEach(d=>reports[d.key]=report('MISSING',message));
    return {reports,structure,issues:[{sheet:'Rubrics',message}]};
  }
  let columns;
  try {columns=rubricColumns_(rows).columns;}
  catch(err){definitions.forEach(d=>reports[d.key]=report('INVALID',err.message));return {reports,structure,issues:[{sheet:'Rubrics',message:err.message}]};}
  const ids=new Set(definitions.map(d=>d.key)),idColumn=columns[0];
  rows.slice(1).forEach((row,index)=>{
    if(columns.every(column=>row[column]==='' || row[column]===null || row[column]===undefined))return;
    if(!ids.has(normalizeText_(row[idColumn])))issues.push({sheet:'Rubrics',message:'Rubrics Sheet row '+(index+2)+': Assessment ID must identify an assessment in AssessmentDefinitions.'});
  });
  definitions.forEach(d=>{
    const selected=[rows[0],...rows.slice(1).map(row=>normalizeText_(row[idColumn])===d.key?row:[])];
    if(!selected.slice(1).some(row=>row.length)) {
      const message='No rubric criteria configured for '+d.label+' ('+d.key+').';
      reports[d.key]=report('MISSING',message);issues.push({sheet:'Rubrics',assessment:d.key,message});return;
    }
    try {
      const criteria=parseRubricRows_(selected,[d])[d.key];
      if(d.type==='GUIDE_EVALUATION' && criteria.some(c=>c.type!=='Individual'||c.descriptors.some(text=>!text)))throw new Error(d.label+' requires individual criteria and all Level 0\u20135 descriptors.');
      structure[d.key]=criteria;
      reports[d.key]={state:'READY',criterionCount:criteria.length,maximumMarks:Number(criteria.reduce((sum,c)=>sum+c.maxMarks,0).toFixed(2))};
    } catch(err){reports[d.key]=report('INVALID',err.message);issues.push({sheet:'Rubrics',assessment:d.key,message:err.message});}
  });
  return {reports,structure:Object.freeze(structure),issues};
}

function API_shared_getRubrics() { return apiHandle_(() => loadSharedRubrics_()); }
