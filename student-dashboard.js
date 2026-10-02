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
    .map(x => '<div class="row row--between py-1"><span>' + escapeHtml(x.label) + '</span><strong class="num">' + x.ms + ' ms</strong></div>')
    .join('');
  const total = Date.now() - STUDENT_PERF_.startedAt;
  return '<div class="notice notice--warning mt-6 mb-6">' +
    '<div class="text-label text-label--warning mb-2">TEMPORARY PERFORMANCE DIAGNOSTICS</div>' +
    rows +
    '<div class="row row--between mt-2"><strong>TOTAL STUDENT SERVER TIME</strong><strong class="num">' + total + ' ms</strong></div>' +
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
  const chips = rosterSlots.map((s, index) => {
    const isMe = emailsMatch(s.email, myEmail);
    return `
      <div>
        <span class="avatar avatar-${index % 3 + 1}">${escapeHtml(initialsOf(s.name))}</span>
        <div>
          <div>${escapeHtml(s.name)}${isMe ? ' <span>you</span>' : ''}</div>
          <div>${escapeHtml(s.regno)}</div>
        </div>
      </div>`;
  }).join('');

  return `<div>${chips}</div>`;
}

function buildStepNode(stepNum, state) {
  const icon = state === 'done' ? renderLucideIcon_('check', 'Complete') : state === 'locked' ? renderLucideIcon_('lock-keyhole', 'Locked') : stepNum;
  return `<div class="circle">${icon}</div>`;
}

function buildStepCard(stepNum, title, state, bodyHtml, ctaHtml, isLast) {
  const badge = state === 'done' ? '<span>Done</span>'
    : state === 'waiting' ? '<span>Waiting</span>'
    : state === 'locked' ? '<span>Locked</span>'
    : '<span class="active">Action needed</span>';

  return `
  <div data-step-row>
    <div>
      ${buildStepNode(stepNum, state)}
      ${isLast ? '' : '<div class="step-line"></div>'}
    </div>
    <div class="card" data-step-card>
      <div data-step-header>
        <h4>${escapeHtml(title)}</h4>
        ${badge}
      </div>
      <div data-step-body>${bodyHtml}</div>
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
  const githubRows = buildGithubMemberRows_(d.rosterSlots, githubMembers, !connected ? email : '');
  const githubBody = `<p>GitHub setup due ${Number.isFinite(d.schedule.git) ? formatProjectDay_(d.schedule.git) : 'Date unavailable'} · ${escapeHtml(d.githubNeedsUsername && !connected ? 'Waiting for GitHub account connection.' : githubTiming.text)}</p>
    <ul aria-label="Team GitHub status">${githubRows}</ul>
    ${buildGithubRepositoryLine_(d.repoUrl)}`;
  const githubCta = !connected
    ? `<form onsubmit="DashboardUI.previewGithubAccount(event, this)">
        <label for="studentGithubProfile">Submit GitHub Account</label>
        <p>GitHub → <strong>Your profile</strong> → copy the profile URL and paste below.</p>
        <input id="studentGithubProfile" name="profileUrl" type="url" required maxlength="200" autocomplete="off" autocapitalize="none" spellcheck="false" placeholder="https://github.com/student123" aria-describedby="githubSubmitStatus"${d.githubCaptureReady ? '' : ' disabled'}>
        <button class="btn btn-lg btn-primary" type="submit"${d.githubCaptureReady ? '' : ' disabled'}>Continue</button>
        <div data-github-confirmation hidden></div>
        <p id="githubSubmitStatus" role="status" aria-live="polite"></p>
        <button id="githubStatusRefresh" class="secondary btn btn-sm btn-outline" type="button" hidden onclick="DashboardUI.refreshGithubStatus(this)">Refresh GitHub status</button>
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
        `<p>
           <strong>Current title:</strong>
           ${escapeHtml(d.title)}
         </p>`;
    }

    if (d.note) {
      titleBody +=
        `<p>
           ${escapeHtml(d.note)}
         </p>`;
    }

    const titleCta =
      label.state === 'active'
        ? `<a class="btn btn-primary"
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
      titleBody + `<p>Approval due ${formatProjectDay_(d.schedule.title)}${!titleApproved && d.clock.today > d.schedule.title ? ' · Overdue' : ''}</p>`,
      titleCta,
      false
    );
  }


  // ===============================================================
  // WEEKLY PROGRESS LOG
  // ===============================================================

  const logCard = titleApproved ? '<section class="card">' +
    '<section id="studentWeeklyProgress" aria-label="Weekly progress">' +
    '<div><h3>Weekly progress</h3><button type="button" class="btn btn-sm btn-outline" data-weekly-refresh aria-label="Refresh weekly progress" onclick="DashboardUI.loadWeeklyProgress()">Refresh</button></div>' +
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
  const setupHeader = '<h3>Project Setup</h3><span class="badge badge--' + (setupComplete ? 'success' : 'info') + '">' + (setupComplete ? '&#10003; Complete' : 'Action needed') + '</span>';
  const setupBody = '<div class="student-setup-steps">' + githubCard + titleCard + '</div>';
  const setupCard = setupComplete
    ? '<details class="student-project-setup"><summary>' + setupHeader + '<span class="setup-view">View</span><span class="setup-hide">Hide</span></summary>' + setupBody + '</details>'
    : '<section class="student-project-setup" aria-label="Project Setup"><header>' + setupHeader + '</header><div data-setup-pending>' + pendingSteps.map(text=>'<p>' + escapeHtml(text) + '</p>').join('') + '</div>' + setupBody + '</section>';

  // ===============================================================
  // REVIEW MARKS — ASYNCHRONOUS
  // ===============================================================




  // ===============================================================
  // PAGE OUTPUT
  // ===============================================================

  return `
  <div>

    <div>
      <h2>
        Team
        <span>
          ${escapeHtml(teamId)}
        </span>
      </h2>

    </div>

    <div>
    ${buildTeamRoster(d.rosterSlots, email)}

    ${setupCard}
    </div>
    ${logCard}

    <div>
      <section class="card" aria-label="Recent logs">
        <header><h3>Recent logs</h3>${titleApproved ? '<a href="#studentWeeklyProgress" onclick="DashboardUI.openWeeklyActivity(this);return false;">View all logs</a>' : ''}</header>
        <div id="studentRecentActivity">${titleApproved ? getSkeletonMarkup_('panel','Loading recent logs') : '<p>Weekly logs will appear after project setup.</p>'}</div>
      </section>
      <section class="student-assessments-card card" aria-label="Assessments"><header><h3>Assessments</h3></header>
    ${getAssessmentDefinitions_().filter(d=>d.type==='REVIEW').map(d=>'<section id="studentAssessment-'+escapeHtml(d.key)+'" data-review-result="'+escapeHtml(d.key)+'" data-assessment-label="'+escapeHtml(d.label)+'" class="card" aria-live="polite">'+getSkeletonMarkup_('panel', 'Loading '+d.label+' results')+'</section>').join('')}
    <section id="studentGuideEvaluation" data-assessment-label="${escapeHtml((getAssessmentDefinitions_().find(d=>d.type==='GUIDE_EVALUATION') || {}).label || 'Guide Evaluation')}" class="card" aria-live="polite">${getSkeletonMarkup_('panel', 'Loading guide evaluation')}</section>
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

/** Shared status-only rendering; an action email opts in to the Student form shortcut. */
function buildGithubMemberRows_(roster, members, actionEmail, showNames, renderTiming) {
  return roster.filter(student => String(student.email || '').trim()).map(student => {
    const member = members.find(item => emailsMatch(item.email, student.email));
    const missing = !member || !member.githubId;
    const joined = !missing && member.status === 'valid' && member.access === 'active';
    const status = missing ? 'Submit GitHub Account' : joined ? 'Repository joined' : 'Accept Invitation Email';
    const icon = missing ? 'triangle-alert' : joined ? 'check' : 'clock';
    const statusText = missing && actionEmail && emailsMatch(student.email, actionEmail)
      ? `<button type="button" class="btn btn-outline" data-github-form-jump onclick="DashboardUI.focusGithubAccountForm(this)">${escapeHtml(status)}</button>` : `<span>${escapeHtml(status)}</span>`;
    return `<li data-member-status="${missing ? 'missing' : joined ? 'joined' : 'pending'}"><span data-member-register>${showNames && student.name ? '<strong>'+escapeHtml(student.name)+'</strong><br>' : ''}${escapeHtml(student.regno || '')}</span><span class="github-member-separator" aria-hidden="true">—</span><span data-member-state>${renderLucideIcon_(icon)}${statusText}</span>${renderTiming ? '<span>'+renderTiming(member)+'</span>' : ''}</li>`;
  }).join('');
}

function buildGithubRepositoryLine_(repoUrl, compact) {
  const match=String(repoUrl || '').match(/^https:\/\/github\.com\/([^/]+)\/([^/?#]+)/i);
  if(compact && match)return `<div class="github-team-repository">${renderLucideIcon_('git-branch', 'Team repository')}<a href="${escapeHtml(repoUrl)}" title="${escapeHtml(match[1])}" target="_blank" rel="noopener">${escapeHtml(match[2])} ${renderLucideIcon_('external-link')}</a></div>`;
  return `<div class="github-team-repository"><span>${renderLucideIcon_('git-branch', 'Team repository')}</span>${repoUrl ? `<a href="${escapeHtml(repoUrl)}" target="_blank" rel="noopener">${escapeHtml(repoUrl)} ${renderLucideIcon_('external-link')}</a>` : '<span>Not available yet</span>'}</div>`;
}
