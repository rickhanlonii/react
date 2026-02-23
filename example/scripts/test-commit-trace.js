'use strict';

// Verify taps trigger re-renders and trace the exact React commit path
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
    console.log('=== Render Verification ===\n');

    // 1. Patch logComponentRender to count calls
    await evalJS(`
      (function() {
        // Find and patch the internal logComponentRender
        // Since we can't easily patch the closure, let's intercept
        // at the performance.measure and console.timeStamp level
        // AND add a hook on the DevTools commit callback.

        var origOnCommit = __REACT_DEVTOOLS_GLOBAL_HOOK__.onCommitFiberRoot;
        var commitCount = 0;
        __REACT_DEVTOOLS_GLOBAL_HOOK__.onCommitFiberRoot = function(rendererId, fiberRoot) {
          commitCount++;
          var current = fiberRoot.current;
          console.log('[COMMIT #' + commitCount + '] mode=' + current.mode +
            ' actualDuration=' + current.actualDuration +
            ' actualStartTime=' + current.actualStartTime);

          // Walk to find Counter fiber
          function findCounter(fiber, depth) {
            if (!fiber || depth > 15) return;
            if (typeof fiber.type === 'function') {
              var name = fiber.type.displayName || fiber.type.name || 'Anon';
              if (fiber.flags !== 0) {
                console.log('  [' + name + '] flags=' + fiber.flags +
                  ' mode=' + fiber.mode +
                  ' actualStartTime=' + fiber.actualStartTime +
                  ' PerformedWork=' + ((fiber.flags & 1) !== 0));
              }
            }
            findCounter(fiber.child, depth + 1);
            findCounter(fiber.sibling, depth + 1);
          }
          findCounter(current, 0);

          origOnCommit(rendererId, fiberRoot);
        };
        globalThis.__commitCount = function() { return commitCount; };
      })()
    `);
    console.log('Patched onCommitFiberRoot\n');

    // 2. Start tracing
    await evalJS('__PERFORMANCE_TRACER__.startTracing()');
    console.log('Tracing started. Waiting for taps...\n');

    // Wait
    await new Promise(r => setTimeout(r, 8000));

    // 3. Results
    const commits = await evalJS('__commitCount()');
    console.log('\nCommit count:', commits);

    const eventCount = await evalJS('__PERFORMANCE_TRACER__._events.length');
    console.log('Tracer events:', eventCount);

    await evalJS('__PERFORMANCE_TRACER__.stopTracing()');

    ws.close();
    process.exit(0);
  });

  ws.on('error', (err) => { console.error('WS error:', err.message); process.exit(1); });
  setTimeout(() => { console.error('TIMEOUT'); process.exit(1); }, 20000);
}

main();
