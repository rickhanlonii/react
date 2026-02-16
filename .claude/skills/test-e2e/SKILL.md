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

3. **Build and run iOS app** (simulator):
   Use the XcodeBuildMCP `build_run_sim` tool. If session defaults aren't set, first call `session_set_defaults` with the Falcon scheme and a simulator.

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
