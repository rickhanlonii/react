---
name: test
description: Smart test runner — auto-detects which test suites to run based on what changed
arguments: $ARGUMENTS
user_invocable: true
---

## Smart Test Runner

Determines which test suites to run based on changed files, then runs them.

### Arguments

- No arguments: auto-detect from `git diff` what changed and run the appropriate suites
- `all`: run all test suites
- `js`: run JS unit tests only (`npm test`)
- `swift`: run Swift unit tests only (`npm run test:swift`)
- `fantom`: run Fantom integration tests only (`npm run test:fantom`)
- `e2e`: run E2E Swift tests only (`npm run test:e2e-swift`)
- A package name (e.g., `renderer`, `components`, `yoga-layout`, `bridge`, `flight-client`): run JS unit tests filtered to that package — `npm test -- --testPathPattern="packages/react-dom-native/src/<package>"`

### Auto-Detection Rules

If no arguments provided, check `git diff --name-only HEAD` (or `git diff --name-only` for unstaged) to determine what changed:

1. **Swift files changed** (`*.swift`): run `npm run test:swift`
2. **JS files in packages/ changed** (`packages/**/*.js`): run `npm test`
3. **Both Swift and JS changed**: run both `npm test` and `npm run test:swift`
4. **Fantom test files changed** (`packages/react-dom-native/integration-tests/**`): also run `npm run test:fantom`
5. **Bridge files changed** (`src/bridge/` or `ios/Sources/*/Bindings/`): run `npm test`, `npm run test:swift`, AND `npm run test:fantom`
6. **E2E fixtures changed** (`fixtures/layout/**`): run `npm run test:e2e-swift`
7. **No changes detected**: run `npm test` (JS unit tests as default)

### Execution

Run detected suites sequentially, stopping on first failure. Report results clearly.

### Test Suite Reference

| Suite | Command | What it tests | Time |
|-------|---------|---------------|------|
| JS unit | `npm test` | renderer, components, yoga-layout, bridge, flight-client | ~5s |
| Swift unit | `npm run test:swift` | ElementDefaults, YogaStyleApplier, UIKitHelpers | ~30s |
| Fantom | `npm run test:fantom` | JS ↔ Swift end-to-end via headless runner | ~45s |
| E2E Swift | `npm run test:e2e-swift` | Full pipeline: real HTTP servers → React → UIKit | ~60s |

### Important Notes

- **ALWAYS use the npm commands** listed above. NEVER use `xcodebuild`, `swift test`, `xcrun`, or XcodeBuildMCP test tools (`test_sim`, `test_device`) directly. The npm scripts handle all necessary configuration (simulator selection, scheme, server startup, etc.).
- **E2E Swift tests**: Starts Flight + SSR servers on ports 7100/7101 automatically.
