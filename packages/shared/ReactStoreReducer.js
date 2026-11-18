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

// Runs the reducer for the update with the given sequence number. Reads of
// other stores go through readStore.
export function runStoreReducer<T, A>(
  reducer: (T, A) => T,
  state: T,
  action: A,
  sequence: number,
  readStore: ReadStoreForReducer,
): T {
  const prevDispatcher = ReactSharedInternals.H;
  const prevSequence = currentSequence;
  const prevReadStore = currentReadStore;
  ReactSharedInternals.H = StoreReducerDispatcher;
  currentSequence = sequence;
  currentReadStore = readStore;
  try {
    return reducer(state, action);
  } finally {
    ReactSharedInternals.H = prevDispatcher;
    currentSequence = prevSequence;
    currentReadStore = prevReadStore;
  }
}

// The latest value of a store, with only the updates dispatched before the
// given one applied. Used outside of a render.
export function readStoreHeadAt(
  store: ReactStore<any, any>,
  sequence: number,
): mixed {
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
          store._reducer,
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
