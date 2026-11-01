/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 * @jest-environment node
 */

/* eslint-disable no-func-assign */

'use strict';

// use(store) cases converted from ReactHooks-test.internal.js, kept where a
// store behaves differently from useState or exercises store machinery: eager
// bailouts when the store's queue is empty, rebasing a skipped update,
// render-phase store updates, reducers that run without a dispatcher, and
// reading a store where Hooks aren't allowed.

let React;
let ReactTestRenderer;
let Scheduler;
let act;
let assertLog;
let assertConsoleErrorDev;
let waitForAll;
let use;
let createStore;

describe('ReactHooks', () => {
  beforeEach(() => {
    jest.resetModules();
    React = require('react');
    ReactTestRenderer = require('react-test-renderer');
    Scheduler = require('scheduler');
    act = require('internal-test-utils').act;

    const InternalTestUtils = require('internal-test-utils');
    assertLog = InternalTestUtils.assertLog;
    assertConsoleErrorDev = InternalTestUtils.assertConsoleErrorDev;
    waitForAll = InternalTestUtils.waitForAll;
    use = React.use;
    createStore = React.unstable_createStore;
  });

  function storeUpdateInRenderWarning(name, owner = name) {
    return (
      'Cannot update a store while rendering a component (`' +
      name +
      '`). Updating a store is a side effect, so it should happen in an ' +
      'event handler or an effect. The update will be rendered after the ' +
      'current render. To locate the bad store.update() call inside `' +
      name +
      '`, follow the stack trace as described in ' +
      'https://react.dev/link/setstate-in-render\n' +
      '    in ' +
      owner +
      ' (at **)'
    );
  }

  // @gate enableStore
  it('bails out in the render phase if all of the state is the same', async () => {
    const {useLayoutEffect} = React;

    function Child({text}) {
      Scheduler.log('Child: ' + text);
      return text;
    }

    const counter1Store = createStore(0);
    const counter2Store = createStore(0);
    const setCounter1 = counter1Store.update;
    const setCounter2 = counter2Store.update;
    function Parent() {
      const counter1 = use(counter1Store);
      const counter2 = use(counter2Store);

      const text = `${counter1}, ${counter2}`;
      Scheduler.log(`Parent: ${text}`);
      useLayoutEffect(() => {
        Scheduler.log(`Effect: ${text}`);
      });
      return <Child text={text} />;
    }

    const root = ReactTestRenderer.create(null, {unstable_isConcurrent: true});
    root.update(<Parent />);
    await waitForAll(['Parent: 0, 0', 'Child: 0, 0', 'Effect: 0, 0']);
    expect(root).toMatchRenderedOutput('0, 0');

    // Normal update
    await act(() => {
      setCounter1(1);
      setCounter2(1);
    });

    assertLog(['Parent: 1, 1', 'Child: 1, 1', 'Effect: 1, 1']);

    // Update that bails out.
    await act(() => setCounter1(1));
    // store-semantics: the store's queue on this root is empty, so the update
    // is compared to the committed value when it's dispatched and bails out
    // without rendering. useState can't bail out early here because the
    // alternate fiber still has pending update lanes.
    assertLog([]);

    // This time, one of the state updates but the other one doesn't. So we
    // can't bail out.
    await act(() => {
      setCounter1(1);
      setCounter2(2);
    });

    assertLog(['Parent: 1, 2', 'Child: 1, 2', 'Effect: 1, 2']);

    // Lots of updates that eventually resolve to the current values.
    await act(() => {
      setCounter1(9);
      setCounter2(3);
      setCounter1(4);
      setCounter2(7);
      setCounter1(1);
      setCounter2(2);
    });

    // Because the final values are the same as the current values, the
    // component bails out.
    assertLog(['Parent: 1, 2']);

    // prepare to check SameValue
    await act(() => {
      setCounter1(0 / -1);
      setCounter2(NaN);
    });

    assertLog(['Parent: 0, NaN', 'Child: 0, NaN', 'Effect: 0, NaN']);

    // check if re-setting to negative 0 / NaN still bails out
    await act(() => {
      setCounter1(0 / -1);
      setCounter2(NaN);
      setCounter2(Infinity);
      setCounter2(NaN);
    });

    assertLog(['Parent: 0, NaN']);

    // check if changing negative 0 to positive 0 does not bail out
    await act(() => {
      setCounter1(0);
    });
    assertLog(['Parent: 0, NaN', 'Child: 0, NaN', 'Effect: 0, NaN']);
  });

  // @gate enableStore
  it('bails out in render phase if all the state is the same and props bail out with memo', async () => {
    const {memo} = React;

    function Child({text}) {
      Scheduler.log('Child: ' + text);
      return text;
    }

    const counter1Store = createStore(0);
    const counter2Store = createStore(0);
    const setCounter1 = counter1Store.update;
    const setCounter2 = counter2Store.update;
    function Parent({theme}) {
      const counter1 = use(counter1Store);
      const counter2 = use(counter2Store);

      const text = `${counter1}, ${counter2} (${theme})`;
      Scheduler.log(`Parent: ${text}`);
      return <Child text={text} />;
    }

    Parent = memo(Parent);

    const root = ReactTestRenderer.create(null, {unstable_isConcurrent: true});
    root.update(<Parent theme="light" />);
    await waitForAll(['Parent: 0, 0 (light)', 'Child: 0, 0 (light)']);
    expect(root).toMatchRenderedOutput('0, 0 (light)');

    // Normal update
    await act(() => {
      setCounter1(1);
      setCounter2(1);
    });

    assertLog(['Parent: 1, 1 (light)', 'Child: 1, 1 (light)']);

    // Update that bails out.
    await act(() => setCounter1(1));
    // store-semantics: the store's queue on this root is empty, so the update
    // is compared to the committed value when it's dispatched and bails out
    // without rendering. useState can't bail out early here because the
    // alternate fiber still has pending update lanes.
    assertLog([]);

    // This time, one of the state updates but the other one doesn't. So we
    // can't bail out.
    await act(() => {
      setCounter1(1);
      setCounter2(2);
    });

    assertLog(['Parent: 1, 2 (light)', 'Child: 1, 2 (light)']);

    // Updates bail out, but component still renders because props
    // have changed
    await act(() => {
      setCounter1(1);
      setCounter2(2);
      root.update(<Parent theme="dark" />);
    });

    assertLog(['Parent: 1, 2 (dark)', 'Child: 1, 2 (dark)']);

    // Both props and state bail out
    await act(() => {
      setCounter1(1);
      setCounter2(2);
      root.update(<Parent theme="dark" />);
    });

    // store-semantics: both store updates bail out when they're dispatched,
    // because the stores' queues are empty, so they don't schedule Parent.
    // Only the memo props comparison runs, and it bails out too.
    assertLog([]);
  });

  // @gate enableStore
  it('never bails out if context has changed', async () => {
    const {useLayoutEffect, useContext} = React;

    const ThemeContext = React.createContext('light');

    const themeStore = createStore('light');
    const setTheme = themeStore.update;
    function ThemeProvider({children}) {
      const theme = use(themeStore);
      Scheduler.log('Theme: ' + theme);
      return (
        <ThemeContext.Provider value={theme}>{children}</ThemeContext.Provider>
      );
    }

    function Child({text}) {
      Scheduler.log('Child: ' + text);
      return text;
    }

    const counterStore = createStore(0);
    const setCounter = counterStore.update;
    function Parent() {
      const counter = use(counterStore);

      const theme = useContext(ThemeContext);

      const text = `${counter} (${theme})`;
      Scheduler.log(`Parent: ${text}`);
      useLayoutEffect(() => {
        Scheduler.log(`Effect: ${text}`);
      });
      return <Child text={text} />;
    }
    const root = ReactTestRenderer.create(null, {unstable_isConcurrent: true});
    await act(() => {
      root.update(
        <ThemeProvider>
          <Parent />
        </ThemeProvider>,
      );
    });

    assertLog([
      'Theme: light',
      'Parent: 0 (light)',
      'Child: 0 (light)',
      'Effect: 0 (light)',
    ]);
    expect(root).toMatchRenderedOutput('0 (light)');

    // Updating the theme to the same value doesn't cause the consumers
    // to re-render.
    setTheme('light');
    await waitForAll([]);
    expect(root).toMatchRenderedOutput('0 (light)');

    // Normal update
    await act(() => setCounter(1));
    assertLog(['Parent: 1 (light)', 'Child: 1 (light)', 'Effect: 1 (light)']);
    expect(root).toMatchRenderedOutput('1 (light)');

    // Update that doesn't change state, so it bails out
    await act(() => setCounter(1));
    // store-semantics: the store's queue on this root is empty, so the update
    // is compared to the committed value when it's dispatched and bails out
    // without rendering. useState can't bail out early here because the
    // alternate fiber still has pending update lanes.
    assertLog([]);
    expect(root).toMatchRenderedOutput('1 (light)');

    // Update that doesn't change state, but the context changes, too, so it
    // can't bail out
    await act(() => {
      setCounter(1);
      setTheme('dark');
    });

    assertLog([
      'Theme: dark',
      'Parent: 1 (dark)',
      'Child: 1 (dark)',
      'Effect: 1 (dark)',
    ]);
    expect(root).toMatchRenderedOutput('1 (dark)');
  });

  // @gate enableStore
  it('can bail out without calling render phase (as an optimization) if queue is known to be empty', async () => {
    const {useLayoutEffect} = React;

    function Child({text}) {
      Scheduler.log('Child: ' + text);
      return text;
    }

    const counterStore = createStore(0);
    const setCounter = counterStore.update;
    function Parent() {
      const counter = use(counterStore);
      Scheduler.log('Parent: ' + counter);
      useLayoutEffect(() => {
        Scheduler.log('Effect: ' + counter);
      });
      return <Child text={counter} />;
    }

    const root = ReactTestRenderer.create(null, {unstable_isConcurrent: true});
    root.update(<Parent />);
    await waitForAll(['Parent: 0', 'Child: 0', 'Effect: 0']);
    expect(root).toMatchRenderedOutput('0');

    // Normal update
    await act(() => setCounter(1));
    assertLog(['Parent: 1', 'Child: 1', 'Effect: 1']);
    expect(root).toMatchRenderedOutput('1');

    // Update to the same state. React doesn't know if the queue is empty
    // because the alternate fiber has pending update priority, so we have to
    // enter the render phase before we can bail out. But we bail out before
    // rendering the child, and we don't fire any effects.
    await act(() => setCounter(1));
    // store-semantics: a store knows its queue on this root is empty, so it
    // bails out without entering the render phase.
    assertLog([]);
    expect(root).toMatchRenderedOutput('1');

    // Update to the same state again. This times, neither fiber has pending
    // update priority, so we can bail out before even entering the render phase.
    await act(() => setCounter(1));
    await waitForAll([]);
    expect(root).toMatchRenderedOutput('1');

    // This changes the state to something different so it renders normally.
    await act(() => setCounter(2));
    assertLog(['Parent: 2', 'Child: 2', 'Effect: 2']);
    expect(root).toMatchRenderedOutput('2');

    // prepare to check SameValue
    await act(() => {
      setCounter(0);
    });
    assertLog(['Parent: 0', 'Child: 0', 'Effect: 0']);
    expect(root).toMatchRenderedOutput('0');

    // Update to the same state for the first time to flush the queue
    await act(() => {
      setCounter(0);
    });

    // store-semantics: a store knows its queue on this root is empty, so it
    // bails out without entering the render phase.
    assertLog([]);
    expect(root).toMatchRenderedOutput('0');

    // Update again to the same state. Should bail out.
    await act(() => {
      setCounter(0);
    });
    await waitForAll([]);
    expect(root).toMatchRenderedOutput('0');

    // Update to a different state (positive 0 to negative 0)
    await act(() => {
      setCounter(0 / -1);
    });
    assertLog(['Parent: 0', 'Child: 0', 'Effect: 0']);
    expect(root).toMatchRenderedOutput('0');
  });

  // @gate enableStore
  it('can rebase on top of a previously skipped update', async () => {
    function Child({text}) {
      Scheduler.log('Child: ' + text);
      return text;
    }

    const counterStore = createStore(1);
    const setCounter = counterStore.update;
    function Parent() {
      const counter = use(counterStore);
      Scheduler.log('Parent: ' + counter);
      return <Child text={counter} />;
    }

    const root = ReactTestRenderer.create(null, {unstable_isConcurrent: true});
    root.update(<Parent />);
    await waitForAll(['Parent: 1', 'Child: 1']);
    expect(root).toMatchRenderedOutput('1');

    const update = compute => {
      setCounter(previous => {
        const value = compute(previous);
        Scheduler.log(`Compute state (${previous} -> ${value})`);
        return value;
      });
    };

    // Update at transition priority
    React.startTransition(() => update(n => n * 100));
    // The new state is eagerly computed.
    assertLog(['Compute state (1 -> 100)']);

    // but before it's flushed, a higher priority update interrupts it.
    root.unstable_flushSync(() => {
      update(n => n + 5);
    });
    assertLog([
      // The eagerly computed state was completely skipped
      'Compute state (1 -> 6)',
      'Parent: 6',
      'Child: 6',
    ]);
    expect(root).toMatchRenderedOutput('6');

    // Now when we finish the first update, the second update is rebased on top.
    // Notice we didn't have to recompute the first update even though it was
    // skipped in the previous render.
    await waitForAll([
      'Compute state (100 -> 105)',
      'Parent: 105',
      'Child: 105',
    ]);
    expect(root).toMatchRenderedOutput('105');
  });

  // @gate enableStore
  it('does not forget render phase useState updates inside an effect', async () => {
    const {useEffect} = React;

    const counterStore = createStore(0);
    const setCounter = counterStore.update;
    function Counter() {
      const counter = use(counterStore);
      if (counter === 0) {
        setCounter(x => x + 1);
        setCounter(x => x + 1);
      }
      useEffect(() => {
        setCounter(x => x + 1);
        setCounter(x => x + 1);
      }, []);
      return counter;
    }

    const root = ReactTestRenderer.create(null, {unstable_isConcurrent: true});
    await act(() => {
      root.update(<Counter />);
    });
    // store-semantics: store updates during render warn and are rendered after
    // the current render.
    assertConsoleErrorDev([storeUpdateInRenderWarning('Counter')]);
    expect(root).toMatchRenderedOutput('4');
  });

  // @gate enableStore
  it('warns when reading context inside useReducer', async () => {
    const {createContext} = React;
    const ReactSharedInternals =
      React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

    const ThemeContext = createContext('light');
    const store = createStore(0, (s, action) => {
      ReactSharedInternals.H.readContext(ThemeContext);
      return action;
    });
    const dispatch = store.update;
    function App() {
      const state = use(store);
      if (state === 0) {
        dispatch(1);
      }
      return null;
    }

    let error;
    try {
      await act(() => {
        ReactTestRenderer.create(<App />, {unstable_isConcurrent: true});
      });
    } catch (e) {
      error = e;
    }
    // store-semantics: store updates during render warn and are rendered after
    // the current render. A store's reducer isn't part of any component, so
    // it runs without a dispatcher, and reading context throws. App, which
    // reads the store, throws the error.
    expect(error.message).toBe(
      "Cannot read properties of null (reading 'readContext')",
    );
    assertConsoleErrorDev([storeUpdateInRenderWarning('App')]);
  });

  // Edge case.
  // @gate enableStore
  it('warns when reading context inside eager useReducer', async () => {
    const {createContext} = React;
    const ThemeContext = createContext('light');

    const ReactSharedInternals =
      React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;

    const store = createStore(0);
    const _setState = store.update;
    function Fn() {
      use(store);
      return null;
    }

    class Cls extends React.Component {
      render() {
        _setState(() => ReactSharedInternals.H.readContext(ThemeContext));

        return null;
      }
    }

    let error;
    try {
      await act(() => {
        ReactTestRenderer.create(
          <>
            <Fn />
            <Cls />
          </>,
          {unstable_isConcurrent: true},
        );
      });
    } catch (e) {
      error = e;
    }
    // store-semantics: store updates during render warn and are rendered after
    // the current render. They aren't computed eagerly. The updater runs when
    // the root processes the update, without a dispatcher, so reading context
    // throws, and Fn, which reads the store, throws the error.
    expect(error.message).toBe(
      "Cannot read properties of null (reading 'readContext')",
    );
    assertConsoleErrorDev([storeUpdateInRenderWarning('Cls')]);
  });

  // @gate enableStore
  it('warns when calling hooks inside useReducer', async () => {
    const {useState, useRef} = React;

    const store = createStore(0, (state, action) => {
      useRef(0);
      return state + 1;
    });
    const dispatch = store.update;
    function App() {
      const value = use(store);
      if (value === 0) {
        dispatch('foo');
      }
      useState();
      return value;
    }

    let error;
    try {
      await act(() => {
        ReactTestRenderer.create(<App />, {unstable_isConcurrent: true});
      });
    } catch (e) {
      error = e;
    }
    // store-semantics: a store's reducer isn't part of any component, so it
    // runs without a dispatcher, like useReducer's eager state outside of
    // render. Calling a Hook in it is an invalid Hook call and throws, and
    // App, which reads the store, throws the error. The Hook call can't touch
    // App's Hooks.
    expect(error.message).toBe(
      "Cannot read properties of null (reading 'useRef')",
    );
    const invalidHookCallWarning =
      'Invalid hook call. Hooks can only be called inside of the body of a ' +
      'function component. This could happen for one of the following ' +
      'reasons:\n' +
      '1. You might have mismatching versions of React and the renderer ' +
      '(such as React DOM)\n' +
      '2. You might be breaking the Rules of Hooks\n' +
      '3. You might have more than one copy of React in the same app\n' +
      'See https://react.dev/link/invalid-hook-call for tips about how to ' +
      'debug and fix this problem.';
    // The root processes the update, and runs the reducer, each time it
    // renders: the concurrent render, the sync retry, and after the error
    // unwinds to the root.
    assertConsoleErrorDev([
      storeUpdateInRenderWarning('App'),
      invalidHookCallWarning,
      invalidHookCallWarning,
      invalidHookCallWarning,
      invalidHookCallWarning,
    ]);
  });

  // Regression test for #14674
  // @gate enableStore
  it('does not swallow original error when updating another component in render phase', async () => {
    const store = createStore(0);
    const _setState = store.update;
    function A() {
      use(store);
      return null;
    }

    function B() {
      _setState(() => {
        throw new Error('Hello');
      });
      return null;
    }

    await expect(async () => {
      await act(() => {
        ReactTestRenderer.create(
          <>
            <A />
            <B />
          </>,
          {unstable_isConcurrent: true},
        );
      });
    }).rejects.toThrow('Hello');
    // store-semantics: store updates during render warn and are rendered after
    // the current render.
    assertConsoleErrorDev([storeUpdateInRenderWarning('B')]);
  });

  // The store stands in for the context the original's Provider passed down, so
  // the update has to get past Parent's useState bailout.
  // @gate enableStore
  it('never bails out if a store it reads has changed', async () => {
    const {useState, useLayoutEffect} = React;

    const themeStore = createStore('light');

    function ThemeProvider({children}) {
      // Stands in for the useState that owned the Provider value.
      const theme = use(themeStore);
      Scheduler.log('Theme: ' + theme);
      return children;
    }

    function Child({text}) {
      Scheduler.log('Child: ' + text);
      return text;
    }

    let setCounter;
    function Parent() {
      const [counter, _setCounter] = useState(0);
      setCounter = _setCounter;

      const theme = use(themeStore);

      const text = `${counter} (${theme})`;
      Scheduler.log(`Parent: ${text}`);
      useLayoutEffect(() => {
        Scheduler.log(`Effect: ${text}`);
      });
      return <Child text={text} />;
    }
    const root = ReactTestRenderer.create(null, {unstable_isConcurrent: true});
    await act(() => {
      root.update(
        <ThemeProvider>
          <Parent />
        </ThemeProvider>,
      );
    });

    assertLog([
      'Theme: light',
      'Parent: 0 (light)',
      'Child: 0 (light)',
      'Effect: 0 (light)',
    ]);
    expect(root).toMatchRenderedOutput('0 (light)');

    // Updating the theme to the same value doesn't cause the consumers
    // to re-render.
    themeStore.update('light');
    await waitForAll([]);
    expect(root).toMatchRenderedOutput('0 (light)');

    // Normal update
    await act(() => setCounter(1));
    assertLog(['Parent: 1 (light)', 'Child: 1 (light)', 'Effect: 1 (light)']);
    expect(root).toMatchRenderedOutput('1 (light)');

    // Update that doesn't change state, so it bails out
    await act(() => setCounter(1));
    assertLog(['Parent: 1 (light)']);
    expect(root).toMatchRenderedOutput('1 (light)');

    // Update that doesn't change state, but the context changes, too, so it
    // can't bail out
    await act(() => {
      setCounter(1);
      themeStore.update('dark');
    });

    assertLog([
      'Theme: dark',
      'Parent: 1 (dark)',
      'Child: 1 (dark)',
      'Effect: 1 (dark)',
    ]);
    expect(root).toMatchRenderedOutput('1 (dark)');
  });

  // @gate enableStore
  it('warns when reading a store inside useMemo after reading it outside', async () => {
    const {useMemo} = React;

    const themeStore = createStore('light');
    let firstRead, secondRead;
    function App() {
      firstRead = use(themeStore);
      useMemo(() => {});
      secondRead = use(themeStore);
      return useMemo(() => {
        return use(themeStore);
      }, []);
    }

    await act(() => {
      ReactTestRenderer.create(<App />, {unstable_isConcurrent: true});
    });
    assertConsoleErrorDev([
      // store-semantics: use(store) goes through the Hooks dispatcher, not
      // readContext, so it gets the Hooks warning, not the context read
      // warning.
      'Do not call Hooks inside useEffect(...), useMemo(...), or other built-in Hooks. ' +
        'You can only call Hooks at the top level of your React function. ' +
        'For more information, see https://react.dev/link/rules-of-hooks\n' +
        '    in App (at **)',
    ]);
    expect(firstRead).toBe('light');
    expect(secondRead).toBe('light');
  });

  // Edge case.
  // @gate enableStore
  it('warns when reading a store inside an eagerly computed setState updater', async () => {
    const {useState} = React;
    const themeStore = createStore('light');

    let _setState;
    function Fn() {
      const [, setState] = useState(0);
      _setState = setState;
      return null;
    }

    class Cls extends React.Component {
      render() {
        _setState(() => use(themeStore));

        return null;
      }
    }

    await act(() => {
      ReactTestRenderer.create(
        <>
          <Fn />
          <Cls />
        </>,
        {unstable_isConcurrent: true},
      );
    });
    assertConsoleErrorDev([
      // store-semantics: use(store) goes through the Hooks dispatcher, not
      // readContext, so it gets the Hooks warning, not the context read
      // warning.
      'Do not call Hooks inside useEffect(...), useMemo(...), or other built-in Hooks. ' +
        'You can only call Hooks at the top level of your React function. ' +
        'For more information, see https://react.dev/link/rules-of-hooks\n' +
        '    in Cls (at **)',
      'Cannot update a component (`Fn`) while rendering a different component (`Cls`). ' +
        'To locate the bad setState() call inside `Cls`, ' +
        'follow the stack trace as described in https://react.dev/link/setstate-in-render\n' +
        '    in Cls (at **)',
      // store-semantics: readContext still returns a value when it warns, so
      // the original's eager state is kept and the updater doesn't run
      // again. use(store) needs a rendering function component, and the eager
      // computation runs while the class renders, so it throws. The eager
      // state is discarded, and the updater runs again when Fn renders,
      // where it warns again.
      'Do not call Hooks inside useEffect(...), useMemo(...), or other built-in Hooks. ' +
        'You can only call Hooks at the top level of your React function. ' +
        'For more information, see https://react.dev/link/rules-of-hooks\n' +
        '    in Fn (at **)',
    ]);
  });
});
