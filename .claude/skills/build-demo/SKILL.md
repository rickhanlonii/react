---
name: build-demo
description: Build and run the Falcon demo app on the Falcon Demo simulator.
---

# Build Demo

Builds and runs the Falcon example app on the **Falcon Demo** simulator using the build server.

## Prerequisites

The **build server** must be running in a separate terminal (it runs outside Claude's sandbox so `xcodebuild` can use `sandbox-exec`):
```
npm run build-server
```

Check if it's running:
```bash
curl -s http://localhost:6002/healthz
```

## Setup

1. **Set MCP session defaults** (still needed for UI tools like `snapshot_ui`, `tap`, etc.):
   ```
   session_set_defaults:
     projectPath: example/Falcon/Falcon.xcodeproj
     scheme: Falcon
     simulatorName: Falcon Demo
     simulatorId: 61F83D8B-36DF-474F-9AAD-61DC6D60FFED
     bundleId: com.react.Falcon
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

## Build & Run

Use the build server's `run` operation (builds, installs, and launches in one step):
```bash
curl -s -X POST http://localhost:6002/run -H 'Content-Type: application/json' -d '{"operation":"run"}'
```
This runs `xcodebuild build` → `simctl install` → `simctl launch` sequentially.

For **JS-only changes**, the app auto-reloads from the dev server — no rebuild needed.

For a **clean build**:
```bash
curl -s -X POST http://localhost:6002/run -H 'Content-Type: application/json' -d '{"operation":"clean"}'
```
Then run the `run` operation again.

## Verification

1. Wait 3-5 seconds after launch for the app to connect and render
2. Take a screenshot:
   ```bash
   curl -s -X POST http://localhost:6002/run -H 'Content-Type: application/json' -d '{"operation":"sim-screenshot"}'
   ```
   Then view it: `Read /tmp/falcon-screenshot.png`
3. Or use `snapshot_ui` (XcodeBuildMCP) to inspect the view hierarchy
4. If the screen is blank or shows an error, check that the dev server is running and the app can reach `localhost:6000`

## Available Build Server Operations

| Operation | What it does |
|-----------|-------------|
| `run` | Build + install + launch (all-in-one) |
| `clean` | Clean build products |
| `test` | Run xcodebuild tests |
| `resolve-packages` | Resolve SPM dependencies |
| `sim-terminate` | Stop the running app |
| `sim-screenshot` | Screenshot → `/tmp/falcon-screenshot.png` |
| `sim-list` | List simulators |
| `sim-open` | Open Simulator.app |
| `log-start` | Start streaming app logs |
| `log-stop` | Stop log capture, return logs |
| `log-read` | Read current logs without stopping |

## Important

- **Do NOT use** `build_run_sim`, `build_sim`, `launch_app_sim`, or `install_app_sim` MCP tools — they fail due to sandbox restrictions on `sandbox-exec`
- **DO use** XcodeBuildMCP UI tools directly: `snapshot_ui`, `tap`, `type_text`, `swipe`, `gesture` — these work fine
- **For screenshots**, prefer the build server (`sim-screenshot`) over the MCP `screenshot` tool, which may crash
- **For logs**, use the build server (`log-start`/`log-stop`/`log-read`) instead of `start_sim_log_cap`/`stop_sim_log_cap`
