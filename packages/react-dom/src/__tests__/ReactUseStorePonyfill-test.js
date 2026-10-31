/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 */

// A port of the test suite of the react-concurrent-store ponyfill
// (https://github.com/thejustinwalsh/react-concurrent-store, branch `main`,
// packages/use-store) to use(store). Test names match the originals, and each
// test says which file it comes from.
//
// API mapping:
// - stable `createStore(initial, reducer?)` -> `createStore(initial, reducer?)`
// - experimental `createStore(reducer, initial)` -> `createStore(initial, reducer)`
// - `store.dispatch(action)` -> `store.update(action)`
// - `useStore(store)` / `useStoreSelector(store, selector)` ->
//   `use(store)` / `selector(use(store))`. There are no selectors (DESIGN.md).
// - `<StoreProvider>` -> nothing. React tracks commits itself.
// - `store._listeners.length` -> `store._records.length`, the number of roots
//   that read the store. A record is dropped in the commit that unmounts its
//   last reader (DCP-11).
// - `store.getCommittedState()` -> `store._records[0].baseState`.
// - `createStoreFromSource` -> no equivalent: v1 doesn't wrap external
//   sources. The Redux and Relay use cases keep a React store next to the
//   external state and dispatch every action to both.
// - `render`/`act`/`fireEvent` from Testing Library -> ReactDOMClient roots,
//   internal `act`, and dispatched DOM events. `asFragment()` snapshots ->
//   `container.innerHTML`. `Logger` -> `Scheduler.log` and `assertLog`.
// - why-did-you-render's `toOnlyRerenderWhenPromiseChanges` -> the readers log
//   every render, and the log is asserted to have one render per change.
//
// Annotations:
// - GAP: the ponyfill has an API that use(store) doesn't, by design.
// - DIFFERS: use(store) behaves differently, and the test asserts our
//   behavior. The comment explains both.
// - BUG?: the test asserts our behavior, which looks wrong. The comment gives
//   the expected behavior.
//
// Where use(store) differs from the ponyfill:
//
// 1. No fixup render. When a reader mounts, or a reader's selector changes,
//    in a render that doesn't include a pending transition, the ponyfill first
//    renders the transition's state, then fixes it in a layout effect: two
//    renders, and the first one tears. use(store) computes the value for the
//    render's lanes, skips the transition's updates the same way useReducer
//    does, and adds the skipped lanes to the reader, so it renders once with
//    the committed state and again with the transition (DCP-3). The final,
//    rebased values are the same. The ponyfill lists the extra render as a
//    known issue. Tests: "Does not tear when new component mounts mid
//    transition", the three "...interrupting transition..." tests, "selector
//    changes sync during a transition update to the store", and "Using Redux
//    Toolkit's configureStore".
// 2. No stuck fallback. "gets stuck in suspense when transition state
//    suspends on mount" pins a ponyfill bug: a reader that mounts during a
//    transition renders the transition's state, suspends, and shows the
//    fallback. use(store) renders the committed state, so the new reader
//    shows it without suspending. The transition retries, and the readers
//    show the transition's state once it resolves.
// 3. Updates keep the priority they were dispatched with. The ponyfill's
//    stable useStore applies every change in startTransition, so an urgent
//    update that suspends never shows a fallback. use(store) renders it as
//    urgent, so the boundary shows its fallback, like useState. Wrapping the
//    update in startTransition gives the ponyfill's behavior ("should skip
//    suspense fallback when in a transition"). Test: "should handle
//    transition interruption and resolve to the final state".
// 4. A component can read different stores in different renders. The
//    ponyfill throws, because its useStoreSelector holds a store in a Hook
//    slot. use(store) has no Hook slot, so a component reads whichever stores
//    it reads in each render (DCP-2, DCP-8). Test: "dynamic stores are not yet
//    supported".
// 5. use() is polymorphic, so passing something that isn't a store throws
//    use()'s generic error instead of a store-specific one. Test: "should throw
//    error for invalid store type".
//
// What the port changed:
//
// - Render logs are asserted after each act, because internal act requires an
//   empty log. This is the only change in the stable useStore update tests.
// - Redux Toolkit isn't a dependency, so the Redux use case uses a minimal
//   hand-written Redux store.
// - The two Relay tests that check a component doesn't re-render need
//   selectors. Without them, every reader of a store re-renders when it
//   changes. They assert that instead, and that structural sharing still
//   keeps the identity of the values the children receive.
//
// The possible bug (BUG?), in "Does not miss sync updates triggered in
// useEffect or useLayoutEffect during a long-running transition": when no
// root reads a store yet, store.update() applies the action right away
// (ReactStore.js), including inside a transition. A reader that then mounts
// in an urgent render starts from the latest value, so it sees the
// transition's update before the transition's async action finishes. A
// useReducer in context would still show the old state. DCP-11 only
// prevents this when a root already has the update in its queue.

'use strict';

let React;
let ReactDOM;
let ReactDOMClient;
let Scheduler;
let act;
let use;
let useState;
let useEffect;
let useLayoutEffect;
let useCallback;
let useTransition;
let useMemo;
let useContext;
let createContext;
let memo;
let startTransition;
let Suspense;
let createStore;
let assertLog;

describe('ReactUseStorePonyfill', () => {
  let containers;

  beforeEach(() => {
    jest.resetModules();
    React = require('react');
    ReactDOM = require('react-dom');
    ReactDOMClient = require('react-dom/client');
    Scheduler = require('scheduler');
    act = require('internal-test-utils').act;
    use = React.use;
    useState = React.useState;
    useEffect = React.useEffect;
    useLayoutEffect = React.useLayoutEffect;
    useCallback = React.useCallback;
    useTransition = React.useTransition;
    useMemo = React.useMemo;
    useContext = React.useContext;
    createContext = React.createContext;
    memo = React.memo;
    startTransition = React.startTransition;
    Suspense = React.Suspense;
    createStore = React.unstable_createStore;

    const InternalTestUtils = require('internal-test-utils');
    assertLog = InternalTestUtils.assertLog;

    containers = [];
  });

  afterEach(async () => {
    // Testing Library's cleanup().
    for (let i = 0; i < containers.length; i++) {
      const {root, container} = containers[i];
      await act(() => root.unmount());
      container.remove();
    }
    containers = [];
  });

  // Testing Library's render(). Call it inside act.
  function render(element) {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOMClient.createRoot(container);
    const entry = {root, container};
    containers.push(entry);
    root.render(element);
    return {
      container,
      rerender(nextElement) {
        root.render(nextElement);
      },
      unmount() {
        root.unmount();
        container.remove();
        containers.splice(containers.indexOf(entry), 1);
      },
    };
  }

  function queryByTestId(container, testid) {
    return container.querySelector('[data-testid="' + testid + '"]');
  }

  function click(element) {
    element.dispatchEvent(new MouseEvent('click', {bubbles: true}));
  }

  // react-error-boundary's ErrorBoundary with a `fallback` prop.
  function createErrorBoundary() {
    return class ErrorBoundary extends React.Component {
      state = {error: null};
      static getDerivedStateFromError(error) {
        return {error};
      }
      render() {
        return this.state.error !== null
          ? this.props.fallback
          : this.props.children;
      }
    };
  }

  // ---------------------------------------------------------------------------
  // packages/use-store/src/useStore.spec.tsx
  // ---------------------------------------------------------------------------

  describe('wdyr', () => {
    // useStore.spec.tsx: "react should be monkey patched by WDYR"
    // GAP: this only checks the ponyfill's test setup, which patches React with
    // why-did-you-render. The readers below log their renders instead.
    it.skip('react should be monkey patched by WDYR', () => {});
  });

  describe('createStore', () => {
    // useStore.spec.tsx: "should create a store with initial value"
    // @gate enableStore
    it('should create a store with initial value', () => {
      const initialValue = {count: 0};
      const store = createStore(initialValue);

      expect(store).toBeDefined();
      expect(store.update).toBeDefined();
      expect(typeof store.update).toBe('function');
    });

    // useStore.spec.tsx: "should create a store with initial value and reducer"
    // @gate enableStore
    it('should create a store with initial value and reducer', () => {
      const initialValue = {count: 0};
      const reducer = (state, action) => {
        switch (action.type) {
          case 'INCREMENT':
            return {count: state.count + (action.payload || 1)};
          case 'DECREMENT':
            return {count: state.count - (action.payload || 1)};
          default:
            return state;
        }
      };

      const store = createStore(initialValue, reducer);

      expect(store).toBeDefined();
      expect(store.update).toBeDefined();
      expect(typeof store.update).toBe('function');
    });

    // useStore.spec.tsx: "should create store with primitive initial value"
    // @gate enableStore
    it('should create store with primitive initial value', () => {
      const store = createStore(42);

      expect(store).toBeDefined();
      expect(store.update).toBeDefined();
    });

    // useStore.spec.tsx: "should create store with string initial value"
    // @gate enableStore
    it('should create store with string initial value', () => {
      const store = createStore('hello');

      expect(store).toBeDefined();
      expect(store.update).toBeDefined();
    });

    // useStore.spec.tsx: "should create store with array initial value"
    // @gate enableStore
    it('should create store with array initial value', () => {
      const store = createStore([1, 2, 3]);

      expect(store).toBeDefined();
      expect(store.update).toBeDefined();
    });
  });

  describe('useStore', () => {
    // useStore.spec.tsx: "should return initial store value"
    // @gate enableStore
    it('should return initial store value', async () => {
      const initialValue = {count: 0};
      const store = createStore(initialValue);
      let result;

      const TestComponent = () => {
        result = use(store);
        Scheduler.log(result);
        return <div>{result.count}</div>;
      };

      await act(async () => {
        render(<TestComponent />);
      });

      expect(result).toEqual(initialValue);
      assertLog([{count: 0}]);
    });

    // useStore.spec.tsx: "should return initial primitive value"
    // @gate enableStore
    it('should return initial primitive value', async () => {
      const initialValue = 42;
      const store = createStore(initialValue);
      let result;

      const TestComponent = () => {
        result = use(store);
        Scheduler.log(result);
        return <div>{result}</div>;
      };

      await act(async () => {
        render(<TestComponent />);
      });

      expect(result).toBe(initialValue);
      assertLog([42]);
    });

    // useStore.spec.tsx: "should return initial string value"
    // @gate enableStore
    it('should return initial string value', async () => {
      const initialValue = 'hello world';
      const store = createStore(initialValue);
      let result;

      const TestComponent = () => {
        result = use(store);
        Scheduler.log(result);
        return <div>{result}</div>;
      };

      await act(async () => {
        render(<TestComponent />);
      });

      expect(result).toBe(initialValue);
      assertLog(['hello world']);
    });

    // useStore.spec.tsx: "should return initial array value"
    // @gate enableStore
    it('should return initial array value', async () => {
      const initialValue = [1, 2, 3];
      const store = createStore(initialValue);
      let result;

      const TestComponent = () => {
        result = use(store);
        Scheduler.log(result);
        return <div>{result.join(',')}</div>;
      };

      await act(async () => {
        render(<TestComponent />);
      });

      expect(result).toEqual(initialValue);
      assertLog([[1, 2, 3]]);
    });

    // useStore.spec.tsx: "should throw error for invalid store type"
    // @gate enableStore
    it('should throw error for invalid store type', async () => {
      const invalidStore = {
        $$typeof: Symbol.for('invalid'),
        update: () => {},
      };

      const TestComponent = () => {
        use(invalidStore);
        return <div>test</div>;
      };

      // DIFFERS: the ponyfill's useStore only accepts stores, and throws
      // "Invalid store type. Ensure you are using a valid React store." use()
      // accepts promises, contexts and stores, so an object that's none of
      // them gets use()'s generic error.
      await expect(
        act(() => {
          render(<TestComponent />);
        }),
      ).rejects.toThrow(
        'An unsupported type was passed to use(): [object Object]',
      );
    });

    // useStore.spec.tsx: "should update store value with reducer"
    // @gate enableStore
    it('should update store value with reducer', async () => {
      const initialValue = {count: 0};
      const reducer = (state, action) => {
        switch (action.type) {
          case 'INCREMENT':
            return {count: state.count + (action.payload || 1)};
          case 'DECREMENT':
            return {count: state.count - (action.payload || 1)};
          default:
            return state;
        }
      };

      const store = createStore(initialValue, reducer);
      let result;

      const TestComponent = () => {
        result = use(store);
        Scheduler.log(result.count);
        return <div>{result.count}</div>;
      };

      await act(async () => {
        return render(<TestComponent />);
      });

      expect(result).toEqual({count: 0});
      assertLog([0]);

      await act(async () => {
        store.update({type: 'INCREMENT'});
      });

      expect(result).toEqual({count: 1});
      assertLog([1]);

      await act(async () => {
        store.update({type: 'INCREMENT', payload: 3});
      });

      expect(result).toEqual({count: 4});
      assertLog([4]);

      await act(async () => {
        store.update({type: 'DECREMENT'});
      });

      expect(result).toEqual({count: 3});
      assertLog([3]);

      await act(async () => {
        store.update({type: 'DECREMENT', payload: 2});
      });

      expect(result).toEqual({count: 1});
      assertLog([1]);
    });

    // useStore.spec.tsx: "should work with array values"
    // @gate enableStore
    it('should work with array values', async () => {
      const initialValue = [1, 2, 3];
      const reducer = (state, action) => {
        switch (action.type) {
          case 'PUSH':
            return [...state, action.payload || 0];
          case 'POP':
            return state.slice(0, -1);
          default:
            return state;
        }
      };

      const store = createStore(initialValue, reducer);
      let result;

      const TestComponent = () => {
        result = use(store);
        Scheduler.log(result.join(','));
        return <div>{result.join(',')}</div>;
      };

      await act(async () => {
        return render(<TestComponent />);
      });

      expect(result).toEqual([1, 2, 3]);
      assertLog(['1,2,3']);

      await act(async () => {
        store.update({type: 'PUSH', payload: 4});
      });

      expect(result).toEqual([1, 2, 3, 4]);
      assertLog(['1,2,3,4']);

      await act(async () => {
        store.update({type: 'POP'});
      });

      expect(result).toEqual([1, 2, 3]);
      assertLog(['1,2,3']);
    });

    // useStore.spec.tsx: "should handle complex state updates"
    // @gate enableStore
    it('should handle complex state updates', async () => {
      const initialValue = {
        user: {name: 'John', age: 30},
        settings: {theme: 'light', notifications: true},
      };

      const reducer = (state, action) => {
        switch (action.type) {
          case 'UPDATE_USER':
            return {
              ...state,
              user: {...state.user, ...action.payload},
            };
          case 'UPDATE_SETTINGS':
            return {
              ...state,
              settings: {...state.settings, ...action.payload},
            };
          default:
            return state;
        }
      };

      const store = createStore(initialValue, reducer);
      let result;

      const TestComponent = () => {
        result = use(store);
        Scheduler.log('render');
        return <div>{result.user.name}</div>;
      };

      await act(async () => {
        render(<TestComponent />);
      });

      expect(result).toEqual({
        user: {name: 'John', age: 30},
        settings: {theme: 'light', notifications: true},
      });
      assertLog(['render']);

      await act(async () => {
        store.update({type: 'UPDATE_USER', payload: {age: 31}});
      });

      expect(result).toEqual({
        user: {name: 'John', age: 31},
        settings: {theme: 'light', notifications: true},
      });
      assertLog(['render']);

      await act(async () => {
        store.update({type: 'UPDATE_SETTINGS', payload: {theme: 'dark'}});
      });

      expect(result).toEqual({
        user: {name: 'John', age: 31},
        settings: {theme: 'dark', notifications: true},
      });
      assertLog(['render']);
    });

    // useStore.spec.tsx: "should work with multiple components using same store"
    // @gate enableStore
    it('should work with multiple components using same store', async () => {
      const initialValue = {count: 0};
      const reducer = (state, action) => {
        switch (action.type) {
          case 'INCREMENT':
            return {count: state.count + 1};
          default:
            return state;
        }
      };

      const store = createStore(initialValue, reducer);
      let result1;
      let result2;

      const TestComponent1 = () => {
        result1 = use(store);
        Scheduler.log('1: ' + result1.count);
        return <div data-testid="counter-1">{result1.count}</div>;
      };

      const TestComponent2 = () => {
        result2 = use(store);
        Scheduler.log('2: ' + result2.count);
        return <div data-testid="counter-2">{result2.count}</div>;
      };

      const App = () => (
        <div>
          <TestComponent1 />
          <TestComponent2 />
        </div>
      );

      const {container} = await act(async () => {
        return render(<App />);
      });

      expect(result1).toEqual({count: 0});
      expect(result2).toEqual({count: 0});
      expect(queryByTestId(container, 'counter-1').textContent).toBe('0');
      expect(queryByTestId(container, 'counter-2').textContent).toBe('0');
      assertLog(['1: 0', '2: 0']);

      await act(async () => {
        store.update({type: 'INCREMENT'});
      });

      expect(result1).toEqual({count: 1});
      expect(result2).toEqual({count: 1});
      expect(queryByTestId(container, 'counter-1').textContent).toBe('1');
      expect(queryByTestId(container, 'counter-2').textContent).toBe('1');
      assertLog(['1: 1', '2: 1']);
    });

    // useStore.spec.tsx: "should change value when updated without reducer"
    // @gate enableStore
    it('should change value when updated without reducer', async () => {
      const initialValue = {count: 0};
      const store = createStore(initialValue);

      let result;

      const TestComponent = () => {
        result = use(store);
        Scheduler.log(result.count);
        return <div>{result.count}</div>;
      };

      await act(async () => {
        return render(<TestComponent />);
      });

      expect(result).toEqual({count: 0});
      assertLog([0]);

      await act(async () => {
        store.update({count: 100});
      });

      expect(result).toEqual({count: 100});
      assertLog([100]);
    });

    // useStore.spec.tsx: "should change value when updated with setter"
    // @gate enableStore
    it('should change value when updated with setter', async () => {
      const initialValue = {count: 0};
      const increment = state => {
        return {count: state.count + 1};
      };
      const store = createStore(initialValue, increment);

      let result;

      const TestComponent = () => {
        result = use(store);
        Scheduler.log(result.count);
        return <div data-testid="counter">{result.count}</div>;
      };

      await act(async () => {
        return render(<TestComponent />);
      });

      expect(result).toEqual({count: 0});
      assertLog([0]);

      await act(async () => {
        store.update();
      });

      expect(result).toEqual({count: 1});
      assertLog([1]);
    });

    // useStore.spec.tsx: "should handle an initial value of undefined"
    // @gate enableStore
    it('should handle an initial value of undefined', async () => {
      const store = createStore(undefined);
      let result;

      const TestComponent = () => {
        result = use(store);
        Scheduler.log(result ?? 'undefined');
        return <div>{result ?? 'undefined'}</div>;
      };

      await act(async () => {
        return render(<TestComponent />);
      });

      expect(result).toBeUndefined();
      assertLog(['undefined']);

      await act(async () => {
        store.update(42);
      });

      expect(result).toBe(42);
      assertLog([42]);
    });
  });

  describe('useStore(suspense)', () => {
    // useStore.spec.tsx: "should suspend while loading"
    // @gate enableStore
    it('should suspend while loading', async () => {
      const ErrorBoundary = createErrorBoundary();
      let count;
      let resolve = () => {};

      const increment = () =>
        new Promise(res => {
          resolve = () => {
            count = count !== undefined ? count + 1 : 0;
            res(count);
          };
        });

      const store = createStore(increment());
      let result;

      const TestComponent = () => {
        const useable = use(store);
        result = use(useable);
        Scheduler.log(result);
        return <div data-testid="counter">{result}</div>;
      };

      const {container} = await act(async () => {
        return render(
          <ErrorBoundary
            fallback={<div data-testid="error-boundary">Error!</div>}>
            <Suspense fallback={<div data-testid="loading">Loading...</div>}>
              <TestComponent />
            </Suspense>
          </ErrorBoundary>,
        );
      });

      expect(result).toBeUndefined();
      expect(queryByTestId(container, 'loading')).not.toBe(null);

      await act(async () => resolve());

      expect(result).toBe(0);
      expect(queryByTestId(container, 'counter').textContent).toBe('0');
      assertLog([0]);
    });

    // useStore.spec.tsx: "should skip suspense fallback when in a transition"
    // @gate enableStore
    it('should skip suspense fallback when in a transition', async () => {
      const ErrorBoundary = createErrorBoundary();
      let count;
      let resolve = () => {};

      const increment = () =>
        new Promise(res => {
          resolve = () => {
            count = count !== undefined ? count + 1 : 0;
            res(count);
          };
        });

      const store = createStore(increment());

      const TestComponent = ({useable, isPending}) => {
        const result = use(useable);
        Scheduler.log({result, isPending});
        return (
          <div data-testid="counter" data-pending={String(isPending)}>
            {result}
          </div>
        );
      };

      const TestFixture = () => {
        const useable = use(store);
        const [isPending, startLocalTransition] = useTransition();
        const updateStore = useCallback(() => {
          startLocalTransition(() => {
            store.update(increment());
          });
        }, []);

        return (
          <ErrorBoundary
            fallback={<div data-testid="error-boundary">Error!</div>}>
            <button onClick={updateStore}>Increment</button>
            <Suspense fallback={<div data-testid="loading">Loading...</div>}>
              <TestComponent useable={useable} isPending={isPending} />
            </Suspense>
          </ErrorBoundary>
        );
      };

      const {container} = await act(async () => {
        return render(<TestFixture />);
      });

      // 1. Initially the component should suspend

      expect(queryByTestId(container, 'error-boundary')).toBe(null);
      expect(queryByTestId(container, 'loading')).not.toBe(null);

      await act(async () => resolve());

      expect(queryByTestId(container, 'loading')).toBe(null);
      expect(queryByTestId(container, 'counter').textContent).toBe('0');
      assertLog([{result: 0, isPending: false}]);

      // 2. A second update within a transition should not suspend

      const incrementButton = container.querySelector('button');
      await act(async () => {
        click(incrementButton);
      });

      expect(queryByTestId(container, 'error-boundary')).toBe(null);
      expect(queryByTestId(container, 'loading')).toBe(null);
      expect(
        queryByTestId(container, 'counter').getAttribute('data-pending'),
      ).toBe('true');
      assertLog([{result: 0, isPending: true}]);

      await act(async () => resolve());

      expect(
        queryByTestId(container, 'counter').getAttribute('data-pending'),
      ).toBe('false');
      expect(queryByTestId(container, 'counter').textContent).toBe('1');
      assertLog([{result: 1, isPending: false}]);
    });

    // useStore.spec.tsx: "should handle transition interruption and resolve to the final state"
    // @gate enableStore
    it('should handle transition interruption and resolve to the final state', async () => {
      const ErrorBoundary = createErrorBoundary();
      let resolve = () => {};

      const asyncCounter = count =>
        new Promise(res => {
          resolve = () => {
            res(count);
          };
        });

      const store = createStore(asyncCounter(0));

      const TestComponent = ({useable}) => {
        const result = use(useable);
        Scheduler.log(result);
        return <div data-testid="counter">{result}</div>;
      };

      const TestFixture = () => {
        const useable = use(store);
        const [currentCount, setCurrentCount] = useState(0);
        const updateStore = useCallback(nextCount => {
          setCurrentCount(nextCount);
          store.update(asyncCounter(nextCount));
        }, []);

        return (
          <ErrorBoundary
            fallback={<div data-testid="error-boundary">Error!</div>}>
            <button onClick={() => updateStore(currentCount + 1)}>
              Increment
            </button>
            <Suspense fallback={<div data-testid="loading">Loading...</div>}>
              <TestComponent useable={useable} />
            </Suspense>
          </ErrorBoundary>
        );
      };

      const {container} = await act(async () => {
        return render(<TestFixture />);
      });

      // 1. Initially the component should suspend

      expect(queryByTestId(container, 'error-boundary')).toBe(null);
      expect(queryByTestId(container, 'loading')).not.toBe(null);

      await act(async () => resolve());

      expect(queryByTestId(container, 'loading')).toBe(null);
      expect(queryByTestId(container, 'counter').textContent).toBe('0');
      assertLog([0]);

      // 2. A second update within a transition should not suspend

      // DIFFERS: the click calls store.update() outside of a transition. The
      // ponyfill's stable useStore always applies store changes with
      // startTransition (useStore.ts), so the update never shows a fallback.
      // use(store) renders an update with the priority it was dispatched with,
      // like useState: an urgent update that suspends an already revealed
      // boundary shows its fallback. Wrapping the update in startTransition
      // keeps the old content (see "should skip suspense fallback when in a
      // transition"). The final values are the same.
      const incrementButton = container.querySelector('button');
      await act(async () => {
        click(incrementButton);
      });

      expect(queryByTestId(container, 'error-boundary')).toBe(null);
      expect(queryByTestId(container, 'loading')).not.toBe(null);

      await act(async () => resolve());

      expect(queryByTestId(container, 'counter').textContent).toBe('1');
      assertLog([1]);

      // 3. If we update multiple times before the transition resolves, we should see the final state

      await act(async () => {
        click(incrementButton);
      });

      expect(queryByTestId(container, 'error-boundary')).toBe(null);
      expect(queryByTestId(container, 'loading')).not.toBe(null);

      await act(async () => {
        click(incrementButton);
      });

      expect(queryByTestId(container, 'error-boundary')).toBe(null);
      expect(queryByTestId(container, 'loading')).not.toBe(null);

      await act(async () => resolve());

      expect(queryByTestId(container, 'counter').textContent).toBe('3');
      assertLog([3]);
    });
  });

  // ---------------------------------------------------------------------------
  // packages/use-store/src/experimental/useStore.spec.tsx
  // ---------------------------------------------------------------------------

  // GAP: <StoreProvider> only exists because the ponyfill tracks commits in
  // userland. React tracks them itself.
  function StoreProvider({children}) {
    return children;
  }

  // The ponyfill's selector hook. There are no selectors: a component reads
  // the whole store and derives from it during render.
  function useStoreSelector(store, selector) {
    return selector(use(store));
  }

  // The ponyfill calls this `reducer`. It is renamed to avoid shadowing.
  function countReducer(state, action) {
    switch (action.type) {
      case 'INCREMENT':
        return state + 1;
      case 'DOUBLE':
        return state * 2;
      default:
        return state;
    }
  }

  function identity(v) {
    return v;
  }

  describe('Experimental Userland Store', () => {
    // experimental/useStore.spec.tsx: "Does not tear when new component mounts mid transition"
    // @gate enableStore
    it('Does not tear when new component mounts mid transition', async () => {
      const store = createStore(1, countReducer);

      function Count({testid}) {
        const count = useStoreSelector(store, identity);
        Scheduler.log({testid, count});
        return <div>{count}</div>;
      }

      let setShowOther;

      function App() {
        const [showOther, _setShowOther] = useState(false);
        // It's okay to leak set state in a test.
        setShowOther = _setShowOther;
        return (
          <StoreProvider>
            <Count testid="count" />
            {showOther && <Count testid="otherCount" />}
          </StoreProvider>
        );
      }

      const {container, unmount} = await act(async () => {
        return render(<App />);
      });

      assertLog([{testid: 'count', count: 1}]);

      // Check that we mount correctly
      expect(container.innerHTML).toBe('<div>1</div>');

      let resolve;

      // Start, but don't complete, a transition update
      await act(async () => {
        startTransition(async () => {
          store.update({type: 'INCREMENT'});
          await new Promise(_resolve => {
            resolve = _resolve;
          });
        });
      });

      assertLog([]);

      // Check that the update has not flushed yet
      expect(container.innerHTML).toBe('<div>1</div>');

      // Reveal a new component which must read state on mount
      await act(async () => {
        setShowOther(true);
      });

      // DIFFERS: the ponyfill renders the new reader with the transition
      // state, then fixes it up to the committed state in a layout effect, so
      // the reader renders twice. React reads the store with the render's
      // lanes: the new reader skips the pending transition update and renders
      // the committed value once. The skipped lane is merged into its fiber,
      // so it re-renders with the transition (DCP-3). No fixup render.
      assertLog([
        {testid: 'count', count: 1},
        {testid: 'otherCount', count: 1},
      ]);
      // Check we mount with the pre-transition state
      expect(container.innerHTML).toBe('<div>1</div><div>1</div>');

      // Complete the transition
      await act(async () => {
        resolve();
      });

      assertLog([
        {testid: 'count', count: 2},
        {testid: 'otherCount', count: 2},
      ]);

      // Check the original count component updated
      // Check the newly mounted count component updated
      expect(container.innerHTML).toBe('<div>2</div><div>2</div>');
      await act(() => unmount());
      expect(store._records.length).toBe(0);
    });

    // experimental/useStore.spec.tsx: "Does not tear when new component mounts in its own transition mid transition"
    // @gate enableStore
    it('Does not tear when new component mounts in its own transition mid transition', async () => {
      const store = createStore(1, countReducer);

      function Count({testid}) {
        const count = useStoreSelector(store, identity);
        Scheduler.log({testid, count});
        return <div>{count}</div>;
      }

      let setShowOther;

      function App() {
        const [showOther, _setShowOther] = useState(false);
        // It's okay to leak set state in a test.
        setShowOther = _setShowOther;
        return (
          <StoreProvider>
            <Count testid="count" />
            {showOther && <Count testid="otherCount" />}
          </StoreProvider>
        );
      }

      const {container, unmount} = await act(async () => {
        return render(<App />);
      });

      assertLog([{testid: 'count', count: 1}]);
      // Check that we mount correctly
      expect(container.innerHTML).toBe('<div>1</div>');

      let resolve;

      // Start, but don't complete, a transition update
      await act(async () => {
        startTransition(async () => {
          store.update({type: 'INCREMENT'});
          await new Promise(_resolve => {
            resolve = _resolve;
          });
        });
      });

      // Check that the update has not flushed yet
      expect(container.innerHTML).toBe('<div>1</div>');

      // Reveal a new component which must read state on mount
      await act(async () => {
        startTransition(() => {
          setShowOther(true);
        });
      });

      assertLog([]);

      // Complete the transition
      await act(async () => {
        resolve();
      });

      assertLog([
        {testid: 'count', count: 2},
        {testid: 'otherCount', count: 2},
      ]);

      // Check the original count component updated
      // Check the newly mounted count component updated
      expect(container.innerHTML).toBe('<div>2</div><div>2</div>');
      await act(() => unmount());
      expect(store._records.length).toBe(0);
    });

    // experimental/useStore.spec.tsx: "Does not miss updates triggered in useEffect or useLayoutEffect"
    // @gate enableStore
    it('Does not miss updates triggered in useEffect or useLayoutEffect', async () => {
      const store = createStore(1, countReducer);

      function Count({testid}) {
        const count = useStoreSelector(store, identity);
        Scheduler.log({testid, count});
        return <div>{count}</div>;
      }

      function IncrementOnMount() {
        useEffect(() => {
          startTransition(() => {
            store.update({type: 'INCREMENT'});
          });
        }, []);
        return null;
      }

      function IncrementTransitionOnLayout() {
        useLayoutEffect(() => {
          startTransition(() => {
            store.update({type: 'INCREMENT'});
          });
        }, []);
        return null;
      }

      const {rerender, container, unmount} = await act(async () => {
        return render(
          <StoreProvider>
            <IncrementOnMount />
            <Count testid="count" />
          </StoreProvider>,
        );
      });

      assertLog([
        {testid: 'count', count: 1},
        {testid: 'count', count: 2}, // Fixup render triggered by increment on mount
      ]);

      // Check that we mount correctly
      expect(container.innerHTML).toBe('<div>2</div>');

      await act(async () => {
        rerender(
          <StoreProvider>
            <Count testid="count" />
            <IncrementOnMount />
            <Count testid="otherCount" />
          </StoreProvider>,
        );
      });

      assertLog([
        {testid: 'count', count: 2},
        {testid: 'otherCount', count: 2},
        {testid: 'count', count: 3}, // Fixup render triggered by increment on mount
        {testid: 'otherCount', count: 3}, // Fixup render triggered by increment on mount
      ]);

      // Check that we mount correctly
      expect(container.innerHTML).toBe('<div>3</div><div>3</div>');

      await act(async () => {
        rerender(
          <StoreProvider>
            <IncrementTransitionOnLayout />
            <Count testid="count" />
          </StoreProvider>,
        );
      });

      assertLog([
        {testid: 'count', count: 3},
        {testid: 'count', count: 4}, // Fixup render triggered by increment on mount
      ]);

      // Check that we mount correctly
      expect(container.innerHTML).toBe('<div>4</div>');

      // store.getCommittedState()
      expect(store._records[0].baseState).toBe(4);

      await act(async () => {
        rerender(
          <StoreProvider>
            <Count testid="count" />
            <IncrementTransitionOnLayout />
            <Count testid="otherCount" />
          </StoreProvider>,
        );
      });

      assertLog([
        {testid: 'count', count: 4},
        {testid: 'otherCount', count: 4},
        {testid: 'count', count: 5}, // Fixup render triggered by increment on mount
        {testid: 'otherCount', count: 5}, // Fixup render triggered by increment on mount
      ]);
      expect(container.innerHTML).toBe('<div>5</div><div>5</div>');
      await act(() => unmount());
      expect(store._records.length).toBe(0);
    });

    // This should catch the case where fixups accidentally could get entangled with a transition when they should flush sync.
    // experimental/useStore.spec.tsx: "Does not miss sync updates triggered in useEffect or useLayoutEffect during a long-running transition"
    // @gate enableStore
    it('Does not miss sync updates triggered in useEffect or useLayoutEffect during a long-running transition', async () => {
      const store = createStore(2, countReducer);

      function Count({testid}) {
        const count = useStoreSelector(store, identity);
        Scheduler.log({testid, count});
        return <div>{count}</div>;
      }

      function IncrementOnMount() {
        useEffect(() => {
          store.update({type: 'INCREMENT'});
        }, []);
        return null;
      }

      function IncrementOnLayout() {
        useLayoutEffect(() => {
          store.update({type: 'INCREMENT'});
        }, []);
        return null;
      }

      // Start a long running transition that will run for the whole test. This
      // should catch cases where fixups get

      let resolve;
      startTransition(async () => {
        store.update({type: 'DOUBLE'});
        await new Promise(_resolve => {
          resolve = _resolve;
        });
      });

      const {rerender, container, unmount} = await act(async () => {
        return render(
          <StoreProvider>
            <IncrementOnMount />
            <Count testid="count" />
          </StoreProvider>,
        );
      });

      // BUG?: this asserts our behavior, which may be a bug. When the
      // transition dispatched DOUBLE, no root read the store, so there was no
      // root to queue the update in with a transition lane. A store with no records applies an update right away
      // (ReactStore.js), and a root that starts reading a store starts from
      // its head (DESIGN.md, #403). So DOUBLE is already in the value the
      // first render reads, even though the async action that dispatched it
      // is still pending, and the INCREMENT applies on top of it: 4, then 5.
      // The ponyfill tracks a committed value per store, without roots, so
      // it shows 4, fixes up to the committed value plus INCREMENT (2 + 1 =
      // 3), and only shows DOUBLE when the action finishes. Both end at
      // ((2 * 2) + 1 + 1 + 1 + 1) = 8, because the updates are applied in
      // dispatch order either way.
      // A reader that mounts in an urgent render sees a transition update
      // before the transition finishes. DCP-11 prevents exactly that when the
      // store had a record with the update queued ("a reader that mounts after
      // the last reader unmounted does not see a pending transition early"),
      // but not when the store had no record when the update was dispatched.
      assertLog([
        {testid: 'count', count: 4},
        {testid: 'count', count: 5},
      ]);

      // Check that we mount correctly
      expect(container.innerHTML).toBe('<div>5</div>');

      await act(async () => {
        rerender(
          <StoreProvider>
            <Count testid="count" />
            <IncrementOnMount />
            <Count testid="otherCount" />
          </StoreProvider>,
        );
      });

      // BUG?: see above. DOUBLE is already applied.
      assertLog([
        {testid: 'count', count: 5},
        {testid: 'otherCount', count: 5},
        {testid: 'count', count: 6}, // Re-render triggered by increment on mount
        {testid: 'otherCount', count: 6}, // Re-render triggered by increment on mount
      ]);

      // Check that we mount correctly
      expect(container.innerHTML).toBe('<div>6</div><div>6</div>');

      await act(async () => {
        rerender(
          <StoreProvider>
            <IncrementOnLayout />
            <Count testid="count" />
          </StoreProvider>,
        );
      });

      // BUG?: see above. DOUBLE is already applied.
      assertLog([
        {testid: 'count', count: 6},
        {testid: 'count', count: 7}, // Re-render triggered by increment on layout
      ]);

      // Check that we mount correctly
      expect(container.innerHTML).toBe('<div>7</div>');

      await act(async () => {
        rerender(
          <StoreProvider>
            <Count testid="count" />
            <IncrementOnLayout />
            <Count testid="otherCount" />
          </StoreProvider>,
        );
      });
      // BUG?: see above. DOUBLE is already applied.
      assertLog([
        {testid: 'count', count: 7},
        {testid: 'otherCount', count: 7},
        {testid: 'count', count: 8}, // Re-render triggered by increment on layout
        {testid: 'otherCount', count: 8}, // Re-render triggered by increment on layout
      ]);
      expect(container.innerHTML).toBe('<div>8</div><div>8</div>');

      // Not technically part of the test, but just for completeness, let's
      // confirm we get the right thing when the transition completes.
      await act(async () => {
        resolve();
      });
      // BUG?: nothing re-renders, because DOUBLE was applied when it was
      // dispatched. The final value is the same.
      assertLog([]);
      expect(container.innerHTML).toBe('<div>8</div><div>8</div>');
      await act(() => unmount());
      expect(store._records.length).toBe(0);
    });

    // experimental/useStore.spec.tsx: "Sync update interrupting transition correctly tracks committed state"
    // @gate enableStore
    it('Sync update interrupting transition correctly tracks committed state', async () => {
      const store = createStore(2, countReducer);

      function Count({testid}) {
        const count = useStoreSelector(store, identity);
        Scheduler.log({testid, count});
        return <div>{count}</div>;
      }

      let setShowOther;

      function App() {
        const [showOther, _setShowOther] = useState(false);
        // It's okay to leak set state in a test.
        setShowOther = _setShowOther;
        return (
          <StoreProvider>
            <Count testid="count" />
            {showOther && <Count testid="otherCount" />}
          </StoreProvider>
        );
      }

      const {container, unmount} = await act(async () => {
        return render(<App />);
      });

      assertLog([{testid: 'count', count: 2}]);

      expect(container.innerHTML).toBe('<div>2</div>');

      let resolve;

      // Start, but don't complete, a transition update
      await act(async () => {
        startTransition(async () => {
          store.update({type: 'DOUBLE'});
          await new Promise(_resolve => {
            resolve = _resolve;
          });
        });
      });

      assertLog([]);

      // Ensure no update is made yet
      expect(container.innerHTML).toBe('<div>2</div>');

      // Interrupt with a sync update
      await act(() => {
        store.update({type: 'INCREMENT'});
      });

      assertLog([{testid: 'count', count: 3}]);

      // Check that we flushed the sync update on top of the currently committed
      // state.
      expect(container.innerHTML).toBe('<div>3</div>');

      // Now mount a new component
      await act(async () => {
        setShowOther(true);
      });

      // DIFFERS: the ponyfill renders the new reader with the transition
      // state, then fixes it up to the committed state in a layout effect, so
      // the reader renders twice. React reads the store with the render's
      // lanes: the new reader skips the pending transition update and renders
      // the committed value once. The skipped lane is merged into its fiber,
      // so it re-renders with the transition (DCP-3). No fixup render.
      assertLog([
        {testid: 'count', count: 3},
        {testid: 'otherCount', count: 3},
      ]);

      // Check that we mount with the post-sync-update value
      expect(container.innerHTML).toBe('<div>3</div><div>3</div>');

      // Resolving the transition should flush the transition update...
      await act(async () => {
        resolve();
      });

      assertLog([
        {testid: 'count', count: 5},
        {testid: 'otherCount', count: 5},
      ]);

      // The new state should reflect the rebased action order:
      // Initial state: 2
      // DOUBLE (transition): 4
      // INCREMENT (sync): 5

      // (2 * 2) + 1 = 5
      expect(container.innerHTML).toBe('<div>5</div><div>5</div>');
      await act(() => unmount());
      expect(store._records.length).toBe(0);
    });

    // experimental/useStore.spec.tsx: "Multiple sync updates interrupting transition correctly tracks committed state"
    // @gate enableStore
    it('Multiple sync updates interrupting transition correctly tracks committed state', async () => {
      const store = createStore(2, countReducer);

      function Count({testid}) {
        const count = useStoreSelector(store, identity);
        Scheduler.log({testid, count});
        return <div>{count}</div>;
      }

      let setShowOther;

      function App() {
        const [showOther, _setShowOther] = useState(false);
        // It's okay to leak set state in a test.
        setShowOther = _setShowOther;
        return (
          <StoreProvider>
            <Count testid="count" />
            {showOther && <Count testid="otherCount" />}
          </StoreProvider>
        );
      }

      const {container, unmount} = await act(async () => {
        return render(<App />);
      });

      assertLog([{testid: 'count', count: 2}]);

      expect(container.innerHTML).toBe('<div>2</div>');

      let resolve;

      // Start, but don't complete, a transition update
      await act(async () => {
        startTransition(async () => {
          store.update({type: 'DOUBLE'});
          await new Promise(_resolve => {
            resolve = _resolve;
          });
        });
      });

      assertLog([]);

      // Ensure no update is made yet
      expect(container.innerHTML).toBe('<div>2</div>');

      // Interrupt with a sync update
      await act(() => {
        store.update({type: 'INCREMENT'});
        store.update({type: 'INCREMENT'});
      });

      assertLog([{testid: 'count', count: 4}]);

      // Check that we flushed the sync update on top of the currently comitted
      // state.
      expect(container.innerHTML).toBe('<div>4</div>');

      // Now mount a new component
      await act(async () => {
        setShowOther(true);
      });

      // DIFFERS: the ponyfill renders the new reader with the transition
      // state, then fixes it up to the committed state in a layout effect, so
      // the reader renders twice. React reads the store with the render's
      // lanes: the new reader skips the pending transition update and renders
      // the committed value once. The skipped lane is merged into its fiber,
      // so it re-renders with the transition (DCP-3). No fixup render.
      assertLog([
        {testid: 'count', count: 4},
        {testid: 'otherCount', count: 4},
      ]);

      // Check that we mount with the post-sync-update value
      expect(container.innerHTML).toBe('<div>4</div><div>4</div>');

      // Resolving the transition should flush the transition update...
      await act(async () => {
        resolve();
      });

      assertLog([
        {testid: 'count', count: 6},
        {testid: 'otherCount', count: 6},
      ]);

      // The new state should reflect the rebased action order:
      // Initial state: 2
      // DOUBLE (transition): 4
      // INCREMENT (sync): 5
      // INCREMENT (sync): 6

      // (2 * 2) + 1 + 1 = 6
      expect(container.innerHTML).toBe('<div>6</div><div>6</div>');
      await act(() => unmount());
      expect(store._records.length).toBe(0);
    });

    // experimental/useStore.spec.tsx: "flushSync update interrupting transition correctly tracks committed state"
    // @gate enableStore
    it('flushSync update interrupting transition correctly tracks committed state', async () => {
      const store = createStore(2, countReducer);

      function Count({testid}) {
        const count = useStoreSelector(store, identity);
        Scheduler.log({testid, count});
        return <div>{count}</div>;
      }

      let setShowOther;

      function App() {
        const [showOther, _setShowOther] = useState(false);
        // It's okay to leak set state in a test.
        setShowOther = _setShowOther;
        return (
          <StoreProvider>
            <Count testid="count" />
            {showOther && <Count testid="otherCount" />}
          </StoreProvider>
        );
      }

      const {container, unmount} = await act(async () => {
        return render(<App />);
      });

      assertLog([{testid: 'count', count: 2}]);

      expect(container.innerHTML).toBe('<div>2</div>');

      let resolve;

      // Start, but don't complete, a transition update
      await act(async () => {
        startTransition(async () => {
          store.update({type: 'INCREMENT'});
          await new Promise(_resolve => {
            resolve = _resolve;
          });
        });
      });

      assertLog([]);

      expect(container.innerHTML).toBe('<div>2</div>');

      // Interrupt with a flushSync update
      await act(async () => {
        ReactDOM.flushSync(() => {
          store.update({type: 'DOUBLE'});
        });
      });

      assertLog([{testid: 'count', count: 4}]);

      // Check that we flushed the sync update only
      expect(container.innerHTML).toBe('<div>4</div>');

      // Now mount a new component
      await act(async () => {
        setShowOther(true);
      });

      // DIFFERS: the ponyfill renders the new reader with the transition
      // state, then fixes it up to the committed state in a layout effect, so
      // the reader renders twice. React reads the store with the render's
      // lanes: the new reader skips the pending transition update and renders
      // the committed value once. The skipped lane is merged into its fiber,
      // so it re-renders with the transition (DCP-3). No fixup render.
      assertLog([
        {testid: 'count', count: 4},
        {testid: 'otherCount', count: 4},
      ]);

      // Check that we mount with the post-sync-update value
      expect(container.innerHTML).toBe('<div>4</div><div>4</div>');

      // Resolving the transition should flush the transition update...
      await act(async () => {
        resolve();
      });

      assertLog([
        {testid: 'count', count: 6},
        {testid: 'otherCount', count: 6},
      ]);

      // Now we see the state as if the state has updated in the order of
      // transition then sync.
      expect(container.innerHTML).toBe('<div>6</div><div>6</div>');
      await act(() => unmount());
      expect(store._records.length).toBe(0);
    });

    // experimental/useStore.spec.tsx: "correctly handles consecutive sync updates"
    // @gate enableStore
    it('correctly handles consecutive sync updates', async () => {
      const store = createStore(1, countReducer);

      function Count({testid}) {
        const count = useStoreSelector(store, identity);
        Scheduler.log({testid, count});
        return <div>{count}</div>;
      }

      function App() {
        return (
          <StoreProvider>
            <Count testid="count" />
          </StoreProvider>
        );
      }

      const {container, unmount} = await act(async () => {
        return render(<App />);
      });

      assertLog([{testid: 'count', count: 1}]);
      expect(container.innerHTML).toBe('<div>1</div>');

      await act(async () => {
        store.update({type: 'INCREMENT'});
        store.update({type: 'INCREMENT'});
      });

      // Autobatching means these flush together
      assertLog([{testid: 'count', count: 3}]);

      expect(container.innerHTML).toBe('<div>3</div>');
      await act(() => unmount());
      expect(store._records.length).toBe(0);
    });

    // experimental/useStore.spec.tsx: "dynamic stores are not yet supported"
    // @gate enableStore
    it('dynamic stores are not yet supported', async () => {
      const store1 = createStore(1, countReducer);
      const store2 = createStore(10, countReducer);

      let setStore;
      function Count({testid}) {
        const [store, _setStore] = useState(() => store1);
        setStore = _setStore;
        const count = useStoreSelector(store, identity);
        Scheduler.log({testid, count});
        return <div>{count}</div>;
      }

      function App() {
        return (
          <StoreProvider>
            <Count testid="count" />
          </StoreProvider>
        );
      }

      const {container, unmount} = await act(async () => {
        return render(<App />);
      });

      assertLog([{testid: 'count', count: 1}]);

      expect(container.innerHTML).toBe('<div>1</div>');

      // DIFFERS: the ponyfill throws "useStoreSelector does not currently
      // support dynamic stores". use(store) takes no hook slot, so a component
      // can read a different store on any render (DCP-2, DCP-8): it reads the
      // new store, subscribes to it and unsubscribes from the old one.
      await act(async () => {
        setStore(store2);
      });

      assertLog([{testid: 'count', count: 10}]);
      expect(container.innerHTML).toBe('<div>10</div>');
      expect(store1._records.length).toBe(0);
      expect(store2._records.length).toBe(1);
      await act(() => unmount());
      expect(store1._records.length).toBe(0);
      expect(store2._records.length).toBe(0);
    });

    // experimental/useStore.spec.tsx: "transition store update causes new store reader to mount"
    // @gate enableStore
    it('transition store update causes new store reader to mount', async () => {
      const store = createStore(1, countReducer);

      function Count({testid}) {
        const count = useStoreSelector(store, identity);
        Scheduler.log({action: 'render', testid, count});
        useEffect(() => {
          Scheduler.log({action: 'mount', testid, count});
        }, [count, testid]);
        return <div>{count}</div>;
      }
      function CountIfEven() {
        const count = useStoreSelector(store, identity);
        Scheduler.log({action: 'render', testid: 'countIfEven', count});
        return <>{count % 2 === 0 ? <Count testid="count" /> : null}</>;
      }

      function App() {
        return (
          <StoreProvider>
            <CountIfEven />
          </StoreProvider>
        );
      }

      const {container, unmount} = await act(async () => {
        return render(<App />);
      });

      assertLog([{action: 'render', testid: 'countIfEven', count: 1}]);

      expect(container.innerHTML).toBe('');

      await act(async () => {
        startTransition(() => {
          store.update({type: 'INCREMENT'});
        });
      });
      assertLog([
        {action: 'render', testid: 'countIfEven', count: 2},
        {action: 'render', testid: 'count', count: 2},
        {action: 'mount', testid: 'count', count: 2},
      ]);

      expect(container.innerHTML).toBe('<div>2</div>');
      await act(() => unmount());
      expect(store._records.length).toBe(0);
    });

    // Describes a limitation of our fixup logic: If a component mounts sync
    // mid-transition and observes store state such that it will suspend in the
    // _transition_ state but not in the _sync_ state, we will incorrectly get
    // stuck rendering the transition state (and showing a suspense fallback)
    // instead of showing the sync store state.
    // experimental/useStore.spec.tsx: "gets stuck in suspense when transition state suspends on mount"
    // @gate enableStore
    it('gets stuck in suspense when transition state suspends on mount', async () => {
      const store = createStore(1, countReducer);

      // Create a thenable that can be used for suspense but won't cause unhandled rejection
      let resolveSuspense;
      const suspensePromise = new Promise(resolve => {
        resolveSuspense = resolve;
      });

      function SuspendOnEven({testid}) {
        const count = useStoreSelector(store, identity);
        if (count % 2 === 0) {
          // React sets this
          if (suspensePromise.status !== 'fulfilled') {
            Scheduler.log({action: 'suspend', testid, count});
          }
          use(suspensePromise);
        }
        Scheduler.log({action: 'render', testid, count});
        return <div>{count}</div>;
      }

      let setShowOther;

      function App() {
        const [showOther, _setShowOther] = useState(false);
        setShowOther = _setShowOther;
        return (
          <StoreProvider>
            <Suspense fallback={<div>Loading...</div>}>
              <SuspendOnEven testid="count" />
              {showOther && <SuspendOnEven testid="otherCount" />}
            </Suspense>
          </StoreProvider>
        );
      }

      const {container, unmount} = await act(async () => {
        return render(<App />);
      });

      // Initial render is fine
      assertLog([{action: 'render', testid: 'count', count: 1}]);
      expect(container.innerHTML).toBe('<div>1</div>');

      // We increment the state in a transtion and the currently mounted component should
      // suspend delaying the transition update.
      await act(async () => {
        startTransition(() => {
          store.update({type: 'INCREMENT'});
        });
      });

      // We try to render the new state, and suspend...
      assertLog([{action: 'suspend', testid: 'count', count: 2}]);

      // ...and keep showing the old state due to the transition.
      expect(container.innerHTML).toBe('<div>1</div>');

      // Now a sync update _should_ reveal the new component in the pre-transition
      // state.
      await act(async () => {
        setShowOther(true);
      });

      // DIFFERS: this test pins a bug in the ponyfill, and use(store) doesn't
      // have it. The ponyfill renders the new component with the transition
      // state, which suspends, so the fixup never runs and the boundary shows
      // its fallback. Here the sync render skips the pending transition update
      // (DCP-3), so the new component renders the committed value, 1, and
      // commits. Then the transition renders again, and both readers suspend
      // on the transition state, which keeps the committed content.
      assertLog([
        // The parent rerenders with the new `showOther` state
        {action: 'render', testid: 'count', count: 1},
        // The new component renders the pre-transition state
        {action: 'render', testid: 'otherCount', count: 1},

        // The transition renders again with both readers, and suspends
        {action: 'suspend', testid: 'count', count: 2},
        {action: 'suspend', testid: 'otherCount', count: 2},
      ]);

      // No fallback: we show the pre-transition state, "1", in both readers.
      expect(container.innerHTML).toBe('<div>1</div><div>1</div>');

      // We now resolve the suspense
      await act(async () => {
        resolveSuspense();
      });

      // We are now able to render cleanly with the new transition state
      assertLog([
        {action: 'render', testid: 'count', count: 2},
        {action: 'render', testid: 'otherCount', count: 2},
      ]);

      // The transition is now complete and we do end up in the right place.
      // DIFFERS: the first reader was never hidden, so it has no style
      // attribute left over from display: none.
      expect(container.innerHTML).toBe('<div>2</div><div>2</div>');
      await act(() => unmount());
      expect(store._records.length).toBe(0);
    });

    // experimental/useStore.spec.tsx: "can read from multiple different stores updating independently"
    // @gate enableStore
    it('can read from multiple different stores updating independently', async () => {
      const storeA = createStore(1, countReducer);
      const storeB = createStore(50, countReducer);

      function CountA() {
        const count = useStoreSelector(storeA, identity);
        Scheduler.log({type: 'render', testid: 'CountA', count});
        return <div>A: {count}</div>;
      }
      function CountB() {
        const count = useStoreSelector(storeB, identity);
        Scheduler.log({type: 'render', testid: 'CountB', count});
        return <div>B: {count}</div>;
      }

      function App() {
        return (
          <StoreProvider>
            <CountA />
            <CountB />
          </StoreProvider>
        );
      }

      const {container, unmount} = await act(async () => {
        return render(<App />);
      });

      expect(container.innerHTML).toBe('<div>A: 1</div><div>B: 50</div>');
      assertLog([
        {
          type: 'render',
          testid: 'CountA',
          count: 1,
        },
        {
          type: 'render',
          testid: 'CountB',
          count: 50,
        },
      ]);
      await act(async () => {
        storeB.update({type: 'INCREMENT'});
      });

      assertLog([
        {
          type: 'render',
          testid: 'CountB',
          count: 51,
        },
      ]);

      await act(() => unmount());

      expect(storeA._records.length).toBe(0);
      expect(storeB._records.length).toBe(0);
    });
  });

  describe('Selectors can be dynamic', () => {
    // experimental/useStore.spec.tsx: "dynamic selectors are supported"
    // @gate enableStore
    it('dynamic selectors are supported', async () => {
      const store = createStore(1, countReducer);

      let setSelector;
      function Count({testid}) {
        const [selector, _setSelector] = useState(() => identity);
        setSelector = _setSelector;
        const count = useStoreSelector(store, selector);
        Scheduler.log({testid, count});
        return <div>{count}</div>;
      }

      function App() {
        return (
          <StoreProvider>
            <Count testid="count" />
          </StoreProvider>
        );
      }

      const {container, unmount} = await act(async () => {
        return render(<App />);
      });

      assertLog([{testid: 'count', count: 1}]);

      expect(container.innerHTML).toBe('<div>1</div>');

      await act(async () => {
        setSelector(() => s => s * 2);
      });

      assertLog([{testid: 'count', count: 2}]);

      expect(container.innerHTML).toBe('<div>2</div>');

      await act(() => unmount());
      expect(store._records.length).toBe(0);
    });

    // experimental/useStore.spec.tsx: "selector changes sync during a transition update to the store"
    // @gate enableStore
    it('selector changes sync during a transition update to the store', async () => {
      const store = createStore(1, countReducer);

      let setSelector;
      function Count({testid}) {
        const [selector, _setSelector] = useState(() => identity);
        setSelector = _setSelector;
        const count = useStoreSelector(store, selector);
        Scheduler.log({testid, count});
        return <div>{count}</div>;
      }

      function App() {
        return (
          <StoreProvider>
            <Count testid="count" />
          </StoreProvider>
        );
      }

      const {container, unmount} = await act(async () => {
        return render(<App />);
      });

      assertLog([{testid: 'count', count: 1}]);

      expect(container.innerHTML).toBe('<div>1</div>');

      let resolve;

      const promise = new Promise(_resolve => {
        resolve = _resolve;
      });

      await act(async () => {
        startTransition(async () => {
          store.update({type: 'INCREMENT'});
          await promise;
        });
      });

      await act(async () => {
        setSelector(() => s => s * 2);
      });

      // DIFFERS: the ponyfill runs the new selector on the transition state
      // (4), then fixes it up to the committed state (2) in a layout effect.
      // Here the selector runs during render on the value the render reads,
      // which skips the pending transition update, so it renders 2 once.
      assertLog([{testid: 'count', count: 2}]);

      expect(container.innerHTML).toBe('<div>2</div>');

      await act(async () => {
        resolve();
      });

      assertLog([
        // Now we render the transition state
        {testid: 'count', count: 4},
      ]);

      expect(container.innerHTML).toBe('<div>4</div>');

      await act(() => unmount());
      expect(store._records.length).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // packages/use-store/src/experimental/testUseCases/reduxUseCase.spec.tsx
  // ---------------------------------------------------------------------------

  describe('createStore for Redux', () => {
    // GAP: Redux Toolkit isn't a dependency of this repo, so this is a minimal
    // Redux store with the same API (createStore with enhancers, getState,
    // dispatch, subscribe) and a hand written version of the counter slice.
    function createReduxStore(rootReducer, preloadedState) {
      let state =
        preloadedState === undefined
          ? rootReducer(undefined, {type: '@@redux/INIT'})
          : preloadedState;
      let listeners = [];
      return {
        getState: () => state,
        dispatch(action) {
          state = rootReducer(state, action);
          listeners.forEach(listener => listener());
          return action;
        },
        subscribe(listener) {
          listeners.push(listener);
          return () => {
            listeners = listeners.filter(l => l !== listener);
          };
        },
      };
    }

    function configureStore({reducer: reducers, enhancers}) {
      const rootReducer = combineReducers(reducers);
      const enhancer = enhancers(() => []).reduce(
        (create, enhance) => enhance(create),
        createReduxStore,
      );
      return enhancer(rootReducer);
    }

    function combineReducers(reducers) {
      return (state = {}, action) => {
        const next = {};
        let changed = false;
        for (const key in reducers) {
          next[key] = reducers[key](state[key], action);
          changed = changed || next[key] !== state[key];
        }
        return changed ? next : state;
      };
    }

    // Sketch of a possible way to produce a React store alongside a Redux
    // store using Redux's enhancer mechanism.
    //
    // GAP: the ponyfill wraps the Redux store with createStoreFromSource, so
    // React reads Redux's state and only uses the reducer to compute temporary
    // states. use(store) doesn't wrap external sources in v1, so the React
    // store keeps its own state, created from Redux's, and every action is
    // dispatched to both.
    const addReactStore = createReduxStoreInner => {
      return (rootReducer, preloadedState) => {
        const store = createReduxStoreInner(rootReducer, preloadedState);

        const reactStore = createStore(store.getState(), rootReducer);

        function dispatch(action) {
          store.dispatch(action);
          reactStore.update(action);
        }

        return {...store, dispatch, reactStore};
      };
    };

    // reduxUseCase.spec.tsx: "Using Redux Toolkit's configureStore"
    // @gate enableStore
    it("Using Redux Toolkit's configureStore", async () => {
      // createSlice({name: 'counter', initialState: {value: 1}, reducers: {...}})
      const counterReducer = (state = {value: 1}, action) => {
        switch (action.type) {
          case 'counter/increment':
            return {...state, value: state.value + 1};
          case 'counter/decrement':
            return {...state, value: state.value - 1};
          default:
            return state;
        }
      };
      const increment = () => ({type: 'counter/increment'});

      const reduxStore = configureStore({
        reducer: {counter: counterReducer},
        enhancers: getDefaultEnhancers => {
          return getDefaultEnhancers().concat(addReactStore);
        },
      });

      const store = reduxStore.reactStore;

      // Selector
      function getCount(state) {
        return state.counter.value;
      }

      function Count({testid}) {
        const count = useStoreSelector(store, getCount);
        Scheduler.log({testid, count});
        return <div>{count}</div>;
      }

      let setShowOther;

      function App() {
        const [showOther, _setShowOther] = useState(false);
        // It's okay to leak set state in a test.
        setShowOther = _setShowOther;
        return (
          <StoreProvider>
            <Count testid="count" />
            {showOther && <Count testid="otherCount" />}
          </StoreProvider>
        );
      }

      const {container, unmount} = await act(async () => {
        return render(<App />);
      });

      assertLog([{testid: 'count', count: 1}]);

      // Check that we mount correctly
      expect(container.innerHTML).toBe('<div>1</div>');

      let resolve;

      // Start, but don't complete, a transition update
      await act(async () => {
        startTransition(async () => {
          reduxStore.dispatch(increment());
          await new Promise(_resolve => {
            resolve = _resolve;
          });
        });
      });

      assertLog([]);

      // Check that the update has not flushed yet
      expect(container.innerHTML).toBe('<div>1</div>');

      // Reveal a new component which must read state on mount
      await act(async () => {
        setShowOther(true);
      });

      // DIFFERS: the ponyfill renders the new reader with the transition
      // state, then fixes it up to the committed state in a layout effect, so
      // the reader renders twice. React reads the store with the render's
      // lanes: the new reader skips the pending transition update and renders
      // the committed value once. The skipped lane is merged into its fiber,
      // so it re-renders with the transition (DCP-3). No fixup render.
      assertLog([
        {testid: 'count', count: 1},
        {testid: 'otherCount', count: 1},
      ]);
      // Check we mount with the pre-transition state
      expect(container.innerHTML).toBe('<div>1</div><div>1</div>');

      // Complete the transition
      await act(async () => {
        resolve();
      });

      assertLog([
        {testid: 'count', count: 2},
        {testid: 'otherCount', count: 2},
      ]);

      // Check the original count component updated
      // Check the newly mounted count component updated
      expect(container.innerHTML).toBe('<div>2</div><div>2</div>');
      await act(() => unmount());
      expect(store._records.length).toBe(0);
    });
  });

  // ---------------------------------------------------------------------------
  // packages/use-store/src/experimental/testUseCases/relayUseCase.spec.tsx
  // (and MiniRelay.tsx)
  // ---------------------------------------------------------------------------

  describe('createStore for a Relay-like state solution', () => {
    // A minimal implementation of a key value store that works similarly to
    // Relay's store API. Ported from MiniRelay.tsx.
    class RecordSource {
      _records = new Map();
      _older = null;

      get(id) {
        const value = this._records.get(id);
        if (value === undefined && this._older != null) {
          return this._older.get(id);
        }
        return value;
      }

      set(id, record) {
        this._records.set(id, record);
      }

      delete(id) {
        this._records.delete(id);
      }

      keysChangedInThisVersion(keys) {
        let changed = false;
        keys.forEach(key => {
          if (this._records.has(key)) {
            changed = true;
          }
        });
        return changed;
      }
    }

    // GAP: the ponyfill wraps the RelayStore's source with
    // createStoreFromSource. Here the React store holds the RecordSource
    // itself, and its reducer applies an updater, like the source's reducer.
    class RelayStore {
      constructor() {
        this.reactStore = createStore(
          new RecordSource(),
          (recordSource, updater) => updater(recordSource),
        );
      }

      publishAndNotify(updater) {
        const wrapped = wrapUpdater(updater);
        this.reactStore.update(wrapped);
      }
    }

    function read(source, fragment, ref) {
      const seenIds = new Set();
      const rootRecord = source.get(ref.startingID);
      if (rootRecord == null) {
        throw new Error('No record found for id: ' + ref.startingID);
      }
      const rootData = {};
      readNode(source, rootRecord, fragment, rootData, seenIds);
      return {seenIds, value: rootData};
    }

    function readNode(source, record, node, data, seenIds) {
      seenIds.add(record.id);
      switch (node.kind) {
        case 'scalar':
          data[node.fieldName] = record[node.fieldName];
          return;
        case 'object': {
          const newData = {};
          const id = record[node.fieldName];
          if (id == null) {
            throw new Error('No id found for field: ' + node.fieldName);
          }
          const newRecord = source.get(id);
          if (newRecord == null) {
            throw new Error('No record found for id: ' + record.id);
          }
          node.selections.forEach(selection => {
            readNode(source, newRecord, selection, newData, seenIds);
          });
          data[node.fieldName] = newData;
          return;
        }
        case 'spread':
          data[node.alias] = {
            startingID: record.id,
          };
          return;
        default: {
          throw new Error('Unknown node kind: ' + node.kind);
        }
      }
    }

    // Turns an `updater` function which returns a sparse RecordSource
    // containing only the changed records into one which chains the new source
    // onto the previous source for lookups of unchanged records.
    function wrapUpdater(updater) {
      return source => {
        const next = updater(source);
        next._older = source;
        return next;
      };
    }

    let relayContext;
    function RelayProvider({children, store}) {
      return (
        <relayContext.Provider value={store}>{children}</relayContext.Provider>
      );
    }

    function useRelayStore() {
      const store = useContext(relayContext);
      if (store == null) {
        throw new Error('No RelayStore found in context');
      }
      return store;
    }

    function useFragment(fragment, ref) {
      const store = useRelayStore();
      const selector = useMemo(() => {
        const cache = new WeakMap();
        return state => {
          if (cache.has(state)) {
            return cache.get(state).value;
          }
          // If we have a cached value for the immediate older source, we can
          // attempt to reuse it.
          if (state._older != null && cache.has(state._older)) {
            const previousValue = cache.get(state._older);

            // Maybe none of the keys that changed in the new state were
            // relevant to this fragment. In that case, we can reuse the
            // previous value as-is.
            if (!state.keysChangedInThisVersion(previousValue.seenIds)) {
              cache.set(state, previousValue);
              return previousValue.value;
            }

            // We are forced to reread, however, we can try to recycle nodes
            // from the previous value to avoid unnecessary object identity
            // changes.
            const newValue = read(state, fragment, ref);
            const recycledValue = recycleNodesInto(previousValue, newValue);
            cache.set(state, recycledValue);
            return newValue.value;
          }

          const newValue = read(state, fragment, ref);
          cache.set(state, newValue);
          return newValue.value;
        };
      }, [fragment, ref]);
      return useStoreSelector(store.reactStore, selector);
    }

    // Recycles subtrees from `prevData` by replacing equal subtrees in
    // `nextData`.
    function recycleNodesInto(prevData, nextData) {
      if (
        prevData === nextData ||
        typeof prevData !== 'object' ||
        !prevData ||
        (prevData.constructor !== Object && !Array.isArray(prevData)) ||
        typeof nextData !== 'object' ||
        !nextData ||
        (nextData.constructor !== Object && !Array.isArray(nextData))
      ) {
        return nextData;
      }
      let canRecycle = false;

      const prevArray = Array.isArray(prevData) ? prevData : null;
      const nextArray = Array.isArray(nextData) ? nextData : null;
      if (prevArray && nextArray) {
        canRecycle =
          nextArray.reduce((wasEqual, nextItem, ii) => {
            const prevValue = prevArray[ii];
            const nextValue = recycleNodesInto(prevValue, nextItem);
            if (nextValue !== nextArray[ii]) {
              nextArray[ii] = nextValue;
            }
            return wasEqual && nextValue === prevArray[ii];
          }, true) && prevArray.length === nextArray.length;
      } else if (!prevArray && !nextArray) {
        const prevObject = prevData;
        const nextObject = nextData;
        const prevKeys = Object.keys(prevObject);
        const nextKeys = Object.keys(nextObject);
        canRecycle =
          nextKeys.reduce((wasEqual, key) => {
            const prevValue = prevObject[key];
            const nextValue = recycleNodesInto(prevValue, nextObject[key]);
            if (nextValue !== nextObject[key]) {
              nextObject[key] = nextValue;
            }
            return wasEqual && nextValue === prevObject[key];
          }, true) && prevKeys.length === nextKeys.length;
      }
      return canRecycle ? prevData : nextData;
    }

    function initialize(_prev) {
      const next = new RecordSource();
      next.set('ROOT', {id: 'ROOT', me: '1'});
      next.set('1', {id: '1', name: 'Alice', friend: '2'});
      next.set('2', {id: '2', name: 'Bob', friend: '1'});
      return next;
    }

    beforeEach(() => {
      relayContext = createContext(null);
    });

    // relayUseCase.spec.tsx: "Minimal example of MiniRelay"
    // @gate enableStore
    it('Minimal example of MiniRelay', async () => {
      const FRAGMENT = {
        kind: 'object',
        fieldName: 'me',
        selections: [
          {kind: 'scalar', fieldName: 'id'},
          {kind: 'scalar', fieldName: 'name'},
          {
            kind: 'object',
            fieldName: 'friend',
            selections: [
              {kind: 'scalar', fieldName: 'id'},
              {kind: 'scalar', fieldName: 'name'},
              {
                kind: 'object',
                fieldName: 'friend',
                selections: [
                  {kind: 'scalar', fieldName: 'id'},
                  {kind: 'scalar', fieldName: 'name'},
                ],
              },
            ],
          },
        ],
      };
      const store = new RelayStore();
      store.publishAndNotify(initialize);

      const ref = {startingID: 'ROOT'};
      function FragmentComponent() {
        Scheduler.log({type: 'render'});
        const data = useFragment(FRAGMENT, ref);
        return (
          <div>
            Hello! My name is {data.me.name} (id: {data.me.id})
            <br />
            and my friend is {data.me.friend.name} (id: {data.me.friend.id})
            <br />
            and their friend is {data.me.friend.friend.name} (id:{' '}
            {data.me.friend.friend.id})
          </div>
        );
      }

      function App() {
        return (
          <StoreProvider>
            <RelayProvider store={store}>
              <FragmentComponent />
            </RelayProvider>
          </StoreProvider>
        );
      }

      const {container, unmount} = await act(async () => {
        return render(<App />);
      });

      assertLog([{type: 'render'}]);
      expect(container.textContent).toBe(
        'Hello! My name is Alice (id: 1)' +
          'and my friend is Bob (id: 2)' +
          'and their friend is Alice (id: 1)',
      );

      await act(async () => {
        store.publishAndNotify(prev => {
          const next = new RecordSource();
          next.set('1', {id: '1', name: 'MALICE', friend: '1'});
          return next;
        });
      });
      assertLog([{type: 'render'}]);

      expect(container.textContent).toBe(
        'Hello! My name is MALICE (id: 1)' +
          'and my friend is MALICE (id: 1)' +
          'and their friend is MALICE (id: 1)',
      );

      await act(() => unmount());
    });

    // relayUseCase.spec.tsx: "Avoids rerendering the component if the fragment value computes the same output"
    // @gate enableStore
    it('Avoids rerendering the component if the fragment value computes the same output', async () => {
      const store = new RelayStore();
      store.publishAndNotify(initialize);

      const FRAGMENT = {
        kind: 'object',
        fieldName: 'me',
        selections: [{kind: 'scalar', fieldName: 'id'}],
      };

      const ref = {startingID: 'ROOT'};

      function FragmentComponent() {
        Scheduler.log({type: 'render'});
        const data = useFragment(FRAGMENT, ref);
        return <div>Hello! My id is {data.me.id}</div>;
      }

      function App() {
        return (
          <StoreProvider>
            <RelayProvider store={store}>
              <FragmentComponent />
            </RelayProvider>
          </StoreProvider>
        );
      }

      const {container, unmount} = await act(async () => {
        return render(<App />);
      });

      assertLog([{type: 'render'}]);
      expect(container.innerHTML).toBe('<div>Hello! My id is 1</div>');

      await act(async () => {
        store.publishAndNotify(_prev => {
          const next = new RecordSource();
          next.set('1', {id: '1', name: 'MALICE', friend: '1'});
          return next;
        });
      });

      // Because the fragment only selects `id`, and `id` did not change,
      // the component should not rerender.
      // GAP: there are no selectors (DESIGN.md), so every reader of a store
      // re-renders when its value changes. The ponyfill's useStoreSelector
      // compares the selected value and skips the render. Here the component
      // renders, the selector's cache returns the previous fragment value, and
      // the output is the same.
      assertLog([{type: 'render'}]);

      expect(container.innerHTML).toBe('<div>Hello! My id is 1</div>');

      await act(() => unmount());
    });

    // relayUseCase.spec.tsx: "Implements structural sharing such that substructures remain referential identical even if parent object change"
    // @gate enableStore
    it('Implements structural sharing such that substructures remain referential identical even if parent object change', async () => {
      const store = new RelayStore();
      store.publishAndNotify(initialize);

      const FRAGMENT = {
        kind: 'object',
        fieldName: 'me',
        selections: [
          {kind: 'scalar', fieldName: 'name'},
          {kind: 'scalar', fieldName: 'id'},
          {
            kind: 'object',
            fieldName: 'friend',
            selections: [{kind: 'spread', alias: 'fragment'}],
          },
        ],
      };

      const ref = {startingID: 'ROOT'};
      function FragmentComponent() {
        Scheduler.log({type: 'render'});
        const data = useFragment(FRAGMENT, ref);

        return (
          <>
            <div>Hello! My name is {data.me.name}</div>
            <div>
              My friend's name is{' '}
              <ChildFragmentComponent user={data.me.friend.fragment} />
            </div>
          </>
        );
      }

      const CHILD_FRAGMENT = {
        kind: 'scalar',
        fieldName: 'name',
      };

      const childUserRefs = [];
      const ChildFragmentComponent = memo(({user: userRef}) => {
        Scheduler.log({type: 'child-render'});
        childUserRefs.push(userRef);
        const user = useFragment(CHILD_FRAGMENT, userRef);
        return user.name;
      });

      function App() {
        return (
          <StoreProvider>
            <RelayProvider store={store}>
              <FragmentComponent />
            </RelayProvider>
          </StoreProvider>
        );
      }

      const {container, unmount} = await act(async () => {
        return render(<App />);
      });

      assertLog([{type: 'render'}, {type: 'child-render'}]);
      expect(container.innerHTML).toBe(
        "<div>Hello! My name is Alice</div><div>My friend's name is Bob</div>",
      );

      await act(async () => {
        store.publishAndNotify(_prev => {
          const next = new RecordSource();
          next.set('1', {id: '1', name: 'MALICE', friend: '2'});
          return next;
        });
      });

      // Because the child fragment id is stable, and the data is structurally
      // shared AND the child component is momoized, the child component does not
      // need to rerender.
      // GAP: there are no selectors (DESIGN.md). The child reads the store
      // itself through useFragment, so it re-renders when the store changes,
      // even though memo() skips the re-render from its parent: its props are
      // the same object, structural sharing works. Without a selector there's
      // nothing to compare the child's fragment value with before it renders.
      assertLog([{type: 'render'}, {type: 'child-render'}]);
      // The structural sharing still works: the child got the same ref.
      expect(childUserRefs.length).toBe(2);
      expect(childUserRefs[1]).toBe(childUserRefs[0]);

      expect(container.innerHTML).toBe(
        "<div>Hello! My name is MALICE</div><div>My friend's name is Bob</div>",
      );

      await act(() => unmount());
    });
  });
});
