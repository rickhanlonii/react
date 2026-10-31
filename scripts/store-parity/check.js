/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use strict';

/* eslint-disable no-for-of-loops/no-for-of-loops */

// Checks that every test file that uses state has a copy that uses
// `use(store)` instead, and that the copy has every test case of the original.
//
// Usage:
//   node scripts/store-parity/check.js            Summary of every file
//   node scripts/store-parity/check.js --missing  Only files that aren't done
//   node scripts/store-parity/check.js <path>     Details for one original
//   node scripts/store-parity/check.js --context  Context copies (context.js)
//
// Test cases that can't be translated must be listed in a file in skips/ with
// a reason. Cases are matched by title. Test files that aren't originals, like
// the spec suites of store features, are listed under "excludedFiles".

const fs = require('fs');
const path = require('path');
const {execSync} = require('child_process');

const ROOT = path.resolve(__dirname, '../..');
// Each shard of work keeps its own skips file to avoid conflicts.
const SKIPS_DIR = path.join(__dirname, 'skips');

const STATE_PATTERN = /\b(useState|useReducer|this\.setState)\b/;
// Same as the jest testRegex: direct children of a __tests__ directory.
const TEST_FILE_PATTERN = /\/__tests__\/[^/]+\.(js|ts|tsx)$/;
const TEST_CASE_START_PATTERN =
  /^[ \t]*(?:it|test|fit|xit|itRenders|itThrowsWhenRendering|itClientRenders|itRendersWithoutServerRendering)(?:\.(?:only|skip|each|concurrent|failing|todo))*\s*\(/gm;

// Reads a title made of one or more string literals joined with +, starting at
// the given index. Returns null if the title isn't a static string.
function readTitle(source, start) {
  let index = start;
  let title = '';
  let sawLiteral = false;
  while (true) {
    while (/\s/.test(source[index])) {
      index++;
    }
    const quote = source[index];
    if (quote !== "'" && quote !== '"' && quote !== '`') {
      break;
    }
    index++;
    let literal = '';
    while (index < source.length && source[index] !== quote) {
      if (source[index] === '\\') {
        literal += source[index] + source[index + 1];
        index += 2;
      } else {
        literal += source[index];
        index++;
      }
    }
    if (quote === '`' && literal.includes('${')) {
      return null;
    }
    title += literal;
    sawLiteral = true;
    index++;
    while (/\s/.test(source[index])) {
      index++;
    }
    if (source[index] === '+') {
      index++;
      continue;
    }
    break;
  }
  return sawLiteral && source[index] === ',' ? title : null;
}

function isCopy(file) {
  return /UseStore/.test(path.basename(file));
}

function getCopyPath(file) {
  const dir = path.dirname(file);
  const base = path.basename(file);
  const testIndex = base.indexOf('-test');
  if (testIndex !== -1) {
    return path.join(
      dir,
      base.slice(0, testIndex) + 'UseStore' + base.slice(testIndex)
    );
  }
  const ext = path.extname(base);
  return path.join(dir, base.slice(0, -ext.length) + 'UseStore' + ext);
}

function listFiles() {
  const output = execSync(
    'git ls-files --cached --others --exclude-standard packages',
    {cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024}
  );
  return output
    .split('\n')
    .filter(file => file !== '' && TEST_FILE_PATTERN.test(file))
    .filter(file => fs.existsSync(path.join(ROOT, file)));
}

function getStateFiles(excludedFiles) {
  return listFiles().filter(file => {
    if (isCopy(file) || file in excludedFiles) {
      return false;
    }
    const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
    return STATE_PATTERN.test(source);
  });
}

function getTestCases(file) {
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const titles = [];
  let dynamic = 0;
  TEST_CASE_START_PATTERN.lastIndex = 0;
  let match;
  while ((match = TEST_CASE_START_PATTERN.exec(source)) !== null) {
    const title = readTitle(source, match.index + match[0].length);
    if (title !== null) {
      titles.push(title);
    } else {
      dynamic++;
    }
  }
  return {titles, dynamic};
}

function readSkips() {
  const skips = {};
  skips.excludedFiles = {};
  if (!fs.existsSync(SKIPS_DIR)) {
    return skips;
  }
  for (const name of fs.readdirSync(SKIPS_DIR)) {
    // context-*.json are the skips of the context copies (context.js).
    if (!name.endsWith('.json') || name.startsWith('context-')) {
      continue;
    }
    const entries = JSON.parse(
      fs.readFileSync(path.join(SKIPS_DIR, name), 'utf8')
    );
    for (const file of Object.keys(entries)) {
      skips[file] = Object.assign(skips[file] || {}, entries[file]);
    }
  }
  return skips;
}

function checkFile(file, skips) {
  const copy = getCopyPath(file);
  const original = getTestCases(file);
  const fileSkips = skips[file] || {};
  const result = {
    file,
    copy,
    total: original.titles.length + original.dynamic,
    copied: 0,
    skipped: 0,
    missing: [],
    exists: fs.existsSync(path.join(ROOT, copy)),
  };
  if (!result.exists) {
    for (const title of original.titles) {
      if (fileSkips[title] !== undefined) {
        result.skipped++;
      } else {
        result.missing.push(title);
      }
    }
    if (original.dynamic > 0) {
      result.missing.push(`<${original.dynamic} dynamically named cases>`);
    }
    return result;
  }
  const copied = getTestCases(copy);
  const remaining = new Map();
  for (const title of copied.titles) {
    remaining.set(title, (remaining.get(title) || 0) + 1);
  }
  for (const title of original.titles) {
    const count = remaining.get(title) || 0;
    if (count > 0) {
      remaining.set(title, count - 1);
      result.copied++;
    } else if (fileSkips[title] !== undefined) {
      result.skipped++;
    } else {
      result.missing.push(title);
    }
  }
  if (copied.dynamic >= original.dynamic) {
    result.copied += original.dynamic;
  } else {
    result.copied += copied.dynamic;
    result.missing.push(
      `<${original.dynamic - copied.dynamic} dynamically named cases>`
    );
  }
  return result;
}

function validateSkips(skips) {
  const problems = [];
  for (const file of Object.keys(skips)) {
    for (const title of Object.keys(skips[file])) {
      const entry = skips[file][title];
      // Entries of excludedFiles are keyed by file instead of by title.
      if (
        entry === null ||
        typeof entry !== 'object' ||
        typeof entry.reason !== 'string' ||
        typeof entry.note !== 'string' ||
        entry.note === ''
      ) {
        problems.push(`${file}: "${title}" needs a reason and a note`);
      }
    }
  }
  return problems;
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--context')) {
    require('./context').main(args);
    return;
  }
  const skips = readSkips();
  const stateFiles = getStateFiles(skips.excludedFiles);
  const results = stateFiles.map(file => checkFile(file, skips));

  const single = args.find(arg => !arg.startsWith('--'));
  if (single !== undefined) {
    const file = path.relative(ROOT, path.resolve(single));
    const result = results.find(r => r.file === file);
    if (result === undefined) {
      console.log(`${file} is not a test file that uses state.`);
      process.exit(1);
    }
    console.log(`${result.file} -> ${result.copy}`);
    console.log(
      `  ${result.copied} copied, ${result.skipped} skipped, ` +
        `${result.missing.length} missing (of ${result.total})`
    );
    for (const title of result.missing) {
      console.log(`  missing: ${title}`);
    }
    process.exit(result.missing.length === 0 && result.exists ? 0 : 1);
  }

  const onlyMissing = args.includes('--missing');
  let doneFiles = 0;
  let totalCases = 0;
  let copiedCases = 0;
  let skippedCases = 0;
  for (const result of results) {
    totalCases += result.total;
    copiedCases += result.copied;
    skippedCases += result.skipped;
    const done = result.exists && result.missing.length === 0;
    if (done) {
      doneFiles++;
    }
    if (!onlyMissing || !done) {
      const status = done ? 'done' : result.exists ? 'partial' : 'todo';
      console.log(
        `${status.padEnd(8)} ${String(result.copied).padStart(4)}/${String(
          result.total
        ).padEnd(4)} ${result.file}`
      );
    }
  }
  const problems = validateSkips(skips);
  for (const problem of problems) {
    console.log(`invalid skip: ${problem}`);
  }
  console.log('');
  console.log(
    `${doneFiles}/${results.length} files done. ` +
      `${copiedCases} cases copied, ${skippedCases} skipped, ` +
      `${totalCases - copiedCases - skippedCases} missing (of ${totalCases}).`
  );
  process.exit(doneFiles === results.length && problems.length === 0 ? 0 : 1);
}

main();
