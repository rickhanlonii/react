// Live status page for run-report-matrix.sh.
//
//   node matrix-status.mjs            http://localhost:8791
//   PORT=8792 TAG=head RESTARTS=3 LOG=/tmp/report-matrix.log node matrix-status.mjs
//   MATRIX=nobailout node matrix-status.mjs   the bailout-off subset (TAG=headnb)
//
// Reads results/ (a unit is done when its result file exists), the unit log
// (results/$TAG-units.log) and the runner's output, and serves a page that
// polls /status.json. The unit list mirrors run-report-matrix.sh: keep them in
// sync if the matrix changes.

import http from 'http';
import fs from 'fs';
import os from 'os';
import path from 'path';
import {execFileSync} from 'child_process';
import {fileURLToPath} from 'url';

const here = path.dirname(fileURLToPath(import.meta.url));
const resultsDir = path.join(here, 'results');
const PORT = Number(process.env.PORT || 8791);
const MATRIX = process.env.MATRIX || 'full';
const TAG = process.env.TAG || (MATRIX === 'nobailout' ? 'headnb' : 'head');
const RESTARTS = Number(process.env.RESTARTS || 3);
const RUNNER_LOG = process.env.LOG || '/tmp/report-matrix.log';
const UNIT_LOG = path.join(resultsDir, `${TAG}-units.log`);
const LOAD_LIMIT = Number(process.env.LOAD_LIMIT || 4);
const DISCARD_LIMIT = Number(process.env.DISCARD_LIMIT || 6);

const SCENARIOS = ['entity', 'selection', 'filter', 'details-inline', 'details-component', 'details-churn', 'structure'];
const SUITES = MATRIX === 'nobailout' ? ['sweeps'] : ['derived-selectors', 'rapid-dispatch', 'many-components-same-slice', 'deeptree-nested-hooks', 'fairness', 'typing', 'sweeps'];
const FAMILIES = MATRIX === 'nobailout' ? [] : ['mixed', 'score', 'comment', 'role'];

function plan() {
  const all = [];
  for (let r = 1; r <= RESTARTS; r++) {
    const units = [];
    for (const s of SCENARIOS) {
      for (const t of [1, 4]) {
        units.push({mode: 'full', label: `${TAG}-r${r}-${s}-x${t}`, group: 'main', name: `${s} ${t}×`, kind: `main-x${t}`});
      }
    }
    if (MATRIX !== 'nobailout') {
      units.push({mode: 'full', label: `${TAG}-r${r}-typing`, group: 'main', name: 'typing', kind: 'typing'});
      units.push({mode: 'full', label: `${TAG}-r${r}-memory`, group: 'main', name: 'memory', kind: 'memory'});
    }
    for (const s of SUITES) {
      units.push({mode: 'smoke', label: `${TAG}-q-${s}-r${r}`, group: 'suites', name: s, kind: `suite-${s}`});
    }
    for (const f of FAMILIES) {
      for (const t of [1, 4]) {
        units.push({mode: 'smoke', label: `${TAG}-spike-r${r}-${f}-x${t}`, group: 'spike', name: `${f} ${t}×`, kind: `spike-x${t}`});
      }
    }
    const ordered = r % 2 === 0 ? [...units].reverse() : units;
    ordered.forEach((u, i) => all.push({...u, restart: r, slot: units.indexOf(u), order: all.length, position: i}));
  }
  return all;
}

const fileCache = new Map();
function fileInfo(file) {
  const full = path.join(resultsDir, file);
  const stat = fs.statSync(full);
  const cached = fileCache.get(file);
  if (cached && cached.mtimeMs === stat.mtimeMs) return cached;
  let env = {};
  try {
    env = JSON.parse(fs.readFileSync(full, 'utf8')).env || {};
  } catch {}
  const info = {
    mtimeMs: stat.mtimeMs,
    start: env.date ? Date.parse(env.date) : null,
    end: stat.mtimeMs,
    loadStart: env.loadStart ? env.loadStart[0] : null,
    loadEnd: env.loadEnd ? env.loadEnd[0] : null,
    sha: env.react ? env.react.sha : null,
  };
  fileCache.set(file, info);
  return info;
}

function tail(file, bytes) {
  try {
    const fd = fs.openSync(file, 'r');
    const size = fs.fstatSync(fd).size;
    const buf = Buffer.alloc(Math.min(bytes, size));
    fs.readSync(fd, buf, 0, buf.length, size - buf.length);
    fs.closeSync(fd);
    return buf.toString('utf8');
  } catch {
    return '';
  }
}

function runnerAlive() {
  try {
    execFileSync('pgrep', ['-f', 'run-report-matrix.sh']);
    return true;
  } catch {
    return false;
  }
}

const loadHistory = [];
function sampleLoad() {
  loadHistory.push([Date.now(), os.loadavg()[0]]);
  const cutoff = Date.now() - 8 * 3600e3;
  while (loadHistory.length && loadHistory[0][0] < cutoff) loadHistory.shift();
}
sampleLoad();
setInterval(sampleLoad, 10e3);

function status() {
  const files = fs.readdirSync(resultsDir);
  const units = plan();
  const logLines = fs.existsSync(UNIT_LOG) ? fs.readFileSync(UNIT_LOG, 'utf8').trim().split('\n') : [];

  for (const u of units) {
    const prefix = `${u.mode}-${u.label}-`;
    const mine = files.filter(f => f.startsWith(prefix) && /^\d+(\.discarded)?\.json$/.test(f.slice(prefix.length)));
    const kept = mine.filter(f => !f.includes('.discarded'));
    u.discarded = mine.length - kept.length;
    u.overLimit = logLines.some(l => l.includes(` done ${u.label} `) && l.includes('kept over limit'));
    if (kept.length) {
      const info = fileInfo(kept.sort().at(-1));
      u.state = 'done';
      u.durationMs = info.start ? info.end - info.start : null;
      u.loadStart = info.loadStart;
      u.loadEnd = info.loadEnd;
      u.finishedAt = info.end;
      u.sha = info.sha;
    } else {
      u.state = 'pending';
    }
  }

  // The runner's last output line: a progress counter or a gate wait.
  const raw = tail(RUNNER_LOG, 8192).split(/[\r\n]+/).map(s => s.trim()).filter(Boolean);
  const lastLine = raw.at(-1) || '';
  const alive = runnerAlive();
  const next = units.find(u => u.state === 'pending');
  let phase = 'finished';
  if (next) {
    if (!alive) phase = 'stopped';
    else if (lastLine.startsWith('waiting before')) phase = 'waiting';
    else phase = 'running';
    next.state = phase === 'stopped' ? 'pending' : phase;
  }
  const progress = /(\d+)\/(\d+)\s*$/.exec(lastLine);

  // ETA: same unit in an earlier restart, else the mean of its kind, else the
  // mean of everything done. Gate waits aren't included.
  const done = units.filter(u => u.state === 'done' && u.durationMs);
  const byKind = {};
  for (const u of done) (byKind[u.kind] ||= []).push(u.durationMs);
  const mean = xs => xs.reduce((a, b) => a + b, 0) / xs.length;
  const overall = done.length ? mean(done.map(u => u.durationMs)) : null;
  let remainingMs = 0;
  let estimated = true;
  for (const u of units) {
    if (u.state === 'done') continue;
    const same = units.find(v => v.label.replace(`-r${v.restart}`, '') === u.label.replace(`-r${u.restart}`, '') && v.state === 'done' && v.durationMs);
    const est = same ? same.durationMs : byKind[u.kind] ? mean(byKind[u.kind]) : overall;
    if (est == null) {
      estimated = false;
      continue;
    }
    u.estimateMs = est;
    if (u === next && phase === 'running') {
      const started = (logLines.length && Date.parse(logLines.at(-1).slice(0, 19).replace(' ', 'T'))) || Date.now();
      remainingMs += Math.max(est - (Date.now() - started), 0);
    } else {
      remainingMs += est;
    }
  }

  return {
    now: Date.now(),
    tag: TAG,
    restarts: RESTARTS,
    loadLimit: LOAD_LIMIT,
    discardLimit: DISCARD_LIMIT,
    load: os.loadavg(),
    loadHistory,
    alive,
    phase,
    lastLine: lastLine.slice(0, 200),
    progress: progress ? {done: +progress[1], total: +progress[2]} : null,
    current: next ? next.label : null,
    total: units.length,
    doneCount: units.filter(u => u.state === 'done').length,
    discardedAttempts: units.reduce((a, u) => a + u.discarded, 0),
    overLimitUnits: units.filter(u => u.overLimit).length,
    remainingMs: estimated || remainingMs ? remainingMs : null,
    etaPartial: !estimated,
    units,
    log: logLines.slice(-12),
    shas: [...new Set(units.map(u => u.sha).filter(Boolean))],
  };
}

const page = String.raw`<!doctype html>
<html lang="en"><head><meta charset="utf-8"><title>Benchmark matrix</title>
<meta name="viewport" content="width=device-width, initial-scale=1">
<style>
.viz-root{
  --surface-0:#f4f3ef;--surface-1:#fcfcfb;--text-primary:#0b0b0b;--text-secondary:#52514e;--muted:#898781;
  --grid:#e1e0d9;--axis:#c3c2b7;--series-1:#2a78d6;--good:#0ca30c;--warning:#fab219;--serious:#ec835a;--critical:#d03b3b;
}
@media (prefers-color-scheme: dark){.viz-root{color-scheme:dark;
  --surface-0:#111110;--surface-1:#1a1a19;--text-primary:#f0efec;--text-secondary:#c3c2b7;--grid:#2c2c2a;--axis:#383835;--series-1:#3987e5;}}
*{box-sizing:border-box}
body{margin:0;font:14px/1.45 -apple-system,BlinkMacSystemFont,"Segoe UI",sans-serif;background:var(--surface-0);color:var(--text-primary)}
main{max-width:1100px;margin:0 auto;padding:24px}
h1{font-size:18px;margin:0 0 4px}h2{font-size:14px;margin:0 0 10px;color:var(--text-secondary);font-weight:600}
.sub{color:var(--text-secondary);margin:0 0 18px}
.card{background:var(--surface-1);border-radius:10px;padding:16px 18px;margin-bottom:14px;box-shadow:0 0 0 1px var(--grid)}
.hero{display:grid;grid-template-columns:auto 1fr;gap:6px 28px;align-items:end}
.big{font-size:44px;font-weight:650;line-height:1;font-variant-numeric:tabular-nums}
.big small{font-size:18px;color:var(--text-secondary);font-weight:500}
.stats{display:flex;gap:28px;flex-wrap:wrap}
.stat .k{color:var(--text-secondary);font-size:12px}.stat .v{font-size:18px;font-weight:600;font-variant-numeric:tabular-nums}
.bar{grid-column:1/-1;height:10px;background:var(--grid);border-radius:5px;overflow:hidden;margin-top:10px}
.bar>div{height:100%;background:var(--series-1);border-radius:0 4px 4px 0;transition:width .4s}
@media (prefers-reduced-motion: reduce){.bar>div{transition:none}.cell.running{animation:none!important}}
.now{display:flex;gap:10px;align-items:center;flex-wrap:wrap}
.pill{display:inline-flex;gap:6px;align-items:center;padding:2px 10px;border-radius:999px;font-weight:600;font-size:12px;border:1.5px solid currentColor}
.mono{font-family:ui-monospace,SFMono-Regular,Menlo,monospace;font-size:12.5px}
.sub-bar{height:6px;background:var(--grid);border-radius:3px;overflow:hidden;width:220px}.sub-bar>div{height:100%;background:var(--series-1)}
svg text{fill:var(--muted);font-size:11px}
.row{display:grid;grid-template-columns:70px 1fr;gap:8px;align-items:start;margin:6px 0}
.row .rl{color:var(--text-secondary);font-size:12px;padding-top:4px}
.groups{display:flex;gap:14px;flex-wrap:wrap}
.group .gl{font-size:11px;color:var(--muted);margin-bottom:3px}
.cells{display:flex;gap:2px;flex-wrap:wrap}
.cell{width:22px;height:22px;border-radius:4px;display:grid;place-items:center;font-size:11px;font-weight:700;cursor:default;
  background:var(--surface-1);box-shadow:inset 0 0 0 1.5px var(--axis);color:var(--muted)}
.cell.done{background:var(--good);box-shadow:none;color:#fff}
.cell.done.warn{background:var(--warning);color:#0b0b0b}
.cell.done.over{background:var(--serious);color:#0b0b0b}
.cell.running{background:var(--series-1);box-shadow:none;color:#fff;animation:pulse 1.6s ease-in-out infinite}
.cell.waiting{box-shadow:inset 0 0 0 2px var(--series-1);color:var(--series-1)}
@keyframes pulse{50%{opacity:.55}}
.legend{display:flex;gap:16px;flex-wrap:wrap;font-size:12px;color:var(--text-secondary);margin-top:10px}
.legend span{display:inline-flex;gap:6px;align-items:center}.legend .cell{width:16px;height:16px;font-size:9px}
#tip{position:fixed;pointer-events:none;background:var(--surface-1);color:var(--text-primary);box-shadow:0 2px 10px rgba(0,0,0,.18),0 0 0 1px var(--grid);
  border-radius:8px;padding:8px 10px;font-size:12px;display:none;z-index:9;max-width:320px}
#tip b{display:block;margin-bottom:2px}
pre{margin:0;white-space:pre-wrap;color:var(--text-secondary)}
details summary{cursor:pointer;color:var(--text-secondary)}
table{border-collapse:collapse;width:100%;font-size:12px;margin-top:8px}td,th{padding:3px 8px;border-bottom:1px solid var(--grid);text-align:left}
th{color:var(--text-secondary);font-weight:600}td.r{text-align:right;font-variant-numeric:tabular-nums}
.stale{color:var(--critical);font-weight:600}
</style></head>
<body class="viz-root"><main>
<h1>use(store) report benchmarks</h1>
<p class="sub" id="sub">Loading…</p>

<section class="card hero" aria-label="Overall progress">
  <div><div class="big" id="count">–</div><div class="sub" style="margin:4px 0 0">timing units done</div></div>
  <div class="stats">
    <div class="stat"><div class="k">Estimated time left</div><div class="v" id="eta">–</div></div>
    <div class="stat"><div class="k">Finishes around</div><div class="v" id="finish">–</div></div>
    <div class="stat"><div class="k">Load (1 min)</div><div class="v" id="load">–</div></div>
    <div class="stat"><div class="k">Discarded attempts</div><div class="v" id="disc">–</div></div>
  </div>
  <div class="bar" role="progressbar" aria-label="Units done" id="barwrap"><div id="bar" style="width:0"></div></div>
</section>

<section class="card" aria-label="Now">
  <h2>Now</h2>
  <div class="now"><span class="pill" id="phase">–</span><span class="mono" id="current"></span>
    <div class="sub-bar" id="subbar" hidden><div id="subbarfill"></div></div><span class="mono" id="subtext"></span></div>
  <div class="mono" id="last" style="margin-top:8px;color:var(--muted)"></div>
</section>

<section class="card" aria-label="Load average">
  <h2>Load average, 1 minute</h2>
  <div id="chart" style="position:relative"></div>
</section>

<section class="card" aria-label="Units">
  <h2>Units by restart (in run order; restart 2 runs in reverse)</h2>
  <div id="grid"></div>
  <div class="legend">
    <span><i class="cell done">✓</i>done</span>
    <span><i class="cell done warn">!</i>done after discarded attempts</span>
    <span><i class="cell done over">×</i>kept over the discard limit</span>
    <span><i class="cell running">▶</i>running</span>
    <span><i class="cell waiting">…</i>waiting for the load gate</span>
    <span><i class="cell"> </i>pending</span>
  </div>
  <details style="margin-top:12px"><summary>Table view</summary><div id="table"></div></details>
</section>

<section class="card" aria-label="Unit log"><h2>Unit log</h2><pre class="mono" id="log"></pre></section>
</main>
<div id="tip" role="tooltip"></div>
<script>
const $ = id => document.getElementById(id);
const fmtDur = ms => { if (ms == null) return '–'; const m = Math.round(ms / 60000); if (m < 60) return m + ' min'; return Math.floor(m / 60) + ' h ' + String(m % 60).padStart(2, '0') + ' min'; };
const fmtSec = ms => ms == null ? '–' : (ms / 60000).toFixed(1) + ' min';
const fmtTime = t => new Date(t).toLocaleTimeString([], {hour: 'numeric', minute: '2-digit'});
const tip = $('tip');
function showTip(e, html) { tip.innerHTML = html; tip.style.display = 'block'; const x = Math.min(e.clientX + 14, innerWidth - tip.offsetWidth - 8); tip.style.left = x + 'px'; tip.style.top = (e.clientY + 14) + 'px'; }
function hideTip() { tip.style.display = 'none'; }
const ICON = {done: '✓', running: '▶', waiting: '…', pending: ' '};

function unitTip(u) {
  const lines = ['<b>' + u.label + '</b>', 'restart ' + u.restart + ' · ' + u.group + ' · ' + u.name, 'state: ' + u.state];
  if (u.durationMs) lines.push('took ' + fmtSec(u.durationMs) + ', finished ' + fmtTime(u.finishedAt));
  if (u.loadStart != null) lines.push('load ' + u.loadStart.toFixed(2) + ' → ' + (u.loadEnd ?? NaN).toFixed(2));
  if (u.discarded) lines.push(u.discarded + ' discarded attempt' + (u.discarded > 1 ? 's' : ''));
  if (u.overLimit) lines.push('kept over the discard limit');
  if (u.state !== 'done' && u.estimateMs) lines.push('estimate ' + fmtSec(u.estimateMs));
  return lines.join('<br>');
}

function renderGrid(s) {
  const grid = $('grid'); grid.innerHTML = '';
  for (let r = 1; r <= s.restarts; r++) {
    const row = document.createElement('div'); row.className = 'row';
    row.innerHTML = '<div class="rl">restart ' + r + '</div>';
    const groups = document.createElement('div'); groups.className = 'groups';
    const units = s.units.filter(u => u.restart === r).sort((a, b) => a.order - b.order);
    let current = null, box = null;
    for (const u of units) {
      if (u.group !== current) {
        current = u.group;
        const g = document.createElement('div'); g.className = 'group';
        g.innerHTML = '<div class="gl">' + u.group + '</div><div class="cells"></div>';
        groups.appendChild(g); box = g.lastChild;
      }
      const c = document.createElement('div');
      c.className = 'cell ' + u.state + (u.state === 'done' && u.overLimit ? ' over' : u.state === 'done' && u.discarded ? ' warn' : '');
      c.textContent = u.state === 'done' && u.overLimit ? '×' : u.state === 'done' && u.discarded ? '!' : ICON[u.state];
      c.setAttribute('aria-label', u.label + ': ' + u.state);
      c.onmousemove = e => showTip(e, unitTip(u)); c.onmouseleave = hideTip;
      box.appendChild(c);
    }
    row.appendChild(groups); grid.appendChild(row);
  }
  const rows = s.units.slice().sort((a, b) => a.order - b.order).map(u =>
    '<tr><td>' + u.order + '</td><td class="mono">' + u.label + '</td><td>' + u.state + (u.discarded ? ' (' + u.discarded + ' discarded)' : '') + (u.overLimit ? ' (over limit)' : '') +
    '</td><td class="r">' + (u.durationMs ? fmtSec(u.durationMs) : u.estimateMs ? '~' + fmtSec(u.estimateMs) : '–') +
    '</td><td class="r">' + (u.loadStart != null ? u.loadStart.toFixed(2) + ' → ' + u.loadEnd.toFixed(2) : '–') + '</td></tr>').join('');
  $('table').innerHTML = '<table><thead><tr><th>#</th><th>Unit</th><th>State</th><th>Time</th><th>Load</th></tr></thead><tbody>' + rows + '</tbody></table>';
}

function renderChart(s) {
  const pts = s.loadHistory; const el = $('chart');
  const W = el.clientWidth || 1000, H = 180, L = 34, R = 70, T = 10, B = 24;
  if (pts.length < 2) { el.innerHTML = '<p class="sub">Collecting samples (every 10 s)…</p>'; return; }
  const t0 = pts[0][0], t1 = pts.at(-1)[0];
  const ymax = Math.max(s.discardLimit + 2, Math.ceil(Math.max(...pts.map(p => p[1])) + 1));
  const x = t => L + (W - L - R) * (t - t0) / Math.max(t1 - t0, 1);
  const y = v => T + (H - T - B) * (1 - v / ymax);
  const ticks = []; const step = ymax > 20 ? 5 : ymax > 10 ? 2 : 1;
  for (let v = 0; v <= ymax; v += step) ticks.push(v);
  const grid = ticks.map(v => '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="var(--grid)" stroke-width="1"/><text x="' + (L - 6) + '" y="' + (y(v) + 4) + '" text-anchor="end">' + v + '</text>').join('');
  const ref = (v, label) => '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v) + '" y2="' + y(v) + '" stroke="var(--text-secondary)" stroke-width="1" stroke-dasharray="4 3"/><text x="' + (W - R + 6) + '" y="' + (y(v) + 4) + '" style="fill:var(--text-secondary)">' + label + '</text>';
  const xt = []; const span = t1 - t0; const every = span > 4 * 3600e3 ? 3600e3 : span > 3600e3 ? 1800e3 : 600e3;
  for (let t = Math.ceil(t0 / every) * every; t <= t1; t += every) xt.push('<text x="' + x(t) + '" y="' + (H - 6) + '" text-anchor="middle">' + fmtTime(t) + '</text>');
  const d = pts.map((p, i) => (i ? 'L' : 'M') + x(p[0]).toFixed(1) + ' ' + y(p[1]).toFixed(1)).join('');
  el.innerHTML = '<svg width="' + W + '" height="' + H + '" role="img" aria-label="Load average over time, currently ' + s.load[0].toFixed(2) + '">' + grid +
    '<line x1="' + L + '" x2="' + (W - R) + '" y1="' + y(0) + '" y2="' + y(0) + '" stroke="var(--axis)"/>' +
    ref(s.loadLimit, 'start ≤ ' + s.loadLimit) + ref(s.discardLimit, 'discard > ' + s.discardLimit) + xt.join('') +
    '<path d="' + d + '" fill="none" stroke="var(--series-1)" stroke-width="2" stroke-linejoin="round"/>' +
    '<line id="cross" y1="' + T + '" y2="' + (H - B) + '" stroke="var(--axis)" visibility="hidden"/><circle id="dot" r="4" fill="var(--series-1)" stroke="var(--surface-1)" stroke-width="2" visibility="hidden"/>' +
    '<rect x="' + L + '" y="' + T + '" width="' + (W - L - R) + '" height="' + (H - T - B) + '" fill="transparent" id="hit"/></svg>';
  const svg = el.firstChild, hit = svg.querySelector('#hit'), cross = svg.querySelector('#cross'), dot = svg.querySelector('#dot');
  hit.onmousemove = e => {
    const bx = e.clientX - svg.getBoundingClientRect().left; const t = t0 + (bx - L) / (W - L - R) * (t1 - t0);
    let best = pts[0]; for (const p of pts) if (Math.abs(p[0] - t) < Math.abs(best[0] - t)) best = p;
    cross.setAttribute('x1', x(best[0])); cross.setAttribute('x2', x(best[0])); cross.setAttribute('visibility', 'visible');
    dot.setAttribute('cx', x(best[0])); dot.setAttribute('cy', y(best[1])); dot.setAttribute('visibility', 'visible');
    showTip(e, '<b>' + fmtTime(best[0]) + '</b>load ' + best[1].toFixed(2));
  };
  hit.onmouseleave = () => { cross.setAttribute('visibility', 'hidden'); dot.setAttribute('visibility', 'hidden'); hideTip(); };
}

const PHASE = {running: ['▶ running', 'var(--series-1)'], waiting: ['… waiting for load', 'var(--series-1)'], stopped: ['■ runner stopped', 'var(--critical)'], finished: ['✓ finished', 'var(--good)']};
let lastOk = 0;
async function tick() {
  try {
    const s = await (await fetch('/status.json', {cache: 'no-store'})).json();
    lastOk = Date.now();
    $('sub').textContent = 'Build ' + (s.shas.map(x => x.slice(0, 8)).join(', ') || '(none yet)') + ' · ' + s.restarts + ' restarts · tag ' + s.tag + ' · updated ' + fmtTime(s.now);
    $('count').innerHTML = s.doneCount + ' <small>/ ' + s.total + '</small>';
    $('bar').style.width = (100 * s.doneCount / s.total) + '%';
    $('barwrap').setAttribute('aria-valuenow', s.doneCount); $('barwrap').setAttribute('aria-valuemax', s.total);
    $('eta').textContent = s.phase === 'finished' ? 'done' : s.remainingMs == null ? 'after the first unit' : (s.etaPartial ? '≥ ' : '~') + fmtDur(s.remainingMs);
    $('finish').textContent = s.phase === 'finished' || s.remainingMs == null ? '–' : fmtTime(s.now + s.remainingMs);
    $('load').textContent = s.load.map(v => v.toFixed(2)).join(' · ');
    $('disc').textContent = s.discardedAttempts + (s.overLimitUnits ? ' (' + s.overLimitUnits + ' kept over)' : '');
    const [txt, color] = PHASE[s.phase]; const p = $('phase'); p.textContent = txt; p.style.color = color;
    $('current').textContent = s.current || '';
    if (s.progress && s.phase === 'running') { $('subbar').hidden = false; $('subbarfill').style.width = (100 * s.progress.done / s.progress.total) + '%'; $('subtext').textContent = s.progress.done + '/' + s.progress.total + ' configs'; }
    else { $('subbar').hidden = true; $('subtext').textContent = ''; }
    $('last').textContent = s.lastLine;
    $('log').textContent = s.log.join('\n');
    renderGrid(s); renderChart(s);
  } catch (e) {
    $('sub').innerHTML = '<span class="stale">Status server not responding (last update ' + (lastOk ? fmtTime(lastOk) : 'never') + ')</span>';
  }
}
tick(); setInterval(tick, 3000);
addEventListener('resize', tick);
</script></body></html>`;

http
  .createServer((req, res) => {
    if (req.url.startsWith('/status.json')) {
      try {
        const body = JSON.stringify(status());
        res.writeHead(200, {'content-type': 'application/json', 'cache-control': 'no-store'});
        res.end(body);
      } catch (error) {
        res.writeHead(500, {'content-type': 'text/plain'});
        res.end(String(error.stack || error));
      }
      return;
    }
    res.writeHead(200, {'content-type': 'text/html; charset=utf-8'});
    res.end(page);
  })
  .listen(PORT, '127.0.0.1', () => console.log(`matrix status: http://localhost:${PORT}`));
