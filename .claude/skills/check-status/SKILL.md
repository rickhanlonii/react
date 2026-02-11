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
