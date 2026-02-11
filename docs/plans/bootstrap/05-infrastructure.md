# Task 5: Write Infrastructure Files (Agent: `infra-writer`)

> Part of [Bootstrap Plan](00-overview.md). Runs in parallel with Tasks 2, 3, 4.

**Files:**
- Create: `.claude/skills/test-unit/SKILL.md`
- Create: `.claude/skills/test-e2e/SKILL.md`
- Create: `.claude/skills/check-status/SKILL.md`
- Create: `.claude/skills/resume-work/SKILL.md`
- Create: `.claude/settings.json`
- Create: `server/package.json`
- Create: `server/next.config.ts`
- Create: `server/app/layout.tsx`
- Create: `server/app/page.tsx`

---

### Step 1: Create skill directories

```bash
cd /Users/rickhanlonii/oss/falcon
mkdir -p .claude/skills/{test-unit,test-e2e,check-status,resume-work}
mkdir -p server/app
```

---

### Step 2: Write test-unit/SKILL.md

Create `/Users/rickhanlonii/oss/falcon/.claude/skills/test-unit/SKILL.md`:

```markdown
---
name: test-unit
description: Run unit tests for a react-dom-native package. Usage: /test-unit renderer
argument-hint: <package-name>
---

# Run Unit Tests

## Arguments

`$ARGUMENTS` — the package name to test (e.g., `renderer`, `components`, `yoga-layout`, `bridge`, `flight-client`)

## Instructions

1. Determine the package path: `packages/$ARGUMENTS/`
2. Check that the package has tests: `packages/$ARGUMENTS/src/__tests__/`
3. Run the tests:

```bash
cd /Users/rickhanlonii/oss/falcon/packages/$ARGUMENTS
npm test
```

4. If no test script exists in the package's `package.json`, run with jest directly:

```bash
npx jest packages/$ARGUMENTS/src/__tests__/ --verbose
```

5. Report results: number of tests passed/failed, any error output
6. If tests fail, read the failing test and the source code it tests, then suggest fixes
```

---

### Step 3: Write test-e2e/SKILL.md

Create `/Users/rickhanlonii/oss/falcon/.claude/skills/test-e2e/SKILL.md`:

```markdown
---
name: test-e2e
description: Run end-to-end test — start Next.js server, build iOS app, verify native rendering.
---

# End-to-End Test

## Instructions

1. **Start Next.js server**:
   ```bash
   cd /Users/rickhanlonii/oss/falcon/server && npm run dev &
   ```
   Wait for "Ready" message.

2. **Build JS bundle**:
   ```bash
   cd /Users/rickhanlonii/oss/falcon && npm run build:js
   ```

3. **Build iOS app** (simulator):
   ```bash
   cd /Users/rickhanlonii/oss/falcon && npm run build:ios -- -destination 'platform=iOS Simulator,name=iPhone 16'
   ```

4. **Verify**:
   - Check build succeeded
   - If the app can be launched in simulator, verify it connects to the Next.js server
   - Check for any crash logs

5. **Cleanup**:
   - Kill the Next.js dev server
   - Report build results

6. If anything fails, document the failure and suggest what needs to be fixed.
```

---

### Step 4: Write check-status/SKILL.md

Create `/Users/rickhanlonii/oss/falcon/.claude/skills/check-status/SKILL.md`:

```markdown
---
name: check-status
description: Check project progress and suggest what to work on next.
---

# Check Status

## Instructions

1. Read `docs/MASTER_PLAN.md`
2. Count checked vs unchecked items per phase
3. Report progress:

```
Phase 1: Research      — X/7 complete
Phase 2: Specifications — X/6 complete
Phase 3: Core Impl     — X/3 complete
Phase 4: Components    — X/2 complete
Phase 5: Polish        — X/5 complete
```

4. Determine current phase (first phase with unchecked items)
5. List which specific items are next, respecting dependencies:
   - Research items have no dependencies (all parallelizable)
   - Specs depend on all research
   - `impl-renderer` is first impl (no impl dependencies)
   - `impl-js-bridge` + `impl-yoga-layout` can be parallel
   - `impl-html-components` depends on renderer + yoga
   - `impl-flight-client` depends on renderer + bridge
   - `impl-build-system` depends on bridge
   - `impl-devtools` depends on build-system
6. Suggest the next skill(s) to run

7. Check for any research or spec documents that exist but aren't checked off in MASTER_PLAN.md (sync issue) and fix if found.
```

---

### Step 5: Write resume-work/SKILL.md

Create `/Users/rickhanlonii/oss/falcon/.claude/skills/resume-work/SKILL.md`:

```markdown
---
name: resume-work
description: Resume work from where the last session left off. Run this at the start of any new session.
---

# Resume Work

## Instructions

1. Read `CLAUDE.md` for project context
2. Run `/check-status` to see current progress
3. Check `git log --oneline -10` for recent work
4. Check for any uncommitted changes: `git status`
5. If there are uncommitted changes:
   - Read the changed files to understand what was in progress
   - Decide: commit them or continue working on them
6. Based on status, determine the next skill to run
7. Report what was last completed and what should be done next
8. Ask the user if they want to proceed with the suggested next step, or if they have a different priority
```

---

### Step 6: Write .claude/settings.json

Create `/Users/rickhanlonii/oss/falcon/.claude/settings.json`:

```json
{
  "permissions": {
    "allow": [
      "Bash(cd /Users/rickhanlonii/oss/falcon:*)",
      "Bash(npm:*)",
      "Bash(npx:*)",
      "Bash(node:*)",
      "Bash(git:*)",
      "Bash(ls:*)",
      "Bash(cat:*)",
      "Bash(mkdir:*)",
      "Bash(xcodebuild:*)"
    ]
  }
}
```

---

### Step 7: Write Next.js server placeholder

Create `/Users/rickhanlonii/oss/falcon/server/package.json`:

```json
{
  "name": "react-dom-native-server",
  "version": "0.0.1",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start"
  },
  "dependencies": {
    "next": "^15",
    "react": "^19",
    "react-dom": "^19"
  }
}
```

Create `/Users/rickhanlonii/oss/falcon/server/next.config.ts`:

```typescript
import type { NextConfig } from 'next';

const nextConfig: NextConfig = {};

export default nextConfig;
```

Create `/Users/rickhanlonii/oss/falcon/server/app/layout.tsx`:

```tsx
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <>{children}</>;
}
```

Create `/Users/rickhanlonii/oss/falcon/server/app/page.tsx`:

```tsx
export default function Home() {
  return (
    <div>
      <h1>react-dom-native</h1>
      <p>This RSC page will be rendered natively on iOS.</p>
    </div>
  );
}
```

---

### Step 8: Verify

```bash
ls /Users/rickhanlonii/oss/falcon/.claude/skills/
ls /Users/rickhanlonii/oss/falcon/server/app/
cat /Users/rickhanlonii/oss/falcon/.claude/settings.json
```

Expected: 19 skill directories, server/app has layout.tsx and page.tsx, settings.json exists.
