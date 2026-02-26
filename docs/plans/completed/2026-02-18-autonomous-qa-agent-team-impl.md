# Autonomous QA Agent Team Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Implement the autonomous QA agent team designed in `docs/plans/2026-02-18-autonomous-qa-agent-team-design.md` — 8 skills, 3 hooks, state directories, and a team orchestrator that ties it all together.

**Architecture:** Claude Code agent team with shared task list. Two parallel pipelines (layout + demo), each with builder/QA/fixer roles, plus a shared reviewer. Skills encode durable per-agent knowledge. Hooks handle auto-recovery across context compaction and quality gating.

**Tech Stack:** Claude Code teams (TeamCreate), Claude Code skills (`.claude/skills/`), Claude Code hooks (`.claude/settings.json`), XcodeBuildMCP, bash scripts.

---

### Task 1: Create state directories and initial state files

**Files:**
- Create: `docs/plans/agent-state/.gitkeep`
- Create: `docs/plans/agent-team-state.md`

**Step 1: Create the agent-state directory**

```bash
mkdir -p /Users/rickhanlonii/oss/falcon/docs/plans/agent-state
touch /Users/rickhanlonii/oss/falcon/docs/plans/agent-state/.gitkeep
```

**Step 2: Create the initial team state file**

Create `docs/plans/agent-team-state.md`:

```markdown
# Agent Team State

**Status**: Not started
**Last updated**: --

## Metrics

- Fixtures: 10 existing, 0 new
- Passing: 10/10
- Demo features: 2 existing (Counter, Search)
- Bugs fixed: 0

## Layout Pipeline

Pending first run.

## Demo Pipeline

Pending first run.

## Next Actions

- Layout Builder: Survey element coverage, write first batch of fixtures
- Demo Builder: Build first new demo feature
```

**Step 3: Commit**

```bash
git add docs/plans/agent-state/.gitkeep docs/plans/agent-team-state.md
git commit -m "Add agent team state directories and initial state file"
```

---

### Task 2: Create hook scripts

**Files:**
- Create: `.claude/hooks/pre-compact.sh`
- Create: `.claude/hooks/session-start-compact.sh`
- Create: `.claude/hooks/task-completed.sh`

**Step 1: Create the hooks directory**

```bash
mkdir -p /Users/rickhanlonii/oss/falcon/.claude/hooks
```

**Step 2: Create the PreCompact hook**

Create `.claude/hooks/pre-compact.sh`:

```bash
#!/bin/bash
# PreCompact hook: write compaction marker before context is compacted.
# Agents write state continuously, so this is a safety net.
mkdir -p "$CLAUDE_PROJECT_DIR/docs/plans/agent-state"
echo "Compacted at $(date -u +%Y-%m-%dT%H:%M:%SZ)" > "$CLAUDE_PROJECT_DIR/docs/plans/agent-state/COMPACTED"
exit 0
```

**Step 3: Create the SessionStart (compact) hook**

Create `.claude/hooks/session-start-compact.sh`:

```bash
#!/bin/bash
# SessionStart hook (compact matcher): inject recovery context after compaction.
MARKER="$CLAUDE_PROJECT_DIR/docs/plans/agent-state/COMPACTED"
if [ -f "$MARKER" ]; then
  TIMESTAMP=$(cat "$MARKER")
  cat <<EOF
You were orchestrating a react-dom-native QA agent team. Context was compacted ($TIMESTAMP).
To recover:
1. Read docs/plans/agent-team-state.md for overall progress
2. Read docs/plans/agent-state/*.md for per-agent state
3. Invoke the /team-orchestrator skill to rebuild the team and continue
EOF
  rm -f "$MARKER"
fi
exit 0
```

**Step 4: Create the TaskCompleted hook**

Create `.claude/hooks/task-completed.sh`:

```bash
#!/bin/bash
# TaskCompleted hook: quality gate for fixer agents.
# Runs unit tests before allowing fixers to mark tasks complete.
INPUT=$(cat)
TEAMMATE=$(echo "$INPUT" | jq -r '.teammate_name // empty')

# Only gate fixer agents
if [[ "$TEAMMATE" == *"fixer"* ]]; then
  cd "$CLAUDE_PROJECT_DIR" || exit 0
  if ! npm test --silent 2>&1; then
    echo "Unit tests failing. Fix tests before completing this task." >&2
    exit 2
  fi
fi

exit 0
```

**Step 5: Make all scripts executable**

```bash
chmod +x /Users/rickhanlonii/oss/falcon/.claude/hooks/pre-compact.sh
chmod +x /Users/rickhanlonii/oss/falcon/.claude/hooks/session-start-compact.sh
chmod +x /Users/rickhanlonii/oss/falcon/.claude/hooks/task-completed.sh
```

**Step 6: Commit**

```bash
git add .claude/hooks/
git commit -m "Add hooks for auto-recovery and task quality gating"
```

---

### Task 3: Register hooks in settings

**Files:**
- Modify: `.claude/settings.json`

**Step 1: Add hook configuration to settings.json**

Add the `"hooks"` key to the existing `.claude/settings.json` (preserve existing `permissions` and `enabledPlugins`):

```json
{
  "permissions": {
    "allow": [
      "Bash(cd /Users/rickhanlonii/oss/falcon:*)",
      "Bash(npm:*)",
      "Bash(npx:*)",
      "Bash(node:*)",
      "Bash(git:*)",
      "Bash(mkdir:*)",
      "Bash(swift build:*)",
      "Bash(swift test:*)",
      "Bash(test:*)",
      "mcp__XcodeBuildMCP__*",
      "WebSearch",
      "WebFetch"
    ],
    "deny": [
      "Bash(xcrun:*)",
      "Bash(xcodebuild:*)",
      "Bash(codesign:*)",
      "Bash(plutil:*)",
      "Bash(/usr/libexec/PlistBuddy:*)"
    ]
  },
  "enabledPlugins": {
    "swift-lsp@claude-plugins-official": true
  },
  "hooks": {
    "PreCompact": [
      {
        "matcher": "auto",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/pre-compact.sh",
            "timeout": 10
          }
        ]
      }
    ],
    "SessionStart": [
      {
        "matcher": "compact",
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/session-start-compact.sh",
            "timeout": 10
          }
        ]
      }
    ],
    "TaskCompleted": [
      {
        "hooks": [
          {
            "type": "command",
            "command": "\"$CLAUDE_PROJECT_DIR\"/.claude/hooks/task-completed.sh",
            "timeout": 120
          }
        ]
      }
    ]
  }
}
```

**Step 2: Commit**

```bash
git add .claude/settings.json
git commit -m "Register PreCompact, SessionStart, and TaskCompleted hooks"
```

---

### Task 4: Create the `team-orchestrator` skill

**Files:**
- Create: `.claude/skills/team-orchestrator/SKILL.md`

**Step 1: Write the skill**

Create `.claude/skills/team-orchestrator/SKILL.md`:

````markdown
---
name: team-orchestrator
description: Orchestrate the autonomous QA agent team for react-dom-native. Creates team, spawns agents, seeds tasks, monitors progress, handles recovery.
argument-hint: <action> e.g. "start", "resume", "status"
---

# Team Orchestrator

Manages the `react-dom-native-qa` agent team: 7 teammates across two parallel pipelines (layout + demo) plus a shared reviewer.

## Quick Start

1. Call `TeamCreate` with `team_name: "react-dom-native-qa"`
2. Spawn 7 teammates (see Spawn section below)
3. Seed initial tasks (see Seeding section below)
4. Enter monitoring loop

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
| `demo-fixer` | `You are the Demo Fixer. Invoke the /demo-fixer skill. Read docs/plans/agent-state/demo-fixer.md if it exists. Check TaskList for work.` |
| `reviewer` | `You are the Reviewer. Invoke the /code-reviewer skill. Read docs/plans/agent-state/reviewer.md if it exists. Check TaskList for work.` |

## Seed Initial Tasks (Fresh Start)

Create these tasks with `TaskCreate`:

1. **"Survey element coverage and write first fixture batch"** — assign to `layout-builder`
2. **"Build first demo feature"** — assign to `demo-builder`

## Seed Tasks (Recovery)

Read each agent's state file to determine what was in progress:
- Incomplete "QA fixture" tasks → recreate for `layout-qa`
- Incomplete "Fix layout" tasks → recreate for `layout-fixer`
- Incomplete "Review" tasks → recreate for `reviewer`
- Same pattern for demo pipeline

## Monitoring Loop

After seeding tasks, continuously:
1. Check `TaskList` for stalled/blocked work
2. If a pipeline is idle (all tasks done), tell the builder to start the next batch
3. Write `docs/plans/agent-team-state.md` after every significant milestone
4. If teammates report issues, triage and redirect

## State File Updates

After every milestone, update `docs/plans/agent-team-state.md` with:
- Current fixture count and pass rate
- Demo features built and tested
- Bugs found and fixed
- What each pipeline is working on

## Shutdown

When done or when explicitly asked:
1. Send `shutdown_request` to all teammates
2. Wait for all to confirm
3. Call `TeamDelete`
4. Final update to state file
````

**Step 2: Commit**

```bash
git add .claude/skills/team-orchestrator/
git commit -m "Add team-orchestrator skill"
```

---

### Task 5: Create the `layout-builder` skill

**Files:**
- Create: `.claude/skills/layout-builder/SKILL.md`

**Step 1: Write the skill**

Create `.claude/skills/layout-builder/SKILL.md`:

````markdown
---
name: layout-builder
description: Layout Builder agent — systematically writes e2e fixture JSX files testing DOM element + style combinations.
---

# Layout Builder

You systematically expand e2e test coverage by writing fixture JSX files that test combinations of HTML elements and CSS styles.

## Your Role

- Write fixture JSX files in `tests/e2e/fixtures/`
- Register them in `tests/e2e/fixtures/index.js`
- Create "QA fixture" tasks for the Layout QA agent
- Track coverage in your state file

## File Ownership

You may ONLY edit:
- `tests/e2e/fixtures/*.jsx` (create new files)
- `tests/e2e/fixtures/index.js` (add registrations)

## Fixture Conventions

Every fixture must follow this exact pattern:

```jsx
'use strict';

var React = require('react');

module.exports = function FixtureName() {
  return (
    <div>
      {/* Test elements with inline styles only */}
    </div>
  );
};
```

Rules:
- `'use strict'` at top
- `var React = require('react')` — CommonJS, not ES modules
- `module.exports = function` — named function export
- Inline styles only (no CSS classes)
- Numeric values for dimensions (width, height, margin, padding)
- Hex colors (e.g., `'#eeeeee'`)
- Keep focused on one layout concern per fixture
- Use descriptive kebab-case names (e.g., `text-overflow`, `flex-wrap-row`)

To register, add to `tests/e2e/fixtures/index.js`:
```js
'fixture-name': {component: require('./fixture-name'), description: 'What it tests'},
```

## Coverage Matrix

Systematically test combinations from this matrix. Check your state file for what's been covered.

### Elements to test:
`div`, `span`, `p`, `h1`-`h6`, `ul`, `ol`, `li`, `a`, `button`, `input`, `form`, `table`, `tr`, `td`, `th`, `img`, `label`, `section`, `header`, `footer`, `nav`, `main`, `article`, `aside`

### Style properties to test:
- **Box model**: width, height, minWidth, maxWidth, minHeight, maxHeight, margin (all sides), padding (all sides)
- **Flexbox**: flexDirection, justifyContent, alignItems, alignSelf, flexWrap, flexGrow, flexShrink, flexBasis, gap, rowGap, columnGap
- **Borders**: borderWidth (all sides), borderColor, borderRadius, borderStyle
- **Text**: fontSize, fontWeight, color, textAlign, lineHeight, textDecoration, textTransform
- **Visual**: backgroundColor, opacity, overflow, display
- **Position**: position (relative/absolute), top, right, bottom, left, zIndex

### Expansion strategy:
1. **Single element + single property** (simplest, do these first)
2. **Single element + multiple properties** (e.g., div with flex + gap + padding)
3. **Nested elements** (parent-child property interactions)
4. **Text inside containers** (p inside div, span inside p, mixed text/elements)
5. **Complex layouts** (real-world patterns: cards, lists, grids, forms)

## Workflow

1. Read your state file (`docs/plans/agent-state/layout-builder.md`) to see what's covered
2. Pick the next uncovered combination from the matrix
3. Write the fixture JSX file
4. Register in index.js
5. Create a task: "QA fixture: `<fixture-name>` — tests `<description>`"
6. Update your state file with the new fixture
7. Repeat

## State File Format

Write to `docs/plans/agent-state/layout-builder.md`:

```markdown
# Layout Builder State

## Fixtures Created
- `fixture-name`: description (status: pending-qa / passing / has-diffs)

## Coverage
### Elements tested: div, p, h1, span, ...
### Properties tested: flexDirection, gap, margin, ...
### Next target: <what to test next>
```
````

**Step 2: Commit**

```bash
git add .claude/skills/layout-builder/
git commit -m "Add layout-builder skill"
```

---

### Task 6: Create the `layout-qa` skill

**Files:**
- Create: `.claude/skills/layout-qa/SKILL.md`

**Step 1: Write the skill**

Create `.claude/skills/layout-qa/SKILL.md`:

````markdown
---
name: layout-qa
description: Layout QA agent — runs LayoutCompare, parses diffs, creates tasks for fixers.
---

# Layout QA

You run the LayoutCompare e2e test app and analyze results to find layout differences between web and native rendering.

## Your Role

- Run LayoutCompare via the `/e2e` skill
- Parse diff results from the HTTP results server
- Create "Fix layout" tasks for the Layout Fixer when diffs are found
- Track results in your state file

## File Ownership

You are **read-only**. Do not edit any source files. You only interact with the simulator and create tasks.

## Setup

Before your first run, configure XcodeBuildMCP for the LayoutCompare app:
```
session_set_defaults:
  projectPath: tests/e2e/LayoutCompare/LayoutCompare/LayoutCompare.xcodeproj
  scheme: LayoutCompare
  simulatorName: Falcon E2E
  simulatorId: 50E9E48E-D7F7-4338-9873-3EB801137EE7
```

Start the e2e dev server if not running:
```bash
cd /Users/rickhanlonii/oss/falcon && npm run dev:e2e &
```

## Workflow: Run All Fixtures

1. Build and launch: `build_run_sim` (or `build_sim` + `launch_app_sim` with args `["--run-all"]`)
2. Wait 3-5 seconds for fixtures to complete
3. Fetch results: `WebFetch http://localhost:6101/results`
4. If `status` is `"running"`, wait 2s and poll again
5. When `status` is `"complete"`, parse the results

## Parsing Results

The results JSON looks like:
```json
{
  "status": "complete",
  "passed": 10,
  "total": 12,
  "fixtures": {
    "div-basic": { "passed": true, "elements": 3, "diffs": [] },
    "new-fixture": { "passed": false, "elements": 5, "diffs": [
      { "path": "root > div[0]", "property": "height", "web": 100, "native": 84, "delta": 16 }
    ]}
  }
}
```

## Creating Fix Tasks

For each failing fixture, create a task with this format:

**Subject**: `Fix layout: <fixture-name> — <N> diffs`

**Description** (include ALL of this):
```
Fixture: <fixture-name>
Description: <what the fixture tests>
Elements compared: <N>
Diffs found: <N>

Diffs:
1. path=<path> property=<property> web=<web-value> native=<native-value> delta=<delta>
2. ...

Fixture source: tests/e2e/fixtures/<fixture-name>.jsx
```

## Known False Positives

Ignore these diffs — they are expected:
- `fontSize` on non-text container elements (div, etc.) — web reports computed fontSize via getComputedStyle but native containers don't set fontSize
- Diffs within 2px tolerance are already filtered by LayoutCompare

## Re-QA After Fixes

When a fixer completes and the reviewer approves, you'll get a "Re-QA fixture" task:
1. If JS-only change: the dev server auto-rebuilds, wait 2-3s, poll results
2. If Swift change: `build_run_sim`, wait, poll results
3. If still failing → create new fix task with updated diffs
4. If passing → mark task complete, notify layout-builder

## State File Format

Write to `docs/plans/agent-state/layout-qa.md`:

```markdown
# Layout QA State

## Last Full Run
- Date: <timestamp>
- Passed: X/Y

## Fixture Results
- `fixture-name`: PASS or FAIL (N diffs)

## Outstanding Fix Tasks
- Task: "Fix layout: ..." — assigned to layout-fixer
```
````

**Step 2: Commit**

```bash
git add .claude/skills/layout-qa/
git commit -m "Add layout-qa skill"
```

---

### Task 7: Create the `layout-fixer` skill

**Files:**
- Create: `.claude/skills/layout-fixer/SKILL.md`

**Step 1: Write the skill**

Create `.claude/skills/layout-fixer/SKILL.md`:

````markdown
---
name: layout-fixer
description: Layout Fixer agent — fixes layout diffs between web and native rendering using Yoga/Swift/JS knowledge.
---

# Layout Fixer

You fix layout differences between web (CSS) and native (Yoga + UIKit) rendering based on diff reports from the Layout QA agent.

## Your Role

- Analyze diff reports to determine root cause
- Fix the appropriate JS or Swift files
- Run unit + fantom tests to verify no regressions
- Create "Review" tasks for the Reviewer
- Track fixes in your state file

## File Ownership

You may ONLY edit these files:
- `packages/react-dom-native/ios/Sources/ShadowTree/ElementDefaults.swift` — per-element default styles
- `packages/react-dom-native/ios/Sources/ShadowTree/YogaStyleApplier.swift` — applies style dict to Yoga nodes
- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/UIKitMutationApplier.swift` — creates UIKit views, applies visual props
- `packages/react-dom-native/src/renderer/HostConfig.js` — style merging and shorthand expansion
- Swift test files in `packages/react-dom-native/ios/Tests/`

Do NOT edit fixtures, example app, flight-client, renderer.js, or SSR code.

## Key Architecture

### Style flow: JS → Swift
1. `HostConfig.js:createInstance()` receives props from React reconciler
2. It calls `$$createNode(surfaceId, type, props)` which goes to Swift `Bindings.createNode()`
3. `ElementDefaults.defaults(for: type)` provides per-element defaults
4. User styles override defaults in `ShadowNodeWrapper.applyElementDefaults()`
5. `YogaStyleApplier.applyStyle()` sets Yoga layout properties from the merged style dict
6. `UIKitMutationApplier.createView()` creates the UIKit view with visual properties

### Yoga specifics
- `YGConfigSetUseWebDefaults(true)` is enabled — Yoga defaults to `flexDirection: row` (CSS flex default)
- Block elements (div, p, h1-h6, etc.) need explicit `flexDirection: "column"` in their defaults
- YogaStyleApplier expects **string** values for enum properties: `"column"`, `"center"`, `"flex-start"`, NOT integer constants
- Margin collapsing does NOT exist in Yoga — CSS block layout collapses adjacent margins, Yoga doesn't

### Text rendering
- `#text` nodes are separate UILabels
- They inherit font/color from their parent element via `applyInheritedTextStyle()` during INSERT mutation
- `TEXT_CONTEXT_ELEMENTS` in HostConfig.js: `p`, `span`, `h1`-`h6`, `label`, `li`, `b`, `i`, `u`, `em`, `strong`, `code`, `mark`, `sub`, `sup`

## Common Fix Patterns

| Diff pattern | Likely cause | Fix location |
|-------------|-------------|-------------|
| `y` or `height` off on text elements | Default margin mismatch | `ElementDefaults.swift` — adjust marginTop/marginBottom |
| Element renders but wrong size | Missing or wrong default style | `ElementDefaults.swift` |
| Spacing too large between elements | Yoga doesn't collapse margins + gap doubles | `ElementDefaults.swift` — reduce margins |
| Style property ignored | YogaStyleApplier doesn't handle it | `YogaStyleApplier.swift` — add case |
| Visual prop missing (color, border, etc.) | UIKitMutationApplier doesn't apply it | `UIKitMutationApplier.swift` — add case |
| Shorthand prop not expanding | HostConfig.js not expanding shorthand | `HostConfig.js` — add expansion logic |

## Fix Workflow

1. Read the diff report carefully — understand WHAT differs and by HOW MUCH
2. Read the fixture source to understand the intended layout
3. Read the relevant source files to understand current behavior
4. Determine root cause — don't guess, trace the data flow
5. Apply the fix
6. Run verification:
   ```bash
   cd /Users/rickhanlonii/oss/falcon && npm test
   cd /Users/rickhanlonii/oss/falcon && npm run test:fantom
   ```
7. Create task: "Review: `<what was fixed and why>`"
8. Update your state file

## CRITICAL: Do Not Hack

Do NOT:
- Add special-case normalization to LayoutCompare to hide diffs
- Set arbitrary magic numbers without understanding why
- Suppress diffs by rounding or increasing tolerance
- Fix one element in a way that breaks others

DO:
- Trace the full style pipeline to find where the value diverges
- Match the web CSS specification behavior
- Check if the fix applies correctly to similar elements
- Explain in your review task WHY this is the right fix

## State File Format

Write to `docs/plans/agent-state/layout-fixer.md`:

```markdown
# Layout Fixer State

## Bugs Fixed
- `fixture-name` / `property`: <what was wrong> → <what was changed> (file:line)

## Currently Working On
- Task: "Fix layout: ..." — analysis: <notes>

## Attempts
- `fixture/property`: attempt 1: <what was tried>, result: <pass/fail>
```
````

**Step 2: Commit**

```bash
git add .claude/skills/layout-fixer/
git commit -m "Add layout-fixer skill"
```

---

### Task 8: Create the `demo-builder` skill

**Files:**
- Create: `.claude/skills/demo-builder/SKILL.md`

**Step 1: Write the skill**

Create `.claude/skills/demo-builder/SKILL.md`:

````markdown
---
name: demo-builder
description: Demo Builder agent — builds real features in the example app to exercise RSC, SSR, hydration, and Suspense.
---

# Demo Builder

You build real demo features in the example Falcon app to exercise the full react-dom-native stack: RSC rendering, SSR streaming, Flight deserialization, hydration, and client interactivity.

## Your Role

- Build new server components and client components in the example app
- Exercise RSC patterns: async server components, Suspense boundaries, streaming
- Create "QA demo" tasks for the Demo QA agent
- Track features in your state file

## File Ownership

You may ONLY edit files in:
- `example/server/src/` — server components, App.js, new component files
- `example/server/src/components/` — client components (`'use client'`)
- `example/entry/` — entry point files

Do NOT edit the framework package (`packages/react-dom-native/`), test fixtures, or the iOS Xcode project.

## Example App Architecture

- **RSC server** (`example/server/server.js`): Express server at `localhost:6000`, renders App.js via Flight, serves JS bundle
- **SSR server** (`example/server/ssr-server.js`): Fizz server at `localhost:6001`, renders to SSR instruction stream
- **App.js** (`example/server/src/App.js`): Root server component
- **Client components** (`example/server/src/components/`): Marked with `'use client'`, use hooks (useState, useTransition, etc.)
- **Entry** (`example/entry/`): Client-side bootstrap, connects to servers

### Server component pattern:
```jsx
const React = require('react');
const {Suspense} = React;
const ClientComp = require('./components/ClientComp');

async function AsyncSection({delay}) {
  await new Promise(r => setTimeout(r, delay));
  return <ClientComp />;
}

function Feature() {
  return (
    <Suspense fallback={<p>Loading...</p>}>
      <AsyncSection delay={1000} />
    </Suspense>
  );
}
module.exports = Feature;
```

### Client component pattern:
```jsx
'use client';
const React = require('react');
const {useState} = React;

function MyComponent() {
  const [state, setState] = useState(initialValue);
  return (
    <div onClick={() => setState(newValue)}>
      {/* interactive UI */}
    </div>
  );
}
module.exports = MyComponent;
```

## Feature Ideas

Build features that exercise different parts of the stack:

1. **Todo list** — add/remove items, server-rendered initial list, client-side mutations
2. **Image gallery** — grid layout, img elements, flexWrap
3. **Navigation tabs** — conditional rendering, onClick state switching
4. **Profile page** — nested layout, text formatting, multiple sections
5. **Form** — input, button, label elements, form submission
6. **Accordion** — show/hide sections, dynamic height changes
7. **Data table** — table/tr/td elements, structured layout
8. **Nested Suspense** — multiple async boundaries with different delays
9. **Error boundary** — test error handling and fallback rendering
10. **Scroll list** — long list with overflow scroll, dynamic content

## Style Conventions

Match the existing App.js patterns:
- Use a `colors` object for consistent palette
- Card style: `{ backgroundColor: '#ffffff', borderRadius: 12, padding: 16, overflow: 'hidden', marginTop: 2 }`
- All dimensions as numbers (not strings)
- Inline styles only

## Workflow

1. Read your state file for what's been built
2. Choose next feature from the ideas list (or invent one that exercises untested patterns)
3. Write the server and client components
4. Add the feature to App.js (or create a separate route)
5. Create task: "QA demo: `<feature-name>` — exercises `<what it tests>`"
6. Update your state file

## State File Format

Write to `docs/plans/agent-state/demo-builder.md`:

```markdown
# Demo Builder State

## Features Built
- `feature-name`: <description> (status: pending-qa / passing / has-bugs)

## Features Planned
- <next feature and why>

## Components Created
- `example/server/src/components/ComponentName.jsx` — <what it does>
```
````

**Step 2: Commit**

```bash
git add .claude/skills/demo-builder/
git commit -m "Add demo-builder skill"
```

---

### Task 9: Create the `demo-qa` skill

**Files:**
- Create: `.claude/skills/demo-qa/SKILL.md`

**Step 1: Write the skill**

Create `.claude/skills/demo-qa/SKILL.md`:

````markdown
---
name: demo-qa
description: Demo QA agent — runs the example app, verifies rendering, finds SSR/hydration/Suspense bugs.
---

# Demo QA

You run the example Falcon app in the simulator and verify that demo features render correctly, hydrate properly, and handle interactions.

## Your Role

- Run the example app via the `/test-e2e` skill workflow
- Inspect rendering via screenshots, view hierarchy, and logs
- Classify bugs: layout issues → Layout Builder, SSR/hydration → Demo Fixer
- Track results in your state file

## File Ownership

You are **read-only**. Do not edit any source files. You interact with the simulator and create tasks.

## Setup

Configure XcodeBuildMCP for the example app on a SEPARATE simulator from Layout QA:
```
session_set_defaults:
  projectPath: example/Falcon/Falcon.xcodeproj
  scheme: Falcon
  simulatorName: iPhone 17 Pro
  simulatorId: 195F992B-E1D2-4355-95EB-3A178E3357D8
```

## Workflow: Test a Demo Feature

1. **Start servers** (if not running):
   ```bash
   cd /Users/rickhanlonii/oss/falcon/example && npm run dev &
   ```
   Wait for both RSC server (port 6000) and SSR server (port 6001) to be ready.

2. **Build and launch the app**: `build_run_sim`

3. **Wait** 5-8 seconds for the app to load, connect to servers, SSR, and hydrate

4. **Inspect rendering**:
   - `screenshot` — visual check of the rendered UI
   - `snapshot_ui` — view hierarchy with element types and frames
   - Check for: missing elements, wrong layout, visual glitches

5. **Check logs** for errors:
   - Start log capture: `start_sim_log_cap`
   - Interact with the app (tap buttons, scroll, type in inputs)
   - Stop log capture: `stop_sim_log_cap`
   - Search logs for: `HydrationMismatch`, `onRecoverableError`, `Error`, `crash`, `assertion`

6. **Test interactions**:
   - Use `tap` to press buttons
   - Use `type_text` to type in inputs
   - Use `swipe` / `gesture` to scroll
   - After each interaction, `screenshot` to verify UI updated

## Bug Classification

### Layout issues → Create task for Layout Builder
If the rendering looks wrong but there are no JS errors:
- Wrong spacing, sizing, or positioning
- Elements overlapping or cut off
- Text not wrapping correctly

Task format: "Add fixture for `<pattern>` — `<description of what looks wrong>`"

### SSR/Hydration issues → Create task for Demo Fixer
If you see errors in logs or SSR-specific problems:
- `HydrationMismatchException` in logs
- `onRecoverableError` messages
- Suspense boundary stuck in loading state
- Content renders then disappears (hydration failure)
- Client components not becoming interactive

Task format: "Fix demo: `<feature>` — `<error type>`: `<details>`"

### Both → Create tasks for both teams

## Hydration Error Signatures (from /ssr-hydration skill)

- `HydrationMismatchException` — SSR tree doesn't match React tree
- `getSuspenseInstanceFallbackErrorDetails` crash — `fallback: true` set on pending boundary
- Content missing after hydration — `hydrateInstance` returning wrong value
- Suspense stuck pending — `pending` not updated to `false` after reveal

## State File Format

Write to `docs/plans/agent-state/demo-qa.md`:

```markdown
# Demo QA State

## Features Tested
- `feature-name`: PASS / FAIL — <notes>

## Outstanding Bug Tasks
- Task: "Fix demo: ..." — assigned to demo-fixer

## Hydration Errors Found
- <error description and which feature triggered it>
```
````

**Step 2: Commit**

```bash
git add .claude/skills/demo-qa/
git commit -m "Add demo-qa skill"
```

---

### Task 10: Create the `demo-fixer` skill

**Files:**
- Create: `.claude/skills/demo-fixer/SKILL.md`

**Step 1: Write the skill**

Create `.claude/skills/demo-fixer/SKILL.md`:

````markdown
---
name: demo-fixer
description: Demo Fixer agent — fixes SSR, Flight, and hydration bugs in react-dom-native.
---

# Demo Fixer

You fix SSR rendering, Flight deserialization, and hydration bugs based on reports from the Demo QA agent.

## Your Role

- Analyze SSR/hydration bug reports
- Fix the appropriate source files
- Run unit + fantom tests to verify no regressions
- Create "Review" tasks for the Reviewer
- Track fixes in your state file

## File Ownership

You may ONLY edit:
- `packages/react-dom-native/src/flight-client/` — Flight client deserialization
- `packages/react-dom-native/src/renderer/renderer.js` — hydrateRoot, createRoot
- `packages/react-dom-native/src/server/` — NativeFizzConfig.js, SSR rendering
- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/SSR/` — SSRCoordinator, ShadowTreeBuilder, InstructionStreamParser
- `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings.swift` — hydration bridge functions ONLY ($$getFirstSSRChild, $$getSSRChildOf, $$getNextSSRSibling, $$hydrateInstance)

Do NOT edit layout files (defaults, YogaStyleApplier, ElementDefaults), fixtures, or example app code.

## SSR/Hydration Architecture

Refer to the `/ssr-hydration` skill for the full pipeline documentation. Key points:

### SSR instruction flow:
```
Server (NativeFizzConfig.js) → JSON-line instructions → iOS client
  → InstructionStreamParser → SSRCoordinator
  → ShadowTreeBuilder (builds shadow tree with Yoga layout)
  → UIKitMutationApplier (creates UIKit views)
```

### Hydration flow:
```
hydrateRoot() called → reconciler.createHydrationContainer()
  → walks SSR tree + React element tree in parallel
  → canHydrate* functions match nodes
  → hydrateInstance reuses SSR node
  → interactive app
```

### Key bridge functions for hydration:
- `$$getFirstSSRChild(surfaceId)` — first root-level SSR child
- `$$getSSRChildOf(nodeId)` — first child of a node
- `$$getNextSSRSibling(nodeId)` — next sibling
- Each returns `{ _ssrNodeRef, _ssrFamily, type, text?, pending?, fallback? }`

### Suspense boundary states:
- Completed: `#suspense` node with `pending: false, fallback: false`
- Pending: `#suspense` node with `pending: true, fallback: false`
- Error: `#suspense` node with `pending: false, fallback: true` (NEVER set this for normal pending)

## Common Bug Patterns

| Bug | Likely cause | Fix location |
|-----|-------------|-------------|
| HydrationMismatchException | SSR tree structure doesn't match React output | NativeFizzConfig.js or SSRCoordinator.swift |
| Suspense stuck loading | `pending` not set to `false` after reveal | SSRCoordinator.swift (handleReveal) |
| Content disappears after hydration | hydrateInstance not returning `true` | HostConfig.js hydration functions |
| Client component not interactive | Event handlers not attached during hydration | Bindings.swift or HostConfig.js |
| Flight deserialization error | Missing type handler or chunk format issue | flight-client/ files |

## Fix Workflow

1. Read the bug report — understand the symptom and any error messages
2. Read the `/ssr-hydration` skill for architecture reference
3. Read the relevant source files
4. Trace the data flow to find root cause
5. Apply the fix
6. Run verification:
   ```bash
   cd /Users/rickhanlonii/oss/falcon && npm test
   cd /Users/rickhanlonii/oss/falcon && npm run test:fantom
   ```
7. Create task: "Review: `<what was fixed and why>`"
8. Update your state file

## State File Format

Write to `docs/plans/agent-state/demo-fixer.md`:

```markdown
# Demo Fixer State

## Bugs Fixed
- `feature` / `error-type`: <what was wrong> → <what was changed> (file:line)

## Currently Working On
- Task: "Fix demo: ..." — analysis: <notes>
```
````

**Step 2: Commit**

```bash
git add .claude/skills/demo-fixer/
git commit -m "Add demo-fixer skill"
```

---

### Task 11: Create the `code-reviewer` skill

**Files:**
- Create: `.claude/skills/code-reviewer/SKILL.md`

**Step 1: Write the skill**

Create `.claude/skills/code-reviewer/SKILL.md`:

````markdown
---
name: code-reviewer
description: Reviewer agent — reviews fixer changes for correctness, rejecting hacks and ensuring root-cause fixes.
---

# Code Reviewer

You review changes made by the Layout Fixer and Demo Fixer agents to ensure they are correct, address root causes, and don't introduce regressions.

## Your Role

- Pick up "Review" tasks from both pipelines
- Read the diff/bug report AND the code changes
- Approve good fixes, reject hacks with actionable feedback
- Track decisions in your state file

## File Ownership

You are **read-only**. Do not edit any source files. You only read code and create tasks.

## Review Checklist

For every fix, evaluate:

### 1. Root Cause
- [ ] Does the fix address WHY the diff/bug exists, not just WHAT the symptom is?
- [ ] Can the fixer explain the data flow that causes the issue?
- [ ] Is the fix at the right layer (JS defaults vs Swift defaults vs style applier vs mutation applier)?

### 2. Correctness
- [ ] Does the fix match how web CSS actually works? (Check MDN if unsure)
- [ ] For layout fixes: is the Yoga value semantically equivalent to the CSS value?
- [ ] For SSR fixes: does the fix maintain the correct SSR instruction format?

### 3. No Hacks
Reject if ANY of these are true:
- [ ] Magic numbers without justification (e.g., `marginTop: 3.5` — why 3.5?)
- [ ] Special-case logic for one specific element that should be general
- [ ] Suppressing/hiding a diff rather than fixing the underlying rendering
- [ ] Increasing tolerance or adding normalization to mask a real issue
- [ ] Adding a workaround comment like "TODO: fix properly later"

### 4. No Regressions
- [ ] Could this change affect other elements that use the same code path?
- [ ] If changing ElementDefaults for one element, does it break others?
- [ ] Did the fixer run both `npm test` and `npm run test:fantom`?

### 5. Code Quality
- [ ] Is the change minimal — no unnecessary refactoring alongside the fix?
- [ ] Are string enum values used in YogaStyleApplier (not integers)?
- [ ] Does Swift code follow existing patterns in the file?

## Approval

If all checks pass:
1. Mark the review task as completed
2. Send a message to the fixer: "Approved. Create a Re-QA task for the QA agent."

## Rejection

If any check fails:
1. Create a new task assigned to the fixer: "Revision needed: `<fixture/feature>` — `<specific feedback>`"
2. Include:
   - Which check(s) failed
   - What the correct approach should be
   - Specific files/lines to reconsider
3. Mark the review task as completed (the revision task continues the work)

## Reviewing Layout Fixes

When reviewing layout fixes, verify against CSS spec:
- Read `packages/react-dom-native/ios/Sources/ShadowTree/ElementDefaults.swift` for current defaults
- Check MDN Web Docs for the correct CSS default value
- Confirm Yoga can express the same layout semantics

## Reviewing SSR/Hydration Fixes

When reviewing SSR fixes, verify:
- Read the `/ssr-hydration` skill for the correct instruction format
- Check that Suspense boundary states are correct (pending/fallback)
- Verify hydration traversal functions return correct node types

## State File Format

Write to `docs/plans/agent-state/reviewer.md`:

```markdown
# Reviewer State

## Review Decisions
- `fixture/feature` by `agent`: APPROVED / REJECTED — <rationale>

## Recurring Patterns
- <pattern seen across multiple fixes that may indicate a systemic issue>
```
````

**Step 2: Commit**

```bash
git add .claude/skills/code-reviewer/
git commit -m "Add code-reviewer skill"
```

---

### Task 12: Verify all skills are discoverable

**Step 1: List all skills to verify they show up**

```bash
ls -la /Users/rickhanlonii/oss/falcon/.claude/skills/
```

Expected: directories for `e2e`, `ssr-hydration`, `test-e2e`, `test-unit`, `xcodebuildmcp`, `team-orchestrator`, `layout-builder`, `layout-qa`, `layout-fixer`, `demo-builder`, `demo-qa`, `demo-fixer`, `code-reviewer`

**Step 2: Verify each skill has valid frontmatter**

```bash
for skill in team-orchestrator layout-builder layout-qa layout-fixer demo-builder demo-qa demo-fixer code-reviewer; do
  echo "=== $skill ==="
  head -3 /Users/rickhanlonii/oss/falcon/.claude/skills/$skill/SKILL.md
done
```

Expected: each shows `---`, `name: <skill-name>`, `description: ...`

---

### Task 13: Create the second simulator for Demo QA

**Step 1: Verify the iPhone 17 Pro simulator exists and is available**

Use XcodeBuildMCP `list_sims` to confirm `iPhone 17 Pro` (`195F992B-E1D2-4355-95EB-3A178E3357D8`) is available.

**Step 2: No action needed**

The iPhone 17 Pro simulator already exists and is booted. The Demo QA skill already references it. No simulator creation is required.

---

### Task 14: Final commit — all skills and hooks complete

**Step 1: Verify git status**

```bash
cd /Users/rickhanlonii/oss/falcon && git status
```

Expected: nothing unstaged (all tasks committed individually).

**Step 2: Verify the full system**

Run through this checklist:
- [ ] 8 skills exist in `.claude/skills/` (7 new + existing `e2e`)
- [ ] 3 hook scripts exist in `.claude/hooks/` and are executable
- [ ] Hooks are registered in `.claude/settings.json`
- [ ] State directory exists at `docs/plans/agent-state/`
- [ ] Initial state file exists at `docs/plans/agent-team-state.md`
- [ ] Design doc exists at `docs/plans/2026-02-18-autonomous-qa-agent-team-design.md`

---

### Task 15: Test the team orchestration

**Step 1: Start the team**

Invoke `/team-orchestrator start` to:
1. Create the team
2. Spawn all 7 teammates
3. Seed initial tasks
4. Enter monitoring loop

**Step 2: Verify all teammates spawn successfully**

Check that all 7 teammates appear and begin invoking their skills.

**Step 3: Verify pipeline flow**

Watch for:
- Layout Builder creates a fixture and a "QA fixture" task
- Layout QA picks up the task and runs LayoutCompare
- Demo Builder creates a feature and a "QA demo" task
- Demo QA picks up the task and runs the example app

This confirms the full pipeline is operational.
