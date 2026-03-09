# CLI Reference

## Debugging

Choose the right tool based on what you're investigating:

**UI structure** — use `npm run app:snapshot-ui` to get the full accessibility tree with element types, labels, frames (x, y, width, height), and unique IDs. Best for verifying view hierarchy, checking if elements exist, and understanding layout structure.

**Visual rendering** — use `npm run app:screenshot` to capture what the user actually sees. Best for checking visual appearance, colors, spacing, and comparing against expected rendering.

**Native runtime (Swift/UIKit)** — use the LLDB debugger (requires build server):
- `npm run app:debug-attach` — attach to the running app
- `npm run app:debug-lldb -- demo "<command>"` — run any LLDB command (e.g. `po UIApplication.shared`, `expression`, `breakpoint list`)
- `npm run app:debug-stack` — get backtrace (app must be stopped at a breakpoint)
- `npm run app:debug-variables` — inspect frame variables (app must be stopped)
- `npm run app:debug-detach` — detach when done

**Debug prerequisites:**
- The app must be running (launch with `npm run app:run` if needed)
- The app must **not** be launched from Xcode — Xcode's debugserver holds an exclusive lock on the process. If the app was launched from Xcode, terminate and relaunch: `npm run app:terminate && npm run app:run`
- Only one LLDB session at a time — detach before reattaching

**Debug workflow:**
1. `app:debug-attach` — attach LLDB to the app
2. `app:debug-lldb -- demo "breakpoint set -f <File>.swift -l <line>"` — set breakpoint
3. Trigger the code path (e.g. `app:tap -- demo "id:<elementId>"`)
4. `app:debug-lldb -- demo "po <expression>"` — inspect Swift variables
5. `app:debug-stack` — view backtrace
6. `app:debug-lldb -- demo "continue"` — resume execution
7. `app:debug-detach` — detach when done

**App logs** — use log capture (requires build server):
- `npm run app:log-start` — terminates and relaunches the app with stdout capture enabled
- `npm run app:log-read` — read captured logs without stopping
- `npm run app:log-stop` — stop capture and return all logs
- Captures Swift `print()` output (the app is relaunched with `--console` to stream stdout)

**JS runtime** — use app log capture: `npm run app:log-start` → `npm run app:log-read` → `npm run app:log-stop`. Captures `console.log` output via Swift stdout.

## UI Automation

Interact with the running app programmatically. All commands target the demo app by default; pass `e2e` as the second arg for LayoutCompare.

- `npm run app:tap -- demo "id:<elementId>"` — tap an element by its `id` prop (maps to `accessibilityIdentifier`)
- `npm run app:tap -- demo "<label>"` — tap an element by its accessibility label
- `npm run app:swipe -- demo <x1> <y1> <x2> <y2>` — swipe between points
- `npm run app:gesture -- demo <preset>` — preset gestures: `scroll-up`, `scroll-down`, `scroll-left`, `scroll-right`, `swipe-from-left-edge`, `swipe-from-right-edge`, `swipe-from-top-edge`, `swipe-from-bottom-edge`
- `npm run app:type-text -- demo "<text>"` — type text into focused field
- `npm run app:long-press -- demo <x> <y> <duration_ms>` — long press
- `npm run app:button -- demo <type>` — hardware buttons: `home`, `lock`, `side-button`, `siri`, `apple-pay`
- `npm run app:key-press -- demo <keyCode>` — press a key by HID keycode

### Making elements tappable by ID

Add an `id` prop to the element in JSX. The `id` prop maps to `accessibilityIdentifier` on UIKit views and marks them as accessibility elements, making them discoverable by `app:tap`.

```jsx
<button id="my-button" onClick={handleClick}>Click me</button>
```

```bash
npm run app:tap -- demo "id:my-button"
```

Typical workflow: `snapshot-ui` to find element IDs → `tap` by ID to interact → `screenshot` to verify result.

## Filtering Output

All `npm run app:*` commands support `--filter <query>` to filter response lines (case-insensitive). Always use `--filter` instead of piping to `grep`.

```bash
npm run app:snapshot-ui -- --filter AXLabel       # only lines containing "AXLabel"
npm run app:snapshot-ui -- --filter BackButton     # find a specific element
npm run app:list -- --filter Booted                # only booted simulators
```

## Performance Tracing

Use the `falcon-devtools` MCP tools to capture performance traces with custom tracks:

- `performance_start_trace` — start recording (set `autoStop: false`, `reload: false` for interaction traces)
- `performance_stop_trace` — stop and get results (optionally save to `filePath`)
- Trace file is also always dumped to `/tmp/falcon-trace.json`

Custom tracks captured: Shadow Tree, Layout, Interactions (under "Native ⚛" track group).

**If a trace has zero `blink.user_timing` events** (only screenshots/metadata), the app likely crashed during recording. Take a screenshot or snapshot-ui to verify the app is alive, rebuild if needed.

**Validate the trace pipeline:** `npm run test:trace`

## Running Tests Manually

- `npm test` — JS unit tests
- `npm run test:swift` — Swift unit tests (uses `xcodebuild test`, not `swift test`)
- `npm run test:fantom` — Fantom integration tests (JS ↔ Swift)
- `npm run test:e2e-swift` — E2E Swift tests (real servers → React → UIKit)
