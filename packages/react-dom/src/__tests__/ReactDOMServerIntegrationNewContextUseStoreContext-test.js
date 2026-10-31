/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 * @jest-environment ./scripts/jest/ReactDOMServerIntegrationEnvironment
 */

'use strict';

// The context cases of ReactDOMServerIntegrationNewContext-test.js, with
// context replaced by `use(store)`. See "Context copies" in
// docs/use-store/COPY_RULES.md.
//
// The server renders, and the client hydrates with, the value a store was
// created with, so a constant Provider value becomes the store's initial value.

const ReactDOMServerIntegrationUtils = require('./utils/ReactDOMServerIntegrationTestUtils');

let React;
let ReactDOMClient;
let ReactDOMServer;
let use;
let createStore;

function initModules() {
  // Reset warning cache.
  jest.resetModules();
  React = require('react');
  ReactDOMClient = require('react-dom/client');
  ReactDOMServer = require('react-dom/server');
  use = React.use;
  createStore = React.unstable_createStore;

  // Make them available to the helpers.
  return {
    ReactDOMClient,
    ReactDOMServer,
  };
}

const {resetModules, itRenders} = ReactDOMServerIntegrationUtils(initModules);

// The itRenders helpers call `it` themselves, so a @gate pragma doesn't reach
// them. Store cases register them inside gated() instead, which gates every
// test they generate the way @gate does.
function gated(gateFn, register) {
  const originalIt = global.it;
  global.it = (name, fn, timeout) =>
    global._test_gate(flags => gateFn(flags, name), name, fn, timeout);
  try {
    register();
  } finally {
    global.it = originalIt;
  }
}

const enableStore = flags => flags.enableStore;

describe('ReactDOMServerIntegration', () => {
  beforeEach(() => {
    resetModules();
  });

  describe('context', function () {
    // <Context.Consumer> becomes a function component that reads the store
    // and calls its render prop.
    function createConsumer(store) {
      return function Consumer(props) {
        return props.children(use(store));
      };
    }

    gated(enableStore, () => {
      itRenders('class child with context', async render => {
        // The Provider's value ('purple') is the store's initial value.
        const store = createStore('purple');
        const Consumer = createConsumer(store);

        class ClassChildWithContext extends React.Component {
          render() {
            return (
              <div>
                <Consumer>{text => text}</Consumer>
              </div>
            );
          }
        }

        const e = await render(<ClassChildWithContext />);
        expect(e.textContent).toBe('purple');
      });
    });

    gated(enableStore, () => {
      itRenders('stateless child with context', async render => {
        const store = createStore('purple');
        const Consumer = createConsumer(store);

        function FunctionChildWithContext(props) {
          return <Consumer>{text => text}</Consumer>;
        }

        const e = await render(<FunctionChildWithContext />);
        expect(e.textContent).toBe('purple');
      });
    });

    gated(enableStore, () => {
      itRenders('class child with default context', async render => {
        // There's no Provider, so the reader gets the default value, which is
        // the store's initial value.
        const store = createStore('none');
        const Consumer = createConsumer(store);

        class ClassChildWithWrongContext extends React.Component {
          render() {
            return (
              <div id="classWrongChild">
                <Consumer>{text => text}</Consumer>
              </div>
            );
          }
        }

        const e = await render(<ClassChildWithWrongContext />);
        expect(e.textContent).toBe('none');
      });
    });

    gated(enableStore, () => {
      itRenders('stateless child with wrong context', async render => {
        const store = createStore('none');
        const Consumer = createConsumer(store);

        function FunctionChildWithWrongContext(props) {
          return (
            <div id="statelessWrongChild">
              <Consumer>{text => text}</Consumer>
            </div>
          );
        }

        const e = await render(<FunctionChildWithWrongContext />);
        expect(e.textContent).toBe('none');
      });
    });

    gated(enableStore, () => {
      itRenders('with context passed through to a grandchild', async render => {
        const store = createStore('purple');
        const Consumer = createConsumer(store);

        function Grandchild(props) {
          return (
            <div>
              <Consumer>{text => text}</Consumer>
            </div>
          );
        }

        const Child = props => <Grandchild />;

        const e = await render(<Child />);
        expect(e.textContent).toBe('purple');
      });
    });

    gated(enableStore, () => {
      itRenders('multiple contexts', async render => {
        // Each Provider has a constant value, so each context becomes a store
        // created with that value.
        const themeStore = createStore('light');
        const languageStore = createStore('english');
        const ThemeConsumer = createConsumer(themeStore);
        const LanguageConsumer = createConsumer(languageStore);

        class Parent extends React.Component {
          render() {
            return <Child />;
          }
        }

        function Child() {
          return <Grandchild />;
        }

        const Grandchild = props => {
          return (
            <div>
              <ThemeConsumer>
                {theme => <div id="theme">{theme}</div>}
              </ThemeConsumer>
              <LanguageConsumer>
                {language => <div id="language">{language}</div>}
              </LanguageConsumer>
            </div>
          );
        };

        const e = await render(<Parent />);
        expect(e.querySelector('#theme').textContent).toBe('light');
        expect(e.querySelector('#language').textContent).toBe('english');
      });
    });

    // @gate enableStore
    it('does not pollute sync renders after an error', () => {
      // The original checks that the value a Provider set in a render that
      // threw doesn't leak into the next render. A store has no per-render
      // value on the server, but a render that read the store and then threw
      // must not break the next render that reads it.
      const userStore = createStore('default');
      const LoggedInUser = createConsumer(userStore);
      const Crash = () => {
        throw new Error('Boo!');
      };
      const AppWithUser = () => (
        <>
          <LoggedInUser>{whoAmI => whoAmI}</LoggedInUser>
          <Crash />
        </>
      );

      expect(() => {
        ReactDOMServer.renderToString(AppWithUser());
      }).toThrow('Boo');

      // Should not report a value from failed render
      expect(
        ReactDOMServer.renderToString(
          <LoggedInUser>{whoAmI => whoAmI}</LoggedInUser>,
        ),
      ).toBe('default');
    });
  });
});
