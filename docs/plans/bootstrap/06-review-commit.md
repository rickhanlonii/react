# Task 6: Review & Commit (Leader — Sequential)

> Part of [Bootstrap Plan](00-overview.md). Run this after all agent team tasks (2-5) are complete.

---

### Step 1: Verify all files exist

```bash
cd /Users/rickhanlonii/oss/falcon

# Check all 19 skill files exist
for skill in research-reconciler research-flight-protocol research-nextjs-flight research-yoga-ios research-js-engine research-html-mapping research-ios-uikit generate-specs impl-renderer impl-html-components impl-yoga-layout impl-js-bridge impl-flight-client impl-build-system impl-devtools test-unit test-e2e check-status resume-work; do
  test -f ".claude/skills/$skill/SKILL.md" && echo "OK: $skill" || echo "MISSING: $skill"
done

# Check other files
test -f CLAUDE.md && echo "OK: CLAUDE.md" || echo "MISSING: CLAUDE.md"
test -f docs/MASTER_PLAN.md && echo "OK: MASTER_PLAN.md" || echo "MISSING: MASTER_PLAN.md"
test -f .claude/settings.json && echo "OK: settings.json" || echo "MISSING: settings.json"
test -f server/package.json && echo "OK: server/package.json" || echo "MISSING: server/package.json"
test -f server/app/layout.tsx && echo "OK: layout.tsx" || echo "MISSING: layout.tsx"
test -f server/app/page.tsx && echo "OK: page.tsx" || echo "MISSING: page.tsx"
test -f package.json && echo "OK: package.json" || echo "MISSING: package.json"
test -f .gitignore && echo "OK: .gitignore" || echo "MISSING: .gitignore"
```

Expected: All 19 skills show OK, all other files show OK.

---

### Step 2: Review skill content quality

Spot-check a few skill files to verify:
- YAML frontmatter is valid (has `name` and `description`)
- Instructions are actionable
- File paths reference correct locations
- Research skills point to real reference files

---

### Step 3: Run check-status skill

Run `/check-status` to verify it correctly reports:
```
Phase 1: Research       — 0/7 complete
Phase 2: Specifications — 0/6 complete
Phase 3: Core Impl      — 0/3 complete
Phase 4: Components     — 0/2 complete
Phase 5: Polish         — 0/5 complete
```

---

### Step 4: Git commit

```bash
cd /Users/rickhanlonii/oss/falcon
git add -A
git commit -m "Bootstrap react-dom-native autonomous pipeline

- CLAUDE.md with project context, architecture, and skill index
- docs/MASTER_PLAN.md with phased progress tracker
- 19 Claude Code skills: 7 research, 1 spec, 7 impl, 2 test, 2 orchestrate
- Next.js server placeholder (server/)
- Directory structure for all packages
- .claude/settings.json with permissions"
```
