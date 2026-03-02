'use strict';

// Minimal test: check which renderer IDs exist and if console.log works
// when called from a setTimeout (not eval context).
const WebSocket = require('ws');

async function main() {
  const resp = await fetch('http://localhost:6001/json');
  const targets = await resp.json();
  const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
  let nextId = 1;

  function send(method, params) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => { ws.off('message', handler); reject(new Error('timeout')); }, 5000);
      const handler = (data) => {
        const msg = JSON.parse(data);
        if (msg.id === id) { clearTimeout(timer); ws.off('message', handler); resolve(msg.result); }
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

    // 1. Check renderer IDs
    let r = await send('Runtime.evaluate', {expression: `
      var hook = globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__;
      if (!hook) 'no hook';
      else {
        var ids = [];
        hook.renderers.forEach(function(v, k) { ids.push(k); });
        'rendererIds=' + JSON.stringify(ids) + ' roots_per_id=' + ids.map(function(id) {
          var roots = hook.getFiberRoots(id);
          return id + ':' + (roots ? roots.size : 'null');
        }).join(',');
      }
    `});
    console.log('Renderers:', r.result?.value);

    // 2. Try finding Counter with all renderer IDs
    r = await send('Runtime.evaluate', {expression: `
      var hook = globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__;
      var results = [];
      hook.renderers.forEach(function(renderer, id) {
        var roots = hook.getFiberRoots(id);
        roots.forEach(function(root) {
          function findFiber(fiber, name, depth) {
            if (!fiber || depth > 30) return null;
            if (fiber.type && (fiber.type.name === name || fiber.type === name)) return fiber;
            var found = findFiber(fiber.child, name, depth + 1);
            if (found) return found;
            return findFiber(fiber.sibling, name, depth + 1);
          }
          var counter = findFiber(root.current, 'Counter', 0);
          results.push('renderer=' + id + ' rootTag=' + root.current.tag + ' counter=' + (counter ? 'FOUND tag=' + counter.tag : 'NOT_FOUND'));
        });
      });
      results.join('; ');
    `});
    console.log('Fiber search:', r.result?.value);

    // 3. Does console.log work from setTimeout? (non-eval context)
    messages.length = 0;
    await send('Runtime.evaluate', {expression: `
      setTimeout(function() {
        console.log('[TEST] from setTimeout');
      }, 100);
    `});
    await new Promise(r => setTimeout(r, 1000));
    console.log('Messages from setTimeout:', messages.length);

    // 4. Does console.log work from a microtask?
    messages.length = 0;
    await send('Runtime.evaluate', {expression: `
      Promise.resolve().then(function() {
        console.log('[TEST] from Promise.then');
      });
    `});
    await new Promise(r => setTimeout(r, 1000));
    console.log('Messages from Promise.then:', messages.length);

    ws.close();
    process.exit(0);
  });

  ws.on('error', (err) => { console.error('WS error:', err.message); process.exit(1); });
  setTimeout(() => { console.error('TIMEOUT'); process.exit(1); }, 15000);
}

main();
