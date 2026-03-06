# Server Actions Implementation — Agent Team Orchestration Plan

## Context

Nine implementation plans (Steps 1a–6) define the full server actions feature for Falcon. Each plan now has a Testing & Verification section. This plan orchestrates executing ALL steps sequentially using an agent team, verifying each step before proceeding, and recovering from failures — all without stopping for user feedback.

## Execution Strategy: Sequential with Verification Gates

Due to cascading file dependencies (7 files modified by multiple steps), ALL steps execute sequentially. This eliminates merge conflicts and ensures each agent builds on verified, working code.

```
1a → 1b → 1c → 2 → 3 → 4a → 4b → 5 → 6 → Final Smoke Test
```

## Team Structure

**Leader (this session):** Orchestrates the team, creates tasks, spawns agents, verifies work, handles failures.

**Worker agents:** One `general-purpose` agent per step, spawned sequentially. Each agent:
- Receives the plan file path and explicit instructions
- Implements the step following the plan exactly
- Runs the automated tests specified in the plan's Testing & Verification section
- Commits the work
- Reports back with test results

## Execution Procedure

### For each step (1a, 1b, 1c, 2, 3, 4a, 4b, 5, 6):

#### 1. Spawn Worker Agent
```
Agent(subagent_type: "general-purpose", mode: "bypassPermissions")
```

Prompt template for each agent:
```
You are implementing Step {N} of the Falcon server actions feature.

PLAN FILE: Read /Users/rickhanlonii/oss/falcon/docs/plans/2026-03-03-server-actions-step{N}.md
CLAUDE.MD: Read /Users/rickhanlonii/oss/falcon/CLAUDE.md for project conventions.

INSTRUCTIONS:
1. Read the plan file completely.
2. Implement each Task in the plan sequentially, following the code exactly.
3. After implementing, run the automated tests from the "Testing & Verification" section.
4. Run `npm test` to verify no regressions.
5. Commit the work with the commit message specified in the plan.
6. Report back: list files changed, test results (pass/fail with output), any issues.

CRITICAL RULES:
- Follow the plan's code snippets exactly — do not improvise.
- Do NOT modify files not listed in the plan.
- Do NOT skip any task in the plan.
- If a test fails, fix the issue and re-run before committing.
- Never start/stop/restart the build server.
- Never use worktrees or branches.
```

#### 2. Verify Agent Output
After the agent returns, the leader checks:
- [ ] Agent reported all tasks completed
- [ ] Agent reported test results as passing
- [ ] No unexpected files modified

#### 3. Run Verification (leader runs directly)
```bash
npm test                    # JS unit + server tests
npm run test:fantom         # Integration tests (if step touched Swift/JS bridge)
```

#### 4. Handle Failures
If tests fail after agent returns:
- Spawn a NEW agent with the error output and instructions to fix
- Prompt: "Step {N} implementation has test failures. Fix these errors: {error output}. The plan is at {path}. Run `npm test` after fixing to confirm."
- If second agent also fails, inspect the error manually and spawn a third agent with more specific guidance

If agent gets stuck or produces no output:
- Kill the agent, spawn a fresh one with the same instructions

### Step-Specific Agent Instructions

**Step 1a** — `step1a-fetch-post.md`
- Files: Bindings+Registration.swift, bridge/index.js, bridge/types.d.ts, bridge/__tests__/bridge.test.js
- Verify: `npm test` (bridge tests pass)

**Step 1b** — `step1b-form-string-action.md`
- Files: form-action.test.js (create), UIKitMutationApplier.swift, renderer.js
- Verify: `npm test` (form-action + existing tests pass)

**Step 1c** — `step1c-native-mpa-post.md`
- Files: UIKitMutationApplier.swift, ShadowNodeFamily.swift
- Verify: `npm run test:swift` (Swift tests pass)
- Note: This step is mostly Swift — JS tests may not cover it directly

**Step 2** — `step2-server-infrastructure.md`
- Files: server.js, todo-actions.js (create)
- Verify: `npm test`, manually check server starts without error
- Extra: Agent should verify `node-register` assigns $$id by running:
  `cd example && node --conditions react-server -e "require('./server/src/actions/todo-actions'); var a = require('./server/src/actions/todo-actions'); console.log('$$id:', a.addTodo.$$id)"`

**Step 3** — `step3-callserver.md`
- Files: entry.js, ssr-server.js
- Verify: `npm test`

**Step 4a** — `step4a-fizz-form-serialization.md`
- Files: NativeFizzConfig.js, form-action-serialization.test.js (create)
- Verify: `npm test` (new + existing server tests pass)

**Step 4b** — `step4b-form-submit-handling.md`
- Files: UIKitMutationApplier.swift, ShadowNodeFamily.swift, renderer.js, HostConfig.js
- Verify: `npm test`, `npm run test:fantom`

**Step 5** — `step5-ssr-formstate.md`
- Files: NativeFizzServerNode.js, ssr-server.js, InstructionStreamParser.swift, ShadowTreeBuilder.swift, HostConfig.js, renderer.js, entry.js
- Verify: `npm test`, `npm run test:swift`
- Note: This is the largest step (7 files). Agent may need extra turns.

**Step 6** — `step6-todo-demo.md`
- Files: 32-todo-app.js (create), AddTodoForm.jsx (create), TodoAppList.jsx (create), TodoAppItem.jsx (create)
- Verify: `npm test`
- Note: All files are new — lowest risk of regression

### Final Smoke Test (Leader runs after Step 6)

After all steps complete, run the Staggered Loading smoke test:
1. `cd example && npm run dev` (if not already running)
2. `/build demo` to rebuild
3. Load Staggered Loading fixture via prerender
4. `npm run app:log-start` → load fixture → `npm run app:log-read`
5. Verify hydration starts while SSR stream is still delivering
6. Find Counter: `npm run app:snapshot-ui -- --filter Counter`
7. Tap increment: `npm run app:tap -- <x> <y>`
8. Verify counter increments
9. Navigate to Todo App fixture, verify it renders
10. Test add/toggle/delete operations

If smoke test fails, spawn a diagnostic agent to investigate.

## Compaction Instructions

This orchestration will run for a long time. When context is compressed:

### What the leader MUST preserve across compaction:
1. **Current step number** — which step is being executed or was just completed
2. **Completed steps** — list of steps that passed verification
3. **Failed steps** — any steps that needed retry and what the fix was
4. **Test status** — last known test results (pass/fail per suite)
5. **Plan file path** — `docs/plans/2026-03-03-server-actions-step{N}.md` for the current step
6. **Commit history** — the commits made so far (can recover via `git log`)

### What can be safely dropped:
- Detailed file contents from prior steps (re-readable from disk)
- Agent output from completed, verified steps
- Exploration results from the initial planning phase
- Full plan file contents (agents re-read them)

### Recovery after compaction:
If context is compressed mid-execution:
1. Run `git log --oneline -20` to see which steps were committed
2. Run `npm test` to verify current state
3. Resume from the next uncommitted step

### Periodic checkpoints:
After every 3 completed steps, the leader should:
1. Run `git log --oneline -10` to confirm commits
2. Run `npm test` to confirm green
3. Summarize progress in a brief status message to the user

## Error Recovery Patterns

### Agent produces wrong code
- Spawn new agent with: "Read the diff of the last commit (`git diff HEAD~1`). Compare against the plan at {path}. Fix any deviations."

### Test fails after agent commits
- Don't revert. Spawn new agent with: "These tests are failing: {output}. The relevant plan is at {path}. Debug and fix the failures, then run `npm test` to confirm."

### Agent runs out of turns
- Check what was completed via `git status` and `git diff`
- If partial work exists, commit it and spawn a new agent to finish the remaining tasks
- If no work exists, spawn a fresh agent with the same instructions

### Build server not running
- Do NOT start it. Ask the user: "The build server needs to be running for Step {N}. Please start it with `npm run build-server` in a separate terminal."

## File Summary

All plan files to be executed in order:
1. `docs/plans/2026-03-03-server-actions-step1a-fetch-post.md`
2. `docs/plans/2026-03-03-server-actions-step1b-form-string-action.md`
3. `docs/plans/2026-03-03-server-actions-step1c-native-mpa-post.md`
4. `docs/plans/2026-03-03-server-actions-step2-server-infrastructure.md`
5. `docs/plans/2026-03-03-server-actions-step3-callserver.md`
6. `docs/plans/2026-03-03-server-actions-step4a-fizz-form-serialization.md`
7. `docs/plans/2026-03-03-server-actions-step4b-form-submit-handling.md`
8. `docs/plans/2026-03-03-server-actions-step5-ssr-formstate.md`
9. `docs/plans/2026-03-03-server-actions-step6-todo-demo.md`
