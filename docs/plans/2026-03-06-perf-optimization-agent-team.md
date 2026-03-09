# Perf Optimization Agent Team

## Context

`npm run perf` profiles a tap on "stress-increment-all" (50 counters). Current baseline is ~35ms. Goal: 10x faster (~3.5ms). An agent team should iterate: profile → identify bottleneck → fix → rebuild → re-profile → repeat.

## Team Structure

**Team name**: `perf-optimization`

| Agent | Type | Role |
|-------|------|------|
| **perf-lead** | main agent (you) | Orchestrates loop, runs profiling, rebuilds app, commits wins |
| **swift-optimizer** | general-purpose | Implements Swift optimizations (Renderer, UIKitMutationApplier, Yoga) |
| **js-optimizer** | general-purpose | Implements JS optimizations (HostConfig, scheduler) |

Only 3 agents. Perf optimization is inherently sequential (measure → change → measure), so a small team avoids coordination overhead.

## Iteration Loop

```
1. BASELINE
   Lead runs: npm run perf
   Record total_ms as baseline

2. ANALYZE
   Lead reads report, identifies the slowest phase/operation
   Creates 1-2 TaskCreate entries with:
   - What to change (specific file, function, line range)
   - Why it's slow (from the profile data)
   - Expected savings
   - How to verify (npm test / npm run test:swift)

3. OPTIMIZE (parallel where possible)
   - Swift tasks → swift-optimizer
   - JS tasks → js-optimizer
   - Each optimizer: implement change → run tests → mark task complete
   - Optimizers MUST NOT touch files outside their domain

4. REBUILD (lead only)
   - If Swift changed: npm run app:terminate && npm run app:run
     (esbuild watcher auto-rebuilds JS, but Swift needs app relaunch)
   - Wait for app to be ready

5. MEASURE
   Lead runs: npm run perf
   Compare total_ms to previous iteration

6. DECIDE
   - If improved: git add + git commit the change with perf delta in message
   - If regressed or no improvement: git checkout -- . to revert
   - Update iteration log in docs/plans/agent-state/perf-lead.log.md

7. REPEAT from step 2 until total_ms < 3.5ms or no more optimizations found
```

## Optimization Queue (priority order)

Each optimization is one iteration. Do them in order — measure after each.

### Quick wins (high confidence, low risk)

1. **Remove debug logging** — UIKitMutationApplier.swift `print()` calls + HostConfig.js `console.log()` calls. Expected: -2-4ms
2. **Eliminate redundant syncAllFrames** — Renderer.swift walks entire tree after mutations already set frames. Track which nodes got frames in applyMutations, skip them. Expected: -2-5ms
3. **Skip diff for identical pointers** — Differentiator.swift: if `oldChild === newChild` (same object), skip recursion. Expected: -0.5-1ms

### Medium effort (moderate confidence)

4. **Parse style dict once** — UIKitMutationApplier.swift parses the style dictionary 3+ times per CREATE mutation. Parse once, pass struct. Expected: -2-3ms
5. **View recycling pool** — UIKitMutationApplier.swift: pool deleted UIViews by element type, reuse on CREATE. Expected: -3-5ms
6. **Cache color parsing** — UIKitMutationApplier.swift: cache UIColor instances by CSS color string. Expected: -1-3ms
7. **setImmediate polyfill** — Replace `setTimeout(fn, 0)` in scheduler with immediate GCD dispatch. Expected: -5-10ms

### Advanced (if still needed)

8. **Batch CALayer changes** — Group all layer property changes, commit once
9. **Lazy prop diffing** — Only diff props that actually changed (use dirty flags)
10. **Structural sharing** — Reuse unchanged subtree UIViews without re-creating

## Key Files

| File | Owner | What to optimize |
|------|-------|-----------------|
| `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/UIKitMutationApplier.swift` | swift-optimizer | Remove prints, view pool, style parsing, color cache |
| `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Renderer.swift` | swift-optimizer | Remove syncAllFrames, batch CA changes |
| `packages/react-dom-native/ios/Sources/ReactDomNativeKit/Bindings/Bindings+Registration.swift` | swift-optimizer | Reduce per-call work |
| `packages/react-dom-native/src/HostConfig.js` | js-optimizer | Remove console.logs |
| `packages/react-dom-native/src/scheduler.js` (or polyfill) | js-optimizer | setImmediate |

## Rebuild Rules

- **JS-only changes**: No rebuild needed. esbuild watcher picks up changes. Just re-run `npm run perf`.
- **Swift changes**: Must relaunch app. Lead runs `npm run app:terminate` then `npm run app:run`, waits 3s, then runs `npm run perf`.
- **Yoga C++ changes**: Full rebuild needed. Lead runs `npm run app:clean` then rebuilds.

## Regression Handling

After each `npm run perf`:
- If `total_ms` decreased: keep changes, commit with message like `perf: remove debug logging (-3ms, 35ms→32ms)`
- If `total_ms` increased or unchanged: `git checkout -- .` to revert all uncommitted changes
- Always log the result to `docs/plans/agent-state/perf-lead.log.md`

## Success Criteria

- **Goal**: total_ms < 3.5ms (10x improvement from ~35ms baseline)
- **Stretch**: get as fast as possible even if 10x isn't achievable
- **Stop when**: no more known optimizations AND the last 3 attempts showed no improvement

## Verification

After all optimizations:
1. `npm test` — JS unit tests pass
2. `npm run test:swift` — Swift tests pass
3. `npm run perf --runs 3` — averaged result confirms improvement
4. `npm run app:screenshot` — app still renders correctly
