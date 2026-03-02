'use strict';

// Test: Full CDP tracing pipeline
// 1. Check supportsUserTiming
// 2. Tracing.start
// 3. Tap counter
// 4. Tracing.end
// 5. Collect Tracing.dataCollected events

const WebSocket = require('ws');
const http = require('http');

let msgId = 1;
let ws;
const pendingResolves = {};
let traceEvents = [];

http.get('http://127.0.0.1:6001/json', (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    const targets = JSON.parse(data);
    if (!targets.length) { console.log('No targets'); process.exit(1); }
    connect(targets[0].webSocketDebuggerUrl);
  });
}).on('error', (e) => { console.log('Error: ' + e.message); process.exit(1); });

function connect(wsUrl) {
  console.log('Connecting to ' + wsUrl);
  ws = new WebSocket(wsUrl);

  ws.on('open', async () => {
    // Step 1: Check prerequisites
    const r1 = await sendCDP('Runtime.evaluate', {
      expression: 'JSON.stringify({supportsUserTiming: typeof console.timeStamp === "function" && typeof performance === "object" && typeof performance.measure === "function", tracerExists: typeof __PERFORMANCE_TRACER__ !== "undefined", isTracing: typeof __PERFORMANCE_TRACER__ !== "undefined" && __PERFORMANCE_TRACER__.isTracing(), eventCount: typeof __PERFORMANCE_TRACER__ !== "undefined" ? __PERFORMANCE_TRACER__._events.length : -1})'
    });
    console.log('\n=== PREREQUISITES ===');
    console.log(r1.result.value);
    const prereqs = JSON.parse(r1.result.value);

    if (!prereqs.supportsUserTiming) {
      console.log('FAILURE: supportsUserTiming is false — React will not emit timing data');
      ws.close();
      process.exit(1);
    }

    if (!prereqs.tracerExists) {
      console.log('FAILURE: __PERFORMANCE_TRACER__ not found');
      ws.close();
      process.exit(1);
    }

    // Step 2: Start tracing
    console.log('\n=== STARTING TRACING ===');
    const r2 = await sendCDP('Tracing.start', { categories: 'blink.user_timing' });
    console.log('Tracing.start result:', JSON.stringify(r2));

    // Verify tracing started
    await new Promise(r => setTimeout(r, 500));
    const r3 = await sendCDP('Runtime.evaluate', {
      expression: 'JSON.stringify({isTracing: __PERFORMANCE_TRACER__.isTracing(), eventCount: __PERFORMANCE_TRACER__._events.length})'
    });
    console.log('After start:', r3.result.value);

    // Step 3: Wait for taps
    console.log('\n=============================================');
    console.log('  TAP THE COUNTER NOW! Waiting 12 seconds...');
    console.log('=============================================\n');

    setTimeout(async () => {
      // Check event count before stopping
      const r4 = await sendCDP('Runtime.evaluate', {
        expression: 'JSON.stringify({isTracing: __PERFORMANCE_TRACER__.isTracing(), eventCount: __PERFORMANCE_TRACER__._events.length})'
      });
      console.log('Before Tracing.end:', r4.result.value);

      // Step 4: Stop tracing and collect events
      console.log('\n=== STOPPING TRACING ===');
      const r5 = await sendCDP('Tracing.end', {});
      console.log('Tracing.end result:', JSON.stringify(r5));

      // Wait for Tracing.dataCollected events
      await new Promise(r => setTimeout(r, 2000));

      // Step 5: Report results
      console.log('\n=== RESULTS ===');
      console.log('Total trace events received: ' + traceEvents.length);

      if (traceEvents.length > 0) {
        // Group by category
        const byCategory = {};
        traceEvents.forEach(e => {
          const cat = e.cat || 'unknown';
          if (!byCategory[cat]) byCategory[cat] = [];
          byCategory[cat].push(e);
        });

        Object.keys(byCategory).forEach(cat => {
          console.log('\n  Category: ' + cat + ' (' + byCategory[cat].length + ' events)');
          // Show unique event names
          const names = [...new Set(byCategory[cat].map(e => e.name))];
          names.forEach(n => {
            const count = byCategory[cat].filter(e => e.name === n).length;
            console.log('    ' + n + ' x' + count);
          });
        });

        // Look specifically for React component events
        const reactEvents = traceEvents.filter(e =>
          e.cat === 'blink.user_timing' && e.name && e.name !== 'process_name' && e.name !== 'thread_name'
        );
        console.log('\n  React timing events: ' + reactEvents.length);
        if (reactEvents.length > 0) {
          console.log('  SUCCESS: React timing events captured during taps!');
          reactEvents.slice(0, 10).forEach(e => {
            console.log('    ' + e.name + ' ph=' + e.ph + ' ts=' + e.ts);
          });
        }
      } else {
        console.log('FAILURE: No trace events collected');
      }

      ws.close();
      process.exit(0);
    }, 12000);
  });

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());

    // Collect Tracing.dataCollected events
    if (msg.method === 'Tracing.dataCollected' && msg.params && msg.params.value) {
      console.log('  [TRACE] Received ' + msg.params.value.length + ' trace events');
      traceEvents = traceEvents.concat(msg.params.value);
    }
    if (msg.method === 'Tracing.tracingComplete') {
      console.log('  [TRACE] Tracing complete');
    }

    // Handle CDP responses
    if (msg.id && pendingResolves[msg.id]) {
      pendingResolves[msg.id](msg.result || {});
      delete pendingResolves[msg.id];
    }
  });
}

function sendCDP(method, params) {
  return new Promise((resolve) => {
    const id = msgId++;
    pendingResolves[id] = resolve;
    ws.send(JSON.stringify({ id, method, params }));
  });
}
