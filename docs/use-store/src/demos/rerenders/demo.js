// The frame side of the "who re-renders" demo: mounts one panel's App and
// runs the page's commands, each inside flushSync, like the benchmarks. The
// snapshot reports how many times each component's body ran (the counters
// in counts.js) and how many times selectors ran.

import {createElement} from 'react';
import {takeCounts} from './counts';

// The frame's DevTools hook (sandbox/frame-hook.js) flashes the components
// that rendered in each commit and counts them by name, the way React
// DevTools decides what rendered. Returns the counts since the last call.
function takeFlashes() {
  const hook = window.__renders;
  if (hook == null || typeof hook.counts !== 'function') {
    return null;
  }
  const counts = hook.counts();
  hook.reset();
  return counts;
}

export function createRerenderDemo(variant, {ReactDOM, createRoot, container}) {
  let root = null;
  let actions = null;

  function settle() {
    return new Promise(resolve => setTimeout(resolve, 0));
  }

  function snapshot() {
    const taken = takeCounts();
    const rows = container.querySelectorAll('li');
    const screen = [];
    for (let i = 0; i < rows.length; i++) {
      screen.push(
        (rows[i].getAttribute('aria-selected') === 'true' ? '*' : '') +
          rows[i].textContent
      );
    }
    return {
      renders: taken.renders,
      selectorCalls: taken.selectorCalls,
      // What the frame's DevTools hook saw render, by component name, to
      // compare with the body counters (G4). Null if the hook doesn't
      // report renders.
      flashes: takeFlashes(),
      screen,
    };
  }

  async function reset() {
    if (root !== null) {
      root.unmount();
    }
    actions = variant.createState();
    root = createRoot(container);
    ReactDOM.flushSync(() => root.render(createElement(variant.App)));
    await settle();
    takeCounts();
    takeFlashes();
    return snapshot();
  }

  // command: {type: 'select' | 'edit', id}
  async function run(command) {
    ReactDOM.flushSync(() => actions[command.type](command.id));
    await settle();
    return snapshot();
  }

  return {reset, run, snapshot};
}
