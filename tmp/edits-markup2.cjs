const e=(file,find,replace)=>({file,find,replace});
module.exports=[
 e('coordinator-dashboard.js','<div class="tracker-tabs" data-tracker-filters>','<div class="tracker-tabs segmented" data-tracker-filters>'),
 e('coordinator-dashboard.js','${escapeHtml(pill.label)} (${pill.count})</button>',"${escapeHtml(pill.label)} (${pill.count})${pill.overdue ? ' <span class=\"badge badge--danger\">Overdue</span>' : ''}</button>"),
 e('common-helpers.js','<div class="announcement-audience-filters" role="group"','<div class="announcement-audience-filters segmented" role="group"'),
 e('internal-assessment-publishing-client.js',"'data-publish=\"'+index+'\"','publishing-primary')","'data-publish=\"'+index+'\"')"),
 e('internal-assessment-publishing-client.js',",'publishing-details')",")"),
 e('internal-assessment-publishing-client.js','<button type="button" class="publishing-toggle" data-publishing-toggle','<button type="button" class="publishing-toggle btn btn-sm btn-outline" data-publishing-toggle'),
];
