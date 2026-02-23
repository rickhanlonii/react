'use strict';

// Listen for console messages via CDP while tapping
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
    // Enable Runtime to get consoleAPICalled events
    await send('Runtime.enable', {});
    console.log('Runtime enabled. Listening for [TRACE] console messages...');
    console.log('TAP THE + BUTTON NOW. Waiting 10 seconds.\n');

    ws.on('message', (data) => {
      const msg = JSON.parse(data);
      if (msg.method === 'Runtime.consoleAPICalled') {
        const args = msg.params.args || [];
        const text = args.map(a => a.value || a.description || '').join(' ');
        if (text.includes('[TRACE]')) {
          console.log(text);
        }
      }
    });

    await new Promise(r => setTimeout(r, 10000));
    console.log('\nDone.');
    ws.close();
    process.exit(0);
  });

  ws.on('error', (err) => { console.error('WS error:', err.message); process.exit(1); });
  setTimeout(() => { console.error('TIMEOUT'); process.exit(1); }, 15000);
}

main();
