'use strict';

// Check fiber mode flags at runtime
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

  async function evalJS(expr) {
    const r = await send('Runtime.evaluate', {expression: expr, returnByValue: true});
    if (r.exceptionDetails) {
      console.error('  EVAL ERROR:', r.exceptionDetails.text);
      return null;
    }
    return r.result.value !== undefined ? r.result.value : r.result;
  }

  ws.on('open', async () => {
    console.log('=== Fiber Mode Diagnostic ===\n');

    // Check fiber modes
    const modes = await evalJS(`
      (function() {
        var hook = __REACT_DEVTOOLS_GLOBAL_HOOK__;
        if (!hook || !hook._fiberRoots) return 'no hook';
        var result = [];
        hook._fiberRoots.forEach(function(roots) {
          roots.forEach(function(root) {
            if (root.current) {
              var fiber = root.current;
              result.push('Root fiber mode: ' + fiber.mode + ' (binary: ' + fiber.mode.toString(2) + ')');
              result.push('  ProfileMode (& 2): ' + ((fiber.mode & 2) !== 0));
              result.push('  actualDuration: ' + fiber.actualDuration);
              result.push('  actualStartTime: ' + fiber.actualStartTime);

              // Walk children
              var child = fiber.child;
              var depth = 0;
              while (child && depth < 8) {
                var name = typeof child.type === 'function'
                  ? (child.type.displayName || child.type.name || 'Anon')
                  : (child.type || '(null)');
                result.push('  ' + name + ' mode=' + child.mode +
                  ' (ProfileMode=' + ((child.mode & 2) !== 0) +
                  ', actualDuration=' + child.actualDuration +
                  ', actualStartTime=' + child.actualStartTime + ')');
                child = child.child;
                depth++;
              }
            }
          });
        });
        return result.join('\\n');
      })()
    `);
    console.log(modes);

    // Also check isDevToolsPresent
    console.log('');
    const hookExists = await evalJS('typeof __REACT_DEVTOOLS_GLOBAL_HOOK__ !== "undefined"');
    console.log('__REACT_DEVTOOLS_GLOBAL_HOOK__ exists:', hookExists);

    const renderers = await evalJS('__REACT_DEVTOOLS_GLOBAL_HOOK__._renderers.size');
    console.log('Renderers registered:', renderers);

    const fiberRootCount = await evalJS(`
      (function() {
        var count = 0;
        __REACT_DEVTOOLS_GLOBAL_HOOK__._fiberRoots.forEach(function(roots) {
          count += roots.size;
        });
        return count;
      })()
    `);
    console.log('Fiber roots:', fiberRootCount);

    ws.close();
    process.exit(0);
  });

  ws.on('error', (err) => { console.error('WS error:', err.message); process.exit(1); });
  setTimeout(() => { console.error('TIMEOUT'); process.exit(1); }, 10000);
}

main();
