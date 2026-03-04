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
| `evaluate_script` | WORKS | CDP `Runtime.evaluate` / `Runtime.callFunctionOn` |
| `wait_for` | WORKS | CDP `Runtime.evaluate` polling |
| **Snapshot (1)** | | |
| `take_snapshot` | PARTIAL | CDP `DOM.getDocument` forwarded to app; adapt a11y tree from shadow tree |
| **Screenshot (1)** | | |
| `take_screenshot` | WORKS | CDP screenshot via proxy's `capture-screenshot` mechanism |
| **Navigation (6)** | | |
| `list_pages` | WORKS | HTTP `GET /json/list` |
| `select_page` | WORKS | Switch CDP target WebSocket |
| `navigate_page` | PARTIAL | `Page.reload` works; back/forward → stub |
| `close_page` | NOT SUPPORTED | Stub |
| `new_page` | NOT SUPPORTED | Stub |
| `resize_page` | NOT SUPPORTED | Stub |
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

**Summary: 11 WORKS, 7 PARTIAL, 19 NOT SUPPORTED/N/A**

---

## Step 1: Create stub helper

Add a utility function used by all unsupported tools:

```ts
function notImplemented(toolName: string): string {
  return `${toolName} is not supported for react-dom-native. ` +
    `The inspector proxy does not implement the required CDP domain.`;
}
```

## Step 2: Implement WORKS tools

### `evaluate_script` (evaluate.ts)
- Send `Runtime.evaluate` via CDPClient with `expression` = user's function stringified
- For functions with args (element UIDs), use `Runtime.callFunctionOn` with `objectId`
- Map Puppeteer's `page.evaluate()` pattern to raw CDP calls
- Proxy fully supports: `Runtime.evaluate`, `Runtime.callFunctionOn`, `Runtime.getProperties`, `Runtime.releaseObject`

### `wait_for` (wait.ts)
- Poll `Runtime.evaluate` checking for text presence in the DOM
- Existing implementation likely uses Puppeteer's `page.waitForFunction()` — replace with a polling loop over CDP `Runtime.evaluate`
- Respect timeout parameter

### `take_screenshot` (screenshot.ts)
- The proxy supports screenshots via the screencast mechanism: send `{type: 'capture-screenshot'}` to the app
- Alternatively, use `Page.captureScreenshot` CDP method if the proxy implements it
- Return base64 image data

### `list_pages` (pages.ts)
- HTTP `GET /json/list` on the proxy URL → returns target array
- Map each target to the page format chrome-devtools-mcp uses

### `select_page` (pages.ts)
- If multiple targets exist (multiple simulators), disconnect current WebSocket and connect to the new target's `webSocketDebuggerUrl`

## Step 3: Implement PARTIAL tools

### `navigate_page` (pages.ts)
- `reload`: Send CDP `Page.reload` (proxy supports this)
- `url`: Return "not supported — native apps don't navigate to URLs"
- `back`/`forward`: Return "not supported"

### `take_snapshot` (snapshot.ts)
- Send CDP `DOM.getDocument` → proxy forwards to app's shadow tree
- The response contains the DOM structure; format it as a text tree similar to chrome-devtools-mcp's a11y tree format
- May need to use `DOM.getOuterHTML` for element details

### `list_console_messages` / `get_console_message` (console.ts)
- On CDPClient connect, subscribe to `Runtime.consoleAPICalled` events
- Store messages in an array on the context
- `list_console_messages` returns the stored array (with pagination)
- `get_console_message` returns by index/ID

### `click` / `click_at` (input.ts)
- Send `Input.dispatchMouseEvent` with `type: 'mousePressed'` via CDP
- The proxy converts device pixels to logical points and forwards to the app
- Note: only `mousePressed` type is supported by the proxy

## Step 4: Stub NOT SUPPORTED tools

For each tool, replace the handler with:

```ts
handler: async (request, response) => {
  response.appendResponseLine(notImplemented('tool_name'));
}
```

### Tools to stub:
- **Input**: `hover`, `fill`, `type_text`, `drag`, `fill_form`, `upload_file`, `press_key`
- **Navigation**: `close_page`, `new_page`, `resize_page`
- **Network**: `list_network_requests`, `get_network_request`
- **Emulation**: `emulate`
- **Memory**: `take_memory_snapshot`
- **Lighthouse**: `lighthouse_audit`
- **Screencast**: `screencast_start`, `screencast_stop`
- **Extensions**: `install_extension`, `uninstall_extension`, `list_extensions`, `reload_extension`, `trigger_extension_action`
- **Dialog**: `handle_dialog`

## Step 5: Adapt `McpResponse.ts`

Strip Puppeteer-dependent response formatting:
- Keep: `appendResponseLine()`, `attachTraceSummary()`, `attachTraceInsight()`, `attachImage()`, text response handling
- Adapt: snapshot formatting (no Puppeteer accessibility tree — use proxy's DOM tree)
- Remove: Lighthouse result formatting, extension listing
- Simplify: network request formatting (or keep with stub data)

## Step 6: Adapt `McpPage.ts`

Create a lightweight page wrapper:
- No `pptrPage` property
- CDP-backed snapshot (via `DOM.getDocument`)
- CDP-backed screenshot (via proxy's screenshot mechanism)
- No emulation settings, no Puppeteer locators

## Step 7: Delete unused files

Remove files with no equivalent in the new MCP:
- `src/DevToolsConnectionAdapter.ts` (Puppeteer→DevTools CDP bridge)
- `src/DevtoolsUtils.ts` (Universe/target management)
- `src/PageCollector.ts` (Puppeteer-based collectors)
- `src/SlimMcpResponse.ts` (slim mode)
- `src/telemetry/` (Clearcut)
- `src/daemon/` (daemon mode)
- `src/third_party/lighthouse-devtools-mcp-bundle.js`

## Step 8: Verification

1. Build: `cd tools/devtools-mcp && npm run build`
2. Test working tools:
   - `evaluate_script` with `() => document.title`
   - `take_screenshot` → verify image returned
   - `list_pages` → verify target info
   - `wait_for` with text that exists in the app
3. Test partial tools:
   - `navigate_page` with `type: 'reload'` → app reloads
   - `take_snapshot` → verify DOM tree output
   - `list_console_messages` → verify messages collected
   - `click` with a UID → verify tap dispatched
4. Test stubs:
   - `emulate` → "not supported" message
   - `take_memory_snapshot` → "not supported" message
   - `fill` → "not supported" message
   - `lighthouse_audit` → "not supported" message

---

## Key Files Reference

| Tool file | Tools | Action |
|-----------|-------|--------|
| `src/tools/performance.ts` | start/stop/analyze trace | Done in Plan 1 |
| `src/tools/evaluate.ts` | evaluate_script | Rewrite: Puppeteer→CDP |
| `src/tools/wait.ts` | wait_for | Rewrite: Puppeteer→CDP polling |
| `src/tools/screenshot.ts` | take_screenshot | Rewrite: proxy screenshot mechanism |
| `src/tools/snapshot.ts` | take_snapshot | Rewrite: CDP DOM.getDocument |
| `src/tools/pages.ts` | list/select/navigate/close/new/resize | Partial rewrite + stubs |
| `src/tools/console.ts` | list/get console messages | Rewrite: CDP event collection |
| `src/tools/input.ts` | click, click_at, hover, fill, etc. | Partial rewrite + stubs |
| `src/tools/network.ts` | list/get network requests | Stub both |
| `src/tools/emulate.ts` | emulate | Stub |
| `src/tools/memory.ts` | take_memory_snapshot | Stub |
| `src/tools/lighthouse.ts` | lighthouse_audit | Stub |
| `src/tools/screencast.ts` | screencast_start/stop | Stub |
| `src/tools/extensions.ts` | all 5 extension tools | Stub |
| `src/tools/dialog.ts` | handle_dialog | Stub |
