/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import * as React from 'react';
import {
  useContext,
  useMemo,
  useCallback,
  memo,
  useState,
  useEffect,
} from 'react';
import styles from './HookChangeSummary.css';
import ButtonIcon from '../ButtonIcon';
import {InspectedElementContext} from '../Components/InspectedElementContext';
import {StoreContext} from '../context';

import {getAlreadyLoadedHookNames} from 'react-devtools-shared/src/hookNamesCache';
import {getHookSourceLocationKey} from 'react-devtools-shared/src/hookSourceLocation';
import Toggle from '../Toggle';
import type {HooksNode} from 'react-debug-tools/src/ReactDebugHooks';
import type {ChangeDescription} from './types';

// $FlowFixMe[cannot-resolve-name]: Flow doesn't know about Intl.ListFormat
const hookListFormatter = new Intl.ListFormat('en', {
  style: 'long',
  type: 'conjunction',
});

type HookProps = {
  hook: HooksNode,
  hookNames: Map<string, string> | null,
};

const Hook: component(...props: HookProps) = memo(
  ({hook, hookNames}: HookProps) => {
    const hookSource = hook.hookSource;
    const hookName = useMemo(() => {
      if (!hookSource || !hookNames) return null;
      const key = getHookSourceLocationKey(hookSource);
      return hookNames.get(key) || null;
    }, [hookSource, hookNames]);

    return (
      <ul className={styles.Hook}>
        <li>
          {hook.id !== null && (
            <span className={styles.PrimitiveHookNumber}>
              {String(hook.id + 1)}
            </span>
          )}
          <span
            className={
              hook.id !== null ? styles.PrimitiveHookName : styles.Name
            }>
            {hook.name}
            {hookName && <span className={styles.HookName}>({hookName})</span>}
          </span>
          {hook.subHooks?.map((subHook, index) => (
            <Hook key={index} hook={subHook} hookNames={hookNames} />
          ))}
        </li>
      </ul>
    );
  },
);

// Store reads take no slot in the list of Hooks, so they have no id. Custom
// hooks have no id either, but they have sub hooks.
function isStoreRead(hook: HooksNode): boolean {
  return (
    hook.id === null &&
    hook.name === 'Store' &&
    (hook.subHooks == null || hook.subHooks.length === 0)
  );
}

type ChangedHooksFilter = {
  hookIDs: Array<number>,
  storeReads: Array<number>,
  storeReadIndex: number,
  matchCount: number,
};

// Keeps the hooks that changed, and the custom hooks that contain them. Hooks
// with a slot are matched by id, and store reads by their position among the
// store reads.
function filterHooks(
  hooks: Array<HooksNode>,
  filter: ChangedHooksFilter,
): Array<HooksNode> {
  const filteredHooks = [];
  for (let i = 0; i < hooks.length; i++) {
    const hook = hooks[i];
    const subHooks = hook.subHooks;
    if (subHooks != null && subHooks.length > 0) {
      const filteredSubHooks = filterHooks(subHooks, filter);
      if (filteredSubHooks.length > 0) {
        filteredHooks.push({...hook, subHooks: filteredSubHooks});
      }
    } else if (hook.id !== null) {
      if (filter.hookIDs.includes(hook.id)) {
        filteredHooks.push(hook);
        filter.matchCount++;
      }
    } else if (isStoreRead(hook)) {
      if (filter.storeReads.includes(filter.storeReadIndex)) {
        filteredHooks.push(hook);
        filter.matchCount++;
      }
      filter.storeReadIndex++;
    }
  }
  return filteredHooks;
}

type Props = {|
  fiberID: number,
  hooks: ChangeDescription['hooks'],
  storeReads?: ChangeDescription['storeReads'],
  state: ChangeDescription['state'],
  displayMode?: 'detailed' | 'compact',
|};

const HookChangeSummary: component(...props: Props) = memo(
  ({hooks, storeReads, fiberID, state, displayMode = 'detailed'}: Props) => {
    const {parseHookNames, toggleParseHookNames, inspectedElement} = useContext(
      InspectedElementContext,
    );
    const store = useContext(StoreContext);

    const [parseHookNamesOptimistic, setParseHookNamesOptimistic] =
      useState<boolean>(parseHookNames);

    useEffect(() => {
      setParseHookNamesOptimistic(parseHookNames);
    }, [inspectedElement?.id, parseHookNames]);

    const handleOnChange = useCallback(() => {
      setParseHookNamesOptimistic(!parseHookNames);
      toggleParseHookNames();
    }, [toggleParseHookNames, parseHookNames]);

    // $FlowFixMe[invalid-compare]
    const element = fiberID !== null ? store.getElementByID(fiberID) : null;
    const hookNames =
      element != null ? getAlreadyLoadedHookNames(element) : null;

    const hookIDs = hooks ?? [];
    const changedStoreReads = storeReads ?? [];
    const changeCount = hookIDs.length + changedStoreReads.length;

    // The inspected hooks are from the element's latest render, which might
    // not have all the hooks that changed in this one. Then there's no list.
    const filteredHooks = useMemo(() => {
      if (!inspectedElement?.hooks) return null;
      const filter: ChangedHooksFilter = {
        hookIDs: hooks ?? [],
        storeReads: storeReads ?? [],
        storeReadIndex: 0,
        matchCount: 0,
      };
      const result = filterHooks(inspectedElement.hooks, filter);
      return filter.matchCount === changeCount ? result : null;
    }, [inspectedElement?.hooks, hooks, storeReads, changeCount]);

    const hookParsingFailed = parseHookNames && hookNames === null;

    if (changeCount === 0) {
      return <span>No hooks changed</span>;
    }

    if (
      inspectedElement?.id !== element?.id ||
      filteredHooks == null ||
      displayMode === 'compact'
    ) {
      const hookNumbers = hookIDs.map(hookID => String(hookID + 1));
      const hookWord = hookNumbers.length === 1 ? '• Hook' : '• Hooks';
      return (
        <>
          {hookNumbers.length > 0 && (
            <div>
              {hookWord} {hookListFormatter.format(hookNumbers)} changed
            </div>
          )}
          {changedStoreReads.length > 0 && (
            <div>
              {changedStoreReads.length === 1
                ? '• Store changed'
                : '• Stores changed'}
            </div>
          )}
        </>
      );
    }

    let toggleTitle: string;
    if (hookParsingFailed) {
      toggleTitle = 'Hook parsing failed';
    } else if (parseHookNamesOptimistic) {
      toggleTitle = 'Parsing hook names ...';
    } else {
      toggleTitle = 'Parse hook names (may be slow)';
    }

    return (
      <div>
        {changeCount > 1 ? '• Hooks changed:' : '• Hook changed:'}
        {(!parseHookNames || hookParsingFailed) && (
          <Toggle
            className={
              hookParsingFailed
                ? styles.ToggleError
                : styles.LoadHookNamesToggle
            }
            isChecked={parseHookNamesOptimistic}
            isDisabled={parseHookNamesOptimistic || hookParsingFailed}
            onChange={handleOnChange}
            title={toggleTitle}>
            <ButtonIcon type="parse-hook-names" />
          </Toggle>
        )}
        {filteredHooks.map((hook, index) => (
          <Hook
            key={`${inspectedElement?.id ?? 'unknown'}-${index}`}
            hook={hook}
            hookNames={hookNames}
          />
        ))}
      </div>
    );
  },
);

export default HookChangeSummary;
