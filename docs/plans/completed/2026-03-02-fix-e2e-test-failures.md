# Fix E2E Test Failures

## Goal

Find the commit that broke the E2E tests (11 failures: 7 CSR, 4 SSR), then investigate and fix the root cause.

## Task 1: Bisect to Find the Breaking Commit

The E2E tests run in ~2 minutes. Use manual git bisect to find when they broke.

**Known good**: `51f6881` (first commit with CSR E2E tests — they wouldn't have been merged broken)
**Known bad**: `75c74b1` (HEAD — 11 failures)

**Step 1**: Run `git bisect start 75c74b1 51f6881`

**Step 2**: At each bisect point, run `npm run test:e2e-swift` and check the result:
- If all E2E tests pass → `git bisect good`
- If any E2E tests fail → `git bisect bad`

**Step 3**: Continue until bisect identifies the first bad commit. Record it.

**Step 4**: Run `git bisect reset` to return to HEAD.

## Task 2: Analyze the Breaking Commit

**Step 1**: Read the full diff of the breaking commit (`git show <commit>`)

**Step 2**: Identify what changed and form a hypothesis for why it breaks:
- CSR tests: all 7 fail with timeouts, meaning `render(url:)` → `rt.boot()` → views never appear
- SSR tests: 4 fail with timeouts, meaning hydration/Suspense reveals never complete
- The "[SSR] Parse error: Unknown instruction opcode: D" warnings appear but are harmless (present in passing tests too)

**Step 3**: Check if the breaking commit touches:
- `Root.swift` (render method, boot flow)
- `ReactRuntime.swift` (boot, bundle loading)
- `NativeFizzConfig.js` (SSR stream format)
- `ssr-server.js` (server-side rendering)
- `Root+SSR.swift` (hydration flow)
- Test infrastructure or server startup

## Task 3: Fix the Root Cause

Based on the analysis from Task 2, implement the fix. The fix depends on what the bisect reveals, but likely candidates:

**If it's a race condition in `cleanupSSRState`**: The SSR stream completion handler calls `cleanupSSRState()` which nils out `ssrCoordinator` before hydration starts. The `doHydrate` closure references `self.ssrCoordinator?.onViewsNeedUpdate` — if coordinator is nil, boundary reveals after hydration won't update views. Fix: don't clean up coordinator until after hydration commits.

**If it's a boot/bundle loading issue**: The CSR path calls `rt.boot()` which downloads the bundle from `devBundleURL`. If something changed in the boot flow or URL handling, all CSR tests would fail. Fix: restore the working boot path.

**If it's an SSR stream format change**: The `writeCompletedRoot` or `writeHoistables` changes could affect instruction ordering. Fix: ensure BOOT and R instructions emit correctly.

## Task 4: Verify the Fix

**Step 1**: Run `npm run test:e2e-swift` — all 27 tests should pass (minus 1 skipped)

**Step 2**: Run `npm test` — JS unit tests should still pass

**Step 3**: Run `npm run test:swift` — Swift unit tests should still pass

## Task 5: Commit

Commit the fix with a message describing the root cause and what was fixed.
