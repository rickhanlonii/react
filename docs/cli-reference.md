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

**App logs** — use log capture (requires build server):
- `npm run app:log-start` — start capturing logs
- `npm run app:log-read` — read captured logs without stopping
- `npm run app:log-stop` — stop and return all logs
- Logs are filtered to the app's bundle ID (`com.react.Falcon`) and process name

**JS runtime** — use the `/devtools` skill to connect Chrome DevTools to the app's JSC runtime for console logs, JS profiling, and runtime inspection.

## UI Automation

Interact with the running app programmatically. All commands target the demo app by default; pass `e2e` as the second arg for LayoutCompare.

- `npm run app:tap -- <x> <y>` — tap at coordinates
- `npm run app:swipe -- <x1> <y1> <x2> <y2>` — swipe between points
- `npm run app:gesture -- <preset>` — preset gestures: `scroll-up`, `scroll-down`, `scroll-left`, `scroll-right`, `swipe-from-left-edge`, `swipe-from-right-edge`, `swipe-from-top-edge`, `swipe-from-bottom-edge`
- `npm run app:type-text -- "<text>"` — type text into focused field
- `npm run app:long-press -- <x> <y> <duration_ms>` — long press
- `npm run app:button -- <type>` — hardware buttons: `home`, `lock`, `side-button`, `siri`, `apple-pay`
- `npm run app:key-press -- <keyCode>` — press a key by HID keycode

Typical workflow: `snapshot-ui` to find coordinates → `tap`/`swipe`/`type-text` to interact → `screenshot` to verify result.

## Filtering Output

All `npm run app:*` commands support `--filter <query>` to filter response lines (case-insensitive). Always use `--filter` instead of piping to `grep`.

```bash
npm run app:snapshot-ui -- --filter AXLabel       # only lines containing "AXLabel"
npm run app:snapshot-ui -- --filter BackButton     # find a specific element
npm run app:list -- --filter Booted                # only booted simulators
```

## Running Tests Manually

- `npm test` — JS unit tests
- `npm run test:swift` — Swift unit tests (uses `xcodebuild test`, not `swift test`)
- `npm run test:fantom` — Fantom integration tests (JS ↔ Swift)
- `npm run test:e2e-swift` — E2E Swift tests (real servers → React → UIKit)
