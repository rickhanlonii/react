'use strict';

// Test: verify taps change state, then trigger render via eval
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
    console.log('=== Programmatic Render Test ===\n');

    // 1. Install clean interceptor
    await evalJS(`
      (function() {
        // Get the real polyfill (unwrap any prior wrappers)
        var m = performance.measure;
        while (m._original) m = m._original;
        var callLog = [];
        var wrapped = function() {
          callLog.push(arguments[0]);
          return m.apply(this, arguments);
        };
        wrapped._original = m;
        performance.measure = wrapped;
        globalThis.__mLog = function() { return JSON.stringify(callLog); };
        globalThis.__mClear = function() { callLog.length = 0; };
      })()
    `);

    // 2. Also intercept console.timeStamp
    await evalJS(`
      (function() {
        var orig = console.timeStamp;
        while (orig._original) orig = orig._original;
        var log = [];
        var w = function() {
          if (arguments.length > 1) log.push(arguments[0]);
          return orig.apply(this, arguments);
        };
        w._original = orig;
        console.timeStamp = w;
        globalThis.__tsLog2 = function() { return JSON.stringify(log); };
      })()
    `);
    console.log('Interceptors installed\n');

    // 3. Find counter value via fiber tree
    const counterVal = await evalJS(`
      (function() {
        var hook = __REACT_DEVTOOLS_GLOBAL_HOOK__;
        var result = 'not found';
        hook._fiberRoots.forEach(function(roots) {
          roots.forEach(function(root) {
            function walk(fiber) {
              if (!fiber) return;
              if (typeof fiber.type === 'function' &&
                  (fiber.type.name === 'Counter' || fiber.type.displayName === 'Counter')) {
                // useState hook stores value in memoizedState
                var state = fiber.memoizedState;
                if (state && typeof state.memoizedState === 'number') {
                  result = 'Counter state: ' + state.memoizedState;
                } else {
                  result = 'Counter found, memoizedState: ' + JSON.stringify(state && state.memoizedState);
                }
              }
              walk(fiber.child);
              walk(fiber.sibling);
            }
            walk(root.current);
          });
        });
        return result;
      })()
    `);
    console.log(counterVal);

    // 4. Try to trigger a re-render by dispatching to the Counter's queue
    console.log('\nAttempting programmatic state update...');
    const updateResult = await evalJS(`
      (function() {
        var hook = __REACT_DEVTOOLS_GLOBAL_HOOK__;
        var found = false;
        hook._fiberRoots.forEach(function(roots) {
          roots.forEach(function(root) {
            function walk(fiber) {
              if (!fiber || found) return;
              if (typeof fiber.type === 'function' &&
                  (fiber.type.name === 'Counter' || fiber.type.displayName === 'Counter')) {
                // The useState hook's dispatch is in the queue
                var state = fiber.memoizedState;
                if (state && state.queue && state.queue.dispatch) {
                  state.queue.dispatch(state.memoizedState + 1);
                  found = true;
                  return;
                }
              }
              walk(fiber.child);
              walk(fiber.sibling);
            }
            walk(root.current);
          });
        });
        return found ? 'dispatched' : 'Counter dispatch not found';
      })()
    `);
    console.log('Update result:', updateResult);

    // 5. Wait for render to complete
    await new Promise(r => setTimeout(r, 500));

    // 6. Check interceptor logs
    const mLog = await evalJS('__mLog()');
    const tsLog = await evalJS('__tsLog2()');
    console.log('\nperformance.measure calls:', mLog);
    console.log('console.timeStamp calls:', tsLog);

    // 7. Verify counter changed
    const newVal = await evalJS(`
      (function() {
        var hook = __REACT_DEVTOOLS_GLOBAL_HOOK__;
        var result = 'not found';
        hook._fiberRoots.forEach(function(roots) {
          roots.forEach(function(root) {
            function walk(fiber) {
              if (!fiber) return;
              if (typeof fiber.type === 'function' &&
                  (fiber.type.name === 'Counter' || fiber.type.displayName === 'Counter')) {
                var state = fiber.memoizedState;
                if (state) result = 'Counter state: ' + state.memoizedState;
              }
              walk(fiber.child);
              walk(fiber.sibling);
            }
            walk(root.current);
          });
        });
        return result;
      })()
    `);
    console.log('After update:', newVal);

    ws.close();
    process.exit(0);
  });

  ws.on('error', (err) => { console.error('WS error:', err.message); process.exit(1); });
  setTimeout(() => { console.error('TIMEOUT'); process.exit(1); }, 10000);
}

main();
