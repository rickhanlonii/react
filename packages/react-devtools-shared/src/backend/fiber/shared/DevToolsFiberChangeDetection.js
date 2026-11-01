/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {Fiber} from 'react-reconciler/src/ReactInternalTypes';
import type {HooksNode, HooksTree} from 'react-debug-tools/src/ReactDebugHooks';
import type {WorkTagMap} from '../../types';

import {getStoreKeyOfHooksNode} from 'react-debug-tools';
import {getFiberFlags} from './DevToolsFiberInspection';
import is from 'shared/objectIs';

export function getContextChanged(prevFiber: Fiber, nextFiber: Fiber): boolean {
  let prevContext =
    prevFiber.dependencies && prevFiber.dependencies.firstContext;
  let nextContext =
    nextFiber.dependencies && nextFiber.dependencies.firstContext;

  while (prevContext && nextContext) {
    // Note this only works for versions of React that support this key (e.v. 18+)
    // For older versions, there's no good way to read the current context value after render has completed.
    // This is because React maintains a stack of context values during render,
    // but by the time DevTools is called, render has finished and the stack is empty.
    if (prevContext.context !== nextContext.context) {
      // If the order of context has changed, then the later context values might have
      // changed too but the main reason it rerendered was earlier. Either an earlier
      // context changed value but then we would have exited already. If we end up here
      // it's because a state or props change caused the order of contexts used to change.
      // So the main cause is not the contexts themselves.
      return false;
    }
    if (!is(prevContext.memoizedValue, nextContext.memoizedValue)) {
      return true;
    }

    prevContext = prevContext.next;
    nextContext = nextContext.next;
  }
  return false;
}

export function didStatefulHookChange(
  prev: HooksNode,
  next: HooksNode,
): boolean {
  // Detect the shape of useState() / useReducer() / useTransition() / useSyncExternalStore() / useActionState() / use(store)
  const isStatefulHook =
    prev.isStateEditable === true ||
    prev.name === 'Store' ||
    prev.name === 'SyncExternalStore' ||
    prev.name === 'Transition' ||
    prev.name === 'ActionState' ||
    prev.name === 'FormState';

  // Compare the values to see if they changed
  if (isStatefulHook) {
    return prev.value !== next.value;
  }

  return false;
}

// The leaves of a hooks tree in order.
function flattenHooks(tree: HooksTree, leaves: Array<HooksNode>): void {
  for (let i = 0; i < tree.length; i++) {
    const node = tree[i];
    if (node.subHooks.length > 0) {
      flattenHooks(node.subHooks, leaves);
    } else {
      leaves.push(node);
    }
  }
}

export type ChangedHooks = {
  // The ids of the changed hooks that take a slot in the list of Hooks. These
  // are the ids the frontend matches against the inspected hooks, and shows as
  // "Hook N".
  hooks: Array<number>,
  // Store reads have no id. These are the positions of the changed reads among
  // the store reads of the new render, in order.
  storeReads: Array<number>,
};

// Returns the hooks in nextHooks that changed since prevHooks.
//
// Hooks that take a slot in the list of Hooks keep their id across renders, so
// they're matched by id. use(store) takes no slot and can be called
// conditionally, so a store read is matched with the read of the same store in
// the previous render (the first read with the first read, and so on). A read
// that only happens in one of the two renders isn't a change.
export function getChangedHooks(
  prevHooks: HooksTree | null,
  nextHooks: HooksTree | null,
): null | ChangedHooks {
  if (prevHooks == null || nextHooks == null) {
    return null;
  }

  const prevLeaves: Array<HooksNode> = [];
  const nextLeaves: Array<HooksNode> = [];
  flattenHooks(prevHooks, prevLeaves);
  flattenHooks(nextHooks, nextLeaves);

  const prevHooksByID: Map<number, HooksNode> = new Map();
  const prevStoreReads: Map<mixed, Array<HooksNode>> = new Map();
  for (let i = 0; i < prevLeaves.length; i++) {
    const prevHook = prevLeaves[i];
    if (prevHook.id !== null) {
      prevHooksByID.set(prevHook.id, prevHook);
    } else {
      const storeKey = getStoreKeyOfHooksNode(prevHook);
      if (storeKey !== null) {
        const reads = prevStoreReads.get(storeKey);
        if (reads === undefined) {
          prevStoreReads.set(storeKey, [prevHook]);
        } else {
          reads.push(prevHook);
        }
      }
    }
  }

  const hooks: Array<number> = [];
  const storeReads: Array<number> = [];
  const nextStoreReadCounts: Map<mixed, number> = new Map();
  let storeReadIndex = 0;
  for (let i = 0; i < nextLeaves.length; i++) {
    const nextHook = nextLeaves[i];
    const id = nextHook.id;
    if (id !== null) {
      const prevHook = prevHooksByID.get(id);
      if (prevHook !== undefined && didStatefulHookChange(prevHook, nextHook)) {
        hooks.push(id);
      }
      continue;
    }
    const storeKey = getStoreKeyOfHooksNode(nextHook);
    if (storeKey === null) {
      // Hooks without a slot that aren't store reads (Context, Promise) can't
      // have changed state.
      continue;
    }
    const count = nextStoreReadCounts.get(storeKey) || 0;
    nextStoreReadCounts.set(storeKey, count + 1);
    const reads = prevStoreReads.get(storeKey);
    const prevHook = reads === undefined ? undefined : reads[count];
    if (prevHook !== undefined && didStatefulHookChange(prevHook, nextHook)) {
      storeReads.push(storeReadIndex);
    }
    storeReadIndex++;
  }

  return {hooks, storeReads};
}

export function getChangedKeys(prev: any, next: any): null | Array<string> {
  if (prev == null || next == null) {
    return null;
  }

  const keys = new Set([...Object.keys(prev), ...Object.keys(next)]);
  const changedKeys = [];
  // eslint-disable-next-line no-for-of-loops/no-for-of-loops
  for (const key of keys) {
    if (prev[key] !== next[key]) {
      changedKeys.push(key);
    }
  }

  return changedKeys;
}

/**
 * Returns true iff nextFiber actually performed any work and produced an update.
 * For generic components, like Function or Class components, prevFiber is not considered.
 */
export function didFiberRender(
  workTagMap: WorkTagMap,
  prevFiber: Fiber,
  nextFiber: Fiber,
): boolean {
  switch (nextFiber.tag) {
    case workTagMap.ClassComponent:
    case workTagMap.FunctionComponent:
    case workTagMap.ContextConsumer:
    case workTagMap.MemoComponent:
    case workTagMap.SimpleMemoComponent:
    case workTagMap.ForwardRef:
      // For types that execute user code, we check PerformedWork effect.
      // We don't reflect bailouts (either referential or sCU) in DevTools.
      // TODO: This flag is a leaked implementation detail. Once we start
      // releasing DevTools in lockstep with React, we should import a
      // function from the reconciler instead.
      const PerformedWork = 0b000000000000000000000000001;
      return (getFiberFlags(nextFiber) & PerformedWork) === PerformedWork;
    // Note: ContextConsumer only gets PerformedWork effect in 16.3.3+
    // so it won't get highlighted with React 16.3.0 to 16.3.2.
    default:
      // For host components and other types, we compare inputs
      // to determine whether something is an update.
      return (
        prevFiber.memoizedProps !== nextFiber.memoizedProps ||
        prevFiber.memoizedState !== nextFiber.memoizedState ||
        prevFiber.ref !== nextFiber.ref
      );
  }
}
