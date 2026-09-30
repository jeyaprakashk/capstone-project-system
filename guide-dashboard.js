/**
 * GUIDE DASHBOARD
 *
 * Guide-specific data retrieval, actions,
 * content builders, styles, and page generation.
 */

function getGuideDashboardData(email) {
  const TS = getColumnMap(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const rows = getSheetRows(SHEET_NAMES.TEAM_STATUS);
  const myRows = rows.filter(r => emailsMatch(r[TS.GUIDE_EMAIL], email));
  const repoUrlMap = getRepoUrlMap();
  const schedule = getProjectSchedule_(), clock = getProjectClock_(schedule);
  const logsByTeam = groupBy(readLogEntries_(), row => row.teamId);

  const STATUS_PRIORITY = {
    NEEDS_REVIEW: 0, NOT_SUBMITTED: 1, REJECTED_BY_GUIDE: 2,
    REVISE_AWAITING_STUDENT: 3, AWAITING_REVIEWER: 4, APPROVED: 5
  };

  const teams = myRows.map(r => ({ row: r, status: getTeamStatus(r), repoUrl: repoUrlMap[normalizeText_(r[TS.TEAM_ID])] || '', logWeeks:getTeamLogWeekSummary_(r, TS, logsByTeam[normalizeText_(r[TS.TEAM_ID])] || [], schedule, clock) }))
    .sort((a, b) => STATUS_PRIORITY[a.status] - STATUS_PRIORITY[b.status]);

  const counts = { NOT_SUBMITTED: 0, NEEDS_REVIEW: 0, REVISE_AWAITING_STUDENT: 0, AWAITING_REVIEWER: 0, APPROVED: 0, REJECTED_BY_GUIDE: 0 };
  teams.forEach(t => counts[t.status]++);

  return { teams, counts, schedule, clock };
}

function getTeamStatus(r) {
  const TS = getColumnMap(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  if (!r[TS.TITLE]) return 'NOT_SUBMITTED';
  if (textEquals_(r[TS.REVIEWER_DECISION], 'Approved')) return 'APPROVED';
  if (textEquals_(r[TS.REVIEWER_DECISION], 'Revise')) return 'REVISE_AWAITING_STUDENT';
  if (textEquals_(r[TS.GUIDE_DECISION], 'Rejected')) return 'REJECTED_BY_GUIDE';
  if (textEquals_(r[TS.GUIDE_DECISION], 'Approved')) return 'AWAITING_REVIEWER';
  return 'NEEDS_REVIEW';
}

function refreshDashboardContent() {
  const email = Session.getActiveUser().getEmail();
  const data = getGuideDashboardData(email);
  return buildDashboardContent(email, data);
}

function submitGuideDecision(teamId, decision, notes, editedTitle) {
  const email = Session.getActiveUser().getEmail();
  return applyGuideDecision(teamId, decision, notes, email, editedTitle);
}

// ===================================================================
// DASHBOARD CONTENT BUILDERS
// ===================================================================
function buildTeamCard(r, status, repoUrl, logWeeks, timing) {
  const schedule = timing && timing.schedule ? timing.schedule : getProjectSchedule_();
  const clock = timing && timing.clock ? timing.clock : getProjectClock_(schedule);
  const TS = getColumnMap(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const teamId = escapeHtml(r[TS.TEAM_ID]);
  const badge = STATUS_LABEL[status];
  const names = buildGuideMemberNames_(r, TS);
  const title = r[TS.TITLE] ? escapeHtml(r[TS.TITLE]) : '<em>No title submitted yet</em>';

  const top = `
    <div class="card-accent ${badge.cls}"></div>
    <div class="card-body">
      <div class="card-top-row">
        <span class="tag ${badge.cls}">${renderLucideIcon_('tag', '', 'icon-leading')}${badge.text}</span>
        <span class="team-chip">Team ${teamId}</span>
      </div>
      <h3 class="card-title">${title}</h3>
      <p class="card-sub">${renderLucideIcon_('users', '', 'icon-leading')}${names}</p>
      ${logWeeks && logWeeks.missing ? `<p class="flag">${logWeeks.missing} student weekly log(s) overdue</p>` : ''}
      ${status !== 'APPROVED' ? `<p class="card-sub">Title approval due ${formatProjectDay_(schedule.title)}${clock.today > schedule.title ? ' · Overdue' : ''}</p>` : ''}`;


  if (status === 'NOT_SUBMITTED') {
    return `<div class="event-card">${top}
      ${buildRepoLine(repoUrl)}
    </div></div>`;
  }

  if (status === 'NEEDS_REVIEW') {
    return `<div class="event-card" id="card-${teamId}">${top}
      ${textEquals_(r[TS.REVIEWER_DECISION], 'Revise') ? `<p class="flag">Reviewer requested revision: ${escapeHtml(r[TS.REVIEWER_NOTES])}</p>` : ''}
      <label for="title-${teamId}" class="field-label">Title (editable)</label>
      <input type="text" id="title-${teamId}" value="${escapeHtml(r[TS.TITLE])}" class="title-input">
      ${buildProblemBlock(teamId, r[TS.PROBLEM])}
      ${buildDocumentLinks(r)}
      ${buildRepoLine(repoUrl)}
      ${r[TS.SIMILARITY_FLAG] ? `<p class="flag">${escapeHtml(r[TS.SIMILARITY_FLAG])}</p>` : ''}
      <textarea id="notes-${teamId}" placeholder="Notes (optional, required if rejecting)"></textarea>
      <p class="status" id="status-${teamId}"></p>
      <div class="card-divider"></div>
      <div class="card-footer-row">
        <div class="footer-actions">
          <button class="mini revise app-btn btn-sm btn-danger" onclick="decide('${teamId}', 'Rejected')">Reject</button>
          <button class="mini approve app-btn btn-sm btn-success" onclick="decide('${teamId}', 'Approved')">Approve</button>
        </div>
      </div>
    </div></div>`;
  }

  if (status === 'AWAITING_REVIEWER') {
    return `<div class="event-card">${top}
      ${buildProblemBlock(teamId, r[TS.PROBLEM])}
      ${buildDocumentLinks(r)}
      ${buildRepoLine(repoUrl)}
      <p class="status-label">You approved — awaiting Reviewer.</p>
    </div></div>`;
  }

  if (status === 'APPROVED') {
    return `<div class="event-card">${top}
      ${buildProblemBlock(teamId, r[TS.PROBLEM])}
      ${buildDocumentLinks(r)}
      ${buildRepoLine(repoUrl)}
      <p class="status-label">Fully approved.</p>
    </div></div>`;
  }

  if (status === 'REJECTED_BY_GUIDE') {
    return `<div class="event-card">${top}
      ${buildProblemBlock(teamId, r[TS.PROBLEM])}
      ${buildDocumentLinks(r)}
      ${buildRepoLine(repoUrl)}
      <p class="card-sub"><strong>Your note:</strong> ${escapeHtml(r[TS.GUIDE_NOTES]) || '(none)'}</p>
      <p class="status-label">Waiting on the team to resubmit.</p>
    </div></div>`;
  }

  if (status === 'REVISE_AWAITING_STUDENT') {
    return `<div class="event-card">${top}
      ${buildProblemBlock(teamId, r[TS.PROBLEM])}
      ${buildDocumentLinks(r)}
      ${buildRepoLine(repoUrl)}
      <p class="card-sub"><strong>Reviewer's note:</strong> ${escapeHtml(r[TS.REVIEWER_NOTES]) || '(none)'}</p>
      <p class="status-label">Waiting for the team to resubmit — nothing for you to do until they do.</p>
    </div></div>`;
  }
}

function buildProblemBlock(teamId, problemText, maxLen) {
  const full = String(problemText || '');
  if (!full) return '';
  return `<div class="card-desc">${renderLucideIcon_('file-text', '', 'icon-leading')}${renderExpandableText_(full, maxLen || 130)}</div>`;
}

function buildRepoLine(repoUrl) {
  if (!repoUrl) return '';
  return `<p class="card-sub">${renderLucideIcon_('link', '', 'icon-leading')}<a href="${escapeHtml(repoUrl)}" target="_blank" rel="noopener">${escapeHtml(repoUrl)}</a></p>`;
}

function buildDocumentLinks(r, listView) {
  const TS = getColumnMap(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const docs = [
    { label: 'Work Breakdown', url: r[TS.WORK_BREAKDOWN_LINK] },
    { label: 'Need Analysis', url: r[TS.NEED_ANALYSIS_LINK] },
    { label: 'Chapter 1 (LaTeX)', url: r[TS.CHAPTER1_LATEX_LINK] },
  ].filter(d => d.url);
  if (docs.length === 0) return '';
  if (listView) return '<ul class="guide-document-list">'+docs.map(d=>`<li><strong>${d.label}</strong><a class="app-btn btn-sm btn-secondary" href="${escapeHtml(d.url)}" target="_blank" rel="noopener">Open document</a></li>`).join('')+'</ul>';
  const links = docs.map(d => `<a href="${escapeHtml(d.url)}" target="_blank" rel="noopener">${d.label}</a>`).join(' &middot; ');
  return `<p class="card-sub">${renderLucideIcon_('file-text', '', 'icon-leading')}${links}</p>`;
}

function buildDashboardContent(email, data) {
  const { teams } = data;
  const teamCards = buildGuideWorkspace_(teams, data)
    || '<p class="empty">You have no teams assigned.</p>';

  return `
  ${buildDashboardContainerHeader_('Guide Dashboard', 'guide')}
  ${teamCards}
  `;
}

function buildGuideMemberNames_(r, TS) {
  return [
    [r[TS.S1_NAME], r[TS.S1_REGNO]], [r[TS.S2_NAME], r[TS.S2_REGNO]],
    [r[TS.S3_NAME], r[TS.S3_REGNO]], [r[TS.S4_NAME], r[TS.S4_REGNO]]
  ]
    .filter(([name]) => name)
    .map(([name, regno]) => regno ? `${escapeHtml(name)} (${escapeHtml(regno)})` : escapeHtml(name))
    .join(', ');
}

function buildGuideEvaluationTab_(schedule, clock) {
  const definition=schedule.assessments.find(d=>d.key==='guide_eval'&&d.type==='GUIDE_EVALUATION');
  const evaluationOpens = definition ? definition.opens : null;
  const evaluationEnabled = evaluationOpens !== null && clock.today >= evaluationOpens;
  const evaluationNotice = evaluationOpens === null ? 'Guide Evaluation is not configured in AssessmentDefinitions.' : 'Available from ' + formatProjectDay_(evaluationOpens) + '.';
  return `<button type="button" data-guide-tab="evaluation" aria-pressed="false" ${evaluationEnabled ? 'onclick="GuideWeekly.selectView(\'evaluation\')"' : 'disabled title="'+escapeHtml(evaluationNotice)+'"'}><strong class="${evaluationEnabled ? '' : 'disabled-button-label'}">${evaluationEnabled ? renderLucideIcon_('graduation-cap', '', 'icon-leading') : renderLucideIcon_('lock-keyhole', '', 'icon-leading')}Guide Evaluation</strong><span class="${evaluationEnabled ? '' : 'disabled-button-caption'}">${evaluationEnabled ? 'Individual assessment' : escapeHtml(evaluationNotice)}</span></button>`;
}

function buildGuideWorkspace_(teams, data) {
  if (!teams.length) return '';
  const TS = getColumnMap(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  let githubByTeam = null;
  try {
    const repoUrls = Object.fromEntries(teams.map(t=>[normalizeText_(t.row[TS.TEAM_ID]),t.repoUrl || '']));
    githubByTeam = getTeamsGithubSetup_(teams.map(t=>t.row), TS, repoUrls, getSheetRows(SHEET_NAMES.GITHUB_ACCOUNTS));
  } catch (error) { /* A failed status read must not block title review or imply missing accounts. */ }
  const selectors = teams.map((t, index) => {
    const r = t.row, id = escapeHtml(r[TS.TEAM_ID]);
    const count = [r[TS.S1_NAME],r[TS.S2_NAME],r[TS.S3_NAME],r[TS.S4_NAME]].filter(Boolean).length;
    return `<button type="button" class="guide-team-option" data-guide-select="${id}" data-title-attention="${t.status === 'NEEDS_REVIEW'}" aria-pressed="${index === 0}" onclick="GuideWeekly.selectTeam(this.dataset.guideSelect)">
      <span class="guide-team-option-top"><strong>Team ${id}</strong><span data-team-attention role="status">${t.status === 'NEEDS_REVIEW' ? '<span class="tag orange">Title review</span>' : getSkeletonMarkup_('inline','Checking team actions')}</span></span>
      <span class="guide-team-option-title">${escapeHtml(r[TS.TITLE] || 'No title submitted yet')}</span>
      <span class="guide-team-option-meta">${renderLucideIcon_('users', '', 'icon-leading')}${count} member${count === 1 ? '' : 's'}${t.logWeeks && t.logWeeks.active ? ' · Week '+escapeHtml(t.logWeeks.week) : ''}</span>
    </button>`;
  }).join('');
  const panels = teams.map((t,index) => {
    const r=t.row;
    const students=[r[TS.S1_REGNO],r[TS.S2_REGNO],r[TS.S3_REGNO],r[TS.S4_REGNO]].filter(Boolean).map(String);
    // Reuse every existing form, field ID, decision handler and evaluation gate.
    const card=buildTeamCard(r,t.status,t.repoUrl,t.logWeeks,data)
      .replace(/<div class="card-top-row">[\s\S]*?<h3 class="card-title">[\s\S]*?<\/h3>/, '')
      .replace(`<p class="card-sub">${renderLucideIcon_('users', '', 'icon-leading')}${buildGuideMemberNames_(r, TS)}</p>`, '')
      .replace(buildProblemBlock(escapeHtml(r[TS.TEAM_ID]), r[TS.PROBLEM]), r[TS.PROBLEM] ? `<div class="card-desc guide-problem-statement"><strong>Problem statement:</strong> <span class="guide-problem-desktop">${escapeHtml(String(r[TS.PROBLEM]))}</span><div class="guide-problem-mobile">${renderExpandableText_(String(r[TS.PROBLEM]),130)}</div></div>` : '')
      .replace(buildDocumentLinks(r), '')
      .replace(buildRepoLine(t.repoUrl), '')
      .replace('<div class="card-body">', `<div class="card-body"><div class="card-top-row guide-title-status"><h3 class="guide-title-review-heading">Title approval</h3><span class="tag ${STATUS_LABEL[t.status].cls}">Team ${escapeHtml(r[TS.TEAM_ID])} · ${STATUS_LABEL[t.status].text}</span></div>`);
    const docs=buildDocumentLinks(r,true);
    const roster=[1,2,3,4].map(n=>({email:r[TS['S'+n+'_EMAIL']],regno:r[TS['S'+n+'_REGNO']]}));
    const github=githubByTeam && githubByTeam[normalizeText_(r[TS.TEAM_ID])];
    const githubTone=!github || github.verificationUnavailable || github.accessError || github.members.some(member=>member.access==='unavailable') ? 'gray'
      : github.members.some(member=>!member.githubId) ? 'red'
      : github.members.length && github.members.every(member=>member.status==='valid' && member.access==='active') ? 'green' : 'orange';
    const githubCard=`<aside class="guide-title-github"><div class="card-accent ${githubTone}"></div><div class="guide-title-github-body"><h3>GitHub status</h3>${github ? '<ul class="github-team-status" aria-label="Team GitHub status">'+buildGithubMemberRows_(roster,github.members,'')+'</ul>' : '<p role="status">GitHub status unavailable. Refresh the dashboard to retry.</p>'}${buildGithubRepositoryLine_(t.repoUrl)}</div></aside>`;

    return `<section data-guide-team="${escapeHtml(r[TS.TEAM_ID])}" data-guide-students="${escapeHtml(JSON.stringify(students))}" ${index ? 'hidden' : ''}>
      <div data-guide-view="title" class="guide-title-columns">${githubCard}<div class="guide-title-review">${card}</div></div>
      <div data-guide-view="documents" class="guide-documents" hidden><h3>Team documents</h3>${docs || '<p>No documents submitted yet.</p>'}<p class="card-sub">Open the submitted files to review the team’s work.</p></div>
    </section>`;
  }).join('');
  const headers=teams.map((t,index)=>`<header class="guide-team-heading" data-guide-heading="${escapeHtml(t.row[TS.TEAM_ID])}" ${index ? 'hidden' : ''}>
    <h3>${escapeHtml(t.row[TS.TITLE] || 'No title submitted yet')}</h3>
    <div class="guide-heading-meta"><span>${renderLucideIcon_('users', '', 'icon-leading')}${buildGuideMemberNames_(t.row, TS)}</span>
    <a class="app-btn btn-sm btn-secondary" href="mailto:${escapeHtml([t.row[TS.S1_EMAIL],t.row[TS.S2_EMAIL],t.row[TS.S3_EMAIL],t.row[TS.S4_EMAIL]].filter(Boolean).join(','))}?subject=${encodeURIComponent('Team '+t.row[TS.TEAM_ID]+' — Capstone Project')}">Email Team</a></div>
  </header>`).join('');
  return `<div class="guide-workspace" data-guide-workspace>
    <aside class="guide-team-list" aria-label="My teams"><div class="guide-list-heading"><h3>My teams</h3><span>${teams.length} teams</span></div>${selectors}</aside>
    <div class="guide-team-main">${headers}
      <nav class="guide-view-nav" aria-label="Team workspace">
        <button type="button" data-guide-tab="title" aria-pressed="true" onclick="GuideWeekly.selectView('title')"><strong>${renderLucideIcon_('tag', '', 'icon-leading')}Title review</strong><span>Submission &amp; decision</span></button>
        <button type="button" data-guide-tab="weekly" aria-pressed="false" onclick="GuideWeekly.selectView('weekly')"><strong>${renderLucideIcon_('trending-up', '', 'icon-leading')}Weekly progress</strong><span>Student updates &amp; discussion</span></button>
        <button type="button" data-guide-tab="documents" aria-pressed="false" onclick="GuideWeekly.selectView('documents')"><strong>${renderLucideIcon_('file-text', '', 'icon-leading')}Documents</strong><span>Submitted files</span></button>
        ${buildGuideEvaluationTab_(data.schedule, data.clock)}
      </nav>
      ${panels}
      <section id="guideWeeklyProgress" data-guide-weeks="${escapeHtml(JSON.stringify(getWeeklySubmissionWindows_().map(w=>({weekId:w.weekId,opensAt:w.opens_at}))))}" class="assessment-section" hidden aria-label="Weekly progress confirmation">
        ${buildTabHeader_('Weekly Progress', 'guide-weekly', 'GuideWeekly.load()', '')}
        <p data-guide-weekly-status role="status"></p>
        <div data-guide-weekly-read>${getSkeletonMarkup_('panel','Reading weekly progress')}</div>
      </section>
  <section id="guideEvaluationEditor" class="assessment-section" hidden aria-label="Guide evaluation editor"></section>
    </div>
  </div>`;
}

function getGuideStyles() {
  return `${getBaseStyles()}
${getStatCardStyles()}
${getCardStyles()}
${getButtonStyles()}
${getFormElementStyles()}
${getStatusBadgeStyles()}
body[data-dashboard-theme="editorial"] .guide-workspace { display:grid; grid-template-columns:minmax(210px,270px) minmax(0,1fr); gap:24px; align-items:start; }
body[data-dashboard-theme="editorial"] .guide-workspace [hidden] { display:none !important; }
body[data-dashboard-theme="editorial"] .guide-workspace .guide-title-status { justify-content:space-between; gap:12px; flex-wrap:wrap; }
body[data-dashboard-theme="editorial"] .guide-title-review-heading { margin:0; }
body[data-dashboard-theme="editorial"] .guide-problem-desktop { white-space:pre-wrap; overflow-wrap:anywhere; }
body[data-dashboard-theme="editorial"] .guide-problem-mobile { display:none; }
@media(max-width:760px) {
  body[data-dashboard-theme="editorial"] .guide-problem-desktop { display:none; }
  body[data-dashboard-theme="editorial"] .guide-problem-mobile { display:inline; }
}
body[data-dashboard-theme="editorial"] .guide-title-columns { display:grid; grid-template-columns:minmax(180px,.7fr) minmax(0,1.6fr); gap:16px; align-items:stretch; }
body[data-dashboard-theme="editorial"] .guide-title-columns > * { min-width:0; }
body[data-dashboard-theme="editorial"] .guide-title-github { background:var(--color-paper); border:1px solid var(--color-border); border-radius:8px; overflow:hidden; }
body[data-dashboard-theme="editorial"] .guide-title-github-body { padding:16px; }
body[data-dashboard-theme="editorial"] .guide-title-review { display:flex; }
body[data-dashboard-theme="editorial"] .guide-title-review > .event-card { flex:1; min-width:0; }
body[data-dashboard-theme="editorial"] .guide-title-github h3 { margin:0 0 12px; }
body[data-dashboard-theme="editorial"] .guide-title-github .github-member-status { grid-template-columns:minmax(0,1fr); gap:4px; }
body[data-dashboard-theme="editorial"] .guide-title-github .github-team-repository a { white-space:normal; overflow:visible; overflow-wrap:anywhere; text-overflow:clip; }
@media(max-width:1100px) { body[data-dashboard-theme="editorial"] .guide-title-columns { grid-template-columns:minmax(0,1fr); align-items:start; } body[data-dashboard-theme="editorial"] .guide-title-review { display:block; } }
body[data-dashboard-theme="editorial"] .guide-team-main { min-width:0; overflow-wrap:anywhere; }
body[data-dashboard-theme="editorial"] .guide-list-heading { display:flex; justify-content:space-between; align-items:center; gap:12px; margin-bottom:12px; }
body[data-dashboard-theme="editorial"] .guide-list-heading h3 { margin:0; }
body[data-dashboard-theme="editorial"] .guide-team-option { display:block; width:100%; margin:0 0 10px; padding:14px; text-align:left; font:inherit; color:var(--color-ink); border:1px solid var(--color-border); border-radius:8px; background:var(--color-paper); cursor:pointer; }
body[data-dashboard-theme="editorial"] .guide-team-option[aria-pressed="true"],body[data-dashboard-theme="editorial"] .guide-view-nav button[aria-pressed="true"] { border-color:var(--color-accent-primary); box-shadow:inset 0 0 0 1px var(--color-accent-primary); background:var(--color-accent-tint); }
body[data-dashboard-theme="editorial"] .guide-team-option-top { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:8px; }
body[data-dashboard-theme="editorial"] .guide-team-option .tag { font-size:11px; }
body[data-dashboard-theme="editorial"] .guide-team-option-title { display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; margin:10px 0; line-height:1.5; }
body[data-dashboard-theme="editorial"] .guide-team-option-meta,body[data-dashboard-theme="editorial"] .guide-view-nav span,body[data-dashboard-theme="editorial"] .guide-list-heading > span { font-size:var(--font-size-small); color:var(--color-ink-muted); }
body[data-dashboard-theme="editorial"] .guide-heading-meta { display:grid; grid-template-columns:minmax(0,1fr) auto; align-items:center; gap:12px; }
body[data-dashboard-theme="editorial"] .guide-heading-meta > span { min-width:0; overflow-wrap:anywhere; }
body[data-dashboard-theme="editorial"] .guide-heading-meta > a { justify-self:end; }
body[data-dashboard-theme="editorial"] .guide-team-heading h3 { font-family:var(--editorial-heading); font-size:var(--heading-section,26px); line-height:1.25; margin:12px 0; }
body[data-dashboard-theme="editorial"] .guide-view-nav { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:10px; margin:20px 0; }
body[data-dashboard-theme="editorial"] .guide-view-nav button { display:flex; flex-direction:column; gap:5px; padding:14px; border:1px solid var(--color-border); border-radius:8px; background:var(--color-paper); text-align:left; font:inherit; color:var(--color-ink); cursor:pointer; }
body[data-dashboard-theme="editorial"] .guide-view-nav button > strong { display:flex; align-items:center; gap:6px; }
body[data-dashboard-theme="editorial"] .guide-view-nav button > strong .lucide-icon { width:16px; height:16px; flex:none; margin:0; }
body[data-dashboard-theme="editorial"] .guide-workspace :is(.guide-team-option,.guide-view-nav button):focus-visible { outline:3px solid var(--color-accent-primary); outline-offset:3px; }
body[data-dashboard-theme="editorial"] .guide-document-list { list-style:none; padding:0; margin:0; }
body[data-dashboard-theme="editorial"] .guide-document-list li { display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:12px; padding:16px 0; border-bottom:1px solid var(--color-border); }
body[data-dashboard-theme="editorial"] .guide-documents { padding:20px; border:1px solid var(--color-border); border-radius:8px; background:var(--color-paper); }
body[data-dashboard-theme="editorial"] .guide-workspace .card-footer-row { justify-content:flex-end; }
body[data-dashboard-theme="editorial"] .guide-workspace .event-card { margin:0; }
body[data-dashboard-theme="editorial"] .guide-workspace .assessment-section { margin-top:0; }
body[data-dashboard-theme="editorial"] .guide-week-navigation { display:flex; flex-wrap:wrap; align-items:center; gap:8px; margin:12px 0; }
body[data-dashboard-theme="editorial"] .guide-week-status { margin-left:auto; }
body[data-dashboard-theme="editorial"] .guide-week-label { padding:8px 16px; border:1px solid var(--color-border); border-radius:6px; font-weight:600; font-variant-numeric:tabular-nums; background:var(--color-paper); }
body[data-dashboard-theme="editorial"] .guide-weekly-card { margin:18px 0; border:1px solid var(--color-border); border-top:3px solid var(--color-accent-primary); border-radius:8px; background:var(--color-paper); overflow:hidden; }
body[data-dashboard-theme="editorial"] .guide-weekly-summary { padding:16px; }
body[data-dashboard-theme="editorial"] .guide-weekly-student-header { display:flex; flex-wrap:wrap; align-items:center; justify-content:space-between; gap:12px; margin:-16px -16px 14px; padding:14px 16px; background:var(--color-accent-tint); border-bottom:1px solid var(--color-border); }
body[data-dashboard-theme="editorial"] .guide-weekly-student-header > div { min-width:0; overflow-wrap:anywhere; }
body[data-dashboard-theme="editorial"] .guide-weekly-summary small { display:block; color:var(--color-ink-muted); }
body[data-dashboard-theme="editorial"] .guide-weekly-summary > .weekly-log-answer { margin:0; }
body[data-dashboard-theme="editorial"] .guide-weekly-detail > div { padding:18px; border-top:1px solid var(--color-border); }
body[data-dashboard-theme="editorial"] .guide-weekly-fields { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:16px 24px; }
body[data-dashboard-theme="editorial"] .guide-weekly-fields h4 { margin:0 0 6px; }
body[data-dashboard-theme="editorial"] .guide-weekly-fields p { margin:0; white-space:pre-wrap; overflow-wrap:anywhere; }
body[data-dashboard-theme="editorial"] .guide-weekly-actions { display:flex; flex-wrap:wrap; justify-content:flex-end; align-items:center; gap:10px; padding:14px 16px; border-top:1px solid var(--color-border); background:var(--color-canvas); }
body[data-dashboard-theme="editorial"] .guide-weekly-actions > span { flex:1; }
@media(max-width:900px) {
  body[data-dashboard-theme="editorial"] .guide-workspace { grid-template-columns:minmax(0,1fr); gap:16px; }
  body[data-dashboard-theme="editorial"] .guide-team-list { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:10px; }
  body[data-dashboard-theme="editorial"] .guide-list-heading { grid-column:1/-1; }
  body[data-dashboard-theme="editorial"] .guide-team-option { margin:0; }
}
@media(max-width:540px) {
  body[data-dashboard-theme="editorial"] .guide-team-list,body[data-dashboard-theme="editorial"] .guide-weekly-fields { grid-template-columns:minmax(0,1fr); }
  body[data-dashboard-theme="editorial"] .guide-view-nav { grid-template-columns:repeat(2,minmax(0,1fr)); gap:6px; }
  body[data-dashboard-theme="editorial"] .guide-view-nav button { padding:10px; }
  body[data-dashboard-theme="editorial"] .guide-view-nav span { display:none; }
}
body { max-width: 720px; margin: 28px auto; padding: 0 16px; }`;
}

function buildDashboardPage(email, data) {
  return buildSingleRoleDashboardPage(
    email,
    'guide',
    'My Teams (Guide)',
    'guideContent',
    buildDashboardContent(email, data)
  );
}

