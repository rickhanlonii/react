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
  |-- Phase 3: Analyze all traces (parallel, 3 agents batched)
  |     |
  |     |-- Analyzer Agent 1 (fixtures 1-11)
  |     |-- Analyzer Agent 2 (fixtures 12-22)
  |     `-- Analyzer Agent 3 (fixtures 23-33)
  |
  `-- Phase 4: Synthesize results (orchestrator)
        - Compile results table
        - Group issues by root cause
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

## Phase 4: Synthesis (Orchestrator)

After all analyzer agents complete, the orchestrator reads all per-trace reports and produces three outputs.

### Output 1: Results Table (`/tmp/falcon-traces/results-table.md`)

| Fixture | Variant | Events | Screenshots | Shadow Tree | Layout | Scheduler | Components | Server Req | Server Comp | Issues |
|---------|---------|--------|-------------|-------------|--------|-----------|------------|------------|-------------|--------|
| 01-rsc-only | server | 1234 | 5/5 | Y | Y | Y | Y | Y | Y | 0 |
| 01-rsc-only | hydrated | 1456 | 6/7 | Y | Y | Y | Y | Y | N | 1 |

### Output 2: Issues By Root Cause (`/tmp/falcon-traces/issues-by-cause.md`)

Group issues across all fixtures by pattern, not by fixture. For each group:
- Description of the pattern
- List of affected fixture/variant combinations
- Likely root cause (which source file/function is responsible)
- Severity assessment

### Output 3: Executive Summary (`/tmp/falcon-traces/summary.md`)

- Total traces collected: X/99
- Total traces with issues: X
- Track health summary
- Top issues by frequency
- Recommendations

## Output Directory Structure

```
/tmp/falcon-traces/
  manifest.json                         # Collection manifest (99 entries)
  pilot.json                            # Pilot trace
  <fixture>_<variant>.json              # Raw traces (up to 99)
  analysis/                             # Per-trace analysis reports
    <fixture>_<variant>.json            # (up to 99)
  results-table.md                      # Final results table
  issues-by-cause.md                    # Issues grouped by root cause
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

## Timing

- **Pilot run**: ~1 min
- **Trace collection**: 99 traces x ~10s each (3s navigate + 5s trace + 2s overhead) = ~17 min
- **Analysis**: 3 parallel agents x ~33 traces each = ~10 min wall clock
- **Synthesis**: ~2 min
- **Total**: ~30 min wall clock

## Failure Modes

| Failure | Detection | Mitigation |
|---------|-----------|------------|
| App crash | snapshot-ui returns error | STOP — user must restart app |
| MCP disconnected | performance_start_trace errors | Try list_pages; if fails, STOP |
| Trace already running | "already running" error | Call performance_stop_trace first |
| Disk full | filePath write fails | Use .json.gz compression |
| Fixture errors (throws) | Trace completes but has error events | Log as info, trace is still valid |
| navigate_fixture fails | No fixture loaded after 3s | Log error, try next fixture |
