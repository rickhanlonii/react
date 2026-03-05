# Plan 2C: Implement Partially-Supported Tools

## Context

After Plan 1 (fork + connection + tracing), the inspector proxy supports several CDP domains partially. This plan implements tools that work with limitations — some operations succeed, others return "not supported" for specific modes.

**Prerequisites**: Plan 1 complete. CDPClient connects to the proxy. Ideally Plan 2B is also complete (evaluate_script, take_screenshot, list_pages, select_page) since some partial tools build on similar CDP patterns.

## Goal

- Implement `wait_for` via polling `Runtime.evaluate`
- Implement `navigate_page` with reload support, stubs for url/back/forward
- Implement `take_snapshot` via CDP `DOM.getDocument`
- Implement `list_console_messages` / `get_console_message` via `Runtime.consoleAPICalled` events
- Implement `click` / `click_at` via CDP `Input.dispatchMouseEvent`
- Each tool documents its limitations clearly

## Steps

### Important: Files Already Exist

Plan 1D keeps all tool files on disk. Each step below **edits the existing file** in place — replacing Puppeteer imports and handler implementations with CDP-based or polling-based implementations.

### Step 1: Implement `wait_for`

**File**: `src/tools/snapshot.ts`

**Implementation approach — Use `DOM.getDocument` tree search:**

The proxy forwards `DOM.getDocument` to the app, which returns the full shadow tree as a CDP DOM node tree. This is reliable and doesn't require injecting code into the JSC runtime.

**Algorithm:**
1. Poll every 500ms by sending `DOM.getDocument` with `{depth: -1}`
2. Walk the returned tree recursively, collecting all text node values (`nodeType: 3` → `nodeValue`)
3. Concatenate all text content
4. Check if any of the target texts appear in the concatenated string
5. Respect `timeout` parameter (default 30000ms)
6. On match: return success with the matched text, then trigger a snapshot
7. On timeout: throw error

```typescript
async function waitForText(
  cdpClient: CDPClient,
  texts: string[],
  timeout: number = 30000,
): Promise<string> {
  const start = Date.now();
  while (Date.now() - start < timeout) {
    const result = await cdpClient.send('DOM.getDocument', { depth: -1 }) as { root: DOMNode };
    const allText = extractTextContent(result.root);
    for (const text of texts) {
      if (allText.includes(text)) {
        return text;
      }
    }
    await new Promise(r => setTimeout(r, 500));
  }
  throw new Error(`Timed out waiting for text: ${texts.join(', ')}`);
}

function extractTextContent(node: DOMNode): string {
  if (node.nodeType === 3) return node.nodeValue || '';
  let text = '';
  for (const child of node.children || []) {
    text += extractTextContent(child);
  }
  return text;
}
```

**Why DOM.getDocument over Runtime.evaluate:**
- The native app doesn't have `document.body.textContent` — there's no real DOM
- `DOM.getDocument` is already proven to work (it's forwarded to the app's shadow tree)
- No need to inject bridge functions or modify the app
- The proxy handles the full round-trip (forwards request to app, returns response)

**What to remove**:
- `context.waitForTextOnPage()` call
- `page.pptrPage` reference

**What to keep**:
- Tool name, description, schema (`text`, `timeout`)
- `response.includeSnapshot()` on success

### Step 2: Implement `navigate_page`

**File**: `src/tools/pages.ts`

The proxy supports `Page.reload` and `Page.navigate`. URL navigation triggers a reload. Back/forward are not applicable.

**Implementation approach**:

```ts
handler: async (request, response) => {
  switch (request.params.type) {
    case 'reload': {
      await cdpClient.send('Page.reload', {});
      response.appendResponseLine('Successfully reloaded the page.');
      break;
    }
    case 'url': {
      // The proxy treats any navigate as a reload
      response.appendResponseLine(
        'URL navigation is not supported for native apps. Use reload to refresh the current view.'
      );
      break;
    }
    case 'back':
    case 'forward': {
      response.appendResponseLine(
        `Navigation ${request.params.type} is not supported. Native apps do not have browser-style navigation history.`
      );
      break;
    }
  }
}
```

**What to remove**:
- `page.pptrPage.goto()`, `page.pptrPage.goBack()`, `page.pptrPage.goForward()`
- `page.pptrPage.reload()`
- `page.pptrPage.evaluateOnNewDocument()` / `removeScriptToEvaluateOnNewDocument()`
- `handleBeforeUnload` logic, dialog handler
- `initScript` parameter handling

**What to keep**:
- Tool name, description
- `type` schema (url, back, forward, reload)
- `ignoreCache` schema (pass to Page.reload if supported)

### Step 3: Implement `take_snapshot`

**File**: `src/tools/snapshot.ts`

The proxy forwards `DOM.getDocument` to the app, which returns the shadow tree structure as a CDP DOM node tree.

**Implementation approach**:

1. Send `DOM.getDocument` via CDPClient with `depth: -1` (full tree)
2. The app responds with a DOM node tree (nodeType, nodeName, children, attributes, etc.)
3. Walk the tree and format as a text snapshot similar to chrome-devtools-mcp's accessibility tree format:
   ```
   - div [uid="1"]
     - span "Hello World" [uid="2"]
     - button "Click me" [uid="3"]
       - span "Click me" [uid="4"]
   ```
4. Assign UIDs to each node (use `backendNodeId` from the CDP response)
5. Store UID -> backendNodeId mapping for use by other tools (click, evaluate_script with args)

**Actual `DOM.getDocument` response format:**

The app's Swift code (`Bindings+DevTools.swift`) serializes the shadow tree into standard CDP DOM.Node format. The response looks like:

```json
{
  "root": {
    "nodeId": 104, "backendNodeId": 104,
    "nodeType": 9, "nodeName": "#document", "localName": "", "nodeValue": "",
    "childNodeCount": 1,
    "children": [{
      "nodeId": 103, "backendNodeId": 103,
      "nodeType": 1, "nodeName": "HTML", "localName": "html", "nodeValue": "",
      "childNodeCount": 2, "attributes": [],
      "children": [
        {
          "nodeId": 102, "backendNodeId": 102,
          "nodeType": 1, "nodeName": "HEAD", "localName": "head", "nodeValue": "",
          "childNodeCount": 0, "children": [], "attributes": []
        },
        {
          "nodeId": 101, "backendNodeId": 101,
          "nodeType": 1, "nodeName": "BODY", "localName": "body", "nodeValue": "",
          "childNodeCount": 3, "attributes": [],
          "children": [
            {
              "nodeId": 5, "backendNodeId": 5,
              "nodeType": 1, "nodeName": "DIV", "localName": "div", "nodeValue": "",
              "attributes": ["style", "display: flex; flex-direction: column"],
              "childNodeCount": 2,
              "children": [
                {
                  "nodeId": 6, "backendNodeId": 6,
                  "nodeType": 1, "nodeName": "BUTTON", "localName": "button",
                  "nodeValue": "",
                  "attributes": ["id", "counter-increment", "onClick", "true"],
                  "childNodeCount": 1,
                  "children": [{
                    "nodeId": 7, "backendNodeId": 7,
                    "nodeType": 3, "nodeName": "#text", "localName": "",
                    "nodeValue": "+",
                    "childNodeCount": 0, "children": []
                  }]
                },
                {
                  "nodeId": 8, "backendNodeId": 8,
                  "nodeType": 3, "nodeName": "#text", "localName": "",
                  "nodeValue": "Hello World",
                  "childNodeCount": 0, "children": []
                }
              ]
            }
          ]
        }
      ]
    }]
  }
}
```

**Key details for the implementing agent:**
- `nodeType: 1` = element node, `nodeType: 3` = text node, `nodeType: 9` = document node
- `nodeId` and `backendNodeId` are the same value (assigned by Swift's `nextInspectorNodeId()`)
- `nodeName` for elements is UPPERCASED (e.g., "DIV", "BUTTON", "SPAN")
- `attributes` is a **flat string array** alternating key/value pairs: `["id", "counter-increment", "style", "display: flex", "onClick", "true"]`
- Event handler props (onClick, etc.) are serialized as `"true"` (the function reference is detected and replaced)
- `#suspense` nodes are **flattened** — their children are promoted to the parent level (so Suspense boundaries are invisible in the tree)
- Text nodes have `nodeValue` with the text content; element nodes have `nodeValue: ""`
- The tree always has `#document` → `HTML` → `[HEAD, BODY]` wrapper nodes, with the actual app content under BODY

**Tree formatting for MCP output:**

Walk the tree and format as a text snapshot. Use `nodeId` as the UID (it equals `backendNodeId`). Store a `Map<string, number>` mapping UID strings to `backendNodeId` for use by `click` and `evaluate_script`.

```
- document [uid="104"]
  - html [uid="103"]
    - head [uid="102"]
    - body [uid="101"]
      - div [uid="5"] style="display: flex; flex-direction: column"
        - button [uid="6"] id="counter-increment"
          - "+" [uid="7"]
        - "Hello World" [uid="8"]
```

- If `verbose` is true, include all attributes and box model info

**What to remove**:
- `response.includeSnapshot()` (we generate the snapshot ourselves)
- Any Puppeteer accessibility tree logic

**What to keep**:
- Tool name, description, schema (`verbose`, `filePath`)
- Text output format (lines of text)

### Step 4: Implement Console Message Collection

**Files**: `src/tools/console.ts` + connection setup

The proxy forwards `Runtime.consoleAPICalled` events from JSC.

**Implementation approach**:

1. **On CDP connect** (in the connection/context setup, not in console.ts itself):
   - Subscribe to `Runtime.consoleAPICalled` events
   - Store messages in an array on the context/page object:
     ```ts
     interface StoredConsoleMessage {
       msgid: number;
       type: string; // 'log', 'warn', 'error', 'info', 'debug'
       text: string;
       timestamp: number;
       args: Array<{ type: string; value?: any; description?: string }>;
     }
     ```
   - Assign auto-incrementing `msgid` to each message

2. **`list_console_messages`**:
   - Return the stored messages array
   - Support pagination (`pageSize`, `pageIdx`)
   - Support type filtering (`types` parameter)
   - Format as text:
     ```
     Console messages (3 total):
     [0] log: Hello from Falcon
     [1] warn: This is a warning
     [2] error: Something went wrong
     ```
   - `includePreservedMessages`: not applicable (no navigation in native apps), always return all messages since connection

3. **`get_console_message`**:
   - Look up by `msgid` in the stored array
   - Return full message details including args
   - Throw if msgid not found

**What to remove**:
- `response.setIncludeConsoleData()` / `response.attachConsoleMessage()` (replace with direct text formatting)
- PageCollector dependency

**What to keep**:
- Tool names, descriptions, schemas
- Pagination parameters

### Step 5: Implement `click` and `click_at`

**File**: `src/tools/input.ts`

The proxy's Input domain handles `dispatchMouseEvent` with `type: 'mousePressed'`, converting device pixels to logical points and dispatching a touch event to the app.

**Implementation approach for `click`**:

1. Resolve the UID to coordinates:
   - Use `DOM.getBoxModel` via CDP to get the element's bounding box
   - Calculate center point: `x = (box.left + box.right) / 2`, `y = (box.top + box.bottom) / 2`
   - These are in logical points; multiply by device scale for device pixels (the proxy divides back)
2. Send `Input.dispatchMouseEvent` with `type: 'mousePressed'`, `x`, `y`
3. The proxy converts to logical points and sends `dispatch-touch` to the app

```ts
// Get element box model
const { model } = await cdpClient.send('DOM.getBoxModel', { backendNodeId });
const content = model.content; // [x1,y1, x2,y1, x2,y2, x1,y2]
const centerX = (content[0] + content[2]) / 2;
const centerY = (content[1] + content[5]) / 2;

// Dispatch click (coordinates in device pixels for the proxy)
await cdpClient.send('Input.dispatchMouseEvent', {
  type: 'mousePressed',
  x: centerX,
  y: centerY,
  button: 'left',
  clickCount: request.params.dblClick ? 2 : 1,
});
```

**Implementation approach for `click_at`**:

Simpler — coordinates are provided directly:
```ts
await cdpClient.send('Input.dispatchMouseEvent', {
  type: 'mousePressed',
  x: request.params.x,
  y: request.params.y,
  button: 'left',
  clickCount: request.params.dblClick ? 2 : 1,
});
```

**Limitations**:
- `dblClick`: The proxy only handles `mousePressed`, so double-click may not work as expected. Send two mousePressed events.
- `includeSnapshot`: After click, optionally take a new snapshot to show updated state.
- No locator-based waiting (Puppeteer waits for element to be interactive). Click dispatches immediately.

**What to remove**:
- `page.getElementByUid()` Puppeteer element handle
- `handle.asLocator().click()` Puppeteer locator
- `context.waitForEventsAfterAction()` wrapper
- `handle.dispose()` cleanup

**What to keep**:
- Tool names, descriptions, schemas (`uid`, `dblClick`, `includeSnapshot`, `x`, `y`)
- Response text ("Successfully clicked on the element")

### Step 6: Update `src/tools/tools.ts` to import partial tools

Add imports for the newly implemented tools:

```typescript
// Add to src/tools/tools.ts
import * as snapshotTools from './snapshot.js';
import * as consoleTools from './console.js';
// input.ts and pages.ts are already imported by Plan 2A
```

Add `...Object.values(snapshotTools)` and `...Object.values(consoleTools)` to the `rawTools` array.

## Files Modified

| File | Action |
|------|--------|
| `src/tools/snapshot.ts` | Rewrite: `take_snapshot` (DOM.getDocument tree), `wait_for` (polling DOM.getDocument) |
| `src/tools/pages.ts` | Rewrite: `navigate_page` (reload via CDP, stub back/forward/url) |
| `src/tools/console.ts` | Rewrite: both tools to use stored console messages from CDP events |
| `src/tools/input.ts` | Rewrite: `click` (DOM.getBoxModel + Input.dispatchMouseEvent), `click_at` (direct coords) |
| `src/tools/tools.ts` | Update: import snapshot and console tools, add to rawTools array |
| Connection/context setup | Add: Runtime.consoleAPICalled event subscription and message storage |

## Testing & Verification

### Automated Tests

1. **Build test**: `cd tools/devtools-mcp && npm run build` succeeds.

2. **wait_for test**:
   - Mock CDPClient: first `Runtime.evaluate` returns `false`, second returns `true`
   - Call `wait_for({ text: ['Hello'], timeout: 5000 })`
   - Assert polling occurred twice
   - Assert success response

3. **wait_for timeout test**:
   - Mock CDPClient: `Runtime.evaluate` always returns `false`
   - Call `wait_for({ text: ['Never'], timeout: 1000 })`
   - Assert timeout error thrown

4. **navigate_page reload test**:
   - Mock CDPClient `Page.reload`
   - Call `navigate_page({ type: 'reload' })`
   - Assert `Page.reload` was sent
   - Assert response says "Successfully reloaded"

5. **navigate_page back test**:
   - Call `navigate_page({ type: 'back' })`
   - Assert response says "not supported"
   - Assert no CDP call made

6. **take_snapshot test**:
   - Mock CDPClient `DOM.getDocument` returning a small tree:
     ```json
     { "root": { "nodeId": 1, "nodeName": "div", "children": [
       { "nodeId": 2, "nodeName": "span", "nodeValue": "Hello" }
     ]}}
     ```
   - Call `take_snapshot({})`
   - Assert output contains "div" and "Hello"
   - Assert UIDs are assigned

7. **console messages test**:
   - Simulate `Runtime.consoleAPICalled` events
   - Call `list_console_messages({})`
   - Assert messages returned in order
   - Call `get_console_message({ msgid: 0 })`
   - Assert specific message returned

8. **click test**:
   - Mock `DOM.getBoxModel` returning coordinates
   - Mock `Input.dispatchMouseEvent`
   - Call `click({ uid: '1' })`
   - Assert `dispatchMouseEvent` called with computed center coordinates

9. **click_at test**:
   - Mock `Input.dispatchMouseEvent`
   - Call `click_at({ x: 100, y: 200 })`
   - Assert `dispatchMouseEvent` called with `x: 100, y: 200`

### Manual Tests

With a running Falcon app:

1. **wait_for** — app shows "Hello" text:
   ```
   Call: wait_for({ text: ['Hello'] })
   Expected: resolves quickly, returns snapshot
   ```

2. **wait_for timeout** — text doesn't exist:
   ```
   Call: wait_for({ text: ['NonexistentText'], timeout: 3000 })
   Expected: times out after 3s with error
   ```

3. **navigate_page reload**:
   ```
   Call: navigate_page({ type: 'reload' })
   Expected: app reloads, response says "Successfully reloaded"
   ```

4. **navigate_page back**:
   ```
   Call: navigate_page({ type: 'back' })
   Expected: "not supported" message, no crash
   ```

5. **take_snapshot**:
   ```
   Call: take_snapshot({})
   Expected: text tree showing the app's view hierarchy (div, span, button, etc.)
   ```

6. **take_snapshot verbose**:
   ```
   Call: take_snapshot({ verbose: true })
   Expected: more detailed tree with attributes, dimensions
   ```

7. **list_console_messages** — after app logs something:
   ```
   Call: list_console_messages({})
   Expected: list of console messages from the app
   ```

8. **list_console_messages with filter**:
   ```
   Call: list_console_messages({ types: ['error'] })
   Expected: only error messages
   ```

9. **get_console_message**:
   ```
   Call: get_console_message({ msgid: 0 })
   Expected: first console message with full details
   ```

10. **click with snapshot UI** — find a button UID from take_snapshot, then click it:
    ```
    Call: click({ uid: '<button-uid>' })
    Expected: "Successfully clicked on the element", button action triggered in app
    ```

11. **click_at** — tap at known coordinates:
    ```
    Call: click_at({ x: 200, y: 400 })
    Expected: "Successfully clicked at the coordinates", tap dispatched in app
    ```

12. **click invalid UID**:
    ```
    Call: click({ uid: 'nonexistent' })
    Expected: clear error message, no crash
    ```

### Regression Checks

- Performance tracing (Plan 1) still works
- Stubbed tools (Plan 2A) still return "not supported"
- WORKS tools from Plan 2B still work (evaluate_script, take_screenshot, list_pages, select_page)
- Console message collection doesn't interfere with other CDP event handling

### Acceptance Criteria

- [ ] `wait_for` polls for text and resolves when found
- [ ] `wait_for` respects timeout and throws on expiry
- [ ] `navigate_page` with `type: 'reload'` triggers app reload via CDP
- [ ] `navigate_page` with `type: 'url'` / `'back'` / `'forward'` returns clear "not supported" messages
- [ ] `take_snapshot` returns a formatted text tree of the app's view hierarchy
- [ ] `take_snapshot` assigns UIDs that can be used by `click`
- [ ] `take_snapshot` with `verbose: true` includes additional detail
- [ ] `list_console_messages` returns messages collected since connection
- [ ] `list_console_messages` supports pagination and type filtering
- [ ] `get_console_message` returns a specific message by ID
- [ ] `click` resolves UID to coordinates and dispatches a touch event
- [ ] `click_at` dispatches a touch at the given coordinates
- [ ] `click` with invalid UID returns a clear error
- [ ] `npm run build` succeeds
- [ ] No Puppeteer imports remain in modified files

## Dependencies

- **Depends on**: Plan 1 (CDPClient, WebSocket connection)
- **Ideally after**: Plan 2B (evaluate_script provides the foundation for wait_for's polling)
- **Independent of**: Plan 2A (stubs are in different tool handlers)
- **Blocks**: Plan 2D (verification requires partial tools)
