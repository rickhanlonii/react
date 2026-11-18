// Counters for the counting build (__COUNT__), shared by the suites in
// src/redux-suite. `renders` is every component render, `selectors` is every
// selector call, and `derivations` is every run of an expensive derivation (a
// createSelector result function, or the same computation in a component or
// selector).

/* global __COUNT__ */

export const counts = {renders: 0, selectors: 0, derivations: 0};

export function countRender() {
  if (__COUNT__) {
    counts.renders++;
  }
}

export function counted(selector) {
  if (!__COUNT__) {
    return selector;
  }
  return function countedSelector(...args) {
    counts.selectors++;
    return selector(...args);
  };
}

export function derivation(compute) {
  if (!__COUNT__) {
    return compute;
  }
  return function countedDerivation(...args) {
    counts.derivations++;
    return compute(...args);
  };
}

export function resetCounts() {
  counts.renders = 0;
  counts.selectors = 0;
  counts.derivations = 0;
}
