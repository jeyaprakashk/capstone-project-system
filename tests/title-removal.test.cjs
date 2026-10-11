// The removal check (TITLE-REVISION-PLAN.md, section 9): no runtime code reads or writes the old title data. The goal is zero runtime
// readers and writers, not zero mentions: the frozen definitions, the invariant snapshots, the tests and the documentation keep theirs.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

// The old title columns and the old workflow, as they appear in code.
const OLD_TITLE_DATA = [
  /\bgetTeamStatus_\b/, /\bREVIEWER_DECISION\b/, /\bGUIDE_DECISION\b/, /\bGUIDE_NOTES\b/, /\bREVIEWER_NOTES\b/, /\bSIMILARITY_FLAG\b/, /\bTITLE_APPROVED_BY\b/,
  /\bWORK_BREAKDOWN_LINK\b/, /\bNEED_ANALYSIS_LINK\b/, /\bCHAPTER1_LATEX_LINK\b/, /\bTEAM_INTAKE_RAW\b/, /TeamIntakeRaw/, /\bRAW_LOG\b/, /\bRawLog\b/, /WEEKLY_REMINDERS/, /WeeklyReminders/, /\bsubmitDecision\b/i, /\bbuildTeamIntakeLink_\b/,
  /\bonTeamIntakeSubmit\b/, /\bapplyGuideDecision_\b/, /\bapplyReviewerDecision_\b/, /\bprogressTitleDate_\b.*registry/i, /\bTS\.TITLE\b/, /\bTS\.PROBLEM\b/,
  /\bcolumns\.TITLE\b/, /\bcolumns\.PROBLEM\b/, /\bc\.TITLE\b/, /\br\[TS\.TITLE\]/, /TEAM_INTAKE_FORM_URL_BASE/, /TEAM_INTAKE_TEAMID_ENTRY/
];

// Files that keep their mentions, each for a stated reason.
const EXCLUDED = {
  'common-constants.js': 'the frozen TeamStatus column definitions keep the old title columns in the sheet; the Form sheets are gone from SHEET_NAMES'
};

const runtimeFiles = fs.readdirSync('.').filter(name => name.endsWith('.js') && !name.startsWith('tailwind') && !EXCLUDED[name]);

test('no runtime module reads or writes the old title data or runs the old workflow', () => {
  const found = [];
  for (const file of runtimeFiles) {
    const text = fs.readFileSync(file, 'utf8').split(/\r?\n/);
    text.forEach((line, index) => {
      const code = line.replace(/\/\/.*$/, '');
      for (const pattern of OLD_TITLE_DATA) if (pattern.test(code)) found.push(file + ':' + (index + 1) + ' ' + pattern + ' -> ' + line.trim().slice(0, 100));
    });
  }
  assert.deepEqual(found, []);
});

test('every exclusion names a file that exists', () => {
  for (const file of Object.keys(EXCLUDED)) assert.ok(fs.existsSync(file), file);
});

test('the removed entry points are gone from the server and from the contract', () => {
  const all = runtimeFiles.map(file => fs.readFileSync(file, 'utf8')).join('\n');
  for (const name of ['API_guide_submitDecision', 'API_reviewer_submitDecision', 'API_guide_getApprovals', 'onTeamIntakeSubmit', 'submitGuideDecision_', 'submitReviewerDecision_']) {
    assert.ok(!all.includes(name), name + ' must be gone');
  }
  const contracts = fs.readFileSync('DATA-CONTRACTS.md', 'utf8');
  assert.doesNotMatch(contracts, /`API_(guide|reviewer)_submitDecision`/);
  assert.doesNotMatch(contracts, /`API_guide_getApprovals/);
});

test('the project sends no e-mail: no runtime module uses MailApp or GmailApp', () => {
  const users = runtimeFiles.filter(file => /\b(MailApp|GmailApp)\b/.test(fs.readFileSync(file, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')));
  assert.deepEqual(users, []);
  assert.ok(!runtimeFiles.some(file => /getDashboardUrl_/.test(fs.readFileSync(file, 'utf8'))), 'the dashboard-link helper only served e-mail');
});
