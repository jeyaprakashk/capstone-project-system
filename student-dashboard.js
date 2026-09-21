/**
 * STUDENT DASHBOARD
 * Dark-themed web app for students to track progress through capstone workflow
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
    r = statusSheet.getRange(statusRow, 1, 1, statusSheet.getLastColumn()).getValues()[0];
  }

  perfLap = studentPerfLog_('TeamStatus row + column map', perfLap);

  const titleStatus = getTeamStatus(r);
  const note = textEquals_(r[TS.REVIEWER_DECISION], 'Revise') ? r[TS.REVIEWER_NOTES]
    : textEquals_(r[TS.GUIDE_DECISION], 'Rejected') ? r[TS.GUIDE_NOTES]
    : '';

  // Repo URL is now an operational field in TeamStatus. Read it from the
  // TeamStatus row already in memory; no extra sheet call when migrated.
  const statusSheetForRepo = getSheet(SHEET_NAMES.TEAM_STATUS);
  const repoCol = getOptionalHeaderIndex_(statusSheetForRepo, 'Repo URL');
  let repoUrl = repoCol >= 0 ? String(r[repoCol] || '').trim() : '';
  if (!repoUrl) repoUrl = getRepoUrlForTeamFast_(teamId); // migration compatibility only
  perfLap = studentPerfLog_('Repository URL lookup', perfLap);

  const rosterSlots = [
    { name: r[TS.S1_NAME], email: r[TS.S1_EMAIL], regno: r[TS.S1_REGNO] },
    { name: r[TS.S2_NAME], email: r[TS.S2_EMAIL], regno: r[TS.S2_REGNO] },
    { name: r[TS.S3_NAME], email: r[TS.S3_EMAIL], regno: r[TS.S3_REGNO] },
    { name: r[TS.S4_NAME], email: r[TS.S4_EMAIL], regno: r[TS.S4_REGNO] },
  ].filter(s => s.email);

  let githubState, githubText;
  if (repoUrl) {
    // Repository exists: username submission data is irrelevant to display.
    githubState = 'done';
    githubText = 'Repository ready';
    studentPerfLog_('GitHub username lookup (skipped)', perfLap);
  } else {
    // Only teams without a repository need username-submission state.
    const usernameStart = Date.now();
    const usernameSheet = getSheet(SHEET_NAMES.GITHUB_USERNAME_RAW);
    const submittedEmails = new Set();
    if (usernameSheet && usernameSheet.getLastRow() >= 2) {
      const matches = usernameSheet
        .getRange(2, 3, usernameSheet.getLastRow() - 1, 1)
        .createTextFinder(normalizedTextPattern_(String(teamId))).useRegularExpression(true)
        .matchEntireCell(true)
        .matchCase(false)
        .findAll();
      readMatchedRows_(usernameSheet, matches, 2, 1).forEach(row => {
        const submittedEmail = row[0];
        if (submittedEmail) submittedEmails.add(String(submittedEmail).trim().toLowerCase());
      });
    }
    studentPerfLog_('GitHub username lookup', usernameStart);

    const missingRegnos = rosterSlots
      .filter(s => !submittedEmails.has(String(s.email).trim().toLowerCase()))
      .map(s => s.regno);
    const mySubmission = submittedEmails.has(String(email).trim().toLowerCase());

    if (!mySubmission) {
      githubState = 'active';
      githubText = 'Not submitted yet';
    } else if (missingRegnos.length > 0) {
      githubState = 'waiting';
      githubText = `Submitted — waiting on teammate(s): ${missingRegnos.join(', ')}`;
    } else {
      githubState = 'waiting';
      githubText = 'All teammates submitted — waiting for your repository to be created';
    }
  }

  // Targeted log lookup: search the Email column instead of transferring RawLog.
  const studentLogs = [];
  const schedule = getProjectSchedule_();
  const clock = getProjectClock_(schedule);
  const logSheet = getSheet(SHEET_NAMES.RAW_LOG);
  if (logSheet && logSheet.getLastRow() >= 2) {
    const matches = logSheet
      .getRange(2, 2, logSheet.getLastRow() - 1, 1)
      .createTextFinder(normalizedTextPattern_(String(email).trim())).useRegularExpression(true)
      .matchEntireCell(true)
      .matchCase(false)
      .findAll();

    readMatchedRows_(logSheet, matches, 1, 3).forEach(log => {
      if (!textEquals_(log[2], teamId)) return;
      studentLogs.push(log);
    });
  }

  perfLap = studentPerfLog_('RawLog latest-entry lookup', perfLap);

  studentPerfLog_('getStudentDashboardData TOTAL', perfStart);

  return {
    teamId, title: r[TS.TITLE], problem: r[TS.PROBLEM],
    titleStatus, note,
    githubState, githubText, repoUrl,
    rosterSlots, schedule, clock, logWeeks: getLogWeekSummary_(studentLogs, schedule, clock)
  };
}

function getRepoUrlForTeamFast_(teamId) {
  const sheet = getSheet(SHEET_NAMES.GITHUB_PROVISIONING);
  if (!sheet || sheet.getLastRow() < 2) return '';
  const match = sheet
    .getRange(2, GP.TEAM_ID + 1, sheet.getLastRow() - 1, 1)
    .createTextFinder(normalizedTextPattern_(String(teamId))).useRegularExpression(true)
    .matchEntireCell(true)
    .matchCase(false)
    .findNext();
  return match ? String(sheet.getRange(match.getRow(), GP.REPO_URL + 1).getValue() || '') : '';
}
function initialsOf(name) {
  const parts = String(name || '?').trim().split(/\s+/);
  return ((parts[0]?.[0] || '') + (parts[1]?.[0] || '')).toUpperCase() || '?';
}

function buildTeamRoster(rosterSlots, myEmail) {
  const chips = rosterSlots.map((s, i) => {
    const isMe = emailsMatch(s.email, myEmail);
    const color = AVATAR_COLORS[i % AVATAR_COLORS.length];
    return `
      <div class="member-chip">
        <span class="avatar" style="background:${color}">${escapeHtml(initialsOf(s.name))}</span>
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
        <h3>${escapeHtml(title)}</h3>
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

  const githubDone = !!d.repoUrl;
  const titleApproved = d.titleStatus === 'APPROVED';

  const doneCount = [
    githubDone,
    titleApproved,
    d.clock.today > d.schedule.end && d.logWeeks.missing === 0
  ].filter(Boolean).length;


  // ===============================================================
  // GITHUB SETUP
  // ===============================================================

  const githubBody = d.repoUrl
    ? `<p>Your repository is live:</p>
       <a class="mono-detail link"
          href="${escapeHtml(d.repoUrl)}"
          target="_blank"
          rel="noopener">
          ${escapeHtml(d.repoUrl)}
       </a>`
    : `<p>${escapeHtml(d.githubText)}</p>`;

  const githubCta = d.repoUrl
    ? ''
    : (
        d.githubState === 'active'
          ? `<a class="student-btn"
                href="${escapeHtml(buildGithubUsernameLink(teamId))}"
                target="_blank"
                rel="noopener">
                Submit GitHub username
             </a>`
          : ''
      );

  const githubCard = buildStepCard(
    1,
    'GitHub setup',
    d.githubState,
    githubBody + `<p class="step-detail">Team & GitHub setup due ${formatProjectDay_(d.schedule.formation)}${!githubDone && d.clock.today > d.schedule.formation ? ' · Overdue' : ''}</p>`,
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
      buildLockedBody('Finish GitHub setup first.'),
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
        ? `<a class="student-btn"
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

  let logCard;
  const weekLabel = d.clock.active ? `Weekly progress log · Week ${d.clock.week}` : 'Weekly progress log';
  const missingNote = d.logWeeks.missing
    ? `<p class="step-detail note">${d.logWeeks.missing} completed week(s) have no log recorded.</p>` : '';
  if (d.clock.today < d.schedule.week1) {
    logCard = buildStepCard(3, weekLabel, 'locked',
      `<p>Week 1 starts on ${formatProjectDay_(d.schedule.week1)}. Each logging week runs Monday–Sunday.</p>`, '', true);
  } else if (d.clock.today > d.schedule.end) {
    logCard = buildStepCard(3, weekLabel, d.logWeeks.missing ? 'waiting' : 'done',
      `<p>The logging period ended on ${formatProjectDay_(d.schedule.end)}.</p>${missingNote}`, '', true);
  } else if (!githubDone || !titleApproved) {
    logCard = buildStepCard(3, weekLabel, 'locked', buildLockedBody(!githubDone
      ? 'Finish GitHub setup first.' : 'Your project title must be approved before weekly logging.') + missingNote, '', true);
  } else {
    const logBody = `<p>${formatProjectDay_(d.clock.start)} – ${formatProjectDay_(d.clock.end)}</p>
      <p>${d.logWeeks.currentLogged ? 'Your log for this week is recorded.' : 'Submit your weekly log by ' + formatProjectDay_(d.clock.end) + '.'}</p>${missingNote}`;
    const logCta = `<a class="student-btn" href="${escapeHtml(buildWeeklyLogLink(teamId))}" target="_blank" rel="noopener">${d.logWeeks.currentLogged ? 'Add another update' : "Log this week's work"}</a>`;
    logCard = buildStepCard(3, weekLabel, d.logWeeks.currentLogged ? 'waiting' : 'active', logBody, logCta, true);
  }

  // ===============================================================
  // REVIEW MARKS — ASYNCHRONOUS
  // ===============================================================

  // Do not block the main Student dashboard while the separate marks
  // spreadsheet is opened. The browser replaces this placeholder after
  // the core dashboard is already visible.
  const marksSection = `
    <div class="marks-card" id="studentMarksAsync">
      <h3>Your Marks</h3>
      <div class="marks-row">
        <span>Review marks</span>
        ${getSkeletonMarkup_('inline', 'Loading marks')}
      </div>
    </div>`;


  // ===============================================================
  // PAGE OUTPUT
  // ===============================================================

  return `
  <div class="student-dashboard-surface">

    <div class="dash-hero">
      <h1>
        Team
        <span class="mono-tag">
          ${escapeHtml(teamId)}
        </span>
      </h1>

      <p class="hero-sub">
        ${doneCount} of 3 milestones complete
      </p>
    </div>

    ${buildTeamRoster(d.rosterSlots, email)}

    <div class="stepper">
      ${githubCard}
      ${titleCard}
      ${logCard}
    </div>

    ${marksSection}
    <section id="studentGuideEvaluation" class="assessment-section" aria-live="polite">Loading guide evaluation…</section>


  </div>`;
}

/**
 * Loaded independently after the Student core dashboard is visible.
 * No CacheService is used; marks are read fresh on every page load.
 */
function loadStudentMarksSection() {
  const email = Session.getActiveUser().getEmail();
  if (!email) throw new Error('Could not identify your account.');

  const allReviewMarks = getStudentAllReviewMarks(email);


  function row_(label, marks) {
    return marks && marks.completed
      ? `<div class="marks-row"><span>${escapeHtml(label)}</span><span class="marks-value">${escapeHtml(marks.totalMarks)} / ${escapeHtml(marks.maxMarks)}</span></div>`
      : `<div class="marks-row"><span>${escapeHtml(label)}</span><span class="marks-pending">Not yet entered</span></div>`;
  }

  return `<h3>Your Marks</h3>
    ${getInternalReviews_().map(review => row_(review.label, allReviewMarks && allReviewMarks[review.key])).join('')}`;
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
