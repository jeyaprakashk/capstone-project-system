// Review drawer markup: framework classes for pressed-state groups, student tiles and the remarks toggle.
const V = 'review-evaluation-client.js';
const e = (find, replace) => ({ file: V, find, replace });
module.exports = [
  e(`class="review-pi-pills" data-individual-pills=`, `class="review-pi-pills segmented" data-individual-pills=`),
  e(`class="review-pi-pills" data-team-pills role="group"`, `class="review-pi-pills segmented" data-team-pills role="group"`),
  e(`class="review-levels" role="group"`, `class="review-levels segmented" role="group"`),
  e(`class="review-feedback-options" data-feedback-options`, `class="review-feedback-options segmented" data-feedback-options`),
  e(`class="review-other-feedback" data-other-feedback`, `class="review-other-feedback btn btn-sm btn-outline" data-other-feedback`),
  e(`<button type="button" data-select-student="'+index+'" aria-pressed="'+(index===activeStudent)+'"`, `<button type="button" class="tile'+(index===activeStudent?' tile--selected':'')+'" data-select-student="'+index+'" aria-pressed="'+(index===activeStudent)+'"`),
  e(`if(chip){chip.setAttribute('aria-pressed',String(selected));`, `if(chip){chip.setAttribute('aria-pressed',String(selected));chip.classList.toggle('tile--selected',selected);`),
];
