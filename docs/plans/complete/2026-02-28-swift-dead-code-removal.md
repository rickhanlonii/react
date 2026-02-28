# Swift Dead Code Removal & Easy Fixes

Remove dead code and fix low-risk issues in the react-dom-native Swift package.

## Dead Code to Remove

### 1. `ShadowTreeBuilder.nextFamilyId`
- **File:** `packages/react-dom-native/ios/Sources/ShadowTree/ShadowTreeBuilder.swift:43`
- **What:** `private var nextFamilyId: Int = 0` — declared but never read or incremented.
- **Action:** Delete the line.

### 2. `BoundaryManager` dead surface area
- **File:** `packages/react-dom-native/ios/Sources/ShadowTree/BoundaryManager.swift`
- **What:** The class was designed with a broader API than `SSRCoordinator` actually uses. The following are never called:
  - `treeBuilder` property (line 56) + `init(treeBuilder:)` parameter (line 67) — routing is handled by `SSRCoordinator.activeBuilder` instead
  - `PendingBoundary.parentNode` (line 31) — declared but never set or read
  - `PendingBoundary.insertionIndex` (line 34) — set to 0, never updated, never read
  - `appendNode(_:)` (line 162) — never called
  - `isInsideBoundary` (line 74) — never called
  - `currentBoundaryId` (line 79) — never called
  - `hasBoundary(id:)` (line 174) — never called
  - `pendingBoundaryIds` (line 179) — never called
  - `onBoundaryRevealed` callback (line 63) — never wired up (SSRCoordinator has its own)
- **Action:** Remove all listed items. Simplify `init()` to take no parameters.

### 3. `Bindings.cleanupSSRTree(surfaceId:)`
- **File:** `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift:250`
- **What:** Defined but never called. Duplicate of `clearSSRTree(surfaceId:)` which IS used via `$$clearSSRTree`.
- **Action:** Delete the method.

### 4. `LogBoxStore.dismiss(_:)`
- **File:** `packages/react-dom-native/ios/Sources/ReactDomNativeKit/DevTools/LogBox/LogBoxStore.swift:84`
- **What:** Declared but never called. UI only uses `clearAll()`.
- **Action:** Delete the method.

### 5. `ShadowTreeBuilder: InstructionStreamDelegate` extension
- **File:** `packages/react-dom-native/ios/Sources/ShadowTree/ShadowTreeBuilder.swift:441-492`
- **What:** Full protocol conformance extension (~50 lines), but `ShadowTreeBuilder` is never used as an `InstructionStreamDelegate`. `SSRCoordinator` is the actual delegate. All boundary methods are empty stubs.
- **Action:** Delete the entire extension.

### 6. Verbose `[Diff]` print statements
- **File:** `packages/react-dom-native/ios/Sources/ShadowTree/Differentiator.swift:87,94,108,136`
- **What:** Four `print("[Diff] ...")` statements fire on every diff operation. Extremely verbose, not gated.
- **Action:** Delete all four print statements.

## Verification

After all removals:
1. `npm run test:swift` — Swift unit tests pass
2. `npm run test:fantom` — Integration tests pass (confirms JS↔Swift bridge still works)
3. Build the Falcon Demo app to confirm no compile errors
