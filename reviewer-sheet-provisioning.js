/**
 * Run from the Apps Script editor as the web-app deployer after adding Drive access.
 * Prompts for inferred OAuth scopes without creating or sharing any files.
 * The trailing underscore prevents calls through google.script.run.
 */
function authorizeReviewerSpreadsheetAccess_() {
  ScriptApp.requireScopes(ScriptApp.AuthMode.FULL, ['https://www.googleapis.com/auth/drive']);
  DriveApp.getFileById(SHEET_ID).getName();
  Logger.log('Full Drive access authorized for ' + Session.getEffectiveUser().getEmail() +
    '. Update the web-app deployment using this same account, then retry setup.');
}

/** Creates at most one committee spreadsheet per call to bound execution time. */
function createNextReviewerSpreadsheet(attempted) {
  const email = Session.getActiveUser().getEmail();
  const coordinator = getCoordinatorEmail();
  const pd = getConfig('CELL_PD_EMAIL');
  if (!email || (!emailsMatch(email, coordinator) && !emailsMatch(email, pd))) throw new Error('Coordinator access is required.');
  const visited = new Set(Array.isArray(attempted) ? attempted.map(normalizeText_) : []);
  const lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) throw new Error('Another setup is running. Try again shortly.');
  try {
    const validation = checkReviewConfiguration_();
    if (!validation.valid) throw new Error('Review configuration needs attention: ' + validation.issues.map(issue => issue.message).join(' '));
    const RC = getColumnMap(SHEET_NAMES.REVIEW_COMMITTEE, FIELD_DEFINITIONS.REVIEW_COMMITTEE);
    const TS = getColumnMap(SHEET_NAMES.TEAM_STATUS, FIELD_DEFINITIONS.TEAM_STATUS);
    const committeeSheet = getSheet(SHEET_NAMES.REVIEW_COMMITTEE);
    const rows = getSheetRows(SHEET_NAMES.REVIEW_COMMITTEE);
    const index = rows.findIndex(row => normalizeText_(row[RC.COMMITTEE_NUMBER]) &&
      !String(row[RC.MARKS_SHEET_ID] || '').trim() && !visited.has(normalizeText_(row[RC.COMMITTEE_NUMBER])));
    if (index < 0) return { done:true };
    const row = rows[index];
    const committee = String(row[RC.COMMITTEE_NUMBER]).trim();
    const key = normalizeText_(committee);
    let spreadsheetId = '';
    try {
      if (rows.filter(item => textEquals_(item[RC.COMMITTEE_NUMBER], committee)).length !== 1) throw new Error('Duplicate Review Committee Number. Resolve duplicate rows first.');
      const reviewers = [...new Set([1,2,3,4].map(i => normalizeEmail(row[RC['REVIEWER' + i + '_EMAIL']])).filter(Boolean))];
      if (!reviewers.length) throw new Error('No reviewer email addresses are configured.');
      if (reviewers.some(value => !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value))) throw new Error('One or more reviewer email addresses are invalid.');
      const students = getSheetRows(SHEET_NAMES.TEAM_STATUS)
        .filter(team => textEquals_(team[TS.COMMITTEE_NUMBER], committee) && normalizeText_(team[TS.TEAM_ID]))
        .flatMap(team => getStudentsFromTeamStatusRow_(team, TS).map(student => ({...student,teamId:team[TS.TEAM_ID]})));
      if (!students.length) throw new Error('No registered students are assigned to this committee.');
      const identities = new Set();
      students.forEach(student => {
        const id = JSON.stringify([normalizeText_(student.teamId), normalizeText_(student.regNo)]);
        if (identities.has(id)) throw new Error('Duplicate student registration within a team.');
        identities.add(id);
      });
      const reviews = getReviewDefinitions_(); // Validate before creating any file.
      const properties = PropertiesService.getScriptProperties();
      const jobKey = 'marks-setup:' + SHEET_ID + ':' + key;
      const saved = properties.getProperty(jobKey);
      let job = saved ? JSON.parse(saved) : null;
      let spreadsheet;
      if (job) {
        spreadsheetId = job.id;
        spreadsheet = SpreadsheetApp.openById(spreadsheetId);
      } else {
        // Bound scripts use the main spreadsheet's folder as their destination.
        const source = Drive.Files.get(SHEET_ID, {fields:'parents', supportsAllDrives:true});
        if (!source.parents || source.parents.length !== 1) {
          throw new Error('Cannot determine the main spreadsheet folder. Check the deployer’s folder access.');
        }
        const created = Drive.Files.create({
          name:'Capstone — Committee ' + committee + ' — Review Marks',
          mimeType:'application/vnd.google-apps.spreadsheet',
          parents:[source.parents[0]]
        }, null, {fields:'id', supportsAllDrives:true});
        spreadsheetId = created.id;
        job = {id:spreadsheetId,prepared:false};
        // Retain the ID before building/sharing, so failures can be resumed.
        properties.setProperty(jobKey, JSON.stringify(job));
        spreadsheet = SpreadsheetApp.openById(spreadsheetId);
      }
      if (!job.prepared) {
        // Only unpublished setup files are rebuilt. Never clear an existing linked assessment.
        reviews.forEach(review => {
          const name = committeeReviewTabName_(committee, review);
          const existing = getNamedSheet_(spreadsheet, name);
          if (existing) {
            existing.setName('_incomplete_' + review.key + '_' + Date.now());
            seedCommitteeReviewTab(spreadsheet, committee, review.key, students, {created:[]}, []);
            spreadsheet.deleteSheet(existing);
          } else seedCommitteeReviewTab(spreadsheet, committee, review.key, students, {created:[]}, []);
          protectCommitteeMarksTab_(getNamedSheet_(spreadsheet, name), students.length, review.rubric.length, reviewers);
        });
        const names = new Set(reviews.map(review => committeeReviewTabName_(committee, review)));
        spreadsheet.getSheets().forEach(sheet => {
          if (!names.has(sheet.getName())) spreadsheet.deleteSheet(sheet);
        });
        SpreadsheetApp.flush();
        job.prepared = true;
        job.reviewers = reviewers;
        properties.setProperty(jobKey, JSON.stringify(job));
      }
      if (JSON.stringify([...job.reviewers].sort()) !== JSON.stringify([...reviewers].sort())) {
        throw new Error('Reviewer membership changed during setup. Restore the original membership or finish permissions manually for the saved file.');
      }
      const file = Drive.Files.get(spreadsheetId, {fields:'driveId', supportsAllDrives:true});
      // Shared Drives control resharing through drive policy, not this My Drive flag.
      if (!file.driveId) DriveApp.getFileById(spreadsheetId).setShareableByEditors(false);
      // Sequential permission writes; suppress Google's sharing invitation emails.
      reviewers.forEach(emailAddress => Drive.Permissions.create(
        {type:'user', role:'writer', emailAddress},
        spreadsheetId,
        {sendNotificationEmail:false, supportsAllDrives:true, fields:'id'}
      ));
      const cell = committeeSheet.getRange(index + 2, RC.MARKS_SHEET_ID + 1);
      // Recheck the row immediately before writing; sheet editors do not honor script locks.
      if (!textEquals_(committeeSheet.getRange(index + 2, RC.COMMITTEE_NUMBER + 1).getValue(), committee)) throw new Error('Committee row changed during setup. Retry.');
      const current = String(cell.getValue() || '').trim();
      if (current && current !== spreadsheetId) throw new Error('A different marks spreadsheet was linked during setup. Existing ID retained.');
      cell.setValue(spreadsheetId);
      SpreadsheetApp.flush();
      properties.deleteProperty(jobKey);
      return { done:false,committee,key,ok:true,id:spreadsheetId,url:spreadsheet.getUrl() };
    } catch (err) {
      const message = String(err.message || err);
      console.error('Reviewer spreadsheet setup failed for committee ' + committee +
        '; executing as ' + Session.getEffectiveUser().getEmail() + ': ' + message);
      const error = /permission to call DriveApp|Required permissions:.*auth\/drive/i.test(message)
        ? 'Drive authorization is missing for the web-app execution account. Run authorizeReviewerSpreadsheetAccess_ as the account that deployed this web app, approve full Drive access, and update this deployment to a new version. See execution logs for the account and original error. Any saved spreadsheet will be reused.'
        : message;
      return {done:false,committee,key,ok:false,id:spreadsheetId,error};
    }
  } finally { lock.releaseLock(); }
}

function restrictMarksProtection_(protection, editors) {
  protection.setWarningOnly(false);
  const owner = Session.getEffectiveUser();
  protection.addEditor(owner);
  const allowed = new Set([normalizeEmail(owner.getEmail()), ...editors.map(normalizeEmail)]);
  const unwanted = protection.getEditors().filter(user => !allowed.has(normalizeEmail(user.getEmail())));
  if (unwanted.length) protection.removeEditors(unwanted);
  if (editors.length) protection.addEditors(editors);
  if (protection.canDomainEdit()) protection.setDomainEdit(false);
}

function protectCommitteeMarksTab_(sheet, studentCount, criterionCount, reviewers) {
  const editable = sheet.getRange(2, 7, studentCount, criterionCount + 1);
  const sheetProtection = sheet.protect().setDescription('Capstone: identity, headers and formulas');
  sheetProtection.setUnprotectedRanges([editable]);
  restrictMarksProtection_(sheetProtection, []);
  // Restrict the input area too, so unrelated future file editors cannot enter marks.
  const inputProtection = editable.protect().setDescription('Capstone: committee assessment inputs');
  restrictMarksProtection_(inputProtection, reviewers);
}
