# Autonomous QA Agent Team Design

**Date**: 2026-02-18
**Status**: Approved

## Goal

Create a team of Claude Code agents that continuously iterate on the react-dom-native package, finding and fixing bugs autonomously. Two parallel pipelines: one for layout fidelity (e2e fixture comparison between web and native), one for demo app QA (building real features, testing SSR/hydration/Suspense).

## Team Structure

8 agents organized as a Claude Code team (`react-dom-native-qa`):

| # | Role | Skill | Responsibility |
|---|------|-------|----------------|
| 1 | **Team Lead** | `team-orchestrator` | Creates team, seeds tasks, monitors progress, handles compaction recovery |
| 2 | **Layout Builder** | `layout-builder` | Decides which DOM element + style combinations lack coverage, writes fixture JSX files |
| 3 | **Layout QA** | `layout-qa` | Runs LayoutCompare via `/e2e` skill, parses diff output, creates tasks for fixers |
| 4 | **Layout Fixer** | `layout-fixer` | Fixes JS/Swift layout code based on diff reports, runs unit + fantom tests |
| 5 | **Demo Builder** | `demo-builder` | Builds real features in the example app (server + client components) |
| 6 | **Demo QA** | `demo-qa` | Runs example app via `/test-e2e` + `/ssr-hydration` skills, finds runtime/SSR/hydration bugs |
| 7 | **Demo Fixer** | `demo-fixer` | Fixes SSR/Flight/hydration code based on bug reports |
| 8 | **Reviewer** | `code-reviewer` | Reviews all fixer changes across both pipelines — ensures root-cause fixes, not hacks |

## File Ownership

Strict file ownership prevents edit conflicts between agents:

| Agent | Owns (can edit) |
|-------|----------------|
| **Layout Builder** | `tests/e2e/fixtures/*.jsx`, `tests/e2e/fixtures/index.js` |
| **Layout QA** | Nothing (read-only + simulator interaction) |
| **Layout Fixer** | `packages/react-dom-native/src/yoga-layout/defaults.js`, `packages/react-dom-native/src/renderer/HostConfig.js` (style merging only), `packages/react-dom-native/ios/Sources/ShadowTree/YogaStyleApplier.swift`, `packages/react-dom-native/ios/Sources/ShadowTree/ElementDefaults.swift`, `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/UIKitMutationApplier.swift`, related Swift test files |
| **Demo Builder** | `example/server/`, `example/components/`, `example/entry/` |
| **Demo QA** | Nothing (read-only + simulator interaction) |
| **Demo Fixer** | `packages/react-dom-native/src/flight-client/`, `packages/react-dom-native/src/renderer/renderer.js`, `packages/react-dom-native/src/server/`, `packages/react-dom-native/ios/Sources/ReactDomNativeKit/SSR/`, `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift` (hydration functions only) |
| **Reviewer** | Nothing (read-only) |

All agents can read any file in the codebase.

## Workflow Pipelines

### Layout Pipeline (continuous loop)

```
Layout Builder → Layout QA → Layout Fixer → Reviewer → Layout QA (verify)
                                                              ↓
                                                    Layout Builder (next batch)
```

**Layout Builder**:
1. Check HTML element coverage matrix (elements × styles × combinations)
2. Pick next uncovered combination
3. Write fixture JSX + register in `tests/e2e/fixtures/index.js`
4. Create task: "QA fixture: `<name>`"

**Layout QA**:
1. Pick up "QA fixture" task
2. Build JS bundles (`node tests/e2e/scripts/build.js`)
3. Build LayoutCompare app (`build_sim`), launch with logs, tap "Run All"
4. Parse diffs from `[LayoutCompare]` log lines
5. If diffs found → create task: "Fix layout: `<details with diff JSON>`"
6. If no diffs → mark pass, notify builder to continue

**Layout Fixer**:
1. Pick up "Fix layout" task
2. Analyze diff (which property, which element, web vs native values)
3. Determine root cause in defaults.js / Swift files
4. Apply fix
5. Run `npm test && npm run test:fantom` to verify no regressions
6. Create task: "Review: `<fix description>`"
7. After reviewer approves → create task: "Re-QA fixture: `<name>`"

### Demo Pipeline (continuous loop)

```
Demo Builder → Demo QA → Demo Fixer → Reviewer → Demo QA (verify)
                  ↓                                      ↓
          layout bugs → Layout Builder task     Demo Builder (next feature)
```

**Demo Builder**:
1. Plan a real feature (e.g., todo list, profile page, image gallery, forms)
2. Write server components + client components in `example/`
3. Create task: "QA demo: `<feature name>`"

**Demo QA**:
1. Pick up "QA demo" task
2. Start RSC server, build app, launch in simulator
3. Screenshot + snapshot_ui + log capture
4. Check for: hydration errors, visual rendering issues, missing elements, Suspense boundary issues
5. If layout issue → create task for Layout Builder: "Add fixture for `<pattern>`"
6. If SSR/hydration issue → create task: "Fix demo: `<details>`"
7. If all good → mark pass

**Demo Fixer**:
1. Pick up "Fix demo" task
2. Fix SSR/Flight/hydration code
3. Run `npm test && npm run test:fantom`
4. Create task: "Review: `<fix description>`"

### Reviewer (shared across both pipelines)

1. Pick up "Review" task
2. Read the diff/bug report, read the fix
3. Evaluate:
   - Does this fix the root cause, not just the symptom?
   - Is it a hack to pass the comparison without fixing the underlying issue?
   - Does it break other elements or features?
   - Does it match how web CSS / SSR actually works?
4. Approve → mark task done, fixer creates re-QA task
5. Reject → create task back to fixer with actionable feedback

## Simulator Configuration

Two separate simulators to avoid conflicts:

| QA Agent | Simulator | App |
|----------|-----------|-----|
| Layout QA | `Falcon E2E` (existing, `50E9E48E-D7F7-4338-9873-3EB801137EE7`) | LayoutCompare |
| Demo QA | Second simulator (to be created, e.g., `Falcon Demo`) | Example Falcon app |

Each QA agent configures XcodeBuildMCP session defaults for its simulator before operations.

## Persistence Layer

### Team-level state

**File**: `docs/plans/agent-team-state.md`
**Writer**: Team Lead
**Contains**:
- Overall progress summary
- Which pipelines are active
- High-level metrics (X fixtures total, Y passing, Z demos built, W bugs fixed)
- Next actions for each pipeline

### Per-agent state

**Directory**: `docs/plans/agent-state/`
**Files**: One per agent (`layout-builder.md`, `layout-qa.md`, etc.)
**Writers**: Each agent writes its own file

Per-agent state contents:

| Agent | State file contains |
|-------|-------------------|
| **Layout Builder** | Element/style combinations covered, which are next in the matrix, fixture names created |
| **Layout QA** | Last full run results (fixture → diff count), known false positives, outstanding diff reports |
| **Layout Fixer** | Bugs fixed (description + what changed + why), bugs currently working on |
| **Demo Builder** | Features built, features planned, component inventory |
| **Demo QA** | Last test results per feature, known issues, hydration error log |
| **Demo Fixer** | Bugs fixed (description + what changed + why), bugs currently working on |
| **Reviewer** | Review decisions (approved/rejected + rationale), recurring patterns flagged |

**Update frequency**: After every completed task. State is always current.

## Auto-Recovery via Hooks

Three hooks enable fully autonomous operation across context compaction boundaries:

### 1. PreCompact hook (matcher: `auto`)

Fires before auto-compaction. Flushes all agent state files to disk as a safety net.

```bash
# .claude/hooks/pre-compact.sh
#!/bin/bash
# Write a compaction marker with timestamp
mkdir -p docs/plans/agent-state
echo "Compacted at $(date -u +%Y-%m-%dT%H:%M:%SZ)" > docs/plans/agent-state/COMPACTED
```

### 2. SessionStart hook (matcher: `compact`)

Fires after compaction. Injects recovery context so the lead knows to rebuild the team.

```bash
# .claude/hooks/session-start-compact.sh
#!/bin/bash
if [ -f docs/plans/agent-state/COMPACTED ]; then
  cat <<'EOF'
You were orchestrating a react-dom-native QA agent team. Context was compacted.
To recover:
1. Read docs/plans/agent-team-state.md for overall progress
2. Read docs/plans/agent-state/*.md for per-agent state
3. Invoke the /team-orchestrator skill to rebuild the team and continue
EOF
  # Clean up marker
  rm -f docs/plans/agent-state/COMPACTED
fi
```

### 3. TaskCompleted hook

Quality gate: runs tests before allowing tasks to be marked complete (for fixer agents).

```bash
# .claude/hooks/task-completed.sh
#!/bin/bash
INPUT=$(cat)
TASK_SUBJECT=$(echo "$INPUT" | jq -r '.task_subject')
TEAMMATE=$(echo "$INPUT" | jq -r '.teammate_name // empty')

# Only gate fixer agents
if [[ "$TEAMMATE" == *"fixer"* ]]; then
  if ! cd /Users/rickhanlonii/oss/falcon && npm test 2>&1; then
    echo "Unit tests failing. Fix before completing: $TASK_SUBJECT" >&2
    exit 2
  fi
fi

exit 0
```

### Recovery flow

```
Normal operation → auto-compaction triggers
  → PreCompact hook: flush state files, write COMPACTED marker
  → compaction happens (context shrinks)
  → SessionStart(compact) hook: inject recovery instructions
  → lead reads state files, invokes /team-orchestrator
  → team recreated, tasks seeded from state, operation continues
```

## Skills

8 new skills in `.claude/skills/`:

| Skill | Agent | Key knowledge |
|-------|-------|---------------|
| `team-orchestrator` | Team Lead | How to create the team, seed initial tasks, monitor progress, update state files, handle recovery after compaction |
| `layout-builder` | Layout Builder | HTML element matrix (div, span, p, h1-h6, ul, ol, li, a, img, button, input, form, table, etc.), CSS property combinations (display, flexbox, box-model, borders, text, overflow, position), systematic expansion strategy, fixture writing conventions |
| `layout-qa` | Layout QA | `/e2e` skill workflow, diff log format parsing, false positive identification (fontSize on containers), actionable bug report format |
| `layout-fixer` | Layout Fixer | Yoga layout engine internals, web CSS box model mapping, YGConfigSetUseWebDefaults behavior, string vs integer enum values in YogaStyleApplier, `#text` node inheritance, margin collapsing workarounds, full file ownership list |
| `demo-builder` | Demo Builder | RSC architecture (server vs client components), Flight wire format, Suspense patterns, what real apps need (forms, lists, navigation, images, async data loading), example app conventions |
| `demo-qa` | Demo QA | `/test-e2e` workflow, `/ssr-hydration` knowledge, hydration error signatures in logs, view hierarchy inspection, bug classification (layout → layout team, SSR → demo fixer) |
| `demo-fixer` | Demo Fixer | Flight client deserialization, Fizz rendering config (NativeFizzConfig.js), SSR instruction format, hydration traversal functions, Suspense boundary lifecycle, Bindings.swift bridge functions |
| `code-reviewer` | Reviewer | Both layout and SSR system knowledge, root cause vs hack detection, CSS spec conformance checking, regression assessment, actionable rejection feedback format |

## Agent Spawn Pattern

Each agent is spawned with a minimal prompt that invokes its skill:

```
You are the Layout Builder on the react-dom-native-qa team.
Invoke the /layout-builder skill and follow its instructions.
Read your state file at docs/plans/agent-state/layout-builder.md for prior progress.
Check the task list for your work.
```

Skills contain the durable knowledge. Spawn prompts are kept minimal so they survive compaction well.

## Constraints and Risks

| Risk | Mitigation |
|------|-----------|
| Agents editing the same file | Strict file ownership per agent |
| Simulator conflicts | Two separate simulators |
| Context compaction loses team state | PreCompact flush + SessionStart recovery + continuous state writing |
| Fixer hacks to pass tests | Reviewer agent with explicit anti-hack instructions |
| Infinite loops (fix → fail → fix) | Reviewer escalates recurring failures; fixer state tracks attempts per bug |
| Token cost | Accepted — not a constraint per user |
| Teammate not marking tasks done | TaskCompleted hook as quality gate; lead monitors stalled tasks |
