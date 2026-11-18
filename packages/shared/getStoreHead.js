/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {ReactStore} from 'shared/ReactTypes';

import {runStoreReducer, readStoreHeadAt} from 'shared/ReactStoreReducer';

// The value of the store with every update applied, in the order they were
// dispatched. The updates are applied lazily, so the reducer only runs when
// something needs the latest value.
export default function getStoreHead<T, A>(store: ReactStore<T, A>): T {
  const headQueue = store._headQueue;
  if (headQueue !== null) {
    store._headQueue = null;
    const reducer = store._reducer;
    let head = store._head;
    for (let i = 0; i < headQueue.length; i++) {
      const entry = headQueue[i];
      try {
        head = runStoreReducer(
          reducer,
          head,
          entry.action,
          entry.sequence,
          readStoreHeadAt,
        );
      } catch (error) {
        // Skip the update. Every root that read the store when it was
        // dispatched throws the error during render, and drops the update
        // when that render commits.
      }
    }
    store._head = head;
  }
  return store._head;
}
