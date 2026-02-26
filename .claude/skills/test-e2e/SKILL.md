---
name: test-e2e
description: Run end-to-end test — start RSC server, build iOS app, verify native rendering. For Swift E2E tests (EndToEndSSRTests + EndToEndCSRTests), use `npm run test:e2e-swift` instead.
---

# End-to-End Test

## Prerequisites

- npm dependencies installed (`cd example && npm install`)
- Xcode project exists at `example/Falcon/`
- **Build server running** in a separate terminal: `npm run build-server`

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

2. **Set XcodeBuildMCP session defaults** (for UI inspection tools):
   ```
   session_set_defaults:
     projectPath: example/Falcon/Falcon.xcodeproj
     scheme: Falcon
     simulatorName: Falcon Demo
     simulatorId: 61F83D8B-36DF-474F-9AAD-61DC6D60FFED
     bundleId: com.react.Falcon
   ```

3. **Build and launch** via the build server:
   ```bash
   curl -s -X POST http://localhost:6002/run -H 'Content-Type: application/json' -d '{"operation":"run"}'
   ```

4. **Verify**:
   - Check the response has `"code": 0` and `"step": "complete"`
   - Take a screenshot:
     ```bash
     curl -s -X POST http://localhost:6002/run -H 'Content-Type: application/json' -d '{"operation":"sim-screenshot"}'
     ```
     Then view: `Read /tmp/falcon-screenshot.png`
   - Use `snapshot_ui` (XcodeBuildMCP) to inspect the view hierarchy
   - Verify the app connects to the RSC server and renders content

5. **Cleanup**:
   - Terminate the app:
     ```bash
     curl -s -X POST http://localhost:6002/run -H 'Content-Type: application/json' -d '{"operation":"sim-terminate"}'
     ```
   - Do NOT kill the dev server — other sessions may be using it
   - Report build results

6. If anything fails, document the failure and suggest what needs to be fixed.
