# Progressive SSR Streaming Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Remove the blocking `Promise.resolve().then()` wrapper in the `/ssr` endpoint so Fizz can stream the shell with Suspense fallbacks immediately, then progressively reveal content as async server components resolve.

**Architecture:** Pass the Flight Thenable directly to `renderToPipeableStream` instead of awaiting it. Fizz natively handles Thenable children via `unwrapThenable()` / `SuspenseException`. The Flight client wraps unresolved chunks in `REACT_LAZY_TYPE` wrappers, so chunk 0 resolves quickly with lazy refs that Fizz suspends on inside `<Suspense>` boundaries.

**Tech Stack:** React Fizz (react-server), React Flight client (react-server-dom-webpack/client.node), Node.js streams

---

### Task 1: Restructure the /ssr endpoint

**Files:**
- Modify: `example/server/server.js:301-344`

**Step 1: Replace the Promise.resolve().then() wrapper**

Change the `/ssr` handler from awaiting the Flight Thenable to passing it directly to Fizz. The current code (lines 301-344):

```javascript
  var rootPromise = createFromNodeStream(passThrough, ssrManifest);

  // Step 3: Wait for root element, then render with Fizz.
  // Fizz handles lazy/thenable resolution natively (suspends and retries).
  Promise.resolve(rootPromise).then(function (rootElement) {
    var nativeSSR = require('react-dom-native/server');

    var renderToNativeStream = nativeSSR.renderToPipeableStream;
    var nativeStream = renderToNativeStream(rootElement, {
      onShellReady: function () {
        res.setHeader('Content-Type', 'application/x-native-ssr');
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cache-Control', 'no-cache');

        // Pipe Fizz output through an intermediary so we can append
        // D instructions after Fizz finishes writing.
        var fizzPassThrough = new PassThrough();
        nativeStream.pipe(fizzPassThrough);

        fizzPassThrough.on('data', function (chunk) {
          res.write(chunk);
        });

        fizzPassThrough.on('end', function () {
          // Emit captured Flight rows as D instructions.
          // The native parser recognizes ["D", row] and buffers the data.
          for (var i = 0; i < capturedFlightRows.length; i++) {
            res.write(JSON.stringify(['D', capturedFlightRows[i]]) + '\n');
          }
          res.end();
        });
      },
      onShellError: function (error) {
        console.error('[SSR] Shell error:', error);
        res.status(500).send('SSR shell error: ' + error.message);
      },
      onError: function (error) {
        console.error('[SSR] Error:', error);
      },
    });
  }).catch(function (error) {
    console.error('[SSR] Flight client error:', error);
    res.status(500).send('SSR error: ' + error.message);
  });
```

Replace with:

```javascript
  var rootThenable = createFromNodeStream(passThrough, ssrManifest);

  // Step 3: Render with Fizz, passing the Flight thenable directly.
  // Fizz handles thenable children natively: it calls unwrapThenable()
  // which throws SuspenseException if pending, rendering Suspense
  // fallbacks immediately. When Flight chunks resolve, Fizz resumes
  // via pingTask() and streams reveal instructions.
  var nativeSSR = require('react-dom-native/server');

  var renderToNativeStream = nativeSSR.renderToPipeableStream;
  var nativeStream = renderToNativeStream(rootThenable, {
    onShellReady: function () {
      res.setHeader('Content-Type', 'application/x-native-ssr');
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Cache-Control', 'no-cache');

      // Pipe Fizz output through an intermediary so we can append
      // D instructions after Fizz finishes writing.
      var fizzPassThrough = new PassThrough();
      nativeStream.pipe(fizzPassThrough);

      fizzPassThrough.on('data', function (chunk) {
        res.write(chunk);
      });

      fizzPassThrough.on('end', function () {
        // Emit captured Flight rows as D instructions.
        // The native parser recognizes ["D", row] and buffers the data.
        for (var i = 0; i < capturedFlightRows.length; i++) {
          res.write(JSON.stringify(['D', capturedFlightRows[i]]) + '\n');
        }
        res.end();
      });
    },
    onShellError: function (error) {
      console.error('[SSR] Shell error:', error);
      res.status(500).send('SSR shell error: ' + error.message);
    },
    onError: function (error) {
      console.error('[SSR] Error:', error);
    },
  });
```

The changes are:
1. Rename `rootPromise` → `rootThenable` (clarity)
2. Remove `Promise.resolve(rootPromise).then(function (rootElement) { ... })` wrapper
3. Remove `.catch()` handler (errors now go through `onShellError`/`onError`)
4. Pass `rootThenable` directly to `renderToNativeStream()` instead of `rootElement`
5. Move `require('react-dom-native/server')` outside the `.then()` callback
6. Update comment to explain the progressive streaming mechanism

**Step 2: Verify the server starts**

Run: `cd example && node server/server.js`
Expected: `RSC server listening on http://localhost:6000`
Stop it with Ctrl+C.

**Step 3: Commit**

```bash
git add example/server/server.js
git commit -m "feat: enable progressive SSR streaming with Suspense

Pass the Flight thenable directly to Fizz's renderToPipeableStream
instead of awaiting it. Fizz natively handles thenable children via
unwrapThenable/SuspenseException, streaming the shell with Suspense
fallbacks immediately and revealing content progressively as async
server components resolve."
```

### Task 2: Manual verification

**Step 1: Start the dev server**

Run: `cd example && npm run dev`

**Step 2: Build and run the app in the simulator**

Use the `build_run_sim` MCP tool or Xcode.

**Step 3: Observe the loading behavior**

Expected behavior:
- App should immediately show the shell content (the wrapping `<div>`, the timestamp `<p>`)
- `<Suspense>` fallbacks ("Loading tables...", "Loading media...") should appear right away
- After ~1 second, the tables section should appear (replacing "Loading tables...")
- After ~2.5 seconds, the media section should appear (replacing "Loading media...")

If instead you see a blank screen for ~1 second then everything appearing at once, the progressive streaming is not working.

**Step 4: Test hydration still works**

After content loads, verify:
- The app becomes interactive (hydration completes without errors)
- Check Xcode console for "[Falcon] Hydration complete" message
- No hydration mismatch errors in the console

**Step 5: Test error handling**

Temporarily modify `App.js` to throw in a server component (outside a Suspense boundary):
```javascript
function App() {
  throw new Error('test shell error');
  // ...
}
```

Verify the `/ssr` endpoint returns a 500 error via `onShellError`.
Revert the change after testing.
