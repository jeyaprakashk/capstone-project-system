/**
 * REVIEWER DASHBOARD
 * Reviewer title decisions and sequential rubric-based marking.
 * Shared deployment with Student, Guide, and Coordinator views via doGet() in guide-dashboard.gs
 */

function isReviewerForAnyTeam(email) {
  return getReviewerDashboardData(email).total > 0;
}

function getReviewerDashboardData(email) {
  const TS = getColumnMap(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const rows = getSheetRows(SHEET_NAMES.TEAM_STATUS).filter(r => r[TS.TEAM_ID]);

  const myCommitteeNumbers = new Set(getCommitteeNumbersForReviewer(email).map(normalizeText_));
  const myRows = rows.filter(r => myCommitteeNumbers.has(normalizeText_(r[TS.COMMITTEE_NUMBER])));

  const pending = myRows.filter(r => textEquals_(r[TS.GUIDE_DECISION], 'Approved') && !textEquals_(r[TS.REVIEWER_DECISION], 'Approved'));
  const approved = myRows.filter(r => textEquals_(r[TS.REVIEWER_DECISION], 'Approved'));
  const notYetGuideApproved = myRows.filter(r => !textEquals_(r[TS.GUIDE_DECISION], 'Approved'));

  return { pending, approved, notYetGuideApproved, assigned: myRows, total: myRows.length };
}

function refreshReviewerContent(email) {
  return buildReviewerContent(email, getReviewerDashboardData(email));
}

function submitReviewerDecision(teamId, decision, notes) {
  const lock=LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw new Error('Another decision is being saved. Try again.');
  try {
    const context=reviewerTeamContext_(teamId);
    if (!['Approved','Revise'].includes(decision)) throw new Error('Invalid reviewer decision.');
    if (decision==='Revise' && !String(notes || '').trim()) throw new Error('Notes are required when requesting revision.');
    if (textEquals_(context.row[context.TS.REVIEWER_DECISION],'Approved')) return {ok:true,message:'Title already approved.'};
    if (!context.title.trim() || !textEquals_(context.row[context.TS.GUIDE_DECISION],'Approved')) throw new Error('The title must be submitted and approved by the guide first.');
    return applyReviewerDecision(teamId,decision,notes,Session.getActiveUser().getEmail());
  } finally { lock.releaseLock(); }
}

// ===================================================================
// CONTENT BUILDERS
// ===================================================================
function buildDocumentLinksCompact(r) {
  const TS = getColumnMap(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const docs = [
    { label: 'WBS', url: r[TS.WORK_BREAKDOWN_LINK] },
    { label: 'Need Analysis', url: r[TS.NEED_ANALYSIS_LINK] },
    { label: 'Ch.1 LaTeX', url: r[TS.CHAPTER1_LATEX_LINK] },
  ].filter(d => d.url);
  if (docs.length === 0) return '';
  const links = docs.map(d => `<a href="${escapeHtml(d.url)}" target="_blank" rel="noopener">${d.label}</a>`).join(' &middot; ');
  return `<div>${links}</div>`;
}

function buildReviewerTitleApproval_(r, TS, status) {
  const teamId=escapeHtml(r[TS.TEAM_ID]);
  const editable=String(r[TS.TITLE] || '').trim() && textEquals_(r[TS.GUIDE_DECISION],'Approved') && !textEquals_(r[TS.REVIEWER_DECISION],'Approved');
  const badgeClass=status[0] === 'green' ? 'badge badge--success' : status[0] === 'orange' ? 'badge badge--warning' : 'chip';
  return `<details><summary><span class="${badgeClass}">${status[1]}</span> ${editable ? 'Review title' : 'Details'}</summary>
    <div id="reviewer-decision-${teamId}"><strong>${escapeHtml(r[TS.TITLE] || 'Not submitted')}</strong>
    ${r[TS.SIMILARITY_FLAG] ? `<p>${renderLucideIcon_('triangle-alert','Similarity warning')} ${escapeHtml(r[TS.SIMILARITY_FLAG])}</p>` : ''}
    ${buildDocumentLinksCompact(r)}
    ${r[TS.REVIEWER_NOTES] ? `<p>${escapeHtml(r[TS.REVIEWER_NOTES])}</p>` : ''}
    ${editable ? `<label for="reviewer-notes-${teamId}">Reviewer notes</label><textarea id="reviewer-notes-${teamId}" rows="3" placeholder="Notes (required for Revise)"></textarea><div><button type="button" class="approve btn btn-sm btn-primary" data-team="${teamId}" onclick="reviewerDecide(this.dataset.team, 'Approved')">Approve</button><button type="button" class="revise btn btn-sm btn-outline" data-team="${teamId}" onclick="reviewerDecide(this.dataset.team, 'Revise')">Revise</button></div>` : ''}
    <p id="reviewer-status-${teamId}" role="status"></p></div></details>`;
}

function buildReviewerReviewCells_(r, TS, progress) {
  const approved=String(r[TS.TITLE] || '').trim() && textEquals_(r[TS.REVIEWER_DECISION],'Approved');
  return progress.reviews.map(review => {
    const state=(progress.teams[normalizeReviewKey_(r[TS.TEAM_ID])] || {})[review.key];
    const available=state && state.available;
    const ready=approved && !state?.prerequisiteReason;
    const enabled=available && state.readable && ready;
    const hint=!available ? (state && state.error || 'Marks unavailable.') : state.reason || state.status;
    const label=state && ['Submitted','Published'].includes(state.status) ? 'View marks' : state && state.completed ? 'Edit marks' : 'Enter marks';
    const cell=`<td><button type="button" class="btn-outline btn" ${enabled ? '' : 'disabled'} data-team="${escapeHtml(r[TS.TEAM_ID])}" data-review="${escapeHtml(review.key)}" onclick="DashboardUI.openReviewerMarks(this.dataset.team, this.dataset.review, this)">${renderLucideIcon_(enabled ? 'clipboard-check' : 'lock-keyhole')} ${label}</button><small>${hint ? escapeHtml(hint) : state.completed ? 'Completed' : state.markedStudents + '/' + state.totalStudents + ' students marked'}</small></td>`;
    return cell;
  }).join('');
}

function buildReviewerAssignedTeams_(data) {
  const TS = getColumnMap(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const assigned = data.assigned || [...new Map([...data.pending, ...data.approved, ...data.notYetGuideApproved].map(r => [normalizeText_(r[TS.TEAM_ID]), r])).values()];
  const progress = data.reviewProgress || {reviews:[],teams:{}};
  const rows = assigned.map(r => {
    const registers = [1,2,3,4].map(n => String(r[TS['S' + n + '_REGNO']] || '').trim()).filter(Boolean);
    const decision = r[TS.REVIEWER_DECISION];
    const title = String(r[TS.TITLE] || '').trim();
    const status = !title ? ['gray', 'Not submitted']
      : textEquals_(decision, 'Approved') ? ['green', 'Approved']
      : textEquals_(decision, 'Revise') ? ['orange', 'Revision requested']
      : textEquals_(r[TS.GUIDE_DECISION], 'Approved') ? ['orange', 'Pending review'] : ['gray', 'Awaiting guide'];
    const search = [r[TS.TEAM_ID], r[TS.GUIDE_NAME], ...registers, r[TS.TITLE], r[TS.COMMITTEE_NUMBER], status[1]].join(' ').toLowerCase();
    return `<tr data-assigned-search="${escapeHtml(search)}"><td><strong>${escapeHtml(r[TS.TEAM_ID])}</strong></td><td>${escapeHtml(r[TS.GUIDE_NAME] || '—')}</td><td><div>${registers.length ? registers.map(reg => `<span>${escapeHtml(reg)}</span>`).join('') : '—'}</div></td><td>${escapeHtml(title || 'Not submitted')}</td><td>${escapeHtml(r[TS.COMMITTEE_NUMBER] || '—')}</td><td>${buildReviewerTitleApproval_(r,TS,status)}</td>${buildReviewerReviewCells_(r,TS,progress)}</tr>`;
  }).join('');
  return `<section class="card" aria-labelledby="reviewerAssignedHeading">
    <div class="tracker-header"><h3 id="reviewerAssignedHeading">Assigned Teams (${assigned.length} teams)</h3></div>
    <div><input type="search" id="reviewerAssignedSearch" aria-label="Search assigned teams" placeholder="Search team, guide, register number, or title…" oninput="DashboardUI.filterReviewerAssignedTeams()"></div>
    <p id="reviewerAssignedScrollHint">Scroll horizontally if more review columns are off-screen.</p>
    <div class="tracker-table-scroll table-wrap" data-tooltip-boundary role="region" aria-label="Assigned teams table, scroll horizontally for more columns" aria-describedby="reviewerAssignedScrollHint" tabindex="0"><table class="table table--compact"><thead><tr><th scope="col">Team</th><th scope="col">Guide</th><th scope="col">Register Numbers</th><th scope="col">Project Title</th><th scope="col">Committee</th><th scope="col">Title Approval</th>${progress.reviews.map(review=>`<th scope="col">${escapeHtml(review.label)}</th>`).join('')}</tr></thead><tbody id="reviewerAssignedBody">${rows}<tr id="reviewerAssignedEmpty" ${assigned.length ? 'hidden' : ''}><td colspan="${6 + progress.reviews.length}">${assigned.length ? 'No teams match your search.' : 'No teams are assigned to you.'}</td></tr></tbody></table></div>
    ${buildTeamPagination_('reviewerAssigned', 'reviewer', assigned.length)}
  </section>`;
}

function buildReviewerContent(email, data) {
  const { pending, approved, notYetGuideApproved, total } = data;
  const stats = [
    [pending.length, 'orange', 'Pending Your Decision'],
    [approved.length, 'green', 'Approved'],
    [notYetGuideApproved.length, 'gray', 'Not Yet Guide-Approved'],
    [total, 'blue', 'Total Assigned to You'],
  ].filter(([value]) => value > 0).map(([value, color, label]) =>
    `<span class=" ${color}"><span>${value}</span><span>${label}</span></span>`
  ).join('');
  data.reviewProgress = getReviewerReviewProgress_(data.assigned);
  return `
  ${buildDashboardContainerHeader_('Reviewer Dashboard', 'reviewer')}
  ${stats ? `<div>${stats}</div>` : ''}
  ${data.reviewProgress.error ? `<p role="status">Review marks are unavailable: ${escapeHtml(data.reviewProgress.error)}</p>` : ''}
  ${buildReviewerAssignedTeams_(data)}`;
}

function buildReviewerPage(email, data) {
  return buildSingleRoleDashboardPage(
    email,
    'reviewer',
    'Reviewer',
    'reviewerContent',
    buildReviewerContent(email, data)
  );
}

function refreshReviewerContentForCurrentUser() {
  const email = Session.getActiveUser().getEmail();
  return refreshReviewerContent(email);
}
