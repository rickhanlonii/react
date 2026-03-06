# Plan 2A: Stub Infrastructure for Unsupported Tools

## Context

After Plan 1 completes (fork, connection, performance tracing), the forked devtools-mcp server still has 20 tools that reference Puppeteer APIs which don't exist in our CDP-proxy-based setup. These tools must be stubbed with clear error messages so the MCP server builds, runs, and returns helpful guidance when an AI agent calls them.

**Prerequisites**: Plan 1 (fork + connection + tracing) is complete. The MCP server connects to the inspector proxy and performance tracing works.

## Goal

- Create a `notImplemented()` stub utility
- Replace all 20 unsupported tool handlers with stubs that return descriptive messages
- The MCP server builds without TypeScript errors
- No runtime crashes when any stubbed tool is called
- Each stub explains **why** the tool isn't supported (missing CDP domain, native app limitation, etc.)

## Steps

### Step 1: Create `notImplemented` Helper

Create a utility in `tools/devtools-mcp/src/tools/stubs.ts` (or inline in each file):

```ts
/**
 * Returns a descriptive "not supported" message for tools that can't work
 * with the react-dom-native inspector proxy.
 */
export function notImplemented(toolName: string, reason?: string): string {
  const base = `${toolName} is not supported for react-dom-native.`;
  return reason ? `${base} ${reason}` : `${base} The inspector proxy does not implement the required CDP domain.`;
}
```

### Important: Files Already Exist

Plan 1D keeps all tool files on disk with their original Puppeteer-based implementations. They are NOT imported by `tools.ts` and NOT included in the build. Each step below **edits the existing file** — replacing Puppeteer imports and handler implementations with stub versions that use `notImplemented()`.

After rewriting each file, add it back to `tools.ts` imports so it becomes part of the build.

### Step 2: Stub Input Tools (7 tools)

**File**: `src/tools/input.ts`

Stub these tools, removing all Puppeteer locator/keyboard/mouse/drag usage:

| Tool | Stub Reason |
|------|-------------|
| `hover` | Native apps don't have hover states; no mouse cursor. |
| `fill` | Text input requires UIKit first responder handling, not supported via CDP. |
| `type_text` | Same as fill — keyboard input requires UIKit first responder. |
| `drag` | Drag-and-drop requires UIKit gesture recognizer, not supported via CDP. |
| `fill_form` | Depends on `fill` which is not supported. |
| `upload_file` | Native apps don't have file input elements. |
| `press_key` | Keyboard events require UIKit first responder, not supported via CDP. |

Each handler becomes:
```ts
handler: async (_request, response) => {
  response.appendResponseLine(notImplemented('hover', 'Native apps do not have hover states.'));
}
```

Keep the tool registration (name, description, schema) intact so the tool still appears in MCP tool listings. Only replace the handler body.

### Step 3: Stub Navigation Tools (4 tools)

**File**: `src/tools/pages.ts`

| Tool | Stub Reason |
|------|-------------|
| `close_page` | Cannot close a native app page via CDP. |
| `new_page` | Cannot open new pages in a native app. |
| `resize_page` | Simulator window size is fixed; cannot resize via CDP. |
| `get_tab_id` | No browser tabs in a native app. |

Remove Puppeteer `page.pptrPage.browser()`, `page.pptrPage.goto()`, `page._tabId` references. Replace with `notImplemented()`.

### Step 4: Stub Network Tools (2 tools)

**File**: `src/tools/network.ts`

| Tool | Stub Reason |
|------|-------------|
| `list_network_requests` | Network monitoring is not available via the inspector proxy. |
| `get_network_request` | Same. |

Remove `context.getDevToolsData()`, `context.resolveCdpRequestId()`, `response.setIncludeNetworkRequests()`, `response.attachNetworkRequest()` calls.

### Step 5: Stub Emulation Tool (1 tool)

**File**: `src/tools/emulation.ts`

| Tool | Stub Reason |
|------|-------------|
| `emulate` | Native app rendering is not controlled by a browser engine; emulation settings like viewport, network throttling, and geolocation are not applicable. |

Remove `context.emulate()`, `PredefinedNetworkConditions` imports.

### Step 6: Stub Memory Tool (1 tool)

**File**: `src/tools/memory.ts`

| Tool | Stub Reason |
|------|-------------|
| `take_memory_snapshot` | Heap snapshots require V8 HeapProfiler domain; JSC via the inspector proxy does not support this. |

Remove `page.pptrPage.captureHeapSnapshot()` call.

### Step 7: Stub Lighthouse Tool (1 tool)

**File**: `src/tools/lighthouse.ts`

| Tool | Stub Reason |
|------|-------------|
| `lighthouse_audit` | Lighthouse audits are web-specific (accessibility, SEO, best practices for HTML pages). Not applicable to native app rendering. |

Remove all Lighthouse imports (`snapshot`, `navigation`, `generateReport`).

### Step 8: Stub Screencast Tools (2 tools)

**File**: `src/tools/screencast.ts`

| Tool | Stub Reason |
|------|-------------|
| `screencast_start` | Video recording requires ffmpeg and Puppeteer's screencast API. Use `take_screenshot` for static captures. |
| `screencast_stop` | Same. |

Remove `ScreenRecorder` imports, `page.pptrPage.screencast()` calls.

### Step 9: Stub Extension Tools (5 tools)

**File**: `src/tools/extensions.ts`

| Tool | Stub Reason |
|------|-------------|
| `install_extension` | Chrome extensions are not applicable to native iOS apps. |
| `uninstall_extension` | Same. |
| `list_extensions` | Same. |
| `reload_extension` | Same. |
| `trigger_extension_action` | Same. |

Remove `context.installExtension()`, `context.uninstallExtension()`, etc.

### Step 10: Stub Dialog Tool (1 tool)

**File**: `src/tools/pages.ts` (same file as navigation stubs)

| Tool | Stub Reason |
|------|-------------|
| `handle_dialog` | Native apps don't produce browser dialogs (alert/confirm/prompt via DOM). UIAlertController is not accessible via CDP. |

Remove `page.getDialog()`, `dialog.accept()`, `dialog.dismiss()` calls.

### Step 11: Update `src/tools/tools.ts` to import stubbed tools

After all tool files have been rewritten with stubs, update the tool aggregator to import them:

```typescript
// src/tools/tools.ts
import * as performanceTools from './performance.js';
import * as inputTools from './input.js';
import * as pagesTools from './pages.js';
import * as networkTools from './network.js';
import * as emulationTools from './emulation.js';
import * as memoryTools from './memory.js';
import * as lighthouseTools from './lighthouse.js';
import * as screencastTools from './screencast.js';
import * as extensionsTools from './extensions.js';
import type {ToolDefinition} from './ToolDefinition.js';

export const createTools = () => {
  const rawTools = [
    ...Object.values(performanceTools),
    ...Object.values(inputTools),
    ...Object.values(pagesTools),
    ...Object.values(networkTools),
    ...Object.values(emulationTools),
    ...Object.values(memoryTools),
    ...Object.values(lighthouseTools),
    ...Object.values(screencastTools),
    ...Object.values(extensionsTools),
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

**Note**: `script.ts`, `screenshot.ts`, `snapshot.ts`, and `console.ts` are NOT imported here — they will be added in Plans 2B and 2C when their handlers are implemented.

## Files Modified

| File | Action |
|------|--------|
| `src/tools/stubs.ts` | **New** — `notImplemented()` helper |
| `src/tools/input.ts` | Stub 7 tools (hover, fill, type_text, drag, fill_form, upload_file, press_key); keep click/click_at for Plan 2C |
| `src/tools/pages.ts` | Stub 4 tools (close_page, new_page, resize_page, get_tab_id) + handle_dialog; keep list_pages/select_page/navigate_page |
| `src/tools/network.ts` | Stub 2 tools (list_network_requests, get_network_request) |
| `src/tools/emulation.ts` | Stub 1 tool (emulate) |
| `src/tools/memory.ts` | Stub 1 tool (take_memory_snapshot) |
| `src/tools/lighthouse.ts` | Stub 1 tool (lighthouse_audit) |
| `src/tools/screencast.ts` | Stub 2 tools (screencast_start, screencast_stop) |
| `src/tools/extensions.ts` | Stub 5 tools (all 5) |
| `src/tools/tools.ts` | Import all 9 stubbed tool modules |

## Testing & Verification

### Automated Tests

1. **Build test**: `cd tools/devtools-mcp && npm run build` must succeed with zero TypeScript errors.
2. **Stub response test**: Write a test script (`tests/stub-tools-test.ts` or similar) that:
   - Instantiates each stubbed tool handler with a mock request/response
   - Calls the handler
   - Asserts `response.appendResponseLine()` was called with a string containing "not supported"
   - Asserts the string contains the tool name
   - Asserts no exceptions were thrown

```ts
// Example test pseudocode
for (const tool of stubbedTools) {
  const response = createMockResponse();
  await tool.handler(mockRequest, response, mockContext);
  assert(response.lines[0].includes('not supported'));
  assert(response.lines[0].includes(tool.name));
}
```

### Manual Tests

1. Start the MCP server connected to a running Falcon app
2. Call each stubbed tool via an MCP client (e.g., Claude Code or MCP Inspector):
   - `hover` with uid "test" -> returns "not supported" message
   - `fill` with uid "test", value "hello" -> returns "not supported" message
   - `emulate` with any params -> returns "not supported" message
   - `take_memory_snapshot` with filePath "/tmp/test.heapsnapshot" -> returns "not supported" message
   - `lighthouse_audit` -> returns "not supported" message
   - `list_network_requests` -> returns "not supported" message
   - `install_extension` with path "/tmp" -> returns "not supported" message
3. Verify no crash, no hang, immediate response for each

### Regression Checks

- Performance tracing (Plan 1) still works after stubbing
- `click` and `click_at` tools are NOT stubbed (they're implemented in Plan 2C)
- `list_pages`, `select_page`, `navigate_page` are NOT stubbed (Plans 2B/2C)
- `evaluate_script`, `take_screenshot`, `take_snapshot`, `wait_for` are NOT stubbed (Plans 2B/2C)
- `list_console_messages`, `get_console_message` are NOT stubbed (Plan 2C)
- Tool schemas are preserved (MCP tool listing still shows all 38 tools with correct parameters)

### Acceptance Criteria

- [ ] `notImplemented()` helper exists and is used by all 20 stubs
- [ ] All 20 unsupported tool handlers return descriptive "not supported" messages
- [ ] Each message includes the tool name and a reason specific to that tool
- [ ] No Puppeteer imports remain in stubbed tool files (except files shared with working tools)
- [ ] `npm run build` succeeds with zero errors
- [ ] No runtime crash when calling any stubbed tool
- [ ] Tool schemas (name, description, parameters) are unchanged — tools still appear in MCP listings
- [ ] Working tools from Plans 2B/2C are not affected (click, click_at, evaluate_script, etc.)
- [ ] `tools.ts` imports all 9 stubbed tool modules (input, pages, network, emulation, memory, lighthouse, screencast, extensions — but NOT script, screenshot, snapshot, console which are for Plans 2B/2C)

## Dependencies

- **Depends on**: Plan 1 (fork + connection + tracing)
- **Blocks**: Plan 2D (response cleanup needs stubs in place for full verification)
- **Independent of**: Plans 2B, 2C (can be done in parallel since different tool handlers)
