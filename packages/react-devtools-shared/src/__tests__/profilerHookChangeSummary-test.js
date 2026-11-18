/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

// The "Why did this render?" list of changed hooks. The backend reports the
// ids of the changed hooks, and the positions of the changed store reads among
// the store reads, and the list shows the matching inspected hooks.

import typeof ReactTestRenderer from 'react-test-renderer';
import type {FrontendBridge} from 'react-devtools-shared/src/bridge';
import type Store from 'react-devtools-shared/src/devtools/store';

import {getVersionedRenderImplementation} from './utils';

describe('HookChangeSummary', () => {
  let React;
  let TestRenderer: ReactTestRenderer;
  let bridge: FrontendBridge;
  let store: Store;
  let utils;

  let BridgeContext;
  let HookChangeSummary;
  let InspectedElementContextController;
  let SettingsContextController;
  let StoreContext;
  let TreeContextController;

  let testRendererInstance;

  global.IS_REACT_ACT_ENVIRONMENT = true;

  beforeEach(() => {
    utils = require('./utils');
    utils.beforeEachProfiling();

    bridge = global.bridge;
    store = global.store;
    store.collapseNodesByDefault = false;
    store.recordChangeDescriptions = true;

    React = require('react');
    TestRenderer = utils.requireTestRenderer();

    BridgeContext =
      require('react-devtools-shared/src/devtools/views/context').BridgeContext;
    HookChangeSummary =
      require('react-devtools-shared/src/devtools/views/Profiler/HookChangeSummary').default;
    InspectedElementContextController =
      require('react-devtools-shared/src/devtools/views/Components/InspectedElementContext').InspectedElementContextController;
    SettingsContextController =
      require('react-devtools-shared/src/devtools/views/Settings/SettingsContext').SettingsContextController;
    StoreContext =
      require('react-devtools-shared/src/devtools/views/context').StoreContext;
    TreeContextController =
      require('react-devtools-shared/src/devtools/views/Components/TreeContext').TreeContextController;

    // The toggle that parses hook names has a tooltip, which warns when its
    // styles aren't loaded.
    document.body.style.setProperty('--reach-tooltip', '1');

    utils.act(() => {
      testRendererInstance = TestRenderer.create(null, {
        unstable_isConcurrent: true,
      });
    });
  });

  const {render} = getVersionedRenderImplementation();

  // Returns the change description of the only component that rendered in
  // each commit, and the component's id.
  function getChangeDescriptions() {
    const rootID = store.roots[0];
    return store.profilerStore
      .getDataForRoot(rootID)
      .commitData.map(commitData => {
        const entries = Array.from(commitData.changeDescriptions.entries());
        expect(entries).toHaveLength(1);
        return entries[0];
      });
  }

  function getText(node): string {
    if (node == null || typeof node === 'boolean') {
      return '';
    }
    if (typeof node === 'string') {
      return node;
    }
    if (Array.isArray(node)) {
      return node.map(getText).join('');
    }
    return getText(node.children);
  }

  // The summary as lines: the heading, then one line per hook in the list,
  // indented by depth.
  function getLines(node, depth: number = 0, lines: Array<string> = []) {
    if (node == null || typeof node === 'boolean') {
      return lines;
    }
    if (typeof node === 'string') {
      lines.push(node);
      return lines;
    }
    if (Array.isArray(node)) {
      node.forEach(child => getLines(child, depth, lines));
      return lines;
    }
    if (node.type === 'li') {
      const children = node.children || [];
      const text = children
        .filter(child => child.type === 'span')
        .map(getText)
        .join(' ');
      lines.push('  '.repeat(depth) + text);
      children
        .filter(child => child.type !== 'span')
        .forEach(child => getLines(child, depth + 1, lines));
      return lines;
    }
    if (node.type === 'button') {
      // The toggle that parses hook names.
      return lines;
    }
    return getLines(node.children, depth, lines);
  }

  async function renderSummary(
    [fiberID, changeDescription],
    displayMode = 'detailed',
  ) {
    await utils.actAsync(() => {
      testRendererInstance.update(
        <BridgeContext.Provider value={bridge}>
          <StoreContext.Provider value={store}>
            <SettingsContextController>
              <TreeContextController defaultInspectedElementID={fiberID}>
                <InspectedElementContextController>
                  <React.Suspense fallback={null}>
                    <HookChangeSummary
                      fiberID={fiberID}
                      hooks={changeDescription.hooks}
                      storeReads={changeDescription.storeReads}
                      state={changeDescription.state}
                      displayMode={displayMode}
                    />
                  </React.Suspense>
                </InspectedElementContextController>
              </TreeContextController>
            </SettingsContextController>
          </StoreContext.Provider>
        </BridgeContext.Provider>,
      );
    }, false);
    return testRendererInstance.toJSON();
  }

  // @reactVersion >= 18.0
  it('names the state hook that changed after a context', async () => {
    const Context = React.createContext(0);
    let setState = null;
    function Component() {
      React.useContext(Context);
      let state;
      [state, setState] = React.useState('a');
      return state;
    }

    await utils.actAsync(() => render(<Component />));
    // inspectHooks() re-runs the component with a mock dispatcher, which
    // overwrites setState, so read it before profiling starts.
    const realSetState = setState;

    utils.act(() => store.profilerStore.startProfiling());
    utils.act(() => realSetState('b'));
    utils.act(() => store.profilerStore.stopProfiling());

    const [description] = getChangeDescriptions();
    expect(getLines(await renderSummary(description))).toEqual([
      '• Hook changed:',
      '1 State',
    ]);
    expect(getText(await renderSummary(description, 'compact'))).toBe(
      '• Hook 1 changed',
    );
  });

  // @reactVersion >= 19.3
  it('names the store read or the state hook that changed', async () => {
    const countStore = React.unstable_createStore(1);
    let setState = null;
    function Component() {
      const count = React.use(countStore);
      let state;
      [state, setState] = React.useState('a');
      return state + count;
    }

    await utils.actAsync(() => render(<Component />));
    const realSetState = setState;

    utils.act(() => store.profilerStore.startProfiling());
    utils.act(() => countStore.update(2));
    utils.act(() => realSetState('b'));
    utils.act(() => store.profilerStore.stopProfiling());

    const [storeChange, stateChange] = getChangeDescriptions();
    expect(getLines(await renderSummary(storeChange))).toEqual([
      '• Hook changed:',
      'Store',
    ]);
    expect(getText(await renderSummary(storeChange, 'compact'))).toBe(
      '• Store changed',
    );
    expect(getLines(await renderSummary(stateChange))).toEqual([
      '• Hook changed:',
      '1 State',
    ]);
  });

  // @reactVersion >= 19.3
  it('names a store read in a custom hook', async () => {
    const countStore = React.unstable_createStore(1);
    function useCount() {
      return React.use(countStore);
    }
    let setState = null;
    function Component() {
      let state;
      [state, setState] = React.useState('a');
      return state + useCount();
    }

    await utils.actAsync(() => render(<Component />));
    const realSetState = setState;

    utils.act(() => store.profilerStore.startProfiling());
    utils.act(() => countStore.update(2));
    utils.act(() => realSetState('b'));
    utils.act(() => store.profilerStore.stopProfiling());

    const [storeChange, stateChange] = getChangeDescriptions();
    expect(getLines(await renderSummary(storeChange))).toEqual([
      '• Hook changed:',
      'Count',
      '  Store',
    ]);
    expect(getLines(await renderSummary(stateChange))).toEqual([
      '• Hook changed:',
      '1 State',
    ]);
  });

  // @reactVersion >= 19.3
  it('names the store read that changed among reads of other stores', async () => {
    const storeA = React.unstable_createStore(1);
    const storeB = React.unstable_createStore(2);
    function Component() {
      return React.use(storeA) + React.use(storeB);
    }

    await utils.actAsync(() => render(<Component />));

    utils.act(() => store.profilerStore.startProfiling());
    utils.act(() => storeB.update(3));
    utils.act(() => store.profilerStore.stopProfiling());

    const [[fiberID, description]] = getChangeDescriptions();
    expect(description.storeReads).toEqual([1]);
    expect(getLines(await renderSummary([fiberID, description]))).toEqual([
      '• Hook changed:',
      'Store',
    ]);
    // A change that isn't in the inspected hooks shows the summary instead of
    // naming a hook.
    expect(
      getText(
        await renderSummary([fiberID, {...description, storeReads: [2]}]),
      ),
    ).toBe('• Store changed');
  });
});
