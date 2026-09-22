const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '..', 'sheet-reads.js'), 'utf8');

// Load the production reader into isolated Apps Script test contexts.
function createSheetReadContext(globals) {
  const context = vm.createContext(globals);
  vm.runInContext(source, context);
  return context;
}
module.exports = { createSheetReadContext };
