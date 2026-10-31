/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 * @jest-environment node
 */

'use strict';

// The context cases of ReactHooks-test.internal.js, with context replaced by
// `use(store)`. See "Context copies" in docs/use-store/COPY_RULES.md.
//
// Several cases check that reading context where it isn't allowed (inside
// useMemo, useReducer, effects) is flagged. They read a store with use(store)
// instead. use(store) is a Hook-like read that goes through the Hooks
// dispatcher, not readContext, so it's flagged with the Hooks warning ("Do not
// call Hooks inside useEffect(...), useMemo(...), or other built-in Hooks")
// or the invalid Hook call error instead of the context message.

let React;
let ReactTestRenderer;
let Scheduler;
let act;
let assertLog;
let assertConsoleErrorDev;
let waitForAll;
let waitForThrow;
let use;
let createStore;

describe('ReactHooks', () => {
  beforeEach(() => {
    jest.resetModules();
    React = require('react');
    ReactTestRenderer = require('react-test-renderer');
    Scheduler = require('scheduler');
    act = require('internal-test-utils').act;
    use = React.use;
    createStore = React.unstable_createStore;

    const InternalTestUtils = require('internal-test-utils');
    assertLog = InternalTestUtils.assertLog;
    assertConsoleErrorDev = InternalTestUtils.assertConsoleErrorDev;
    waitForAll = InternalTestUtils.waitForAll;
    waitForThrow = InternalTestUtils.waitForThrow;
  });

  // @gate enableStore
  it('never bails out if context has changed', async () => {
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
  it('warns when reading context inside useMemo', async () => {
    const {useMemo} = React;

    const themeStore = createStore('light');
    function App() {
      return useMemo(() => {
        return use(themeStore);
      }, []);
    }

    await act(() => {
      ReactTestRenderer.create(<App />, {unstable_isConcurrent: true});
    });
    assertConsoleErrorDev([
      // store-semantics: use(store) gets the Hooks warning, not the context
      // read warning (see the top of the file).
      'Do not call Hooks inside useEffect(...), useMemo(...), or other built-in Hooks. ' +
        'You can only call Hooks at the top level of your React function. ' +
        'For more information, see https://react.dev/link/rules-of-hooks\n' +
        '    in App (at **)',
    ]);
  });

  // @gate enableStore
  it('warns when reading context inside useMemo after reading outside it', async () => {
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
      // store-semantics: use(store) gets the Hooks warning, not the context
      // read warning (see the top of the file).
      'Do not call Hooks inside useEffect(...), useMemo(...), or other built-in Hooks. ' +
        'You can only call Hooks at the top level of your React function. ' +
        'For more information, see https://react.dev/link/rules-of-hooks\n' +
        '    in App (at **)',
    ]);
    expect(firstRead).toBe('light');
    expect(secondRead).toBe('light');
  });

  // Throws because there's no runtime cost for being strict here.
  // @gate enableStore
  it('throws when reading context inside useEffect', async () => {
    const {useEffect} = React;

    const themeStore = createStore('light');
    function App() {
      useEffect(() => {
        use(themeStore);
      });
      return null;
    }

    await act(async () => {
      ReactTestRenderer.create(<App />, {unstable_isConcurrent: true});
      // The exact message doesn't matter, just make sure we don't allow this
      // store-semantics: use(store) outside of render is an invalid Hook call
      // (see the top of the file).
      await waitForThrow('Invalid hook call.');
    });
  });

  // Throws because there's no runtime cost for being strict here.
  // @gate enableStore
  it('throws when reading context inside useLayoutEffect', async () => {
    const {useLayoutEffect} = React;

    const themeStore = createStore('light');
    function App() {
      useLayoutEffect(() => {
        use(themeStore);
      });
      return null;
    }

    await expect(
      act(() => {
        ReactTestRenderer.create(<App />, {unstable_isConcurrent: true});
      }),
    ).rejects.toThrow(
      // The exact message doesn't matter, just make sure we don't allow this
      // store-semantics: use(store) outside of render is an invalid Hook call
      // (see the top of the file).
      'Invalid hook call.',
    );
  });

  // @gate enableStore
  it('warns when reading context inside useReducer', async () => {
    const {useReducer} = React;

    const themeStore = createStore('light');
    function App() {
      const [state, dispatch] = useReducer((s, action) => {
        use(themeStore);
        return action;
      }, 0);
      if (state === 0) {
        dispatch(1);
      }
      return null;
    }

    await act(() => {
      ReactTestRenderer.create(<App />, {unstable_isConcurrent: true});
    });
    assertConsoleErrorDev([
      // store-semantics: use(store) gets the Hooks warning, not the context
      // read warning (see the top of the file).
      'Do not call Hooks inside useEffect(...), useMemo(...), or other built-in Hooks. ' +
        'You can only call Hooks at the top level of your React function. ' +
        'For more information, see https://react.dev/link/rules-of-hooks\n' +
        '    in App (at **)',
    ]);
  });

  // Edge case.
  // @gate enableStore
  it('warns when reading context inside eager useReducer', async () => {
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
      // store-semantics: use(store) gets the Hooks warning, not the context
      // read warning (see the top of the file).
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

  // @gate enableStore
  it('resets warning internal state when interrupted by an error', async () => {
    const themeStore = createStore('light');
    function App() {
      React.useMemo(() => {
        // Trigger warnings
        use(themeStore);
        React.useRef();
        // Interrupt exit from a Hook
        throw new Error('No.');
      }, []);
    }

    class Boundary extends React.Component {
      state = {};
      static getDerivedStateFromError(error) {
        return {err: true};
      }
      render() {
        if (this.state.err) {
          return 'Oops';
        }
        return this.props.children;
      }
    }

    // store-semantics: use(store) gets the Hooks warning instead of the
    // context read warning (see the top of the file), so each of the two
    // render attempts logs the Hooks warning twice: once for use(store) and
    // once for useRef.
    const hooksWarning =
      'Do not call Hooks inside useEffect(...), useMemo(...), or other built-in Hooks. ' +
      'You can only call Hooks at the top level of your React function. ' +
      'For more information, see https://react.dev/link/rules-of-hooks\n' +
      '    in App (at **)';

    await act(() => {
      ReactTestRenderer.create(
        <Boundary>
          <App />
        </Boundary>,
        {unstable_isConcurrent: true},
      );
    });
    assertConsoleErrorDev([
      hooksWarning,
      hooksWarning,
      hooksWarning,
      hooksWarning,
    ]);

    function Valid() {
      React.useState();
      React.useMemo(() => {});
      React.useReducer(() => {});
      React.useEffect(() => {});
      React.useLayoutEffect(() => {});
      React.useCallback(() => {});
      React.useRef();
      React.useImperativeHandle(
        () => {},
        () => {},
      );
      if (__DEV__) {
        React.useDebugValue();
      }
      return null;
    }
    // Verify it doesn't think we're still inside a Hook.
    // Should have no warnings.
    await act(() => {
      ReactTestRenderer.create(<Valid />, {unstable_isConcurrent: true});
    });

    // Verify warnings don't get permanently disabled.
    await act(() => {
      ReactTestRenderer.create(
        <Boundary>
          <App />
        </Boundary>,
        {unstable_isConcurrent: true},
      );
    });
    assertConsoleErrorDev([
      hooksWarning,
      hooksWarning,
      hooksWarning,
      hooksWarning,
    ]);
  });
});
