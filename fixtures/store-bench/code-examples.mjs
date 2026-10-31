// Code examples for the report, read from the benchmark sources so the report
// shows exactly the code that was measured. The compiled Row comes from the
// same compiler build the timing bundles use.
//
// The counting instrumentation (countRender, counted) is stripped. Both are
// no-ops in the timing builds: countRender does nothing and counted returns
// the selector unchanged.

import fs from 'fs';
import path from 'path';
import {createRequire} from 'module';
import {fileURLToPath} from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const repo = path.resolve(here, '../..');
const require = createRequire(import.meta.url);
const babel = require('@babel/core');
const prettier = require(require.resolve('prettier', {paths: [repo]}));
const reactCompiler = require(
  path.join(repo, 'compiler/packages/babel-plugin-react-compiler/dist/index.js'),
);

export function stripInstrumentation({types: t}) {
  return {
    visitor: {
      CallExpression(p) {
        const callee = p.node.callee;
        if (!t.isIdentifier(callee)) {
          return;
        }
        if (callee.name === 'counted' || callee.name === 'derivation') {
          p.replaceWith(p.node.arguments[0]);
        } else if (
          callee.name === 'countRender' &&
          p.parentPath.isExpressionStatement()
        ) {
          p.parentPath.remove();
        }
      },
    },
  };
}

export function transform(source, filename, plugins) {
  return babel.transformSync(source, {
    filename,
    babelrc: false,
    configFile: false,
    parserOpts: {plugins: ['jsx']},
    plugins,
  }).code;
}

export function format(code, printWidth) {
  return prettier.format(code, {
    parser: 'babel',
    bracketSpacing: false,
    singleQuote: true,
    bracketSameLine: true,
    trailingComma: 'all',
    arrowParens: 'avoid',
    printWidth,
  });
}

// Top-level function declarations end at the first line that is just "}".
export function extract(code, name) {
  const match = code.match(new RegExp(`function ${name}\\([\\s\\S]*?\\n}\\n`));
  if (match === null) {
    throw new Error(`Couldn't find function ${name}`);
  }
  return match[0].trimEnd();
}

async function source(variant) {
  const file = path.join(here, 'src/apps', variant + '.jsx');
  const raw = fs.readFileSync(file, 'utf8');
  const stripped = transform(raw, file, [stripInstrumentation]);
  const compiled = transform(stripped, file, [
    [reactCompiler, {target: '19', panicThreshold: 'all_errors'}],
  ]);
  return {
    raw,
    // Narrow enough to show source side by side.
    source: await format(stripped, 64),
    compiled: await format(compiled, 80),
  };
}

// A small highlighter, enough for JSX snippets.
const KEYWORDS = new Set(
  'const let var function return if else for new null true false import from export'.split(
    ' ',
  ),
);
function escape(text) {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}
function highlightLine(line) {
  const token =
    /(\/\/.*$)|('(?:[^'\\]|\\.)*'|"(?:[^"\\]|\\.)*")|(<\/?[A-Za-z][\w.]*|\/?>)|\b(\d+)\b|\b([A-Za-z_$][\w$]*)\b/g;
  let out = '';
  let last = 0;
  let m;
  while ((m = token.exec(line)) !== null) {
    out += escape(line.slice(last, m.index));
    const [text, comment, string, tag, number, word] = m;
    if (comment) out += `<span class="tc">${escape(text)}</span>`;
    else if (string) out += `<span class="ts">${escape(text)}</span>`;
    else if (tag) out += `<span class="tt">${escape(text)}</span>`;
    else if (number) out += `<span class="tn">${text}</span>`;
    else if (KEYWORDS.has(word)) out += `<span class="tk">${text}</span>`;
    else if (word === 'use' || word === 'useSelector' || word === 'useBench')
      out += `<span class="th">${text}</span>`;
    else out += text;
    last = m.index + text.length;
  }
  return out + escape(line.slice(last));
}

// Lines containing any of `marks` are highlighted, and `notes` adds a margin
// note to the first line containing each key.
export function block(code, {marks = [], bad = [], notes = {}} = {}) {
  const seen = new Set();
  const lines = code.split('\n').map(line => {
    let cls = '';
    if (marks.some(m => line.includes(m))) cls = 'hl';
    if (bad.some(m => line.includes(m))) cls = 'hlbad';
    let note = '';
    for (const [key, text] of Object.entries(notes)) {
      if (!seen.has(key) && line.includes(key)) {
        seen.add(key);
        note = `<span class="note">↑ ${escape(text)}</span>`;
      }
    }
    return `<span class="ln ${cls}">${highlightLine(line) || ' '}${note}</span>`;
  });
  return `<pre class="code">${lines.join('')}</pre>`;
}

export async function codeExamples() {
  const store = await source('store');
  const redux = await source('redux');
  const zustand = await source('zustand');

  const storeRow = extract(store.source, 'Row');
  const reduxRow = extract(redux.source, 'Row');
  const zustandRow = extract(zustand.source, 'Row');
  const compiledRow = extract(store.compiled, 'Row');

  // The store setup and two updates, from createApp.
  const setup = store.source.match(
    / {2}const entities = new Map\(\);[\s\S]*?\n {2}s = \{[\s\S]*?\n {2}\};/,
  )[0];
  const select = store.source.match(/ {4}select\(index\) \{[\s\S]*?\n {4}\},/)[0];
  const edit = store.source.match(
    / {4}editEntity\(index\) \{[\s\S]*?\n {4}\},/,
  )[0];
  const storeSetup = [
    setup.replace(/^ {2}/gm, ''),
    '',
    '// Updates',
    select.replace(/^ {4}/gm, '').replace(/,$/, ''),
    edit.replace(/^ {4}/gm, '').replace(/,$/, ''),
  ].join('\n');

  return {
    storeRow: block(storeRow, {
      marks: ['use(s.details)', 'if (expanded)'],
      notes: {
        'use(s.selected)': 'every row reads the selection',
        'use(s.details)': 'conditional: only expanded rows subscribe',
      },
    }),
    reduxRow: block(reduxRow, {
      bad: ['useSelector('],
      notes: {
        "s.selected === id": 'runs for every row on every dispatch',
        "detailsMode === 'inline' &&": "can't be conditional, so it always runs",
      },
    }),
    zustandRow: block(zustandRow, {bad: ['useBench(']}),
    compiledRow: block(compiledRow, {
      marks: ['t5 = $[14]', '$[13] !== selected'],
      notes: {
        'const selected = use(s.selected)': 'reads run on every render',
        '$[13] !== selected': 'only changes for 2 of N rows',
        't5 = $[14]':
          'returns the cached element: RowView is skipped',
      },
    }),
    storeSetup: block(storeSetup),
  };
}
