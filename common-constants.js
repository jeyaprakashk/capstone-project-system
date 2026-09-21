/**
 * COMMON CONSTANTS — shared across all dashboards and workflows
 * Sheet names, field definitions, status labels, UI elements
 */

// ===================================================================
// SHEET NAMES
// ===================================================================
const SHEET_NAMES = {
  TEAM_ROSTER: 'TeamRoster',
  TEAM_STATUS: 'TeamStatus',
  REVIEW_COMMITTEE: 'ReviewCommittee',
  GITHUB_PROVISIONING: 'GithubProvisioning',
  GITHUB_USERNAME_RAW: 'GithubUsernameRaw',
  TEAM_INTAKE_RAW: 'TeamIntakeRaw',
  MASTER_REGISTRY: 'MasterRegistry',
  RAW_LOG: 'RawLog',
  COMMITS: 'Commits',
  FLAGS: 'Flags',
  ANNOUNCEMENTS: 'Announcements'
};

// ===================================================================
// COLUMN DEFINITIONS — header-based lookup, case-insensitive
// ===================================================================
const FIELD_DEFINITIONS = {
  TEAM_ROSTER: {
    TEAM_ID: 'Team ID',
    SEMESTER: 'Semester',
    GUIDE_NAME: 'Guide Name',
    GUIDE_EMAIL: 'Guide Email',
    GUIDE_GITHUB_USERNAME: 'Guide GitHub Username',
    S1_NAME: 'Student 1 Name', S1_REGNO: 'Student 1 Register No', S1_EMAIL: 'Student 1 Email',
    S2_NAME: 'Student 2 Name', S2_REGNO: 'Student 2 Register No', S2_EMAIL: 'Student 2 Email',
    S3_NAME: 'Student 3 Name', S3_REGNO: 'Student 3 Register No', S3_EMAIL: 'Student 3 Email',
    S4_NAME: 'Student 4 Name', S4_REGNO: 'Student 4 Register No', S4_EMAIL: 'Student 4 Email',
    COMMITTEE_NUMBER: 'Review Committee Number'
  },

  TEAM_STATUS: {
    TEAM_ID: 'Team ID',
    SEMESTER: 'Semester',
    GUIDE_NAME: 'Guide Name',
    GUIDE_EMAIL: 'Guide Email',
    S1_NAME: 'Student 1 Name', S1_REGNO: 'Student 1 Register No', S1_EMAIL: 'Student 1 Email',
    S2_NAME: 'Student 2 Name', S2_REGNO: 'Student 2 Register No', S2_EMAIL: 'Student 2 Email',
    S3_NAME: 'Student 3 Name', S3_REGNO: 'Student 3 Register No', S3_EMAIL: 'Student 3 Email',
    S4_NAME: 'Student 4 Name', S4_REGNO: 'Student 4 Register No', S4_EMAIL: 'Student 4 Email',
    TITLE: 'Title',
    PROBLEM: 'Problem Statement',
    SIMILARITY_FLAG: 'Similarity Flag',
    GUIDE_DECISION: 'Guide Decision',
    GUIDE_NOTES: 'Guide Notes',
    REVIEWER_DECISION: 'Reviewer Decision',
    REVIEWER_NOTES: 'Reviewer Notes',
    COMMITTEE_NUMBER: 'Review Committee Number',
    TITLE_APPROVED_BY: 'Title Approved By',
    WORK_BREAKDOWN_LINK: 'Work Breakdown Link',
    NEED_ANALYSIS_LINK: 'Need Analysis Link'
  },

  REVIEW_COMMITTEE: {
    COMMITTEE_NUMBER: 'Review Committee Number',
    REVIEWER1_NAME: 'Reviewer 1 Name', REVIEWER1_EMAIL: 'Reviewer 1 Email',
    REVIEWER2_NAME: 'Reviewer 2 Name', REVIEWER2_EMAIL: 'Reviewer 2 Email',
    REVIEWER3_NAME: 'Reviewer 3 Name', REVIEWER3_EMAIL: 'Reviewer 3 Email',
    REVIEWER4_NAME: 'Reviewer 4 Name', REVIEWER4_EMAIL: 'Reviewer 4 Email',
    MARKS_SHEET_ID: 'Marks Sheet ID'
  },

  ANNOUNCEMENTS: {
    TIMESTAMP: 'Timestamp',
    EMAIL: 'Email address',
    MESSAGE: 'Message',
    FILE_LINK: 'Document Link (if any to be shared - Optional field)',
    STUDENT_VISIBLE: 'Visibility to [Project Teams]',
    GUIDE_VISIBLE: 'Visibility to [Guides]',
    REVIEWER_VISIBLE: 'Visibility to [Reviewers]'
  },

  COMMITTEE_TAB: {
    TEAM_ID: 'Team ID',
    STUDENT_REGNO: 'Student Register No',
    STUDENT_NAME: 'Student Name',
    STUDENT_EMAIL: 'Student Email',
    MARKS: 'Marks'
  }
};

// ===================================================================
// GITHUB PROVISIONING COLUMNS (array-based indices, not headers)
// ===================================================================
const GP = {
  TEAM_ID: 0,
  REPO_URL: 1,
  PROVISIONED_DATE: 2
};

// ===================================================================
// TEAM STATUS STATES
// ===================================================================
const STATUS_LABEL = {
  NOT_SUBMITTED: { text: 'Not Submitted', cls: 'gray' },
  NEEDS_REVIEW: { text: 'Needs Your Review', cls: 'orange' },
  REVISE_AWAITING_STUDENT: { text: 'Awaiting Student Revision', cls: 'gray' },
  AWAITING_REVIEWER: { text: 'Awaiting Reviewer', cls: 'blue' },
  APPROVED: { text: 'Approved', cls: 'green' },
  REJECTED_BY_GUIDE: { text: 'Rejected by You', cls: 'red' }
};

const STUDENT_TITLE_LABEL = {
  NOT_SUBMITTED: { text: 'Not submitted yet', state: 'active' },
  NEEDS_REVIEW: { text: "Submitted — awaiting your guide's review", state: 'waiting' },
  REVISE_AWAITING_STUDENT: { text: 'Reviewer Committee requested changes — resubmit needed', state: 'active' },
  AWAITING_REVIEWER: { text: 'Guide-approved — awaiting Reviewer Committee', state: 'waiting' },
  APPROVED: { text: 'Approved', state: 'done' },
  REJECTED_BY_GUIDE: { text: 'Guide requested changes — resubmit needed', state: 'active' }
};

// ===================================================================
// UI CONSTANTS
// ===================================================================
const AVATAR_COLORS = ['#7C5CFC', '#34D399', '#F5A623', '#FB7185', '#38BDF8'];

// Internal review definitions are provided lazily by getInternalReviews_().

