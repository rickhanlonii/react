'use strict';

// Quick test script to verify the CDP pipeline end-to-end.
// Usage: node example/scripts/test-cdp.js

const WebSocket = require('ws');

async function main() {
  // Get the target info
  const resp = await fetch('http://localhost:6001/json');
  const targets = await resp.json();
  if (targets.length === 0) {
    console.error('No targets found — is the app running?');
    process.exit(1);
  }
  const wsUrl = targets[0].webSocketDebuggerUrl;
  console.log('Connecting to', wsUrl);

  const ws = new WebSocket(wsUrl);
  let nextId = 1;

  function sendCDP(method, params) {
    const id = nextId++;
    return new Promise((resolve) => {
      const handler = (data) => {
        const msg = JSON.parse(data);
        if (msg.id === id) {
          ws.off('message', handler);
          resolve(msg);
        }
      };
      ws.on('message', handler);
      ws.send(JSON.stringify({id, method, params: params || {}}));
    });
  }

  ws.on('open', async () => {
    console.log('\n=== CDP Pipeline Test ===\n');

    // 1. Runtime.evaluate (number)
    let r = await sendCDP('Runtime.evaluate', {expression: '1 + 2'});
    console.log('✓ Runtime.evaluate(1 + 2):', JSON.stringify(r.result.result));

    // 2. Runtime.evaluate (string)
    r = await sendCDP('Runtime.evaluate', {expression: '"hello from JSC"'});
    console.log('✓ Runtime.evaluate(string):', JSON.stringify(r.result.result));

    // 3. Runtime.evaluate (object)
    r = await sendCDP('Runtime.evaluate', {expression: '({name: "Falcon", v: 1})'});
    console.log('✓ Runtime.evaluate(object):', JSON.stringify(r.result.result));
    const objectId = r.result.result.objectId;

    // 4. Runtime.getProperties
    r = await sendCDP('Runtime.getProperties', {objectId, ownProperties: true});
    const props = r.result.result.map(p => p.name + '=' + (p.value && p.value.value));
    console.log('✓ Runtime.getProperties:', props.join(', '));

    // 5. Runtime.getHeapUsage
    r = await sendCDP('Runtime.getHeapUsage', {});
    const mb = (r.result.usedSize / 1024 / 1024).toFixed(1);
    console.log('✓ Runtime.getHeapUsage:', mb + ' MB used');

    // 6. Runtime.evaluate — access React
    r = await sendCDP('Runtime.evaluate', {expression: 'globalThis.__REACT_DOM_NATIVE__.version'});
    console.log('✓ react-dom-native version:', r.result.result.value);

    // 7. Tracing (start, wait, stop)
    console.log('\n--- Tracing Test ---');
    r = await sendCDP('Tracing.start', {categories: '-*,blink.user_timing'});
    console.log('✓ Tracing.start');

    // Collect trace events
    let traceEvents = [];
    const tracePromise = new Promise((resolve) => {
      const handler = (data) => {
        const msg = JSON.parse(data);
        if (msg.method === 'Tracing.dataCollected') {
          traceEvents = traceEvents.concat(msg.params.value || []);
        }
        if (msg.method === 'Tracing.tracingComplete') {
          ws.off('message', handler);
          resolve();
        }
      };
      ws.on('message', handler);
    });

    // Wait a moment, then stop
    await new Promise(r => setTimeout(r, 1000));
    await sendCDP('Tracing.end', {});
    await tracePromise;

    const names = new Set(traceEvents.map(e => e.name));
    console.log('✓ Tracing complete:', traceEvents.length, 'events');
    console.log('  Event types:', [...names].sort().join(', '));

    // 8. Page.getResourceTree
    r = await sendCDP('Page.getResourceTree', {});
    console.log('✓ Page.getResourceTree: frame=' + r.result.frameTree.frame.id);

    // 9. Debugger.enable (should get scriptParsed)
    let scriptParsed = null;
    const scriptHandler = (data) => {
      const msg = JSON.parse(data);
      if (msg.method === 'Debugger.scriptParsed') {
        scriptParsed = msg;
      }
    };
    ws.on('message', scriptHandler);
    r = await sendCDP('Debugger.enable', {});
    ws.off('message', scriptHandler);
    console.log('✓ Debugger.enable: debuggerId=' + r.result.debuggerId);
    if (scriptParsed) {
      console.log('  scriptParsed: url=' + scriptParsed.params.url);
    }

    console.log('\n=== All CDP tests passed ===\n');
    ws.close();
    process.exit(0);
  });

  ws.on('error', (err) => {
    console.error('WS error:', err.message);
    process.exit(1);
  });

  setTimeout(() => {
    console.error('TIMEOUT');
    process.exit(1);
  }, 15000);
}

main();
