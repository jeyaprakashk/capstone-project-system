/**
 * SHEET CATALOG - one readable list of the sheets the code uses: tab name, access mode, headers, status and purpose.
 * Status: new (header-name access from the start), by-name (found by header name, but not yet audited: its code list is incomplete),
 * positional (some column is still read by position), migrated (every access is by header name, listed in `code` and audited by
 * tests/sheet-catalog.test.cjs). Whether the code that creates a sheet goes through ensureSheet_ shows in `code` as a setup or
 * runtime-create entry.
 * Specified in SHEET-HEADER-MATCHING-PLAN.md ("Sheet catalog"); the generated reference is SHEETS.md
 * (npm run build:sheets-doc). Every sheet the code touches is listed (the master registry is in the hub spreadsheet).
 *
 * - Frozen sheets are referenced with headersFrom: 'FIELD_DEFINITIONS.<NAME>', never copied.
 * - `code` lists only code that exists: { file, role, functions }, role = setup | runtime-create | read | write.
 * - createAtRuntime marks a sheet that runtime code may create (ensureSheet_ mode 'runtime'); see ENSURE-SHEET-PLAN.md.
 * It is a function, not a top-level constant, so it does not depend on file load order.
 */
let sheetCatalogMemo_ = null;

function sheetCatalog_() {
  if (!sheetCatalogMemo_) {
    sheetCatalogMemo_ = sheetCatalogFreeze_({
      config: {
        name: 'Config',
        access: 'edit',
        headers: ['Key', 'Value', 'Description'],
        status: 'migrated',
        purpose: 'Settings: one key and value per row, found under the Key and Value headers. Description is for people. Created by hand; no code creates it.',
        createAtRuntime: false,
        code: [
          {file: 'common-helpers.js', role: 'read', functions: ['getConfig_', 'configColumns_']},
          {file: 'common-helpers.js', role: 'write', functions: ['setConfig_']}
        ]
      },
      teamRoster: {
        name: SHEET_NAMES.TEAM_ROSTER,
        access: 'edit',
        headersFrom: 'FIELD_DEFINITIONS.TEAM_ROSTER',
        status: 'by-name',
        purpose: 'Who is in each team: guide, up to four students, committee number.',
        createAtRuntime: false,
        code: []
      },
      teamStatus: {
        name: SHEET_NAMES.TEAM_STATUS,
        access: 'view',
        headersFrom: 'FIELD_DEFINITIONS.TEAM_STATUS',
        extraHeaders: ['Repo URL'],
        status: 'by-name',
        purpose: 'One row per team. The Repo URL column is not in the frozen definition; setupTeamStatusColumns adds it when it is missing.',
        createAtRuntime: false,
        code: [
          {file: 'common-helpers.js', role: 'setup', functions: ['setupTeamStatusColumns']}
        ]
      },
      reviewCommittee: {
        name: SHEET_NAMES.REVIEW_COMMITTEE,
        access: 'edit',
        headersFrom: 'FIELD_DEFINITIONS.REVIEW_COMMITTEE',
        status: 'by-name',
        purpose: 'Reviewers of each Review Committee.',
        createAtRuntime: false,
        code: []
      },
      githubAccounts: {
        name: SHEET_NAMES.GITHUB_ACCOUNTS,
        access: 'view',
        headers: ['Timestamp', 'Email address', 'Team ID', 'GitHub Username', 'GitHub ID', 'GitHub Display Name', 'GitHub Profile URL'],
        status: 'migrated',
        purpose: "Students' confirmed GitHub accounts. Created by hand; no code creates it.",
        createAtRuntime: false,
        code: [
          {file: 'github-identity.js', role: 'read', functions: ['githubAccountColumns_', 'githubCaptureReady_']},
          {file: 'github-identity.js', role: 'write', functions: ['writeGithubAccount_', 'refreshGithubAccountMetadata_']},
          {file: 'student-github.js', role: 'read', functions: ['getStudentTeamGithubSetup_', 'previewStudentGithubAccount_']},
          {file: 'student-github.js', role: 'write', functions: ['confirmStudentGithubAccount_']},
          {file: 'team-github-setup.js', role: 'read', functions: ['getTeamsGithubSetup_', 'getTeamGithubSetup_']},
          {file: 'github-invitation-resend.js', role: 'read', functions: ['resendExpiredStudentInvitations_']},
          {file: 'guide-api.js', role: 'read', functions: ['buildGuideGithubDto_']},
          {file: 'progress-eligibility.js', role: 'read', functions: ['reconcileProgressEligibility']},
          {file: 'weekly-activity.js', role: 'read', functions: ['weeklyStoredGithubMapping_']},
          {file: 'weekly-progress-phase2.js', role: 'read', functions: ['weeklyAIIdentifiers_']}
        ]
      },
      weeklyWindows: {
        name: SHEET_NAMES.WEEKLY_WINDOWS,
        access: 'edit',
        headersFrom: 'FIELD_DEFINITIONS.WEEKLY_WINDOWS',
        status: 'by-name',
        purpose: 'Opening, deadline and late cut-off of each weekly submission.',
        createAtRuntime: false,
        code: []
      },
      logEntries: {
        name: SHEET_NAMES.LOG_ENTRIES,
        access: 'view',
        headersFrom: 'FIELD_DEFINITIONS.LOG_ENTRIES',
        status: 'migrated',
        purpose: 'Append-only journal of weekly submissions.',
        createAtRuntime: false,
        code: [
          {file: 'logbook-tracker.js', role: 'setup', functions: ['setupWeeklySubmissionStorage']},
          {file: 'logbook-tracker.js', role: 'read', functions: ['readLogEntries_', 'weeklyLogColumns_']},
          {file: 'logbook-tracker.js', role: 'write', functions: ['appendWeeklyEntry_']}
        ]
      },
      commits: {
        name: SHEET_NAMES.COMMITS,
        access: 'view',
        headersFrom: 'FIELD_DEFINITIONS.COMMITS',
        status: 'migrated',
        purpose: 'Collected GitHub commits. A GitHub Author ID column follows the frozen six. Created by hand; no code creates it.',
        createAtRuntime: false,
        code: [
          {file: 'logbook-tracker.js', role: 'read', functions: ['commitColumns_', 'readCollectedCommits_', 'auditCommitHistory', 'collectAllCommits_']},
          {file: 'logbook-tracker.js', role: 'write', functions: ['appendCollectedCommits_']},
          {file: 'weekly-progress-phase2.js', role: 'read', functions: ['weeklyAIIdentifiers_']}
        ]
      },
      commitCollectionStatus: {
        name: SHEET_NAMES.COMMIT_COLLECTION_STATUS,
        access: 'system',
        headersFrom: 'FIELD_DEFINITIONS.COMMIT_COLLECTION_STATUS',
        status: 'migrated',
        purpose: 'Whether the last commit collection of a team succeeded. Created by the first status write.',
        createAtRuntime: true,
        code: [
          {file: 'logbook-tracker.js', role: 'runtime-create', functions: ['commitCollectionStatusSheet_']},
          {file: 'logbook-tracker.js', role: 'read', functions: ['readCommitCollectionStatus_']},
          {file: 'logbook-tracker.js', role: 'write', functions: ['upsertCommitCollectionStatus_']}
        ]
      },
      guideSignoff: {
        name: SHEET_NAMES.GuideSignoff,
        access: 'view',
        headersFrom: 'FIELD_DEFINITIONS.GuideSignoff',
        status: 'by-name',
        purpose: 'Guide confirmations of weekly entries.',
        createAtRuntime: false,
        code: []
      },
      aiProgressAnalysis: {
        name: SHEET_NAMES.AIProgressAnalysis,
        access: 'view',
        headersFrom: 'FIELD_DEFINITIONS.AIProgressAnalysis',
        status: 'by-name',
        purpose: 'Results of the weekly AI analysis.',
        createAtRuntime: false,
        code: []
      },
      assessmentDefinitions: {
        name: 'AssessmentDefinitions',
        access: 'edit',
        headers: ['Assessment ID', 'Type', 'Label', 'Sequence', 'Weight (%)', 'Opening', 'Due Date', 'Prerequisites', 'Academic Policy Version', 'Journal'],
        status: 'by-name',
        purpose: 'The assessments of the semester. A test keeps this list equal to ASSESSMENT_DEFINITION_HEADERS_.',
        createAtRuntime: false,
        code: []
      },
      milestones: {
        name: 'Milestones',
        access: 'edit',
        headers: ['Milestone ID', 'Milestone Name', 'Due Date', 'Graded By', 'Weight (%)'],
        status: 'by-name',
        purpose: 'Non-assessment events on the timeline. A test keeps this list equal to MILESTONE_HEADERS_.',
        createAtRuntime: false,
        code: []
      },
      rubrics: {
        name: 'Rubrics',
        access: 'edit',
        headers: ['Assessment ID', 'Order', 'PI', 'Criterion', 'CO', 'Max Marks', 'Type'],
        status: 'by-name',
        purpose: 'Rubric criteria. The optional Level 0 to Level 5 columns are read when present.',
        createAtRuntime: false,
        code: []
      },
      progressEligibility: {
        name: 'ProgressEligibility',
        access: 'view',
        headers: ['Register Number', 'Student Name', 'Team', 'GitHub Username', 'GitHub Numeric ID', 'Collaborator Status', 'Collaborator First Detected At',
          'First Qualifying Student Commit At', 'Collaborator Date Source', 'Effective Collaborator Date', 'Evidence Reference', 'Title Status',
          'Title Confirmation Date', 'Progress Fixing Date', 'Progress Eligible From Week ID', 'Enforced From Week ID', 'Eligibility Fixed At',
          'Status', 'Last Checked At', 'Last Check Error'],
        status: 'migrated',
        purpose: 'Individual weekly eligibility. A test keeps this list equal to PROGRESS_ELIGIBILITY_FIELDS_.',
        createAtRuntime: false,
        code: [
          {file: 'progress-eligibility.js', role: 'setup', functions: ['setupProgressEligibilityStorage']},
          {file: 'progress-eligibility.js', role: 'read', functions: ['progressEligibilityStorage_']},
          {file: 'progress-eligibility.js', role: 'write', functions: ['writeProgressEligibility_']}
        ]
      },
      masterRegistry: {
        name: SHEET_NAMES.MASTER_REGISTRY,
        access: 'view',
        headers: ['Academic Year', 'Semester', 'TeamID', 'Guide Email', 'Title', 'Repo URL', 'Team Members', 'Approved Date', 'Approved By'],
        status: 'migrated',
        purpose: 'Approved titles of all years, for the similarity check. It is in the hub spreadsheet (HUB_SHEET_ID), not this one, and is read only: no code creates or writes it. The code needs only Academic Year, Semester, TeamID and Title.',
        createAtRuntime: false,
        code: [
          {file: 'common-helpers.js', role: 'read', functions: ['getHubRegistrySheet_', 'masterRegistryRecords_', 'readMasterRegistry_']}
        ]
      },
      assessmentJournal: {
        namePattern: 'Assessment_<assessment id>, or the Journal named in AssessmentDefinitions',
        access: 'view',
        headers: ['Assessment', 'Team', 'Student', 'Revision', 'Action', 'Actor', 'At', 'Request ID', 'Payload'],
        status: 'migrated',
        purpose: 'Append-only history of an assessment, one sheet per assessment, all with this layout. Created by the coordinator\'s storage setup, which is a request path and keeps its own creation code.',
        createAtRuntime: false,
        code: [
          {file: 'assessment-registry.js', role: 'read', functions: ['assessmentJournal_', 'assessmentJournalColumns_']},
          {file: 'assessment-registry.js', role: 'write', functions: ['provisionAssessmentJournals_']},
          {file: 'guide-evaluation.js', role: 'read', functions: ['guideRecords_']},
          {file: 'review-evaluation.js', role: 'read', functions: ['reviewRecords_']},
          {file: 'publication-events.js', role: 'read', functions: ['publicationProject_']},
          {file: 'evaluation-lifecycle.js', role: 'write', functions: ['evaluationAppend_']}
        ]
      },
      activityDependencies: {
        name: 'ActivityDependencies',
        access: 'edit',
        headers: ['Activity', 'Kind', 'Item', 'Label', 'Active'],
        status: 'new',
        purpose: 'Rules that gate student actions. The coordinator fills the rows.',
        createAtRuntime: false,
        code: [
          {file: 'activity-dependencies-sheet.js', role: 'setup', functions: ['ensureActivityDependenciesSheet_']},
          {file: 'title-storage.js', role: 'setup', functions: ['setupTitleStorage']}
        ]
      },
      titleLog: {
        name: 'TitleLog',
        access: 'view',
        headers: ['Timestamp', 'Team ID', 'Revision', 'Action', 'Actor', 'Request ID', 'Fingerprint', 'Status',
          'Proposed Title', 'Proposed Problem', 'Notes', 'Similarity Note', 'Reopened',
          'Approved Title', 'Approved Problem', 'Approved At', 'Approved By'],
        status: 'new',
        purpose: 'Append-only title history; the latest row of a team is its current title state.',
        createAtRuntime: false,
        code: [
          {file: 'title-storage.js', role: 'setup', functions: ['setupTitleStorage']},
          {file: 'title-log.js', role: 'read', functions: ['readTitleLog_']},
          {file: 'title-log.js', role: 'write', functions: ['appendTitleLogRow_']}
        ]
      }
    });
  }
  return sheetCatalogMemo_;
}

function sheetCatalogFreeze_(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(sheetCatalogFreeze_);
    Object.freeze(value);
  }
  return value;
}

/** The header list of an entry. */
function sheetCatalogHeaders_(entry) {
  const withExtra = list => entry.extraHeaders ? list.concat(entry.extraHeaders) : list;
  if (entry.headersFrom) {
    const match = /^FIELD_DEFINITIONS\.([A-Za-z0-9_]+)$/.exec(entry.headersFrom);
    const definition = match && FIELD_DEFINITIONS[match[1]];
    if (!definition) throw new Error('Unknown header definition in the sheet catalog: ' + entry.headersFrom);
    return withExtra(Object.values(definition));
  }
  return withExtra(entry.headers.slice());
}

/**
 * The specification ensureSheet_ needs: {name, headers, access, createAtRuntime}. Never `mode`: the call site sets that.
 */
function sheetSpec_(key) {
  const entry = sheetCatalog_()[key];
  if (!entry) throw new Error('Unknown sheet in the catalog: ' + key);
  if (!entry.name) throw new Error('The sheet ' + key + ' has a generated name (' + entry.namePattern + '): the caller must supply it.');
  return {name: entry.name, headers: sheetCatalogHeaders_(entry), access: entry.access, createAtRuntime: entry.createAtRuntime === true};
}
