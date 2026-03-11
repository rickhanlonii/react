# Plan 1: Fork chrome-devtools-mcp + Replace Connection & Tracing

## Context

We proved that capturing performance traces from the Falcon app works by sending CDP `Tracing.start`/`Tracing.end` directly to the inspector proxy WebSocket at `ws://127.0.0.1:6001/__cdp/<targetId>`. This returns real JSC runtime trace events (React commits, Suspense, DOM mutations, Yoga layout) in Chrome Trace Event format.

The chrome-devtools-mcp at `~/oss/chrome-devtools-mcp` has excellent trace analysis via `chrome-devtools-frontend`'s `TraceEngine`, but uses Puppeteer to connect to Chrome. We want to fork it, replace the connection layer with direct CDP WebSocket to our inspector proxy, and get performance traces working end-to-end.

## Location

`tools/devtools-mcp/` in the Falcon repo (matches existing `tools/fantom/` workspace pattern).

## Goal

Get a working fork that connects to the inspector proxy and runs performance traces. All other tools remain registered but are addressed in Plan 2.

---

## Step 1: Copy chrome-devtools-mcp source

Copy `~/oss/chrome-devtools-mcp/src/` → `tools/devtools-mcp/src/`. Copy `package.json` and `tsconfig.json`. Strip Rollup/bundling config, eslint, test infra — we just need the source + build.

## Step 2: Create new `package.json`

Based on chrome-devtools-mcp's, but:
- Rename to `react-dom-native-devtools-mcp`
- Move needed devDependencies to dependencies (chrome-devtools-mcp bundles everything, so all deps are devDeps there)
- Drop: `puppeteer`, `puppeteer-core`, `@puppeteer/browsers`, `lighthouse`, Rollup plugins, eslint, prettier, sinon, tiktoken, `@google/genai`
- Keep: `chrome-devtools-frontend@1.0.1591204`, `core-js@3.48.0`, `@modelcontextprotocol/sdk@1.27.1`, `zod`, `debug@4.4.3`, `yargs@18.0.0`
- Add: `ws@^8.18.0`

## Step 3: Replace `src/browser.ts` → `src/cdp-client.ts`

Delete `browser.ts`. Create `cdp-client.ts` (~150 lines) that:
1. Discovers targets via `GET http://<proxyUrl>/json/list`
2. Connects to `webSocketDebuggerUrl` via `ws`
3. Sends CDP commands `{id, method, params}` with auto-incrementing ID, returns `Promise<result>`
4. Dispatches CDP events (messages with `method` but no `id`) to registered listeners
5. Handles reconnection on disconnect

Reference pattern: `example/scripts/test-trace.js` (working CDP client).

## Step 4: Replace `src/McpContext.ts`

Strip out all Puppeteer references. The new context:
- Holds `CDPClient` instance (lazy-connected on first tool call)
- Stores trace state (`isTracing`, `lastTrace: TraceResult[]`)
- No page management (single target from proxy) — `getSelectedMcpPage()` returns a shim
- No network/console collectors, no DevTools universe manager, no browser lifecycle

## Step 5: Adapt `src/third_party/index.ts`

Remove all Puppeteer re-exports (`puppeteer-core`, `@puppeteer/browsers`, Lighthouse). Keep:
- `core-js` polyfill imports (lines 1-3)
- `DevTools` re-export from `chrome-devtools-frontend/mcp/mcp.js` (line 67)
- `McpServer`, `StdioServerTransport`, MCP SDK types
- `zod`, `debug`, `yargs`

## Step 6: Adapt `src/trace-processing/parse.ts`

Minimal changes — add a new `parseTraceEvents(events: Event[])` function that accepts a pre-parsed event array (from `Tracing.dataCollected` chunks) instead of a `Uint8Array` buffer. Keep `parseRawTraceBuffer` for file-loading use cases. Keep `getTraceSummary()` and `getInsightOutput()` unchanged.

## Step 7: Adapt `src/tools/performance.ts`

Replace Puppeteer `page.tracing.start()/stop()` with direct CDP:

**Start trace:**
- `cdpClient.send('Tracing.start', {})` — proxy sends `{type: 'start-tracing'}` to app

**Stop trace (async chunked flow — must handle correctly):**
1. Register listener for `Tracing.dataCollected` events before sending end
2. `cdpClient.send('Tracing.end', {})` — proxy sends `{type: 'stop-tracing'}` to app
3. Proxy receives trace data from app, splits into chunks of 1000 events each
4. Each chunk arrives as a `Tracing.dataCollected` event with `{params: {value: Event[]}}`
5. Accumulate all chunks into a single array
6. Wait for `Tracing.tracingComplete` event — signals all chunks have been sent
7. Feed accumulated events to `parseTraceEvents()`

**Other changes:**
- Remove CrUX data fetching (`populateCruxData`)
- Drop `reload` param (native app reload is separate)
- Drop `about:blank` navigation before tracing

## Step 8: Adapt `src/server.ts` and `src/tools/tools.ts`

**`src/server.ts`:**
- Replace `ensureBrowserConnected/Launched` with CDPClient creation
- Replace `McpContext.from(browser, ...)` with new lightweight context
- Remove telemetry (ClearcutLogger)
- Remove category filtering (keep all tools registered)
- Keep the mutex pattern for serializing tool calls

**`src/tools/tools.ts`** (tool aggregator):
- For Plan 1, only import `performance.ts` (the only working tool module)
- Remove all other tool imports and slim tool imports
- Plan 2 sub-plans will progressively re-add imports as tool files are rewritten

## Step 9: Adapt `src/index.ts` / `src/main.ts` / `src/cli.ts`

Simplify CLI args:
- Keep: `--proxy-url` (default `http://127.0.0.1:6001`), `--log-file`
- Drop: all Chrome/Puppeteer args (`--headless`, `--channel`, `--user-data-dir`, `--auto-connect`, etc.)
- Delete `src/bin/chrome-devtools.ts` and `src/bin/cliDefinitions.ts` (Chrome-specific CLI entry points)

## Step 10: Build + test

- `npm install` (run by user — agents have no internet access) then `npm run build`
- Add to `.mcp.json`:
  ```json
  "falcon-devtools": {
    "type": "stdio",
    "command": "node",
    "args": ["tools/devtools-mcp/build/index.js"],
    "env": { "FALCON_PROXY_URL": "http://127.0.0.1:6001" }
  }
  ```
- Test: `performance_start_trace` → interact with app → `performance_stop_trace` → verify trace summary → `performance_analyze_insight`

---

## Key Files Reference

### Rewrite

| Source (chrome-devtools-mcp) | Target (tools/devtools-mcp) | Action |
|---|---|---|
| `src/browser.ts` | `src/cdp-client.ts` | Replace entirely |
| `src/McpContext.ts` | `src/McpContext.ts` | Heavy rewrite (strip Puppeteer) |
| `src/McpPage.ts` | `src/McpPage.ts` | Heavy rewrite (CDP-backed shim) |
| `src/McpResponse.ts` | `src/McpResponse.ts` | Moderate rewrite (strip Puppeteer deps) |
| `src/server.ts` | `src/server.ts` | Moderate rewrite (CDPClient, no telemetry) |
| `src/index.ts` + `src/main.ts` + `src/cli.ts` | `src/index.ts` + `src/cli.ts` | Simplify CLI |
| `src/third_party/index.ts` | `src/third_party/index.ts` | Strip Puppeteer/Lighthouse exports |
| `src/trace-processing/parse.ts` | `src/trace-processing/parse.ts` | Add `parseTraceEvents()` |
| `src/tools/performance.ts` | `src/tools/performance.ts` | CDP instead of Puppeteer tracing |
| `src/tools/tools.ts` | `src/tools/tools.ts` | Update imports, remove slim tools |
| `src/tools/ToolDefinition.ts` | `src/tools/ToolDefinition.ts` | Strip Puppeteer types from Context/Request |
| `src/types.ts` | `src/types.ts` | Strip Puppeteer-specific types |
| `src/version.ts` | `src/version.ts` | Update version to `'0.1.0'` |

### Keep unchanged

| File | Purpose |
|---|---|
| `src/logger.ts` | Debug-based logger (uses `debug` module) |
| `src/Mutex.ts` | FIFO mutex for serializing tool calls |
| `src/devtools.d.ts` | TypeScript declarations for DevTools |
| `src/tools/categories.ts` | Tool category enum |
| `src/utils/pagination.ts` | Pagination helper for list results |
| `src/utils/string.ts` | String utilities |
| `src/utils/types.ts` | Shared utility types |

### Keep for Plan 2 (tool files — on disk but NOT imported)

Tool files are kept on disk with their original Puppeteer code. They are NOT imported by `tools.ts` and NOT included in the build. Plan 2 sub-plans will edit them in place.

| File | Plan 2 action |
|---|---|
| `src/tools/console.ts` | Plan 2C rewrites handlers |
| `src/tools/emulation.ts` | Plan 2A stubs handler |
| `src/tools/extensions.ts` | Plan 2A stubs handlers |
| `src/tools/input.ts` | Plan 2A stubs some, Plan 2C implements click/click_at |
| `src/tools/lighthouse.ts` | Plan 2A stubs handler |
| `src/tools/memory.ts` | Plan 2A stubs handler |
| `src/tools/network.ts` | Plan 2A stubs handlers |
| `src/tools/pages.ts` | Plan 2A stubs some, Plan 2B/2C implements others |
| `src/tools/screencast.ts` | Plan 2A stubs handlers |
| `src/tools/screenshot.ts` | Plan 2B implements handler |
| `src/tools/script.ts` | Plan 2B implements handler |
| `src/tools/snapshot.ts` | Plan 2C implements handlers |

### Keep for Plan 2 (formatters/utils)

| File | Purpose |
|---|---|
| `src/formatters/ConsoleFormatter.ts` | Console message formatting (Plan 2C) |
| `src/formatters/SnapshotFormatter.ts` | Snapshot formatting (Plan 2C) |
| `src/utils/keyboard.ts` | Keyboard input parsing (Plan 2A press_key stub) |

### Delete (Plan 1A)

| File | Reason |
|---|---|
| `src/DevToolsConnectionAdapter.ts` | Puppeteer→DevTools CDP bridge |
| `src/DevtoolsUtils.ts` | Universe/target management |
| `src/PageCollector.ts` | Puppeteer-based collectors |
| `src/WaitForHelper.ts` | Puppeteer-based event waiting |
| `src/SlimMcpResponse.ts` | Slim mode |
| `src/polyfill.ts` | Browser polyfills (not needed for Node) |
| `src/issue-descriptions.ts` | DevTools issue descriptions |
| `src/telemetry/` | Clearcut analytics |
| `src/daemon/` | Daemon mode |
| `src/bin/` | Chrome-specific CLI entry points |
| `src/tools/slim/` | Slim mode tools |
| `src/third_party/lighthouse-devtools-mcp-bundle.js` | Lighthouse bundle |
| `src/third_party/devtools-formatter-worker.ts` | DevTools formatter worker |
| `src/formatters/IssueFormatter.ts` | DevTools issues (not applicable) |
| `src/formatters/NetworkFormatter.ts` | Network formatting (network tools stubbed) |
| `src/utils/ExtensionRegistry.ts` | Chrome extension management |

### Reference (read-only)

| File | Purpose |
|---|---|
| `example/scripts/inspector-proxy.js` | Inspector proxy CDP implementation |
| `example/scripts/test-trace.js` | Working CDP client for tracing |
