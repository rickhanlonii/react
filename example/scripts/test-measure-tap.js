'use strict';

// Minimal: reset counter, tap, check
const WebSocket = require('ws');

async function main() {
  const resp = await fetch('http://localhost:8976/json');
  const targets = await resp.json();
  const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
  let nextId = 1;

  function send(method, params) {
    const id = nextId++;
    return new Promise((resolve) => {
      const handler = (data) => {
        const msg = JSON.parse(data);
        if (msg.id === id) { ws.off('message', handler); resolve(msg.result); }
      };
      ws.on('message', handler);
      ws.send(JSON.stringify({id, method, params: params || {}}));
    });
  }

  async function evalJS(expr) {
    const r = await send('Runtime.evaluate', {expression: expr, returnByValue: true});
    if (r.exceptionDetails) {
      console.error('  EVAL ERROR:', r.exceptionDetails.text);
      return null;
    }
    return r.result.value !== undefined ? r.result.value : r.result;
  }

  ws.on('open', async () => {
    // Check current measure call count (from prior interceptor)
    const currentCount = await evalJS('typeof __measureCallCount === "function" ? __measureCallCount() : "no interceptor"');
    console.log('Current measureCallCount:', currentCount);

    // Install fresh interceptor that logs each call
    await evalJS(`
      (function() {
        var origMeasure = performance.measure;
        // Unwrap if already wrapped
        while (origMeasure._original) origMeasure = origMeasure._original;

        var callLog = [];
        var wrapped = function() {
          var name = arguments[0];
          callLog.push(name);
          return origMeasure.apply(this, arguments);
        };
        wrapped._original = origMeasure;
        performance.measure = wrapped;
        globalThis.__measureLog = function() { return JSON.stringify(callLog); };
        globalThis.__measureLogClear = function() { callLog = []; };

        // Also wrap console.timeStamp
        var origTS = console.timeStamp;
        var tsLog = [];
        console.timeStamp = function() {
          if (arguments.length > 1) {
            tsLog.push(arguments[0]);
          }
          return origTS.apply(this, arguments);
        };
        globalThis.__tsLog = function() { return JSON.stringify(tsLog); };
      })()
    `);
    console.log('Fresh interceptors installed');
    console.log('TAP THE + BUTTON NOW. You have 10 seconds.\n');

    // Wait for user taps
    await new Promise(r => setTimeout(r, 10000));

    // Check results
    const measureLog = await evalJS('__measureLog()');
    const tsLog = await evalJS('__tsLog()');

    console.log('performance.measure calls:', measureLog);
    console.log('console.timeStamp calls:', tsLog);

    ws.close();
    process.exit(0);
  });

  ws.on('error', (err) => { console.error('WS error:', err.message); process.exit(1); });
  setTimeout(() => { console.error('TIMEOUT'); process.exit(1); }, 20000);
}

main();
