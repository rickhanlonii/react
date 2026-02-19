---
name: build-demo
description: Build and run the Falcon demo app on the Falcon Demo simulator.
---

# Build Demo

Builds and runs the Falcon example app on the **Falcon Demo** simulator using XcodeBuildMCP.

## Setup

1. **Set MCP session defaults**:
   ```
   session_set_defaults:
     projectPath: example/Falcon/Falcon.xcodeproj
     scheme: Falcon
     simulatorName: Falcon Demo
     simulatorId: 61F83D8B-36DF-474F-9AAD-61DC6D60FFED
   ```

2. **Start dev server** (if not already running):

   **Do NOT wrap commands** in custom bash — no `echo`, `2>&1`, `2>/dev/null`, `sleep`, `&`, `; echo "EXIT CODE: $?"`, piping through `python3 -c`, or similar. Run each command directly using the Bash tool.

   Check if the servers are already running before starting:
   ```bash
   curl -s http://localhost:6000/bundle-version
   ```
   ```bash
   curl -s http://localhost:6001/healthz
   ```
   If **either** fails, start the dev server (it runs both Flight on 6000 and SSR on 6001):
   ```
   Bash(command: "cd /Users/rickhanlonii/oss/falcon/example && npm run dev", run_in_background: true)
   ```
   Wait 5 seconds, then re-check both health endpoints to confirm they're up.

## Build Decision

- **Swift or Xcode project changed** → `build_run_sim` (full rebuild + launch)
- **JS-only changes** → `launch_app_sim` (app auto-reloads JS from dev server)
- **Not sure** → `build_run_sim` (safe default)

## Verification

1. Wait 3-5 seconds after launch for the app to connect and render
2. `screenshot` — verify the app rendered content from the RSC server
3. If the screen is blank or shows an error, check that the dev server is running and the app can reach `localhost:6000`
