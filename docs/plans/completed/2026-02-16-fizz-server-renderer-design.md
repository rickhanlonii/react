# Use React Fizz for Native SSR

## Context

The example server has an SSR endpoint (`/ssr`) that renders React elements into a JSON-line instruction stream for the native iOS client. Currently, `packages/react-dom-native/src/server/index.js` implements a 444-line hand-rolled tree-walker that manually walks React element trees, handles Suspense boundaries, tracks pending segments, and streams instructions.

A proper Fizz config (`NativeFizzConfig.js`) already exists in the same directory, implementing the `ReactFizzConfig` + `ReactServerStreamConfig` interfaces with the same instruction format — but it's dead code, not wired into anything.

## Decision

Replace the tree-walker with React's actual Fizz server renderer, using the `$$$config` injection pattern (same as `react-reconciler`).

## Approach

### Vendored react-server

The `react-server` package is built from the React repo (`yarn build react-server`) and produces a CJS bundle wrapped in `module.exports = function $$$reconciler($$$config) { ... }`. This is the same pattern used by `react-reconciler`.

The built output is vendored into:

```
packages/react-dom-native/vendor/react-server/
├── package.json
├── index.js
├── cjs/
│   ├── react-server.development.js
│   └── react-server.production.js
```

Referenced from `packages/react-dom-native/package.json` as `"react-server": "file:./vendor/react-server"`.

### NativeFizzServerNode.js

New ~50-line file modeled on `ReactDOMFizzServerNode.js`. Wires up the Fizz instance with `NativeFizzConfig` and exposes `renderToPipeableStream(children, options)` with Node stream plumbing (drain/error/close handlers, backpressure).

```js
var ReactServer = require('react-server');
var NativeFizzConfig = require('./NativeFizzConfig');
var Fizz = ReactServer(NativeFizzConfig);
```

### NativeFizzConfig.js fixes

- Fix `writeCompletedRoot` bug (writes to throwaway array instead of destination)
- Simplify `createRootFormatContext` / `createRenderState` / `createResumableState` signatures (remove unused DOM params)

### index.js

Replace the 444-line tree-walker with a re-export from `NativeFizzServerNode.js`.

## Instruction format (unchanged)

```
["O","div",{...props}]   Open element
["T","text content"]      Text node
["C"]                     Close element
["B",id]                  Begin Suspense boundary
["/B"]                    End boundary
["S",id]                  Begin completed segment
["/S"]                    End segment
["X",id]                  Execute boundary reveal
["R"]                     Root shell complete
["P",id]                  Placeholder for pending segment
["E",id,"digest"]         Client-render boundary (error)
```

The Swift `InstructionStreamParser` requires no changes.

## What Fizz provides over the tree-walker

- Proper incremental streaming with backpressure
- Correct Suspense boundary retry with Fizz-managed segment IDs
- Per-boundary error recovery
- Progressive rendering via `progressiveChunkSize`
- All React element types handled correctly (lazy, context, memo, forwardRef, class components) without manual code

## Files changed

| File | Action |
|------|--------|
| `packages/react-dom-native/vendor/react-server/` | Create — vendored build output |
| `packages/react-dom-native/package.json` | Update react-server dep to `file:./vendor/react-server` |
| `packages/react-dom-native/src/server/NativeFizzConfig.js` | Fix bugs, simplify signatures |
| `packages/react-dom-native/src/server/NativeFizzServerNode.js` | Create — renderToPipeableStream wrapper |
| `packages/react-dom-native/src/server/index.js` | Replace tree-walker with re-export |

## Verification

1. `cd example && npm run dev` — start dev server
2. `curl http://localhost:6000/ssr` — should return same instruction stream format
3. Build and run app in simulator — SSR content renders correctly
4. `npm test` — JS tests pass
