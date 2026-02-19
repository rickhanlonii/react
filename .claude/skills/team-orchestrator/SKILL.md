---
name: team-orchestrator
description: Orchestrate the autonomous QA agent team for react-dom-native. Creates team, spawns agents, seeds tasks, monitors progress, handles recovery.
argument-hint: <action> e.g. "start", "resume", "status"
---

# Team Orchestrator

Manages the `react-dom-native-qa` agent team: 7 teammates across two parallel pipelines (layout + demo) plus a shared reviewer.

The **layout pipeline** has a full fix loop: builder → QA → fixer → reviewer → re-QA.
The **demo pipeline** has a diagnosis loop: builder → QA → diagnoser → report (user fixes manually).

## Quick Start

1. **Pre-flight check** — verify XcodeBuildMCP can build and launch both apps
2. **Assess current state** — check LayoutCompare results and Falcon app logs for existing issues
3. Call `TeamCreate` with `team_name: "react-dom-native-qa"`
4. Spawn 7 teammates (see Spawn section below)
5. Seed tasks based on assessment (see Seeding section below)
6. Enter monitoring loop

## Pre-flight Check (REQUIRED)

Before spawning any teammates, verify you can build and launch both apps. Subagents cannot build due to sandbox restrictions — only the lead agent can build.

1. Start dev servers:
   ```bash
   cd /Users/rickhanlonii/oss/falcon && npm run dev:e2e &
   cd /Users/rickhanlonii/oss/falcon/example && npm run dev &
   ```
2. Build and launch **LayoutCompare** on Falcon E2E:
   ```
   session_set_defaults: projectPath=tests/e2e/LayoutCompare/LayoutCompare/LayoutCompare.xcodeproj, scheme=LayoutCompare, simulatorId=50E9E48E-D7F7-4338-9873-3EB801137EE7, bundleId=com.react.LayoutCompare
   build_run_sim
   ```
3. Build and launch **Falcon** on iPhone 17 Pro:
   ```
   session_set_defaults: simulatorId=195F992B-E1D2-4355-95EB-3A178E3357D8, projectPath=example/Falcon/Falcon.xcodeproj, scheme=Falcon, bundleId=com.react.Falcon
   build_run_sim
   ```
4. Verify both apps are running:
   - `curl -s http://localhost:6101/results` (via Bash) — LayoutCompare results endpoint
   - `screenshot` on iPhone 17 Pro — Falcon app renders

**If either build fails: STOP. Tell the user.** Do not spawn teammates until both apps are confirmed running. The QA agents cannot build — they can only inspect already-running apps.

## Recovery After Compaction

If you see a message about compaction recovery:
1. Read `docs/plans/agent-team-state.md` for overall progress
2. Read all files in `docs/plans/agent-state/` for per-agent state
3. Call `TeamCreate` with `team_name: "react-dom-native-qa"`
4. Spawn all 7 teammates (same as fresh start)
5. Seed tasks based on where each pipeline left off (use state files)

## Spawn Teammates

Spawn all 7 using the `Task` tool with `team_name: "react-dom-native-qa"` and `subagent_type: "general-purpose"`. Use `mode: "bypassPermissions"`.

| Name | Spawn Prompt |
|------|-------------|
| `layout-builder` | `You are the Layout Builder. Invoke the /layout-builder skill. Read docs/plans/agent-state/layout-builder.md if it exists. Check TaskList for work.` |
| `layout-qa` | `You are the Layout QA. Invoke the /layout-qa skill. Read docs/plans/agent-state/layout-qa.md if it exists. Check TaskList for work.` |
| `layout-fixer` | `You are the Layout Fixer. Invoke the /layout-fixer skill. Read docs/plans/agent-state/layout-fixer.md if it exists. Check TaskList for work.` |
| `demo-builder` | `You are the Demo Builder. Invoke the /demo-builder skill. Read docs/plans/agent-state/demo-builder.md if it exists. Check TaskList for work.` |
| `demo-qa` | `You are the Demo QA. Invoke the /demo-qa skill. Read docs/plans/agent-state/demo-qa.md if it exists. Check TaskList for work.` |
| `demo-fixer` | `You are the Demo Diagnoser. Invoke the /demo-fixer skill. Read docs/plans/agent-state/demo-fixer.md if it exists. Check TaskList for work.` |
| `reviewer` | `You are the Reviewer. Invoke the /code-reviewer skill. Read docs/plans/agent-state/reviewer.md if it exists. Check TaskList for work.` |

## Assess Current State (after pre-flight, before spawning)

After both apps are running, assess the current state of each pipeline BEFORE spawning teammates. This determines what tasks to seed.

### Layout Pipeline Assessment
1. Fetch LayoutCompare results: `curl -s http://localhost:6101/results` (via Bash)
2. Note which fixtures exist, which pass, which fail
3. For each failing fixture, prepare a "Fix layout" task with the diff details

### Demo Pipeline Assessment
1. Switch to Falcon simulator: `session_set_defaults: simulatorId=195F992B-E1D2-4355-95EB-3A178E3357D8, bundleId=com.react.Falcon`
2. Take a `screenshot` — check if the app renders correctly
3. Start log capture: `start_sim_log_cap` with `captureConsole: true`
4. Wait 3-5 seconds, interact with the app (tap buttons, scroll)
5. Stop log capture: `stop_sim_log_cap`
6. Search logs for errors: `HydrationMismatch`, `onRecoverableError`, `Error`, `crash`
7. Note any rendering issues or errors for fix tasks

### Record Assessment
Write findings to `docs/plans/agent-team-state.md` before spawning teammates.

## Seed Tasks Based on Assessment

Create tasks based on what the assessment found — NOT from a fixed template.

### If fixtures are failing:
- Create "Fix layout: `<fixture-name>` — N diffs" tasks with full diff details, assign to `layout-fixer`
- The layout-builder should WAIT until existing failures are fixed before writing new fixtures

### If fixtures are all passing:
- Create "Write next fixture" task for `layout-builder`

### If demo app has errors:
- Create "Diagnose demo: `<error-type>` — `<details>`" tasks with log excerpts, assign to `demo-fixer` (the diagnoser)
- The demo-builder should WAIT until the diagnosis is complete before building new features

### If demo app is clean:
- Create "Build next demo feature" task for `demo-builder`

### Always:
- Create tasks for the `reviewer` only as layout fixers submit completed work (not upfront)
- The reviewer does NOT review demo diagnoser output — diagnosis reports go directly to the user

## Monitoring Loop

After seeding tasks, continuously:
1. Check `TaskList` for stalled/blocked work
2. **Enforce sequential pipeline flow** (see Pipeline Flow Rules below)
3. When a builder reports completion, tell the QA agent to test — do NOT tell the builder to start the next item yet
4. Write `docs/plans/agent-team-state.md` after every significant milestone
5. If teammates report issues, triage and redirect
6. When rebuilds are needed (Swift changes), build the app yourself — subagents cannot build

## Pipeline Flow Rules

**CRITICAL: Builders must wait for QA to pass before building the next item.**

### Layout Pipeline
```
layout-builder writes fixture → layout-qa tests it
  → PASS → tell layout-builder to write next fixture
  → FAIL → layout-fixer fixes → reviewer approves → layout-qa re-tests → loop until PASS
```

### Demo Pipeline
```
demo-builder builds feature → demo-qa tests it
  → PASS → tell demo-builder to build next feature
  → FAIL → demo-fixer (diagnoser) investigates → writes diagnosis report → demo-builder continues to next feature
```

The demo pipeline does NOT have a fix loop. The diagnoser produces a report at `docs/plans/agent-state/demo-diagnosis-<feature>.md` with repro steps and root cause analysis. The user fixes these issues manually. Once the diagnosis is written, the demo-builder can proceed to the next feature.

Do NOT assign new build tasks until the current item's QA passes. This prevents builders from racing ahead while issues pile up.

### Rebuild Responsibilities
Subagents cannot always run `build_run_sim` due to sandbox restrictions. When a layout fix requires a Swift rebuild:
1. The fixer sends you a message saying "Swift rebuild needed"
2. You run `build_run_sim` with the appropriate session defaults
3. You tell the QA agent to re-test

### Demo Diagnosis Reports
When the demo diagnoser completes a diagnosis, it writes a report to `docs/plans/agent-state/demo-diagnosis-<feature>.md`. These reports include:
- Repro steps with copy-paste-ready component code
- Root cause analysis with file/line references
- Suggested fix direction

The user will read these reports and fix the issues manually. Once the diagnosis is complete, tell the demo-builder to continue to the next feature.

## State File Updates

After every milestone, update `docs/plans/agent-team-state.md` with:
- Current fixture count and pass rate
- Demo features built and tested
- Bugs found and fixed
- What each pipeline is working on

## Agent Health & Restarts

Agents fill up their context window over time, leading to degraded behavior. Restart them proactively and reactively.

### Proactive Restarts

Track how many tasks each agent has completed. After an agent completes **3 tasks**, restart it:
1. Send `shutdown_request` to the agent
2. Wait for confirmation
3. Respawn with the same name/prompt (it reads its state file to recover)
4. Assign next task

### Reactive Restarts

Watch for these degradation signals during monitoring:
- Agent sends a message to itself
- Agent creates tasks assigned to itself
- Agent repeats the same action it already completed (e.g., re-fixing a fix, re-writing a fixture)
- Agent goes idle without completing its assigned task (stuck)
- Agent produces repeated errors or permission-denied loops
- Agent output becomes incoherent or self-referential

When any signal is detected, restart immediately using the procedure below.

### Restart Procedure

1. Note the agent's current task (if any) in `docs/plans/agent-team-state.md`
2. Send `shutdown_request` to the agent
3. Respawn with same name, skill, and `mode: "bypassPermissions"`
4. The new agent reads its append-only state file and picks up where the old one left off
5. Re-assign the incomplete task (if any)

## Shutdown

When done or when explicitly asked:
1. Send `shutdown_request` to all teammates
2. Wait for all to confirm
3. Call `TeamDelete`
4. Final update to state file
