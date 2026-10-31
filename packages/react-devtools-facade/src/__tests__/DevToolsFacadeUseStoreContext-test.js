/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

'use strict';

// The context cases of DevToolsFacade-test.js, with context replaced by
// `use(store)`. See "Context copies" in docs/use-store/COPY_RULES.md.
//
// Cases that use stores are marked `@reactVersion >= 19.3` instead of
// `@gate enableStore`, so DevTools regression runs against older versions of
// React skip them. (A @gate pragma would override @reactVersion.)

let installFacade;
let createTools;
let facade;
let React;
let ReactDOMClient;
let act;
let container;
let createStore;

describe('react-devtools-facade', () => {
  beforeEach(() => {
    jest.resetModules();
    global.IS_REACT_ACT_ENVIRONMENT = true;

    // The hook lives on globalThis, which jsdom shares across tests in this
    // file, so a leftover hook would make installFacade() below throw. Remove
    // it for a clean slate.
    delete globalThis.__REACT_DEVTOOLS_GLOBAL_HOOK__;

    // Install the facade BEFORE React so the hook captures the first commit.
    // Import through the package entry point to exercise the public surface.
    const facadeAPI = require('../../index');
    installFacade = facadeAPI.installFacade;
    createTools = facadeAPI.createTools;
    facade = installFacade();

    React = require('react');
    ReactDOMClient = require('react-dom/client');
    act = React.act;
    createStore = React.unstable_createStore;

    container = document.createElement('div');
  });

  afterEach(() => {
    jest.dontMock('react-debug-tools');
    container = null;
  });

  describe('getComponentByUid', () => {
    let getComponentTree;
    let getComponentByUid;

    beforeEach(() => {
      const tools = createTools(facade);
      getComponentTree = tools.getComponentTree;
      getComponentByUid = tools.getComponentByUid;
    });

    // @reactVersion >= 19.3
    it('captures the useContext hook with its provided value', () => {
      // The Provider's value is the store's initial value.
      const themeStore = createStore('dark');
      function Themed() {
        const theme = React.use(themeStore);
        const [count] = React.useState(0);
        return (
          <div>
            {theme}
            {count}
          </div>
        );
      }
      function App() {
        return <Themed />;
      }

      act(() => {
        ReactDOMClient.createRoot(container).render(<App />);
      });

      const themed = getComponentTree().find(n => n.name === 'Themed');
      const info = getComponentByUid(themed.uid, true);
      // store-semantics: use(store) is captured as a "Store" hook holding the
      // value the component rendered, where useContext is a "Context" hook.
      // Like useContext, it does not consume a primitive hook slot, so its id
      // is null; the following useState is the first primitive hook (id 0).
      expect(info.hooks).toEqual([
        {id: null, name: 'Store', value: 'dark', subHooks: []},
        {id: 0, name: 'State', value: 0, subHooks: []},
      ]);
    });
  });
});
