/**
 * ACTIVITY ENGINE - the requirements a student action must meet before it runs (archive/plans/ACTIVITY-DEPENDENCIES-PLAN.md). Rows in the
 * ActivityDependencies sheet name a check kind and an item; this file reads them, validates them and runs the checks. The checks
 * live in activity-check-github.js and activity-check-drive.js. The sheet is read fresh on every request; nothing is cached
 * between requests. Misconfiguration denies; an unverifiable check is unmet.
 *
 * The registry is a function, not a top-level list the check files add to, so it does not depend on the order the files load in.
 */
const ACTIVITY_IDS_ = Object.freeze(['title.submit', 'title.resubmit']);
const ACTIVITY_MISCONFIGURED_ = 'Submission requirements are misconfigured. Contact the coordinator.';

/**
 * kind -> {needsApprovedTitle, perStudent, validItem(item), isMet(team, item, ctx) -> {met, reason, unverifiable?, diagnostic?}}
 * `unverifiable: true` means the source could not be read; the engine words it as "Could not verify: <label>."
 */
function activityChecks_() {
  return {github: activityCheckGithub_(), drive: activityCheckDrive_()};
}

/** A request's context: the loaded rules and the GitHub and Drive answers, kept for this request only. */
function activityContext_() {
  return {rules: null, github: Object.create(null), drive: Object.create(null)};
}

/** The only sheet read. Returns {present, headers, rows}; never caches. */
function readActivityDependencyRows_() {
  const sheet = getSheet_(sheetSpec_('activityDependencies').name);
  if (!sheet) return {present: false, headers: [], rows: []};
  const values = readSheetRows_(sheet, 1);
  return {present: true, headers: (values[0] || []).map(cell => String(cell === null || cell === undefined ? '' : cell)), rows: values.slice(1)};
}

/** Pure. data = {present, headers, rows}. Returns {rules: {activityId: [{kind, item, label}]}, errors: [string]}. */
function parseActivityRules_(data, checks) {
  const rules = Object.create(null), errors = [];
  if (!data.present) return {rules, errors: ['The ActivityDependencies sheet is missing.']};
  const required = sheetSpec_('activityDependencies').headers;
  const position = {};
  required.forEach(header => {
    const at = [];
    data.headers.forEach((cell, index) => { if (normalizeText_(cell) === normalizeText_(header)) at.push(index); });
    if (!at.length) errors.push('The header "' + header + '" is missing.');
    else if (at.length > 1) errors.push('The header "' + header + '" appears more than once.');
    else position[header] = at[0];
  });
  if (errors.length) return {rules, errors};
  const cell = (row, header) => { const value = row[position[header]]; return value === null || value === undefined ? '' : String(value); };
  data.rows.forEach((row, offset) => {
    const where = 'Row ' + (offset + 2) + ': ';
    if (required.every(header => cell(row, header).trim() === '')) return;
    const activity = cell(row, 'Activity'), item = cell(row, 'Item'), label = cell(row, 'Label').trim();
    const kind = cell(row, 'Kind').trim().toLowerCase(), active = cell(row, 'Active').trim().toLowerCase();
    const problems = [];
    if (!ACTIVITY_IDS_.includes(activity)) problems.push('unknown activity "' + activity + '"');
    const check = checks[kind];
    if (!check) problems.push('unknown kind "' + cell(row, 'Kind').trim() + '"');
    else if (!check.validItem(item)) problems.push('invalid item "' + item + '" for kind ' + kind);
    if (!label) problems.push('the label is blank');
    if (active !== 'yes' && active !== 'no') problems.push('Active must be Yes or No');
    if (check && ACTIVITY_IDS_.includes(activity)) {
      if (check.needsApprovedTitle) problems.push('kind ' + kind + ' needs an approved title, which this activity is what produces');
    }
    if (problems.length) { errors.push(where + problems.join('; ') + '.'); return; }
    if (active === 'yes') (rules[activity] = rules[activity] || []).push({kind, item, label});
  });
  return {rules, errors};
}

/** Loads and parses once per request (kept in ctx). Errors are written to the server log. */
function loadActivityRules_(ctx) {
  if (!ctx.rules) {
    let parsed;
    try { parsed = parseActivityRules_(readActivityDependencyRows_(), activityChecks_()); }
    catch (error) { parsed = {rules: Object.create(null), errors: ['The ActivityDependencies sheet could not be read: ' + (error && error.message || error)]}; }
    if (parsed.errors.length) console.error('ActivityDependencies is misconfigured: ' + parsed.errors.join(' | '));
    ctx.rules = parsed;
  }
  return ctx.rules;
}

/**
 * {allowed, requirements: [{label, met, reason, diagnostic?}], reason}. Every active row is run; nothing stops at the first failure.
 * `team` = {teamId, semester}.
 */
function activityPreconditions_(activityId, team, ctx) {
  const loaded = loadActivityRules_(ctx);
  if (loaded.errors.length) return {allowed: false, requirements: [], reason: ACTIVITY_MISCONFIGURED_};
  const rows = loaded.rules[activityId] || [];
  if (!rows.length) return {allowed: true, requirements: [], reason: ''};
  const checks = activityChecks_();
  const requirements = rows.map(rule => {
    let answer;
    try { answer = checks[rule.kind].isMet(team, rule.item, ctx); }
    catch (error) { console.error('Requirement check failed (' + rule.kind + '/' + rule.item + '): ' + (error && error.message || error)); answer = {met: false, unverifiable: true}; }
    const item = {label: rule.label, met: answer.met === true, reason: ''};
    if (!item.met) item.reason = answer.unverifiable ? 'Could not verify: ' + rule.label + '.' : String(answer.reason || 'Not met.');
    if (answer.diagnostic) item.diagnostic = answer.diagnostic;
    return item;
  });
  const unmet = requirements.filter(item => !item.met);
  return {allowed: unmet.length === 0, requirements, reason: unmet.length ? unmet.map(item => item.label + ': ' + item.reason).join(' ') : ''};
}

/** The student-facing form of a result: the same, without any diagnostic. Every student DTO and action response uses it. */
function studentRequirements_(result) {
  return {allowed: result.allowed, reason: result.reason,
    requirements: result.requirements.map(item => ({label: item.label, met: item.met, reason: item.reason}))};
}

/** The unmet items as short strings, for a refusal message. A misconfiguration is one string. */
function activityUnmetMessages_(result) {
  if (result.allowed) return [];
  if (!result.requirements.length) return [result.reason];
  return result.requirements.filter(item => !item.met).map(item => item.label + ' (' + item.reason + ')');
}
