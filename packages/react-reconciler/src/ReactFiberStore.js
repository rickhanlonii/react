/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {ReactStore} from 'shared/ReactTypes';
import type {Fiber, FiberRoot} from './ReactInternalTypes';
import type {Lane, Lanes} from './ReactFiberLane';
import type {FunctionComponentUpdateQueue} from './ReactFiberHooks';
import type {SuspenseState} from './ReactFiberSuspenseComponent';
import type {RootState} from './ReactFiberRoot';

import {enableSchedulingProfiler} from 'shared/ReactFeatureFlags';
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
} from './ReactFiberLane';
import {
  FunctionComponent,
  ForwardRef,
  SimpleMemoComponent,
} from './ReactWorkTags';
import {
  enqueueConcurrentRenderForLane,
  enqueueConcurrentRenderForLaneOnMountedFiber,
  enqueueConcurrentStoreUpdate,
  getConcurrentlyUpdatedLanes,
} from './ReactFiberConcurrentUpdates';
import {
  requestStoreUpdateLane,
  scheduleUpdateOnFiber,
  isStoreUpdateDuringRender,
  warnAboutStoreUpdateInRenderDEV,
  throwIfInfiniteUpdateLoopDetected,
} from './ReactFiberWorkLoop';
import {peekEntangledActionLane} from './ReactFiberAsyncAction';
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
  // Whether a component threw the error the reducer threw for this update.
  // If none did, the commit reports it. This is on the update, not the
  // state, because the HostRoot can process the update more than once in a
  // render, for example after an error unwinds to the root.
  didRenderError: boolean,
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
  // The updates that were applied, so a component in Strict Mode can run
  // the reducer an extra time.
  appliedUpdatesDEV: Array<mixed> | null,
  didDoubleInvokeReducerDEV: boolean,
};

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
  // Used to check whether the component that's rendering already read this
  // store, without searching its list of reads.
  readEpoch: number,
  dispatch: (record: StoreRecord<T, A>, action: A) => void,
};

const NO_ERROR: any = {};

// Hydrated readers that rendered an out of date value. They render again
// after the mutation phase.
let staleHydratedReaders: Array<Fiber> | null = null;

// The stores read by the primary children of a Suspense boundary that
// suspended during the current render. The boundary subscribes to them if it
// commits its fallback.
let suspendedBoundary: Fiber | null = null;
let suspendedBoundaryStoreReads: Array<StoreRecord<any, any>> | null = null;

function createStoreState<T, A>(state: T): StoreState<T, A> {
  return {
    baseState: state,
    baseQueue: null,
    memoizedState: state,
    skippedLanes: NoLanes,
    didReadEntangledAction: false,
    error: NO_ERROR,
    errorUpdate: null,
    appliedUpdatesDEV: null,
    didDoubleInvokeReducerDEV: false,
  };
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
  // to be consistent with yet, so start from the latest value.
  const record: StoreRecord<T, A> = {
    store,
    root,
    pending: null,
    lanes: NoLanes,
    transitionLanes: NoLanes,
    committed: createStoreState(getStoreHead(store)),
    readers: new Set(),
    isRemoved: false,
    mayBeUnsubscribed: true,
    isPending: false,
    readEpoch: -1,
    dispatch: dispatchStoreUpdate,
  };
  records.push(record);
  // Nothing has subscribed to the record yet. If nothing does by the time
  // this root commits, the record is dropped.
  addUnsubscribedStoreRecord(root, record);
  return record;
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
): {
  states: Map<StoreRecord<any, any>, StoreState<any, any>>,
  skippedLanes: Lanes,
} | null {
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
      const state = processStoreRecord(record, renderLanes);
      states.set(record, state);
      skippedLanes = mergeLanes(skippedLanes, state.skippedLanes);
    }
  } finally {
    ReactSharedInternals.H = prevDispatcher;
  }
  return {states, skippedLanes};
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
        didRenderError: false,
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
          // Drop the update, the same way an error boundary drops the update
          // queue of a useReducer Hook. Every component that reads the store
          // in this render throws the error.
          didThrow = true;
          if (state.error === NO_ERROR) {
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
            didRenderError: false,
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
  const rootState: RootState = hostRoot.memoizedState;
  const states = rootState.storeStates;
  if (states !== null) {
    const state = states.get(record);
    if (state !== undefined) {
      return state;
    }
  }
  return record.committed;
}

export function readStoreState<T>(state: StoreState<T, any>): T {
  const errorUpdate = state.errorUpdate;
  if (errorUpdate !== null) {
    // The commit drops the update that threw, since an error boundary
    // handled the error.
    errorUpdate.didRenderError = true;
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
    if (applied === null || state.didDoubleInvokeReducerDEV) {
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
    didRenderError: false,
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
  // Schedule every component that reads the store. Readers subscribe when
  // they commit and unsubscribe when they're deleted, so they're always
  // mounted on this root. The concurrent queue walks to the root from each
  // one when the next render starts.
  let scheduledFiber = hostRoot;
  record.readers.forEach(fiber => {
    enqueueConcurrentRenderForLaneOnMountedFiber(fiber, lane);
    if (enableSchedulingProfiler) {
      markStateUpdateScheduled(fiber, lane);
    }
    scheduledFiber = fiber;
  });
  // Attribute the update to a reader, if there is one, for DevTools and act
  // warnings. A render phase update is attributed to the root, like an
  // update to another component.
  scheduleUpdateOnFiber(
    root,
    isRenderPhaseUpdate ? hostRoot : scheduledFiber,
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
  if (inst !== null) {
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
  boundary: Fiber,
): void {
  let records =
    suspendedBoundary === boundary ? suspendedBoundaryStoreReads : null;
  let fiber: Fiber | null = sourceFiber;
  while (fiber !== null && fiber !== boundary) {
    if (
      fiber.tag === FunctionComponent ||
      fiber.tag === ForwardRef ||
      fiber.tag === SimpleMemoComponent
    ) {
      const updateQueue: FunctionComponentUpdateQueue | null =
        fiber.updateQueue as any;
      const reads = updateQueue === null ? null : updateQueue.storeReads;
      if (reads !== null) {
        for (let i = 0; i < reads.length; i += 2) {
          const record: StoreRecord<any, any> = reads[i] as any;
          if (records === null) {
            records = [record];
          } else if (records.indexOf(record) === -1) {
            records.push(record);
          }
        }
      }
    }
    fiber = fiber.return;
  }
  if (records !== null) {
    suspendedBoundary = boundary;
    suspendedBoundaryStoreReads = records;
  }
}

// Called when a Suspense boundary renders its fallback. Returns the stores
// its primary children read before they suspended, if any.
export function takeStoreReadsOfSuspendedTree(
  boundary: Fiber,
): Array<StoreRecord<any, any>> | null {
  if (suspendedBoundary !== boundary) {
    return null;
  }
  const records = suspendedBoundaryStoreReads;
  suspendedBoundary = null;
  suspendedBoundaryStoreReads = null;
  return records;
}

export function resetStoreReadsOfSuspendedTree(): void {
  suspendedBoundary = null;
  suspendedBoundaryStoreReads = null;
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
    if (prevReads !== null) {
      unsubscribeFromStores(finishedWork, prevReads);
    }
    if (nextReads !== null) {
      subscribeToStores(finishedWork, nextReads);
    }
  }
}

export function unsubscribeSuspenseStoreReadsOnDeletion(fiber: Fiber): void {
  const state: SuspenseState | null = fiber.memoizedState;
  if (state !== null && state.storeReads !== null) {
    unsubscribeFromStores(fiber, state.storeReads);
  }
}

function removeStoreRecord(record: StoreRecord<any, any>): void {
  record.isRemoved = true;
  const records = record.store._records;
  const index = records.indexOf(record);
  if (index !== -1) {
    records.splice(index, 1);
  }
}

// Called when a root commits, before the mutation phase. The states the
// HostRoot computed become the committed states, like the Hooks of the
// finished tree become current. Nothing is computed again.
export function commitStoreStates(root: FiberRoot, finishedWork: Fiber): void {
  const rootState: RootState = finishedWork.memoizedState;
  const states = rootState.storeStates;
  if (states !== null) {
    states.forEach((state, record) => {
      if (record.committed === state) {
        // Already committed, by an earlier commit of the same HostRoot state.
        return;
      }
      record.committed = state;
      const errorUpdate = state.errorUpdate;
      if (errorUpdate !== null && !errorUpdate.didRenderError) {
        // No component threw the error, so report it.
        errorUpdate.didRenderError = true;
        reportGlobalError(state.error);
      }
    });
  }
  const pending = root.pendingStoreRecords;
  if (pending === null) {
    return;
  }
  // Updates dispatched during the render haven't been added to their queues
  // yet.
  const concurrentlyUpdatedLanes = getConcurrentlyUpdatedLanes();
  let writeIndex = 0;
  for (let i = 0; i < pending.length; i++) {
    const record = pending[i];
    record.lanes = mergeLanes(
      mergeLanes(
        getStoreQueueLanes(record.committed.baseQueue),
        getStoreQueueLanes(record.pending),
      ),
      intersectLanes(record.lanes, concurrentlyUpdatedLanes),
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
