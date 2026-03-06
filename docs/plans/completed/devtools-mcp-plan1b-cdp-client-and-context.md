# Plan 1b: CDP Client and Context Rewrite

## Context

After Plan 1a scaffolds the project, the core connection layer needs to be replaced. The upstream `chrome-devtools-mcp` uses Puppeteer to connect to Chrome. We replace it with a direct CDP WebSocket client that connects to Falcon's inspector proxy at `ws://127.0.0.1:6001/__cdp/<targetId>`.

**Prerequisites**: Plan 1a (project scaffolding) must be complete.

## Goal

A working CDP client (`src/cdp-client.ts`) that:
- Discovers targets via HTTP (`GET /json/list`)
- Connects via WebSocket to send CDP commands and receive events
- Handles reconnection on disconnect

Plus rewritten `McpContext.ts`, `McpPage.ts`, `third_party/index.ts`, and `types.ts` files stripped of all Puppeteer references.

After this plan, `npx tsc --noEmit` should produce significantly fewer errors (remaining errors will be in `server.ts`, `tools/`, and `McpResponse.ts` which are addressed in Plans 1c and 1d).

## Steps

### 1. Create `src/cdp-client.ts` (~150 lines)

This replaces `src/browser.ts` (which should be deleted if not already in Plan 1a). The implementation follows the pattern proven in `example/scripts/test-trace.js`.

```typescript
// src/cdp-client.ts
import http from 'node:http';
import {logger} from './logger.js';
import WebSocket from 'ws';

export interface CDPTarget {
  id: string;
  title: string;
  url: string;
  webSocketDebuggerUrl: string;
  type: string;
}

export interface CDPEventListener {
  (params: Record<string, unknown>): void;
}

export class CDPClient {
  #ws: WebSocket | null = null;
  #nextId = 1;
  #pending = new Map<number, {
    resolve: (result: unknown) => void;
    reject: (error: Error) => void;
  }>();
  #listeners = new Map<string, Set<CDPEventListener>>();
  #proxyUrl: string;
  #wsUrl: string | null = null;
  #connected = false;

  constructor(proxyUrl: string) {
    this.#proxyUrl = proxyUrl;
  }

  /** Discover targets via GET /json/list */
  async discoverTargets(): Promise<CDPTarget[]> {
    return new Promise((resolve, reject) => {
      const url = `${this.#proxyUrl}/json/list`;
      http.get(url, (res) => {
        let data = '';
        res.on('data', (chunk: string) => { data += chunk; });
        res.on('end', () => {
          try {
            resolve(JSON.parse(data) as CDPTarget[]);
          } catch (e) {
            reject(new Error(`Failed to parse /json/list response: ${data}`));
          }
        });
      }).on('error', (err) => {
        reject(new Error(`Cannot connect to inspector proxy at ${url}: ${err.message}`));
      });
    });
  }

  /** Connect to the first available target */
  async connect(): Promise<void> {
    const targets = await this.discoverTargets();
    if (targets.length === 0) {
      throw new Error('No targets found at inspector proxy');
    }
    const target = targets[0];
    logger(`CDP: connecting to target "${target.title}" (${target.id})`);
    this.#wsUrl = target.webSocketDebuggerUrl;
    await this.#connectWs(this.#wsUrl);
  }

  /** Connect to a specific WebSocket URL */
  async #connectWs(wsUrl: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const ws = new WebSocket(wsUrl);
      ws.on('open', () => {
        this.#ws = ws;
        this.#connected = true;
        logger('CDP: WebSocket connected');
        resolve();
      });
      ws.on('message', (raw: WebSocket.RawData) => {
        this.#handleMessage(raw.toString());
      });
      ws.on('close', () => {
        this.#connected = false;
        logger('CDP: WebSocket disconnected');
      });
      ws.on('error', (err: Error) => {
        if (!this.#connected) {
          reject(err);
        } else {
          logger(`CDP: WebSocket error: ${err.message}`);
        }
      });
    });
  }

  /** Send a CDP command and return the result */
  async send(method: string, params: Record<string, unknown> = {}): Promise<unknown> {
    if (!this.#ws || !this.#connected) {
      await this.connect();
    }
    const id = this.#nextId++;
    return new Promise((resolve, reject) => {
      this.#pending.set(id, {resolve, reject});
      this.#ws!.send(JSON.stringify({id, method, params}));
    });
  }

  /** Register a listener for a CDP event (e.g. 'Tracing.dataCollected') */
  on(method: string, listener: CDPEventListener): void {
    let set = this.#listeners.get(method);
    if (!set) {
      set = new Set();
      this.#listeners.set(method, set);
    }
    set.add(listener);
  }

  /** Remove a listener */
  off(method: string, listener: CDPEventListener): void {
    this.#listeners.get(method)?.delete(listener);
  }

  /** Close the WebSocket connection */
  close(): void {
    this.#ws?.close();
    this.#ws = null;
    this.#connected = false;
  }

  get isConnected(): boolean {
    return this.#connected;
  }

  #handleMessage(raw: string): void {
    let msg: { id?: number; method?: string; result?: unknown; error?: { message: string }; params?: Record<string, unknown> };
    try {
      msg = JSON.parse(raw);
    } catch {
      return;
    }

    // Response to a command
    if (msg.id !== undefined && this.#pending.has(msg.id)) {
      const {resolve, reject} = this.#pending.get(msg.id)!;
      this.#pending.delete(msg.id);
      if (msg.error) {
        reject(new Error(msg.error.message));
      } else {
        resolve(msg.result);
      }
      return;
    }

    // CDP event
    if (msg.method) {
      const listeners = this.#listeners.get(msg.method);
      if (listeners) {
        for (const listener of listeners) {
          listener(msg.params ?? {});
        }
      }
    }
  }
}
```

**Key design decisions:**
- Uses Node.js `http` module for target discovery (same as `test-trace.js`)
- Uses `ws` package for WebSocket (same as inspector proxy)
- Auto-incrementing message IDs for command/response pairing
- Event listener pattern for `Tracing.dataCollected`, `Tracing.tracingComplete`, etc.
- Lazy connection: `send()` auto-connects if not connected

### 2. Delete `src/browser.ts`

```bash
rm -f tools/devtools-mcp/src/browser.ts
```

### 3. Rewrite `src/third_party/index.ts`

Strip all Puppeteer and Lighthouse re-exports. Keep core-js polyfills, DevTools, MCP SDK, and utilities.

```typescript
// src/third_party/index.ts
import 'core-js/modules/es.promise.with-resolvers.js';
import 'core-js/modules/es.set.union.v2.js';
import 'core-js/proposals/iterator-helpers.js';

export type {Options as YargsOptions} from 'yargs';
export {default as yargs} from 'yargs';
export {hideBin} from 'yargs/helpers';
export {default as debug} from 'debug';
export type {Debugger} from 'debug';
export {McpServer} from '@modelcontextprotocol/sdk/server/mcp.js';
export {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
export {
  type CallToolResult,
  SetLevelRequestSchema,
  type ImageContent,
  type TextContent,
} from '@modelcontextprotocol/sdk/types.js';
export {z as zod} from 'zod';

export * as DevTools from '../../node_modules/chrome-devtools-frontend/mcp/mcp.js';
```

**What was removed:**
- `puppeteer-core` imports (`Locator`, `PredefinedNetworkConditions`, `KnownDevices`, `CDPSessionEvent`, `puppeteer`, all type exports, `PipeTransport`, `CdpPage`)
- `@puppeteer/browsers` imports (`resolveDefaultUserDataDir`, `detectBrowserPlatform`, `Browser`, `BrowsersChromeReleaseChannel`)
- Lighthouse types (`Flags`, `Result`, `RunnerResult`, `OutputMode`, `Page`)
- Lighthouse functions (`snapshot`, `navigation`, `generateReport`)
- Lighthouse bundle import

### 4. Rewrite `src/types.ts`

Strip Puppeteer-specific types. Keep only what's needed:

```typescript
// src/types.ts
export interface GeolocationOptions {
  latitude: number;
  longitude: number;
}
```

**What was removed:**
- `ExtensionServiceWorker` (Chrome extension support)
- `TextSnapshotNode` / `TextSnapshot` (Puppeteer accessibility tree types)
- `EmulationSettings` (Puppeteer emulation state)
- Import of `SerializedAXNode`, `Viewport`, `Target` from `third_party`

### 5. Rewrite `src/McpPage.ts`

Replace the Puppeteer-backed page wrapper with a lightweight shim. The new `McpPage` has no real page — it just satisfies the `ContextPage` interface that tools reference.

```typescript
// src/McpPage.ts
import type {ContextPage} from './tools/ToolDefinition.js';

/**
 * Lightweight page shim for single-target CDP connection.
 * There is no real Puppeteer Page — just a placeholder that
 * satisfies the ContextPage interface used by tools.
 */
export class McpPage implements ContextPage {
  readonly id: number;

  constructor(id: number = 1) {
    this.id = id;
  }
}
```

**What was removed:**
- All Puppeteer `Page` references (`pptrPage`, `Dialog`, `ElementHandle`, `Viewport`)
- Snapshot management (`textSnapshot`, `uniqueBackendNodeIdToMcpId`)
- Emulation settings
- Dialog handler
- `getElementByUid` / `getAXNodeByUid` (Puppeteer accessibility)

### 6. Rewrite `src/McpContext.ts`

Replace the heavy Puppeteer-backed context with a lightweight wrapper around `CDPClient`:

```typescript
// src/McpContext.ts
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

import {CDPClient} from './cdp-client.js';
import {logger} from './logger.js';
import {McpPage} from './McpPage.js';
import type {Context} from './tools/ToolDefinition.js';
import type {TraceResult} from './trace-processing/parse.js';

export class McpContext implements Context {
  #cdpClient: CDPClient;
  #page: McpPage;
  #isRunningTrace = false;
  #traceResults: TraceResult[] = [];

  constructor(proxyUrl: string) {
    this.#cdpClient = new CDPClient(proxyUrl);
    this.#page = new McpPage(1);
  }

  get cdpClient(): CDPClient {
    return this.#cdpClient;
  }

  getSelectedMcpPage(): McpPage {
    return this.#page;
  }

  setIsRunningPerformanceTrace(x: boolean): void {
    this.#isRunningTrace = x;
  }

  isRunningPerformanceTrace(): boolean {
    return this.#isRunningTrace;
  }

  storeTraceRecording(result: TraceResult): void {
    this.#traceResults = [result];
  }

  recordedTraces(): TraceResult[] {
    return this.#traceResults;
  }

  async saveFile(
    data: Uint8Array<ArrayBufferLike>,
    filename: string,
  ): Promise<{filename: string}> {
    const filePath = path.resolve(filename);
    await fs.mkdir(path.dirname(filePath), {recursive: true});
    await fs.writeFile(filePath, data);
    return {filename: filePath};
  }

  async saveTemporaryFile(
    data: Uint8Array<ArrayBufferLike>,
    filename: string,
  ): Promise<{filepath: string}> {
    const dir = await fs.mkdtemp(
      path.join(os.tmpdir(), 'falcon-devtools-mcp-'),
    );
    const filepath = path.join(dir, filename);
    await fs.writeFile(filepath, data);
    return {filepath};
  }
}
```

**What was removed:**
- `Browser` / `BrowserContext` management
- Page lifecycle (`#pages`, `#mcpPages`, `newPage`, `closePage`, `createPagesSnapshot`)
- Network/console collectors
- DevTools universe manager
- Emulation system
- Extension management
- Text snapshot creation
- WaitForHelper integration
- All Puppeteer type imports

### 7. Rewrite `src/tools/ToolDefinition.ts`

**State when this plan starts**: `ToolDefinition.ts` is the unmodified upstream file from chrome-devtools-mcp, full of Puppeteer types (`Page`, `Dialog`, `ElementHandle`, `Viewport`, `ScreenRecorder`, etc.) and Puppeteer-specific methods on `Context` and `ContextPage`.

**State after this plan**: `ToolDefinition.ts` has simplified `Context` and `ContextPage` interfaces with NO Puppeteer types. The `Response` interface retains stub method signatures (empty implementations in `McpResponse.ts`) so tool files can still reference them without build errors. These stub methods will be replaced with real implementations in Plan 2D.

**Important**: Plan 2D does NOT re-modify `ToolDefinition.ts`. The interfaces set here are final. Plan 2D only extends `McpResponse.ts` to add real implementations behind the same interface.

Strip Puppeteer types from the `Context` and `ContextPage` interfaces:

The `Context` interface should be simplified to only the methods our tools actually need:

```typescript
// Key changes to Context type:
export type Context = Readonly<{
  isRunningPerformanceTrace(): boolean;
  setIsRunningPerformanceTrace(x: boolean): void;
  recordedTraces(): TraceResult[];
  storeTraceRecording(result: TraceResult): void;
  getSelectedMcpPage(): ContextPage;
  saveFile(data: Uint8Array<ArrayBufferLike>, filename: string): Promise<{filename: string}>;
  saveTemporaryFile(data: Uint8Array<ArrayBufferLike>, filename: string): Promise<{filepath: string}>;
  cdpClient: CDPClient;
}>;
```

The `ContextPage` interface should be simplified:

```typescript
export type ContextPage = Readonly<{
  readonly id: number;
}>;
```

**What to remove from `ToolDefinition.ts`:**
- `Page`, `Dialog`, `ElementHandle`, `Viewport`, `ScreenRecorder` type imports from `third_party`
- `TextSnapshotNode`, `GeolocationOptions`, `ExtensionServiceWorker` imports
- `InstalledExtension` import
- All Puppeteer-specific methods from `Context` (`emulate`, `restoreEmulation`, `newPage`, `closePage`, `selectPage`, `getPageById`, `waitForEventsAfterAction`, `waitForTextOnPage`, `getDevToolsData`, `resolveCdpRequestId`, `getScreenRecorder`, `setScreenRecorder`, `installExtension`, `uninstallExtension`, `triggerExtensionAction`, `listExtensions`, `getExtension`, `getExtensionServiceWorkers`, `getExtensionServiceWorkerId`, `isCruxEnabled`)
- `pptrPage`, `getAXNodeByUid`, `getElementByUid`, `getDialog`, `clearDialog` from `ContextPage`
- `DevToolsData`, `LighthouseData`, `ImageContentData`, `SnapshotParams` interfaces (move what's needed)
- `pageIdSchema`, `timeoutSchema`, `viewportTransform`, `geolocationTransform` helpers
- `CLOSE_PAGE_ERROR` constant
- `ParsedArguments` import

**What to keep:**
- `BaseToolDefinition`, `ToolDefinition`, `DefinedPageTool` generic types
- `defineTool`, `definePageTool` functions
- `Request`, `Response` interfaces
- `ToolCategory` import
- `TraceResult`, `InsightName` imports
- `zod` import

**Response interface after this plan:**

Keep these methods on the `Response` interface (they will be no-ops in `McpResponse.ts` until Plan 2B/2C/2D implements them):
- `appendResponseLine(value: string)` — used by all tools
- `attachTraceSummary(trace: TraceResult)` — used by performance tools
- `attachTraceInsight(trace: TraceResult, insightSetId: string, insightName: InsightName)` — used by performance tools
- `attachImage(value: { data: string; mimeType: string })` — used by screenshot (Plan 2B)
- `setIncludePages(value: boolean)` — used by list_pages (Plan 2B)
- `setIncludeConsoleData(value: boolean, options?: unknown)` — used by console tools (Plan 2C)
- `includeSnapshot(params?: unknown)` — used by snapshot/click tools (Plan 2C)

Remove these methods entirely (no tool will call them):
- `setIncludeNetworkRequests` — network tools are stubbed
- `attachNetworkRequest` — network tools are stubbed
- `attachDevToolsData` — not applicable
- `setTabId` — no browser tabs
- `setListExtensions` — extensions are stubbed
- `attachLighthouseResult` — Lighthouse is stubbed
- `attachConsoleMessage` — replaced by direct formatting in console tools

### 8. Add `CDPClient` import to `McpContext`

Ensure `McpContext.ts` properly exports the `CDPClient` getter so `server.ts` and tools can use it.

## Files Modified

| File | Action |
|---|---|
| `src/cdp-client.ts` | Create new (~150 lines) |
| `src/browser.ts` | Delete |
| `src/third_party/index.ts` | Rewrite (strip Puppeteer/Lighthouse) |
| `src/types.ts` | Rewrite (strip Puppeteer types) |
| `src/McpPage.ts` | Rewrite (lightweight shim) |
| `src/McpContext.ts` | Rewrite (CDPClient-backed, strip Puppeteer) |
| `src/tools/ToolDefinition.ts` | Rewrite (strip Puppeteer types from Context/ContextPage/Response) |

## Testing & Verification

### Automated Tests

1. **Unit test: CDPClient target discovery** (can be a simple script or test file)
   ```bash
   # Start a mock HTTP server that returns a JSON target list
   # Verify CDPClient.discoverTargets() parses the response correctly
   ```

   Alternatively, test against the real inspector proxy if dev server is running:
   ```bash
   cd tools/devtools-mcp
   node -e "
     import {CDPClient} from './build/src/cdp-client.js';
     const client = new CDPClient('http://127.0.0.1:6001');
     const targets = await client.discoverTargets();
     console.log('Targets:', JSON.stringify(targets, null, 2));
     if (!targets[0]?.webSocketDebuggerUrl) throw new Error('Missing wsUrl');
     console.log('PASS: target discovery works');
   "
   ```

2. **Unit test: CDPClient WebSocket send/receive**
   ```bash
   # Connect to the inspector proxy
   # Send a no-op CDP command (e.g. 'Runtime.evaluate' with simple expression)
   # Verify we get a response with a matching id
   node -e "
     import {CDPClient} from './build/src/cdp-client.js';
     const client = new CDPClient('http://127.0.0.1:6001');
     await client.connect();
     console.log('Connected:', client.isConnected);
     if (!client.isConnected) throw new Error('Not connected');
     client.close();
     console.log('PASS: WebSocket connection works');
   "
   ```

3. **Unit test: CDPClient event dispatching**
   ```bash
   # Register a listener for a CDP event
   # Trigger the event (e.g. by starting/stopping tracing)
   # Verify the listener was called with correct params
   ```

4. **TypeScript compilation check:**
   ```bash
   cd tools/devtools-mcp && npx tsc --noEmit 2>&1 | wc -l
   # Should have significantly fewer errors than after Plan 1a
   # Remaining errors should only be in server.ts, tools/performance.ts, McpResponse.ts
   ```

### Manual Tests

1. Build the project: `cd tools/devtools-mcp && npm run build`
2. Verify `build/src/cdp-client.js` exists and looks correct
3. Verify no Puppeteer imports remain in the built output:
   ```bash
   grep -r "puppeteer" tools/devtools-mcp/build/src/ || echo "No Puppeteer references (PASS)"
   ```
4. Verify no Lighthouse imports remain:
   ```bash
   grep -r "lighthouse" tools/devtools-mcp/build/src/ || echo "No Lighthouse references (PASS)"
   ```

### Regression Checks

- `npm test` from Falcon root still passes
- The inspector proxy at `example/scripts/inspector-proxy.js` is unchanged
- `example/scripts/test-trace.js` still works independently

### Acceptance Criteria

- [ ] `src/cdp-client.ts` exists with `CDPClient` class (~150 lines)
- [ ] `CDPClient.discoverTargets()` returns target list from HTTP `/json/list`
- [ ] `CDPClient.connect()` establishes WebSocket connection
- [ ] `CDPClient.send(method, params)` sends CDP commands and returns Promise
- [ ] `CDPClient.on(method, listener)` dispatches CDP events to listeners
- [ ] `CDPClient.close()` closes the WebSocket
- [ ] `src/browser.ts` is deleted
- [ ] `src/third_party/index.ts` has no Puppeteer or Lighthouse imports
- [ ] `src/types.ts` has no Puppeteer-specific types
- [ ] `src/McpPage.ts` is a lightweight shim (no `pptrPage`)
- [ ] `src/McpContext.ts` holds `CDPClient` instead of `Browser`
- [ ] `src/tools/ToolDefinition.ts` has simplified `Context` and `ContextPage` types
- [ ] No remaining imports of `puppeteer-core`, `@puppeteer/browsers`, or `lighthouse` in any source file
- [ ] `npx tsc --noEmit` errors are limited to `server.ts`, `McpResponse.ts`, and tool files

## Dependencies

- **Plan 1a** must be complete (project scaffolded, files deleted, `npm install` done by user, `node_modules/` populated).

## Reference Files

| File | Purpose |
|---|---|
| `example/scripts/test-trace.js` | Working CDP client pattern (target discovery, WebSocket, tracing) |
| `example/scripts/inspector-proxy.js` | Supported CDP methods, target format, chunk size |
| Inspector proxy HTTP endpoints | `GET /json/list`, `GET /json/version` |
| Inspector proxy WebSocket | `ws://127.0.0.1:6001/__cdp/<targetId>` |
