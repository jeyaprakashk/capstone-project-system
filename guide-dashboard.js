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
  const logsByTeam = groupBy(getSheetRows(SHEET_NAMES.RAW_LOG), row => String(row[2]).trim());

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
  const evaluationOpens = Number.isFinite(schedule.guide_eval) ? schedule.guide_eval - 5 : null;
  const evaluationEnabled = evaluationOpens !== null && clock.today >= evaluationOpens;
  const evaluationNotice = evaluationOpens === null ? 'Guide Eval assessment date is not configured.' : 'Available from ' + formatProjectDay_(evaluationOpens) + ' (5 days before Guide Eval).';
  const TS = getColumnMap(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const teamId = escapeHtml(r[TS.TEAM_ID]);
  const badge = STATUS_LABEL[status];
  const nameCount = [r[TS.S1_NAME], r[TS.S2_NAME], r[TS.S3_NAME], r[TS.S4_NAME]].filter(Boolean).length;
  const names = [
    [r[TS.S1_NAME], r[TS.S1_REGNO]], [r[TS.S2_NAME], r[TS.S2_REGNO]],
    [r[TS.S3_NAME], r[TS.S3_REGNO]], [r[TS.S4_NAME], r[TS.S4_REGNO]]
  ]
    .filter(([name]) => name)
    .map(([name, regno]) => regno ? `${escapeHtml(name)} (${escapeHtml(regno)})` : escapeHtml(name))
    .join(', ');
  const emails = [r[TS.S1_EMAIL], r[TS.S2_EMAIL], r[TS.S3_EMAIL], r[TS.S4_EMAIL]].filter(Boolean).join(',');
  const emailSubject = `Team ${r[TS.TEAM_ID]} — Capstone Project`;
  const title = r[TS.TITLE] ? escapeHtml(r[TS.TITLE]) : '<em>No title submitted yet</em>';
  const emailBtn = `<a class="btn-outline" href="mailto:${escapeHtml(emails)}?subject=${encodeURIComponent(emailSubject)}">${renderLucideIcon_('mail', '', 'icon-leading')}Email Team</a>`;

  const top = `
    <div class="card-accent ${badge.cls}"></div>
    <div class="card-body">
      <button type="button" class="btn-outline" data-team="${teamId}" ${evaluationEnabled ? 'onclick="GuideEvaluation.open(this.dataset.team)"' : 'disabled title="' + escapeHtml(evaluationNotice) + '"'}>Guide Evaluation</button>
      ${evaluationEnabled ? '' : '<p class="card-sub">' + escapeHtml(evaluationNotice) + '</p>'}
      <div class="card-top-row">
        <span class="tag ${badge.cls}">${renderLucideIcon_('tag', '', 'icon-leading')}${badge.text}</span>
        <span class="team-chip">Team ${teamId}</span>
      </div>
      <h3 class="card-title">${title}</h3>
      <p class="card-sub">${renderLucideIcon_('users', '', 'icon-leading')}${names}</p>
      ${logWeeks && clock.active ? `<p class="card-sub">Week ${clock.week}: ${logWeeks.loggedStudents}/${logWeeks.totalStudents} students logged</p>` : ''}
      ${logWeeks && logWeeks.missing ? `<p class="flag">${logWeeks.missing} student weekly log(s) overdue</p>` : ''}
      ${status !== 'APPROVED' ? `<p class="card-sub">Title approval due ${formatProjectDay_(schedule.title)}${clock.today > schedule.title ? ' · Overdue' : ''}</p>` : ''}`;

  const footerCount = `<span class="footer-count">${renderLucideIcon_('users', '', 'icon-leading')}${nameCount} member${nameCount === 1 ? '' : 's'}</span>`;

  if (status === 'NOT_SUBMITTED') {
    return `<div class="event-card">${top}
      ${buildRepoLine(repoUrl)}
      <div class="card-divider"></div>
      <div class="card-footer-row">
        ${footerCount}
        <div class="footer-actions">${emailBtn}</div>
      </div>
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
        ${footerCount}
        <div class="footer-actions">
          <button class="mini revise" onclick="decide('${teamId}', 'Rejected')">Reject</button>
          <button class="mini approve" onclick="decide('${teamId}', 'Approved')">Approve</button>
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
      <div class="card-divider"></div>
      <div class="card-footer-row">
        ${footerCount}
        <div class="footer-actions">${emailBtn}</div>
      </div>
    </div></div>`;
  }

  if (status === 'APPROVED') {
    return `<div class="event-card">${top}
      ${buildProblemBlock(teamId, r[TS.PROBLEM])}
      ${buildDocumentLinks(r)}
      ${buildRepoLine(repoUrl)}
      <p class="status-label">Fully approved.</p>
      <div class="card-divider"></div>
      <div class="card-footer-row">
        ${footerCount}
        <div class="footer-actions">${emailBtn}</div>
      </div>
    </div></div>`;
  }

  if (status === 'REJECTED_BY_GUIDE') {
    return `<div class="event-card">${top}
      ${buildProblemBlock(teamId, r[TS.PROBLEM])}
      ${buildDocumentLinks(r)}
      ${buildRepoLine(repoUrl)}
      <p class="card-sub"><strong>Your note:</strong> ${escapeHtml(r[TS.GUIDE_NOTES]) || '(none)'}</p>
      <p class="status-label">Waiting on the team to resubmit.</p>
      <div class="card-divider"></div>
      <div class="card-footer-row">
        ${footerCount}
        <div class="footer-actions">${emailBtn}</div>
      </div>
    </div></div>`;
  }

  if (status === 'REVISE_AWAITING_STUDENT') {
    return `<div class="event-card">${top}
      ${buildProblemBlock(teamId, r[TS.PROBLEM])}
      ${buildDocumentLinks(r)}
      ${buildRepoLine(repoUrl)}
      <p class="card-sub"><strong>Reviewer's note:</strong> ${escapeHtml(r[TS.REVIEWER_NOTES]) || '(none)'}</p>
      <p class="status-label">Waiting for the team to resubmit — nothing for you to do until they do.</p>
      <div class="card-divider"></div>
      <div class="card-footer-row">
        ${footerCount}
        <div class="footer-actions">${emailBtn}</div>
      </div>
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

function buildDocumentLinks(r) {
  const TS = getColumnMap(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const docs = [
    { label: 'Work Breakdown', url: r[TS.WORK_BREAKDOWN_LINK] },
    { label: 'Need Analysis', url: r[TS.NEED_ANALYSIS_LINK] },
    { label: 'Chapter 1 (LaTeX)', url: r[TS.CHAPTER1_LATEX_LINK] },
  ].filter(d => d.url);
  if (docs.length === 0) return '';
  const links = docs.map(d => `<a href="${escapeHtml(d.url)}" target="_blank" rel="noopener">${d.label}</a>`).join(' &middot; ');
  return `<p class="card-sub">${renderLucideIcon_('file-text', '', 'icon-leading')}${links}</p>`;
}

function buildDashboardContent(email, data) {
  const { teams, counts } = data;
  const stats = [
    [counts.NOT_SUBMITTED, 'gray', 'Not Submitted'],
    [counts.NEEDS_REVIEW, 'orange', 'Needs Review'],
    [counts.REVISE_AWAITING_STUDENT, 'gray', 'Awaiting Student'],
    [counts.AWAITING_REVIEWER, 'blue', 'Awaiting Reviewer'],
    [counts.APPROVED, 'green', 'Approved'],
    [counts.REJECTED_BY_GUIDE, 'red', 'Rejected'],
  ].filter(([value]) => value > 0).map(([value, color, label]) =>
    `<span class="stat ${color}"><span class="stat-num">${value}</span><span class="stat-label">${label}</span></span>`
  ).join('');
  const teamCards = teams.map(t => buildTeamCard(t.row, t.status, t.repoUrl, t.logWeeks, data)).join('')
    || '<p class="empty">You have no teams assigned.</p>';

  return `
  ${buildDashboardContainerHeader_('Guide Dashboard', 'guide')}
  ${stats ? `<div class="stats">${stats}</div>` : ''}
  ${teamCards}
  <section id="guideEvaluationEditor" class="assessment-section" hidden aria-label="Guide evaluation editor"></section>
  `;
}

function getGuideStyles() {
  return `${getBaseStyles()}
${getStatCardStyles()}
${getCardStyles()}
${getButtonStyles()}
${getFormElementStyles()}
${getStatusBadgeStyles()}
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

