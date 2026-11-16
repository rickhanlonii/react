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
let act;
let use;
let useState;
let useEffect;
let useLayoutEffect;
let startTransition;
let Suspense;
let Activity;
let StrictMode;
let assertLog;
let waitFor;
let assertConsoleErrorDev;
let createStore;
let ErrorBoundary;

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
  use = React.use;
  useState = React.useState;
  useEffect = React.useEffect;
  useLayoutEffect = React.useLayoutEffect;
  startTransition = React.startTransition;
  Suspense = React.Suspense;
  Activity = React.Activity;
  StrictMode = React.StrictMode;
  createStore = React.unstable_createStore;

  const InternalTestUtils = require('internal-test-utils');
  act = InternalTestUtils.act;
  assertLog = InternalTestUtils.assertLog;
  waitFor = InternalTestUtils.waitFor;
  assertConsoleErrorDev = InternalTestUtils.assertConsoleErrorDev;

  ErrorBoundary = createErrorBoundary();
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

function Text({text}) {
  Scheduler.log(text);
  return text;
}

// Review of errors, StrictMode, and lifetime (slice 4). Each test is either a
// finding (it fails on the current code) or a check that held up.

// The oracle: the same scenario with useReducer at the root, passed down
// through context. A scenario calls `checkpoint(root)` after each step, which
// records the log and the output, and the two runs must match.
function createReducerSource(initialValue, reducer) {
  const Context = React.createContext(null);
  let dispatch;
  function Root({children}) {
    const [value, _dispatch] = React.useReducer(reducer, initialValue);
    dispatch = _dispatch;
    return <Context value={value}>{children}</Context>;
  }
  return {
    kind: 'reducer',
    Root,
    read: () => use(Context),
    update: action => dispatch(action),
  };
}

function createStoreSourceWithReducer(initialValue, reducer) {
  const store = createStore(initialValue, reducer);
  return {
    kind: 'store',
    store,
    Root: ({children}) => children,
    read: () => use(store),
    update: action => store.update(action),
  };
}

async function compareWithUseReducer(scenario) {
  const results = [];
  const createSources = [createReducerSource, createStoreSourceWithReducer];
  for (let k = 0; k < createSources.length; k++) {
    const createSource = createSources[k];
    const steps = [];
    // Compare the first line of each console.error too.
    let errors = [];
    const consoleError = jest
      .spyOn(console, 'error')
      .mockImplementation((format, ...args) => {
        let i = 0;
        const message = String(format).replace(/%s/g, () => String(args[i++]));
        errors.push(message.split('\n')[0]);
      });
    const checkpoint = root => {
      steps.push({
        log: Scheduler.unstable_clearLog(),
        output: root.getChildrenAsJSX(),
        errors,
      });
      errors = [];
    };
    try {
      await scenario(createSource, checkpoint);
    } finally {
      consoleError.mockRestore();
    }
    steps.push({log: Scheduler.unstable_clearLog(), errors});
    results.push(steps);
  }
  expect(results[1]).toEqual(results[0]);
}

function getGC() {
  const v8 = require('v8');
  const vm = require('vm');
  v8.setFlagsFromString('--expose-gc');
  const gc = vm.runInNewContext('gc');
  v8.setFlagsFromString('--no-expose-gc');
  return gc;
}

async function isCollected(weakRef) {
  const gc = getGC();
  const {setImmediate: realSetImmediate} = require('timers');
  const tick = () => new Promise(resolve => realSetImmediate(resolve));
  for (let i = 0; i < 20; i++) {
    gc();
    await tick();
    if (weakRef.deref() === undefined) {
      return true;
    }
    await tick();
  }
  return false;
}

describe('review: reducer errors', () => {
  // @gate enableStore
  it('an urgent update that throws only when rebased over a transition is caught once and dropped', async () => {
    const store = createStore('initial', (state, action) => {
      if (action === 'a' && state === 'ready') {
        throw new Error('Rebase');
      }
      return action;
    });
    function Reader() {
      return <Text text={'Value: ' + use(store)} />;
    }
    const root = createRootLoggingErrors();
    await act(() =>
      root.render(
        <ErrorBoundary>
          <Reader />
        </ErrorBoundary>,
      ),
    );
    assertLog(['Value: initial']);

    await act(async () => {
      startTransition(() => store.update('ready'));
      store.update('a');
    });
    // The urgent render skips the transition, so 'a' applies to 'initial'.
    // The transition rebases 'a' on top of 'ready', where it throws.
    const log = Scheduler.unstable_clearLog();
    expect(log[0]).toBe('Value: a');
    expect(log.filter(entry => entry.startsWith('on'))).toEqual([
      'onCaughtError: Rebase',
    ]);
    expect(log.filter(entry => entry.startsWith('report'))).toEqual([]);
    expect(root).toMatchRenderedOutput('Caught: Rebase');

    // The update that threw is dropped, like in dispatch order.
    const other = ReactNoop.createRoot();
    await act(() => other.render(<Reader />));
    assertLog(['Value: ready']);
    expectNoPendingUpdates(store);
  });

  // @gate enableStore
  it('keeps the valid updates batched with one that throws', async () => {
    const store = createStore(0, throwingReducer);
    function Reader() {
      return <Text text={'Value: ' + use(store)} />;
    }
    const root = createRootLoggingErrors();
    await act(() =>
      root.render(
        <ErrorBoundary key="1">
          <Reader />
        </ErrorBoundary>,
      ),
    );
    assertLog(['Value: 0']);

    await act(() => {
      store.update(1);
      store.update('throw');
      store.update(2);
    });
    const log = Scheduler.unstable_clearLog();
    expect(log.filter(entry => entry.startsWith('on'))).toEqual([
      'onCaughtError: Oops',
    ]);
    expect(root).toMatchRenderedOutput('Caught: Oops');

    await act(() =>
      root.render(
        <ErrorBoundary key="2">
          <Reader />
        </ErrorBoundary>,
      ),
    );
    assertLog(['Value: 2']);
    expectNoPendingUpdates(store);
  });

  // @gate enableStore
  it('an uncaught reducer error is reported once, by the root, and releases the store', async () => {
    const store = createStore(0, throwingReducer);
    function Reader() {
      return <Text text={'Value: ' + use(store)} />;
    }
    const root = createRootLoggingErrors();
    await act(() => root.render(<Reader />));
    assertLog(['Value: 0']);

    await act(() => store.update('throw'));
    const log = Scheduler.unstable_clearLog();
    expect(log.filter(entry => entry.includes('Oops'))).toEqual([
      'onUncaughtError: Oops',
    ]);
    expect(root).toMatchRenderedOutput(null);
    expectStoreToHaveRoots(store, 0);
    expectNoPendingUpdates(store);

    await act(() => root.render(<Reader />));
    assertLog(['Value: 0']);
  });

  // @gate enableStore
  it('a reducer error in a store read only by a boundary waiting on it is caught when the boundary retries', async () => {
    const store = createStore('pending', (state, action) => {
      if (action === 'throw') {
        throw new Error('Oops');
      }
      return action;
    });
    const never = new Promise(() => {});
    function Reader() {
      const value = use(store);
      if (value === 'pending') {
        Scheduler.log('Suspend');
        use(never);
      }
      return <Text text={'Value: ' + value} />;
    }
    const root = createRootLoggingErrors();
    await act(() =>
      root.render(
        <ErrorBoundary>
          <Suspense fallback={<Text text="Loading" />}>
            <Reader />
          </Suspense>
        </ErrorBoundary>,
      ),
    );
    assertLog(['Suspend', 'Loading', 'Suspend']);
    expect(root).toMatchRenderedOutput('Loading');

    await act(() => store.update('throw'));
    const log = Scheduler.unstable_clearLog();
    expect(log.filter(entry => entry.includes('Oops'))).toEqual([
      'Caught: Oops',
      'Caught: Oops',
      'onCaughtError: Oops',
    ]);
    expect(root).toMatchRenderedOutput('Caught: Oops');
    // The boundary was deleted along with its subscription.
    expectStoreToHaveRoots(store, 0);
    expectNoPendingUpdates(store);
  });

  // @gate enableStore
  it('an urgent update held behind a pending transition that throws is reported once when the transition commits', async () => {
    const store = createStore(0, throwingReducer);
    function Reader() {
      return <Text text={'Reader: ' + use(store)} />;
    }
    let resolve;
    const data = new Promise(r => {
      resolve = r;
    });
    function Page() {
      return <Text text={'Page: ' + use(data)} />;
    }
    const root = ReactNoop.createRoot();
    await act(() => root.render(<Text text="Home" />));
    assertLog(['Home']);

    await act(() => {
      startTransition(() => {
        // No root reads the store, so the update is held while the
        // transition waits on data.
        store.update(1);
        root.render(<Page />);
      });
    });
    // An urgent update behind the held one is held too.
    store.update('throw');
    assertLog([]);

    await act(() => resolve('loaded'));
    assertLog(['Page: loaded', 'reportError: Oops']);

    await act(() => root.render(<Reader />));
    assertLog(['Reader: 1']);
    expectNoPendingUpdates(store);
  });

  // @gate enableStore
  it('a reducer that throws on its StrictMode replay does not throw in the reader', async () => {
    let calls = 0;
    const store = createStore(0, (state, action) => {
      calls++;
      if (calls % 2 === 0) {
        throw new Error('Impure');
      }
      return state + action;
    });
    function Reader() {
      return <Text text={'Value: ' + use(store)} />;
    }
    const root = createRootLoggingErrors();
    await act(() =>
      root.render(
        <StrictMode>
          <ErrorBoundary>
            <Reader />
          </ErrorBoundary>
        </StrictMode>,
      ),
    );
    assertLog(['Value: 0']);
    await act(() => store.update(1));
    assertLog(['Value: 1']);
  });
});

function basicReducer(state, action) {
  return typeof action === 'function' ? action(state) : action;
}

describe('review: error boundaries', () => {
  // @gate enableStore
  it('a reader that throws for another reason while a transition is pending: same as useReducer', async () => {
    await compareWithUseReducer(async (createSource, checkpoint) => {
      const source = createSource(0, basicReducer);
      let shouldThrow = false;
      function Reader() {
        const value = source.read();
        if (shouldThrow) {
          throw new Error('Unrelated');
        }
        return <Text text={'Value: ' + value} />;
      }
      let setTick;
      function App({boundaryKey}) {
        const [tick, _setTick] = useState(0);
        setTick = _setTick;
        return (
          <ErrorBoundary key={boundaryKey}>
            <Reader tick={tick} />
          </ErrorBoundary>
        );
      }
      const root = ReactNoop.createRoot();
      await act(() =>
        root.render(
          <source.Root>
            <App boundaryKey="1" />
          </source.Root>,
        ),
      );
      checkpoint(root);

      await act(() => {
        startTransition(() => source.update(1));
        shouldThrow = true;
        ReactNoop.flushSync(() => setTick(1));
      });
      checkpoint(root);
      if (source.kind === 'store') {
        // Nothing reads the store, and the transition committed.
        expectStoreToHaveRoots(source.store, 0);
        expectNoPendingUpdates(source.store);
      }

      shouldThrow = false;
      await act(() =>
        root.render(
          <source.Root>
            <App boundaryKey="2" />
          </source.Root>,
        ),
      );
      checkpoint(root);
    });
  });

  // @gate enableStore
  it('a boundary that resets shows updates made while it showed its error: same as useReducer', async () => {
    await compareWithUseReducer(async (createSource, checkpoint) => {
      const source = createSource(0, basicReducer);
      let shouldThrow = true;
      function Reader() {
        const value = source.read();
        if (shouldThrow) {
          throw new Error('Unrelated');
        }
        return <Text text={'Value: ' + value} />;
      }
      let boundary;
      class ResettableBoundary extends React.Component {
        state = {error: null};
        static getDerivedStateFromError(error) {
          return {error};
        }
        render() {
          boundary = this;
          if (this.state.error !== null) {
            return <Text text="Error" />;
          }
          return this.props.children;
        }
      }
      const root = ReactNoop.createRoot();
      await act(() =>
        root.render(
          <source.Root>
            <ResettableBoundary>
              <Reader />
            </ResettableBoundary>
          </source.Root>,
        ),
      );
      checkpoint(root);

      // While the error shows, nothing reads the value.
      await act(() => source.update(1));
      checkpoint(root);
      await act(() => {
        startTransition(() => source.update(n => n + 10));
      });
      checkpoint(root);

      // Reset in a transition together with another update.
      shouldThrow = false;
      await act(() => {
        startTransition(() => {
          source.update(n => n + 100);
          boundary.setState({error: null});
        });
      });
      checkpoint(root);

      await act(() => source.update(n => n + 1000));
      checkpoint(root);
    });
  });

  // @gate enableStore
  it('an error boundary inside Suspense catches a reducer error when the store retries the boundary', async () => {
    const store = createStore('pending', (state, action) => {
      if (action === 'throw') {
        throw new Error('Oops');
      }
      return action;
    });
    const never = new Promise(() => {});
    function Reader() {
      const value = use(store);
      if (value === 'pending') {
        Scheduler.log('Suspend');
        use(never);
      }
      return <Text text={'Value: ' + value} />;
    }
    const root = createRootLoggingErrors();
    await act(() =>
      root.render(
        <Suspense fallback={<Text text="Loading" />}>
          <ErrorBoundary>
            <Reader />
          </ErrorBoundary>
        </Suspense>,
      ),
    );
    assertLog(['Suspend', 'Loading', 'Suspend']);

    await act(() => store.update('throw'));
    const log = Scheduler.unstable_clearLog();
    expect(log.filter(entry => entry.startsWith('on'))).toEqual([
      'onCaughtError: Oops',
    ]);
    expect(root).toMatchRenderedOutput('Caught: Oops');
    // The primary children committed, so the boundary unsubscribed, and
    // nothing else reads the store.
    expectStoreToHaveRoots(store, 0);
    expectNoPendingUpdates(store);
  });
});

describe('review: StrictMode', () => {
  // @gate enableStore
  it('updates from double invoked layout and passive effects: same as useReducer', async () => {
    await compareWithUseReducer(async (createSource, checkpoint) => {
      const source = createSource(1, basicReducer);
      function Child({name}) {
        const value = source.read();
        useLayoutEffect(() => {
          source.update(n => n + 1);
        }, []);
        useEffect(() => {
          source.update(n => n * 2);
        }, []);
        return <Text text={name + ': ' + value} />;
      }
      const root = ReactNoop.createRoot();
      await act(() =>
        root.render(
          <StrictMode>
            <source.Root>
              <Child name="A" />
            </source.Root>
          </StrictMode>,
        ),
      );
      checkpoint(root);

      // A reader that mounts later in StrictMode.
      await act(() =>
        root.render(
          <StrictMode>
            <source.Root>
              <Child name="A" />
              <Child name="B" />
            </source.Root>
          </StrictMode>,
        ),
      );
      checkpoint(root);
    });
  });

  // @gate enableStore
  it('a reader remounted by StrictMode in a hidden Activity that becomes visible stays subscribed', async () => {
    const store = createStore(0);
    function Reader() {
      return <Text text={'Reader: ' + use(store)} />;
    }
    let setMode;
    function App() {
      const [mode, _setMode] = useState('hidden');
      setMode = _setMode;
      return (
        <Activity mode={mode}>
          <Reader />
        </Activity>
      );
    }
    const root = ReactNoop.createRoot();
    await act(() =>
      root.render(
        <StrictMode>
          <App />
        </StrictMode>,
      ),
    );
    assertLog(['Reader: 0']);
    await act(() => setMode('visible'));
    assertLog(['Reader: 0']);
    await act(() => store.update(1));
    assertLog(['Reader: 1']);
    expect(store._records[0].readers.size).toBe(1);
    await act(() => root.render(null));
    expectStoreToHaveRoots(store, 0);
  });

  // @gate enableStore
  it('runs the reducer as often as useReducer in StrictMode, through a rebase', async () => {
    const counts = {};
    await compareWithUseReducer(async (createSource, checkpoint) => {
      let calls = 0;
      const source = createSource(1, (state, action) => {
        calls++;
        return action === 'double' ? state * 2 : state + action;
      });
      function Reader() {
        return <Text text={'Value: ' + source.read()} />;
      }
      const root = ReactNoop.createRoot();
      await act(() =>
        root.render(
          <StrictMode>
            <source.Root>
              <Reader />
            </source.Root>
          </StrictMode>,
        ),
      );
      checkpoint(root);
      await act(() => {
        startTransition(() => source.update('double'));
        source.update(1);
      });
      checkpoint(root);
      await act(() => source.update(5));
      checkpoint(root);
      counts[source.kind] = calls;
    });
    // The store computes the eager state of an update to an idle store at
    // dispatch, which useReducer doesn't do. Allow one call for that.
    expect(counts.store).toBeLessThanOrEqual(counts.reducer + 1);
  });
});

describe('review: infinite loops', () => {
  // @gate enableStore
  // FIXME(Q2): a store drops the update that hits the nested update limit and setState keeps it. Undecided whether to document or change it.
  it.skip('a layout effect that updates the store it reads on every commit: same as useReducer', async () => {
    await compareWithUseReducer(async (createSource, checkpoint) => {
      const source = createSource(0, basicReducer);
      function Child() {
        const value = source.read();
        useLayoutEffect(() => {
          source.update(value + 1);
        });
        return <Text text={value} />;
      }
      function Reader() {
        return <Text text={'Reader: ' + source.read()} />;
      }
      const root = createRootLoggingErrors();
      await act(() =>
        root.render(
          <source.Root>
            <ErrorBoundary key="1">
              <Child />
            </ErrorBoundary>
          </source.Root>,
        ),
      );
      checkpoint(root);
      if (source.kind === 'store') {
        expectNoPendingUpdates(source.store);
        expectStoreToHaveRoots(source.store, 0);
      }
      // The value the loop left behind.
      await act(() =>
        root.render(
          <source.Root>
            <ErrorBoundary key="2">
              <Reader />
            </ErrorBoundary>
          </source.Root>,
        ),
      );
      checkpoint(root);
    });
  });

  // @gate enableStore
  // FIXME(Q2): a store drops the update that hits the nested update limit and setState keeps it. Undecided whether to document or change it.
  it.skip('a reader that updates the store during render loops like a child updating its parent during render', async () => {
    // Unbounded, both loop forever (act gives up after 6000 iterations, with
    // the same number of renders and recovered errors). Bounded past the
    // nested update limit, they render the same.
    const LIMIT = 120;
    async function runScenario(kind) {
      const store = createStore(0);
      function StoreReader() {
        const n = use(store);
        if (n < LIMIT) {
          store.update(x => x + 1);
        }
        return <Text text={n} />;
      }
      function Child({n, setN}) {
        if (n < LIMIT) {
          setN(x => x + 1);
        }
        return <Text text={n} />;
      }
      function Parent() {
        const [n, setN] = useState(0);
        return <Child n={n} setN={setN} />;
      }
      const errors = [];
      const root = ReactNoop.createRoot({
        onUncaughtError(error) {
          errors.push('uncaught: ' + error.message);
        },
        onRecoverableError(error) {
          errors.push('recoverable: ' + error.message);
        },
      });
      const consoleError = jest
        .spyOn(console, 'error')
        .mockImplementation(() => {});
      try {
        await act(() =>
          root.render(kind === 'store' ? <StoreReader /> : <Parent />),
        );
      } finally {
        consoleError.mockRestore();
      }
      if (kind === 'store') {
        expectNoPendingUpdates(store);
      }
      return {
        log: Scheduler.unstable_clearLog(),
        errors,
        output: root.getChildrenAsJSX(),
      };
    }
    const state = await runScenario('state');
    const store = await runScenario('store');
    expect(store).toEqual(state);
    expect(store.output).toBe(String(LIMIT));
  });
});

describe('review: lifetime and memory', () => {
  it('control: a root that unmounted its tree is collected', async () => {
    async function mount() {
      const root = ReactNoop.createRoot();
      await act(() => root.render(<Text text="Hello" />));
      assertLog(['Hello']);
      await act(() => root.render(null));
      return new WeakRef(root);
    }
    const ref = await mount();
    expect(await isCollected(ref)).toBe(true);
  });

  // @gate enableStore
  it('a module-level store does not keep a root alive after its readers unmount', async () => {
    const store = createStore(0);
    function Reader() {
      return <Text text={'Reader: ' + use(store)} />;
    }
    async function mount() {
      const root = ReactNoop.createRoot();
      await act(() => root.render(<Reader />));
      assertLog(['Reader: 0']);
      const fiberRoot = getRootThatReads(store);
      await act(() => store.update(1));
      assertLog(['Reader: 1']);
      await act(() => root.render(null));
      return new WeakRef(fiberRoot);
    }
    const ref = await mount();
    expect(await isCollected(ref)).toBe(true);
    // Still usable.
    store.update(2);
    const root = ReactNoop.createRoot();
    await act(() => root.render(<Reader />));
    assertLog(['Reader: 2']);
  });

  // @gate enableStore
  it('a module-level store does not keep a root alive after a transition commits with no readers', async () => {
    const store = createStore(0);
    function Reader() {
      return <Text text={'Reader: ' + use(store)} />;
    }
    async function mount() {
      const root = ReactNoop.createRoot();
      await act(() => root.render(<Reader />));
      assertLog(['Reader: 0']);
      const fiberRoot = getRootThatReads(store);
      await act(() => {
        startTransition(() => store.update(1));
        ReactNoop.flushSync(() => root.render(null));
      });
      return new WeakRef(fiberRoot);
    }
    const ref = await mount();
    expectStoreToHaveRoots(store, 0);
    expectNoPendingUpdates(store);
    expect(await isCollected(ref)).toBe(true);
  });

  // @gate enableStore
  it('a Suspense boundary that waited on a store releases the root when it unmounts', async () => {
    const store = createStore('pending');
    // Created per root: a suspended render's ping listener keeps the root
    // alive for as long as the promise is.
    let never = new Promise(() => {});
    function Reader() {
      const value = use(store);
      if (value === 'pending') {
        use(never);
      }
      return <Text text={'Reader: ' + value} />;
    }
    async function mount() {
      const root = ReactNoop.createRoot();
      await act(() =>
        root.render(
          <Suspense fallback={<Text text="Loading" />}>
            <Reader />
          </Suspense>,
        ),
      );
      assertLog(['Loading']);
      const fiberRoot = getRootThatReads(store);
      await act(() => root.render(null));
      return new WeakRef(fiberRoot);
    }
    await mount();
    never = null;
    // Not checked with the garbage collector: without any store, a root
    // whose boundary showed a fallback isn't collected after it unmounts
    // either, so that wouldn't say anything about stores.
    expectStoreToHaveRoots(store, 0);
  });

  // @gate enableStore
  it('a store that only a component holds is collected after the root unmounts it, like component state', async () => {
    async function mount(createValue, read) {
      const root = ReactNoop.createRoot();
      let ref;
      function Owner() {
        const [value] = useState(createValue);
        ref = ref || new WeakRef(value);
        return <Text text={'Value: ' + read(value)} />;
      }
      await act(() => root.render(<Owner />));
      assertLog(['Value: 0']);
      await act(() => root.render(null));
      // Keep the root alive: only the component held the value.
      return {root, ref};
    }
    const control = await mount(
      () => ({value: 0}),
      v => v.value,
    );
    expect(await isCollected(control.ref)).toBe(true);
    const withStore = await mount(
      () => createStore(0),
      store => use(store),
    );
    expect(await isCollected(withStore.ref)).toBe(true);
  });

  // @gate enableStore
  it('a store updated in a transition after its readers unmounted is collected without another commit', async () => {
    let update;
    async function mount() {
      const root = ReactNoop.createRoot();
      let ref;
      function Owner() {
        const [store] = useState(() => createStore(0));
        ref = ref || new WeakRef(store);
        update = store.update;
        return <Text text={'Value: ' + use(store)} />;
      }
      await act(() => root.render(<Owner />));
      assertLog(['Value: 0']);
      await act(() => root.render(null));
      // A stale handler updates the store in a transition. No root reads it,
      // so the update is held until the transition is done. The transition
      // has nothing to render, so it's done at the end of the event.
      await act(() => startTransition(() => update(1)));
      update = null;
      return {root, ref};
    }
    const {ref} = await mount();
    expect(await isCollected(ref)).toBe(true);
  });

  // @gate enableStore
  it('a store updated in a transition after its readers unmounted is collected after the next commit', async () => {
    let update;
    async function mount() {
      const root = ReactNoop.createRoot();
      let ref;
      function Owner() {
        const [store] = useState(() => createStore(0));
        ref = ref || new WeakRef(store);
        update = store.update;
        return <Text text={'Value: ' + use(store)} />;
      }
      await act(() => root.render(<Owner />));
      assertLog(['Value: 0']);
      await act(() => root.render(null));
      await act(() => startTransition(() => update(1)));
      update = null;
      return {root, ref};
    }
    const {root, ref} = await mount();
    // Any commit settles the held updates of finished transitions.
    await act(() => root.render(<Text text="Next" />));
    assertLog(['Next']);
    expect(await isCollected(ref)).toBe(true);
  });

  // @gate enableStore
  it('unmounting the root while a transition update to a store is waiting on data releases the root once it settles', async () => {
    const store = createStore(0);
    function Reader() {
      return <Text text={'Reader: ' + use(store)} />;
    }
    const never = new Promise(() => {});
    function Page() {
      use(never);
      return null;
    }
    const root = ReactNoop.createRoot();
    await act(() => root.render(<Reader />));
    assertLog(['Reader: 0']);
    await act(() => {
      startTransition(() => {
        store.update(1);
        root.render(
          <>
            <Reader />
            <Page />
          </>,
        );
      });
    });
    // The transition renders the update, then waits on the page.
    assertLog(['Reader: 1']);
    expect(root).toMatchRenderedOutput('Reader: 0');
    // Unmount the root. The transition can't commit what it was waiting on
    // anymore, since the root has nothing in it.
    await act(() => root.render(null));
    assertLog([]);
    expect(root).toMatchRenderedOutput(null);
    expectStoreToHaveRoots(store, 0);
    expectNoPendingUpdates(store);
    const other = ReactNoop.createRoot();
    await act(() => other.render(<Reader />));
    assertLog(['Reader: 1']);
  });

  // @gate enableStore
  it('a reader deleted while hidden in an Activity unsubscribes', async () => {
    const store = createStore(0);
    function Reader() {
      return <Text text={'Reader: ' + use(store)} />;
    }
    const root = ReactNoop.createRoot();
    await act(() =>
      root.render(
        <Activity mode="hidden">
          <Reader />
        </Activity>,
      ),
    );
    assertLog(['Reader: 0']);
    await act(() => root.render(null));
    expectStoreToHaveRoots(store, 0);
    await act(() => store.update(1));
    assertLog([]);
  });

  // @gate enableStore
  it('a reader in primary content hidden by a Suspense fallback unsubscribes when the boundary is deleted', async () => {
    const store = createStore(0);
    const never = new Promise(() => {});
    function Reader() {
      return <Text text={'Reader: ' + use(store)} />;
    }
    function MaybeSuspend({suspend}) {
      if (suspend) {
        Scheduler.log('Suspend');
        use(never);
      }
      return null;
    }
    function App({suspend, show}) {
      return show ? (
        <Suspense fallback={<Text text="Loading" />}>
          <Reader />
          <MaybeSuspend suspend={suspend} />
        </Suspense>
      ) : null;
    }
    const root = ReactNoop.createRoot();
    await act(() => root.render(<App show={true} suspend={false} />));
    assertLog(['Reader: 0']);
    // An urgent update suspends, so the content is hidden behind the
    // fallback, but stays mounted.
    await act(() => root.render(<App show={true} suspend={true} />));
    assertLog(['Reader: 0', 'Suspend', 'Loading', 'Reader: 0', 'Suspend']);
    await act(() => store.update(1));
    // The hidden reader renders the update (then again as a prerender).
    expect(Scheduler.unstable_clearLog()[0]).toBe('Reader: 1');
    await act(() => root.render(<App show={false} />));
    expectStoreToHaveRoots(store, 0);
    expectNoPendingUpdates(store);
  });

  // @gate enableStore
  it('clears the root store lists once every record is dropped', async () => {
    const stores = [createStore(0), createStore(0), createStore(0)];
    function Reader({store}) {
      return <Text text={'Reader: ' + use(store)} />;
    }
    const root = ReactNoop.createRoot();
    await act(() =>
      root.render(stores.map((s, i) => <Reader key={i} store={s} />)),
    );
    assertLog(['Reader: 0', 'Reader: 0', 'Reader: 0']);
    const fiberRoot = getRootThatReads(stores[0]);
    await act(() => {
      startTransition(() => stores.forEach(s => s.update(1)));
      stores[0].update(n => n + 10);
    });
    assertLog(['Reader: 10', 'Reader: 11', 'Reader: 1', 'Reader: 1']);
    await act(() => root.render(null));
    stores.forEach(s => {
      expectStoreToHaveRoots(s, 0);
      expectNoPendingUpdates(s);
    });
    expect(fiberRoot.pendingStoreRecords).toBe(null);
    expect(fiberRoot.unsubscribedStoreRecords).toBe(null);
    stores.forEach(s => expectRootNotToRetainStore(fiberRoot, s));
    // Note: the previous HostRoot (the alternate) still holds the states of
    // the last render that processed stores, until the root renders again.
    // That's the same as the element tree it holds, so it isn't asserted.
  });
});

describe('review: scale', () => {
  // A deterministic pseudo-random sequence.
  function createRandom(seed) {
    let state = seed;
    return () => {
      state = (state * 1103515245 + 12345) % 2147483648;
      return state / 2147483648;
    };
  }

  // @gate enableStore
  it('a reader of hundreds of stores that changes which ones it reads each render stays subscribed to exactly those', async () => {
    const COUNT = 300;
    const stores = [];
    for (let i = 0; i < COUNT; i++) {
      stores.push(createStore(i));
    }
    const random = createRandom(42);
    let indices = [];
    function pickIndices() {
      const next = [];
      for (let i = 0; i < COUNT; i++) {
        if (random() < 0.3) {
          next.push(i);
          if (random() < 0.1) {
            // Read the same store again.
            next.push(i);
          }
        }
      }
      return next;
    }
    let renders = 0;
    function Reader({version}) {
      renders++;
      let sum = 0;
      for (let i = 0; i < indices.length; i++) {
        sum += use(stores[indices[i]]);
      }
      return <Text text={'Sum: ' + sum} />;
    }
    function expectedSum() {
      let sum = 0;
      for (let i = 0; i < indices.length; i++) {
        sum += stores[indices[i]]._head;
      }
      return sum;
    }
    const root = ReactNoop.createRoot();
    for (let round = 0; round < 8; round++) {
      indices = pickIndices();
      await act(() => root.render(<Reader version={round} />));
      Scheduler.unstable_clearLog();
      expect(root).toMatchRenderedOutput('Sum: ' + expectedSum());
      const read = new Set(indices);
      for (let i = 0; i < COUNT; i++) {
        expectStoreToHaveRoots(stores[i], read.has(i) ? 1 : 0);
        if (read.has(i)) {
          expect(stores[i]._records[0].readers.size).toBe(1);
        }
      }
      // An update to a store that isn't read doesn't render; one that is
      // read does.
      const unread = stores.findIndex((s, i) => !read.has(i));
      renders = 0;
      await act(() => stores[unread].update(n => n + 1000));
      expect(renders).toBe(0);
      const readIndex = indices[0];
      await act(() => stores[readIndex].update(n => n + 1));
      expect(renders).toBe(1);
      Scheduler.unstable_clearLog();
      expect(root).toMatchRenderedOutput('Sum: ' + expectedSum());
    }
    await act(() => root.render(null));
    stores.forEach(s => {
      expectStoreToHaveRoots(s, 0);
      expectNoPendingUpdates(s);
    });
  });

  // @gate enableStore
  it('many readers of one store, unmounted in batches, release the store with the last one', async () => {
    const store = createStore(0);
    function Reader() {
      use(store);
      return null;
    }
    function List({from, to}) {
      const items = [];
      for (let i = from; i < to; i++) {
        items.push(<Reader key={i} />);
      }
      return items;
    }
    const root = ReactNoop.createRoot();
    await act(() => root.render(<List from={0} to={1000} />));
    expect(store._records[0].readers.size).toBe(1000);
    await act(() => store.update(1));
    await act(() => root.render(<List from={500} to={1000} />));
    expect(store._records[0].readers.size).toBe(500);
    await act(() => {
      startTransition(() => store.update(2));
      ReactNoop.flushSync(() => root.render(<List from={999} to={1000} />));
    });
    expect(store._records[0].readers.size).toBe(1);
    await act(() => root.render(null));
    expectStoreToHaveRoots(store, 0);
    expectNoPendingUpdates(store);
  });

  // @gate enableStore
  it('every reader of many stores commits the same version through interleaved urgent updates and transitions', async () => {
    const COUNT = 200;
    const stores = [];
    for (let i = 0; i < COUNT; i++) {
      stores.push(createStore(1));
    }
    // Two readers per store, in different subtrees.
    function Reader({store, id}) {
      return <Text text={id + ':' + use(store)} />;
    }
    const root = ReactNoop.createRoot();
    await act(() =>
      root.render(
        <>
          <div>
            {stores.map((s, i) => (
              <Reader key={i} store={s} id={'a' + i} />
            ))}
          </div>
          <div>
            {stores.map((s, i) => (
              <Reader key={i} store={s} id={'b' + i} />
            ))}
          </div>
        </>,
      ),
    );
    Scheduler.unstable_clearLog();
    await act(async () => {
      startTransition(() => stores.forEach(s => s.update(n => n * 10)));
      // Interrupt the transition partway through.
      await waitFor(['a0:10']);
      stores.forEach(s => s.update(n => n + 1));
      await waitFor(['a1:10', 'a2:10']);
      startTransition(() => stores.forEach(s => s.update(n => n + 2)));
    });
    Scheduler.unstable_clearLog();
    // In dispatch order: (1 * 10 + 1) + 2.
    const children = root.getChildren();
    children.forEach(div =>
      div.children.forEach(text => expect(text.text.split(':')[1]).toBe('13')),
    );
    stores.forEach(s => expectNoPendingUpdates(s));
  });
});

describe('review: readers mounting, unmounting and switching stores', () => {
  // @gate enableStore
  it('switching stores while the old one has a pending transition: same as useReducer', async () => {
    await compareWithUseReducer(async (createSource, checkpoint) => {
      const a = createSource('a0', basicReducer);
      const b = createSource('b0', basicReducer);
      let setWhich;
      function Reader() {
        const [which, _setWhich] = useState('a');
        setWhich = _setWhich;
        return <Text text={which === 'a' ? a.read() : b.read()} />;
      }
      const root = ReactNoop.createRoot();
      await act(() =>
        root.render(
          <a.Root>
            <b.Root>
              <Reader />
            </b.Root>
          </a.Root>,
        ),
      );
      checkpoint(root);
      await act(() => {
        startTransition(() => a.update('a1'));
        ReactNoop.flushSync(() => setWhich('b'));
      });
      checkpoint(root);
      await act(() => {
        startTransition(() => {
          b.update('b1');
          setWhich('a');
        });
        a.update(v => v + '!');
      });
      checkpoint(root);
      if (a.kind === 'store') {
        expectStoreToHaveRoots(b.store, 0);
        expectNoPendingUpdates(a.store);
        expectNoPendingUpdates(b.store);
      }
    });
  });

  // @gate enableStore
  it('a reader that switches stores in a transition that is interrupted keeps its old subscription', async () => {
    const a = createStore('a0');
    const b = createStore('b0');
    let setWhich;
    function Reader() {
      const [which, _setWhich] = useState('a');
      setWhich = _setWhich;
      return <Text text={which === 'a' ? use(a) : use(b)} />;
    }
    function Sibling({text}) {
      return <Text text={text} />;
    }
    const root = ReactNoop.createRoot();
    await act(() =>
      root.render(
        <>
          <Reader />
          <Sibling text="x" />
        </>,
      ),
    );
    assertLog(['a0', 'x']);
    await act(async () => {
      startTransition(() => setWhich('b'));
      await waitFor(['b0']);
      // Interrupt before the transition commits.
      ReactNoop.flushSync(() => a.update('a1'));
      assertLog(['a1']);
    });
    assertLog(['b0']);
    expectStoreToHaveRoots(a, 0);
    await act(() => a.update('a2'));
    assertLog([]);
    await act(() => b.update('b1'));
    assertLog(['b1']);
  });
});

describe('review: StrictMode, more', () => {
  // @gate enableStore
  it('double invokes the reducer once when a reader in StrictMode reads before a reader outside it', async () => {
    const store = createStore(0, (state, action) => {
      Scheduler.log('reducer');
      return state + action;
    });
    function Reader({name}) {
      return <Text text={name + ': ' + use(store)} />;
    }
    const root = ReactNoop.createRoot();
    await act(() =>
      root.render(
        <>
          <StrictMode>
            <Reader name="Strict" />
          </StrictMode>
          <Reader name="Loose" />
        </>,
      ),
    );
    assertLog(['Strict: 0', 'Loose: 0']);
    await act(() => {
      startTransition(() => store.update(1));
      store.update(10);
    });
    if (__DEV__) {
      assertLog([
        // The eager state of the transition update, at dispatch.
        'reducer',
        // Urgent render: 10 applied (skipping 1), plus the replay.
        'reducer',
        'reducer',
        'Strict: 10',
        'Loose: 10',
        // Transition: 1 reuses its eager state, 10 is rebased, plus the
        // replay of both.
        'reducer',
        'reducer',
        'reducer',
        'Strict: 11',
        'Loose: 11',
      ]);
    } else {
      assertLog([
        'reducer',
        'reducer',
        'Strict: 10',
        'Loose: 10',
        'reducer',
        'Strict: 11',
        'Loose: 11',
      ]);
    }
  });
});

describe('review: effects that update stores', () => {
  // @gate enableStore
  it('a passive effect that updates the store it reads on every commit: same as useReducer (bounded)', async () => {
    await compareWithUseReducer(async (createSource, checkpoint) => {
      const source = createSource(0, basicReducer);
      function Child() {
        const value = source.read();
        useEffect(() => {
          if (value < 80) {
            source.update(value + 1);
          }
        });
        return <Text text={value} />;
      }
      const root = ReactNoop.createRoot();
      await act(() =>
        root.render(
          <source.Root>
            <Child />
          </source.Root>,
        ),
      );
      checkpoint(root);
    });
  });

  // @gate enableStore
  it('an update in an insertion effect is rendered like a layout effect update', async () => {
    const store = createStore(0);
    function Child() {
      const value = use(store);
      React.useInsertionEffect(() => {
        if (value === 0) {
          store.update(1);
        }
      });
      return <Text text={value} />;
    }
    const root = ReactNoop.createRoot();
    await act(() => root.render(<Child />));
    // Same warning as setState in an insertion effect.
    assertConsoleErrorDev([
      'useInsertionEffect must not schedule updates.\n    in Child (at **)',
    ]);
    Scheduler.unstable_clearLog();
    expect(root).toMatchRenderedOutput('1');
    expectNoPendingUpdates(store);
  });
});

describe('review: readers that throw because of the value', () => {
  ['urgent', 'transition'].forEach(mode => {
    // @gate enableStore
    it(`a reader that throws for the new value of a ${mode} update: same as useReducer`, async () => {
      await compareWithUseReducer(async (createSource, checkpoint) => {
        const source = createSource(0, basicReducer);
        function Reader({name}) {
          const value = source.read();
          if (value === 2) {
            throw new Error('Two');
          }
          return <Text text={name + ': ' + value} />;
        }
        const root = createRootLoggingErrors();
        await act(() =>
          root.render(
            <source.Root>
              <ErrorBoundary key="1">
                <Reader name="A" />
              </ErrorBoundary>
              <ErrorBoundary key="b">
                <Reader name="B" />
              </ErrorBoundary>
            </source.Root>,
          ),
        );
        checkpoint(root);
        const update = action =>
          mode === 'urgent'
            ? source.update(action)
            : startTransition(() => source.update(action));
        await act(() => update(2));
        checkpoint(root);
        // Reset the first boundary while the value is still 2.
        await act(() =>
          root.render(
            <source.Root>
              <ErrorBoundary key="2">
                <Reader name="A" />
              </ErrorBoundary>
              <ErrorBoundary key="b">
                <Reader name="B" />
              </ErrorBoundary>
            </source.Root>,
          ),
        );
        checkpoint(root);
        await act(() => update(3));
        checkpoint(root);
        await act(() =>
          root.render(
            <source.Root>
              <ErrorBoundary key="3">
                <Reader name="A" />
              </ErrorBoundary>
              <ErrorBoundary key="b2">
                <Reader name="B" />
              </ErrorBoundary>
            </source.Root>,
          ),
        );
        checkpoint(root);
      });
    });
  });
});

describe('review: reducer errors across roots', () => {
  // A reducer that only accepts 'next' after 'ready', like the one in
  // "reducer errors to follow up on".
  function reducer(state, action) {
    if (action === 'next' && state !== 'ready' && state !== 'next') {
      throw new Error('Not ready');
    }
    if (typeof action === 'function') {
      return action(state);
    }
    return action;
  }

  // @gate enableStore
  it('roots converge once idle after an urgent update that only throws in the root where the transition is still pending', async () => {
    const store = createStore('initial', reducer);
    function Reader({name}) {
      return <Text text={name + ': ' + use(store)} />;
    }
    let resolve;
    const data = new Promise(r => {
      resolve = r;
    });
    function Page() {
      return <Text text={'Page: ' + use(data)} />;
    }
    const rootA = ReactNoop.createRoot();
    const rootB = ReactNoop.createRoot();
    const boundaryA = key => (
      <ErrorBoundary key={key}>
        <Reader name="A" />
      </ErrorBoundary>
    );
    await act(() => {
      rootA.render(boundaryA('1'));
      rootB.render(<Reader name="B" />);
    });
    assertLog(['A: initial', 'B: initial']);

    // Root B commits the transition. Root A's part of it waits on data.
    await act(() => {
      startTransition(() => {
        store.update('ready');
        rootA.render(
          <>
            {boundaryA('1')}
            <Page />
          </>,
        );
      });
    });
    assertLog(['A: ready', 'B: ready']);
    expect(rootB).toMatchRenderedOutput('B: ready');
    expect(rootA).toMatchRenderedOutput('A: initial');

    // Valid in dispatch order, and in root B, where 'ready' committed.
    await act(() => store.update('next'));
    Scheduler.unstable_clearLog();
    expect(rootB).toMatchRenderedOutput('B: next');

    await act(() => resolve('loaded'));
    Scheduler.unstable_clearLog();
    assertConsoleErrorDev([], {withoutStack: true});

    // Idle. Every root should show every action applied in dispatch order.
    await act(() =>
      rootA.render(
        <>
          {boundaryA('2')}
          <Page />
        </>,
      ),
    );
    Scheduler.unstable_clearLog();
    await act(() => store.update(v => v + '!'));
    Scheduler.unstable_clearLog();
    const rootC = ReactNoop.createRoot();
    await act(() => rootC.render(<Reader name="C" />));
    Scheduler.unstable_clearLog();
    expect([
      rootA.getChildrenAsJSX(),
      rootB.getChildrenAsJSX(),
      rootC.getChildrenAsJSX(),
    ]).toEqual(['A: next!Page: loaded', 'B: next!', 'C: next!']);
  });
});

describe('review: reads around a suspended use()', () => {
  // @gate enableStore
  it('a component replayed after use(promise) subscribes to each store once', async () => {
    const a = createStore('a0');
    const b = createStore('b0');
    let resolve;
    const promise = new Promise(r => {
      resolve = r;
    });
    function Reader() {
      const first = use(a);
      const data = use(promise);
      return <Text text={first + use(a) + use(b) + data} />;
    }
    const root = ReactNoop.createRoot();
    await act(() =>
      root.render(
        <Suspense fallback={<Text text="Loading" />}>
          <Reader />
        </Suspense>,
      ),
    );
    assertLog(['Loading']);
    await act(() => resolve('!'));
    assertLog(['a0a0b0!']);
    expect(a._records[0].readers.size).toBe(1);
    expect(b._records[0].readers.size).toBe(1);
    await act(() => a.update('a1'));
    assertLog(['a1a1b0!']);
    await act(() => b.update('b1'));
    assertLog(['a1a1b1!']);
    await act(() => root.render(null));
    expectStoreToHaveRoots(a, 0);
    expectStoreToHaveRoots(b, 0);
  });
});
