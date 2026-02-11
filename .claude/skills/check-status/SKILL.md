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
Phase 1: Research          — X/8 complete
Phase 1b: Arch Research    — X/6 complete
Phase 2: Specifications    — X/6 complete
Phase 2.5: Dependencies    — X/1 complete
Phase 3: Core Impl         — X/4 complete
Phase 4: Components        — X/2 complete
Phase 5: Polish            — X/5 complete
```

4. Determine current phase (first phase with unchecked items)
5. List which specific items are next, respecting dependencies:
   - Phase 1 research items have no dependencies (all parallelizable)
   - Phase 1b: first 4 items parallelizable (`cpp-shadow-tree`, `node-identity`, `event-system`, `no-viewconfig`)
   - Phase 1b: `mounting-scheduling` depends on `cpp-shadow-tree`
   - Phase 1b: `element-dispatch` depends on `event-system` + `no-viewconfig`
   - Specs depend on all Phase 1 AND Phase 1b research
   - `impl-renderer` is first impl (no impl dependencies)
   - `impl-js-bridge` + `impl-yoga-layout` can be parallel
   - `impl-xcode-project` depends on bridge
   - `impl-html-components` depends on renderer + yoga
   - `impl-flight-client` depends on renderer + bridge
   - `impl-build-system` depends on bridge
   - `impl-devtools` depends on build-system
6. Suggest the next skill(s) to run

7. Check for any research or spec documents that exist but aren't checked off in MASTER_PLAN.md (sync issue) and fix if found.
