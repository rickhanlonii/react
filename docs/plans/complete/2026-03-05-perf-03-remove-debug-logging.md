# Perf 03: Remove Debug Logging from Hot Paths

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Save 5-12ms by removing `print()` and `console.log()` calls from the render/commit hot path.

**Architecture:** During each commit, ~60+ `print()` calls fire in Swift (UIKitMutationApplier) and ~9 `console.log()` calls fire in JS (HostConfig). Each involves string interpolation + I/O. The trace system already captures mutation counts and types, making these logs redundant.

**Tech Stack:** Swift, JavaScript

---

### Task 1: Remove print() calls from UIKitMutationApplier

**Files:**
- Modify: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/UIKitMutationApplier.swift`

**Step 1: Remove all print() calls**

Remove the following print statements (line numbers approximate — search for the exact strings):
- Line 67: `print("[\(logPrefix)] Applying \(mutations.count) mutations")`
- Line 78: `print("[\(logPrefix)] [\(index)] CREATE: \(node.family.elementType)")`
- Line 114: `print("[\(logPrefix)]   frame: \(view.frame)")`
- Line 120: `print("[\(logPrefix)] [\(index)] DELETE: \(node.family.elementType)")`
- Line 131: `print("[\(logPrefix)] [\(index)] INSERT: ...")`
- Line 134: `print("[\(logPrefix)]   SKIPPED - parent or child view not found")`
- Any other `print(` calls in this file

Also remove the `logPrefix` property and constructor parameter if they become unused.

**Step 2: Build to verify**

Run: `/build demo`
Expected: Builds without errors.

---

### Task 2: Remove console.log() calls from HostConfig.js

**Files:**
- Modify: `packages/react-dom-native/src/renderer/HostConfig.js`

**Step 1: Remove all console.log calls**

Remove these console.log statements:
- Line 150: `console.log('[HostConfig] createInstance <' + type + '>')`
- Line 172: `console.log('[HostConfig] createTextInstance "' + text + '"')`
- Line 182: `console.log('[HostConfig] appendInitialChild ...')`
- Line 235: `console.log('[HostConfig] cloneInstance ...')`
- Line 291: `console.log('[HostConfig] replaceContainerChildren: hydration commit ...')`
- Line 297: `console.log('[HostConfig] replaceContainerChildren: ...')`
- Line 300: `console.log('[HostConfig]   [' + i + '] ...')`
- Line 612: `console.log('[HostConfig] hydrateInstance ...')`
- Line 627: `console.log('[HostConfig] hydrateTextInstance ...')`

---

### Task 3: Remove console.log() calls from renderer.js

**Files:**
- Modify: `packages/react-dom-native/src/renderer/renderer.js`

**Step 1: Remove all console.log calls**

Remove these:
- Line 142: `console.log('[Renderer] createRoot called ...')`
- Line 172: `console.log('[Renderer] Container created ...')`
- Line 175: `console.log('[Renderer] render called ...')`
- Line 177: `console.log('[Renderer] updateContainer completed')`
- Line 188: `console.log('[Renderer] hydrateRoot called ...')`
- Line 228: `console.log('[Renderer] Hydration container created ...')`
- Line 234: `console.log('### unmount called.')`

**Step 2: Build and run**

Run: `/build demo`
Expected: App works identically with no console output clutter.

**Step 3: Commit**

```bash
git add packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/UIKitMutationApplier.swift \
        packages/react-dom-native/src/renderer/HostConfig.js \
        packages/react-dom-native/src/renderer/renderer.js
git commit -m "perf: remove debug print/console.log from render hot paths"
```
