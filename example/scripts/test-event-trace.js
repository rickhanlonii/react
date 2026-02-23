'use strict';

// Test: does console.log work from within event handler context?
// We patch the global event handler via Runtime.evaluate to add tracing.
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

    const messages = [];
    ws.on('message', (data) => {
      const msg = JSON.parse(data);
      if (msg.method === 'Runtime.consoleAPICalled') {
        const text = (msg.params.args || []).map(a => a.value || a.description || '').join(' ');
        messages.push(text);
        console.log('>>> ' + text);
      }
    });

    // 1. Check if $$sendInspectorMessage exists
    let r = await send('Runtime.evaluate', {expression: 'typeof $$sendInspectorMessage'});
    console.log('$$sendInspectorMessage type:', r.result?.value);

    // 2. Check if console.log is wrapped
    r = await send('Runtime.evaluate', {expression: 'console.log.toString().substring(0, 100)'});
    console.log('console.log impl:', r.result?.value);

    // 3. Try a direct console.log
    await send('Runtime.evaluate', {expression: 'console.log("[TEST] direct eval")'});
    await new Promise(r => setTimeout(r, 300));
    console.log('Messages after direct eval:', messages.length);

    // 4. Simulate what dispatchEvent does - call the event handler function directly
    r = await send('Runtime.evaluate', {expression: `
      // Try to find a button fiber and simulate a click
      var hook = globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__;
      var roots = hook ? Array.from(hook.getFiberRoots(1)) : [];
      var result = 'no roots';
      if (roots.length > 0) {
        var root = roots[0];
        // Walk the fiber tree to find Counter
        function findFiber(fiber, name) {
          if (!fiber) return null;
          if (fiber.type && fiber.type.name === name) return fiber;
          var found = findFiber(fiber.child, name);
          if (found) return found;
          return findFiber(fiber.sibling, name);
        }
        var counter = findFiber(root.current, 'Counter');
        if (counter) {
          // Find the onClick button - walk children
          function findButton(fiber) {
            if (!fiber) return null;
            if (fiber.memoizedProps && typeof fiber.memoizedProps.onClick === 'function') return fiber;
            var found = findButton(fiber.child);
            if (found) return found;
            return findButton(fiber.sibling);
          }
          var btn = findButton(counter);
          if (btn) {
            console.log('[TEST] found button, calling onClick');
            btn.memoizedProps.onClick({});
            result = 'onClick called';
          } else {
            result = 'button not found';
          }
        } else {
          result = 'Counter not found';
        }
      }
      result;
    `});
    console.log('Simulate result:', r.result?.value);

    await new Promise(r => setTimeout(r, 1000));
    console.log('\nTotal messages:', messages.length);
    messages.forEach(m => console.log('  ' + m));

    ws.close();
    process.exit(0);
  });

  ws.on('error', (err) => { console.error('WS error:', err.message); process.exit(1); });
  setTimeout(() => { console.error('TIMEOUT'); process.exit(1); }, 15000);
}

main();
