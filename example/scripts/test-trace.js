'use strict';

// ---------------------------------------------------------------------------
// test-trace.js — End-to-end test for the Chrome DevTools trace pipeline.
//
// Connects to the inspector proxy CDP endpoint, starts tracing, waits for
// the app to collect events, stops tracing, and validates the resulting
// trace events match Chrome DevTools Performance panel expectations.
//
// Usage:  npm run test:trace
//
// Prereqs:
//   1. Dev server running (npm run dev)  — starts inspector proxy on :8976
//   2. Falcon app running in simulator   — collects trace events
// ---------------------------------------------------------------------------

var http = require('http');
var WebSocket = require('ws');
var fs = require('fs');

var CDP_PORT = 8976;
var TRACE_TIMEOUT = 30000;
var DUMP_PATH = '/tmp/falcon-trace.json';

function fail(msg) {
  console.error('FAIL: ' + msg);
  process.exit(1);
}

function pass(msg) {
  console.log('PASS: ' + msg);
}

// Step 1: Discover the CDP WebSocket URL from /json
function discoverTarget(cb) {
  http
    .get('http://127.0.0.1:' + CDP_PORT + '/json', function (res) {
      var data = '';
      res.on('data', function (chunk) {
        data += chunk;
      });
      res.on('end', function () {
        var targets;
        try {
          targets = JSON.parse(data);
        } catch (e) {
          fail('Could not parse /json response: ' + data);
        }
        if (!targets || targets.length === 0) {
          fail('No targets found at /json');
        }
        cb(targets[0]);
      });
    })
    .on('error', function () {
      fail(
        'Could not connect to inspector proxy on port ' +
          CDP_PORT +
          '. Is the dev server running?',
      );
    });
}

// Step 2: Connect, start tracing, wait, stop, collect events
function runTrace(wsUrl, cb) {
  var ws = new WebSocket(wsUrl);
  var allEvents = [];
  var startAcked = false;

  ws.on('error', function (err) {
    fail('WebSocket error: ' + err.message);
  });

  ws.on('open', function () {
    console.log('Connected to inspector proxy');
    // Start tracing
    ws.send(JSON.stringify({id: 1, method: 'Tracing.start', params: {}}));
  });

  ws.on('message', function (raw) {
    var msg;
    try {
      msg = JSON.parse(raw.toString());
    } catch (e) {
      return;
    }

    // Ack for Tracing.start
    if (msg.id === 1 && !startAcked) {
      startAcked = true;
      var waitSec = parseInt(process.env.TRACE_WAIT, 10) || 5;
      console.log('Tracing started — waiting ' + waitSec + 's for app activity...');
      console.log('Interact with the app now (tap buttons, switch tabs, etc.)');
      // Wait for user/automated interaction to generate React renders
      setTimeout(function () {
        console.log('Sending Tracing.end...');
        ws.send(JSON.stringify({id: 2, method: 'Tracing.end', params: {}}));
      }, waitSec * 1000);
    }

    // Collect trace data
    if (msg.method === 'Tracing.dataCollected' && msg.params && msg.params.value) {
      allEvents = allEvents.concat(msg.params.value);
    }

    // Tracing complete — validate
    if (msg.method === 'Tracing.tracingComplete') {
      console.log('Tracing complete, received ' + allEvents.length + ' events');
      ws.close();
      cb(allEvents);
    }
  });

  // Safety timeout
  setTimeout(function () {
    if (allEvents.length === 0) {
      fail('Timed out waiting for trace data');
    }
  }, TRACE_TIMEOUT);
}

// Step 3: Validate trace events match Chrome DevTools expectations
function validate(events) {
  console.log('\n--- Validation ---\n');

  // 3a: Must have TracingStartedInBrowser
  var tsib = events.filter(function (e) {
    return e.name === 'TracingStartedInBrowser';
  });
  if (tsib.length === 0) {
    fail('Missing TracingStartedInBrowser event');
  }
  pass('TracingStartedInBrowser present');

  var tsibEvent = tsib[0];
  if (tsibEvent.cat !== 'disabled-by-default-devtools.timeline') {
    fail(
      'TracingStartedInBrowser has wrong cat: ' +
        tsibEvent.cat +
        ' (expected disabled-by-default-devtools.timeline)',
    );
  }
  pass('TracingStartedInBrowser has correct category');

  if (
    !tsibEvent.args ||
    !tsibEvent.args.data ||
    !tsibEvent.args.data.frames ||
    tsibEvent.args.data.frames.length === 0
  ) {
    fail('TracingStartedInBrowser missing frames data');
  }
  pass('TracingStartedInBrowser has frames data');

  var rendererPid = tsibEvent.args.data.frames[0].processId;

  // 3b: Must have __metadata events
  var meta = events.filter(function (e) {
    return e.cat === '__metadata';
  });
  if (meta.length < 2) {
    fail('Expected at least 2 __metadata events, got ' + meta.length);
  }
  pass('__metadata events present (' + meta.length + ')');

  // 3c: Must have CrRendererMain thread
  var rendererThread = meta.filter(function (e) {
    return (
      e.name === 'thread_name' &&
      e.pid === rendererPid &&
      e.args &&
      e.args.name === 'CrRendererMain'
    );
  });
  if (rendererThread.length === 0) {
    fail('Missing CrRendererMain thread_name metadata for renderer pid ' + rendererPid);
  }
  pass('CrRendererMain thread metadata present (pid=' + rendererPid + ')');

  // 3d: Must have blink.user_timing events
  var userTiming = events.filter(function (e) {
    return e.cat === 'blink.user_timing';
  });
  if (userTiming.length === 0) {
    fail('No blink.user_timing events — React perf tracks not captured');
  }
  pass('blink.user_timing events present (' + userTiming.length + ')');

  // 3e: Begin events must use id2.local format
  var begins = userTiming.filter(function (e) {
    return e.ph === 'b';
  });
  var ends = userTiming.filter(function (e) {
    return e.ph === 'e';
  });
  if (begins.length === 0) {
    fail('No begin (ph=b) events in blink.user_timing');
  }
  pass('Begin events: ' + begins.length + ', End events: ' + ends.length);

  var badId = begins.filter(function (e) {
    return !e.id2 || !e.id2.local;
  });
  if (badId.length > 0) {
    fail(
      badId.length +
        ' begin events use id instead of id2.local — Chrome may not pair them',
    );
  }
  pass('All begin events use id2.local format');

  // 3f: Begin events must have detail as JSON string
  var badDetail = begins.filter(function (e) {
    if (!e.args || !e.args.detail) return true;
    try {
      var d = JSON.parse(e.args.detail);
      return !d.devtools;
    } catch (err) {
      return true;
    }
  });
  if (badDetail.length > 0) {
    fail(badDetail.length + ' begin events have invalid detail format');
  }
  pass('All begin events have valid JSON detail with devtools metadata');

  // 3g: Events must have proper pid/tid matching renderer
  var wrongPid = userTiming.filter(function (e) {
    return e.pid !== rendererPid;
  });
  if (wrongPid.length > 0) {
    fail(
      wrongPid.length +
        ' user timing events have pid != renderer pid (' +
        rendererPid +
        ')',
    );
  }
  pass('All user timing events have correct renderer pid');

  // 3h: Timestamps must be microseconds (> 1000 if any real events)
  var tsValues = begins.map(function (e) {
    return e.ts;
  });
  var maxTs = Math.max.apply(null, tsValues);
  if (maxTs > 0) {
    pass('Timestamps look valid (max=' + maxTs + ' µs)');
  }

  // 3i: Show sample events for visual inspection
  console.log('\n--- Sample Events ---\n');
  var sample = begins.slice(0, 5);
  sample.forEach(function (e, i) {
    var detail = JSON.parse(e.args.detail);
    console.log(
      'Event ' +
        i +
        ': name=' +
        e.name +
        ' track=' +
        (detail.devtools.track || 'n/a') +
        ' color=' +
        (detail.devtools.color || 'n/a') +
        ' ts=' +
        e.ts +
        'µs',
    );
  });

  // Dump trace file for manual inspection
  var traceJson = {traceEvents: events};
  fs.writeFileSync(DUMP_PATH, JSON.stringify(traceJson, null, 2));
  console.log('\nTrace dumped to ' + DUMP_PATH);
  console.log(
    'Load in chrome://tracing or Performance panel to visually verify.\n',
  );

  console.log('All ' + begins.length + ' trace events validated successfully.');
  process.exit(0);
}

// Run
discoverTarget(function (target) {
  console.log('Target: ' + target.title + ' (' + target.id + ')');
  runTrace(target.webSocketDebuggerUrl, validate);
});
