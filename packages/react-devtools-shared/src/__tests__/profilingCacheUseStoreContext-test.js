/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

// The context cases of profilingCache-test.js, with context replaced by
// `use(store)`. See "Context copies" in docs/use-store/COPY_RULES.md.
//
// Cases that use stores are marked `@reactVersion >= 19.3` instead of
// `@gate enableStore`, so DevTools regression runs against older versions of
// React skip them. (A @gate pragma would override @reactVersion.)

import type {FrontendBridge} from 'react-devtools-shared/src/bridge';
import type Store from 'react-devtools-shared/src/devtools/store';

import {getVersionedRenderImplementation} from './utils';

describe('ProfilingCache', () => {
  let React;
  let bridge: FrontendBridge;
  let store: Store;
  let utils;
  let createStore;
  let use;

  beforeEach(() => {
    utils = require('./utils');
    utils.beforeEachProfiling();

    bridge = global.bridge;
    store = global.store;
    store.collapseNodesByDefault = false;
    store.recordChangeDescriptions = true;

    React = require('react');
    createStore = React.unstable_createStore;
    use = React.use;
  });

  const {render, getContainer} = getVersionedRenderImplementation();

  // @reactVersion >= 19.3
  it('should properly detect changed hooks', () => {
    // The Provider's first value is the store's initial value.
    const contextStore = createStore(true);

    function reducer(state, action) {
      switch (action.type) {
        case 'invert':
          return {value: !state.value};
        default:
          throw new Error();
      }
    }

    let snapshot = 0;
    function getServerSnapshot() {
      return snapshot;
    }
    function getClientSnapshot() {
      return snapshot;
    }

    let syncExternalStoreCallback;
    function subscribe(callback) {
      syncExternalStoreCallback = callback;
    }

    let dispatch = null;
    let setState = null;

    const Component = ({count, string}) => {
      // These hooks may change and initiate re-renders.
      setState = React.useState('abc')[1];
      dispatch = React.useReducer(reducer, {value: true})[1];
      React.useSyncExternalStore(
        subscribe,
        getClientSnapshot,
        getServerSnapshot,
      );

      // This hook's return value may change between renders,
      // but the hook itself isn't stateful.
      use(contextStore);

      // These hooks never change in a way that schedules an update.
      React.useCallback(() => () => {}, [string]);
      React.useMemo(() => string, [string]);
      React.useCallback(() => () => {}, [count]);
      React.useMemo(() => count, [count]);
      React.useCallback(() => () => {});
      React.useMemo(() => string);

      // These hooks never change in a way that schedules an update.
      React.useEffect(() => {}, [string]);
      React.useLayoutEffect(() => {}, [string]);
      React.useEffect(() => {}, [count]);
      React.useLayoutEffect(() => {}, [count]);
      React.useEffect(() => {});
      React.useLayoutEffect(() => {});

      return null;
    };

    utils.act(() => store.profilerStore.startProfiling());
    utils.act(() => render(<Component count={1} />));

    // Save references to the real dispatch/setState functions.
    // inspectHooks() re-runs the component with a mock dispatcher,
    // which would overwrite these variables with mock functions that do nothing.
    const realDispatch = dispatch;
    const realSetState = setState;

    // Second render has no changed hooks, only changed props.
    utils.act(() => render(<Component count={2} />));

    // Third render has a changed reducer hook.
    utils.act(() => realDispatch({type: 'invert'}));

    // Fourth render has a changed state hook.
    utils.act(() => realSetState('def'));

    // Fifth render has a changed context value, but no changed hook.
    utils.act(() => contextStore.update(false));

    // 6th renderer is triggered by a sync external store change.
    utils.act(() => {
      snapshot++;
      syncExternalStoreCallback();
    });

    utils.act(() => store.profilerStore.stopProfiling());

    const rootID = store.roots[0];

    const changeDescriptions = store.profilerStore
      .getDataForRoot(rootID)
      .commitData.map(commitData => commitData.changeDescriptions);
    expect(changeDescriptions).toHaveLength(6);

    // store-semantics: there's no <Context.Provider> in the tree, so the
    // component's element id is 2 instead of 3.

    // 1st render: No change
    expect(changeDescriptions[0]).toMatchInlineSnapshot(`
      Map {
        2 => {
          "context": null,
          "didHooksChange": false,
          "isFirstMount": true,
          "props": null,
          "state": null,
        },
      }
    `);

    // 2nd render: Changed props
    expect(changeDescriptions[1]).toMatchInlineSnapshot(`
      Map {
        2 => {
          "context": false,
          "didHooksChange": false,
          "hooks": [],
          "isFirstMount": false,
          "props": [
            "count",
          ],
          "state": null,
        },
      }
    `);

    // 3rd render: Changed useReducer
    expect(changeDescriptions[2]).toMatchInlineSnapshot(`
      Map {
        2 => {
          "context": false,
          "didHooksChange": true,
          "hooks": [
            1,
          ],
          "isFirstMount": false,
          "props": [],
          "state": null,
        },
      }
    `);

    // 4th render: Changed useState
    expect(changeDescriptions[3]).toMatchInlineSnapshot(`
      Map {
        2 => {
          "context": false,
          "didHooksChange": true,
          "hooks": [
            0,
          ],
          "isFirstMount": false,
          "props": [],
          "state": null,
        },
      }
    `);

    // 5th render: Changed context
    // store-semantics: a store read is reported as a changed "Store" hook
    // (B-16), not as a context change. It's the fourth hook node.
    expect(changeDescriptions[4]).toMatchInlineSnapshot(`
      Map {
        2 => {
          "context": false,
          "didHooksChange": true,
          "hooks": [
            3,
          ],
          "isFirstMount": false,
          "props": [],
          "state": null,
        },
      }
    `);

    // 6th render: Sync external store
    expect(changeDescriptions[5]).toMatchInlineSnapshot(`
      Map {
        2 => {
          "context": false,
          "didHooksChange": true,
          "hooks": [
            2,
          ],
          "isFirstMount": false,
          "props": [],
          "state": null,
        },
      }
    `);

    expect(changeDescriptions).toHaveLength(6);

    // Export and re-import profile data and make sure it is retained.
    utils.exportImportHelper(bridge, store);

    for (let commitIndex = 0; commitIndex < 6; commitIndex++) {
      const commitData = store.profilerStore.getCommitData(rootID, commitIndex);
      expect(commitData.changeDescriptions).toEqual(
        changeDescriptions[commitIndex],
      );
    }
  });

  // @gate enableStore
  it('should detect context changes or lack of changes with conditional use()', () => {
    // The Providers' first values are the stores' initial values.
    const storeA = createStore(1);
    const storeB = createStore(1);
    let setState = null;

    const Component = () => {
      // These hooks may change and initiate re-renders.
      let state;
      [state, setState] = React.useState('abc');

      let result = state;

      if (state.includes('a')) {
        result += React.use(storeA);
      }

      result += React.use(storeB);

      return result;
    };

    utils.act(() => render(<Component />));

    // Save reference to the real setState function before profiling starts.
    // inspectHooks() re-runs the component with a mock dispatcher,
    // which would overwrite setState with a mock function that does nothing.
    const realSetState = setState;

    utils.act(() => store.profilerStore.startProfiling());

    // First render changes Context.
    utils.act(() => storeA.update(0));

    // Second render has no changed Context, only changed state.
    utils.act(() => realSetState('def'));

    utils.act(() => store.profilerStore.stopProfiling());

    const rootID = store.roots[0];

    const changeDescriptions = store.profilerStore
      .getDataForRoot(rootID)
      .commitData.map(commitData => commitData.changeDescriptions);
    expect(changeDescriptions).toHaveLength(2);

    // store-semantics: there are no Providers in the tree, so the component's
    // element id is 2 instead of 4.

    // 1st render: Change to Context
    // store-semantics: a store read is reported as a changed "Store" hook
    // (B-16), not as a context change. storeA is the second hook node.
    expect(changeDescriptions[0]).toMatchInlineSnapshot(`
      Map {
        2 => {
          "context": false,
          "didHooksChange": true,
          "hooks": [
            1,
          ],
          "isFirstMount": false,
          "props": [],
          "state": null,
        },
      }
    `);

    // 2nd render: Change to State
    expect(changeDescriptions[1]).toMatchInlineSnapshot(`
      Map {
        2 => {
          "context": false,
          "didHooksChange": true,
          "hooks": [
            0,
          ],
          "isFirstMount": false,
          "props": [],
          "state": null,
        },
      }
    `);

    expect(changeDescriptions).toHaveLength(2);

    // Export and re-import profile data and make sure it is retained.
    utils.exportImportHelper(bridge, store);

    for (let commitIndex = 0; commitIndex < 2; commitIndex++) {
      const commitData = store.profilerStore.getCommitData(rootID, commitIndex);
      expect(commitData.changeDescriptions).toEqual(
        changeDescriptions[commitIndex],
      );
    }
  });

  // @reactVersion >= 19.3
  it('should not crash during route transitions with Suspense', () => {
    // The Router's state, which it provided to the routes, is the store.
    const pathStore = createStore('/');

    // <RouterContext.Consumer> becomes a function component that reads the
    // store and calls its render prop.
    function RouterConsumer({children}) {
      return children(use(pathStore));
    }

    function App() {
      return (
        <Router>
          <Switch>
            <Route path="/">
              <Home />
            </Route>
            <Route path="/about">
              <About />
            </Route>
          </Switch>
        </Router>
      );
    }

    const Home = () => {
      return (
        <React.Suspense>
          <Link path="/about">Home</Link>
        </React.Suspense>
      );
    };

    const About = () => <div>About</div>;

    // Mimics https://github.com/ReactTraining/react-router/blob/master/packages/react-router/modules/Router.js
    function Router({children}) {
      return children;
    }

    // Mimics https://github.com/ReactTraining/react-router/blob/master/packages/react-router/modules/Switch.js
    function Switch({children}) {
      return (
        <RouterConsumer>
          {path => {
            let element = null;
            React.Children.forEach(children, child => {
              if (path === child.props.path) {
                element = child.props.children;
              }
            });
            return element ? React.cloneElement(element) : null;
          }}
        </RouterConsumer>
      );
    }

    // Mimics https://github.com/ReactTraining/react-router/blob/master/packages/react-router/modules/Route.js
    function Route({children, path}) {
      return null;
    }

    const linkRef = React.createRef();

    // Mimics https://github.com/ReactTraining/react-router/blob/master/packages/react-router-dom/modules/Link.js
    function Link({children, path}) {
      return (
        <button ref={linkRef} onClick={() => pathStore.update(path)}>
          {children}
        </button>
      );
    }

    utils.act(() => render(<App />));
    expect(getContainer().textContent).toBe('Home');
    utils.act(() => store.profilerStore.startProfiling());
    utils.act(() =>
      linkRef.current.dispatchEvent(
        new MouseEvent('click', {bubbles: true, cancelable: true}),
      ),
    );
    utils.act(() => store.profilerStore.stopProfiling());
    expect(getContainer().textContent).toBe('About');
  });
});
