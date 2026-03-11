# Plan 2B: Implement Fully-Supported (WORKS) Tools

## Context

After Plan 1 (fork + connection + tracing), the MCP server connects to the inspector proxy via CDP WebSocket. This plan implements the 4 remaining tools that are fully supported by the proxy: `evaluate_script`, `take_screenshot`, `list_pages`, and `select_page`. These tools map cleanly to CDP methods the proxy already handles.

**Prerequisites**: Plan 1 complete. The MCP server has a `CDPClient` class that can send CDP messages and receive responses via WebSocket.

## Goal

- Implement `evaluate_script` using CDP `Runtime.evaluate` / `Runtime.callFunctionOn`
- Implement `take_screenshot` using the proxy's `capture-screenshot` mechanism
- Implement `list_pages` using HTTP `GET /json/list` on the proxy
- Implement `select_page` to switch the CDP WebSocket target
- All 4 tools work end-to-end with a running Falcon app

## Steps

### Important: Files Already Exist

Plan 1D keeps all tool files on disk. Each step below **edits the existing file** in place — replacing Puppeteer imports and handler implementations with CDP-based implementations.

### Step 1: Implement `evaluate_script`

**File**: `src/tools/script.ts`

The upstream tool uses Puppeteer's `page.evaluate()` and `page.evaluateHandle()`. Replace with raw CDP calls.

**Implementation approach**:

1. **No-args evaluation**: Send `Runtime.evaluate` with `expression` set to `(${fnString})()`, `returnByValue: true`, `awaitPromise: true`
2. **With-args evaluation**: For each UID arg, resolve to a CDP `RemoteObject` via the snapshot system (if available) or `DOM.resolveNode`. Then use `Runtime.callFunctionOn` with the function string and `arguments` as remote object references.
3. **Response format**: Parse the CDP result, format as JSON, and output:
   ```
   Script ran on page and returned:
   ```json
   <result>
   ```
   ```

**Key CDP messages**:
```ts
// Simple evaluation (no args)
cdpClient.send('Runtime.evaluate', {
  expression: `(${fnString})()`,
  returnByValue: true,
  awaitPromise: true,
});

// With args (element handles)
cdpClient.send('Runtime.callFunctionOn', {
  functionDeclaration: fnString,
  arguments: args.map(objectId => ({ objectId })),
  returnByValue: true,
  awaitPromise: true,
});
```

**What to remove**:
- `Evaluatable` type (Page | Frame | WebWorker)
- `page.evaluateHandle()`, `page.evaluate()` calls
- `JSHandle` usage, `handle.dispose()`
- Frame resolution logic (`getPageOrFrame`)
- Service worker evaluation (`getWebWorker`)
- `serviceWorkerId` schema parameter (not applicable)
- `pageId` routing via `cliArgs` (simplify to single page)

**What to keep**:
- Tool name, description, schema (`function`, `args`)
- Response formatting pattern

### Step 2: Implement `take_screenshot`

**File**: `src/tools/screenshot.ts`

The proxy supports screenshots via the `capture-screenshot` message to the app, which returns base64 JPEG data. The proxy also supports `Page.startScreencast`/`Page.stopScreencast` for streaming frames.

**Implementation approach — Use `Page.startScreencast` / `Page.stopScreencast`:**

The proxy already supports the screencast mechanism for capturing frames. Use a single-frame capture pattern:

1. Send `Page.startScreencast` with `{format: 'jpeg', maxWidth: 0, quality: 80}` (maxWidth 0 = full resolution)
2. Register a one-shot listener for `Page.screencastFrame` event
3. The frame's `data` field contains base64 JPEG image data
4. Send `Page.screencastFrameAck` with the session ID from the frame event
5. Send `Page.stopScreencast` to stop future frames
6. Return the base64 data as an image content block

```typescript
// Key implementation
const cdpClient = context.cdpClient;

// Start screencast for a single frame capture
const framePromise = new Promise<string>((resolve) => {
  const listener = (params: Record<string, unknown>) => {
    cdpClient.off('Page.screencastFrame', listener);
    // Ack the frame
    cdpClient.send('Page.screencastFrameAck', { sessionId: params.sessionId });
    resolve(params.data as string);
  };
  cdpClient.on('Page.screencastFrame', listener);
});

await cdpClient.send('Page.startScreencast', {
  format: 'jpeg',
  quality: request.params.quality ?? 80,
  maxWidth: 0,
  maxHeight: 0,
});

const base64Data = await framePromise;
await cdpClient.send('Page.stopScreencast', {});
```

**Limitations:**
- Only JPEG format is supported by the proxy (PNG/WebP would require conversion)
- `uid` parameter (element screenshot): not supported — return a message saying element-level screenshots aren't available
- `fullPage` parameter: not applicable to native apps — the captured frame IS the full screen
- If `filePath` is provided, save the decoded base64 data to disk using `context.saveFile()`

**What to remove**:
- `page.screenshot()` Puppeteer call
- `ElementHandle` screenshot support
- `fullPage` option handling

**What to keep**:
- Tool name, description
- `format` schema (accept but note JPEG-only)
- `quality` schema
- `filePath` schema (save-to-disk support)
- Response text formatting

### Dependency note for `evaluate_script` with `args`

The `args` parameter accepts UIDs that reference elements from a previous `take_snapshot` call. However, `take_snapshot` is not implemented until Plan 2C. For Plan 2B:

1. Implement `evaluate_script` **without args support** first (no-args `Runtime.evaluate` path)
2. Add the `args` path using `Runtime.callFunctionOn`, but note that UID resolution depends on `take_snapshot` storing a UID → `backendNodeId` mapping (Plan 2C)
3. If `args` are provided before a snapshot has been taken, return a clear error: "Element UIDs require a prior take_snapshot call. Take a snapshot first, then use the returned UIDs."

### Step 3: Implement `list_pages`

**File**: `src/tools/pages.ts`

The proxy's HTTP endpoint `GET /json/list` returns the list of inspectable targets.

**Implementation approach**:

1. Make HTTP GET request to `http://<proxyHost>:<proxyPort>/json/list`
2. Parse JSON response — array of target objects:
   ```json
   [{
     "id": "falcon-target-1",
     "type": "page",
     "title": "Falcon",
     "url": "file://",
     "webSocketDebuggerUrl": "ws://localhost:6001/__cdp"
   }]
   ```
3. Map to MCP page format: `{ pageId: index, title, url }`
4. Use `response.setIncludePages(true)` or format as text

**Key details**:
- The proxy URL is known from the CDPClient's connection config
- Currently there's typically one target (one app), but the infrastructure should support multiple
- Remove Puppeteer's `browser.pages()` pattern

### Step 4: Implement `select_page`

**File**: `src/tools/pages.ts`

When multiple targets exist (e.g., multiple simulators), allow switching the CDP WebSocket connection.

**Implementation approach**:

1. Look up target by `pageId` from the list returned by `list_pages`
2. Disconnect current WebSocket
3. Connect to the new target's `webSocketDebuggerUrl`
4. Re-subscribe to events (Runtime.consoleAPICalled, etc.)
5. Update `context.selectPage()` to track the new target

**Key details**:
- For single-target setups (common case), this is a no-op confirming the current page
- Remove `page.pptrPage.bringToFront()` (no browser tabs)
- `bringToFront` parameter: no-op but keep in schema for compatibility

### Step 5: Update `src/tools/tools.ts` to import implemented tools

Add imports for the newly implemented tools:

```typescript
// Add to src/tools/tools.ts
import * as scriptTools from './script.js';
import * as screenshotTools from './screenshot.js';
// pages.ts is already imported by Plan 2A (for stubs like close_page, new_page, etc.)
```

Add `...Object.values(scriptTools)` and `...Object.values(screenshotTools)` to the `rawTools` array.

## Files Modified

| File | Action |
|------|--------|
| `src/tools/script.ts` | Rewrite: Puppeteer evaluate -> CDP Runtime.evaluate/callFunctionOn |
| `src/tools/screenshot.ts` | Rewrite: Puppeteer screenshot -> CDP screencast capture |
| `src/tools/pages.ts` | Rewrite list_pages/select_page: Puppeteer -> HTTP /json/list + WS switching |
| `src/tools/tools.ts` | Add imports for script.ts and screenshot.ts; register in rawTools array |
| `src/CDPClient.ts` (or equivalent) | May need: method to get proxy HTTP URL, reconnect to different target |

## Testing & Verification

### Automated Tests

1. **Build test**: `cd tools/devtools-mcp && npm run build` succeeds.

2. **evaluate_script unit test**:
   - Mock CDPClient to return `{ result: { type: 'number', value: 2 } }` for `Runtime.evaluate`
   - Call `evaluate_script` with `function: '() => 1 + 1'`
   - Assert response contains `"2"`
   - Assert `Runtime.evaluate` was called with correct expression

3. **evaluate_script with args test**:
   - Mock CDPClient for `Runtime.callFunctionOn`
   - Call with `function: '(el) => el.tagName'`, `args: ['uid-1']`
   - Assert `Runtime.callFunctionOn` was called with `arguments` containing an objectId

4. **take_screenshot unit test**:
   - Mock CDPClient to emit `Page.screencastFrame` with fake base64 data
   - Call `take_screenshot`
   - Assert response includes image attachment with correct mime type
   - Assert screencast was started and stopped

5. **list_pages unit test**:
   - Mock HTTP fetch to `/json/list` returning a target array
   - Call `list_pages`
   - Assert page list is formatted correctly

6. **select_page unit test**:
   - Mock reconnection logic
   - Call `select_page` with `pageId: 0`
   - Assert no error for valid page ID
   - Assert error for invalid page ID

### Manual Tests

With a running Falcon app and the MCP server connected:

1. **evaluate_script**:
   ```
   Call: evaluate_script({ function: '() => 1 + 1' })
   Expected: "Script ran on page and returned:\n```json\n2\n```"
   ```

2. **evaluate_script with DOM**:
   ```
   Call: evaluate_script({ function: '() => typeof globalThis' })
   Expected: returns "object" (JSC global)
   ```

3. **evaluate_script error handling**:
   ```
   Call: evaluate_script({ function: '() => { throw new Error("test") }' })
   Expected: error message returned, no crash
   ```

4. **take_screenshot**:
   ```
   Call: take_screenshot({})
   Expected: base64 image data returned, viewable as JPEG
   ```

5. **take_screenshot with filePath**:
   ```
   Call: take_screenshot({ filePath: '/tmp/falcon-test.jpg' })
   Expected: file saved, response says "Saved screenshot to /tmp/falcon-test.jpg"
   ```

6. **list_pages**:
   ```
   Call: list_pages({})
   Expected: returns at least 1 page with title "Falcon" and url
   ```

7. **select_page**:
   ```
   Call: select_page({ pageId: 0 })
   Expected: success, page selected
   ```

### Regression Checks

- Performance tracing (Plan 1) still works
- Stubbed tools (Plan 2A) still return "not supported" messages
- Tool schemas match upstream chrome-devtools-mcp (no breaking MCP protocol changes)

### Acceptance Criteria

- [ ] `evaluate_script` executes JS in the app's JSC runtime and returns results
- [ ] `evaluate_script` handles errors gracefully (no crash on exceptions)
- [ ] `evaluate_script` with `args` (element UIDs) works or returns clear error if UIDs aren't resolvable
- [ ] `take_screenshot` returns a valid image (JPEG base64)
- [ ] `take_screenshot` with `filePath` saves to disk
- [ ] `take_screenshot` with unsupported params (`uid`, `fullPage`) returns helpful messages
- [ ] `list_pages` returns the connected target(s)
- [ ] `select_page` works for valid page IDs
- [ ] `select_page` errors cleanly for invalid page IDs
- [ ] `npm run build` succeeds
- [ ] No Puppeteer imports remain in modified files

## Dependencies

- **Depends on**: Plan 1 (CDPClient, WebSocket connection, proxy running)
- **Independent of**: Plan 2A (stubs) and Plan 2C (partial tools) — can be done in parallel
- **Blocks**: Plan 2D (verification requires working tools)
