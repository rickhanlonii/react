'use strict';

// Usage: node strip.js <test file>...
// Writes copies of the test files to stripped/ with the single-line
// assertions on store internals removed (expect(x._records...)...;), so the
// tests that are N/A only because of those assertions can be compared on
// behavior. Relative requires are rewritten to absolute paths.

const fs = require('fs');
const path = require('path');

const ASSERTION =
  /^\s*expect\(\w+(\[\w+\])?\._(records|head|headQueue|initial|reducer)\b.*\);\s*$/;
const outDir = path.join(__dirname, 'stripped');
fs.mkdirSync(outDir, {recursive: true});

for (const file of process.argv.slice(2)) {
  const abs = path.resolve(file);
  const src = fs.readFileSync(abs, 'utf8');
  let removed = 0;
  const out = src
    .split('\n')
    .filter(line => {
      if (ASSERTION.test(line)) {
        removed++;
        return false;
      }
      return true;
    })
    .join('\n')
    .replace(
      /require\('(\.\.?\/[^']*)'\)/g,
      (m, rel) => `require('${path.resolve(path.dirname(abs), rel)}')`
    );
  const dest = path.join(outDir, path.basename(abs));
  fs.writeFileSync(dest, out);
  console.log(`${dest}: removed ${removed} assertions`);
}
