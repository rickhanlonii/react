# Plan 3b Part 1: Document Polyfill Infrastructure (Non-Breaking)

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add the infrastructure needed for Plan 3b Part 2 (replacing the custom flight-client fork with `react-server-dom-webpack/client`). All changes are additive — the existing flight-client, SSR pipeline, and app behavior are untouched.

**What this plan adds:**

1. `<html>`, `<head>`, `<body>` structural elements in the shadow tree
2. A `document` global polyfill wired to real shadow tree nodes
3. A Flight data receiver (`self.__next_f`) for the Next.js-style inline data pattern

**What this plan does NOT change:**

- Webpack target (stays `webworker`)
- Flight client (stays custom fork)
- SSR server (stays unchanged)
- Swift FlightStreamClient (stays unchanged)
- App behavior (everything works exactly as before)

**Tech Stack:** Swift (JSRuntime.swift, shadow tree), JavaScriptCore, JS (entry.js)

**Depends on:** Nothing — these are independent additions

---

### Task 1: Add `<html>`, `<head>`, and `<body>` elements to the shadow tree

Add three new structural elements that mirror the real DOM's document structure. These are prerequisites for the document polyfill — `document.head` will reference the real `<head>` shadow node.

**Element behavior:**

- **`<html>`** — Virtual node (no UIView), root of the shadow tree. Acts as `document.documentElement`.
- **`<head>`** — Virtual node (no UIView). Exists in the tree for script/metadata management. `appendChild(script)` triggers fetch+eval in Swift.
- **`<body>`** — Rendered node (UIView). Contains all visible content. Behaves like `<div>` for layout (block/column via Yoga).

**Use the `/add-element` skill** for the lockstep file checklist for each element. Key points:

- `<html>` and `<head>`: virtual elements (no UIView, similar to `<span>`'s virtual text approach but for structural purposes)
- `<body>`: rendered element (creates a UIView, layout defaults match `<div>`)
- All three need shadow node types registered in the shadow tree factory

**Commit:**
```
feat: add <html>, <head>, and <body> structural elements to shadow tree
```

---

### Task 2: Implement document polyfill wired to real shadow tree nodes

Create a `document` global polyfill that references the real `<html>` and `<head>` shadow tree nodes from Task 1. Unlike a fully fake DOM, `document.documentElement` and `document.head` point to actual nodes in the shadow tree. `document.createElement('script')` still returns lightweight fake objects (webpack script elements aren't rendered).

**Timing:** The `document` global is set up at JSRuntime init (before bundles load) with `documentElement` and `head` initially null. When the shadow tree creates `<html>` and `<head>` nodes (from SSR HTML processing or React rendering), it wires them to `document.documentElement` and `document.head`. This works because:
- **SSR path:** Shadow tree is created from HTML before JS chunk loading
- **CSR path:** Initial bundle is loaded directly (not via script tags); code-split chunks are loaded lazily during rendering, by which point `<head>` exists

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/JSRuntime.swift`

**Step 1: Add `setupDocumentPolyfill()` method**

Set up the `document` global with:

- `document.documentElement` — initially null, set when `<html>` shadow node is created
- `document.head` — initially null, set when `<head>` shadow node is created
- `document.createElement(tag)` — returns lightweight fake elements for script/link tags
- `document.getElementsByTagName('script')` — tracks created scripts for webpack dedup
- `document.baseURI` — returns server origin string
- `document.currentScript` — returns null

```swift
private func setupDocumentPolyfill() {
    let eng = engine

    // Track created script elements for getElementsByTagName dedup
    var createdScripts: [JSValueRef] = []

    // --- Helper: create a fake element (for script/link tags only) ---
    func makeFakeElement(_ tag: String) -> JSValueRef {
        let element = eng.makeObject()
        let attrs = eng.makeObject()

        eng.setProperty(element, "_tag", eng.makeString(tag))
        eng.setProperty(element, "_attrs", attrs)
        eng.setProperty(element, "parentNode", eng.makeNull())

        let setAttributeFn = eng.makeFunction { [weak eng] args in
            guard let eng = eng, args.count >= 2 else { return nil }
            let name = eng.toString(args[0]) ?? ""
            eng.setProperty(attrs, name, args[1])
            return nil
        }
        eng.setProperty(element, "setAttribute", setAttributeFn)

        let getAttributeFn = eng.makeFunction { [weak eng] args in
            guard let eng = eng, args.count >= 1 else { return nil }
            let name = eng.toString(args[0]) ?? ""
            if name == "src" {
                return eng.getProperty(element, "src")
            }
            return eng.getProperty(attrs, name)
        }
        eng.setProperty(element, "getAttribute", getAttributeFn)

        let removeChildFn = eng.makeFunction { _ in nil }
        eng.setProperty(element, "removeChild", removeChildFn)

        return element
    }

    // --- document object ---
    let doc = eng.makeObject()

    // Initially null — wired to real shadow nodes when tree is created
    eng.setProperty(doc, "documentElement", eng.makeNull())
    eng.setProperty(doc, "head", eng.makeNull())
    eng.setProperty(doc, "baseURI", eng.makeString(""))
    eng.setProperty(doc, "currentScript", eng.makeNull())

    // document.createElement(tag)
    let createElementFn = eng.makeFunction { [weak eng] args in
        guard let eng = eng, args.count >= 1 else { return nil }
        let tag = eng.toString(args[0]) ?? ""
        return makeFakeElement(tag)
    }
    eng.setProperty(doc, "createElement", createElementFn)

    // document.getElementsByTagName(tag)
    let getElementsByTagNameFn = eng.makeFunction { [weak eng] args in
        guard let eng = eng, args.count >= 1 else { return nil }
        let tag = eng.toString(args[0]) ?? ""
        if tag == "script" {
            return eng.makeArray(createdScripts)
        }
        return eng.makeArray([])
    }
    eng.setProperty(doc, "getElementsByTagName", getElementsByTagNameFn)

    engine.setGlobalProperty("document", doc)
}
```

**Step 2: Wire shadow tree creation to document**

When the shadow tree creates `<html>` and `<head>` nodes, set `document.documentElement` and `document.head` to reference them. This happens in the shadow tree node creation path (e.g., when processing SSR HTML or when React's reconciler calls `createInstance`).

**Step 3: Implement `<head>` appendChild behavior**

The `<head>` shadow node's `appendChild` method handles script elements specially:

- If the child has `_tag === "script"` and a `src` property, fetch via `URLSession` and evaluate with `engine.evaluate(code, sourceURL:)`
- Fire `script.onload` on success, `script.onerror` on failure
- Track the script in `createdScripts` for webpack dedup
- Set `script.parentNode` to the head node for cleanup (`script.parentNode.removeChild`)

Non-script children are handled normally (appended to the shadow tree).

**Step 4: Verify Swift tests pass**

Run: `npm run test:swift`
Expected: PASS

**Step 5: Commit**

```
feat: add document polyfill wired to real <html>/<head> shadow nodes
```

---

### Task 3: Add Flight data receiver to entry.js

Set up the `self.__next_f` global array pattern. This is the receiving end for inline Flight data that the SSR server will emit (in Part 2). Adding it now is a no-op since nothing pushes to it yet.

**Files:**
- Modify: `packages/react-dom-native/src/entry.js`

*(See Plan 3, Task 1 for full details — the Flight data receiver code is the same regardless of chunk loading approach.)*

**Commit:**
```
feat: add inline Flight data receiver (Next.js self.__next_f pattern)
```

---

### Task 4: Full verification

Verify that all existing functionality still works with the new infrastructure in place.

- Run: `npm test` — JS unit tests
- Run: `npm run test:swift` — Swift unit tests
- Run: `npm run test:fantom` — Fantom integration tests
- Build and run the app — verify it renders correctly with the existing flight-client

The document polyfill and new elements should be invisible to the existing pipeline.

**Commit:** (none — verification only)

---

## Risk Assessment

| Risk | Mitigation |
|------|------------|
| Existing code checks `typeof document !== 'undefined'` | May accidentally detect a browser environment. Audit for any code that branches on `document` existence. |
| Third-party code detecting browser via `document` | Unlikely in this codebase, but worth checking if any dependency behaves differently with `document` present. |
| New `<html>`/`<head>`/`<body>` elements break existing rendering | These elements are only created if React renders them. Existing app doesn't use them yet, so no impact. |
| `document.head` is null at startup | Expected — it's wired when shadow tree creates `<head>`. Nothing reads it in Part 1. |
