# DevTools MCP Fork — Agent Team Execution Plan

## Overview

Orchestrate the execution of Plans 1A through 2D + Plan 3 using an agent team. The orchestrator (you) manages agents, verifies their work, and restarts them if they fail.

**Total plans**: 9 (1A, 1B, 1C, 1D, 2A, 2B, 2C, 2D, 3)
**Estimated context usage**: High — use compaction strategy below.

---

## Pre-requisites

Before starting, the user must:
1. Have the Falcon dev server running (`cd example && npm run dev`)
2. Have the Falcon app running in the simulator
3. Have `~/oss/chrome-devtools-mcp` available (source to fork from)

---

## Execution Order & Parallelism

```
Phase 1 (sequential):  1A → [USER: npm install] → 1B → 1C → 1D
Phase 2 (parallel):    2A + 2B (run simultaneously)
Phase 3 (sequential):  2C (after 2B)
Phase 4 (sequential):  2D (after 2A + 2B + 2C)
Phase 5 (verification): 3
```

**Why this order:**
- 1A-1D are sequential — each builds on the previous
- 2A (stubs) and 2B (WORKS tools) are independent — they edit different files
- 2C depends on 2B (evaluate_script foundation for wait_for pattern, snapshot UIDs for click)
- 2D depends on all of 2A/2B/2C (final cleanup + verification)
- Plan 3 is the smoke test after everything is complete

---

## Compaction Strategy

This is a long-running task. Context will compress multiple times. To survive compaction:

### What to keep in your head (re-derive after compaction)
- **Current phase** — which plan you're on and what's left
- **Verification results** — which plans passed/failed and what needs retry
- **The task list** — use TaskList to recover state

### What to store externally
After completing each plan, update the task list with:
- Status: completed/failed
- Key verification results (build pass/fail, specific errors)

### How to recover after compaction
1. Call `TaskList` to see current state
2. Read `docs/plans/devtools-mcp-execution-progress.md` (you maintain this file)
3. The progress file tells you exactly where you are and what to do next

### Progress file format
Maintain `docs/plans/devtools-mcp-execution-progress.md` with:
```markdown
# Execution Progress

## Completed
- [x] Plan 1A — scaffolding done, npm install done by user
- [x] Plan 1B — CDP client created, build passes

## Current
- Plan 1C — agent running, started at <time>

## Remaining
- Plan 1D, 2A, 2B, 2C, 2D, 3

## Issues
- <any issues encountered and how they were resolved>
```

**Update this file after every plan completion or failure.**

---

## Phase 1: Sequential Foundation (Plans 1A → 1D)

### Plan 1A: Project Scaffolding

**Agent config:**
```
subagent_type: general-purpose
mode: bypassPermissions
description: "Execute Plan 1A scaffolding"
```

**Prompt for agent:**
```
Execute the plan in docs/plans/devtools-mcp-plan1a-project-scaffolding.md.

Do steps 1-7 and 9-10 (skip step 8 — npm install — the user will do that).

Key steps:
1. Copy ~/oss/chrome-devtools-mcp/src/ → tools/devtools-mcp/src/
2. Create package.json (no Puppeteer deps)
3. Create tsconfig.json
4. Delete unnecessary files (16+ files/dirs from the Delete table)
5. Keep formatter and utility files
6. Update version.ts to '0.1.0'
7. Add .gitignore entries
8. Run npx tsc --noEmit to verify (errors are OK at this stage)

Do NOT run npm install. Do NOT stop to ask questions.
Read the plan file for full details.
```

**Verification (run yourself, not via agent):**
```bash
# Check directory exists
ls tools/devtools-mcp/package.json
# Check no puppeteer in package.json
! grep -q puppeteer tools/devtools-mcp/package.json && echo "PASS" || echo "FAIL"
# Check deleted files are gone
test ! -f tools/devtools-mcp/src/browser.ts && echo "PASS" || echo "FAIL"
test ! -d tools/devtools-mcp/src/telemetry && echo "PASS" || echo "FAIL"
test ! -d tools/devtools-mcp/src/daemon && echo "PASS" || echo "FAIL"
# Check version
grep -q "0.1.0" tools/devtools-mcp/src/version.ts && echo "PASS" || echo "FAIL"
```

**If verification fails:** Re-read the plan, identify what was missed, and send the agent a follow-up message with specific fix instructions. Do NOT re-run the entire plan.

**After verification passes:** Tell the user to run:
```
cd tools/devtools-mcp && npm install
```
Wait for confirmation before proceeding.

---

### Plan 1B: CDP Client & Context

**Agent config:**
```
subagent_type: general-purpose
mode: bypassPermissions
description: "Execute Plan 1B CDP client"
```

**Prompt for agent:**
```
Execute the plan in docs/plans/devtools-mcp-plan1b-cdp-client-and-context.md.

Key deliverables:
1. Create src/cdp-client.ts (~150 lines) — WebSocket CDP client
2. Rewrite src/McpContext.ts — strip Puppeteer, use CDPClient
3. Rewrite src/McpPage.ts — lightweight CDP-backed shim
4. Rewrite src/tools/ToolDefinition.ts — strip Puppeteer types, set final interfaces
5. Rewrite src/third_party/index.ts — remove Puppeteer/Lighthouse exports
6. Rewrite src/types.ts — strip Puppeteer types

The ToolDefinition.ts interfaces are FINAL after this plan. Plan 2D will NOT re-modify them.

Do NOT run npm install. node_modules/ is already populated.
Do NOT stop to ask questions. Read the plan file for full details.
```

**Verification:**
```bash
cd tools/devtools-mcp && npx tsc --noEmit 2>&1 | head -20
# Some errors may remain from unrewritten files (server.ts, tool files)
# but cdp-client.ts, McpContext.ts, McpPage.ts, ToolDefinition.ts should NOT have errors

# Check cdp-client.ts exists and has WebSocket logic
test -f tools/devtools-mcp/src/cdp-client.ts && echo "PASS" || echo "FAIL"
grep -q "WebSocket" tools/devtools-mcp/src/cdp-client.ts && echo "PASS" || echo "FAIL"

# Check no puppeteer in ToolDefinition.ts
! grep -qi "puppeteer\|pptrPage\|ElementHandle\|Dialog" tools/devtools-mcp/src/tools/ToolDefinition.ts && echo "PASS" || echo "FAIL"
```

---

### Plan 1C: Performance Tracing

**Agent config:**
```
subagent_type: general-purpose
mode: bypassPermissions
description: "Execute Plan 1C perf tracing"
```

**Prompt for agent:**
```
Execute the plan in docs/plans/devtools-mcp-plan1c-performance-tracing.md.

Key deliverables:
1. Add parseTraceEvents() to src/trace-processing/parse.ts
2. Rewrite src/tools/performance.ts — CDP Tracing.start/end instead of Puppeteer
3. Handle chunked trace data flow: Tracing.dataCollected events → accumulate → Tracing.tracingComplete

Do NOT run npm install. Do NOT stop to ask questions.
Read the plan file for full details.
```

**Verification:**
```bash
# Check performance.ts has CDP tracing
grep -q "Tracing.start\|Tracing.end\|Tracing.dataCollected" tools/devtools-mcp/src/tools/performance.ts && echo "PASS" || echo "FAIL"
# Check parseTraceEvents exists
grep -q "parseTraceEvents" tools/devtools-mcp/src/trace-processing/parse.ts && echo "PASS" || echo "FAIL"
```

---

### Plan 1D: Server & CLI Integration

**Agent config:**
```
subagent_type: general-purpose
mode: bypassPermissions
description: "Execute Plan 1D server CLI"
```

**Prompt for agent:**
```
Execute the plan in docs/plans/devtools-mcp-plan1d-server-cli-integration.md.

Key deliverables:
1. Rewrite src/server.ts — CDPClient creation, no Puppeteer
2. Simplify src/cli.ts — only --proxy-url and --log-file
3. Create src/index.ts entry point
4. Update tools.ts to ONLY import performance.ts (other tool files stay on disk but are NOT imported)
5. Add .mcp.json entry for falcon-devtools
6. Keep all 12 tool files on disk (do NOT delete them)
7. npm run build must succeed

IMPORTANT: Do NOT delete tool files (console.ts, input.ts, etc.). They must stay on disk for Plan 2.
Do NOT run npm install. Do NOT stop to ask questions.
Read the plan file for full details.
```

**Verification:**
```bash
cd tools/devtools-mcp && npm run build 2>&1 | tail -5
# Must exit 0

# Check tool files still exist
test -f tools/devtools-mcp/src/tools/console.ts && echo "PASS" || echo "FAIL"
test -f tools/devtools-mcp/src/tools/input.ts && echo "PASS" || echo "FAIL"
test -f tools/devtools-mcp/src/tools/snapshot.ts && echo "PASS" || echo "FAIL"

# Check .mcp.json has entry
grep -q "falcon-devtools" .mcp.json && echo "PASS" || echo "FAIL"

# Check build output exists
test -f tools/devtools-mcp/build/src/index.js && echo "PASS" || echo "FAIL"
```

**After Phase 1 passes:** Update progress file. Proceed to Phase 2 immediately.

---

## Phase 2: Parallel Tool Implementation (Plans 2A + 2B)

Launch BOTH agents simultaneously. They edit different files and are independent.

### Plan 2A: Stub Infrastructure (Agent 1)

**Agent config:**
```
subagent_type: general-purpose
mode: bypassPermissions
description: "Execute Plan 2A stubs"
run_in_background: true
```

**Prompt for agent:**
```
Execute the plan in docs/plans/devtools-mcp-plan2a-stub-infrastructure.md.

Key deliverables:
1. Create notImplemented() helper utility
2. Edit ALL 9 tool files to replace Puppeteer handlers with stubs:
   - input.ts (7 stubs: hover, fill, type_text, drag, fill_form, upload_file, press_key)
   - pages.ts (5 stubs: close_page, new_page, resize_page, handle_dialog, get_tab_id)
   - network.ts (2 stubs)
   - emulation.ts (1 stub)
   - memory.ts (1 stub)
   - lighthouse.ts (1 stub)
   - screencast.ts (2 stubs)
   - extensions.ts (5 stubs)
3. Update tools.ts to import ALL 9 stubbed modules
4. npm run build must succeed

The tool files ALREADY EXIST on disk. Edit them in place — do not create new files.
Remove all Puppeteer imports from each file.
Each stub handler should call response.appendResponseLine(notImplemented('tool_name')).

Do NOT run npm install. Do NOT stop to ask questions.
Read the plan file for full details.
```

### Plan 2B: WORKS Tools (Agent 2)

**Agent config:**
```
subagent_type: general-purpose
mode: bypassPermissions
description: "Execute Plan 2B WORKS tools"
run_in_background: true
```

**Prompt for agent:**
```
Execute the plan in docs/plans/devtools-mcp-plan2b-works-tools.md.

Key deliverables:
1. Rewrite src/tools/script.ts — evaluate_script via CDP Runtime.evaluate
   - No-args path: Runtime.evaluate with expression
   - Args path: stub with error "UIDs require prior take_snapshot" (Plan 2C adds real support)
2. Rewrite src/tools/screenshot.ts — take_screenshot via Page.startScreencast/stopScreencast
   - Single-frame capture pattern (start → listen for frame → ack → stop)
   - JPEG only, filePath support via context.saveFile()
3. Implement list_pages in pages.ts — HTTP GET /json/list
4. Implement select_page in pages.ts — switch CDP target
5. Update tools.ts to import script.ts and screenshot.ts

IMPORTANT: pages.ts may also be edited by Plan 2A (for stubs). You are implementing list_pages and select_page. The stub tools (close_page, new_page, etc.) are handled by Plan 2A. If pages.ts has already been edited by Plan 2A when you get to it, preserve the stub handlers and add your implementations alongside them. If it hasn't been edited yet, implement your tools and leave the other handlers for Plan 2A.

The tool files ALREADY EXIST on disk. Edit them in place.
Do NOT run npm install. Do NOT stop to ask questions.
Read the plan file for full details.
```

**Verification for Phase 2 (after BOTH agents complete):**
```bash
cd tools/devtools-mcp && npm run build 2>&1 | tail -5
# Must exit 0

# Check stubs exist (Plan 2A)
grep -q "notImplemented" tools/devtools-mcp/src/tools/emulation.ts && echo "PASS: emulation stub" || echo "FAIL"
grep -q "notImplemented" tools/devtools-mcp/src/tools/network.ts && echo "PASS: network stub" || echo "FAIL"
grep -q "notImplemented" tools/devtools-mcp/src/tools/memory.ts && echo "PASS: memory stub" || echo "FAIL"

# Check WORKS tools (Plan 2B)
grep -q "Runtime.evaluate" tools/devtools-mcp/src/tools/script.ts && echo "PASS: evaluate_script" || echo "FAIL"
grep -q "startScreencast\|screencastFrame\|captureScreenshot" tools/devtools-mcp/src/tools/screenshot.ts && echo "PASS: screenshot" || echo "FAIL"
grep -q "json/list" tools/devtools-mcp/src/tools/pages.ts && echo "PASS: list_pages" || echo "FAIL"

# Check tools.ts imports
grep -q "scriptTools\|script" tools/devtools-mcp/src/tools/tools.ts && echo "PASS: script import" || echo "FAIL"
grep -q "screenshotTools\|screenshot" tools/devtools-mcp/src/tools/tools.ts && echo "PASS: screenshot import" || echo "FAIL"
```

**If pages.ts has conflicts** (both agents edited it): Merge manually — Plan 2A's stubs + Plan 2B's implementations should coexist in the same file. Check for duplicate function names or conflicting exports.

---

## Phase 3: Partial Tools (Plan 2C)

### Plan 2C: Partial Tools

**Agent config:**
```
subagent_type: general-purpose
mode: bypassPermissions
description: "Execute Plan 2C partial tools"
```

**Prompt for agent:**
```
Execute the plan in docs/plans/devtools-mcp-plan2c-partial-tools.md.

Key deliverables:
1. Rewrite src/tools/snapshot.ts:
   - take_snapshot: CDP DOM.getDocument with depth:-1, walk tree, format as text with UIDs
   - wait_for: poll DOM.getDocument tree for text content every 500ms, respect timeout
   - Store UID→backendNodeId mapping for click tool
2. Rewrite src/tools/console.ts:
   - Set up Runtime.consoleAPICalled event subscription on connect
   - list_console_messages: return stored messages with pagination
   - get_console_message: return by msgid
3. Add to src/tools/input.ts (alongside existing stubs from Plan 2A):
   - click: DOM.getBoxModel → Input.dispatchMouseEvent
   - click_at: direct Input.dispatchMouseEvent
4. Add to src/tools/pages.ts (alongside existing implementations):
   - navigate_page: Page.reload works, url/back/forward return "not supported"
5. Update tools.ts to import snapshot.ts and console.ts
6. npm run build must succeed

The DOM.getDocument response format is documented in the plan file — the tree has
nodeType 1 (element), 3 (text), 9 (document). Attributes are flat string arrays.
nodeName is UPPERCASED. #suspense nodes are flattened out.

The tool files ALREADY EXIST and may have been edited by Plans 2A/2B. Preserve existing
stub handlers when adding new implementations.

Do NOT run npm install. Do NOT stop to ask questions.
Read the plan file for full details.
```

**Verification:**
```bash
cd tools/devtools-mcp && npm run build 2>&1 | tail -5

# Check snapshot tools
grep -q "DOM.getDocument\|getDocument" tools/devtools-mcp/src/tools/snapshot.ts && echo "PASS: take_snapshot" || echo "FAIL"
grep -q "waitFor\|wait_for\|pollFor" tools/devtools-mcp/src/tools/snapshot.ts && echo "PASS: wait_for" || echo "FAIL"

# Check console tools
grep -q "consoleAPICalled\|consoleMessages" tools/devtools-mcp/src/tools/console.ts && echo "PASS: console" || echo "FAIL"

# Check click
grep -q "dispatchMouseEvent\|getBoxModel" tools/devtools-mcp/src/tools/input.ts && echo "PASS: click" || echo "FAIL"

# Check navigate
grep -q "Page.reload\|reload" tools/devtools-mcp/src/tools/pages.ts && echo "PASS: navigate" || echo "FAIL"

# Check tools.ts imports
grep -q "snapshotTools\|snapshot" tools/devtools-mcp/src/tools/tools.ts && echo "PASS: snapshot import" || echo "FAIL"
grep -q "consoleTools\|console" tools/devtools-mcp/src/tools/tools.ts && echo "PASS: console import" || echo "FAIL"
```

---

## Phase 4: Cleanup & Verification (Plan 2D)

### Plan 2D: Response Cleanup & Verification

**Agent config:**
```
subagent_type: general-purpose
mode: bypassPermissions
description: "Execute Plan 2D cleanup"
```

**Prompt for agent:**
```
Execute the plan in docs/plans/devtools-mcp-plan2d-response-cleanup-verification.md.

Key deliverables:
1. Extend McpResponse.ts — add real implementations for attachImage, setIncludePages,
   setIncludeConsoleData, includeSnapshot (these were stubs since Plan 1D)
2. Verify McpPage.ts has consoleMessages and snapshotNodes properties
3. Verify ToolDefinition.ts interfaces are complete (do NOT rewrite — just verify)
4. Verify Plan 1A file deletions are complete
5. Verify tools.ts imports all tool modules
6. Clean up any remaining dead imports
7. npm run build must succeed with zero errors

This is primarily cleanup and verification. Do NOT rewrite files that are already correct.
Only make changes where something is actually missing or broken.

Do NOT run npm install. Do NOT stop to ask questions.
Read the plan file for full details.
```

**Verification:**
```bash
cd tools/devtools-mcp && npm run build 2>&1 | tail -5
# MUST exit 0 with zero errors

# Check no puppeteer anywhere
! grep -rq "puppeteer\|from 'puppeteer" tools/devtools-mcp/src/ && echo "PASS: no puppeteer" || echo "FAIL"

# Count tool registrations (should find references to all tool names)
grep -c "name:" tools/devtools-mcp/src/tools/*.ts | tail -1
```

---

## Phase 5: Smoke Test (Plan 3)

Plan 3 is a verification plan, not a code-writing plan. Run it only if the Falcon app + dev server are running.

**Agent config:**
```
subagent_type: general-purpose
mode: bypassPermissions
description: "Execute Plan 3 smoke test"
```

**Prompt for agent:**
```
Execute the smoke test in docs/plans/devtools-mcp-plan3-smoke-test-and-regression.md.

Run the Staggered Loading smoke test (Section 3):
1. Navigate to the Staggered Loading fixture via the fixture list
2. Test A: Verify prerender shell (header + skeletons visible)
3. Test B: Verify parallel hydration (counter interactive while later sections loading)
4. Test C: Verify counter increment (tap 3 times, check value)

Also create the automated smoke test script at:
tools/devtools-mcp/tests/e2e/staggered-loading-test.js

Use npm run app:snapshot-ui, npm run app:tap, npm run app:screenshot for all interactions.

Do NOT run npm install. Do NOT stop to ask questions.
Read the plan file for full details.
```

---

## Error Recovery Playbook

### Build fails after an agent completes

1. Read the build errors: `cd tools/devtools-mcp && npm run build 2>&1`
2. Identify which files have errors
3. Resume the same agent with: "The build failed with these errors: <paste errors>. Fix them."
4. If the agent can't fix it, read the failing files yourself and fix directly

### Agent edits the wrong file or corrupts content

1. Use `git diff tools/devtools-mcp/src/<file>` to see what changed
2. If recoverable: send the agent a corrective message
3. If not: `git checkout -- tools/devtools-mcp/src/<file>` and re-run that plan's agent

### Two agents conflict on the same file (Phase 2)

This can happen with `pages.ts` (Plan 2A stubs + Plan 2B implementations) or `tools.ts`.

1. Check `git diff tools/devtools-mcp/src/tools/pages.ts`
2. If one agent's changes overwrote the other's, merge manually:
   - Plan 2A's stub handlers (close_page, new_page, etc.) must coexist with
   - Plan 2B's implementations (list_pages, select_page)
3. Run `npm run build` to verify the merge

### Agent produces no changes or incomplete work

1. Check if the agent actually read the plan file (look at its transcript)
2. Re-launch with a more specific prompt that lists exact files and changes
3. If a file was supposed to be edited but wasn't, read it yourself and make the edit

### Context compaction occurs mid-plan

1. Call `TaskList` to see what's done
2. Read `docs/plans/devtools-mcp-execution-progress.md` for detailed state
3. If an agent was running when compaction happened, check if it completed (look at TaskOutput)
4. Resume from wherever the progress file says you are

---

## Orchestrator Checklist

Use this as your step-by-step guide:

```
[ ] Phase 1A: Launch agent for Plan 1A
[ ] Phase 1A: Verify scaffolding
[ ] Phase 1A: Tell user to run npm install, wait for confirmation
[ ] Phase 1B: Launch agent for Plan 1B
[ ] Phase 1B: Verify CDP client + interfaces
[ ] Phase 1C: Launch agent for Plan 1C
[ ] Phase 1C: Verify performance tracing
[ ] Phase 1D: Launch agent for Plan 1D
[ ] Phase 1D: Verify server + build succeeds
[ ] Phase 2: Launch agents for Plan 2A AND 2B in parallel
[ ] Phase 2: Wait for both to complete
[ ] Phase 2: Verify stubs + WORKS tools, resolve any conflicts
[ ] Phase 2: Rebuild to verify
[ ] Phase 3: Launch agent for Plan 2C
[ ] Phase 3: Verify partial tools
[ ] Phase 4: Launch agent for Plan 2D
[ ] Phase 4: Verify cleanup + final build
[ ] Phase 5: Launch agent for Plan 3 smoke test
[ ] Phase 5: Verify smoke test results
[ ] Final: Update progress file, commit all changes
```

---

## Key Constraints for ALL Agents

Include these in every agent prompt:
- Do NOT run `npm install` or any command requiring internet access
- Do NOT stop to ask questions — read the plan file and execute
- Do NOT delete tool files that Plan 2 needs (console.ts, input.ts, etc.)
- `node_modules/` is already populated
- Run `npm run build` at the end to verify your work
- If something is unclear, make a reasonable decision and document it in a code comment
