---
name: impl-build-system
description: Implement the build system — bundler config, Xcode project, and build scripts. Depends on bridge.
---

# Implement: Build System

## Objective

Set up the build tooling: JS bundler configuration, Xcode project for the iOS app, and scripts that tie everything together.

## Prerequisites

- `packages/bridge/` must be implemented (need to know the native module structure)
- JS engine decision must be made (`docs/specs/adr/001-js-engine.md`)

## Instructions

1. **JS bundler setup**:
   - Configure bundler (esbuild, swc, or metro) to bundle `packages/` into a single JS file
   - Output: `ios/bundle.js` (the JS bundle loaded by the native app)
   - Must handle: CommonJS/ESM, React, our packages

2. **Xcode project**:
   - Create `ios/ReactDomNative.xcodeproj` (or use SPM Package.swift)
   - Add Swift source files from `ios/`
   - Link Yoga (as a dependency)
   - Link JavaScriptCore.framework (or Hermes)
   - Configure build phases to bundle JS before building

3. **Build scripts**:
   - `scripts/build-js.sh` — bundle JS
   - `scripts/build-ios.sh` — build iOS app (xcodebuild)
   - `scripts/dev.sh` — start Next.js server + build iOS in debug mode
   - Add to root `package.json` scripts

4. Write tests:
   - Test: JS bundle builds without errors
   - Test: bundle includes all required packages

## Output

- `ios/ReactDomNative.xcodeproj/` or `ios/Package.swift`
- `scripts/build-js.sh`
- `scripts/build-ios.sh`
- `scripts/dev.sh`
- Updated `package.json` scripts
- Bundler config file

## After Completion

Update `docs/MASTER_PLAN.md` — check off "Build system + Xcode project"
