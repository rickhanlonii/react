'use strict';

// Final diagnostic: Is our performance.measure polyfill actually installed?
// Does React use it? Test with a forced render via eval.

const WebSocket = require('ws');

async function main() {
  const resp = await fetch('http://localhost:6001/json');
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
    console.log('=== Performance.measure Diagnostic ===\n');

    // 1. Check if performance.measure is our polyfill or native
    const measureSource = await evalJS('performance.measure.toString()');
    console.log('performance.measure source:');
    console.log(measureSource);
    console.log('');

    // 2. Check if performance is our polyfill object or native
    const perfDesc = await evalJS(`
      JSON.stringify({
        hasNow: typeof performance.now === 'function',
        hasMark: typeof performance.mark === 'function',
        hasMeasure: typeof performance.measure === 'function',
        nowSource: performance.now.toString().slice(0, 80),
        measureWritable: Object.getOwnPropertyDescriptor(performance, 'measure') ?
          Object.getOwnPropertyDescriptor(performance, 'measure').writable : 'not own prop',
        measureConfigurable: Object.getOwnPropertyDescriptor(performance, 'measure') ?
          Object.getOwnPropertyDescriptor(performance, 'measure').configurable : 'not own prop',
        perfKeys: Object.getOwnPropertyNames(performance).sort().join(', '),
      })
    `);
    console.log('performance object:', JSON.parse(perfDesc));

    // 3. Direct test: call performance.measure and check tracer
    console.log('\n--- Direct performance.measure test ---');
    await evalJS('__PERFORMANCE_TRACER__.startTracing()');
    await evalJS('performance.measure("direct-test", {start: 100, end: 200, detail: {devtools: {track: "Test"}}})');
    const directCount = await evalJS('__PERFORMANCE_TRACER__._events.length');
    console.log('Events after direct performance.measure call:', directCount);
    await evalJS('__PERFORMANCE_TRACER__.stopTracing()');

    // 4. Check if JSC has a native performance object that shadows ours
    console.log('\n--- Prototype check ---');
    const protoCheck = await evalJS(`
      JSON.stringify({
        proto: Object.getPrototypeOf(performance).constructor.name,
        isPlainObj: Object.getPrototypeOf(performance) === Object.prototype,
        ownProps: Object.getOwnPropertyNames(performance).length,
      })
    `);
    console.log('performance prototype:', JSON.parse(protoCheck));

    // 5. Check property descriptor for measure on prototype chain
    const protoMeasure = await evalJS(`
      (function() {
        var p = performance;
        while (p) {
          var d = Object.getOwnPropertyDescriptor(p, 'measure');
          if (d) return JSON.stringify({
            level: p === performance ? 'own' : 'proto',
            writable: d.writable,
            configurable: d.configurable,
            isFunction: typeof d.value === 'function',
          });
          p = Object.getPrototypeOf(p);
        }
        return 'not found';
      })()
    `);
    console.log('measure descriptor:', protoMeasure);

    ws.close();
    process.exit(0);
  });

  ws.on('error', (err) => { console.error('WS error:', err.message); process.exit(1); });
  setTimeout(() => { console.error('TIMEOUT'); process.exit(1); }, 10000);
}

main();
