/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {ReactStore, StoreHeadEntry} from 'shared/ReactTypes';
import {REACT_STORE_TYPE} from 'shared/ReactSymbols';
import {enableStore, enableGestureTransition} from 'shared/ReactFeatureFlags';
import ReactSharedInternals from 'shared/ReactSharedInternals';
import getStoreHead from 'shared/getStoreHead';
import {
  claimStoreUpdateSequence,
  readStoreHeadAt,
  recordStoreHeadHistory,
  runStoreReducer,
} from 'shared/ReactStoreReducer';

function basicStateReducer<T>(state: T, action: T | (T => T)): T {
  // $FlowFixMe[incompatible-use]: Flow doesn't like mixed types
  return typeof action === 'function' ? action(state) : action;
}

function updateStore<T, A>(this: ReactStore<T, A>, action: A): void {
  if (__DEV__) {
    // using a reference to `arguments` bails out of GCC optimizations which affect function arity
    const args = arguments;
    if (typeof args[1] === 'function') {
      console.error(
        "store.update() doesn't support a second callback argument. " +
          'To execute a side effect after rendering, declare it in the ' +
          'component body with useEffect().',
      );
    }
  }
  if (enableGestureTransition) {
    // Check this before changing anything, so the store is unchanged if it
    // throws.
    const transition = ReactSharedInternals.T;
    if (transition !== null && transition.gesture) {
      throw new Error(
        'Cannot update a store inside a startGestureTransition. ' +
          'Gestures can only update the useOptimistic() hook. There should be no ' +
          'side-effects associated with starting a Gesture until its Action is ' +
          'invoked. Move side-effects to the Action instead.',
      );
    }
  }
  const sequence = claimStoreUpdateSequence();
  const records = this._records;
  if (records.length === 0) {
    // No root reads the store. If this update is part of a transition, the
    // renderer holds on to it until the transition is done, so a component
    // that starts reading the store before then doesn't see it early.
    const dispatchUnreadStoreUpdate = (ReactSharedInternals as any).U;
    if (
      dispatchUnreadStoreUpdate != null &&
      dispatchUnreadStoreUpdate(this, {action, sequence})
    ) {
      return;
    }
    // Otherwise apply the update right away. There's no render to throw a
    // reducer error in, so it throws here, and the update isn't applied.
    const head = getStoreHead(this);
    recordStoreHeadHistory(this, sequence, head);
    this._head = runStoreReducer(this, head, action, sequence, readStoreHeadAt);
    return;
  }
  // Each root that reads this store keeps its own version of it, so that it
  // can render the update with the right priority and rebase it on top of
  // other pending updates. The latest value is only computed when something
  // needs it, so the reducer runs as often as it would for useReducer.
  const entry: StoreHeadEntry<A> = {action, sequence};
  const headQueue = this._headQueue;
  if (headQueue === null) {
    this._headQueue = [entry];
  } else {
    headQueue.push(entry);
  }
  const dispatching = dispatchingStores.get(this);
  if (dispatching !== undefined) {
    // A root rendered synchronously while this store was dispatching an
    // earlier update to its records, and updated the store again. Every
    // root has to get the updates in the order they were dispatched, so
    // deliver this one to each root after the earlier ones.
    dispatching.updates.push({entry, delivered: 0});
    deliverStoreUpdates(dispatching);
    return;
  }
  const updates = [{entry, delivered: 0}];
  const dispatch: StoreDispatch<A> = {
    // A legacy root renders synchronously when it's updated, and its commit
    // can drop records, so deliver to a copy.
    records: this._records.slice(),
    updates,
  };
  dispatchingStores.set(this, dispatch);
  try {
    deliverStoreUpdates(dispatch);
  } catch (error) {
    // The root rejected the update before queueing it, for example because
    // of an infinite update loop. Don't apply the updates that no root
    // queued to the latest value either. They're the last ones in the head
    // queue, so remove them from the end.
    for (let i = updates.length - 1; i >= 0; i--) {
      const update = updates[i];
      if (update.delivered > 0) {
        break;
      }
      const currentHeadQueue = this._headQueue;
      if (currentHeadQueue !== null) {
        const index = currentHeadQueue.lastIndexOf(update.entry);
        if (index !== -1) {
          removeHeadAction(this, currentHeadQueue, index);
        }
      }
    }
    throw error;
  } finally {
    dispatchingStores.delete(this);
  }
}

type StoreDispatch<A> = {
  records: Array<any>,
  // For each update, the number of records it has been delivered to.
  updates: Array<{entry: StoreHeadEntry<A>, delivered: number}>,
};

// The stores that are dispatching updates to their records.
const dispatchingStores: Map<
  ReactStore<any, any>,
  StoreDispatch<any>,
> = new Map();

// Delivers each update to the records, in order, after every earlier update
// has been delivered to the same record. Delivering can render a legacy root
// synchronously, and the commit can update the store again, which adds an
// update and delivers again before this returns.
function deliverStoreUpdates<A>(dispatch: StoreDispatch<A>): void {
  const {records, updates} = dispatch;
  for (let i = 0; i < updates.length; i++) {
    const update = updates[i];
    const limit = i === 0 ? records.length : updates[i - 1].delivered;
    while (update.delivered < limit) {
      const record = records[update.delivered];
      // Count it before dispatching, so an update the record's commit
      // dispatches isn't delivered ahead of this one.
      update.delivered++;
      try {
        record.dispatch(record, update.entry.action, update.entry.sequence);
      } catch (error) {
        // The root rejected the update before queueing it, for example
        // because of an infinite update loop.
        update.delivered--;
        throw error;
      }
    }
  }
}

function removeHeadAction<T, A>(
  store: ReactStore<T, A>,
  headQueue: Array<StoreHeadEntry<A>>,
  index: number,
): void {
  if (store._headQueue !== headQueue) {
    // The queue, with this action, was already applied to the latest value.
    return;
  }
  headQueue.splice(index, 1);
  if (headQueue.length === 0) {
    store._headQueue = null;
  }
}

export function createStore<T, A>(
  initialValue: T,
  reducer?: (T, A) => T,
): ReactStore<T, A> {
  if (!enableStore) {
    throw new Error('Not implemented.');
  }

  const store: ReactStore<T, A> = {
    $$typeof: REACT_STORE_TYPE,
    // The reducer is fixed for the lifetime of the store, so an update can be
    // replayed on top of any version of the value. That's what lets each root
    // rebase updates with different priorities.
    _reducer: reducer === undefined ? (basicStateReducer as any) : reducer,
    // The value with every update applied in the order it was dispatched.
    _head: initialValue,
    // The value the store was created with. This is what the server renders,
    // so it's also what the client hydrates with.
    _initial: initialValue,
    // Updates that haven't been applied to _head yet.
    _headQueue: null,
    _pendingTransitionUpdates: null,
    // One record per root that reads the store. Each renderer creates its
    // records, and dispatches to them through record.dispatch.
    _records: [],
    // Set once its reducer reads another store, or another store's reducer
    // reads it.
    _crossStore: false,
    _headHistory: null,
    update: null as any,
  };
  store.update = updateStore.bind(store);

  return store;
}
