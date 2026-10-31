// Interleaved A/B timing of two sets of bundles, to compare React builds on a
// noisy machine. Runs run.mjs --smoke for each dist in turn, several rounds,
// and reports the median of the per-round trimmed means and the ratio B/A.
//
//   node ab.mjs --a=dist-base --b=dist-opt --rounds=4 \
//     --variants=store,store-single --scenarios=selection --n=1000 --throttle=1
//
// Any other flags are passed through to run.mjs.

import {spawn, spawnSync} from 'child_process';
import os from 'os';
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
function option(name, fallback) {
  const arg = args.find(a => a.startsWith('--' + name + '='));
  return arg ? arg.slice(name.length + 3) : fallback;
}
const a = option('a', 'dist-base');
const b = option('b', 'dist-opt');
const rounds = Number(option('rounds', 3));
const scenarioList = option(
  'scenarios',
  'entity,selection,filter,details-inline,details-component,structure'
).split(',');
const nList = option('n', '1000').split(',');
const throttleList = option('throttle', '1').split(',');
const passthrough = args.filter(
  x =>
    !/^--(a|b|rounds|max-load|discard-load|scenarios|n|throttle|state)=/.test(x)
);

function median(values) {
  const sorted = [...values].sort((x, y) => x - y);
  return sorted[Math.floor(sorted.length / 2)];
}

// The timer has 100µs resolution, so medians are quantized. The mean of the
// middle 80% of samples resolves smaller differences.
function trimmedMean(values) {
  const sorted = [...values].sort((x, y) => x - y);
  const cut = Math.floor(sorted.length * 0.1);
  const middle = sorted.slice(cut, sorted.length - cut);
  return middle.reduce((x, y) => x + y, 0) / middle.length;
}

// Other work on the machine skews timings even when interleaved. Start a run
// when the 1-minute load average is below --max-load (default 20), and
// discard it if the load went above --discard-load (default 28) during it.
const maxLoad = Number(option('max-load', 20));
const discardLoad = Number(option('discard-load', 28));
function waitForQuietMachine() {
  let warned = false;
  while (os.loadavg()[0] >= maxLoad) {
    if (!warned) {
      process.stderr.write(`waiting for load < ${maxLoad}\n`);
      warned = true;
    }
    spawnSync('sleep', ['10']);
  }
}

// Runs A and B back to back for one group of configs, and retries the pair if
// the load went too high during either.
let runs = 0;
let discarded = 0;
function runPairWithRetry(group, order) {
  for (;;) {
    waitForQuietMachine();
    const loadLog = path.join(os.tmpdir(), `ab-load-${process.pid}.log`);
    // Sample the load once a second while run.mjs runs.
    const sampler = spawn(
      'sh',
      [
        '-c',
        `while true; do sysctl -n vm.loadavg >> ${loadLog}; sleep 1; done`,
      ],
      {stdio: 'ignore'}
    );
    const results = {};
    for (const side of order) {
      results[side] = runOnce(side === 'a' ? a : b, group);
    }
    sampler.kill();
    let peak = os.loadavg()[0];
    if (fs.existsSync(loadLog)) {
      for (const line of fs.readFileSync(loadLog, 'utf8').split('\n')) {
        const match = /([\d.]+)/.exec(line);
        if (match) {
          peak = Math.max(peak, Number(match[1]));
        }
      }
      fs.unlinkSync(loadLog);
    }
    runs++;
    if (peak <= discardLoad) {
      return results;
    }
    discarded++;
    process.stderr.write(`discarded ${group.join(' ')}: load ${peak}\n`);
    if (runs >= 6 && discarded / runs > 0.5) {
      throw new Error(
        `More than half the runs were discarded (${discarded}/${runs}).`
      );
    }
  }
}

function runOnce(dist, [scenario, n, throttle]) {
  const result = spawnSync(
    process.execPath,
    [
      'run.mjs',
      '--smoke',
      '--dist=' + dist,
      '--label=ab-' + path.basename(dist),
      '--scenarios=' + scenario,
      '--n=' + n,
      '--throttle=' + throttle,
      ...passthrough,
    ],
    {cwd: here, encoding: 'utf8', env: process.env}
  );
  const match = /wrote (\S+)/.exec(result.stdout);
  if (!match) {
    throw new Error(result.stdout + result.stderr);
  }
  const file = path.join(here, match[1]);
  const {results} = JSON.parse(fs.readFileSync(file, 'utf8'));
  fs.unlinkSync(file);
  const out = new Map();
  for (const r of results) {
    if (r.kind !== 'update') {
      continue;
    }
    const key = [
      r.scenario,
      'N=' + r.n,
      'x' + r.throttle,
      r.variant + (r.compiler ? '+c' : ''),
    ].join(' ');
    if (!out.has(key)) {
      out.set(key, []);
    }
    out.get(key).push(...r.durations);
  }
  return out;
}

const groups = [];
for (const n of nList) {
  for (const throttle of throttleList) {
    for (const scenario of scenarioList) {
      groups.push([scenario, n, throttle]);
    }
  }
}
// Results are saved after every group to --state (default
// results/ab-state-<a>-<b>.json), so a killed run resumes where it stopped.
const statePath = path.resolve(
  here,
  option(
    'state',
    `results/ab-state-${path.basename(a)}-${path.basename(b)}.json`
  )
);
const state = fs.existsSync(statePath)
  ? JSON.parse(fs.readFileSync(statePath, 'utf8'))
  : {done: {}, a: {}, b: {}};
const samples = {a: new Map(), b: new Map()};
for (const side of ['a', 'b']) {
  for (const key of Object.keys(state[side])) {
    samples[side].set(key, state[side][key]);
  }
}
for (let round = 0; round < rounds; round++) {
  for (let g = 0; g < groups.length; g++) {
    const id = round + ':' + groups[g].join(' ');
    if (state.done[id]) {
      continue;
    }
    // Alternate which side goes first.
    const order = (round + g) % 2 === 0 ? ['a', 'b'] : ['b', 'a'];
    const results = runPairWithRetry(groups[g], order);
    for (const side of order) {
      for (const [key, durations] of results[side]) {
        if (!samples[side].has(key)) {
          samples[side].set(key, []);
        }
        samples[side].get(key).push(trimmedMean(durations));
        state[side][key] = samples[side].get(key);
      }
    }
    state.done[id] = true;
    fs.mkdirSync(path.dirname(statePath), {recursive: true});
    fs.writeFileSync(statePath, JSON.stringify(state));
  }
  process.stderr.write(
    `round ${round + 1}/${rounds} (discarded ${discarded}/${runs})\n`
  );
}

console.log(
  `\n${'config'.padEnd(44)} ${a.padStart(10)} ${b.padStart(10)}  ratio  per-round ${a} | ${b}`
);
for (const key of [...samples.a.keys()].sort()) {
  const ma = median(samples.a.get(key));
  const mb = median(samples.b.get(key) || [NaN]);
  console.log(
    `${key.padEnd(44)} ${ma.toFixed(4).padStart(10)} ${mb.toFixed(4).padStart(10)}  ${(mb / ma).toFixed(3)}  ${samples.a
      .get(key)
      .map(x => x.toFixed(4))
      .join(
        ' '
      )} | ${(samples.b.get(key) || []).map(x => x.toFixed(4)).join(' ')}`
  );
}
