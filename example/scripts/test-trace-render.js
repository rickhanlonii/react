'use strict';

// Diagnostic: checks whether React timing instrumentation is working.
// Usage: node example/scripts/test-trace-render.js

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
    return r.result;
  }

  ws.on('open', async () => {
    console.log('=== Trace Render Diagnostic ===\n');

    // 1. Check tracer exists
    const tracer = await evalJS('typeof __PERFORMANCE_TRACER__');
    console.log('__PERFORMANCE_TRACER__:', tracer.value);

    // 2. Check supportsUserTiming
    const sut = await evalJS('typeof performance !== "undefined" && typeof performance.measure === "function"');
    console.log('supportsUserTiming:', sut.value);

    // 3. Check if console.timeStamp is overridden
    const cts = await evalJS('console.timeStamp.toString().indexOf("reportTimeStamp") !== -1');
    console.log('console.timeStamp overridden:', cts.value);

    // 4. Check if performance.measure reports to tracer
    const pm = await evalJS('performance.measure.toString().indexOf("reportMeasure") !== -1');
    console.log('performance.measure reports to tracer:', pm.value);

    // 5. Start tracing, manually call console.timeStamp to test the pipeline
    console.log('\n--- Manual timeStamp test ---');
    await evalJS('__PERFORMANCE_TRACER__.startTracing()');
    await evalJS('console.timeStamp("test-event", 100, 200, "Test Track", "Test Group", "primary")');
    const manualEvents = await evalJS('JSON.stringify(__PERFORMANCE_TRACER__._events.map(function(e){return e.name}))');
    console.log('Events after manual timeStamp:', manualEvents.value);
    await evalJS('__PERFORMANCE_TRACER__.stopTracing()');

    // 6. Start tracing, trigger a React render, check events
    console.log('\n--- React render test ---');
    await evalJS('__PERFORMANCE_TRACER__.startTracing()');
    console.log('Tracing started. Triggering a React render...');

    // Force a re-render by evaluating a state change
    // Since we can't directly trigger Counter clicks from eval, call
    // a console.log to verify the JS execution context works, then
    // check if any React timing events appeared.
    await evalJS('console.log("trace-test: forcing re-render check")');

    // Wait a moment
    await new Promise(r => setTimeout(r, 500));

    // Check events
    const eventNames = await evalJS('JSON.stringify(__PERFORMANCE_TRACER__._events.map(function(e){return e.name + "(" + e.cat + ")"}))');
    console.log('Events after waiting:', eventNames.value);

    const eventCount = await evalJS('__PERFORMANCE_TRACER__._events.length');
    console.log('Total event count:', eventCount.value);

    // Stop tracing
    const stopped = await evalJS('JSON.stringify(__PERFORMANCE_TRACER__.stopTracing().map(function(e){return e.name}))');
    console.log('Events on stop:', stopped.value);

    // 7. Check if React's internal timing flag is enabled
    console.log('\n--- React internals ---');
    const reactVersion = await evalJS('typeof React !== "undefined" ? React.version : "not found"');
    console.log('React.version:', reactVersion.value);

    // Check if the DevTools hook was detected
    const hookInjected = await evalJS('typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ !== "undefined" && __REACT_DEVTOOLS_GLOBAL_HOOK__._fiberRoots.size > 0');
    console.log('DevTools hook has fiber roots:', hookInjected.value);

    // Check how many renderers
    const rendererCount = await evalJS('__REACT_DEVTOOLS_GLOBAL_HOOK__._renderers.size');
    console.log('Renderers registered:', rendererCount.value);

    console.log('\n=== Done ===');
    ws.close();
    process.exit(0);
  });

  ws.on('error', (err) => { console.error('WS error:', err.message); process.exit(1); });
  setTimeout(() => { console.error('TIMEOUT'); process.exit(1); }, 10000);
}

main();
