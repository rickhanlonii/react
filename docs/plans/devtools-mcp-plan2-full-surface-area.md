# Plan 2: Implement Full Tool Surface Area

## Context

After Plan 1 completes (fork + connection + tracing), this plan addresses all remaining tools from chrome-devtools-mcp. Every tool stays registered. Tools the inspector proxy supports get real implementations; tools it doesn't support return a clear "not implemented" message.

## Prerequisite

Plan 1 is complete — the MCP connects to the inspector proxy and performance tracing works.

---

## Tool Support Matrix

| Tool | Proxy Support | Implementation |
|------|--------------|----------------|
| **Performance (3)** | | |
| `performance_start_trace` | WORKS | Done in Plan 1 |
| `performance_stop_trace` | WORKS | Done in Plan 1 |
| `performance_analyze_insight` | WORKS | Done in Plan 1 |
| **Script (2)** | | |
| `evaluate_script` | WORKS | CDP `Runtime.evaluate` / `Runtime.callFunctionOn` (Plan 2B) |
| `wait_for` | PARTIAL | Polls `DOM.getDocument` tree for text (Plan 2C) — no real DOM in native app |
| **Snapshot (1)** | | |
| `take_snapshot` | PARTIAL | CDP `DOM.getDocument` forwarded to app; adapt a11y tree from shadow tree |
| **Screenshot (1)** | | |
| `take_screenshot` | WORKS | `Page.startScreencast`/`stopScreencast` single-frame capture (Plan 2B) |
| **Navigation (7)** | | |
| `list_pages` | WORKS | HTTP `GET /json/list` |
| `select_page` | WORKS | Switch CDP target WebSocket |
| `navigate_page` | PARTIAL | `Page.reload` works; back/forward → stub |
| `close_page` | NOT SUPPORTED | Stub |
| `new_page` | NOT SUPPORTED | Stub |
| `resize_page` | NOT SUPPORTED | Stub |
| `get_tab_id` | NOT SUPPORTED | Stub (experimental interop tool) |
| **Console (2)** | | |
| `list_console_messages` | PARTIAL | Collect `Runtime.consoleAPICalled` events from CDP |
| `get_console_message` | PARTIAL | Return from collected messages |
| **Network (2)** | | |
| `list_network_requests` | NOT SUPPORTED | Stub |
| `get_network_request` | NOT SUPPORTED | Stub |
| **Input (9)** | | |
| `click` | PARTIAL | CDP `Input.dispatchMouseEvent` (mousePressed only) |
| `click_at` | PARTIAL | Same |
| `hover` | NOT SUPPORTED | Stub |
| `fill` | NOT SUPPORTED | Stub |
| `type_text` | NOT SUPPORTED | Stub |
| `drag` | NOT SUPPORTED | Stub |
| `fill_form` | NOT SUPPORTED | Stub |
| `upload_file` | NOT SUPPORTED | Stub |
| `press_key` | NOT SUPPORTED | Stub |
| **Emulation (1)** | | |
| `emulate` | NOT SUPPORTED | Stub |
| **Memory (1)** | | |
| `take_memory_snapshot` | NOT SUPPORTED | Stub |
| **Lighthouse (1)** | | |
| `lighthouse_audit` | NOT SUPPORTED | Stub |
| **Screencast (2)** | | |
| `screencast_start` | NOT SUPPORTED | Stub |
| `screencast_stop` | NOT SUPPORTED | Stub |
| **Extensions (5)** | | |
| All 5 extension tools | N/A | Stub |
| **Dialog (1)** | | |
| `handle_dialog` | NOT SUPPORTED | Stub |

**Summary: 38 tools total — 10 WORKS, 8 PARTIAL, 20 NOT SUPPORTED/N/A**

**Sub-plan mapping**: Plan 2A (stubs) → Plan 2B (WORKS tools) → Plan 2C (PARTIAL tools) → Plan 2D (cleanup + verification)

---

## Implementation via Sub-Plans

This plan is broken into 4 sub-plans, each self-contained with detailed implementation steps, testing, and acceptance criteria:

### Plan 2A: Stub All Unsupported Tools
- Creates `notImplemented()` helper
- Edits all 9 tool files (kept on disk from Plan 1D) to replace Puppeteer handlers with stubs
- Updates `tools.ts` to import the 9 stubbed tool modules
- **20 stub tools** implemented

### Plan 2B: Implement WORKS Tools
- `evaluate_script` — CDP `Runtime.evaluate` / `Runtime.callFunctionOn` (args require Plan 2C snapshot UIDs)
- `take_screenshot` — `Page.startScreencast`/`stopScreencast` single-frame capture (JPEG)
- `list_pages` — HTTP `GET /json/list` on proxy URL
- `select_page` — switch CDP target WebSocket
- Updates `tools.ts` to import `script.ts` and `screenshot.ts`
- **4 WORKS tools** implemented (+ 3 performance tools from Plan 1)

### Plan 2C: Implement PARTIAL Tools
- `wait_for` — polls `DOM.getDocument` tree, searches text nodes (no real DOM in native app)
- `navigate_page` — `Page.reload` works; back/forward/url return "not supported"
- `take_snapshot` — `DOM.getDocument` tree → formatted text output with UIDs
- `list_console_messages` / `get_console_message` — `Runtime.consoleAPICalled` event collection
- `click` / `click_at` — `DOM.getBoxModel` + `Input.dispatchMouseEvent`
- Updates `tools.ts` to import `snapshot.ts` and `console.ts`
- **8 PARTIAL tools** implemented

### Plan 2D: Response Cleanup & Verification
- Extends `McpResponse.ts` with image/snapshot/console output (NOT a rewrite — Plan 1B/1D already stripped Puppeteer)
- Verifies `McpPage.ts` and `ToolDefinition.ts` interfaces are complete (NOT a rewrite — Plan 1B already did this)
- Verifies Plan 1A file deletions are complete
- Verifies all 38 tools are imported in `tools.ts`
- Produces 38-tool verification matrix

## Key Design Decisions (finalized in sub-plans)

| Decision | Resolution | Sub-plan |
|----------|-----------|----------|
| Tool files from Plan 1 | Kept on disk, NOT imported — Plan 2 edits in place | 1D, 2A-2C |
| `tools.ts` imports | Progressively added: 2A adds 9, 2B adds 2, 2C adds 2 | 2A, 2B, 2C |
| `wait_for` approach | `DOM.getDocument` tree search (not `Runtime.evaluate`) | 2C |
| `take_screenshot` approach | `Page.startScreencast`/`stopScreencast` single-frame capture | 2B |
| `evaluate_script` with args | Works, but UIDs require prior `take_snapshot` (Plan 2C) | 2B |
| Interface boundaries | `ToolDefinition.ts` finalized in Plan 1B; Plan 2D only extends `McpResponse.ts` | 1B, 2D |

---

## Key Files Reference

| Tool file | Tools | Sub-plan | Action |
|-----------|-------|----------|--------|
| `src/tools/performance.ts` | start/stop/analyze trace | Plan 1C | Done in Plan 1 |
| `src/tools/script.ts` | evaluate_script | Plan 2B | Rewrite: CDP `Runtime.evaluate` |
| `src/tools/snapshot.ts` | take_snapshot, wait_for | Plan 2C | Rewrite: CDP `DOM.getDocument` tree |
| `src/tools/screenshot.ts` | take_screenshot | Plan 2B | Rewrite: screencast single-frame capture |
| `src/tools/pages.ts` | list/select/navigate/close/new/resize, handle_dialog, get_tab_id | Plan 2A+2B+2C | Partial rewrite + stubs |
| `src/tools/console.ts` | list/get console messages | Plan 2C | Rewrite: CDP event collection |
| `src/tools/input.ts` | click, click_at, hover, fill, etc. | Plan 2A+2C | Partial rewrite + stubs |
| `src/tools/network.ts` | list/get network requests | Plan 2A | Stub both |
| `src/tools/emulation.ts` | emulate | Plan 2A | Stub |
| `src/tools/memory.ts` | take_memory_snapshot | Plan 2A | Stub |
| `src/tools/lighthouse.ts` | lighthouse_audit | Plan 2A | Stub |
| `src/tools/screencast.ts` | screencast_start/stop | Plan 2A | Stub |
| `src/tools/extensions.ts` | all 5 extension tools | Plan 2A | Stub |
| `src/tools/tools.ts` | (aggregator) | Plan 2A+2B+2C | Progressive imports |

Note: `wait_for` and `take_snapshot` share `snapshot.ts`. `handle_dialog` and `get_tab_id` are in `pages.ts`. There are no separate `wait.ts`, `dialog.ts`, or `evaluate.ts` files — the actual filenames are `script.ts` and `emulation.ts`.
