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
let useDeferredValue;
let startTransition;
let Suspense;
let Activity;
let StrictMode;
let assertLog;
let waitFor;
let waitForPaint;
let assertConsoleErrorDev;
let createStore;

const originalReportError = global.reportError;

describe('ReactUseStore', () => {
  beforeEach(() => {
    jest.resetModules();
    global.reportError = originalReportError;

    React = require('react');
    ReactNoop = require('react-noop-renderer');
    Scheduler = require('scheduler');
    act = require('internal-test-utils').act;
    use = React.use;
    useState = React.useState;
    useEffect = React.useEffect;
    useLayoutEffect = React.useLayoutEffect;
    useDeferredValue = React.useDeferredValue;
    startTransition = React.startTransition;
    Suspense = React.Suspense;
    Activity = React.Activity;
    StrictMode = React.StrictMode;
    createStore = React.unstable_createStore;

    const InternalTestUtils = require('internal-test-utils');
    assertLog = InternalTestUtils.assertLog;
    waitFor = InternalTestUtils.waitFor;
    waitForPaint = InternalTestUtils.waitForPaint;
    assertConsoleErrorDev = InternalTestUtils.assertConsoleErrorDev;
  });

  function Text({text}) {
    Scheduler.log(text);
    return text;
  }

  // @gate enableStore
  it('should read the current value', async () => {
    const store = createStore(1);

    function App() {
      const value = use(store);
      Scheduler.log(value);
      return <span>{value}</span>;
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      root.render(<App />);
    });
    assertLog([1]);
    expect(root).toMatchRenderedOutput(<span>1</span>);
  });

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
    await act(() => {
      root.render(<App />);
    });
    assertLog([3]);
    expect(root).toMatchRenderedOutput(<span>3</span>);
  });

  // @gate enableStore
  it('passes actions to the reducer', async () => {
    const store = createStore(0, (state, action) =>
      action.type === 'add' ? state + action.amount : state
    );
    store.update({type: 'add', amount: 5});
    store.update({type: 'unknown'});

    function App() {
      return <span>{use(store)}</span>;
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      root.render(<App />);
    });
    expect(root).toMatchRenderedOutput(<span>5</span>);

    await act(() => {
      store.update({type: 'add', amount: 2});
    });
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
    await act(() => {
      root.render(<App />);
    });
    assertLog(['A: 0', 'B: 0']);

    await act(() => {
      store.update(1);
    });
    assertLog(['A: 1', 'B: 1']);
    expect(root).toMatchRenderedOutput('A: 1B: 1');

    await act(() => {
      store.update(n => n + 1);
    });
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
    await act(() => {
      root.render(<Parent />);
    });
    assertLog(['Parent', 'Reader: 0']);

    await act(() => {
      store.update(1);
    });
    assertLog(['Reader: 1']);
  });

  // @gate enableStore
  it('bails out when the value does not change', async () => {
    const store = createStore(0);

    function Reader() {
      return <Text text={'Reader: ' + use(store)} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      root.render(<Reader />);
    });
    assertLog(['Reader: 0']);

    await act(() => {
      store.update(0);
    });
    assertLog([]);

    // An object store that's updated to the same object.
    const objectStore = createStore({a: 1});
    function ObjectReader() {
      return <Text text={'a: ' + use(objectStore).a} />;
    }
    await act(() => {
      root.render(<ObjectReader />);
    });
    assertLog(['a: 1']);
    await act(() => {
      objectStore.update(prev => prev);
    });
    assertLog([]);
  });

  // @gate enableStore
  it('renders a transition update without blocking', async () => {
    const store = createStore('A');

    function App() {
      return <Text text={use(store)} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      root.render(<App />);
    });
    assertLog(['A']);

    await act(async () => {
      startTransition(() => {
        store.update('B');
      });
      // A sync update to unrelated state does not include the transition.
      expect(root).toMatchRenderedOutput('A');
      await waitForPaint(['B']);
      expect(root).toMatchRenderedOutput('B');
    });
  });

  // @gate enableStore
  it('a sync update interrupts a transition and is rebased', async () => {
    const store = createStore(2, (state, action) => {
      switch (action) {
        case 'increment':
          return state + 1;
        case 'double':
          return state * 2;
        default:
          return state;
      }
    });

    function App() {
      return <Text text={use(store)} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      root.render(<App />);
    });
    assertLog([2]);

    let resolve;
    await act(async () => {
      startTransition(async () => {
        store.update('increment');
        await new Promise(r => (resolve = r));
      });
    });
    // The transition is blocked on the async action.
    assertLog([]);
    expect(root).toMatchRenderedOutput('2');

    await act(() => {
      store.update('double');
    });
    // The sync update is applied on top of the committed state.
    assertLog([4]);
    expect(root).toMatchRenderedOutput('4');

    await act(() => {
      resolve();
    });
    // Once the transition finishes, the updates are applied in the order they
    // were dispatched: (2 + 1) * 2.
    assertLog([6]);
    expect(root).toMatchRenderedOutput('6');
  });

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
    await act(() => {
      root.render(<App />);
    });
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
    await act(() => {
      setShowConditional(true);
    });
    assertLog(['Stable: 1', 'Conditional: 1']);
    expect(root).toMatchRenderedOutput('Stable: 1Conditional: 1');

    // When the transition finishes, both readers update together.
    await act(() => {
      resolve();
    });
    assertLog(['Stable: 2', 'Conditional: 2']);
    expect(root).toMatchRenderedOutput('Stable: 2Conditional: 2');
  });

  // @gate enableStore
  it('a reader that mounts during a non-blocked transition joins it', async () => {
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
    await act(() => {
      root.render(<App />);
    });
    assertLog(['Stable: 1']);

    await act(async () => {
      startTransition(() => {
        store.update(2);
      });
      // Before the transition renders, mount a new reader synchronously.
      ReactNoop.flushSync(() => {
        setShowConditional(true);
      });
      assertLog(['Stable: 1', 'Conditional: 1']);
      expect(root).toMatchRenderedOutput('Stable: 1Conditional: 1');
    });
    // The transition includes the new reader.
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
    await act(() => {
      root.render(<App />);
    });
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
  it('a reader that mounts after a sync interruption shows the rebased value', async () => {
    const store = createStore(2, (state, action) =>
      action === 'increment' ? state + 1 : state * 2
    );

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
    await act(() => {
      root.render(<App />);
    });
    assertLog(['Stable: 2']);

    let resolve;
    await act(async () => {
      startTransition(async () => {
        store.update('increment');
        await new Promise(r => (resolve = r));
      });
    });
    await act(() => {
      store.update('double');
    });
    assertLog(['Stable: 4']);

    await act(() => {
      setShowConditional(true);
    });
    assertLog(['Stable: 4', 'Conditional: 4']);
    expect(root).toMatchRenderedOutput('Stable: 4Conditional: 4');

    await act(() => {
      resolve();
    });
    assertLog(['Stable: 6', 'Conditional: 6']);
    expect(root).toMatchRenderedOutput('Stable: 6Conditional: 6');
  });

  // @gate enableStore
  it('a reader that mounts after a transition commits reads the new value', async () => {
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
    await act(() => {
      root.render(<App />);
    });
    assertLog(['Stable: 1']);

    await act(() => {
      startTransition(() => {
        store.update(2);
      });
    });
    assertLog(['Stable: 2']);

    await act(() => {
      setShowConditional(true);
    });
    assertLog(['Stable: 2', 'Conditional: 2']);
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
        </>
      );
    });
    assertLog(['Reader: 1', 'Layout effect', 'Reader: 2']);
    expect(root).toMatchRenderedOutput('Reader: 2');
  });

  // @gate enableStore
  it('does not miss updates dispatched in a passive effect before the reader subscribes', async () => {
    const store = createStore(1);

    function Updater() {
      useEffect(() => {
        Scheduler.log('Effect');
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
        </>
      );
    });
    assertLog(['Reader: 1', 'Effect', 'Reader: 2']);
    expect(root).toMatchRenderedOutput('Reader: 2');
  });

  // @gate enableStore
  it('does not miss updates dispatched while a concurrent render is in progress', async () => {
    const store = createStore(1);

    function Reader({name}) {
      return <Text text={name + ': ' + use(store)} />;
    }

    const root = ReactNoop.createRoot();
    await act(async () => {
      startTransition(() => {
        root.render(
          <>
            <Reader name="A" />
            <Reader name="B" />
          </>
        );
      });
      await waitFor(['A: 1']);
      // Update the store before B renders. The in-progress render must not
      // show different values in A and B.
      store.update(2);
    });
    assertLog(['B: 1', 'A: 2', 'B: 2']);
    expect(root).toMatchRenderedOutput('A: 2B: 2');
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

    // While a concurrent render is in progress. The readers are marked through
    // the concurrent queue, so the transition doesn't finish their lane.
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
  it('never commits readers showing different versions of the store', async () => {
    const store = createStore(1);

    function Reader({name}) {
      return <Text text={name + ': ' + use(store)} />;
    }

    // Records what each commit shows, to check that A and B always agree. It
    // reads the store so that it commits whenever the readers do.
    const commits = [];
    function CommitLogger() {
      use(store);
      useLayoutEffect(() => {
        commits.push(
          root
            .getChildren()
            .map(child => child.text)
            .join('')
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
        </>
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
    // The in-progress render ignores the update that was dispatched after it
    // started, so it finishes with the old value. The new value is rendered
    // after that. No commit shows A and B with different values.
    assertLog(['B: 2', 'A: 3', 'B: 3']);
    expect(commits).toEqual(['A: 1B: 1', 'A: 2B: 2', 'A: 3B: 3']);
    expect(root).toMatchRenderedOutput('A: 3B: 3');
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
    await act(() => {
      root.render(<App />);
    });
    assertLog(['Value: A']);

    await act(() => {
      setShouldRead(false);
    });
    assertLog(['Not reading']);

    // Updates to a store the component no longer reads don't re-render it.
    await act(() => {
      store.update('B');
    });
    assertLog([]);

    // Reading it again shows the latest value.
    await act(() => {
      setShouldRead(true);
    });
    assertLog(['Value: B']);

    await act(() => {
      store.update('C');
    });
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
    await act(() => {
      root.render(<Sum />);
    });
    assertLog(['Sum: 6']);

    await act(() => {
      stores[1].update(10);
    });
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
    await act(() => {
      root.render(<List />);
    });
    assertLog(['List', 'One', 'Two']);

    // Updating one item only re-renders the components that read it.
    await act(() => {
      todoTwo.update(prev => ({...prev, text: 'Two!'}));
    });
    assertLog(['Two!']);

    await act(() => {
      todos.update(prev => [...prev, createStore({id: 3, text: 'Three'})]);
    });
    assertLog(['List', 'One', 'Two!', 'Three']);
    expect(root).toMatchRenderedOutput('OneTwo!Three');
  });

  // @gate enableStore
  it('switches stores when a different store is passed', async () => {
    const storeA = createStore('A');
    const storeB = createStore('B');

    function Reader({store}) {
      return <Text text={use(store)} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      root.render(<Reader store={storeA} />);
    });
    assertLog(['A']);

    await act(() => {
      root.render(<Reader store={storeB} />);
    });
    assertLog(['B']);

    // Updates to the old store are ignored.
    await act(() => {
      storeA.update('A2');
    });
    assertLog([]);

    await act(() => {
      storeB.update('B2');
    });
    assertLog(['B2']);
  });

  // @gate enableStore
  it('stops updating unmounted readers and releases the root', async () => {
    const store = createStore(0);

    function Reader() {
      return <Text text={'Reader: ' + use(store)} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      root.render(<Reader />);
    });
    assertLog(['Reader: 0']);

    await act(() => {
      root.render(null);
    });
    // The commit that unmounts the last reader drops the record, so the store
    // no longer references the root, even if the store is never updated
    // again.
    await act(() => {
      store.update(1);
    });
    assertLog([]);
  });

  // @gate enableStore
  it('unsubscribes on unmount after re-rendering with the same stores', async () => {
    const store = createStore(0);
    const other = createStore('a');

    function Reader() {
      return <Text text={'Reader: ' + use(store) + use(other)} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      root.render(<Reader />);
    });
    assertLog(['Reader: 0a']);

    // Re-render with the same stores. The subscriptions are kept.
    await act(() => {
      store.update(1);
    });
    assertLog(['Reader: 1a']);
    await act(() => {
      other.update('b');
    });
    assertLog(['Reader: 1b']);

    await act(() => {
      root.render(null);
    });
    await act(() => {
      store.update(2);
      other.update('c');
    });
    assertLog([]);
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
    await act(() => {
      root.render(<Reader />);
    });
    assertLog(['AB']);

    await act(() => {
      setReversed(true);
    });
    assertLog(['BA']);

    await act(() => {
      storeA.update('A2');
    });
    assertLog(['BA2']);
    await act(() => {
      storeB.update('B2');
    });
    assertLog(['B2A2']);
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
    await act(() => {
      root.render(<Reader store={storeA} />);
    });
    assertLog(['SA']);

    await act(() => {
      root.render(<Reader store={storeB} />);
    });
    assertLog(['SB']);

    await act(() => {
      storeA.update('A2');
    });
    assertLog([]);

    await act(() => {
      shared.update('S2');
    });
    assertLog(['S2B']);
    await act(() => {
      storeB.update('B2');
    });
    assertLog(['S2B2']);

    await act(() => {
      root.render(null);
    });
    await act(() => {
      shared.update('S3');
    });
    assertLog([]);
  });

  // @gate enableStore
  it('drops the records of stores that are no longer read, among many', async () => {
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
    await act(() => {
      root.render(<List count={20} />);
    });
    assertLog(Array.from({length: 20}, (_, i) => i));

    await act(() => {
      root.render(<List count={10} />);
    });
    assertLog(Array.from({length: 10}, (_, i) => i));
    // The commit drops the records of the unmounted readers.
    for (let i = 0; i < 20; i++) {}

    await act(() => {
      stores[0].update(100);
    });
    assertLog([100]);

    // Updates to stores that aren't read anymore are applied to the value
    // a new reader starts from.
    await act(() => {
      stores[15].update(150);
    });
    assertLog([]);
    await act(() => {
      root.render(<List count={16} />);
    });
    assertLog([100, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 150]);
  });

  // @gate enableStore
  it('state survives remounting, unlike component state', async () => {
    const store = createStore(0);

    function Counter() {
      return <Text text={'Count: ' + use(store)} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      root.render(<Counter key="a" />);
    });
    assertLog(['Count: 0']);

    await act(() => {
      store.update(1);
    });
    assertLog(['Count: 1']);

    await act(() => {
      root.render(<Counter key="b" />);
    });
    assertLog(['Count: 1']);
  });

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
        </Suspense>
      );
    });
    assertLog(['Reader: A', 'Loading', 'Reader: A']);
    expect(root).toMatchRenderedOutput('Loading');

    await act(() => {
      store.update('B');
    });
    await act(() => {
      resolve();
    });
    assertLog(['Reader: B']);
    expect(root).toMatchRenderedOutput('Reader: B');

    await act(() => {
      store.update('C');
    });
    assertLog(['Reader: C']);
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
    await act(() => {
      root.render(<App />);
    });
    assertLog(['Visible: A', 'Hidden: A']);

    await act(() => {
      setMode('hidden');
    });
    assertLog(['Visible: A', 'Hidden: A']);

    await act(async () => {
      store.update('B');
      // The visible reader updates first. The hidden one updates later, at
      // offscreen priority.
      await waitForPaint(['Visible: B']);
    });
    assertLog(['Hidden: B']);

    // When it's revealed, it already shows the latest value.
    await act(() => {
      setMode('visible');
    });
    assertLog(['Visible: B', 'Hidden: B']);
    expect(root).toMatchRenderedOutput('Visible: BHidden: B');
  });

  // @gate enableStore
  it('works with multiple roots', async () => {
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

    await act(() => {
      store.update(1);
    });
    assertLog(['A: 1', 'B: 1']);
    expect(rootA).toMatchRenderedOutput('A: 1');
    expect(rootB).toMatchRenderedOutput('B: 1');

    await act(() => {
      rootA.render(null);
    });
    await act(() => {
      store.update(2);
    });
    assertLog(['B: 2']);
  });

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
    await act(() => {
      root.render(<App />);
    });
    assertLog(['Count: 0']);

    await act(() => {
      store.update(1);
      setLabel('Total');
      store.update(2);
    });
    assertLog(['Total: 2']);
  });

  // @gate enableStore
  it('applies updates inside flushSync synchronously', async () => {
    const store = createStore(0);

    function App() {
      return <Text text={'Count: ' + use(store)} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      root.render(<App />);
    });
    assertLog(['Count: 0']);

    await act(() => {
      ReactNoop.flushSync(() => {
        store.update(1);
      });
      assertLog(['Count: 1']);
      expect(root).toMatchRenderedOutput('Count: 1');
    });
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
    await act(() => {
      root.render(<App />);
    });
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

    await act(() => {
      resolve();
    });
    assertLog(['Updated B']);
    expect(root).toMatchRenderedOutput('Updated B');
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
    await act(() => {
      root.render(<App />);
    });
    assertLog(['Value: A', 'Deferred: A']);

    await act(async () => {
      store.update('B');
      await waitForPaint(['Value: B', 'Deferred: A']);
    });
    assertLog(['Value: B', 'Deferred: B']);
  });

  // @gate enableStore
  it('works in StrictMode', async () => {
    const store = createStore(0);

    function Reader() {
      return <Text text={'Reader: ' + use(store)} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      root.render(
        <StrictMode>
          <Reader />
        </StrictMode>
      );
    });
    assertLog(['Reader: 0']);

    await act(() => {
      store.update(1);
    });
    assertLog(['Reader: 1']);
    expect(root).toMatchRenderedOutput('Reader: 1');
  });

  // @gate enableStore
  it('a second transition that reverts the first commits the original value', async () => {
    const store = createStore(1);

    function App() {
      return <Text text={use(store)} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      root.render(<App />);
    });
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
  it('a sync update that produces the committed value during a transition still renders the rebased value', async () => {
    const store = createStore(1);

    function App() {
      return <Text text={use(store)} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      root.render(<App />);
    });
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
    await act(() => {
      store.update(n => n * 1);
    });
    expect(root).toMatchRenderedOutput('1');

    await act(() => {
      resolve();
    });
    assertLog([5]);
    expect(root).toMatchRenderedOutput('5');
  });
  // @gate enableStore
  it('multiple transitions that update the same store are entangled', async () => {
    const store = createStore('A');

    function App() {
      return <Text text={use(store)} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      root.render(<App />);
    });
    assertLog(['A']);

    await act(async () => {
      startTransition(() => {
        store.update('B');
      });
      // Start rendering the first transition, then dispatch a second one in a
      // separate event before the first one commits.
      await waitFor(['B']);
      startTransition(() => {
        store.update('C');
      });
    });
    // The in-progress render finishes with B since C was dispatched after it
    // started. After that, the transitions are entangled, so there's no
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
  });
  // @gate enableStore
  it('a transition does not entangle with a pending urgent update to the same store', async () => {
    const store = createStore(0);

    function App() {
      return <Text text={use(store)} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      root.render(<App />);
    });
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
  it('runs the reducer as often as useReducer', async () => {
    const store = createStore(0, (state, action) => {
      Scheduler.log('Reduce ' + state + ' + ' + action);
      return state + action;
    });

    function App() {
      return <Text text={'Value: ' + use(store)} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      root.render(<App />);
    });
    assertLog(['Value: 0']);

    // The first update to an idle store is computed eagerly, like useState.
    // It isn't computed again in render or in the commit.
    await act(() => {
      store.update(1);
      assertLog(['Reduce 0 + 1']);
    });
    assertLog(['Value: 1']);

    // Later updates in the same batch are computed during render.
    await act(() => {
      store.update(1);
      store.update(1);
      assertLog(['Reduce 1 + 1']);
    });
    assertLog(['Reduce 2 + 1', 'Value: 3']);
  });

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
    await act(() => {
      root.render(<App />);
    });
    assertLog([0]);

    await act(() => {
      store.update(1);
    });
    assertConsoleErrorDev([
      'Cannot update a store while rendering a component (`App`). ' +
        'Updating a store is a side effect, so it should happen in an event ' +
        'handler or an effect. The update will be rendered after the ' +
        'current render. To locate the bad store.update() call inside ' +
        '`App`, follow the stack trace as described in ' +
        'https://react.dev/link/setstate-in-render\n' +
        '    in App (at **)',
    ]);
    assertLog([1, 2]);
    expect(root).toMatchRenderedOutput('2');
  });

  // @gate enableStore
  it('throws an invalid hook call error when read outside a function component', async () => {
    const store = createStore(0);

    class App extends React.Component {
      render() {
        return use(store);
      }
    }

    const root = ReactNoop.createRoot();
    await expect(
      act(() => {
        root.render(<App />);
      })
    ).rejects.toThrow('Invalid hook call');
  });

  // @gate enableStore
  it('throws a reducer error during render, not when the store is updated', async () => {
    const store = createStore(0, (state, action) => {
      if (action === 'throw') {
        throw new Error('Oops');
      }
      return action;
    });

    class ErrorBoundary extends React.Component {
      state = {error: null};
      static getDerivedStateFromError(error) {
        return {error};
      }
      render() {
        if (this.state.error) {
          return <Text text={'Caught: ' + this.state.error.message} />;
        }
        return this.props.children;
      }
    }

    function App() {
      return <Text text={use(store)} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      root.render(
        <ErrorBoundary>
          <App />
        </ErrorBoundary>
      );
    });
    assertLog([0]);

    await act(() => {
      // Doesn't throw here.
      store.update('throw');
    });
    assertLog(['Caught: Oops', 'Caught: Oops']);
    expect(root).toMatchRenderedOutput('Caught: Oops');
  });

  // @gate enableStore
  it('warns about a second callback argument to store.update', async () => {
    const store = createStore(0);

    function App() {
      return <Text text={use(store)} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      root.render(<App />);
    });
    assertLog([0]);

    await act(() => {
      store.update(1, () => {});
    });
    assertConsoleErrorDev(
      [
        "store.update() doesn't support a second callback argument. " +
          'To execute a side effect after rendering, declare it in the ' +
          'component body with useEffect().',
      ],
      {withoutStack: true}
    );
    assertLog([1]);
    expect(store.update.length).toBe(1);
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
    await act(() => {
      root.render(<App />);
    });
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
    await act(() => {
      root.render(<App />);
    });
    assertLog(['Tab: a 0', 'Reader: 0']);

    await act(async () => {
      startTransition(() => {
        store.update(1);
        setTab('b');
      });
      // Unmount the only reader while the transition is pending, then commit
      // something else. The record is kept, because it has a pending update.
      ReactNoop.flushSync(() => setShow(false));
      ReactNoop.flushSync(() => setCount(1));
      // A reader that mounts in an urgent render doesn't see the transition
      // until it commits, like the tab.
      ReactNoop.flushSync(() => setShow(true));
      assertLog(['Tab: a 0', 'Tab: a 1', 'Tab: a 1', 'Reader: 0']);
      expect(root).toMatchRenderedOutput('Tab: a 1Reader: 0');
    });
    assertLog(['Tab: b 1', 'Reader: 1']);
    expect(root).toMatchRenderedOutput('Tab: b 1Reader: 1');
  });

  // @gate enableStore
  it('drops an update whose reducer throws once an error boundary handles it', async () => {
    const store = createStore(0, (state, action) => {
      if (action === 'throw') {
        throw new Error('Oops');
      }
      return action;
    });

    class ErrorBoundary extends React.Component {
      state = {error: null};
      static getDerivedStateFromError(error) {
        return {error};
      }
      render() {
        if (this.state.error) {
          return <Text text={'Caught: ' + this.state.error.message} />;
        }
        return this.props.children;
      }
    }

    function App() {
      return <Text text={'Value: ' + use(store)} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      root.render(
        <ErrorBoundary key="1">
          <App />
        </ErrorBoundary>
      );
    });
    assertLog(['Value: 0']);

    await act(() => {
      store.update('throw');
    });
    assertLog(['Caught: Oops', 'Caught: Oops']);

    await act(() => {
      store.update(1);
    });
    await act(() => {
      store.update(2);
    });
    // Like the update queue of a useReducer Hook that an error boundary
    // unmounted, the update that threw is gone. Remounting doesn't throw
    // again, and the store doesn't keep the updates around.
    await act(() => {
      root.render(
        <ErrorBoundary key="2">
          <App />
        </ErrorBoundary>
      );
    });
    assertLog(['Value: 2']);
  });

  // @gate enableStore
  it('reports a reducer error that no component rendered, and drops the update', async () => {
    global.reportError = error => {
      Scheduler.log('reportError: ' + error.message);
    };
    // reportError is read when React loads.
    jest.resetModules();
    React = require('react');
    ReactNoop = require('react-noop-renderer');
    Scheduler = require('scheduler');
    act = require('internal-test-utils').act;
    assertLog = require('internal-test-utils').assertLog;
    use = React.use;
    Activity = React.Activity;
    createStore = React.unstable_createStore;

    const store = createStore(0, (state, action) => {
      if (action === 'throw') {
        throw new Error('Oops');
      }
      return action;
    });

    function Reader() {
      return <Text text={'Reader: ' + use(store)} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      root.render(
        <Activity mode="hidden">
          <Reader />
        </Activity>
      );
    });
    assertLog(['Reader: 0']);

    // The only reader is hidden, so the commit applies the update before
    // any component reads it. The error is reported instead.
    await act(() => {
      store.update('throw');
    });
    assertLog(['reportError: Oops']);

    await act(() => {
      store.update(1);
    });
    assertLog(['Reader: 1']);
  });

  // @gate enableStore
  it('throws a reducer error from store.update when nothing reads the store', async () => {
    const store = createStore(0, (state, action) => {
      if (action === 'throw') {
        throw new Error('Oops');
      }
      return action;
    });

    store.update(1);
    // There's no render to throw the error in, so it throws here, and the
    // update isn't applied.
    expect(() => store.update('throw')).toThrow('Oops');
    store.update(2);

    function App() {
      return <Text text={'Value: ' + use(store)} />;
    }
    const root = ReactNoop.createRoot();
    await act(() => {
      root.render(<App />);
    });
    assertLog(['Value: 2']);
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
        </>
      );
    });
    assertLog(['Loose: 0', 'Strict: 0']);

    await act(() => {
      store.update(1);
    });
    // Once for the eager state, and once more for the reader in StrictMode.
    assertLog(['reducer', 'Loose: 1', 'reducer', 'Strict: 1']);
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
        </Suspense>
      );
    });
    assertLog(['Loading']);
    // The Consumer never committed. The boundary is subscribed instead.

    await act(() => {
      store.update({status: 'fulfilled', value: 'Result', then() {}});
    });
    assertLog(['Result']);
    expect(root).toMatchRenderedOutput('Result');
    // Now the Consumer is subscribed, and the boundary isn't.
    const readers = Array.from(store._records[0].readers);
    expect(readers.length).toBe(1);
    expect(readers[0].type).toBe(Consumer);
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
        </Suspense>
      );
    });
    assertLog(['Nothing']);

    await act(() => {
      setShow(true);
    });
    assertLog(['Loading']);
    expect(root).toMatchRenderedOutput('Loading');

    await act(() => {
      store.update({status: 'fulfilled', value: 'Result', then() {}});
    });
    assertLog(['Result']);
    expect(root).toMatchRenderedOutput('Result');
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
        </Suspense>
      );
    });
    assertLog(['Loading']);

    await act(() => {
      root.render(null);
    });
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
        </>
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
      // The sync render skips the transition in both stores: no reader sees
      // a=1 without b=1. A isn't re-rendered (it doesn't read b), and its
      // committed value is still 0.
      assertLog(['B:0', 'Both:0,0']);
      expect(root).toMatchRenderedOutput('A:0 B:0 Both:0,0');
    });
    // Then the transition is rebased: updates are applied in dispatch order
    // across both stores, b = (0 + 1) * 10.
    assertLog(['A:1', 'B:10', 'Both:1,10']);
    expect(root).toMatchRenderedOutput('A:1 B:10 Both:1,10');
  });

  // @gate enableStore
  it('a transition that updates two stores commits them together, even when they are read in separate subtrees', async () => {
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
      return 'B:' + value;
    }

    const root = ReactNoop.createRoot();
    await act(() => {
      root.render(
        <>
          <ReadA />
          <ReadB />
        </>
      );
    });
    assertLog(['A:0', 'B:0']);

    await act(async () => {
      startTransition(() => {
        a.update(1);
        b.update(1);
      });
      await waitFor(['A:1']);
      // Partially rendered: nothing has committed yet.
      expect(root).toMatchRenderedOutput('A:0 B:0');
    });
    assertLog(['B:1']);
    expect(root).toMatchRenderedOutput('A:1 B:1');
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
        </>
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
    await act(() => {
      root.render(<Reader />);
    });
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
    await act(() => {
      store.update(1);
    });
    assertLog(['Reader: 1']);
    expect(root).toMatchRenderedOutput('Value: 1 0');
  });

  // @gate enableStore && enableGestureTransition
  it('a store update that throws inside a gesture transition does not change the store', async () => {
    global.reportError = error => {
      Scheduler.log('reportError: ' + error.message.split('.')[0]);
    };
    // reportError is read when React loads.
    jest.resetModules();
    React = require('react');
    ReactNoop = require('react-noop-renderer');
    Scheduler = require('scheduler');
    act = require('internal-test-utils').act;
    assertLog = require('internal-test-utils').assertLog;
    use = React.use;
    createStore = React.unstable_createStore;

    const store = createStore(0);

    function Reader({name}) {
      return <Text text={name + ': ' + use(store)} />;
    }

    const root1 = ReactNoop.createRoot();
    await act(() => {
      root1.render(<Reader name="A" />);
    });
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
    await act(() => {
      root2.render(<Reader name="B" />);
    });
    assertLog(['B: 0']);

    await act(() => {
      store.update(n => n + 1);
    });
    assertLog(['A: 1', 'B: 1']);
    expect(root1).toMatchRenderedOutput('A: 1');
    expect(root2).toMatchRenderedOutput('B: 1');
  });
});
