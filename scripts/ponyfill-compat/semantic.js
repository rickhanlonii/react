'use strict';

// Usage: node semantic.js <results/set dir> <impl> [--list]
// Groups the fail-ponyfill-only tests of report.json by root cause, using the
// test name and the ponyfill's failure message. The rules come from reading
// the failures; the first matching rule wins.

const fs = require('fs');
const path = require('path');

const [dir, impl] = process.argv.slice(2);
const list = process.argv.includes('--list');
const report = JSON.parse(
  fs.readFileSync(path.join(dir, 'report.json'), 'utf8')
);
const rows = report.impls[impl].rows.filter(
  r => r.cls === 'fail-ponyfill-only'
);

const RULES = [
  ['adapter artifact', r => /^adapter artifact/.test(r.bucket)],
  [
    'conditional or changing reads (Hook order, dynamic stores, Hooks inside Hooks)',
    r =>
      /Rendered (more|fewer) hooks|order of Hooks|dynamic stores|Update hook called on initial render|Do not call Hooks inside|reading 'use(Context|State)'|inside useMemo/.test(
        r.ponyMessage
      ),
  ],
  [
    'store update during render (applied as a render phase setState; different warning or none)',
    r =>
      /Cannot update a store while rendering|Cannot update a component \(`Unknown`\)|while rendering a different component/.test(
        r.ponyMessage
      ) ||
      /render phase|during render|setState is called before commit/.test(
        r.name
      ),
  ],
  [
    'use(store)-only API checks (second callback warning, gesture error text)',
    r =>
      /doesn't support a second callback|startGestureTransition/.test(
        r.ponyMessage
      ),
  ],
  [
    "the ponyfill's own setState in <StoreProvider> (act warnings, updater tracking, startTransition warning)",
    r =>
      /An update to null|not configured to support act|large number of updates inside startTransition|^updaters /.test(
        r.ponyMessage + '\n' + r.name
      ) || /ReactUpdaters/.test(r.file),
  ],
  [
    'reducer runs eagerly in update(), outside render (errors, StrictMode double invoke, call counts)',
    r =>
      /reducer|updater function|Compute (state|new state|count)|Oops|Reduce /.test(
        r.name + '\n' + r.ponyMessage
      ),
  ],
  [
    'server render / hydration (server renders the latest value, mismatches)',
    r =>
      /Hydration failed|didn't match|server renders|hydrat/i.test(
        r.name + '\n' + r.ponyMessage
      ),
  ],
  [
    'suspense: a reader that suspends on mount never subscribes (missed retry)',
    r => /[Ss]uspen|Loading|retry/.test(r.name + '\n' + r.ponyMessage),
  ],
  [
    'Activity: hidden readers unsubscribe, then tear when revealed',
    r => /Activity|[Hh]idden|[Rr]eveal/.test(r.name + '\n' + r.ponyMessage),
  ],
  [
    'mount during a transition / concurrent render: torn render, fixed up in a layout effect',
    r => /mount|tear|concurrent render|interrupt/i.test(r.name),
  ],
  [
    'extra renders / missing bailouts / extra effect runs',
    r => /Expected sequence of events|toEqual|toBe/.test(r.ponyMessage),
  ],
  ['other', () => true],
];

const groups = new Map();
for (const r of rows) {
  const name = RULES.find(([, test]) => test(r))[0];
  if (!groups.has(name)) {
    groups.set(name, []);
  }
  groups.get(name).push(r);
}
console.log(`${impl}: ${rows.length} fail-ponyfill-only (${dir})`);
for (const [name, rs] of [...groups].sort(
  (a, b) => b[1].length - a[1].length
)) {
  console.log(`\n${rs.length}  ${name}`);
  console.log(`    e.g. ${path.basename(rs[0].file)} :: ${rs[0].name}`);
  if (list) {
    for (const r of rs.slice(1)) {
      console.log(`         ${path.basename(r.file)} :: ${r.name}`);
    }
  }
}
