// The preview for the queue and lane visualizer: given what a root's record
// of a store holds (the committed base state and the queue of updates, each
// tagged with a lane), it says which renders come next, in order, and what
// each one commits. It's a copy of processStoreRecord in
// packages/react-reconciler/src/ReactFiberStore.js plus the parts of
// getNextLanes and getEntangledLanes (ReactFiberLane.js) that pick the lanes of
// the next render. tools/check-explainers.mjs (G4) checks it against the real
// React build on random sequences, so if React changes, the gate fails.
//
// Works as a classic script (window.StoreQueuePreview) and as a CommonJS
// module (the frame and Node use it).

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.StoreQueuePreview = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // From ReactFiberLane.js.
  const NoLane = 0;
  const SyncLane = 0b10;
  const InputContinuousLane = 0b1000;
  const DefaultLane = 0b100000;
  // Sync, continuous and default updates render in one batch
  // (getHighestPriorityLanes).
  const SyncUpdateLanes = SyncLane | InputContinuousLane | DefaultLane;
  const TransitionLanes = 0b0000000001111111111111100000000;
  const TransitionLane1 = 0b0000000000000000000000100000000;
  const TransitionUpdateLanes = 0b0000000000000111111111100000000;

  const laneNames = {
    0: 'NoLane',
    1: 'SyncHydrationLane',
    2: 'SyncLane',
    4: 'InputContinuousHydrationLane',
    8: 'InputContinuousLane',
    16: 'DefaultHydrationLane',
    32: 'DefaultLane',
    64: 'GestureLane',
    128: 'TransitionHydrationLane',
  };
  for (let i = 0; i < 14; i++) {
    laneNames[TransitionLane1 << i] = 'TransitionLane' + (i + 1);
  }

  function laneName(lane) {
    return laneNames[lane] || 'Lane(' + lane + ')';
  }

  function lanesToNames(lanes) {
    if (lanes === NoLane) {
      return ['NoLane'];
    }
    const names = [];
    for (let bit = 1; bit !== 0 && bit <= lanes; bit <<= 1) {
      if ((lanes & bit) !== 0) {
        names.push(laneName(bit));
      }
    }
    return names;
  }

  function isTransitionLane(lane) {
    return (lane & TransitionLanes) !== 0;
  }

  // The kind of batch a lane renders in.
  function laneKind(lane) {
    if (lane === NoLane) {
      return 'rebase';
    }
    if ((lane & SyncUpdateLanes) !== 0) {
      return lane === DefaultLane ? 'default' : 'sync';
    }
    return isTransitionLane(lane) ? 'transition' : 'other';
  }

  function queueLanes(queue) {
    let lanes = NoLane;
    for (let i = 0; i < queue.length; i++) {
      lanes |= queue[i].lane;
    }
    return lanes;
  }

  // The lanes of the next render, given the lanes pending on the root.
  //
  // - Sync, continuous and default updates render together, before anything
  //   else.
  // - Transitions that update the same store are entangled
  //   (dispatchStoreUpdate calls markRootEntangled), so every transition lane
  //   pending on a single store renders in one batch.
  //
  // This only holds for a root whose pending lanes all come from this one
  // store, which is how the visualizer is set up.
  function nextRenderLanes(pendingLanes) {
    const sync = pendingLanes & SyncUpdateLanes;
    if (sync !== NoLane) {
      return sync;
    }
    return pendingLanes & TransitionLanes;
  }

  // processStoreRecord: apply the updates in renderLanes, skip the rest, and
  // keep every update after the first skipped one (as a NoLane clone if it
  // was applied), so it's rebased once the skipped one renders.
  function processQueue(baseState, queue, renderLanes, reducer) {
    let newState = baseState;
    let newBaseState = null;
    const newBaseQueue = [];
    let skippedLanes = NoLane;
    for (let i = 0; i < queue.length; i++) {
      const update = queue[i];
      if ((renderLanes & update.lane) !== update.lane) {
        if (newBaseQueue.length === 0) {
          newBaseState = newState;
        }
        newBaseQueue.push({lane: update.lane, action: update.action});
        skippedLanes |= update.lane;
      } else {
        if (newBaseQueue.length > 0) {
          newBaseQueue.push({lane: NoLane, action: update.action});
        }
        newState = reducer(newState, update.action);
      }
    }
    if (newBaseQueue.length === 0) {
      newBaseState = newState;
    }
    return {
      value: newState,
      baseState: newBaseState,
      queue: newBaseQueue,
      skippedLanes,
    };
  }

  // Whether the queue still has an update that a render has to apply. NoLane
  // clones only follow a skipped update, so they never stand alone.
  function hasPendingLanes(queue) {
    return queueLanes(queue) !== NoLane;
  }

  // The renders that will happen if nothing else is dispatched, in order:
  // [{kind, lanes, laneNames, value, after: {baseState, queue}}]. Each one
  // starts from the state the previous one committed.
  //
  // record: {baseState, queue: [{lane, action}]}, with the queue in dispatch
  // order: the committed base queue, then the updates that haven't been
  // picked up by a render yet.
  function previewRenders(record, reducer) {
    const renders = [];
    let baseState = record.baseState;
    let queue = record.queue;
    // A render always applies something, so this ends. The bound is a guard.
    for (let i = 0; i < 64 && hasPendingLanes(queue); i++) {
      const lanes = nextRenderLanes(queueLanes(queue));
      if (lanes === NoLane) {
        // Lanes this model doesn't know how to schedule.
        break;
      }
      const result = processQueue(baseState, queue, lanes, reducer);
      renders.push({
        kind: (lanes & SyncUpdateLanes) !== 0 ? 'urgent' : 'transition',
        lanes,
        laneNames: lanesToNames(lanes),
        value: result.value,
        after: {baseState: result.baseState, queue: result.queue},
      });
      baseState = result.baseState;
      queue = result.queue;
    }
    return renders;
  }

  // The value with every update applied in dispatch order: the store's
  // latest value (_head). Applying the whole base queue, NoLane clones
  // included, to the base state replays the history since the base state.
  function latestValue(record, reducer) {
    let state = record.baseState;
    for (let i = 0; i < record.queue.length; i++) {
      state = reducer(state, record.queue[i].action);
    }
    return state;
  }

  // What a render with the given lanes would commit, for "what would each
  // lane render" questions about a batch that isn't next.
  function valueForLanes(record, lanes, reducer) {
    return processQueue(record.baseState, record.queue, lanes, reducer).value;
  }

  function preview(record, reducer) {
    const renders = previewRenders(record, reducer);
    return {
      next: renders.length > 0 ? renders[0] : null,
      renders,
      latest: latestValue(record, reducer),
    };
  }

  // The lane a transition update gets. Every transition in one event shares
  // a lane, and each event claims the next of TransitionLane1..10, cycling
  // (claimNextTransitionUpdateLane).
  function nextTransitionLane(lastLane) {
    if (lastLane === NoLane) {
      return TransitionLane1;
    }
    const next = lastLane << 1;
    return (next & TransitionUpdateLanes) === 0 ? TransitionLane1 : next;
  }

  return {
    NoLane,
    SyncLane,
    InputContinuousLane,
    DefaultLane,
    SyncUpdateLanes,
    TransitionLanes,
    TransitionLane1,
    laneName,
    lanesToNames,
    laneKind,
    isTransitionLane,
    queueLanes,
    nextRenderLanes,
    processQueue,
    previewRenders,
    latestValue,
    valueForLanes,
    preview,
    nextTransitionLane,
  };
});
