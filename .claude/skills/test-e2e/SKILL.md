---
name: test-e2e
description: Run end-to-end test — start RSC server, build iOS app, verify native rendering.
---

# End-to-End Test

## Prerequisites

- npm dependencies installed (`cd example && npm install`)
- Xcode project exists at `example/Falcon/`
- XcodeBuildMCP session defaults configured (scheme, simulator)

## Instructions

1. **Start RSC server** (if not already running):

   **Do NOT wrap commands** in custom bash — no `echo`, `2>&1`, `2>/dev/null`, `sleep`, `&`, `; echo "EXIT CODE: $?"`, piping through `python3 -c`, or similar. Run each command directly using the Bash tool.

   Check if the server is already running:
   ```bash
   curl -s http://localhost:6000/bundle-version
   ```
   If that fails, start it:
   ```
   Bash(command: "cd /Users/rickhanlonii/oss/falcon/example && npm run dev", run_in_background: true)
   ```
   Wait 5 seconds, then re-check the health endpoint to confirm it's up.

2. **Set XcodeBuildMCP session defaults** and **build the iOS app**:
   ```
   session_set_defaults:
     projectPath: example/Falcon/Falcon.xcodeproj
     scheme: Falcon
     simulatorName: Falcon Demo
     simulatorId: 61F83D8B-36DF-474F-9AAD-61DC6D60FFED
   ```
   Then use `build_run_sim` to build and launch the app.

3. **Verify**:
   - Check build succeeded
   - Use the `screenshot` tool to capture the simulator screen
   - Use the `snapshot_ui` tool to inspect the view hierarchy
   - Verify the app connects to the RSC server and renders content

4. **Cleanup**:
   - Use `stop_app_sim` to stop the app
   - Do NOT kill the dev server — other sessions may be using it
   - Report build results

5. If anything fails, document the failure and suggest what needs to be fixed.
