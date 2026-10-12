// Test helpers for the document checks: a tiny ZIP writer (stored entries) and fakes of the Utilities calls the code uses on bytes.
const zlib = require('node:zlib');

const signed = buffer => Array.from(buffer, value => value > 127 ? value - 256 : value);
const unsigned = bytes => Buffer.from(bytes.map(value => value & 255));

/** A ZIP archive (no compression) with the given entries {name: string | Buffer}. */
function makeZip(entries) {
  const locals = [], centrals = [];
  let offset = 0;
  for (const [name, content] of Object.entries(entries)) {
    const nameBytes = Buffer.from(name, 'utf8'), data = Buffer.isBuffer(content) ? content : Buffer.from(String(content), 'utf8');
    const crc = zlib.crc32(data);
    const local = Buffer.alloc(30);
    local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt16LE(0, 6); local.writeUInt16LE(0, 8);
    local.writeUInt32LE(crc, 14); local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(nameBytes.length, 26);
    locals.push(local, nameBytes, data);
    const central = Buffer.alloc(46);
    central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6);
    central.writeUInt32LE(crc, 16); central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(nameBytes.length, 28);
    central.writeUInt32LE(offset, 42);
    centrals.push(central, nameBytes);
    offset += local.length + nameBytes.length + data.length;
  }
  const centralBuffer = Buffer.concat(centrals), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(Object.keys(entries).length, 8); end.writeUInt16LE(Object.keys(entries).length, 10);
  end.writeUInt32LE(centralBuffer.length, 12); end.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBuffer, end]);
}

/** The parts of a stored ZIP: [{name, data}]. Throws when the bytes are not a ZIP. */
function readZip(buffer) {
  const endAt = buffer.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  if (endAt < 0) throw new Error('Not a ZIP file');
  const count = buffer.readUInt16LE(endAt + 10), parts = [];
  let at = buffer.readUInt32LE(endAt + 16);
  for (let index = 0; index < count; index++) {
    if (buffer.readUInt32LE(at) !== 0x02014b50) throw new Error('Bad ZIP directory');
    const size = buffer.readUInt32LE(at + 24), nameLength = buffer.readUInt16LE(at + 28), localAt = buffer.readUInt32LE(at + 42);
    const name = buffer.toString('utf8', at + 46, at + 46 + nameLength);
    const dataAt = localAt + 30 + buffer.readUInt16LE(localAt + 26) + buffer.readUInt16LE(localAt + 28);
    parts.push({name, data: buffer.subarray(dataAt, dataAt + size)});
    at += 46 + nameLength;
  }
  return parts;
}

const blob = (bytes, name) => ({getBytes: () => bytes, getName: () => name || '', getDataAsString: charset => unsigned(bytes).toString(charset === 'ISO-8859-1' ? 'latin1' : 'utf8'), bytes});

/** The Utilities methods the document code uses on bytes. Merge into a context's Utilities. */
function byteUtilities(crypto) {
  return {
    DigestAlgorithm: {SHA_256: 'SHA_256'}, Charset: {UTF_8: 'UTF_8'},
    computeDigest: (algorithm, text) => signed(crypto.createHash('sha256').update(String(text), 'utf8').digest()),
    base64Decode: text => signed(Buffer.from(text, 'base64')),
    newBlob: (bytes, type, name) => blob(bytes, name),
    unzip: archive => readZip(unsigned(archive.bytes)).map(part => blob(signed(part.data), part.name))
  };
}

/** A minimal valid Office package of the given kind, optionally with extra parts or a macro content type. */
function office(kind, extra = {}) {
  const main = kind === 'docx' ? 'word/document.xml' : 'ppt/presentation.xml';
  return makeZip(Object.assign({'[Content_Types].xml': '<Types/>', [main]: '<doc/>'}, extra));
}

module.exports = {makeZip, readZip, signed, unsigned, byteUtilities, office};
