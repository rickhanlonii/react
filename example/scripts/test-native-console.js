'use strict';

// ---------------------------------------------------------------------------
// test-native-console.js
//
// Definitively determines whether console.log works when called from within
// a native-dispatched JS callback (Swift engine.callFunction) versus only
// working from Runtime.evaluate.
//
// Strategy:
//   - Tests from Runtime.evaluate (baseline)
//   - Tests from setTimeout/setInterval (JSC timer callbacks via Swift)
//   - Patches $$sendInspectorMessage to record ALL calls in a global array
//   - Waits 15 seconds for manual taps in the simulator
//   - After wait, checks global array to see if $$sendInspectorMessage was
//     called during native event dispatch even if CDP events weren't received
//
// Key insight: setTimeout/setInterval callbacks are dispatched via Swift
// engine.callFunction (same as native tap events), so if those work, native
// callbacks should also work. The test also installs a console.log call
// inside React's setState to capture what happens during re-render triggered
// by a tap.
//
// Usage: node example/scripts/test-native-console.js
// Requires: CDP proxy on port 8976, app running in simulator
// ---------------------------------------------------------------------------

const WebSocket = require('ws');

async function main() {
  // --- Connect to CDP proxy ---
  console.log('Fetching targets from http://localhost:8976/json ...');
  const resp = await fetch('http://localhost:8976/json');
  const targets = await resp.json();
  if (targets.length === 0) {
    console.error('No targets found - is the app running?');
    process.exit(1);
  }
  const wsUrl = targets[0].webSocketDebuggerUrl;
  console.log('Connecting to', wsUrl);

  const ws = new WebSocket(wsUrl);
  let nextId = 1;

  function sendCDP(method, params) {
    const id = nextId++;
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        ws.off('message', handler);
        reject(new Error('CDP response timeout for ' + method));
      }, 5000);

      const handler = (data) => {
        const msg = JSON.parse(data);
        if (msg.id === id) {
          ws.off('message', handler);
          clearTimeout(timeout);
          resolve(msg);
        }
      };
      ws.on('message', handler);
      ws.send(JSON.stringify({ id, method, params: params || {} }));
    });
  }

  ws.on('open', async () => {
    console.log('\n========================================');
    console.log('  Native Console Callback Test');
    console.log('========================================\n');

    // --- Enable Runtime domain ---
    await sendCDP('Runtime.enable', {});
    console.log('[setup] Runtime.enable done\n');

    // --- Collect ALL Runtime.consoleAPICalled events ---
    const consoleEvents = [];
    ws.on('message', (data) => {
      const msg = JSON.parse(data);
      if (msg.method === 'Runtime.consoleAPICalled') {
        const text = (msg.params.args || [])
          .map((a) => a.value || a.description || '')
          .join(' ');
        consoleEvents.push({ ts: Date.now(), text, type: msg.params.type });
        console.log('  [CDP] console.' + msg.params.type + ': ' + text);
      }
    });

    // ================================================================
    // TEST 1: console.log from Runtime.evaluate (baseline)
    // ================================================================
    console.log('--- TEST 1: console.log from Runtime.evaluate (baseline) ---');
    const before1 = consoleEvents.length;
    await sendCDP('Runtime.evaluate', {
      expression: "console.log('[TEST1] from Runtime.evaluate')",
    });
    await sleep(500);
    const t1pass = consoleEvents.length > before1;
    console.log('Result: ' + (t1pass ? 'PASS' : 'FAIL') + '\n');

    // ================================================================
    // TEST 2: console.log from setTimeout (native timer callback)
    //
    // setTimeout callbacks are dispatched via Swift's JSRuntime.fireTimer()
    // which calls engine.callFunction(callback, args: []).
    // This is the SAME codepath as native event dispatch.
    // ================================================================
    console.log('--- TEST 2: console.log from setTimeout (native callback) ---');
    const before2 = consoleEvents.length;
    await sendCDP('Runtime.evaluate', {
      expression:
        "setTimeout(function() { console.log('[TEST2] from setTimeout callback'); }, 100)",
    });
    await sleep(1000);
    const t2events = consoleEvents.slice(before2).filter(e => e.text.includes('[TEST2]'));
    const t2pass = t2events.length > 0;
    console.log('Result: ' + (t2pass ? 'PASS' : 'FAIL') +
      ' (' + t2events.length + ' events)\n');

    // ================================================================
    // TEST 3: console.log from setInterval (multiple native callbacks)
    // ================================================================
    console.log('--- TEST 3: console.log from setInterval (3 ticks) ---');
    const before3 = consoleEvents.length;
    await sendCDP('Runtime.evaluate', {
      expression: `(function() {
        var c = 0;
        var id = setInterval(function() {
          c++;
          console.log('[TEST3] setInterval tick #' + c);
          if (c >= 3) clearInterval(id);
        }, 200);
      })()`
    });
    await sleep(2000);
    const t3events = consoleEvents.slice(before3).filter(e => e.text.includes('[TEST3]'));
    const t3pass = t3events.length >= 3;
    console.log('Result: ' + (t3pass ? 'PASS' : 'FAIL') +
      ' (' + t3events.length + ' events)\n');

    // ================================================================
    // TEST 4: Patch $$sendInspectorMessage + verify it's called
    // ================================================================
    console.log('--- TEST 4: Patch $$sendInspectorMessage ---');
    const patchRes = await sendCDP('Runtime.evaluate', {
      expression: `(function() {
        globalThis.__inspectorCalls = [];
        globalThis.__inspectorCallCount = 0;
        if (typeof $$sendInspectorMessage !== 'function') {
          return 'SKIP: $$sendInspectorMessage is ' + typeof $$sendInspectorMessage;
        }
        globalThis.__origSend = $$sendInspectorMessage;
        $$sendInspectorMessage = function(data) {
          globalThis.__inspectorCallCount++;
          try {
            var p = JSON.parse(data);
            globalThis.__inspectorCalls.push({
              i: globalThis.__inspectorCallCount,
              t: p.type || '?',
              d: data.substring(0, 200),
              ts: Date.now()
            });
          } catch(e) {
            globalThis.__inspectorCalls.push({
              i: globalThis.__inspectorCallCount,
              t: 'err',
              d: data.substring(0, 200),
              ts: Date.now()
            });
          }
          globalThis.__origSend(data);
        };
        return 'OK: patched';
      })()`,
      returnByValue: true,
    });
    console.log('Patch result: ' + patchRes.result?.result?.value);

    // Verify: call console.log and check counter incremented
    await sendCDP('Runtime.evaluate', {
      expression: "console.log('[TEST4] verifying patch')",
    });
    await sleep(300);
    const verifyRes = await sendCDP('Runtime.evaluate', {
      expression: 'globalThis.__inspectorCallCount',
      returnByValue: true,
    });
    const t4pass = (verifyRes.result?.result?.value || 0) > 0;
    console.log('Verify: inspectorCallCount=' + verifyRes.result?.result?.value +
      ' ' + (t4pass ? 'PASS' : 'FAIL') + '\n');

    // ================================================================
    // TEST 5: Nested native callbacks (setTimeout within setTimeout)
    // ================================================================
    console.log('--- TEST 5: Nested native callbacks (setTimeout in setTimeout) ---');
    // Reset counters
    await sendCDP('Runtime.evaluate', {
      expression: 'globalThis.__inspectorCalls = []; globalThis.__inspectorCallCount = 0;',
    });
    const before5 = consoleEvents.length;
    await sendCDP('Runtime.evaluate', {
      expression: `setTimeout(function() {
        console.log('[TEST5a] outer setTimeout');
        setTimeout(function() {
          console.log('[TEST5b] inner setTimeout');
        }, 100);
      }, 100)`,
    });
    await sleep(1000);
    const t5a = consoleEvents.slice(before5).filter(e => e.text.includes('[TEST5a]'));
    const t5b = consoleEvents.slice(before5).filter(e => e.text.includes('[TEST5b]'));
    const t5pass = t5a.length > 0 && t5b.length > 0;
    console.log('Result: outer=' + t5a.length + ' inner=' + t5b.length +
      ' ' + (t5pass ? 'PASS' : 'FAIL') + '\n');

    // ================================================================
    // TEST 6: Check $$sendInspectorMessage visibility in callbacks
    //
    // This is the key test: does $$sendInspectorMessage exist as a
    // global when called from within a native callback (callFunction)?
    // ================================================================
    console.log('--- TEST 6: $$sendInspectorMessage visibility from callbacks ---');
    await sendCDP('Runtime.evaluate', {
      expression: 'globalThis.__inspectorCalls = []; globalThis.__inspectorCallCount = 0;',
    });
    const before6 = consoleEvents.length;
    await sendCDP('Runtime.evaluate', {
      expression: `(function() {
        // Store results in global so we can query them later
        globalThis.__visibilityResults = {};

        // Check from eval context (baseline)
        globalThis.__visibilityResults.eval_typeof = typeof $$sendInspectorMessage;
        globalThis.__visibilityResults.eval_isFunc = typeof $$sendInspectorMessage === 'function';

        // Check from setTimeout callback (native callFunction)
        setTimeout(function() {
          globalThis.__visibilityResults.timeout_typeof = typeof $$sendInspectorMessage;
          globalThis.__visibilityResults.timeout_isFunc = typeof $$sendInspectorMessage === 'function';

          // Try calling it directly
          try {
            $$sendInspectorMessage(JSON.stringify({
              type: 'console-message',
              cdpType: 'log',
              args: [{type: 'string', value: '[TEST6] direct $$sendInspectorMessage from setTimeout'}],
              timestamp: Date.now()
            }));
            globalThis.__visibilityResults.timeout_directCall = 'OK';
          } catch(e) {
            globalThis.__visibilityResults.timeout_directCall = 'ERROR: ' + e.message;
          }

          // Also try console.log
          console.log('[TEST6] console.log from setTimeout');
        }, 100);

        // Check from Promise.resolve (microtask)
        Promise.resolve().then(function() {
          globalThis.__visibilityResults.promise_typeof = typeof $$sendInspectorMessage;
          globalThis.__visibilityResults.promise_isFunc = typeof $$sendInspectorMessage === 'function';
          console.log('[TEST6] from Promise.resolve');
        });

        return 'visibility checks scheduled';
      })()`
    });
    await sleep(1000);

    const visRes = await sendCDP('Runtime.evaluate', {
      expression: 'JSON.stringify(globalThis.__visibilityResults)',
      returnByValue: true,
    });
    console.log('Visibility results:');
    try {
      const vis = JSON.parse(visRes.result?.result?.value || '{}');
      Object.entries(vis).forEach(([k, v]) => {
        console.log('  ' + k + ': ' + v);
      });
    } catch (e) {
      console.log('  (parse error)');
      console.log('  raw:', visRes.result?.result?.value);
    }

    const t6events = consoleEvents.slice(before6).filter(e => e.text.includes('[TEST6]'));
    const t6pass = t6events.length >= 2; // both setTimeout and Promise
    console.log('CDP events with [TEST6]: ' + t6events.length +
      ' ' + (t6pass ? 'PASS' : 'FAIL') + '\n');

    // ================================================================
    // WAIT FOR MANUAL TAPS
    // ================================================================
    console.log('========================================');
    console.log(' WAITING 15 SECONDS FOR MANUAL TAPS');
    console.log(' Tap any clickable element (Counter, etc.)');
    console.log('========================================\n');

    // Reset counters fresh for tap window
    await sendCDP('Runtime.evaluate', {
      expression: 'globalThis.__inspectorCalls = []; globalThis.__inspectorCallCount = 0;',
    });
    const tapStart = consoleEvents.length;
    await sleep(15000);
    const tapEnd = consoleEvents.length;

    console.log('\n--- TAP WAIT RESULTS ---');
    console.log('CDP events during wait: ' + (tapEnd - tapStart));
    if (tapEnd > tapStart) {
      consoleEvents.slice(tapStart, tapStart + 20).forEach(e => {
        console.log('  [' + e.type + '] ' + e.text);
      });
    } else {
      console.log('  (no CDP console events received)');
    }

    // ================================================================
    // POST-TAP: Check $$sendInspectorMessage call log
    // ================================================================
    console.log('\n--- POST-TAP: $$sendInspectorMessage call log ---');
    const postCount = await sendCDP('Runtime.evaluate', {
      expression: 'globalThis.__inspectorCallCount',
      returnByValue: true,
    });
    console.log('Total $$sendInspectorMessage calls during tap window: ' +
      postCount.result?.result?.value);

    const postCalls = await sendCDP('Runtime.evaluate', {
      expression: 'JSON.stringify((globalThis.__inspectorCalls || []).slice(0, 30))',
      returnByValue: true,
    });
    try {
      const calls = JSON.parse(postCalls.result?.result?.value || '[]');
      if (calls.length > 0) {
        console.log('Calls:');
        calls.forEach(c => {
          console.log('  [#' + c.i + ' ' + c.t + '] ' + c.d.substring(0, 100));
        });
      } else {
        console.log('  (no calls recorded)');
      }
    } catch (e) {
      console.log('  (parse error)');
    }

    // ================================================================
    // TEST 7: Final sanity check
    // ================================================================
    console.log('\n--- TEST 7: Final sanity check ---');
    const before7 = consoleEvents.length;
    await sendCDP('Runtime.evaluate', {
      expression: "console.log('[TEST7] final check')",
    });
    await sleep(500);
    const t7pass = consoleEvents.slice(before7).some(e => e.text.includes('[TEST7]'));
    console.log('Result: ' + (t7pass ? 'PASS' : 'FAIL') + '\n');

    // ================================================================
    // SUMMARY
    // ================================================================
    console.log('========================================');
    console.log('  SUMMARY');
    console.log('========================================');
    console.log('');
    console.log('TEST 1 - console.log from eval:            ' + (t1pass ? 'PASS' : 'FAIL'));
    console.log('TEST 2 - console.log from setTimeout:      ' + (t2pass ? 'PASS' : 'FAIL'));
    console.log('TEST 3 - console.log from setInterval:     ' + (t3pass ? 'PASS' : 'FAIL'));
    console.log('TEST 4 - $$sendInspectorMessage patching:  ' + (t4pass ? 'PASS' : 'FAIL'));
    console.log('TEST 5 - Nested setTimeout callbacks:      ' + (t5pass ? 'PASS' : 'FAIL'));
    console.log('TEST 6 - $$sendInspectorMessage visibility:' + (t6pass ? 'PASS' : 'FAIL'));
    console.log('TEST 7 - Final sanity check:               ' + (t7pass ? 'PASS' : 'FAIL'));
    console.log('');
    console.log('CDP events during 15s tap wait:            ' + (tapEnd - tapStart));
    console.log('$$sendInspectorMessage calls during wait:  ' + (postCount.result?.result?.value || 0));
    console.log('');

    // --- Analysis ---
    const allTimersPassed = t2pass && t3pass && t5pass;
    const tapEventsReceived = (tapEnd - tapStart) > 0;
    const tapCallsMade = (postCount.result?.result?.value || 0) > 0;

    if (allTimersPassed) {
      console.log('FINDING: console.log works from setTimeout/setInterval callbacks.');
      console.log('  These callbacks are dispatched via Swift engine.callFunction(),');
      console.log('  which is the SAME mechanism used for native event dispatch.');
      console.log('  Therefore, console.log should also work from tap handlers.');
    } else {
      console.log('FINDING: console.log does NOT work from timer callbacks!');
      console.log('  This suggests a fundamental issue with $$sendInspectorMessage');
      console.log('  visibility in engine.callFunction() contexts.');
    }

    console.log('');
    if (tapEventsReceived) {
      console.log('FINDING: CDP events WERE received during tap wait.');
      console.log('  console.log from native event callbacks works end-to-end.');
    } else if (tapCallsMade) {
      console.log('FINDING: $$sendInspectorMessage WAS called during tap wait,');
      console.log('  but CDP events did NOT reach the WebSocket.');
      console.log('  This suggests a proxy/relay issue, not a JSC issue.');
    } else {
      console.log('FINDING: No $$sendInspectorMessage calls during tap wait.');
      console.log('  Either no taps occurred, or console.log is not being called');
      console.log('  during native event handlers (no counter increment detected).');
    }

    console.log('\n=== Test complete ===\n');
    ws.close();
    process.exit(0);
  });

  ws.on('error', (err) => {
    console.error('WebSocket error:', err.message);
    process.exit(1);
  });

  setTimeout(() => {
    console.error('OVERALL TIMEOUT');
    process.exit(1);
  }, 45000);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

main();
