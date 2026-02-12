---
name: impl-fantom
description: Implement the Fantom-inspired integration testing framework. Covers shared ShadowTree module, headless tester binary, JS test runtime, Jest runner, and example tests.
---

# Implement: Fantom Integration Testing Framework

## Objective

Build a Fantom-inspired integration testing framework that runs the real React reconciler and Swift bridge code inside a headless macOS binary (no simulator), using StubViews instead of UIViews. Tests are written as `-itest.js` files, bundled with esbuild, executed in JavaScriptCore inside the FantomTester binary, and reported back to Jest via JSON IPC.

## Dependencies

This skill requires packages installed by `/install-dependencies`.
If not already run, run `/install-dependencies` first.

## Prerequisites

- `/install-dependencies` must be run
- `packages/react-dom-native/src/renderer/` must exist (reconciler host config)
- `packages/react-dom-native/src/bridge/` must exist (bridge JS side)
- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bridge/` must exist (Swift bridge code)

## Architecture

```
Test file (-itest.js)
  → esbuild bundles with runtime/setup.js + renderer + components
  → Jest runner spawns FantomTester binary with bundle path
  → FantomTester (Swift/macOS) loads bundle in JavaScriptCore
  → JS calls $$createNode, $$completeRoot etc. → real Swift bridge code
  → Differentiator produces mutations → applied to StubView (not UIView)
  → $$getRenderedOutput serializes StubViewTree to JSON
  → Test assertions run inside JSC
  → Results reported via $$reportResult → stdout JSON → Jest runner
```

## Instructions

### 1. Extract shared ShadowTree Swift module

Move UIKit-independent shadow tree code from `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bridge/` into a new `packages/react-dom-native/ios/Sources/ShadowTree/` library target. The ShadowTree module must have **zero UIKit imports** so it compiles on macOS.

**Files to create in `packages/react-dom-native/ios/Sources/ShadowTree/`:**

- **`ShadowNodeFamily.swift`** — Move `ShadowNodeFamily` class from `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bridge/ShadowNodeWrapper.swift`. This is the stable identity object shared across immutable shadow node clones. Keep the `JSManagedValue`-based `instanceHandle` property.

- **`ShadowNodeWrapper.swift`** — Move `ShadowNodeWrapper` class from `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bridge/ShadowNodeWrapper.swift`. This is the `@objc` NSObject wrapper that carries props, children, family, text, and layoutFrame. Keep all clone helpers (`cloneWithNewProps`, `cloneWithNewChildren`, `cloneWithNewChildrenAndProps`, `clone`).

- **`Mutation.swift`** — Move the `Mutation` enum from `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bridge/Differentiator.swift`. These are the five mutation types: create, delete, insert, remove, update.

- **`Differentiator.swift`** — Move the diff algorithm (`diff()`, `createSubtree()`, `deleteSubtree()`) from `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bridge/Differentiator.swift` into this module. **Remove** the `viewRegistry` dependency and UIKit-specific `applyMutations()` method. The Differentiator in ShadowTree should be a pure function or a simple class that only produces `[Mutation]` from old/new children. It should NOT apply mutations — that responsibility moves to consumers (UIKitMutationApplier in the app, StubMutationApplier in the tester).

  The new Differentiator API:
  ```swift
  class Differentiator {
      func diff(
          oldChildren: [ShadowNodeWrapper],
          newChildren: [ShadowNodeWrapper],
          parent: ShadowNodeWrapper?
      ) -> [Mutation]
  }
  ```

**Update existing app code:**

- **`packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bridge/Differentiator.swift`** — Replace with a `UIKitMutationApplier` class that imports `ShadowTree` and `UIKit`, takes a `ViewRegistry`, and implements the `applyMutations(_:rootView:)` method plus the `createView(for:)`, `applyProps(_:to:)`, `applyLayout(_:to:)` helpers and the `UIColor.fromCSS` extension. The app's `NativeBridge` should use `Differentiator` from `ShadowTree` for diffing, and `UIKitMutationApplier` for applying.

- **`packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bridge/ShadowNodeWrapper.swift`** — Replace contents with `@_exported import ShadowTree` (or just add `import ShadowTree` to files that need it) so existing code continues to compile without changes.

- **`packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bridge/NativeBridge.swift`** — Add `import ShadowTree`. Update to use the new `Differentiator` (from ShadowTree) and `UIKitMutationApplier` (local). The `differentiator.diff()` call stays the same. Replace `differentiator.applyMutations()` with `mutationApplier.applyMutations()`.

- **`packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bridge/ViewRegistry.swift`** — Add `import ShadowTree` (for `ShadowNodeFamily`). The ViewRegistry stays in the app target since it depends on UIKit.

### 2. Update `packages/react-dom-native/ios/Package.swift`

Add macOS platform support, the ShadowTree library target, and the FantomTester executable target:

```swift
// swift-tools-version:5.9
import PackageDescription

let package = Package(
    name: "ReactDomNative",
    platforms: [.iOS(.v15), .macOS(.v13)],
    products: [
        .library(name: "ReactDomNativeKit", targets: ["ReactDomNativeKit"]),
        .library(name: "ShadowTree", targets: ["ShadowTree"]),
        .executable(name: "FantomTester", targets: ["FantomTester"])
    ],
    dependencies: [],
    targets: [
        .target(
            name: "ShadowTree",
            dependencies: [],
            path: "Sources/ShadowTree"
        ),
        .target(
            name: "ReactDomNativeKit",
            dependencies: ["ShadowTree"],
            path: "Sources/ReactDomNativeKit",
            resources: [.copy("Resources")]
        ),
        .executableTarget(
            name: "FantomTester",
            dependencies: ["ShadowTree"],
            path: "Sources/FantomTester"
        ),
        .testTarget(
            name: "ReactDomNativeTests",
            dependencies: ["ReactDomNativeKit"],
            path: "Tests/ReactDomNativeTests"
        )
    ]
)
```

Note: The ReactDomNativeKit target should only compile on iOS. The FantomTester target should only compile on macOS. Use conditional compilation (`#if canImport(UIKit)`) where needed, or platform-specific target settings.

### 3. Build FantomTester headless Swift binary

Create `tools/fantom/ios/Sources/FantomTester/` with the following files:

- **`main.swift`** — Entry point. Reads the JS bundle path from command-line arguments. Creates a `TesterBridge`, loads the bundle into JSC, and runs it. Captures results from `$$reportResult` and prints JSON to stdout. Exit code 0 = all tests passed, 1 = failures.

  ```
  Usage: FantomTester <path-to-bundle.js>
  ```

  The main function should:
  1. Parse args to get bundle path
  2. Create a `JSContext`
  3. Create a `TesterBridge(context:)` which registers all `$$`-prefixed functions
  4. Read the JS bundle file and evaluate it in the context
  5. The bundle will call `$$RunTests$$()` which triggers test execution
  6. Collect results and print JSON to stdout

- **`TesterBridge.swift`** — Registers the same `$$`-prefixed bridge functions as `NativeBridge.swift` but targets macOS (no UIKit). Use `NativeBridge.swift` as a template. Key differences:
  - Uses `StubViewRegistry` instead of `ViewRegistry`
  - Uses `StubMutationApplier` instead of `UIKitMutationApplier`
  - Adds `$$getRenderedOutput(surfaceId)` — serializes the current StubView tree to a JSON-compatible dictionary
  - Adds `$$reportResult(jsonString)` — receives test results from JS runtime
  - Adds `$$RunTests$$` registration — the JS runtime calls this to start test execution
  - No `$$fetch` needed (tests don't do network)
  - No UIKit imports

- **`StubView.swift`** — Simple tree structure that mirrors what UIView would be, but is a plain Swift class (no UIKit):

  ```swift
  class StubView {
      let elementType: String
      var props: [String: Any]
      var children: [StubView]
      var frame: CGRect

      func toJSON() -> [String: Any] {
          // Recursively serialize to dictionary
      }
  }
  ```

- **`StubViewRegistry.swift`** — Same interface as `ViewRegistry` but maps `ShadowNodeFamily` → `StubView` instead of UIView. Template: `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bridge/ViewRegistry.swift`.

- **`StubMutationApplier.swift`** — Applies `[Mutation]` to StubViews. Same logic as the UIKit `applyMutations` but operates on StubView tree:
  - `.create` → create a new `StubView` and register in `StubViewRegistry`
  - `.delete` → unregister from `StubViewRegistry`
  - `.insert` → add child StubView at index
  - `.remove` → remove child StubView
  - `.update` → update props and frame on StubView

### 4. JS test runtime

Create `tools/fantom/src/runtime/setup.js`:

This file is prepended to every test bundle. It provides `describe`, `it`, `expect`, and a `$$RunTests$$` global that the Swift tester calls to execute tests.

```javascript
// Global test registry
const suites = [];
let currentSuite = null;

function describe(name, fn) {
    const suite = { name, tests: [], beforeEach: null, afterEach: null };
    const prev = currentSuite;
    currentSuite = suite;
    suites.push(suite);
    fn();
    currentSuite = prev;
}

function it(name, fn) {
    if (!currentSuite) throw new Error('it() must be inside describe()');
    currentSuite.tests.push({ name, fn });
}

function expect(actual) {
    return {
        toBe(expected) { /* strict equality */ },
        toEqual(expected) { /* deep equality */ },
        toContain(item) { /* array/string contains */ },
        toBeTruthy() { /* truthy check */ },
        toBeFalsy() { /* falsy check */ },
        toThrow(msg) { /* function throws */ },
        not: { /* negated versions */ }
    };
}

// Called by Swift TesterBridge to run all registered tests
globalThis.$$RunTests$$ = function() {
    const results = { passed: 0, failed: 0, errors: [] };
    for (const suite of suites) {
        for (const test of suite.tests) {
            try {
                test.fn();
                results.passed++;
            } catch (e) {
                results.failed++;
                results.errors.push({
                    suite: suite.name,
                    test: test.name,
                    error: e.message,
                    stack: e.stack
                });
            }
        }
    }
    // Report back to Swift
    $$reportResult(JSON.stringify(results));
};
```

### 5. JS test API

Create `tools/fantom/src/index.js`:

This module provides the test-facing API that itest files import. It wraps the `$$`-prefixed bridge functions into a convenient interface.

```javascript
const { createRoot: rendererCreateRoot } = require('../../packages/react-dom-native/src/renderer/renderer');
const React = require('react');

/**
 * Creates a root and renders into it within the test harness.
 * Returns an object with render/unmount/getOutput methods.
 */
function createRoot() {
    const surfaceId = 1; // Tests use a single surface
    const nativeRootView = { surfaceId, width: 390, height: 844 };
    const root = rendererCreateRoot(nativeRootView);

    return {
        render(element) {
            root.render(element);
        },
        unmount() {
            root.unmount();
        }
    };
}

/**
 * Run a synchronous task (flushes React work).
 */
function runTask(fn) {
    fn();
    // In the real impl, this would flush the microtask queue
    // For now, React's synchronous mode means work is already done
}

/**
 * Get the rendered StubView tree as a JSON object.
 * Calls $$getRenderedOutput on the Swift side.
 */
function getRenderedOutput(surfaceId = 1) {
    return JSON.parse($$getRenderedOutput(surfaceId));
}

/**
 * Dispatch a native event to a node identified by type/index.
 */
function dispatchEvent(target, eventType, payload = {}) {
    $$dispatchEvent(target, eventType, payload);
}

module.exports = { createRoot, runTask, getRenderedOutput, dispatchEvent };
```

Create `tools/fantom/package.json`:

```json
{
  "name": "@react-dom-native/fantom",
  "version": "0.0.1",
  "private": true,
  "main": "src/index.js"
}
```

### 6. Custom Jest runner

Create `tools/fantom/src/runner/`:

- **`jest-runner.js`** — A custom Jest runner (extends `jest-runner`). For each test file:
  1. Call `bundle-test.js` to create an esbuild bundle
  2. Spawn the FantomTester binary with the bundle path
  3. Parse JSON results from stdout
  4. Convert to Jest `TestResult` format

  ```javascript
  const { execSync } = require('child_process');
  const { bundleTest } = require('./bundle-test');
  const path = require('path');

  class FantomRunner {
      constructor(globalConfig) {
          this._globalConfig = globalConfig;
      }

      async runTests(tests, watcher, onStart, onResult, onFailure) {
          for (const test of tests) {
              await onStart(test);
              try {
                  const result = await this.runTest(test);
                  await onResult(test, result);
              } catch (e) {
                  await onFailure(test, e);
              }
          }
      }

      async runTest(test) {
          // 1. Bundle the test file
          const bundlePath = await bundleTest(test.path);

          // 2. Run FantomTester
          const testerBinary = path.resolve(__dirname, '../../../../tools/fantom/ios/.build/release/FantomTester');
          const stdout = execSync(`${testerBinary} ${bundlePath}`, {
              encoding: 'utf-8',
              timeout: 30000
          });

          // 3. Parse results
          const results = JSON.parse(stdout);

          // 4. Convert to Jest TestResult format
          return {
              testFilePath: test.path,
              numPassingTests: results.passed,
              numFailingTests: results.failed,
              testResults: results.errors.map(err => ({
                  title: `${err.suite} > ${err.test}`,
                  status: 'failed',
                  failureMessages: [`${err.error}\n${err.stack}`]
              }))
          };
      }
  }

  module.exports = FantomRunner;
  ```

- **`bundle-test.js`** — Uses esbuild to bundle a single test file with the runtime setup prepended. Follow the pattern from `example/scripts/build.js`.

  ```javascript
  const esbuild = require('esbuild');
  const path = require('path');
  const os = require('os');

  async function bundleTest(testFilePath) {
      const outfile = path.join(
          os.tmpdir(),
          `fantom-${path.basename(testFilePath, '.js')}-${Date.now()}.js`
      );

      await esbuild.build({
          entryPoints: [testFilePath],
          bundle: true,
          format: 'iife',
          target: ['es2020'],
          platform: 'neutral',
          mainFields: ['module', 'main'],
          inject: [path.resolve(__dirname, '../runtime/setup.js')],
          define: {
              __DEV__: 'true',
              'process.env.NODE_ENV': '"test"',
          },
          outfile,
          sourcemap: 'inline',
      });

      return outfile;
  }

  module.exports = { bundleTest };
  ```

- **`ipc.js`** — Helpers for parsing JSON results from FantomTester stdout. Handle edge cases like partial output, non-JSON lines, timeout.

### 7. Build script

Create `scripts/build-fantom.sh`:

```bash
#!/bin/bash
set -euo pipefail

cd "$(dirname "$0")/../tools/fantom/ios"

echo "Building FantomTester for macOS..."
swift build -c release --product FantomTester

echo "FantomTester built at: .build/release/FantomTester"
```

Make it executable: `chmod +x scripts/build-fantom.sh`

### 8. Jest configuration

Convert `jest.config.js` to a multi-project configuration:

```javascript
module.exports = {
  projects: [
    // Unit tests (existing)
    {
      displayName: 'unit',
      testMatch: [
        '<rootDir>/packages/*/src/**/__tests__/**/*.test.js',
        '<rootDir>/scripts/__tests__/**/*.test.js',
      ],
      testPathIgnorePatterns: ['/node_modules/', '/server/'],
      transform: {},
    },
    // Fantom integration tests
    {
      displayName: 'fantom',
      runner: '<rootDir>/tools/fantom/src/runner/jest-runner.js',
      testMatch: [
        '<rootDir>/packages/*/src/**/*-itest.js',
        '<rootDir>/tests/integration/**/*-itest.js',
      ],
      testPathIgnorePatterns: ['/node_modules/', '/server/'],
    },
  ],
};
```

Update `package.json` scripts:

```json
{
  "scripts": {
    "test": "jest --selectProjects unit",
    "test:fantom": "jest --selectProjects fantom",
    "test:all": "jest",
    "build:fantom": "bash scripts/build-fantom.sh"
  }
}
```

### 9. Example integration tests

Create `tests/integration/` directory with these test files:

- **`basic-render-itest.js`** — Tests that a simple `<div>` with children renders to the correct StubView tree:
  ```javascript
  const React = require('react');
  const { createRoot, runTask, getRenderedOutput } = require('@react-dom-native/fantom');

  describe('Basic rendering', () => {
      it('renders a div with text', () => {
          const root = createRoot();
          runTask(() => {
              root.render(React.createElement('div', null,
                  React.createElement('p', null, 'Hello')
              ));
          });

          const output = getRenderedOutput();
          expect(output.children.length).toBe(1);
          expect(output.children[0].type).toBe('div');
          expect(output.children[0].children[0].type).toBe('p');
      });
  });
  ```

- **`update-itest.js`** — Tests that updating props triggers the correct mutations (update, not create+delete):
  ```javascript
  const React = require('react');
  const { createRoot, runTask, getRenderedOutput } = require('@react-dom-native/fantom');

  describe('Updates', () => {
      it('updates props without recreating views', () => {
          const root = createRoot();
          runTask(() => {
              root.render(React.createElement('div', { style: { backgroundColor: 'red' } }));
          });

          const before = getRenderedOutput();
          expect(before.children[0].props.style.backgroundColor).toBe('red');

          runTask(() => {
              root.render(React.createElement('div', { style: { backgroundColor: 'blue' } }));
          });

          const after = getRenderedOutput();
          expect(after.children[0].props.style.backgroundColor).toBe('blue');
      });
  });
  ```

- **`events-itest.js`** — Tests that dispatching an event calls the JS handler:
  ```javascript
  const React = require('react');
  const { createRoot, runTask, dispatchEvent } = require('@react-dom-native/fantom');

  describe('Events', () => {
      it('dispatches click events to handlers', () => {
          let clicked = false;
          const root = createRoot();
          runTask(() => {
              root.render(
                  React.createElement('button', {
                      onClick: () => { clicked = true; }
                  }, 'Tap me')
              );
          });

          // Simulate click on the button
          dispatchEvent('button', 'click');
          expect(clicked).toBe(true);
      });
  });
  ```

## Key Source Files (Reference)

| File | Purpose |
|------|---------|
| `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bridge/NativeBridge.swift` | Template for TesterBridge — all `$$` bridge functions |
| `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bridge/ShadowNodeWrapper.swift` | Moves to ShadowTree module |
| `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bridge/Differentiator.swift` | Splits: diff algo → ShadowTree, UIKit apply → UIKitMutationApplier |
| `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bridge/ViewRegistry.swift` | Template for StubViewRegistry |
| `example/scripts/build.js` | esbuild config pattern for test bundler |
| `packages/react-dom-native/src/renderer/renderer.js` | createRoot API consumed by test API |

## Output

- `packages/react-dom-native/ios/Sources/ShadowTree/ShadowNodeFamily.swift`
- `packages/react-dom-native/ios/Sources/ShadowTree/ShadowNodeWrapper.swift`
- `packages/react-dom-native/ios/Sources/ShadowTree/Mutation.swift`
- `packages/react-dom-native/ios/Sources/ShadowTree/Differentiator.swift`
- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bridge/UIKitMutationApplier.swift` (new, replaces mutation-apply code)
- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bridge/ShadowNodeWrapper.swift` (re-export only)
- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bridge/Differentiator.swift` (UIKitMutationApplier only)
- `tools/fantom/ios/Sources/FantomTester/main.swift`
- `tools/fantom/ios/Sources/FantomTester/TesterBridge.swift`
- `tools/fantom/ios/Sources/FantomTester/StubView.swift`
- `tools/fantom/ios/Sources/FantomTester/StubViewRegistry.swift`
- `tools/fantom/ios/Sources/FantomTester/StubMutationApplier.swift`
- `packages/react-dom-native/ios/Package.swift` (updated)
- `tools/fantom/package.json`
- `tools/fantom/src/index.js`
- `tools/fantom/src/runtime/setup.js`
- `tools/fantom/src/runner/jest-runner.js`
- `tools/fantom/src/runner/bundle-test.js`
- `tools/fantom/src/runner/ipc.js`
- `scripts/build-fantom.sh`
- `jest.config.js` (updated)
- `package.json` (updated scripts)
- `tests/integration/basic-render-itest.js`
- `tests/integration/update-itest.js`
- `tests/integration/events-itest.js`

## After Completion

Update `docs/MASTER_PLAN.md` — check off all Phase 5 integration testing items.
