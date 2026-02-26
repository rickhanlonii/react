# Fizz Server Renderer Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the hand-rolled tree-walker SSR with React's Fizz server renderer using the `$$$config` injection pattern.

**Architecture:** Vendor the built `react-server` npm package into `packages/react-dom-native/vendor/react-server/`. Create `NativeFizzServerNode.js` that instantiates Fizz with `NativeFizzConfig` (the existing config) and wraps it in a `renderToPipeableStream` API with Node stream plumbing. Replace the 444-line tree-walker `index.js` with a re-export.

**Tech Stack:** react-server (Fizz), Node.js streams, NativeFizzConfig (existing)

**Design doc:** `docs/plans/2026-02-16-fizz-server-renderer-design.md`

---

### Task 1: Vendor react-server build output

**Files:**
- Create: `packages/react-dom-native/vendor/react-server/package.json`
- Create: `packages/react-dom-native/vendor/react-server/index.js`
- Create: `packages/react-dom-native/vendor/react-server/cjs/react-server.development.js`
- Create: `packages/react-dom-native/vendor/react-server/cjs/react-server.production.js`
- Modify: `packages/react-dom-native/package.json`

**Step 1: Copy built react-server files**

```bash
mkdir -p packages/react-dom-native/vendor/react-server/cjs
cp /Users/rickhanlonii/oss/react/build/oss-experimental/react-server/package.json packages/react-dom-native/vendor/react-server/
cp /Users/rickhanlonii/oss/react/build/oss-experimental/react-server/index.js packages/react-dom-native/vendor/react-server/
cp /Users/rickhanlonii/oss/react/build/oss-experimental/react-server/cjs/react-server.development.js packages/react-dom-native/vendor/react-server/cjs/
cp /Users/rickhanlonii/oss/react/build/oss-experimental/react-server/cjs/react-server.production.js packages/react-dom-native/vendor/react-server/cjs/
```

**Step 2: Update package.json dependency**

In `packages/react-dom-native/package.json`, change the `react-server` dependency from `file:../../../react/packages/react-server` to `file:./vendor/react-server`:

```json
{
  "dependencies": {
    "react-server": "file:./vendor/react-server"
  }
}
```

**Step 3: Verify the vendored package loads**

```bash
cd packages/react-dom-native && node -e "var RS = require('react-server'); console.log(typeof RS);"
```

Expected: `function` (the `$$$config` wrapper)

**Step 4: Commit**

```bash
git add packages/react-dom-native/vendor/react-server/ packages/react-dom-native/package.json
git commit -m "vendor: add built react-server package for Fizz SSR"
```

---

### Task 2: Fix NativeFizzConfig.js bugs

**Files:**
- Modify: `packages/react-dom-native/src/server/NativeFizzConfig.js`

**Context:** The config is already nearly complete. It exports all the functions Fizz expects (pushStartInstance, pushTextInstance, writeCompletedRoot, scheduleWork, writeChunk, etc.). Only one bug needs fixing.

**Step 1: Fix writeCompletedRoot**

The current implementation writes to a throwaway array `[]` then separately writes to destination. Fix it to write directly to destination only:

Before (`NativeFizzConfig.js:252-259`):
```js
exports.writeCompletedRoot = function writeCompletedRoot(
  destination,
  renderState,
) {
  writeInstruction([], ['R']);
  const line = JSON.stringify(['R']) + '\n';
  return destination.write(line);
};
```

After:
```js
exports.writeCompletedRoot = function writeCompletedRoot(
  destination,
  renderState,
) {
  const line = JSON.stringify(['R']) + '\n';
  return destination.write(line);
};
```

**Step 2: Commit**

```bash
git add packages/react-dom-native/src/server/NativeFizzConfig.js
git commit -m "fix: writeCompletedRoot writes directly to destination"
```

---

### Task 3: Create NativeFizzServerNode.js

**Files:**
- Create: `packages/react-dom-native/src/server/NativeFizzServerNode.js`

**Context:** This file is modeled on `react-dom/src/server/ReactDOMFizzServerNode.js` (lines 101-166) but stripped of all DOM concerns (no bootstrapScripts, no nonce, no importMap, no namespaceURI). It instantiates Fizz with NativeFizzConfig and wraps it in a `renderToPipeableStream` API.

Key reference: Fizz's `createRequest` signature (from `ReactFizzServer.js:555-567`):
```
createRequest(children, resumableState, renderState, rootFormatContext,
              progressiveChunkSize, onError, onAllReady, onShellReady,
              onShellError, onFatalError, formState)
```

**Step 1: Write NativeFizzServerNode.js**

```js
'use strict';

// NativeFizzServerNode — Fizz server entry point for Node.js streams.
//
// Instantiates React's Fizz renderer with NativeFizzConfig and provides
// renderToPipeableStream(), the same API shape as ReactDOMServer.

var ReactServer = require('react-server');
var NativeFizzConfig = require('./NativeFizzConfig');

var Fizz = ReactServer(NativeFizzConfig);

function createDrainHandler(destination, request) {
  return function () {
    Fizz.startFlowing(request, destination);
  };
}

function createCancelHandler(request, reason) {
  return function () {
    Fizz.stopFlowing(request);
    Fizz.abort(request, new Error(reason));
  };
}

function renderToPipeableStream(children, options) {
  if (!options) options = {};

  var resumableState = NativeFizzConfig.createResumableState();
  var request = Fizz.createRequest(
    children,
    resumableState,
    NativeFizzConfig.createRenderState(resumableState),
    NativeFizzConfig.createRootFormatContext(),
    options.progressiveChunkSize,
    options.onError,
    options.onAllReady,
    options.onShellReady,
    options.onShellError,
    undefined,  // onFatalError
    undefined,  // formState
  );

  var hasStartedFlowing = false;
  Fizz.startWork(request);

  return {
    pipe: function pipe(destination) {
      if (hasStartedFlowing) {
        throw new Error(
          'React currently only supports piping to one writable stream.',
        );
      }
      hasStartedFlowing = true;
      Fizz.prepareForStartFlowingIfBeforeAllReady(request);
      Fizz.startFlowing(request, destination);
      destination.on('drain', createDrainHandler(destination, request));
      destination.on(
        'error',
        createCancelHandler(
          request,
          'The destination stream errored while writing data.',
        ),
      );
      destination.on(
        'close',
        createCancelHandler(
          request,
          'The destination stream closed early.',
        ),
      );
      return destination;
    },
    abort: function abort(reason) {
      Fizz.abort(request, reason);
    },
  };
}

exports.renderToPipeableStream = renderToPipeableStream;
```

**Step 2: Commit**

```bash
git add packages/react-dom-native/src/server/NativeFizzServerNode.js
git commit -m "feat: add NativeFizzServerNode.js Fizz wrapper"
```

---

### Task 4: Replace index.js tree-walker with Fizz re-export

**Files:**
- Modify: `packages/react-dom-native/src/server/index.js`

**Step 1: Replace index.js contents**

Replace the entire 444-line file with:

```js
'use strict';

// react-dom-native/server — Server-side rendering for native
//
// Produces a streaming JSON-line instruction format that Swift processes
// directly to build the UIKit view tree without JavaScript.
//
// Usage:
//   const { renderToPipeableStream } = require('react-dom-native/server');
//   const { pipe } = renderToPipeableStream(<App />, {
//     onShellReady() { pipe(res); },
//     onError(err) { console.error(err); },
//   });

exports.renderToPipeableStream =
  require('./NativeFizzServerNode').renderToPipeableStream;
```

**Step 2: Commit**

```bash
git add packages/react-dom-native/src/server/index.js
git commit -m "refactor: replace tree-walker SSR with Fizz renderer"
```

---

### Task 5: Install dependencies and smoke test

**Step 1: Install updated dependencies**

```bash
npm install
```

This re-links the `react-server` file: dependency to the vendored location.

**Step 2: Run JS tests**

```bash
npm test
```

Expected: All unit tests pass (server tests are excluded from jest config via `testPathIgnorePatterns: ['/server/']`).

**Step 3: Start dev server and test SSR endpoint**

```bash
cd example && npm run dev &
sleep 3
curl http://localhost:6000/ssr
```

Expected: Returns JSON-line instruction stream with `["O","div",...]`, `["T","..."]`, `["C"]`, `["R"]` instructions. Same format as before.

**Step 4: Kill the dev server**

```bash
kill %1
```

**Step 5: Commit if any fixes were needed**

If smoke testing revealed issues that required fixes, commit them:

```bash
git add -u
git commit -m "fix: address Fizz integration issues from smoke test"
```

---

### Task 6: Clean up server.js (remove ensureTreeResolved)

**Files:**
- Modify: `example/server/server.js`

**Context:** The `ensureTreeResolved` function (lines 209-269) was needed by the tree-walker to pre-resolve all Flight lazy references before synchronous rendering. Fizz handles lazy/thenable resolution natively (it suspends and retries), so this function may no longer be needed. However, the Flight client still produces a root thenable that needs to be awaited before passing to `renderToPipeableStream`.

**Step 1: Simplify the SSR endpoint**

The `ensureTreeResolved` call and the `setImmediate` wrapper can potentially be simplified. However, this depends on whether Fizz can handle the root element being a thenable. Test first:

- If `renderToPipeableStream(rootElement)` works when `rootElement` is a thenable (Flight client root), remove `ensureTreeResolved` entirely
- If it doesn't, keep the `Promise.resolve(rootPromise).then(...)` wrapper but remove `ensureTreeResolved` and `setImmediate`

**Step 2: Test the simplified endpoint**

```bash
cd example && npm run dev &
sleep 3
curl http://localhost:6000/ssr
kill %1
```

**Step 3: Commit**

```bash
git add example/server/server.js
git commit -m "refactor: simplify SSR endpoint now that Fizz handles lazy resolution"
```

---

## Verification Checklist

After all tasks:

1. `npm test` — JS unit tests pass
2. `cd example && npm run dev` then `curl http://localhost:6000/ssr` — returns instruction stream
3. `curl http://localhost:6000/` — RSC endpoint still works (unchanged)
4. Build and run app in simulator — SSR content renders correctly
5. The instruction format matches what `InstructionStreamParser.swift` expects
