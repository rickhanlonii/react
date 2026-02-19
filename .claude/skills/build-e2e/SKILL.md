---
name: build-e2e
description: Build and run the LayoutCompare e2e app on the Falcon E2E simulator.
---

# Build E2E

Builds and runs the LayoutCompare e2e app on the **Falcon E2E** simulator using XcodeBuildMCP.

## Setup

1. **Set MCP session defaults**:
   ```
   session_set_defaults:
     projectPath: tests/e2e/LayoutCompare/LayoutCompare/LayoutCompare.xcodeproj
     scheme: LayoutCompare
     simulatorName: Falcon E2E
     simulatorId: 50E9E48E-D7F7-4338-9873-3EB801137EE7
   ```

2. **Start e2e dev server** (if not already running):
   ```bash
   curl -s http://localhost:6100/bundle-version
   ```
   If that fails, start it:
   ```bash
   cd /Users/rickhanlonii/oss/falcon && npm run dev:e2e &
   ```
   Wait for the server to be ready before proceeding.

## Build Decision

- **Swift or Xcode project changed** → `build_run_sim` (full rebuild + launch)
- **JS-only changes** → `launch_app_sim` (app auto-reloads JS from dev server)
- **Not sure** → `build_run_sim` (safe default)

## Verification

1. Wait 3-5 seconds after launch for the app to start and auto-run fixtures
2. Poll for results:
   ```
   WebFetch http://localhost:6101/results
   ```
3. If `status` is `"running"`, wait 2s and poll again
4. When `status` is `"complete"`, report `passed` / `total` and any failing fixtures
