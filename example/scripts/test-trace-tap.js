'use strict';

// Verifies React emits timing events during a real render.
// Starts tracing, waits for a tap (or 5 seconds), stops, prints events.
//
// Usage: node example/scripts/test-trace-tap.js

const WebSocket = require('ws');

async function main() {
  const resp = await fetch('http://localhost:8976/json');
  const targets = await resp.json();
  const wsUrl = targets[0].webSocketDebuggerUrl;
  const ws = new WebSocket(wsUrl);
  let nextId = 1;

  function send(method, params) {
    const id = nextId++;
    return new Promise((resolve) => {
      const handler = (data) => {
        const msg = JSON.parse(data);
        if (msg.id === id) {
          ws.off('message', handler);
          resolve(msg.result);
        }
      };
      ws.on('message', handler);
      ws.send(JSON.stringify({id, method, params: params || {}}));
    });
  }

  async function evalJS(expr) {
    const r = await send('Runtime.evaluate', {expression: expr, returnByValue: true});
    return r.result.value !== undefined ? r.result.value : r.result;
  }

  ws.on('open', async () => {
    // Start tracing
    await evalJS('__PERFORMANCE_TRACER__.startTracing()');
    console.log('Tracing started. Waiting 8 seconds — tap the Counter button now...');

    // Wait for user to tap
    await new Promise(r => setTimeout(r, 8000));

    // Check what events were captured
    const eventCount = await evalJS('__PERFORMANCE_TRACER__._events.length');
    console.log('\nTotal events captured:', eventCount);

    const eventSummary = await evalJS(
      'JSON.stringify(__PERFORMANCE_TRACER__._events.map(function(e){return {name:e.name,cat:e.cat,ph:e.ph}}))'
    );
    const events = JSON.parse(eventSummary);
    console.log('\nAll events:');
    events.forEach(function(e, i) {
      console.log('  ' + i + ': [' + e.cat + '] ' + e.name + ' (' + e.ph + ')');
    });

    // Count by category
    const cats = {};
    events.forEach(function(e) {
      cats[e.cat] = (cats[e.cat] || 0) + 1;
    });
    console.log('\nBy category:', cats);

    // Stop tracing
    await evalJS('__PERFORMANCE_TRACER__.stopTracing()');
    console.log('Tracing stopped.');

    ws.close();
    process.exit(0);
  });

  ws.on('error', (err) => { console.error('WS error:', err.message); process.exit(1); });
  setTimeout(() => { console.error('TIMEOUT'); process.exit(1); }, 20000);
}

main();
