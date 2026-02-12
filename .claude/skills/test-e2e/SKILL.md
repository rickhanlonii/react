---
name: test-e2e
description: Run end-to-end test — start RSC server, build iOS app, verify native rendering.
---

# End-to-End Test

## Dependencies

This skill requires packages installed by `/install-dependencies`.
If not already run, run `/install-dependencies` first.

## Prerequisites

- `/install-dependencies` must be run
- `/impl-xcode-project` must be run (example/Falcon/ must have Xcode project and Swift sources)
- All impl skills must be complete

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

3. **Build iOS app** (simulator):
   ```bash
   cd /Users/rickhanlonii/oss/falcon/example/Falcon && xcodebuild -scheme Falcon -destination 'platform=iOS Simulator,name=iPhone 16'
   ```

4. **Verify**:
   - Check build succeeded
   - If the app can be launched in simulator, verify it connects to the RSC server
   - Check for any crash logs

5. **Cleanup**:
   - Kill the RSC dev server
   - Report build results

6. If anything fails, document the failure and suggest what needs to be fixed.
