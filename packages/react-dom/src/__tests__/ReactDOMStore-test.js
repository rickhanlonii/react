/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 */

'use strict';

let React;
let ReactDOMClient;
let ReactDOMServer;
let Scheduler;
let act;
let use;
let startTransition;
let Suspense;
let createStore;
let assertLog;
let waitFor;
let Activity;
let waitForAll;
let assertConsoleErrorDev;

function normalizeError(msg) {
  // Take the first sentence to make it easier to assert on.
  const idx = msg.indexOf('.');
  if (idx > -1) {
    return msg.slice(0, idx + 1);
  }
  return msg;
}

describe('ReactDOMStore', () => {
  beforeEach(() => {
    jest.resetModules();
    React = require('react');
    ReactDOMClient = require('react-dom/client');
    ReactDOMServer = require('react-dom/server');
    Scheduler = require('scheduler');
    act = require('internal-test-utils').act;
    assertConsoleErrorDev =
      require('internal-test-utils').assertConsoleErrorDev;
    use = React.use;
    startTransition = React.startTransition;
    Suspense = React.Suspense;
    Activity = React.Activity;
    createStore = React.unstable_createStore;

    const InternalTestUtils = require('internal-test-utils');
    assertLog = InternalTestUtils.assertLog;
    waitFor = InternalTestUtils.waitFor;
    waitForAll = InternalTestUtils.waitForAll;
  });

  function Text({text}) {
    Scheduler.log(text);
    return text;
  }

  // @gate enableStore
  it('a reader inside a newly inserted host component catches up without warnings', async () => {
    const store = createStore(1);

    function Reader({name}) {
      return <Text text={name + ': ' + use(store)} />;
    }

    const container = document.createElement('div');
    const root = ReactDOMClient.createRoot(container);
    await act(async () => {
      startTransition(() => {
        root.render(
          <div>
            <Reader name="A" />
            <Reader name="B" />
          </div>,
        );
      });
      await waitFor(['A: 1']);
      // Dispatched after A rendered and before the tree commits.
      store.update(2);
    });
    assertLog(['B: 1', 'A: 2', 'B: 2']);
    expect(container.textContent).toBe('A: 2B: 2');
  });

  // @gate enableStore
  it('hydrates with the initial value of the store', async () => {
    const store = createStore('A');

    function App() {
      return <Text text={use(store)} />;
    }

    const container = document.createElement('div');
    container.innerHTML = ReactDOMServer.renderToString(<App />);
    assertLog(['A']);
    expect(container.textContent).toBe('A');

    // The store moves before hydration.
    store.update('B');

    const errors = [];
    await act(() => {
      ReactDOMClient.hydrateRoot(container, <App />, {
        onRecoverableError(error) {
          errors.push(error.message);
        },
      });
    });
    // It hydrates with the server value, then updates to the latest value.
    assertLog(['A', 'B']);
    expect(errors).toEqual([]);
    expect(container.textContent).toBe('B');

    await act(() => {
      store.update('C');
    });
    assertLog(['C']);
    expect(container.textContent).toBe('C');
  });

  // @gate enableStore
  it('the server renders the initial value, not updates', async () => {
    const store = createStore('A');
    store.update('B');

    function App() {
      return use(store);
    }

    expect(ReactDOMServer.renderToString(<App />)).toBe('A');
    assertConsoleErrorDev([
      'A store was updated before this server render. The server renders ' +
        "a store's initial value, so the update isn't included. Create the " +
        'store with the server data, or pass a per-request store through ' +
        'context.\n' +
        '    in App (at **)',
    ]);
  });

  // @gate enableStore
  it('a store update before a dehydrated reader hydrates does not cause a mismatch', async () => {
    const store = createStore('A');
    let resolve;
    const promise = new Promise(r => (resolve = r));
    let suspend = false;

    function Reader() {
      const value = use(store);
      if (suspend) {
        throw promise;
      }
      return value;
    }

    function App() {
      return (
        <Suspense fallback="Loading">
          <Reader />
        </Suspense>
      );
    }

    const container = document.createElement('div');
    container.innerHTML = ReactDOMServer.renderToString(<App />);
    expect(container.textContent).toBe('A');

    suspend = true;
    const errors = [];
    await act(() => {
      ReactDOMClient.hydrateRoot(container, <App />, {
        onRecoverableError(error) {
          errors.push(error.message);
        },
      });
    });
    await act(() => {
      store.update('B');
    });
    suspend = false;
    await act(() => {
      resolve();
    });
    expect(errors).toEqual([]);
    expect(container.textContent).toBe('B');
  });

  // @gate enableStore
  it('keeps a controlled input in sync', async () => {
    const store = createStore('');

    function Input() {
      return (
        <input
          value={use(store)}
          onChange={e => store.update(e.target.value)}
        />
      );
    }

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOMClient.createRoot(container);
    await act(() => {
      root.render(<Input />);
    });
    const input = container.firstChild;

    const setValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    ).set;
    await act(() => {
      setValue.call(input, 'hello');
      input.dispatchEvent(new Event('input', {bubbles: true}));
    });
    expect(input.value).toBe('hello');

    // A store that rejects the change restores the controlled value.
    const lockedStore = createStore('locked');
    function LockedInput() {
      return <input value={use(lockedStore)} onChange={() => {}} />;
    }
    await act(() => {
      root.render(<LockedInput />);
    });
    const lockedInput = container.firstChild;
    await act(() => {
      setValue.call(lockedInput, 'changed');
      lockedInput.dispatchEvent(new Event('input', {bubbles: true}));
    });
    expect(lockedInput.value).toBe('locked');
    document.body.removeChild(container);
  });
  // @gate enableStore
  it('releases the root when it unmounts, without another store update', async () => {
    const store = createStore('A');

    function Reader() {
      return <Text text={use(store)} />;
    }

    const root = ReactDOMClient.createRoot(document.createElement('div'));
    await act(() => {
      root.render(<Reader />);
    });
    assertLog(['A']);
    expect(store._records.length).toBe(1);

    await act(() => {
      root.unmount();
    });
    // The store no longer references the root.
    expect(store._records.length).toBe(0);
  });

  // @gate enableStore
  it('a hydrated reader keeps updating when an unrelated store updated before it hydrated', async () => {
    const store = createStore('A');
    const other = createStore(0);
    let resolve;
    const promise = new Promise(r => (resolve = r));
    let suspend = false;

    function Reader() {
      return <Text text={'Reader: ' + use(store)} />;
    }
    function Suspender() {
      if (suspend) {
        throw promise;
      }
      return null;
    }
    function App() {
      return (
        <Suspense fallback="Loading">
          <Reader />
          <Suspender />
        </Suspense>
      );
    }

    const container = document.createElement('div');
    container.innerHTML = ReactDOMServer.renderToString(<App />);
    assertLog(['Reader: A']);

    // The first attempt to hydrate the boundary reads the store, and then
    // suspends, so nothing subscribes.
    suspend = true;
    await act(() => {
      ReactDOMClient.hydrateRoot(container, <App />);
    });
    assertLog(['Reader: A']);

    // An update to a store on another root, which doesn't commit this root.
    function OtherReader() {
      return use(other);
    }
    const otherRoot = ReactDOMClient.createRoot(document.createElement('div'));
    await act(() => {
      otherRoot.render(<OtherReader />);
    });
    await act(() => {
      other.update(1);
    });

    suspend = false;
    await act(() => {
      resolve();
    });
    assertLog(['Reader: A']);
    expect(container.textContent).toBe('Reader: A');

    await act(() => {
      store.update('B');
    });
    assertLog(['Reader: B']);
    expect(container.textContent).toBe('Reader: B');
  });

  // @gate enableStore
  it('a reader that hydrates while a transition is pending joins the transition', async () => {
    const store = createStore('A');
    let resolveA;
    const promiseA = new Promise(r => (resolveA = r));
    let resolveB;
    const promiseB = new Promise(r => (resolveB = r));
    let suspendA = false;
    let suspendB = false;

    function A() {
      const value = use(store);
      if (value === 'T' && suspendA) {
        throw promiseA;
      }
      Scheduler.log('A: ' + value);
      return value;
    }
    function B() {
      const value = use(store);
      Scheduler.log('B: ' + value);
      return (
        <span id="b" onClick={() => {}}>
          {value}
        </span>
      );
    }
    function Suspender() {
      if (suspendB) {
        throw promiseB;
      }
      return null;
    }
    function App() {
      return (
        <>
          <A />
          <Suspense fallback="Loading">
            <B />
            <Suspender />
          </Suspense>
        </>
      );
    }

    const container = document.createElement('div');
    document.body.appendChild(container);
    container.innerHTML = ReactDOMServer.renderToString(<App />);
    assertLog(['A: A', 'B: A']);

    suspendB = true;
    await act(() => {
      ReactDOMClient.hydrateRoot(container, <App />);
    });
    assertLog(['A: A', 'B: A']);

    // A transition updates the store and suspends, so it stays pending.
    suspendA = true;
    await act(() => {
      startTransition(() => store.update('T'));
    });
    assertLog([]);
    expect(container.textContent).toBe('AA');

    // A discrete event hydrates the boundary at a higher priority than the
    // transition. B hydrates with the initial value, and skips the
    // transition's update, which joins it to the transition.
    suspendB = false;
    await act(() => {
      container
        .querySelector('#b')
        .dispatchEvent(new MouseEvent('click', {bubbles: true}));
    });
    assertLog(['B: A', 'B: T']);
    expect(container.textContent).toBe('AA');

    // The transition commits both readers together.
    suspendA = false;
    await act(() => {
      resolveA();
      resolveB();
    });
    assertLog(['A: T', 'B: T']);
    expect(container.textContent).toBe('TT');
    document.body.removeChild(container);
  });

  // @gate enableStore
  it('renders a store update from componentWillMount in the same mount, without a warning', async () => {
    const store = createStore(0);

    function A() {
      return <Text text={'A: ' + use(store)} />;
    }
    class B extends React.Component {
      UNSAFE_componentWillMount() {
        store.update(1);
      }
      render() {
        return <Text text="B" />;
      }
    }

    const container = document.createElement('div');
    const root = ReactDOMClient.createRoot(container);
    await act(() => {
      root.render(
        <div>
          <A />
          <B />
        </div>,
      );
    });
    assertLog(['A: 0', 'B', 'A: 1']);
    expect(container.textContent).toBe('A: 1B');
  });

  // @gate enableStore
  it('an update the root rejects for an infinite loop is not applied to the store', async () => {
    const store = createStore(0);
    let lastRendered;
    function NonTerminating() {
      const step = use(store);
      lastRendered = step;
      React.useLayoutEffect(() => {
        store.update(x => x + 1);
      });
      return step;
    }

    const container = document.createElement('div');
    const root = ReactDOMClient.createRoot(container);
    await expect(async () => {
      await act(() => {
        root.render(<NonTerminating />);
      });
    }).rejects.toThrow('Maximum');

    // The update that hit the limit threw from store.update, so a root that
    // starts reading the store sees the last value that rendered.
    function Reader() {
      return use(store);
    }
    const container2 = document.createElement('div');
    const root2 = ReactDOMClient.createRoot(container2);
    await act(() => {
      root2.render(<Reader />);
    });
    expect(container2.textContent).toBe(String(lastRendered));
  });

  // @gate enableStore
  it('the server does not render store updates made during the render, and hydration renders them after', async () => {
    function Counter({store}) {
      const count = use(store);
      if (count < 3) {
        store.update(count + 1);
      }
      return <Text text={'Count: ' + count} />;
    }

    // The server renders once, with the initial value, and doesn't warn.
    const container = document.createElement('div');
    container.innerHTML = ReactDOMServer.renderToString(
      <Counter store={createStore(0)} />,
    );
    assertLog(['Count: 0']);
    expect(container.textContent).toBe('Count: 0');

    // The client hydrates with the initial value, warns about the update, and
    // renders each update after the render that made it.
    await act(() => {
      ReactDOMClient.hydrateRoot(container, <Counter store={createStore(0)} />);
    });
    assertConsoleErrorDev([
      'Cannot update a store while rendering a component (`Counter`). ' +
        'Updating a store is a side effect, so it should happen in an event ' +
        'handler or an effect. The update will be rendered after the ' +
        'current render. To locate the bad store.update() call inside ' +
        '`Counter`, follow the stack trace as described in ' +
        'https://react.dev/link/setstate-in-render\n' +
        '    in Counter (at **)',
    ]);
    assertLog(['Count: 0', 'Count: 1', 'Count: 2', 'Count: 3']);
    expect(container.textContent).toBe('Count: 3');
  });

  // @gate enableStore
  it('the server warns when a store is read inside useMemo or a reducer', async () => {
    const store = createStore(42);

    function ReadInMemo() {
      return React.useMemo(() => use(store), []);
    }

    function ReadInReducer() {
      const [count, dispatch] = React.useReducer(() => use(store));
      if (count !== 42) {
        dispatch();
      }
      return count;
    }

    expect(ReactDOMServer.renderToString(<ReadInMemo />)).toBe('42');
    assertConsoleErrorDev([
      'Do not call Hooks inside useEffect(...), useMemo(...), or other ' +
        'built-in Hooks. You can only call Hooks at the top level of your ' +
        'React function. For more information, see ' +
        'https://react.dev/link/rules-of-hooks\n' +
        '    in ReadInMemo (at **)',
    ]);

    expect(ReactDOMServer.renderToString(<ReadInReducer />)).toBe('42');
    assertConsoleErrorDev([
      'Do not call Hooks inside useEffect(...), useMemo(...), or other ' +
        'built-in Hooks. You can only call Hooks at the top level of your ' +
        'React function. For more information, see ' +
        'https://react.dev/link/rules-of-hooks\n' +
        '    in ReadInReducer (at **)',
    ]);
  });

  // @gate enableStore
  it('the server throws when a store is read in a class component', () => {
    const store = createStore(0);
    class Counter extends React.Component {
      render() {
        return use(store);
      }
    }

    expect(() => ReactDOMServer.renderToString(<Counter />)).toThrow(
      'Invalid hook call. Hooks can only be called inside of the body of a ' +
        'function component.',
    );
  });

  // A reader inside a dehydrated boundary isn't subscribed until it hydrates,
  // and it hydrates with the store's initial value, which is what the server
  // rendered. A store update doesn't reach into the boundary. The reader
  // catches up to the latest value after it hydrates.
  describe('dehydrated boundaries', () => {
    // @gate enableStore
    it('a store update while a dehydrated reader hydrates is rendered after it hydrates', async () => {
      let suspend = false;
      let resolve;
      const promise = new Promise(resolvePromise => (resolve = resolvePromise));

      const textStore = createStore('Hello');
      const updateText = textStore.update;

      function Child() {
        const state = use(textStore);
        Scheduler.log('Child');
        if (suspend) {
          throw promise;
        } else {
          return state;
        }
      }

      function Sibling() {
        Scheduler.log('Sibling');
        return null;
      }

      function App() {
        return (
          <div>
            <Suspense fallback="Loading...">
              <Child />
              <Sibling />
            </Suspense>
          </div>
        );
      }

      suspend = false;
      const finalHTML = ReactDOMServer.renderToString(<App />);
      assertLog(['Child', 'Sibling']);

      const container = document.createElement('div');
      container.innerHTML = finalHTML;

      const recoverableErrors = [];
      ReactDOMClient.hydrateRoot(
        container,
        <App text="Hello" className="hello" />,
        {
          onRecoverableError(error) {
            recoverableErrors.push(normalizeError(error.message));
          },
        },
      );

      await act(async () => {
        suspend = true;
        await waitFor(['Child']);

        // While we're part way through the hydration, we update the store.
        // A store update isn't tied to a fiber, so there's no warning about
        // updating a component that hasn't mounted yet, and the update isn't
        // dropped.
        updateText('Hi');

        // This will throw it away and rerender.
        await waitForAll(['Child']);

        expect(container.textContent).toBe('Hello');

        suspend = false;
        resolve();
        await promise;
      });
      // The content hydrates without a mismatch and then shows the latest value
      // of the store.
      expect(recoverableErrors).toEqual([]);
      assertLog(['Child', 'Sibling', 'Child']);
      expect(container.textContent).toBe('Hi');
    });

    // @gate enableStore
    it('a suspended dehydrated reader hydrates first and then renders a store update', async () => {
      let suspend = false;
      let resolve;
      const promise = new Promise(resolvePromise => (resolve = resolvePromise));
      const ref = React.createRef();
      const store = createStore({text: 'Hello', className: 'hello'});

      function Child() {
        const {text, className} = use(store);
        if (suspend) {
          throw promise;
        } else {
          return (
            <span ref={ref} className={className}>
              {text}
            </span>
          );
        }
      }

      const App = React.memo(function App() {
        return (
          <div>
            <Suspense fallback="Loading...">
              <Child />
            </Suspense>
          </div>
        );
      });

      suspend = false;
      const finalHTML = ReactDOMServer.renderToString(<App />);
      const container = document.createElement('div');
      container.innerHTML = finalHTML;

      const span = container.getElementsByTagName('span')[0];

      // On the client we don't have all data yet but we want to start
      // hydrating anyway.
      suspend = true;
      const root = ReactDOMClient.hydrateRoot(container, <App />);
      await waitForAll([]);

      expect(ref.current).toBe(null);
      expect(span.textContent).toBe('Hello');

      // Re-render the root (App bails out because it's memoized) and update
      // the store in the same batch, at a priority at least as high as
      // pinging the hydration.
      root.render(<App />);
      store.update({text: 'Hi', className: 'hi'});

      // At the same time, resolving the promise so that rendering can complete.
      // This should first complete the hydration and then flush the update onto the hydrated state.
      await act(async () => {
        suspend = false;
        resolve();
        await promise;
      });

      // Since this should have been hydrated, this should still be the same span.
      const newSpan = container.getElementsByTagName('span')[0];
      expect(newSpan).toBe(span);

      // We should now have fully rendered with a ref on the new span.
      expect(ref.current).toBe(span);
      expect(span.textContent).toBe('Hi');
      // If we ended up hydrating the existing content, we won't have properly
      // patched up the tree, which might mean we haven't patched the className.
      expect(span.className).toBe('hi');
    });

    // @gate enableStore
    it('keeps the server HTML when a store changes before a suspended dehydrated reader hydrates', async () => {
      let suspend = false;
      let resolve;
      const promise = new Promise(resolvePromise => (resolve = resolvePromise));
      const ref = React.createRef();
      const store = createStore({text: 'Hello', className: 'hello'});

      function Child() {
        const {text, className} = use(store);
        if (suspend) {
          throw promise;
        } else {
          return (
            <span ref={ref} className={className}>
              {text}
            </span>
          );
        }
      }

      const App = React.memo(function App() {
        return (
          <div>
            <Suspense fallback="Loading...">
              <Child />
            </Suspense>
          </div>
        );
      });

      suspend = false;
      const finalHTML = ReactDOMServer.renderToString(<App />);
      const container = document.createElement('div');
      container.innerHTML = finalHTML;

      // On the client we don't have all data yet but we want to start
      // hydrating anyway.
      suspend = true;
      const root = ReactDOMClient.hydrateRoot(container, <App />, {
        onRecoverableError(error) {
          Scheduler.log('onRecoverableError: ' + normalizeError(error.message));
          if (error.cause) {
            Scheduler.log('Cause: ' + normalizeError(error.cause.message));
          }
        },
      });
      await waitForAll([]);

      expect(ref.current).toBe(null);

      // Re-render the root (App bails out because it's memoized) and update
      // the store while the reader is still suspended.
      await act(() => {
        root.render(<App />);
        store.update({text: 'Hi', className: 'hi'});
      });

      // A context change would delete the dehydrated content and show the
      // fallback. The store update doesn't reach the unhydrated reader, so the
      // server HTML stays until the boundary hydrates.
      expect(container.getElementsByTagName('span').length).toBe(1);
      expect(ref.current).toBe(null);
      expect(container.textContent).toBe('Hello');

      // Unsuspending shows the content.
      await act(async () => {
        suspend = false;
        resolve();
        await promise;
      });

      const span = container.getElementsByTagName('span')[0];
      expect(span.textContent).toBe('Hi');
      expect(span.className).toBe('hi');
      expect(ref.current).toBe(span);
      expect(container.textContent).toBe('Hi');
    });

    // @gate enableStore
    it('keeps the server HTML when a store changes before a suspended reader in a dehydrated Activity hydrates', async () => {
      let suspend = false;
      let resolve;
      const promise = new Promise(resolvePromise => (resolve = resolvePromise));
      const ref = React.createRef();
      const store = createStore({text: 'Hello', className: 'hello'});

      function Child() {
        const {text, className} = use(store);
        if (suspend) {
          throw promise;
        } else {
          return (
            <span ref={ref} className={className}>
              {text}
            </span>
          );
        }
      }

      const App = React.memo(function App() {
        return (
          <Suspense fallback="Loading...">
            <div>
              <Activity>
                <Child />
              </Activity>
            </div>
          </Suspense>
        );
      });

      suspend = false;
      const finalHTML = ReactDOMServer.renderToString(<App />);
      const container = document.createElement('div');
      container.innerHTML = finalHTML;

      // On the client we don't have all data yet but we want to start
      // hydrating anyway.
      suspend = true;
      const root = ReactDOMClient.hydrateRoot(container, <App />, {
        onRecoverableError(error) {
          Scheduler.log('onRecoverableError: ' + normalizeError(error.message));
          if (error.cause) {
            Scheduler.log('Cause: ' + normalizeError(error.cause.message));
          }
        },
      });
      await waitForAll([]);

      expect(ref.current).toBe(null);

      // Re-render the root (App bails out because it's memoized) and update
      // the store while the reader is still suspended.
      await act(() => {
        root.render(<App />);
        store.update({text: 'Hi', className: 'hi'});
      });

      // A context change would hide the dehydrated content and show the
      // parent fallback. The store update doesn't reach the unhydrated reader,
      // so the server HTML stays until the Activity boundary hydrates.
      expect(container.getElementsByTagName('span').length).toBe(1);
      expect(ref.current).toBe(null);
      expect(container.textContent).toBe('Hello');

      // Unsuspending shows the content.
      await act(async () => {
        suspend = false;
        resolve();
        await promise;
      });

      const span = container.getElementsByTagName('span')[0];
      expect(span.textContent).toBe('Hi');
      expect(span.className).toBe('hi');
      expect(ref.current).toBe(span);
      expect(container.textContent).toBe('Hi');
    });
  });

  describe('reducer errors', () => {
    const originalReportError = global.reportError;

    beforeEach(() => {
      global.reportError = error => {
        Scheduler.log('reportError: ' + error.message);
      };
      // reportError is read when React loads.
      jest.resetModules();
      React = require('react');
      ReactDOMClient = require('react-dom/client');
      ReactDOMServer = require('react-dom/server');
      Scheduler = require('scheduler');
      act = require('internal-test-utils').act;
      assertLog = require('internal-test-utils').assertLog;
      use = React.use;
      startTransition = React.startTransition;
      createStore = React.unstable_createStore;
    });

    afterEach(() => {
      global.reportError = originalReportError;
    });

    // @gate enableStore
    it('hydrates with the server value when a reducer throws, and throws the error once the update applies in order', async () => {
      const store = createStore('A', (state, action) => {
        if (action === 'throw') {
          throw new Error('Oops');
        }
        return action;
      });

      class ErrorBoundary extends React.Component {
        state = {error: null};
        static getDerivedStateFromError(error) {
          return {error};
        }
        render() {
          if (this.state.error !== null) {
            return <Text text={'Caught: ' + this.state.error.message} />;
          }
          return this.props.children;
        }
      }

      function App() {
        return <Text text={use(store)} />;
      }

      const container = document.createElement('div');
      container.innerHTML = ReactDOMServer.renderToString(
        <ErrorBoundary>
          <App />
        </ErrorBoundary>,
      );
      assertLog(['A']);

      // Nothing reads the store, so these updates are held until the action
      // is done. The urgent one is held behind the action's.
      let resolve;
      await act(() => {
        startTransition(async () => {
          store.update('B');
          await new Promise(r => (resolve = r));
        });
      });
      store.update('throw');

      const errors = [];
      const caughtErrors = [];
      await act(() => {
        ReactDOMClient.hydrateRoot(
          container,
          <ErrorBoundary>
            <App />
          </ErrorBoundary>,
          {
            onRecoverableError(error) {
              errors.push(error.message);
            },
            onCaughtError(error) {
              caughtErrors.push(error.message);
            },
          },
        );
      });
      // The reader hydrates with the server value instead of throwing. The
      // hydration skips the action's update, so the urgent one would apply
      // out of order. It's deferred until it applies in order.
      assertLog(['A']);
      expect(errors).toEqual([]);
      expect(container.textContent).toBe('A');

      // It throws in dispatch order too, so the reader throws it once the
      // action's update renders.
      await act(() => resolve());
      assertLog(['Caught: Oops', 'Caught: Oops']);
      expect(caughtErrors).toEqual(['Oops']);
      expect(container.textContent).toBe('Caught: Oops');
    });
  });
});
