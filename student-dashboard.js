/**
 * STUDENT DASHBOARD
 * Shared-theme web app for students to track progress through capstone workflow
 * Step 1: GitHub Setup → Step 2: Project Title → Step 3: Weekly Logging
 * Shared deployment with Guide, Reviewer, and Coordinator views via doGet() in guide-dashboard.gs
 */

let STUDENT_PERF_ = null;

function studentPerfReset_() {
  STUDENT_PERF_ = { measurements: [], startedAt: Date.now() };
}

function studentPerfLog_(label, startMs) {
  const now = Date.now();
  const ms = now - startMs;
  if (STUDENT_PERF_) STUDENT_PERF_.measurements.push({ label: label, ms: ms });
  console.log('[STUDENT PERF] ' + label + ': ' + ms + ' ms');
  return now;
}

function buildStudentPerfBox_() {
  if (!STUDENT_PERF_) return '';
  const rows = STUDENT_PERF_.measurements
    .filter(x => x.label !== 'buildStudentContent TOTAL')
    .map(x => '<div style="display:flex;justify-content:space-between;gap:24px;padding:4px 0;border-bottom:1px solid #e5e7eb;"><span>' + escapeHtml(x.label) + '</span><strong style="font-family:JetBrains Mono,monospace;white-space:nowrap;">' + x.ms + ' ms</strong></div>')
    .join('');
  const total = Date.now() - STUDENT_PERF_.startedAt;
  return '<div style="margin:24px 0;padding:16px 18px;border:2px dashed #d97706;border-radius:12px;background:#fffbeb;color:#1f2937;font:13px Inter,sans-serif;">' +
    '<div style="font-weight:700;margin-bottom:10px;color:#92400e;">TEMPORARY PERFORMANCE DIAGNOSTICS</div>' +
    rows +
    '<div style="display:flex;justify-content:space-between;gap:24px;padding-top:9px;font-size:14px;"><strong>TOTAL STUDENT SERVER TIME</strong><strong style="font-family:JetBrains Mono,monospace;white-space:nowrap;">' + total + ' ms</strong></div>' +
    '</div>';
}


function getStudentDashboardData(email, teamId, teamStatusRow) {
  const perfStart = Date.now();
  let perfLap = perfStart;
  const TS = getColumnMap(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);

  // Reuse the TeamStatus row already read during authorization when available.
  // This is request-local data only; nothing is persisted between requests.
  let r = teamStatusRow;
  if (!r) {
    const statusSheet = getSheet(SHEET_NAMES.TEAM_STATUS);
    const statusRow = findTeamStatusRow(statusSheet, teamId, TS);
    if (statusRow < 2) throw new Error('Student team was not found.');
    r = readSheetRows_(statusSheet, statusRow, 1)[0];
  }

  perfLap = studentPerfLog_('TeamStatus row + column map', perfLap);

  const titleStatus = getTeamStatus(r);
  const note = textEquals_(r[TS.REVIEWER_DECISION], 'Revise') ? r[TS.REVIEWER_NOTES]
    : textEquals_(r[TS.GUIDE_DECISION], 'Rejected') ? r[TS.GUIDE_NOTES]
    : '';

  const statusSheetForRepo = getSheet(SHEET_NAMES.TEAM_STATUS);
  const repoCol = getOptionalHeaderIndex_(statusSheetForRepo, 'Repo URL');
  const repoUrl = repoCol >= 0 ? String(r[repoCol] || '').trim() : '';
  perfLap = studentPerfLog_('Repository URL lookup', perfLap);

  const rosterSlots = [
    { name: r[TS.S1_NAME], email: r[TS.S1_EMAIL], regno: r[TS.S1_REGNO] },
    { name: r[TS.S2_NAME], email: r[TS.S2_EMAIL], regno: r[TS.S2_REGNO] },
    { name: r[TS.S3_NAME], email: r[TS.S3_EMAIL], regno: r[TS.S3_REGNO] },
    { name: r[TS.S4_NAME], email: r[TS.S4_EMAIL], regno: r[TS.S4_REGNO] },
  ].filter(s => s.email);

  const github = getStudentGithubState_(email, teamId, rosterSlots, repoUrl);
  const { githubAccount, githubCaptureReady, githubState, githubText, githubUsername, githubNeedsUsername, githubReady, githubCanRetry, githubSetup } = github;

  const schedule = getProjectSchedule_();
  const clock = getProjectClock_(schedule);

  studentPerfLog_('getStudentDashboardData TOTAL', perfStart);

  return {
    teamId, title: r[TS.TITLE], problem: r[TS.PROBLEM],
    titleStatus, note,
    githubAccount, githubCaptureReady, githubState, githubText, githubUsername, githubNeedsUsername, githubReady, githubCanRetry, githubSetup, repoUrl,
    rosterSlots, schedule, clock
  };
}

function initialsOf(name) {
  const parts = String(name || '?').trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

function buildTeamRoster(rosterSlots, myEmail) {
  const chips = rosterSlots.map(s => {
    const isMe = emailsMatch(s.email, myEmail);
    return `
      <div class="member-chip">
        <span class="avatar">${escapeHtml(initialsOf(s.name))}</span>
        <div class="member-info">
          <div class="member-name">${escapeHtml(s.name)}${isMe ? ' <span class="you-tag">you</span>' : ''}</div>
          <div class="member-reg">${escapeHtml(s.regno)}</div>
        </div>
      </div>`;
  }).join('');

  return `<div class="team-roster">${chips}</div>`;
}

function buildStepNode(stepNum, state) {
  const icon = state === 'done' ? renderLucideIcon_('check', 'Complete') : state === 'locked' ? renderLucideIcon_('lock-keyhole', 'Locked') : stepNum;
  return `<div class="step-node step-node-${state}">${icon}</div>`;
}

function buildStepCard(stepNum, title, state, bodyHtml, ctaHtml, isLast) {
  const badge = state === 'done' ? '<span class="step-badge done">Done</span>'
    : state === 'waiting' ? '<span class="step-badge waiting">Waiting</span>'
    : state === 'locked' ? '<span class="step-badge locked">Locked</span>'
    : '<span class="step-badge active">Action needed</span>';

  return `
  <div class="step-row">
    <div class="step-rail">
      ${buildStepNode(stepNum, state)}
      ${isLast ? '' : '<div class="step-line"></div>'}
    </div>
    <div class="step-card step-card-${state}">
      <div class="step-header">
        <h4>${escapeHtml(title)}</h4>
        ${badge}
      </div>
      <div class="step-body">${bodyHtml}</div>
      ${ctaHtml || ''}
    </div>
  </div>`;
}

function buildLockedBody(reason) {
  return `<p>${escapeHtml(reason)}</p>`;
}

function buildStudentContent(email, teamId, teamStatusRow) {
  studentPerfReset_();
  const contentStart = Date.now();
  let contentLap = contentStart;

  const d = getStudentDashboardData(email, teamId, teamStatusRow);
  contentLap = studentPerfLog_('Student core data', contentLap);

  const githubDone = d.githubReady;
  const githubTiming = githubSubmissionTiming_(d.githubSetup, d.schedule, d.clock);
  const titleApproved = d.titleStatus === 'APPROVED';
  const setupComplete = githubDone && titleApproved;


  // ===============================================================
  // GITHUB SETUP
  // ===============================================================

  const account = d.githubAccount || {};
  const connected = !!account.githubId;
  const githubMembers = (d.githubSetup || {}).members || [];
  const githubRows = d.rosterSlots.filter(student => String(student.email || '').trim()).map(student => {
    const member = githubMembers.find(item => emailsMatch(item.email, student.email));
    const missing = !member || !member.githubId;
    const joined = !missing && member.status === 'valid' && member.access === 'active';
    const status = missing ? 'Submit GitHub Account' : joined ? 'Repository joined' : 'Accept Invitation Email';
    const icon = missing ? 'triangle-alert' : joined ? 'check' : 'clock';
    const statusText = missing && !connected && emailsMatch(student.email, email)
      ? `<button type="button" class="github-form-jump app-btn btn-md btn-secondary" onclick="DashboardUI.focusGithubAccountForm(this)">${escapeHtml(status)}</button>` : `<span>${escapeHtml(status)}</span>`;
    return `<li class="github-member-status${missing ? ' is-missing' : joined ? ' is-joined' : ''}"><span class="github-member-register">${escapeHtml(student.regno || '')}</span><span class="github-member-separator" aria-hidden="true">—</span><span class="github-member-state">${renderLucideIcon_(icon)}${statusText}</span></li>`;
  }).join('');
  const githubBody = `<p class="step-detail">Team & GitHub setup due ${formatProjectDay_(d.schedule.formation)} · ${escapeHtml(d.githubNeedsUsername && !connected ? 'Waiting for GitHub account connection.' : githubTiming.text)}</p>
    <ul class="github-team-status" aria-label="Team GitHub status">${githubRows}</ul>
    <div class="github-team-repository"><span class="github-repository-label">${renderLucideIcon_('git-branch', 'Team repository')}</span>${d.repoUrl ? `<a class="mono-detail link" href="${escapeHtml(d.repoUrl)}" target="_blank" rel="noopener">${escapeHtml(d.repoUrl)} ${renderLucideIcon_('external-link')}</a>` : '<span>Not available yet</span>'}</div>`;
  const githubCta = !connected
    ? `<form class="github-username-form" onsubmit="DashboardUI.previewGithubAccount(event, this)">
        <label for="studentGithubProfile">Submit GitHub Account</label>
        <p>GitHub → <strong>Your profile</strong> → copy the profile URL and paste below.</p>
        <input id="studentGithubProfile" name="profileUrl" type="url" required maxlength="200" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="https://github.com/student123" aria-describedby="githubSubmitStatus"${d.githubCaptureReady ? '' : ' disabled'}>
        <button class="workflow-btn app-btn btn-lg btn-primary" type="submit"${d.githubCaptureReady ? '' : ' disabled'}>Continue</button>
        <div data-github-confirmation hidden></div>
        <p id="githubSubmitStatus" role="status" aria-live="polite"></p>
        <button id="githubStatusRefresh" class="workflow-btn secondary app-btn btn-sm btn-secondary" type="button" hidden onclick="DashboardUI.refreshGithubStatus(this)">Refresh GitHub status</button>
      </form>`
    : '';

  const githubCard = buildStepCard(
    1,
    'GitHub setup',
    d.githubState,
    githubBody,
    githubCta,
    false
  );


  // ===============================================================
  // PROJECT TITLE
  // ===============================================================

  let titleCard;

  if (!githubDone) {

    titleCard = buildStepCard(
      2,
      'Project title',
      'locked',
      buildLockedBody('Finish GitHub setup first.') + (d.title ? '<p><strong>Current title:</strong> ' + escapeHtml(d.title) + '</p><p>' + escapeHtml(STUDENT_TITLE_LABEL[d.titleStatus].text) + '</p>' : ''),
      '',
      false
    );

  } else {

    const label = STUDENT_TITLE_LABEL[d.titleStatus];

    let titleBody =
      `<p>${escapeHtml(label.text)}</p>`;

    if (d.title) {
      titleBody +=
        `<p class="step-detail">
           <strong>Current title:</strong>
           ${escapeHtml(d.title)}
         </p>`;
    }

    if (d.note) {
      titleBody +=
        `<p class="step-detail note">
           ${escapeHtml(d.note)}
         </p>`;
    }

    const titleCta =
      label.state === 'active'
        ? `<a class="workflow-btn app-btn btn-md btn-primary"
              href="${escapeHtml(buildTeamIntakeLink(teamId))}"
              target="_blank"
              rel="noopener">
              ${d.title ? 'Resubmit title' : 'Submit title'}
           </a>`
        : '';

    titleCard = buildStepCard(
      2,
      'Project title',
      label.state,
      titleBody + `<p class="step-detail">Approval due ${formatProjectDay_(d.schedule.title)}${!titleApproved && d.clock.today > d.schedule.title ? ' · Overdue' : ''}</p>`,
      titleCta,
      false
    );
  }


  // ===============================================================
  // WEEKLY PROGRESS LOG
  // ===============================================================

  const logCard = setupComplete ? '<section class="student-weekly-card">' +
    '<section id="studentWeeklyProgress" aria-label="Weekly progress">' +
    '<div class="weekly-card-heading"><h3>Weekly progress</h3><button type="button" class="app-btn btn-sm btn-secondary" data-weekly-refresh aria-label="Refresh weekly progress" onclick="DashboardUI.loadWeeklyProgress()">Refresh</button></div>' +
    '<div data-weekly-read>' + getSkeletonMarkup_('panel','Loading weekly progress') + '</div>' +
    '<p data-weekly-status role="status" aria-live="polite"></p>' +
    '<div data-weekly-form></div></section></section>' : '';

  const pendingSteps = [];
  if (!githubDone) pendingSteps.push('Step 1: ' + d.githubText);
  if (!titleApproved) {
    const label = STUDENT_TITLE_LABEL[d.titleStatus];
    pendingSteps.push('Step 2: ' + label.text + '. ' + (!githubDone ? 'Finish GitHub setup first. ' : '') +
      (label.state === 'active' ? (d.title ? 'Your team must address the feedback below and resubmit the title.' : 'Your team must submit a project title for approval.') : 'Your team is waiting for approval; check the review status below.'));
  }
  const setupHeader = '<h3 class="student-setup-title">Project Setup</h3><span class="step-badge ' + (setupComplete ? 'done' : 'active') + '">' + (setupComplete ? '&#10003; Complete' : 'Action needed') + '</span>';
  const setupBody = '<div class="student-setup-steps">' + githubCard + titleCard + '</div>';
  const setupCard = setupComplete
    ? '<details class="student-project-setup"><summary>' + setupHeader + '<span class="setup-view">View</span><span class="setup-hide">Hide</span></summary>' + setupBody + '</details>'
    : '<section class="student-project-setup" aria-label="Project Setup"><header>' + setupHeader + '</header><div class="student-setup-pending">' + pendingSteps.map(text=>'<p>' + escapeHtml(text) + '</p>').join('') + '</div>' + setupBody + '</section>';

  // ===============================================================
  // REVIEW MARKS — ASYNCHRONOUS
  // ===============================================================




  // ===============================================================
  // PAGE OUTPUT
  // ===============================================================

  return `
  <div class="dashboard-body-surface student-dashboard">

    <div class="dash-hero">
      <h2>
        Team
        <span class="mono-tag">
          ${escapeHtml(teamId)}
        </span>
      </h2>

    </div>

    <div class="student-team-overview">
    ${buildTeamRoster(d.rosterSlots, email)}

    ${setupCard}
    </div>
    ${logCard}

    <div class="student-summary-grid">
      <section class="student-summary-card" aria-label="Recent logs">
        <header class="heading-row"><h3>Recent logs</h3>${setupComplete ? '<a href="#studentWeeklyProgress" onclick="DashboardUI.openWeeklyActivity(this);return false;">View all logs</a>' : ''}</header>
        <div id="studentRecentActivity">${setupComplete ? getSkeletonMarkup_('panel','Loading recent logs') : '<p>Weekly logs will appear after project setup.</p>'}</div>
      </section>
      <section class="student-summary-card student-assessments-card" aria-label="Assessments"><header><h3>Assessments</h3></header>
    ${getAssessmentDefinitions_().filter(d=>d.type==='REVIEW').map(d=>'<section id="studentAssessment-'+escapeHtml(d.key)+'" data-review-result="'+escapeHtml(d.key)+'" data-assessment-label="'+escapeHtml(d.label)+'" class="assessment-section" aria-live="polite">'+getSkeletonMarkup_('panel', 'Loading '+d.label+' results')+'</section>').join('')}
    <section id="studentGuideEvaluation" data-assessment-label="${escapeHtml((getAssessmentDefinitions_().find(d=>d.type==='GUIDE_EVALUATION') || {}).label || 'Guide Evaluation')}" class="assessment-section" aria-live="polite">${getSkeletonMarkup_('panel', 'Loading guide evaluation')}</section>
      </section>
    </div>

  </div>`;
}

function buildStudentPage(email, teamId) {
  return buildSingleRoleDashboardPage(
    email,
    'student',
    'My Team',
    'studentContent',
    buildStudentContent(email, teamId)
  );
}
