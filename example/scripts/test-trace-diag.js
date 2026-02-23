'use strict';

// Diagnostic: Check why performance.measure calls from React aren't
// reaching the tracer during renders.

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
    console.log('=== React Timing Diagnostic ===\n');

    // 1. Check console.createTask
    const hasCreateTask = await evalJS('typeof console.createTask');
    console.log('console.createTask:', hasCreateTask);

    // 2. Check if React's _debugTask is set on fibers
    const debugTaskCheck = await evalJS(`
      (function() {
        var hook = __REACT_DEVTOOLS_GLOBAL_HOOK__;
        if (!hook || !hook._fiberRoots) return 'no hook';
        var result = [];
        hook._fiberRoots.forEach(function(roots) {
          roots.forEach(function(root) {
            if (root.current) {
              var fiber = root.current;
              result.push('root._debugTask: ' + typeof fiber._debugTask);
              // Walk first few children
              var child = fiber.child;
              var depth = 0;
              while (child && depth < 5) {
                var name = typeof child.type === 'function' ? (child.type.name || 'Anon') : child.type;
                result.push('  ' + name + '._debugTask: ' + typeof child._debugTask);
                child = child.child;
                depth++;
              }
            }
          });
        });
        return result.join('\\n');
      })()
    `);
    console.log('Fiber _debugTask:\n' + debugTaskCheck);

    // 3. Intercept performance.measure to see if it's actually called
    console.log('\n--- Intercepting performance.measure ---');
    await evalJS(`
      (function() {
        var origMeasure = performance.measure;
        var measureCallCount = 0;
        performance.measure = function() {
          measureCallCount++;
          var args = Array.prototype.slice.call(arguments);
          console.log('[MEASURE] ' + args[0] + ' (call #' + measureCallCount + ')');
          return origMeasure.apply(this, arguments);
        };
        globalThis.__measureCallCount = function() { return measureCallCount; };
      })()
    `);
    console.log('Installed performance.measure interceptor');

    // 4. Also intercept console.timeStamp
    await evalJS(`
      (function() {
        var origTS = console.timeStamp;
        var tsCallCount = 0;
        console.timeStamp = function() {
          tsCallCount++;
          if (arguments.length > 1) {
            console.log('[TIMESTAMP] ' + arguments[0] + ' (call #' + tsCallCount + ', args: ' + arguments.length + ')');
          }
          return origTS.apply(this, arguments);
        };
        globalThis.__tsCallCount = function() { return tsCallCount; };
      })()
    `);
    console.log('Installed console.timeStamp interceptor');

    // 5. Start tracing
    await evalJS('__PERFORMANCE_TRACER__.startTracing()');
    console.log('\nTracing started. Tap the Counter button NOW...');
    console.log('Waiting 8 seconds...\n');

    await new Promise(r => setTimeout(r, 8000));

    // 6. Check call counts
    const measureCalls = await evalJS('__measureCallCount()');
    const tsCalls = await evalJS('__tsCallCount()');
    console.log('performance.measure call count:', measureCalls);
    console.log('console.timeStamp call count:', tsCalls);

    // 7. Check tracer events
    const eventCount = await evalJS('__PERFORMANCE_TRACER__._events.length');
    console.log('Tracer event count:', eventCount);

    if (eventCount > 2) {
      const summary = await evalJS(
        'JSON.stringify(__PERFORMANCE_TRACER__._events.slice(2).map(function(e){return e.name + " [" + e.cat + "]"}))'
      );
      console.log('Events:', summary);
    }

    await evalJS('__PERFORMANCE_TRACER__.stopTracing()');

    // 8. Restore original functions
    // (not critical since app will reload)

    console.log('\n=== Done ===');
    ws.close();
    process.exit(0);
  });

  ws.on('error', (err) => { console.error('WS error:', err.message); process.exit(1); });
  setTimeout(() => { console.error('TIMEOUT'); process.exit(1); }, 20000);
}

main();
