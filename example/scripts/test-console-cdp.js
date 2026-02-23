'use strict';

// Minimal: verify console.log produces CDP events, then check for TRACE
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

  ws.on('open', async () => {
    await send('Runtime.enable', {});

    // Collect ALL console messages
    const messages = [];
    ws.on('message', (data) => {
      const msg = JSON.parse(data);
      if (msg.method === 'Runtime.consoleAPICalled') {
        const text = (msg.params.args || []).map(a => a.value || a.description || '').join(' ');
        messages.push(text);
        if (text.includes('[TRACE]')) {
          console.log('>>> ' + text);
        }
      }
    });

    // Test: does eval console.log produce a CDP event?
    await send('Runtime.evaluate', {expression: 'console.log("[TRACE] test from eval")'});
    await new Promise(r => setTimeout(r, 500));
    console.log('Console messages after eval:', messages.length);
    console.log('Contains TRACE:', messages.some(m => m.includes('[TRACE]')));
    if (messages.length > 0) {
      console.log('Messages:', messages.slice(0, 5));
    }

    // Now tap test - wait for taps
    messages.length = 0;
    console.log('\nTAP NOW. Waiting 10 seconds...\n');
    await new Promise(r => setTimeout(r, 10000));

    console.log('Total console messages during taps:', messages.length);
    const traceMessages = messages.filter(m => m.includes('[TRACE]'));
    console.log('TRACE messages:', traceMessages.length);
    traceMessages.forEach(m => console.log('  ' + m));

    // Also show non-trace messages
    const otherMessages = messages.filter(m => !m.includes('[TRACE]'));
    if (otherMessages.length > 0) {
      console.log('Other messages:', otherMessages.slice(0, 10));
    }

    ws.close();
    process.exit(0);
  });

  ws.on('error', (err) => { console.error('WS error:', err.message); process.exit(1); });
  setTimeout(() => { console.error('TIMEOUT'); process.exit(1); }, 20000);
}

main();
