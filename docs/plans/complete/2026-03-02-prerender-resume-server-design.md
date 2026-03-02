# Server-Side Prerender + Resume APIs

## Summary

Implement `prerender`, `prerenderToNodeStream`, and `resumeToPipeableStream` for react-dom-native's server renderer. These mirror react-dom's APIs but produce JSON-line native instructions instead of HTML.

## Architecture

Two Fizz entry points, both using the existing `NativeFizzConfig.js` host config:

1. **`NativeFizzStaticNode.js`** — `prerender()` and `prerenderToNodeStream()` for static prerendering
2. **`NativeFizzServerNode.js`** — adds `resumeToPipeableStream()` for request-time resume

The instruction format is unchanged: `["O","div",{...}]`, `["T","text"]`, `["B",id]`, `["X",id]`, `["R"]`, etc.

## Changes

### NativeFizzConfig.js

Add `resumeRenderState(resumableState, nonce)` — creates a fresh RenderState from postponed resumableState. Trivial since native state is just `{bootstrapScripts: []}`.

### NativeFizzStaticNode.js

Replace stubs with real implementations:

- `prerenderToNodeStream(children, options)` — calls `Fizz.createPrerenderRequest()`, waits for `onAllReady`, returns `Promise<{postponed, prelude: Readable}>`
- `prerender(children, options)` — same but returns `Promise<{postponed, prelude: ReadableStream}>`

### NativeFizzServerNode.js

Add `resumeToPipeableStream(children, postponedState, options)` — calls `Fizz.resumeRequest()` with `resumeRenderState()`, returns `{pipe(), abort()}`.

### server/index.js

Export `resumeToPipeableStream` alongside `renderToPipeableStream`.

### static.js

Already wired — no changes needed.

## Options

```js
// prerender options
{ bootstrapScripts, progressiveChunkSize, onError, signal }

// resume options
{ onError, onAllReady, onShellReady, onShellError, signal }
```

## Testing

Add tests exercising the prerender → resume flow:
1. Prerender a component tree with `postpone()` in a Suspense boundary
2. Verify `postponed` is non-null and prelude contains static shell instructions
3. Resume with dynamic data and verify resumed stream fills postponed boundaries
4. Verify combined output is a complete instruction stream

## Follow-up (separate plan)

Update the Falcon Demo app to use prerender + resume for a demo route.
