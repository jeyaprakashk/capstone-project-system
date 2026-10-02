const r = String.raw;
const e = (file, find, replace) => ({ file, find, replace });
const P = 'internal-assessment-publishing-client.js', PB = 'tests/internal-publishing-browser.test.cjs', PT = 'tests/internal-assessment-publishing.test.cjs';
module.exports = [
  e(P, `return '<ul>'+team.students.map(student=>{`, `return '<ul data-student-results>'+team.students.map(student=>{`),
  e(P, `'<span aria-label="'+escape(identity+': '+result)+'">'`, `'<span data-student-score aria-label="'+escape(identity+': '+result)+'">'`),
  e(P, `'<span>'+escape(identity)+'</span>'`, `'<span data-student-identity>'+escape(identity)+'</span>'`),
  e(P, `<td>'+studentResults(team)+'`, `<td data-registers>'+studentResults(team)+'`),
  e(P, `<td>'+studentResults(team,true)+'`, `<td data-results>'+studentResults(team,true)+'`),
  e(PB, r`f.host().querySelector('.publishing-badge')`, r`f.host().querySelector('[data-state]')`),
  e(PB, r`querySelectorAll('.publishing-registers .publishing-student-results li')`, r`querySelectorAll('[data-registers] [data-student-results] li')`),
  e(PB, r`lines[0].querySelector('.publishing-student-identity')`, r`lines[0].querySelector('[data-student-identity]')`),
  e(PB, r`f.host().querySelector('.publishing-results .publishing-score')`, r`f.host().querySelector('[data-results] [data-student-score]')`),
  e(PB, r`f.host().querySelectorAll('.publishing-score')`, r`f.host().querySelectorAll('[data-student-score]')`),
  e(PT, `'<details class="review-history"><summary>Assessment history <span>1</span></summary><ol><li><div class="review-history-heading"><strong>Assessment completed</strong></div><div class="review-history-status">Incomplete`, `'<details><summary>Assessment history <span>1</span></summary><ol><li><div><strong>Assessment completed</strong></div><div>Incomplete`),
];
