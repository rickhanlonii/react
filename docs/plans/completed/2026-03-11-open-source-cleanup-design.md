# Open Source Repo Cleanup Design

## Goal

Clean up the falcon repo for open sourcing, targeting React/RN contributors who want to understand the architecture and contribute.

## Decisions

- **Name**: Keep "falcon"
- **Structure**: Keep current layout (`packages/`, `fixtures/`, `tests/`, `scripts/`, `docs/`)
- **Fixtures/tools**: Keep everything (demo app, layout compare, web-example, devtools-mcp, fantom)
- **Docs**: Keep all (architecture, specs, research, plans, e2e-specs)
- **Audience**: React/RN contributors

## Changes

### Remove

Files and directories to delete:

- `.claude/skills/team-orchestrator/` — internal agent orchestration
- `.claude/skills/layout-qa/` — internal QA agent
- `.claude/skills/layout-builder/` — internal builder agent
- `.claude/skills/layout-fixer/` — internal fixer agent
- `.claude/skills/code-reviewer/` — internal reviewer agent
- `.claude/skills/demo-qa/` — internal demo QA agent
- `.claude/skills/demo-builder/` — internal demo builder agent
- `.claude/skills/demo-fixer/` — internal demo fixer agent
- `.claude/skills/add-element/` — checklist skill (not needed for contributors)
- `.claude/skills/debug.md` — loose file, replaced by `debug/SKILL.md`
- `.claude/hooks/` — all 4 personal hook scripts (pre-compact, session-start-compact, task-completed, permission-request)
- `.claude/permission-requests.md` — personal permission log
- `.mcp.json` — personal MCP server config with hardcoded local paths
- `.idea/` — JetBrains IDE config
- `.xcodebuildmcp/` — Xcode MCP plugin state

### Move

- `.claude/skills/debug.md` → `.claude/skills/debug/SKILL.md` (proper skill directory)

### Curated Skills (keep)

- `build` — how to build/run apps
- `test` — smart test runner
- `e2e` — layout comparison workflow
- `reference` — key files and architecture pointers
- `trace` — performance profiling
- `ssr-hydration` — SSR/hydration debugging
- `debug` — LLDB native debugging (moved to proper directory)

### Reorganize settings.json

**`settings.json`** (project, checked in):
- Allow: `npm`, `npx`, `node`, `git`, `mkdir`, `swift build`, `swift test`
- Deny: `bash scripts/build-op.sh`, `curl localhost:6002` (enforce `npm run app:*`), `git worktree/branch` (project convention)
- enabledPlugins: `swift-lsp`

**`settings.local.json`** (personal, gitignored):
- `Bash(cd /Users/rickhanlonii/oss/falcon:*)` (hardcoded path)
- `WebSearch`, `WebFetch`
- All MCP tool permissions
- `defaultMode: dontAsk`
- Deny rules for `xcrun`, `kill`, `pkill`, `lsof`, `xcodebuild`, `codesign`, `plutil`, `PlistBuddy`
- All hooks config

### Update .gitignore

Add entries for:
- `.mcp.json`
- `.xcodebuildmcp/`
- `.idea/`

### Update CLAUDE.md

- Remove references to deleted skills (`/add-element`, agent team skills)
- Remove any hardcoded username paths

### Add README.md

Root-level README covering:
- What falcon / react-dom-native is
- Architecture overview (brief, linking to `docs/architecture.md`)
- Prerequisites (Xcode, Node, etc.)
- Getting started (build and run demo app, run tests)
- Contributing pointers (test expectations, code conventions)
