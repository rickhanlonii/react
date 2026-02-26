# Interleaved D Instructions Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Write D (Flight data) instructions to the SSR response inline as they arrive from the Flight stream, instead of batching them at the end after Fizz completes.

**Architecture:** Add a `shellReady` gate to the `flightCapture` Transform. Before `onShellReady`, buffer D rows in a small pending array. After `onShellReady`, flush pending rows and write subsequent D instructions directly to `res`. Remove the `capturedFlightRows` batch write from `fizzPassThrough.on('end')`. No client-side changes — the `InstructionStreamParser` already dispatches by opcode and handles interleaved D instructions.

**Tech Stack:** Node.js streams (Transform, PassThrough), Express response

---

### Task 1: Inline D instructions in the SSR stream

**Files:**
- Modify: `example/server/server.js:240-342`

**Step 1: Replace the buffered capture with inline emission**

The current code (lines 240-342) uses `capturedFlightRows` to buffer all Flight rows, then writes them in `fizzPassThrough.on('end')`. Replace the entire block from the Step 2 comment through the Fizz `onShellReady` handler with inline D emission.

Replace lines 240-342 with:

```javascript
  // Step 2: Intercept the Flight stream to emit D instructions inline.
  // Each Flight row is written to the response as a ["D", row] instruction
  // as soon as it arrives, interleaved with Fizz output. Rows that arrive
  // before onShellReady (before headers are sent) are buffered briefly.
  var shellReady = false;
  var pendingDRows = [];
  var partialRow = '';

  function emitDRow(row) {
    if (shellReady) {
      res.write(JSON.stringify(['D', row]) + '\n');
    } else {
      pendingDRows.push(row);
    }
  }

  var flightCapture = new Transform({
    transform: function (chunk, encoding, callback) {
      // Pass data through to the Flight client unchanged
      this.push(chunk);

      // Parse rows (newline-delimited) and emit as D instructions
      var text = chunk.toString();
      var lines = text.split('\n');

      // First element joins with any partial row from previous chunk
      lines[0] = partialRow + lines[0];
      partialRow = '';

      // Last element may be incomplete (no trailing newline)
      if (text[text.length - 1] !== '\n') {
        partialRow = lines.pop();
      } else {
        // Remove trailing empty string from split
        if (lines[lines.length - 1] === '') {
          lines.pop();
        }
      }

      for (var i = 0; i < lines.length; i++) {
        if (lines[i] !== '') {
          emitDRow(lines[i]);
        }
      }

      callback();
    },
    flush: function (callback) {
      // Flush any remaining partial row
      if (partialRow !== '') {
        emitDRow(partialRow);
        partialRow = '';
      }
      callback();
    },
  });

  // Pipe: flightStream → flightCapture → passThrough (for Flight client)
  var passThrough = new PassThrough();
  flightStream.pipe(flightCapture).pipe(passThrough);

  var createFromNodeStream =
    require('react-server-dom-webpack/client.node').createFromNodeStream;

  var ssrManifest = {
    moduleMap: ssrModuleMap,
    moduleLoading: null,
    serverModuleMap: null,
  };

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

      // Flush any D rows that arrived before the shell was ready.
      for (var i = 0; i < pendingDRows.length; i++) {
        res.write(JSON.stringify(['D', pendingDRows[i]]) + '\n');
      }
      pendingDRows = null;
      shellReady = true;

      var fizzPassThrough = new PassThrough();
      nativeStream.pipe(fizzPassThrough);

      fizzPassThrough.on('data', function (chunk) {
        res.write(chunk);
      });

      fizzPassThrough.on('end', function () {
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
1. Replace `capturedFlightRows` array with `shellReady` gate + `pendingDRows` buffer
2. Add `emitDRow()` helper that writes directly to `res` when ready, buffers otherwise
3. In `flightCapture.transform()`: call `emitDRow()` instead of `capturedFlightRows.push()`
4. In `onShellReady`: flush `pendingDRows`, set `shellReady = true`
5. In `fizzPassThrough.on('end')`: just `res.end()` — no batch D write
6. Update Step 2 comment to describe inline emission

**Step 2: Verify the server starts**

Run: `cd example/server && node --conditions react-server server.js`
Expected: `RSC server listening on http://localhost:6000`
Stop it with Ctrl+C.

**Step 3: Commit**

```bash
git add example/server/server.js
git commit -m "feat: interleave D instructions with Fizz output in SSR stream

Write Flight data rows as D instructions inline as they arrive,
interleaved with Fizz output, instead of batching them at the end.
Rows arriving before onShellReady are buffered briefly then flushed.
This gets Flight data to the client earlier and eliminates unbounded
server-side buffering."
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
- Behavior should be identical to before the change — D instructions arrive earlier but the client handles them the same way

**Step 4: Test hydration still works**

After content loads, verify:
- The app becomes interactive (hydration completes without errors)
- Check Xcode console for "[Falcon] Hydration complete" message
- No hydration mismatch errors in the console
