const r = String.raw;
const e = (file, find, replace) => ({ file, find, replace });
const V = 'review-evaluation-client.js', RT = 'tests/review-evaluation.test.cjs';
module.exports = [
  e('coordinator-dashboard.js', "<span${value < stats.total ? '' : ''}>${right}", '<span>${right}'),
  e(V, `'<span'+(marks!=='' && Number(marks)===value?'':'')+'>'+value+'</span>`, `'<span'+(marks!=='' && Number(marks)===value?' class="text-strong"':'')+'>'+value+'</span>`),
  e(RT, r`/team-drawer open review-drawer/`, r`/className='open review-drawer'/`),
  e(RT, r`/Team Criteria<\/span><span class="review-tab-caption">60 pts pool<\/span>/`, r`/Team Criteria<\/span><span>60 pts pool<\/span>/`),
  e(RT, r`/Individual<\/span><span class="review-tab-caption">40 pts weight<\/span>/`, r`/Individual<\/span><span>40 pts weight<\/span>/`),
  e(RT, r`assert.match(values.innerHTML,/<span class="is-selected">48<\/span>/);`, r`assert.match(values.innerHTML,/<span class="text-strong">48<\/span>/);`),
  e(RT, r`assert.match(values.innerHTML,/<span class="is-selected">60<\/span>/);`, r`assert.match(values.innerHTML,/<span class="text-strong">60<\/span>/);`),
  e(RT, r`/class="review-student-register">s1<\/small>/`, r`/<small>s1<\/small>/`),
  e(RT, r`/<span class="review-header-review">Configured Review<\/span>/`, r`/<span>Configured Review<\/span>/`),
];
