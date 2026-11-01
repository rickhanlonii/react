// The cases of ReactContextPropagation-test.js, with context replaced by
// `use(store)`: a store update has to reach its readers through memo,
// Suspense retries, hidden trees and SuspenseList, like a context change.
//
// In the original, the component that renders the Provider owns the value in
// state. Here it reads the store instead, so it still re-renders when the
// value changes, the same way it did with setState, and the update still has
// to get past the memo/Suspense/hidden boundaries between it and the readers.
// The readers below it read the store directly.

let React;
let ReactNoop;
let Scheduler;
let act;
let use;
let useState;
let createStore;
let Suspense;
let SuspenseList;
let getCacheForType;
let caches;
let seededCache;
let assertLog;

describe('ReactLazyContextPropagation', () => {
  beforeEach(() => {
    jest.resetModules();

    React = require('react');
    ReactNoop = require('react-noop-renderer');
    Scheduler = require('scheduler');
    act = require('internal-test-utils').act;
    use = React.use;
    useState = React.useState;
    createStore = React.unstable_createStore;
    Suspense = React.Suspense;
    if (gate(flags => flags.enableSuspenseList)) {
      SuspenseList = React.unstable_SuspenseList;
    }

    const InternalTestUtils = require('internal-test-utils');
    assertLog = InternalTestUtils.assertLog;

    getCacheForType = React.unstable_getCacheForType;

    caches = [];
    seededCache = null;
  });

  function createTextCache() {
    if (seededCache !== null) {
      // Trick to seed a cache before it exists.
      // TODO: Need a built-in API to seed data before the initial render (i.e.
      // not a refresh because nothing has mounted yet).
      const cache = seededCache;
      seededCache = null;
      return cache;
    }

    const data = new Map();
    const version = caches.length + 1;
    const cache = {
      version,
      data,
      resolve(text) {
        const record = data.get(text);
        if (record === undefined) {
          const newRecord = {
            status: 'resolved',
            value: text,
          };
          data.set(text, newRecord);
        } else if (record.status === 'pending') {
          const thenable = record.value;
          record.status = 'resolved';
          record.value = text;
          thenable.pings.forEach(t => t());
        }
      },
      reject(text, error) {
        const record = data.get(text);
        if (record === undefined) {
          const newRecord = {
            status: 'rejected',
            value: error,
          };
          data.set(text, newRecord);
        } else if (record.status === 'pending') {
          const thenable = record.value;
          record.status = 'rejected';
          record.value = error;
          thenable.pings.forEach(t => t());
        }
      },
    };
    caches.push(cache);
    return cache;
  }

  function readText(text) {
    const textCache = getCacheForType(createTextCache);
    const record = textCache.data.get(text);
    if (record !== undefined) {
      switch (record.status) {
        case 'pending':
          Scheduler.log(`Suspend! [${text}]`);
          throw record.value;
        case 'rejected':
          Scheduler.log(`Error! [${text}]`);
          throw record.value;
        case 'resolved':
          return textCache.version;
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
      textCache.data.set(text, newRecord);

      throw thenable;
    }
  }

  function Text({text}) {
    Scheduler.log(text);
    return text;
  }

  // function AsyncText({text, showVersion}) {
  //   const version = readText(text);
  //   const fullText = showVersion ? `${text} [v${version}]` : text;
  //   Scheduler.log(fullText);
  //   return text;
  // }

  function seedNextTextCache(text) {
    if (seededCache === null) {
      seededCache = createTextCache();
    }
    seededCache.resolve(text);
  }

  function resolveMostRecentTextCache(text) {
    if (caches.length === 0) {
      throw Error('Cache does not exist.');
    } else {
      // Resolve the most recently created cache. An older cache can by
      // resolved with `caches[index].resolve(text)`.
      caches[caches.length - 1].resolve(text);
    }
  }

  const resolveText = resolveMostRecentTextCache;

  // function rejectMostRecentTextCache(text, error) {
  //   if (caches.length === 0) {
  //     throw Error('Cache does not exist.');
  //   } else {
  //     // Resolve the most recently created cache. An older cache can by
  //     // resolved with `caches[index].reject(text, error)`.
  //     caches[caches.length - 1].reject(text, error);
  //   }
  // }

  // @gate enableStore
  it(
    'context change should prevent bailout of memoized component (useMemo -> ' +
      'no intermediate fiber)',
    async () => {
      const root = ReactNoop.createRoot();

      const store = createStore(0);

      function App() {
        // Stands in for the useState that owned the Provider value.
        use(store);

        // NOTE: It's an important part of this test that we're memoizing the
        // props of the Consumer component, as opposed to wrapping in an
        // additional memoized fiber, because the implementation propagates
        // context changes whenever a fiber bails out.
        const consumer = React.useMemo(() => <Consumer />, []);

        return consumer;
      }

      function Consumer() {
        const value = use(store);
        // Even though Consumer is memoized, Consumer should re-render
        // DeepChild whenever the context value changes. Otherwise DeepChild
        // won't receive the new value.
        return <DeepChild value={value} />;
      }

      function DeepChild({value}) {
        return <Text text={value} />;
      }

      await act(() => {
        root.render(<App />);
      });
      assertLog([0]);
      expect(root).toMatchRenderedOutput('0');

      await act(() => {
        store.update(1);
      });
      assertLog([1]);
      expect(root).toMatchRenderedOutput('1');
    },
  );

  // @gate enableStore
  it('context change should prevent bailout of memoized component (memo HOC)', async () => {
    const root = ReactNoop.createRoot();

    const store = createStore(0);

    function App() {
      // Stands in for the useState that owned the Provider value.
      use(store);
      return <Consumer />;
    }

    const Consumer = React.memo(() => {
      const value = use(store);
      // Even though Consumer is memoized, Consumer should re-render
      // DeepChild whenever the context value changes. Otherwise DeepChild
      // won't receive the new value.
      return <DeepChild value={value} />;
    });

    function DeepChild({value}) {
      return <Text text={value} />;
    }

    await act(() => {
      root.render(<App />);
    });
    assertLog([0]);
    expect(root).toMatchRenderedOutput('0');

    await act(() => {
      store.update(1);
    });
    assertLog([1]);
    expect(root).toMatchRenderedOutput('1');
  });

  // @gate enableStore
  it("context consumer bails out if context hasn't changed", async () => {
    const root = ReactNoop.createRoot();

    const store = createStore(0);

    function App() {
      return <Consumer />;
    }

    let setOtherValue;
    const Consumer = React.memo(() => {
      const value = use(store);

      const [, _setOtherValue] = useState(0);
      setOtherValue = _setOtherValue;

      Scheduler.log('Consumer');

      return <Text text={value} />;
    });

    await act(() => {
      root.render(<App />);
    });
    assertLog(['Consumer', 0]);
    expect(root).toMatchRenderedOutput('0');

    await act(() => {
      // Intentionally calling setState to some other arbitrary value before
      // setting it back to the current one. That way an update is scheduled,
      // but we'll bail out during render when nothing has changed.
      setOtherValue(1);
      setOtherValue(0);
    });
    // NOTE: If this didn't yield anything, that indicates that we never visited
    // the consumer during the render phase, which probably means the eager
    // bailout mechanism kicked in. Because we're testing the _lazy_ bailout
    // mechanism, update this test to foil the _eager_ bailout, somehow. Perhaps
    // by switching to useReducer.
    assertLog(['Consumer']);
    expect(root).toMatchRenderedOutput('0');
  });

  // @gate enableStore && enableLegacyCache
  it('context is propagated across retries', async () => {
    const root = ReactNoop.createRoot();

    const store = createStore('A');

    function App() {
      const value = use(store);
      return (
        <>
          <Suspense fallback={<Text text="Loading..." />}>
            <Async />
          </Suspense>
          <Text text={value} />
        </>
      );
    }

    function Async() {
      const value = use(store);
      readText(value);

      // When `readText` suspends, we haven't yet visited Indirection and all
      // of its children. They won't get rendered until a later retry.
      return <Indirection />;
    }

    const Indirection = React.memo(() => {
      // This child must always be consistent with the sibling Text component.
      return <DeepChild />;
    });

    function DeepChild() {
      const value = use(store);
      return <Text text={value} />;
    }

    await seedNextTextCache('A');
    await act(() => {
      root.render(<App />);
    });
    assertLog(['A', 'A']);
    expect(root).toMatchRenderedOutput('AA');

    await act(() => {
      // Intentionally not wrapping in startTransition, so that the fallback
      // the fallback displays despite this being a refresh.
      store.update('B');
    });
    assertLog([
      'Suspend! [B]',
      'Loading...',
      'B',
      // pre-warming
      'Suspend! [B]',
    ]);
    expect(root).toMatchRenderedOutput('Loading...B');

    await act(async () => {
      await resolveText('B');
    });
    assertLog(['B']);
    expect(root).toMatchRenderedOutput('BB');
  });

  // @gate enableStore && enableLegacyCache && !disableLegacyMode
  it('context is propagated across retries (legacy)', async () => {
    const root = ReactNoop.createLegacyRoot();

    const store = createStore('A');

    function App() {
      const value = use(store);
      return (
        <>
          <Suspense fallback={<Text text="Loading..." />}>
            <Async />
          </Suspense>
          <Text text={value} />
        </>
      );
    }

    function Async() {
      const value = use(store);
      readText(value);

      // When `readText` suspends, we haven't yet visited Indirection and all
      // of its children. They won't get rendered until a later retry.
      return <Indirection />;
    }

    const Indirection = React.memo(() => {
      // This child must always be consistent with the sibling Text component.
      return <DeepChild />;
    });

    function DeepChild() {
      const value = use(store);
      return <Text text={value} />;
    }

    await seedNextTextCache('A');
    await act(() => {
      root.render(<App />);
    });
    assertLog(['A', 'A']);
    expect(root).toMatchRenderedOutput('AA');

    await act(() => {
      // Intentionally not wrapping in startTransition, so that the fallback
      // the fallback displays despite this being a refresh.
      store.update('B');
    });
    assertLog(['Suspend! [B]', 'Loading...', 'B']);
    expect(root).toMatchRenderedOutput('Loading...B');

    await act(async () => {
      await resolveText('B');
    });
    assertLog(['B']);
    expect(root).toMatchRenderedOutput('BB');
  });

  // @gate enableStore && enableLegacyCache && enableLegacyHidden
  it('context is propagated through offscreen trees', async () => {
    const LegacyHidden = React.unstable_LegacyHidden;

    const root = ReactNoop.createRoot();

    const store = createStore('A');

    function App() {
      const value = use(store);
      return (
        <>
          <LegacyHidden mode="hidden">
            <Indirection />
          </LegacyHidden>
          <Text text={value} />
        </>
      );
    }

    const Indirection = React.memo(() => {
      // This child must always be consistent with the sibling Text component.
      return <DeepChild />;
    });

    function DeepChild() {
      const value = use(store);
      return <Text text={value} />;
    }

    await seedNextTextCache('A');
    await act(() => {
      root.render(<App />);
    });
    assertLog(['A', 'A']);
    expect(root).toMatchRenderedOutput('AA');

    await act(() => {
      store.update('B');
    });
    assertLog(['B', 'B']);
    expect(root).toMatchRenderedOutput('BB');
  });

  // @gate enableStore && enableSuspenseList
  it('contexts are propagated through SuspenseList', async () => {
    // This kinda tests an implementation detail. SuspenseList has an early
    // bailout that doesn't use `bailoutOnAlreadyFinishedWork`. It probably
    // should just use that function, though.
    const store = createStore('A');

    function App() {
      // Stands in for the useState that owned the Provider value.
      use(store);
      const children = React.useMemo(
        () => (
          <SuspenseList revealOrder="forwards" tail="visible">
            <Child />
            <Child />
          </SuspenseList>
        ),
        [],
      );
      return children;
    }

    function Child() {
      const value = use(store);
      return <Text text={value} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      root.render(<App />);
    });
    assertLog(['A', 'A']);
    expect(root).toMatchRenderedOutput('AA');

    await act(() => {
      store.update('B');
    });
    assertLog(['B', 'B']);
    expect(root).toMatchRenderedOutput('BB');
  });

  // @gate enableStore
  it('nested bailouts', async () => {
    // Lazy context propagation will stop propagating when it hits the first
    // match. If we bail out again inside that tree, we must resume propagating.

    const store = createStore('A');

    function App() {
      // Stands in for the useState that owned the Provider value.
      use(store);
      return <ChildIndirection />;
    }

    const ChildIndirection = React.memo(() => {
      return <Child />;
    });

    function Child() {
      const value = use(store);
      return (
        <>
          <Text text={value} />
          <DeepChildIndirection />
        </>
      );
    }

    const DeepChildIndirection = React.memo(() => {
      return <DeepChild />;
    });

    function DeepChild() {
      const value = use(store);
      return <Text text={value} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      root.render(<App />);
    });
    assertLog(['A', 'A']);
    expect(root).toMatchRenderedOutput('AA');

    await act(() => {
      store.update('B');
    });
    assertLog(['B', 'B']);
    expect(root).toMatchRenderedOutput('BB');
  });

  // @gate enableStore && enableLegacyCache
  it('nested bailouts across retries', async () => {
    // Lazy context propagation will stop propagating when it hits the first
    // match. If we bail out again inside that tree, we must resume propagating.

    const store = createStore('A');

    function App() {
      const value = use(store);
      return (
        <Suspense fallback={<Text text="Loading..." />}>
          <Async value={value} />
        </Suspense>
      );
    }

    function Async({value}) {
      // When this suspends, we won't be able to visit its children during the
      // current render. So we must take extra care to propagate the context
      // change in such a way that they're aren't lost when we retry in a
      // later render.
      readText(value);
      return <Child value={value} />;
    }

    function Child() {
      const value = use(store);
      return (
        <>
          <Text text={value} />
          <DeepChildIndirection />
        </>
      );
    }

    const DeepChildIndirection = React.memo(() => {
      return <DeepChild />;
    });

    function DeepChild() {
      const value = use(store);
      return <Text text={value} />;
    }

    const root = ReactNoop.createRoot();
    await seedNextTextCache('A');
    await act(() => {
      root.render(<App />);
    });
    assertLog(['A', 'A']);
    expect(root).toMatchRenderedOutput('AA');

    await act(() => {
      store.update('B');
    });
    assertLog([
      'Suspend! [B]',
      'Loading...',
      // pre-warming
      'Suspend! [B]',
    ]);
    expect(root).toMatchRenderedOutput('Loading...');

    await act(async () => {
      await resolveText('B');
    });
    assertLog(['B', 'B']);
    expect(root).toMatchRenderedOutput('BB');
  });

  // @gate enableStore && enableLegacyCache && enableLegacyHidden
  it('nested bailouts through offscreen trees', async () => {
    // Lazy context propagation will stop propagating when it hits the first
    // match. If we bail out again inside that tree, we must resume propagating.

    const LegacyHidden = React.unstable_LegacyHidden;

    const store = createStore('A');

    function App() {
      // Stands in for the useState that owned the Provider value.
      use(store);
      return (
        <LegacyHidden mode="hidden">
          <Child />
        </LegacyHidden>
      );
    }

    function Child() {
      const value = use(store);
      return (
        <>
          <Text text={value} />
          <DeepChildIndirection />
        </>
      );
    }

    const DeepChildIndirection = React.memo(() => {
      return <DeepChild />;
    });

    function DeepChild() {
      const value = use(store);
      return <Text text={value} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      root.render(<App />);
    });
    assertLog(['A', 'A']);
    expect(root).toMatchRenderedOutput('AA');

    await act(() => {
      store.update('B');
    });
    assertLog(['B', 'B']);
    expect(root).toMatchRenderedOutput('BB');
  });

  // @gate enableStore
  it('finds context consumers in multiple sibling branches', async () => {
    // This test confirms that when we find a matching context consumer during
    // propagation, we continue propagating to its sibling branches.

    const store = createStore('A');

    function App() {
      // Stands in for the useState that owned the Provider value.
      use(store);
      return <Blah />;
    }

    const Blah = React.memo(() => {
      return (
        <>
          <Indirection />
          <Indirection />
        </>
      );
    });

    const Indirection = React.memo(() => {
      return <Child />;
    });

    function Child() {
      const value = use(store);
      return <Text text={value} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      root.render(<App />);
    });
    assertLog(['A', 'A']);
    expect(root).toMatchRenderedOutput('AA');

    await act(() => {
      store.update('B');
    });
    assertLog(['B', 'B']);
    expect(root).toMatchRenderedOutput('BB');
  });

  // store-semantics: the Consumer suspended on mount, so it never committed.
  // The boundary subscribes to the stores it read instead.
  // @gate enableStore
  it('regression: context change triggers retry of suspended Suspense boundary on initial mount', async () => {
    // Regression test for a bug where a context change above a suspended
    // Suspense boundary would fail to trigger a retry. When a Suspense
    // boundary suspends during initial mount, the primary children's fibers
    // are discarded because there is no current tree to preserve them. If
    // the suspended promise never resolves, the only way to retry is
    // something external — like a context change. Context propagation must
    // mark suspended Suspense boundaries for retry even though the consumer
    // fibers no longer exist in the tree.
    //
    // The Provider component owns the state update. The children are
    // passed in from above, so they are not re-created when the Provider
    // re-renders — this means the Suspense boundary bails out, exercising
    // the lazy context propagation path where the bug manifests.
    const neverResolvingPromise = new Promise(() => {});
    const resolvedThenable = {status: 'fulfilled', value: 'Result', then() {}};
    const store = createStore(neverResolvingPromise);

    function Consumer() {
      return <Text text={use(use(store))} />;
    }

    function Provider({children}) {
      // Stands in for the useState that owned the Provider value.
      use(store);
      return children;
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      root.render(
        <Provider>
          <Suspense fallback={<Text text="Loading" />}>
            <Consumer />
          </Suspense>
        </Provider>,
      );
    });
    assertLog(['Loading']);
    expect(root).toMatchRenderedOutput('Loading');

    await act(() => {
      store.update(resolvedThenable);
    });
    assertLog(['Result']);
    expect(root).toMatchRenderedOutput('Result');
  });

  // store-semantics: the Consumer suspended on mount, so it never committed.
  // The boundary subscribes to the stores it read instead.
  // @gate enableStore
  it('regression: context change triggers retry of suspended Suspense boundary on initial mount (nested)', async () => {
    // Same as above, but with an additional indirection component between
    // the provider and the Suspense boundary. This exercises the
    // propagateContextChanges walker path rather than the
    // propagateParentContextChanges path.
    const neverResolvingPromise = new Promise(() => {});
    const resolvedThenable = {status: 'fulfilled', value: 'Result', then() {}};
    const store = createStore(neverResolvingPromise);

    function Consumer() {
      return <Text text={use(use(store))} />;
    }

    function Indirection({children}) {
      Scheduler.log('Indirection');
      return children;
    }

    function Provider({children}) {
      // Stands in for the useState that owned the Provider value.
      use(store);
      return children;
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      root.render(
        <Provider>
          <Indirection>
            <Suspense fallback={<Text text="Loading" />}>
              <Consumer />
            </Suspense>
          </Indirection>
        </Provider>,
      );
    });
    assertLog(['Indirection', 'Loading']);
    expect(root).toMatchRenderedOutput('Loading');

    // Indirection should not re-render — only the Suspense boundary
    // should be retried.
    await act(() => {
      store.update(resolvedThenable);
    });
    assertLog(['Result']);
    expect(root).toMatchRenderedOutput('Result');
  });

  // @gate enableStore && enableLegacyCache
  it('context change propagates to Suspense fallback (memo boundary)', async () => {
    // When a context change occurs above a Suspense boundary that is currently
    // showing its fallback, the fallback's context consumers should re-render
    // with the updated value — even if there's a memo boundary between the
    // provider and the Suspense boundary that prevents the fallback element
    // references from changing.
    const root = ReactNoop.createRoot();
    const store = createStore('A');

    function App() {
      const value = use(store);
      return (
        <>
          <MemoizedWrapper />
          <Text text={value} />
        </>
      );
    }

    const MemoizedWrapper = React.memo(function MemoizedWrapper() {
      return (
        <Suspense fallback={<FallbackConsumer />}>
          <AsyncChild />
        </Suspense>
      );
    });

    function FallbackConsumer() {
      const value = use(store);
      return <Text text={'Fallback: ' + value} />;
    }

    function AsyncChild() {
      readText('async');
      return <Text text="Content" />;
    }

    // Initial render — primary content suspends, fallback is shown
    await act(() => {
      root.render(<App />);
    });
    assertLog([
      'Suspend! [async]',
      'Fallback: A',
      'A',
      // pre-warming
      'Suspend! [async]',
    ]);
    expect(root).toMatchRenderedOutput('Fallback: AA');

    // Update context while still suspended. The fallback consumer should
    // re-render with the new value.
    await act(() => {
      store.update('B');
    });
    assertLog([
      // store-semantics: the original retries the primary children first,
      // and pre-warms them again, because context propagation conservatively
      // marks every Suspense boundary that shows a fallback below a changed
      // Provider for retry (it can't look into primary children that were
      // discarded). A store update only schedules the components that read
      // the store. AsyncChild doesn't, so the primary children aren't retried
      // and only the readers re-render.
      'Fallback: B',
      'B',
    ]);
    expect(root).toMatchRenderedOutput('Fallback: BB');

    // Unsuspend. The primary content should render with the latest context.
    await act(async () => {
      await resolveText('async');
    });
    assertLog(['Content']);
    expect(root).toMatchRenderedOutput('ContentB');
  });

  // From the use(store) copy of ReactContextPropagation-test.js, where the
  // component that renders the Provider reads its value from a store.
  // @gate enableStore && enableLegacyCache && !disableLegacyMode
  it('context is propagated across retries (legacy, a store holds the Provider value)', async () => {
    const root = ReactNoop.createLegacyRoot();

    const Context = React.createContext('A');

    const valueStore = createStore('A');
    const setContext = valueStore.update;
    function App() {
      const value = use(valueStore);
      return (
        <Context.Provider value={value}>
          <Suspense fallback={<Text text="Loading..." />}>
            <Async />
          </Suspense>
          <Text text={value} />
        </Context.Provider>
      );
    }

    function Async() {
      const value = React.useContext(Context);
      readText(value);

      // When `readText` suspends, we haven't yet visited Indirection and all
      // of its children. They won't get rendered until a later retry.
      return <Indirection />;
    }

    const Indirection = React.memo(() => {
      // This child must always be consistent with the sibling Text component.
      return <DeepChild />;
    });

    function DeepChild() {
      const value = React.useContext(Context);
      return <Text text={value} />;
    }

    await seedNextTextCache('A');
    await act(() => {
      root.render(<App />);
    });
    assertLog(['A', 'A']);
    expect(root).toMatchRenderedOutput('AA');

    await act(() => {
      // Intentionally not wrapping in startTransition, so that the fallback
      // the fallback displays despite this being a refresh.
      setContext('B');
    });
    assertLog(['Suspend! [B]', 'Loading...', 'B']);
    expect(root).toMatchRenderedOutput('Loading...B');

    await act(async () => {
      await resolveText('B');
    });
    assertLog(['B']);
    expect(root).toMatchRenderedOutput('BB');
  });
});
