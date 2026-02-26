---
name: devtools
description: Open Chrome DevTools connected to the Falcon app's JSC runtime via the inspector proxy. Use when debugging JS execution, viewing console logs, profiling performance, or inspecting the app's runtime.
---

# DevTools

Opens Chrome DevTools in the MCP-controlled browser, connected to the Falcon app's JavaScriptCore runtime via the CDP inspector proxy.

## Prerequisites

The **dev server** must be running (it starts the inspector proxy on port 8976):
```bash
curl -s http://localhost:8976/json
```

If it's not running, start it:
```
Bash(command: "cd /Users/rickhanlonii/oss/falcon/example && npm run dev", run_in_background: true)
```
Wait 5 seconds, then re-check the endpoint.

## Connect

1. **Get the WebSocket debugger URL** from the inspector proxy:
   ```bash
   curl -s http://localhost:8976/json
   ```
   Extract the `id` field from the response (e.g. `falcon-477b2nad`).

2. **Navigate the MCP browser** to the DevTools inspector with the WebSocket connection:
   ```
   navigate_page(type: "url", url: "devtools://devtools/bundled/inspector.html?remoteFrontend=true&ws=127.0.0.1:8976/<id>")
   ```
   Replace `<id>` with the actual id from step 1.

3. **Verify** by taking a screenshot — you should see the Chrome DevTools UI connected to "Falcon JSC".

## Usage

Once connected, you can control the DevTools UI using Chrome DevTools MCP tools:

- **`take_screenshot`** — see the current DevTools state
- **`take_snapshot`** — get the accessibility tree of the DevTools UI for interaction
- **`click`** — click DevTools tabs (Console, Sources, Performance, Network, etc.)
- **`fill`** — type in the Console or filter inputs

### Common actions

| Action | How |
|--------|-----|
| View console logs | Click the "Console" tab |
| Switch to Performance | Click the "Performance" tab |
| Filter console | Click the filter input, use `fill` to type a filter |
| Run JS in console | Click the console prompt, use `fill` or `type_text` to enter code |

## Important

- Use the **plugin** MCP server (`mcp__plugin_chrome-devtools-mcp_chrome-devtools__*`), not the user-scoped one (which requires Chrome Beta).
- The `devtools://` URL **must** include `remoteFrontend=true` to load correctly.
- The inspector proxy WebSocket ID changes each time the dev server restarts — always fetch it fresh from `/json`.
- The DevTools page won't appear in `list_pages` results, but you can still take screenshots and interact with it via snapshots.
