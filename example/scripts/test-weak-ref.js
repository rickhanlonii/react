'use strict';

// Clean test: does console.log from setTimeout produce CDP events
// WITHOUT any patching? This tests the baseline behavior.

const WebSocket = require('ws');

async function main() {
  const resp = await fetch('http://localhost:6001/json');
  const targets = await resp.json();
  if (targets.length === 0) { console.error('No targets'); process.exit(1); }
  const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
  let nextId = 1;

  function sendCDP(method, params) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => { ws.off('message', handler); reject(new Error(`Timeout: ${method}`)); }, 8000);
      const handler = (data) => { const msg = JSON.parse(data); if (msg.id === id) { clearTimeout(timeout); ws.off('message', handler); resolve(msg); } };
      ws.on('message', handler);
      ws.send(JSON.stringify({ id, method, params: params || {} }));
    });
  }

  ws.on('open', async () => {
    try {
      const consoleEvents = [];
      ws.on('message', (data) => {
        const msg = JSON.parse(data);
        if (msg.method === 'Runtime.consoleAPICalled') {
          const text = (msg.params.args || []).map(a => a.value || a.description || '').join(' ');
          consoleEvents.push(text);
          console.log('  >>> CDP:', text);
        }
      });

      await sendCDP('Runtime.enable', {});
      console.log('\n=== Clean Console.log Test (No Patching) ===\n');

      // Test 1: console.log from eval (sync)
      console.log('--- Test 1: console.log from eval (sync) ---');
      consoleEvents.length = 0;
      const r1 = await sendCDP('Runtime.evaluate', {
        expression: 'console.log("[SYNC] from eval"); "done"'
      });
      await new Promise(r => setTimeout(r, 1000));
      console.log('Result:', r1.result.result.value);
      console.log('CDP events:', consoleEvents.length, consoleEvents.length > 0 ? 'PASS' : 'FAIL');
      console.log('');

      // Test 2: console.log from setTimeout (async)
      console.log('--- Test 2: console.log from setTimeout (async) ---');
      consoleEvents.length = 0;
      await sendCDP('Runtime.evaluate', {
        expression: [
          'globalThis.__test2Result = "pending";',
          'setTimeout(function() {',
          '  try {',
          '    console.log("[ASYNC] from setTimeout");',
          '    globalThis.__test2Result = "success";',
          '  } catch(e) {',
          '    globalThis.__test2Result = "error: " + e.message;',
          '  }',
          '}, 100);',
          '"scheduled"',
        ].join('\n')
      });
      await new Promise(r => setTimeout(r, 2000));
      const r2 = await sendCDP('Runtime.evaluate', { expression: 'globalThis.__test2Result' });
      console.log('Result:', r2.result.result.value);
      console.log('CDP events:', consoleEvents.length, consoleEvents.length > 0 ? 'PASS' : 'FAIL');
      console.log('');

      // Test 3: Direct $$sendInspectorMessage from setTimeout
      console.log('--- Test 3: $$sendInspectorMessage from setTimeout ---');
      consoleEvents.length = 0;
      await sendCDP('Runtime.evaluate', {
        expression: [
          'globalThis.__test3Result = "pending";',
          'setTimeout(function() {',
          '  try {',
          '    $$sendInspectorMessage(JSON.stringify({',
          "      type: 'console-message', cdpType: 'log',",
          "      args: [{type: 'string', value: '[ASYNC-SEND] from setTimeout'}],",
          '      timestamp: Date.now()',
          '    }));',
          '    globalThis.__test3Result = "sent";',
          '  } catch(e) {',
          '    globalThis.__test3Result = "error: " + e.message;',
          '  }',
          '}, 100);',
          '"scheduled"',
        ].join('\n')
      });
      await new Promise(r => setTimeout(r, 2000));
      const r3 = await sendCDP('Runtime.evaluate', { expression: 'globalThis.__test3Result' });
      console.log('Result:', r3.result.result.value);
      console.log('CDP events:', consoleEvents.length, consoleEvents.length > 0 ? 'PASS' : 'FAIL');
      console.log('');

      // Test 4: Check if console.log is already wrapped
      console.log('--- Test 4: Is console.log wrapped? ---');
      const r4 = await sendCDP('Runtime.evaluate', {
        expression: 'console.log.toString().substring(0, 200)'
      });
      console.log('console.log source:', r4.result.result.value);
      console.log('');

      // Test 5: Check call stack depth
      console.log('--- Test 5: console.log call stack depth ---');
      await sendCDP('Runtime.evaluate', {
        expression: [
          'globalThis.__test5Result = "pending";',
          'setTimeout(function() {',
          '  try {',
          '    var origLog = console.log;',
          '    var depth = 0;',
          '    console.log = function() {',
          '      depth++;',
          '      if (depth > 5) {',
          '        globalThis.__test5Result = "RECURSION at depth " + depth;',
          '        console.log = origLog;',
          '        return;',
          '      }',
          '      globalThis.__test5Result = "depth " + depth;',
          '      origLog.apply(console, arguments);',
          '    };',
          '    console.log("[DEPTH-TEST] test");',
          '    console.log = origLog;', // restore
          '  } catch(e) {',
          '    globalThis.__test5Result = "error: " + e.message;',
          '  }',
          '}, 100);',
          '"scheduled"',
        ].join('\n')
      });
      await new Promise(r => setTimeout(r, 2000));
      const r5 = await sendCDP('Runtime.evaluate', { expression: 'globalThis.__test5Result' });
      console.log('Depth result:', r5.result.result.value);
      console.log('');

      console.log('=== SUMMARY ===');
      console.log('If Test 2 shows "Maximum call stack size exceeded":');
      console.log('  -> The ConsoleForwarding.js wrapper has a recursion bug');
      console.log('  -> This is caused by console.log calling $$sendInspectorMessage');
      console.log('     which somehow re-triggers console.log');
      console.log('If Test 2 shows "success" but 0 CDP events:');
      console.log('  -> console.log works but $$sendInspectorMessage output is lost');
      console.log('  -> The HotReloadClient WebSocket may be disconnected');

      ws.close();
      process.exit(0);
    } catch (err) {
      console.error('ERROR:', err.message);
      ws.close();
      process.exit(1);
    }
  });

  ws.on('error', (err) => { console.error('WS error:', err.message); process.exit(1); });
  setTimeout(() => { console.error('TIMEOUT'); process.exit(1); }, 30000);
}

main();
