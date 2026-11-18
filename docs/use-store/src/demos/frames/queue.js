// The frame side of the queue and lane visualizer. It runs in a step frame:
// React with scheduler/unstable_mock, so nothing renders until the page asks.
//
// One store, one root, one component that reads the store. The page
// dispatches updates (default, transition or sync) and steps renders, and
// after each command gets a snapshot of the root's record of the store.
//
// Dispatched updates wait in React's concurrent queue until the next render
// starts, and that queue isn't reachable from outside. So the frame keeps
// its own list of them ("in flight"), with the lane React gave each one,
// read from the lanes it added to the root. Once a render starts they're in
// the record, and G4 checks that the lanes agree.

'use strict';

const Preview = require('../runtime/queue-preview');
const {findRecord, snapshotRecord, peekHead} = require('./internals');

const {NoLane, SyncLane, DefaultLane} = Preview;

function reducer(state, action) {
  switch (action.op) {
    case 'add':
      return state + action.n;
    case 'mul':
      return state * action.n;
    default:
      throw new Error('Unknown op ' + action.op);
  }
}

function opLabel(action) {
  return (action.op === 'add' ? '+' : '×') + action.n;
}

function noop() {}

function createQueueDemo({React, ReactDOM, createRoot, Scheduler, container}) {
  const h = React.createElement;

  let store = null;
  let root = null;
  let nextId = 0;
  let inflight = [];
  let rendered = [];
  let lastIds = [];
  let lastLanes = [];
  let carriedEventLane = NoLane;
  // The last transition lane React handed out in this frame. It survives
  // reset, like React's own counter.
  let lastTransitionLane = NoLane;

  function Screen() {
    const value = React.use(store);
    rendered.push(value);
    return h('output', {className: 'queue-screen'}, String(value));
  }

  function settle() {
    // Sync work and the root schedule run in microtasks.
    return new Promise(resolve => setTimeout(resolve, 0));
  }

  function fiberRoot() {
    const record = findRecord(store);
    if (record === null) {
      throw new Error('The queue demo store has no record.');
    }
    return record;
  }

  async function reset({initial = 1} = {}) {
    if (root !== null) {
      root.unmount();
    }
    store = React.unstable_createStore(initial, reducer);
    root = createRoot(container, {onDefaultTransitionIndicator: noop});
    ReactDOM.flushSync(() => root.render(h(Screen)));
    inflight = [];
    rendered = [];
    await settle();
    return snapshot();
  }

  async function dispatch({kind, ops}) {
    const record = fiberRoot();
    // The transition lane React cached for the event, which can be left
    // over from an earlier event whose transition updates were all dropped
    // (see queue-check.js).
    let eventLane = carriedEventLane;
    let scheduled = false;
    lastIds = [];
    lastLanes = [];
    const run = () => {
      for (let i = 0; i < ops.length; i++) {
        const action = {id: ++nextId, op: ops[i].op, n: ops[i].n};
        lastIds.push(action.id);
        const lanesBefore = record.lanes;
        store.update(action);
        if (!record.isPending) {
          // The queue was empty and the value didn't change: React dropped
          // the update without scheduling anything (the eager bailout). It
          // picked a lane first, though, so a transition still used up the
          // event's transition lane.
          if (kind === 'transition' && eventLane === NoLane) {
            eventLane = Preview.nextTransitionLane(lastTransitionLane);
            lastTransitionLane = eventLane;
          }
          lastLanes.push(null);
          continue;
        }
        // The lane React gave the update: the bit it added to the record's
        // lanes. If the lane was already pending, nothing new shows up, and
        // the lane is the one the event already used, or for a transition,
        // the next one React hands out. The check compares observed lanes
        // with what it expects, and the inferred ones once a render picks
        // them up.
        const added = record.lanes & ~lanesBefore;
        let lane;
        let observed = true;
        if (added !== NoLane) {
          lane = added;
        } else if (eventLane !== NoLane) {
          lane = eventLane;
          observed = false;
        } else if (kind === 'transition') {
          lane = Preview.nextTransitionLane(lastTransitionLane);
          observed = false;
        } else {
          lane = kind === 'sync' ? SyncLane : DefaultLane;
          observed = false;
        }
        eventLane = lane;
        if (Preview.isTransitionLane(lane)) {
          lastTransitionLane = lane;
        }
        lastLanes.push({lane, observed});
        scheduled = true;
        inflight.push({lane, laneName: Preview.laneName(lane), action});
      }
    };
    const renderCountBefore = rendered.length;
    if (kind === 'transition') {
      React.startTransition(run);
    } else if (kind === 'sync') {
      ReactDOM.flushSync(run);
    } else if (kind === 'default') {
      run();
    } else {
      throw new Error('Unknown kind ' + kind);
    }
    carriedEventLane = scheduled ? NoLane : eventLane;
    await settle();
    if (rendered.length !== renderCountBefore) {
      // A render started, so it took every update out of the concurrent
      // queue.
      inflight = [];
    }
    return snapshot();
  }

  async function step() {
    lastIds = [];
    lastLanes = [];
    const renderCountBefore = rendered.length;
    if (Scheduler.unstable_hasPendingWork()) {
      // Runs scheduler tasks until React commits (React requests a paint).
      Scheduler.unstable_flushUntilNextPaint();
    }
    await settle();
    if (rendered.length !== renderCountBefore) {
      inflight = [];
      carriedEventLane = NoLane;
    }
    return snapshot();
  }

  function snapshot() {
    const read = snapshotRecord(store);
    const renders = rendered;
    rendered = [];
    return {
      record: read,
      inflight: inflight.slice(),
      head: peekHead(store),
      screen: container.textContent,
      // The values the component rendered with since the last snapshot.
      renders,
      lastTransitionLane,
      // The ids of the actions the last dispatch created, in order.
      lastIds,
      // The lane each of those actions got ({lane, observed}), or null if
      // React dropped it (the eager bailout).
      lastLanes,
      hasPendingWork: Scheduler.unstable_hasPendingWork(),
    };
  }

  return {reset, dispatch, step, snapshot};
}

module.exports = {createQueueDemo, reducer, opLabel};
