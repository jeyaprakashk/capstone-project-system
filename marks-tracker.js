/**
 * MARKS TRACKER — PRODUCTION GRADE
 * Committee marks sheet seeding with full rubric-based CO-PI assessment
 * Uses common-helpers, common-constants
 */

// ===================================================================
// RUBRIC STRUCTURE — CO-PI DEFINITIONS
// ===================================================================
// Rubric definitions are loaded from the RUBRICS tab by getRubricStructure_().


// ===================================================================
// SEED COMMITTEE MARKS SHEETS WITH FULL RUBRIC STRUCTURE
// ===================================================================
function seedCommitteeMarksSheets() {
  const reviews = getReviewDefinitions_();
  const TS = getColumnMap(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const RC = getColumnMap(SHEET_NAMES.REVIEW_COMMITTEE, FIELD_DEFINITIONS.REVIEW_COMMITTEE);
  const teams = groupBy(getSheetRows(SHEET_NAMES.TEAM_STATUS), row => row[TS.COMMITTEE_NUMBER]);
  const results = {created:[], skipped:[], errors:[]};
  getSheetRows(SHEET_NAMES.REVIEW_COMMITTEE).forEach(row => {
    const committee = String(row[RC.COMMITTEE_NUMBER] || '').trim();
    const id = String(row[RC.MARKS_SHEET_ID] || '').trim();
    if (!committee || !id) return;
    try {
      const students = (teams[normalizeText_(committee)] || []).flatMap(team =>
        getStudentsFromTeamStatusRow_(team, TS).map(student => ({...student, teamId:team[TS.TEAM_ID]})));
      const spreadsheet = SpreadsheetApp.openById(id);
      reviews.forEach(review => {
        const name = committeeReviewTabName_(committee, review);
        if (getNamedSheet_(spreadsheet, name)) { results.skipped.push(name); return; }
        seedCommitteeReviewTab(spreadsheet, committee, review.key, students, results, []);
      });
    } catch (err) { results.errors.push({committee, error:err.message}); }
  });
  Logger.log(JSON.stringify(results));
  return results;
}

function seedCommitteeReviewTab(marksSpreadsheet, committeeNumber, reviewType, students, seedResults, detailedErrors) {
  reviewType = normalizeText_(reviewType);
  const rubric = getRubricStructure_()[reviewType];
  if (!rubric) throw new Error('Unknown review rubric: ' + reviewType);

  const review = getInternalReviews_().find(item => item.key === reviewType);
  if (!review) throw new Error('Milestone is not graded by Review Committee: ' + reviewType);
  const tabName = committeeReviewTabName_(committeeNumber, review);
  
  let tabSheet = getNamedSheet_(marksSpreadsheet, tabName);

  if (tabSheet) throw new Error('Review tab already exists; existing assessments will not be overwritten: ' + tabName);
  tabSheet = marksSpreadsheet.insertSheet(tabName);
  const requiredRows = Math.max(2, students.length + 1);
  const requiredColumns = 7 + rubric.length;
  if (tabSheet.getMaxRows() < requiredRows) tabSheet.insertRowsAfter(tabSheet.getMaxRows(), requiredRows - tabSheet.getMaxRows());
  if (tabSheet.getMaxColumns() < requiredColumns) tabSheet.insertColumnsAfter(tabSheet.getMaxColumns(), requiredColumns - tabSheet.getMaxColumns());

  // Build header row
  const headerRow = buildHeaderRow(rubric);
  
  // Set header row
  tabSheet.getRange(1, 1, 1, headerRow.length).setValues([headerRow]);
  
  // Format header row
  const headerRange = tabSheet.getRange(1, 1, 1, headerRow.length);
  headerRange.setBackground('#e8f0f7');
  headerRange.setFontWeight('bold');
  headerRange.setFontSize(11);
  headerRange.setHorizontalAlignment('center');
  headerRange.setVerticalAlignment('middle');
  headerRange.setWrap(true);

  // Build data rows
  const dataRows = students.map((student, idx) => {
    return buildStudentMarkRow(idx + 1, student.teamId, committeeNumber, student, rubric);
  });

  if (dataRows.length > 0) {
    tabSheet.getRange(2, 1, dataRows.length, dataRows[0].length).setValues(dataRows);
  }

  // Apply data validation (dropdown for rubric levels 0-5) to PI columns
  applyRubricValidation(tabSheet, rubric, dataRows.length);

  // Format columns
  formatMarksSheet(tabSheet, rubric);

  seedResults.created.push({ committeeNumber, tabName, studentCount: students.length });
  Logger.log(`✓ Created ${tabName} with ${students.length} students`);
}

function buildHeaderRow(rubric) {
  const headers = [
    '#',
    'Team Name (Number)',
    'Student Reg No',
    'Student Name',
    'Review Committee No',
    'Total (0-' + rubric.reduce((sum,pi) => sum + pi.maxMarks, 0) + ')',
    'Comments'
  ];
  
  // Add CO-PI headers
  rubric.forEach(pi => {
    headers.push(`${pi.pi} - ${pi.name}\n(CO: ${pi.co}, Max: ${pi.maxMarks})`);
  });
  
  return headers;
}

function marksColumnLetter_(column) {
  let result = '';
  while (column > 0) { column--; result = String.fromCharCode(65 + column % 26) + result; column = Math.floor(column / 26); }
  return result;
}

function buildStudentMarkRow(serialNo, teamId, committeeNumber, student, rubric) {
  const rowNumber = serialNo + 1;
  const terms = rubric.map((pi,index) =>
    `IFERROR(VALUE(${marksColumnLetter_(8 + index)}${rowNumber})/5*${pi.maxMarks},0)`);
  const maxMarks = rubric.reduce((sum,pi) => sum + pi.maxMarks, 0);
  const formula = `=MAX(0,MIN(${maxMarks},${terms.join('+')}))`;
  // Preserve text as literals, even when a name or identifier starts with '='.
  const literal = value => typeof value === 'string' && value.startsWith('=') ? "'" + value : value;
  return [serialNo,literal(teamId),literal(student.regNo),literal(student.name),literal(committeeNumber),formula,'',...rubric.map(() => '')];
}

function applyRubricValidation(tabSheet, rubric, numStudents) {
  if (!numStudents) return;
  const rule = SpreadsheetApp.newDataValidation()
    .requireValueInList(['0','1','2','3','4','5'], true)
    .setHelpText('Select a rubric level from 0 to 5. Zero is an entered assessment; blank is pending.')
    .setAllowInvalid(false).build();
  tabSheet.getRange(2, 8, numStudents, rubric.length).setDataValidation(rule);
}

function formatMarksSheet(tabSheet, rubric) {
  // Set column widths
  tabSheet.setColumnWidth(1, 50);  // S.No
  tabSheet.setColumnWidth(2, 120); // Team Name
  tabSheet.setColumnWidth(3, 100); // Reg No
  tabSheet.setColumnWidth(4, 120); // Student Name
  tabSheet.setColumnWidth(5, 110); // Committee No
  tabSheet.setColumnWidth(6, 90);  // Total
  
  tabSheet.setColumnWidth(7, 240); // Comments
  // PI columns
  for (let i = 8; i <= 7 + rubric.length; i++) {
    tabSheet.setColumnWidth(i, 120);
  }

  // Format data rows
  const lastRow = tabSheet.getLastRow();
  if (lastRow > 1) {
    const dataRange = tabSheet.getRange(2, 1, lastRow - 1, 7 + rubric.length);
    dataRange.setFontSize(10);
    dataRange.setVerticalAlignment('top');
    
    // Format Total column (column 6) as number with conditional background
    const totalRange = tabSheet.getRange(2, 6, lastRow - 1, 1);
    totalRange.setNumberFormat('0.##');
    tabSheet.getRange(2, 7, lastRow - 1, 1).setWrap(true);
    totalRange.setHorizontalAlignment('center');
    totalRange.setFontWeight('bold');
    
    // Format PI columns (center, font size 10)
    for (let col = 8; col <= 7 + rubric.length; col++) {
      const piRange = tabSheet.getRange(2, col, lastRow - 1, 1);
      piRange.setHorizontalAlignment('center');
      piRange.setBackground('#fafafa');
    }
  }

  // Freeze header row
  tabSheet.setFrozenRows(1);
}
// ===================================================================
// REVIEW COMPLETION STATUS
// Central source for Coordinator / Guide / Student dashboards
//
// Completion rule:
// A review is COMPLETE for a team only when EVERY registered student
// in that team has ALL rubric PI marks entered.
//
// Rubric level 0 is a VALID entered mark.
// Only blank / null / undefined cells are treated as missing.
// ===================================================================

/**
 * LEVEL 1 — ALL TEAMS
 *
 * Reads TeamStatus and committee marks sheets and calculates
 * Configured review completion for every team.
 *
 * Intended for:
 *   - Coordinator dashboard
 *   - Department-wide reports
 *   - Overall review statistics
 *
 * @return {Object} keyed by Team ID
 */
// Zero-based columns of the script-generated, fixed-layout marks sheets.
const REVIEW_MARK_COLUMNS_ = Object.freeze({ team:1, register:2, total:5, comments:6, criteria:7 });

function getReviewDefinitions_() {
  const structure = getRubricStructure_();
  return getInternalReviews_().map(review => {
    const rubric = structure[review.key];
    if (!Array.isArray(rubric) || !rubric.length) throw new Error('Missing rubric definition: ' + review.key);
    return {...review, rubric};
  });
}

/** Total formulas are deliberately ignored: both blank criteria and real zeroes total 0. */
function isReviewRowComplete_(row, rubric) {
  return Array.isArray(rubric) && rubric.length > 0 && rubric.every((pi,index) =>
    isReviewMarkEntered_(row[REVIEW_MARK_COLUMNS_.criteria + index]));
}

function indexReviewRows_(rows) {
  const teams = new Map();
  rows.forEach(row => {
    const team = normalizeReviewKey_(row[REVIEW_MARK_COLUMNS_.team]);
    const register = normalizeReviewKey_(row[REVIEW_MARK_COLUMNS_.register]);
    if (!team || !register) return;
    if (!teams.has(team)) teams.set(team, new Map());
    const students = teams.get(team);
    // Ambiguous duplicate records must not make completion depend on row order.
    students.set(register, students.has(register) ? null : row);
  });
  return teams;
}

function summarizeReviewCompletion_(registers, studentRows, rubric) {
  let markedStudents = 0;
  registers.forEach(register => {
    const row = studentRows && studentRows.get(register);
    if (row && isReviewRowComplete_(row, rubric)) markedStudents++;
  });
  return { completed:registers.size > 0 && markedStudents === registers.size,
    totalStudents:registers.size, markedStudents };
}

function readReviewRows_(spreadsheet, committee, review, measure) {
  measure = measure || ((phase, read) => read());
  const sheet = measure('review_read_lookup', () => getNamedSheet_(spreadsheet, committeeReviewTabName_(committee, review)));
  if (!sheet) return null;
  const lastRow = measure('review_read_row_count', () => sheet.getLastRow());
  if (lastRow < 2) return [];
  const width = REVIEW_MARK_COLUMNS_.criteria + review.rubric.length;
  if (measure('review_read_column_count', () => sheet.getLastColumn()) < width) throw new Error('Missing rubric columns in ' + sheet.getName());
  const values = measure('review_read_values', () => readSheetRows_(sheet, 1, lastRow));
  if (normalizeText_(values[0][REVIEW_MARK_COLUMNS_.comments]) !== 'comments') {
    throw new Error('Expected Comments in column G: ' + sheet.getName());
  }
  return values.slice(1);
}

function getAllReviewCompletionStatus_(timings) {
  return collectReviewCompletion_(undefined, timings);
}

function getTeamReviewCompletionStatus_(teamId) {
  const key = normalizeReviewKey_(teamId);
  if (!key) return null;
  const result = collectReviewCompletion_(key);
  return result[key] || null;
}

/** Both dashboard paths use the same evaluator. No persistent caching of marks. */
function collectReviewCompletion_(requestedTeamId, timings) {
  function measure(phase, read) {
    if (!timings) return read();
    const started = Date.now();
    let success = false;
    try { const value = read(); success = true; return value; }
    finally {
      let entry = timings.find(item => item.phase === phase);
      if (!entry) { entry = {phase, durationMs:0, success:true, calls:0}; timings.push(entry); }
      entry.durationMs += Date.now() - started;
      entry.calls++;
      entry.success = entry.success && success;
    }
  }
  const TS = getColumnMap(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const RC = getColumnMap(SHEET_NAMES.REVIEW_COMMITTEE, FIELD_DEFINITIONS.REVIEW_COMMITTEE);
  const reviews = measure('review_detail_rubrics', () => getReviewDefinitions_());
  const result = Object.create(null);
  let firstRecords=[], firstConfig, firstError='';
  if (reviews.some(r=>r.key==='review1')) {
    try {firstConfig=review1Configuration_(); firstRecords=review1Records_().records;} catch(err) {firstError=err.message;}
  }
  const teamsByCommittee = new Map();
  getSheetRows(SHEET_NAMES.TEAM_STATUS).forEach(row => {
    const teamId = normalizeReviewKey_(row[TS.TEAM_ID]);
    if (!teamId || (requestedTeamId && teamId !== requestedTeamId)) return;
    const committee = normalizeReviewKey_(row[TS.COMMITTEE_NUMBER]);
    const registers = new Set(getStudentsFromTeamStatusRow_(row, TS).map(s => normalizeReviewKey_(s.regNo)));
    const team = { teamId:String(row[TS.TEAM_ID]).trim(), committeeNumber:committee, totalStudents:registers.size };
    reviews.forEach(review => { team[review.key] = {...summarizeReviewCompletion_(registers, null, review.rubric), available:false}; });
    if (reviews.some(r=>r.key==='review1') && !firstError) team.review1=review1Progress_(row,TS,firstRecords,firstConfig);
    result[teamId] = team;
    if (committee && registers.size) {
      if (!teamsByCommittee.has(committee)) teamsByCommittee.set(committee, new Map());
      teamsByCommittee.get(committee).set(teamId, registers);
    }
  });
  if (!teamsByCommittee.size) return result;
  const sheetIds = new Map();
  getSheetRows(SHEET_NAMES.REVIEW_COMMITTEE).forEach(row => {
    sheetIds.set(normalizeReviewKey_(row[RC.COMMITTEE_NUMBER]), String(row[RC.MARKS_SHEET_ID] || '').trim());
  });
  const spreadsheets = new Map();
  const reviewIndexes = new Map();
  teamsByCommittee.forEach((teams, committee) => {
    const id = sheetIds.get(committee);
    if (!id) return;
    if (!spreadsheets.has(id)) {
      try { spreadsheets.set(id, measure('review_detail_open', () => SpreadsheetApp.openById(id))); }
      catch (err) { spreadsheets.set(id, null); Logger.log(`Marks spreadsheet unavailable: ${err.message}`); }
    }
    const spreadsheet = spreadsheets.get(id);
    if (!spreadsheet) return;
    reviews.forEach(review => {
      if (review.key==='review1') return;
      try {
        const cacheKey = JSON.stringify([id, committeeReviewTabName_(committee, review)]);
        if (!reviewIndexes.has(cacheKey)) {
          const rows = measure('review_detail_read', () => readReviewRows_(spreadsheet, committee, review, measure));
          reviewIndexes.set(cacheKey, rows === null ? null : indexReviewRows_(rows));
        }
        const index = reviewIndexes.get(cacheKey);
        if (index === null) return;
        measure('review_detail_evaluate', () => {
        teams.forEach((registers, teamId) => {
          result[teamId][review.key] = {...summarizeReviewCompletion_(registers, index.get(teamId), review.rubric), available:true};
        });
        });
      } catch (err) {
        // A failed review must not prevent independent reviews from loading.
        Logger.log(`Review completion error — Committee ${committee}, ${review.key}: ${err.message}`);
      }
    });
  });
  return result;
}

// ===================================================================
// INTERNAL HELPERS — REVIEW COMPLETION
// ===================================================================

/**
 * Extract actual registered students from one TeamStatus row.
 * Empty student slots are ignored.
 */
function getStudentsFromTeamStatusRow_(row, TS) {
  return [
    {
      name: row[TS.S1_NAME],
      regNo: row[TS.S1_REGNO],
      email: row[TS.S1_EMAIL]
    },
    {
      name: row[TS.S2_NAME],
      regNo: row[TS.S2_REGNO],
      email: row[TS.S2_EMAIL]
    },
    {
      name: row[TS.S3_NAME],
      regNo: row[TS.S3_REGNO],
      email: row[TS.S3_EMAIL]
    },
    {
      name: row[TS.S4_NAME],
      regNo: row[TS.S4_REGNO],
      email: row[TS.S4_EMAIL]
    }
  ].filter(student => normalizeReviewKey_(student.regNo));
}


/**
 * Checks whether a rubric mark has actually been entered.
 *
 * IMPORTANT:
 * 0 is valid.
 * "0" is valid.
 * Blank is not valid.
 */
function isReviewMarkEntered_(value) {
  if (typeof value !== 'number' && typeof value !== 'string') return false;
  if (typeof value === 'string' && !/^[0-5]$/.test(value.trim())) return false;
  const level = Number(value);
  return Number.isInteger(level) && level >= 0 && level <= 5;
}


/**
 * Normalizes Team IDs, Committee Numbers and Register Numbers
 * so numeric/string differences do not cause false mismatches.
 */
function normalizeReviewKey_(value) {
  if (
    value === null ||
    value === undefined ||
    value === ''
  ) {
    return '';
  }

  return normalizeText_(value);
}
// ===================================================================
// RETRIEVE STUDENT MARKS
// Returns one student's rubric-based marks for each configured review
// ===================================================================
function getStudentAllReviewMarks(email) {
  const TS = getColumnMap(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
  const RC = getColumnMap(SHEET_NAMES.REVIEW_COMMITTEE, FIELD_DEFINITIONS.REVIEW_COMMITTEE);

  // Resolve the student's TeamStatus row only once.
  const teamId = getStudentTeamId(email);
  if (!teamId) return Object.fromEntries(getInternalReviews_().map(review => [review.key, null]));

  const statusRows = getSheetRows(SHEET_NAMES.TEAM_STATUS);
  const teamStatusRow = statusRows.find(
    r => normalizeReviewKey_(r[TS.TEAM_ID]) === normalizeReviewKey_(teamId)
  );
  if (!teamStatusRow) return Object.fromEntries(getInternalReviews_().map(review => [review.key, null]));

  const students = [
    { name: teamStatusRow[TS.S1_NAME], regNo: teamStatusRow[TS.S1_REGNO], email: teamStatusRow[TS.S1_EMAIL] },
    { name: teamStatusRow[TS.S2_NAME], regNo: teamStatusRow[TS.S2_REGNO], email: teamStatusRow[TS.S2_EMAIL] },
    { name: teamStatusRow[TS.S3_NAME], regNo: teamStatusRow[TS.S3_REGNO], email: teamStatusRow[TS.S3_EMAIL] },
    { name: teamStatusRow[TS.S4_NAME], regNo: teamStatusRow[TS.S4_REGNO], email: teamStatusRow[TS.S4_EMAIL] }
  ].filter(s => s.regNo);

  const student = students.find(s => s.email && emailsMatch(s.email, email));
  if (!student) return Object.fromEntries(getInternalReviews_().map(review => [review.key, null]));

  const committeeNumber = teamStatusRow[TS.COMMITTEE_NUMBER];
  if (!committeeNumber) return Object.fromEntries(getInternalReviews_().map(review => [review.key, null]));

  const committeeRows = getSheetRows(SHEET_NAMES.REVIEW_COMMITTEE);
  const committeeRow = committeeRows.find(
    r => normalizeReviewKey_(r[RC.COMMITTEE_NUMBER]) === normalizeReviewKey_(committeeNumber)
  );
  if (!committeeRow) return Object.fromEntries(getInternalReviews_().map(review => [review.key, null]));

  const marksSheetId = committeeRow[RC.MARKS_SHEET_ID];
  if (!marksSheetId) return Object.fromEntries(getInternalReviews_().map(review => [review.key, null]));
  const reviews = getReviewDefinitions_();

  try {
    // This is the expensive cross-spreadsheet operation. Do it ONCE.
    const marksSpreadsheet = SpreadsheetApp.openById(marksSheetId);

    function readReview_(review) {
      if (!review || review.key==='review1') return null; // Published Review 1 results use the authenticated history endpoint.
      const rows = readReviewRows_(marksSpreadsheet, normalizeReviewKey_(committeeNumber), review);
      if (!rows) return null;
      const teamRows = indexReviewRows_(rows).get(normalizeReviewKey_(teamId));
      const studentRow = teamRows && teamRows.get(normalizeReviewKey_(student.regNo));
      if (!studentRow) return null;
      const rubric = review.rubric;
      const maxMarks = rubric.reduce((sum, pi) => sum + Number(pi.maxMarks || 0), 0);
      const totalMarks = studentRow[5];
      const piScores = {};

      rubric.forEach((pi, idx) => {
        const rawLevel = studentRow[REVIEW_MARK_COLUMNS_.criteria + idx];
        const entered = isReviewMarkEntered_(rawLevel);
        const level = entered ? Number(rawLevel) : '';
        piScores[pi.pi] = {
          level: level,
          maxMarks: pi.maxMarks,
          co: pi.co,
          name: pi.name,
          type: pi.type,
          earnedMarks: entered ? Math.round((level / 5) * pi.maxMarks) : 0
        };
      });

      const completed = isReviewRowComplete_(studentRow, rubric);

      return {
        studentName: studentRow[3],
        regNo: studentRow[2],
        teamId: studentRow[1],
        committeeNumber: committeeNumber,
        milestoneId: review.key,
        completed: completed,
        totalMarks: (typeof totalMarks === 'number' || (typeof totalMarks === 'string' && totalMarks.trim() !== '')) && Number.isFinite(Number(totalMarks)) ? Number(totalMarks) : 0,
        maxMarks: maxMarks,
        comments: String(studentRow[REVIEW_MARK_COLUMNS_.comments] || ''),
        piScores: piScores,
        rubricStructure: rubric
      };
    }

    const result = {};
    reviews.forEach(review => {
      try { result[review.key] = readReview_(review); }
      catch (err) {
        Logger.log(`Student marks unavailable — ${review.key}: ${err.message}`);
        result[review.key] = null;
      }
    });
    return result;
  } catch (err) {
    Logger.log(`Error fetching combined marks for ${email}: ${err.message}`);
    return Object.fromEntries(getInternalReviews_().map(review => [review.key, null]));
  }
}

// ===================================================================
// TRIGGER SETUP
// ===================================================================
function setupMarksTriggers() {
  ScriptApp.newTrigger('seedCommitteeMarksSheets').timeBased().onWeekDay(ScriptApp.WeekDay.SUNDAY).atHour(23).create();
}