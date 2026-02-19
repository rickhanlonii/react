# Agent State File Split

## Problem

The append-only agent state files have two failures:
1. The team lead ignores the append-only rule and overwrites agent files
2. Growing files confuse agents — they parse through history to find current state, leading to degraded behavior as context fills up

## Solution

Split each agent's state into two files with different write semantics:

| File | Example | Write rule | Who reads |
|------|---------|-----------|-----------|
| **Current** | `demo-builder.md` | **Overwrite** — always reflects latest state | Agent (on startup/recovery), team lead (monitoring) |
| **Log** | `demo-builder.log.md` | **Append** — timestamped entries for completed work | User only (audit trail) |

Same pattern for the team lead: `agent-team-state.md` (current) + `agent-team-state.log.md` (log).

No scripts needed. Agents do two writes per work cycle: overwrite current, append to log.

## Current File Templates

Each role gets a rigid template. Agents overwrite the entire file each time they update.

### Builder (layout-builder, demo-builder)

```markdown
# <Role> — Current State

**Status**: idle | working
**Current task**: <description or "none">
**Blocked on**: <what, if anything>

## Metrics
- Fixtures written: N (or Features built: N)
- Total in project: N
- Coverage: <areas covered>

## Next
- Target: <next item to build>
- Details: <specifics>
```

### QA (layout-qa, demo-qa)

```markdown
# <Role> — Current State

**Status**: idle | testing
**Current task**: <description or "none">
**Blocked on**: <what, if anything>

## Latest Results
- Passing: X/Y
- Failing: <list with diff counts>

## Next
- Awaiting: <what fixture/feature to test next>
```

### Fixer (layout-fixer, demo-fixer)

```markdown
# <Role> — Current State

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

### Team Lead (agent-team-state.md)

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
| layout-builder | layout-builder-2 | idle | — |
| ... | ... | ... | ... |
```

## Log File Format

Agents append a timestamped entry to their log file after completing each task:

```markdown
---
### <timestamp>
- Completed: <what was done>
- Result: <outcome — pass/fail, metrics>
- Files: <created or changed>
```

The team lead appends session summaries and milestones to `agent-team-state.log.md`.

## Agent Workflow (per cycle)

1. Read current file on startup/recovery
2. Do assigned work
3. Append completed entry to log file
4. Overwrite current file with new state
5. Notify team lead / go idle

## Skill File Changes

Update all 7 agent skills + team orchestrator to replace the "State File Format" section with the new two-file system:
- Replace "APPEND-ONLY" with "OVERWRITE current, APPEND to log"
- Add the role-specific template
- Add the log file format
- Clarify: team lead does NOT read log files

## Recovery

Agents read only their current file on startup. Since it contains status, metrics, and next target, that's sufficient to resume. The log file is never read by agents or the team lead — it's purely for user audit.
