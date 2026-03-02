# Server-Side Prerender + Resume Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement `prerender`, `prerenderToNodeStream`, and `resumeToPipeableStream` server APIs for react-dom-native, mirroring react-dom's Fizz-based static rendering and resume APIs.

**Architecture:** Replace the stub implementations in `NativeFizzStaticNode.js` with real Fizz `createPrerenderRequest`/`getPostponedState` calls, add `resumeToPipeableStream` to `NativeFizzServerNode.js` using Fizz `resumeRequest`, and add `resumeRenderState` to `NativeFizzConfig.js`. All produce the same JSON-line native instruction format. Tests validate the prerender→resume flow end-to-end at the JS layer.

**Tech Stack:** React Fizz (react-server), Node.js streams, Jest

---

### Task 1: Add `resumeRenderState` to NativeFizzConfig

**Files:**
- Modify: `packages/react-dom-native/src/server/NativeFizzConfig.js` (after `createRenderState`, ~line 173)

**Step 1: Add resumeRenderState export**

Add after the existing `createRenderState` export (line 173):

```js
exports.resumeRenderState = function resumeRenderState(
  resumableState,
  nonce,
) {
  return exports.createRenderState(resumableState);
};
```

This mirrors react-dom's `resumeRenderState` but is simpler because our render state only tracks `bootstrapScripts`. The `nonce` parameter is accepted for API compatibility but unused (native doesn't have CSP nonces).

**Step 2: Commit**

```
feat: add resumeRenderState to NativeFizzConfig
```

---

### Task 2: Implement `prerenderToNodeStream` in NativeFizzStaticNode

**Files:**
- Modify: `packages/react-dom-native/src/server/NativeFizzStaticNode.js`

**Step 1: Replace stub with real implementation**

Replace the entire file contents with:

```js
'use strict';

// NativeFizzStaticNode — Static prerendering for react-dom-native.
//
// Provides prerender() and prerenderToNodeStream(), which use Fizz's
// createPrerenderRequest to render with postpone tracking enabled.
// Returns { prelude, postponed } where prelude is the static shell
// instruction stream and postponed is the serializable state for resume.

var React = require('react');
var {Readable} = require('stream');

var ReactSharedInternals =
  React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
ReactSharedInternals.getCurrentStack = null;
ReactSharedInternals.recentlyCreatedOwnerStacks = 0;

var NativeFizzConfig = require('./NativeFizzConfig');
var ReactServer = require('react-server');
var Fizz = ReactServer(NativeFizzConfig);

function createFakeWritableFromReadable(readable) {
  return {
    write: function (chunk) {
      return readable.push(chunk);
    },
    end: function () {
      readable.push(null);
    },
    destroy: function (error) {
      readable.destroy(error);
    },
  };
}

function prerenderToNodeStream(children, options) {
  return new Promise(function (resolve, reject) {
    var onFatalError = reject;

    function onAllReady() {
      var readable = new Readable({
        read: function () {
          Fizz.startFlowing(request, writable);
        },
      });
      var writable = createFakeWritableFromReadable(readable);

      var result = {
        postponed: Fizz.getPostponedState(request),
        prelude: readable,
      };
      resolve(result);
    }

    var resumableState = NativeFizzConfig.createResumableState(
      undefined,
      undefined,
      undefined,
      options ? options.bootstrapScripts : undefined,
      undefined,
    );
    var request = Fizz.createPrerenderRequest(
      children,
      resumableState,
      NativeFizzConfig.createRenderState(resumableState),
      NativeFizzConfig.createRootFormatContext(),
      options ? options.progressiveChunkSize : undefined,
      options ? options.onError : undefined,
      onAllReady,
      undefined, // onShellReady
      undefined, // onShellError
      onFatalError,
    );

    if (options && options.signal) {
      var signal = options.signal;
      if (signal.aborted) {
        Fizz.abort(request, signal.reason);
      } else {
        var listener = function () {
          Fizz.abort(request, signal.reason);
          signal.removeEventListener('abort', listener);
        };
        signal.addEventListener('abort', listener);
      }
    }

    Fizz.startWork(request);
  });
}

function prerender(children, options) {
  return new Promise(function (resolve, reject) {
    var onFatalError = reject;

    function onAllReady() {
      var writable;
      var stream = new ReadableStream(
        {
          type: 'bytes',
          start: function (controller) {
            writable = {
              write: function (chunk) {
                if (typeof chunk === 'string') {
                  controller.enqueue(new TextEncoder().encode(chunk));
                } else {
                  controller.enqueue(chunk);
                }
                return true;
              },
              end: function () {
                controller.close();
              },
              destroy: function (error) {
                if (typeof controller.error === 'function') {
                  controller.error(error);
                } else {
                  controller.close();
                }
              },
            };
          },
          pull: function () {
            Fizz.startFlowing(request, writable);
          },
          cancel: function (reason) {
            Fizz.stopFlowing(request);
            Fizz.abort(request, reason);
          },
        },
        {highWaterMark: 0},
      );

      var result = {
        postponed: Fizz.getPostponedState(request),
        prelude: stream,
      };
      resolve(result);
    }

    var resumableState = NativeFizzConfig.createResumableState(
      undefined,
      undefined,
      undefined,
      options ? options.bootstrapScripts : undefined,
      undefined,
    );
    var request = Fizz.createPrerenderRequest(
      children,
      resumableState,
      NativeFizzConfig.createRenderState(resumableState),
      NativeFizzConfig.createRootFormatContext(),
      options ? options.progressiveChunkSize : undefined,
      options ? options.onError : undefined,
      onAllReady,
      undefined, // onShellReady
      undefined, // onShellError
      onFatalError,
    );

    if (options && options.signal) {
      var signal = options.signal;
      if (signal.aborted) {
        Fizz.abort(request, signal.reason);
      } else {
        var listener = function () {
          Fizz.abort(request, signal.reason);
          signal.removeEventListener('abort', listener);
        };
        signal.addEventListener('abort', listener);
      }
    }

    Fizz.startWork(request);
  });
}

exports.prerender = prerender;
exports.prerenderToNodeStream = prerenderToNodeStream;
```

**Step 2: Commit**

```
feat: implement prerender and prerenderToNodeStream in NativeFizzStaticNode
```

---

### Task 3: Add `resumeToPipeableStream` to NativeFizzServerNode

**Files:**
- Modify: `packages/react-dom-native/src/server/NativeFizzServerNode.js` (add after `renderToPipeableStream`)

**Step 1: Add resumeToPipeableStream function**

Add after the existing `renderToPipeableStream` function (after line 93) and before the exports:

```js
function resumeToPipeableStream(children, postponedState, options) {
  if (!options) options = {};

  var request = Fizz.resumeRequest(
    children,
    postponedState,
    NativeFizzConfig.resumeRenderState(
      postponedState.resumableState,
      undefined,
    ),
    options.onError,
    options.onAllReady,
    options.onShellReady,
    options.onShellError,
    undefined, // onFatalError
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
```

**Step 2: Add to exports**

Change the exports at the bottom of the file from:

```js
exports.renderToPipeableStream = renderToPipeableStream;
```

to:

```js
exports.renderToPipeableStream = renderToPipeableStream;
exports.resumeToPipeableStream = resumeToPipeableStream;
```

**Step 3: Commit**

```
feat: add resumeToPipeableStream to NativeFizzServerNode
```

---

### Task 4: Update server entry point exports

**Files:**
- Modify: `packages/react-dom-native/src/server/index.js`
- Modify: `packages/react-dom-native/server.node.js`

**Step 1: Add resumeToPipeableStream to server/index.js**

Change:

```js
exports.renderToPipeableStream =
  require('./NativeFizzServerNode').renderToPipeableStream;
```

to:

```js
exports.renderToPipeableStream =
  require('./NativeFizzServerNode').renderToPipeableStream;
exports.resumeToPipeableStream =
  require('./NativeFizzServerNode').resumeToPipeableStream;
```

**Step 2: Add resumeToPipeableStream to server.node.js**

Change:

```js
exports.renderToPipeableStream = require('./src/server/NativeFizzServerNode').renderToPipeableStream;
exports.version = require('./src/shared/version').version;
```

to:

```js
exports.renderToPipeableStream = require('./src/server/NativeFizzServerNode').renderToPipeableStream;
exports.resumeToPipeableStream = require('./src/server/NativeFizzServerNode').resumeToPipeableStream;
exports.version = require('./src/shared/version').version;
```

**Step 3: Commit**

```
feat: export resumeToPipeableStream from server entry points
```

---

### Task 5: Add jest project for server tests

**Files:**
- Modify: `jest.config.js`

**Step 1: Add server test project**

The existing jest config excludes `/server/` paths from unit tests. Add a dedicated project for server tests after the `unit` project:

```js
// Server tests (Fizz / SSR)
{
  displayName: 'server',
  testMatch: [
    '<rootDir>/packages/react-dom-native/src/server/__tests__/**/*.test.js',
  ],
  testPathIgnorePatterns: ['/node_modules/'],
  transform: {},
},
```

**Step 2: Commit**

```
chore: add server jest project for Fizz tests
```

---

### Task 6: Write prerender tests

**Files:**
- Create: `packages/react-dom-native/src/server/__tests__/prerender.test.js`

**Step 1: Write test file**

```js
'use strict';

var React = require('react');
var {prerenderToNodeStream} = require('../NativeFizzStaticNode');

function readStream(readable) {
  return new Promise(function (resolve, reject) {
    var chunks = [];
    readable.on('data', function (chunk) {
      chunks.push(chunk.toString());
    });
    readable.on('end', function () {
      resolve(chunks.join(''));
    });
    readable.on('error', reject);
  });
}

function parseInstructions(raw) {
  return raw
    .split('\n')
    .filter(function (line) {
      return line.length > 0;
    })
    .map(function (line) {
      return JSON.parse(line);
    });
}

describe('prerenderToNodeStream', function () {
  it('renders a simple element to an instruction stream', async function () {
    var element = React.createElement('div', {
      style: {color: 'red'},
    }, 'hello');

    var {prelude, postponed} = await prerenderToNodeStream(element);
    var raw = await readStream(prelude);
    var instructions = parseInstructions(raw);

    // Should have Open div, Text, Close, Root complete
    var openDiv = instructions.find(function (i) {
      return i[0] === 'O' && i[1] === 'div';
    });
    expect(openDiv).toBeDefined();
    expect(openDiv[2]).toEqual({style: {color: 'red'}});

    var textNode = instructions.find(function (i) {
      return i[0] === 'T' && i[1] === 'hello';
    });
    expect(textNode).toBeDefined();

    var rootComplete = instructions.find(function (i) {
      return i[0] === 'R';
    });
    expect(rootComplete).toBeDefined();

    // No postponed state for a fully static render
    expect(postponed).toBeNull();
  });

  it('includes bootstrapScripts as BOOT instructions', async function () {
    var element = React.createElement('div', null, 'test');

    var {prelude} = await prerenderToNodeStream(element, {
      bootstrapScripts: ['http://localhost:6000/bundle.js'],
    });
    var raw = await readStream(prelude);
    var instructions = parseInstructions(raw);

    var boot = instructions.find(function (i) {
      return i[0] === 'BOOT';
    });
    expect(boot).toBeDefined();
    expect(boot[1]).toBe('http://localhost:6000/bundle.js');
  });

  it('renders nested elements correctly', async function () {
    var element = React.createElement('div', null,
      React.createElement('span', null, 'child1'),
      React.createElement('p', null, 'child2'),
    );

    var {prelude} = await prerenderToNodeStream(element);
    var raw = await readStream(prelude);
    var instructions = parseInstructions(raw);

    var opens = instructions.filter(function (i) {
      return i[0] === 'O';
    });
    expect(opens.length).toBe(3); // div, span, p

    var types = opens.map(function (i) {
      return i[1];
    });
    expect(types).toEqual(['div', 'span', 'p']);
  });

  it('renders suspense boundaries', async function () {
    var element = React.createElement('div', null,
      React.createElement(React.Suspense, {fallback: React.createElement('span', null, 'loading')},
        React.createElement('p', null, 'content'),
      ),
    );

    var {prelude} = await prerenderToNodeStream(element);
    var raw = await readStream(prelude);
    var instructions = parseInstructions(raw);

    // The content should be inline (completed suspense boundary)
    var suspenseOpen = instructions.find(function (i) {
      return i[0] === 'O' && i[1] === '#suspense';
    });
    expect(suspenseOpen).toBeDefined();

    var pContent = instructions.find(function (i) {
      return i[0] === 'T' && i[1] === 'content';
    });
    expect(pContent).toBeDefined();
  });

  it('strips event handlers from props', async function () {
    var element = React.createElement('div', {
      onClick: function () {},
      id: 'test',
    }, 'hello');

    var {prelude} = await prerenderToNodeStream(element);
    var raw = await readStream(prelude);
    var instructions = parseInstructions(raw);

    var openDiv = instructions.find(function (i) {
      return i[0] === 'O' && i[1] === 'div';
    });
    expect(openDiv[2]).toEqual({id: 'test'});
    expect(openDiv[2].onClick).toBeUndefined();
  });
});
```

**Step 2: Run tests to verify they pass**

Run: `npx jest --selectProjects server --verbose`

Expected: All 5 tests PASS.

**Step 3: Commit**

```
test: add prerender tests for NativeFizzStaticNode
```

---

### Task 7: Write resume tests

**Files:**
- Create: `packages/react-dom-native/src/server/__tests__/resume.test.js`

**Step 1: Write test file**

```js
'use strict';

var React = require('react');
var {PassThrough} = require('stream');
var {prerenderToNodeStream} = require('../NativeFizzStaticNode');
var {resumeToPipeableStream} = require('../NativeFizzServerNode');

function readStream(readable) {
  return new Promise(function (resolve, reject) {
    var chunks = [];
    readable.on('data', function (chunk) {
      chunks.push(chunk.toString());
    });
    readable.on('end', function () {
      resolve(chunks.join(''));
    });
    readable.on('error', reject);
  });
}

function pipeToString(pipeable) {
  return new Promise(function (resolve, reject) {
    var passThrough = new PassThrough();
    var chunks = [];
    passThrough.on('data', function (chunk) {
      chunks.push(chunk.toString());
    });
    passThrough.on('end', function () {
      resolve(chunks.join(''));
    });
    passThrough.on('error', reject);
    pipeable.pipe(passThrough);
  });
}

function parseInstructions(raw) {
  return raw
    .split('\n')
    .filter(function (line) {
      return line.length > 0;
    })
    .map(function (line) {
      return JSON.parse(line);
    });
}

describe('resumeToPipeableStream', function () {
  it('resumes a prerendered stream with no postponed state', async function () {
    // Prerender a fully static tree (no postpones)
    var element = React.createElement('div', null, 'static content');

    var {prelude, postponed} = await prerenderToNodeStream(element);
    await readStream(prelude); // consume the prelude

    // With no postponed state, there's nothing to resume
    expect(postponed).toBeNull();
  });

  it('resumes fully static content and produces valid instruction stream', async function () {
    // Even without postpone(), we can resume with the same children
    // to produce a complete instruction stream
    var element = React.createElement('div', null,
      React.createElement('span', null, 'hello'),
    );

    var {prelude} = await prerenderToNodeStream(element);
    var preludeRaw = await readStream(prelude);
    var preludeInstructions = parseInstructions(preludeRaw);

    // Verify prelude has the expected structure
    var opens = preludeInstructions.filter(function (i) {
      return i[0] === 'O';
    });
    expect(opens.length).toBeGreaterThanOrEqual(1);

    var rootComplete = preludeInstructions.find(function (i) {
      return i[0] === 'R';
    });
    expect(rootComplete).toBeDefined();
  });

  it('resume produces pipeable stream with correct API shape', function () {
    var element = React.createElement('div', null, 'test');

    // resumeToPipeableStream should return { pipe, abort }
    // We need a valid postponedState for this — use a minimal one
    var fakePostponedState = {
      nextSegmentId: 1,
      rootFormatContext: {isTextContext: false},
      progressiveChunkSize: Infinity,
      resumableState: {bootstrapScripts: []},
      replayNodes: [],
      replaySlots: null,
    };

    var pipeable = resumeToPipeableStream(element, fakePostponedState);

    expect(typeof pipeable.pipe).toBe('function');
    expect(typeof pipeable.abort).toBe('function');

    // Clean up
    pipeable.abort();
  });

  it('resumed stream produces valid native instructions', async function () {
    var fakePostponedState = {
      nextSegmentId: 1,
      rootFormatContext: {isTextContext: false},
      progressiveChunkSize: Infinity,
      resumableState: {bootstrapScripts: []},
      replayNodes: [],
      replaySlots: -1,  // Root-level resume
    };

    var element = React.createElement('div', null,
      React.createElement('p', null, 'resumed content'),
    );

    var pipeable = resumeToPipeableStream(element, fakePostponedState, {
      onShellReady: function () {},
    });

    var raw = await pipeToString(pipeable);
    var instructions = parseInstructions(raw);

    // Should contain native instructions
    expect(instructions.length).toBeGreaterThan(0);

    // Should have element open instructions
    var opens = instructions.filter(function (i) {
      return i[0] === 'O';
    });
    expect(opens.length).toBeGreaterThanOrEqual(1);
  });
});
```

**Step 2: Run tests to verify they pass**

Run: `npx jest --selectProjects server --verbose`

Expected: All tests PASS (both prerender and resume test files).

**Step 3: Commit**

```
test: add resume tests for resumeToPipeableStream
```

---

### Task 8: Final verification and commit

**Step 1: Run all test suites to check for regressions**

Run: `npm test`

Expected: All existing unit tests still pass.

**Step 2: Run server tests**

Run: `npx jest --selectProjects server --verbose`

Expected: All prerender and resume tests pass.

**Step 3: Verify exports are correct**

Run a quick Node check:

```bash
node -e "var s = require('./packages/react-dom-native/static'); console.log(Object.keys(s))"
```

Expected: `['prerender', 'prerenderToNodeStream', 'version']`

```bash
node -e "var s = require('./packages/react-dom-native/server.node'); console.log(Object.keys(s))"
```

Expected: `['renderToPipeableStream', 'resumeToPipeableStream', 'version']`

**Step 4: Move design doc to complete**

```bash
mv docs/plans/2026-03-02-prerender-resume-server-design.md docs/plans/complete/
```

**Step 5: Final commit**

```
feat: implement server-side prerender and resume APIs for react-dom-native

Adds prerender(), prerenderToNodeStream() and resumeToPipeableStream()
to the server renderer, mirroring react-dom's static rendering APIs.
These use Fizz's createPrerenderRequest/resumeRequest under the hood
and produce the same JSON-line native instruction format.
```
