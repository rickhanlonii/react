/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {AsyncDispatcher, Fiber, FiberRoot} from './ReactInternalTypes';
import type {Cache} from './ReactFiberCacheComponent';

import {readContext} from './ReactFiberNewContext';
import {CacheContext} from './ReactFiberCacheComponent';

import {current as currentOwner} from './ReactCurrentFiber';
import {getWorkInProgressRoot} from './ReactFiberWorkLoop';

function getCacheForType<T>(resourceType: () => T): T {
  const cache: Cache = readContext(CacheContext);
  let cacheForType: T | void = (cache.data.get(resourceType): any);
  if (cacheForType === undefined) {
    cacheForType = resourceType();
    cache.data.set(resourceType, cacheForType);
  }
  return cacheForType;
}

export const DefaultAsyncDispatcher: AsyncDispatcher = ({
  getCacheForType,
}: any);

if (__DEV__) {
  DefaultAsyncDispatcher.getOwner = (): null | Fiber => {
    return currentOwner;
  };
}

const MAX_DEBUG_STACK_COUNT = 10000;
if (__DEV__) {
  DefaultAsyncDispatcher.getShouldTrackOwner = (): boolean => {
    const root: FiberRoot | null = getWorkInProgressRoot();

    if (root === null) {
      // How? Might be a bug.
      return true;
    }
    root._debugStackCount += 1;
    return root._debugStackCount <= MAX_DEBUG_STACK_COUNT;
  };
}
