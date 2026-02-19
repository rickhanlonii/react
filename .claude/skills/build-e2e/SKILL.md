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

   **Do NOT wrap commands** in custom bash — no `echo`, `2>&1`, `2>/dev/null`, `sleep`, `&`, `; echo "EXIT CODE: $?"`, piping through `python3 -c`, or similar. Run each command directly using the Bash tool.

   Check if the server is already running:
   ```bash
   curl -s http://localhost:6100/bundle-version
   ```
   If that fails, start it:
   ```
   Bash(command: "cd /Users/rickhanlonii/oss/falcon && npm run dev:e2e", run_in_background: true)
   ```
   Wait 5 seconds, then re-check the health endpoint to confirm it's up.

## Build Decision

- **Swift or Xcode project changed** → `build_run_sim` (full rebuild + launch)
- **JS-only changes** → `launch_app_sim` (app auto-reloads JS from dev server)
- **Not sure** → `build_run_sim` (safe default)

## Verification

1. Wait 3-5 seconds after launch for the app to start and auto-run fixtures
2. Trigger test run:
   ```bash
   curl -X POST http://localhost:6101/run-all
   ```
3. Wait 5 seconds, then poll for results:
   ```bash
   curl -s http://localhost:6101/results
   ```
4. If `status` is `"running"`, wait 2s and poll again
5. When `status` is `"complete"`, report `passed` / `total` and any failing fixtures

**Note:** Do NOT use `WebFetch` for localhost URLs — it doesn't work. Use `curl` via the Bash tool instead.
