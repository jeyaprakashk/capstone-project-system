/**
 * DOCUMENT SHEETS - shared reading and appending for the three template-document sheets (TemplateFiles, TeamFileStatus,
 * DocumentSubmissions). Specified in TEMPLATE-DOCUMENT-SUBMISSION-PLAN.md, section 3. Every column is found by header name, so column
 * order and extra columns do not matter; a missing or repeated required header throws. The sheets are created only by the editor-run
 * setupDocumentStorage (ensureSheet_); nothing here creates or repairs a header.
 */

/** The sheet and its column map for one of the three sheets, or an error naming the sheet and the header. */
function documentSheetStorage_(sheetKey, fields) {
  const name = sheetSpec_(sheetKey).name;
  const sheet = getSheet_(name);
  if (!sheet) throw new Error(name + ' does not exist. Run setupDocumentStorage in the editor.');
  const headers = (readSheetRows_(sheet, 1, 1)[0] || []).map(cell => String(cell === null || cell === undefined ? '' : cell).trim());
  Object.values(fields).forEach(header => {
    if (headers.filter(cell => textEquals_(cell, header)).length !== 1) throw new Error(name + ' requires exactly one ' + header + ' column.');
  });
  return {name, sheet, columns: buildColumnMap_(sheet, fields, headers)};
}

/** Every non-blank row as {rowNumber, row, record}; record maps the field keys to trimmed text. */
function documentSheetRecords_(storage) {
  const keys = Object.keys(storage.columns);
  return readSheetRows_(storage.sheet, 2)
    .map((row, index) => ({rowNumber: index + 2, row}))
    .filter(item => item.row.some(cell => cell !== ''))
    .map(item => ({
      rowNumber: item.rowNumber, row: item.row,
      record: Object.fromEntries(keys.map(key => {
        const cell = item.row[storage.columns[key]];
        return [key, cell === null || cell === undefined ? '' : String(cell).trim()];
      }))
    }));
}

/** Appends one record as a new last row, written over its mapped columns only. Returns the row number. */
function documentSheetAppend_(storage, record) {
  const sheet = storage.sheet, target = sheet.getLastRow() + 1;
  if (target > sheet.getMaxRows()) sheet.insertRowsAfter(sheet.getMaxRows(), target - sheet.getMaxRows());
  writeRecordSpan_(sheet, target, storage.columns, record, null);
  return target;
}

/** Cosmetic, run once when a document sheet is created: plain text everywhere (so Sheets never converts an ID or a date) and a frozen header row. */
function formatDocumentSheet_(sheet) {
  sheet.getRange(1, 1, sheet.getMaxRows(), sheet.getLastColumn()).setNumberFormat('@');
  sheet.setFrozenRows(1);
}
