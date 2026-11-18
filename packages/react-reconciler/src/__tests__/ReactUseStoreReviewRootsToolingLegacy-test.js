/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 */

'use strict';

// Review (slice 5): legacy roots next to concurrent roots. Legacy mode is
// only on in the React Native builds, so these run on
// `-r=xplat --variant=true`.

let React;
let ReactNoop;
let Scheduler;
let act;
let assertLog;
let assertConsoleErrorDev;
let use;
let useEffect;
let useLayoutEffect;
let createStore;

describe('ReactUseStoreReviewRootsToolingLegacy', () => {
  beforeEach(() => {
    jest.resetModules();
    React = require('react');
    ReactNoop = require('react-noop-renderer');
    Scheduler = require('scheduler');
    ({act, assertLog, assertConsoleErrorDev} = require('internal-test-utils'));
    use = React.use;
    useEffect = React.useEffect;
    useLayoutEffect = React.useLayoutEffect;
    createStore = React.unstable_createStore;
  });

  function Text({text}) {
    Scheduler.log(text);
    return text;
  }

  // @gate enableStore && !disableLegacyMode
  it('a concurrent root applies updates in dispatch order when a legacy root dispatches from a layout effect inside store.update', async () => {
    const store = createStore('init');

    // The legacy root reads the store first, so it gets the first record and
    // store.update dispatches to it first.
    function LegacyReader() {
      const value = use(store);
      useLayoutEffect(() => {
        if (value === 'a') {
          store.update('b');
        }
      });
      return <Text text={'Legacy: ' + value} />;
    }
    ReactNoop.renderLegacySyncRoot(<LegacyReader />);
    assertLog(['Legacy: init']);

    function Reader() {
      return <Text text={'Concurrent: ' + use(store)} />;
    }
    const root = ReactNoop.createRoot();
    await act(() => root.render(<Reader />));
    assertLog(['Concurrent: init']);

    // Not batched, so the legacy root renders synchronously before
    // store.update returns. Its layout effect dispatches 'b' after 'a'.
    global.IS_REACT_ACT_ENVIRONMENT = false;
    store.update('a');
    const syncLog = Scheduler.unstable_clearLog();
    global.IS_REACT_ACT_ENVIRONMENT = true;
    await act(() => {});
    const concurrentLog = Scheduler.unstable_clearLog();
    expect(syncLog).toEqual(['Legacy: a', 'Legacy: b']);
    expect(concurrentLog).toEqual(['Concurrent: b']);

    // Dispatch order is 'a', then 'b'. Every root should end on 'b'.
    expect(ReactNoop.getChildrenAsJSX()).toEqual('Legacy: b');
    expect(root).toMatchRenderedOutput('Concurrent: b');
  });

  // @gate enableStore && !disableLegacyMode
  it('a concurrent root applies updates in dispatch order when a legacy root dispatches from a passive effect inside store.update', async () => {
    const store = createStore('init');

    function LegacyReader() {
      const value = use(store);
      useEffect(() => {
        if (value === 'a') {
          store.update('b');
        }
      });
      return <Text text={'Legacy: ' + value} />;
    }
    ReactNoop.renderLegacySyncRoot(<LegacyReader />);
    assertLog(['Legacy: init']);

    function Reader() {
      return <Text text={'Concurrent: ' + use(store)} />;
    }
    const root = ReactNoop.createRoot();
    await act(() => root.render(<Reader />));
    assertLog(['Concurrent: init']);

    global.IS_REACT_ACT_ENVIRONMENT = false;
    store.update('a');
    const syncLog = Scheduler.unstable_clearLog();
    global.IS_REACT_ACT_ENVIRONMENT = true;
    await act(() => {});
    const concurrentLog = Scheduler.unstable_clearLog();
    // Legacy roots don't flush passive effects synchronously, so 'b' is
    // dispatched after the outer store.update has reached every root.
    expect(syncLog).toEqual(['Legacy: a']);
    expect(concurrentLog).toEqual(['Legacy: b', 'Concurrent: b']);

    expect(ReactNoop.getChildrenAsJSX()).toEqual('Legacy: b');
    expect(root).toMatchRenderedOutput('Concurrent: b');
  });

  // @gate enableStore && !disableLegacyMode
  it('two legacy roots apply updates in dispatch order when the first dispatches from componentDidUpdate inside store.update', async () => {
    const store = createStore('init');

    class First extends React.Component {
      componentDidUpdate() {
        if (this.props.value === 'a') {
          store.update('b');
        }
      }
      render() {
        return <Text text={'First: ' + this.props.value} />;
      }
    }
    function FirstReader() {
      return <First value={use(store)} />;
    }
    function SecondReader() {
      return <Text text={'Second: ' + use(store)} />;
    }

    const first = ReactNoop.createLegacyRoot();
    const second = ReactNoop.createLegacyRoot();
    await act(() => first.render(<FirstReader />));
    assertLog(['First: init']);
    await act(() => second.render(<SecondReader />));
    assertLog(['Second: init']);

    global.IS_REACT_ACT_ENVIRONMENT = false;
    store.update('a');
    global.IS_REACT_ACT_ENVIRONMENT = true;
    // Today: 'First: a', 'Second: b', 'First: b', 'Second: a'. The first
    // root renders 'a' synchronously, and 'b' from its componentDidUpdate
    // reaches the second root before 'a' does.
    Scheduler.unstable_clearLog();
    await act(() => {});
    assertLog([]);

    expect(first).toMatchRenderedOutput('First: b');
    expect(second).toMatchRenderedOutput('Second: b');
  });

  // @gate enableStore && !disableLegacyMode
  it('a legacy reader that mounts while an async action holds an update to the store', async () => {
    const store = createStore(1);
    function Reader() {
      return <Text text={'Reader: ' + use(store)} />;
    }

    // Nothing reads the store, so the action's update is held.
    let resolve;
    await act(() => {
      React.startTransition(async () => {
        store.update(2);
        await new Promise(r => (resolve = r));
      });
    });

    // Today this throws the action's thenable out of act: the legacy root
    // takes over the held update with its transition lane, renders that lane
    // with renderRootConcurrent, and the reader suspends on the action.
    await act(() => ReactNoop.renderLegacySyncRoot(<Reader />));
    // Which value a legacy root should show while the action is pending is a
    // design question (a concurrent root shows 1; legacy roots render every
    // update synchronously). Either way it must not throw.
    const mountLog = Scheduler.unstable_clearLog();
    expect(
      mountLog.join() === 'Reader: 1' || mountLog.join() === 'Reader: 2',
    ).toBe(true);

    await act(() => resolve());
    Scheduler.unstable_clearLog();
    expect(ReactNoop.getChildrenAsJSX()).toEqual('Reader: 2');
    expect(store._pendingTransitionUpdates).toBe(null);
    expect(store._headQueue).toBe(null);

    await act(() => store.update(3));
    assertLog(['Reader: 3']);
  });

  // @gate enableStore && !disableLegacyMode
  it('a legacy reader that mounts in the same transition as a held update', async () => {
    const store = createStore(1);
    function Reader() {
      return <Text text={'Reader: ' + use(store)} />;
    }
    await act(() => {
      React.startTransition(() => {
        store.update(2);
        ReactNoop.renderLegacySyncRoot(<Reader />);
      });
    });
    Scheduler.unstable_clearLog();
    expect(ReactNoop.getChildrenAsJSX()).toEqual('Reader: 2');
    expect(store._pendingTransitionUpdates).toBe(null);
    expect(store._headQueue).toBe(null);
  });

  // @gate enableStore && !disableLegacyMode
  it('a store update retries a legacy boundary whose reader suspended on mount', async () => {
    const store = createStore('A');
    const resolved = new Set(['B']);
    const never = new Promise(() => {});
    function AsyncReader() {
      const value = use(store);
      if (!resolved.has(value)) {
        Scheduler.log('Suspend! ' + value);
        throw never;
      }
      return <Text text={'Reader: ' + value} />;
    }
    await act(() => {
      ReactNoop.renderLegacySyncRoot(
        <React.Suspense fallback={<Text text="Loading" />}>
          <AsyncReader />
        </React.Suspense>,
      );
    });
    assertLog(['Suspend! A', 'Loading']);
    expect(ReactNoop.getChildrenAsJSX()).toEqual('Loading');
    // Today the boundary doesn't subscribe: in legacy mode the suspended
    // fiber's tag is changed to IncompleteFunctionComponent before its reads
    // are collected, and the collection skips that tag. The record is dropped.
    expect(store._records.length).toBe(1);

    await act(() => store.update('B'));
    assertLog(['Reader: B']);
    expect(ReactNoop.getChildrenAsJSX()).toEqual('Reader: B');

    await act(() => ReactNoop.renderLegacySyncRoot(null));
    expect(store._records.length).toBe(0);
  });

  // @gate enableStore && !disableLegacyMode
  it('a store update during render in a legacy root is rendered after the render', async () => {
    const store = createStore(0);
    function Reader() {
      const value = use(store);
      if (value === 1) {
        store.update(2);
      }
      return <Text text={'Reader: ' + value} />;
    }
    await act(() => ReactNoop.renderLegacySyncRoot(<Reader />));
    assertLog(['Reader: 0']);
    await act(() => store.update(1));
    assertConsoleErrorDev([
      'Cannot update a store while rendering a component (`Reader`). ' +
        'Updating a store is a side effect, so it should happen in an event ' +
        'handler or an effect. The update will be rendered after the current ' +
        'render. To locate the bad store.update() call inside `Reader`, ' +
        'follow the stack trace as described in ' +
        'https://react.dev/link/setstate-in-render\n' +
        '    in Reader (at **)',
    ]);
    assertLog(['Reader: 1', 'Reader: 2']);
    expect(ReactNoop.getChildrenAsJSX()).toEqual('Reader: 2');
  });

  // @gate enableStore && !disableLegacyMode
  it('a store update retries a legacy boundary whose suspended component is below the reader', async () => {
    const store = createStore('A');
    const resolved = new Set(['B']);
    const never = new Promise(() => {});
    function Suspender({value}) {
      if (!resolved.has(value)) {
        Scheduler.log('Suspend! ' + value);
        throw never;
      }
      return <Text text={'Reader: ' + value} />;
    }
    function Reader() {
      return <Suspender value={use(store)} />;
    }
    await act(() => {
      ReactNoop.renderLegacySyncRoot(
        <React.Suspense fallback={<Text text="Loading" />}>
          <Reader />
        </React.Suspense>,
      );
    });
    assertLog(['Suspend! A', 'Loading']);

    await act(() => store.update('B'));
    assertLog(['Reader: B']);
    expect(ReactNoop.getChildrenAsJSX()).toEqual('Reader: B');
  });

  // @gate enableStore && !disableLegacyMode
  it('a store update retries a legacy boundary whose mounted reader suspended on an update', async () => {
    const store = createStore('A');
    const resolved = new Set(['A', 'C']);
    const never = new Promise(() => {});
    function AsyncReader() {
      const value = use(store);
      if (!resolved.has(value)) {
        Scheduler.log('Suspend! ' + value);
        throw never;
      }
      return <Text text={'Reader: ' + value} />;
    }
    await act(() => {
      ReactNoop.renderLegacySyncRoot(
        <React.Suspense fallback={<Text text="Loading" />}>
          <AsyncReader />
        </React.Suspense>,
      );
    });
    assertLog(['Reader: A']);
    await act(() => store.update('B'));
    assertLog(['Suspend! B', 'Loading']);
    await act(() => store.update('C'));
    assertLog(['Reader: C']);
    expect(ReactNoop.getChildrenAsJSX()).toEqual('Reader: C');
  });
});
