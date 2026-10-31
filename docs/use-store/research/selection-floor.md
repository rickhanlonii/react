# The selection floor: re-running a row vs. running its selectors

Why use(store) + the React Compiler still loses `selection` to Zustand when each row reads only two stores. Covers what was measured, what's inherent, and two design changes that could close the gap. Neither change is implemented.

## The case

- **Scenario:** the `sweeps` suite at 100% compiled rows (`store-c100-w*` vs `zustand-c100-w*`), N=1000.
  - Each row reads 2 stores: its entity and the selected id.
  - Changing the selected id re-renders all 1000 rows under use(store). Under Zustand it runs 2 selectors per row and re-renders 2 rows.
- **Result:** Zustand is faster. The main suite isn't affected: its rows read 4 stores (5 selectors under Zustand), and store wins every configuration there.
  - Final build (`react-builds/final`), sweep selection, ms per update:
    - 1×: store 0.143 / 0.149 / 0.161 vs zustand 0.109 / 0.110 / 0.114 for w4 / w8 / w16, about 1.3–1.4×.
    - 4×: 0.65 / 0.71 / 0.71 vs 0.50 / 0.51 / 0.54.

## Where the time goes

CPU profile of an unminified production build, c100-w8, N=1000, 1× (`profile.mjs --suite=sweeps`). µs per update at N=1000 is ns per row.

| | use(store) + compiler | Zustand |
|---|---:|---:|
| Fiber visit for the row: clone, beginWork, the lazy context walk, completeWork | ~28 (the same-element bailout 10.7, the context walk 8.9, complete 8.4) | ~37 (row bailout 16.9, context walk 8.7, beginWork 2.6, complete 8.9) |
| Running the component: renderWithHooks/updateFunctionComponent/beginWork | 23 | – |
| Compiled body: memo cache access and the 8 field comparisons | ~37 | – |
| `use(store)` ×2 | 18 | – |
| finishRenderingHooks: comparing the 2 reads, hooks bookkeeping | 10 | – |
| Marking 1000 readers at dispatch | 12 | – |
| Selectors: setState, listeners, uSES compares, 2 per row | – | ~50 |
| Commit | 13 | 20 |
| **Total** | **152** | **119** |

- **The per-row fiber visit is a wash.** Zustand's rows are cloned and bail out. Ours re-render, and the same-element bailout (DCP-10) skips their children, which costs about the same.
- **The difference is re-running the component against two property reads.**
  - Store-specific work (2 reads, comparing them, marking readers) is about 40 ns per row. Removing all of it would give about 112 against 119, roughly a tie.
  - The rest, running a compiled component at all, is about 60 ns per row: renderWithHooks plus the compiled body and its memo comparisons.
  - Zustand pays about 50 ns per row for selectors and never enters the component.

## What was tried

- **enableNoCloningMemoCache** (skips cloning the memo cache on every render): no measurable change, 0.95–1.06 on sweeps and noise on the main suite. See "Finding: enableNoCloningMemoCache" in DECISIONS.md.
- **Store-side trims, together** (`react-builds/opt11`): marking readers directly when no render is in progress (reviewed and approved), presizing `storeReads` from the previous render, and a leaner read comparison.
  - Sweep selection, store opt11/final: w4 0.98/1.02, w8 0.98/0.98, w16 0.93/0.97 (1×/4×). That's about 2%.
  - Main-suite selection: 1.00–1.03.
  - That's under the 5% bar for the added complexity, so all three were reverted. The final source doesn't include them.
- **What's left is inherent to the model.** A store has no selectors, so every reader of a changed store runs. With two cheap reads per row, a selector costs less than running a component, however cheap the run is.

## Two design changes that could close it (for Ricky; not done)

1. **Compiler-emitted pre-checks.** For a component whose only inputs that changed are store reads, and whose reads are used through cheap pure expressions (`use(s.selected) === id`), the compiler could emit a small check function next to the component: given the store values, does the memoized output change? React would run it before rendering the component and skip the render when the answer is no. That's a selector, but one the compiler derives and keeps correct, not one the user writes.
   - It would turn selection into about 1000 tiny checks plus 2 renders, which is Zustand's model.
   - It changes the contract: the check runs at render time instead of dispatch time, so it stays tearing-free. It also needs a way to attach compiled checks to components.
2. **A "re-render lite" path in the reconciler.** For compiled components whose pending lanes come only from store reads, React could:
   - skip the hooks setup;
   - read the new store values into the existing read list;
   - run only the memo blocks that depend on the changed reads, from compiler metadata about which cache slots depend on which reads;
   - fall back to a full render when anything else is pending.
   It's a smaller contract change than pre-checks, but it needs the compiler to emit dependency metadata, and React to run partial component bodies.

Either is a design change for both the compiler and the reconciler, not an optimization of the store implementation.
