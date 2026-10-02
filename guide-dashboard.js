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

  return { teams, counts, schedule, clock, ...readGuideRecordContext_(myRows, TS) };
}

function guideRecordDate_(value) {
  const date=value ? new Date(value) : null;
  return date && Number.isFinite(date.getTime()) ? date.toLocaleString('en-GB',{timeZone:getSpreadsheet().getSpreadsheetTimeZone(),day:'numeric',month:'short',year:'numeric',hour:'2-digit',minute:'2-digit'}) : '';
}

function readGuideRecordContext_(rows, TS) {
  const approvals={},approvalTimes={},documentSubmissions={};
  const owned=new Map(rows.map(row=>[normalizeText_(row[TS.TEAM_ID]),row]));
  // The registry writer appends year, semester, team, guide, title, repo,
  // members, approval date and approving reviewer, in that order.
  try {
    readSheetRows_(getHubRegistrySheet(),2).forEach(record=>{
      const key=normalizeText_(record[2]),row=owned.get(key);
      if(!row || !textEquals_(record[0],getAcademicYear()) || !textEquals_(record[1],row[TS.SEMESTER]) ||
        !emailsMatch(record[3],row[TS.GUIDE_EMAIL]) || String(record[4])!==String(row[TS.TITLE]) ||
        !emailsMatch(record[8],row[TS.TITLE_APPROVED_BY]))return;
      const date=guideRecordDate_(record[7]);if(date){approvals[key]=date;approvalTimes[key]=new Date(record[7]).getTime();}
    });
  } catch(error) { /* Approval stays authoritative even when its date cannot be read. */ }
  try {
    const sheet=getSheet(SHEET_NAMES.TEAM_INTAKE_RAW);
    if(!sheet)throw new Error('Intake history unavailable');
    const headers=(readSheetRows_(sheet,1,1)[0] || []).map(normalizeText_);
    const column=name=>headers.indexOf(normalizeText_(name));
    const team=column('Team ID'),stamp=column('Timestamp'),work=column('Work Breakdown Document'),need=column('Need Analysis Report');
    if(team<0 || stamp<0 || (work<0 && need<0))throw new Error('Intake history columns unavailable');
    const latest={};
    readSheetRows_(sheet,2).forEach(record=>{
      const key=normalizeText_(record[team]),at=new Date(record[stamp]).getTime();
      if(!owned.has(key) || (!record[work] && !record[need]) || !Number.isFinite(at))return;
      if(!latest[key] || at>latest[key])latest[key]=at;
    });
    Object.keys(latest).forEach(key=>{documentSubmissions[key]=guideRecordDate_(latest[key]);});
  } catch(error) { owned.forEach((row,key)=>{documentSubmissions[key]='Date unavailable';}); }
  return {approvals,approvalTimes,documentSubmissions};
}

function guideBadgeClass_(tone) {
  return {green:'badge badge--success',orange:'badge badge--warning',blue:'badge badge--info',red:'badge badge--danger',gray:'chip'}[tone] || 'chip';
}

let guideTimingTooltipSequence_ = 0;
function buildGuideTimingBadge_(state, explanation, tooltip = true, label) {
  const badge={'on-time':['green','On time'],late:['red','Late'],overdue:['red','Overdue'],pending:['gray','Pending'],unknown:['gray','Timing unavailable']}[state] || ['gray','Timing unavailable'];
  return '<span class="'+guideBadgeClass_(badge[0])+'"'+(tooltip?' title="'+escapeHtml(explanation)+'"':'')+'>'+escapeHtml(label || badge[1])+'</span>';
}

function buildGuideTitleTiming_(status, approvedAt, schedule, clock, badgeOnly, infoId) {
  let state='unknown';
  if(schedule && clock) {
    if(status==='APPROVED') {
      if(Number.isFinite(approvedAt) && approvedAt<=new Date(clock.now).getTime())state=projectDay_(new Date(approvedAt),schedule.timezone)>schedule.title?'late':'on-time';
    } else state=clock.today>schedule.title?'overdue':'pending';
  }
  return buildGuideTimingExplanation_(state,approvedAt,schedule && schedule.title,schedule,'Title approved',infoId ? {popoverId:infoId} : badgeOnly ? 'badge' : false);
}

function buildGuideTimingExplanation_(state, timestamp, deadline, schedule, action, compact) {
  let explanation='Timing cannot be verified from the recorded date and deadline.';
  if(schedule && Number.isFinite(deadline)) {
    const due=formatProjectDay_(deadline);
    explanation='Deadline: '+due+'.';
    if((state==='late' || state==='on-time') && Number.isFinite(timestamp)) {
      const day=projectDay_(new Date(timestamp),schedule.timezone),delay=day-deadline;
      explanation=action+' '+formatProjectDay_(day)+', '+(delay>0?delay+' day'+(delay===1?'':'s')+' after the deadline': 'on or before the deadline')+' ('+due+').';
    } else if(state==='overdue')explanation=action+' is overdue. Deadline: '+due+'.';
    else if(state==='unknown')explanation='Recorded date unavailable. Deadline: '+due+'.';
  }
  if(compact && compact.popoverId) {
    const id=escapeHtml(compact.popoverId);
    return buildGuideTimingBadge_(state,explanation,false)+' <button type="button" class="btn btn-sm btn-outline" popovertarget="'+id+'" aria-controls="'+id+'" aria-label="Explain title approval timing">'+renderLucideIcon_('circle-help')+'</button><span id="'+id+'" class="guide-title-timing-popover" popover="auto" ontoggle="GuideWeekly.positionTitleInfo(event,this)" role="note" aria-label="Title approval timing">'+escapeHtml(explanation)+'</span>';
  }
  if(compact==='badge')return buildGuideTimingBadge_(state,explanation);
  if(compact) {
    const date=Number.isFinite(timestamp) && schedule ? new Date(timestamp).toLocaleDateString('en-GB',{timeZone:schedule.timezone,day:'numeric',month:'short'}).replace(/\bSept\b/g,'Sep') : '';
    const daysLate=state==='late' && schedule && Number.isFinite(timestamp) && Number.isFinite(deadline) ? projectDay_(new Date(timestamp),schedule.timezone)-deadline : 0;
    const label=daysLate>0 ? daysLate+' day'+(daysLate===1?'':'s')+' late' : '';
    const tooltipId='guideTimingTooltip'+(++guideTimingTooltipSequence_);
    return '<span class="tooltip"><span tabindex="0" aria-describedby="'+tooltipId+'">'+(date?'<small>'+escapeHtml(date)+'</small>':'')+buildGuideTimingBadge_(state,explanation,false,label)+'</span><span class="tooltip-text" id="'+tooltipId+'" role="tooltip">'+escapeHtml(explanation)+'</span></span>';
  }
  return '<span>'+buildGuideTimingBadge_(state,explanation)+'<small>'+escapeHtml(explanation)+'</small></span>';
}

function buildGuideGithubTiming_(member, schedule, clock) {
  if(!member || !member.githubId || member.status!=='valid' || member.access!=='active')return '';
  if(!schedule || !clock || !Number.isFinite(schedule.git))return buildGuideTimingExplanation_('unknown',null,null,schedule,'GitHub account submitted',true);
  const timestamp=member && member.submittedAt;
  let state='unknown';
  if(member && member.status==='valid' && Number.isFinite(timestamp) && timestamp<=new Date(clock.now).getTime())state=projectDay_(new Date(timestamp),schedule.timezone)>schedule.git?'late':'on-time';
  else if(!member || member.status==='missing' || member.status==='invalid')state=clock.today>schedule.git?'overdue':'pending';
  return buildGuideTimingExplanation_(state,timestamp,schedule.git,schedule,'GitHub account submitted',true);
}

function buildGuideApprovalDetails_(row, TS, approvals, timing) {
  const key=normalizeText_(row[TS.TEAM_ID]);
  return `<div><p><strong>Approved title:</strong> ${escapeHtml(row[TS.TITLE])}</p>
    <p><strong>Scope:</strong> Not recorded separately.${row[TS.WORK_BREAKDOWN_LINK] ? ' See <a href="'+escapeHtml(row[TS.WORK_BREAKDOWN_LINK])+'" target="_blank" rel="noopener">Work Breakdown</a>.' : ''}</p>
    <p><strong>Approved by:</strong> ${escapeHtml(row[TS.TITLE_APPROVED_BY] || 'Not recorded')}</p>
    <p><strong>Approved on:</strong> ${escapeHtml(approvals && approvals[key] || 'Date unavailable')} ${timing ? buildGuideTitleTiming_('APPROVED',timing.approvalTimes?.[key],timing.schedule,timing.clock,true,'guideTitleTiming-'+encodeURIComponent(key)) : ''}</p>
    <p><strong>Reviewer comment:</strong> ${escapeHtml(row[TS.REVIEWER_NOTES] || 'No comment recorded')}</p></div>`;
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
    <div class=" ${badge.cls}"></div>
    <div class="card-body">
      <div>
        <span class="${guideBadgeClass_(badge.cls)}">${renderLucideIcon_('tag')}${badge.text}</span>
        <span>Team ${teamId}</span>
      </div>
      <h3>${title}</h3>
      <p>${renderLucideIcon_('users')}${names}</p>
      ${logWeeks && logWeeks.missing ? `<p>${logWeeks.missing} student weekly log(s) overdue</p>` : ''}
      ${status !== 'APPROVED' ? `<p>Title approval due ${formatProjectDay_(schedule.title)}${clock.today > schedule.title ? ' · Overdue' : ''}</p>` : ''}`;


  if (status === 'NOT_SUBMITTED') {
    return `<div class="event-card card">${top}
      ${buildRepoLine(repoUrl)}
    </div></div>`;
  }

  if (status === 'NEEDS_REVIEW') {
    return `<div class="event-card card" id="card-${teamId}">${top}
      ${textEquals_(r[TS.REVIEWER_DECISION], 'Revise') ? `<p>Reviewer requested revision: ${escapeHtml(r[TS.REVIEWER_NOTES])}</p>` : ''}
      <label for="title-${teamId}">Title (editable)</label>
      <input type="text" id="title-${teamId}" value="${escapeHtml(r[TS.TITLE])}">
      ${buildProblemBlock(teamId, r[TS.PROBLEM])}
      ${buildDocumentLinks(r)}
      ${buildRepoLine(repoUrl)}
      ${r[TS.SIMILARITY_FLAG] ? `<p>${escapeHtml(r[TS.SIMILARITY_FLAG])}</p>` : ''}
      <textarea id="notes-${teamId}" placeholder="Notes (optional, required if rejecting)"></textarea>
      <p class="status" id="status-${teamId}"></p>
      <div></div>
      <div>
        <div>
          <button class="revise btn btn-sm btn-outline" onclick="decide('${teamId}', 'Rejected')">Reject</button>
          <button class="approve btn btn-sm btn-primary" onclick="decide('${teamId}', 'Approved')">Approve</button>
        </div>
      </div>
    </div></div>`;
  }

  if (status === 'AWAITING_REVIEWER') {
    return `<div class="event-card card">${top}
      ${buildProblemBlock(teamId, r[TS.PROBLEM])}
      ${buildDocumentLinks(r)}
      ${buildRepoLine(repoUrl)}
      <p>You approved — awaiting Reviewer.</p>
    </div></div>`;
  }

  if (status === 'APPROVED') {
    return `<div class="event-card card">${top}
      ${buildProblemBlock(teamId, r[TS.PROBLEM])}
      ${buildDocumentLinks(r)}
      ${buildRepoLine(repoUrl)}
      ${buildGuideApprovalDetails_(r, TS, timing && timing.approvals, timing)}
    </div></div>`;
  }

  if (status === 'REJECTED_BY_GUIDE') {
    return `<div class="event-card card">${top}
      ${buildProblemBlock(teamId, r[TS.PROBLEM])}
      ${buildDocumentLinks(r)}
      ${buildRepoLine(repoUrl)}
      <p><strong>Your note:</strong> ${escapeHtml(r[TS.GUIDE_NOTES]) || '(none)'}</p>
      <p>Waiting on the team to resubmit.</p>
    </div></div>`;
  }

  if (status === 'REVISE_AWAITING_STUDENT') {
    return `<div class="event-card card">${top}
      ${buildProblemBlock(teamId, r[TS.PROBLEM])}
      ${buildDocumentLinks(r)}
      ${buildRepoLine(repoUrl)}
      <p><strong>Reviewer's note:</strong> ${escapeHtml(r[TS.REVIEWER_NOTES]) || '(none)'}</p>
      <p>Waiting for the team to resubmit — nothing for you to do until they do.</p>
    </div></div>`;
  }
}

function buildProblemBlock(teamId, problemText, maxLen) {
  const full = String(problemText || '');
  if (!full) return '';
  return `<div>${renderLucideIcon_('file-text')}${renderExpandableText_(full, maxLen || 130)}</div>`;
}

function buildRepoLine(repoUrl) {
  if (!repoUrl) return '';
  return `<p>${renderLucideIcon_('link')}<a href="${escapeHtml(repoUrl)}" target="_blank" rel="noopener">${escapeHtml(repoUrl)}</a></p>`;
}

function buildDocumentLinks(r, listView) {
  const TS = getColumnMap(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const docs = [
    { label: 'Work Breakdown', url: r[TS.WORK_BREAKDOWN_LINK] },
    { label: 'Need Analysis', url: r[TS.NEED_ANALYSIS_LINK] },
    { label: 'Chapter 1 (LaTeX)', url: r[TS.CHAPTER1_LATEX_LINK] },
  ].filter(d => d.url);
  if (docs.length === 0) return '';
  if (listView) return '<ul>'+docs.map(d=>`<li><strong>${d.label}</strong><a class="btn btn-sm btn-outline" href="${escapeHtml(d.url)}" target="_blank" rel="noopener">Open document</a></li>`).join('')+'</ul>';
  const links = docs.map(d => `<a href="${escapeHtml(d.url)}" target="_blank" rel="noopener">${d.label}</a>`).join(' &middot; ');
  return `<p>${renderLucideIcon_('file-text')}${links}</p>`;
}

function buildDashboardContent(email, data) {
  const { teams } = data;
  const teamCards = buildGuideWorkspace_(teams, data)
    || '<p>You have no teams assigned.</p>';

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
  return `<button type="button" class="tile" data-guide-tab="evaluation" aria-pressed="false" ${evaluationEnabled ? 'onclick="GuideWeekly.selectView(\'evaluation\')"' : 'disabled title="'+escapeHtml(evaluationNotice)+'"'}><strong>${evaluationEnabled ? renderLucideIcon_('graduation-cap') : renderLucideIcon_('lock-keyhole')}Guide Evaluation</strong><span>${evaluationEnabled ? 'Individual assessment' : escapeHtml(evaluationNotice)}</span></button>`;
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
    return `<button type="button" class="tile${index === 0 ? ' tile--selected marker-accent' : ''}" data-guide-select="${id}" data-title-attention="${t.status === 'NEEDS_REVIEW'}" data-documents-attention="${[r[TS.WORK_BREAKDOWN_LINK],r[TS.NEED_ANALYSIS_LINK],r[TS.CHAPTER1_LATEX_LINK]].filter(Boolean).length}" aria-pressed="${index === 0}" onclick="GuideWeekly.selectTeam(this.dataset.guideSelect)">
      <span><strong>Team ${id}</strong><span data-team-attention role="status">${t.status === 'NEEDS_REVIEW' ? '<span class="badge badge--warning">Title review &middot; 1</span>' : getSkeletonMarkup_('inline','Checking team actions')}</span></span>
      <span>${escapeHtml(r[TS.TITLE] || 'No title submitted yet')}</span>
      <span>${renderLucideIcon_('users')}${count} member${count === 1 ? '' : 's'}</span>
    </button>`;
  }).join('');
  const panels = teams.map((t,index) => {
    const r=t.row;
    const students=[r[TS.S1_REGNO],r[TS.S2_REGNO],r[TS.S3_REGNO],r[TS.S4_REGNO]].filter(Boolean).map(String);
    // Reuse every existing form, field ID, decision handler and evaluation gate.
    const card=buildTeamCard(r,t.status,t.repoUrl,t.logWeeks,data)
      .replace(/<div>[\s\S]*?<h3>[\s\S]*?<\/h3>/, '')
      .replace(`<p>${renderLucideIcon_('users')}${buildGuideMemberNames_(r, TS)}</p>`, '')
      .replace(buildProblemBlock(escapeHtml(r[TS.TEAM_ID]), r[TS.PROBLEM]), r[TS.PROBLEM] ? `<div class="guide-problem-statement"><strong>Problem statement:</strong> <span class="guide-problem-desktop">${escapeHtml(String(r[TS.PROBLEM]))}</span><div class="guide-problem-mobile">${renderExpandableText_(String(r[TS.PROBLEM]),130)}</div></div>` : '')
      .replace(buildDocumentLinks(r), '')
      .replace(buildRepoLine(t.repoUrl), '')
      .replace('<div class="card-body">', `<div class="card-body"><div><h3>Title approval</h3><span class="${guideBadgeClass_(STATUS_LABEL[t.status].cls)}">Team ${escapeHtml(r[TS.TEAM_ID])} · ${STATUS_LABEL[t.status].text}</span>${t.status === 'APPROVED' ? '' : buildGuideTitleTiming_(t.status,data.approvalTimes?.[normalizeText_(r[TS.TEAM_ID])],data.schedule,data.clock)}</div>`);
    const docs=buildDocumentLinks(r,true);
    const roster=[1,2,3,4].map(n=>({email:r[TS['S'+n+'_EMAIL']],regno:r[TS['S'+n+'_REGNO']],name:r[TS['S'+n+'_NAME']]}));
    const github=githubByTeam && githubByTeam[normalizeText_(r[TS.TEAM_ID])];
    const githubTone=!github || github.verificationUnavailable || github.accessError || github.members.some(member=>member.access==='unavailable') ? 'gray'
      : github.members.some(member=>!member.githubId) ? 'red'
      : github.members.length && github.members.every(member=>member.status==='valid' && member.access==='active') ? 'green' : 'orange';
    const githubCard=`<aside class="guide-title-github"><div class=" ${githubTone}"></div><div><div><h3>GitHub status</h3><p>Due: ${Number.isFinite(data.schedule?.git) ? escapeHtml(formatProjectDay_(data.schedule.git)) : 'Date unavailable'}</p></div>${github ? '<ul aria-label="Team GitHub status">'+buildGithubMemberRows_(roster,github.members,'',true,member=>buildGuideGithubTiming_(member,data.schedule,data.clock))+'</ul>' : '<p role="status">GitHub status unavailable. Refresh the dashboard to retry.</p>'}${buildGithubRepositoryLine_(t.repoUrl,true)}</div></aside>`;

    return `<section data-guide-team="${escapeHtml(r[TS.TEAM_ID])}" data-guide-students="${escapeHtml(JSON.stringify(students))}" ${index ? 'hidden' : ''}>
      <div data-guide-view="title">${githubCard}<div>${card}</div></div>
      <div data-guide-view="documents" hidden><h3>Team documents</h3>${docs || '<p>No documents submitted yet.</p><p>Last document submission: '+escapeHtml(data.documentSubmissions?.[normalizeText_(r[TS.TEAM_ID])] || 'None recorded')+'</p>'}<p>Open the submitted files to review the team’s work.</p></div>
    </section>`;
  }).join('');
  const headers=teams.map((t,index)=>`<header data-guide-heading="${escapeHtml(t.row[TS.TEAM_ID])}" ${index ? 'hidden' : ''}>
    <h3>${escapeHtml(t.row[TS.TITLE] || 'No title submitted yet')}</h3>
    <div><span>${renderLucideIcon_('users')}${buildGuideMemberNames_(t.row, TS)}</span>
    <a class="btn btn-sm btn-outline" href="mailto:${escapeHtml([t.row[TS.S1_EMAIL],t.row[TS.S2_EMAIL],t.row[TS.S3_EMAIL],t.row[TS.S4_EMAIL]].filter(Boolean).join(','))}?subject=${encodeURIComponent('Team '+t.row[TS.TEAM_ID]+' — Capstone Project')}">Email Team</a></div>
  </header>`).join('');
  return `<div data-guide-workspace>
    <aside aria-label="My teams"><div><h3>My teams</h3><span>${teams.length} teams</span></div>${selectors}</aside>
    <div>${headers}
      <nav class="guide-view-nav" aria-label="Team workspace">
        <button type="button" class="tile tile--selected" data-guide-tab="title" aria-pressed="true" onclick="GuideWeekly.selectView('title')"><strong>${renderLucideIcon_('tag')}Title review</strong><span>Submission &amp; decision</span></button>
        <button type="button" class="tile" data-guide-tab="weekly" aria-pressed="false" onclick="GuideWeekly.selectView('weekly')"><strong>${renderLucideIcon_('trending-up')}Weekly progress</strong><span>Student updates &amp; discussion</span></button>
        <button type="button" class="tile" data-guide-tab="documents" aria-pressed="false" onclick="GuideWeekly.selectView('documents')"><strong>${renderLucideIcon_('file-text')}Documents</strong><span>Submitted files</span></button>
        ${buildGuideEvaluationTab_(data.schedule, data.clock)}
      </nav>
      ${panels}
      <section id="guideWeeklyProgress" data-guide-weeks="${escapeHtml(JSON.stringify(getWeeklySubmissionWindows_().map(w=>({weekId:w.weekId,opensAt:w.opens_at,deadlineAt:w.deadline_at}))))}" class="card" hidden aria-label="Weekly progress confirmation">
        <div><div><h2>Weekly Progress</h2></div></div>
        <p data-guide-weekly-status role="status"></p>
        <div data-guide-weekly-read>${getSkeletonMarkup_('panel','Reading weekly progress')}</div>
      </section>
  <section id="guideEvaluationEditor" class="card" hidden aria-label="Guide evaluation editor"></section>
    </div>
  </div>`;
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

