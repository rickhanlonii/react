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

1. **Start RSC server**:
   ```bash
   cd /Users/rickhanlonii/oss/falcon/example/server && node server.js &
   ```
   Wait for "Ready" message.

2. **Build JS bundle**:
   ```bash
   cd /Users/rickhanlonii/oss/falcon && npm run build
   ```

3. **Set XcodeBuildMCP session defaults** and **build the iOS app**:
   ```
   session_set_defaults:
     projectPath: example/Falcon/Falcon.xcodeproj
     scheme: Falcon
     simulatorName: Falcon Demo
     simulatorId: 61F83D8B-36DF-474F-9AAD-61DC6D60FFED
   ```
   Then use `build_run_sim` to build and launch the app.

4. **Verify**:
   - Check build succeeded
   - Use the `screenshot` tool to capture the simulator screen
   - Use the `snapshot_ui` tool to inspect the view hierarchy
   - Verify the app connects to the RSC server and renders content

5. **Cleanup**:
   - Kill the RSC dev server
   - Use `stop_app_sim` to stop the app
   - Report build results

6. If anything fails, document the failure and suggest what needs to be fixed.
