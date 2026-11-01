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

// use(store) in the server integration render modes of
// ReactDOMServerIntegrationHooks-test.js: the server renders the value a store
// was created with, a store update during render warns on the client and is
// rendered after the current render, and a store read outside a component
// errors or warns.

const ReactDOMServerIntegrationUtils = require('./utils/ReactDOMServerIntegrationTestUtils');

let React;
let ReactDOMClient;
let ReactDOMServer;
let useRef;
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
  useRef = React.useRef;
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
  clientRenderOnServerString,
  serverRender,
  streamRender,
  renderIntoDom,
  asyncReactDOMRender,
} = ReactDOMServerIntegrationUtils(initModules);

// The itRenders helpers call `it` themselves, so a @gate pragma doesn't reach
// them. Store cases register them inside gated() instead, which gates every
// test they generate the way @gate does. The gate function also gets the name
// of the generated test, for cases that are only blocked in some modes.
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

// The server renders the value a store was created with, and doesn't render
// updates to it, including updates made during the render.
function isServerRender(render) {
  return render === serverRender || render === streamRender;
}

// store-semantics: stores persist across remounts, so a new store is passed
// for each new instance. The render helpers mount the same element more than
// once (on the server and on the client, or in a failed hydration and then in
// a clean client render), so cases that update a store during render take a
// function that creates an instance with new stores, and mount each instance
// here the way the helpers do. A store update during render also warns on the
// client but not on the server, so the warning counts are separate.
async function renderInstances(
  render,
  createElement,
  serverErrorCount,
  clientErrorCount,
) {
  if (isServerRender(render)) {
    return render(createElement(), serverErrorCount);
  }
  if (render === clientRenderOnServerString) {
    const serverNode = await serverRender(createElement(), serverErrorCount);
    resetModules();
    const clientNode = await renderIntoDom(
      createElement(),
      serverNode.parentNode,
      true,
      clientErrorCount,
    );
    // Assert that the DOM element hasn't been replaced.
    expect(clientNode === serverNode).toBe(true);
    return clientNode;
  }
  if (render === clientRenderOnBadMarkup) {
    const container = document.createElement('div');
    container.innerHTML = '<div id="badIdWhichWillCauseMismatch"></div>';
    await renderIntoDom(createElement(), container, true, clientErrorCount + 1);
    const hydratedTextContent =
      container.lastChild && container.lastChild.textContent;
    const cleanContainer = document.createElement('div');
    await asyncReactDOMRender(createElement(), cleanContainer, true);
    const cleanTextContent =
      (cleanContainer.lastChild && cleanContainer.lastChild.textContent) || '';
    // The only guarantee is that text content has been patched up if needed.
    expect(hydratedTextContent).toBe(cleanTextContent);
    // Like clientRenderOnBadMarkup, stop here. All bets are off after a
    // mismatch.
    return null;
  }
  return render(createElement(), clientErrorCount);
}

describe('ReactDOMServerHooks', () => {
  beforeEach(() => {
    resetModules();
  });

  function Text(props) {
    yieldValue(props.text);
    return <span>{props.text}</span>;
  }

  describe('useState', () => {
    gated(enableStore, () => {
      itRenders('basic render', async render => {
        const countStore = createStore(0);
        function Counter(props) {
          const count = use(countStore);
          return <span>Count: {count}</span>;
        }

        const domNode = await render(<Counter />);
        expect(domNode.textContent).toEqual('Count: 0');
      });
    });

    gated(enableStore, () => {
      itThrowsWhenRendering(
        'if used inside a class component',
        async render => {
          const countStore = createStore(0);
          class Counter extends React.Component {
            render() {
              const count = use(countStore);
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

    gated(enableStore, () => {
      itRenders('multiple times when an updater is called', async render => {
        function Counter({countStore}) {
          const count = use(countStore);
          if (count < 12) {
            countStore.update(c => c + 1);
            countStore.update(c => c + 1);
            countStore.update(c => c + 1);
          }
          return <Text text={'Count: ' + count} />;
        }

        // store-semantics: store updates during render warn and are rendered
        // after the current render.
        const domNode = await renderInstances(
          render,
          () => <Counter countStore={createStore(0)} />,
          0,
          1,
        );
        if (domNode === null) {
          return;
        }
        // store-semantics: the server renders the value the store was created
        // with. The client renders the render phase updates.
        expect(domNode.textContent).toEqual(
          isServerRender(render) ? 'Count: 0' : 'Count: 12',
        );
      });
    });

    gated(enableStore, () => {
      itRenders('until there are no more new updates', async render => {
        function Counter({countStore}) {
          const count = use(countStore);
          if (count < 3) {
            countStore.update(count + 1);
          }
          return <span>Count: {count}</span>;
        }

        // store-semantics: store updates during render warn and are rendered
        // after the current render.
        const domNode = await renderInstances(
          render,
          () => <Counter countStore={createStore(0)} />,
          0,
          1,
        );
        if (domNode === null) {
          return;
        }
        // store-semantics: the server renders the value the store was created
        // with. The client renders the render phase updates.
        expect(domNode.textContent).toEqual(
          isServerRender(render) ? 'Count: 0' : 'Count: 3',
        );
      });
    });
  });

  describe('useReducer', () => {
    gated(enableStore, () => {
      itRenders(
        'multiple times when updates happen during the render phase',
        async render => {
          function reducer(state, action) {
            return action === 'increment' ? state + 1 : state;
          }
          function Counter({countStore}) {
            const count = use(countStore);
            if (count < 3) {
              countStore.update('increment');
            }
            yieldValue('Render: ' + count);
            return <Text text={count} />;
          }

          // store-semantics: store updates during render warn and are rendered
          // after the current render.
          const domNode = await renderInstances(
            render,
            () => <Counter countStore={createStore(0, reducer)} />,
            0,
            1,
          );
          if (domNode === null) {
            return;
          }

          if (isServerRender(render)) {
            // store-semantics: the server renders the value the store was
            // created with, and doesn't render the render phase update.
            expect(clearLog()).toEqual(['Render: 0', 0]);
            expect(domNode.tagName).toEqual('SPAN');
            expect(domNode.textContent).toEqual('0');
          } else {
            // store-semantics: a render phase store update is rendered in the
            // next render, not by re-running the component, so each render
            // also renders the child.
            expect(clearLog()).toEqual([
              'Render: 0',
              0,
              'Render: 1',
              1,
              'Render: 2',
              2,
              'Render: 3',
              3,
            ]);
            expect(domNode.tagName).toEqual('SPAN');
            expect(domNode.textContent).toEqual('3');
          }
        },
      );
    });
  });

  describe('useRef', () => {
    gated(enableStore, () => {
      itRenders(
        'always return the same reference through multiple renders',
        async render => {
          let firstRef = null;
          function Counter({countStore}) {
            const count = use(countStore);
            const ref = useRef();
            // store-semantics: a store update during render is rendered after
            // the current render commits, and isn't discarded with a render
            // that doesn't commit. So a render that never commits (the server
            // render, or a failed hydration) doesn't get to the render that
            // resets firstRef below, and the next mount may not start at 0.
            // A ref that was never attached belongs to a render that didn't
            // commit, so start tracking again.
            if (firstRef === null || firstRef.current == null) {
              firstRef = ref;
            } else if (firstRef !== ref) {
              throw new Error('should never change');
            }

            if (count < 3) {
              countStore.update(count + 1);
            } else {
              firstRef = null;
            }

            yieldValue(count);

            return <span ref={ref}>Count: {count}</span>;
          }

          // store-semantics: store updates during render warn and are rendered
          // after the current render.
          const domNode = await renderInstances(
            render,
            () => <Counter countStore={createStore(0)} />,
            0,
            1,
          );
          if (domNode === null) {
            return;
          }
          if (isServerRender(render)) {
            // store-semantics: the server renders the value the store was
            // created with, and doesn't render the render phase update.
            expect(clearLog()).toEqual([0]);
            expect(domNode.textContent).toEqual('Count: 0');
          } else {
            expect(clearLog()).toEqual([0, 1, 2, 3]);
            expect(domNode.textContent).toEqual('Count: 3');
          }
        },
      );
    });
  });

  gated(enableStore, () => {
    itRenders(
      'can read the same store multiple times in the same function',
      async render => {
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

  // A store read inside useMemo or a useReducer reducer gets the Hooks warning.
  describe('reading a store in a disallowed place', () => {
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
