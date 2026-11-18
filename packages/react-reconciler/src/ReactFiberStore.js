/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {HeldStoreUpdate, ReactStore} from 'shared/ReactTypes';
import type {Fiber, FiberRoot} from './ReactInternalTypes';
import type {Lane, Lanes} from './ReactFiberLane';
import type {FunctionComponentUpdateQueue} from './ReactFiberHooks';
import type {SuspenseState} from './ReactFiberSuspenseComponent';
import type {RootState} from './ReactFiberRoot';

import {
  disableLegacyMode,
  enableSchedulingProfiler,
  enableStore,
} from 'shared/ReactFeatureFlags';
import {
  NoLane,
  NoLanes,
  SyncLane,
  isSubsetOfLanes,
  isTransitionLane,
  mergeLanes,
  removeLanes,
  intersectLanes,
  markRootEntangled,
  pickArbitraryLane,
} from './ReactFiberLane';
import {
  FunctionComponent,
  ForwardRef,
  SimpleMemoComponent,
  ClassComponent,
  HostRoot,
} from './ReactWorkTags';
import {LegacyRoot} from './ReactRootTags';
import {
  enqueueConcurrentRenderForLane,
  enqueueConcurrentRenderForLaneOnMountedFiber,
  enqueueConcurrentStoreUpdate,
  getConcurrentQueuesEpoch,
} from './ReactFiberConcurrentUpdates';
import {
  requestStoreUpdateLane,
  scheduleUpdateOnFiber,
  isStoreUpdateDuringRender,
  warnAboutStoreUpdateInRenderDEV,
  throwIfInfiniteUpdateLoopDetected,
  markSkippedUpdateLanes,
} from './ReactFiberWorkLoop';
import {requestCurrentTransition} from './ReactFiberTransition';
import {
  requestTransitionLane,
  ensureScheduleIsScheduled,
  isLanePendingOnScheduledRoot,
} from './ReactFiberRootScheduler';
import {
  peekEntangledActionLane,
  peekEntangledActionThenable,
} from './ReactFiberAsyncAction';
import {markStateUpdateScheduled} from './ReactFiberDevToolsHook';
import ReactSharedInternals from 'shared/ReactSharedInternals';
import is from 'shared/objectIs';
import getStoreHead from 'shared/getStoreHead';
import reportGlobalError from 'shared/reportGlobalError';

// A store is shared by every root that reads it, but each root commits on its
// own schedule. So each root keeps its own record of the store. A record is
// split the same way as a Hook: the record is the shared part, like the queue
// of a Hook, and a StoreState is the state of the store in one version of the
// tree, like a Hook object. The state is owned by the HostRoot fiber of each
// tree: updates are scheduled on the HostRoot, which processes them for the
// render's lanes when it begins, like the update queue of useReducer. So the
// reducer runs once per root, no matter how many components read the store.
type StoreUpdate<A> = {
  lane: Lane,
  action: A,
  // Like useState, the state after this update is computed eagerly when the
  // queue is empty, so the reducer doesn't have to run again during render.
  hasEagerState: boolean,
  eagerState: mixed,
  // The state the eager state was computed from. The eager state can only be
  // used when the update is applied to this exact state.
  eagerBaseState: mixed,
  // A circular list, like the update queue of a Hook.
  next: StoreUpdate<A>,
};

// The state of a store in one version of the tree.
export type StoreState<T, A> = {
  // The state with every update applied, up to the first update that was
  // skipped.
  baseState: T,
  // The updates that come after the first skipped update. A circular list.
  baseQueue: StoreUpdate<A> | null,
  // The value that components in this version of the tree read.
  memoizedState: T,
  // The lanes of the updates that weren't applied to memoizedState. A
  // component that reads the store renders again when they are.
  skippedLanes: Lanes,
  // Whether memoizedState includes an update from the pending async action.
  didReadEntangledAction: boolean,
  // The first error a reducer threw, which every component that reads the
  // store throws. The update that threw isn't applied.
  error: mixed,
  errorUpdate: StoreUpdate<A> | null,
  // The components that threw the error in this render. If none of the error
  // boundaries that caught it commits, the commit reports it.
  errorFibers: Array<Fiber> | null,
  // DEV only: the updates that were applied, so a component in Strict Mode
  // can run the reducer an extra time.
  appliedUpdatesDEV?: Array<mixed> | null,
  didDoubleInvokeReducerDEV?: boolean,
};

// The states of the stores a HostRoot processed in a render. The version
// identifies them without holding on to them, so a record can remember the
// last state it looked up.
export type StoreStates = {
  version: number,
  map: Map<StoreRecord<any, any>, StoreState<any, any>>,
  // The lanes of the updates the HostRoot skipped, which stay on it.
  skippedLanes: Lanes,
};

let storeStatesVersion: number = 0;

function createStoreStates(
  map: Map<StoreRecord<any, any>, StoreState<any, any>>,
  skippedLanes: Lanes,
): StoreStates {
  return {version: ++storeStatesVersion, map, skippedLanes};
}

export type StoreRecord<T, A> = {
  store: ReactStore<T, A>,
  root: FiberRoot,
  // Updates that haven't been processed by a render yet. The concurrent
  // queue adds them when the next render starts.
  pending: StoreUpdate<A> | null,
  // The lanes of the updates that haven't committed. Updated when the root
  // commits.
  lanes: Lanes,
  // The transition lanes that update this store. Like the update queue of
  // useState, transitions that update the same store are entangled.
  transitionLanes: Lanes,
  // The state of the store in the committed tree.
  committed: StoreState<T, A>,
  // The fibers subscribed to this store on this root: the components that
  // read it, and the Suspense boundaries whose primary children read it and
  // suspended.
  readers: Set<Fiber>,
  // Set once the record is dropped. The store no longer dispatches to it.
  isRemoved: boolean,
  // Whether this record is in root.unsubscribedStoreRecords.
  mayBeUnsubscribed: boolean,
  // Whether this record is in root.pendingStoreRecords.
  isPending: boolean,
  // The last state looked up in a HostRoot's states, so every reader in a
  // render after the first doesn't search them again. Keyed by the version
  // of the states, which is different for every render that processes
  // stores.
  lastVersion: number,
  lastState: StoreState<T, A> | null,
  // Used to check whether the component that's rendering already read this
  // store, without searching its list of reads.
  readEpoch: number,
  // The lanes of the updates dispatched to this record since the concurrent
  // queue was last drained, at enqueuedEpoch. They aren't in pending yet,
  // and the readers are already scheduled in them.
  enqueuedLanes: Lanes,
  enqueuedEpoch: number,
  // The reader those updates were attributed to, for DevTools.
  scheduledFiber: Fiber | null,
  // Whether the committed state's queue has held updates that no render has
  // processed yet. The committed state doesn't include the ones that aren't
  // part of a transition, so the HostRoot always processes the record.
  hasUnprocessedHeldUpdates: boolean,
  dispatch: (record: StoreRecord<T, A>, action: A) => void,
};

const NO_ERROR: any = {};

// Hydrated readers that rendered an out of date value. They render again
// after the mutation phase.
let staleHydratedReaders: Array<Fiber> | null = null;

// Whether any component has read a store yet, so an app without stores
// skips the work of tracking them.
let didReadStores: boolean = false;

// The stores read by the primary children of each Suspense boundary that
// suspended during the current render. A boundary subscribes to them if it
// commits its fallback. They're kept per boundary for the whole render: a
// render that doesn't skip siblings can suspend in a nested boundary before
// it unwinds to the outer one, and a SuspenseList renders a row's boundary a
// second time.
let suspendedBoundaryStoreReads: Map<
  Fiber,
  Array<StoreRecord<any, any>>,
> | null = null;

function createStoreState<T, A>(state: T): StoreState<T, A> {
  const storeState: StoreState<T, A> = {
    baseState: state,
    baseQueue: null,
    memoizedState: state,
    skippedLanes: NoLanes,
    didReadEntangledAction: false,
    error: NO_ERROR,
    errorUpdate: null,
    errorFibers: null,
  };
  if (__DEV__) {
    storeState.appliedUpdatesDEV = null;
    storeState.didDoubleInvokeReducerDEV = false;
  }
  return storeState;
}

export function getStoreRecord<T, A>(
  store: ReactStore<T, A>,
  root: FiberRoot,
): StoreRecord<T, A> {
  const records = store._records;
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    if (record.root === root) {
      return record as any;
    }
  }
  // This is the first time this root reads the store. The root has nothing
  // to be consistent with yet, so start from the latest value, except for
  // transitions that haven't finished. Computing it can run the reducer,
  // which isn't part of the component that's reading, so it runs without a
  // dispatcher.
  didReadStores = true;
  const prevDispatcher = ReactSharedInternals.H;
  ReactSharedInternals.H = null;
  let head;
  try {
    settlePendingTransitionUpdates(store, root);
    head = getStoreHead(store);
  } finally {
    ReactSharedInternals.H = prevDispatcher;
  }
  const record: StoreRecord<T, A> = {
    store,
    root,
    pending: null,
    lanes: NoLanes,
    transitionLanes: NoLanes,
    committed: createStoreState(head),
    readers: new Set(),
    isRemoved: false,
    mayBeUnsubscribed: true,
    isPending: false,
    lastVersion: -1,
    lastState: null,
    readEpoch: -1,
    enqueuedLanes: NoLanes,
    enqueuedEpoch: -1,
    scheduledFiber: null,
    hasUnprocessedHeldUpdates: false,
    dispatch: dispatchStoreUpdate,
  };
  records.push(record);
  const pendingTransitionUpdates = store._pendingTransitionUpdates;
  if (pendingTransitionUpdates !== null) {
    // Updates from transitions that are still pending. Add them to this
    // root's queue, as if they had been dispatched to it, so they're
    // rebased like any other update. They're part of the latest value now.
    store._pendingTransitionUpdates = null;
    storesWithPendingTransitionUpdates.delete(store);
    let last: StoreUpdate<A> | null = null;
    let headQueue = store._headQueue;
    for (let i = 0; i < pendingTransitionUpdates.length; i++) {
      const heldUpdate = pendingTransitionUpdates[i];
      const action = heldUpdate.action;
      let lane = getHeldStoreUpdateLane(heldUpdate);
      if (lane !== NoLane && !disableLegacyMode && root.tag === LegacyRoot) {
        // A legacy root renders every update synchronously, including the
        // ones in a transition, like a setState in an action on a legacy root.
        lane = SyncLane;
      }
      const update: StoreUpdate<A> = {
        lane,
        action,
        hasEagerState: false,
        eagerState: null,
        eagerBaseState: null,
        next: null as any,
      };
      if (last === null) {
        update.next = update;
      } else {
        update.next = last.next;
        last.next = update;
      }
      last = update;
      record.lanes = mergeLanes(record.lanes, lane);
      if (headQueue === null) {
        headQueue = store._headQueue = [action];
      } else {
        headQueue.push(action);
      }
    }
    record.committed.baseQueue = last;
    record.hasUnprocessedHeldUpdates = true;
    record.isPending = true;
    const pending = root.pendingStoreRecords;
    if (pending === null) {
      root.pendingStoreRecords = [record];
    } else {
      pending.push(record);
    }
    // Schedule the lanes on the HostRoot, like dispatching the updates to it
    // would have, so the HostRoot processes them even if this render is
    // thrown away or nothing reads the store. Most are already pending on the
    // root, except the pending async action's.
    const hostRoot = root.current;
    let transitionLanes = NoLanes;
    let lanes = record.lanes;
    while (lanes !== NoLanes) {
      const lane = pickArbitraryLane(lanes);
      lanes = removeLanes(lanes, lane);
      enqueueConcurrentRenderForLane(hostRoot, lane);
      if ((root.pendingLanes & lane) === NoLanes) {
        scheduleUpdateOnFiber(root, hostRoot, lane);
      }
      if (isTransitionLane(lane)) {
        transitionLanes = mergeLanes(transitionLanes, lane);
      }
    }
    if (transitionLanes !== NoLanes) {
      // Like the update queue of useState, entangle the transitions that
      // update the same store so they commit together.
      record.transitionLanes = transitionLanes;
      markRootEntangled(root, transitionLanes);
    }
  }
  // Nothing has subscribed to the record yet. If nothing does by the time
  // this root commits, the record is dropped.
  addUnsubscribedStoreRecord(root, record);
  return record;
}

// The stores that hold on to updates from pending transitions, because no
// root read them when they were dispatched.
const storesWithPendingTransitionUpdates: Set<ReactStore<any, any>> = new Set();

// The held updates are shared by every renderer on the page, but each
// renderer assigns its own lanes, so each one keeps its lane for them here.
// An update that isn't part of a transition, or whose transition is done,
// has NoLane.
const heldStoreUpdateLanes: WeakMap<HeldStoreUpdate<any>, Lane> = new WeakMap();

// The held updates dispatched in the current event's transition, and in the
// pending async action, as pairs of store and update.
let heldStoreUpdatesOfEvent: Array<any> | null = null;
let heldStoreUpdatesOfAction: Array<any> | null = null;

function getHeldStoreUpdateLane(update: HeldStoreUpdate<any>): Lane {
  const lane = heldStoreUpdateLanes.get(update);
  // A renderer that was loaded after the update was held has no lane for it,
  // because none of its transitions include it.
  return lane === undefined ? NoLane : lane;
}

let prevDispatchUnreadStoreUpdate:
  | null
  | ((store: ReactStore<any, any>, update: HeldStoreUpdate<any>) => boolean) =
  null;

// Called when a store that no root reads is updated. An update that's part
// of a transition is held until the transition is done, so that a component
// that starts reading the store before then, in a render that doesn't
// include the transition, doesn't see it. Like useReducer, an update that
// comes after one that's held is held too, so they apply in order.
function dispatchUnreadStoreUpdate<T, A>(
  store: ReactStore<T, A>,
  update: HeldStoreUpdate<A>,
): boolean {
  const transition = requestCurrentTransition();
  const pending = store._pendingTransitionUpdates;
  const isHeld = transition !== null || pending !== null;
  if (isHeld) {
    let lane = NoLane;
    if (transition !== null) {
      lane = requestTransitionLane(transition);
      if (lane === peekEntangledActionLane()) {
        holdStoreUpdateUntilActionIsDone(store, update);
      } else {
        // Like any other transition update, reset the event's transition
        // lane once the event is over, so a later transition gets its own.
        ensureScheduleIsScheduled();
        if (heldStoreUpdatesOfEvent === null) {
          heldStoreUpdatesOfEvent = [store, update];
        } else {
          heldStoreUpdatesOfEvent.push(store, update);
        }
      }
    }
    heldStoreUpdateLanes.set(update, lane);
    // The first renderer that holds the update adds it to the store.
    if (pending === null) {
      store._pendingTransitionUpdates = [update];
    } else if (pending[pending.length - 1] !== update) {
      pending.push(update);
    }
    storesWithPendingTransitionUpdates.add(store);
  }
  // Every renderer on the page makes the same decision, since they share
  // the transition and the store, but each one needs its own lane for the
  // update. So pass it on to the renderer that was loaded before this one.
  const prev = prevDispatchUnreadStoreUpdate;
  const isHeldByEarlierRenderer = prev != null && prev(store, update);
  return isHeld || isHeldByEarlierRenderer;
}

if (enableStore) {
  prevDispatchUnreadStoreUpdate = ReactSharedInternals.U;
  ReactSharedInternals.U = dispatchUnreadStoreUpdate as any;
}

// Called at the end of an event that dispatched transition updates. If no
// root has the event's transition lane pending, the transition had nothing
// else to render, so the updates it held are done. Clear their lane, so a
// later transition that's assigned the same lane doesn't hold them back.
export function finishHeldStoreUpdatesOfEvent(
  isTransitionPending: boolean,
): void {
  const updates = heldStoreUpdatesOfEvent;
  if (updates === null) {
    return;
  }
  heldStoreUpdatesOfEvent = null;
  // The updates an async action dispatched before it awaited have the
  // event's lane, which is now the action's. They're done when the action is.
  const entangledActionLane = peekEntangledActionLane();
  let finished = null;
  for (let i = 0; i < updates.length; i += 2) {
    const store: ReactStore<any, any> = updates[i];
    const update: HeldStoreUpdate<any> = updates[i + 1];
    if (
      entangledActionLane !== NoLane &&
      heldStoreUpdateLanes.get(update) === entangledActionLane
    ) {
      holdStoreUpdateUntilActionIsDone(store, update);
    } else if (!isTransitionPending) {
      if (finished === null) {
        finished = [store, update];
      } else {
        finished.push(store, update);
      }
    }
  }
  if (finished !== null) {
    finishHeldStoreUpdates(finished);
  }
}

function holdStoreUpdateUntilActionIsDone(
  store: ReactStore<any, any>,
  update: HeldStoreUpdate<any>,
): void {
  if (heldStoreUpdatesOfAction === null) {
    heldStoreUpdatesOfAction = [store, update];
    const entangledActionThenable = peekEntangledActionThenable();
    if (entangledActionThenable !== null) {
      entangledActionThenable.then(
        finishHeldStoreUpdatesOfAction,
        finishHeldStoreUpdatesOfAction,
      );
    }
  } else {
    heldStoreUpdatesOfAction.push(store, update);
  }
}

// Called when the pending async action is done. The same as at the end of an
// event: unless a root still has the action's lane pending, its held updates
// are done.
function finishHeldStoreUpdatesOfAction(): void {
  const updates = heldStoreUpdatesOfAction;
  if (updates === null) {
    return;
  }
  heldStoreUpdatesOfAction = null;
  const lane = heldStoreUpdateLanes.get(updates[1]);
  if (lane === undefined || !isLanePendingOnScheduledRoot(lane)) {
    finishHeldStoreUpdates(updates);
  }
}

function finishHeldStoreUpdates(updates: Array<any>): void {
  for (let i = 0; i < updates.length; i += 2) {
    const update: HeldStoreUpdate<any> = updates[i + 1];
    if (heldStoreUpdateLanes.has(update)) {
      heldStoreUpdateLanes.set(update, NoLane);
    }
  }
  // Apply the ones that are done now, instead of at the next commit, so an
  // urgent update isn't held behind them, a reducer error is reported, and
  // the store isn't kept alive until then.
  for (let i = 0; i < updates.length; i += 2) {
    settlePendingTransitionUpdates(updates[i], null);
  }
}

// Applies the held updates whose transitions are done to the latest value of
// the store. A transition is done unless it's the pending async action, or
// it's still pending on the given root. With no root, only the updates whose
// transitions are known to be done are applied.
function settlePendingTransitionUpdates(
  store: ReactStore<any, any>,
  root: FiberRoot | null,
): void {
  const pending = store._pendingTransitionUpdates;
  if (pending === null) {
    // Another renderer applied them, or a root took them over.
    storesWithPendingTransitionUpdates.delete(store);
    return;
  }
  const entangledActionLane = peekEntangledActionLane();
  let i = 0;
  for (; i < pending.length; i++) {
    const lane = getHeldStoreUpdateLane(pending[i]);
    if (
      lane !== NoLane &&
      (root === null ||
        lane === entangledActionLane ||
        (root.pendingLanes & lane) !== NoLanes)
    ) {
      break;
    }
  }
  if (i === 0) {
    return;
  }
  // Apply them now, instead of when the latest value is next needed, so a
  // reducer error is reported, like it would be if no update were held. They
  // are removed from the store, so they're applied once, even if several
  // renderers held them.
  const reducer = store._reducer;
  let head = getStoreHead(store);
  for (let j = 0; j < i; j++) {
    try {
      head = reducer(head, pending[j].action);
    } catch (error) {
      reportGlobalError(error);
    }
  }
  store._head = head;
  if (i === pending.length) {
    store._pendingTransitionUpdates = null;
    storesWithPendingTransitionUpdates.delete(store);
  } else {
    pending.splice(0, i);
  }
}

function addUnsubscribedStoreRecord(
  root: FiberRoot,
  record: StoreRecord<any, any>,
): void {
  const unsubscribed = root.unsubscribedStoreRecords;
  if (unsubscribed === null) {
    root.unsubscribedStoreRecords = [record];
  } else {
    unsubscribed.push(record);
  }
}

// Whether the record has updates that haven't committed.
function hasPendingStoreUpdates(record: StoreRecord<any, any>): boolean {
  return (
    record.lanes !== NoLanes ||
    record.pending !== null ||
    record.committed.baseQueue !== null
  );
}

// Whether the state of the record in a render with these lanes is its
// committed state, so the HostRoot doesn't have to process it: it has no new
// updates, and none of the updates in its queue are in the render's lanes.
// The committed state already includes the updates in the queue that every
// render applies, the ones with NoLane.
function canUseCommittedStoreState(
  record: StoreRecord<any, any>,
  renderLanes: Lanes,
): boolean {
  if (record.pending === null && record.committed.baseQueue === null) {
    return true;
  }
  // The record's lanes include the lanes of every update in its queues,
  // including the ones that haven't been processed yet.
  return (
    !record.hasUnprocessedHeldUpdates &&
    (record.lanes & renderLanes) === NoLanes
  );
}

function getStoreQueueLanes(last: StoreUpdate<any> | null): Lanes {
  let lanes = NoLanes;
  if (last !== null) {
    let update = last;
    do {
      lanes = mergeLanes(lanes, update.lane);
      update = update.next;
    } while (update !== last);
  }
  return lanes;
}

// Called after the HostRoot processes its stores. If a store applied an
// update from a pending async action and its value changed, the HostRoot
// suspends until the action is done, like a useState Hook that applied one.
// Suspending in the readers isn't enough: a hidden reader doesn't render in
// the action's lane, and a reader inside a boundary that shows its fallback
// doesn't block the commit. Either way the HostRoot would commit the update
// before the action is done, and a reader that mounts before then would show
// it early.
export function suspendIfStoreReadFromEntangledAsyncAction(
  storeStates: ?StoreStates,
): void {
  if (storeStates == null) {
    return;
  }
  let shouldSuspend = false;
  storeStates.map.forEach((state, record) => {
    if (didApplyEntangledActionUpdate(record, state)) {
      shouldSuspend = true;
    }
  });
  if (shouldSuspend) {
    const entangledActionThenable = peekEntangledActionThenable();
    if (entangledActionThenable !== null) {
      throw entangledActionThenable;
    }
  }
}

// Whether the state includes an update from the pending async action that
// changes the committed value. If a later update masks it, nothing this
// render shows comes from the action.
function didApplyEntangledActionUpdate<T, A>(
  record: StoreRecord<T, A>,
  state: StoreState<T, A>,
): boolean {
  return (
    state.didReadEntangledAction &&
    !is(state.memoizedState, record.committed.memoizedState)
  );
}

// Called when the HostRoot begins work. Computes the state of every store
// with pending updates for this render, the same way the update queue of
// useReducer does: updates with insufficient priority are skipped, and
// updates that come after a skipped update are still applied, so they get
// rebased on top of the skipped ones once those are rendered. Returns the
// states, which become the HostRoot's when it commits, and the lanes that
// were skipped, which stay on the HostRoot.
export function processStoreRecords(
  root: FiberRoot,
  renderLanes: Lanes,
  // The states this HostRoot processed earlier in the same render, if it's
  // beginning again, for example after an error unwound to the root.
  prevStates: ?StoreStates,
): StoreStates | null {
  const pending = root.pendingStoreRecords;
  if (pending === null) {
    return null;
  }
  const states: Map<StoreRecord<any, any>, StoreState<any, any>> = new Map();
  let skippedLanes = NoLanes;
  // A reducer isn't part of any component, so it runs without a dispatcher,
  // the same as when its eager state is computed outside of render. Calling
  // a Hook or reading context in it throws, and the readers throw the error.
  const prevDispatcher = ReactSharedInternals.H;
  ReactSharedInternals.H = null;
  try {
    for (let i = 0; i < pending.length; i++) {
      const record = pending[i];
      if (canUseCommittedStoreState(record, renderLanes)) {
        // Every update to the store is skipped. The lanes stay on the
        // HostRoot, so the root renders them later.
        skippedLanes = mergeLanes(skippedLanes, record.lanes);
        continue;
      }
      const state = processStoreRecord(record, renderLanes);
      if (prevStates != null && state.errorUpdate !== null) {
        const prevState = prevStates.map.get(record);
        if (
          prevState !== undefined &&
          prevState.errorUpdate === state.errorUpdate
        ) {
          // Components may already have thrown this error in this render.
          state.errorFibers = prevState.errorFibers;
        }
      }
      states.set(record, state);
      skippedLanes = mergeLanes(skippedLanes, state.skippedLanes);
    }
  } finally {
    ReactSharedInternals.H = prevDispatcher;
  }
  return createStoreStates(states, skippedLanes);
}

function processStoreRecord<T, A>(
  record: StoreRecord<T, A>,
  renderLanes: Lanes,
): StoreState<T, A> {
  const current = record.committed;
  let baseQueue = current.baseQueue;
  const pendingQueue = record.pending;
  if (pendingQueue !== null) {
    // Move the pending updates to the base queue of the committed state, like
    // a Hook does, so they aren't lost if this render is thrown away.
    if (baseQueue !== null) {
      const baseFirst = baseQueue.next;
      const pendingFirst = pendingQueue.next;
      baseQueue.next = pendingFirst;
      pendingQueue.next = baseFirst;
    }
    current.baseQueue = baseQueue = pendingQueue;
    record.pending = null;
  }
  const state: StoreState<T, A> = createStoreState(current.baseState);
  if (baseQueue === null) {
    return state;
  }
  const reducer = record.store._reducer;
  const entangledActionLane = peekEntangledActionLane();
  const appliedUpdatesDEV: Array<mixed> | null = __DEV__ ? [] : null;
  let newState = current.baseState;
  let newBaseState = null;
  let newBaseQueueFirst: StoreUpdate<A> | null = null;
  let newBaseQueueLast: StoreUpdate<A> | null = null;
  const first = baseQueue.next;
  let update = first;
  do {
    const updateLane = update.lane;
    if (!isSubsetOfLanes(renderLanes, updateLane)) {
      const clone: StoreUpdate<A> = {
        lane: updateLane,
        action: update.action,
        hasEagerState: update.hasEagerState,
        eagerState: update.eagerState,
        eagerBaseState: update.eagerBaseState,
        next: null as any,
      };
      if (newBaseQueueLast === null) {
        newBaseQueueFirst = newBaseQueueLast = clone;
        newBaseState = newState;
      } else {
        newBaseQueueLast = newBaseQueueLast.next = clone;
      }
      state.skippedLanes = mergeLanes(state.skippedLanes, updateLane);
    } else {
      let nextState;
      let didThrow = false;
      if (update.hasEagerState && is(update.eagerBaseState, newState)) {
        nextState = update.eagerState as any as T;
      } else {
        try {
          nextState = reducer(newState, update.action);
        } catch (error) {
          didThrow = true;
          if (newBaseQueueLast !== null) {
            // An earlier update was skipped, so this one is applied out of
            // the order it was dispatched in, and may only throw because of
            // that. Defer it: keep it in the queue so it's applied on top of
            // the skipped update, and don't throw or change the state. If
            // it's invalid in dispatch order too, it throws then.
            const clone: StoreUpdate<A> = {
              lane: NoLane,
              action: update.action,
              hasEagerState: update.hasEagerState,
              eagerState: update.eagerState,
              eagerBaseState: update.eagerBaseState,
              next: null as any,
            };
            newBaseQueueLast = newBaseQueueLast.next = clone;
          } else if (state.error === NO_ERROR) {
            // Drop the update, the same way an error boundary drops the
            // update queue of a useReducer Hook. Every component that reads
            // the store in this render throws the error.
            state.error = error;
            state.errorUpdate = update;
          }
        }
      }
      if (!didThrow) {
        if (newBaseQueueLast !== null) {
          // This update is applied, but an earlier update was skipped. Keep
          // it in the queue so it can be rebased on top of the earlier one.
          // It will never be skipped again since NoLane is a subset of every
          // set of lanes.
          const clone: StoreUpdate<A> = {
            lane: NoLane,
            action: update.action,
            hasEagerState: update.hasEagerState,
            eagerState: update.eagerState,
            eagerBaseState: update.eagerBaseState,
            next: null as any,
          };
          newBaseQueueLast = newBaseQueueLast.next = clone;
        }
        if (updateLane !== NoLane && updateLane === entangledActionLane) {
          state.didReadEntangledAction = true;
        }
        if (__DEV__ && appliedUpdatesDEV !== null) {
          appliedUpdatesDEV.push(newState, update.action);
        }
        newState = nextState as any;
      }
    }
    update = update.next;
  } while (update !== first);

  if (newBaseQueueLast === null) {
    newBaseState = newState;
  } else {
    newBaseQueueLast.next = newBaseQueueFirst as any;
  }
  state.baseState = newBaseState as any;
  state.baseQueue = newBaseQueueLast;
  state.memoizedState = newState;
  if (__DEV__) {
    state.appliedUpdatesDEV = appliedUpdatesDEV;
  }
  return state;
}

// The state of a store in the tree that's rendering. If the HostRoot didn't
// process the store, none of its updates are in the render's lanes, so the
// state is the committed one, with every pending lane skipped.
export function getStoreStateForRender<T, A>(
  record: StoreRecord<T, A>,
  hostRoot: Fiber,
): StoreState<T, A> {
  if (!record.isPending) {
    // No updates that haven't committed, so the HostRoot didn't process the
    // record, or processed it into the committed state. This is the common
    // case: most stores a render reads weren't updated.
    return record.committed;
  }
  const rootState: RootState = hostRoot.memoizedState;
  const storeStates = rootState.storeStates;
  if (storeStates == null) {
    if (canUseCommittedStoreState(record, storeRenderLanes)) {
      return record.committed;
    }
  } else {
    if (record.lastVersion === storeStates.version) {
      return record.lastState as any;
    }
    let state = storeStates.map.get(record);
    if (
      state === undefined &&
      canUseCommittedStoreState(record, storeRenderLanes)
    ) {
      // Not processed by this render, because none of its updates are in
      // the render's lanes.
      state = record.committed;
    }
    if (state !== undefined) {
      record.lastVersion = storeStates.version;
      record.lastState = state;
      return state;
    }
  }
  // The HostRoot didn't process this record, because it was created after
  // the HostRoot began, with updates from transitions that were pending.
  // Process it now, for the root's lanes, and keep the state on the HostRoot.
  const renderLanes = storeRenderLanes;
  const prevDispatcher = ReactSharedInternals.H;
  ReactSharedInternals.H = null;
  let state;
  try {
    state = processStoreRecord(record, renderLanes);
  } finally {
    ReactSharedInternals.H = prevDispatcher;
  }
  if (didApplyEntangledActionUpdate(record, state)) {
    // It applied an update from a pending async action. Suspend before the
    // state is kept on the HostRoot, so this render can't commit it.
    const entangledActionThenable = peekEntangledActionThenable();
    if (entangledActionThenable !== null) {
      throw entangledActionThenable;
    }
  }
  const current = hostRoot.alternate;
  let nextStoreStates = storeStates;
  if (
    nextStoreStates == null ||
    (current !== null && current.memoizedState.storeStates === nextStoreStates)
  ) {
    nextStoreStates = createStoreStates(
      nextStoreStates == null ? new Map() : new Map(nextStoreStates.map),
      NoLanes,
    );
    hostRoot.memoizedState = {
      element: rootState.element,
      isDehydrated: rootState.isDehydrated,
      cache: rootState.cache,
      storeStates: nextStoreStates,
    };
  }
  nextStoreStates.map.set(record, state);
  record.lastVersion = nextStoreStates.version;
  record.lastState = state;
  if (state.skippedLanes !== NoLanes) {
    // Keep the lanes on the HostRoot, so the root renders them later.
    hostRoot.lanes = mergeLanes(hostRoot.lanes, state.skippedLanes);
    markSkippedUpdateLanes(state.skippedLanes);
  }
  return state;
}

export function readStoreState<T>(state: StoreState<T, any>, fiber: Fiber): T {
  if (state.errorUpdate !== null) {
    // The commit drops the update that threw. If the error boundary that
    // catches it commits, it reports the error; otherwise the commit does.
    const errorFibers = state.errorFibers;
    if (errorFibers === null) {
      state.errorFibers = [fiber];
    } else {
      errorFibers.push(fiber);
    }
    throw state.error;
  }
  return state.memoizedState;
}

// The lanes a reader of the store needs to render again in.
export function getSkippedStoreLanes(
  record: StoreRecord<any, any>,
  state: StoreState<any, any>,
  rootRenderLanes: Lanes,
): Lanes {
  if (state === record.committed) {
    // Not processed by this render, so none of its updates are in the
    // render's lanes, except ones dispatched after the render started.
    return removeLanes(record.lanes, rootRenderLanes);
  }
  return state.skippedLanes;
}

// In Strict Mode, run the reducer an extra time to help detect side effects,
// like the update queue of useReducer does.
export function doubleInvokeStoreReducerDEV(
  record: StoreRecord<any, any>,
  state: StoreState<any, any>,
): void {
  if (__DEV__) {
    const applied = state.appliedUpdatesDEV;
    if (applied == null || state.didDoubleInvokeReducerDEV) {
      return;
    }
    state.didDoubleInvokeReducerDEV = true;
    const reducer = record.store._reducer;
    for (let i = 0; i < applied.length; i += 2) {
      try {
        reducer(applied[i], applied[i + 1]);
      } catch (error) {
        // It didn't throw the first time.
      }
    }
  }
}

function dispatchStoreUpdate<T, A>(record: StoreRecord<T, A>, action: A): void {
  if (record.isRemoved) {
    // The record was dropped while the store was dispatching to its records.
    return;
  }
  // Check for an infinite update loop before changing anything, so that if
  // this throws, no root has the update.
  throwIfInfiniteUpdateLoopDetected(false);
  const root = record.root;
  const lane = requestStoreUpdateLane(root);
  const isRenderPhaseUpdate = isStoreUpdateDuringRender(root);
  if (isRenderPhaseUpdate) {
    // Unlike the state of a component, a store is shared, so updating it
    // during render is a side effect. It's rendered after the current render,
    // like an update to another component.
    warnAboutStoreUpdateInRenderDEV();
  }

  const update: StoreUpdate<A> = {
    lane,
    action,
    hasEagerState: false,
    eagerState: null,
    eagerBaseState: null,
    next: null as any,
  };
  if (!isRenderPhaseUpdate && !hasPendingStoreUpdates(record)) {
    // The queue is empty, so the next state can be computed right now, like
    // the eager state of useState.
    const baseState = record.committed.memoizedState;
    try {
      const eagerState = record.store._reducer(baseState, action);
      if (is(eagerState, baseState)) {
        // The state is the same, so there's nothing to do. Drop the action
        // from the head queue, if every root has committed every update.
        syncStoreHead(record);
        return;
      }
      update.hasEagerState = true;
      update.eagerState = eagerState;
      update.eagerBaseState = baseState;
    } catch (error) {
      // Suppress the error. It will throw again during render.
    }
  }
  if (!record.isPending) {
    // The HostRoot only processes the records with updates.
    record.isPending = true;
    const pending = root.pendingStoreRecords;
    if (pending === null) {
      root.pendingStoreRecords = [record];
    } else {
      pending.push(record);
    }
  }
  record.lanes = mergeLanes(record.lanes, lane);

  // Schedule the update on the HostRoot, which owns the state of the store.
  // The concurrent queue adds it to the record when the next render starts,
  // so a render that's already in progress doesn't see it.
  const hostRoot = root.current;
  enqueueConcurrentStoreUpdate(hostRoot, record as any, update as any, lane);
  const epoch = getConcurrentQueuesEpoch();
  if (record.enqueuedEpoch !== epoch) {
    record.enqueuedEpoch = epoch;
    record.enqueuedLanes = NoLanes;
  }
  if (!isSubsetOfLanes(record.enqueuedLanes, lane)) {
    record.enqueuedLanes = mergeLanes(record.enqueuedLanes, lane);
    // Schedule every component that reads the store. Readers subscribe when
    // they commit and unsubscribe when they're deleted, so they're always
    // mounted on this root. The concurrent queue walks to the root from each
    // one when the next render starts. If an earlier update already
    // scheduled them in this lane and is still in the queue, there's nothing
    // to add: a reader that subscribed since is scheduled in every pending
    // lane when it subscribes.
    let scheduledFiber = null;
    record.readers.forEach(fiber => {
      enqueueConcurrentRenderForLaneOnMountedFiber(fiber, lane);
      if (enableSchedulingProfiler) {
        markStateUpdateScheduled(fiber, lane);
      }
      scheduledFiber = fiber;
    });
    record.scheduledFiber = scheduledFiber;
  }
  // Attribute the update to a reader, if there is one, for DevTools and act
  // warnings. A render phase update is attributed to the root, like an
  // update to another component.
  const scheduledFiber = record.scheduledFiber;
  scheduleUpdateOnFiber(
    root,
    isRenderPhaseUpdate || scheduledFiber === null ? hostRoot : scheduledFiber,
    lane,
  );

  if (isTransitionLane(lane)) {
    // Like the update queue of useState, entangle the transitions that update
    // the same store so they commit together.
    const transitionLanes = mergeLanes(
      intersectLanes(record.transitionLanes, root.pendingLanes),
      lane,
    );
    record.transitionLanes = transitionLanes;
    markRootEntangled(root, transitionLanes);
  }
}

function subscribeToStores(
  fiber: Fiber,
  records: Array<StoreRecord<any, any>>,
): void {
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    record.readers.add(fiber);
    // The fiber may have missed updates: ones dispatched after it rendered
    // and before it subscribed, or ones its render skipped and that weren't
    // merged into its lanes because its render was thrown away. The root
    // already has these lanes pending. The concurrent queue marks the fiber
    // when the next render starts, once the tree is consistent.
    const lanes = record.lanes;
    if (lanes !== NoLanes) {
      enqueueConcurrentRenderForLaneOnMountedFiber(fiber, lanes);
    }
  }
}

function unsubscribeFromStores(
  fiber: Fiber,
  records: Array<StoreRecord<any, any>>,
): void {
  const alternate = fiber.alternate;
  for (let i = 0; i < records.length; i++) {
    const record = records[i];
    const readers = record.readers;
    readers.delete(fiber);
    if (alternate !== null) {
      readers.delete(alternate);
    }
    if (
      record.scheduledFiber !== null &&
      (record.scheduledFiber === fiber || record.scheduledFiber === alternate)
    ) {
      // Don't keep the deleted fiber alive.
      record.scheduledFiber = null;
    }
    if (readers.size === 0 && !record.mayBeUnsubscribed) {
      // Check whether the record can be dropped when this root commits.
      record.mayBeUnsubscribed = true;
      addUnsubscribedStoreRecord(record.root, record);
    }
  }
}

// Called from the insertion effect of a component that reads stores, when it
// commits. reads is a list of pairs of a record and the value the component
// read.
export function subscribeToStoreReads(
  fiber: Fiber,
  reads: Array<mixed>,
  isStaleHydration: boolean,
): () => void {
  const records: Array<StoreRecord<any, any>> = [];
  for (let i = 0; i < reads.length; i += 2) {
    records.push(reads[i] as any);
  }
  subscribeToStores(fiber, records);
  if (isStaleHydration) {
    // The component hydrated with the initial value of a store, to match the
    // server, but the store has changed since. Render again with the latest
    // value, like useSyncExternalStore does with getServerSnapshot. This
    // needs a new lane, which can't be scheduled from an insertion effect.
    if (staleHydratedReaders === null) {
      staleHydratedReaders = [fiber];
    } else {
      staleHydratedReaders.push(fiber);
    }
  }
  return () => unsubscribeFromStores(fiber, records);
}

// Called when a component is deleted. A component only pushes its store
// subscription effect when the set of stores it reads changes, so the effect
// may not be in the effect list of its last render. Clean it up directly.
export function unsubscribeFromStoresOnDeletion(fiber: Fiber): void {
  const updateQueue: FunctionComponentUpdateQueue | null =
    fiber.updateQueue as any;
  if (updateQueue === null) {
    return;
  }
  const inst = updateQueue.storeInst;
  if (inst != null) {
    const destroy = inst.destroy;
    if (destroy !== undefined) {
      inst.destroy = undefined;
      destroy();
    }
  }
}

// Called when a component suspends. The primary children of the Suspense
// boundary are thrown away if the boundary shows its fallback, so they won't
// subscribe to the stores they read. Collect the stores read by the component
// that suspended and the components above it, up to the boundary: those are
// the reads that can change what it renders. A store update then retries the
// boundary, like an update to a context they read.
export function collectStoreReadsOfSuspendedTree(
  sourceFiber: Fiber,
  // The stores the component that suspended read. In legacy mode its render
  // has already been reset, so they're read before that.
  sourceStoreReads: Array<mixed> | null,
  boundary: Fiber,
): void {
  if (!didReadStores) {
    return;
  }
  let records =
    suspendedBoundaryStoreReads === null
      ? null
      : suspendedBoundaryStoreReads.get(boundary) || null;
  let fiber: Fiber | null = sourceFiber;
  while (fiber !== null && fiber !== boundary) {
    let reads = null;
    if (fiber === sourceFiber) {
      reads = sourceStoreReads;
    } else if (
      fiber.tag === FunctionComponent ||
      fiber.tag === ForwardRef ||
      fiber.tag === SimpleMemoComponent
    ) {
      const updateQueue: FunctionComponentUpdateQueue | null =
        fiber.updateQueue as any;
      reads = updateQueue === null ? null : updateQueue.storeReads;
    }
    if (reads != null) {
      for (let i = 0; i < reads.length; i += 2) {
        const record: StoreRecord<any, any> = reads[i] as any;
        if (records === null) {
          records = [record];
        } else if (records.indexOf(record) === -1) {
          records.push(record);
        }
      }
    }
    fiber = fiber.return;
  }
  if (records !== null) {
    if (suspendedBoundaryStoreReads === null) {
      suspendedBoundaryStoreReads = new Map();
    }
    suspendedBoundaryStoreReads.set(boundary, records);
  }
}

// Called when a Suspense boundary renders its fallback. Returns the stores
// its primary children read before they suspended, if any.
export function takeStoreReadsOfSuspendedTree(
  boundary: Fiber,
): Array<StoreRecord<any, any>> | null {
  if (suspendedBoundaryStoreReads === null) {
    return null;
  }
  return suspendedBoundaryStoreReads.get(boundary) || null;
}

export function resetStoreReadsOfSuspendedTree(): void {
  suspendedBoundaryStoreReads = null;
}

// The entangled lanes of the root that's rendering, which the HostRoot
// processes stores with. A store first read after the HostRoot began is
// processed with the same lanes.
let storeRenderLanes: Lanes = NoLanes;

export function prepareStoresForRender(entangledRenderLanes: Lanes): void {
  storeRenderLanes = entangledRenderLanes;
  resetStoreReadsOfSuspendedTree();
}

// Called when a Suspense boundary commits. It subscribes to the stores its
// fallback is waiting on, and unsubscribes once its primary children commit.
export function commitSuspenseStoreReads(
  current: Fiber | null,
  finishedWork: Fiber,
): void {
  const prevState: SuspenseState | null =
    current === null ? null : current.memoizedState;
  const nextState: SuspenseState | null = finishedWork.memoizedState;
  const prevReads = prevState === null ? null : prevState.storeReads;
  const nextReads = nextState === null ? null : nextState.storeReads;
  if (prevReads !== nextReads) {
    if (prevReads != null) {
      unsubscribeFromStores(finishedWork, prevReads);
    }
    if (nextReads != null) {
      subscribeToStores(finishedWork, nextReads);
    }
  }
}

export function unsubscribeSuspenseStoreReadsOnDeletion(fiber: Fiber): void {
  const state: SuspenseState | null = fiber.memoizedState;
  if (state !== null && state.storeReads != null) {
    unsubscribeFromStores(fiber, state.storeReads);
  }
}

function removeStoreRecord(record: StoreRecord<any, any>): void {
  record.isRemoved = true;
  // Called after the mutation phase, so the committed HostRoot's states are
  // the only ones that can still reference the record.
  const rootState: RootState = record.root.current.memoizedState;
  const storeStates = rootState.storeStates;
  if (storeStates != null) {
    storeStates.map.delete(record);
  }
  record.lastVersion = -1;
  record.lastState = null;
  record.scheduledFiber = null;
  const records = record.store._records;
  const index = records.indexOf(record);
  if (index !== -1) {
    records.splice(index, 1);
  }
}

// The finished HostRoot of the commit that's committing store states.
let committingFinishedWork: Fiber | null = null;

function commitStoreState(
  state: StoreState<any, any>,
  record: StoreRecord<any, any>,
): void {
  if (record.committed === state) {
    // Already committed, by an earlier commit of the same HostRoot state.
    return;
  }
  record.committed = state;
  record.hasUnprocessedHeldUpdates = false;
  if (state.errorUpdate !== null) {
    if (
      !didCommitErrorBoundary(state.errorFibers, committingFinishedWork as any)
    ) {
      // No component threw the error, or the error boundaries that
      // caught it were thrown away, for example because the content
      // around them suspended on mount. Report it after the layout phase,
      // unless React logs it there, for example because a boundary that
      // caught it passed it to an outer one.
      if (pendingStoreErrors === null) {
        pendingStoreErrors = [state.error];
      } else {
        pendingStoreErrors.push(state.error);
      }
    }
    // The committed state no longer has an error, so later renders that
    // read it don't throw again.
    state.error = NO_ERROR;
    state.errorUpdate = null;
    state.errorFibers = null;
  }
  if (__DEV__) {
    // A component that reads the committed state in a later render
    // doesn't run the reducer again in Strict Mode, like useReducer.
    state.appliedUpdatesDEV = null;
  }
}

// Called when a root commits, before the mutation phase. The states the
// HostRoot computed become the committed states, like the Hooks of the
// finished tree become current. Nothing is computed again.
export function commitStoreStates(root: FiberRoot, finishedWork: Fiber): void {
  if (storesWithPendingTransitionUpdates.size > 0) {
    // Apply the held updates of transitions that this commit finished.
    storesWithPendingTransitionUpdates.forEach(store =>
      settlePendingTransitionUpdates(store, root),
    );
  }
  const rootState: RootState = finishedWork.memoizedState;
  const storeStates = rootState.storeStates;
  if (storeStates != null) {
    committingFinishedWork = finishedWork;
    storeStates.map.forEach(commitStoreState);
    committingFinishedWork = null;
  }
  const pending = root.pendingStoreRecords;
  if (pending === null) {
    return;
  }
  // Updates dispatched since the concurrent queue was last drained haven't
  // been added to their queues yet.
  const epoch = getConcurrentQueuesEpoch();
  let writeIndex = 0;
  for (let i = 0; i < pending.length; i++) {
    const record = pending[i];
    record.lanes = mergeLanes(
      mergeLanes(
        getStoreQueueLanes(record.committed.baseQueue),
        getStoreQueueLanes(record.pending),
      ),
      record.enqueuedEpoch === epoch ? record.enqueuedLanes : NoLanes,
    );
    if (hasPendingStoreUpdates(record)) {
      pending[writeIndex++] = record;
    } else {
      record.isPending = false;
      syncStoreHead(record);
    }
  }
  pending.length = writeIndex;
  if (writeIndex === 0) {
    root.pendingStoreRecords = null;
  }
}

// Reducer errors that no committed error boundary will log. The update that
// threw is dropped, so if React doesn't log the error while committing, it's
// reported after the layout phase.
let pendingStoreErrors: Array<mixed> | null = null;
const loggedErrors: Set<mixed> = new Set();

// Called when React logs an error that a boundary or the root caught.
export function markErrorLoggedForStores(error: mixed): void {
  if (pendingStoreErrors !== null) {
    loggedErrors.add(error);
  }
}

// Called after the layout phase of a commit.
export function flushStoreErrors(): void {
  const errors = pendingStoreErrors;
  if (errors === null) {
    return;
  }
  pendingStoreErrors = null;
  const unlogged = [];
  for (let i = 0; i < errors.length; i++) {
    if (!loggedErrors.has(errors[i])) {
      unlogged.push(errors[i]);
    }
  }
  // Clear the logged errors before reporting: an error handler can start
  // another commit, which uses them too.
  loggedErrors.clear();
  for (let i = 0; i < unlogged.length; i++) {
    reportGlobalError(unlogged[i]);
  }
}

// Whether the error boundary that caught the error of any of these fibers is
// part of the tree that's committing. The root reports errors that no
// boundary catches.
function didCommitErrorBoundary(
  errorFibers: Array<Fiber> | null,
  finishedWork: Fiber,
): boolean {
  if (errorFibers === null) {
    return false;
  }
  for (let i = 0; i < errorFibers.length; i++) {
    let boundary = errorFibers[i].return;
    while (boundary !== null && !isErrorBoundary(boundary)) {
      boundary = boundary.return;
    }
    if (boundary !== null && isInFinishedTree(boundary, finishedWork)) {
      return true;
    }
  }
  return false;
}

function isErrorBoundary(fiber: Fiber): boolean {
  if (fiber.tag === HostRoot) {
    return true;
  }
  if (fiber.tag === ClassComponent) {
    const instance = fiber.stateNode;
    return (
      typeof fiber.type.getDerivedStateFromError === 'function' ||
      (instance !== null && typeof instance.componentDidCatch === 'function')
    );
  }
  return false;
}

function isInFinishedTree(fiber: Fiber, finishedWork: Fiber): boolean {
  let node = fiber;
  while (node !== finishedWork) {
    const parent = node.return;
    if (parent === null) {
      return false;
    }
    let child = parent.child;
    while (child !== null && child !== node) {
      child = child.sibling;
    }
    if (child === null) {
      return false;
    }
    node = parent;
  }
  return true;
}

// Called after the mutation phase of a commit, when the components and
// boundaries of the new tree have subscribed and the deleted ones have
// unsubscribed.
export function flushStoreSubscriptions(root: FiberRoot): void {
  const stale = staleHydratedReaders;
  if (stale !== null) {
    staleHydratedReaders = null;
    for (let i = 0; i < stale.length; i++) {
      const fiber = stale[i];
      const updatedRoot = enqueueConcurrentRenderForLane(fiber, SyncLane);
      if (updatedRoot !== null) {
        scheduleUpdateOnFiber(updatedRoot, fiber, SyncLane);
      }
    }
  }
  // Drop the records that nothing on this root reads anymore, so the store
  // doesn't keep the root alive. A record with pending updates is kept until
  // they commit, so a component that starts reading the store again doesn't
  // see them early.
  const unsubscribed = root.unsubscribedStoreRecords;
  if (unsubscribed !== null) {
    let writeIndex = 0;
    for (let i = 0; i < unsubscribed.length; i++) {
      const record = unsubscribed[i];
      if (record.readers.size > 0) {
        record.mayBeUnsubscribed = false;
      } else if (!hasPendingStoreUpdates(record)) {
        record.mayBeUnsubscribed = false;
        removeStoreRecord(record);
      } else {
        unsubscribed[writeIndex++] = record;
      }
    }
    unsubscribed.length = writeIndex;
    if (writeIndex === 0) {
      root.unsubscribedStoreRecords = null;
    }
  }
}

// Once every root has committed every update to a store, the latest value is
// the committed value, so the updates that weren't applied to _head can be
// dropped. This keeps the queue from growing.
function syncStoreHead(record: StoreRecord<any, any>): void {
  const store = record.store;
  if (store._headQueue === null) {
    return;
  }
  const storeRecords = store._records;
  for (let i = 0; i < storeRecords.length; i++) {
    if (hasPendingStoreUpdates(storeRecords[i])) {
      return;
    }
  }
  store._head = record.committed.memoizedState;
  store._headQueue = null;
}
