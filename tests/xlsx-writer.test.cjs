// XLSX writer: a real, readable workbook with no library; and the Download results button that uses it.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const { loadSources } = require('./invariants/golden.cjs');

const writer = () => loadSources(['xlsx-writer.js'], { TextEncoder, Blob, URL, setTimeout }).xlsxWriterBrowser_();
/** Reads the stored zip back: [{name, text, crcOk}]. */
function unzip(bytes) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength), entries = [];
  const end = bytes.length - 22;
  assert.equal(view.getUint32(end, true), 0x06054b50, 'end of central directory');
  const count = view.getUint16(end + 10, true);
  let at = view.getUint32(end + 16, true);
  const crcOf = data => { let c = 0xFFFFFFFF; for (const b of data) { c ^= b; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; } return (c ^ 0xFFFFFFFF) >>> 0; };
  for (let i = 0; i < count; i++) {
    assert.equal(view.getUint32(at, true), 0x02014b50);
    const size = view.getUint32(at + 24, true), nameLength = view.getUint16(at + 28, true), local = view.getUint32(at + 42, true), crc = view.getUint32(at + 16, true);
    const name = Buffer.from(bytes.subarray(at + 46, at + 46 + nameLength)).toString('utf8');
    const dataAt = local + 30 + view.getUint16(local + 26, true) + view.getUint16(local + 28, true), data = bytes.subarray(dataAt, dataAt + size);
    entries.push({ name, text: Buffer.from(data).toString('utf8'), crcOk: crcOf(data) === crc });
    at += 46 + nameLength;
  }
  return entries;
}

test('builds a zip of the workbook parts with valid checksums and well-formed XML', () => {
  const { DOMParser } = require('linkedom');
  const entries = unzip(writer().build('Review 1', [['Register Number', 'Name', 'PI1'], ['9923005014', 'Asha <&> "Q"', 12.5], ['9923005015', 'Bala', 'A']]));
  assert.deepEqual(entries.map(e => e.name), ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/_rels/workbook.xml.rels', 'xl/styles.xml', 'xl/worksheets/sheet1.xml']);
  assert(entries.every(e => e.crcOk));
  for (const entry of entries) assert.equal(new DOMParser().parseFromString(entry.text, 'text/xml').querySelector('parsererror'), null, entry.name);
  const sheet = entries.find(e => e.name === 'xl/worksheets/sheet1.xml').text;
  assert.match(sheet, /<c r="C2"><v>12.5<\/v><\/c>/, 'numbers stay numbers');
  assert.match(sheet, /<c r="A2" t="inlineStr"><is><t xml:space="preserve">9923005014<\/t><\/is><\/c>/, 'register numbers stay text');
  assert.match(sheet, /Asha &lt;&amp;&gt; &quot;Q&quot;/, 'text is escaped');
  assert.match(sheet, /<pane ySplit="1"/, 'the header row is frozen');
});

test('sheet names lose the characters Excel forbids and stay within 31 characters', () => {
  const book = unzip(writer().build('Review 1 / [test]: ' + 'x'.repeat(40), [['a']])).find(e => e.name === 'xl/workbook.xml').text;
  const name = book.match(/<sheet name="([^"]*)"/)[1];
  assert.doesNotMatch(name, /[\[\]:*?\/\\]/); assert(name.length <= 31);
});

test('Download results reads the export, builds header, rows and total, and saves "<assessment> results.xlsx"', async () => {
  const c = vm.createContext({ Map, Set, window: { crypto }, document: { querySelector: () => null }, setTimeout, clearTimeout });
  for (const file of ['assessment-history-view.js', 'internal-assessment-publishing-client.js']) vm.runInContext(fs.readFileSync(file, 'utf8'), c);
  const data = { key: 'review1', label: 'Review 1', legend: [{ code: 'NS', meaning: 'Draft, not submitted.' }], criteria: [{ pi: 'PI1' }, { pi: 'PI2' }], rows: [
    { register: '9923005014', name: 'Asha', team: 'G1', scores: { PI1: 12.5, PI2: 10 }, total: 22.5, comments: 'PI1: Clear.\nPI2: Add detail.' },
    { register: '9923005015', name: 'Bala', team: 'G1', scores: { PI1: 'A', PI2: 'A' }, total: 'A' }] };
  const reads = [], saved = [], texts = [];
  const bridge = { read: (key, endpoint, args) => { reads.push([endpoint, args]); return Promise.resolve(data); } };
  const xlsx = { buildBook: sheets => ({ sheets }), download: (file, payload) => saved.push([file, payload]) };
  const status = { set innerHTML(value) { texts.push(value); }, className: '' };
  const card = { querySelector: () => status, querySelectorAll: () => [] };
  const api = c.internalAssessmentPublishingBrowser_(bridge, null, xlsx);
  await api.downloadResults('review1', card);
  assert.deepEqual(JSON.parse(JSON.stringify(reads)), [['API_publishing_export', ['review1']]]);
  assert.equal(saved[0][0], 'Review 1 results.xlsx');
  const [marks, key] = JSON.parse(JSON.stringify(saved[0][1].sheets));
  assert.equal(marks.name, 'Review 1'); assert.equal(key.name, 'Key');
  assert.deepEqual(marks.rows, [['Register Number', 'Name', 'Team ID', 'PI1', 'PI2', 'Total', 'Comments'], ['9923005014', 'Asha', 'G1', 12.5, 10, 22.5, 'PI1: Clear.\nPI2: Add detail.'], ['9923005015', 'Bala', 'G1', 'A', 'A', 'A', '']]);
  assert.deepEqual(key.rows, [['Code', 'Meaning'], ['NS', 'Draft, not submitted.']]);
  assert.match(texts.at(-1), /2 students saved/);
  const failing = { read: () => Promise.reject(new Error('Coordinator access is required.')) };
  const again = c.internalAssessmentPublishingBrowser_(failing, null, xlsx);
  await again.downloadResults('review1', card);
  assert.equal(saved.length, 1, 'nothing is saved when the read fails');
  assert.match(texts.at(-1), /Coordinator access is required/);
});

test('a workbook can hold several sheets, each with its own header and column widths', () => {
  const entries = unzip(writer().buildBook([{ name: 'Review 1', rows: [['a', 'b'], ['1', 2]] }, { name: 'Key', rows: [['Code', 'Meaning'], ['NS', 'Draft']], widths: [10, 90] }]));
  assert(entries.every(e => e.crcOk));
  const names = entries.map(e => e.name);
  assert(names.includes('xl/worksheets/sheet1.xml') && names.includes('xl/worksheets/sheet2.xml'));
  const book = entries.find(e => e.name === 'xl/workbook.xml').text;
  assert.match(book, /<sheet name="Review 1" sheetId="1" r:id="rId1"\/><sheet name="Key" sheetId="2" r:id="rId2"\/>/);
  assert.match(entries.find(e => e.name === 'xl/worksheets/sheet2.xml').text, /<col min="2" max="2" width="90"/);
  assert.match(entries.find(e => e.name === 'xl/_rels/workbook.xml.rels').text, /Id="rId3"[^>]*styles/);
});
