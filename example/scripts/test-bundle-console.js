'use strict';

// Test: Does console.log from the BUNDLE's event handler get forwarded via CDP?
//
// Steps:
// 1. Connect to inspector proxy
// 2. Enable Runtime domain to receive consoleAPICalled events
// 3. Wait for taps — the bundle's event handler has console.log('[EVENT-HANDLER] event received')
// 4. Report whether CDP events arrive

const WebSocket = require('ws');

const TARGET_URL = 'ws://127.0.0.1:8976';
let msgId = 1;
let ws;
let consoleEvents = [];

// First discover the WebSocket URL
const http = require('http');
http.get('http://127.0.0.1:8976/json', (res) => {
  let data = '';
  res.on('data', (chunk) => data += chunk);
  res.on('end', () => {
    const targets = JSON.parse(data);
    if (!targets.length) {
      console.log('No targets found');
      process.exit(1);
    }
    const wsUrl = targets[0].webSocketDebuggerUrl;
    console.log('Connecting to ' + wsUrl);
    connect(wsUrl);
  });
}).on('error', (e) => {
  console.log('Error discovering targets: ' + e.message);
  process.exit(1);
});

function connect(wsUrl) {
  ws = new WebSocket(wsUrl);

  ws.on('open', async () => {
    // Enable Runtime domain
    const result = await sendCDP('Runtime.enable', {});
    console.log('Runtime.enable:', JSON.stringify(result));

    // Check if the event handler log is in the bundle
    const check = await sendCDP('Runtime.evaluate', {
      expression: 'typeof console.log'
    });
    console.log('console.log type:', check.result.value);

    console.log('\n=============================================');
    console.log('  TAP THE COUNTER NOW! Waiting 12 seconds...');
    console.log('=============================================\n');

    setTimeout(async () => {
      // Check results
      const eventHandlerEvents = consoleEvents.filter(e =>
        e.args && e.args.some(a => a.value && a.value.includes && a.value.includes('[EVENT-HANDLER]'))
      );

      console.log('\n=== RESULTS ===');
      console.log('Total CDP consoleAPICalled events: ' + consoleEvents.length);
      console.log('[EVENT-HANDLER] events: ' + eventHandlerEvents.length);

      if (consoleEvents.length > 0) {
        console.log('\nAll console events:');
        consoleEvents.forEach((e, i) => {
          const text = e.args.map(a => a.value || a.description || a.type).join(' ');
          console.log('  ' + i + ': [' + e.type + '] ' + text);
        });
      }

      if (eventHandlerEvents.length > 0) {
        console.log('\nSUCCESS: Bundle event handler console.log IS forwarded via CDP');
      } else {
        console.log('\nFAILURE: Bundle event handler console.log is NOT forwarded via CDP');
        console.log('This confirms the forwarding issue.');
      }

      ws.close();
      process.exit(0);
    }, 12000);
  });

  ws.on('message', (data) => {
    const msg = JSON.parse(data.toString());
    if (msg.method === 'Runtime.consoleAPICalled') {
      const args = msg.params.args || [];
      const text = args.map(a => a.value || a.description || a.type).join(' ');
      console.log('  [CONSOLE] ' + text);
      consoleEvents.push(msg.params);
    }
    // Handle CDP responses
    if (msg.id && pendingResolves[msg.id]) {
      pendingResolves[msg.id](msg.result || {});
      delete pendingResolves[msg.id];
    }
  });
}

const pendingResolves = {};
function sendCDP(method, params) {
  return new Promise((resolve) => {
    const id = msgId++;
    pendingResolves[id] = resolve;
    ws.send(JSON.stringify({ id, method, params }));
  });
}
