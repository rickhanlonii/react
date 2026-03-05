# Performance Trace Audit Plan

## Goal

Run performance traces on every fixture x every variant (server, hydrated, ppr) in the Falcon demo app, then analyze the traces for issues, missing data, and incomplete custom performance tracks.

## Scope

- **33 fixtures** in `example/server/src/fixtures/` across 9 categories
- **3 variants**: `server`, `hydrated`, `ppr`
- **99 total traces** (33 x 3)
- **Read-only analysis** — no code changes

## Prerequisites

Before starting, verify ALL of the following:

1. Dev server running: `curl -s http://localhost:6000/fixtures | head -c 100` (should return JSON)
2. Build server running: `npm run app:screenshot` (should succeed)
3. Falcon Demo app running on simulator: `npm run app:snapshot-ui -- --filter Fixtures` (should show "Fixtures" nav title)
4. MCP connected: `list_pages` MCP tool returns a page (JSC runtime)

If any prerequisite fails, STOP and report which prerequisite is not met.

## Navigation

Use the `navigate_fixture` MCP tool to navigate the app. This tool:
- Sends a CDP command `FalconApp.navigate` through the inspector proxy
- The proxy forwards `{type: "navigate-fixture", fixture, variant}` to the app via WebSocket
- The app's `ReactRuntime` posts a `NotificationCenter` notification
- `FalconApp` observes the notification and updates `NavigationPath` + `@AppStorage("renderingMode")`
- The tool waits 3 seconds for navigation and rendering to complete

Usage:
```
navigate_fixture(fixture: "01-rsc-only", variant: "hydrated")
navigate_fixture(fixture: "06-kitchen-sink", variant: "server")
navigate_fixture(fixture: "30-prerender-resume", variant: "ppr")
```

This replaces all manual coordinate-based navigation and variant switching.

## Expected Custom Performance Tracks

Each trace should contain events on these tracks (where applicable):

| Track | Track Group | Source | Expected Events |
|-------|------------|--------|-----------------|
| Shadow Tree | Native | HostConfig.js | Commit, Prepare, Blocked (Layout), Diff, Apply Mutations, Sync Frames, Cleanup, Tree Promote, Node GC, DevTools Notify |
| Layout | Native | HostConfig.js | Calculate Layout, Yoga, Text Remeasure, Read Frames, Scroll Content |
| Scheduler | Scheduler | React internals | Priority, lanes, task scheduling |
| Components | (built-in) | React internals | Component renders, suspense |
| Server Requests | Server Requests | Flight client | HTTP request/response streaming |
| Server Components | Server Components | Flight client | RSC rendering, chunk processing |
| Interactions | (built-in) | renderer.js | EventTiming (click, change) — only for interactive fixtures |

Additionally, each trace should contain:
- **Screenshots** (`disabled-by-default-devtools.screenshot` category, `ph: "O"`) captured after each native commit
- **Infrastructure events**: `TracingStartedInBrowser`, `SetLayerTreeId`, `RunTask`, process/thread metadata

## Architecture

```
Orchestrator (main context)
  |
  |-- Phase 1: Pilot run (1 fixture, 1 variant) to validate approach
  |
  |-- Phase 2: Collect all traces (sequential, 1 agent)
  |     |
  |     `-- Trace Collector Agent
  |           - Calls navigate_fixture(fixture, variant) for each combo
  |           - Runs performance_start_trace with autoStop + filePath
  |           - Saves manifest
  |
  |-- Phase 3: Triage all traces (parallel, 3 agents batched)
  |     |
  |     |-- Triage Agent 1 (fixtures 1-11)
  |     |-- Triage Agent 2 (fixtures 12-22)
  |     `-- Triage Agent 3 (fixtures 23-33)
  |
  |-- Phase 4: Root Cause Analysis (parallel, 3 RCA agents)
  |     |
  |     |-- RCA Agent 1 (issues batch 1)
  |     |-- RCA Agent 2 (issues batch 2)
  |     `-- RCA Agent 3 (issues batch 3)
  |           Each agent: reads trace data + source code, identifies
  |           root cause, writes per-issue report with file/line refs
  |
  `-- Phase 5: Synthesize results (orchestrator)
        - Compile results table
        - Attach root causes to issues
        - Write final reports
```

## Phase 1: Pilot Run

Before running all 99 traces, validate the entire approach with a single fixture. The orchestrator does this directly (no agent).

### Steps

1. **Get fixture list**: `curl -s http://localhost:6000/fixtures` and parse to get the first fixture name
2. **Navigate**: Call `navigate_fixture(fixture: "<first_fixture_name>", variant: "hydrated")`
3. **Verify navigation**: `npm run app:snapshot-ui -- --filter "<fixture_title>"` — should show the fixture title
4. **Run trace**: Call `performance_start_trace(reload: true, autoStop: true, filePath: "/tmp/falcon-traces/pilot.json")`
5. **Validate trace file**:
   - Verify file exists and is non-empty: `ls -la /tmp/falcon-traces/pilot.json`
   - Count events: `grep -c '"ph"' /tmp/falcon-traces/pilot.json`
   - Check for Shadow Tree events: `grep -c '"Shadow Tree"' /tmp/falcon-traces/pilot.json`
   - Check for screenshot events: `grep -c 'disabled-by-default-devtools.screenshot' /tmp/falcon-traces/pilot.json`
6. **Test variant switch**: Call `navigate_fixture(fixture: "<first_fixture_name>", variant: "server")`
7. **Verify variant**: `npm run app:snapshot-ui -- --filter "Server Only"` — should show "Server Only" in toolbar

**If pilot fails**: STOP. Report the failure and do not proceed to Phase 2. Include:
- Which step failed
- The snapshot-ui output at time of failure
- Any error messages from the MCP tool

**If pilot succeeds**: Proceed to Phase 2.

## Phase 2: Trace Collection

Single sequential agent. Traces MUST be collected sequentially because:
- Only one trace can run at a time (MCP enforces this)
- `navigate_fixture` needs the app in a stable state

### Agent: Trace Collector

**Process**:

1. **Setup**:
   - Create output dir: `mkdir -p /tmp/falcon-traces`
   - Fetch fixture list: `curl -s http://localhost:6000/fixtures` → parse JSON
   - Initialize manifest: `[]`

2. **For each fixture** (in order from fixture list):
   - **For each variant** (`server`, `hydrated`, `ppr`):
     a. Call `navigate_fixture(fixture: "<name>", variant: "<variant>")`
     b. Call `performance_start_trace(reload: true, autoStop: true, filePath: "/tmp/falcon-traces/<name>_<variant>.json")`
     c. Record result in manifest: `{fixture, variant, filePath, success: true/false, error}`
     d. If trace fails, log error and continue to next variant

3. **After all fixtures**: Write manifest to `/tmp/falcon-traces/manifest.json`

### Error Recovery

- **Trace fails (MCP error)**: Log error in manifest, skip to next variant. Do NOT retry.
- **"already running" error**: Call `performance_stop_trace` first, then retry once.
- **App crash**: If `npm run app:snapshot-ui` returns no results or errors, STOP and report.
- **MCP disconnected**: Try `list_pages`; if fails, STOP and report.

## Phase 3: Trace Analysis

Three parallel agents, each analyzing a batch of trace files. Agents read trace JSON files directly — they do NOT need the running app.

### Each Analyzer Agent

**Input**: A list of trace file paths from the manifest (split into 3 roughly equal batches).

**For each trace file**:

1. **Check file**: `ls -la <file>` — verify exists and non-empty
2. **Count total events**: `grep -c '"ph"' <file>`
3. **Track completeness** (use `grep -c` for each):
   - Shadow Tree: `grep -c '"Shadow Tree"' <file>`
   - Layout: `grep -c '"Layout"' <file>`
   - Scheduler: `grep -c '"Scheduler"' <file>`
   - Screenshots: `grep -c 'disabled-by-default-devtools.screenshot' <file>`
   - Server Requests: `grep -c '"Server Requests"' <file>`
   - Server Components: `grep -c '"Server Components"' <file>`
4. **Commit vs screenshot ratio**:
   - Commits: `grep -c '"Commit"\|"Apply Mutations"' <file>`
   - Compare with screenshot count
5. **Variant-specific checks**:
   - `server`: Should NOT have hydration/client-render events
   - `hydrated`: Should have SSR + hydration + client component events
   - `ppr`: Should have prerender + resume events
6. **Output**: Write report to `/tmp/falcon-traces/analysis/<fixture>_<variant>.json`:
   ```json
   {
     "fixture": "01-rsc-only",
     "variant": "server",
     "totalEvents": 1234,
     "tracks": {
       "Shadow Tree": {"found": true, "eventCount": 45},
       "Layout": {"found": true, "eventCount": 23}
     },
     "screenshots": {"count": 5, "commits": 5, "ratio": 1.0},
     "issues": [
       {"severity": "warning", "message": "...", "details": "..."}
     ]
   }
   ```

**Issue severity levels**:
- `critical`: Track completely missing, zero events, file empty/corrupt
- `warning`: Track present but incomplete, missing screenshots, unexpected patterns
- `info`: Minor anomalies, unusual timing

**Important**: Do NOT read entire trace files — they can be 5-50MB. Use `grep` patterns only.

## Phase 4: Root Cause Analysis

After triage, the orchestrator collects all critical/warning issues from the analysis reports, deduplicates them by pattern (e.g. "Shadow Tree track missing" across 33 server-variant traces is ONE issue, not 33), and distributes unique issues across 3 RCA agents.

### Issue Deduplication

Before dispatching to RCA agents, group issues by signature:
- Same `severity` + same `message` pattern + same affected track → one issue group
- Record which fixture/variant combos are affected
- Example: if all 33 server-variant traces are missing "Server Components" track, that's 1 issue affecting 33 traces, not 33 issues

### Each RCA Agent

**Input**: A batch of deduplicated issue groups, each with:
- Issue description and severity
- List of affected fixture/variant combos
- One representative trace file path to inspect

**For each issue**:

1. **Examine trace data**: Read relevant sections of a representative trace file to understand what IS present vs what's missing
2. **Trace the code path**: Follow the event emission chain in source code:
   - For missing tracks → find where events are emitted in source, check if the code path is reached
     - `packages/react-dom-native/src/HostConfig.js` — Shadow Tree, Layout track events
     - `packages/react-dom-native/src/flight/` — Server Requests, Server Components track events
     - `packages/react-dom-native/src/renderer.js` — Interactions, scheduler events
   - For missing screenshots → check the screenshot capture flow
     - `packages/react-dom-native/ios/.../Bindings+DevTools.swift` — `captureCommitScreenshot()`
     - `example/scripts/inspector-proxy.js` — screenshot forwarding, `enable-commit-screenshots`
   - For variant-specific issues → check variant code paths
     - `example/Falcon/Falcon/ServerOnlyViewController.swift`
     - `example/Falcon/Falcon/HydrationViewController.swift`
     - `example/Falcon/Falcon/PrerenderViewController.swift`
   - For malformed events → check event construction
     - JS: trace event helpers in HostConfig.js, PerformanceTracer
     - Swift: `PerformanceTracer.swift`, `Bindings+DevTools.swift`
3. **Classify root cause**:
   - **Not emitted**: Code path exists but is never reached for this variant/fixture
   - **Emitted but lost**: Event is created but dropped in proxy/transport
   - **Wrong data**: Event exists but has incorrect fields/format
   - **Timing issue**: Event exists but timestamp/duration is wrong
   - **By design**: The track/event is not expected for this variant (e.g. no Server Components in server-only mode)
4. **Write report** to `/tmp/falcon-traces/rca/<issue_id>.md`:
   ```markdown
   # Issue: <description>

   **Severity**: critical/warning
   **Affected**: <N> traces (<list of fixture/variant combos>)
   **Classification**: not emitted | emitted but lost | wrong data | timing | by design

   ## Root Cause

   <Explanation of why the issue occurs, referencing specific source files and line numbers>

   ## Evidence

   - Trace file: <path> — <what was found/not found>
   - Source: <file>:<line> — <relevant code>

   ## Suggested Fix Category

   <One of: add missing emission, fix proxy forwarding, fix event format,
    fix timing, update expectations (if by design), needs investigation>
   ```

### RCA Source Code Reference

Key files for each track:

| Track | Primary Source | What to Check |
|-------|---------------|---------------|
| Shadow Tree | `packages/react-dom-native/src/HostConfig.js` | `console.timeStamp` calls with `track:"Shadow Tree"` |
| Layout | `packages/react-dom-native/src/HostConfig.js` | `console.timeStamp` calls with `track:"Layout"` |
| Screenshots | `packages/react-dom-native/ios/.../Bindings+DevTools.swift` | `captureCommitScreenshot()`, `commitScreenshotsEnabled` |
| Screenshots (proxy) | `example/scripts/inspector-proxy.js` | `enable-commit-screenshots` message handling, screenshot event injection |
| Server Requests | `packages/react-dom-native/src/flight/` | Flight client fetch instrumentation |
| Server Components | `packages/react-dom-native/src/flight/` | RSC chunk processing instrumentation |
| Scheduler | React internals | `SchedulerFeatureFlags`, priority/lane events |
| Interactions | `packages/react-dom-native/src/renderer.js` | Event timing, `reportGlobalEvent` |

## Phase 5: Synthesis (Orchestrator)

After all triage and RCA agents complete, the orchestrator reads all reports and produces three outputs.

### Output 1: Results Table (`/tmp/falcon-traces/results-table.md`)

| Fixture | Variant | Events | Screenshots | Shadow Tree | Layout | Scheduler | Components | Server Req | Server Comp | Issues |
|---------|---------|--------|-------------|-------------|--------|-----------|------------|------------|-------------|--------|
| 01-rsc-only | server | 1234 | 5/5 | Y | Y | Y | Y | Y | Y | 0 |
| 01-rsc-only | hydrated | 1456 | 6/7 | Y | Y | Y | Y | Y | N | 1 |

### Output 2: Issues With Root Causes (`/tmp/falcon-traces/issues-with-rca.md`)

For each deduplicated issue group, merge the triage data with the RCA report:
- Issue description and severity
- Number of affected fixture/variant combos
- Root cause classification and explanation (from RCA)
- Source file(s) and line numbers
- Suggested fix category
- Priority ranking (critical issues with many affected traces first)

### Output 3: Executive Summary (`/tmp/falcon-traces/summary.md`)

- Total traces collected: X/99
- Total unique issues found: X (after deduplication)
- Root cause breakdown: N "not emitted", N "emitted but lost", N "by design", etc.
- Track health summary (which tracks work reliably, which don't)
- Top 5 issues by impact (severity x breadth)
- Recommended next steps (ordered by priority)

## Output Directory Structure

```
/tmp/falcon-traces/
  manifest.json                         # Collection manifest (99 entries)
  pilot.json                            # Pilot trace
  <fixture>_<variant>.json              # Raw traces (up to 99)
  analysis/                             # Per-trace triage reports
    <fixture>_<variant>.json            # (up to 99)
  rca/                                  # Root cause analysis reports
    <issue_id>.md                       # Per-issue RCA (deduplicated)
  results-table.md                      # Final results table
  issues-with-rca.md                    # Issues with root causes
  summary.md                            # Executive summary
```

## Agent Prompts

### Trace Collector Prompt

```
You are collecting performance traces for the Falcon demo app. You have access to:
- Bash tool for shell commands (mkdir, curl, etc.)
- MCP tools: navigate_fixture, performance_start_trace, performance_stop_trace, list_pages

IMPORTANT RULES:
- Run traces SEQUENTIALLY — one at a time
- On any error, log it in the manifest and continue to the next fixture/variant
- If you get "already running" error, call performance_stop_trace first
- Do NOT modify any code files

FIXTURE LIST: <paste JSON from /fixtures endpoint>

FOR EACH FIXTURE (in order), FOR EACH VARIANT (server, hydrated, ppr):
1. Call navigate_fixture(fixture: "<name>", variant: "<variant>")
2. Call performance_start_trace(reload: true, autoStop: true, filePath: "/tmp/falcon-traces/<name>_<variant>.json")
3. Record {fixture, variant, filePath, success, error} in manifest array

When done, write the manifest array as JSON to /tmp/falcon-traces/manifest.json.
```

### Analyzer Agent Prompt

```
You are analyzing performance trace files from the Falcon demo app.
You have access to: Read tool, Bash tool (for grep/wc on trace files), Write tool.

Your batch: <list of trace file paths from manifest>

For EACH trace file:
1. Check file exists and is non-empty (ls -la)
2. Count total events: grep -c '"ph"' <file>
3. Check each track (use grep -c for each pattern):
   - Shadow Tree: grep -c '"Shadow Tree"'
   - Layout: grep -c '"Layout"'
   - Scheduler: grep -c '"Scheduler"'
   - Screenshots: grep -c 'disabled-by-default-devtools.screenshot'
   - Server Requests: grep -c '"Server Requests"'
   - Server Components: grep -c '"Server Components"'
4. Count commits: grep -c '"Commit"\|"Apply Mutations"'
5. Check variant-specific expectations
6. Write analysis JSON to /tmp/falcon-traces/analysis/<fixture>_<variant>.json

Do NOT read entire trace files — they are too large. Use grep patterns only.
```

### RCA Agent Prompt

```
You are performing root cause analysis on performance trace issues in the
Falcon demo app (react-dom-native). You have access to: Read tool, Bash tool,
Grep tool.

Your issues to investigate: <list of deduplicated issue groups with representative trace paths>

For EACH issue:
1. Read relevant parts of a representative trace file (use grep, not full reads)
2. Read the source code responsible for emitting the events (see source reference below)
3. Determine the root cause — classify as one of:
   - "not emitted": code path exists but not reached
   - "emitted but lost": event created but dropped in proxy/transport
   - "wrong data": event exists but fields are incorrect
   - "timing": event exists but timestamp/duration is wrong
   - "by design": track/event not expected for this variant
4. Write a report to /tmp/falcon-traces/rca/<issue_id>.md with:
   - Issue description and severity
   - Affected traces
   - Root cause classification and explanation
   - Relevant source file(s) and line numbers
   - Suggested fix category

KEY SOURCE FILES:
- Shadow Tree / Layout events: packages/react-dom-native/src/HostConfig.js
- Screenshots: packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings+DevTools.swift
- Screenshot proxy: example/scripts/inspector-proxy.js (search for "screenshot")
- Flight/RSC events: packages/react-dom-native/src/flight/
- Renderer/interactions: packages/react-dom-native/src/renderer.js
- Variant ViewControllers: example/Falcon/Falcon/*ViewController.swift

Do NOT modify any code files. This is read-only analysis.
```

## Timing

- **Pilot run**: ~1 min
- **Trace collection**: 99 traces x ~10s each (3s navigate + 5s trace + 2s overhead) = ~17 min
- **Triage**: 3 parallel agents x ~33 traces each = ~10 min wall clock
- **RCA**: 3 parallel agents, ~5 min per issue — depends on issue count after deduplication
- **Synthesis**: ~2 min
- **Total**: ~45 min wall clock (varies with issue count)

## Failure Modes

| Failure | Detection | Mitigation |
|---------|-----------|------------|
| App crash | snapshot-ui returns error | STOP — user must restart app |
| MCP disconnected | performance_start_trace errors | Try list_pages; if fails, STOP |
| Trace already running | "already running" error | Call performance_stop_trace first |
| Disk full | filePath write fails | Use .json.gz compression |
| Fixture errors (throws) | Trace completes but has error events | Log as info, trace is still valid |
| navigate_fixture fails | No fixture loaded after 3s | Log error, try next fixture |
