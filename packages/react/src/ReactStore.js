/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {ReactStore} from 'shared/ReactTypes';
import {REACT_STORE_TYPE} from 'shared/ReactSymbols';
import {enableStore, enableGestureTransition} from 'shared/ReactFeatureFlags';
import ReactSharedInternals from 'shared/ReactSharedInternals';
import getStoreHead from 'shared/getStoreHead';

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
  const records = this._records;
  if (records.length === 0) {
    // No root reads the store. If this update is part of a transition, the
    // renderer holds on to it until the transition is done, so a component
    // that starts reading the store before then doesn't see it early.
    const dispatchUnreadStoreUpdate = (ReactSharedInternals as any).U;
    if (
      dispatchUnreadStoreUpdate != null &&
      dispatchUnreadStoreUpdate(this, action)
    ) {
      return;
    }
    // Otherwise apply the update right away. There's no render to throw a
    // reducer error in, so it throws here, and the update isn't applied.
    this._head = this._reducer(getStoreHead(this), action);
    return;
  }
  // Each root that reads this store keeps its own version of it, so that it
  // can render the update with the right priority and rebase it on top of
  // other pending updates. The latest value is only computed when something
  // needs it, so the reducer runs as often as it would for useReducer.
  const headQueue = this._headQueue;
  if (headQueue === null) {
    this._headQueue = [action];
  } else {
    headQueue.push(action);
  }
  if (records.length === 1) {
    try {
      records[0].dispatch(records[0], action);
    } catch (error) {
      // The root rejected the update before queueing it, for example because
      // of an infinite update loop. Don't apply it to the latest value either.
      removeLastHeadAction(this);
      throw error;
    }
  } else {
    // A legacy root renders synchronously when it's updated, and its commit
    // can drop records, so iterate over a copy.
    const snapshot = records.slice();
    try {
      snapshot[0].dispatch(snapshot[0], action);
    } catch (error) {
      removeLastHeadAction(this);
      throw error;
    }
    for (let i = 1; i < snapshot.length; i++) {
      snapshot[i].dispatch(snapshot[i], action);
    }
  }
}

function removeLastHeadAction<T, A>(store: ReactStore<T, A>): void {
  const headQueue = store._headQueue;
  if (headQueue !== null) {
    headQueue.pop();
    if (headQueue.length === 0) {
      store._headQueue = null;
    }
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
    update: null as any,
  };
  store.update = updateStore.bind(store);

  return store;
}
