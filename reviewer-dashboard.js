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
  return `<div class="doc-links">${links}</div>`;
}

function buildReviewerTitleApproval_(r, TS, status) {
  const teamId=escapeHtml(r[TS.TEAM_ID]);
  const editable=String(r[TS.TITLE] || '').trim() && textEquals_(r[TS.GUIDE_DECISION],'Approved') && !textEquals_(r[TS.REVIEWER_DECISION],'Approved');
  return `<details class="reviewer-title-approval"><summary><span class="status-badge ${status[0]}">${status[1]}</span> ${editable ? 'Review title' : 'Details'}</summary>
    <div class="reviewer-title-content" id="reviewer-decision-${teamId}"><strong>${escapeHtml(r[TS.TITLE] || 'Not submitted')}</strong>
    ${r[TS.SIMILARITY_FLAG] ? `<p class="flag-text">${renderLucideIcon_('triangle-alert','Similarity warning')} ${escapeHtml(r[TS.SIMILARITY_FLAG])}</p>` : ''}
    ${buildDocumentLinksCompact(r)}
    ${r[TS.REVIEWER_NOTES] ? `<p class="reviewer-previous-notes">${escapeHtml(r[TS.REVIEWER_NOTES])}</p>` : ''}
    ${editable ? `<label for="reviewer-notes-${teamId}">Reviewer notes</label><textarea id="reviewer-notes-${teamId}" rows="3" placeholder="Notes (required for Revise)"></textarea><div class="reviewer-title-actions"><button type="button" class="mini approve" data-team="${teamId}" onclick="reviewerDecide(this.dataset.team, 'Approved')">Approve</button><button type="button" class="mini revise" data-team="${teamId}" onclick="reviewerDecide(this.dataset.team, 'Revise')">Revise</button></div>` : ''}
    <p id="reviewer-status-${teamId}" role="status"></p></div></details>`;
}

function buildReviewerReviewCells_(r, TS, progress) {
  const approved=String(r[TS.TITLE] || '').trim() && textEquals_(r[TS.REVIEWER_DECISION],'Approved');
  let unlocked=!!approved;
  return progress.reviews.map(review => {
    const state=(progress.teams[normalizeReviewKey_(r[TS.TEAM_ID])] || {})[review.key];
    const available=state && state.available;
    const enabled=unlocked && available;
    const hint=!unlocked ? (approved ? 'Complete the previous review first.' : 'Approve the title first.') : !available ? (state && state.error || 'Marks unavailable.') : '';
    const label=state && state.completed ? 'Edit marks' : 'Enter marks';
    const cell=`<td class="reviewer-review-cell"><button type="button" class="btn-outline" ${enabled ? '' : 'disabled'} data-team="${escapeHtml(r[TS.TEAM_ID])}" data-review="${escapeHtml(review.key)}" onclick="DashboardUI.openReviewerMarks(this.dataset.team, this.dataset.review, this)">${renderLucideIcon_(enabled ? 'clipboard-check' : 'lock-keyhole')} ${label}</button><small>${hint ? escapeHtml(hint) : state.completed ? 'Completed' : state.markedStudents + '/' + state.totalStudents + ' students marked'}</small></td>`;
    unlocked=unlocked && available && state.completed;
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
    return `<tr data-assigned-search="${escapeHtml(search)}"><td class="col-team"><strong>${escapeHtml(r[TS.TEAM_ID])}</strong></td><td class="col-guide">${escapeHtml(r[TS.GUIDE_NAME] || '—')}</td><td class="col-registers"><div class="tracker-registers">${registers.length ? registers.map(reg => `<span>${escapeHtml(reg)}</span>`).join('') : '—'}</div></td><td class="reviewer-assigned-title">${escapeHtml(title || 'Not submitted')}</td><td>${escapeHtml(r[TS.COMMITTEE_NUMBER] || '—')}</td><td class="reviewer-title-cell">${buildReviewerTitleApproval_(r,TS,status)}</td>${buildReviewerReviewCells_(r,TS,progress)}</tr>`;
  }).join('');
  return `<section class="team-tracker-section reviewer-assigned-teams" aria-labelledby="reviewerAssignedHeading">
    <div class="tracker-header"><h3 class="assessment-title tracker-title" id="reviewerAssignedHeading">Assigned Teams (${assigned.length} teams)</h3></div>
    <div class="tracker-search"><input type="search" id="reviewerAssignedSearch" aria-label="Search assigned teams" placeholder="Search team, guide, register number, or title…" oninput="DashboardUI.filterReviewerAssignedTeams()"></div>
    <div class="tracker-table-scroll" role="region" aria-label="Assigned teams table, scroll horizontally for more columns" tabindex="0"><table class="team-tracker-table"><thead><tr><th scope="col">Team</th><th scope="col">Guide</th><th scope="col">Register Numbers</th><th scope="col">Project Title</th><th scope="col">Committee</th><th scope="col">Title Approval</th>${progress.reviews.map(review=>`<th scope="col">${escapeHtml(review.label)}</th>`).join('')}</tr></thead><tbody id="reviewerAssignedBody">${rows}<tr id="reviewerAssignedEmpty" ${assigned.length ? 'hidden' : ''}><td colspan="${6 + progress.reviews.length}">${assigned.length ? 'No teams match your search.' : 'No teams are assigned to you.'}</td></tr></tbody></table></div>
    ${buildTeamPagination_('reviewerAssigned', 'reviewer', assigned.length)}
  </section>`;
}

function buildReviewerContent(email, data) {
  const { pending, approved, notYetGuideApproved, total } = data;
  data.reviewProgress = getReviewerReviewProgress_(data.assigned);
  return `
  ${buildDashboardContainerHeader_('Reviewer Dashboard', 'reviewer')}
  <div class="coord-stats">
    <span class="coord-stat orange"><span class="coord-stat-num">${pending.length}</span><span class="coord-stat-label">Pending Your Decision</span></span>
    <span class="coord-stat green"><span class="coord-stat-num">${approved.length}</span><span class="coord-stat-label">Approved</span></span>
    <span class="coord-stat gray"><span class="coord-stat-num">${notYetGuideApproved.length}</span><span class="coord-stat-label">Not Yet Guide-Approved</span></span>
    <span class="coord-stat blue"><span class="coord-stat-num">${total}</span><span class="coord-stat-label">Total Assigned to You</span></span>
  </div>
  ${data.reviewProgress.error ? `<p role="status">Review marks are unavailable: ${escapeHtml(data.reviewProgress.error)}</p>` : ''}
  ${buildReviewerAssignedTeams_(data)}`;
}

function getReviewerStyles() {
  return `${getBaseStyles()}
${getStatCardStyles()}
${getTableStyles()}
${getButtonStyles()}
${getFormElementStyles()}
${getStatusBadgeStyles()}
${getFilterTabStyles()}
${getCollapsibleStyles()}
body { max-width: 980px; margin: 24px auto; padding: 0 16px; }
.coord-stats { display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 18px; }
.coord-stat { flex: 1; min-width: 100px; text-align: center; padding: 12px 6px; border-radius: 12px; background: #fff; box-shadow: 0 1px 3px rgba(0,0,0,0.05); }
.coord-stat-num { display: block; font-size: 20px; font-weight: 700; }
.coord-stat-label { display: block; font-size: 10px; margin-top: 3px; text-transform: uppercase; letter-spacing: 0.4px; color: #8b8f99; }
.coord-stat.orange .coord-stat-num { color: #f97316; }
.coord-stat.green .coord-stat-num { color: #16a34a; }
.coord-stat.red .coord-stat-num { color: #dc2626; }
.coord-stat.gray .coord-stat-num { color: #6b7280; }
.coord-stat.blue .coord-stat-num { color: #6366f1; }
.guide-cell { font-size: 13px; color: #6b7280; }
.reviewer-assigned-teams { margin-bottom:24px; }
.reviewer-assigned-teams [hidden] { display:none !important; }
.reviewer-assigned-teams .reviewer-assigned-title { min-width:200px; max-width:320px; white-space:normal; overflow-wrap:anywhere; }
.reviewer-title-cell { min-width:230px; }
.reviewer-title-approval summary { cursor:pointer; font-size:12px; }
.reviewer-title-content { padding:12px 0; min-width:230px; }
.reviewer-title-content label { display:block; margin-top:12px; }
.reviewer-title-content textarea { width:100%; }
.reviewer-title-actions { display:flex; gap:8px; margin-top:8px; }
.reviewer-previous-notes { white-space:pre-wrap; }
.reviewer-review-cell { min-width:150px; }
.reviewer-review-cell small { display:block; margin-top:6px; color:#667085; }
.reviewer-review-cell button:disabled { opacity:.5; cursor:not-allowed; }
.reviewer-marks-dialog { position:fixed; inset:0 0 0 auto; margin:0; width:min(780px,100vw); height:100dvh; max-width:100vw; max-height:100dvh; border:0; border-left:1px solid #e4e7ec; padding:24px; box-sizing:border-box; background:#f8fafc; color:#182230; overflow:auto; }
.reviewer-marks-dialog::backdrop { background:rgba(15,23,42,.45); }
.reviewer-marks-header { display:flex; align-items:center; justify-content:space-between; gap:16px; }
.reviewer-marks-dialog button,.reviewer-marks-dialog select,.reviewer-marks-dialog textarea { font:inherit; }
.reviewer-marks-dialog button { padding:10px 14px; border:1px solid #d0d5dd; border-radius:8px; background:#fff; cursor:pointer; }
.reviewer-marks-dialog button:disabled { opacity:.5; cursor:wait; }
.reviewer-marks-dialog :is(button,select,textarea):focus-visible { outline:3px solid #9e77ed; outline-offset:3px; }
.reviewer-marks-dialog fieldset { margin:18px 0; padding:16px; border:1px solid #e4e7ec; border-radius:12px; background:#fff; min-width:0; }
.reviewer-marks-dialog label { display:block; font-size:13px; margin:14px 0; }
.reviewer-marks-dialog select,.reviewer-marks-dialog textarea { display:block; width:100%; padding:10px; margin-top:6px; border:1px solid #d0d5dd; border-radius:8px; background:#fff; }
.reviewer-marks-dialog small { color:#667085; }
.reviewer-marks-footer { display:flex; gap:12px; position:sticky; bottom:-24px; padding:16px 0; background:#f8fafc; }
.reviewer-marks-dialog .marks-save { color:white; background:#6941c6; border-color:#6941c6; }
@media(max-width:640px) { .reviewer-marks-dialog { padding:16px; } }`;
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
