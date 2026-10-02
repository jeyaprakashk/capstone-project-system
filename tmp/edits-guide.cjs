const e=(file,find,replace)=>({file,find,replace});
module.exports=[
 e('guide-dashboard.js','<button type="button" class="ring-selected" data-guide-tab="title"','<button type="button" class="tile tile--selected" data-guide-tab="title"'),
 e('guide-dashboard.js','<button type="button" data-guide-tab="weekly"','<button type="button" class="tile" data-guide-tab="weekly"'),
 e('guide-dashboard.js','<button type="button" data-guide-tab="documents"','<button type="button" class="tile" data-guide-tab="documents"'),
 e('guide-dashboard.js','<button type="button" data-guide-tab="evaluation"','<button type="button" class="tile" data-guide-tab="evaluation"'),
 e('guide-weekly-client.js',"button.classList.toggle('ring-selected',active);","button.classList.toggle('tile--selected',active);"),
];
