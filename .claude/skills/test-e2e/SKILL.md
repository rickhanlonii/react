---
name: test-e2e
description: Run end-to-end test — start Next.js server, build iOS app, verify native rendering.
---

# End-to-End Test

## Instructions

1. **Start Next.js server**:
   ```bash
   cd /Users/rickhanlonii/oss/falcon/server && npm run dev &
   ```
   Wait for "Ready" message.

2. **Build JS bundle**:
   ```bash
   cd /Users/rickhanlonii/oss/falcon && npm run build:js
   ```

3. **Build iOS app** (simulator):
   ```bash
   cd /Users/rickhanlonii/oss/falcon && npm run build:ios -- -destination 'platform=iOS Simulator,name=iPhone 16'
   ```

4. **Verify**:
   - Check build succeeded
   - If the app can be launched in simulator, verify it connects to the Next.js server
   - Check for any crash logs

5. **Cleanup**:
   - Kill the Next.js dev server
   - Report build results

6. If anything fails, document the failure and suggest what needs to be fixed.
