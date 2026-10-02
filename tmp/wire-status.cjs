const fs = require('fs');
function edit(file, fn) { let s = fs.readFileSync(file, 'utf8'); const crlf = s.includes('\r\n'); s = s.replace(/\r\n/g, '\n'); const o = s; s = fn(s); if (s === o) throw new Error('no change ' + file); if (crlf) s = s.replace(/\n/g, '\r\n'); fs.writeFileSync(file, s); }
const removeTopLevel = (s, name) => {
  const start = s.indexOf('\nfunction ' + name + '(');
  if (start < 0) throw new Error('function ' + name);
  const end = s.indexOf('\n}\n', start);
  let from = start;
  const doc = s.slice(0, start).match(/\n\/\*\*[^\n]*\*\/$/);
  if (doc) from = start - doc[0].length;
  return s.slice(0, from) + s.slice(end + 2);
};

edit('coordinator-api.js', s => s + `
/** System Status frame data; every card's own readiness checks load separately. */
function buildSystemStatusDto_() {
  const TS = getColumnMap(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const rows = getSheetRows(SHEET_NAMES.TEAM_STATUS).filter(row => row[TS.TEAM_ID]);
  const repos = getRepoUrlMap();
  let publishing = {configured:true, items:[]};
  try { publishing.items = publicationDefinitions_().map(d => ({key:String(d.key), title:String(internalPublishingConfig_(d.key).title)})); }
  catch (err) { publishing = {configured:false, items:[]}; }
  return {
    github:{coordUsername:String(getConfig('COLLABORATOR_GITHUB_USERNAME') || '').trim(), reposWithAccess:Number(getConfig('COLLABORATOR_REPOS_ACCESS')) || 0,
      totalRepos:rows.filter(row => repos[normalizeText_(row[TS.TEAM_ID])]).length},
    publishing
  };
}

function API_coordinator_getSystemStatus() {
  return apiHandle_(() => coordinatorRead_('system-status', () => { coordinatorAccessOrThrow_(); return buildSystemStatusDto_(); }));
}
`);

edit('coordinator-dashboard.js', s => {
  for (const name of ['buildGithubAccessSection', 'buildCommitteeDirectory_', 'buildCommitteeReadinessCard_', 'buildReviewConfigurationCard_', 'loadCoordinatorSystemStatus', 'buildRubricsStatusCard_']) s = removeTopLevel(s, name);
  s = s.split(',html:buildCommitteeDirectory_(committees)').join('');
  if (s.includes('buildCommitteeDirectory_')) throw new Error('committee html left');
  return s.replace(/\n{4,}/g, '\n\n\n');
});

edit('guide-evaluation.js', s => removeTopLevel(s, 'buildGuideEvaluationAdmin_'));
edit('internal-assessment-publishing-client.js', s => removeTopLevel(s, 'buildInternalAssessmentPublishing_'));

edit('data-bridge-client.js', s => s.replace("const CoordinatorView = (", "const SystemStatusView = (${systemStatusViewBrowser_.toString()})(DataBridge, () => DashboardUI, () => typeof InternalAssessmentPublishing === 'undefined' ? null : InternalAssessmentPublishing);\nconst CoordinatorView = ("));

edit('dashboard-client-scripts.js', s => {
  const rep = (a, b) => { if (!s.includes(a)) throw new Error('missing ' + a.slice(0, 70)); s = s.replace(a, b); };
  rep("method === 'loadCoordinatorSystemStatus'", "method === 'API_coordinator_getSystemStatus'");
  rep("    dashboardRun().withSuccessHandler(function(html) {\n      finishCards.forEach(function(finish) { finish(); });\n      disconnectConfigurationGrids();\n      checkingReviewConfiguration=false;checkingCommitteeConfiguration=false;\n      target.innerHTML = html;",
    "    SystemStatusView.load().then(function(dto) {\n      finishCards.forEach(function(finish) { finish(); });\n      disconnectConfigurationGrids();\n      checkingReviewConfiguration=false;checkingCommitteeConfiguration=false;\n      SystemStatusView.render(target, dto);");
  rep("      target.querySelectorAll('[data-publishing]').forEach(function(section) { InternalAssessmentPublishing.refresh(section.dataset.publishing); });\n    }).withFailureHandler(function(err) {\n      finishCards.forEach(function(finish) { finish(); });",
    "      target.querySelectorAll('[data-publishing]').forEach(function(section) { InternalAssessmentPublishing.refresh(section.dataset.publishing); });\n    }).catch(function(err) {\n      if (err && err.superseded) return;\n      finishCards.forEach(function(finish) { finish(); });");
  rep("setText('systemStatusMessage', 'Unable to load system status: ' + errorMessage(err) + '. Select Refresh to retry.');\n    }).loadCoordinatorSystemStatus();", "setText('systemStatusMessage', 'Unable to load system status: ' + errorMessage(err) + '. Select Refresh to retry.');\n    });");
  rep("content.innerHTML=report.html;", "content.innerHTML=SystemStatusView.committeeDirectory(report.committees);");
  return s;
});
