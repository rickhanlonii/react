---
name: impl-build-system
description: Implement the JS build system — bundler config and build scripts. Depends on bridge. Xcode project is handled by impl-xcode-project.
---

# Implement: Build System

## Objective

Set up the JS build tooling: bundler configuration and scripts that tie everything together. (Xcode project setup is handled separately by `/impl-xcode-project`.)

## Dependencies

This skill requires packages installed by `/install-dependencies`.
If not already run, run `/install-dependencies` first.

## Prerequisites

- `/install-dependencies` must be run
- `docs/research/bundler.md` must exist (bundler choice)
- `packages/react-dom-native/src/bridge/` must be implemented (need to know the native module structure)
- JS engine decision must be made (`docs/specs/adr/001-js-engine.md`)

## Instructions

1. **JS bundler setup**:
   - Configure bundler (from `/research-bundler` recommendation) to bundle `packages/react-dom-native/src/` and `example/entry/` into a single JS file
   - Output: `example/Falcon/bundle.js` (the JS bundle loaded by the native app)
   - Must handle: CommonJS/ESM, React, our packages

2. **Build scripts**:
   - `example/scripts/build.js` — bundle JS (esbuild)
   - `example/scripts/dev.sh` — start RSC server + watch mode for JS
   - Add to root `package.json` scripts

3. Write tests:
   - Test: JS bundle builds without errors
   - Test: bundle includes all required packages

**Note:** Xcode project and native build scripts are created by `/impl-xcode-project`.

## Output

- `example/scripts/build.js`
- `example/scripts/dev.sh`
- Updated `package.json` scripts
- Bundler config file (e.g., `esbuild.config.js` or similar)

## After Completion

Update `docs/MASTER_PLAN.md` — check off "JS build system"
