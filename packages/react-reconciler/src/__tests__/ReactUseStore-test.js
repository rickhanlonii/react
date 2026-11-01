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
let ReactNoop;
let Scheduler;
let ContinuousEventPriority;
let act;
let use;
let useState;
let useEffect;
let useLayoutEffect;
let useMemo;
let useDeferredValue;
let startTransition;
let Suspense;
let Activity;
let StrictMode;
let assertLog;
let waitFor;
let waitForAll;
let waitForPaint;
let assertConsoleErrorDev;
let assertConsoleWarnDev;
let createStore;
let ErrorBoundary;
let textCache;

const originalReportError = global.reportError;

beforeEach(() => {
  jest.resetModules();
  // Errors that no error boundary handles, like a reducer error that no
  // component threw, are passed to reportError. Log the first sentence of
  // each one. React reads reportError when it loads.
  global.reportError = error => {
    Scheduler.log('reportError: ' + error.message.split('.')[0]);
  };

  React = require('react');
  ReactNoop = require('react-noop-renderer');
  Scheduler = require('scheduler');
  ContinuousEventPriority =
    require('react-reconciler/constants').ContinuousEventPriority;
  use = React.use;
  useState = React.useState;
  useEffect = React.useEffect;
  useLayoutEffect = React.useLayoutEffect;
  useMemo = React.useMemo;
  useDeferredValue = React.useDeferredValue;
  startTransition = React.startTransition;
  Suspense = React.Suspense;
  Activity = React.Activity;
  StrictMode = React.StrictMode;
  createStore = React.unstable_createStore;

  const InternalTestUtils = require('internal-test-utils');
  act = InternalTestUtils.act;
  assertLog = InternalTestUtils.assertLog;
  waitFor = InternalTestUtils.waitFor;
  waitForAll = InternalTestUtils.waitForAll;
  waitForPaint = InternalTestUtils.waitForPaint;
  assertConsoleErrorDev = InternalTestUtils.assertConsoleErrorDev;
  assertConsoleWarnDev = InternalTestUtils.assertConsoleWarnDev;

  ErrorBoundary = createErrorBoundary();
  textCache = new Map();
});

afterEach(() => {
  global.reportError = originalReportError;
  // A reported error would otherwise go unnoticed after the last act.
  assertLog([]);
});

// Shows "Caught: <message>", or `fallback`. With `rethrow`, it throws the
// error again while rendering its error state, which passes it to the next
// boundary up. The class is created after React loads.
function createErrorBoundary() {
  return class extends React.Component {
    state = {error: null};
    static getDerivedStateFromError(error) {
      return {error};
    }
    render() {
      const {error} = this.state;
      if (error === null) {
        return this.props.children;
      }
      if (this.props.rethrow) {
        throw error;
      }
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <Text text={(this.props.name || 'Caught') + ': ' + error.message} />
      );
    }
  };
}

// A root that logs the errors that its error boundaries catch, and the ones
// that none of them catch.
function createRootLoggingErrors() {
  return ReactNoop.createRoot({
    onCaughtError(error) {
      Scheduler.log('onCaughtError: ' + error.message.split('.')[0]);
    },
    onUncaughtError(error) {
      Scheduler.log('onUncaughtError: ' + error.message.split('.')[0]);
    },
  });
}

function throwingReducer(state, action) {
  if (action === 'throw') {
    throw new Error('Oops');
  }
  return action;
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

// These helpers are the only code that reads the store's internals. They
// check that a store doesn't keep roots or updates alive after nothing needs
// them.
function expectStoreToHaveRoots(store, count) {
  expect(store._records.length).toBe(count);
}

function expectNoPendingUpdates(store) {
  // Every root committed every update, so the store doesn't keep them.
  expect(store._headQueue).toBe(null);
  expect(store._pendingTransitionUpdates).toBe(null);
}

function getRootThatReads(store) {
  return store._records[0].root;
}

// The root's committed HostRoot doesn't hold a state for the store, and the
// records of other stores don't hold one in their caches.
function expectRootNotToRetainStore(fiberRoot, store, otherStores = []) {
  const holdsStore = map =>
    Array.from(map.keys()).some(record => record.store === store);
  const states = fiberRoot.current.memoizedState.storeStates;
  expect(states != null && holdsStore(states.map)).toBe(false);
  otherStores.forEach(other => {
    other._records.forEach(record => {
      expect(
        Object.values(record).some(
          value => value instanceof Map && holdsStore(value),
        ),
      ).toBe(false);
    });
  });
}

function resolveText(text) {
  const record = textCache.get(text);
  if (record === undefined) {
    textCache.set(text, {status: 'resolved', value: text});
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
    if (record.status === 'pending') {
      Scheduler.log(`Suspend! [${text}]`);
      throw record.value;
    }
    return record.value;
  }
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
  const newRecord = {status: 'pending', value: thenable};
  textCache.set(text, newRecord);
  throw thenable;
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

describe('reading and updating', () => {
  // @gate enableStore
  it('reads updates made before the first render', async () => {
    const store = createStore(1);
    store.update(2);
    store.update(n => n + 1);

    function App() {
      const value = use(store);
      Scheduler.log(value);
      return <span>{value}</span>;
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<App />));
    assertLog([3]);
    expect(root).toMatchRenderedOutput(<span>3</span>);
  });

  // @gate enableStore
  it('passes actions to the reducer', async () => {
    const store = createStore(0, (state, action) =>
      action.type === 'add' ? state + action.amount : state,
    );
    store.update({type: 'add', amount: 5});
    store.update({type: 'unknown'});

    function App() {
      return <span>{use(store)}</span>;
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<App />));
    expect(root).toMatchRenderedOutput(<span>5</span>);

    await act(() => store.update({type: 'add', amount: 2}));
    expect(root).toMatchRenderedOutput(<span>7</span>);
  });

  // @gate enableStore
  it('re-renders readers when the store is updated', async () => {
    const store = createStore(0);

    function Reader({name}) {
      const value = use(store);
      return <Text text={name + ': ' + value} />;
    }

    function App() {
      return (
        <>
          <Reader name="A" />
          <Reader name="B" />
        </>
      );
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<App />));
    assertLog(['A: 0', 'B: 0']);

    await act(() => store.update(1));
    assertLog(['A: 1', 'B: 1']);
    expect(root).toMatchRenderedOutput('A: 1B: 1');

    await act(() => store.update(n => n + 1));
    assertLog(['A: 2', 'B: 2']);
    expect(root).toMatchRenderedOutput('A: 2B: 2');
  });

  // @gate enableStore
  it('only re-renders the components that read the store', async () => {
    const store = createStore(0);

    function Reader() {
      return <Text text={'Reader: ' + use(store)} />;
    }

    function Parent() {
      Scheduler.log('Parent');
      return <Reader />;
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<Parent />));
    assertLog(['Parent', 'Reader: 0']);

    await act(() => store.update(1));
    assertLog(['Reader: 1']);
  });

  // @gate enableStore
  it('bails out when the value does not change', async () => {
    const store = createStore(0);

    function Reader() {
      return <Text text={'Reader: ' + use(store)} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<Reader />));
    assertLog(['Reader: 0']);

    await act(() => store.update(0));
    assertLog([]);

    // An object store that's updated to the same object.
    const objectStore = createStore({a: 1});
    function ObjectReader() {
      return <Text text={'a: ' + use(objectStore).a} />;
    }
    await act(() => root.render(<ObjectReader />));
    assertLog(['a: 1']);
    await act(() => objectStore.update(prev => prev));
    assertLog([]);
  });

  // @gate enableStore
  it('can be read conditionally', async () => {
    const store = createStore('A');

    let setShouldRead;
    function App() {
      const [shouldRead, _setShouldRead] = useState(true);
      setShouldRead = _setShouldRead;
      if (shouldRead) {
        return <Text text={'Value: ' + use(store)} />;
      }
      return <Text text="Not reading" />;
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<App />));
    assertLog(['Value: A']);

    await act(() => setShouldRead(false));
    assertLog(['Not reading']);

    // Updates to a store the component no longer reads don't re-render it.
    await act(() => store.update('B'));
    assertLog([]);
    expectStoreToHaveRoots(store, 0);

    // Reading it again shows the latest value.
    await act(() => setShouldRead(true));
    assertLog(['Value: B']);

    await act(() => store.update('C'));
    assertLog(['Value: C']);
  });

  // @gate enableStore
  it('can read a list of stores in a loop', async () => {
    const stores = [createStore(1), createStore(2), createStore(3)];

    function Sum() {
      let sum = 0;
      for (let i = 0; i < stores.length; i++) {
        sum += use(stores[i]);
      }
      return <Text text={'Sum: ' + sum} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<Sum />));
    assertLog(['Sum: 6']);

    await act(() => stores[1].update(10));
    assertLog(['Sum: 14']);
  });

  // @gate enableStore
  it('supports stores of stores for granular updates', async () => {
    const todoTwo = createStore({id: 2, text: 'Two'});
    const todos = createStore([createStore({id: 1, text: 'One'}), todoTwo]);

    function Todo({todo}) {
      return <Text text={use(todo).text} />;
    }

    function List() {
      const list = use(todos);
      Scheduler.log('List');
      return list.map((todo, i) => <Todo key={i} todo={todo} />);
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<List />));
    assertLog(['List', 'One', 'Two']);

    // Updating one item only re-renders the components that read it.
    await act(() => todoTwo.update(prev => ({...prev, text: 'Two!'})));
    assertLog(['Two!']);

    await act(() => {
      todos.update(prev => [...prev, createStore({id: 3, text: 'Three'})]);
    });
    assertLog(['List', 'One', 'Two!', 'Three']);
    expect(root).toMatchRenderedOutput('OneTwo!Three');
  });

  // @gate enableStore
  it('keeps subscriptions when the same stores are read in a different order', async () => {
    const storeA = createStore('A');
    const storeB = createStore('B');

    let setReversed;
    function Reader() {
      const [reversed, _setReversed] = useState(false);
      setReversed = _setReversed;
      const text = reversed
        ? use(storeB) + use(storeA)
        : use(storeA) + use(storeB);
      return <Text text={text} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<Reader />));
    assertLog(['AB']);

    await act(() => setReversed(true));
    assertLog(['BA']);

    await act(() => storeA.update('A2'));
    assertLog(['BA2']);
    await act(() => storeB.update('B2'));
    assertLog(['B2A2']);
  });

  // @gate enableStore
  it('a component that starts reading a store stays subscribed when its render bails out', async () => {
    const store = createStore(0);
    let readStore = false;

    let setState;
    function Reader() {
      const [state, _setState] = useState(0);
      setState = _setState;
      const value = readStore ? use(store) : 'none';
      Scheduler.log('Reader: ' + value);
      return 'Value: ' + value + ' ' + state;
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<Reader />));
    assertLog(['Reader: none']);

    // Render again with the same state, so the render bails out, but this
    // time read the store. The second update can't be computed eagerly, so
    // the component renders.
    readStore = true;
    await act(() => {
      setState(1);
      setState(0);
    });
    assertLog(['Reader: 0']);

    // The component read the store in its last render, so it's subscribed.
    await act(() => store.update(1));
    assertLog(['Reader: 1']);
    expect(root).toMatchRenderedOutput('Value: 1 0');
  });

  // With enableSameElementBailout, the parent skips reconciling its child.
  // Without it, the child bails out on its unchanged props. Either way, the
  // store update has to reach the readers.
  // @gate enableStore
  it('reaches readers past a parent that returns the same element', async () => {
    const store = createStore(0);

    function Below() {
      return <Text text={'Below: ' + use(store)} />;
    }

    function Middle() {
      Scheduler.log('Middle');
      return <Below />;
    }

    function Child({children}) {
      return (
        <>
          <Text text={'Child: ' + use(store)} />
          {children}
        </>
      );
    }

    let setCount;
    function Parent() {
      const [count, _setCount] = useState(0);
      setCount = _setCount;
      Scheduler.log('Parent ' + count);
      // The same element every render, the way the compiler memoizes it, so
      // React skips reconciling Child when Parent re-renders.
      return useMemo(
        () => (
          <Child>
            <Middle />
          </Child>
        ),
        [],
      );
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<Parent />));
    assertLog(['Parent 0', 'Child: 0', 'Middle', 'Below: 0']);

    // A state update re-renders Parent, and Child bails out.
    await act(() => setCount(1));
    assertLog(['Parent 1']);

    // A store update in the same event still reaches Child, which reads the
    // store, and Below, past Middle, which bails out.
    await act(() => {
      setCount(2);
      store.update(1);
    });
    assertLog(['Parent 2', 'Child: 1', 'Below: 1']);
    expect(root).toMatchRenderedOutput('Child: 1Below: 1');
  });

  // @gate enableStore
  it('does not miss updates dispatched in a layout effect before the reader subscribes', async () => {
    const store = createStore(1);

    function Updater() {
      useLayoutEffect(() => {
        Scheduler.log('Layout effect');
        store.update(2);
      }, []);
      return null;
    }

    function Reader() {
      return <Text text={'Reader: ' + use(store)} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      root.render(
        <>
          <Updater />
          <Reader />
        </>,
      );
    });
    assertLog(['Reader: 1', 'Layout effect', 'Reader: 2']);
    expect(root).toMatchRenderedOutput('Reader: 2');
  });

  // @gate enableStore
  it('updates sibling readers whether or not a render is in progress', async () => {
    const store = createStore(0);
    const other = createStore('a');

    function Reader({name}) {
      return <Text text={name + use(store)} />;
    }
    let onLayout = () => {};
    function Other() {
      useLayoutEffect(() => onLayout());
      return <Text text={'O' + use(other)} />;
    }
    function Memo({children}) {
      return children;
    }
    const MemoList = React.memo(function List() {
      return (
        <>
          <Reader name="A" />
          <Reader name="B" />
          <Memo>
            <Reader name="C" />
          </Memo>
          <Reader name="D" />
        </>
      );
    });

    function App() {
      return (
        <>
          <MemoList />
          <Other />
        </>
      );
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<App />));
    assertLog(['A0', 'B0', 'C0', 'D0', 'Oa']);

    // Nothing is rendering: the readers are marked right away.
    await act(() => store.update(1));
    assertLog(['A1', 'B1', 'C1', 'D1']);

    // In a transition.
    await act(() => startTransition(() => store.update(2)));
    assertLog(['A2', 'B2', 'C2', 'D2']);

    // During a commit, from a layout effect.
    onLayout = () => {
      onLayout = () => {};
      store.update(3);
    };
    await act(() => other.update('b'));
    assertLog(['Ob', 'A3', 'B3', 'C3', 'D3']);

    // While a concurrent render is in progress. The readers are marked
    // through the concurrent queue, so the transition doesn't finish their
    // lane.
    await act(async () => {
      startTransition(() => other.update('c'));
      await waitFor(['Oc']);
      // The transition hasn't committed yet.
      expect(root).toMatchRenderedOutput('A3B3C3D3Ob');
      store.update(4);
    });
    assertLog(['A4', 'B4', 'C4', 'D4']);
    expect(root).toMatchRenderedOutput('A4B4C4D4Oc');
  });

  // @gate enableStore
  it('warns about a store update outside act in an act environment, naming a reader', async () => {
    const store = createStore(0);
    const never = new Promise(() => {});

    function Reader() {
      return <Text text={use(store)} />;
    }

    let setShow, setTab;
    function App() {
      const [show, _setShow] = useState(true);
      const [tab, _setTab] = useState('a');
      setShow = _setShow;
      setTab = _setTab;
      if (tab === 'b') {
        use(never);
      }
      return show ? <Reader /> : null;
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<App />));
    assertLog([0]);

    // The flag isn't set, so there's no warning.
    expect(global.IS_REACT_ACT_ENVIRONMENT).toBe(undefined);
    store.update(1);
    await waitForAll([1]);

    global.IS_REACT_ACT_ENVIRONMENT = true;
    try {
      // A store update isn't tied to a component, so the warning names a
      // component that reads the store.
      store.update(2);
      assertConsoleErrorDev([
        'An update to Reader inside a test was not wrapped in act(...).\n' +
          '\n' +
          'When testing, code that causes React state updates should be wrapped into act(...):\n' +
          '\n' +
          'act(() => {\n' +
          '  /* fire events that update state */\n' +
          '});\n' +
          '/* assert on the output */\n' +
          '\n' +
          "This ensures that you're testing the behavior the user would see in the browser. " +
          'Learn more at https://react.dev/link/wrap-tests-with-act\n' +
          '    in App (at **)',
      ]);
      await waitForAll([2]);

      // A transition that suspends keeps the root's copy of the store after
      // its only reader unmounts. An update to the store then schedules the
      // root, and with no reader to name, the warning names the root.
      await act(() => {
        startTransition(() => {
          store.update(3);
          setTab('b');
        });
        ReactNoop.flushSync(() => setShow(false));
      });
      expectStoreToHaveRoots(store, 1);
      store.update(4);
      assertConsoleErrorDev(
        [
          'An update to Root inside a test was not wrapped in act(...).\n' +
            '\n' +
            'When testing, code that causes React state updates should be wrapped into act(...):\n' +
            '\n' +
            'act(() => {\n' +
            '  /* fire events that update state */\n' +
            '});\n' +
            '/* assert on the output */\n' +
            '\n' +
            "This ensures that you're testing the behavior the user would see in the browser. " +
            'Learn more at https://react.dev/link/wrap-tests-with-act',
        ],
        {withoutStack: true},
      );
      await waitForAll([]);

      // When no root reads the store, the update doesn't schedule a render,
      // so there's nothing to warn about.
      await act(() => root.render(null));
      expectStoreToHaveRoots(store, 0);
      store.update(5);
      await waitForAll([]);
    } finally {
      global.IS_REACT_ACT_ENVIRONMENT = undefined;
    }
  });

  // @gate enableStore
  it('warns about a second callback argument to store.update', async () => {
    const store = createStore(0);

    function App() {
      return <Text text={use(store)} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<App />));
    assertLog([0]);

    await act(() => store.update(1, () => {}));
    assertConsoleErrorDev(
      [
        "store.update() doesn't support a second callback argument. " +
          'To execute a side effect after rendering, declare it in the ' +
          'component body with useEffect().',
      ],
      {withoutStack: true},
    );
    assertLog([1]);
    // Like a setState function, update has an arity of 1, with or without
    // a reducer.
    expect(store.update.length).toBe(1);
    expect(createStore(0, (s, a) => a).update.length).toBe(1);
  });

  // @gate enableStore
  it('throws an invalid hook call error when read outside a function component', async () => {
    const store = createStore(0);

    class App extends React.Component {
      render() {
        return use(store);
      }
    }

    const root = createRootLoggingErrors();
    await act(() => root.render(<App />));
    assertLog(['onUncaughtError: Invalid hook call']);

    // The same for a memo comparison.
    const Memo = React.memo(
      () => <Text text="Memo" />,
      () => use(store) === 0,
    );
    await act(() => root.render(<Memo />));
    assertLog(['Memo']);
    await act(() => root.render(<Memo />));
    assertLog(['onUncaughtError: Invalid hook call']);
  });

  // @gate !enableStore
  it('throws a clear error when the renderer does not support stores', async () => {
    // React can export createStore to a renderer built without stores.
    const store = {$$typeof: Symbol.for('react.store')};

    function App() {
      return use(store);
    }

    const root = createRootLoggingErrors();
    await act(() => root.render(<App />));
    assertLog([
      'onUncaughtError: use(store) is not supported by this renderer',
    ]);
  });
});

describe('batching and priority', () => {
  // @gate enableStore
  it('batches updates to the store with state updates in the same event', async () => {
    const store = createStore(0);

    let setLabel;
    function App() {
      const [label, _setLabel] = useState('Count');
      setLabel = _setLabel;
      return <Text text={label + ': ' + use(store)} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<App />));
    assertLog(['Count: 0']);

    await act(() => {
      store.update(1);
      setLabel('Total');
      store.update(2);
    });
    assertLog(['Total: 2']);
  });

  // @gate enableStore
  it('renders many updates to a store in one event, in every lane they were dispatched in', async () => {
    const store = createStore(0);

    function Reader({id}) {
      return <Text text={id + ': ' + use(store)} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      root.render(
        <>
          <Reader id="A" />
          <Reader id="B" />
          <Reader id="C" />
        </>,
      );
    });
    assertLog(['A: 0', 'B: 0', 'C: 0']);

    await act(() => {
      for (let i = 0; i < 100; i++) {
        store.update(n => n + 1);
      }
    });
    assertLog(['A: 100', 'B: 100', 'C: 100']);
    expect(root).toMatchRenderedOutput('A: 100B: 100C: 100');

    // Urgent and transition updates interleaved in one event. Each reader
    // renders the urgent ones first, then the transition.
    await act(() => {
      store.update(n => n + 1);
      startTransition(() => store.update(n => n + 10));
      store.update(n => n + 1);
      startTransition(() => store.update(n => n + 10));
    });
    assertLog(['A: 102', 'B: 102', 'C: 102', 'A: 122', 'B: 122', 'C: 122']);
    expect(root).toMatchRenderedOutput('A: 122B: 122C: 122');
  });

  // @gate enableStore
  it('a discrete update renders before a transition to the same store, without entangling', async () => {
    const store = createStore(0);

    function App() {
      return <Text text={use(store)} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<App />));
    assertLog([0]);

    await act(async () => {
      ReactNoop.discreteUpdates(() => {
        store.update(1);
      });
      startTransition(() => {
        store.update(2);
      });
    });
    // The urgent update renders on its own, then the transition.
    assertLog([1, 2]);
    expect(root).toMatchRenderedOutput('2');
  });

  // @gate enableStore
  it('a continuous update interrupts a transition', async () => {
    const counter = createStore(1);
    const isHidden = createStore(false);

    function App() {
      const count = use(counter);
      if (use(isHidden)) {
        return <Text text="(hidden)" />;
      }
      return (
        <>
          <Text text={'A' + count} />
          <Text text={'B' + count} />
          <Text text={'C' + count} />
        </>
      );
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<App />));
    assertLog(['A1', 'B1', 'C1']);

    await act(async () => {
      startTransition(() => {
        counter.update(2);
      });
      await waitFor(['A2']);
      ReactNoop.unstable_runWithPriority(ContinuousEventPriority, () => {
        isHidden.update(true);
      });
    });
    assertLog([
      // The update has continuous priority, so it interrupts the transition.
      '(hidden)',
      // When the transition resumes, there's nothing new to show.
      '(hidden)',
    ]);
    expect(root).toMatchRenderedOutput('(hidden)');
  });

  // @gate enableStore
  it('an update in a passive effect of a sync render has default priority', async () => {
    const store = createStore(1);

    function App() {
      const value = use(store);
      useEffect(() => {
        store.update(2);
      }, []);
      return <Text text={value} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      ReactNoop.flushSync(() => {
        root.render(<App />);
      });
      // The passive effect of a sync render runs synchronously, but the
      // update it dispatches isn't sync, so it hasn't rendered yet.
      assertLog([1]);
    });
    assertLog([2]);
  });

  // @gate enableStore
  it('an idle update is not rendered with a later default update', async () => {
    const idleStore = createStore(1);
    const defaultStore = createStore(1);

    function App() {
      const idle = use(idleStore);
      const value = use(defaultStore);
      useEffect(() => {
        Scheduler.log('Idle update');
        idleStore.update(2);
      }, []);
      return <Text text={`Idle: ${idle}, Default: ${value}`} />;
    }

    const root = ReactNoop.createRoot();
    await act(async () => {
      // The effect of an idle render dispatches an idle update.
      ReactNoop.idleUpdates(() => {
        root.render(<App />);
      });
      await waitForPaint(['Idle: 1, Default: 1']);

      defaultStore.update(2);
      if (gate(flags => flags.enableYieldingBeforePassive)) {
        await waitForPaint(['Idle update']);
        await waitForPaint(['Idle: 1, Default: 2']);
      } else {
        await waitForPaint(['Idle update', 'Idle: 1, Default: 2']);
      }
    });
    // The default update rendered first, without the idle update.
    assertLog(['Idle: 2, Default: 2']);
  });

  // @gate enableStore
  it('works with useDeferredValue', async () => {
    const store = createStore('A');

    function App() {
      const value = use(store);
      const deferred = useDeferredValue(value);
      return (
        <>
          <Text text={'Value: ' + value} />
          <Text text={'Deferred: ' + deferred} />
        </>
      );
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<App />));
    assertLog(['Value: A', 'Deferred: A']);

    await act(async () => {
      store.update('B');
      await waitForPaint(['Value: B', 'Deferred: A']);
    });
    assertLog(['Value: B', 'Deferred: B']);
  });

  // @gate enableStore
  it('does not run the reducer of a store whose updates are all in lanes the render skips', async () => {
    const storeA = createStore(0, (state, action) => {
      Scheduler.log('Reduce A: ' + action);
      return state + action;
    });
    const storeB = createStore(0);
    const never = new Promise(() => {});

    function A() {
      const value = use(storeA);
      if (value >= 100) {
        use(never);
      }
      return <Text text={'A: ' + value} />;
    }

    function B() {
      return <Text text={'B: ' + use(storeB)} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      root.render(
        <>
          <A />
          <B />
        </>,
      );
    });
    assertLog(['A: 0', 'B: 0']);

    // A transition that suspends, so it stays pending. The reducer runs
    // once, eagerly, when the update is dispatched.
    await act(() => startTransition(() => storeA.update(100)));
    assertLog(['Reduce A: 100']);

    // An urgent update to A is rebased on top of the pending transition.
    await act(() => storeA.update(1));
    assertLog(['Reduce A: 1', 'A: 1', 'Reduce A: 1']);

    // Urgent updates to B don't include the transition, and A has nothing
    // else to render, so the HostRoot doesn't process A again. The
    // transition is retried after each one, which does process it.
    await act(() => storeB.update(1));
    assertLog(['B: 1', 'Reduce A: 1']);
    await act(() => storeB.update(2));
    assertLog(['B: 2', 'Reduce A: 1']);
    expect(root).toMatchRenderedOutput('A: 1B: 2');
  });

  // @gate enableStore
  it('double invokes reducers in StrictMode even when a reader outside StrictMode reads first', async () => {
    const store = createStore(0, (state, action) => {
      Scheduler.log('reducer');
      return state + action;
    });

    function Reader({name}) {
      return <Text text={name + ': ' + use(store)} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      root.render(
        <>
          <Reader name="Loose" />
          <StrictMode>
            <Reader name="Strict" />
          </StrictMode>
        </>,
      );
    });
    assertLog(['Loose: 0', 'Strict: 0']);

    await act(() => store.update(1));
    if (__DEV__) {
      // Once for the eager state, and once more for the reader in
      // StrictMode.
      assertLog(['reducer', 'Loose: 1', 'reducer', 'Strict: 1']);
    } else {
      assertLog(['reducer', 'Loose: 1', 'Strict: 1']);
    }
  });
});

describe('transitions', () => {
  // @gate enableStore
  it('renders a transition update without blocking', async () => {
    const store = createStore('A');

    function App() {
      return <Text text={use(store)} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<App />));
    assertLog(['A']);

    await act(async () => {
      startTransition(() => {
        store.update('B');
      });
      // The transition renders in a later task.
      expect(root).toMatchRenderedOutput('A');
      await waitForPaint(['B']);
      expect(root).toMatchRenderedOutput('B');
    });
  });

  // @gate enableStore
  it('a sync update that produces the committed value during a transition still renders the rebased value', async () => {
    const store = createStore(1);

    function App() {
      return <Text text={use(store)} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<App />));
    assertLog([1]);

    let resolve;
    await act(async () => {
      startTransition(async () => {
        store.update(5);
        await new Promise(r => (resolve = r));
      });
    });
    assertLog([]);

    // A sync update to the committed value. The transition is still pending.
    await act(() => store.update(n => n * 1));
    expect(root).toMatchRenderedOutput('1');

    await act(() => resolve());
    assertLog([5]);
    expect(root).toMatchRenderedOutput('5');
  });

  // @gate enableStore
  it('a second transition that reverts the first commits the original value', async () => {
    const store = createStore(1);

    function App() {
      return <Text text={use(store)} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<App />));
    assertLog([1]);

    await act(async () => {
      startTransition(() => {
        store.update(n => n + 1);
      });
      startTransition(() => {
        store.update(n => n - 1);
      });
    });
    // Both updates are in the same transition, so the value doesn't change
    // and the component bails out.
    assertLog([]);
    expect(root).toMatchRenderedOutput('1');
  });

  // @gate enableStore
  it('multiple transitions that update the same store are entangled', async () => {
    const store = createStore('A');

    function App() {
      return <Text text={use(store)} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<App />));
    assertLog(['A']);

    await act(async () => {
      startTransition(() => {
        store.update('B');
      });
      // Start rendering the first transition, then dispatch a second one in
      // a separate event before the first one commits.
      await waitFor(['B']);
      startTransition(() => {
        store.update('C');
      });
    });
    // The in-progress render finishes with B since C was dispatched after
    // it started. After that, the transitions are entangled, so there's no
    // render of an intermediate state.
    assertLog(['C']);
    expect(root).toMatchRenderedOutput('C');

    // Two transitions dispatched in separate events before either renders
    // commit together.
    await act(async () => {
      startTransition(() => {
        store.update('D');
      });
      await waitFor([]);
      startTransition(() => {
        store.update('E');
      });
    });
    assertLog(['E']);
    expect(root).toMatchRenderedOutput('E');

    // The next update starts from the value the entangled transitions
    // committed.
    await act(() => store.update(s => s + '!'));
    assertLog(['E!']);
  });

  // @gate enableStore
  it('transitions that update different stores are not entangled', async () => {
    const a = createStore(0);
    const b = createStore(0);

    function ReadA() {
      return <AsyncText text={'A: ' + use(a)} />;
    }
    function ReadB() {
      return <AsyncText text={'B: ' + use(b)} />;
    }

    resolveText('A: 0');
    resolveText('B: 0');
    const root = ReactNoop.createRoot();
    await act(() => {
      root.render(
        <>
          <Suspense fallback="Loading A">
            <ReadA />
          </Suspense>
          <Suspense fallback="Loading B">
            <ReadB />
          </Suspense>
        </>,
      );
    });
    assertLog(['A: 0', 'B: 0']);

    await act(() => startTransition(() => a.update(1)));
    assertLog(['Suspend! [A: 1]']);
    await act(() => startTransition(() => b.update(1)));
    // React tries A again too, since it's still pending.
    assertLog(['Suspend! [A: 1]', 'Suspend! [B: 1]']);

    // Like transitions that update two different useState Hooks, B commits
    // on its own. Then A tries again, and it's still waiting.
    await act(() => resolveText('B: 1'));
    assertLog(['B: 1', 'Suspend! [A: 1]']);
    expect(root).toMatchRenderedOutput('A: 0B: 1');

    await act(() => resolveText('A: 1'));
    assertLog(['A: 1']);
    expect(root).toMatchRenderedOutput('A: 1B: 1');
  });

  // @gate enableStore
  it('transitions that share a store entangle transitively', async () => {
    const showA = createStore(false);
    const showB = createStore(false);
    const showC = createStore(false);

    // Only one child is meant to be visible at a time, but each one has
    // its own store, and every switch updates two of them.
    function App() {
      return (
        <Suspense fallback={<Text text="Loading..." />}>
          {use(showA) ? <AsyncText text="A" /> : null}
          {use(showB) ? <AsyncText text="B" /> : null}
          {use(showC) ? <AsyncText text="C" /> : null}
        </Suspense>
      );
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<App />));
    assertLog([]);

    await act(() => startTransition(() => showA.update(true)));
    assertLog(['Suspend! [A]', 'Loading...']);

    // Before A loads, switch to B. This entangles A with B.
    await act(() => {
      startTransition(() => {
        showA.update(false);
        showB.update(true);
      });
    });
    assertLog(['Suspend! [B]', 'Loading...']);

    // Before A or B loads, switch to C. This entangles C with B, and so
    // with A.
    await act(() => {
      startTransition(() => {
        showB.update(false);
        showC.update(true);
      });
    });
    assertLog(['Suspend! [C]', 'Loading...']);

    // Resolving B or A still renders C, since everything is entangled.
    await act(() => resolveText('B'));
    assertLog(['Suspend! [C]', 'Loading...']);
    await act(() => resolveText('A'));
    assertLog(['Suspend! [C]', 'Loading...']);
    expect(root).toMatchRenderedOutput(null);

    await act(() => resolveText('C'));
    assertLog(['C']);
    expect(root).toMatchRenderedOutput('C');
  });

  // @gate enableStore
  it('never commits readers showing different versions of the store', async () => {
    const store = createStore(1);

    function Reader({name}) {
      return <Text text={name + ': ' + use(store)} />;
    }

    // Records what each commit shows, to check that A and B always agree.
    // It reads the store so that it commits whenever the readers do.
    const commits = [];
    function CommitLogger() {
      use(store);
      useLayoutEffect(() => {
        commits.push(
          root
            .getChildren()
            .map(child => child.text)
            .join(''),
        );
      });
      return null;
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      root.render(
        <>
          <Reader name="A" />
          <Reader name="B" />
          <CommitLogger />
        </>,
      );
    });
    assertLog(['A: 1', 'B: 1']);
    expect(commits).toEqual(['A: 1B: 1']);

    await act(async () => {
      startTransition(() => {
        store.update(2);
      });
      await waitFor(['A: 2']);
      // Interleave another transition update before B renders.
      startTransition(() => {
        store.update(3);
      });
    });
    // The in-progress render ignores the update that was dispatched after
    // it started, so it finishes with the old value. The new value is
    // rendered after that. No commit shows A and B with different values.
    assertLog(['B: 2', 'A: 3', 'B: 3']);
    expect(commits).toEqual(['A: 1B: 1', 'A: 2B: 2', 'A: 3B: 3']);
    expect(root).toMatchRenderedOutput('A: 3B: 3');
  });

  // @gate enableStore
  it('two stores rebase like one combined store when a sync update interrupts a transition', async () => {
    const a = createStore(0);
    const b = createStore(0);

    function ReadA() {
      const value = use(a);
      Scheduler.log('A:' + value);
      return 'A:' + value + ' ';
    }
    function ReadB() {
      const value = use(b);
      Scheduler.log('B:' + value);
      return 'B:' + value + ' ';
    }
    function ReadBoth() {
      const text = use(a) + ',' + use(b);
      Scheduler.log('Both:' + text);
      return 'Both:' + text;
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      root.render(
        <>
          <ReadA />
          <ReadB />
          <ReadBoth />
        </>,
      );
    });
    assertLog(['A:0', 'B:0', 'Both:0,0']);

    await act(async () => {
      // One transition updates both stores.
      startTransition(() => {
        a.update(n => n + 1);
        b.update(n => n + 1);
      });
      // Render part of the transition, then interrupt it.
      await waitFor(['A:1']);
      ReactNoop.flushSync(() => {
        b.update(n => n * 10);
      });
      // The sync render skips the transition in both stores: no reader
      // sees a=1 without b=1. A isn't re-rendered (it doesn't read b), and
      // its committed value is still 0.
      assertLog(['B:0', 'Both:0,0']);
      expect(root).toMatchRenderedOutput('A:0 B:0 Both:0,0');
    });
    // Then the transition is rebased: updates are applied in dispatch order
    // across both stores, b = (0 + 1) * 10.
    assertLog(['A:1', 'B:10', 'Both:1,10']);
    expect(root).toMatchRenderedOutput('A:1 B:10 Both:1,10');
  });

  // @gate enableStore
  it('a value derived from several stores outside of render tears with a pending transition', async () => {
    // Computing derived data in an event and storing it in another store
    // reads the latest values of the other stores, including updates from
    // transitions that haven't committed. Derive it during render instead.
    const latest = {posts: [{id: 0, score: 0}], comments: []};
    const derive = (p, c) => ({
      total: p.reduce((sum, x) => sum + x.score, 0),
      comments: c.length,
    });
    const posts = createStore(latest.posts);
    const comments = createStore(latest.comments);
    const stats = createStore(derive(latest.posts, latest.comments));

    function Score() {
      return 'score:' + use(posts)[0].score + ' ';
    }
    function Stats() {
      const {total, comments: count} = use(stats);
      return 'total:' + total + ' comments:' + count;
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      root.render(
        <>
          <Score />
          <Stats />
        </>,
      );
    });
    expect(root).toMatchRenderedOutput('score:0 total:0 comments:0');

    let resolve;
    await act(async () => {
      // An async transition keeps the transition pending.
      startTransition(async () => {
        latest.posts = [{...latest.posts[0], score: 1000}];
        posts.update(latest.posts);
        stats.update(derive(latest.posts, latest.comments));
        await new Promise(r => (resolve = r));
      });
    });
    await act(() => {
      ReactNoop.flushSync(() => {
        latest.comments = [...latest.comments, {id: 1}];
        comments.update(latest.comments);
        stats.update(derive(latest.posts, latest.comments));
      });
    });
    // Torn: Score doesn't include the pending transition, but the derived
    // value does, because it was computed from the latest values.
    expect(root).toMatchRenderedOutput('score:0 total:1000 comments:1');

    await act(() => resolve());
    expect(root).toMatchRenderedOutput('score:1000 total:1000 comments:1');
  });

  // @gate enableStore
  it('async actions batch store updates with updates after await', async () => {
    const store = createStore('A');

    let setLabel;
    function App() {
      const [label, _setLabel] = useState('Initial');
      setLabel = _setLabel;
      return <Text text={label + ' ' + use(store)} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<App />));
    assertLog(['Initial A']);

    let resolve;
    await act(async () => {
      startTransition(async () => {
        store.update('B');
        await new Promise(r => (resolve = r));
        startTransition(() => {
          setLabel('Updated');
        });
      });
    });
    assertLog([]);
    expect(root).toMatchRenderedOutput('Initial A');

    await act(() => resolve());
    assertLog(['Updated B']);
    expect(root).toMatchRenderedOutput('Updated B');
  });

  // @gate enableStore
  it('store updates do not count toward the warning about many updates in a transition', async () => {
    // The warning tells userland subscriptions to use a primitive React
    // provides instead. A store is one.
    const stores = [];
    const setStates = [];
    function Reader({index}) {
      setStates[index] = useState(0)[1];
      return use(stores[index]);
    }
    for (let i = 0; i < 11; i++) {
      stores.push(createStore(0));
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      root.render(stores.map((store, i) => <Reader key={i} index={i} />));
    });

    // Updating the state of eleven components in one transition warns.
    await act(() => {
      startTransition(() => setStates.forEach(setState => setState(1)));
    });
    assertConsoleWarnDev(
      [
        'Detected a large number of updates inside startTransition. ' +
          'If this is due to a subscription please re-write it to use React provided hooks. ' +
          'Otherwise concurrent mode guarantees are off the table.',
      ],
      {withoutStack: true},
    );

    // Updating eleven stores that they read doesn't.
    await act(() => {
      startTransition(() => stores.forEach(store => store.update(1)));
    });
    expect(root).toMatchRenderedOutput('11111111111');
  });

  // @gate enableStore && enableGestureTransition
  it('a store update inside a gesture transition throws and does not change the store', async () => {
    const store = createStore(0);

    function Reader({name}) {
      return <Text text={name + ': ' + use(store)} />;
    }

    const root1 = ReactNoop.createRoot();
    await act(() => root1.render(<Reader name="A" />));
    assertLog(['A: 0']);

    await act(() => {
      React.unstable_startGestureTransition({}, () => {
        store.update(1);
      });
    });
    assertLog([
      'reportError: Cannot update a store inside a startGestureTransition',
    ]);
    expect(root1).toMatchRenderedOutput('A: 0');

    // A root that starts reading the store now sees the same value as the
    // root that already reads it.
    const root2 = ReactNoop.createRoot();
    await act(() => root2.render(<Reader name="B" />));
    assertLog(['B: 0']);

    await act(() => store.update(n => n + 1));
    assertLog(['A: 1', 'B: 1']);
    expect(root1).toMatchRenderedOutput('A: 1');
    expect(root2).toMatchRenderedOutput('B: 1');
  });

  describe('readers that mount during a transition', () => {
    // @gate enableStore
    it('a reader that mounts during a transition shows the committed value, then updates with the transition', async () => {
      const store = createStore(1);

      function Reader({name}) {
        return <Text text={name + ': ' + use(store)} />;
      }

      let setShowConditional;
      function App() {
        const [showConditional, _setShowConditional] = useState(false);
        setShowConditional = _setShowConditional;
        return (
          <>
            <Reader name="Stable" />
            {showConditional ? <Reader name="Conditional" /> : null}
          </>
        );
      }

      const root = ReactNoop.createRoot();
      await act(() => root.render(<App />));
      assertLog(['Stable: 1']);

      let resolve;
      await act(async () => {
        startTransition(async () => {
          store.update(2);
          await new Promise(r => (resolve = r));
        });
      });
      assertLog([]);
      expect(root).toMatchRenderedOutput('Stable: 1');

      // Mount a new reader with a sync update. It should match its sibling,
      // which still shows the committed value.
      await act(() => setShowConditional(true));
      assertLog(['Stable: 1', 'Conditional: 1']);
      expect(root).toMatchRenderedOutput('Stable: 1Conditional: 1');

      // When the transition finishes, both readers update together.
      await act(() => resolve());
      assertLog(['Stable: 2', 'Conditional: 2']);
      expect(root).toMatchRenderedOutput('Stable: 2Conditional: 2');
    });

    // @gate enableStore
    it('a reader that mounts as part of the transition that updates the store reads the new value', async () => {
      const store = createStore(1);

      function Reader({name}) {
        return <Text text={name + ': ' + use(store)} />;
      }

      function App() {
        const value = use(store);
        Scheduler.log('App: ' + value);
        return value > 1 ? <Reader name="Conditional" /> : null;
      }

      const root = ReactNoop.createRoot();
      await act(() => root.render(<App />));
      assertLog(['App: 1']);

      await act(() => {
        startTransition(() => {
          store.update(2);
        });
      });
      assertLog(['App: 2', 'Conditional: 2']);
      expect(root).toMatchRenderedOutput('Conditional: 2');
    });

    // @gate enableStore
    it('a reader that mounts in a render in progress catches up with updates dispatched during it', async () => {
      const store = createStore(0);

      function Reader({id}) {
        return <Text text={id + ': ' + use(store)} />;
      }

      let setShowB;
      function App() {
        const [showB, _setShowB] = useState(false);
        setShowB = _setShowB;
        return (
          <>
            <Reader id="A" />
            {showB ? <Reader id="B" /> : null}
            <Text text="End" />
          </>
        );
      }

      const root = ReactNoop.createRoot();
      await act(() => root.render(<App />));
      assertLog(['A: 0', 'End']);

      await act(async () => {
        startTransition(() => setShowB(true));
        await waitFor(['A: 0', 'B: 0']);
        // B has rendered but hasn't subscribed. Two updates in another
        // transition, which doesn't interrupt this render.
        startTransition(() => {
          store.update(1);
          store.update(2);
        });
      });
      // B commits with the value it rendered, then catches up along with A.
      assertLog(['End', 'A: 2', 'B: 2']);
      expect(root).toMatchRenderedOutput('A: 2B: 2End');
    });

    // @gate enableStore
    it('a reader that mounts after the last reader unmounted does not see a pending transition early', async () => {
      const store = createStore(0);

      function Reader() {
        return <Text text={'Reader: ' + use(store)} />;
      }

      let setShow, setTab, setCount;
      function App() {
        const [show, _setShow] = useState(true);
        const [tab, _setTab] = useState('a');
        const [count, _setCount] = useState(0);
        setShow = _setShow;
        setTab = _setTab;
        setCount = _setCount;
        return (
          <>
            <Text text={'Tab: ' + tab + ' ' + count} />
            {show && <Reader />}
          </>
        );
      }

      const root = ReactNoop.createRoot();
      await act(() => root.render(<App />));
      assertLog(['Tab: a 0', 'Reader: 0']);

      await act(async () => {
        startTransition(() => {
          store.update(1);
          setTab('b');
        });
        // Unmount the only reader while the transition is pending, then
        // commit something else. The root keeps its copy of the store,
        // because the store has a pending update.
        ReactNoop.flushSync(() => setShow(false));
        ReactNoop.flushSync(() => setCount(1));
        expectStoreToHaveRoots(store, 1);
        // A reader that mounts in an urgent render doesn't see the
        // transition until it commits, like the tab.
        ReactNoop.flushSync(() => setShow(true));
        assertLog(['Tab: a 0', 'Tab: a 1', 'Tab: a 1', 'Reader: 0']);
        expect(root).toMatchRenderedOutput('Tab: a 1Reader: 0');
      });
      assertLog(['Tab: b 1', 'Reader: 1']);
      expect(root).toMatchRenderedOutput('Tab: b 1Reader: 1');
    });

    // @gate enableStore
    it('a reader that mounts again while an async action is pending shows the committed value', async () => {
      const store = createStore(0);

      function Reader() {
        return <Text text={'Reader: ' + use(store)} />;
      }

      let setShow;
      function App() {
        const [show, _setShow] = useState(true);
        setShow = _setShow;
        return show ? <Reader /> : <Text text="Nothing" />;
      }

      const root = ReactNoop.createRoot();
      await act(() => root.render(<App />));
      assertLog(['Reader: 0']);

      let resolve;
      await act(() => {
        startTransition(async () => {
          store.update(1);
          await new Promise(r => (resolve = r));
        });
      });
      assertLog([]);
      expect(root).toMatchRenderedOutput('Reader: 0');

      // Unmount the only reader while the action is pending.
      await act(() => setShow(false));
      assertLog(['Nothing']);

      // Nothing reads the store now, so the root suspends on the action
      // instead of committing its update. It keeps its copy of the store, and
      // a reader that mounts urgently shows the committed value and joins the
      // action.
      await act(() => ReactNoop.flushSync(() => setShow(true)));
      assertLog(['Reader: 0']);
      expect(root).toMatchRenderedOutput('Reader: 0');

      // When the action is done, the update renders.
      await act(() => resolve());
      assertLog(['Reader: 1']);
      expect(root).toMatchRenderedOutput('Reader: 1');
    });
  });

  // When a transition updates a store that no root reads, there's no root
  // to render the update in yet. It's held on the store until its
  // transition is done. A root that starts reading the store before then
  // takes it, so the update renders as part of the transition.
  describe('updates to a store that no root reads', () => {
    // @gate enableStore
    it('a reader that mounts in the same transition sees a held update', async () => {
      const store = createStore(1);

      function Reader() {
        return <Text text={'Reader: ' + use(store)} />;
      }

      let setShow;
      function App() {
        const [show, _setShow] = useState(false);
        setShow = _setShow;
        return show ? <Reader /> : <Text text="Nothing" />;
      }

      const root = ReactNoop.createRoot();
      await act(() => root.render(<App />));
      assertLog(['Nothing']);

      await act(() => {
        startTransition(() => {
          store.update(2);
          setShow(true);
        });
      });
      assertLog(['Reader: 2']);
      expect(root).toMatchRenderedOutput('Reader: 2');
      expectNoPendingUpdates(store);
    });

    // @gate enableStore
    it('an urgent update behind a held update is rebased on top of it', async () => {
      const store = createStore('', (state, action) => state + action);

      function Reader() {
        return <Text text={'Reader: ' + use(store)} />;
      }

      let setShow;
      function App() {
        const [show, _setShow] = useState(false);
        setShow = _setShow;
        return show ? <Reader /> : <Text text="Nothing" />;
      }

      const root = ReactNoop.createRoot();
      await act(() => root.render(<App />));
      assertLog(['Nothing']);

      let resolve;
      await act(() => {
        startTransition(async () => {
          store.update('A');
          await new Promise(r => (resolve = r));
        });
      });
      // An urgent update while the transition's update is held.
      store.update('B');

      await act(() => ReactNoop.flushSync(() => setShow(true)));
      // The urgent update is visible, without the transition's.
      assertLog(['Reader: B']);
      expect(root).toMatchRenderedOutput('Reader: B');

      await act(() => resolve());
      // Then the transition's update renders, with the urgent one rebased
      // on top, in the order they were dispatched.
      assertLog(['Reader: AB']);
      expect(root).toMatchRenderedOutput('Reader: AB');
      expectNoPendingUpdates(store);
    });

    // @gate enableStore
    it('a held update whose transition is done stays visible when a later transition starts', async () => {
      const store = createStore(1);

      function Reader() {
        return <Text text={'Reader: ' + use(store)} />;
      }

      let setShow, setTab;
      function App() {
        const [show, _setShow] = useState(false);
        const [tab, _setTab] = useState('a');
        setShow = _setShow;
        setTab = _setTab;
        return (
          <>
            <Text text={'Tab: ' + tab} />
            {show ? <Reader /> : null}
          </>
        );
      }

      const root = ReactNoop.createRoot();
      await act(() => root.render(<App />));
      assertLog(['Tab: a']);

      // A transition that only updates a store nothing reads. It has
      // nothing to render, so it's done when the event ends.
      await act(() => {
        startTransition(() => {
          store.update(2);
        });
      });

      await act(() => {
        // A later, unrelated transition gets the same lane. It must not
        // make the held update look pending again.
        startTransition(() => {
          setTab('b');
        });
        // A reader that mounts urgently shows the update of the transition
        // that's done, and not the pending tab.
        ReactNoop.flushSync(() => setShow(true));
        assertLog(['Tab: a', 'Reader: 2']);
      });
      assertLog(['Tab: b', 'Reader: 2']);
    });

    // @gate enableStore
    it('a held update whose transition had nothing else to render is visible after its lane is reused', async () => {
      const store = createStore(1);
      const otherStore = createStore(0);
      const never = new Promise(() => {});

      function Reader() {
        return <Text text={'Reader: ' + use(store)} />;
      }

      let setShow, setTab;
      function App() {
        const [show, _setShow] = useState(false);
        const [tab, _setTab] = useState('a');
        setShow = _setShow;
        setTab = _setTab;
        if (tab === 'b') {
          use(never);
        }
        return (
          <>
            <Text text={'Tab: ' + tab} />
            {show ? <Reader /> : null}
          </>
        );
      }

      const root = ReactNoop.createRoot();
      await act(() => root.render(<App />));
      assertLog(['Tab: a']);

      // No root reads the store, and the transition updates nothing else,
      // so it's done when the event ends.
      await act(() => startTransition(() => store.update(2)));
      // Use the rest of the transition lanes, with updates to another store
      // that no root reads, so nothing commits.
      for (let i = 1; i < 10; i++) {
        await act(() => startTransition(() => otherStore.update(i)));
      }
      // This transition gets the same lane as the first one, and suspends.
      await act(() => startTransition(() => setTab('b')));
      assertLog([]);

      await act(() => ReactNoop.flushSync(() => setShow(true)));
      assertLog(['Tab: a', 'Reader: 2']);
      expect(root).toMatchRenderedOutput('Tab: aReader: 2');
    });

    // @gate enableStore
    it('does not lose a held update handed to a root in a render that was thrown away', async () => {
      const store = createStore(1);

      function Reader() {
        return <Text text={'Reader: ' + use(store)} />;
      }

      let setShow;
      function App() {
        const [show, _setShow] = useState(false);
        setShow = _setShow;
        return show ? (
          <>
            <Reader />
            <Text text="After" />
          </>
        ) : (
          <Text text="Nothing" />
        );
      }

      const root = ReactNoop.createRoot();
      await act(() => root.render(<App />));
      assertLog(['Nothing']);

      // Nothing reads the store, so the action's update is held.
      let resolve;
      await act(() => {
        startTransition(async () => {
          store.update(2);
          await new Promise(r => (resolve = r));
        });
      });

      await act(async () => {
        // A time sliced render mounts the first reader, which hands the
        // held update to the root.
        ReactNoop.idleUpdates(() => setShow(true));
        await waitFor(['Reader: 1']);
        // Throw that render away. The reader never mounts, and the action's
        // lane isn't pending on the root.
        ReactNoop.flushSync(() => setShow(false));
      });
      assertLog([]);

      // The action finishes. Its update is done, and nothing reads the
      // store, so nothing keeps it.
      await act(() => resolve());
      expectStoreToHaveRoots(store, 0);
      expectNoPendingUpdates(store);

      // A reader that mounts now renders the update right away.
      await act(() => ReactNoop.flushSync(() => setShow(true)));
      assertLog(['Reader: 2', 'After']);
      expect(root).toMatchRenderedOutput('Reader: 2After');
    });
  });
});

describe('Suspense and Activity', () => {
  // @gate enableStore
  it('a reader in a suspended tree mounts with the latest value', async () => {
    const store = createStore('A');
    let resolve;
    const promise = new Promise(r => (resolve = r));
    let resolved = false;
    promise.then(() => {
      resolved = true;
    });

    function Suspender() {
      if (!resolved) {
        throw promise;
      }
      return null;
    }

    function Reader() {
      return <Text text={'Reader: ' + use(store)} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      root.render(
        <Suspense fallback={<Text text="Loading" />}>
          <Reader />
          <Suspender />
        </Suspense>,
      );
    });
    assertLog(['Reader: A', 'Loading', 'Reader: A']);
    expect(root).toMatchRenderedOutput('Loading');

    await act(() => store.update('B'));
    await act(() => resolve());
    assertLog(['Reader: B']);
    expect(root).toMatchRenderedOutput('Reader: B');

    await act(() => store.update('C'));
    assertLog(['Reader: C']);
  });

  // @gate enableStore
  it('a store update retries a boundary whose reader suspended on mount', async () => {
    const store = createStore(new Promise(() => {}));

    function Consumer() {
      return <Text text={use(use(store))} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      root.render(
        <Suspense fallback={<Text text="Loading" />}>
          <Consumer />
        </Suspense>,
      );
    });
    // The Consumer never committed, so it can't subscribe. The boundary
    // subscribes to the stores it read instead.
    assertLog(['Loading']);

    await act(() => {
      store.update({status: 'fulfilled', value: 'Result', then() {}});
    });
    assertLog(['Result']);
    expect(root).toMatchRenderedOutput('Result');

    // Now that it has committed, the Consumer is subscribed.
    await act(() => {
      store.update({status: 'fulfilled', value: 'Next', then() {}});
    });
    assertLog(['Next']);
    expect(root).toMatchRenderedOutput('Next');
  });

  // @gate enableStore
  it('a store update retries a boundary whose new reader suspended during an update', async () => {
    const store = createStore(new Promise(() => {}));

    function Consumer() {
      return <Text text={use(use(store))} />;
    }

    let setShow;
    function Show() {
      const [show, _setShow] = useState(false);
      setShow = _setShow;
      return show ? <Consumer /> : <Text text="Nothing" />;
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      root.render(
        <Suspense fallback={<Text text="Loading" />}>
          <Show />
        </Suspense>,
      );
    });
    assertLog(['Nothing']);

    await act(() => setShow(true));
    assertLog(['Loading']);
    expect(root).toMatchRenderedOutput('Loading');

    await act(() => {
      store.update({status: 'fulfilled', value: 'Result', then() {}});
    });
    assertLog(['Result']);
    expect(root).toMatchRenderedOutput('Result');
  });

  // @gate enableStore
  it('a store update does not retry suspended content that does not read the store', async () => {
    const store = createStore(0);

    function Fallback() {
      return <Text text={'Loading ' + use(store)} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      root.render(
        <Suspense fallback={<Fallback />}>
          <AsyncText text="Content" />
        </Suspense>,
      );
    });
    // After the fallback commits, React tries the content again.
    assertLog(['Suspend! [Content]', 'Loading 0', 'Suspend! [Content]']);

    // A store update only schedules the components that read it. Unlike a
    // context Provider whose value changes, it doesn't retry the content
    // below the boundary.
    await act(() => store.update(1));
    assertLog(['Loading 1']);
    expect(root).toMatchRenderedOutput('Loading 1');
  });

  // @gate enableStore
  it('a boundary waiting on a store unsubscribes when it unmounts', async () => {
    const store = createStore(new Promise(() => {}));

    function Consumer() {
      return <Text text={use(use(store))} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      root.render(
        <Suspense fallback={<Text text="Loading" />}>
          <Consumer />
        </Suspense>,
      );
    });
    assertLog(['Loading']);
    expectStoreToHaveRoots(store, 1);

    await act(() => root.render(null));
    expectStoreToHaveRoots(store, 0);
  });

  // @gate enableStore
  it('readers in a hidden Activity update in the background', async () => {
    const store = createStore('A');

    function Reader({name}) {
      return <Text text={name + ': ' + use(store)} />;
    }

    let setMode;
    function App() {
      const [mode, _setMode] = useState('visible');
      setMode = _setMode;
      return (
        <>
          <Reader name="Visible" />
          <Activity mode={mode}>
            <Reader name="Hidden" />
          </Activity>
        </>
      );
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<App />));
    assertLog(['Visible: A', 'Hidden: A']);

    await act(() => setMode('hidden'));
    assertLog(['Visible: A', 'Hidden: A']);

    await act(async () => {
      store.update('B');
      // The visible reader updates first. The hidden one updates later, at
      // offscreen priority.
      await waitForPaint(['Visible: B']);
    });
    assertLog(['Hidden: B']);

    // When it's revealed, it already shows the latest value.
    await act(() => setMode('visible'));
    assertLog(['Visible: B', 'Hidden: B']);
    expect(root).toMatchRenderedOutput('Visible: BHidden: B');
  });

  // @gate enableStore
  it('a hidden reader renders the value committed at the root, not an intermediate value', async () => {
    const text = createStore('A');
    const step = createStore(0);

    function Child() {
      return <AsyncText text={use(text) + use(step)} />;
    }

    const root = ReactNoop.createRoot();
    resolveText('A0');
    await act(() => {
      root.render(
        <Activity mode="hidden">
          <span>
            <Child />
          </span>
        </Activity>,
      );
    });
    assertLog(['A0']);
    expect(root).toMatchRenderedOutput(<span hidden={true}>A0</span>);

    // A transition, then a sync update.
    await act(() => {
      startTransition(() => {
        step.update(1);
      });
      ReactNoop.flushSync(() => {
        text.update('B');
      });
    });
    // The HostRoot owns the stores, so both updates commit at the root
    // before the hidden tree renders, and the hidden reader renders the
    // committed value, B1. It never renders B0, which was never visible.
    // With useState, the updates are deferred with the hidden tree, so it
    // renders B0 first.
    assertLog(['Suspend! [B1]', 'Suspend! [B1]']);
    expect(root).toMatchRenderedOutput(<span hidden={true}>A0</span>);

    await act(() => resolveText('B1'));
    assertLog(['B1']);
    expect(root).toMatchRenderedOutput(<span hidden={true}>B1</span>);
  });

  // @gate enableStore
  it('readers inside a revealed Activity read the same version as the rest of the tree', async () => {
    const store = createStore(0);

    function Reader({name}) {
      return <Text text={name + ': ' + use(store)} />;
    }

    let setMode;
    function App() {
      const [mode, _setMode] = useState('visible');
      setMode = _setMode;
      return (
        <>
          <Reader name="Outside" />
          <Activity mode={mode}>
            <Reader name="Inside" />
          </Activity>
        </>
      );
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<App />));
    assertLog(['Outside: 0', 'Inside: 0']);

    await act(async () => {
      // Hide the Activity at idle priority, so its base lanes are IdleLane.
      ReactNoop.idleUpdates(() => setMode('hidden'));
      await waitForPaint(['Outside: 0']);
      // An idle update to the store is pending when a sync update reveals
      // the Activity, before its hidden tree has rendered.
      ReactNoop.idleUpdates(() => store.update(1));
      ReactNoop.flushSync(() => setMode('visible'));
      // The revealed tree renders with its base lanes too, but store reads
      // use the lanes of the root, so both readers skip the idle update.
      assertLog(['Outside: 0', 'Inside: 0']);
      expect(root).toMatchRenderedOutput('Outside: 0Inside: 0');
    });
    assertLog(['Outside: 1', 'Inside: 1']);
    expect(root).toMatchRenderedOutput('Outside: 1Inside: 1');
  });
});

describe('updates during render', () => {
  // @gate enableStore
  it('warns when a store is updated during render, and renders the update after', async () => {
    const store = createStore(0);

    function App() {
      const value = use(store);
      if (value === 1) {
        store.update(2);
      }
      return <Text text={value} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<App />));
    assertLog([0]);

    await act(() => store.update(1));
    assertConsoleErrorDev([storeUpdateInRenderWarning('App')]);
    assertLog([1, 2]);
    expect(root).toMatchRenderedOutput('2');
  });

  // @gate enableStore
  it('keeps rendering until there are no more updates during render', async () => {
    const store = createStore(0);

    function Counter() {
      const count = use(store);
      if (count < 3) {
        store.update(count + 1);
      }
      return <Text text={count} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<Counter />));
    // Each update is rendered after the render that dispatched it, and the
    // warning fires once.
    assertConsoleErrorDev([storeUpdateInRenderWarning('Counter')]);
    assertLog([0, 1, 2, 3]);
    expect(root).toMatchRenderedOutput('3');
  });

  // @gate enableStore
  it('warns once per component that updates a store another component reads', async () => {
    const store = createStore(0);

    function Foo() {
      return <Text text={'Foo [' + use(store) + ']'} />;
    }

    function Bar({triggerUpdate}) {
      if (triggerUpdate) {
        store.update(x => x + 1);
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

    // Foo has already rendered, so it renders the update after this render,
    // like an update to another component's state.
    await act(() => {
      root.render(
        <>
          <Foo />
          <Bar triggerUpdate={true} />
        </>,
      );
    });
    assertConsoleErrorDev([storeUpdateInRenderWarning('Bar')]);
    assertLog(['Foo [0]', 'Bar', 'Foo [1]']);

    // Bar has already warned.
    await act(() => {
      root.render(
        <>
          <Foo />
          <Bar triggerUpdate={true} />
        </>,
      );
    });
    assertLog(['Foo [1]', 'Bar', 'Foo [2]']);
  });

  // @gate enableStore
  it('does not discard an update during a render that suspends', async () => {
    const counter = createStore(0);
    const signal = createStore(true);
    const never = new Promise(() => {});

    function Bar({signal: newSignal}) {
      const count = use(counter);
      // Count the times the signal changes.
      if (use(signal) !== newSignal) {
        counter.update(c => c + 1);
        signal.update(newSignal);
        if (count === 0) {
          Scheduler.log('Suspend!');
          use(never);
        }
      }
      return <Text text={count} />;
    }

    function App({signal: newSignal}) {
      return (
        <Suspense fallback="Loading">
          <Bar signal={newSignal} />
        </Suspense>
      );
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<App signal={true} />));
    assertLog([0]);

    await act(() => {
      startTransition(() => {
        root.render(<App signal={false} />);
      });
    });
    assertConsoleErrorDev([storeUpdateInRenderWarning('Bar', 'App')]);
    assertLog(['Suspend!']);
    expect(root).toMatchRenderedOutput('0');

    // A store is shared, so the updates aren't thrown away with the render
    // that suspended, the way a component's own render phase updates are.
    // Bar renders them the next time, and doesn't suspend.
    await act(() => {
      startTransition(() => {
        root.render(<App signal={false} />);
      });
    });
    assertLog([1]);
    expect(root).toMatchRenderedOutput('1');
  });

  // @gate enableStore
  it('does not discard an update during a render that is thrown away', async () => {
    const store = createStore(0);

    function Reader() {
      return <Text text={'Reader: ' + use(store)} />;
    }

    function Updater({shouldUpdate}) {
      if (shouldUpdate) {
        store.update(1);
      }
      return <Text text="Updater" />;
    }

    let setShouldUpdate, setShow;
    function App() {
      const [shouldUpdate, _setShouldUpdate] = useState(false);
      const [show, _setShow] = useState(true);
      setShouldUpdate = _setShouldUpdate;
      setShow = _setShow;
      return (
        <>
          <Reader />
          {show ? <Updater shouldUpdate={shouldUpdate} /> : null}
          <Text text="End" />
        </>
      );
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<App />));
    assertLog(['Reader: 0', 'Updater', 'End']);

    await act(async () => {
      startTransition(() => setShouldUpdate(true));
      await waitFor(['Reader: 0', 'Updater']);
      assertConsoleErrorDev([storeUpdateInRenderWarning('Updater', 'App')]);
      // An urgent update removes the Updater, and throws away the render
      // that updated the store.
      ReactNoop.flushSync(() => setShow(false));
      assertLog(['Reader: 0', 'End']);
    });
    // The update is still rendered, after the render that dispatched it,
    // like an update to another component's state.
    assertLog(['Reader: 1', 'End']);
    expect(root).toMatchRenderedOutput('Reader: 1End');
  });
});

describe('reducer errors', () => {
  // @gate enableStore
  it('throws a reducer error in the readers, and drops the update once an error boundary handles it', async () => {
    const store = createStore(0, throwingReducer);

    function App() {
      return <Text text={'Value: ' + use(store)} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      root.render(
        <ErrorBoundary key="1">
          <App />
        </ErrorBoundary>,
      );
    });
    assertLog(['Value: 0']);

    await act(() => {
      // Doesn't throw here.
      store.update('throw');
    });
    assertLog(['Caught: Oops', 'Caught: Oops']);
    expect(root).toMatchRenderedOutput('Caught: Oops');

    await act(() => store.update(1));
    await act(() => store.update(2));
    // Like the update queue of a useReducer Hook that an error boundary
    // unmounted, the update that threw is gone. Remounting doesn't throw
    // again, and the store doesn't keep the updates around.
    await act(() => {
      root.render(
        <ErrorBoundary key="2">
          <App />
        </ErrorBoundary>,
      );
    });
    assertLog(['Value: 2']);
    expectNoPendingUpdates(store);
  });

  // @gate enableStore
  it('throws a reducer error from store.update when nothing reads the store', async () => {
    const store = createStore(0, throwingReducer);

    store.update(1);
    // There's no render to throw the error in, so it throws here, and the
    // update isn't applied.
    expect(() => store.update('throw')).toThrow('Oops');
    store.update(2);
    expectNoPendingUpdates(store);

    function App() {
      return <Text text={'Value: ' + use(store)} />;
    }
    const root = ReactNoop.createRoot();
    await act(() => root.render(<App />));
    assertLog(['Value: 2']);
  });

  // @gate enableStore
  it('reports a reducer error that no component rendered, and drops the update', async () => {
    const store = createStore(0, throwingReducer);

    function Reader() {
      return <Text text={'Reader: ' + use(store)} />;
    }

    let setMode;
    function App() {
      const [mode, _setMode] = useState('hidden');
      setMode = _setMode;
      return (
        <ErrorBoundary>
          <Activity mode={mode}>
            <Reader />
          </Activity>
        </ErrorBoundary>
      );
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<App />));
    assertLog(['Reader: 0']);

    // The only reader is hidden, so the commit applies the update before
    // any component reads it. The error is reported instead.
    await act(() => store.update('throw'));
    assertLog(['reportError: Oops']);

    // The commit dropped the update along with its error, so revealing the
    // reader without a new update doesn't throw it again.
    await act(() => setMode('visible'));
    assertLog(['Reader: 0']);
    expect(root).toMatchRenderedOutput('Reader: 0');

    await act(() => store.update(1));
    assertLog(['Reader: 1']);
  });

  // @gate enableStore
  it('reports a reducer error once when the only render that threw it was thrown away', async () => {
    const store = createStore(0, throwingReducer);

    function Reader() {
      return <Text text={'Reader: ' + use(store)} />;
    }

    let setShow;
    function App() {
      const [show, _setShow] = useState(true);
      setShow = _setShow;
      return (
        <>
          <ErrorBoundary>
            {show ? <Reader /> : <Text text="None" />}
          </ErrorBoundary>
          <Text text="Sibling" />
        </>
      );
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<App />));
    assertLog(['Reader: 0', 'Sibling']);

    await act(async () => {
      startTransition(() => {
        store.update('throw');
      });
      // The transition render reaches the reader, which throws.
      await waitFor(['Caught: Oops']);
      // An urgent update unmounts the reader, which throws the transition
      // render away.
      ReactNoop.flushSync(() => setShow(false));
      assertLog(['None', 'Sibling']);
    });
    // The transition commits without any component throwing the error, so
    // the commit reports it.
    assertLog(['reportError: Oops']);
  });

  // @gate enableStore
  it('reports a reducer error whose only reader threw inside content that suspended on mount', async () => {
    const store = createStore(0, throwingReducer);
    const never = new Promise(() => {});

    function Reader() {
      return <Text text={'Reader: ' + use(store)} />;
    }
    function Suspender() {
      Scheduler.log('Suspend');
      use(never);
      return null;
    }

    let setShow;
    function App() {
      const [show, _setShow] = useState(false);
      setShow = _setShow;
      return (
        <>
          <Activity mode="hidden">
            <Reader />
          </Activity>
          {show ? (
            <Suspense fallback={<Text text="Loading" />}>
              <ErrorBoundary>
                <Reader />
              </ErrorBoundary>
              <Suspender />
            </Suspense>
          ) : null}
        </>
      );
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<App />));
    assertLog(['Reader: 0']);

    // The update throws in the reader that mounts inside the boundary, and
    // the boundary shows its fallback, throwing that reader and its error
    // boundary away. The hidden reader renders later, from the committed
    // state. The error must still surface once.
    await act(() => {
      store.update('throw');
      setShow(true);
    });
    const log = Scheduler.unstable_clearLog();
    expect(root).toMatchRenderedOutput('Loading');
    expect(log.filter(entry => entry === 'reportError: Oops')).toEqual([
      'reportError: Oops',
    ]);
  });

  // @gate enableStore
  it('reports a reducer error once when the boundary that caught it rethrows to an outer boundary', async () => {
    const store = createStore(0, throwingReducer);
    function Reader() {
      return <Text text={'Reader: ' + use(store)} />;
    }
    const root = createRootLoggingErrors();
    await act(() => {
      root.render(
        <ErrorBoundary name="Outer">
          <ErrorBoundary rethrow={true}>
            <Reader />
          </ErrorBoundary>
        </ErrorBoundary>,
      );
    });
    assertLog(['Reader: 0']);

    // The nearest boundary passes the error up. The outer boundary commits
    // and logs it, so the commit doesn't report it a second time.
    await act(() => store.update('throw'));
    const log = Scheduler.unstable_clearLog();
    expect(root).toMatchRenderedOutput('Outer: Oops');
    expect(log.filter(entry => entry.includes('Error: '))).toEqual([
      'onCaughtError: Oops',
    ]);
  });

  // @gate enableStore
  it('reports a reducer error once when the error UI of the boundary that caught it throws it again', async () => {
    const store = createStore(0, throwingReducer);
    function Reader() {
      return <Text text={'Reader: ' + use(store)} />;
    }
    const root = createRootLoggingErrors();
    await act(() => {
      root.render(
        <ErrorBoundary name="Outer">
          <ErrorBoundary fallback={<Reader />}>
            <Reader />
          </ErrorBoundary>
        </ErrorBoundary>,
      );
    });
    assertLog(['Reader: 0']);

    // The inner boundary's error UI reads the store and throws the same
    // error, which the outer boundary catches.
    await act(() => store.update('throw'));
    const log = Scheduler.unstable_clearLog();
    expect(root).toMatchRenderedOutput('Outer: Oops');
    expect(log.filter(entry => entry.includes('Error: '))).toEqual([
      'onCaughtError: Oops',
    ]);
  });

  // @gate enableStore
  it('a reducer error in a held update throws in the reader that renders it', async () => {
    const store = createStore(0, throwingReducer);

    function Reader() {
      return <Text text={'Reader: ' + use(store)} />;
    }

    let setShow;
    function App() {
      const [show, _setShow] = useState(false);
      setShow = _setShow;
      return show ? (
        <ErrorBoundary>
          <Reader />
        </ErrorBoundary>
      ) : (
        <Text text="Nothing" />
      );
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<App />));
    assertLog(['Nothing']);

    // A held update throws when it renders, not when it's dispatched.
    await act(() => {
      startTransition(() => {
        store.update('throw');
        setShow(true);
      });
    });
    assertLog(['Caught: Oops', 'Caught: Oops']);
    expect(root).toMatchRenderedOutput('Caught: Oops');
  });

  // @gate enableStore
  it('reports a reducer error from a held update whose transition is done', async () => {
    const store = createStore(0, throwingReducer);

    function Reader() {
      return <Text text={'Reader: ' + use(store)} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<Text text="Nothing" />));
    assertLog(['Nothing']);

    // No root reads the store, so the update is held. The transition has
    // nothing else to render, so it's done.
    await act(() => {
      startTransition(() => {
        store.update('throw');
      });
    });
    // The held update is applied when the first reader mounts. The error is
    // reported, not silently dropped.
    await act(() => root.render(<Reader />));
    assertLog(['reportError: Oops', 'Reader: 0']);
  });

  // @gate enableStore
  it('runs the reducer without a dispatcher', async () => {
    const Context = React.createContext('default');
    const store = createStore(0, (state, action) => {
      if (action === 'read context') {
        return React.useContext(Context);
      }
      return action;
    });

    function Reader() {
      return <Text text={'Reader: ' + use(store)} />;
    }

    // A store is shared by components under different providers, so its
    // reducer runs outside of any component, like the eager state of
    // useReducer. Calling a Hook in it logs an invalid Hook call and throws.
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation(() => {});
    try {
      // No root reads the store, so the update is held.
      await act(() => {
        startTransition(() => {
          store.update('read context');
        });
      });
      // The first reader applies the held update while it renders, with its
      // dispatcher installed. The reducer still runs without one. The error
      // is reported, and the update is dropped.
      const root = ReactNoop.createRoot();
      await act(() => {
        root.render(
          <Context value="provided">
            <ErrorBoundary>
              <Reader />
            </ErrorBoundary>
          </Context>,
        );
      });
      assertLog([
        "reportError: Cannot read properties of null (reading 'useContext')",
        'Reader: 0',
      ]);

      // When the HostRoot processes an update, the reader throws the error.
      // The reducer never sees the reader's context.
      await act(() => store.update('read context'));
      assertLog([
        "Caught: Cannot read properties of null (reading 'useContext')",
        "Caught: Cannot read properties of null (reading 'useContext')",
      ]);
    } finally {
      consoleError.mockRestore();
    }
  });

  // @gate enableStore
  it('runs a throwing reducer each time the root renders, including error recovery', async () => {
    const store = createStore(0, (state, action) => {
      Scheduler.log('Reduce: ' + action);
      return throwingReducer(state, action);
    });

    function Reader() {
      return <Text text={'Reader: ' + use(store)} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      root.render(
        <ErrorBoundary>
          <Reader />
        </ErrorBoundary>,
      );
    });
    assertLog(['Reader: 0']);

    await act(() => store.update('throw'));
    assertLog([
      // The eager state, when the update is dispatched. The error is
      // suppressed until a component reads the store.
      'Reduce: throw',
      // The HostRoot processes the update, and the reader throws.
      'Reduce: throw',
      'Caught: Oops',
      // React retries synchronously to recover from the error. The HostRoot
      // processes the update again.
      'Reduce: throw',
      'Caught: Oops',
    ]);
  });

  // Reducer errors that are open questions. A store has no component that
  // owns its state, so there's no error boundary that can take the place of
  // the one that unmounts a useReducer Hook along with its queue. Today the
  // readers throw the error, and the update that threw is dropped when that
  // render commits. These tests pin what that does in the cases we still
  // need to decide on.
  describe('reducer errors to follow up on', () => {
    // A reducer that only accepts 'next' after 'ready'.
    function reducer(state, action) {
      if (action === 'ready') {
        return 'ready';
      }
      if (action === 'next') {
        if (state !== 'ready') {
          throw new Error('Not ready');
        }
        return 'next';
      }
      return action;
    }

    // @gate enableStore
    it('applies an urgent update that only throws because a pending transition was skipped, when error recovery includes the transition', async () => {
      const store = createStore('initial', reducer);
      function Reader() {
        return <Text text={'Value: ' + use(store)} />;
      }

      const root = ReactNoop.createRoot();
      await act(() => {
        root.render(
          <ErrorBoundary>
            <Reader />
          </ErrorBoundary>,
        );
      });
      assertLog(['Value: initial']);

      await act(async () => {
        startTransition(() => store.update('ready'));
        // In dispatch order, 'next' is valid: it comes after 'ready'. But
        // the urgent render skips the transition and applies 'next' to
        // 'initial', so the reader throws.
        store.update('next');
      });
      // React recovers from the error by rendering the root again
      // synchronously with every pending lane. That includes the
      // transition, so 'next' is applied after 'ready' and nothing is lost.
      // FIXME: this relies on error recovery, which logs a recoverable error
      // and throws away the urgent render. It's the only reason the write
      // survives (see the next test for when recovery is skipped).
      assertLog(['Caught: Not ready', 'Value: next']);
      assertConsoleErrorDev([
        'Error: There was an error during concurrent rendering but React was able to recover by instead synchronously rendering the entire root.' +
          '\n    in <stack>',
      ]);
      expect(root).toMatchRenderedOutput('Value: next');
    });

    // @gate enableStore
    it('drops an urgent update that only throws because a pending transition was skipped, when the transition is waiting on data', async () => {
      const store = createStore('initial', reducer);
      function Reader() {
        return <Text text={'Value: ' + use(store)} />;
      }
      let resolve;
      const data = new Promise(r => {
        resolve = r;
      });
      function Page() {
        return <Text text={'Page: ' + use(data)} />;
      }

      const root = ReactNoop.createRoot();
      await act(() => {
        root.render(
          <ErrorBoundary key="1">
            <Reader />
          </ErrorBoundary>,
        );
      });
      assertLog(['Value: initial']);

      await act(async () => {
        // The transition also renders a page that suspends with no Suspense
        // boundary, so it waits on the data.
        startTransition(() => {
          store.update('ready');
          root.render(
            <>
              <ErrorBoundary key="1">
                <Reader />
              </ErrorBoundary>
              <Page />
            </>,
          );
        });
        store.update('next');
      });
      // React tries to recover by rendering every pending lane, including
      // the transition, but the page suspends, so that render can't finish
      // and nothing commits. The urgent update is stuck behind the
      // transition, and error recovery is now off for these lanes.
      assertLog(['Caught: Not ready', 'Value: next']);
      expect(root).toMatchRenderedOutput('Value: initial');

      // When the data resolves, the urgent lanes render first without error
      // recovery. 'next' throws again, the boundary commits, and the update
      // that threw is dropped. Then the transition commits.
      await act(() => resolve('loaded'));
      assertLog(['Caught: Not ready', 'Caught: Not ready', 'Page: loaded']);
      expect(root).toMatchRenderedOutput('Caught: Not readyPage: loaded');

      // FIXME: the store ends up at 'ready' instead of 'next'. The write was
      // valid in dispatch order, and it's lost because of the order the
      // renders happened to apply it in.
      await act(() => {
        root.render(
          <>
            <ErrorBoundary key="2">
              <Reader />
            </ErrorBoundary>
            <Page />
          </>,
        );
      });
      assertLog(['Value: ready', 'Page: loaded']);

      // A root that starts reading the store now agrees: once nothing is
      // pending, the latest value is the committed one.
      const otherRoot = ReactNoop.createRoot();
      await act(() => otherRoot.render(<Reader />));
      assertLog(['Value: ready']);
    });

    // @gate enableStore
    it('throws an update that is invalid in dispatch order in every root that reads the store, and drops it', async () => {
      const store = createStore('initial', reducer);
      function Reader({name}) {
        return <Text text={name + ': ' + use(store)} />;
      }

      const rootA = ReactNoop.createRoot();
      const rootB = ReactNoop.createRoot();
      await act(() => {
        rootA.render(
          <ErrorBoundary key="1">
            <Reader name="A" />
          </ErrorBoundary>,
        );
        rootB.render(
          <ErrorBoundary key="1">
            <Reader name="B" />
          </ErrorBoundary>,
        );
      });
      assertLog(['A: initial', 'B: initial']);

      // 'next' before 'ready' is invalid in any order. Each root throws it
      // in its own readers.
      // FIXME: the readers didn't do anything wrong, the code that called
      // update() did, but it never sees the error. With no readers, update()
      // throws instead (see "throws a reducer error from store.update when
      // nothing reads the store"), so where the error goes depends on
      // whether a component reads the store.
      await act(() => store.update('next'));
      assertLog([
        'Caught: Not ready',
        'Caught: Not ready',
        'Caught: Not ready',
        'Caught: Not ready',
      ]);

      // The update is dropped in both roots.
      await act(() => {
        rootA.render(
          <ErrorBoundary key="2">
            <Reader name="A" />
          </ErrorBoundary>,
        );
        rootB.render(
          <ErrorBoundary key="2">
            <Reader name="B" />
          </ErrorBoundary>,
        );
      });
      assertLog(['A: initial', 'B: initial']);
    });
  });
});

// Each root renders and commits store updates on its own, the same way it
// renders and commits a transition that spans roots. A root that starts
// reading a store starts from the latest value, including updates that are
// still pending in another root. Within a root, every reader agrees.
describe('multiple roots', () => {
  // @gate enableStore
  it('re-renders the readers in every root', async () => {
    const store = createStore(0);

    function Reader({name}) {
      return <Text text={name + ': ' + use(store)} />;
    }

    const rootA = ReactNoop.createRoot();
    const rootB = ReactNoop.createRoot();
    await act(() => {
      rootA.render(<Reader name="A" />);
      rootB.render(<Reader name="B" />);
    });
    assertLog(['A: 0', 'B: 0']);

    await act(() => store.update(1));
    assertLog(['A: 1', 'B: 1']);
    expect(rootA).toMatchRenderedOutput('A: 1');
    expect(rootB).toMatchRenderedOutput('B: 1');

    await act(() => rootA.render(null));
    await act(() => store.update(2));
    assertLog(['B: 2']);
    expectStoreToHaveRoots(store, 1);
  });

  // @gate enableStore
  it('a reader that mounts on another root while a transition is suspended shows the new value', async () => {
    const store = createStore('A');

    function AsyncReader() {
      return <AsyncText text={'Root A: ' + use(store)} />;
    }
    function Reader() {
      return <Text text={'Root B: ' + use(store)} />;
    }

    resolveText('Root A: A');
    const rootA = ReactNoop.createRoot();
    await act(() => {
      rootA.render(
        <Suspense fallback="Loading">
          <AsyncReader />
        </Suspense>,
      );
    });
    assertLog(['Root A: A']);

    // The transition suspends in root A, which keeps showing A.
    await act(() => startTransition(() => store.update('B')));
    assertLog(['Suspend! [Root A: B]']);
    expect(rootA).toMatchRenderedOutput('Root A: A');

    // Root B starts reading the store from the latest value, which
    // includes the transition. Root A hasn't committed it yet.
    const rootB = ReactNoop.createRoot();
    await act(() => rootB.render(<Reader />));
    assertLog(['Root B: B']);
    expect(rootA).toMatchRenderedOutput('Root A: A');
    expect(rootB).toMatchRenderedOutput('Root B: B');

    await act(() => resolveText('Root A: B'));
    assertLog(['Root A: B']);
    expect(rootA).toMatchRenderedOutput('Root A: B');
  });

  // @gate enableStore
  it('a held update is released when one root commits its transition, while it is still pending in another', async () => {
    const store = createStore(1);

    function Reader({name}) {
      return <Text text={name + ': ' + use(store)} />;
    }

    function createTab(name) {
      let setTab, setShow;
      function Tab() {
        const [tab, _setTab] = useState('a');
        const [show, _setShow] = useState(false);
        setTab = _setTab;
        setShow = _setShow;
        return (
          <>
            <AsyncText text={name + ' tab: ' + tab} />
            {show ? <Reader name={name} /> : null}
          </>
        );
      }
      return {
        Tab,
        setTab: tab => setTab(tab),
        setShow: show => setShow(show),
      };
    }

    const a = createTab('A');
    const b = createTab('B');
    resolveText('A tab: a');
    resolveText('B tab: a');
    resolveText('A tab: b');
    const rootA = ReactNoop.createRoot();
    const rootB = ReactNoop.createRoot();
    await act(() => {
      rootA.render(<a.Tab />);
      rootB.render(<b.Tab />);
    });
    assertLog(['A tab: a', 'B tab: a']);

    // No root reads the store, so the transition's update is held. Root A
    // commits the transition, and root B suspends.
    await act(() => {
      startTransition(() => {
        store.update(2);
        a.setTab('b');
        b.setTab('b');
      });
    });
    assertLog(['A tab: b', 'Suspend! [B tab: b]']);
    expect(rootA).toMatchRenderedOutput('A tab: b');
    expect(rootB).toMatchRenderedOutput('B tab: a');

    // Root A committed the transition, so the held update is released.
    // A reader that mounts on root B shows it, while root B still shows
    // the old tab.
    await act(() => {
      ReactNoop.flushSync(() => b.setShow(true));
      assertLog(['B tab: a', 'B: 2']);
      expect(rootB).toMatchRenderedOutput('B tab: aB: 2');
    });
    // Root B tries its transition again, which still suspends.
    assertLog(['Suspend! [B tab: b]', 'B: 2']);

    await act(() => resolveText('B tab: b'));
    assertLog(['B tab: b', 'B: 2']);
    expect(rootB).toMatchRenderedOutput('B tab: bB: 2');
  });

  // @gate enableStore && enableSuspenseyImages
  it('an unrelated update in the same lane before the commit does not keep the store pending', async () => {
    const store = createStore(1);

    function Reader() {
      const value = use(store);
      Scheduler.log('Reader: ' + value);
      return 'Reader: ' + value;
    }

    let setOther;
    function Other() {
      const [value, _setOther] = useState(0);
      setOther = _setOther;
      return <Text text={'Other: ' + value} />;
    }

    const root = ReactNoop.createRoot();
    const otherRoot = ReactNoop.createRoot();
    await act(() => {
      root.render(<Reader />);
      otherRoot.render(<Other />);
    });
    assertLog(['Reader: 1', 'Other: 0']);

    // The commit of the render that updates the store waits on a suspensey
    // resource.
    await act(() => {
      ReactNoop.idleUpdates(() => {
        store.update(2);
        root.render(
          <>
            <Reader />
            <suspensey-thing src="A" />
          </>,
        );
      });
    });
    assertLog(['Reader: 2']);
    expect(root).toMatchRenderedOutput('Reader: 1');

    await act(() => {
      // Another root is updated in the same lane before the commit.
      ReactNoop.idleUpdates(() => setOther(1));
      ReactNoop.resolveSuspenseyThing('A');
      expect(root).toMatchRenderedOutput(
        <>
          Reader: 2<suspensey-thing src="A" />
        </>,
      );
      // Every root committed every update to the store.
      expectNoPendingUpdates(store);
      // The store has nothing pending, so an update to the same value
      // bails out without rendering the reader.
      store.update(2);
    });
    assertLog(['Other: 1']);
  });
});

describe('lifetime', () => {
  // @gate enableStore
  it('state survives remounting, unlike component state', async () => {
    const store = createStore(0);

    function Counter() {
      return <Text text={'Count: ' + use(store)} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<Counter key="a" />));
    assertLog(['Count: 0']);

    await act(() => store.update(1));
    assertLog(['Count: 1']);

    await act(() => root.render(<Counter key="b" />));
    assertLog(['Count: 1']);
  });

  // @gate enableStore
  it('stops updating unmounted readers and releases the root', async () => {
    const store = createStore(0);

    function Reader() {
      return <Text text={'Reader: ' + use(store)} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<Reader />));
    assertLog(['Reader: 0']);
    expectStoreToHaveRoots(store, 1);

    await act(() => root.render(null));
    // The commit that unmounts the last reader releases the root, even if
    // the store is never updated again.
    expectStoreToHaveRoots(store, 0);
    await act(() => store.update(1));
    assertLog([]);
    expectStoreToHaveRoots(store, 0);
  });

  // @gate enableStore
  it('subscribes to an added store and unsubscribes from a dropped one, keeping the rest', async () => {
    const shared = createStore('S');
    const storeA = createStore('A');
    const storeB = createStore('B');

    function Reader({store}) {
      return <Text text={use(shared) + use(store)} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<Reader store={storeA} />));
    assertLog(['SA']);

    await act(() => root.render(<Reader store={storeB} />));
    assertLog(['SB']);

    // Updates to the old store are ignored.
    await act(() => storeA.update('A2'));
    assertLog([]);
    expectStoreToHaveRoots(storeA, 0);

    await act(() => shared.update('S2'));
    assertLog(['S2B']);
    await act(() => storeB.update('B2'));
    assertLog(['S2B2']);

    await act(() => root.render(null));
    await act(() => shared.update('S3'));
    assertLog([]);
    expectStoreToHaveRoots(shared, 0);
    expectStoreToHaveRoots(storeB, 0);
  });

  // @gate enableStore
  it('releases the stores that are no longer read, among many', async () => {
    const stores = [];
    for (let i = 0; i < 20; i++) {
      stores.push(createStore(i));
    }

    function Item({store}) {
      return <Text text={use(store)} />;
    }

    function List({count}) {
      return stores
        .slice(0, count)
        .map((store, i) => <Item key={i} store={store} />);
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<List count={20} />));
    assertLog(Array.from({length: 20}, (_, i) => i));

    await act(() => root.render(<List count={10} />));
    assertLog(Array.from({length: 10}, (_, i) => i));
    // The commit releases the stores of the unmounted readers.
    for (let i = 0; i < 20; i++) {
      expectStoreToHaveRoots(stores[i], i < 10 ? 1 : 0);
    }

    await act(() => stores[0].update(100));
    assertLog([100]);

    // Updates to stores that aren't read anymore are applied to the value
    // a new reader starts from.
    await act(() => stores[15].update(150));
    assertLog([]);
    await act(() => root.render(<List count={16} />));
    assertLog([100, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 150]);
  });

  // @gate enableStore
  it('a transition still commits when its only reader unmounts in a root render before it renders', async () => {
    const store = createStore(0);

    function Reader() {
      return <Text text={'Reader: ' + use(store)} />;
    }

    function App({show}) {
      return show ? <Reader /> : <Text text="Nothing" />;
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<App show={true} />));
    assertLog(['Reader: 0']);

    await act(() => {
      startTransition(() => {
        store.update(1);
      });
      // Unmount the reader in an update to the root, before the transition
      // renders.
      ReactNoop.flushSync(() => {
        root.render(<App show={false} />);
      });
      assertLog(['Nothing']);
    });

    // The transition committed, and nothing reads the store, so the root
    // released it.
    expectNoPendingUpdates(store);
    expectStoreToHaveRoots(store, 0);

    // A new reader reads the committed value.
    await act(() => root.render(<App show={true} />));
    assertLog(['Reader: 1']);
    expect(root).toMatchRenderedOutput('Reader: 1');
  });

  // @gate enableStore
  it('a store update with no readers commits even when the root renders an unrelated update first', async () => {
    const store = createStore(0);

    function Reader() {
      return <Text text={'Reader: ' + use(store)} />;
    }

    let setShow, setTab;
    function App() {
      const [show, _setShow] = useState(true);
      const [tab, _setTab] = useState('a');
      setShow = _setShow;
      setTab = _setTab;
      return (
        <>
          <Text text={'Tab: ' + tab} />
          {show && <Reader />}
        </>
      );
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<App />));
    assertLog(['Tab: a', 'Reader: 0']);

    await act(() => {
      startTransition(() => {
        store.update(1);
        setTab('b');
      });
      // Unmount the only reader while the transition is pending. The root
      // keeps the store, because the store has a pending update.
      ReactNoop.flushSync(() => setShow(false));
      assertLog(['Tab: a']);
      expectStoreToHaveRoots(store, 1);

      // Nothing reads the store, so this update is scheduled on the root.
      // It's in a lane that isn't rendered with the sync lane, and isn't a
      // transition, so it doesn't get entangled with the pending one.
      ReactNoop.idleUpdates(() => {
        store.update(2);
      });
      // Then the root renders an update in a different lane.
      ReactNoop.flushSync(() => {
        root.render(<App />);
      });
      assertLog(['Tab: a']);
    });
    assertLog(['Tab: b']);

    // Both updates committed, and nothing reads the store, so the root
    // released it.
    expectNoPendingUpdates(store);
    expectStoreToHaveRoots(store, 0);

    await act(() => setShow(true));
    assertLog(['Tab: b', 'Reader: 2']);
  });

  // @gate enableStore
  it('does not retain a store that no component on the root reads anymore', async () => {
    const store = createStore(1);

    function Reader() {
      return <Text text={'Reader: ' + use(store)} />;
    }

    let setShow;
    function App() {
      const [show, _setShow] = useState(true);
      setShow = _setShow;
      return show ? <Reader /> : <Text text="Nothing" />;
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<App />));
    assertLog(['Reader: 1']);
    const fiberRoot = getRootThatReads(store);

    await act(() => store.update(2));
    assertLog(['Reader: 2']);

    // The HostRoot bails out in this render. The state it carries forward
    // must not keep the store.
    await act(() => setShow(false));
    assertLog(['Nothing']);
    expectStoreToHaveRoots(store, 0);
    expectRootNotToRetainStore(fiberRoot, store);
  });

  // @gate enableStore
  it('does not retain a store through the cache of another store', async () => {
    const storeA = createStore('a');
    const storeB = createStore('b');

    function ReaderA() {
      return <Text text={'A: ' + use(storeA)} />;
    }
    function ReaderB() {
      return <Text text={'B: ' + use(storeB)} />;
    }

    let setShowB;
    function App() {
      const [showB, _setShowB] = useState(true);
      setShowB = _setShowB;
      return (
        <>
          <ReaderA />
          {showB ? <ReaderB /> : null}
        </>
      );
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<App />));
    assertLog(['A: a', 'B: b']);
    const fiberRoot = getRootThatReads(storeA);

    // A's last read is from a render that also processed B.
    await act(() => {
      storeA.update('a1');
      storeB.update('b1');
    });
    assertLog(['A: a1', 'B: b1']);

    await act(() => storeB.update('b2'));
    assertLog(['B: b2']);

    // A doesn't render again, so what it remembers about its last read
    // must not keep B.
    await act(() => setShowB(false));
    assertLog(['A: a1']);
    expectStoreToHaveRoots(storeB, 0);
    expectRootNotToRetainStore(fiberRoot, storeB, [storeA]);
  });
});

// Store updates follow the same rules as useState updates. Each test runs
// one scenario twice, once with the value in useState, passed down through
// context, and once with the value in a store, and asserts the same logs.
describe('same as useState', () => {
  function createStateSource(initialValue) {
    const Context = React.createContext(null);
    let setValue;
    function Root({children}) {
      const [value, _setValue] = useState(initialValue);
      setValue = _setValue;
      return <Context value={value}>{children}</Context>;
    }
    return {
      Root,
      read: () => use(Context),
      update: action => setValue(action),
    };
  }

  function createStoreSource(initialValue) {
    const store = createStore(initialValue);
    return {
      Root: ({children}) => children,
      read: () => use(store),
      update: action => store.update(action),
    };
  }

  async function runWithStateAndStore(scenario) {
    await scenario(createStateSource);
    await scenario(createStoreSource);
  }

  // @gate enableStore
  it('batches updates, and renders urgent updates before transitions', async () => {
    await runWithStateAndStore(async createSource => {
      const source = createSource(0);
      function Reader({name}) {
        return <Text text={name + ': ' + source.read()} />;
      }

      const root = ReactNoop.createRoot();
      await act(() => {
        root.render(
          <source.Root>
            <Reader name="A" />
            <Reader name="B" />
          </source.Root>,
        );
      });
      assertLog(['A: 0', 'B: 0']);

      // Updates in the same event render once.
      await act(() => {
        source.update(n => n + 1);
        source.update(n => n + 1);
      });
      assertLog(['A: 2', 'B: 2']);

      // Urgent updates render first, without the transition between them.
      // Then the transition renders, with every update in dispatch order.
      await act(() => {
        source.update(n => n + 1);
        startTransition(() => source.update(n => n * 10));
        source.update(n => n + 1);
      });
      assertLog(['A: 4', 'B: 4', 'A: 31', 'B: 31']);
    });
  });

  // @gate enableStore
  it('rebases an urgent update over a pending transition', async () => {
    await runWithStateAndStore(async createSource => {
      const source = createSource(2);
      function Reader() {
        return <Text text={source.read()} />;
      }

      const root = ReactNoop.createRoot();
      await act(() => {
        root.render(
          <source.Root>
            <Reader />
          </source.Root>,
        );
      });
      assertLog([2]);

      let resolve;
      await act(() => {
        startTransition(async () => {
          source.update(n => n + 1);
          await new Promise(r => (resolve = r));
        });
      });
      assertLog([]);

      // The urgent update is applied to the committed value.
      await act(() => source.update(n => n * 2));
      assertLog([4]);

      // When the transition finishes, it's applied first, and the urgent
      // update is applied again on top of it: (2 + 1) * 2.
      await act(() => resolve());
      assertLog([6]);
    });
  });

  // @gate enableStore
  it('a reader that mounts while a transition is rendering joins it', async () => {
    await runWithStateAndStore(async createSource => {
      const source = createSource(0);
      function Reader({name}) {
        return <Text text={name + ': ' + source.read()} />;
      }

      let setShow;
      function App() {
        const [show, _setShow] = useState(false);
        setShow = _setShow;
        return (
          <>
            <Reader name="A" />
            <Text text="Sibling" />
            {show ? <Reader name="B" /> : null}
          </>
        );
      }

      const root = ReactNoop.createRoot();
      await act(() => {
        root.render(
          <source.Root>
            <App />
          </source.Root>,
        );
      });
      assertLog(['A: 0', 'Sibling']);

      await act(async () => {
        startTransition(() => source.update(1));
        await waitFor(['A: 1']);
        // Mount B in an urgent update, in the middle of the transition. It
        // shows the committed value, like A.
        ReactNoop.flushSync(() => setShow(true));
        assertLog(['A: 0', 'Sibling', 'B: 0']);
      });
      // Then the transition renders again, and includes B.
      assertLog(['A: 1', 'B: 1']);
      expect(root).toMatchRenderedOutput('A: 1SiblingB: 1');
    });
  });

  // @gate enableStore
  it('runs each updater as often through an interruption and a rebase', async () => {
    await runWithStateAndStore(async createSource => {
      const source = createSource('');
      function Reader() {
        return source.read();
      }
      function append(letter) {
        return state => {
          Scheduler.log(letter);
          return state + letter;
        };
      }

      const root = ReactNoop.createRoot();
      await act(() => {
        root.render(
          <source.Root>
            <Reader />
          </source.Root>,
        );
      });

      await act(async () => {
        startTransition(() => {
          source.update(append('a'));
          source.update(append('b'));
          source.update(append('c'));
        });
        // The first update to an idle value is computed eagerly.
        assertLog(['a']);

        // Start rendering the transition, then interrupt it.
        await waitFor(['b', 'c']);
        source.update(append('d'));
        ReactNoop.flushSync(() => {
          source.update(append('e'));
          source.update(append('f'));
        });
        startTransition(() => {
          source.update(append('g'));
        });
        // The sync render skips the transition.
        assertLog(['d', 'e', 'f']);
        expect(root).toMatchRenderedOutput('def');
      });
      // The transition renders every update again, except the eager state
      // of a, which is reused. Nothing runs again in the commit.
      assertLog(['b', 'c', 'd', 'e', 'f', 'g']);
      expect(root).toMatchRenderedOutput('abcdefg');
    });
  });
});
