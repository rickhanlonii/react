/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {ReactStore} from 'shared/ReactTypes';

import ReactSharedInternals from 'shared/ReactSharedInternals';
import {REACT_STORE_TYPE} from 'shared/ReactSymbols';

// A store's reducer runs outside of any component, and it can read other
// stores with use(). It gets each store's value at the point the update was
// dispatched: only the updates dispatched before it are applied. In a render,
// the renderer also skips the updates that aren't in the render's lanes, so
// updates that read across stores rebase like updates to one store.
export type ReadStoreForReducer = (
  store: ReactStore<any, any>,
  sequence: number,
) => mixed;

let currentStore: ReactStore<any, any> | null = null;
let currentSequence: number = -1;
let currentReadStore: ReadStoreForReducer | null = null;

function throwInvalidReducerHook(): empty {
  throw new Error(
    'A store reducer can only call use() with another store. Other Hooks ' +
      "can't be called in a reducer.",
  );
}

function useInReducer(usable: any): mixed {
  if (
    usable !== null &&
    typeof usable === 'object' &&
    usable.$$typeof === REACT_STORE_TYPE &&
    currentReadStore !== null
  ) {
    // Both stores now take part in rebasing across stores: their updates are
    // kept and replayed in dispatch order with every other such store's.
    usable._crossStore = true;
    if (currentStore !== null) {
      currentStore._crossStore = true;
    }
    return currentReadStore(usable, currentSequence);
  }
  return throwInvalidReducerHook();
}

const StoreReducerDispatcher: any = {
  readContext: throwInvalidReducerHook,
  use: useInReducer,
  useCallback: throwInvalidReducerHook,
  useContext: throwInvalidReducerHook,
  useEffect: throwInvalidReducerHook,
  useImperativeHandle: throwInvalidReducerHook,
  useLayoutEffect: throwInvalidReducerHook,
  useInsertionEffect: throwInvalidReducerHook,
  useMemo: throwInvalidReducerHook,
  useReducer: throwInvalidReducerHook,
  useRef: throwInvalidReducerHook,
  useState: throwInvalidReducerHook,
  useDebugValue: throwInvalidReducerHook,
  useDeferredValue: throwInvalidReducerHook,
  useTransition: throwInvalidReducerHook,
  useSyncExternalStore: throwInvalidReducerHook,
  useId: throwInvalidReducerHook,
  useHostTransitionStatus: throwInvalidReducerHook,
  useFormState: throwInvalidReducerHook,
  useActionState: throwInvalidReducerHook,
  useOptimistic: throwInvalidReducerHook,
  useMemoCache: throwInvalidReducerHook,
  useCacheRefresh: throwInvalidReducerHook,
  useEffectEvent: throwInvalidReducerHook,
};

// Runs the store's reducer for the update with the given sequence number.
// Reads of other stores go through readStore.
export function runStoreReducer<T, A>(
  store: ReactStore<T, A>,
  state: T,
  action: A,
  sequence: number,
  readStore: ReadStoreForReducer,
): T {
  const prevDispatcher = ReactSharedInternals.H;
  const prevStore = currentStore;
  const prevSequence = currentSequence;
  const prevReadStore = currentReadStore;
  ReactSharedInternals.H = StoreReducerDispatcher;
  currentStore = store;
  currentSequence = sequence;
  currentReadStore = readStore;
  try {
    return store._reducer(state, action);
  } finally {
    ReactSharedInternals.H = prevDispatcher;
    currentStore = prevStore;
    currentSequence = prevSequence;
    currentReadStore = prevReadStore;
  }
}

// The oldest store update that a renderer hasn't committed yet, or Infinity.
function getOldestPendingStoreSequence(): number {
  const getOldest = (ReactSharedInternals as any).P;
  return getOldest == null ? Infinity : getOldest();
}

// Called before an update is applied to the latest value of a store that
// takes part in rebasing across stores. Applying it can't be undone, so if an
// update dispatched before it is still pending, keep the value from before
// it: that update may read this store when it's rebased.
export function recordStoreHeadHistory(
  store: ReactStore<any, any>,
  sequence: number,
  valueBefore: mixed,
): void {
  if (!store._crossStore) {
    return;
  }
  const oldest = getOldestPendingStoreSequence();
  let history = store._headHistory;
  if (history !== null) {
    // Nothing pending is older than these, so nothing can read them.
    let stale = 0;
    while (stale < history.length && history[stale].sequence < oldest) {
      stale++;
    }
    if (stale > 0) {
      history.splice(0, stale);
    }
  }
  if (oldest < sequence) {
    if (history === null) {
      history = store._headHistory = [];
    }
    history.push({sequence, value: valueBefore});
  } else if (history !== null && history.length === 0) {
    store._headHistory = null;
  }
}

// The latest value of a store, with only the updates dispatched before the
// given one applied. Used outside of a render, and for a store no component
// on the root reads.
export function readStoreHeadAt(
  store: ReactStore<any, any>,
  sequence: number,
): mixed {
  const history = store._headHistory;
  if (history !== null) {
    for (let i = 0; i < history.length; i++) {
      if (history[i].sequence >= sequence) {
        // The value before the first update applied after this one.
        return history[i].value;
      }
    }
  }
  let head = store._head;
  const headQueue = store._headQueue;
  if (headQueue !== null) {
    for (let i = 0; i < headQueue.length; i++) {
      const entry = headQueue[i];
      if (entry.sequence >= sequence) {
        break;
      }
      try {
        head = runStoreReducer(
          store,
          head,
          entry.action,
          entry.sequence,
          readStoreHeadAt,
        );
      } catch (error) {
        // Skip it, like the latest value does.
      }
    }
  }
  return head;
}

// Every update gets the next number, across all stores, in the order they're
// dispatched.
let nextStoreUpdateSequence: number = 0;

export function claimStoreUpdateSequence(): number {
  return nextStoreUpdateSequence++;
}
