// The in-page benchmark API, driven by run.mjs through window.__bench.

import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {createEntities} from './data';
import {scenarios} from './scenarios';
import {counts, resetCounts, work} from './views';

function hashString(string) {
  let hash = 5381;
  for (let i = 0; i < string.length; i++) {
    hash = (hash * 33) ^ string.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

export function startBench(variant, createApp) {
  let root = null;
  let container = null;
  let app = null;
  let n = 0;

  function unmount() {
    if (root !== null) {
      flushSync(() => root.unmount());
      container.remove();
      root = null;
      container = null;
      app = null;
    }
  }

  window.__bench = {
    variant,

    // Mounts the app with n entities, set up for the given scenario, and
    // returns how long the mount took.
    mount(entityCount, scenarioName) {
      unmount();
      n = entityCount;
      const scenario = scenarios[scenarioName] || {};
      // Details are read in a child component (the idiomatic pattern for
      // selector libraries) unless the scenario says otherwise, so only
      // details-inline pays for an inline details selector in every row.
      app = createApp(createEntities(n), {
        details: 'component',
        ...scenario.options,
      });
      container = document.createElement('div');
      container.id = 'app';
      document.body.appendChild(container);
      root = createRoot(container);
      const t0 = performance.now();
      flushSync(() => root.render(<app.App />));
      const mountTime = performance.now() - t0;
      if (scenario.setup) {
        flushSync(() => scenario.setup(app.actions, n));
      }
      return mountTime;
    },

    // Runs a scenario and returns the average duration of a step in each
    // sample. Fast steps are timed in batches so each sample is at least
    // ~5ms, which keeps timer resolution (100µs without cross-origin
    // isolation) to a couple of percent per sample.
    run(scenarioName, iterations, warmup) {
      const scenario = scenarios[scenarioName];
      const step = i => scenario.step(app.actions, i, n);
      const warmupStart = performance.now();
      for (let i = 0; i < warmup; i++) {
        flushSync(() => step(i));
      }
      const estimate = (performance.now() - warmupStart) / Math.max(warmup, 1);
      // Batches have an even size so toggle scenarios (like add/remove) are
      // measured in pairs.
      let batch = Math.min(
        200,
        Math.max(1, Math.ceil(5 / Math.max(estimate, 0.001)))
      );
      if (batch > 1 && batch % 2 === 1) {
        batch++;
      }
      const durations = new Array(iterations);
      let i = warmup;
      for (let sample = 0; sample < iterations; sample++) {
        const t0 = performance.now();
        for (let b = 0; b < batch; b++) {
          flushSync(() => step(i++));
        }
        durations[sample] = (performance.now() - t0) / batch;
      }
      return {durations, batch};
    },

    // Runs a scenario step by step and returns the DOM hash after each step,
    // to check that every variant renders the same thing.
    trace(scenarioName, steps) {
      const scenario = scenarios[scenarioName];
      const hashes = [hashString(container.innerHTML)];
      for (let i = 0; i < steps; i++) {
        flushSync(() => scenario.step(app.actions, i, n));
        hashes.push(hashString(container.innerHTML));
      }
      return hashes;
    },

    // Runs one step and returns the work it did. Only meaningful in the
    // counting build.
    countStep(scenarioName, i) {
      const scenario = scenarios[scenarioName];
      resetCounts();
      flushSync(() => scenario.step(app.actions, i, n));
      return {...counts};
    },

    setWork(iterations) {
      work.iterations = iterations;
    },

    unmount,
  };
}
