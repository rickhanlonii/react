/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 */
'use strict';

// Review of use(store) against Suspense, Activity and hidden trees.

let React;
let ReactNoop;
let Scheduler;
let act;
let use;
let useState;
let useEffect;
let useLayoutEffect;
let useInsertionEffect;
let useReducer;
let createContext;
let startTransition;
let Suspense;
let Activity;
let memo;
let assertLog;
let assertConsoleErrorDev;
let waitForAll;
let waitForPaint;
let createStore;
let textCache;

const originalReportError = global.reportError;

beforeEach(() => {
  jest.resetModules();
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
  useInsertionEffect = React.useInsertionEffect;
  useReducer = React.useReducer;
  createContext = React.createContext;
  startTransition = React.startTransition;
  Suspense = React.Suspense;
  Activity = React.Activity;
  memo = React.memo;
  createStore = React.unstable_createStore;

  const InternalTestUtils = require('internal-test-utils');
  act = InternalTestUtils.act;
  assertLog = InternalTestUtils.assertLog;
  assertConsoleErrorDev = InternalTestUtils.assertConsoleErrorDev;
  waitForAll = InternalTestUtils.waitForAll;
  waitForPaint = InternalTestUtils.waitForPaint;

  textCache = new Map();
});

afterEach(() => {
  global.reportError = originalReportError;
  assertLog([]);
});

function expectStoreToHaveRoots(store, count) {
  expect(store._records.length).toBe(count);
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

function fulfilled(value) {
  return {status: 'fulfilled', value, then() {}};
}

const never = {then() {}};

describe('nested boundaries in renders that keep rendering siblings', () => {
  // An Offscreen-lane render doesn't skip the siblings of a component that
  // suspends. The outer boundary's reads must survive a nested boundary
  // suspending after them.

  // @gate enableStore
  it('a store update retries an outer boundary in a hidden Activity when a nested boundary also suspends', async () => {
    const outer = createStore(never);
    const inner = createStore(never);

    function OuterReader() {
      return <Text text={'Outer: ' + use(use(outer))} />;
    }
    function InnerReader() {
      return <Text text={'Inner: ' + use(use(inner))} />;
    }

    const content = (
      <Suspense fallback={<Text text="Loading outer" />}>
        <OuterReader />
        <Suspense fallback={<Text text="Loading inner" />}>
          <InnerReader />
        </Suspense>
      </Suspense>
    );

    let setMode;
    function App() {
      const [mode, _setMode] = useState('hidden');
      setMode = _setMode;
      return <Activity mode={mode}>{content}</Activity>;
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<App />));
    assertLog(['Loading inner', 'Loading outer']);

    // The outer reader's store gets a value. Without Activity, this retries
    // the outer boundary.
    await act(() => outer.update(fulfilled('A')));
    // It retries in the background, like the context version below.
    assertLog(['Outer: A', 'Loading inner']);
    await act(() => setMode('visible'));
    assertLog([]);
    expect(root).toMatchRenderedOutput('Outer: ALoading inner');
  });

  // Diagnosis: when the nested boundary's suspended reader doesn't read a
  // store, it doesn't overwrite the outer boundary's collected reads, and the
  // outer boundary retries.
  // @gate enableStore
  it('diagnosis: a hidden outer boundary retries when the nested suspender reads no store', async () => {
    const outer = createStore(never);

    function OuterReader() {
      return <Text text={'Outer: ' + use(use(outer))} />;
    }
    function InnerSuspender() {
      return <Text text={'Inner: ' + use(never)} />;
    }

    const content = (
      <Suspense fallback={<Text text="Loading outer" />}>
        <OuterReader />
        <Suspense fallback={<Text text="Loading inner" />}>
          <InnerSuspender />
        </Suspense>
      </Suspense>
    );

    let setMode;
    function App() {
      const [mode, _setMode] = useState('hidden');
      setMode = _setMode;
      return <Activity mode={mode}>{content}</Activity>;
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<App />));
    assertLog(['Loading inner', 'Loading outer']);

    await act(() => outer.update(fulfilled('A')));
    assertLog(['Outer: A', 'Loading inner']);
    await act(() => setMode('visible'));
    assertLog([]);
    expect(root).toMatchRenderedOutput('Outer: ALoading inner');
  });

  // The same tree without Activity: the outer boundary retries.
  // @gate enableStore
  it('control: without Activity, a store update retries the outer boundary', async () => {
    const outer = createStore(never);
    const inner = createStore(never);

    function OuterReader() {
      return <Text text={'Outer: ' + use(use(outer))} />;
    }
    function InnerReader() {
      return <Text text={'Inner: ' + use(use(inner))} />;
    }

    const root = ReactNoop.createRoot();
    await act(() =>
      root.render(
        <Suspense fallback={<Text text="Loading outer" />}>
          <OuterReader />
          <Suspense fallback={<Text text="Loading inner" />}>
            <InnerReader />
          </Suspense>
        </Suspense>,
      ),
    );
    assertLog(['Loading outer', 'Loading inner']);

    await act(() => outer.update(fulfilled('A')));
    assertLog(['Outer: A', 'Loading inner']);
    expect(root).toMatchRenderedOutput('Outer: ALoading inner');
  });

  // The context oracle: the same tree with the promise in context.
  it('oracle: context retries the outer boundary in a hidden Activity', async () => {
    const OuterContext = createContext(never);
    const InnerContext = createContext(never);

    function OuterReader() {
      return <Text text={'Outer: ' + use(use(OuterContext))} />;
    }
    function InnerReader() {
      return <Text text={'Inner: ' + use(use(InnerContext))} />;
    }

    const content = (
      <Suspense fallback={<Text text="Loading outer" />}>
        <OuterReader />
        <Suspense fallback={<Text text="Loading inner" />}>
          <InnerReader />
        </Suspense>
      </Suspense>
    );

    let setOuter;
    let setMode;
    function App() {
      const [mode, _setMode] = useState('hidden');
      const [outerValue, _setOuter] = useState(never);
      setMode = _setMode;
      setOuter = _setOuter;
      return (
        <OuterContext.Provider value={outerValue}>
          <Activity mode={mode}>{content}</Activity>
        </OuterContext.Provider>
      );
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<App />));
    assertLog(['Loading inner', 'Loading outer']);

    await act(() => setOuter(fulfilled('A')));
    assertLog(['Outer: A', 'Loading inner']);
    await act(() => setMode('visible'));
    assertLog([]);
    expect(root).toMatchRenderedOutput('Outer: ALoading inner');
  });
});

describe('SuspenseList', () => {
  function renderList(root, SuspenseList, revealOrder, Row) {
    return act(() =>
      root.render(
        <SuspenseList
          revealOrder={revealOrder}
          tail={revealOrder === 'together' ? undefined : 'visible'}>
          <Suspense fallback={<Text text="Loading A" />}>
            <Row />
          </Suspense>
          <Suspense fallback={<Text text="Loading B" />}>
            <Text text="B" />
          </Suspense>
        </SuspenseList>,
      ),
    );
  }

  // @gate enableStore && enableSuspenseList
  it('a store update retries a row of a "together" list whose reader suspended on mount', async () => {
    const SuspenseList = React.unstable_SuspenseList;
    const store = createStore(never);
    function Row() {
      return <Text text={'A: ' + use(use(store))} />;
    }

    const root = ReactNoop.createRoot();
    await renderList(root, SuspenseList, 'together', Row);
    assertLog(['Loading A', 'B', 'Loading A', 'Loading B']);
    expect(root).toMatchRenderedOutput('Loading ALoading B');

    await act(() => store.update(fulfilled('Result')));
    assertLog(['A: Result', 'B']);
    expect(root).toMatchRenderedOutput('A: ResultB');
  });

  // @gate enableSuspenseList
  it('oracle: a context update retries a row of a "together" list', async () => {
    const SuspenseList = React.unstable_SuspenseList;
    const Context = createContext(never);
    function Row() {
      return <Text text={'A: ' + use(use(Context))} />;
    }
    let setValue;
    function App() {
      const [value, _setValue] = useState(never);
      setValue = _setValue;
      return (
        <Context.Provider value={value}>
          <SuspenseList revealOrder="together">
            <Suspense fallback={<Text text="Loading A" />}>
              <Row />
            </Suspense>
            <Suspense fallback={<Text text="Loading B" />}>
              <Text text="B" />
            </Suspense>
          </SuspenseList>
        </Context.Provider>
      );
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<App />));
    assertLog(['Loading A', 'B', 'Loading A', 'Loading B']);

    await act(() => setValue(fulfilled('Result')));
    assertLog(['A: Result', 'B']);
    expect(root).toMatchRenderedOutput('A: ResultB');
  });

  // @gate enableStore && enableSuspenseList
  it('a store update retries a row of a "forwards" list whose reader suspended on mount', async () => {
    const SuspenseList = React.unstable_SuspenseList;
    const store = createStore(never);
    function Row() {
      return <Text text={'A: ' + use(use(store))} />;
    }

    const root = ReactNoop.createRoot();
    await renderList(root, SuspenseList, 'forwards', Row);
    assertLog(['Loading A', 'Loading B']);
    expect(root).toMatchRenderedOutput('Loading ALoading B');

    await act(() => store.update(fulfilled('Result')));
    assertLog(['A: Result', 'B']);
    expect(root).toMatchRenderedOutput('A: ResultB');
  });

  // A "forwards" list with a hidden tail drops a newly mounted row that
  // suspends, so its boundary never commits.
  // @gate enableStore && enableSuspenseList
  // FIXME(Q3): a row a forwards SuspenseList with a hidden tail drops doesn't subscribe. Undecided whether it's in scope for v1.
  it.skip('a store update retries a dropped row of a "forwards" list with a hidden tail', async () => {
    const SuspenseList = React.unstable_SuspenseList;
    const store = createStore(never);
    function Row() {
      return <Text text={'B: ' + use(use(store))} />;
    }

    const root = ReactNoop.createRoot();
    await act(() =>
      root.render(
        <SuspenseList revealOrder="forwards" tail="hidden">
          <Suspense fallback={<Text text="Loading A" />}>
            <Text text="A" />
          </Suspense>
          <Suspense fallback={<Text text="Loading B" />}>
            <Row />
          </Suspense>
        </SuspenseList>,
      ),
    );
    assertLog(['A', 'Loading B']);
    expect(root).toMatchRenderedOutput('A');

    await act(() => store.update(fulfilled('Result')));
    assertLog(['B: Result']);
    expect(root).toMatchRenderedOutput('AB: Result');
  });

  // @gate enableSuspenseList
  it('oracle: a context update retries a dropped row of a "forwards" list with a hidden tail', async () => {
    const SuspenseList = React.unstable_SuspenseList;
    const Context = createContext(never);
    function Row() {
      return <Text text={'B: ' + use(use(Context))} />;
    }
    let setValue;
    function App() {
      const [value, _setValue] = useState(never);
      setValue = _setValue;
      return (
        <Context.Provider value={value}>
          <SuspenseList revealOrder="forwards" tail="hidden">
            <Suspense fallback={<Text text="Loading A" />}>
              <Text text="A" />
            </Suspense>
            <Suspense fallback={<Text text="Loading B" />}>
              <Row />
            </Suspense>
          </SuspenseList>
        </Context.Provider>
      );
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<App />));
    assertLog(['A', 'Loading B']);
    expect(root).toMatchRenderedOutput('A');

    await act(() => setValue(fulfilled('Result')));
    // The Provider re-renders the whole list.
    assertLog(['A', 'B: Result']);
    expect(root).toMatchRenderedOutput('AB: Result');
  });
});

// Runs a scenario with a store, and with useReducer at the root passing the
// value through Context, the oracle for a single root. The tree is passed to
// the Provider as children, so only the components that read the value
// re-render in both versions.
function createHarness(kind, initial) {
  if (kind === 'store') {
    const store = createStore(initial);
    return {
      store,
      useValue: () => use(store),
      update: action => store.update(action),
      wrap: children => children,
    };
  }
  const Context = createContext(null);
  let dispatch;
  const reducer = (state, action) =>
    typeof action === 'function' ? action(state) : action;
  function Provider({children}) {
    const [value, _dispatch] = useReducer(reducer, initial);
    dispatch = _dispatch;
    return <Context.Provider value={value}>{children}</Context.Provider>;
  }
  return {
    store: null,
    useValue: () => use(Context),
    update: action => dispatch(action),
    wrap: children => <Provider>{children}</Provider>,
  };
}

// Store runs need the flag. The useReducer and Context runs work on every
// channel.
function storeIt(name, fn) {
  // @gate enableStore
  // eslint-disable-next-line jest/valid-title
  it(name, fn);
}

function itFor(kind) {
  return kind === 'store' ? storeIt : it;
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return {promise, resolve, reject};
}

function createErrorBoundary() {
  return class extends React.Component {
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
  };
}

['store', 'context'].forEach(kind => {
  describe('compared with useReducer and Context: ' + kind, () => {
    itFor(kind)(
      'a store update that arrives before the promise resolves',
      async () => {
        const h = createHarness(kind, 'A');
        function Reader() {
          return <AsyncText text={h.useValue()} />;
        }
        const root = ReactNoop.createRoot();
        await act(() =>
          root.render(
            h.wrap(
              <Suspense fallback={<Text text="Loading" />}>
                <Reader />
              </Suspense>,
            ),
          ),
        );
        assertLog(['Suspend! [A]', 'Loading', 'Suspend! [A]']);
        expect(root).toMatchRenderedOutput('Loading');

        await act(() => h.update('B'));
        // The retry, then the prerender.
        assertLog(['Suspend! [B]', 'Suspend! [B]']);
        expect(root).toMatchRenderedOutput('Loading');

        // The old promise resolves. The boundary retries with the new value.
        await act(() => resolveText('A'));
        assertLog(['Suspend! [B]', 'Suspend! [B]']);
        expect(root).toMatchRenderedOutput('Loading');

        await act(() => resolveText('B'));
        assertLog(['B']);
        expect(root).toMatchRenderedOutput('B');
      },
    );

    itFor(kind)(
      'a promise in the store: swap, resolve the old one, resolve and reject the new one',
      async () => {
        const first = createDeferred();
        const h = createHarness(kind, first.promise);
        const Boundary = createErrorBoundary();
        function Reader() {
          return <Text text={use(h.useValue())} />;
        }
        const root = ReactNoop.createRoot();
        await act(() =>
          root.render(
            h.wrap(
              <Boundary>
                <Suspense fallback={<Text text="Loading" />}>
                  <Reader />
                </Suspense>
              </Boundary>,
            ),
          ),
        );
        assertLog(['Loading']);

        const second = createDeferred();
        await act(() => h.update(second.promise));
        assertLog([]);
        await act(() => first.resolve('First'));
        assertLog([]);
        expect(root).toMatchRenderedOutput('Loading');

        await act(() => second.resolve('Second'));
        assertLog(['Second']);
        expect(root).toMatchRenderedOutput('Second');

        // A new promise suspends the committed reader, then rejects.
        const third = createDeferred();
        await act(() => h.update(third.promise));
        assertLog(['Loading']);
        expect(root).toMatchRenderedOutput('Loading');
        await act(() => third.reject(new Error('Rejected')));
        assertLog(['Caught: Rejected', 'Caught: Rejected']);
        expect(root).toMatchRenderedOutput('Caught: Rejected');
      },
    );

    itFor(kind)(
      'a store update reveals content without waiting for the fallback throttle',
      async () => {
        const h = createHarness(kind, 'A');
        function Reader() {
          return <AsyncText text={h.useValue()} />;
        }
        const root = ReactNoop.createRoot();
        await act(() =>
          root.render(
            h.wrap(
              <Suspense fallback={<Text text="Loading" />}>
                <Reader />
              </Suspense>,
            ),
          ),
        );
        assertLog(['Suspend! [A]', 'Loading', 'Suspend! [A]']);
        resolveText('B');
        await act(async () => {
          h.update('B');
          await waitForAll(['B']);
          // A default update isn't a retry, so it isn't throttled.
          expect(root).toMatchRenderedOutput('B');
        });
      },
    );

    itFor(kind)(
      'a parent inside the boundary reads the store and passes the promise down',
      async () => {
        const h = createHarness(kind, never);
        function Child({promise}) {
          return <Text text={use(promise)} />;
        }
        function Parent() {
          return <Child promise={h.useValue()} />;
        }
        const root = ReactNoop.createRoot();
        await act(() =>
          root.render(
            h.wrap(
              <Suspense fallback={<Text text="Loading" />}>
                <Parent />
              </Suspense>,
            ),
          ),
        );
        assertLog(['Loading']);
        await act(() => h.update(fulfilled('Result')));
        assertLog(['Result']);
        expect(root).toMatchRenderedOutput('Result');
      },
    );

    itFor(kind)(
      'a reader that mounts hidden renders updates in the background, and its effects see the latest value on reveal',
      async () => {
        const h = createHarness(kind, 'A');
        function Reader() {
          const value = h.useValue();
          useLayoutEffect(() => {
            Scheduler.log('Layout: ' + value);
          });
          useEffect(() => {
            Scheduler.log('Passive: ' + value);
          });
          return <Text text={'Reader: ' + value} />;
        }
        const tree = <Reader />;
        let setMode;
        function App() {
          const [mode, _setMode] = useState('hidden');
          setMode = _setMode;
          return <Activity mode={mode}>{tree}</Activity>;
        }
        const root = ReactNoop.createRoot();
        await act(() => root.render(h.wrap(<App />)));
        // Effects don't mount while hidden.
        assertLog(['Reader: A']);

        await act(() => h.update('B'));
        assertLog(['Reader: B']);

        await act(() => setMode('visible'));
        assertLog(['Layout: B', 'Passive: B']);
        expect(root).toMatchRenderedOutput('Reader: B');

        await act(() => setMode('hidden'));
        assertLog([]);
        await act(() => h.update('C'));
        assertLog(['Reader: C']);
        await act(() => setMode('visible'));
        assertLog(['Layout: C', 'Passive: C']);
        expect(root).toMatchRenderedOutput('Reader: C');
      },
    );

    itFor(kind)(
      'a store update between the visible commit and the hidden render',
      async () => {
        const h = createHarness(kind, 'A');
        function Reader({name}) {
          return <Text text={name + ': ' + h.useValue()} />;
        }
        const root = ReactNoop.createRoot();
        await act(async () => {
          root.render(
            h.wrap(
              <>
                <Reader name="Visible" />
                <Activity mode="hidden">
                  <Reader name="Hidden" />
                </Activity>
              </>,
            ),
          );
          await waitForPaint(['Visible: A']);
          h.update('B');
        });
        assertLog(['Visible: B', 'Hidden: B']);
      },
    );

    itFor(kind)(
      'a reader that starts and stops reading while hidden',
      async () => {
        const h = createHarness(kind, 'A');
        function Maybe({read}) {
          if (read) {
            return <Text text={'Reading: ' + h.useValue()} />;
          }
          return <Text text="Not reading" />;
        }
        let setRead;
        let setMode;
        function App() {
          const [read, _setRead] = useState(false);
          const [mode, _setMode] = useState('visible');
          setRead = _setRead;
          setMode = _setMode;
          return (
            <Activity mode={mode}>
              <Maybe read={read} />
            </Activity>
          );
        }
        const root = ReactNoop.createRoot();
        await act(() => root.render(h.wrap(<App />)));
        assertLog(['Not reading']);
        await act(() => setMode('hidden'));
        assertLog(['Not reading']);

        await act(() => setRead(true));
        assertLog(['Reading: A']);
        await act(() => h.update('B'));
        assertLog(['Reading: B']);

        await act(() => setRead(false));
        assertLog(['Not reading']);
        await act(() => h.update('C'));
        assertLog([]);

        await act(() => setMode('visible'));
        assertLog(['Not reading']);
        await act(() => setRead(true));
        assertLog(['Reading: C']);
      },
    );

    itFor(kind)('nested Activity', async () => {
      const h = createHarness(kind, 'A');
      function Reader({name}) {
        return <Text text={name + ': ' + h.useValue()} />;
      }
      const inner = <Reader name="Inner" />;
      let setInner;
      function Inner() {
        const [mode, _setMode] = useState('hidden');
        setInner = _setMode;
        return <Activity mode={mode}>{inner}</Activity>;
      }
      const outer = (
        <>
          <Reader name="Middle" />
          <Inner />
        </>
      );
      let setOuter;
      function App() {
        const [mode, _setMode] = useState('hidden');
        setOuter = _setMode;
        return <Activity mode={mode}>{outer}</Activity>;
      }
      const root = ReactNoop.createRoot();
      await act(() => root.render(h.wrap(<App />)));
      assertLog(['Middle: A', 'Inner: A']);

      await act(() => h.update('B'));
      assertLog(['Middle: B', 'Inner: B']);

      await act(() => setOuter('visible'));
      assertLog([]);
      expect(root).toMatchRenderedOutput('Middle: B');

      await act(async () => {
        h.update('C');
        await waitForPaint(['Middle: C']);
      });
      assertLog(['Inner: C']);

      await act(() => setInner('visible'));
      assertLog([]);
      expect(root).toMatchRenderedOutput('Middle: CInner: C');
    });

    itFor(kind)(
      'a boundary waiting on the store is hidden, the store resolves, then it is revealed',
      async () => {
        const h = createHarness(kind, never);
        function Reader() {
          return <Text text={use(h.useValue())} />;
        }
        const tree = (
          <Suspense fallback={<Text text="Loading" />}>
            <Reader />
          </Suspense>
        );
        let setMode;
        function App() {
          const [mode, _setMode] = useState('visible');
          setMode = _setMode;
          return <Activity mode={mode}>{tree}</Activity>;
        }
        const root = ReactNoop.createRoot();
        await act(() => root.render(h.wrap(<App />)));
        assertLog(['Loading']);
        await act(() => setMode('hidden'));
        assertLog([]);
        await act(() => h.update(fulfilled('Result')));
        assertLog(['Result']);
        await act(() => setMode('visible'));
        assertLog([]);
        expect(root).toMatchRenderedOutput('Result');
      },
    );

    itFor(kind)(
      'a transition update to a reader in a suspended boundary commits with the rest of the transition',
      async () => {
        const h = createHarness(kind, 'A');
        function Reader() {
          return <AsyncText text={h.useValue()} />;
        }
        function Other() {
          return <Text text={'Other: ' + h.useValue()} />;
        }
        resolveText('A');
        const root = ReactNoop.createRoot();
        await act(() =>
          root.render(
            h.wrap(
              <>
                <Other />
                <Suspense fallback={<Text text="Loading" />}>
                  <Reader />
                </Suspense>
              </>,
            ),
          ),
        );
        assertLog(['Other: A', 'A']);

        // The transition suspends on B, so it doesn't commit, and the other
        // reader keeps showing A.
        await act(() => startTransition(() => h.update('B')));
        assertLog(['Other: B', 'Suspend! [B]', 'Loading']);
        expect(root).toMatchRenderedOutput('Other: AA');

        await act(() => resolveText('B'));
        assertLog(['Other: B', 'B']);
        expect(root).toMatchRenderedOutput('Other: BB');
      },
    );

    itFor(kind)(
      'a sync update while a transition is suspended on the reader',
      async () => {
        const h = createHarness(kind, 'A');
        function Reader() {
          return <AsyncText text={h.useValue()} />;
        }
        resolveText('A');
        resolveText('AC');
        const root = ReactNoop.createRoot();
        await act(() =>
          root.render(
            h.wrap(
              <Suspense fallback={<Text text="Loading" />}>
                <Reader />
              </Suspense>,
            ),
          ),
        );
        assertLog(['A']);

        await act(() => startTransition(() => h.update(v => v + 'B')));
        assertLog(['Suspend! [AB]', 'Loading']);
        expect(root).toMatchRenderedOutput('A');

        // A sync update renders on top of the committed value, and the
        // transition is rebased on top of it.
        await act(() => ReactNoop.flushSync(() => h.update(v => v + 'C')));
        assertLog(['AC', 'Suspend! [ABC]', 'Loading']);
        expect(root).toMatchRenderedOutput('AC');

        await act(() => resolveText('ABC'));
        assertLog(['ABC']);
        expect(root).toMatchRenderedOutput('ABC');
      },
    );
  });
});

function expectNoPendingUpdates(store) {
  expect(store._headQueue).toBe(null);
  expect(store._pendingTransitionUpdates).toBe(null);
}

describe('store specific', () => {
  // @gate enableStore
  it('unmounting a hidden reader releases the root', async () => {
    const store = createStore('A');
    function Reader() {
      return <Text text={'Reader: ' + use(store)} />;
    }
    let setShow;
    function App() {
      const [show, _setShow] = useState(true);
      setShow = _setShow;
      return <Activity mode="hidden">{show ? <Reader /> : null}</Activity>;
    }
    const root = ReactNoop.createRoot();
    await act(() => root.render(<App />));
    assertLog(['Reader: A']);
    expectStoreToHaveRoots(store, 1);

    await act(() => setShow(false));
    expectStoreToHaveRoots(store, 0);
    await act(() => store.update('B'));
    assertLog([]);
  });

  // @gate enableStore
  it('deleting a hidden Activity whose boundary waits on a store releases the root', async () => {
    const store = createStore(never);
    function Reader() {
      return <Text text={use(use(store))} />;
    }
    let setMode;
    let setShow;
    function App() {
      const [mode, _setMode] = useState('visible');
      const [show, _setShow] = useState(true);
      setMode = _setMode;
      setShow = _setShow;
      return show ? (
        <Activity mode={mode}>
          <Suspense fallback={<Text text="Loading" />}>
            <Reader />
          </Suspense>
        </Activity>
      ) : null;
    }
    const root = ReactNoop.createRoot();
    await act(() => root.render(<App />));
    assertLog(['Loading']);
    await act(() => setMode('hidden'));
    assertLog(['Loading']);
    expectStoreToHaveRoots(store, 1);
    await act(() => setShow(false));
    expectStoreToHaveRoots(store, 0);
  });

  // @gate enableStore
  it('a boundary unsubscribes once its content commits', async () => {
    const store = createStore(never);
    function Reader() {
      return <Text text={use(use(store))} />;
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
    const record = store._records[0];
    // Only the boundary.
    expect(record.readers.size).toBe(1);
    const boundary = Array.from(record.readers)[0];
    expect(boundary.tag).toBe(13);

    await act(() => store.update(fulfilled('Result')));
    assertLog(['Result']);
    // Only the reader.
    expect(record.readers.size).toBe(1);
    expect(Array.from(record.readers)[0].tag).toBe(0);
  });

  // @gate enableStore
  it('a prerendered sibling that never commits does not keep the root', async () => {
    const store = createStore('A');
    function Reader() {
      return <Text text={'Reader: ' + use(store)} />;
    }
    const root = ReactNoop.createRoot();
    await act(() =>
      root.render(
        <Suspense fallback={<Text text="Loading" />}>
          <AsyncText text="Data" />
          <Reader />
        </Suspense>,
      ),
    );
    assertLog(['Suspend! [Data]', 'Loading', 'Suspend! [Data]', 'Reader: A']);
    // The prerender created a record, but nothing subscribed to it, so the
    // commit after the prerender dropped it.
    expectStoreToHaveRoots(store, 0);

    // So a transition update is held, and done at the end of the event.
    await act(() => startTransition(() => store.update('B')));
    assertLog([]);
    expectStoreToHaveRoots(store, 0);

    await act(() => resolveText('Data'));
    assertLog(['Data', 'Reader: B']);
    expect(root).toMatchRenderedOutput('DataReader: B');
    expectNoPendingUpdates(store);

    await act(() => root.render(null));
    expectStoreToHaveRoots(store, 0);
  });

  // A pending transition keeps React from rendering hidden trees, so this
  // uses an async action, which keeps nothing pending on the root while it
  // waits.
  // @gate enableStore
  it('a reader that mounts hidden while an async action with a held update is pending', async () => {
    const store = createStore('A');
    function Reader() {
      return <Text text={'Hidden: ' + use(store)} />;
    }
    let setShow;
    function App() {
      const [show, _setShow] = useState(false);
      setShow = _setShow;
      return (
        <>
          <Text text="Visible" />
          <Activity mode="hidden">{show ? <Reader /> : null}</Activity>
        </>
      );
    }
    const root = ReactNoop.createRoot();
    await act(() => root.render(<App />));
    assertLog(['Visible']);

    const action = createDeferred();
    await act(() =>
      startTransition(async () => {
        store.update('B');
        await action.promise;
      }),
    );
    assertLog([]);
    expect(store._pendingTransitionUpdates).not.toBe(null);

    // The reader mounts in an Offscreen render while the action is pending.
    // It must not render the action's update until the action is done.
    await act(() => setShow(true));
    assertLog(['Visible', 'Hidden: A']);

    await act(() => action.resolve());
    assertLog(['Hidden: B']);
    expectNoPendingUpdates(store);
  });

  // @gate enableStore
  it('an insertion effect in a hidden tree updates a store a visible component reads', async () => {
    const store = createStore('A');
    function Reader() {
      return <Text text={'Reader: ' + use(store)} />;
    }
    function Updater() {
      useInsertionEffect(() => {
        store.update('B');
      }, []);
      return <Text text="Updater" />;
    }
    const root = ReactNoop.createRoot();
    await act(() =>
      root.render(
        <>
          <Reader />
          <Activity mode="hidden">
            <Updater />
          </Activity>
        </>,
      ),
    );
    // Same as useState: an update from an insertion effect warns.
    assertConsoleErrorDev([
      'useInsertionEffect must not schedule updates.\n' +
        '    in Updater (at **)',
    ]);
    assertLog(['Reader: A', 'Updater', 'Reader: B']);
    expect(root).toMatchRenderedOutput('Reader: B');
  });

  // @gate enableStore
  it('layout and passive effects in a hidden tree do not run, so their updates wait for the reveal', async () => {
    const store = createStore(0, (s, a) => s + a);
    function Reader() {
      return <Text text={'Reader: ' + use(store)} />;
    }
    function Updater() {
      useLayoutEffect(() => {
        store.update(1);
      }, []);
      useEffect(() => {
        store.update(10);
      }, []);
      return null;
    }
    const reader = <Reader />;
    const updater = <Updater />;
    let setMode;
    function App() {
      const [mode, _setMode] = useState('hidden');
      setMode = _setMode;
      return (
        <>
          {reader}
          <Activity mode={mode}>{updater}</Activity>
        </>
      );
    }
    const root = ReactNoop.createRoot();
    await act(() => root.render(<App />));
    assertLog(['Reader: 0']);
    await act(() => setMode('visible'));
    assertLog(['Reader: 11']);
    // Revealing the tree again mounts its effects again.
    await act(() => setMode('hidden'));
    assertLog([]);
    await act(() => setMode('visible'));
    assertLog(['Reader: 22']);
  });

  // @gate enableStore
  it('a boundary switches to the store its retried reader suspends on', async () => {
    const first = createStore(never);
    const second = createStore(never);
    const which = createStore('first');
    function Reader() {
      const store = use(which) === 'first' ? first : second;
      return <Text text={use(use(store))} />;
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

    await act(() => which.update('second'));
    assertLog([]);
    expect(root).toMatchRenderedOutput('Loading');

    // The boundary no longer waits on the first store.
    await act(() => first.update(fulfilled('First')));
    assertLog([]);
    expectStoreToHaveRoots(first, 0);

    await act(() => second.update(fulfilled('Second')));
    assertLog(['Second']);
    expect(root).toMatchRenderedOutput('Second');
  });

  // @gate enableStore
  it('a store of stores in a suspended tree', async () => {
    const inner = createStore(never);
    const outer = createStore(inner);
    function Reader() {
      return <Text text={use(use(use(outer)))} />;
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
    await act(() => inner.update(fulfilled('Inner')));
    assertLog(['Inner']);

    const replacement = createStore(never);
    await act(() => outer.update(replacement));
    assertLog(['Loading']);
    await act(() => replacement.update(fulfilled('Replacement')));
    assertLog(['Replacement']);
    expect(root).toMatchRenderedOutput('Replacement');
  });

  // @gate enableStore
  it('reads in a loop, where one store suspends', async () => {
    const stores = [createStore('a'), createStore(never), createStore('c')];
    function Reader() {
      return (
        <Text
          text={stores
            .map(s => use(s))
            .map(v => (typeof v === 'string' ? v : use(v)))
            .join('')}
        />
      );
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
    // Every store the reader read before it suspended retries the boundary.
    await act(() => stores[2].update('C'));
    assertLog([]);
    await act(() => stores[1].update(fulfilled('b')));
    assertLog(['abC']);
  });
});

['store', 'context'].forEach(kind => {
  describe(
    'async actions and hidden readers, compared with useReducer and Context: ' +
      kind,
    () => {
      itFor(kind)(
        'an async action does not commit its update early when every reader is hidden',
        async () => {
          const h = createHarness(kind, 'A');
          const Reader = memo(function Reader({name}) {
            return <Text text={name + ': ' + h.useValue()} />;
          });
          let setMode;
          let setShowLate;
          function App() {
            const [mode, _setMode] = useState('hidden');
            const [showLate, _setShowLate] = useState(false);
            setMode = _setMode;
            setShowLate = _setShowLate;
            return (
              <>
                <Activity mode={mode}>
                  <span>
                    <Reader name="Hidden" />
                  </span>
                </Activity>
                {showLate ? <Reader name="Late" /> : null}
              </>
            );
          }
          const root = ReactNoop.createRoot();
          // The output after each step, compared at the end so a failure shows
          // every step.
          const outputs = [];
          const snapshot = () => {
            Scheduler.unstable_clearLog();
            outputs.push(root.getChildrenAsJSX());
          };
          await act(() => root.render(h.wrap(<App />)));
          assertLog(['Hidden: A']);

          const action = createDeferred();
          await act(() =>
            startTransition(async () => {
              h.update('B');
              await action.promise;
            }),
          );
          // Nothing commits the action's update while the action is pending.
          snapshot();

          // A reader that mounts urgently shows the committed value.
          await act(() => setShowLate(true));
          snapshot();

          // Revealing the hidden reader urgently shows the committed value too.
          await act(() => setMode('visible'));
          snapshot();

          await act(() => action.resolve());
          snapshot();
          expect(outputs).toEqual([
            <span hidden={true}>Hidden: A</span>,
            <>
              <span hidden={true}>Hidden: A</span>Late: A
            </>,
            <>
              <span>Hidden: A</span>Late: A
            </>,
            <>
              <span>Hidden: B</span>Late: B
            </>,
          ]);
        },
      );

      itFor(kind)(
        'an async action does not commit its update early when every reader is in a boundary showing its fallback',
        async () => {
          const h = createHarness(kind, 'A');
          const Reader = memo(function Reader({name}) {
            return <Text text={name + ': ' + h.useValue()} />;
          });
          let setSuspend;
          let setShowLate;
          function App() {
            const [suspend, _setSuspend] = useState(false);
            const [showLate, _setShowLate] = useState(false);
            setSuspend = _setSuspend;
            setShowLate = _setShowLate;
            return (
              <>
                <Suspense fallback={<Text text="Loading" />}>
                  <Reader name="Inside" />
                  {suspend ? <AsyncText text="Data" /> : null}
                </Suspense>
                {showLate ? <Reader name="Late" /> : null}
              </>
            );
          }
          const root = ReactNoop.createRoot();
          const outputs = [];
          const snapshot = () => {
            Scheduler.unstable_clearLog();
            outputs.push(root.getChildrenAsJSX());
          };
          await act(() => root.render(h.wrap(<App />)));
          Scheduler.unstable_clearLog();
          await act(() => setSuspend(true));
          snapshot();

          const action = createDeferred();
          await act(() =>
            startTransition(async () => {
              h.update('B');
              await action.promise;
            }),
          );
          snapshot();

          // A reader that mounts urgently shows the committed value.
          await act(() => setShowLate(true));
          snapshot();

          await act(() => action.resolve());
          snapshot();
          await act(() => resolveText('Data'));
          snapshot();
          expect(outputs).toEqual([
            'Loading',
            'Loading',
            'LoadingLate: A',
            'LoadingLate: B',
            'Inside: BDataLate: B',
          ]);
        },
      );

      itFor(kind)(
        'an async action whose update after await suspends a boundary that shows content',
        async () => {
          const h = createHarness(kind, 'A');
          const Reader = memo(function Reader() {
            return <AsyncText text={h.useValue()} />;
          });
          resolveText('A');
          const root = ReactNoop.createRoot();
          const outputs = [];
          const snapshot = () => {
            Scheduler.unstable_clearLog();
            outputs.push(root.getChildrenAsJSX());
          };
          await act(() =>
            root.render(
              h.wrap(
                <Suspense fallback={<Text text="Loading" />}>
                  <Reader />
                </Suspense>,
              ),
            ),
          );
          snapshot();

          const action = createDeferred();
          await act(() =>
            startTransition(async () => {
              h.update('B');
              await action.promise;
              startTransition(() => h.update(v => v + 'C'));
            }),
          );
          snapshot();
          await act(() => action.resolve());
          snapshot();
          await act(() => resolveText('BC'));
          snapshot();
          expect(outputs).toEqual(['A', 'A', 'A', 'BC']);
        },
      );
    },
  );
});

describe('update priorities with Suspense and Activity', () => {
  const priorities = {
    discrete: update => ReactNoop.flushSync(update),
    continuous: update =>
      ReactNoop.unstable_runWithPriority(
        require('react-reconciler/constants').ContinuousEventPriority,
        update,
      ),
    default: update => update(),
    transition: update => startTransition(update),
    idle: update => ReactNoop.idleUpdates(update),
    timer: update => setTimeout(update, 0),
  };
  Object.keys(priorities).forEach(name => {
    storeIt(
      name +
        ': a store update retries a waiting boundary and updates a hidden reader',
      async () => {
        const promises = createStore(never);
        const value = createStore('A');
        function Consumer() {
          return <Text text={'Consumer: ' + use(use(promises))} />;
        }
        function Hidden() {
          return <Text text={'Hidden: ' + use(value)} />;
        }
        const root = ReactNoop.createRoot();
        await act(() =>
          root.render(
            <>
              <Suspense fallback={<Text text="Loading" />}>
                <Consumer />
              </Suspense>
              <Activity mode="hidden">
                <Hidden />
              </Activity>
            </>,
          ),
        );
        assertLog(['Loading', 'Hidden: A']);

        await act(async () => {
          priorities[name](() => {
            promises.update(fulfilled('Result'));
            value.update('B');
          });
          if (name === 'timer') {
            jest.runAllTimers();
          }
        });
        assertLog(['Consumer: Result', 'Hidden: B']);
        expect(root).toMatchRenderedOutput('Consumer: Result');
      },
    );
  });

  // @gate enableStore
  it('a render phase update in a hidden tree reaches a visible reader', async () => {
    const store = createStore(0);
    function Reader() {
      return <Text text={'Reader: ' + use(store)} />;
    }
    let didUpdate = false;
    function Updater() {
      if (!didUpdate) {
        didUpdate = true;
        store.update(1);
      }
      return <Text text="Updater" />;
    }
    const root = ReactNoop.createRoot();
    await act(() =>
      root.render(
        <>
          <Reader />
          <Activity mode="hidden">
            <Updater />
          </Activity>
        </>,
      ),
    );
    assertConsoleErrorDev([
      'Cannot update a store while rendering a component (`Updater`). ' +
        'Updating a store is a side effect, so it should happen in an ' +
        'event handler or an effect. The update will be rendered after the ' +
        'current render. To locate the bad store.update() call inside ' +
        '`Updater`, follow the stack trace as described in ' +
        'https://react.dev/link/setstate-in-render\n' +
        '    in Updater (at **)',
    ]);
    assertLog(['Reader: 0', 'Updater', 'Reader: 1']);
    expect(root).toMatchRenderedOutput('Reader: 1');
  });
});
