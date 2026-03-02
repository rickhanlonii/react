'use strict';

// Interactive CDP WebSocket monitor.
// Connects to the inspector proxy, enables all domains, and prints
// every incoming message. Type CDP commands or JS expressions to send.
//
// Usage: node example/scripts/cdp-monitor.js
//
// Commands:
//   eval <expr>          — Runtime.evaluate
//   trace start          — Tracing.start
//   trace stop           — Tracing.end
//   props <objectId>     — Runtime.getProperties
//   heap                 — Runtime.getHeapUsage
//   tree                 — Evaluate $$getComponentTree()
//   raw <json>           — Send raw CDP JSON
//   quit                 — Exit

const WebSocket = require('ws');
const readline = require('readline');

const CDP_URL = process.argv[2] || 'http://localhost:6001';
let nextId = 1;

async function main() {
  // Discover target
  const resp = await fetch(CDP_URL + '/json');
  const targets = await resp.json();
  if (targets.length === 0) {
    console.error('No targets found at ' + CDP_URL);
    process.exit(1);
  }
  const target = targets[0];
  console.log('Target: ' + target.title + ' (' + target.id + ')');
  console.log('Connecting to ' + target.webSocketDebuggerUrl + '...\n');

  const ws = new WebSocket(target.webSocketDebuggerUrl);

  ws.on('open', () => {
    console.log('--- Connected ---\n');

    // Enable all domains so we receive events
    const domains = [
      'Runtime.enable',
      'Log.enable',
      'Network.enable',
      'Debugger.enable',
      'Page.enable',
      'Profiler.enable',
      'DOM.enable',
    ];
    for (const method of domains) {
      const id = nextId++;
      ws.send(JSON.stringify({id, method, params: {}}));
    }

    startREPL(ws);
  });

  ws.on('message', (data) => {
    const msg = JSON.parse(data);
    const ts = new Date().toISOString().slice(11, 23);

    if (msg.method) {
      // CDP event
      console.log('\x1b[36m[' + ts + ' EVENT]\x1b[0m ' + msg.method);
      console.log(JSON.stringify(msg.params, null, 2));
      console.log('');
    } else if (msg.id !== undefined) {
      // CDP response
      console.log('\x1b[32m[' + ts + ' RESPONSE id=' + msg.id + ']\x1b[0m');
      console.log(JSON.stringify(msg.result, null, 2));
      console.log('');
    } else {
      // Unknown
      console.log('\x1b[33m[' + ts + ' MSG]\x1b[0m', JSON.stringify(msg));
      console.log('');
    }
  });

  ws.on('close', () => {
    console.log('\n--- Disconnected ---');
    process.exit(0);
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
    process.exit(1);
  });
}

function startREPL(ws) {
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout,
    prompt: '\x1b[33mcdp>\x1b[0m ',
  });

  rl.prompt();

  rl.on('line', (line) => {
    const input = line.trim();
    if (!input) {
      rl.prompt();
      return;
    }

    if (input === 'quit' || input === 'exit') {
      ws.close();
      return;
    }

    if (input === 'help') {
      console.log('Commands:');
      console.log('  eval <expr>       — Runtime.evaluate');
      console.log('  trace start       — Tracing.start');
      console.log('  trace stop        — Tracing.end');
      console.log('  props <objectId>  — Runtime.getProperties');
      console.log('  heap              — Runtime.getHeapUsage');
      console.log('  tree              — $$getComponentTree()');
      console.log('  raw <json>        — Send raw CDP message');
      console.log('  quit              — Exit');
      console.log('');
      rl.prompt();
      return;
    }

    let msg;

    if (input.startsWith('eval ')) {
      const expr = input.slice(5);
      msg = {id: nextId++, method: 'Runtime.evaluate', params: {expression: expr}};
    } else if (input === 'trace start') {
      msg = {id: nextId++, method: 'Tracing.start', params: {categories: '-*,disabled-by-default-devtools.timeline,blink.user_timing'}};
    } else if (input === 'trace stop') {
      msg = {id: nextId++, method: 'Tracing.end', params: {}};
    } else if (input.startsWith('props ')) {
      const objectId = input.slice(6).trim();
      msg = {id: nextId++, method: 'Runtime.getProperties', params: {objectId, ownProperties: true}};
    } else if (input === 'heap') {
      msg = {id: nextId++, method: 'Runtime.getHeapUsage', params: {}};
    } else if (input === 'tree') {
      msg = {id: nextId++, method: 'Runtime.evaluate', params: {expression: 'JSON.stringify($$getComponentTree(), null, 2)', returnByValue: true}};
    } else if (input.startsWith('raw ')) {
      try {
        msg = JSON.parse(input.slice(4));
        if (msg.id === undefined) msg.id = nextId++;
      } catch (e) {
        console.log('Invalid JSON:', e.message);
        rl.prompt();
        return;
      }
    } else {
      // Default: treat as a JS expression to evaluate
      msg = {id: nextId++, method: 'Runtime.evaluate', params: {expression: input}};
    }

    console.log('\x1b[35m[SEND id=' + msg.id + ']\x1b[0m ' + msg.method);
    ws.send(JSON.stringify(msg));
    rl.prompt();
  });

  rl.on('close', () => {
    ws.close();
  });
}

main();
