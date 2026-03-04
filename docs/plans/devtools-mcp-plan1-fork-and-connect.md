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

Replace Puppeteer `page.tracing.start()/stop()` with:
- `cdpClient.send('Tracing.start', {})`
- `cdpClient.send('Tracing.end', {})` + collect `Tracing.dataCollected` events + wait for `Tracing.tracingComplete`
- Feed collected events to `parseTraceEvents()`
- Remove CrUX data fetching
- Drop `reload` param (native app reload is separate)

## Step 8: Adapt `src/server.ts`

- Replace `ensureBrowserConnected/Launched` with CDPClient creation
- Replace `McpContext.from(browser, ...)` with new lightweight context
- Remove telemetry (ClearcutLogger)
- Remove category filtering (keep all tools registered)
- Keep the mutex pattern for serializing tool calls

## Step 9: Adapt `src/index.ts` / `src/main.ts` / `src/cli.ts`

Simplify CLI args:
- Keep: `--proxy-url` (default `http://127.0.0.1:6001`), `--log-file`
- Drop: all Chrome/Puppeteer args (`--headless`, `--channel`, `--user-data-dir`, `--auto-connect`, etc.)

## Step 10: Build + test

- `npm install && npm run build`
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
| `src/DevToolsConnectionAdapter.ts` | — | Delete |
| `src/DevtoolsUtils.ts` | — | Delete |
| `src/PageCollector.ts` | — | Delete |
| `src/SlimMcpResponse.ts` | — | Delete |
| `src/telemetry/` | — | Delete |
| `src/daemon/` | — | Delete |
| `src/third_party/lighthouse-devtools-mcp-bundle.js` | — | Delete |
| Inspector proxy ref | `example/scripts/inspector-proxy.js` | Read-only |
| Working CDP client ref | `example/scripts/test-trace.js` | Read-only |
