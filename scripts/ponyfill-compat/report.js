'use strict';

// Usage: node report.js <resultsDir> [--json out.json] [--list]
// <resultsDir> holds none/, experimental/ and stable/ subdirectories, each with
// the results.json and na.jsonl that run.sh writes.
//
// For each test, the effective outcome is pass/fail. Tests gated off for the
// experimental channel ("[GATED, SHOULD FAIL]") are inverted: jest reports them
// passing when they fail, and failing with "Gated test was expected to fail,
// but it passed." when they pass.

const fs = require('fs');
const path = require('path');

const GATED_PREFIX = '[GATED, SHOULD FAIL] ';
const GATED_MESSAGE = 'Gated test was expected to fail, but it passed.';
const NA_PREFIX = 'PONYFILL_ADAPTER_NA';
const ROOT = path.resolve(__dirname, '../..');

// Whole files that are N/A: server-only/Flight renderers and DevTools/debug
// tools, which inspect internals the ponyfill doesn't have.
const NA_FILE_PATTERNS = [
  [/react-devtools/, 'DevTools internals'],
  [/react-debug-tools/, 'react-debug-tools internals'],
  [/Flight/, 'Flight server'],
  [
    /react-markup/,
    'react-markup (static server rendering; hooks are disallowed)',
  ],
];

// Experimental-ponyfill failures caused by the <StoreProvider> the adapter
// adds above the root's children, checked by hand: the tests read the root's
// top-level component, depend on the root having no passive effects, or
// assert hydration diffs that now include <StoreProvider>.
const WRAPPER_ARTIFACTS = [
  /ReactTestRendererUseStore-test\.internal\.js :: ReactTestRenderer (exposes the instance|toTree\(\)|root instance and createNodeMock|supports (context providers|modes|forwardRef))/,
  /ReactFabricUseStore-test\.internal\.js :: ReactFabric calls the callback with the correct instance and returns null/,
  /StrictEffectsModeDefaultsUseStore-test\.internal\.js :: .*if there are no passive effects/,
  /ReactServerRenderingHydrationUseStore-test\.js :: ReactDOMServerHydration should warn when the style property differs/,
];

function load(dir) {
  const resultsPath = path.join(dir, 'results.json');
  if (!fs.existsSync(resultsPath)) {
    return null;
  }
  const results = JSON.parse(fs.readFileSync(resultsPath, 'utf8'));
  const na = new Set();
  const naPath = path.join(dir, 'na.jsonl');
  if (fs.existsSync(naPath)) {
    for (const line of fs.readFileSync(naPath, 'utf8').split('\n')) {
      if (line) {
        const entry = JSON.parse(line);
        na.add(
          path.relative(ROOT, entry.testPath) +
            ' :: ' +
            entry.name.replace(GATED_PREFIX, '')
        );
      }
    }
  }
  const tests = new Map();
  const suiteErrors = [];
  for (const file of results.testResults) {
    const rel = path.relative(ROOT, file.name);
    if (file.assertionResults.length === 0 && file.message) {
      suiteErrors.push({file: rel, message: file.message.slice(0, 2000)});
    }
    const seen = new Map();
    for (const a of file.assertionResults) {
      const gated = a.title.startsWith(GATED_PREFIX);
      const title = gated ? a.title.slice(GATED_PREFIX.length) : a.title;
      const fullName = [...a.ancestorTitles, title].join(' ');
      let key = rel + ' :: ' + fullName;
      const n = (seen.get(key) || 0) + 1;
      seen.set(key, n);
      const naKey = key;
      if (n > 1) {
        key += ` #${n}`;
      }
      const message = (a.failureMessages || []).join('\n');
      let pass;
      if (
        a.status === 'pending' ||
        a.status === 'skipped' ||
        a.status === 'todo'
      ) {
        pass = null;
      } else if (gated) {
        pass = a.status === 'failed' && message.includes(GATED_MESSAGE);
      } else {
        pass = a.status === 'passed';
      }
      tests.set(key, {
        file: rel,
        name: fullName,
        gated,
        pass,
        message,
        na: na.has(naKey) || message.includes(NA_PREFIX),
      });
    }
  }
  return {tests, suiteErrors};
}

function stripAnsi(s) {
  // eslint-disable-next-line no-control-regex
  return s.replace(/\u001b\[[0-9;]*m/g, '');
}

// First lines of the failure, without the stack.
function summarize(message) {
  const lines = stripAnsi(message)
    .split('\n')
    .filter(l => !/^\s+at /.test(l));
  return lines.join('\n').trim().slice(0, 1500);
}

// True if a failure's -/+ diff lines only differ by the <StoreProvider>
// wrapper (component tree diffs) or by useId values, which the wrapper shifts
// because it renders <CommitTracker> as a sibling of the root's children.
function onlyWrapperDiff(m) {
  const minus = [];
  const plus = [];
  const normalize = line =>
    line
      .slice(1)
      .replace(/id="[0-9]+"/g, 'id=ID')
      .replace(/R_[0-9a-zA-Z]+_/g, 'R_ID_')
      .replace(/«[^»]*»/g, 'ID')
      .replace(/\s+/g, ' ')
      .trim();
  for (const line of m.split('\n')) {
    if (/^\s*-\s*(Expected|Snapshot)|^\s*\+\s*(Received)/.test(line)) {
      continue;
    }
    const t = line.replace(/^\s{0,4}/, '');
    if (/^- /.test(t) || t === '-') {
      minus.push(normalize(t));
    } else if (/^\+ /.test(t) || t === '+') {
      if (/StoreProvider/.test(t)) {
        continue;
      }
      plus.push(normalize(t));
    }
  }
  if (minus.length === 0 && plus.length === 0) {
    return false;
  }
  return minus.sort().join('\n') === plus.sort().join('\n');
}

function bucket(message) {
  const m = stripAnsi(message);
  if (onlyWrapperDiff(m)) {
    return 'adapter artifact (only the StoreProvider wrapper or useId values differ)';
  }
  const rules = [
    [
      /"storeManager": StoreManager/,
      'adapter artifact (wrapper visible in toTree())',
    ],
    [
      /in StoreProvider|CommitTracker/,
      'adapter artifact? (StoreProvider/CommitTracker in output)',
    ],
    [
      /Rendered (more|fewer) hooks|change in the order of Hooks|order of Hooks called/,
      'hook order (conditional/changing use(store) reads)',
    ],
    [
      /Invalid hook call|Hooks can only be called|is not a function.*use(State|Transition|Context|Ref|LayoutEffect)|Cannot read properties of null \(reading 'use(State|Transition|Context|Ref|LayoutEffect)'\)/,
      'hooks outside a function component (class/useMemo/callback reads)',
    ],
    [
      /does not currently support dynamic stores/,
      'store switching (dynamic stores)',
    ],
    [
      /Expected useStoreSelector to be rendered within a StoreProvider/,
      'no StoreProvider (adapter: tree not wrapped)',
    ],
    [
      /Cannot update a component .* while rendering a different component/,
      'update during render: warning text differs',
    ],
    [/Gated test was expected to fail/, 'gated-off test passes'],
    [
      /store\.update\(\) doesn't support a second callback|Cannot update a store inside a startGestureTransition/,
      'use(store)-specific API errors/warnings',
    ],
    [/Expected sequence of events did not occur/, 'render log mismatch'],
    [
      /toMatchRenderedOutput|toEqual|toBe\b|toHaveTextContent|innerHTML|textContent/,
      'rendered output mismatch',
    ],
    [/console\.(error|warn|log)|assertConsole/, 'console mismatch'],
    [/Exceeded timeout|thrown: "Exceeded/, 'timeout'],
  ];
  for (const [re, name] of rules) {
    if (re.test(m)) {
      return name;
    }
  }
  return 'other';
}

function naFileReason(file) {
  for (const [re, reason] of NA_FILE_PATTERNS) {
    if (re.test(file)) {
      return reason;
    }
  }
  return null;
}

function classify(base, pony) {
  const out = [];
  for (const [key, b] of base.tests) {
    const p = pony.tests.get(key);
    const fileReason = naFileReason(b.file);
    let cls;
    if (b.pass === null) {
      cls = 'skipped';
    } else if (fileReason) {
      cls = 'na';
    } else if (!p) {
      cls = 'missing';
    } else if (p.na || b.na) {
      cls = 'na';
    } else if (b.pass && p.pass) {
      cls = 'pass-both';
    } else if (b.pass && !p.pass) {
      cls = 'fail-ponyfill-only';
    } else if (!b.pass && p.pass) {
      cls = 'fail-use(store)-only';
    } else {
      cls = 'fail-both';
    }
    out.push({
      key,
      file: b.file,
      name: b.name,
      gated: b.gated,
      cls,
      bucket:
        cls === 'fail-ponyfill-only'
          ? WRAPPER_ARTIFACTS.some(re => re.test(key))
            ? 'adapter artifact (root wrapper, checked by hand)'
            : bucket(p.message)
          : undefined,
      baseMessage: b.pass === false ? summarize(b.message) : undefined,
      ponyMessage: p && p.pass === false ? summarize(p.message) : undefined,
    });
  }
  return out;
}

function count(rows, field) {
  const counts = {};
  for (const r of rows) {
    const v = r[field];
    if (v !== undefined) {
      counts[v] = (counts[v] || 0) + 1;
    }
  }
  return counts;
}

function main() {
  const args = process.argv.slice(2);
  const dir = args[0];
  const jsonOut = args.includes('--json')
    ? args[args.indexOf('--json') + 1]
    : null;
  const list = args.includes('--list');
  const base = load(path.join(dir, 'none'));
  const report = {dir, baseSuiteErrors: base.suiteErrors, impls: {}};
  for (const impl of ['experimental', 'stable']) {
    const pony = load(path.join(dir, impl));
    if (!pony) {
      continue;
    }
    const rows = classify(base, pony);
    report.impls[impl] = {
      totals: count(rows, 'cls'),
      gatedTotals: count(
        rows.filter(r => r.gated),
        'cls'
      ),
      buckets: count(rows, 'bucket'),
      suiteErrors: pony.suiteErrors,
      rows,
    };
    console.log(`\n== ${impl} (${dir})`);
    console.log('totals', report.impls[impl].totals);
    console.log('gated-off tests', report.impls[impl].gatedTotals);
    console.log('buckets', report.impls[impl].buckets);
    if (pony.suiteErrors.length) {
      console.log(
        'suite errors',
        pony.suiteErrors.map(e => e.file)
      );
    }
    if (list) {
      for (const r of rows) {
        if (r.cls !== 'pass-both') {
          console.log(
            `  [${r.cls}${r.bucket ? ' / ' + r.bucket : ''}] ${r.key}`
          );
        }
      }
    }
  }
  if (base.suiteErrors.length) {
    console.log(
      'baseline suite errors',
      base.suiteErrors.map(e => e.file)
    );
  }
  if (jsonOut) {
    fs.writeFileSync(jsonOut, JSON.stringify(report, null, 2));
  }
}

main();
