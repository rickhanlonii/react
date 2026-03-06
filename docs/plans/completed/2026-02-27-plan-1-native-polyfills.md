# Plan 1: Native JSC Polyfills for ReadableStream

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a ReadableStream polyfill to JavaScriptCore, injected from Swift the same way console, performance, timers, and TextEncoder/TextDecoder are.

**Architecture:** The polyfill is a JS string evaluated by `JSRuntime.setupTimerPolyfills()` (or a new `setupStreamPolyfills()` method). It only implements the subset that `react-server-dom-webpack/client` needs: constructor with `start(controller)`, `controller.enqueue/close/error`, `stream.getReader()`, and `reader.read()`. This is entirely non-breaking — it just makes a new global available.

**Tech Stack:** Swift (JSRuntime.swift), JavaScriptCore, Jest (unit tests)

---

## Context

### How existing polyfills work

All JSC polyfills are injected from Swift in `JSRuntime.swift`:
- `setupPerformancePolyfill()` (line 134) — uses `engine.evaluate()` with a multi-line JS string
- `setupTimerPolyfills()` (line 254) — uses `engine.setGlobalFunction()` for native-backed functions, `engine.evaluate()` for pure-JS polyfills (queueMicrotask, TextEncoder, TextDecoder)

The pattern is: check if the global exists, if not, define it via `engine.evaluate()`.

### What react-server-dom-webpack/client needs

From `ReactFlightDOMClientBrowser.js`, the Flight client calls:
- `new ReadableStream({ start(controller) {} })` — constructor with start callback
- `controller.enqueue(chunk)` — push Uint8Array chunks
- `controller.close()` — signal stream end
- `controller.error(err)` — signal stream error
- `stream.getReader()` — get a reader
- `reader.read()` — returns `Promise<{value, done}>`

It does NOT use: `pull()`, `cancel()`, `pipeTo()`, `pipeThrough()`, `tee()`, byte streams, or BYOB readers.

---

### Task 1: Write ReadableStream polyfill unit tests

**Files:**
- Create: `packages/react-dom-native/src/polyfills/__tests__/ReadableStream.test.js`

**Step 1: Write the tests**

```js
'use strict';

// Test the polyfill in isolation — don't rely on a global ReadableStream
const {installReadableStreamPolyfill} = require('../ReadableStream');

describe('ReadableStream polyfill', () => {
  let ReadableStream;

  beforeEach(() => {
    // Install into a fresh object to avoid polluting globals
    const target = {};
    installReadableStreamPolyfill(target);
    ReadableStream = target.ReadableStream;
  });

  it('calls start callback with controller', () => {
    let ctrl;
    new ReadableStream({
      start(controller) {
        ctrl = controller;
      },
    });
    expect(ctrl).toBeDefined();
    expect(typeof ctrl.enqueue).toBe('function');
    expect(typeof ctrl.close).toBe('function');
    expect(typeof ctrl.error).toBe('function');
  });

  it('reads enqueued chunks in order', async () => {
    let ctrl;
    const stream = new ReadableStream({
      start(c) { ctrl = c; },
    });
    const reader = stream.getReader();

    ctrl.enqueue(new Uint8Array([1, 2, 3]));
    ctrl.enqueue(new Uint8Array([4, 5, 6]));
    ctrl.close();

    const r1 = await reader.read();
    expect(r1).toEqual({value: new Uint8Array([1, 2, 3]), done: false});
    const r2 = await reader.read();
    expect(r2).toEqual({value: new Uint8Array([4, 5, 6]), done: false});
    const r3 = await reader.read();
    expect(r3).toEqual({value: undefined, done: true});
  });

  it('read() waits for enqueue when buffer is empty', async () => {
    let ctrl;
    const stream = new ReadableStream({
      start(c) { ctrl = c; },
    });
    const reader = stream.getReader();

    const promise = reader.read();
    let resolved = false;
    promise.then(() => { resolved = true; });
    await new Promise(r => setTimeout(r, 10));
    expect(resolved).toBe(false);

    ctrl.enqueue(new Uint8Array([42]));
    const result = await promise;
    expect(result).toEqual({value: new Uint8Array([42]), done: false});
  });

  it('read() resolves immediately when closed with empty buffer', async () => {
    let ctrl;
    const stream = new ReadableStream({
      start(c) { ctrl = c; },
    });
    const reader = stream.getReader();

    ctrl.close();
    const result = await reader.read();
    expect(result).toEqual({value: undefined, done: true});
  });

  it('pending read resolves on close', async () => {
    let ctrl;
    const stream = new ReadableStream({
      start(c) { ctrl = c; },
    });
    const reader = stream.getReader();

    const promise = reader.read();
    ctrl.close();
    const result = await promise;
    expect(result).toEqual({value: undefined, done: true});
  });

  it('propagates errors via controller.error()', async () => {
    let ctrl;
    const stream = new ReadableStream({
      start(c) { ctrl = c; },
    });
    const reader = stream.getReader();

    ctrl.error(new Error('stream failed'));
    await expect(reader.read()).rejects.toThrow('stream failed');
  });

  it('pending read rejects on error', async () => {
    let ctrl;
    const stream = new ReadableStream({
      start(c) { ctrl = c; },
    });
    const reader = stream.getReader();

    const promise = reader.read();
    ctrl.error(new Error('oops'));
    await expect(promise).rejects.toThrow('oops');
  });

  it('getReader() throws if stream is already locked', () => {
    const stream = new ReadableStream({ start() {} });
    stream.getReader();
    expect(() => stream.getReader()).toThrow('locked');
  });

  it('enqueue throws after close', () => {
    let ctrl;
    new ReadableStream({
      start(c) { ctrl = c; },
    });
    ctrl.close();
    expect(() => ctrl.enqueue(new Uint8Array([1]))).toThrow();
  });

  it('works with string chunks', async () => {
    let ctrl;
    const stream = new ReadableStream({
      start(c) { ctrl = c; },
    });
    const reader = stream.getReader();

    ctrl.enqueue('hello');
    ctrl.close();

    const r1 = await reader.read();
    expect(r1).toEqual({value: 'hello', done: false});
    const r2 = await reader.read();
    expect(r2).toEqual({value: undefined, done: true});
  });

  it('handles multiple pending reads rejected on error', async () => {
    let ctrl;
    const stream = new ReadableStream({
      start(c) { ctrl = c; },
    });
    const reader = stream.getReader();

    const p1 = reader.read();
    ctrl.error(new Error('fail'));
    await expect(p1).rejects.toThrow('fail');
    // Subsequent reads also reject
    await expect(reader.read()).rejects.toThrow('fail');
  });
});
```

**Step 2: Run test to verify it fails**

Run: `npx jest packages/react-dom-native/src/polyfills/__tests__/ReadableStream.test.js`
Expected: FAIL — module not found

---

### Task 2: Implement ReadableStream polyfill

**Files:**
- Create: `packages/react-dom-native/src/polyfills/ReadableStream.js`

**Step 1: Write the implementation**

```js
'use strict';

/**
 * Minimal ReadableStream polyfill for JavaScriptCore.
 *
 * Only implements the subset needed by react-server-dom-webpack/client:
 * - Constructor with start(controller)
 * - controller.enqueue(chunk), controller.close(), controller.error(err)
 * - stream.getReader() returning { read() -> Promise<{value, done}> }
 *
 * Does NOT implement: pull(), cancel(), pipeTo(), pipeThrough(), tee(),
 * byte streams, BYOB readers, or queuing strategy.
 */
function installReadableStreamPolyfill(target) {
  function ReadableStreamDefaultController(stream) {
    this._stream = stream;
  }

  ReadableStreamDefaultController.prototype.enqueue = function enqueue(chunk) {
    var stream = this._stream;
    if (stream._errored) {
      throw stream._storedError;
    }
    if (stream._closed) {
      throw new TypeError('Cannot enqueue to a closed ReadableStream');
    }
    if (stream._pendingRead !== null) {
      var resolve = stream._pendingRead;
      stream._pendingRead = null;
      stream._pendingReject = null;
      resolve({value: chunk, done: false});
    } else {
      stream._buffer.push(chunk);
    }
  };

  ReadableStreamDefaultController.prototype.close = function close() {
    var stream = this._stream;
    stream._closed = true;
    if (stream._pendingRead !== null) {
      var resolve = stream._pendingRead;
      stream._pendingRead = null;
      stream._pendingReject = null;
      resolve({value: undefined, done: true});
    }
  };

  ReadableStreamDefaultController.prototype.error = function error(err) {
    var stream = this._stream;
    stream._errored = true;
    stream._storedError = err;
    if (stream._pendingRead !== null) {
      var reject = stream._pendingReject;
      stream._pendingRead = null;
      stream._pendingReject = null;
      reject(err);
    }
  };

  function ReadableStreamDefaultReader(stream) {
    this._stream = stream;
  }

  ReadableStreamDefaultReader.prototype.read = function read() {
    var stream = this._stream;
    if (stream._errored) {
      return Promise.reject(stream._storedError);
    }
    if (stream._buffer.length > 0) {
      return Promise.resolve({value: stream._buffer.shift(), done: false});
    }
    if (stream._closed) {
      return Promise.resolve({value: undefined, done: true});
    }
    return new Promise(function (resolve, reject) {
      stream._pendingRead = resolve;
      stream._pendingReject = reject;
    });
  };

  function ReadableStream(underlyingSource) {
    this._buffer = [];
    this._closed = false;
    this._errored = false;
    this._storedError = null;
    this._pendingRead = null;
    this._pendingReject = null;
    this._locked = false;

    var controller = new ReadableStreamDefaultController(this);
    if (underlyingSource && typeof underlyingSource.start === 'function') {
      underlyingSource.start(controller);
    }
  }

  ReadableStream.prototype.getReader = function getReader() {
    if (this._locked) {
      throw new TypeError('ReadableStream is already locked to a reader');
    }
    this._locked = true;
    return new ReadableStreamDefaultReader(this);
  };

  target.ReadableStream = ReadableStream;
}

exports.installReadableStreamPolyfill = installReadableStreamPolyfill;
```

**Step 2: Run tests to verify they pass**

Run: `npx jest packages/react-dom-native/src/polyfills/__tests__/ReadableStream.test.js`
Expected: PASS

**Step 3: Commit**

```
feat: add ReadableStream polyfill for JavaScriptCore
```

---

### Task 3: Install polyfill from Swift

Inject the ReadableStream polyfill from Swift in `JSRuntime.swift`, following the same pattern as TextEncoder/TextDecoder.

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/JSRuntime.swift`

**Step 1: Add ReadableStream polyfill to `setupTimerPolyfills()`**

After the TextEncoder/TextDecoder polyfills (line 365), add:

```swift
// ReadableStream polyfill — minimal subset for react-server-dom-webpack/client.
// Supports: constructor with start(controller), controller.enqueue/close/error,
// stream.getReader(), reader.read() -> Promise<{value, done}>.
engine.evaluate("""
    if (typeof ReadableStream === 'undefined') {
        (function() {
            function Controller(stream) { this._s = stream; }
            Controller.prototype.enqueue = function(chunk) {
                var s = this._s;
                if (s._e) throw s._err;
                if (s._c) throw new TypeError('Cannot enqueue to a closed ReadableStream');
                if (s._pr !== null) {
                    var resolve = s._pr;
                    s._pr = null; s._pj = null;
                    resolve({value: chunk, done: false});
                } else {
                    s._b.push(chunk);
                }
            };
            Controller.prototype.close = function() {
                var s = this._s;
                s._c = true;
                if (s._pr !== null) {
                    var resolve = s._pr;
                    s._pr = null; s._pj = null;
                    resolve({value: undefined, done: true});
                }
            };
            Controller.prototype.error = function(err) {
                var s = this._s;
                s._e = true; s._err = err;
                if (s._pr !== null) {
                    var reject = s._pj;
                    s._pr = null; s._pj = null;
                    reject(err);
                }
            };

            function Reader(stream) { this._s = stream; }
            Reader.prototype.read = function() {
                var s = this._s;
                if (s._e) return Promise.reject(s._err);
                if (s._b.length > 0) return Promise.resolve({value: s._b.shift(), done: false});
                if (s._c) return Promise.resolve({value: undefined, done: true});
                return new Promise(function(resolve, reject) {
                    s._pr = resolve; s._pj = reject;
                });
            };

            globalThis.ReadableStream = function ReadableStream(source) {
                this._b = []; this._c = false; this._e = false; this._err = null;
                this._pr = null; this._pj = null; this._l = false;
                var ctrl = new Controller(this);
                if (source && typeof source.start === 'function') source.start(ctrl);
            };
            ReadableStream.prototype.getReader = function() {
                if (this._l) throw new TypeError('ReadableStream is already locked to a reader');
                this._l = true;
                return new Reader(this);
            };
        })();
    }
""")
```

**Step 2: Verify Swift tests pass**

Run: `npm run test:swift`
Expected: PASS

**Step 3: Verify JS tests still pass**

Run: `npm test`
Expected: PASS

**Step 4: Commit**

```
feat: inject ReadableStream polyfill from Swift JSRuntime
```

---

### Task 4: Verify polyfill works end-to-end

Verify the polyfill is available in the actual JSC environment by running the E2E tests.

**Step 1: Run E2E Swift tests**

Run: `npm run test:e2e-swift`
Expected: PASS (polyfill is injected but not yet consumed — no regressions)

**Step 2: Commit (if any fixes needed)**
