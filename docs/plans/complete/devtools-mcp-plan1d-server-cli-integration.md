# Plan 1d: Server, CLI, and Integration

## Context

After Plans 1a-1c, we have:
- A clean project scaffold (1a)
- A working CDPClient and rewritten context layer (1b)
- Performance tracing via CDP (1c)

This final plan wires everything together: adapt `server.ts` to use `CDPClient` instead of Puppeteer browser, simplify the CLI, adapt `McpResponse.ts`, update the tool aggregator, build the project, add it to `.mcp.json`, and run end-to-end integration tests.

**Prerequisites**: Plans 1a, 1b, and 1c must be complete.

## Goal

A fully working MCP server at `tools/devtools-mcp/` that:
- Starts via `node build/src/index.js --proxy-url http://127.0.0.1:6001`
- Connects to the Falcon inspector proxy
- Runs `performance_start_trace` / `performance_stop_trace` / `performance_analyze_insight` end-to-end
- Is registered in `.mcp.json` for Claude Code integration

## Steps

### 1. Adapt `src/server.ts`

Rewrite to use `McpContext` with `CDPClient` instead of Puppeteer browser:

```typescript
// src/server.ts
import {logger} from './logger.js';
import {McpContext} from './McpContext.js';
import {McpResponse} from './McpResponse.js';
import {Mutex} from './Mutex.js';
import {
  McpServer,
  type CallToolResult,
  SetLevelRequestSchema,
} from './third_party/index.js';
import type {DefinedPageTool, ToolDefinition} from './tools/ToolDefinition.js';
import {createTools} from './tools/tools.js';
import {VERSION} from './version.js';

export interface ServerArgs {
  proxyUrl: string;
  logFile?: string;
}

export async function createMcpServer(serverArgs: ServerArgs) {
  const server = new McpServer(
    {
      name: 'falcon_devtools',
      title: 'Falcon DevTools MCP server',
      version: VERSION,
    },
    {capabilities: {logging: {}}},
  );
  server.server.setRequestHandler(SetLevelRequestSchema, () => {
    return {};
  });

  const context = new McpContext(serverArgs.proxyUrl);

  const toolMutex = new Mutex();

  function registerTool(tool: ToolDefinition | DefinedPageTool): void {
    server.registerTool(
      tool.name,
      {
        description: tool.description,
        inputSchema: tool.schema,
        annotations: tool.annotations,
      },
      async (params): Promise<CallToolResult> => {
        const guard = await toolMutex.acquire();
        try {
          logger(`${tool.name} request: ${JSON.stringify(params, null, '  ')}`);

          const response = new McpResponse();

          if ('pageScoped' in tool && tool.pageScoped) {
            const page = context.getSelectedMcpPage();
            await tool.handler(
              {params, page},
              response,
              context,
            );
          } else {
            await tool.handler(
              // @ts-expect-error types do not match.
              {params},
              response,
              context,
            );
          }

          const {content} = response.handle(tool.name);
          return {content};
        } catch (err) {
          logger(`${tool.name} error:`, err);
          const errorText = err && 'message' in err ? err.message : String(err);
          return {
            content: [{type: 'text', text: errorText}],
            isError: true,
          };
        } finally {
          guard.dispose();
        }
      },
    );
  }

  const tools = createTools();
  for (const tool of tools) {
    registerTool(tool);
  }

  return {server};
}
```

**Key changes from upstream:**
- Removed `ensureBrowserConnected`/`ensureBrowserLaunched` -- replaced with `new McpContext(proxyUrl)`
- Removed `ClearcutLogger` telemetry
- Removed `SlimMcpResponse` and slim mode
- Removed category filtering (all tools registered)
- Removed `loadIssueDescriptions()`
- Removed `logDisclaimers()`
- Removed `ParsedArguments` type dependency -- uses simple `ServerArgs` interface
- Removed `computeFlagUsage` import
- Removed `experimentalPageIdRouting`, `experimentalStructuredContent`, etc.
- Keep the mutex pattern for serializing tool calls
- `McpResponse.handle()` is simplified (no `context` argument needed for Puppeteer page enumeration)

### 2. Adapt `src/McpResponse.ts`

Simplify to remove Puppeteer dependencies. The response only needs to handle:
- Text output lines (`appendResponseLine`)
- Trace summary (`attachTraceSummary`)
- Trace insight (`attachTraceInsight`)

Strip:
- Page listing (`setIncludePages`)
- Network request formatting (`setIncludeNetworkRequests`, `attachNetworkRequest`)
- Console data formatting (`setIncludeConsoleData`, `attachConsoleMessage`)
- Snapshot rendering (`includeSnapshot`)
- Image attachment (`attachImage`)
- DevTools data (`attachDevToolsData`)
- Tab ID (`setTabId`)
- Extension listing (`setListExtensions`)
- Lighthouse results (`attachLighthouseResult`)
- Dialog handling
- Imports of `ConsoleFormatter`, `IssueFormatter`, `NetworkFormatter`, `SnapshotFormatter`
- Import of `PageCollector.UncaughtError`
- Import of `McpContext`

```typescript
// src/McpResponse.ts - simplified
import type {TextContent} from './third_party/index.js';
import type {Response} from './tools/ToolDefinition.js';
import type {InsightName, TraceResult} from './trace-processing/parse.js';
import {getInsightOutput, getTraceSummary} from './trace-processing/parse.js';

export class McpResponse implements Response {
  #lines: string[] = [];
  #traceSummary: TraceResult | null = null;
  #traceInsight: {trace: TraceResult; insightSetId: string; insightName: InsightName} | null = null;

  appendResponseLine(value: string): void {
    this.#lines.push(value);
  }

  attachTraceSummary(trace: TraceResult): void {
    this.#traceSummary = trace;
  }

  attachTraceInsight(
    trace: TraceResult,
    insightSetId: string,
    insightName: InsightName,
  ): void {
    this.#traceInsight = {trace, insightSetId, insightName};
  }

  // Stub methods for Response interface compatibility (Plan 2 tools)
  setIncludePages(_value: boolean): void {}
  setIncludeNetworkRequests(_value: boolean, _options?: unknown): void {}
  setIncludeConsoleData(_value: boolean, _options?: unknown): void {}
  includeSnapshot(_params?: unknown): void {}
  attachImage(_value: unknown): void {}
  attachNetworkRequest(_reqid: number, _options?: unknown): void {}
  attachConsoleMessage(_msgid: number): void {}
  attachDevToolsData(_data: unknown): void {}
  setTabId(_tabId: string): void {}
  setListExtensions(): void {}
  attachLighthouseResult(_result: unknown): void {}

  handle(toolName: string): {content: TextContent[]} {
    const content: TextContent[] = [];

    // Add text lines
    for (const line of this.#lines) {
      content.push({type: 'text', text: line});
    }

    // Add trace summary
    if (this.#traceSummary) {
      const summary = getTraceSummary(this.#traceSummary);
      content.push({type: 'text', text: summary});
    }

    // Add trace insight
    if (this.#traceInsight) {
      const {trace, insightSetId, insightName} = this.#traceInsight;
      const output = getInsightOutput(trace, insightSetId, insightName);
      if ('output' in output) {
        content.push({type: 'text', text: output.output});
      } else {
        content.push({type: 'text', text: output.error});
      }
    }

    return {content};
  }
}
```

### 3. Adapt `src/tools/tools.ts` (tool aggregator)

Update to only import performance tools (other tools will be adapted in Plan 2):

```typescript
// src/tools/tools.ts
import * as performanceTools from './performance.js';
import type {ToolDefinition} from './ToolDefinition.js';

export const createTools = () => {
  const rawTools = [
    ...Object.values(performanceTools),
  ];

  const tools: ToolDefinition[] = [];
  for (const tool of rawTools) {
    if (typeof tool === 'function') {
      tools.push(tool() as unknown as ToolDefinition);
    } else {
      tools.push(tool as ToolDefinition);
    }
  }

  tools.sort((a, b) => a.name.localeCompare(b.name));
  return tools;
};
```

**What was removed:**
- All non-performance tool imports (`console`, `emulation`, `extensions`, `input`, `lighthouse`, `memory`, `network`, `pages`, `screencast`, `screenshot`, `script`, `slim`, `snapshot`)
- `ParsedArguments` parameter (no longer needed)
- Slim mode handling

### 4. Simplify CLI: `src/cli.ts`

Strip all Chrome/Puppeteer arguments, keep only what Falcon needs:

```typescript
// src/cli.ts
import type {YargsOptions} from './third_party/index.js';
import {yargs, hideBin} from './third_party/index.js';

export const cliOptions = {
  proxyUrl: {
    type: 'string',
    description: 'URL of the Falcon inspector proxy (default: http://127.0.0.1:6001)',
    default: 'http://127.0.0.1:6001',
    alias: 'p',
  },
  logFile: {
    type: 'string',
    describe: 'Path to a file to write debug logs to.',
  },
} satisfies Record<string, YargsOptions>;

export type ParsedArguments = ReturnType<typeof parseArguments>;

export function parseArguments(version: string, argv = process.argv) {
  const yargsInstance = yargs(hideBin(argv))
    .scriptName('falcon-devtools-mcp')
    .options(cliOptions)
    .example([
      ['$0', 'Connect to inspector proxy at default http://127.0.0.1:6001'],
      ['$0 --proxy-url http://192.168.1.100:6001', 'Connect to a remote proxy'],
      ['$0 --log-file /tmp/log.txt', 'Save logs to a file'],
    ]);

  return yargsInstance
    .wrap(Math.min(120, yargsInstance.terminalWidth()))
    .help()
    .version(version)
    .parseSync();
}
```

**Arguments dropped:**
- `--headless`, `--channel`, `--executable-path`, `--browser-url`, `--ws-endpoint`, `--ws-headers` (Chrome-specific)
- `--auto-connect`, `--isolated`, `--user-data-dir` (Chrome profile management)
- `--viewport`, `--proxy-server`, `--accept-insecure-certs` (Chrome launch options)
- `--chrome-arg`, `--ignore-default-chrome-arg` (Chrome flags)
- `--experimental-*` (experimental Chrome features)
- `--category-*` (tool category filtering)
- `--performance-crux`, `--usage-statistics`, `--clearcut-*` (telemetry)
- `--slim`, `--via-cli` (modes)

**Arguments kept:**
- `--proxy-url` (default `http://127.0.0.1:6001`) -- the Falcon inspector proxy URL
- `--log-file` -- debug log output

### 5. Simplify entry point: `src/index.ts` and `src/main.ts`

**`src/index.ts`** -- keep the Node.js version check, import main:

```typescript
#!/usr/bin/env node
import {version} from 'node:process';

const [major, minor] = version.substring(1).split('.').map(Number);
if ((major === 20 && minor < 19) || (major === 22 && minor < 12) || major < 20) {
  console.error(`ERROR: falcon-devtools-mcp requires Node 20.19.0+ or 22.12.0+. Current: ${process.version}`);
  process.exit(1);
}

await import('./main.js');
```

**`src/main.ts`** -- simplified startup:

```typescript
// src/main.ts
import process from 'node:process';

import {parseArguments} from './cli.js';
import {logger, saveLogsToFile} from './logger.js';
import {createMcpServer} from './server.js';
import {StdioServerTransport} from './third_party/index.js';
import {VERSION} from './version.js';

const args = parseArguments(VERSION);

if (args.logFile) {
  saveLogsToFile(args.logFile);
}

process.on('unhandledRejection', (reason, promise) => {
  logger('Unhandled promise rejection', promise, reason);
});

logger(`Starting Falcon DevTools MCP Server v${VERSION}`);
const {server} = await createMcpServer({
  proxyUrl: args.proxyUrl,
  logFile: args.logFile,
});
const transport = new StdioServerTransport();
await server.connect(transport);
logger('Falcon DevTools MCP Server connected');
```

**What was removed:**
- `polyfill.ts` import
- `cliOptions` import for telemetry flag usage
- `ClearcutLogger` startup
- `logDisclaimers`
- `computeFlagUsage`
- CI/env variable checks for usage statistics

### 6. Delete `src/bin/` entry points (if not already deleted in Plan 1a)

These are Chrome-specific CLI entry points:
- `src/bin/chrome-devtools.ts`
- `src/bin/cliDefinitions.ts`

### 7. Keep tool files on disk (for Plan 2)

The following tool files still contain Puppeteer references but will be rewritten in Plans 2A-2C. **Do NOT delete them** — Plans 2A-2C will edit these files in place, preserving their tool registration boilerplate (name, description, schema). Deleting them would force Plan 2 to recreate each file from scratch.

These files are already excluded from the build because `tools.ts` (Step 3) only imports `performance.ts`. TypeScript will not compile unreferenced files, so they won't cause build errors.

Files kept for Plan 2:
- `src/tools/console.ts` — Plan 2C rewrites handlers
- `src/tools/emulation.ts` — Plan 2A stubs handler
- `src/tools/extensions.ts` — Plan 2A stubs handlers
- `src/tools/input.ts` — Plan 2A stubs some, Plan 2C implements click/click_at
- `src/tools/lighthouse.ts` — Plan 2A stubs handler
- `src/tools/memory.ts` — Plan 2A stubs handler
- `src/tools/network.ts` — Plan 2A stubs handlers
- `src/tools/pages.ts` — Plan 2A stubs some, Plan 2B/2C implements others
- `src/tools/screencast.ts` — Plan 2A stubs handlers
- `src/tools/screenshot.ts` — Plan 2B implements handler
- `src/tools/script.ts` — Plan 2B implements handler
- `src/tools/snapshot.ts` — Plan 2C implements handlers

**Important**: These files are NOT imported by `tools.ts` and therefore NOT included in the build. They exist only as templates for Plan 2 agents to edit.

### 8. Build the project

```bash
cd tools/devtools-mcp && npm run build
```

This must succeed with zero errors. If there are type errors, fix them before proceeding.

### 9. Add to `.mcp.json`

Add the Falcon DevTools MCP server entry to the project's `.mcp.json`:

```json
{
  "mcpServers": {
    "falcon-devtools": {
      "type": "stdio",
      "command": "node",
      "args": ["tools/devtools-mcp/build/src/index.js"],
      "env": {
        "FALCON_PROXY_URL": "http://127.0.0.1:6001"
      }
    }
  }
}
```

Note: The CLI defaults `--proxy-url` to `http://127.0.0.1:6001` so the env var is optional, but included for clarity.

### 10. Integration test

Run the full end-to-end flow through the MCP server.

## Files Modified

| File | Action |
|---|---|
| `src/server.ts` | Rewrite (CDPClient, no telemetry, simplified registration) |
| `src/McpResponse.ts` | Rewrite (strip Puppeteer deps, keep trace output) |
| `src/tools/tools.ts` | Rewrite (performance tools only) |
| `src/cli.ts` | Rewrite (two args: `--proxy-url`, `--log-file`) |
| `src/index.ts` | Simplify (Node version check + import main) |
| `src/main.ts` | Simplify (no telemetry, no polyfill) |
| `.mcp.json` (Falcon root) | Add `falcon-devtools` entry |
| `src/tools/console.ts` ... `src/tools/snapshot.ts` (12 files) | Keep unchanged (Plan 2 will rewrite) |

## Testing & Verification

### Automated Tests

1. **Build succeeds with zero errors:**
   ```bash
   cd tools/devtools-mcp && npm run build
   # Exit code must be 0
   ```

2. **TypeScript check passes:**
   ```bash
   cd tools/devtools-mcp && npx tsc --noEmit
   # Exit code must be 0, no type errors
   ```

3. **Server starts without crash:**
   ```bash
   timeout 3 node tools/devtools-mcp/build/src/index.js --proxy-url http://127.0.0.1:6001 2>/dev/null || true
   # Should not crash (will wait for MCP transport, timeout is expected)
   ```

4. **No Puppeteer references in built output:**
   ```bash
   grep -r "puppeteer" tools/devtools-mcp/build/src/ && echo "FAIL: Puppeteer references found" || echo "PASS: no Puppeteer references"
   grep -r "lighthouse" tools/devtools-mcp/build/src/ && echo "FAIL: Lighthouse references found" || echo "PASS: no Lighthouse references"
   ```

5. **CLI help works:**
   ```bash
   node tools/devtools-mcp/build/src/index.js --help
   # Should show --proxy-url and --log-file options only
   ```

### Manual Tests

**Full end-to-end MCP integration test** (requires running Falcon app + dev server):

1. Start the dev server: `cd example && npm run dev`
2. Launch the Falcon app in the simulator
3. Build the MCP server: `cd tools/devtools-mcp && npm run build`
4. Test via MCP tool calls (simulate what Claude Code would do):

   **Test via MCP Inspector** (recommended — HUMAN STEP):

   The MCP protocol requires a JSON-RPC initialization handshake (`initialize` → `initialized` notification) before any `tools/call` requests. Piping raw JSON to stdin won't work without completing this handshake.

   MCP Inspector was installed globally in Plan 1A. The user should run:

   ```bash
   npx @modelcontextprotocol/inspector node tools/devtools-mcp/build/src/index.js --proxy-url http://127.0.0.1:6001
   ```

   This opens a web UI where you can:
   1. See all registered tools
   2. Call `performance_start_trace` with `{"reload": false, "autoStop": false}`
   3. Wait, then call `performance_stop_trace`
   4. View the trace summary response
   5. Call `performance_analyze_insight` with an insight ID from the summary

   **Alternative — Test harness script:**

   Create `tools/devtools-mcp/tests/test-mcp-e2e.mjs`:
   ```js
   import { Client } from '@modelcontextprotocol/sdk/client/index.js';
   import { StdioClientTransport } from '@modelcontextprotocol/sdk/client/stdio.js';

   const transport = new StdioClientTransport({
     command: 'node',
     args: ['tools/devtools-mcp/build/src/index.js', '--proxy-url', 'http://127.0.0.1:6001'],
   });
   const client = new Client({ name: 'test', version: '1.0.0' });
   await client.connect(transport);

   // Test performance_start_trace
   const startResult = await client.callTool({
     name: 'performance_start_trace',
     arguments: { reload: false, autoStop: false },
   });
   console.log('start_trace:', JSON.stringify(startResult, null, 2));

   // Wait for trace data
   await new Promise(r => setTimeout(r, 3000));

   // Test performance_stop_trace
   const stopResult = await client.callTool({
     name: 'performance_stop_trace',
     arguments: {},
   });
   console.log('stop_trace:', JSON.stringify(stopResult, null, 2));

   await client.close();
   ```

6. **Verify `.mcp.json` integration:**
   - Open Claude Code in the Falcon project
   - Verify `falcon-devtools` tools appear in tool list
   - Run `performance_start_trace` → interact with app → `performance_stop_trace`
   - Verify trace summary is returned

### Regression Checks

- `npm test` from Falcon root still passes
- `npm run test:fantom` still passes
- Existing Falcon features work (fixtures render, app loads, SSR works)
- The inspector proxy is unchanged and still serves `test-trace.js`
- Other entries in `.mcp.json` still work

### Acceptance Criteria

- [ ] `npm run build` succeeds with zero TypeScript errors
- [ ] Server starts without crash when given `--proxy-url`
- [ ] CLI shows only `--proxy-url` and `--log-file` options (no Chrome/Puppeteer args)
- [ ] `performance_start_trace` tool is registered and sends `Tracing.start`
- [ ] `performance_stop_trace` tool collects chunked events and returns trace summary
- [ ] `performance_analyze_insight` tool returns insight details from stored trace
- [ ] `.mcp.json` contains `falcon-devtools` entry
- [ ] No references to `puppeteer`, `lighthouse`, `clearcut`, or `slim` in any built source file
- [ ] Server works end-to-end: start trace -> interact with app -> stop trace -> get summary -> analyze insight
- [ ] Existing Falcon tests still pass (`npm test`, `npm run test:fantom`)
- [ ] Tool files for Plan 2 (console, snapshot, input, etc.) are kept on disk but NOT imported by `tools.ts`

## Dependencies

- **Plan 1a** must be complete (project scaffolded)
- **Plan 1b** must be complete (CDPClient, McpContext, McpPage, ToolDefinition rewritten)
- **Plan 1c** must be complete (performance tracing via CDP)

## Reference Files

| File | Purpose |
|---|---|
| `~/oss/chrome-devtools-mcp/src/server.ts` | Upstream server (tool registration, mutex pattern) |
| `~/oss/chrome-devtools-mcp/src/cli.ts` | Upstream CLI (all args to drop) |
| `~/oss/chrome-devtools-mcp/src/main.ts` | Upstream entry point |
| `~/oss/chrome-devtools-mcp/src/index.ts` | Upstream Node version check |
| `~/oss/chrome-devtools-mcp/src/McpResponse.ts` | Upstream response formatting |
| `~/oss/chrome-devtools-mcp/src/tools/tools.ts` | Upstream tool aggregator |
| `example/scripts/inspector-proxy.js` | Inspector proxy (target for connection) |
| `.mcp.json` | Existing MCP server configuration |
