/**
 * DOCUMENT FILES - what is checked in a file before it is copied to Drive (archive/plans/TEMPLATE-DOCUMENT-SUBMISSION-PLAN.md, section 7). Pure apart
 * from Utilities.unzip. Every problem is a plain sentence for the student; the file is never changed.
 */
const DOCUMENT_MAX_BYTES_ = 10 * 1024 * 1024;
const DOCUMENT_MAX_ZIP_ENTRIES_ = 2000;
const DOCUMENT_MAX_UNPACKED_BYTES_ = 200 * 1024 * 1024;
const DOCUMENT_MIME_ = Object.freeze({
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  pptx: 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  pdf: 'application/pdf'
});
const DOCUMENT_MAIN_PART_ = Object.freeze({docx: 'word/document.xml', pptx: 'ppt/presentation.xml'});

function documentOfficeProblem_(bytes, extension) {
  let entries;
  try { entries = Utilities.unzip(Utilities.newBlob(bytes, 'application/zip', 'check.zip')); }
  catch (error) { return 'The file is not a valid ' + extension.toUpperCase() + ' document: it could not be opened.'; }
  if (!entries || !entries.length) return 'The file is not a valid ' + extension.toUpperCase() + ' document: it is empty inside.';
  if (entries.length > DOCUMENT_MAX_ZIP_ENTRIES_) return 'The file has too many parts to be a normal ' + extension.toUpperCase() + ' document.';
  const names = entries.map(entry => String(entry.getName()));
  const unpacked = entries.reduce((sum, entry) => sum + entry.getBytes().length, 0);
  if (unpacked > DOCUMENT_MAX_UNPACKED_BYTES_) return 'The file is too large once opened.';
  const typesAt = names.indexOf('[Content_Types].xml');
  if (typesAt < 0 || !names.includes(DOCUMENT_MAIN_PART_[extension])) return 'The file is not a ' + extension.toUpperCase() + ' document: its contents are of another kind.';
  if (/macroEnabled|vbaProject/i.test(entries[typesAt].getDataAsString()) || names.some(name => /vbaProject\.bin$/i.test(name))) return 'The file contains macros, which are not accepted.';
  return '';
}

function documentPdfProblem_(bytes) {
  const byte = index => bytes[index] & 255;
  if (bytes.length < 8 || [37, 80, 68, 70, 45].some((code, index) => byte(index) !== code)) return 'The file is not a valid PDF document.';
  const tail = Utilities.newBlob(bytes.slice(Math.max(0, bytes.length - 1024))).getDataAsString('ISO-8859-1');
  if (tail.indexOf('%%EOF') < 0) return 'The PDF is incomplete: it does not end properly.';
  if (Utilities.newBlob(bytes).getDataAsString('ISO-8859-1').indexOf('/Encrypt') >= 0) return 'The PDF is protected with a password, which is not accepted.';
  return '';
}

/** '' when the bytes are acceptable for a file with this extension, otherwise one sentence saying what is wrong. */
function documentFileProblem_(bytes, extension) {
  if (!DOCUMENT_MIME_[extension]) return 'This kind of file cannot be submitted.';
  if (!bytes || !bytes.length) return 'The file is empty.';
  if (bytes.length > DOCUMENT_MAX_BYTES_) return 'The file is larger than ' + Math.round(DOCUMENT_MAX_BYTES_ / 1048576) + ' MB.';
  return extension === 'pdf' ? documentPdfProblem_(bytes) : documentOfficeProblem_(bytes, extension);
}
