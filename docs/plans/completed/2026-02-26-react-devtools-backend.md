# React DevTools Backend Integration Plan

**Goal:** Bundle the React DevTools backend into the app so that React DevTools (standalone or browser extension) can connect and inspect the component tree. The backend must initialize before React loads so its `console.*` patches are in place for component stack logging.

**Key constraint — initialization order matters:**
1. **Native `console.*` injection** — JSC doesn't provide `console` by default. The native side must install `console.log`, `console.warn`, `console.error`, etc. as global functions (bridging to `NSLog` / the inspector proxy) before anything else runs.
2. **DevTools backend patching** — `react-devtools-core/backend` wraps the existing `console.*` methods to append component stacks. It must run after the native console is installed (so it has something to wrap) but before React loads.
3. **React** — At module init time, React checks whether `console` has been patched by DevTools. If the backend hasn't patched yet, component stacks won't appear.

```
Native console injection → DevTools backend patches console → React loads
```

---

### Task 1: Add react-devtools-core dependency

**Files:**
- Modify: `package.json` (root or `example/package.json`)

**Steps:**
1. Add `react-devtools-core` as a dev dependency
2. Run `npm install`

**Commit:** `chore: add react-devtools-core dependency`

---

### Task 2: Ensure native console globals are injected early

**Files:**
- Modify: Swift side — `ReactRuntime.swift` or the JSC bindings setup
- Possibly modify: `packages/react-dom-native/src/bridge/` (JS-side bridge init)

**Steps:**
1. Verify that `console.log`, `console.warn`, `console.error`, `console.info`, `console.debug`, and `console.trace` are installed as native global functions in the JSC context **before** the JS bundle is evaluated
2. These must bridge to the native side (NSLog, inspector proxy forwarding, etc.)
3. If they're currently installed lazily or inside the bundle itself, move them to pre-bundle injection — the JSC context setup in Swift should install them before `evaluateScript()` is called
4. This is the foundation that DevTools and React both depend on — without real `console.*` globals, DevTools has nothing to patch

**Commit:** `feat: inject native console globals before bundle evaluation`

---

### Task 3: Create a DevTools initialization module

**Files:**
- Create: `packages/react-dom-native/src/devtools/ReactDevToolsSetup.js`

**Steps:**
1. Create a module that imports `react-devtools-core/backend` and calls `initialize()`
2. The backend needs a WebSocket connection to the DevTools frontend. Use the standard standalone DevTools port (8097) or integrate with our existing inspector proxy on 8082
3. Wrap in a `__DEV__` guard so it's tree-shaken in production builds
4. This module must have NO imports of React or react-reconciler — it must be safe to require before React

```js
// Rough shape:
if (__DEV__) {
  const { initialize, connectToDevTools } = require('react-devtools-core/backend');
  connectToDevTools({
    host: 'localhost',
    port: 8097, // or route through our inspector proxy
    resolveRNStyle: null,
  });
}
```

**Commit:** `feat: add React DevTools backend setup module`

---

### Task 4: Ensure DevTools loads before React in the bundle

**Files:**
- Modify: entry point in `example/entry/` (the main bundle entry)
- Possibly modify: `example/scripts/build.js` (esbuild config)

**Steps:**
1. Add `require('react-dom-native/devtools/ReactDevToolsSetup')` as the very first line of the entry point, before any React imports
2. Alternatively, use esbuild's `inject` option to prepend the devtools setup automatically — this is more robust since it guarantees ordering regardless of entry point structure
3. Verify the build output has the devtools init code appearing before any React module code

**Key consideration:** esbuild's `inject` prepends modules before the entry point, guaranteeing they run first. This is safer than relying on import ordering in the entry file.

**Commit:** `feat: require DevTools backend before React in bundle`

---

### Task 5: Wire up the renderer hook

**Files:**
- Modify: `packages/react-dom-native/src/renderer/HostConfig.js` or the reconciler init

**Steps:**
1. After creating the reconciler instance, call `reconciler.injectIntoDevTools()` with the correct metadata:
   ```js
   reconciler.injectIntoDevTools({
     bundleType: __DEV__ ? 1 : 0,
     version: '19.x',
     rendererPackageName: 'react-dom-native',
   });
   ```
2. This may already exist — if so, verify it's being called correctly
3. This is what allows DevTools to see the component tree, not just patched console output

**Commit:** `feat: inject renderer into DevTools hook`

---

### Task 6: Verify component stack logging

**Steps:**
1. Start the dev server (`cd example && npm run dev`)
2. Launch the standalone React DevTools (`npx react-devtools`)
3. Build and run the app
4. Verify in the DevTools console that `console.warn` / `console.error` calls from React include component stacks
5. Verify the Components tab shows the component tree

**Commit:** N/A (testing)

---

### Open questions

1. **Connection transport:** Should the DevTools backend connect to the standalone app on port 8097, or should we route through our existing inspector proxy (port 8082)? Standalone is simpler to start; proxy integration is better long-term.
2. **`injectIntoDevTools` status:** May already be wired up in the reconciler — check before adding.
3. **esbuild `inject` vs entry import:** `inject` is more robust but may complicate the build config. Entry import is simpler but fragile if someone reorders imports.
4. **Current console injection:** Need to verify where/when the native `console.*` globals are currently installed — if already done pre-bundle in Swift, Task 2 is just verification.
