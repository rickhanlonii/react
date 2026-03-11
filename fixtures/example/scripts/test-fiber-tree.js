'use strict';

// Dump the full fiber tree to understand component structure
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
    // Dump fiber tree
    const tree = await evalJS(`
      (function() {
        var hook = __REACT_DEVTOOLS_GLOBAL_HOOK__;
        var lines = [];
        hook._fiberRoots.forEach(function(roots) {
          roots.forEach(function(root) {
            function walk(fiber, indent) {
              if (!fiber) return;
              var name;
              if (typeof fiber.type === 'function') {
                name = fiber.type.displayName || fiber.type.name || '(anon fn)';
              } else if (typeof fiber.type === 'string') {
                name = '<' + fiber.type + '>';
              } else if (fiber.type === null) {
                name = '(null type, tag=' + fiber.tag + ')';
              } else {
                name = '(type=' + typeof fiber.type + ', tag=' + fiber.tag + ')';
              }
              var flags = fiber.flags !== 0 ? ' flags=' + fiber.flags : '';
              var mode = ' mode=' + fiber.mode;
              var state = '';
              if (fiber.memoizedState !== null && typeof fiber.type === 'function') {
                var s = fiber.memoizedState;
                if (s && typeof s.memoizedState !== 'undefined') {
                  var v = s.memoizedState;
                  if (typeof v === 'number' || typeof v === 'string' || typeof v === 'boolean') {
                    state = ' state=' + v;
                  }
                }
              }
              lines.push(indent + name + mode + flags + state);
              walk(fiber.child, indent + '  ');
              walk(fiber.sibling, indent);
            }
            walk(root.current, '');
          });
        });
        return lines.join('\\n');
      })()
    `);
    console.log('=== Fiber Tree ===\n');
    console.log(tree);

    ws.close();
    process.exit(0);
  });

  ws.on('error', (err) => { console.error('WS error:', err.message); process.exit(1); });
  setTimeout(() => { console.error('TIMEOUT'); process.exit(1); }, 10000);
}

main();
