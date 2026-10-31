/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 * @jest-environment ./scripts/jest/ReactDOMServerIntegrationEnvironment
 */

/* eslint-disable no-func-assign */

'use strict';

const ReactDOMServerIntegrationUtils = require('./utils/ReactDOMServerIntegrationTestUtils');

let React;
let ReactDOMClient;
let ReactDOMServer;
let useReducer;
let useEffect;
let useContext;
let useCallback;
let useMemo;
let useRef;
let useImperativeHandle;
let useInsertionEffect;
let useLayoutEffect;
let useDebugValue;
let forwardRef;
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
  useReducer = React.useReducer;
  useEffect = React.useEffect;
  useContext = React.useContext;
  useCallback = React.useCallback;
  useMemo = React.useMemo;
  useRef = React.useRef;
  useDebugValue = React.useDebugValue;
  useImperativeHandle = React.useImperativeHandle;
  useInsertionEffect = React.useInsertionEffect;
  useLayoutEffect = React.useLayoutEffect;
  forwardRef = React.forwardRef;
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
      itRenders('lazy state initialization', async render => {
        function init() {
          return 0;
        }
        const countStore = createStore(init());
        function Counter(props) {
          const count = use(countStore);
          return <span>Count: {count}</span>;
        }

        const domNode = await render(<Counter />);
        expect(domNode.textContent).toEqual('Count: 0');
      });
    });

    // @gate enableStore
    it('does not trigger a re-renders when updater is invoked outside current render function', async () => {
      const countStore = createStore(0);
      function UpdateCount({setCount, count, children}) {
        if (count < 3) {
          setCount(c => c + 1);
        }
        return <span>{children}</span>;
      }
      function Counter() {
        const count = use(countStore);
        return (
          <div>
            <UpdateCount setCount={countStore.update} count={count}>
              Count: {count}
            </UpdateCount>
          </div>
        );
      }

      const domNode = await serverRender(<Counter />);
      expect(domNode.textContent).toEqual('Count: 0');
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
      itRenders('with initial state', async render => {
        function reducer(state, action) {
          return action === 'increment' ? state + 1 : state;
        }
        const countStore = createStore(0, reducer);
        function Counter() {
          const count = use(countStore);
          yieldValue('Render: ' + count);
          return <Text text={count} />;
        }

        const domNode = await render(<Counter />);

        expect(clearLog()).toEqual(['Render: 0', 0]);
        expect(domNode.tagName).toEqual('SPAN');
        expect(domNode.textContent).toEqual('0');
      });
    });

    gated(enableStore, () => {
      itRenders('lazy initialization', async render => {
        function reducer(state, action) {
          return action === 'increment' ? state + 1 : state;
        }
        function init(c) {
          return c + 1;
        }
        const countStore = createStore(init(0), reducer);
        function Counter() {
          const count = use(countStore);
          yieldValue('Render: ' + count);
          return <Text text={count} />;
        }

        const domNode = await render(<Counter />);

        expect(clearLog()).toEqual(['Render: 1', 1]);
        expect(domNode.tagName).toEqual('SPAN');
        expect(domNode.textContent).toEqual('1');
      });
    });

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

  describe('useMemo', () => {
    itRenders('basic render', async render => {
      function CapitalizedText(props) {
        const text = props.text;
        const capitalizedText = useMemo(() => {
          yieldValue(`Capitalize '${text}'`);
          return text.toUpperCase();
        }, [text]);
        return <Text text={capitalizedText} />;
      }

      const domNode = await render(<CapitalizedText text="hello" />);
      expect(clearLog()).toEqual(["Capitalize 'hello'", 'HELLO']);
      expect(domNode.tagName).toEqual('SPAN');
      expect(domNode.textContent).toEqual('HELLO');
    });

    itRenders('if no inputs are provided', async render => {
      function LazyCompute(props) {
        const computed = useMemo(props.compute);
        return <Text text={computed} />;
      }

      function computeA() {
        yieldValue('compute A');
        return 'A';
      }

      const domNode = await render(<LazyCompute compute={computeA} />);
      expect(clearLog()).toEqual(['compute A', 'A']);
      expect(domNode.tagName).toEqual('SPAN');
      expect(domNode.textContent).toEqual('A');
    });

    gated(enableStore, () => {
      itRenders(
        'multiple times when updates happen during the render phase',
        async render => {
          function CapitalizedText({textStore}) {
            const text = use(textStore);
            const capitalizedText = useMemo(() => {
              yieldValue(`Capitalize '${text}'`);
              return text.toUpperCase();
            }, [text]);

            if (text === 'hello') {
              textStore.update('hello, world.');
            }
            return <Text text={capitalizedText} />;
          }

          // store-semantics: store updates during render warn and are rendered
          // after the current render.
          const domNode = await renderInstances(
            render,
            () => <CapitalizedText textStore={createStore('hello')} />,
            0,
            1,
          );
          if (domNode === null) {
            return;
          }
          if (isServerRender(render)) {
            // store-semantics: the server renders the value the store was
            // created with, and doesn't render the render phase update.
            expect(clearLog()).toEqual(["Capitalize 'hello'", 'HELLO']);
            expect(domNode.tagName).toEqual('SPAN');
            expect(domNode.textContent).toEqual('HELLO');
          } else {
            // store-semantics: a render phase store update is rendered in the
            // next render, so each render also renders the child.
            expect(clearLog()).toEqual([
              "Capitalize 'hello'",
              'HELLO',
              "Capitalize 'hello, world.'",
              'HELLO, WORLD.',
            ]);
            expect(domNode.tagName).toEqual('SPAN');
            expect(domNode.textContent).toEqual('HELLO, WORLD.');
          }
        },
      );
    });

    gated(enableStore, () => {
      itRenders(
        'should only invoke the memoized function when the inputs change',
        async render => {
          function CapitalizedText({textStore, countStore}) {
            const text = use(textStore);
            const count = use(countStore);
            const capitalizedText = useMemo(() => {
              yieldValue(`Capitalize '${text}'`);
              return text.toUpperCase();
            }, [text]);

            yieldValue(count);

            if (count < 3) {
              countStore.update(count + 1);
            }

            if (text === 'hello' && count === 2) {
              textStore.update('hello, world.');
            }
            return <Text text={capitalizedText} />;
          }

          // store-semantics: store updates during render warn and are rendered
          // after the current render.
          const domNode = await renderInstances(
            render,
            () => (
              <CapitalizedText
                textStore={createStore('hello')}
                countStore={createStore(0)}
              />
            ),
            0,
            1,
          );
          if (domNode === null) {
            return;
          }
          if (isServerRender(render)) {
            // store-semantics: the server renders the value the store was
            // created with, and doesn't render the render phase updates.
            expect(clearLog()).toEqual(["Capitalize 'hello'", 0, 'HELLO']);
            expect(domNode.tagName).toEqual('SPAN');
            expect(domNode.textContent).toEqual('HELLO');
          } else {
            // store-semantics: a render phase store update is rendered in the
            // next render, so each render also renders the child.
            expect(clearLog()).toEqual([
              "Capitalize 'hello'",
              0,
              'HELLO',
              1,
              'HELLO',
              2,
              'HELLO',
              // `capitalizedText` only recomputes when the text has changed
              "Capitalize 'hello, world.'",
              3,
              'HELLO, WORLD.',
            ]);
            expect(domNode.tagName).toEqual('SPAN');
            expect(domNode.textContent).toEqual('HELLO, WORLD.');
          }
        },
      );
    });

    gated(enableStore, () => {
      itRenders('with a warning for useState inside useMemo', async render => {
        const store = createStore(undefined);
        function App() {
          useMemo(() => {
            use(store);
            return 0;
          });
          return 'hi';
        }
        const domNode = await render(
          <App />,
          render === clientRenderOnBadMarkup
            ? // On hydration mismatch we retry and therefore log the warning again.
              2
            : 1,
        );
        expect(domNode.textContent).toEqual('hi');
      });
    });
  });

  describe('useRef', () => {
    itRenders('basic render', async render => {
      function Counter(props) {
        const ref = useRef();
        return <span ref={ref}>Hi</span>;
      }

      const domNode = await render(<Counter />);
      expect(domNode.textContent).toEqual('Hi');
    });

    gated(enableStore, () => {
      itRenders(
        'multiple times when updates happen during the render phase',
        async render => {
          function Counter({countStore}) {
            const count = use(countStore);
            const ref = useRef();

            if (count < 3) {
              const newCount = count + 1;
              countStore.update(newCount);
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

  describe('useEffect', () => {
    const yields = [];
    itRenders('should ignore effects on the server', async render => {
      function Counter(props) {
        useEffect(() => {
          yieldValue('invoked on client');
        });
        return <Text text={'Count: ' + props.count} />;
      }

      const domNode = await render(<Counter count={0} />);
      yields.push(clearLog());
      expect(domNode.tagName).toEqual('SPAN');
      expect(domNode.textContent).toEqual('Count: 0');
    });

    it('verifies yields in order', () => {
      expect(yields).toEqual([
        ['Count: 0'], // server render
        ['Count: 0'], // server stream
        ['Count: 0', 'invoked on client'], // clean render
        ['Count: 0', 'invoked on client'], // hydrated render
        // nothing yielded for bad markup
      ]);
    });
  });

  describe('useCallback', () => {
    itRenders('should not invoke the passed callbacks', async render => {
      function Counter(props) {
        useCallback(() => {
          yieldValue('should not be invoked');
        });
        return <Text text={'Count: ' + props.count} />;
      }
      const domNode = await render(<Counter count={0} />);
      expect(clearLog()).toEqual(['Count: 0']);
      expect(domNode.tagName).toEqual('SPAN');
      expect(domNode.textContent).toEqual('Count: 0');
    });

    itRenders('should support render time callbacks', async render => {
      function Counter(props) {
        const renderCount = useCallback(increment => {
          return 'Count: ' + (props.count + increment);
        });
        return <Text text={renderCount(3)} />;
      }
      const domNode = await render(<Counter count={2} />);
      expect(clearLog()).toEqual(['Count: 5']);
      expect(domNode.tagName).toEqual('SPAN');
      expect(domNode.textContent).toEqual('Count: 5');
    });

    gated(enableStore, () => {
      itRenders(
        'should only change the returned reference when the inputs change',
        async render => {
          function CapitalizedText({textStore, countStore}) {
            const text = use(textStore);
            const count = use(countStore);
            const capitalizeText = useCallback(
              () => text.toUpperCase(),
              [text],
            );
            yieldValue(capitalizeText);
            if (count < 3) {
              countStore.update(count + 1);
            }
            if (text === 'hello' && count === 2) {
              textStore.update('hello, world.');
            }
            return <Text text={capitalizeText()} />;
          }

          // store-semantics: store updates during render warn and are rendered
          // after the current render.
          const domNode = await renderInstances(
            render,
            () => (
              <CapitalizedText
                textStore={createStore('hello')}
                countStore={createStore(0)}
              />
            ),
            0,
            1,
          );
          if (domNode === null) {
            return;
          }
          if (isServerRender(render)) {
            // store-semantics: the server renders the value the store was
            // created with, and doesn't render the render phase updates.
            const [first, result] = clearLog();
            expect(typeof first).toBe('function');
            expect(result).toEqual('HELLO');
            expect(domNode.tagName).toEqual('SPAN');
            expect(domNode.textContent).toEqual('HELLO');
          } else {
            // store-semantics: a render phase store update is rendered in the
            // next render, so each render also renders the child.
            const [
              first,
              firstResult,
              second,
              secondResult,
              third,
              thirdResult,
              fourth,
              result,
            ] = clearLog();
            expect(first).toBe(second);
            expect(second).toBe(third);
            expect(third).not.toBe(fourth);
            expect(firstResult).toEqual('HELLO');
            expect(secondResult).toEqual('HELLO');
            expect(thirdResult).toEqual('HELLO');
            expect(result).toEqual('HELLO, WORLD.');
            expect(domNode.tagName).toEqual('SPAN');
            expect(domNode.textContent).toEqual('HELLO, WORLD.');
          }
        },
      );
    });
  });

  describe('useImperativeHandle', () => {
    it('should not be invoked on the server', async () => {
      function Counter(props, ref) {
        useImperativeHandle(ref, () => {
          throw new Error('should not be invoked');
        });
        return <Text text={props.label + ': ' + ref.current} />;
      }
      Counter = forwardRef(Counter);
      const counter = React.createRef();
      counter.current = 0;
      const domNode = await serverRender(
        <Counter label="Count" ref={counter} />,
      );
      expect(clearLog()).toEqual(['Count: 0']);
      expect(domNode.tagName).toEqual('SPAN');
      expect(domNode.textContent).toEqual('Count: 0');
    });
  });
  describe('useInsertionEffect', () => {
    it('should warn when invoked during render', async () => {
      function Counter() {
        useInsertionEffect(() => {
          throw new Error('should not be invoked');
        });

        return <Text text="Count: 0" />;
      }
      const domNode = await serverRender(<Counter />, 1);
      expect(clearLog()).toEqual(['Count: 0']);
      expect(domNode.tagName).toEqual('SPAN');
      expect(domNode.textContent).toEqual('Count: 0');
    });
  });

  describe('useLayoutEffect', () => {
    it('should warn when invoked during render', async () => {
      function Counter() {
        useLayoutEffect(() => {
          throw new Error('should not be invoked');
        });

        return <Text text="Count: 0" />;
      }
      const domNode = await serverRender(<Counter />, 1);
      expect(clearLog()).toEqual(['Count: 0']);
      expect(domNode.tagName).toEqual('SPAN');
      expect(domNode.textContent).toEqual('Count: 0');
    });
  });

  describe('useContext', () => {
    itThrowsWhenRendering(
      'if used inside a class component',
      async render => {
        const Context = React.createContext({}, () => {});
        class Counter extends React.Component {
          render() {
            const [count] = useContext(Context);
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

  itRenders(
    'can use the same context multiple times in the same function',
    async render => {
      const Context = React.createContext({foo: 0, bar: 0, baz: 0});

      function Provider(props) {
        return (
          <Context.Provider
            value={{foo: props.foo, bar: props.bar, baz: props.baz}}>
            {props.children}
          </Context.Provider>
        );
      }

      function FooAndBar() {
        const {foo} = useContext(Context);
        const {bar} = useContext(Context);
        return <Text text={`Foo: ${foo}, Bar: ${bar}`} />;
      }

      function Baz() {
        const {baz} = useContext(Context);
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
            <Provider foo={props.foo} bar={props.bar} baz={props.baz}>
              <Indirection>
                <Indirection>
                  <FooAndBar />
                </Indirection>
                <Indirection>
                  <Baz />
                </Indirection>
              </Indirection>
            </Provider>
          </div>
        );
      }

      const domNode = await render(<App foo={1} bar={3} baz={5} />);
      expect(clearLog()).toEqual(['Foo: 1, Bar: 3', 'Baz: 5']);
      expect(domNode.childNodes.length).toBe(2);
      expect(domNode.firstChild.tagName).toEqual('SPAN');
      expect(domNode.firstChild.textContent).toEqual('Foo: 1, Bar: 3');
      expect(domNode.lastChild.tagName).toEqual('SPAN');
      expect(domNode.lastChild.textContent).toEqual('Baz: 5');
    },
  );

  describe('useDebugValue', () => {
    itRenders('is a noop', async render => {
      function Counter(props) {
        const debugValue = useDebugValue(123);
        return <Text text={typeof debugValue} />;
      }

      const domNode = await render(<Counter />);
      expect(domNode.textContent).toEqual('undefined');
    });
  });

  describe('readContext', () => {
    function readContext(Context) {
      const dispatcher =
        React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE.H;
      return dispatcher.readContext(Context);
    }

    itRenders(
      'can read the same context multiple times in the same function',
      async render => {
        const Context = React.createContext(
          {foo: 0, bar: 0, baz: 0},
          (a, b) => {
            let result = 0;
            if (a.foo !== b.foo) {
              result |= 0b001;
            }
            if (a.bar !== b.bar) {
              result |= 0b010;
            }
            if (a.baz !== b.baz) {
              result |= 0b100;
            }
            return result;
          },
        );

        function Provider(props) {
          return (
            <Context.Provider
              value={{foo: props.foo, bar: props.bar, baz: props.baz}}>
              {props.children}
            </Context.Provider>
          );
        }

        function FooAndBar() {
          const {foo} = readContext(Context, 0b001);
          const {bar} = readContext(Context, 0b010);
          return <Text text={`Foo: ${foo}, Bar: ${bar}`} />;
        }

        function Baz() {
          const {baz} = readContext(Context, 0b100);
          return <Text text={'Baz: ' + baz} />;
        }

        class Indirection extends React.Component {
          shouldComponentUpdate() {
            return false;
          }
          render() {
            return this.props.children;
          }
        }

        function App(props) {
          return (
            <div>
              <Provider foo={props.foo} bar={props.bar} baz={props.baz}>
                <Indirection>
                  <Indirection>
                    <FooAndBar />
                  </Indirection>
                  <Indirection>
                    <Baz />
                  </Indirection>
                </Indirection>
              </Provider>
            </div>
          );
        }

        const domNode = await render(<App foo={1} bar={3} baz={5} />);
        expect(clearLog()).toEqual(['Foo: 1, Bar: 3', 'Baz: 5']);
        expect(domNode.childNodes.length).toBe(2);
        expect(domNode.firstChild.tagName).toEqual('SPAN');
        expect(domNode.firstChild.textContent).toEqual('Foo: 1, Bar: 3');
        expect(domNode.lastChild.tagName).toEqual('SPAN');
        expect(domNode.lastChild.textContent).toEqual('Baz: 5');
      },
    );

    // store-semantics: this copy doesn't read a store, so it isn't gated.
    itRenders('with a warning inside useMemo and useReducer', async render => {
      const Context = React.createContext(42);

      function ReadInMemo(props) {
        const count = React.useMemo(() => readContext(Context), []);
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

      // store-semantics: no useReducer half. A store's reducer isn't
      // part of any component, so it can't read context: which
      // provider's value would a shared store see? It runs without a
      // dispatcher, and reading context throws.
    });
  });

  // @gate enableStore
  it('renders successfully after a component using hooks throws an error', () => {
    // ThrowingComponent keeps useReducer: it needs render phase updates that
    // re-run the component on the server, which a store doesn't do.
    function ThrowingComponent() {
      const [value, dispatch] = useReducer((state, action) => {
        return state + 1;
      }, 0);

      // throw an error if the count gets too high during the re-render phase
      if (value >= 3) {
        throw new Error('Error from ThrowingComponent');
      } else {
        // dispatch to trigger a re-render of the component
        dispatch();
      }

      return <div>{value}</div>;
    }

    const countStore = createStore(0);
    function NonThrowingComponent() {
      const count = use(countStore);
      return <div>{count}</div>;
    }

    // First, render a component that will throw an error during a re-render triggered
    // by a dispatch call.
    expect(() => ReactDOMServer.renderToString(<ThrowingComponent />)).toThrow(
      'Error from ThrowingComponent',
    );

    // Next, assert that we can render a function component using hooks immediately
    // after an error occurred, which indictates the internal hooks state has been
    // reset.
    const container = document.createElement('div');
    container.innerHTML = ReactDOMServer.renderToString(
      <NonThrowingComponent />,
    );
    expect(container.children[0].textContent).toEqual('0');
  });
});
