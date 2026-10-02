module.exports=[{file:'dashboard-client-scripts.js',
 find:`<button type="button" class="rubric-assessment tile" data-rubric-key="' + escapeClientHtml(item.key) + '"' + (item.available ? ' aria-haspopup="dialog"' : ' disabled') + '>`,
 replace:`<button type="button" class="rubric-assessment tile' + (item.available ? '' : ' tile--locked') + '" data-rubric-key="' + escapeClientHtml(item.key) + '"' + (item.available ? ' aria-haspopup="dialog"' : ' disabled') + '>`}];
