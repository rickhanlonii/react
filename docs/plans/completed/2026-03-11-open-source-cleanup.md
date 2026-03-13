# Open Source Repo Cleanup Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Clean up the falcon repo for open sourcing — remove internal agent tooling, reorganize settings, add README.

**Architecture:** No structural changes. Remove internal-only files, split settings into project vs personal, add contributor-facing docs.

**Tech Stack:** Git, markdown

---

### Task 1: Remove internal agent skills

**Files:**
- Delete: `.claude/skills/team-orchestrator/`
- Delete: `.claude/skills/layout-qa/`
- Delete: `.claude/skills/layout-builder/`
- Delete: `.claude/skills/layout-fixer/`
- Delete: `.claude/skills/code-reviewer/`
- Delete: `.claude/skills/demo-qa/`
- Delete: `.claude/skills/demo-builder/`
- Delete: `.claude/skills/demo-fixer/`
- Delete: `.claude/skills/add-element/`

**Step 1: Delete the skill directories**

```bash
rm -rf .claude/skills/team-orchestrator .claude/skills/layout-qa .claude/skills/layout-builder .claude/skills/layout-fixer .claude/skills/code-reviewer .claude/skills/demo-qa .claude/skills/demo-builder .claude/skills/demo-fixer .claude/skills/add-element
```

**Step 2: Verify only curated skills remain**

```bash
ls .claude/skills/
```

Expected: `build`, `debug.md`, `e2e`, `reference`, `ssr-hydration`, `test`, `trace`

**Step 3: Commit**

```bash
git add -A .claude/skills/
git commit -m "Remove internal agent skills for open source"
```

---

### Task 2: Move debug.md to proper skill directory

**Files:**
- Delete: `.claude/skills/debug.md`
- Create: `.claude/skills/debug/SKILL.md` (same content)

**Step 1: Create directory and move file**

```bash
mkdir -p .claude/skills/debug
mv .claude/skills/debug.md .claude/skills/debug/SKILL.md
```

**Step 2: Verify**

```bash
ls .claude/skills/debug/
```

Expected: `SKILL.md`

**Step 3: Commit**

```bash
git add .claude/skills/debug.md .claude/skills/debug/
git commit -m "Move debug skill to proper directory structure"
```

---

### Task 3: Remove personal hooks and files

**Files:**
- Delete: `.claude/hooks/` (all 4 scripts)
- Delete: `.claude/permission-requests.md`

**Step 1: Delete hooks and permission requests**

```bash
rm -rf .claude/hooks
rm -f .claude/permission-requests.md
```

**Step 2: Verify**

```bash
ls .claude/
```

Expected: `settings.json`, `settings.local.json`, `skills/`

**Step 3: Commit**

```bash
git add -A .claude/hooks .claude/permission-requests.md
git commit -m "Remove personal hooks and permission log"
```

---

### Task 4: Remove personal config files from repo root

**Files:**
- Delete: `.mcp.json`
- Delete: `.idea/` (if tracked)
- Delete: `.xcodebuildmcp/` (if tracked)

**Step 1: Delete the files**

```bash
rm -f .mcp.json
rm -rf .idea .xcodebuildmcp
```

**Step 2: Commit**

```bash
git add -A .mcp.json .idea .xcodebuildmcp
git commit -m "Remove personal IDE and MCP config files"
```

---

### Task 5: Update .gitignore

**Files:**
- Modify: `.gitignore`

**Step 1: Add entries for personal config files**

Add these lines to `.gitignore` after the existing "Claude Code local settings" section:

```
# MCP server config (personal)
.mcp.json

# Xcode Build MCP plugin
.xcodebuildmcp/
```

Note: `.idea/` is already in `.gitignore`.

**Step 2: Verify**

```bash
grep -n "mcp.json\|xcodebuildmcp" .gitignore
```

Expected: The two new entries show up.

**Step 3: Commit**

```bash
git add .gitignore
git commit -m "Add personal config files to .gitignore"
```

---

### Task 6: Reorganize settings.json

**Files:**
- Modify: `.claude/settings.json`
- Modify: `.claude/settings.local.json`

**Step 1: Write the new project settings.json**

```json
{
  "permissions": {
    "allow": [
      "Bash(npm:*)",
      "Bash(npx:*)",
      "Bash(node:*)",
      "Bash(git:*)",
      "Bash(mkdir:*)",
      "Bash(swift build:*)",
      "Bash(swift test:*)",
      "Bash(test:*)"
    ],
    "deny": [
      "Bash(bash scripts/build-op.sh:*)",
      "Bash(bash ./scripts/build-op.sh:*)",
      "Bash(curl*localhost:6002*)",
      "Bash(curl*localhost*build*)"
    ]
  },
  "enabledPlugins": {
    "swift-lsp@claude-plugins-official": true
  }
}
```

**Step 2: Write the new personal settings.local.json**

Merge existing local allows with the stuff moved from settings.json:

```json
{
  "permissions": {
    "allow": [
      "Bash(cd /Users/rickhanlonii/oss/falcon:*)",
      "Bash(curl:*)",
      "Bash(lsof:*)",
      "Bash(echo:*)",
      "Bash(cat:*)",
      "Bash(sort:*)",
      "Bash(grep:*)",
      "Bash(npm run test:*)",
      "Bash(head:*)",
      "Bash(swift -e:*)",
      "Bash(sleep:*)",
      "Bash(/Users/rickhanlonii/oss/falcon/docs/plans/agent-state/layout-qa.log.md:*)",
      "Bash(/tmp:*)",
      "WebSearch",
      "WebFetch",
      "mcp__chrome-devtools__list_pages",
      "mcp__chrome-devtools__list_console_messages",
      "mcp__chrome-devtools__performance_start_trace",
      "mcp__chrome-devtools__performance_stop_trace",
      "mcp__chrome-devtools__new_page",
      "mcp__chrome-devtools__take_snapshot",
      "mcp__falcon-devtools__take_snapshot",
      "mcp__falcon-devtools__performance_start_trace",
      "mcp__falcon-devtools__performance_analyze_insight",
      "mcp__falcon-devtools__evaluate_script",
      "mcp__falcon-devtools__performance_stop_trace",
      "mcp__falcon-devtools__navigate_fixture",
      "mcp__falcon-devtools__select_page",
      "mcp__plugin_chrome-devtools-mcp_chrome-devtools__list_pages",
      "mcp__claude_mcp_add_chrome-devtools_--scope_user_npx_chrome-devtools-mcp_latest__list_pages",
      "mcp__plugin_chrome-devtools-mcp_chrome-devtools__navigate_page",
      "mcp__plugin_chrome-devtools-mcp_chrome-devtools__take_snapshot",
      "mcp__plugin_chrome-devtools-mcp_chrome-devtools__click",
      "mcp__plugin_chrome-devtools-mcp_chrome-devtools__take_screenshot",
      "Bash(xcrun simctl:*)"
    ],
    "deny": [
      "Bash(xcrun:*)",
      "Bash(kill:*)",
      "Bash(pkill:*)",
      "Bash(lsof:*)",
      "Bash(xcodebuild:*)",
      "Bash(codesign:*)",
      "Bash(plutil:*)",
      "Bash(/usr/libexec/PlistBuddy:*)",
      "Bash(git worktree:*)",
      "Bash(git checkout -b:*)",
      "Bash(git checkout -B:*)",
      "Bash(git switch -c:*)",
      "Bash(git switch -C:*)",
      "Bash(git branch:*)"
    ]
  },
  "defaultMode": "dontAsk",
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

**Step 3: Verify settings.json has no personal paths or MCP refs**

```bash
grep -i "rickhanlonii\|mcp__\|WebSearch\|WebFetch\|defaultMode\|hooks" .claude/settings.json
```

Expected: No output.

**Step 4: Commit**

```bash
git add .claude/settings.json .claude/settings.local.json
git commit -m "Reorganize settings: project conventions in settings.json, personal in settings.local.json"
```

---

### Task 7: Update CLAUDE.md

**Files:**
- Modify: `CLAUDE.md`

**Step 1: Remove the add-element skill reference**

In the `## Skills` section, remove this line:
```
- **Adding a new HTML element**: Use `/add-element` for the lockstep checklist.
```

**Step 2: Add debug and trace skill references**

Add to the `## Skills` section:
```
- **Native debugging**: Use `/debug` for LLDB attach, breakpoints, and Swift inspection.
- **Performance profiling**: Use `/trace` to capture and analyze performance traces.
```

**Step 3: Verify no stale skill references remain**

```bash
grep -n "add-element\|team-orchestrator\|layout-qa\|layout-builder\|layout-fixer\|code-reviewer\|demo-qa\|demo-builder\|demo-fixer" CLAUDE.md
```

Expected: No output.

**Step 4: Commit**

```bash
git add CLAUDE.md
git commit -m "Update CLAUDE.md: remove deleted skill refs, add debug and trace"
```

---

### Task 8: Write README.md

**Files:**
- Create: `README.md`

**Step 1: Write README.md**

```markdown
# Falcon

A React framework that renders HTML elements (`<div>`, `<span>`, `<p>`, etc.) as native iOS views (UIKit) via Yoga layout.

Write your UI with familiar web elements and CSS-like styles, render it natively on iOS with full React Server Components support — Flight streaming, SSR, hydration, and Suspense.

## Architecture

- **Renderer** — Custom React reconciler (mutation mode) using `react-reconciler`, calling into a Swift shadow tree via JavaScriptCore
- **Shadow Tree** — Swift shadow nodes with Yoga layout, inspired by Fabric but simplified for fixed HTML elements
- **Layout** — Yoga with web-like defaults (`<div>` = column/block, `<span>` = virtual text with no UIView)
- **Server** — Express server handling RSC rendering via the Flight wire protocol with streaming
- **Client** — Native iOS app receives the Flight stream, deserializes with `react-client/flight`, feeds the custom renderer
- **JS Engine** — JavaScriptCore (native Swift API, zero bundle size)
- **Bundler** — esbuild

For the full architecture doc, see [docs/architecture.md](docs/architecture.md).

## Project Structure

```
packages/
  react-dom-native/     The library (JS renderer + Swift package)
  devtools-mcp/         Chrome DevTools MCP server for debugging
  fantom/               Headless test runner (JS + Swift)
fixtures/
  example/              Full RSC demo app (Flight + SSR + hydration)
  layout/               E2E layout comparison app and fixtures
  web-example/          Next.js web reference app for visual comparison
tests/
  integration/          Fantom integration tests (JS ↔ Swift)
scripts/                Build, test, and dev scripts
docs/                   Architecture, specs, research, plans
```

## Prerequisites

- macOS
- Xcode (latest stable)
- Node.js 20+
- An iOS Simulator

## Getting Started

### 1. Install dependencies

```bash
npm install
```

### 2. Run the demo app

Start the dev server (esbuild watcher + RSC server):

```bash
npm run dev
```

Then open `fixtures/Falcon.xcworkspace` in Xcode and run the **Falcon Demo** scheme on a simulator. The app auto-reloads via WebSocket when JS changes.

### 3. Run tests

```bash
# Unit + server action tests
npm test

# Integration tests (requires fantom binary)
npm run build:fantom
npm run test:fantom

# All tests
npm run test:all
```

### 4. Layout comparison (E2E)

Compare native rendering against web rendering:

```bash
npm run build:e2e    # Build layout fixtures
npm run e2e:test     # Run comparison
```

## CLI Reference

See [docs/cli-reference.md](docs/cli-reference.md) for the full list of UI automation, debugging, and test commands.

## Documentation

- [Architecture](docs/architecture.md) — Full system design
- [CLI Reference](docs/cli-reference.md) — Build, test, debug commands
- [Specs](docs/specs/) — Component and protocol specifications
- [Plans](docs/plans/) — Implementation plans and design docs

## License

MIT
```

**Step 2: Verify README renders correctly**

```bash
head -5 README.md
```

Expected: `# Falcon` header.

**Step 3: Commit**

```bash
git add README.md
git commit -m "Add README for open source contributors"
```

---

### Task 9: Move design doc to completed

**Files:**
- Move: `docs/plans/2026-03-11-open-source-cleanup-design.md` → `docs/plans/completed/`

**Step 1: Move the design doc**

```bash
mkdir -p docs/plans/completed
mv docs/plans/2026-03-11-open-source-cleanup-design.md docs/plans/completed/
```

**Step 2: Commit**

```bash
git add docs/plans/
git commit -m "Move open source cleanup design to completed"
```
