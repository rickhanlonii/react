/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import type {ReactContext, ReactConsumerType} from 'shared/ReactTypes';
import type {Fiber} from './ReactInternalTypes';

import {
  disableLegacyMode,
  enableLegacyHidden,
  enableRenderableContext,
  enableViewTransition,
} from 'shared/ReactFeatureFlags';

import {WorkTag} from 'react-reconciler/src/ReactWorkTags';
import getComponentNameFromType from 'shared/getComponentNameFromType';
import {REACT_STRICT_MODE_TYPE} from 'shared/ReactSymbols';
import type {ReactComponentInfo} from '../../shared/ReactTypes';

// Keep in sync with shared/getComponentNameFromType
function getWrappedName(
  outerType: mixed,
  innerType: any,
  wrapperName: string,
): string {
  const functionName = innerType.displayName || innerType.name || '';
  return (
    (outerType: any).displayName ||
    (functionName !== '' ? `${wrapperName}(${functionName})` : wrapperName)
  );
}

// Keep in sync with shared/getComponentNameFromType
function getContextName(type: ReactContext<any>) {
  return type.displayName || 'Context';
}

export function getComponentNameFromOwner(
  owner: Fiber | ReactComponentInfo,
): string | null {
  if (typeof owner.tag === 'number') {
    return getComponentNameFromFiber((owner: any));
  }
  if (typeof owner.name === 'string') {
    return owner.name;
  }
  return null;
}

export default function getComponentNameFromFiber(fiber: Fiber): string | null {
  const {tag, type} = fiber;
  switch (tag) {
    case WorkTag.ActivityComponent:
      return 'Activity';
    case WorkTag.CacheComponent:
      return 'Cache';
    case WorkTag.ContextConsumer:
      if (enableRenderableContext) {
        const consumer: ReactConsumerType<any> = (type: any);
        return getContextName(consumer._context) + '.Consumer';
      } else {
        const context: ReactContext<any> = (type: any);
        return getContextName(context) + '.Consumer';
      }
    case WorkTag.ContextProvider:
      if (enableRenderableContext) {
        const context: ReactContext<any> = (type: any);
        return getContextName(context) + '.Provider';
      } else {
        const provider = (type: any);
        return getContextName(provider._context) + '.Provider';
      }
    case WorkTag.DehydratedFragment:
      return 'DehydratedFragment';
    case WorkTag.ForwardRef:
      return getWrappedName(type, type.render, 'ForwardRef');
    case WorkTag.Fragment:
      return 'Fragment';
    case WorkTag.HostHoistable:
    case WorkTag.HostSingleton:
    case WorkTag.HostComponent:
      // Host component type is the display name (e.g. "div", "View")
      return type;
    case WorkTag.HostPortal:
      return 'Portal';
    case WorkTag.HostRoot:
      return 'Root';
    case WorkTag.HostText:
      return 'Text';
    case WorkTag.LazyComponent:
      // Name comes from the type in this case; we don't have a tag.
      return getComponentNameFromType(type);
    case WorkTag.Mode:
      if (type === REACT_STRICT_MODE_TYPE) {
        // Don't be less specific than shared/getComponentNameFromType
        return 'StrictMode';
      }
      return 'Mode';
    case WorkTag.OffscreenComponent:
      return 'Offscreen';
    case WorkTag.Profiler:
      return 'Profiler';
    case WorkTag.ScopeComponent:
      return 'Scope';
    case WorkTag.SuspenseComponent:
      return 'Suspense';
    case WorkTag.SuspenseListComponent:
      return 'SuspenseList';
    case WorkTag.TracingMarkerComponent:
      return 'TracingMarker';
    case WorkTag.ViewTransitionComponent:
      if (enableViewTransition) {
        return 'ViewTransition';
      }
    // The display name for these tags come from the user-provided type:
    // Fallthrough
    case WorkTag.IncompleteClassComponent:
    case WorkTag.IncompleteFunctionComponent:
      if (disableLegacyMode) {
        break;
      }
    // Fallthrough
    case WorkTag.ClassComponent:
    case WorkTag.FunctionComponent:
    case WorkTag.MemoComponent:
    case WorkTag.SimpleMemoComponent:
      if (typeof type === 'function') {
        return (type: any).displayName || type.name || null;
      }
      if (typeof type === 'string') {
        return type;
      }
      break;
    case WorkTag.LegacyHiddenComponent:
      if (enableLegacyHidden) {
        return 'LegacyHidden';
      }
      break;
    case WorkTag.Throw: {
      if (__DEV__) {
        // For an error in child position we use the name of the inner most parent component.
        // Whether a Server Component or the parent Fiber.
        const debugInfo = fiber._debugInfo;
        if (debugInfo != null) {
          for (let i = debugInfo.length - 1; i >= 0; i--) {
            if (typeof debugInfo[i].name === 'string') {
              return debugInfo[i].name;
            }
          }
        }
        if (fiber.return === null) {
          return null;
        }
        return getComponentNameFromFiber(fiber.return);
      }
      return null;
    }
  }

  return null;
}
