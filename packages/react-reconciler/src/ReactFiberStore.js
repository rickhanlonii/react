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

import {enableSchedulingProfiler} from 'shared/ReactFeatureFlags';
import {
  NoLane,
  NoLanes,
  SyncLane,
  isSubsetOfLanes,
  isTransitionLane,
  mergeLanes,
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
} from './ReactFiberConcurrentUpdates';
import {
  requestStoreUpdateLane,
  scheduleUpdateOnFiber,
  isStoreUpdateDuringRender,
  warnAboutStoreUpdateInRenderDEV,
  throwIfInfiniteUpdateLoopDetected,
} from './ReactFiberWorkLoop';
import {markStateUpdateScheduled} from './ReactFiberDevToolsHook';
import is from 'shared/objectIs';
import getStoreHead from 'shared/getStoreHead';
import reportGlobalError from 'shared/reportGlobalError';

// A store is shared by every root that reads it, but each root commits on its
// own schedule. So each root keeps its own record of the store, with a queue of
// the updates it hasn't committed yet. This is the same model as the update
// queue of a useReducer Hook, except there's one queue per root instead of one
// per component, so the reducer only runs once per root no matter how many
// components read the store.
type StoreUpdate<A> = {
  lane: Lane,
  action: A,
  // Monotonically increasing, so the queue is always ordered by seq. Used to
  // ignore updates that were dispatched after the current render started, the
  // same way concurrent updates to useState are not visible to a render that
  // is already in progress.
  seq: number,
  // Like useState, the state after this update is computed eagerly when the
  // queue is empty, so the reducer doesn't have to run again during render.
  hasEagerState: boolean,
  eagerState: mixed,
  // The state the eager state was computed from. The eager state can only be
  // used when the update is applied to this exact state.
  eagerBaseState: mixed,
  next: StoreUpdate<A> | null,
};

export type StoreRecord<T, A> = {
  store: ReactStore<T, A>,
  root: FiberRoot,
  // The state with every committed update applied, up to the first update
  // that was skipped.
  baseState: T,
  firstUpdate: StoreUpdate<A> | null,
  lastUpdate: StoreUpdate<A> | null,
  // The lanes of the updates in the queue.
  lanes: Lanes,
  // The transition lanes that update this store. Like the update queue of
  // useState, transitions that update the same store are entangled.
  transitionLanes: Lanes,
  // The fibers subscribed to this store on this root: the components that
  // read it, and the Suspense boundaries whose primary children read it and
  // suspended.
  readers: Set<Fiber>,
  // Set once the record is dropped. The store no longer dispatches to it.
  isRemoved: boolean,
  // Whether this record is in root.unsubscribedStoreRecords.
  mayBeUnsubscribed: boolean,
  // The last read, since every component that reads the store in a render
  // reads the same value. It's keyed by the render's seq and lanes, and
  // cleared when the queue is folded at commit. New updates don't clear it:
  // they come after every render that has started, so no read includes them.
  cachedSeq: number,
  cachedLanes: Lanes,
  // The value that was read, or the error the reducer threw.
  cachedState: T,
  // What the base state would be if the read's lanes committed, so the commit
  // can reuse the work done during render. THREW if the reducer threw.
  cachedBaseState: T,
  cachedSkippedLanes: Lanes,
  // Whether the read double invoked the reducer for Strict Mode.
  cachedInStrictModeDEV: boolean,
  // Used to check whether the component that's rendering already read this
  // store, without searching its list of reads.
  readEpoch: number,
  dispatch: (record: StoreRecord<T, A>, action: A) => void,
};

const THREW: any = {};

let storeUpdateSeq: number = 0;

// Hydrated readers that rendered an out of date value. They render again
// after the mutation phase.
let staleHydratedReaders: Array<Fiber> | null = null;

// The stores read by the primary children of a Suspense boundary that
// suspended during the current render. The boundary subscribes to them if it
// commits its fallback.
let suspendedBoundary: Fiber | null = null;
let suspendedBoundaryStoreReads: Array<StoreRecord<any, any>> | null = null;

export function getCurrentStoreSeq(): number {
  return storeUpdateSeq;
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
    baseState: getStoreHead(store),
    firstUpdate: null,
    lastUpdate: null,
    lanes: NoLanes,
    transitionLanes: NoLanes,
    readers: new Set(),
    isRemoved: false,
    mayBeUnsubscribed: true,
    cachedSeq: -1,
    cachedLanes: NoLanes,
    cachedState: null as any,
    cachedBaseState: null as any,
    cachedSkippedLanes: NoLanes,
    cachedInStrictModeDEV: false,
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

function applyStoreUpdate<T, A>(
  reducer: (T, A) => T,
  state: T,
  update: StoreUpdate<A>,
): T {
  if (update.hasEagerState && is(update.eagerBaseState, state)) {
    return update.eagerState as any;
  }
  return reducer(state, update.action);
}

// Computes the value of the store for a render, using the same rules as the
// update queue of useReducer: updates with insufficient priority are skipped,
// and updates that come after a skipped update are still applied, so they get
// rebased on top of the skipped ones once those are rendered. Updates that
// were dispatched after the render started are ignored.
export function readStoreRecord<T, A>(
  record: StoreRecord<T, A>,
  renderLanes: Lanes,
  renderSeq: number,
  shouldDoubleInvokeReducer: boolean,
): T {
  if (
    record.cachedSeq === renderSeq &&
    record.cachedLanes === renderLanes &&
    (!__DEV__ || !shouldDoubleInvokeReducer || record.cachedInStrictModeDEV)
  ) {
    if (record.cachedBaseState === THREW) {
      throw record.cachedState;
    }
    return record.cachedState;
  }
  const reducer = record.store._reducer;
  let state = record.baseState;
  let newBaseState = state;
  let didSkip = false;
  let skippedLanes = NoLanes;
  let update = record.firstUpdate;
  record.cachedSeq = renderSeq;
  record.cachedLanes = renderLanes;
  record.cachedInStrictModeDEV = shouldDoubleInvokeReducer;
  try {
    while (update !== null && update.seq <= renderSeq) {
      if (!isSubsetOfLanes(renderLanes, update.lane)) {
        skippedLanes = mergeLanes(skippedLanes, update.lane);
        if (!didSkip) {
          didSkip = true;
          newBaseState = state;
        }
      } else {
        if (__DEV__ && shouldDoubleInvokeReducer) {
          // In Strict Mode, run the reducer an extra time to help detect side
          // effects, like the update queue of useReducer does.
          reducer(state, update.action);
        }
        state = applyStoreUpdate(reducer, state, update);
      }
      update = update.next;
    }
  } catch (error) {
    // Every component that reads the store in this render throws the same
    // error. The commit drops the update, since an error boundary handled it.
    record.cachedState = error;
    record.cachedBaseState = THREW;
    throw error;
  }
  record.cachedState = state;
  // The updates that weren't included come after the ones that were, so
  // they don't change the base state.
  record.cachedBaseState = didSkip ? newBaseState : state;
  record.cachedSkippedLanes = skippedLanes;
  return state;
}

// The lanes of the updates skipped by the last call to readStoreRecord.
export function getSkippedStoreLanes(record: StoreRecord<any, any>): Lanes {
  return record.cachedSkippedLanes;
}

// Whether the render applies an update in the given lane.
export function didReadStoreUpdateInLane(
  record: StoreRecord<any, any>,
  lane: Lane,
  renderLanes: Lanes,
  renderSeq: number,
): boolean {
  if (!isSubsetOfLanes(renderLanes, lane)) {
    return false;
  }
  let update = record.firstUpdate;
  while (update !== null && update.seq <= renderSeq) {
    if (update.lane === lane) {
      return true;
    }
    update = update.next;
  }
  return false;
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
    seq: 0,
    hasEagerState: false,
    eagerState: null,
    eagerBaseState: null,
    next: null,
  };
  const lastUpdate = record.lastUpdate;
  if (lastUpdate === null && !isRenderPhaseUpdate) {
    // The queue is empty, so the next state can be computed right now, like
    // the eager state of useState.
    const baseState = record.baseState;
    try {
      const eagerState = record.store._reducer(baseState, action);
      if (is(eagerState, baseState)) {
        // The state is the same, so there's nothing to do. No commit visits
        // this record, so drop the action from the head queue here, if
        // every root has committed every update.
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
  update.seq = ++storeUpdateSeq;
  if (lastUpdate === null) {
    record.firstUpdate = record.lastUpdate = update;
    // The commit only visits the records with updates.
    const pending = root.pendingStoreRecords;
    if (pending === null) {
      root.pendingStoreRecords = [record];
    } else {
      pending.push(record);
    }
  } else {
    lastUpdate.next = update;
    record.lastUpdate = update;
  }
  record.lanes = mergeLanes(record.lanes, lane);

  // Schedule every component that reads the store. Even if no component on
  // this root reads it right now, the root still needs to commit this lane so
  // that the update is applied to the base state.
  let scheduledFiber: Fiber | null = null;
  const readers = record.readers;
  if (readers.size > 0) {
    // Readers subscribe when they commit and unsubscribe when they're
    // deleted, so they're always mounted on this root. The concurrent queue
    // walks to the root from each one when the next render starts.
    readers.forEach(fiber => {
      enqueueConcurrentRenderForLaneOnMountedFiber(fiber, lane);
      if (enableSchedulingProfiler) {
        markStateUpdateScheduled(fiber, lane);
      }
      scheduledFiber = fiber;
    });
  }
  if (scheduledFiber === null || isRenderPhaseUpdate) {
    // Schedule the root itself. This needs to go through the concurrent
    // queue, like any other update, so that a render that is already in
    // progress doesn't mark the lane as finished when it commits.
    enqueueConcurrentRenderForLane(root.current, lane);
    scheduledFiber = root.current;
  }
  scheduleUpdateOnFiber(root, scheduledFiber, lane);

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

// Called when a root commits, before the mutation phase. Applies the updates
// that were rendered to the base state of every store this root reads, the
// same way the update queue of useReducer computes its new base state. Only
// visits the records with updates, so the cost doesn't grow with the number
// of stores.
export function commitStoreRecords(root: FiberRoot): void {
  const pending = root.pendingStoreRecords;
  if (pending === null) {
    return;
  }
  // Reads used the entangled lanes of the render, so apply the same ones.
  const committedLanes = root.storeRenderLanes;
  const renderSeq = root.storeRenderSeq;
  let writeIndex = 0;
  for (let i = 0; i < pending.length; i++) {
    const record = pending[i];
    if ((record.lanes & committedLanes) !== NoLanes) {
      commitStoreRecord(record, committedLanes, renderSeq);
    }
    if (record.firstUpdate === null) {
      syncStoreHead(record);
    } else {
      pending[writeIndex++] = record;
    }
  }
  pending.length = writeIndex;
  if (writeIndex === 0) {
    root.pendingStoreRecords = null;
  }
}

function commitStoreRecord<T, A>(
  record: StoreRecord<T, A>,
  committedLanes: Lanes,
  renderSeq: number,
): void {
  const isCachedRead =
    record.cachedSeq === renderSeq && record.cachedLanes === committedLanes;
  // If the render read the store with the same lanes, it already computed the
  // new base state, so the reducer doesn't need to run again.
  const canReuseRead = isCachedRead && record.cachedBaseState !== THREW;
  // If the read threw, an error boundary handled the error.
  let didRenderError = isCachedRead && !canReuseRead;
  const reducer = record.store._reducer;
  let state = record.baseState;
  let newBaseState = state;
  let didSkip = false;
  let firstRemaining: StoreUpdate<A> | null = null;
  let lastRemaining: StoreUpdate<A> | null = null;
  let remainingLanes = NoLanes;
  let update = record.firstUpdate;
  while (update !== null) {
    const next = update.next;
    if (
      update.seq > renderSeq ||
      !isSubsetOfLanes(committedLanes, update.lane)
    ) {
      // This update was not part of the commit. Keep it in the queue.
      if (!didSkip) {
        didSkip = true;
        newBaseState = state;
      }
      update.next = null;
      if (lastRemaining === null) {
        firstRemaining = lastRemaining = update;
      } else {
        lastRemaining = lastRemaining.next = update;
      }
      remainingLanes = mergeLanes(remainingLanes, update.lane);
    } else if (didSkip) {
      // This update committed, but an earlier update didn't. Keep it in the
      // queue so it can be rebased on top of the earlier one. It will never
      // be skipped again since NoLane is a subset of every set of lanes.
      const clone: StoreUpdate<A> = {
        lane: NoLane,
        action: update.action,
        seq: update.seq,
        hasEagerState: update.hasEagerState,
        eagerState: update.eagerState,
        eagerBaseState: update.eagerBaseState,
        next: null,
      };
      if (lastRemaining === null) {
        firstRemaining = lastRemaining = clone;
      } else {
        lastRemaining = lastRemaining.next = clone;
      }
    } else if (!canReuseRead) {
      try {
        state = applyStoreUpdate(reducer, state, update);
      } catch (error) {
        // Drop the update, the same way an error boundary drops the update
        // queue of a useReducer Hook. If no component threw the error during
        // render, report it.
        if (!didRenderError) {
          reportGlobalError(error);
        }
        didRenderError = false;
      }
    }
    update = next;
  }
  record.baseState = canReuseRead
    ? record.cachedBaseState
    : didSkip
      ? newBaseState
      : state;
  record.firstUpdate = firstRemaining;
  record.lastUpdate = lastRemaining;
  record.lanes = remainingLanes;
  record.cachedSeq = -1;
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
      } else if (record.firstUpdate === null) {
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
    if (storeRecords[i].firstUpdate !== null) {
      return;
    }
  }
  store._head = record.baseState;
  store._headQueue = null;
}
