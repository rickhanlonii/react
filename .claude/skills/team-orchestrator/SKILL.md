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

1. **Team cleanup** — delete and recreate the team (preserves state files)
2. **Pre-flight check** — verify XcodeBuildMCP can build and launch both apps
3. **Assess current state** — check LayoutCompare results and Falcon app logs for existing issues
4. Spawn 7 teammates (see Spawn section below)
5. Seed tasks based on assessment (see Seeding section below)
6. Enter monitoring loop

## Team Cleanup

Before spawning agents, clean up any stale team from a prior session. Stale teams accumulate terminated agents with suffixed names, causing message routing failures.

1. Call `TeamDelete` to remove the existing `react-dom-native-qa` team (if one exists). This is safe — agent state is preserved in `docs/plans/agent-state/*.md` (current state) and `docs/plans/agent-state/*.log.md` (audit history), so no work is lost.
2. Call `TeamCreate` with `team_name: "react-dom-native-qa"` to start fresh with a clean member list.

If `TeamDelete` fails because no team exists, that's fine — proceed to `TeamCreate`.

## Pre-flight Check (REQUIRED)

Before spawning any teammates, verify you can build and launch both apps. Subagents cannot build due to sandbox restrictions — only the lead agent can build.

**Do NOT wrap commands** in custom bash — no `echo`, `2>&1`, `2>/dev/null`, `sleep`, `&`, `; echo "EXIT CODE: $?"`, piping through `python3 -c`, or similar. Run each command directly using the Bash tool. To run commands in the background, use the Bash tool's `run_in_background: true` parameter.

1. Check if dev servers are already running:
   ```bash
   npm run e2e:check
   ```
   Only start servers that aren't already responding (use the Bash tool's `run_in_background: true` parameter — do NOT use `&`, redirects, `echo`, or any other shell tricks):
   - If E2E server is not responding: `Bash(command: "npm run dev:e2e", run_in_background: true)`
   - If Flight/SSR servers are not responding: `Bash(command: "cd /Users/rickhanlonii/oss/falcon/fixtures/example && npm run dev", run_in_background: true)`
   Wait 5 seconds after starting, then re-run `npm run e2e:check` to confirm they're up.
2. Build and launch **LayoutCompare** on Falcon E2E:
   ```bash
   npm run app:run -- e2e
   ```
   If this fails with `sandbox-exec: sandbox_apply: Operation not permitted`, ask the user to build manually.
   Set MCP session defaults for UI inspection tools:
   ```
   session_set_defaults: projectPath=fixtures/layout/LayoutCompare/LayoutCompare/LayoutCompare.xcodeproj, scheme=LayoutCompare, simulatorId=50E9E48E-D7F7-4338-9873-3EB801137EE7, simulatorName=Falcon E2E, bundleId=com.react.LayoutCompare
   ```
3. Build and launch **Falcon** on Falcon Demo:
   ```bash
   npm run app:run
   ```
   Then set MCP session defaults for UI inspection:
   ```
   session_set_defaults: simulatorId=61F83D8B-36DF-474F-9AAD-61DC6D60FFED, simulatorName=Falcon Demo, projectPath=fixtures/example/Falcon/Falcon.xcodeproj, scheme=Falcon, bundleId=com.react.Falcon
   ```
4. Trigger LayoutCompare tests and verify results:
   ```bash
   npm run e2e:test
   ```
   This triggers all fixtures, polls until complete, and prints structured results. Verify the output shows a non-zero total — if it shows 0 fixtures, re-run.
5. Verify Falcon app is running:
   - Take a screenshot:
     ```bash
     npm run app:screenshot
     ```
     Then view: `Read /tmp/falcon-screenshot.png`

**If either build fails: STOP. Tell the user.** Do not spawn teammates until both apps are confirmed running. The QA agents cannot build — they can only inspect already-running apps.

## Recovery After Compaction

If you see a message about compaction recovery:
1. Read `docs/plans/agent-team-state.md` for overall progress
2. Read all files in `docs/plans/agent-state/` for per-agent state
3. Force-clean the stale team — agents from the old context are zombies and will never respond to shutdown requests. Do NOT send them shutdown messages. Just delete the team directories directly:
   ```bash
   rm -rf ~/.claude/teams/react-dom-native-qa
   rm -rf ~/.claude/tasks/react-dom-native-qa
   ```
4. Call `TeamCreate` with `team_name: "react-dom-native-qa"` to start fresh
5. Spawn all 7 teammates (same as fresh start)
6. Note actual spawned names and update your name mapping (see Name Tracking)
7. Seed tasks based on where each pipeline left off (use state files)

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

## Name Tracking

> ⚠️ **CRITICAL: Agent names may be auto-suffixed (e.g., "layout-builder" → "layout-builder-2").**
> Always use the actual name returned by the Task tool, never the base role name.
> Messages sent to wrong names are silently dropped.

After each `Task` spawn call returns, the result includes the **actual agent name** assigned by the system. This name may differ from the requested name if an agent with that name existed previously.

1. After each spawn, note the actual agent name from the Task tool result
2. Maintain a mapping of role → actual name (e.g., `layout-builder → layout-builder-2`)
3. **Always use the actual spawned name** for all `SendMessage` `recipient` fields, `shutdown_request` targets, and task `owner` fields
4. When restarting an agent, the new instance will get a new suffixed name — update your mapping

## Agent Inventory

**CRITICAL: Always know exactly how many agents are running and who they are.**

### Active Agent Registry

Maintain a mental registry of every agent you have spawned in this session:
- Role name (e.g., "layout-fixer")
- Actual spawned name (e.g., "layout-fixer-10")
- Status: running / shutdown-requested / terminated

### Audit Before Every Spawn

Before spawning a new agent for a role, verify the previous agent for that role is CONFIRMED TERMINATED (you received a `teammate_terminated` system message). If it's only "shutdown-requested" but not yet confirmed terminated, **wait for termination before spawning**. Spawning while the old agent is still alive creates ghost agents that edit files concurrently.

### Audit After Every Restart

After restarting an agent (shutdown + respawn):
1. Verify you received `teammate_terminated` for the OLD agent
2. Only THEN spawn the new one
3. Update your registry with the new name
4. If the old agent sends messages after termination confirmation, ignore them

### Periodic Inventory Check

Every 5 agent messages, do a quick mental inventory:
- How many agents did I spawn this session?
- How many have I terminated?
- Therefore how many should be running right now?
- Does that match the messages I'm receiving?

If you're receiving messages from an agent you didn't spawn or thought was terminated, something is wrong. Read the team config file (`~/.claude/teams/{team-name}/config.json`) to audit the member list.

## Assess Current State (after pre-flight, before spawning)

After both apps are running, assess the current state of each pipeline BEFORE spawning teammates. This determines what tasks to seed.

### Layout Pipeline Assessment
1. Trigger test run and get results:
   ```bash
   npm run e2e:test
   ```
   This triggers all fixtures, polls until complete, and prints a structured summary with passing/failing counts and per-fixture diff details.
2. Note which fixtures exist, which pass, which fail
3. For each failing fixture, prepare a "Fix layout" task with the diff details

### Demo Pipeline Assessment
1. Switch to Falcon simulator: `session_set_defaults: simulatorId=61F83D8B-36DF-474F-9AAD-61DC6D60FFED, simulatorName=Falcon Demo, bundleId=com.react.Falcon`
2. Take a screenshot:
   ```bash
   npm run app:screenshot
   ```
   Then view: `Read /tmp/falcon-screenshot.png`
3. Start log capture (relaunches app):
   ```bash
   npm run app:log-start
   ```
4. Wait 3-5 seconds, interact with the app (tap buttons, scroll)
5. Read logs:
   ```bash
   npm run app:log-read
   ```
6. Search logs for errors: `HydrationMismatch`, `onRecoverableError`, `Error`, `crash`
7. Note any rendering issues or errors for fix tasks

### Record Assessment
Overwrite `docs/plans/agent-team-state.md` with findings before spawning teammates.

## Seed Tasks Based on Assessment

Create tasks based on what the assessment found — NOT from a fixed template.

**CRITICAL: Task-First Assignment Rule.** Never assign work via `SendMessage` alone. Always create a `TaskCreate` entry with full details (fixture name, diff data, expected behavior) FIRST, then message the agent to check `TaskList`. This prevents agents from losing track of assignments or re-doing work they already completed.

### If fixtures are failing:
- Create "Fix layout: `<fixture-name>` — N diffs" tasks with full diff details (include the actual diff output in the task description), assign to `layout-fixer`
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

**CRITICAL: The pipeline runs continuously until the user explicitly tells you to stop. NEVER shut down agents or stop the loop on your own. There is always more work to do.**

### Idle Notification Policy

**Do NOT respond to `idle_notification` messages unless you have actionable work to assign.** Idle notifications are informational — they tell you the agent finished its turn. They do not require acknowledgment. Responding with "waiting on fixer" or "QA idle as expected" wastes context.

Rules:
- If you have a task to assign → send it via `SendMessage`
- If you have nothing to assign → **do not respond at all**, just continue waiting
- If multiple idle notifications arrive in the same turn → ignore all of them unless one triggers a task assignment
- Never output messages like "Waiting on X", "Ignoring idle", "Still waiting", "X idle as expected" — these burn context for zero value

After seeding tasks, continuously:
1. Check `TaskList` for stalled/blocked work
2. **Enforce sequential pipeline flow** (see Pipeline Flow Rules below)
3. When a builder reports completion, tell the QA agent to test — do NOT tell the builder to start the next item yet
4. Overwrite `docs/plans/agent-team-state.md` and append to `docs/plans/agent-team-state.log.md` after every significant milestone
5. If teammates report issues, triage and redirect
6. When rebuilds are needed (Swift changes), build the app yourself — subagents cannot build
7. **When all fix tasks are complete**: create new fix tasks for any remaining failing fixtures, OR if all fixtures pass, tell the builder to write the next batch of fixtures. Then cycle back to step 1.

### Continuous Cycle

The layout pipeline is an infinite loop:

```
LOOP FOREVER (until user says stop):
  1. Fixer fixes all failing fixtures
  2. Lead rebuilds + runs QA after each fix
  3. When all fixable diffs are resolved → tell builder to write next batch
  4. Builder writes new fixtures
  5. Lead rebuilds + runs QA on new fixtures
  6. New fixtures fail → create fix tasks → go to step 1
```

**NEVER stop this loop.** When fix tasks are done, create builder tasks. When builder tasks are done, assess new failures and create fix tasks. The only valid reason to stop is the user explicitly saying "stop" or "shut down".

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
Subagents cannot build due to sandbox restrictions. When a layout fix requires a Swift rebuild:
1. The fixer sends you a message saying "Swift rebuild needed"
2. You rebuild: `npm run app:run` for Falcon, `npm run app:run -- e2e` for LayoutCompare
3. You tell the QA agent to re-test

### Demo Diagnosis Reports
When the demo diagnoser completes a diagnosis, it writes a report to `docs/plans/agent-state/demo-diagnosis-<feature>.md`. These reports include:
- Repro steps with copy-paste-ready component code
- Root cause analysis with file/line references
- Suggested fix direction

The user will read these reports and fix the issues manually. Once the diagnosis is complete, tell the demo-builder to continue to the next feature.

## State File Updates

After every milestone, **overwrite** `docs/plans/agent-team-state.md` with current state using this template:

```markdown
# Agent Team State

**Last updated**: <timestamp>

## Metrics
- Fixtures: X total, Y passing
- Demo features: N built, M tested

## Pipeline Status
- Layout: <what's happening>
- Demo: <what's happening>

## Agent Status
| Role | Actual Name | Status | Current Task |
|------|-------------|--------|-------------|
| layout-builder | <actual-name> | idle/working | <task or "—"> |
| layout-qa | <actual-name> | idle/testing | <task or "—"> |
| layout-fixer | <actual-name> | idle/fixing | <task or "—"> |
| demo-builder | <actual-name> | idle/working | <task or "—"> |
| demo-qa | <actual-name> | idle/testing | <task or "—"> |
| demo-fixer | <actual-name> | idle/diagnosing | <task or "—"> |
| reviewer | <actual-name> | idle/reviewing | <task or "—"> |
```

Also **append** a summary entry to `docs/plans/agent-team-state.log.md` at each milestone:

```markdown
---
### <timestamp>
- Milestone: <what happened>
- Metrics: <current numbers>
- Key changes: <fixes, features, etc.>
```

Do NOT read the log files. They are for the user's audit trail only.

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

**This is an atomic operation. Do not interleave other work between steps.**

1. Note the agent's current task (if any) in `docs/plans/agent-team-state.md`
2. Send `shutdown_request` to the agent (using its current actual name)
3. **WAIT for the `teammate_terminated` system message** — do NOT proceed until you see it. The agent may send more messages and go idle before terminating. **Do not respond to any of those messages** — no "ignoring", no "still waiting", no acknowledgment at all. Just silently wait.
4. Only after confirmed termination: respawn with same role name, skill, and `mode: "bypassPermissions"`
5. Note the actual name returned — it may be suffixed (e.g., "layout-fixer-2")
6. Update your name mapping AND agent registry for this role
7. The new agent reads its current state file and picks up where the old one left off
8. Re-assign the incomplete task using the new agent name

**NEVER spawn a replacement before the old agent is confirmed terminated.** This is the #1 cause of ghost agents.

### Zombie Agent Timeout

If an agent does not respond to a `shutdown_request` within 30 seconds (no `shutdown_approved` or `teammate_terminated` message received):
1. Treat it as a zombie — it will never respond
2. **Do NOT retry** the shutdown request. Do not send "Approve immediately" or other follow-ups.
3. Proceed with your next action (respawn, TeamDelete, etc.) — the zombie will eventually be cleaned up when the team is deleted
4. If `TeamDelete` fails because of zombie members, delete the team directories manually:
   ```bash
   rm -rf ~/.claude/teams/react-dom-native-qa
   rm -rf ~/.claude/tasks/react-dom-native-qa
   ```
   Then call `TeamCreate` to start fresh.

## Shutdown

**Only shut down when the user explicitly asks you to stop.** Do NOT shut down because "all current tasks are done" — there is always a next cycle (fix → build → fix → ...).

When the user explicitly asks to stop:
1. Send `shutdown_request` to ALL teammates simultaneously in a single message (parallel tool calls)
2. **Ignore ALL subsequent teammate messages.** Do not respond, do not acknowledge, do not output "ignoring" — just produce zero output for any teammate message received after this point. Agents will continue submitting work after shutdown requests; this is expected and requires no action.
3. Call `TeamDelete` immediately — do not wait for confirmations. If it fails, force-clean:
   ```bash
   rm -rf ~/.claude/teams/react-dom-native-qa
   rm -rf ~/.claude/tasks/react-dom-native-qa
   ```
4. Final update to state file
