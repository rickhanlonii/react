/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use strict';

/* eslint-disable no-for-of-loops/no-for-of-loops */

// Checks that every test case that reads React context has a copy that uses
// `use(store)` instead of context, in a sibling `*UseStoreContext-test.*`
// file, or a skip entry with a reason.
//
// Usage:
//   node scripts/store-parity/check.js --context            Summary
//   node scripts/store-parity/check.js --context --missing  Unfinished files
//   node scripts/store-parity/check.js --context --list     Print every case
//   node scripts/store-parity/check.js --context --list --why  ...and why
//   node scripts/store-parity/check.js --context <path>     One original
//
// A case reads context when its source mentions a context API (createContext,
// useContext, .Consumer, .Provider, contextType, readContext, use(SomeContext))
// or a binding declared outside the case whose declaration does (a context
// object, a component that reads it, a helper that renders a Provider...).
// This is computed to a fixpoint over the declarations in the file.
//
// Cases are matched by their describe path and title. Describe titles that
// aren't static strings are matched by their source text, so a copy has to
// keep the same template literal.
//
// Skips live in skips/context-*.json:
//
//   {
//     "<original path>": {
//       "<describe> > <describe> > <title>": {"reason": "...", "note": "..."}
//     },
//     "excludedFiles": {
//       "<original path>": {"reason": "...", "note": "..."}
//     },
//     "ignoredBindings": {
//       "<original path>": {"<binding>": "why it isn't React context under test"}
//     },
//     "droppedVariants": {
//       "<original path>": {
//         "<variant>": {"reason": "...", "note": "...", "cases": <number>}
//       }
//     }
//   }
//
// droppedVariants records runs of a parametrized suite that the copy leaves
// out (e.g. a shared suite that runs once per way of reading context). The
// cases are still matched by source, so these are reported, not counted.

const fs = require('fs');
const path = require('path');
const {execSync} = require('child_process');
const parser = require('@babel/parser');

const ROOT = path.resolve(__dirname, '../..');
const SKIPS_DIR = path.join(__dirname, 'skips');
const SKIPS_PREFIX = 'context-';

const TEST_FILE_PATTERN = /\/__tests__\/[^/]+\.(js|ts|tsx)$/;
const CANDIDATE_PATTERN = /createContext|useContext\(/;
const CONTEXT_API_PATTERN =
  /\bcreateContext\b|\buseContext\s*\(|\.Consumer\b|\.Provider\b|\bstatic\s+contextType\b|(?<!\bthis)\.contextType\s*=|\breadContext\s*\(|\buse\(\s*[A-Za-z_$][\w$]*Context\b/;

const TEST_FUNCTIONS = new Set([
  'it',
  'test',
  'fit',
  'xit',
  'itRenders',
  'itThrowsWhenRendering',
  'itClientRenders',
  'itRendersWithoutServerRendering',
]);
const DESCRIBE_FUNCTIONS = new Set(['describe', 'fdescribe', 'xdescribe']);
const SEPARATOR = ' > ';

function getCopyPath(file) {
  const dir = path.dirname(file);
  const base = path.basename(file);
  const testIndex = base.indexOf('-test');
  if (testIndex !== -1) {
    return path.join(
      dir,
      base.slice(0, testIndex) + 'UseStoreContext' + base.slice(testIndex)
    );
  }
  const ext = path.extname(base);
  return path.join(dir, base.slice(0, -ext.length) + 'UseStoreContext' + ext);
}

function parse(file) {
  const source = fs.readFileSync(path.join(ROOT, file), 'utf8');
  const isTS = /\.tsx?$/.test(file);
  const ast = parser.parse(source, {
    sourceType: 'module',
    allowReturnOutsideFunction: true,
    errorRecovery: true,
    plugins: [
      'jsx',
      isTS ? 'typescript' : 'flow',
      'classProperties',
      'classPrivateProperties',
      'classPrivateMethods',
      'dynamicImport',
      'optionalChaining',
      'nullishCoalescingOperator',
      'topLevelAwait',
    ],
  });
  return {source, ast};
}

// The name of the function being called, e.g. `it`, `it.only`, `it.each(...)`.
function getCalleeBase(callee) {
  let node = callee;
  // `it.each(table)(title, fn)`
  if (node.type === 'CallExpression') {
    node = node.callee;
  }
  while (node.type === 'MemberExpression') {
    node = node.object;
  }
  return node.type === 'Identifier' ? node.name : null;
}

function readTitle(node, source) {
  if (node === undefined) {
    return null;
  }
  if (node.type === 'StringLiteral') {
    return node.value;
  }
  if (node.type === 'TemplateLiteral' && node.expressions.length === 0) {
    return node.quasis.map(q => q.value.cooked).join('');
  }
  if (node.type === 'BinaryExpression' && node.operator === '+') {
    const left = readTitle(node.left, source);
    const right = readTitle(node.right, source);
    if (left !== null && right !== null) {
      return left + right;
    }
  }
  // Dynamic: match on the source text.
  return source.slice(node.start, node.end);
}

function isNode(value) {
  return value !== null && typeof value === 'object' && 'type' in value;
}

function forEachChild(node, callback) {
  for (const key of Object.keys(node)) {
    if (
      key === 'loc' ||
      key === 'leadingComments' ||
      key === 'trailingComments' ||
      key === 'innerComments'
    ) {
      continue;
    }
    const value = node[key];
    if (Array.isArray(value)) {
      for (const child of value) {
        if (isNode(child)) {
          callback(child);
        }
      }
    } else if (isNode(value)) {
      callback(value);
    }
  }
}

// Collects test cases (with their describe path) and the declarations that
// aren't inside a test case.
// The source with the contents of strings, JSX text and comments blanked out,
// so that e.g. a warning that says "Use React.createContext() instead" doesn't
// count as reading context.
function blankLiterals(source, ast) {
  const chars = source.split('');
  const blank = (start, end) => {
    for (let i = start; i < end; i++) {
      if (chars[i] !== '\n') {
        chars[i] = ' ';
      }
    }
  };
  for (const comment of ast.comments || []) {
    blank(comment.start, comment.end);
  }
  (function walk(node) {
    if (node.type === 'StringLiteral' || node.type === 'JSXText') {
      // Keep the quotes, so the code around it still reads the same.
      blank(node.start + 1, node.end - 1);
      return;
    }
    if (node.type === 'TemplateElement') {
      blank(node.start, node.end);
      return;
    }
    forEachChild(node, walk);
  })(ast.program);
  return chars.join('');
}

function collect(file) {
  const parsed = parse(file);
  const ast = parsed.ast;
  // Titles are read from the AST. Everything that's matched against context
  // APIs and bindings comes from the blanked source.
  const source = blankLiterals(parsed.source, ast);
  const cases = [];
  const declarations = [];

  function addDeclaration(name, node) {
    declarations.push({name, text: source.slice(node.start, node.end)});
  }

  function visit(node, describes) {
    if (node.type === 'CallExpression') {
      const base = getCalleeBase(node.callee);
      if (base !== null && TEST_FUNCTIONS.has(base)) {
        const title = readTitle(node.arguments[0], parsed.source);
        cases.push({
          key: describes.concat(title).join(SEPARATOR),
          text: source.slice(node.start, node.end),
        });
        return;
      }
      if (base !== null && DESCRIBE_FUNCTIONS.has(base)) {
        const title = readTitle(node.arguments[0], parsed.source);
        const next = describes.concat(title);
        for (const arg of node.arguments.slice(1)) {
          visit(arg, next);
        }
        return;
      }
    }
    if (node.type === 'FunctionDeclaration' && node.id) {
      addDeclaration(node.id.name, node);
    } else if (node.type === 'ClassDeclaration' && node.id) {
      addDeclaration(node.id.name, node);
    } else if (
      node.type === 'VariableDeclarator' &&
      node.id.type === 'Identifier' &&
      node.init
    ) {
      addDeclaration(node.id.name, node);
    } else if (
      node.type === 'AssignmentExpression' &&
      node.left.type === 'Identifier'
    ) {
      // `Context = React.createContext()` in a beforeEach.
      addDeclaration(node.left.name, node);
    }
    forEachChild(node, child => visit(child, describes));
  }

  visit(ast.program, []);
  return {cases, declarations};
}

function escapeRegExp(string) {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Returns why the text reads context (the API or binding it mentions), or
// null if it doesn't.
function mentions(text, names) {
  const match = CONTEXT_API_PATTERN.exec(text);
  if (match !== null) {
    return match[0];
  }
  for (const name of names) {
    if (new RegExp('(^|[^\\w$.])' + escapeRegExp(name) + '\\b').test(text)) {
      return name;
    }
  }
  return null;
}

function getContextCases(file, ignoredBindings = {}) {
  const {cases, declarations} = collect(file);
  const ignored = ignoredBindings[file] || {};
  const names = new Set();
  let changed = true;
  while (changed) {
    changed = false;
    for (const declaration of declarations) {
      if (names.has(declaration.name) || declaration.name in ignored) {
        continue;
      }
      const others = [...names].filter(name => name !== declaration.name);
      if (mentions(declaration.text, others) !== null) {
        names.add(declaration.name);
        changed = true;
      }
    }
  }
  const context = [];
  for (const testCase of cases) {
    const why = mentions(testCase.text, names);
    if (why !== null) {
      context.push({key: testCase.key, text: testCase.text, why});
    }
  }
  return {all: cases, context};
}

function listCandidates() {
  const output = execSync(
    'git ls-files --cached --others --exclude-standard packages',
    {cwd: ROOT, encoding: 'utf8', maxBuffer: 64 * 1024 * 1024}
  );
  return output
    .split('\n')
    .filter(file => file !== '' && TEST_FILE_PATTERN.test(file))
    .filter(file => !/UseStore/.test(path.basename(file)))
    .filter(file => fs.existsSync(path.join(ROOT, file)))
    .filter(file =>
      CANDIDATE_PATTERN.test(fs.readFileSync(path.join(ROOT, file), 'utf8'))
    );
}

function readSkips() {
  const skips = {};
  const excludedFiles = {};
  const droppedVariants = {};
  const ignoredBindings = {};
  if (!fs.existsSync(SKIPS_DIR)) {
    return {skips, excludedFiles, droppedVariants, ignoredBindings};
  }
  for (const name of fs.readdirSync(SKIPS_DIR)) {
    if (!name.startsWith(SKIPS_PREFIX) || !name.endsWith('.json')) {
      continue;
    }
    const entries = JSON.parse(
      fs.readFileSync(path.join(SKIPS_DIR, name), 'utf8')
    );
    for (const file of Object.keys(entries)) {
      if (file === 'excludedFiles') {
        Object.assign(excludedFiles, entries[file]);
      } else if (file === 'droppedVariants') {
        Object.assign(droppedVariants, entries[file]);
      } else if (file === 'ignoredBindings') {
        Object.assign(ignoredBindings, entries[file]);
      } else {
        skips[file] = Object.assign(skips[file] || {}, entries[file]);
      }
    }
  }
  return {skips, excludedFiles, droppedVariants, ignoredBindings};
}

function checkFile(file, skips, ignoredBindings) {
  const copy = getCopyPath(file);
  const original = getContextCases(file, ignoredBindings);
  const fileSkips = skips[file] || {};
  const result = {
    file,
    copy,
    total: original.context.length,
    copied: 0,
    skipped: 0,
    missing: [],
    extra: [],
    staleSkips: [],
    exists: fs.existsSync(path.join(ROOT, copy)),
  };
  const remaining = new Map();
  if (result.exists) {
    for (const testCase of collect(copy).cases) {
      remaining.set(testCase.key, (remaining.get(testCase.key) || 0) + 1);
    }
  }
  const contextKeys = new Set();
  for (const testCase of original.context) {
    contextKeys.add(testCase.key);
    const count = remaining.get(testCase.key) || 0;
    if (count > 0) {
      remaining.set(testCase.key, count - 1);
      result.copied++;
    } else if (fileSkips[testCase.key] !== undefined) {
      result.skipped++;
    } else {
      result.missing.push(testCase.key);
    }
  }
  // Copies only contain context cases, so anything else is a typo in a title
  // or describe path.
  for (const [key, count] of remaining) {
    if (count > 0) {
      result.extra.push(key);
    }
  }
  for (const key of Object.keys(fileSkips)) {
    if (!contextKeys.has(key)) {
      result.staleSkips.push(key);
    }
  }
  return result;
}

function validateSkips(skips, excludedFiles, droppedVariants, ignoredBindings) {
  const problems = [];
  const check = (label, entry) => {
    if (
      entry === null ||
      typeof entry !== 'object' ||
      typeof entry.reason !== 'string' ||
      typeof entry.note !== 'string' ||
      entry.note === ''
    ) {
      problems.push(`${label} needs a reason and a note`);
    }
  };
  for (const file of Object.keys(skips)) {
    for (const key of Object.keys(skips[file])) {
      check(`${file}: "${key}"`, skips[file][key]);
    }
  }
  for (const file of Object.keys(excludedFiles)) {
    check(`excluded ${file}`, excludedFiles[file]);
  }
  for (const file of Object.keys(ignoredBindings)) {
    for (const name of Object.keys(ignoredBindings[file])) {
      if (typeof ignoredBindings[file][name] !== 'string') {
        problems.push(`${file}: ignored binding "${name}" needs a note`);
      }
    }
  }
  for (const file of Object.keys(droppedVariants)) {
    for (const variant of Object.keys(droppedVariants[file])) {
      const entry = droppedVariants[file][variant];
      check(`${file}: variant "${variant}"`, entry);
      if (entry && typeof entry.cases !== 'number') {
        problems.push(`${file}: variant "${variant}" needs a case count`);
      }
    }
  }
  return problems;
}

function isDone(result) {
  return (
    result.missing.length === 0 &&
    result.extra.length === 0 &&
    result.staleSkips.length === 0 &&
    (result.exists || result.copied === 0)
  );
}

function printDetails(result) {
  console.log(`${result.file} -> ${result.copy}`);
  console.log(
    `  ${result.copied} copied, ${result.skipped} skipped, ` +
      `${result.missing.length} missing (of ${result.total})`
  );
  for (const key of result.missing) {
    console.log(`  missing: ${key}`);
  }
  for (const key of result.extra) {
    console.log(`  not in the original's context cases: ${key}`);
  }
  for (const key of result.staleSkips) {
    console.log(`  stale skip: ${key}`);
  }
}

function main(args) {
  const {skips, excludedFiles, droppedVariants, ignoredBindings} = readSkips();
  const files = listCandidates().filter(file => !(file in excludedFiles));

  if (args.includes('--list')) {
    for (const file of files) {
      const {context} = getContextCases(file, ignoredBindings);
      console.log(`${file} (${context.length})`);
      for (const testCase of context) {
        console.log(
          args.includes('--why')
            ? `  ${testCase.key}  [${testCase.why}]`
            : `  ${testCase.key}`
        );
      }
    }
    return;
  }

  const single = args.find(arg => !arg.startsWith('--'));
  if (single !== undefined) {
    const file = path.relative(ROOT, path.resolve(single));
    if (file in excludedFiles) {
      console.log(`${file} is excluded: ${excludedFiles[file].note}`);
      process.exit(0);
    }
    if (!files.includes(file)) {
      console.log(`${file} is not a test file that reads context.`);
      process.exit(1);
    }
    const result = checkFile(file, skips, ignoredBindings);
    printDetails(result);
    process.exit(isDone(result) ? 0 : 1);
  }

  const onlyMissing = args.includes('--missing');
  const results = files.map(file => checkFile(file, skips, ignoredBindings));
  let doneFiles = 0;
  let totalCases = 0;
  let copiedCases = 0;
  let skippedCases = 0;
  for (const result of results) {
    totalCases += result.total;
    copiedCases += result.copied;
    skippedCases += result.skipped;
    const done = isDone(result);
    if (done) {
      doneFiles++;
    }
    if (!onlyMissing || !done) {
      const status = done ? 'done' : result.exists ? 'partial' : 'todo';
      console.log(
        `${status.padEnd(8)} ${String(result.copied + result.skipped).padStart(
          4
        )}/${String(result.total).padEnd(4)} ${result.file}`
      );
      if (result.exists && !done) {
        for (const key of result.extra) {
          console.log(`         not in the original's context cases: ${key}`);
        }
        for (const key of result.staleSkips) {
          console.log(`         stale skip: ${key}`);
        }
      }
    }
  }
  const problems = validateSkips(
    skips,
    excludedFiles,
    droppedVariants,
    ignoredBindings
  );
  for (const problem of problems) {
    console.log(`invalid skip: ${problem}`);
  }
  let droppedRuns = 0;
  for (const file of Object.keys(droppedVariants)) {
    for (const variant of Object.keys(droppedVariants[file])) {
      droppedRuns += droppedVariants[file][variant].cases;
    }
  }
  console.log('');
  console.log(
    `${doneFiles}/${results.length} files done ` +
      `(${Object.keys(excludedFiles).length} excluded). ` +
      `${copiedCases} cases copied, ${skippedCases} skipped, ` +
      `${totalCases - copiedCases - skippedCases} missing (of ${totalCases}).`
  );
  if (droppedRuns > 0) {
    console.log(
      `${droppedRuns} runs of parametrized cases are left out of the copies ` +
        `(droppedVariants).`
    );
  }
  process.exit(doneFiles === results.length && problems.length === 0 ? 0 : 1);
}

module.exports = {main, getContextCases, getCopyPath};
