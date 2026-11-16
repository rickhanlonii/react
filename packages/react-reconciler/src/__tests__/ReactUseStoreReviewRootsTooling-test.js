/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 */
'use strict';

// Review (slice 5): multiple roots and renderers, portals, component types,
// the same-element bailout, compiled code and useEffectEvent. The setup and
// helpers are copied from ReactUseStore-test.js.

let React;
let ReactNoop;
let Scheduler;
let act;
let use;
let useState;
let useEffect;
let useLayoutEffect;
let useMemo;
let startTransition;
let Suspense;
let assertLog;
let waitForAll;
let assertConsoleErrorDev;
let createStore;
let createPortal;
let useReducer;
let useEffectEvent;
let useMemoCache;
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
  use = React.use;
  useState = React.useState;
  useEffect = React.useEffect;
  useLayoutEffect = React.useLayoutEffect;
  useMemo = React.useMemo;
  startTransition = React.startTransition;
  Suspense = React.Suspense;
  createStore = React.unstable_createStore;
  createPortal = ReactNoop.createPortal;
  useReducer = React.useReducer;
  useEffectEvent = React.useEffectEvent;
  useMemoCache = require('react/compiler-runtime').c;

  const InternalTestUtils = require('internal-test-utils');
  act = InternalTestUtils.act;
  assertLog = InternalTestUtils.assertLog;
  waitForAll = InternalTestUtils.waitForAll;
  assertConsoleErrorDev = InternalTestUtils.assertConsoleErrorDev;

  textCache = new Map();
});

afterEach(() => {
  global.reportError = originalReportError;
  // A reported error would otherwise go unnoticed after the last act.
  assertLog([]);
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

// The value after a root's name, so a store root and a useReducer root can be
// compared.
function valueOf(root) {
  const output = root.getChildrenAsJSX();
  return output == null ? null : String(output).replace(/^[^:]*: /, '');
}

describe('multiple roots (review)', () => {
  // The oracle for two roots: the same app with a useReducer in each root,
  // where every update is dispatched to both reducers in the same event.
  // @gate enableStore
  it('two roots match a useReducer in each root through urgent updates and a transition that suspends in one root', async () => {
    const reducer = (state, action) => state + action;
    const store = createStore('', reducer);

    function View({name, value, suspendOn}) {
      if (suspendOn !== undefined && value.includes(suspendOn)) {
        readText(name + ' ' + value);
      }
      return <Text text={name + ': ' + value} />;
    }
    function StoreApp(props) {
      return <View {...props} value={use(store)} />;
    }
    const reducerDispatches = [];
    function ReducerApp(props) {
      const [value, dispatch] = useReducer(reducer, '');
      reducerDispatches[props.index] = dispatch;
      return <View {...props} value={value} />;
    }

    const storeA = ReactNoop.createRoot();
    const storeB = ReactNoop.createRoot();
    const reducerA = ReactNoop.createRoot();
    const reducerB = ReactNoop.createRoot();
    const wrap = children => <Suspense fallback="Loading">{children}</Suspense>;
    await act(() => {
      storeA.render(wrap(<StoreApp name="A" />));
      storeB.render(wrap(<StoreApp name="B" suspendOn="T" />));
      reducerA.render(wrap(<ReducerApp name="A" index={0} />));
      reducerB.render(wrap(<ReducerApp name="B" index={1} suspendOn="T" />));
    });
    Scheduler.unstable_clearLog();

    function dispatchAll(action) {
      store.update(action);
      reducerDispatches[0](action);
      reducerDispatches[1](action);
    }
    function expectRootsToMatch(a, b) {
      expect(valueOf(storeA)).toBe(valueOf(reducerA));
      expect(valueOf(storeB)).toBe(valueOf(reducerB));
      expect(valueOf(storeA)).toBe(a);
      expect(valueOf(storeB)).toBe(b);
    }

    await act(() => dispatchAll('1'));
    Scheduler.unstable_clearLog();
    expectRootsToMatch('1', '1');

    // The transition commits in root A and suspends in root B.
    await act(() => startTransition(() => dispatchAll('T')));
    Scheduler.unstable_clearLog();
    expectRootsToMatch('1T', '1');

    // An urgent update renders before the transition in root B, and is
    // rebased on top of it.
    await act(() => dispatchAll('2'));
    Scheduler.unstable_clearLog();
    expectRootsToMatch('1T2', '12');

    await act(() => resolveText('B 1T2'));
    Scheduler.unstable_clearLog();
    expectRootsToMatch('1T2', '1T2');
    expectNoPendingUpdates(store);
  });

  // @gate enableStore
  it('a root that unmounts while a store transition is suspended in it does not keep the store pending or retained', async () => {
    const store = createStore('A');

    function AsyncReader() {
      return <AsyncText text={'Root A: ' + use(store)} />;
    }
    function Reader() {
      return <Text text={'Root B: ' + use(store)} />;
    }

    resolveText('Root A: A');
    const rootA = ReactNoop.createRoot();
    const rootB = ReactNoop.createRoot();
    await act(() => {
      rootA.render(
        <Suspense fallback="Loading">
          <AsyncReader />
        </Suspense>,
      );
      rootB.render(<Reader />);
    });
    assertLog(['Root A: A', 'Root B: A']);

    await act(() => startTransition(() => store.update('B')));
    assertLog(['Suspend! [Root A: B]', 'Root B: B']);
    expect(rootA).toMatchRenderedOutput('Root A: A');
    expect(rootB).toMatchRenderedOutput('Root B: B');

    await act(() => rootA.render(null));
    assertLog([]);
    expectStoreToHaveRoots(store, 1);
    expectNoPendingUpdates(store);

    await act(() => store.update('C'));
    assertLog(['Root B: C']);
    expectNoPendingUpdates(store);
  });

  // @gate enableStore
  it('a root created while another root has an unrendered urgent update starts from the latest value', async () => {
    const store = createStore(0);
    function Reader({name}) {
      return <Text text={name + ': ' + use(store)} />;
    }
    const rootA = ReactNoop.createRoot();
    await act(() => rootA.render(<Reader name="A" />));
    assertLog(['A: 0']);

    const rootB = ReactNoop.createRoot();
    await act(async () => {
      store.update(n => n + 1);
      rootB.render(<Reader name="B" />);
      // Root B renders in the same batch, from the latest value.
      await waitForAll(['A: 1', 'B: 1']);
      store.update(n => n + 1);
    });
    assertLog(['A: 2', 'B: 2']);
    expectNoPendingUpdates(store);
  });

  // @gate enableStore
  it('an update from a layout effect in one root reaches the other root in dispatch order', async () => {
    const store = createStore('init');

    function EffectReader() {
      const value = use(store);
      useLayoutEffect(() => {
        if (value === 'a') {
          store.update('b');
        }
      });
      return <Text text={'A: ' + value} />;
    }
    function Reader() {
      return <Text text={'B: ' + use(store)} />;
    }
    const rootA = ReactNoop.createRoot();
    const rootB = ReactNoop.createRoot();
    await act(() => {
      rootA.render(<EffectReader />);
      rootB.render(<Reader />);
    });
    assertLog(['A: init', 'B: init']);

    await act(() => store.update('a'));
    Scheduler.unstable_clearLog();
    expect(rootA).toMatchRenderedOutput('A: b');
    expect(rootB).toMatchRenderedOutput('B: b');
  });

  // @gate enableStore
  it('an update during the render of one root is rendered after it in both roots', async () => {
    const store = createStore(0);
    let didUpdate = false;
    function UpdatesInRender() {
      const value = use(store);
      if (value === 1 && !didUpdate) {
        didUpdate = true;
        store.update(2);
      }
      return <Text text={'A: ' + value} />;
    }
    function Reader() {
      return <Text text={'B: ' + use(store)} />;
    }
    const rootA = ReactNoop.createRoot();
    const rootB = ReactNoop.createRoot();
    await act(() => {
      rootA.render(<UpdatesInRender />);
      rootB.render(<Reader />);
    });
    assertLog(['A: 0', 'B: 0']);

    await act(() => store.update(1));
    assertConsoleErrorDev([storeUpdateInRenderWarning('UpdatesInRender')]);
    Scheduler.unstable_clearLog();
    expect(rootA).toMatchRenderedOutput('A: 2');
    expect(rootB).toMatchRenderedOutput('B: 2');
    expectNoPendingUpdates(store);
  });

  // @gate enableStore
  it('an async action commits its store updates together in both roots', async () => {
    const store = createStore('');
    function Reader({name}) {
      return <Text text={name + ': ' + use(store)} />;
    }
    const rootA = ReactNoop.createRoot();
    const rootB = ReactNoop.createRoot();
    await act(() => {
      rootA.render(<Reader name="A" />);
      rootB.render(<Reader name="B" />);
    });
    assertLog(['A: ', 'B: ']);

    let resolve;
    await act(() => {
      startTransition(async () => {
        store.update(s => s + 'x');
        await new Promise(r => (resolve = r));
        startTransition(() => store.update(s => s + 'y'));
      });
    });
    // Neither root shows the first update while the action is pending.
    assertLog([]);
    expect(rootA).toMatchRenderedOutput('A: ');
    expect(rootB).toMatchRenderedOutput('B: ');

    await act(() => resolve());
    assertLog(['A: xy', 'B: xy']);
    expectNoPendingUpdates(store);
  });
});

describe('multiple renderers (review)', () => {
  let ReactNoopSecond;
  beforeEach(() => {
    const ReactSharedInternals = require('shared/ReactSharedInternals');
    jest.resetModules();
    jest.doMock('react', () => React);
    jest.doMock('shared/ReactSharedInternals', () => ReactSharedInternals);
    jest.doMock('scheduler', () => Scheduler);
    ReactNoopSecond = require('react-noop-renderer');
  });
  afterEach(() => {
    global.__unmockReact();
    jest.doMock('scheduler', () =>
      jest.requireActual('scheduler/unstable_mock'),
    );
  });

  // @gate enableStore
  it('roots in two renderers apply urgent updates and a transition that suspends in one of them in dispatch order', async () => {
    const store = createStore('', (state, action) => state + action);
    function Reader({name, suspendOn}) {
      const value = use(store);
      if (suspendOn !== undefined && value.includes(suspendOn)) {
        readText(name + ' ' + value);
      }
      return <Text text={name + ': ' + value} />;
    }
    const first = ReactNoop.createRoot();
    const second = ReactNoopSecond.createRoot();
    await act(() => {
      first.render(<Reader name="First" />);
      second.render(
        <Suspense fallback="Loading">
          <Reader name="Second" suspendOn="T" />
        </Suspense>,
      );
    });
    assertLog(['First: ', 'Second: ']);

    await act(() => startTransition(() => store.update('T')));
    assertLog(['First: T', 'Suspend! [Second T]']);
    await act(() => store.update('1'));
    assertLog(['First: T1', 'Second: 1', 'Suspend! [Second T1]']);
    expect(second).toMatchRenderedOutput('Second: 1');
    await act(() => resolveText('Second T1'));
    assertLog(['Second: T1']);
    expect(first).toMatchRenderedOutput('First: T1');
    expect(second).toMatchRenderedOutput('Second: T1');
    expectNoPendingUpdates(store);
  });

  // @gate enableStore
  it('a held update taken over by a root in one renderer reaches a root in the other renderer once', async () => {
    const store = createStore('', (state, action) => state + action);
    function Reader({name}) {
      return <Text text={name + ': ' + use(store)} />;
    }
    const first = ReactNoop.createRoot();
    const second = ReactNoopSecond.createRoot();

    // Nothing reads the store, so the transition's update is held. The
    // second renderer's root takes it over in the same transition.
    await act(() => {
      startTransition(() => {
        store.update('A');
        second.render(<Reader name="Second" />);
      });
    });
    assertLog(['Second: A']);
    await act(() => first.render(<Reader name="First" />));
    assertLog(['First: A']);
    await act(() => store.update('B'));
    assertLog(['Second: AB', 'First: AB']);
    expectNoPendingUpdates(store);
  });
});

describe('portals (review)', () => {
  // @gate enableStore
  it('a reader inside a portal updates past a memo parent, and unsubscribes when the portal unmounts', async () => {
    const store = createStore(0);
    const portalContainer = {rootID: 'portal', children: []};
    function Reader() {
      return <Text text={'Portal: ' + use(store)} />;
    }
    const Parent = React.memo(function Parent({show}) {
      Scheduler.log('Parent');
      return show ? createPortal(<Reader />, portalContainer) : null;
    });
    const root = ReactNoop.createRoot();
    await act(() => root.render(<Parent show={true} />));
    assertLog(['Parent', 'Portal: 0']);

    await act(() => store.update(1));
    assertLog(['Portal: 1']);
    expect(portalContainer.children.map(c => c.text)).toEqual(['Portal: 1']);

    await act(() => root.render(<Parent show={false} />));
    assertLog(['Parent']);
    expectStoreToHaveRoots(store, 0);
    await act(() => store.update(2));
    assertLog([]);
  });

  // @gate enableStore
  it('a store update retries a boundary whose reader inside a portal suspended on mount', async () => {
    const store = createStore('A');
    const portalContainer = {rootID: 'portal', children: []};
    function AsyncReader() {
      return <AsyncText text={'Portal: ' + use(store)} />;
    }
    resolveText('Portal: B');
    const root = ReactNoop.createRoot();
    await act(() =>
      root.render(
        <Suspense fallback={<Text text="Loading" />}>
          {createPortal(<AsyncReader />, portalContainer)}
        </Suspense>,
      ),
    );
    assertLog(['Suspend! [Portal: A]', 'Loading', 'Suspend! [Portal: A]']);

    await act(() => store.update('B'));
    assertLog(['Portal: B']);
    expect(portalContainer.children.map(c => c.text)).toEqual(['Portal: B']);
  });
});

describe('component types (review)', () => {
  // @gate enableStore
  it('readers of every function component type update and bail out on the same value', async () => {
    const store = createStore(0);
    const MemoCustom = React.memo(
      function MemoCustom() {
        return <Text text={'MemoCustom: ' + use(store)} />;
      },
      () => true,
    );
    const SimpleMemo = React.memo(function SimpleMemo() {
      return <Text text={'SimpleMemo: ' + use(store)} />;
    });
    const Forward = React.forwardRef(function Forward(props, ref) {
      return <Text text={'Forward: ' + use(store)} />;
    });
    function LazyImpl() {
      return <Text text={'Lazy: ' + use(store)} />;
    }
    const Lazy = React.lazy(async () => ({default: LazyImpl}));
    function useValue() {
      return use(store);
    }
    function CustomHook() {
      return <Text text={'CustomHook: ' + useValue()} />;
    }

    let setTick;
    function App() {
      const [tick, _setTick] = useState(0);
      setTick = _setTick;
      return (
        <Suspense fallback={<Text text="Loading" />}>
          <MemoCustom tick={tick} />
          <SimpleMemo />
          <Forward />
          <Lazy />
          <CustomHook />
        </Suspense>
      );
    }
    const root = ReactNoop.createRoot();
    await act(() => root.render(<App />));
    Scheduler.unstable_clearLog();
    expect(root).toMatchRenderedOutput(
      'MemoCustom: 0SimpleMemo: 0Forward: 0Lazy: 0CustomHook: 0',
    );

    await act(() => store.update(1));
    assertLog([
      'MemoCustom: 1',
      'SimpleMemo: 1',
      'Forward: 1',
      'Lazy: 1',
      'CustomHook: 1',
    ]);

    // A parent update doesn't re-render the memo readers.
    await act(() => setTick(1));
    assertLog(['Forward: 1', 'Lazy: 1', 'CustomHook: 1']);

    // The same value bails out without rendering anything.
    await act(() => store.update(1));
    assertLog([]);
  });

  function testBoundaryRetry(name, wrap) {
    // @gate enableStore
    it(`a store update retries a boundary whose ${name} reader's child suspended on mount`, async () => {
      const store = createStore('A');
      const Reader = wrap(function Reader() {
        return <AsyncText text={'Reader: ' + use(store)} />;
      });
      resolveText('Reader: B');
      const root = ReactNoop.createRoot();
      await act(() =>
        root.render(
          <Suspense fallback={<Text text="Loading" />}>
            <Reader />
          </Suspense>,
        ),
      );
      assertLog(['Suspend! [Reader: A]', 'Loading', 'Suspend! [Reader: A]']);

      await act(() => store.update('B'));
      assertLog(['Reader: B']);
      expect(root).toMatchRenderedOutput('Reader: B');
    });
  }
  testBoundaryRetry('memo with a custom comparison', type =>
    React.memo(type, () => true),
  );
  testBoundaryRetry('simple memo', type => React.memo(type));
  testBoundaryRetry('forwardRef', type =>
    React.forwardRef((props, ref) => type(props)),
  );

  // @gate enableStore
  it('use(store) next to use(context) in the same component', async () => {
    const store = createStore('s0');
    const Context = React.createContext('c0');
    function Reader() {
      const c = use(Context);
      const s = use(store);
      return <Text text={c + ' ' + s} />;
    }
    const Middle = React.memo(() => <Reader />);
    let setContext;
    function App() {
      const [value, _setContext] = useState('c0');
      setContext = _setContext;
      return (
        <Context.Provider value={value}>
          <Middle />
        </Context.Provider>
      );
    }
    const root = ReactNoop.createRoot();
    await act(() => root.render(<App />));
    assertLog(['c0 s0']);

    await act(() => {
      setContext('c1');
      store.update('s1');
    });
    assertLog(['c1 s1']);

    await act(() => setContext('c2'));
    assertLog(['c2 s1']);

    // A store transition and an urgent context update render separately.
    await act(() => {
      startTransition(() => store.update('s2'));
      ReactNoop.flushSync(() => setContext('c3'));
      assertLog(['c3 s1']);
    });
    assertLog(['c3 s2']);
  });
});

describe('same-element bailout (review)', () => {
  // @gate enableStore
  it('a reader below a parent that returns the same element renders a store transition that an urgent parent update skipped', async () => {
    const store = createStore(0);
    function Child() {
      return <Text text={'Child: ' + use(store)} />;
    }
    let setCount;
    function Parent() {
      const [count, _setCount] = useState(0);
      setCount = _setCount;
      Scheduler.log('Parent ' + count);
      return useMemo(() => <Child />, []);
    }
    const root = ReactNoop.createRoot();
    await act(() => root.render(<Parent />));
    assertLog(['Parent 0', 'Child: 0']);

    await act(() => {
      startTransition(() => store.update(1));
      // The urgent render bails out of Child, which keeps its transition lane.
      ReactNoop.flushSync(() => setCount(1));
      assertLog(['Parent 1']);
      expect(root).toMatchRenderedOutput('Child: 0');
    });
    assertLog(['Child: 1']);
    expect(root).toMatchRenderedOutput('Child: 1');
  });

  // @gate enableStore
  it('a parent that reads a store and returns the same element still re-renders a child that reads another store updated in the same event', async () => {
    const storeA = createStore('a0');
    const storeB = createStore('b0');
    function Child() {
      return <Text text={'Child: ' + use(storeB)} />;
    }
    function Parent() {
      Scheduler.log('Parent: ' + use(storeA));
      return useMemo(() => <Child />, []);
    }
    const root = ReactNoop.createRoot();
    await act(() => root.render(<Parent />));
    assertLog(['Parent: a0', 'Child: b0']);

    await act(() => {
      storeA.update('a1');
      storeB.update('b1');
    });
    assertLog(['Parent: a1', 'Child: b1']);

    await act(() => storeA.update('a2'));
    assertLog(['Parent: a2']);
  });
});

describe('compiled code (review)', () => {
  // A hand-written equivalent of the compiler's output. The compiler flattens
  // the scope that contains use(), so use(store) runs on every render, and
  // only the element is memoized.
  function createCompiledRow(selectedStore) {
    function RowView({id, selected}) {
      Scheduler.log('RowView ' + id + (selected ? ' selected' : ''));
      return id + (selected ? '*' : '') + ' ';
    }
    function Row({id}) {
      const $ = useMemoCache(3);
      const selected = use(selectedStore) === id;
      let t0;
      if ($[0] !== id || $[1] !== selected) {
        t0 = <RowView id={id} selected={selected} />;
        $[0] = id;
        $[1] = selected;
        $[2] = t0;
      } else {
        t0 = $[2];
      }
      return t0;
    }
    return Row;
  }

  // @gate enableStore
  it('compiled readers whose memoized output did not change skip their child, and the rest update, through a rebase', async () => {
    const selectedStore = createStore(1);
    const Row = createCompiledRow(selectedStore);
    function List() {
      return [1, 2, 3, 4].map(id => <Row key={id} id={id} />);
    }
    const root = ReactNoop.createRoot();
    await act(() => root.render(<List />));
    assertLog(['RowView 1 selected', 'RowView 2', 'RowView 3', 'RowView 4']);
    expect(root).toMatchRenderedOutput('1* 2 3 4 ');

    await act(() => selectedStore.update(3));
    assertLog(['RowView 1', 'RowView 3 selected']);
    expect(root).toMatchRenderedOutput('1 2 3* 4 ');

    // A transition, then an urgent update before it renders. The urgent
    // update renders first and is rebased on top of the transition.
    await act(() => {
      startTransition(() => selectedStore.update(() => 4));
      ReactNoop.flushSync(() => selectedStore.update(id => id - 1));
      assertLog(['RowView 2 selected', 'RowView 3']);
      expect(root).toMatchRenderedOutput('1 2* 3 4 ');
    });
    assertLog(['RowView 2', 'RowView 3 selected']);
    expect(root).toMatchRenderedOutput('1 2 3* 4 ');
  });

  // @gate enableStore
  it('a compiled parent that returns its memoized children still lets a reader below update', async () => {
    const store = createStore(0);
    function Reader() {
      return <Text text={'Reader: ' + use(store)} />;
    }
    let setLabel;
    function Parent() {
      const $ = useMemoCache(1);
      const [label, _setLabel] = useState('x');
      setLabel = _setLabel;
      Scheduler.log('Parent ' + label);
      let t0;
      if ($[0] === Symbol.for('react.memo_cache_sentinel')) {
        t0 = <Reader />;
        $[0] = t0;
      } else {
        t0 = $[0];
      }
      return t0;
    }
    const root = ReactNoop.createRoot();
    await act(() => root.render(<Parent />));
    assertLog(['Parent x', 'Reader: 0']);
    await act(() => {
      setLabel('y');
      store.update(1);
    });
    assertLog(['Parent y', 'Reader: 1']);
  });
});

describe('useEffectEvent (review)', () => {
  // @gate enableStore
  it('an effect event sees the value from the last committed render, not a suspended one', async () => {
    const store = createStore(1);
    let onTick;
    function Reader() {
      const value = use(store);
      const tick = useEffectEvent(() => {
        Scheduler.log('tick ' + value);
      });
      useEffect(() => {
        onTick = tick;
      }, []);
      return <AsyncText text={'Reader: ' + value} />;
    }
    resolveText('Reader: 1');
    resolveText('Reader: 2');
    const root = ReactNoop.createRoot();
    await act(() =>
      root.render(
        <Suspense fallback="Loading">
          <Reader />
        </Suspense>,
      ),
    );
    assertLog(['Reader: 1']);
    onTick();
    assertLog(['tick 1']);

    await act(() => store.update(2));
    assertLog(['Reader: 2']);
    onTick();
    assertLog(['tick 2']);

    // A transition that suspends doesn't change what the event sees.
    await act(() => startTransition(() => store.update(3)));
    assertLog(['Suspend! [Reader: 3]']);
    onTick();
    assertLog(['tick 2']);

    await act(() => resolveText('Reader: 3'));
    assertLog(['Reader: 3']);
    onTick();
    assertLog(['tick 3']);
  });

  // @gate enableStore
  it('an effect event called from a layout effect sees the store value of the render that committed', async () => {
    const store = createStore(1);
    function Reader() {
      const value = use(store);
      const report = useEffectEvent(() => {
        Scheduler.log('report ' + value);
      });
      useLayoutEffect(() => {
        report();
      });
      return <Text text={'Reader: ' + value} />;
    }
    const root = ReactNoop.createRoot();
    await act(() => root.render(<Reader />));
    assertLog(['Reader: 1', 'report 1']);
    await act(() => store.update(2));
    assertLog(['Reader: 2', 'report 2']);
  });
});

describe('bailouts and reducer runs (review)', () => {
  // @gate enableStore
  it('reaches readers past PureComponent and shouldComponentUpdate', async () => {
    const store = createStore(0);
    function Reader({name}) {
      return <Text text={name + ': ' + use(store)} />;
    }
    class Pure extends React.PureComponent {
      render() {
        Scheduler.log('Pure');
        return <Reader name="A" />;
      }
    }
    class Blocked extends React.Component {
      shouldComponentUpdate() {
        return false;
      }
      render() {
        Scheduler.log('Blocked');
        return <Reader name="B" />;
      }
    }
    const root = ReactNoop.createRoot();
    await act(() =>
      root.render(
        <>
          <Pure />
          <Blocked />
        </>,
      ),
    );
    assertLog(['Pure', 'A: 0', 'Blocked', 'B: 0']);
    await act(() => store.update(1));
    assertLog(['A: 1', 'B: 1']);
  });

  // @gate enableStore
  it('runs the reducer as often as a useReducer in each of two roots, through a rebase', async () => {
    let storeRuns = 0;
    let reducerRuns = 0;
    const storeReducer = (state, action) => {
      storeRuns++;
      return state + action;
    };
    const hookReducer = (state, action) => {
      reducerRuns++;
      return state + action;
    };
    const store = createStore('', storeReducer);
    const dispatches = [];
    function StoreReader() {
      return use(store);
    }
    function HookReader({index}) {
      const [value, dispatch] = useReducer(hookReducer, '');
      dispatches[index] = dispatch;
      return value;
    }
    const roots = [0, 1, 2, 3].map(() => ReactNoop.createRoot());
    await act(() => {
      roots[0].render(<StoreReader />);
      roots[1].render(<StoreReader />);
      roots[2].render(<HookReader index={0} />);
      roots[3].render(<HookReader index={1} />);
    });
    function dispatchAll(action) {
      store.update(action);
      dispatches[0](action);
      dispatches[1](action);
    }

    await act(() => dispatchAll('a'));
    await act(() => {
      startTransition(() => dispatchAll('T'));
      ReactNoop.flushSync(() => dispatchAll('u'));
    });
    expect(roots.map(root => root.getChildrenAsJSX())).toEqual([
      'aTu',
      'aTu',
      'aTu',
      'aTu',
    ]);
    expect(storeRuns).toBe(reducerRuns);
    expectNoPendingUpdates(store);
  });
});
