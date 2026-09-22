/**
 * Read complete records from column A through the sheet's last used column.
 * This includes every header and preserves absolute column-map indexes, even
 * when headers are reordered or have gaps. Extra populated columns are retained.
 * No cross-request cache: writers and authorization checks always see live data.
 * Omit rowCount to read through the last populated row; empty ranges return [].
 */
function readSheetRows_(sheet, firstRow, rowCount) {
  if (!sheet) throw new Error('Cannot read a missing sheet.');
  firstRow = firstRow === undefined ? 1 : firstRow;
  if (!Number.isInteger(firstRow) || firstRow < 1) throw new Error('Invalid first row.');
  if (rowCount === undefined) rowCount = Math.max(0, sheet.getLastRow() - firstRow + 1);
  if (!Number.isInteger(rowCount) || rowCount < 0) throw new Error('Invalid row count.');
  if (!rowCount) return [];
  const width = sheet.getLastColumn();
  if (!width) return [];
  return sheet.getRange(firstRow, 1, rowCount, width).getValues();
}
