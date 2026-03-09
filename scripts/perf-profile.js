'use strict';

// ---------------------------------------------------------------------------
// perf-profile.js — Automated performance profiling for a tap interaction.
//
// Captures a performance trace + app logs around a tap interaction and outputs
// a structured timing breakdown that can be used for iterative optimization.
//
// Usage:
//   node scripts/perf-profile.js [--tap <element-id>] [--runs <n>] [--warmup <n>]
//
// Defaults:
//   --tap stress-increment-all
//   --runs 1
//   --warmup 1
//
// Prereqs:
//   1. Dev server running (npm run dev)
//   2. Falcon app running in simulator
//
// Output: Structured text timing report to stdout.
// Trace file saved to /tmp/falcon-trace.json for manual inspection.
// ---------------------------------------------------------------------------

var http = require('http');
var WebSocket = require('ws');
var fs = require('fs');
var {execSync} = require('child_process');

var CDP_PORT = 6001;
var TRACE_TIMEOUT = 15000;
var TRACE_PATH = '/tmp/falcon-trace.json';

// ---------------------------------------------------------------------------
// Arg parsing
// ---------------------------------------------------------------------------

function parseArgs() {
  var args = process.argv.slice(2);
  var opts = {
    tap: 'stress-increment-all',
    runs: 1,
    warmup: 1,
  };
  for (var i = 0; i < args.length; i++) {
    if (args[i] === '--tap' && args[i + 1]) {
      opts.tap = args[++i];
    } else if (args[i] === '--runs' && args[i + 1]) {
      opts.runs = parseInt(args[++i], 10);
    } else if (args[i] === '--warmup' && args[i + 1]) {
      opts.warmup = parseInt(args[++i], 10);
    }
  }
  return opts;
}

// ---------------------------------------------------------------------------
// CLI helpers
// ---------------------------------------------------------------------------

function run(cmd) {
  return execSync(cmd, {cwd: process.cwd(), encoding: 'utf8', timeout: 30000});
}

function tap(elementId) {
  run('npm run app:tap -- demo "id:' + elementId + '"');
}

function startLogs() {
  run('npm run app:log-start');
}

function readLogs() {
  try {
    return run('npm run app:log-read');
  } catch (e) {
    return '(log read failed)';
  }
}

function stopLogs() {
  try {
    return run('npm run app:log-stop');
  } catch (e) {
    return '(log stop failed)';
  }
}

function sleep(ms) {
  return new Promise(function (resolve) {
    setTimeout(resolve, ms);
  });
}

// ---------------------------------------------------------------------------
// CDP helpers
// ---------------------------------------------------------------------------

function discoverTarget() {
  return new Promise(function (resolve, reject) {
    http
      .get('http://127.0.0.1:' + CDP_PORT + '/json', function (res) {
        var data = '';
        res.on('data', function (chunk) {
          data += chunk;
        });
        res.on('end', function () {
          try {
            var targets = JSON.parse(data);
            if (!targets || targets.length === 0) {
              reject(new Error('No CDP targets found'));
            }
            resolve(targets[0]);
          } catch (e) {
            reject(new Error('Could not parse /json: ' + data));
          }
        });
      })
      .on('error', function () {
        reject(
          new Error(
            'Could not connect to inspector proxy on port ' +
              CDP_PORT +
              '. Is the dev server running?',
          ),
        );
      });
  });
}

function startTrace(wsUrl) {
  return new Promise(function (resolve, reject) {
    var ws = new WebSocket(wsUrl);
    ws.on('error', function (err) {
      reject(err);
    });
    ws.on('open', function () {
      ws.send(JSON.stringify({id: 1, method: 'Tracing.start', params: {}}));
    });
    ws.on('message', function (raw) {
      var msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch (e) {
        return;
      }
      if (msg.id === 1) {
        resolve(ws);
      }
    });
    setTimeout(function () {
      reject(new Error('Timed out waiting for Tracing.start ack'));
    }, TRACE_TIMEOUT);
  });
}

function stopTrace(ws) {
  return new Promise(function (resolve, reject) {
    var allEvents = [];

    function onMessage(raw) {
      var msg;
      try {
        msg = JSON.parse(raw.toString());
      } catch (e) {
        return;
      }
      if (
        msg.method === 'Tracing.dataCollected' &&
        msg.params &&
        msg.params.value
      ) {
        allEvents = allEvents.concat(msg.params.value);
      }
      if (msg.method === 'Tracing.tracingComplete') {
        ws.removeListener('message', onMessage);
        ws.close();
        resolve(allEvents);
      }
    }

    ws.on('message', onMessage);
    ws.send(JSON.stringify({id: 2, method: 'Tracing.end', params: {}}));

    setTimeout(function () {
      reject(new Error('Timed out waiting for trace data'));
    }, TRACE_TIMEOUT);
  });
}

// ---------------------------------------------------------------------------
// Trace analysis
// ---------------------------------------------------------------------------

function analyzeTrace(events) {
  var timing = events.filter(function (e) {
    return e.cat === 'blink.user_timing';
  });

  // Pair begin/end events
  var begins = {};
  var durations = [];
  for (var i = 0; i < timing.length; i++) {
    var e = timing[i];
    var localId = (e.id2 && e.id2.local) || '';
    var key = e.name + '::' + localId;

    if (e.ph === 'b') {
      begins[key] = e;
    } else if (e.ph === 'e' && begins[key]) {
      var b = begins[key];
      var dur_ms = (e.ts - b.ts) / 1000;
      var track = '?';
      try {
        var detail = JSON.parse(b.args.detail);
        track = detail.devtools.track || '?';
      } catch (err) {
        // ignore
      }
      durations.push({name: e.name, dur_ms: dur_ms, track: track, ts: b.ts});
    }
  }

  // Group by track
  var byTrack = {};
  for (var j = 0; j < durations.length; j++) {
    var d = durations[j];
    if (!byTrack[d.track]) byTrack[d.track] = [];
    byTrack[d.track].push(d);
  }

  // Extract lifecycle phases from Transition track
  var phases = {};
  var lifecycleNames = [
    'Update',
    'Render',
    'Commit',
    'Remaining Effects',
    'Waiting for Paint',
  ];
  var transitionEvents = byTrack['Transition'] || [];
  for (var k = 0; k < transitionEvents.length; k++) {
    var te = transitionEvents[k];
    if (lifecycleNames.indexOf(te.name) !== -1) {
      phases[te.name] = te.dur_ms;
    }
  }

  // Extract shadow tree breakdown
  var shadowTree = {};
  var shadowTreeNames = [
    'Resolve Tree',
    'Wait Speculative Layout',
    'Commit',
    'Apply Mutations',
    'Prepare Paint',
    'Native Paint',
    'CA Commit',
    'Blocked (Layout)',
    'Report Timing',
    'Promote',
  ];
  var shadowEvents = byTrack['Shadow Tree'] || [];
  for (var m = 0; m < shadowEvents.length; m++) {
    var se = shadowEvents[m];
    // Match Apply Mutations with count in name
    var seName = se.name;
    if (seName.indexOf('Apply Mutations') === 0) seName = 'Apply Mutations';
    if (shadowTreeNames.indexOf(seName) !== -1) {
      shadowTree[seName] = (shadowTree[seName] || 0) + se.dur_ms;
    }
  }

  // Extract layout breakdown
  var layout = {};
  var layoutNames = [
    'Calculate Layout',
    'Scroll Content',
    'Yoga',
    'Read Frames',
  ];
  var layoutEvents = byTrack['Layout'] || [];
  for (var n = 0; n < layoutEvents.length; n++) {
    var le = layoutEvents[n];
    if (layoutNames.indexOf(le.name) !== -1) {
      layout[le.name] = (layout[le.name] || 0) + le.dur_ms;
    }
  }

  // Element-level operations in shadow tree
  var elementOps = {};
  var opNames = [
    'CREATE',
    'INSERT',
    'UPDATE',
    'REMOVE',
    'DELETE',
  ];
  for (var p = 0; p < shadowEvents.length; p++) {
    var op = shadowEvents[p];
    for (var q = 0; q < opNames.length; q++) {
      if (op.name.indexOf(opNames[q] + ' ') === 0) {
        var opKey = op.name;
        if (!elementOps[opKey]) elementOps[opKey] = {count: 0, total_ms: 0};
        elementOps[opKey].count++;
        elementOps[opKey].total_ms += op.dur_ms;
        break;
      }
    }
  }

  // Speculative layout
  var specLayout = byTrack['Speculative Layout'] || [];
  var specLayoutTotal = 0;
  var specLayoutCount = 0;
  for (var r = 0; r < specLayout.length; r++) {
    specLayoutTotal += specLayout[r].dur_ms;
    specLayoutCount++;
  }

  // Component render times
  var components = {};
  var compEvents = byTrack['Components ⚛'] || [];
  for (var s = 0; s < compEvents.length; s++) {
    var ce = compEvents[s];
    if (!components[ce.name]) components[ce.name] = {count: 0, total_ms: 0};
    components[ce.name].count++;
    components[ce.name].total_ms += ce.dur_ms;
  }

  // Track totals
  var trackTotals = {};
  var tracks = Object.keys(byTrack);
  for (var t = 0; t < tracks.length; t++) {
    var trackName = tracks[t];
    var total = 0;
    for (var u = 0; u < byTrack[trackName].length; u++) {
      total += byTrack[trackName][u].dur_ms;
    }
    trackTotals[trackName] = {
      events: byTrack[trackName].length,
      total_ms: total,
    };
  }

  // Total interaction time (Transition track total)
  var totalInteraction =
    (phases['Update'] || 0) +
    (phases['Render'] || 0) +
    (phases['Commit'] || 0) +
    (phases['Remaining Effects'] || 0) +
    (phases['Waiting for Paint'] || 0);

  return {
    total_ms: totalInteraction,
    phases: phases,
    shadowTree: shadowTree,
    layout: layout,
    elementOps: elementOps,
    specLayout: {count: specLayoutCount, total_ms: specLayoutTotal},
    components: components,
    trackTotals: trackTotals,
    eventCount: timing.length,
  };
}

// ---------------------------------------------------------------------------
// Output formatting
// ---------------------------------------------------------------------------

function pad(str, len) {
  while (str.length < len) str += ' ';
  return str;
}

function fmtMs(ms) {
  return ms.toFixed(2) + ' ms';
}

function formatReport(result, opts) {
  var lines = [];
  var target10x = result.total_ms / 10;

  lines.push('=== PERF PROFILE: tap "id:' + opts.tap + '" ===');
  lines.push('');

  // Total
  lines.push(
    'TOTAL: ' + fmtMs(result.total_ms) + '  (10x target: ' + fmtMs(target10x) + ')',
  );
  lines.push('');

  // Phases
  lines.push('REACT PHASES:');
  var phaseOrder = [
    'Update',
    'Render',
    'Commit',
    'Remaining Effects',
    'Waiting for Paint',
  ];
  var maxPhase = 0;
  for (var i = 0; i < phaseOrder.length; i++) {
    var v = result.phases[phaseOrder[i]] || 0;
    if (v > maxPhase) maxPhase = v;
  }
  for (var j = 0; j < phaseOrder.length; j++) {
    var name = phaseOrder[j];
    var val = result.phases[name] || 0;
    var marker = val === maxPhase && val > 1 ? '  ◀ SLOWEST' : '';
    lines.push('  ' + pad(name + ':', 22) + pad(fmtMs(val), 12) + marker);
  }
  lines.push('');

  // Shadow Tree
  lines.push(
    'SHADOW TREE (' +
      fmtMs(result.trackTotals['Shadow Tree']?.total_ms || 0) +
      ' total, ' +
      (result.trackTotals['Shadow Tree']?.events || 0) +
      ' events):',
  );
  var stOrder = [
    'Resolve Tree',
    'Promote',
    'Wait Speculative Layout',
    'Blocked (Layout)',
    'Commit',
    'Apply Mutations',
    'Prepare Paint',
    'Native Paint',
    'CA Commit',
    'Report Timing',
  ];
  for (var k = 0; k < stOrder.length; k++) {
    var stName = stOrder[k];
    var stVal = result.shadowTree[stName];
    if (stVal !== undefined) {
      lines.push('  ' + pad(stName + ':', 28) + fmtMs(stVal));
    }
  }
  lines.push('');

  // Element operations
  var opKeys = Object.keys(result.elementOps);
  if (opKeys.length > 0) {
    lines.push('ELEMENT OPERATIONS:');
    // Sort by total_ms descending
    opKeys.sort(function (a, b) {
      return result.elementOps[b].total_ms - result.elementOps[a].total_ms;
    });
    for (var m = 0; m < Math.min(opKeys.length, 10); m++) {
      var opName = opKeys[m];
      var op = result.elementOps[opName];
      lines.push(
        '  ' +
          pad(opName + ':', 28) +
          pad(fmtMs(op.total_ms), 12) +
          '(' +
          op.count +
          'x, avg ' +
          fmtMs(op.total_ms / op.count) +
          ')',
      );
    }
    lines.push('');
  }

  // Layout
  lines.push(
    'LAYOUT (' +
      fmtMs(result.trackTotals['Layout']?.total_ms || 0) +
      ' total):',
  );
  var layoutOrder = ['Calculate Layout', 'Scroll Content', 'Yoga', 'Read Frames'];
  for (var n = 0; n < layoutOrder.length; n++) {
    var lName = layoutOrder[n];
    var lVal = result.layout[lName];
    if (lVal !== undefined) {
      lines.push('  ' + pad(lName + ':', 28) + fmtMs(lVal));
    }
  }
  lines.push('');

  // Speculative layout
  if (result.specLayout.count > 0) {
    lines.push(
      'SPECULATIVE LAYOUT:          ' +
        fmtMs(result.specLayout.total_ms) +
        ' (' +
        result.specLayout.count +
        ' calls)',
    );
    lines.push('');
  }

  // Components
  var compKeys = Object.keys(result.components);
  if (compKeys.length > 0) {
    lines.push(
      'COMPONENTS (' +
        fmtMs(result.trackTotals['Components ⚛']?.total_ms || 0) +
        ' total):',
    );
    compKeys.sort(function (a, b) {
      return result.components[b].total_ms - result.components[a].total_ms;
    });
    for (var p = 0; p < Math.min(compKeys.length, 10); p++) {
      var cName = compKeys[p];
      var comp = result.components[cName];
      lines.push(
        '  ' +
          pad(cName + ':', 28) +
          pad(fmtMs(comp.total_ms), 12) +
          '(' +
          comp.count +
          'x)',
      );
    }
    lines.push('');
  }

  lines.push('Total trace events: ' + result.eventCount);

  return lines.join('\n');
}

// ---------------------------------------------------------------------------
// Multi-run support
// ---------------------------------------------------------------------------

function mergeResults(results) {
  if (results.length === 1) return results[0];

  var merged = JSON.parse(JSON.stringify(results[0]));
  var n = results.length;

  // Average all numeric fields
  for (var i = 1; i < n; i++) {
    var r = results[i];
    merged.total_ms += r.total_ms;
    var phaseKeys = Object.keys(r.phases);
    for (var j = 0; j < phaseKeys.length; j++) {
      merged.phases[phaseKeys[j]] =
        (merged.phases[phaseKeys[j]] || 0) + r.phases[phaseKeys[j]];
    }
    var stKeys = Object.keys(r.shadowTree);
    for (var k = 0; k < stKeys.length; k++) {
      merged.shadowTree[stKeys[k]] =
        (merged.shadowTree[stKeys[k]] || 0) + r.shadowTree[stKeys[k]];
    }
    var lKeys = Object.keys(r.layout);
    for (var m = 0; m < lKeys.length; m++) {
      merged.layout[lKeys[m]] =
        (merged.layout[lKeys[m]] || 0) + r.layout[lKeys[m]];
    }
    merged.specLayout.total_ms += r.specLayout.total_ms;
    merged.specLayout.count += r.specLayout.count;
    var cKeys = Object.keys(r.components);
    for (var p = 0; p < cKeys.length; p++) {
      if (!merged.components[cKeys[p]]) {
        merged.components[cKeys[p]] = {count: 0, total_ms: 0};
      }
      merged.components[cKeys[p]].total_ms += r.components[cKeys[p]].total_ms;
      merged.components[cKeys[p]].count += r.components[cKeys[p]].count;
    }
    var tKeys = Object.keys(r.trackTotals);
    for (var q = 0; q < tKeys.length; q++) {
      if (!merged.trackTotals[tKeys[q]]) {
        merged.trackTotals[tKeys[q]] = {events: 0, total_ms: 0};
      }
      merged.trackTotals[tKeys[q]].total_ms += r.trackTotals[tKeys[q]].total_ms;
      merged.trackTotals[tKeys[q]].events += r.trackTotals[tKeys[q]].events;
    }
    merged.eventCount += r.eventCount;
  }

  // Divide by n
  merged.total_ms /= n;
  var allPhases = Object.keys(merged.phases);
  for (var a = 0; a < allPhases.length; a++) merged.phases[allPhases[a]] /= n;
  var allSt = Object.keys(merged.shadowTree);
  for (var b = 0; b < allSt.length; b++) merged.shadowTree[allSt[b]] /= n;
  var allL = Object.keys(merged.layout);
  for (var c = 0; c < allL.length; c++) merged.layout[allL[c]] /= n;
  merged.specLayout.total_ms /= n;
  merged.specLayout.count /= n;
  var allC = Object.keys(merged.components);
  for (var d = 0; d < allC.length; d++) {
    merged.components[allC[d]].total_ms /= n;
    merged.components[allC[d]].count /= n;
  }
  var allT = Object.keys(merged.trackTotals);
  for (var e = 0; e < allT.length; e++) {
    merged.trackTotals[allT[e]].total_ms /= n;
    merged.trackTotals[allT[e]].events /= n;
  }
  merged.eventCount /= n;

  return merged;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  var opts = parseArgs();

  console.error(
    'Config: tap=' +
      opts.tap +
      ', runs=' +
      opts.runs +
      ', warmup=' +
      opts.warmup,
  );

  // Step 1: Start log capture (relaunches app)
  console.error('Starting app with log capture...');
  startLogs();

  // Step 2: Wait for app + CDP to be available
  console.error('Waiting for CDP...');
  await sleep(3000);

  var target;
  for (var attempt = 0; attempt < 10; attempt++) {
    try {
      target = await discoverTarget();
      break;
    } catch (e) {
      console.error('  CDP not ready, retrying... (' + (attempt + 1) + '/10)');
      await sleep(2000);
    }
  }
  if (!target) {
    console.error('FATAL: Could not connect to CDP after 10 attempts');
    process.exit(1);
  }
  console.error('Connected to: ' + target.title);

  // Step 3: Warmup taps (no tracing)
  if (opts.warmup > 0) {
    console.error('Warmup: ' + opts.warmup + ' tap(s)...');
    for (var w = 0; w < opts.warmup; w++) {
      tap(opts.tap);
      await sleep(500);
    }
    // Reset after warmup
    try {
      tap('stress-reset-all');
      await sleep(500);
    } catch (e) {
      // reset button may not exist
    }
  }

  // Step 4: Profile runs
  var results = [];
  for (var run = 0; run < opts.runs; run++) {
    if (opts.runs > 1) {
      console.error('Run ' + (run + 1) + '/' + opts.runs + '...');
    }

    // Start trace
    var ws = await startTrace(target.webSocketDebuggerUrl);
    await sleep(100); // brief settle

    // Tap
    tap(opts.tap);
    await sleep(1000); // wait for React renders

    // Stop trace
    var events = await stopTrace(ws);

    // Save trace
    fs.writeFileSync(
      TRACE_PATH,
      JSON.stringify({traceEvents: events}, null, 2),
    );

    // Analyze
    var result = analyzeTrace(events);
    results.push(result);

    // Reset between runs
    if (run < opts.runs - 1) {
      try {
        tap('stress-reset-all');
        await sleep(500);
      } catch (e) {
        // ignore
      }

      // Re-discover target (ws was closed)
      target = await discoverTarget();
    }
  }

  // Step 5: Capture logs
  console.error('Capturing logs...');
  var logs = readLogs();
  stopLogs();

  // Step 6: Merge results and output
  var finalResult = mergeResults(results);
  var report = formatReport(finalResult, opts);

  // Output report to stdout
  console.log(report);

  // Append logs section (summarized)
  if (logs && logs.trim() !== '(log read failed)') {
    var logLines = logs
      .split('\n')
      .filter(function (l) {
        return (
          l.trim() &&
          !l.startsWith('>') &&
          !l.startsWith('[') &&
          l.indexOf('npm run') === -1
        );
      });

    // Summarize repetitive log patterns
    var patterns = {};
    var uniqueLines = [];
    for (var li = 0; li < logLines.length; li++) {
      var line = logLines[li].trim();
      if (!line) continue;
      // Normalize pointer addresses and numeric values for grouping
      var pattern = line
        .replace(/0x[0-9a-f]+/g, '0x...')
        .replace(/\d+\.\d+/g, 'N')
        .replace(/=\d+/g, '=N');
      if (!patterns[pattern]) {
        patterns[pattern] = {count: 0, sample: line};
      }
      patterns[pattern].count++;
    }

    var patternKeys = Object.keys(patterns);
    if (patternKeys.length > 0) {
      console.log('\nAPP LOGS (' + logLines.filter(function(l) { return l.trim(); }).length + ' lines, ' + patternKeys.length + ' unique patterns):');
      // Sort by count descending, show top patterns
      patternKeys.sort(function (a, b) {
        return patterns[b].count - patterns[a].count;
      });
      for (var pi = 0; pi < Math.min(patternKeys.length, 15); pi++) {
        var pat = patterns[patternKeys[pi]];
        if (pat.count > 1) {
          console.log('  (' + pat.count + 'x) ' + pat.sample);
        } else {
          console.log('  ' + pat.sample);
        }
      }
      if (patternKeys.length > 15) {
        console.log('  ... and ' + (patternKeys.length - 15) + ' more patterns');
      }
    }
  }

  console.log('\nTrace saved to: ' + TRACE_PATH);
  if (opts.runs > 1) {
    console.log('(averaged over ' + opts.runs + ' runs)');
  }
}

main().catch(function (err) {
  console.error('FATAL: ' + err.message);
  process.exit(1);
});
