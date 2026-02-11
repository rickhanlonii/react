# react-dom-native Bootstrap: Autonomous Pipeline

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Bootstrap the react-dom-native framework repo with project context, 19 Claude Code skills, progress tracking, and a Next.js server placeholder — enabling future sessions to build the framework autonomously.

**Architecture:** The framework uses HTML elements (`<div>`, `<span>`, etc.) mapped to native iOS views via a custom React renderer + Yoga layout. Next.js serves RSC Flight payloads; a native iOS client consumes them. This session creates the repo scaffolding and skill definitions that drive all future development.

**Tech Stack:** React reconciler, React Flight (RSC), Next.js, Yoga layout, UIKit (Swift), JavaScriptCore or Hermes (TBD)

---

## Corrections from Original Plan

1. **Skill count**: 19 not 17 (original miscounted)
2. **Skills directory**: `.claude/skills/` not `skills/` (follows Claude Code convention for auto-discovery)
3. **Yoga path**: `../react-native/packages/react-native/ReactCommon/yoga/` (not `../react-native/ReactCommon/yoga/`)
4. **Skill naming**: flat with hyphens (e.g., `research-reconciler`) — colons in directory names are filesystem-unsafe
5. **YAML frontmatter**: required for SKILL.md files (name + description fields)
6. **Execution model**: agent teams instead of sequential sessions

---

## Repo Structure

```
falcon/                                    # /Users/rickhanlonii/oss/falcon/
├── CLAUDE.md                              # Project context for all sessions
├── package.json                           # Monorepo root
├── .claude/
│   ├── settings.json                      # Claude Code settings + skill permissions
│   ├── settings.local.json                # (exists already)
│   └── skills/                            # 19 Claude Code skills
│       ├── research-reconciler/SKILL.md
│       ├── research-flight-protocol/SKILL.md
│       ├── research-nextjs-flight/SKILL.md
│       ├── research-yoga-ios/SKILL.md
│       ├── research-js-engine/SKILL.md
│       ├── research-html-mapping/SKILL.md
│       ├── research-ios-uikit/SKILL.md
│       ├── generate-specs/SKILL.md
│       ├── impl-renderer/SKILL.md
│       ├── impl-html-components/SKILL.md
│       ├── impl-yoga-layout/SKILL.md
│       ├── impl-js-bridge/SKILL.md
│       ├── impl-flight-client/SKILL.md
│       ├── impl-build-system/SKILL.md
│       ├── impl-devtools/SKILL.md
│       ├── test-unit/SKILL.md
│       ├── test-e2e/SKILL.md
│       ├── check-status/SKILL.md
│       └── resume-work/SKILL.md
│
├── docs/
│   ├── MASTER_PLAN.md                     # Progress tracker with checkboxes
│   ├── plans/                             # Implementation plans
│   ├── research/                          # Output from research skills
│   └── specs/                             # Output from spec generation
│
├── packages/                              # Framework source (populated by impl skills)
│   ├── renderer/                          # Custom React renderer
│   ├── components/                        # HTML element → native mappings
│   ├── yoga-layout/                       # Yoga integration with web defaults
│   ├── bridge/                            # JS ↔ native communication
│   ├── flight-client/                     # RSC Flight client for native
│   └── cli/                              # Build tools and dev server
│
├── ios/                                   # Native iOS Swift code
├── server/                                # Next.js app (RSC server)
└── example/                               # Example app
```

---

## Team Architecture

```
┌─────────────────────────────────────────────────────┐
│  Leader (you)                                       │
│  - Task 1: Initialize repo (sequential)             │
│  - Task 6: Review & commit (sequential)             │
│                                                     │
│  Dispatches Agent Team (Tasks 2-5 in parallel):     │
│  ┌──────────────┐ ┌──────────────────────────┐      │
│  │ context      │ │ research-skills          │      │
│  │ CLAUDE.md    │ │ 7 research SKILL.md      │      │
│  │ MASTER_PLAN  │ │ files                    │      │
│  └──────────────┘ └──────────────────────────┘      │
│  ┌──────────────┐ ┌──────────────────────────┐      │
│  │ impl-skills  │ │ infra                    │      │
│  │ generate-    │ │ 4 test/orchestrate skills│      │
│  │ specs + 7    │ │ .claude/settings.json    │      │
│  │ impl skills  │ │ Next.js server placeholder│     │
│  └──────────────┘ └──────────────────────────┘      │
└─────────────────────────────────────────────────────┘
```

---

## Plan Files

| File | Agent | Contents |
|------|-------|----------|
| [`01-initialize-repo.md`](01-initialize-repo.md) | Leader (sequential) | git init, directories, package.json, .gitignore |
| [`02-project-context.md`](02-project-context.md) | `context-writer` | CLAUDE.md + docs/MASTER_PLAN.md |
| [`03-research-skills.md`](03-research-skills.md) | `research-skills-writer` | 7 research SKILL.md files |
| [`04-impl-skills.md`](04-impl-skills.md) | `impl-skills-writer` | generate-specs + 7 impl SKILL.md files |
| [`05-infrastructure.md`](05-infrastructure.md) | `infra-writer` | 4 test/orchestrate skills + settings.json + Next.js server |
| [`06-review-commit.md`](06-review-commit.md) | Leader (sequential) | Verify all files, review quality, git commit |

---

## Execution Order Summary

| Step | Agent | Task | Parallel? |
|------|-------|------|-----------|
| 1 | Leader | Initialize repo, directories, package.json, .gitignore | No |
| 2 | `context-writer` | CLAUDE.md + MASTER_PLAN.md | Yes (team) |
| 3 | `research-skills-writer` | 7 research SKILL.md files | Yes (team) |
| 4 | `impl-skills-writer` | generate-specs + 7 impl SKILL.md files | Yes (team) |
| 5 | `infra-writer` | 4 test/orchestrate skills + settings.json + Next.js server | Yes (team) |
| 6 | Leader | Review + git commit | No |

## Future Session Execution Order

After this bootstrap session, future sessions use the skills:

| Session | Skills | Agent Team Opportunity |
|---------|--------|----------------------|
| 1 | All 7 research skills | 7 parallel agents (one per research topic) |
| 2 | `generate-specs` | Single agent (must synthesize all research) |
| 3 | `impl-renderer` | Single agent (first impl, no parallelism) |
| 4 | `impl-js-bridge` + `impl-yoga-layout` | 2 parallel agents |
| 5 | `impl-html-components` | Single agent (depends on renderer + yoga) |
| 6 | `impl-flight-client` | Single agent (depends on renderer + bridge) |
| 7 | `impl-build-system` + `impl-devtools` | 2 parallel agents |
| 8 | Example app + Next.js server + `test-e2e` | Single agent (integration) |
