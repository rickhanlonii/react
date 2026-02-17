---
name: ssr-hydration
description: Use when debugging SSR rendering, hydration failures, Suspense streaming, or understanding the SSR-to-interactive pipeline
---

# SSR and Hydration

## Overview

SSR renders the React tree to native shadow nodes on the server, streams them to the client for instant display, then hydrates by attaching React's runtime to the existing nodes. The goal: instant first paint, then seamless transition to interactivity.

## Pipeline

```
Server                          Client (Native iOS)
------                          -------------------
App.js (RSC)
  |
  v
Flight Server (/rsc)
  |  (I/J rows)
  v
Fizz Server (/ssr)
  |  (JSON-line instructions)  URLSession streams chunks
  v                               v
["O","div",{...}]  ───────────> InstructionStreamParser
["T","text"]                      v
["B",id]  (pending boundary)    SSRCoordinator
["/B"]                            v
["S",id]  (segment content)     ShadowTreeBuilder (Yoga layout)
["/S"]                            v
["X",id]  (reveal boundary)    UIKitMutationApplier (first paint)
["R"]     (shell complete)        v
                                hydrateRoot() called
                                  v
                                JS bundle loads
                                  v
                                Flight client fetches /rsc
                                  v
                                reconciler.createHydrationContainer()
                                  v
                                Hydration walks SSR tree + React tree
                                  v
                                Interactive app
```

## SSR Instruction Format

| Instruction | Meaning |
|---|---|
| `["O","div",{...}]` | Open element (props optional) |
| `["T","text"]` | Text node |
| `["C"]` | Close element |
| `["O","#suspense"]` | Open completed Suspense boundary wrapper |
| `["B",id]` | Begin pending Suspense boundary |
| `["/B"]` | End pending boundary |
| `["S",id]` | Begin completed segment (async content) |
| `["/S"]` | End segment |
| `["X",id]` | Reveal boundary (swap fallback with content) |
| `["P",id]` | Placeholder for pending segment |
| `["R"]` | Root shell complete (triggers first paint) |

## Key Files

| File | Role |
|---|---|
| `src/server/NativeFizzConfig.js` | Fizz config: emits JSON-line instructions |
| `ios/.../SSR/SSRCoordinator.swift` | Routes instructions to tree builder + boundary manager |
| `ios/.../ShadowTree/ShadowTreeBuilder.swift` | Builds shadow tree from instructions (Yoga layout) |
| `ios/.../Root.swift` | Orchestrates SSR + hydration lifecycle |
| `src/renderer/renderer.js` | `hydrateRoot()` — creates hydration container |
| `src/renderer/HostConfig.js` | Hydration traversal functions (`canHydrate*`, `getFirstHydratableChild*`, etc.) |
| `ios/.../Bindings/Bindings.swift` | Bridge functions for SSR tree traversal (`$$getFirstSSRChild`, `$$getSSRChildOf`, `$$getNextSSRSibling`) |
| `src/entry.js` | `hydrateFromURL()` — fetches Flight stream and calls `hydrateRoot()` |

## Suspense Boundary Lifecycle

### Completed boundaries (resolved before shell)

Fizz emits `["O","#suspense"]` / `["C"]` wrapping the resolved content. The `#suspense` node appears in the SSR tree so `canHydrateSuspenseInstance` can match it. No fallback is ever shown.

### Pending boundaries (resolved after shell)

1. `["B",id]` arrives — SSRCoordinator creates a `#suspense` wrapper node with `pending: true, fallback: false`
2. Fallback content (e.g. `<p>Loading...</p>`) is added as children of `#suspense`
3. `["/B"]` closes the wrapper
4. `["R"]` triggers first paint — user sees fallback content
5. `["S",id]...["\/S"]` delivers resolved content to a separate segment builder
6. `["X",id]` reveals: replaces `#suspense` children with content, sets `pending: false`

### During hydration

- `canHydrateSuspenseInstance` matches `#suspense` nodes (checks `instance.type === '#suspense'`)
- `isSuspenseInstancePending` checks `instance.pending` — if true, React treats as dehydrated
- `isSuspenseInstanceFallback` checks `instance.fallback` — only true for error boundaries (server-side errors), **never** for normal pending boundaries
- After hydration, React's second commit removes `#suspense` wrappers and fallback content (React manages Suspense through its own fiber tree)

## Hydration Tree Traversal

The SSR tree is registered via `registerSSRTree()` which recursively assigns integer IDs to all `ShadowNodeWrapper` nodes. Bridge functions expose tree walking to JS:

- `$$getFirstSSRChild(surfaceId)` — first root-level SSR child
- `$$getSSRChildOf(nodeId)` — first child of a node
- `$$getNextSSRSibling(nodeId)` — next sibling (searches all trees)

Each returns a JS object with `{ _ssrNodeRef, _ssrFamily, type, text?, pending?, fallback? }`.

`hydrateInstance` reuses the SSR node by setting `instance._nativeNode = instance._ssrNodeRef` so subsequent `cloneInstance` calls can find the native `ShadowNodeWrapper` in the registry.

## Common Pitfalls

| Pitfall | Explanation |
|---|---|
| `fallback: true` on pending boundaries | Makes React think it's an error boundary, crashes on `getSuspenseInstanceFallbackErrorDetails().digest` |
| Missing `#suspense` wrapper nodes | `canHydrateSuspenseInstance` can't match, causes `HydrationMismatchException` |
| `onRecoverableError` set to noop | Hydration errors are silently swallowed; always log them |
| SSR tree not updated after reveal | If `pending` stays `true` after content is revealed, React treats the resolved boundary as dehydrated |
| `hydrateInstance` returning wrong value | Must return `true` (success); returning `null`/`false` triggers fallback to client render |
