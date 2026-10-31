// The in-page benchmark API for the suites ported from
// reduxjs/react-redux-benchmarks. Same shape as src/shared/harness.jsx
// (window.__bench), but each suite brings its own scenarios, and every variant
// runs a fixed number of steps per sample so state that accumulates (comments,
// strings, logs) ends up the same in every variant. The data size is fixed by
// the scenario, so `n` is ignored.

import {createRoot} from 'react-dom/client';
import {flushSync} from 'react-dom';
import {counts, resetCounts} from './instrument';

function hashString(string) {
  let hash = 5381;
  for (let i = 0; i < string.length; i++) {
    hash = (hash * 33) ^ string.charCodeAt(i);
  }
  return (hash >>> 0).toString(16);
}

// A textarea's value isn't in innerHTML after an update, so add it.
function snapshot(container) {
  let html = container.innerHTML;
  const fields = container.querySelectorAll('textarea, input');
  for (let i = 0; i < fields.length; i++) {
    html += '|' + fields[i].value;
  }
  return html;
}

// createApp() returns {App, actions}. It's called on every mount, and has to
// reset any state the variant keeps (stores, counters, generators).
export function startSuiteBench(variant, createApp, scenarios) {
  let root = null;
  let container = null;
  let app = null;

  function unmount() {
    if (root !== null) {
      flushSync(() => root.unmount());
      container.remove();
      root = null;
      container = null;
      app = null;
    }
  }

  function step(scenarioName, i) {
    scenarios[scenarioName].step(app.actions, i, container);
  }

  window.__bench = {
    variant,

    mount(_n, _scenarioName) {
      unmount();
      app = createApp();
      container = document.createElement('div');
      container.id = 'app';
      document.body.appendChild(container);
      root = createRoot(container);
      const t0 = performance.now();
      flushSync(() => root.render(<app.App />));
      // Flush anything the mount effects scheduled.
      flushSync(() => {});
      return performance.now() - t0;
    },

    // Every variant runs exactly warmup + iterations * batch steps.
    run(scenarioName, iterations, warmup) {
      const batch = scenarios[scenarioName].batch;
      for (let i = 0; i < warmup; i++) {
        flushSync(() => step(scenarioName, i));
      }
      const durations = new Array(iterations);
      let i = warmup;
      for (let sample = 0; sample < iterations; sample++) {
        const t0 = performance.now();
        for (let b = 0; b < batch; b++) {
          flushSync(() => step(scenarioName, i++));
        }
        durations[sample] = (performance.now() - t0) / batch;
      }
      return {durations, batch};
    },

    trace(scenarioName, steps) {
      const hashes = [hashString(snapshot(container))];
      for (let i = 0; i < steps; i++) {
        flushSync(() => step(scenarioName, i));
        hashes.push(hashString(snapshot(container)));
      }
      return hashes;
    },

    html() {
      return snapshot(container);
    },

    countStep(scenarioName, i) {
      resetCounts();
      flushSync(() => step(scenarioName, i));
      return {...counts};
    },

    // The average work per step over `count` steps starting at `from`, since
    // a single step of a random mix isn't representative.
    countSteps(scenarioName, from, count) {
      resetCounts();
      for (let i = from; i < from + count; i++) {
        flushSync(() => step(scenarioName, i));
      }
      const average = {};
      for (const key in counts) {
        average[key] = counts[key] / count;
      }
      return average;
    },

    setWork() {},

    unmount,
  };
}
