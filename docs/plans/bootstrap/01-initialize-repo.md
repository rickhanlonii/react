# Task 1: Initialize Repository (Leader — Sequential)

> Part of [Bootstrap Plan](00-overview.md). Run this first, before dispatching the agent team.

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: all directories listed in repo structure

---

**Step 1: Initialize git**

```bash
cd /Users/rickhanlonii/oss/falcon && git init
```

**Step 2: Create directory structure**

```bash
mkdir -p .claude/skills
mkdir -p docs/{plans,research,specs}
mkdir -p packages/{renderer,components,yoga-layout,bridge,flight-client,cli}
mkdir -p ios server example
```

**Step 3: Write package.json**

Create `/Users/rickhanlonii/oss/falcon/package.json`:

```json
{
  "name": "react-dom-native",
  "version": "0.0.1",
  "private": true,
  "description": "React framework mapping HTML elements to native iOS views",
  "workspaces": [
    "packages/*",
    "server"
  ],
  "scripts": {
    "dev:server": "cd server && npm run dev"
  },
  "license": "MIT"
}
```

**Step 4: Create .gitignore**

Create `/Users/rickhanlonii/oss/falcon/.gitignore`:

```
node_modules/
.next/
build/
dist/
*.xcworkspace
*.xcuserdata
DerivedData/
.env
.env.local
```

**Step 5: Verify**

```bash
ls -la /Users/rickhanlonii/oss/falcon/
ls -R /Users/rickhanlonii/oss/falcon/packages/
```

Expected: All directories exist, package.json and .gitignore present.
