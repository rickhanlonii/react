let React;
let ReactNoop;
let Scheduler;
let act;
let assertLog;
let useTransition;
let use;
let createStore;
let useOptimistic;
let textCache;
let assertConsoleErrorDev;

// The cases of ReactAsyncActions-test.js with their state in stores: store
// updates entangled with async actions (including after the useTransition hook
// unmounts), and render-phase store updates under useOptimistic rebasing.
describe('ReactAsyncActions', () => {
  beforeEach(() => {
    jest.resetModules();

    global.reportError = error => {
      Scheduler.log('reportError: ' + error.message);
    };

    React = require('react');
    ReactNoop = require('react-noop-renderer');
    Scheduler = require('scheduler');
    act = require('internal-test-utils').act;
    assertLog = require('internal-test-utils').assertLog;
    assertConsoleErrorDev =
      require('internal-test-utils').assertConsoleErrorDev;
    useTransition = React.useTransition;
    use = React.use;
    createStore = React.unstable_createStore;
    useOptimistic = React.useOptimistic;

    textCache = new Map();
  });

  function resolveText(text) {
    const record = textCache.get(text);
    if (record === undefined) {
      const newRecord = {
        status: 'resolved',
        value: text,
      };
      textCache.set(text, newRecord);
    } else if (record.status === 'pending') {
      const thenable = record.value;
      record.status = 'resolved';
      record.value = text;
      thenable.pings.forEach(t => t());
    }
  }

  function readText(text) {
    const record = textCache.get(text);
    if (record !== undefined) {
      switch (record.status) {
        case 'pending':
          Scheduler.log(`Suspend! [${text}]`);
          throw record.value;
        case 'rejected':
          throw record.value;
        case 'resolved':
          return record.value;
      }
    } else {
      Scheduler.log(`Suspend! [${text}]`);
      const thenable = {
        pings: [],
        then(resolve) {
          if (newRecord.status === 'pending') {
            thenable.pings.push(resolve);
          } else {
            Promise.resolve().then(() => resolve(newRecord.value));
          }
        },
      };

      const newRecord = {
        status: 'pending',
        value: thenable,
      };
      textCache.set(text, newRecord);

      throw thenable;
    }
  }

  function getText(text) {
    const record = textCache.get(text);
    if (record === undefined) {
      const thenable = {
        pings: [],
        then(resolve) {
          if (newRecord.status === 'pending') {
            thenable.pings.push(resolve);
          } else {
            Promise.resolve().then(() => resolve(newRecord.value));
          }
        },
      };
      const newRecord = {
        status: 'pending',
        value: thenable,
      };
      textCache.set(text, newRecord);
      return thenable;
    } else {
      switch (record.status) {
        case 'pending':
          return record.value;
        case 'rejected':
          return Promise.reject(record.value);
        case 'resolved':
          return Promise.resolve(record.value);
      }
    }
  }

  function Text({text}) {
    Scheduler.log(text);
    return text;
  }

  function AsyncText({text}) {
    readText(text);
    Scheduler.log(text);
    return text;
  }

  // @gate enableStore
  it('multiple async action updates in the same scope are entangled together', async () => {
    const stepAStore = createStore(0);
    const setStepA = stepAStore.update;
    function A() {
      const step = use(stepAStore);
      return <AsyncText text={'A' + step} />;
    }

    const stepBStore = createStore(0);
    const setStepB = stepBStore.update;
    function B() {
      const step = use(stepBStore);
      return <AsyncText text={'B' + step} />;
    }

    const stepCStore = createStore(0);
    const setStepC = stepCStore.update;
    function C() {
      const step = use(stepCStore);
      return <AsyncText text={'C' + step} />;
    }

    let startTransition;
    function App() {
      const [isPending, _start] = useTransition();
      startTransition = _start;
      return (
        <>
          <span>
            <Text text={'Pending: ' + isPending} />
          </span>
          <span>
            <A />, <B />, <C />
          </span>
        </>
      );
    }

    const root = ReactNoop.createRoot();
    resolveText('A0');
    resolveText('B0');
    resolveText('C0');
    await act(() => {
      root.render(<App text="A" />);
    });
    assertLog(['Pending: false', 'A0', 'B0', 'C0']);
    expect(root).toMatchRenderedOutput(
      <>
        <span>Pending: false</span>
        <span>A0, B0, C0</span>
      </>,
    );

    await act(() => {
      startTransition(async () => {
        Scheduler.log('Async action started');
        setStepA(1);
        await getText('Wait before updating B');
        startTransition(() => setStepB(1));
        await getText('Wait before updating C');
        startTransition(() => setStepC(1));
        Scheduler.log('Async action ended');
      });
    });
    assertLog(['Async action started', 'Pending: true', 'A0', 'B0', 'C0']);
    expect(root).toMatchRenderedOutput(
      <>
        <span>Pending: true</span>
        <span>A0, B0, C0</span>
      </>,
    );

    // This will schedule an update on B, but nothing will render yet because
    // the async action scope hasn't finished.
    await act(() => resolveText('Wait before updating B'));
    assertLog([]);
    expect(root).toMatchRenderedOutput(
      <>
        <span>Pending: true</span>
        <span>A0, B0, C0</span>
      </>,
    );

    // This will schedule an update on C, and also the async action scope
    // will end. This will allow React to attempt to render the updates.
    await act(() => resolveText('Wait before updating C'));
    assertLog([
      'Async action ended',
      'Pending: false',
      'Suspend! [A1]',
      // pre-warming
      'Suspend! [B1]',
      'Suspend! [C1]',
    ]);
    expect(root).toMatchRenderedOutput(
      <>
        <span>Pending: true</span>
        <span>A0, B0, C0</span>
      </>,
    );

    // Progressively load the all the data. Because they are all entangled
    // together, only when the all of A, B, and C updates are unblocked is the
    // render allowed to proceed.
    await act(() => resolveText('A1'));
    assertLog([
      'Pending: false',
      'A1',
      'Suspend! [B1]',
      // pre-warming
      'Suspend! [C1]',
    ]);
    expect(root).toMatchRenderedOutput(
      <>
        <span>Pending: true</span>
        <span>A0, B0, C0</span>
      </>,
    );
    await act(() => resolveText('B1'));
    assertLog(['Pending: false', 'A1', 'B1', 'Suspend! [C1]']);
    expect(root).toMatchRenderedOutput(
      <>
        <span>Pending: true</span>
        <span>A0, B0, C0</span>
      </>,
    );

    // Finally, all the data has loaded and the transition is complete.
    await act(() => resolveText('C1'));
    assertLog(['Pending: false', 'A1', 'B1', 'C1']);
    expect(root).toMatchRenderedOutput(
      <>
        <span>Pending: false</span>
        <span>A1, B1, C1</span>
      </>,
    );
  });

  // @gate enableStore
  it('urgent updates are not blocked during an async action', async () => {
    const stepAStore = createStore(0);
    const setStepA = stepAStore.update;
    function A() {
      const step = use(stepAStore);
      return <Text text={'A' + step} />;
    }

    const stepBStore = createStore(0);
    const setStepB = stepBStore.update;
    function B() {
      const step = use(stepBStore);
      return <Text text={'B' + step} />;
    }

    let startTransition;
    function App() {
      const [isPending, _start] = useTransition();
      startTransition = _start;
      return (
        <>
          <span>
            <Text text={'Pending: ' + isPending} />
          </span>
          <span>
            <A />, <B />
          </span>
        </>
      );
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      root.render(<App text="A" />);
    });
    assertLog(['Pending: false', 'A0', 'B0']);
    expect(root).toMatchRenderedOutput(
      <>
        <span>Pending: false</span>
        <span>A0, B0</span>
      </>,
    );

    await act(() => {
      startTransition(async () => {
        Scheduler.log('Async action started');
        startTransition(() => setStepA(1));
        await getText('Wait');
        Scheduler.log('Async action ended');
      });
    });
    assertLog(['Async action started', 'Pending: true', 'A0', 'B0']);
    expect(root).toMatchRenderedOutput(
      <>
        <span>Pending: true</span>
        <span>A0, B0</span>
      </>,
    );

    // Update B at urgent priority. This should be allowed to finish.
    await act(() => setStepB(1));
    assertLog(['B1']);
    expect(root).toMatchRenderedOutput(
      <>
        <span>Pending: true</span>
        <span>A0, B1</span>
      </>,
    );

    // Finish the async action.
    await act(() => resolveText('Wait'));
    assertLog(['Async action ended', 'Pending: false', 'A1', 'B1']);
    expect(root).toMatchRenderedOutput(
      <>
        <span>Pending: false</span>
        <span>A1, B1</span>
      </>,
    );
  });

  // @gate enableStore
  it('regression: useOptimistic during setState-in-render', async () => {
    // This is a regression test for a very specific case where useOptimistic is
    // the first hook in the component, it has a pending update, and a later
    // hook schedules a local (setState-in-render) update. Don't sweat about
    // deleting this test if the implementation details change.

    let setOptimisticState;
    let startTransition;
    const derivedStateStore = createStore(0);
    function App() {
      const [optimisticState, _setOptimisticState] = useOptimistic(0);
      setOptimisticState = _setOptimisticState;
      const [, _startTransition] = useTransition();
      startTransition = _startTransition;

      const derivedState = use(derivedStateStore);
      if (derivedState !== optimisticState) {
        // store-semantics: a render-phase store.update is scheduled for the
        // next render. It isn't processed in the current one.
        derivedStateStore.update(optimisticState);
      }

      return <Text text={optimisticState} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<App />));
    assertLog([0]);
    expect(root).toMatchRenderedOutput('0');

    await act(() => {
      startTransition(async () => {
        setOptimisticState(1);
        await getText('Wait');
      });
    });
    // store-semantics: store updates during render warn and are rendered
    // after the current render
    assertConsoleErrorDev([
      'Cannot update a store while rendering a component (`App`). ' +
        'Updating a store is a side effect, so it should happen in an event ' +
        'handler or an effect. The update will be rendered after the ' +
        'current render. To locate the bad store.update() call inside ' +
        '`App`, follow the stack trace as described in ' +
        'https://react.dev/link/setstate-in-render\n' +
        '    in App (at **)',
    ]);
    // store-semantics: the render-phase update to the derived store renders
    // again in a separate render.
    assertLog([1, 1]);
    expect(root).toMatchRenderedOutput('1');
  });

  // @gate enableStore
  it('useOptimistic rebases if the passthrough is updated during a render phase update', async () => {
    // This is kind of an esoteric case where it's hard to come up with a
    // realistic real-world scenario but it should still work.
    let increment;
    const countStore = createStore(0);
    const setCount = countStore.update;
    function App() {
      const [isPending, startTransition] = useTransition(2);
      const count = use(countStore);

      const [optimisticCount, setOptimisticCount] = useOptimistic(
        count,
        prev => {
          Scheduler.log('Increment optimistic count');
          return prev + 1;
        },
      );

      if (count === 1) {
        Scheduler.log('Render phase update count from 1 to 2');
        // store-semantics: a render-phase store.update is scheduled for the
        // next render. It isn't processed in the current one.
        setCount(2);
      }

      increment = () =>
        startTransition(async () => {
          setOptimisticCount(n => n + 1);
          await getText('Wait to increment');
          React.startTransition(() => setCount(n => n + 1));
        });

      return (
        <>
          <div>
            <Text text={'Count: ' + count} />
          </div>
          {isPending ? (
            <div>
              <Text text={'Optimistic count: ' + optimisticCount} />
            </div>
          ) : null}
        </>
      );
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<App />));
    assertLog(['Count: 0']);
    expect(root).toMatchRenderedOutput(<div>Count: 0</div>);

    await act(() => increment());
    assertLog([
      'Increment optimistic count',
      'Count: 0',
      'Optimistic count: 1',
    ]);
    expect(root).toMatchRenderedOutput(
      <>
        <div>Count: 0</div>
        <div>Optimistic count: 1</div>
      </>,
    );

    await act(() => setCount(1));
    // store-semantics: store updates during render warn and are rendered
    // after the current render
    assertConsoleErrorDev([
      'Cannot update a store while rendering a component (`App`). ' +
        'Updating a store is a side effect, so it should happen in an event ' +
        'handler or an effect. The update will be rendered after the ' +
        'current render. To locate the bad store.update() call inside ' +
        '`App`, follow the stack trace as described in ' +
        'https://react.dev/link/setstate-in-render\n' +
        '    in App (at **)',
    ]);
    assertLog([
      'Increment optimistic count',
      'Render phase update count from 1 to 2',
      // store-semantics: the render-phase update is scheduled for the next
      // render, so this render commits count 1 first.
      'Count: 1',
      'Optimistic count: 2',
      // The optimistic update is rebased on top of the new passthrough value.
      'Increment optimistic count',
      'Count: 2',
      'Optimistic count: 3',
    ]);
    expect(root).toMatchRenderedOutput(
      <>
        <div>Count: 2</div>
        <div>Optimistic count: 3</div>
      </>,
    );

    // Finish the action
    await act(() => resolveText('Wait to increment'));
    assertLog(['Count: 3']);
    expect(root).toMatchRenderedOutput(<div>Count: 3</div>);
  });

  // @gate enableStore
  it('useOptimistic rebases if the passthrough is updated during a render phase update (initial mount)', async () => {
    // This is kind of an esoteric case where it's hard to come up with a
    // realistic real-world scenario but it should still work.
    const countStore = createStore(0);
    function App() {
      const count = use(countStore);
      const [optimisticCount] = useOptimistic(count);

      if (count === 0) {
        Scheduler.log('Render phase update count from 1 to 2');
        // store-semantics: a render-phase store.update is scheduled for the
        // next render. It isn't processed in the current one.
        countStore.update(1);
      }

      return (
        <>
          <div>
            <Text text={'Count: ' + count} />
          </div>
          <div>
            <Text text={'Optimistic count: ' + optimisticCount} />
          </div>
        </>
      );
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<App />));
    // store-semantics: store updates during render warn and are rendered
    // after the current render
    assertConsoleErrorDev([
      'Cannot update a store while rendering a component (`App`). ' +
        'Updating a store is a side effect, so it should happen in an event ' +
        'handler or an effect. The update will be rendered after the ' +
        'current render. To locate the bad store.update() call inside ' +
        '`App`, follow the stack trace as described in ' +
        'https://react.dev/link/setstate-in-render\n' +
        '    in App (at **)',
    ]);
    assertLog([
      'Render phase update count from 1 to 2',
      // store-semantics: the render-phase update is scheduled for the next
      // render, so the initial render commits count 0 first.
      'Count: 0',
      'Optimistic count: 0',
      'Count: 1',
      'Optimistic count: 1',
    ]);
    expect(root).toMatchRenderedOutput(
      <>
        <div>Count: 1</div>
        <div>Optimistic count: 1</div>
      </>,
    );
  });

  // @gate enableStore
  it(
    'optimistic state is not reverted until async action finishes, even if ' +
      'useTransition hook is unmounted',
    async () => {
      let startTransition;
      function Updater() {
        const [isPending, _start] = useTransition();
        startTransition = _start;
        return (
          <span>
            <Text text={'Pending: ' + isPending} />
          </span>
        );
      }

      const canonicalTextStore = createStore('A');
      const setText = canonicalTextStore.update;
      let setOptimisticText;
      function Sibling() {
        const canonicalText = use(canonicalTextStore);

        const [text, _setOptimisticText] = useOptimistic(
          canonicalText,
          (_, optimisticText) => `${optimisticText} (loading...)`,
        );
        setOptimisticText = _setOptimisticText;

        return (
          <span>
            <Text text={text} />
          </span>
        );
      }

      function App({showUpdater}) {
        return (
          <>
            {showUpdater ? <Updater /> : null}
            <Sibling />
          </>
        );
      }

      const root = ReactNoop.createRoot();
      await act(() => {
        root.render(<App showUpdater={true} />);
      });
      assertLog(['Pending: false', 'A']);
      expect(root).toMatchRenderedOutput(
        <>
          <span>Pending: false</span>
          <span>A</span>
        </>,
      );

      // Start an async action that has multiple updates with async
      // operations in between.
      await act(() => {
        startTransition(async () => {
          Scheduler.log('Async action started');

          setOptimisticText('C');

          startTransition(() => setText('B'));

          await getText('Wait before updating to C');

          Scheduler.log('Async action ended');
          startTransition(() => setText('C'));
        });
      });
      assertLog([
        'Async action started',
        'Pending: true',
        // Render an optimistic value
        'C (loading...)',
      ]);
      expect(root).toMatchRenderedOutput(
        <>
          <span>Pending: true</span>
          <span>C (loading...)</span>
        </>,
      );

      // Delete the component that contains the useTransition hook. This
      // component no longer blocks the transition from completing. But the
      // we're still showing an optimistic state, because the async action has
      // not yet finished.
      await act(() => {
        root.render(<App showUpdater={false} />);
      });
      assertLog(['C (loading...)']);
      expect(root).toMatchRenderedOutput(<span>C (loading...)</span>);

      // Finish the async action. Now the optimistic state is reverted and we
      // switch to the canonical value.
      await act(() => resolveText('Wait before updating to C'));
      assertLog(['Async action ended', 'C']);
      expect(root).toMatchRenderedOutput(<span>C</span>);
    },
  );

  // @gate enableStore
  it(
    'updates in an async action are entangled even if useTransition hook ' +
      'is unmounted before it finishes',
    async () => {
      let startTransition;
      function Updater() {
        const [isPending, _start] = useTransition();
        startTransition = _start;
        return (
          <span>
            <Text text={'Pending: ' + isPending} />
          </span>
        );
      }

      const textStore = createStore('A');
      const setText = textStore.update;
      function Sibling() {
        const text = use(textStore);
        return (
          <span>
            <Text text={text} />
          </span>
        );
      }

      function App({showUpdater}) {
        return (
          <>
            {showUpdater ? <Updater /> : null}
            <Sibling />
          </>
        );
      }

      const root = ReactNoop.createRoot();
      await act(() => {
        root.render(<App showUpdater={true} />);
      });
      assertLog(['Pending: false', 'A']);
      expect(root).toMatchRenderedOutput(
        <>
          <span>Pending: false</span>
          <span>A</span>
        </>,
      );

      // Start an async action that has multiple updates with async
      // operations in between.
      await act(() => {
        startTransition(async () => {
          Scheduler.log('Async action started');
          startTransition(() => setText('B'));

          await getText('Wait before updating to C');

          Scheduler.log('Async action ended');
          startTransition(() => setText('C'));
        });
      });
      assertLog(['Async action started', 'Pending: true']);
      expect(root).toMatchRenderedOutput(
        <>
          <span>Pending: true</span>
          <span>A</span>
        </>,
      );

      // Delete the component that contains the useTransition hook. This
      // component no longer blocks the transition from completing. But the
      // pending update to Sibling should not be allowed to finish, because it's
      // part of the async action.
      await act(() => {
        root.render(<App showUpdater={false} />);
      });
      assertLog(['A']);
      expect(root).toMatchRenderedOutput(<span>A</span>);

      // Finish the async action. Notice the intermediate B state was never
      // shown, because it was batched with the update that came later in the
      // same action.
      await act(() => resolveText('Wait before updating to C'));
      assertLog(['Async action ended', 'C']);
      expect(root).toMatchRenderedOutput(<span>C</span>);
    },
  );

  // @gate enableStore
  it(
    'updates in an async action are entangled even if useTransition hook ' +
      'is unmounted before it finishes (root update)',
    async () => {
      let startTransition;
      function Updater() {
        const [isPending, _start] = useTransition();
        startTransition = _start;
        return (
          <span>
            <Text text={'Pending: ' + isPending} />
          </span>
        );
      }

      const showUpdaterStore = createStore(true);
      const setShowUpdater = showUpdaterStore.update;
      function App({text}) {
        const showUpdater = use(showUpdaterStore);
        return (
          <>
            {showUpdater ? <Updater /> : null}
            <span>
              <Text text={text} />
            </span>
          </>
        );
      }

      const root = ReactNoop.createRoot();
      await act(() => {
        root.render(<App text="A" />);
      });
      assertLog(['Pending: false', 'A']);
      expect(root).toMatchRenderedOutput(
        <>
          <span>Pending: false</span>
          <span>A</span>
        </>,
      );

      // Start an async action that has multiple updates with async
      // operations in between.
      await act(() => {
        startTransition(async () => {
          Scheduler.log('Async action started');
          startTransition(() => root.render(<App text="B" />));

          await getText('Wait before updating to C');

          Scheduler.log('Async action ended');
          startTransition(() => root.render(<App text="C" />));
        });
      });
      assertLog(['Async action started', 'Pending: true']);
      expect(root).toMatchRenderedOutput(
        <>
          <span>Pending: true</span>
          <span>A</span>
        </>,
      );

      // Delete the component that contains the useTransition hook. This
      // component no longer blocks the transition from completing. But the
      // pending update to Sibling should not be allowed to finish, because it's
      // part of the async action.
      await act(() => setShowUpdater(false));
      assertLog(['A']);
      expect(root).toMatchRenderedOutput(<span>A</span>);

      // Finish the async action. Notice the intermediate B state was never
      // shown, because it was batched with the update that came later in the
      // same action.
      await act(() => resolveText('Wait before updating to C'));
      assertLog(['Async action ended', 'C']);
      expect(root).toMatchRenderedOutput(<span>C</span>);

      // Check that subsequent updates are unaffected.
      await act(() => root.render(<App text="D" />));
      assertLog(['D']);
      expect(root).toMatchRenderedOutput(<span>D</span>);
    },
  );
});
