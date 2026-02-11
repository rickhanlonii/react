---
name: impl-devtools
description: Implement developer tools — hot reload, error display, and debugging. Depends on build-system.
---

# Implement: Developer Tools

## Objective

Build developer experience tools: hot reload during development, error overlay display on the native app, and debugging support.

## Dependencies

This skill requires packages installed by `/install-dependencies`.
If not already run, run `/install-dependencies` first.

## Prerequisites

- `/install-dependencies` must be run
- `packages/cli/` build system must exist
- Build scripts must work

## Instructions

1. **Hot reload**:
   - Watch JS source files for changes
   - Re-bundle on change
   - Signal the native app to reload the JS bundle (via WebSocket or native notification)
   - Preserve React state where possible (Fast Refresh integration)

2. **Error overlay**:
   - Catch JS errors and display them on a native overlay view
   - Show: error message, stack trace, source file + line
   - Red box pattern (similar to React Native)
   - Dismiss on tap

3. **Debugging**:
   - Enable Safari Web Inspector for JSC (or Chrome DevTools for Hermes)
   - Console.log forwarding to Xcode console
   - React DevTools integration (if feasible)

4. **CLI tool**:
   - `packages/cli/` — wraps build scripts with a nice interface
   - `npx react-dom-native dev` — starts dev server + hot reload
   - `npx react-dom-native build` — production build

## Output

- `packages/cli/package.json`
- `packages/cli/src/dev.js`
- `packages/cli/src/build.js`
- `packages/cli/bin/cli.js`
- `ios/DevTools/ErrorOverlay.swift`
- `ios/DevTools/HotReload.swift`

## After Completion

Update `docs/MASTER_PLAN.md` — check off "Developer tools"
