// The derived-selectors suite's entry into the shared harness: every mount
// starts from the same seed data.

import {startSuiteBench} from '../common/harness';
import {createSeedData} from './data';
import {scenarios} from './scenarios';
import {DEFAULT_READERS_PER_CATEGORY, setReadersPerCategory} from './constants';

export function startBench(variant, createApp) {
  startSuiteBench(variant, () => createApp(createSeedData()), scenarios);
  // A scenario with `k` mounts k components per category (see scenarios.js).
  const mount = window.__bench.mount;
  window.__bench.mount = (n, scenarioName) => {
    setReadersPerCategory(
      scenarios[scenarioName]?.k ?? DEFAULT_READERS_PER_CATEGORY
    );
    return mount(n, scenarioName);
  };
}
