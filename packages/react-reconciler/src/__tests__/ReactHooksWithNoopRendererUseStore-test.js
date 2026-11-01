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

// use(store) cases converted from ReactHooksWithNoopRenderer-test.js, kept
// where a store behaves differently from useState or exercises store
// machinery: render-phase store updates (rendered after the current render,
// and not discarded when it suspends), update lanes (transitions interrupted
// by sync work, mixed priorities, updates from passive effects), and a legacy
// root case.

let React;
let ReactNoop;
let Scheduler;
let Suspense;
let useEffect;
let useInsertionEffect;
let useImperativeHandle;
let forwardRef;
let act;
let waitForAll;
let waitFor;
let waitForThrow;
let assertLog;
let assertConsoleErrorDev;
let use;
let createStore;

describe('ReactHooksWithNoopRenderer', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.useFakeTimers();

    React = require('react');
    ReactNoop = require('react-noop-renderer');
    Scheduler = require('scheduler');
    act = require('internal-test-utils').act;
    assertConsoleErrorDev =
      require('internal-test-utils').assertConsoleErrorDev;
    useEffect = React.useEffect;
    useInsertionEffect = React.useInsertionEffect;
    useImperativeHandle = React.useImperativeHandle;
    forwardRef = React.forwardRef;
    use = React.use;
    createStore = React.unstable_createStore;
    Suspense = React.Suspense;

    const InternalTestUtils = require('internal-test-utils');
    waitForAll = InternalTestUtils.waitForAll;
    waitFor = InternalTestUtils.waitFor;
    waitForThrow = InternalTestUtils.waitForThrow;
    assertLog = InternalTestUtils.assertLog;
  });

  function Text(props) {
    Scheduler.log(props.text);
    return <span prop={props.text} />;
  }

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
  it('resumes after an interruption', async () => {
    const countStore = createStore(0);
    function Counter(props, ref) {
      const count = use(countStore);
      useImperativeHandle(ref, () => ({updateCount: countStore.update}));
      return <Text text={props.label + ': ' + count} />;
    }
    Counter = forwardRef(Counter);

    // Initial mount
    const counter = React.createRef(null);
    ReactNoop.render(<Counter label="Count" ref={counter} />);
    await waitForAll(['Count: 0']);
    expect(ReactNoop).toMatchRenderedOutput(<span prop="Count: 0" />);

    // Schedule some updates
    await act(async () => {
      React.startTransition(() => {
        counter.current.updateCount(1);
        counter.current.updateCount(count => count + 10);
      });

      // Partially flush without committing
      await waitFor(['Count: 11']);
      expect(ReactNoop).toMatchRenderedOutput(<span prop="Count: 0" />);

      // Interrupt with a high priority update
      ReactNoop.flushSync(() => {
        ReactNoop.render(<Counter label="Total" />);
      });
      assertLog(['Total: 0']);

      // Resume rendering
      await waitForAll(['Total: 11']);
      expect(ReactNoop).toMatchRenderedOutput(<span prop="Total: 11" />);
    });
  });

  describe('updates during the render phase', () => {
    // @gate enableStore
    it('restarts the render function and applies the new updates on top', async () => {
      const isScrollingDownStore = createStore(false);
      const rowStore = createStore(null);
      const setIsScrollingDown = isScrollingDownStore.update;
      const setRow = rowStore.update;
      function ScrollView({row: newRow}) {
        const isScrollingDown = use(isScrollingDownStore);
        const row = use(rowStore);

        if (row !== newRow) {
          // Row changed since last render. Update isScrollingDown.
          setIsScrollingDown(row !== null && newRow > row);
          setRow(newRow);
        }

        return <Text text={`Scrolling down: ${isScrollingDown}`} />;
      }

      ReactNoop.render(<ScrollView row={1} />);
      // store-semantics: a render phase store update isn't processed in the
      // current render. It's scheduled, and the component renders again.
      await waitForAll(['Scrolling down: false', 'Scrolling down: false']);
      // store-semantics: store updates during render warn and are rendered after
      // the current render.
      assertConsoleErrorDev([storeUpdateInRenderWarning('ScrollView')]);
      expect(ReactNoop).toMatchRenderedOutput(
        <span prop="Scrolling down: false" />,
      );

      ReactNoop.render(<ScrollView row={5} />);
      await waitForAll(['Scrolling down: false', 'Scrolling down: true']);
      expect(ReactNoop).toMatchRenderedOutput(
        <span prop="Scrolling down: true" />,
      );

      ReactNoop.render(<ScrollView row={5} />);
      await waitForAll(['Scrolling down: true']);
      expect(ReactNoop).toMatchRenderedOutput(
        <span prop="Scrolling down: true" />,
      );

      ReactNoop.render(<ScrollView row={10} />);
      // Only the row store changes, but ScrollView reads it, so it renders
      // again.
      await waitForAll(['Scrolling down: true', 'Scrolling down: true']);
      expect(ReactNoop).toMatchRenderedOutput(
        <span prop="Scrolling down: true" />,
      );

      ReactNoop.render(<ScrollView row={2} />);
      await waitForAll(['Scrolling down: true', 'Scrolling down: false']);
      expect(ReactNoop).toMatchRenderedOutput(
        <span prop="Scrolling down: false" />,
      );

      ReactNoop.render(<ScrollView row={2} />);
      await waitForAll(['Scrolling down: false']);
      expect(ReactNoop).toMatchRenderedOutput(
        <span prop="Scrolling down: false" />,
      );
    });

    // @gate enableStore
    it('warns about render phase update on a different component', async () => {
      const stepStore = createStore(0);
      const setStep = stepStore.update;
      function Foo() {
        const step = use(stepStore);
        return <Text text={`Foo [${step}]`} />;
      }

      function Bar({triggerUpdate}) {
        if (triggerUpdate) {
          setStep(x => x + 1);
        }
        return <Text text="Bar" />;
      }

      const root = ReactNoop.createRoot();

      await act(() => {
        root.render(
          <>
            <Foo />
            <Bar />
          </>,
        );
      });
      assertLog(['Foo [0]', 'Bar']);

      // Bar will update Foo during its render phase. React should warn.
      root.render(
        <>
          <Foo />
          <Bar triggerUpdate={true} />
        </>,
      );
      await waitForAll(['Foo [0]', 'Bar', 'Foo [1]']);
      // store-semantics: store updates during render warn and are rendered after
      // the current render.
      assertConsoleErrorDev([storeUpdateInRenderWarning('Bar')]);

      // It should not warn again (deduplication).
      await act(async () => {
        root.render(
          <>
            <Foo />
            <Bar triggerUpdate={true} />
          </>,
        );
        await waitForAll(['Foo [1]', 'Bar', 'Foo [2]']);
      });
    });

    // @gate enableStore
    it('keeps restarting until there are no more new updates', async () => {
      const countStore = createStore(0);
      const setCount = countStore.update;
      function Counter({row: newRow}) {
        const count = use(countStore);
        if (count < 3) {
          setCount(count + 1);
        }
        Scheduler.log('Render: ' + count);
        return <Text text={count} />;
      }

      ReactNoop.render(<Counter />);
      // store-semantics: a render phase store update isn't processed in the
      // current render. It's scheduled, and the component renders again.
      await waitForAll([
        'Render: 0',
        0,
        'Render: 1',
        1,
        'Render: 2',
        2,
        'Render: 3',
        3,
      ]);
      // store-semantics: store updates during render warn and are rendered after
      // the current render.
      assertConsoleErrorDev([storeUpdateInRenderWarning('Counter')]);
      expect(ReactNoop).toMatchRenderedOutput(<span prop={3} />);
    });

    // @gate enableStore
    it('discards render phase updates if something suspends', async () => {
      const thenable = {then() {}};
      function Foo({signal}) {
        return (
          <Suspense fallback="Loading...">
            <Bar signal={signal} />
          </Suspense>
        );
      }

      const counterStore = createStore(0);
      const signalStore = createStore(true);
      const setCounter = counterStore.update;
      const setSignal = signalStore.update;
      function Bar({signal: newSignal}) {
        const counter = use(counterStore);
        const signal = use(signalStore);

        // Increment a counter every time the signal changes
        if (signal !== newSignal) {
          setCounter(c => c + 1);
          setSignal(newSignal);
          if (counter === 0) {
            // We're suspending during a render that includes render phase
            // updates. Those updates should not persist to the next render.
            Scheduler.log('Suspend!');
            throw thenable;
          }
        }

        return <Text text={counter} />;
      }

      const root = ReactNoop.createRoot();
      root.render(<Foo signal={true} />);

      await waitForAll([0]);
      expect(root).toMatchRenderedOutput(<span prop={0} />);

      React.startTransition(() => {
        root.render(<Foo signal={false} />);
      });
      await waitForAll(['Suspend!']);
      // store-semantics: store updates during render warn and are rendered after
      // the current render.
      assertConsoleErrorDev([storeUpdateInRenderWarning('Bar', 'Foo')]);
      expect(root).toMatchRenderedOutput(<span prop={0} />);

      // Rendering again should suspend again.
      React.startTransition(() => {
        root.render(<Foo signal={false} />);
      });
      // store-semantics: render phase store updates are real updates to the
      // store, so they aren't discarded when the render suspends. They're
      // applied when Bar renders again, so it doesn't suspend.
      await waitForAll([1]);
      expect(root).toMatchRenderedOutput(<span prop={1} />);
    });

    // @gate enableStore
    it('discards render phase updates if something suspends, but not other updates in the same component', async () => {
      const thenable = {then() {}};
      function Foo({signal}) {
        return (
          <Suspense fallback="Loading...">
            <Bar signal={signal} />
          </Suspense>
        );
      }

      const counterStore = createStore(0);
      const signalStore = createStore(true);
      const labelStore = createStore('A');
      const setCounter = counterStore.update;
      const setSignal = signalStore.update;
      const setLabel = labelStore.update;
      function Bar({signal: newSignal}) {
        const counter = use(counterStore);

        if (counter === 1) {
          // We're suspending during a render that includes render phase
          // updates. Those updates should not persist to the next render.
          Scheduler.log('Suspend!');
          throw thenable;
        }

        const signal = use(signalStore);

        // Increment a counter every time the signal changes
        if (signal !== newSignal) {
          setCounter(c => c + 1);
          setSignal(newSignal);
        }

        const label = use(labelStore);

        return <Text text={`${label}:${counter}`} />;
      }

      const root = ReactNoop.createRoot();
      root.render(<Foo signal={true} />);

      await waitForAll(['A:0']);
      expect(root).toMatchRenderedOutput(<span prop="A:0" />);

      await act(async () => {
        React.startTransition(() => {
          root.render(<Foo signal={false} />);
          setLabel('B');
        });

        // store-semantics: a render phase store update isn't processed in the
        // current render. Bar finishes rendering with the label update, which
        // commits, and suspends when it renders again with the counter update.
        await waitForAll(['B:0', 'Suspend!']);
        assertConsoleErrorDev([storeUpdateInRenderWarning('Bar', 'Foo')]);
        expect(root).toMatchRenderedOutput(<span prop="B:0" />);

        // Rendering again should suspend again.
        React.startTransition(() => {
          root.render(<Foo signal={false} />);
        });
        await waitForAll(['Suspend!']);

        // Flip the signal back to "cancel" the update. However, the update to
        // label should still proceed. It shouldn't have been dropped.
        React.startTransition(() => {
          root.render(<Foo signal={true} />);
        });
        // store-semantics: render phase store updates are real updates to the
        // store, so they aren't discarded when the render suspends. The
        // counter update is still applied and Bar keeps suspending. The label
        // update already committed above.
        await waitForAll(['Suspend!']);
        expect(root).toMatchRenderedOutput(<span prop="B:0" />);
      });
    });

    // @gate enableStore
    it(
      'preserves pending updates on later hooks that were not processed ' +
        'before unwind',
      async () => {
        const thenable = {then() {}};

        const counterStore = createStore(0);
        const labelStore = createStore('A');
        const setCounter = counterStore.update;
        const setLabel = labelStore.update;
        function Foo({suspend}) {
          return (
            <Suspense fallback="Loading...">
              <Bar suspend={suspend} />
            </Suspense>
          );
        }

        function Bar({suspend}) {
          const counter = use(counterStore);

          if (suspend) {
            setCounter(c => c + 1);
            Scheduler.log('Suspend!');
            throw thenable;
          }

          const label = use(labelStore);

          return <Text text={`${label}:${counter}`} />;
        }

        const root = ReactNoop.createRoot();
        root.render(<Foo suspend={false} />);

        await waitForAll(['A:0']);
        expect(root).toMatchRenderedOutput(<span prop="A:0" />);

        await act(async () => {
          React.startTransition(() => {
            root.render(<Foo suspend={true} />);
            setLabel('B');
          });

          await waitForAll(['Suspend!']);
          // store-semantics: store updates during render warn and are rendered after
          // the current render.
          assertConsoleErrorDev([storeUpdateInRenderWarning('Bar', 'Foo')]);
          expect(root).toMatchRenderedOutput(<span prop="A:0" />);

          React.startTransition(() => {
            root.render(<Foo suspend={false} />);
          });

          // store-semantics: render phase store updates are real updates to
          // the store, so the counter update isn't discarded when the render
          // suspends.
          await waitForAll(['B:1']);
          expect(root).toMatchRenderedOutput(<span prop="B:1" />);
        });
      },
    );

    // @gate enableStore
    it('regression: render phase updates cause lower pri work to be dropped', async () => {
      const rowStore = createStore(10);
      const scrollDirectionStore = createStore('Up');
      const prevRowStore = createStore(null);
      const setRow = rowStore.update;
      const setScrollDirection = scrollDirectionStore.update;
      const setPrevRow = prevRowStore.update;
      function ScrollView() {
        const row = use(rowStore);

        const scrollDirection = use(scrollDirectionStore);
        const prevRow = use(prevRowStore);

        if (prevRow !== row) {
          setScrollDirection(prevRow !== null && row > prevRow ? 'Down' : 'Up');
          setPrevRow(row);
        }

        return <Text text={scrollDirection} />;
      }

      const root = ReactNoop.createRoot();

      await act(() => {
        root.render(<ScrollView row={10} />);
      });
      // store-semantics: a render phase store update isn't processed in the
      // current render. It's scheduled, and the component renders again.
      assertLog(['Up', 'Up']);
      assertConsoleErrorDev([storeUpdateInRenderWarning('ScrollView')]);
      expect(root).toMatchRenderedOutput(<span prop="Up" />);

      await act(() => {
        ReactNoop.discreteUpdates(() => {
          setRow(5);
        });
        React.startTransition(() => {
          setRow(20);
        });
      });
      // The discrete update and the transition each render twice, because of
      // the render phase updates. The transition isn't dropped.
      assertLog(['Up', 'Up', 'Up', 'Down']);
      expect(root).toMatchRenderedOutput(<span prop="Down" />);
    });

    // TODO: This should probably warn
    // @gate enableStore
    it('calling startTransition inside render phase', async () => {
      const counterStore = createStore(0);
      const setCounter = counterStore.update;
      function App() {
        const counter = use(counterStore);

        if (counter === 0) {
          React.startTransition(() => {
            setCounter(c => c + 1);
          });
        }

        return <Text text={counter} />;
      }

      const root = ReactNoop.createRoot();
      root.render(<App />);
      // store-semantics: a render phase store update isn't processed in the
      // current render. It's scheduled, and the component renders again.
      await waitForAll([0, 1]);
      assertConsoleErrorDev([storeUpdateInRenderWarning('App')]);
      expect(root).toMatchRenderedOutput(<span prop={1} />);
    });
  });

  describe('useReducer', () => {
    // Regression test for https://github.com/react/react/issues/14360
    // @gate enableStore
    it('handles dispatches with mixed priorities', async () => {
      const INCREMENT = 'INCREMENT';

      function reducer(state, action) {
        return action === INCREMENT ? state + 1 : state;
      }

      const countStore = createStore(0, reducer);
      function Counter(props, ref) {
        const count = use(countStore);
        useImperativeHandle(ref, () => ({dispatch: countStore.update}));
        return <Text text={'Count: ' + count} />;
      }

      Counter = forwardRef(Counter);
      const counter = React.createRef(null);
      ReactNoop.render(<Counter ref={counter} />);

      await waitForAll(['Count: 0']);
      expect(ReactNoop).toMatchRenderedOutput(<span prop="Count: 0" />);

      ReactNoop.batchedUpdates(() => {
        counter.current.dispatch(INCREMENT);
        counter.current.dispatch(INCREMENT);
        counter.current.dispatch(INCREMENT);
      });

      ReactNoop.flushSync(() => {
        counter.current.dispatch(INCREMENT);
      });
      assertLog(['Count: 4']);
      expect(ReactNoop).toMatchRenderedOutput(<span prop="Count: 4" />);
    });
  });

  describe('useEffect', () => {
    // @gate enableStore
    it('updates have async priority', async () => {
      const countStore = createStore('(empty)');
      const updateCount = countStore.update;
      function Counter(props) {
        const count = use(countStore);
        useEffect(() => {
          Scheduler.log(`Schedule update [${props.count}]`);
          updateCount(props.count);
        }, [props.count]);
        return <Text text={'Count: ' + count} />;
      }
      await act(async () => {
        ReactNoop.render(<Counter count={0} />, () =>
          Scheduler.log('Sync effect'),
        );
        await waitFor(['Count: (empty)', 'Sync effect']);
        expect(ReactNoop).toMatchRenderedOutput(<span prop="Count: (empty)" />);
        ReactNoop.flushPassiveEffects();
        assertLog(['Schedule update [0]']);
        await waitForAll(['Count: 0']);
      });

      await act(async () => {
        ReactNoop.render(<Counter count={1} />, () =>
          Scheduler.log('Sync effect'),
        );
        await waitFor(['Count: 0', 'Sync effect']);
        expect(ReactNoop).toMatchRenderedOutput(<span prop="Count: 0" />);
        ReactNoop.flushPassiveEffects();
        assertLog(['Schedule update [1]']);
        await waitForAll(['Count: 1']);
      });
    });

    // @gate enableStore
    it('updates have async priority even if effects are flushed early', async () => {
      const countStore = createStore('(empty)');
      const updateCount = countStore.update;
      function Counter(props) {
        const count = use(countStore);
        useEffect(() => {
          Scheduler.log(`Schedule update [${props.count}]`);
          updateCount(props.count);
        }, [props.count]);
        return <Text text={'Count: ' + count} />;
      }
      await act(async () => {
        ReactNoop.render(<Counter count={0} />, () =>
          Scheduler.log('Sync effect'),
        );
        await waitFor(['Count: (empty)', 'Sync effect']);
        expect(ReactNoop).toMatchRenderedOutput(<span prop="Count: (empty)" />);

        // Rendering again should flush the previous commit's effects
        React.startTransition(() => {
          ReactNoop.render(<Counter count={1} />, () =>
            Scheduler.log('Sync effect'),
          );
        });

        await waitFor(['Schedule update [0]', 'Count: 0']);

        expect(ReactNoop).toMatchRenderedOutput(<span prop="Count: 0" />);
        await waitFor([
          'Count: 0',
          'Sync effect',
          'Schedule update [1]',
          'Count: 1',
        ]);

        expect(ReactNoop).toMatchRenderedOutput(<span prop="Count: 1" />);
      });
    });

    // @gate enableStore && (!disableLegacyMode)
    it(
      'in legacy mode, useEffect is deferred and updates finish synchronously ' +
        '(in a single batch)',
      async () => {
        const countStore = createStore('(empty)');
        const updateCount = countStore.update;
        function Counter(props) {
          const count = use(countStore);
          useEffect(() => {
            // Update multiple times. These should all be batched together in
            // a single render.
            updateCount(props.count);
            updateCount(props.count);
            updateCount(props.count);
            updateCount(props.count);
            updateCount(props.count);
            updateCount(props.count);
          }, [props.count]);
          return <Text text={'Count: ' + count} />;
        }
        await act(() => {
          ReactNoop.flushSync(() => {
            ReactNoop.renderLegacySyncRoot(<Counter count={0} />);
          });

          // Even in legacy mode, effects are deferred until after paint
          assertLog(['Count: (empty)']);
          expect(ReactNoop).toMatchRenderedOutput(
            <span prop="Count: (empty)" />,
          );
        });

        // effects get forced on exiting act()
        // There were multiple updates, but there should only be a
        // single render
        assertLog(['Count: 0']);
        expect(ReactNoop).toMatchRenderedOutput(<span prop="Count: 0" />);
      },
    );
  });

  describe('useInsertionEffect', () => {
    // @gate enableStore
    it('warns when setState is called from insertion effect setup', async () => {
      const xStore = createStore(0);
      const setX = xStore.update;
      function App(props) {
        use(xStore);
        useInsertionEffect(() => {
          setX(1);
          if (props.throw) {
            throw Error('No');
          }
        }, [props.throw]);
        return null;
      }

      const root = ReactNoop.createRoot();
      await act(() => {
        root.render(<App />);
      });
      assertConsoleErrorDev([
        'useInsertionEffect must not schedule updates.\n' +
          '    in App (at **)',
      ]);

      await act(async () => {
        root.render(<App throw={true} />);
        await waitForThrow('No');
      });

      // Should not warn for regular effects after throw.
      const notInsertionStore = createStore(0);
      function NotInsertion() {
        use(notInsertionStore);
        useEffect(() => {
          notInsertionStore.update(1);
        }, []);
        return null;
      }
      await act(() => {
        root.render(<NotInsertion />);
      });
    });
  });

  // Regression test. Covers a case where an internal state variable
  // (`didReceiveUpdate`) is not reset properly.
  // @gate enableStore
  it('state bail out edge case (#16359)', async () => {
    const counterAStore = createStore(0);
    const counterBStore = createStore(0);
    const setCounterA = counterAStore.update;
    const setCounterB = counterBStore.update;

    function CounterA() {
      const counter = use(counterAStore);
      Scheduler.log('Render A: ' + counter);
      useEffect(() => {
        Scheduler.log('Commit A: ' + counter);
      });
      return counter;
    }

    function CounterB() {
      const counter = use(counterBStore);
      Scheduler.log('Render B: ' + counter);
      useEffect(() => {
        Scheduler.log('Commit B: ' + counter);
      });
      return counter;
    }

    const root = ReactNoop.createRoot(null);
    await act(() => {
      root.render(
        <>
          <CounterA />
          <CounterB />
        </>,
      );
    });
    assertLog(['Render A: 0', 'Render B: 0', 'Commit A: 0', 'Commit B: 0']);

    await act(() => {
      setCounterA(1);

      // In the same batch, update B twice. To trigger the condition we're
      // testing, the first update is necessary to bypass the early
      // bailout optimization.
      setCounterB(1);
      setCounterB(0);
    });
    assertLog([
      'Render A: 1',
      'Render B: 0',
      'Commit A: 1',
      // B should not fire an effect because the update bailed out
      // 'Commit B: 0',
    ]);
  });

  // @gate enableStore
  it('should process the rest pending updates after a render phase update', async () => {
    // Similar to previous test, except using a preceding render phase update
    // instead of new props.
    const aStore = createStore(false);
    const bStore = createStore(false);
    const cStore = createStore(false);
    const updateA = aStore.update;
    const setB = bStore.update;
    const updateC = cStore.update;
    function App() {
      const a = use(aStore);
      const b = use(bStore);
      if (a !== b) {
        setB(a);
      }
      // Even though we called setB above,
      // we should still apply the changes to C,
      // during this render pass.
      const c = use(cStore);
      return `${a ? 'A' : 'a'}${b ? 'B' : 'b'}${c ? 'C' : 'c'}`;
    }

    await act(() => ReactNoop.render(<App />));
    expect(ReactNoop).toMatchRenderedOutput('abc');

    await act(() => {
      updateA(true);
      // This update should not get dropped.
      updateC(true);
    });
    // store-semantics: store updates during render warn and are rendered after
    // the current render.
    assertConsoleErrorDev([storeUpdateInRenderWarning('App')]);
    expect(ReactNoop).toMatchRenderedOutput('ABC');
  });

  // @gate enableStore
  it('effect dependencies are persisted after a render phase update', async () => {
    let handleClick;
    const countStore = createStore(0);
    const setCount = countStore.update;
    function Test() {
      const count = use(countStore);

      useEffect(() => {
        Scheduler.log(`Effect: ${count}`);
      }, [count]);

      if (count > 0) {
        setCount(0);
      }

      handleClick = () => setCount(2);

      return <Text text={`Render: ${count}`} />;
    }

    await act(() => {
      ReactNoop.render(<Test />);
    });

    assertLog(['Render: 0', 'Effect: 0']);

    await act(() => {
      handleClick();
    });
    assertConsoleErrorDev([storeUpdateInRenderWarning('Test')]);

    // store-semantics: a render phase store update isn't processed in the
    // current render. It's scheduled, so the render with the clicked value
    // commits (and fires the effect) before the reset renders.
    assertLog(['Render: 2', 'Effect: 2', 'Render: 0', 'Effect: 0']);

    await act(() => {
      handleClick();
    });

    assertLog(['Render: 2', 'Effect: 2', 'Render: 0', 'Effect: 0']);

    await act(() => {
      handleClick();
    });

    assertLog(['Render: 2', 'Effect: 2', 'Render: 0', 'Effect: 0']);
  });
});
