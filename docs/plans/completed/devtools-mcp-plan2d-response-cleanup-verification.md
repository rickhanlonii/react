# Plan 2D: Response Cleanup & Full Verification

## Context

After Plans 2A-2C, all 38 tools have handlers (11 WORKS, 7 PARTIAL, 20 STUB). This plan cleans up the response/page infrastructure to remove remaining Puppeteer dependencies, deletes unused files, and performs comprehensive end-to-end verification of every tool.

**Prerequisites**: Plans 2A, 2B, 2C complete. All tool handlers have been rewritten or stubbed.

## Goal

- Extend `McpResponse.ts` with real implementations for Plan 2B/2C tool output (image, pages, console, snapshot)
- Verify `McpPage.ts` and `ToolDefinition.ts` have all needed properties/interfaces (added by earlier plans)
- Verify cleanup from Plan 1A is complete (file deletions)
- Verify `tools.ts` imports all 38 tools with correct mappings
- Verify all 38 tools work correctly (no build errors, no runtime crashes)
- Produce a comprehensive test matrix documenting the final state

## Steps

### Step 1: Extend `McpResponse.ts` for Plan 2B/2C tool output

`McpResponse.ts` was already simplified in Plan 1D to support text lines and trace output. Now extend it to support output from the newly implemented tools in Plans 2B and 2C:

**Add these capabilities:**
- `attachImage(data: { data: string; mimeType: string })` — for `take_screenshot` (base64 image)
- `setIncludePages(value: boolean)` — for `list_pages` (enable page listing in response)
- `setIncludeConsoleData(value: boolean, options?)` — for `list_console_messages` (enable console output)
- `includeSnapshot(params?)` — for `wait_for` and `click` (include snapshot after action)

**Note**: The stub methods for these were added as no-ops in Plan 1D. This step replaces them with real implementations that format the output correctly.

Update `handle()` to process these new fields:
```typescript
handle(toolName: string): {content: (TextContent | ImageContent)[]} {
  const content: (TextContent | ImageContent)[] = [];

  // Existing: text lines
  for (const line of this.#lines) {
    content.push({type: 'text', text: line});
  }

  // Existing: trace summary/insight
  // ...

  // New: image attachment (screenshot)
  if (this.#image) {
    content.push({
      type: 'image',
      data: this.#image.data,
      mimeType: this.#image.mimeType,
    });
  }

  return {content};
}
```

### Step 2: Verify `McpPage.ts` has all needed properties

`McpPage.ts` was already rewritten in Plan 1B as a lightweight shim. Verify it has the properties needed by Plan 2C tools:

- `consoleMessages: StoredConsoleMessage[]` — array of collected console messages (added by Plan 2C Step 4)
- `snapshotNodes: Map<string, number>` — UID → backendNodeId mapping (set by Plan 2C Step 3)

If Plan 2C already added these properties, this is a verification step only. If not, add them here.

### Step 3: Verify `ToolDefinition.ts` interfaces are complete

`ToolDefinition.ts` was already rewritten in Plan 1B. Verify the `Context` and `ContextPage` interfaces include all methods needed by the full tool set:

**Context must have:**
- `cdpClient: CDPClient` (Plan 1B)
- `isRunningPerformanceTrace()` / `setIsRunningPerformanceTrace()` (Plan 1B)
- `recordedTraces()` / `storeTraceRecording()` (Plan 1B)
- `getSelectedMcpPage()` (Plan 1B)
- `saveFile()` / `saveTemporaryFile()` (Plan 1B)

**ContextPage must have:**
- `id: number` (Plan 1B)

**Response must have:**
- `appendResponseLine()` (Plan 1B)
- `attachTraceSummary()` / `attachTraceInsight()` (Plan 1B)
- `attachImage()` (extended in Step 1 above)
- `setIncludePages()` / `setIncludeConsoleData()` / `includeSnapshot()` (extended in Step 1 above)

If any of these are missing, add them. This is a completeness verification step.

### Step 4: Verify cleanup from Plan 1A

Confirm that all files from Plan 1A's deletion list are actually gone. This is a verification step, not an action step:

```bash
cd tools/devtools-mcp
# Quick check — all these should return "not found"
for f in src/DevToolsConnectionAdapter.ts src/DevtoolsUtils.ts src/PageCollector.ts \
         src/WaitForHelper.ts src/SlimMcpResponse.ts src/polyfill.ts src/issue-descriptions.ts; do
  test ! -f "$f" && echo "OK: $f deleted" || echo "FAIL: $f still exists"
done
test ! -d src/telemetry && echo "OK: telemetry/ deleted" || echo "FAIL"
test ! -d src/daemon && echo "OK: daemon/ deleted" || echo "FAIL"
test ! -d src/bin && echo "OK: bin/ deleted" || echo "FAIL"
test ! -d src/tools/slim && echo "OK: slim/ deleted" || echo "FAIL"
```

If any files remain, delete them now.

### Step 5: Clean Up Imports

After deleting files and adapting interfaces, fix all import statements across the codebase:

1. Run `npm run build` and fix each import error
2. Remove all `import ... from '../third_party/index.js'` references to Puppeteer types (`Page`, `Frame`, `JSHandle`, `ElementHandle`, `Dialog`, `WebWorker`, `ScreenRecorder`, `KeyInput`, `ConsoleMessageType`, `ResourceType`, `CdpPage`, `Viewport`)
3. Remove `PredefinedNetworkConditions` import
4. Remove `parseKey` import from keyboard.ts
5. Update `third_party/index.ts` to only export what's still needed (zod, trace processing types)

### Step 6: Final Build Verification

```bash
cd tools/devtools-mcp
npm run build
```

Fix any remaining TypeScript errors until build is clean.

#### Verify tools.ts imports all 38 tools

After Plans 2A, 2B, and 2C, `tools.ts` should import ALL tool modules:

```typescript
import * as performanceTools from './performance.js';  // Plan 1C (3 tools)
import * as inputTools from './input.js';              // Plan 2A stubs + Plan 2C click/click_at
import * as pagesTools from './pages.js';              // Plan 2A stubs + Plan 2B/2C implementations
import * as networkTools from './network.js';          // Plan 2A stubs (2 tools)
import * as emulationTools from './emulation.js';      // Plan 2A stub (1 tool)
import * as memoryTools from './memory.js';            // Plan 2A stub (1 tool)
import * as lighthouseTools from './lighthouse.js';    // Plan 2A stub (1 tool)
import * as screencastTools from './screencast.js';    // Plan 2A stubs (2 tools)
import * as extensionsTools from './extensions.js';    // Plan 2A stubs (5 tools)
import * as scriptTools from './script.js';            // Plan 2B (1 tool)
import * as screenshotTools from './screenshot.js';    // Plan 2B (1 tool)
import * as snapshotTools from './snapshot.js';        // Plan 2C (2 tools: take_snapshot, wait_for)
import * as consoleTools from './console.js';          // Plan 2C (2 tools)
```

Verify the total count: 3 + 9 + 5 + 2 + 1 + 1 + 1 + 2 + 5 + 1 + 1 + 2 + 2 = **35 tools** from tool files, plus `handle_dialog` and `get_tab_id` from pages.ts = total matches the expected count.

**Verification matrix**: Create a checklist mapping each of the 38 tool names to its source file and plan:

| Tool Name | File | Plan | Category |
|-----------|------|------|----------|
| performance_start_trace | performance.ts | 1C | WORKS |
| performance_stop_trace | performance.ts | 1C | WORKS |
| performance_analyze_insight | performance.ts | 1C | WORKS |
| evaluate_script | script.ts | 2B | WORKS |
| take_screenshot | screenshot.ts | 2B | WORKS |
| list_pages | pages.ts | 2B | WORKS |
| select_page | pages.ts | 2B | WORKS |
| navigate_page | pages.ts | 2C | PARTIAL |
| take_snapshot | snapshot.ts | 2C | PARTIAL |
| wait_for | snapshot.ts | 2C | PARTIAL |
| list_console_messages | console.ts | 2C | PARTIAL |
| get_console_message | console.ts | 2C | PARTIAL |
| click | input.ts | 2C | PARTIAL |
| click_at | input.ts | 2C | PARTIAL |
| hover | input.ts | 2A | STUB |
| fill | input.ts | 2A | STUB |
| type_text | input.ts | 2A | STUB |
| drag | input.ts | 2A | STUB |
| fill_form | input.ts | 2A | STUB |
| upload_file | input.ts | 2A | STUB |
| press_key | input.ts | 2A | STUB |
| close_page | pages.ts | 2A | STUB |
| new_page | pages.ts | 2A | STUB |
| resize_page | pages.ts | 2A | STUB |
| handle_dialog | pages.ts | 2A | STUB |
| get_tab_id | pages.ts | 2A | STUB |
| list_network_requests | network.ts | 2A | STUB |
| get_network_request | network.ts | 2A | STUB |
| emulate | emulation.ts | 2A | STUB |
| take_memory_snapshot | memory.ts | 2A | STUB |
| lighthouse_audit | lighthouse.ts | 2A | STUB |
| screencast_start | screencast.ts | 2A | STUB |
| screencast_stop | screencast.ts | 2A | STUB |
| install_extension | extensions.ts | 2A | STUB |
| uninstall_extension | extensions.ts | 2A | STUB |
| list_extensions | extensions.ts | 2A | STUB |
| reload_extension | extensions.ts | 2A | STUB |
| trigger_extension_action | extensions.ts | 2A | STUB |

## Files Modified

| File | Action |
|------|--------|
| `src/McpResponse.ts` | Extend: add real implementations for attachImage, setIncludePages, setIncludeConsoleData, includeSnapshot |
| `src/McpPage.ts` | Verify: confirm consoleMessages and snapshotNodes properties exist |
| `src/tools/ToolDefinition.ts` | Verify: confirm Context/ContextPage/Response interfaces are complete |
| `src/tools/tools.ts` | Verify: confirm all 38 tool imports are present |
| `src/third_party/index.ts` | Adapt: remove Puppeteer re-exports |
| Multiple `src/tools/*.ts` | Fix: update imports after interface changes |

## Testing & Verification

### Automated Tests

1. **Build test**: `cd tools/devtools-mcp && npm run build` succeeds with zero errors.

2. **Import analysis**: No remaining imports from:
   - `puppeteer-core` or `puppeteer`
   - Deleted files (PageCollector, WaitForHelper, etc.)
   - Unused `third_party` exports

3. **Full tool matrix test**: Script that calls every tool handler with mock data:

```ts
// test-all-tools.ts
const TOOL_MATRIX = {
  // WORKS (Plan 1)
  'performance_start_trace': { category: 'works', expectedBehavior: 'starts trace' },
  'performance_stop_trace': { category: 'works', expectedBehavior: 'stops trace' },
  'performance_analyze_insight': { category: 'works', expectedBehavior: 'analyzes insight' },

  // WORKS (Plan 2B)
  'evaluate_script': { category: 'works', expectedBehavior: 'evaluates JS' },
  'take_screenshot': { category: 'works', expectedBehavior: 'captures screenshot' },
  'list_pages': { category: 'works', expectedBehavior: 'lists targets' },
  'select_page': { category: 'works', expectedBehavior: 'selects target' },

  // PARTIAL (Plan 2C)
  'wait_for': { category: 'partial', expectedBehavior: 'polls for text' },
  'navigate_page': { category: 'partial', expectedBehavior: 'reload works, others stub' },
  'take_snapshot': { category: 'partial', expectedBehavior: 'returns DOM tree' },
  'list_console_messages': { category: 'partial', expectedBehavior: 'returns stored messages' },
  'get_console_message': { category: 'partial', expectedBehavior: 'returns single message' },
  'click': { category: 'partial', expectedBehavior: 'dispatches touch' },
  'click_at': { category: 'partial', expectedBehavior: 'dispatches touch at coords' },

  // STUB (Plan 2A)
  'hover': { category: 'stub', expectedMessage: 'not supported' },
  'fill': { category: 'stub', expectedMessage: 'not supported' },
  'type_text': { category: 'stub', expectedMessage: 'not supported' },
  'drag': { category: 'stub', expectedMessage: 'not supported' },
  'fill_form': { category: 'stub', expectedMessage: 'not supported' },
  'upload_file': { category: 'stub', expectedMessage: 'not supported' },
  'press_key': { category: 'stub', expectedMessage: 'not supported' },
  'close_page': { category: 'stub', expectedMessage: 'not supported' },
  'new_page': { category: 'stub', expectedMessage: 'not supported' },
  'resize_page': { category: 'stub', expectedMessage: 'not supported' },
  'get_tab_id': { category: 'stub', expectedMessage: 'not supported' },
  'list_network_requests': { category: 'stub', expectedMessage: 'not supported' },
  'get_network_request': { category: 'stub', expectedMessage: 'not supported' },
  'emulate': { category: 'stub', expectedMessage: 'not supported' },
  'take_memory_snapshot': { category: 'stub', expectedMessage: 'not supported' },
  'lighthouse_audit': { category: 'stub', expectedMessage: 'not supported' },
  'screencast_start': { category: 'stub', expectedMessage: 'not supported' },
  'screencast_stop': { category: 'stub', expectedMessage: 'not supported' },
  'install_extension': { category: 'stub', expectedMessage: 'not supported' },
  'uninstall_extension': { category: 'stub', expectedMessage: 'not supported' },
  'list_extensions': { category: 'stub', expectedMessage: 'not supported' },
  'reload_extension': { category: 'stub', expectedMessage: 'not supported' },
  'trigger_extension_action': { category: 'stub', expectedMessage: 'not supported' },
  'handle_dialog': { category: 'stub', expectedMessage: 'not supported' },
};

// For each tool:
// - Verify it's registered and callable
// - For stubs: verify response contains "not supported"
// - For works/partial: verify no crash with mock CDP
// Total: 38 tools verified
```

### Manual Tests — Full E2E Verification

With a running Falcon app and MCP server:

**WORKS tools** (should return real results):

| # | Tool | Test | Expected |
|---|------|------|----------|
| 1 | `performance_start_trace` | Start trace | Trace begins |
| 2 | `performance_stop_trace` | Stop trace | Trace data returned |
| 3 | `performance_analyze_insight` | Analyze last trace | Insight returned |
| 4 | `evaluate_script` | `() => 1 + 1` | Returns `2` |
| 5 | `take_screenshot` | No params | JPEG image returned |
| 6 | `list_pages` | No params | At least 1 page listed |
| 7 | `select_page` | `pageId: 0` | Page selected |

**PARTIAL tools** (should work with limitations):

| # | Tool | Test | Expected |
|---|------|------|----------|
| 8 | `wait_for` | `text: ['Counter']` | Resolves if text exists |
| 9 | `wait_for` | `text: ['ZZZZZ'], timeout: 2000` | Times out |
| 10 | `navigate_page` | `type: 'reload'` | App reloads |
| 11 | `navigate_page` | `type: 'back'` | "not supported" message |
| 12 | `take_snapshot` | No params | Text tree of view hierarchy |
| 13 | `take_snapshot` | `verbose: true` | Detailed tree |
| 14 | `list_console_messages` | No params | Message list |
| 15 | `get_console_message` | `msgid: 0` | First message details |
| 16 | `click` | `uid: '<valid-uid>'` | Touch dispatched |
| 17 | `click_at` | `x: 200, y: 400` | Touch dispatched |

**STUB tools** (should return "not supported"):

| # | Tool | Expected Response Contains |
|---|------|---------------------------|
| 18 | `hover` | "not supported" + "hover" |
| 19 | `fill` | "not supported" |
| 20 | `type_text` | "not supported" |
| 21 | `drag` | "not supported" |
| 22 | `fill_form` | "not supported" |
| 23 | `upload_file` | "not supported" |
| 24 | `press_key` | "not supported" |
| 25 | `close_page` | "not supported" |
| 26 | `new_page` | "not supported" |
| 27 | `resize_page` | "not supported" |
| 28 | `get_tab_id` | "not supported" |
| 29 | `list_network_requests` | "not supported" |
| 30 | `get_network_request` | "not supported" |
| 31 | `emulate` | "not supported" |
| 32 | `take_memory_snapshot` | "not supported" |
| 33 | `lighthouse_audit` | "not supported" |
| 34 | `screencast_start` | "not supported" |
| 35 | `screencast_stop` | "not supported" |
| 36-38 | Extension tools (5) | "not supported" |
| 39 | `handle_dialog` | "not supported" |

### Regression Checks

- All WORKS tools return real results (not stubs)
- All PARTIAL tools work for supported operations
- All STUB tools return "not supported" messages (not crashes)
- MCP tool listing shows all 38 tools with correct names and schemas
- No TypeScript build errors
- No runtime exceptions on any tool call

### Acceptance Criteria

- [ ] `McpResponse.ts` has real implementations for attachImage, setIncludePages, setIncludeConsoleData, includeSnapshot
- [ ] `McpPage.ts` has consoleMessages and snapshotNodes properties
- [ ] `ToolDefinition.ts` Context/ContextPage/Response interfaces are complete for all tool needs
- [ ] All files from Plan 1A deletion list are confirmed gone
- [ ] `tools.ts` imports all 38 tools from their respective modules
- [ ] No imports from `puppeteer-core` or `puppeteer` anywhere in the codebase
- [ ] `npm run build` succeeds with zero TypeScript errors
- [ ] All 38 tools are registered and callable
- [ ] All 11 WORKS tools return real results
- [ ] All 7 PARTIAL tools work for supported operations
- [ ] All 20 STUB tools return "not supported" messages
- [ ] No runtime crash on any tool call
- [ ] MCP server starts cleanly and connects to inspector proxy

## Dependencies

- **Depends on**: Plans 2A (stubs), 2B (works tools), 2C (partial tools) — all must be complete
- **Blocks**: Nothing — this is the final plan in the Plan 2 series
- **After this**: The devtools-mcp fork is fully functional for react-dom-native
