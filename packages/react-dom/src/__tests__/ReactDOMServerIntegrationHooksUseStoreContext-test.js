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

// The context cases of ReactDOMServerIntegrationHooks-test.js, with context
// replaced by `use(store)`. See "Context copies" in
// docs/use-store/COPY_RULES.md.

const ReactDOMServerIntegrationUtils = require('./utils/ReactDOMServerIntegrationTestUtils');

let React;
let ReactDOMClient;
let ReactDOMServer;
let use;
let createStore;
let yieldedValues;
let yieldValue;
let clearLog;

function initModules() {
  // Reset warning cache.
  jest.resetModules();

  React = require('react');
  ReactDOMClient = require('react-dom/client');
  ReactDOMServer = require('react-dom/server');
  use = React.use;
  createStore = React.unstable_createStore;

  yieldedValues = [];
  yieldValue = value => {
    yieldedValues.push(value);
  };
  clearLog = () => {
    const ret = yieldedValues;
    yieldedValues = [];
    return ret;
  };

  // Make them available to the helpers.
  return {
    ReactDOMClient,
    ReactDOMServer,
  };
}

const {
  resetModules,
  itRenders,
  itThrowsWhenRendering,
  clientRenderOnBadMarkup,
} = ReactDOMServerIntegrationUtils(initModules);

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

describe('ReactDOMServerHooks', () => {
  beforeEach(() => {
    resetModules();
  });

  function Text(props) {
    yieldValue(props.text);
    return <span>{props.text}</span>;
  }

  describe('useContext', () => {
    gated(enableStore, () => {
      itThrowsWhenRendering(
        'if used inside a class component',
        async render => {
          const store = createStore([0]);
          class Counter extends React.Component {
            render() {
              const [count] = use(store);
              return <Text text={count} />;
            }
          }

          return render(<Counter />);
        },
        'Invalid hook call. Hooks can only be called inside of the body of a function component. This could happen for' +
          ' one of the following reasons:\n' +
          '1. You might have mismatching versions of React and the renderer (such as React DOM)\n' +
          '2. You might be breaking the Rules of Hooks\n' +
          '3. You might have more than one copy of React in the same app\n' +
          'See https://react.dev/link/invalid-hook-call for tips about how to debug and fix this problem.',
      );
    });
  });

  gated(enableStore, () => {
    itRenders(
      'can use the same context multiple times in the same function',
      async render => {
        // The Provider's value is constant for the render, so it's the
        // store's initial value.
        const store = createStore({foo: 1, bar: 3, baz: 5});

        function FooAndBar() {
          const {foo} = use(store);
          const {bar} = use(store);
          return <Text text={`Foo: ${foo}, Bar: ${bar}`} />;
        }

        function Baz() {
          const {baz} = use(store);
          return <Text text={'Baz: ' + baz} />;
        }

        class Indirection extends React.Component {
          render() {
            return this.props.children;
          }
        }

        function App(props) {
          return (
            <div>
              <Indirection>
                <Indirection>
                  <FooAndBar />
                </Indirection>
                <Indirection>
                  <Baz />
                </Indirection>
              </Indirection>
            </div>
          );
        }

        const domNode = await render(<App />);
        expect(clearLog()).toEqual(['Foo: 1, Bar: 3', 'Baz: 5']);
        expect(domNode.childNodes.length).toBe(2);
        expect(domNode.firstChild.tagName).toEqual('SPAN');
        expect(domNode.firstChild.textContent).toEqual('Foo: 1, Bar: 3');
        expect(domNode.lastChild.tagName).toEqual('SPAN');
        expect(domNode.lastChild.textContent).toEqual('Baz: 5');
      },
    );
  });

  describe('readContext', () => {
    gated(enableStore, () => {
      itRenders(
        'with a warning inside useMemo and useReducer',
        async render => {
          const store = createStore(42);

          function ReadInMemo(props) {
            const count = React.useMemo(() => use(store), []);
            return <Text text={count} />;
          }

          function ReadInReducer(props) {
            const [count, dispatch] = React.useReducer(() => use(store));
            if (count !== 42) {
              dispatch();
            }
            return <Text text={count} />;
          }

          const domNode1 = await render(
            <ReadInMemo />,
            render === clientRenderOnBadMarkup
              ? // On hydration mismatch we retry and therefore log the warning again.
                2
              : 1,
          );
          expect(domNode1.textContent).toEqual('42');

          const domNode2 = await render(<ReadInReducer />, 1);
          expect(domNode2.textContent).toEqual('42');
        },
      );
    });
  });
});
