// Remaining dynamic uses of dead legacy classes. Status colours move to framework badges/notices.
const e = (file, find, replace) => ({ file, find, replace });
module.exports = [
  e('dashboard-client-scripts.js', `<span class="' + (review.completed ? 'drawer-status-good' : 'drawer-status-warn') + '">`, `<span class="badge badge--' + (review.completed ? 'success' : 'warning') + '">`),
  e('dashboard-client-scripts.js', `'<section class="weekly-log-history'+(future?' is-future':'')+'">`, `'<section>`),
  e('dashboard-router.js', `<div class="\${view.key === 'student' ? '' : 'dashboard-body-surface'}" id=`, `<div id=`),
  e('guide-dashboard.js', `<strong class="\${evaluationEnabled ? '' : 'disabled-button-label'}">`, `<strong>`),
  e('guide-dashboard.js', `<span class="\${evaluationEnabled ? '' : 'disabled-button-caption'}">`, `<span>`),
  e('guide-weekly-client.js', `<strong class="guide-question'+(key==='blockers'?' guide-question-blockers':key==='nextAction'?' guide-question-next':'')+'">`, `<strong>`),
  e('internal-assessment-publishing-client.js', `node.className=error?'publishing-error':'';`, `node.className=error?'notice notice--danger':'';`),
  e('review-evaluation-client.js', `class="review-criterion '+(c.type==='Team'?'review-team-rubric':'review-individual-rubric')+' card"`, `class="review-criterion card"`),
  e('student-dashboard.js', `<span class="' + (setupComplete ? 'done' : 'active') + '">`, `<span class="badge badge--' + (setupComplete ? 'success' : 'info') + '">`),
  e('student-dashboard.js', `<li class="github-member-status\${missing ? ' is-missing' : joined ? ' is-joined' : ''}">`, `<li>`),
  e('coordinator-dashboard.js', '<div class="stat-card-${color}" data-stat-card', '<div class="card p-4" data-stat-card'),
  e('student-dashboard.js', '<div class="circle step-node-${state}">', '<div class="circle">'),
  e('student-dashboard.js', '<div class="step-card-${state} card" data-step-card>', '<div class="card" data-step-card>'),
];
