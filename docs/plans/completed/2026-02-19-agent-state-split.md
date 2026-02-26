# Agent State File Split Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the append-only agent state file system with a two-file system (current + log) across all 8 skill files.

**Architecture:** Each agent gets two state files: a current file (overwritten each update) with a rigid template, and a log file (append-only) for audit history. The team orchestrator's references are updated accordingly.

**Tech Stack:** Markdown skill files in `.claude/skills/*/SKILL.md`

---

### Task 1: Update layout-builder skill

**Files:**
- Modify: `.claude/skills/layout-builder/SKILL.md:78-111` (Workflow step 6 + State File Format section)

**Step 1: Replace "State File Format" section and update workflow step 6**

In `.claude/skills/layout-builder/SKILL.md`, replace lines 99-111 (the entire `## State File Format` section) with:

```markdown
## State Files

You maintain two files — a **current** file and a **log** file.

### Current file: `docs/plans/agent-state/layout-builder.md`

**OVERWRITE** this file every time you update. It always reflects your latest state. Use this exact template:

```markdown
# Layout Builder — Current State

**Status**: idle | working
**Current task**: <description or "none">
**Blocked on**: <what, if anything>

## Metrics
- Fixtures written: N
- Total in project: N
- Coverage: <areas covered>

## Next
- Target: <next fixture to write>
- Elements: <which elements>
- Properties: <which properties>
```

### Log file: `docs/plans/agent-state/layout-builder.log.md`

**APPEND** a timestamped entry after completing each task. Never overwrite this file. This is an audit trail — you never need to read it.

```markdown
---
### <timestamp>
- Completed: <what was done>
- Result: <outcome — pass/fail, metrics>
- Files: <created or changed>
```
```

Also update Workflow step 6 (line 85-86) from:
```
6. Update your state file with the new fixture
```
to:
```
6. Update your state files: append to `layout-builder.log.md`, then overwrite `layout-builder.md` with current state
```

**Step 2: Verify the edit**

Read `.claude/skills/layout-builder/SKILL.md` and confirm:
- The old "APPEND-ONLY" section is gone
- The new "State Files" section has both current template and log format
- Workflow step 6 references both files

**Step 3: Commit**

```bash
git add .claude/skills/layout-builder/SKILL.md
git commit -m "feat(skills): split layout-builder state into current + log files"
```

---

### Task 2: Update demo-builder skill

**Files:**
- Modify: `.claude/skills/demo-builder/SKILL.md:96-128` (Workflow step 6 + State File Format section)

**Step 1: Replace "State File Format" section and update workflow step 6**

In `.claude/skills/demo-builder/SKILL.md`, replace lines 116-128 (the entire `## State File Format` section) with:

```markdown
## State Files

You maintain two files — a **current** file and a **log** file.

### Current file: `docs/plans/agent-state/demo-builder.md`

**OVERWRITE** this file every time you update. It always reflects your latest state. Use this exact template:

```markdown
# Demo Builder — Current State

**Status**: idle | working
**Current task**: <description or "none">
**Blocked on**: <what, if anything>

## Metrics
- Features built: N
- Features tested: N
- Coverage: <patterns exercised>

## Next
- Target: <next feature to build>
- Details: <what React patterns it will exercise>
```

### Log file: `docs/plans/agent-state/demo-builder.log.md`

**APPEND** a timestamped entry after completing each task. Never overwrite this file. This is an audit trail — you never need to read it.

```markdown
---
### <timestamp>
- Completed: <what was done>
- Result: <outcome — pass/fail, metrics>
- Files: <created or changed>
```
```

Also update Workflow step 6 (line 102) from:
```
6. Update your state file
```
to:
```
6. Update your state files: append to `demo-builder.log.md`, then overwrite `demo-builder.md` with current state
```

**Step 2: Verify the edit**

Read `.claude/skills/demo-builder/SKILL.md` and confirm the old section is replaced and workflow step 6 is updated.

**Step 3: Commit**

```bash
git add .claude/skills/demo-builder/SKILL.md
git commit -m "feat(skills): split demo-builder state into current + log files"
```

---

### Task 3: Update layout-fixer skill

**Files:**
- Modify: `.claude/skills/layout-fixer/SKILL.md:80-81,104-117` (Workflow step 8 + State File Format section)

**Step 1: Replace "State File Format" section and update workflow step 8**

In `.claude/skills/layout-fixer/SKILL.md`, replace lines 104-117 (the entire `## State File Format` section) with:

```markdown
## State Files

You maintain two files — a **current** file and a **log** file.

### Current file: `docs/plans/agent-state/layout-fixer.md`

**OVERWRITE** this file every time you update. It always reflects your latest state. Use this exact template:

```markdown
# Layout Fixer — Current State

**Status**: idle | fixing
**Current task**: <fixture/feature and what's wrong>
**Blocked on**: <what, if anything>
**Attempt**: N

## Current Fix
- Root cause: <analysis>
- Files changed: <list>
- Tests: npm test PASS/FAIL, npm run test:swift PASS/FAIL

## Next
- Awaiting: <next assignment>
```

### Log file: `docs/plans/agent-state/layout-fixer.log.md`

**APPEND** a timestamped entry after completing each task. Never overwrite this file. This is an audit trail — you never need to read it.

```markdown
---
### <timestamp>
- Completed: <what was done>
- Result: <outcome — pass/fail, metrics>
- Files: <created or changed>
```
```

Also update Workflow step 8 (line 80) from:
```
8. Append to your state file
```
to:
```
8. Update your state files: append to `layout-fixer.log.md`, then overwrite `layout-fixer.md` with current state
```

**Step 2: Verify the edit**

Read `.claude/skills/layout-fixer/SKILL.md` and confirm.

**Step 3: Commit**

```bash
git add .claude/skills/layout-fixer/SKILL.md
git commit -m "feat(skills): split layout-fixer state into current + log files"
```

---

### Task 4: Update demo-fixer (diagnoser) skill

**Files:**
- Modify: `.claude/skills/demo-fixer/SKILL.md:71,119-131` (Workflow step 7 + State File Format section)

**Step 1: Replace "State File Format" section and update workflow step 7**

In `.claude/skills/demo-fixer/SKILL.md`, replace lines 119-131 (the entire `## State File Format` section) with:

```markdown
## State Files

You maintain two files — a **current** file and a **log** file.

### Current file: `docs/plans/agent-state/demo-fixer.md`

**OVERWRITE** this file every time you update. It always reflects your latest state. Use this exact template:

```markdown
# Demo Diagnoser — Current State

**Status**: idle | diagnosing
**Current task**: <feature/error being diagnosed>
**Blocked on**: <what, if anything>

## Current Diagnosis
- Symptom: <what QA reported>
- Root cause: <analysis so far>
- Report: <path to diagnosis report, if written>

## Next
- Awaiting: <next assignment>
```

### Log file: `docs/plans/agent-state/demo-fixer.log.md`

**APPEND** a timestamped entry after completing each task. Never overwrite this file. This is an audit trail — you never need to read it.

```markdown
---
### <timestamp>
- Completed: <what was done>
- Result: <outcome — pass/fail, metrics>
- Files: <created or changed>
```
```

Also update Workflow step 7 (line 71) from:
```
7. Append to your state file
```
to:
```
7. Update your state files: append to `demo-fixer.log.md`, then overwrite `demo-fixer.md` with current state
```

**Step 2: Verify the edit**

Read `.claude/skills/demo-fixer/SKILL.md` and confirm.

**Step 3: Commit**

```bash
git add .claude/skills/demo-fixer/SKILL.md
git commit -m "feat(skills): split demo-fixer state into current + log files"
```

---

### Task 5: Update layout-qa skill

**Files:**
- Modify: `.claude/skills/layout-qa/SKILL.md:133-145` (State File Format section)

**Step 1: Replace "State File Format" section**

In `.claude/skills/layout-qa/SKILL.md`, replace lines 133-145 (the entire `## State File Format` section) with:

```markdown
## State Files

You maintain two files — a **current** file and a **log** file.

### Current file: `docs/plans/agent-state/layout-qa.md`

**OVERWRITE** this file every time you update. It always reflects your latest state. Use this exact template:

```markdown
# Layout QA — Current State

**Status**: idle | testing
**Current task**: <description or "none">
**Blocked on**: <what, if anything>

## Latest Results
- Passing: X/Y
- Failing: <list with diff counts>

## Next
- Awaiting: <what fixture to test next>
```

### Log file: `docs/plans/agent-state/layout-qa.log.md`

**APPEND** a timestamped entry after completing each task. Never overwrite this file. This is an audit trail — you never need to read it.

```markdown
---
### <timestamp>
- Completed: <what was done>
- Result: <outcome — pass/fail, metrics>
- Files: <created or changed>
```
```

The layout-qa workflow doesn't have an explicit "update state file" step — the state is updated after creating fix tasks. No workflow step change needed.

**Step 2: Verify the edit**

Read `.claude/skills/layout-qa/SKILL.md` and confirm.

**Step 3: Commit**

```bash
git add .claude/skills/layout-qa/SKILL.md
git commit -m "feat(skills): split layout-qa state into current + log files"
```

---

### Task 6: Update demo-qa skill

**Files:**
- Modify: `.claude/skills/demo-qa/SKILL.md:128-141` (State File Format section)

**Step 1: Replace "State File Format" section**

In `.claude/skills/demo-qa/SKILL.md`, replace lines 128-141 (the entire `## State File Format` section) with:

```markdown
## State Files

You maintain two files — a **current** file and a **log** file.

### Current file: `docs/plans/agent-state/demo-qa.md`

**OVERWRITE** this file every time you update. It always reflects your latest state. Use this exact template:

```markdown
# Demo QA — Current State

**Status**: idle | testing
**Current task**: <description or "none">
**Blocked on**: <what, if anything>

## Latest Results
- Feature: <last tested feature>
- Verdict: PASS / FAIL
- Issues: <description or "none">

## Next
- Awaiting: <what feature to test next>
```

### Log file: `docs/plans/agent-state/demo-qa.log.md`

**APPEND** a timestamped entry after completing each task. Never overwrite this file. This is an audit trail — you never need to read it.

```markdown
---
### <timestamp>
- Completed: <what was done>
- Result: <outcome — pass/fail, metrics>
- Files: <created or changed>
```
```

**Step 2: Verify the edit**

Read `.claude/skills/demo-qa/SKILL.md` and confirm.

**Step 3: Commit**

```bash
git add .claude/skills/demo-qa/SKILL.md
git commit -m "feat(skills): split demo-qa state into current + log files"
```

---

### Task 7: Update code-reviewer skill

**Files:**
- Modify: `.claude/skills/code-reviewer/SKILL.md:84-96` (State File Format section)

**Step 1: Replace "State File Format" section**

In `.claude/skills/code-reviewer/SKILL.md`, replace lines 84-96 (the entire `## State File Format` section) with:

```markdown
## State Files

You maintain two files — a **current** file and a **log** file.

### Current file: `docs/plans/agent-state/reviewer.md`

**OVERWRITE** this file every time you update. It always reflects your latest state. Use this exact template:

```markdown
# Reviewer — Current State

**Status**: idle | reviewing
**Current task**: <what's being reviewed>
**Blocked on**: <what, if anything>

## Current Review
- Fix by: <which agent>
- Fixture/feature: <name>
- Decision: pending | APPROVED | REJECTED
- Rationale: <if decided>

## Next
- Awaiting: <next review assignment>
```

### Log file: `docs/plans/agent-state/reviewer.log.md`

**APPEND** a timestamped entry after completing each task. Never overwrite this file. This is an audit trail — you never need to read it.

```markdown
---
### <timestamp>
- Completed: <what was done>
- Result: <outcome — pass/fail, metrics>
- Files: <created or changed>
```
```

**Step 2: Verify the edit**

Read `.claude/skills/code-reviewer/SKILL.md` and confirm.

**Step 3: Commit**

```bash
git add .claude/skills/code-reviewer/SKILL.md
git commit -m "feat(skills): split reviewer state into current + log files"
```

---

### Task 8: Update team-orchestrator skill

**Files:**
- Modify: `.claude/skills/team-orchestrator/SKILL.md` (multiple sections)

**Step 1: Update "Team Cleanup" section**

In `.claude/skills/team-orchestrator/SKILL.md`, change the Team Cleanup description from:

```
This is safe — agent state is preserved in `docs/plans/agent-state/*.md` (append-only files), so no work history is lost.
```

to:

```
This is safe — agent state is preserved in `docs/plans/agent-state/*.md` (current state) and `docs/plans/agent-state/*.log.md` (audit history), so no work is lost.
```

**Step 2: Update "State File Updates" section**

Replace the entire `## State File Updates` section (lines 196-203) with:

```markdown
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
```

**Step 3: Update "Restart Procedure" reference**

In the Restart Procedure section, change step 6 from:

```
6. The new agent reads its append-only state file and picks up where the old one left off
```

to:

```
6. The new agent reads its current state file and picks up where the old one left off
```

**Step 4: Update "Record Assessment" line**

In the "Assess Current State" section, the "Record Assessment" line says:
```
Write findings to `docs/plans/agent-team-state.md` before spawning teammates.
```

Change to:
```
Overwrite `docs/plans/agent-team-state.md` with findings before spawning teammates.
```

**Step 5: Update "Monitoring Loop" step 4**

Change:
```
4. Write `docs/plans/agent-team-state.md` after every significant milestone
```

to:
```
4. Overwrite `docs/plans/agent-team-state.md` and append to `docs/plans/agent-team-state.log.md` after every significant milestone
```

**Step 6: Verify the edit**

Read `.claude/skills/team-orchestrator/SKILL.md` and confirm all references are updated.

**Step 7: Commit**

```bash
git add .claude/skills/team-orchestrator/SKILL.md
git commit -m "feat(skills): update team orchestrator for current + log state files"
```
