// The frame side of the tearing demo. It runs in a step frame (React with
// scheduler/unstable_mock), one frame per source, and the page steps the
// frames in lockstep. Each frame renders the same tree: an App whose state
// changes in a transition, and a row of cells that each read the source.
//
// Sources:
// - 'global': a mutable module-level object, read directly in render.
// - 'uses': an external store read with useSyncExternalStore.
// - 'store': a store read with use(store), changed from a message event,
//   so the update gets the default lane;
// - 'store-click': the same, changed from a click handler, so the update
//   gets the sync lane (a discrete event).
//
// Every cell calls Scheduler.log when it renders, and a step flushes until
// the next log, so a step renders one cell of a time-sliced render. Cells
// also log from a layout effect, so a commit ends a step too. The page
// mutates the source between steps, in the middle of the render.
//
// They're separate frames because a useSyncExternalStore change schedules a
// sync render, which would interrupt the other columns' render if they
// shared a root.

'use strict';

const {snapshotRecord, findRecord, peekHead} = require('./internals');

const CELLS = 4;

function noop() {}

function createExternalStore(initial) {
  let value = initial;
  const listeners = new Set();
  return {
    getSnapshot: () => value,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    set(next) {
      value = next;
      listeners.forEach(listener => listener());
    },
  };
}

function createTearingDemo({
  React,
  ReactDOM,
  createRoot,
  Scheduler,
  container,
  source,
}) {
  const h = React.createElement;
  if (
    source !== 'global' &&
    source !== 'uses' &&
    source !== 'store' &&
    source !== 'store-click'
  ) {
    throw new Error('Unknown source ' + source);
  }
  const readsStore = source === 'store' || source === 'store-click';
  // The lane the last store.update() got, read from the record.
  let changeLane = null;

  let root = null;
  let globalSource = null;
  let external = null;
  let store = null;
  let setRound = null;
  let log = [];
  let command = 'reset';

  function useSource() {
    if (source === 'global') {
      return globalSource.value;
    }
    if (source === 'uses') {
      return React.useSyncExternalStore(
        external.subscribe,
        external.getSnapshot
      );
    }
    return React.use(store);
  }

  // A real click on a button outside React, so the update runs inside a
  // discrete event, like a store.update() in a click handler.
  const clicker = document.createElement('button');
  clicker.type = 'button';
  clicker.hidden = true;
  clicker.setAttribute('aria-label', 'Change the store in a click');
  clicker.addEventListener('click', () => updateStore());
  document.body.appendChild(clicker);

  function updateStore() {
    const record = findRecord(store);
    const before = record === null ? 0 : record.lanes;
    store.update(value => value + 1);
    changeLane = record === null ? null : record.lanes & ~before;
  }

  function Cell({index, round}) {
    const value = useSource();
    log.push({type: 'render', cell: index, value, round, command});
    Scheduler.log('cell');
    React.useLayoutEffect(() => {
      recordCommit();
      Scheduler.log('commit');
    });
    return h(
      'span',
      {className: 'tear-cell', 'data-cell': index},
      String(value)
    );
  }

  function App() {
    const [round, set] = React.useState(0);
    setRound = set;
    const cells = [];
    for (let i = 0; i < CELLS; i++) {
      cells.push(h(Cell, {key: i, index: i, round}));
    }
    return h('div', {className: 'tear-row', 'data-round': round}, cells);
  }

  function committedValues() {
    const nodes = container.querySelectorAll('[data-cell]');
    const values = [];
    for (let i = 0; i < nodes.length; i++) {
      values.push(Number(nodes[i].textContent));
    }
    return values;
  }

  // Records what the screen shows after a commit. Every cell that commits
  // calls this from a layout effect, when the whole tree is on screen, so
  // repeated calls in one commit are deduped by what's on screen.
  let lastCommitted = null;
  function recordCommit() {
    const values = committedValues();
    const key =
      values.join(',') + '|' + container.firstChild.getAttribute('data-round');
    if (key !== lastCommitted) {
      lastCommitted = key;
      log.push({
        type: 'commit',
        values,
        round: Number(container.firstChild.getAttribute('data-round')),
        command,
      });
    }
  }

  function settle() {
    return new Promise(resolve => setTimeout(resolve, 0));
  }

  function snapshot() {
    const entries = log;
    log = [];
    let readers = null;
    if (readsStore) {
      const record = snapshotRecord(store);
      readers = record === null ? 0 : record.readerCount;
    }
    return {
      source,
      log: entries,
      screen: committedValues(),
      value:
        source === 'global'
          ? globalSource.value
          : source === 'uses'
            ? external.getSnapshot()
            : peekHead(store),
      readers,
      changeLane,
      hasPendingWork: Scheduler.unstable_hasPendingWork(),
    };
  }

  async function reset() {
    if (root !== null) {
      root.unmount();
    }
    globalSource = {value: 0};
    lastCommitted = null;
    changeLane = null;
    external = createExternalStore(0);
    store = React.unstable_createStore(0);
    root = createRoot(container, {onDefaultTransitionIndicator: noop});
    command = 'reset';
    ReactDOM.flushSync(() => root.render(h(App)));
    // Mount effects (useSyncExternalStore subscribes in a passive effect).
    Scheduler.unstable_flushAllWithoutAsserting();
    Scheduler.unstable_clearLog();
    await settle();
    log = [];
    return snapshot();
  }

  // Starts a transition that re-renders every cell.
  async function start() {
    command = 'start';
    React.startTransition(() => setRound(round => round + 1));
    await settle();
    return snapshot();
  }

  // Renders until the next cell or the next commit.
  async function step() {
    command = 'step';
    Scheduler.unstable_clearLog();
    if (Scheduler.unstable_hasPendingWork()) {
      Scheduler.unstable_flushNumberOfYields(1);
    }
    Scheduler.unstable_clearLog();
    await settle();
    return snapshot();
  }

  // Changes the source from outside React, in the middle of the render.
  async function mutate() {
    command = 'mutate';
    Scheduler.unstable_clearLog();
    if (source === 'global') {
      globalSource.value++;
    } else if (source === 'uses') {
      external.set(external.getSnapshot() + 1);
    } else if (source === 'store') {
      updateStore();
    } else {
      clicker.click();
    }
    // A sync render, if one was scheduled, runs in a microtask.
    await settle();
    Scheduler.unstable_clearLog();
    return snapshot();
  }

  // Runs everything that's left.
  async function finish() {
    command = 'finish';
    Scheduler.unstable_flushAllWithoutAsserting();
    Scheduler.unstable_clearLog();
    await settle();
    return snapshot();
  }

  return {reset, start, step, mutate, finish, snapshot, cells: CELLS};
}

module.exports = {createTearingDemo, createExternalStore, CELLS};
