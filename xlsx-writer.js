/**
 * XLSX WRITER — browser module serialized into the coordinator page as `XlsxWriter`.
 * Builds a one-sheet Excel workbook (.xlsx) from rows of text and numbers, with no library: an .xlsx is a zip of a few XML parts, written
 * here uncompressed ("stored"). The first row is the header (bold, frozen). It returns bytes and starts a download; it never calls the server.
 */
function xlsxWriterBrowser_() {
  'use strict';
  const utf8 = text => new TextEncoder().encode(text);
  const TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';
  const NS = 'http://schemas.openxmlformats.org/spreadsheetml/2006/main';
  const REL_NS = 'http://schemas.openxmlformats.org/officeDocument/2006/relationships';
  const PACKAGE_REL_NS = 'http://schemas.openxmlformats.org/package/2006/relationships';
  const HEAD = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n';

  const CRC_TABLE = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; table[n] = c >>> 0; }
    return table;
  })();
  const crc32 = bytes => { let c = 0xFFFFFFFF; for (let i = 0; i < bytes.length; i++) c = CRC_TABLE[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const DOS_DATE = 0x21; // 1980-01-01, the zip epoch

  /** A zip of `files` [{name, data:Uint8Array}], each stored without compression. */
  function zip(files) {
    const parts = [], central = [];
    let offset = 0;
    files.forEach(file => {
      const name = utf8(file.name), size = file.data.length, crc = crc32(file.data);
      const local = new Uint8Array(30 + name.length), lv = new DataView(local.buffer);
      lv.setUint32(0, 0x04034b50, true); lv.setUint16(4, 20, true); lv.setUint16(6, 0x0800, true); lv.setUint16(8, 0, true); lv.setUint16(10, 0, true); lv.setUint16(12, DOS_DATE, true);
      lv.setUint32(14, crc, true); lv.setUint32(18, size, true); lv.setUint32(22, size, true); lv.setUint16(26, name.length, true); lv.setUint16(28, 0, true);
      local.set(name, 30);
      const entry = new Uint8Array(46 + name.length), ev = new DataView(entry.buffer);
      ev.setUint32(0, 0x02014b50, true); ev.setUint16(4, 20, true); ev.setUint16(6, 20, true); ev.setUint16(8, 0x0800, true); ev.setUint16(10, 0, true); ev.setUint16(12, 0, true); ev.setUint16(14, DOS_DATE, true);
      ev.setUint32(16, crc, true); ev.setUint32(20, size, true); ev.setUint32(24, size, true); ev.setUint16(28, name.length, true); ev.setUint32(42, offset, true);
      entry.set(name, 46);
      parts.push(local, file.data); central.push(entry);
      offset += local.length + size;
    });
    const centralSize = central.reduce((total, entry) => total + entry.length, 0);
    const end = new Uint8Array(22), nv = new DataView(end.buffer);
    nv.setUint32(0, 0x06054b50, true); nv.setUint16(8, files.length, true); nv.setUint16(10, files.length, true); nv.setUint32(12, centralSize, true); nv.setUint32(16, offset, true);
    const all = parts.concat(central, [end]), out = new Uint8Array(all.reduce((total, chunk) => total + chunk.length, 0));
    let at = 0;
    all.forEach(chunk => { out.set(chunk, at); at += chunk.length; });
    return out;
  }

  // XML 1.0 cannot carry most control characters; they are dropped.
  const escapeXml = value => String(value ?? '').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/[&<>"']/g, c => ({'&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&apos;'}[c]));
  const columnName = index => { let name = '', n = index + 1; while (n > 0) { const rem = (n - 1) % 26; name = String.fromCharCode(65 + rem) + name; n = Math.floor((n - 1) / 26); } return name; };
  const cell = (value, ref, style) => typeof value === 'number' && Number.isFinite(value)
    ? '<c r="' + ref + '"' + (style ? ' s="' + style + '"' : '') + '><v>' + value + '</v></c>'
    : '<c r="' + ref + '" t="inlineStr"' + (style ? ' s="' + style + '"' : '') + '><is><t xml:space="preserve">' + escapeXml(value) + '</t></is></c>';

  function sheetXml(rows, widths, wrap) {
    return HEAD + '<worksheet xmlns="' + NS + '"><sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' +
      '<cols>' + widths.map((width, i) => '<col min="' + (i + 1) + '" max="' + (i + 1) + '" width="' + width + '" customWidth="1"/>').join('') + '</cols>' +
      '<sheetData>' + rows.map((row, r) => '<row r="' + (r + 1) + '">' + row.map((value, c) => cell(value, columnName(c) + (r + 1), r === 0 ? 1 : wrap.indexOf(c) >= 0 ? 2 : 0)).join('') + '</row>').join('') + '</sheetData></worksheet>';
  }
  const STYLES = HEAD + '<styleSheet xmlns="' + NS + '"><fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>' +
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills><borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs><cellXfs count="3"><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/><xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/><xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf></cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>';
  const sheetName = name => String(name || 'Sheet1').replace(/[\[\]:*?\/\\]/g, ' ').trim().slice(0, 31) || 'Sheet1';

  /**
   * The workbook bytes. `sheets` is an array of {name, rows, widths?, wrap?} (`wrap`: column indexes whose cells wrap their text): rows are arrays (numbers stay numbers, everything else is text), the
   * first row of each sheet is its header. `build(name, rows)` is the one-sheet form.
   */
  function buildBook(sheets) {
    const part = (extension, type) => '<Override PartName="/xl/' + extension + '" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.' + type + '+xml"/>';
    const files = [
      {name:'[Content_Types].xml', text:HEAD + '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/>' +
        part('workbook.xml', 'sheet.main') + sheets.map((sheet, i) => part('worksheets/sheet' + (i + 1) + '.xml', 'worksheet')).join('') + part('styles.xml', 'styles') + '</Types>'},
      {name:'_rels/.rels', text:HEAD + '<Relationships xmlns="' + PACKAGE_REL_NS + '"><Relationship Id="rId1" Type="' + REL_NS + '/officeDocument" Target="xl/workbook.xml"/></Relationships>'},
      {name:'xl/workbook.xml', text:HEAD + '<workbook xmlns="' + NS + '" xmlns:r="' + REL_NS + '"><bookViews><workbookView/></bookViews><sheets>' +
        sheets.map((sheet, i) => '<sheet name="' + escapeXml(sheetName(sheet.name)) + '" sheetId="' + (i + 1) + '" r:id="rId' + (i + 1) + '"/>').join('') + '</sheets></workbook>'},
      {name:'xl/_rels/workbook.xml.rels', text:HEAD + '<Relationships xmlns="' + PACKAGE_REL_NS + '">' +
        sheets.map((sheet, i) => '<Relationship Id="rId' + (i + 1) + '" Type="' + REL_NS + '/worksheet" Target="worksheets/sheet' + (i + 1) + '.xml"/>').join('') +
        '<Relationship Id="rId' + (sheets.length + 1) + '" Type="' + REL_NS + '/styles" Target="styles.xml"/></Relationships>'},
      {name:'xl/styles.xml', text:STYLES},
      ...sheets.map((sheet, i) => ({name:'xl/worksheets/sheet' + (i + 1) + '.xml', text:sheetXml(sheet.rows, sheet.widths || [18, 34], sheet.wrap || [])}))
    ];
    return zip(files.map(file => ({name:file.name, data:utf8(file.text)})));
  }
  const build = (name, rows) => buildBook([{name, rows}]);

  /** Hands the bytes to the browser as a file download. */
  function download(fileName, bytes) {
    const url = URL.createObjectURL(new Blob([bytes], {type:TYPE}));
    const link = document.createElement('a');
    link.href = url; link.download = fileName;
    document.body.appendChild(link); link.click(); link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  return {build, buildBook, download, TYPE};
}
