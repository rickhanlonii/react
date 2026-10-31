/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

// The context cases of inspectedElement-test.js, with context replaced by
// `use(store)`. See "Context copies" in docs/use-store/COPY_RULES.md.
//
// Cases that use stores are marked `@reactVersion >= 19.3` instead of
// `@gate enableStore`, so DevTools regression runs against older versions of
// React skip them. (A @gate pragma would override @reactVersion.)

import typeof ReactTestRenderer from 'react-test-renderer';
import {
  getLegacyRenderImplementation,
  getModernRenderImplementation,
} from 'react-devtools-shared/src/__tests__/utils';

import type {FrontendBridge} from 'react-devtools-shared/src/bridge';
import type Store from 'react-devtools-shared/src/devtools/store';

describe('InspectedElement', () => {
  let React;
  let createStore;
  let TestRenderer: ReactTestRenderer;
  let bridge: FrontendBridge;
  let store: Store;
  let utils;

  let BridgeContext;
  let InspectedElementContext;
  let InspectedElementContextController;
  let SettingsContextController;
  let StoreContext;
  let TreeContextController;

  let testRendererInstance;

  let ErrorBoundary;

  global.IS_REACT_ACT_ENVIRONMENT = true;

  beforeEach(() => {
    utils = require('./utils');
    utils.beforeEachProfiling();

    bridge = global.bridge;
    store = global.store;
    store.collapseNodesByDefault = false;

    React = require('react');
    createStore = React.unstable_createStore;
    TestRenderer = utils.requireTestRenderer();

    BridgeContext =
      require('react-devtools-shared/src/devtools/views/context').BridgeContext;
    InspectedElementContext =
      require('react-devtools-shared/src/devtools/views/Components/InspectedElementContext').InspectedElementContext;
    InspectedElementContextController =
      require('react-devtools-shared/src/devtools/views/Components/InspectedElementContext').InspectedElementContextController;
    SettingsContextController =
      require('react-devtools-shared/src/devtools/views/Settings/SettingsContext').SettingsContextController;
    StoreContext =
      require('react-devtools-shared/src/devtools/views/context').StoreContext;
    TreeContextController =
      require('react-devtools-shared/src/devtools/views/Components/TreeContext').TreeContextController;

    // Used by inspectElementAtIndex() helper function
    utils.act(() => {
      testRendererInstance = TestRenderer.create(null, {
        unstable_isConcurrent: true,
      });
    });

    ErrorBoundary = class extends React.Component {
      state = {error: null};
      componentDidCatch(error) {
        this.setState({error});
      }
      render() {
        if (this.state.error) {
          return null;
        }
        return this.props.children;
      }
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  const {render: legacyRender} = getLegacyRenderImplementation();
  const {render: modernRender} = getModernRenderImplementation();

  const Contexts = ({
    children,
    defaultInspectedElementID = null,
    defaultInspectedElementIndex = null,
  }) => (
    <BridgeContext.Provider value={bridge}>
      <StoreContext.Provider value={store}>
        <SettingsContextController>
          <TreeContextController
            defaultInspectedElementID={defaultInspectedElementID}
            defaultInspectedElementIndex={defaultInspectedElementIndex}>
            <InspectedElementContextController>
              {children}
            </InspectedElementContextController>
          </TreeContextController>
        </SettingsContextController>
      </StoreContext.Provider>
    </BridgeContext.Provider>
  );

  function useInspectedElement() {
    const {inspectedElement} = React.useContext(InspectedElementContext);
    return inspectedElement;
  }

  function noop() {}

  async function inspectElementAtIndex(
    index,
    useCustomHook = noop,
    shouldThrow = false,
  ) {
    let didFinish = false;
    let inspectedElement = null;

    function Suspender() {
      useCustomHook();
      inspectedElement = useInspectedElement();
      didFinish = true;
      return null;
    }

    const id = ((store.getElementIDAtIndex(index): any): number);

    await utils.actAsync(() => {
      testRendererInstance.update(
        <ErrorBoundary>
          <Contexts
            defaultInspectedElementID={id}
            defaultInspectedElementIndex={index}>
            <React.Suspense fallback={null}>
              <Suspender id={id} index={index} />
            </React.Suspense>
          </Contexts>
        </ErrorBoundary>,
      );
    }, false);

    if (!shouldThrow) {
      expect(didFinish).toBe(true);
    }

    return inspectedElement;
  }

  // TODO(hoxyq): Enable this test for versions ~18, currently broken
  // @reactVersion <= 18.2
  // @reactVersion >= 19.3
  // eslint-disable-next-line jest/no-disabled-tests
  it.skip('should inspect hooks for components that only use context (legacy render)', async () => {
    const valueStore = createStore(true);
    const Example = () => {
      const value = React.use(valueStore);
      return value;
    };

    await utils.actAsync(() => legacyRender(<Example a={1} b="abc" />));

    const inspectedElement = await inspectElementAtIndex(0);
    // store-semantics: a store read shows up as a hook named "Store", the way
    // a context read is named after the context ("Context" by default).
    expect(inspectedElement).toMatchInlineSnapshot(`
      {
        "context": null,
        "events": undefined,
        "hooks": [
          {
            "debugInfo": null,
            "hookSource": {
              "columnNumber": "removed by Jest serializer",
              "fileName": "react-devtools-shared/src/__tests__/inspectedElementUseStoreContext-test.js",
              "functionName": "Example",
              "lineNumber": "removed by Jest serializer",
            },
            "id": null,
            "isStateEditable": false,
            "name": "Store",
            "subHooks": [],
            "value": true,
          },
        ],
        "id": 2,
        "owners": null,
        "props": {
          "a": 1,
          "b": "abc",
        },
        "rootType": "render()",
        "state": null,
      }
    `);
  });

  // @reactVersion >= 19.3
  it('should inspect hooks for components that only use context (createRoot)', async () => {
    const valueStore = createStore(true);
    const Example = () => {
      const value = React.use(valueStore);
      return value;
    };

    await utils.actAsync(() => modernRender(<Example a={1} b="abc" />));

    const inspectedElement = await inspectElementAtIndex(0);
    // store-semantics: a store read shows up as a hook named "Store", the way
    // a context read is named after the context ("Context" by default).
    expect(inspectedElement).toMatchInlineSnapshot(`
      {
        "context": null,
        "events": undefined,
        "hooks": [
          {
            "debugInfo": null,
            "hookSource": {
              "columnNumber": "removed by Jest serializer",
              "fileName": "react-devtools-shared/src/__tests__/inspectedElementUseStoreContext-test.js",
              "functionName": "Example",
              "lineNumber": "removed by Jest serializer",
            },
            "id": null,
            "isStateEditable": false,
            "name": "Store",
            "subHooks": [],
            "value": true,
          },
        ],
        "id": 2,
        "owners": null,
        "props": {
          "a": 1,
          "b": "abc",
        },
        "rootType": "createRoot()",
        "state": null,
      }
    `);
  });
});
