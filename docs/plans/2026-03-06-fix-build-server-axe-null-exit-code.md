# Fix: Build server returns null exit code for axe operations

## Problem

When running UI automation commands via the build server (e.g. `npm run app:tap -- demo "id:stress-inc-0"` or `npm run app:snapshot-ui`), the build server returns `null` for the exit code in its JSON response. This causes `build-op.sh` to fail at line 199 (`exit "$EXIT_CODE"`) with `exit: None: numeric argument required`.

**Direct axe invocation works fine** — the tap succeeds and returns exit 0. The issue is specific to the build server's `exec()` wrapper.

### Issues hit during the session

1. **`npm run app:tap -- demo "id:stress-inc-0"` returned exit code `None`** — the tap didn't go through via the build server path, even though axe supports `--id` and works when called directly.

2. **`npm run app:snapshot-ui` returned no output** — same null exit code issue. The build server delegated to axe `describe-ui` but the response had `code: null`, causing the script to error before printing stdout.

3. **Coordinate-based tap hit the wrong target** — I used pixel coordinates from a screenshot, but screenshot coordinates don't account for retina scaling (2x/3x). Tapping by ID is more reliable.

4. **`evaluate_script` can't do DOM lookups** — `document.getElementById` doesn't exist in the JSC runtime since this is a native app with a custom renderer, not a browser DOM.

## Root cause

In `scripts/build-server.js`, the `exec()` function (line 175-191):

```js
proc.on('close', (code) => resolve({ code, stdout, stderr }));
```

Node.js `ChildProcess` emits `close` with `code = null` when the process is terminated by a signal rather than exiting normally. The axe binary may be exiting via signal on macOS when spawned from the Node.js server process, or there's a race condition in how the process terminates.

The JSON response `{ "code": null, ... }` is then parsed by Python in `build-op.sh`:
```bash
EXIT_CODE=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('code', 1))")
```

Python prints JSON `null` as `None`, and `exit "None"` fails.

## Fix

### 1. Fix `exec()` in build-server.js to handle null exit codes

**File**: `scripts/build-server.js`, line 188

```js
// Before:
proc.on('close', (code) => resolve({ code, stdout, stderr }));

// After:
proc.on('close', (code) => resolve({ code: code ?? 1, stdout, stderr }));
```

This ensures we never return `null` — if the process was killed by signal, treat it as failure (code 1).

### 2. Fix `build-op.sh` to handle non-numeric exit codes defensively

**File**: `scripts/build-op.sh`, line 184

```bash
# Before:
EXIT_CODE=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('code', 1))" 2>/dev/null || echo 1)

# After:
EXIT_CODE=$(echo "$RESPONSE" | python3 -c "
import sys, json
code = json.load(sys.stdin).get('code', 1)
print(0 if code is None else int(code))
" 2>/dev/null || echo 1)
```

This ensures even if the build server returns `null`, the shell script gets a numeric exit code.

## Testing

After applying fixes:
1. `npm run app:tap -- demo "id:stress-inc-0"` — should tap Item 0's + button and exit 0
2. `npm run app:snapshot-ui` — should print the full accessibility tree and exit 0
3. `npm run app:screenshot` — should still work (regression check)
