// Prints the CPU (in cores) that processes outside a process tree are using,
// as JSON. run-report-matrix.sh passes its own pid, so the benchmark (run.mjs
// and its Chrome) counts as "ours" and everything else as ambient load.
//
//   node ambient-cpu.mjs <root-pid>   {"ambient":2.4,"ours":1.1}

import {execFileSync} from 'child_process';

const root = Number(process.argv[2] || 0);
const rows = execFileSync('ps', ['-Ao', 'pid=,ppid=,pcpu='])
  .toString()
  .trim()
  .split('\n')
  .map(line => line.trim().split(/\s+/).map(Number));
const children = new Map();
for (const [pid, ppid] of rows) {
  if (!children.has(ppid)) children.set(ppid, []);
  children.get(ppid).push(pid);
}
const ours = new Set([process.pid]);
const stack = root ? [root] : [];
while (stack.length > 0) {
  const pid = stack.pop();
  if (ours.has(pid)) continue;
  ours.add(pid);
  stack.push(...(children.get(pid) || []));
}
let ambient = 0;
let mine = 0;
for (const [pid, , cpu] of rows) {
  if (ours.has(pid)) mine += cpu;
  else ambient += cpu;
}
console.log(JSON.stringify({ambient: +(ambient / 100).toFixed(2), ours: +(mine / 100).toFixed(2)}));
