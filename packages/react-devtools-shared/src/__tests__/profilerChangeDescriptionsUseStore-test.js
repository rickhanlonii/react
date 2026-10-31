/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

// Cases that use stores are marked `@reactVersion >= 19.3` instead of
// `@gate enableStore`, so DevTools regression runs against older versions of
// React skip them. (A @gate pragma would override @reactVersion.)

import {getVersionedRenderImplementation} from './utils';

describe('Profiler change descriptions', () => {
  let React;
  let store;
  let utils;
  let createStore;
  let use;

  beforeEach(() => {
    utils = require('./utils');
    utils.beforeEachProfiling();

    store = global.store;
    store.collapseNodesByDefault = false;
    store.recordChangeDescriptions = true;

    React = require('react');
    createStore = React.unstable_createStore;
    use = React.use;
  });

  const {render} = getVersionedRenderImplementation();

  // @reactVersion >=18.0
  // @reactVersion >= 19.3
  it('should identify useContext as the cause for a re-render', () => {
    const Context = React.createContext(0);

    function Child() {
      const context = React.useContext(Context);
      return context;
    }

    function areEqual() {
      return true;
    }

    const MemoizedChild = React.memo(Child, areEqual);
    const ForwardRefChild = React.forwardRef(
      function RefForwardingComponent(props, ref) {
        return <Child />;
      },
    );

    const valStore = createStore(0, x => x + 1);
    const forceUpdate = valStore.update;

    const App = function App() {
      const val = use(valStore);

      return (
        <Context.Provider value={val}>
          <Child />
          <MemoizedChild />
          <ForwardRefChild />
        </Context.Provider>
      );
    };

    utils.act(() => store.profilerStore.startProfiling());
    utils.act(() => render(<App />));
    utils.act(() => forceUpdate());
    utils.act(() => store.profilerStore.stopProfiling());

    const rootID = store.roots[0];
    const commitData = store.profilerStore.getCommitData(rootID, 1);

    expect(store).toMatchInlineSnapshot(`
      [root]
        ▾ <App>
          ▾ <Context.Provider>
              <Child>
            ▾ <Child> [Memo]
                <Child>
            ▾ <RefForwardingComponent> [ForwardRef]
                <Child>
    `);

    let element = store.getElementAtIndex(2);
    expect(element.displayName).toBe('Child');
    expect(element.hocDisplayNames).toBeNull();
    expect(commitData.changeDescriptions.get(element.id))
      .toMatchInlineSnapshot(`
      {
        "context": true,
        "didHooksChange": false,
        "hooks": [],
        "isFirstMount": false,
        "props": [],
        "state": null,
      }
    `);

    element = store.getElementAtIndex(3);
    expect(element.displayName).toBe('Child');
    expect(element.hocDisplayNames).toEqual(['Memo']);
    expect(commitData.changeDescriptions.get(element.id)).toBeUndefined();

    element = store.getElementAtIndex(4);
    expect(element.displayName).toBe('Child');
    expect(element.hocDisplayNames).toBeNull();
    expect(commitData.changeDescriptions.get(element.id))
      .toMatchInlineSnapshot(`
      {
        "context": true,
        "didHooksChange": false,
        "hooks": [],
        "isFirstMount": false,
        "props": [],
        "state": null,
      }
    `);

    element = store.getElementAtIndex(5);
    expect(element.displayName).toBe('RefForwardingComponent');
    expect(element.hocDisplayNames).toEqual(['ForwardRef']);
    expect(commitData.changeDescriptions.get(element.id))
      .toMatchInlineSnapshot(`
      {
        "context": false,
        "didHooksChange": false,
        "hooks": [],
        "isFirstMount": false,
        "props": [],
        "state": null,
      }
    `);

    element = store.getElementAtIndex(6);
    expect(element.displayName).toBe('Child');
    expect(element.hocDisplayNames).toBeNull();
    expect(commitData.changeDescriptions.get(element.id))
      .toMatchInlineSnapshot(`
      {
        "context": true,
        "didHooksChange": false,
        "hooks": [],
        "isFirstMount": false,
        "props": [],
        "state": null,
      }
    `);
  });
});
