/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 */

'use strict';

// use(store) in legacy roots. A store update on a legacy root is a SyncLane
// update, which renders before store.update returns unless it's batched, and
// legacy Suspense commits the siblings of a component that suspended. Legacy
// mode is only on in the React Native builds, so these run on
// `-r=xplat --variant=true`.

let React;
let ReactNoop;
let Scheduler;
let act;
let assertLog;
let use;
let createStore;
let Suspense;
let useLayoutEffect;

describe('ReactUseStoreLegacyMode', () => {
  beforeEach(() => {
    jest.resetModules();
    React = require('react');
    ReactNoop = require('react-noop-renderer');
    Scheduler = require('scheduler');
    ({act, assertLog} = require('internal-test-utils'));
    use = React.use;
    createStore = React.unstable_createStore;
    Suspense = React.Suspense;
    useLayoutEffect = React.useLayoutEffect;
  });

  function Text({text}) {
    Scheduler.log(text);
    return text;
  }

  function createSuspender() {
    let resolved = false;
    let resolve;
    const promise = new Promise(r => {
      resolve = () => {
        resolved = true;
        r();
      };
    });
    function Suspender() {
      if (!resolved) {
        Scheduler.log('Suspend!');
        throw promise;
      }
      return <Text text="Resolved" />;
    }
    return {Suspender, resolve: () => resolve()};
  }

  // The store keeps a record for each root that reads it, until the last
  // reader on that root unmounts.
  function expectNoRootRecords(store) {
    expect(store._records.length).toBe(0);
  }

  // @gate enableStore && !disableLegacyMode
  it('renders batched store updates in one synchronous render', () => {
    const store = createStore(0);

    function Reader() {
      return <Text text={'Reader: ' + use(store)} />;
    }

    ReactNoop.renderLegacySyncRoot(<Reader />);
    assertLog(['Reader: 0']);

    // The updates render together when the batch ends, without waiting for
    // the scheduler.
    ReactNoop.batchedUpdates(() => {
      store.update(n => n + 1);
      store.update(n => n + 1);
      assertLog([]);
    });
    assertLog(['Reader: 2']);
    expect(ReactNoop).toMatchRenderedOutput('Reader: 2');
  });

  // @gate enableStore && !disableLegacyMode
  it('renders a store update from componentWillMount in the same batch as the mount', () => {
    const store = createStore(0);

    function A() {
      return <Text text={'A' + use(store)} />;
    }

    class B extends React.Component {
      UNSAFE_componentWillMount() {
        store.update(1);
      }
      render() {
        return <Text text="B" />;
      }
    }

    ReactNoop.batchedUpdates(() => {
      ReactNoop.renderLegacySyncRoot(
        <>
          <A />
          <B />
        </>,
      );
    });
    // A mounted with the value it read, and then caught up, without a warning.
    assertLog(['A0', 'B', 'A1']);
    expect(ReactNoop).toMatchRenderedOutput('A1B');
  });

  // @gate enableStore && !disableLegacyMode
  it('renders a store update from componentWillUnmount for a reader mounted in the same commit', () => {
    const store = createStore(false);

    class A extends React.Component {
      componentWillUnmount() {
        store.update(true);
      }
      render() {
        return <Text text="A" />;
      }
    }

    function B() {
      return <Text text={use(store) ? 'B No Sibling' : 'B'} />;
    }

    ReactNoop.renderLegacySyncRoot(<A />);
    assertLog(['A']);

    ReactNoop.renderLegacySyncRoot(<B />);
    assertLog(['B', 'B No Sibling']);
    expect(ReactNoop).toMatchRenderedOutput('B No Sibling');
  });

  // @gate enableStore && !disableLegacyMode
  it('throws on an update loop in a layout effect, and does not apply the update that hit the limit', async () => {
    const store = createStore(0);
    let lastRendered;

    function NonTerminating() {
      const step = use(store);
      lastRendered = step;
      React.useLayoutEffect(() => {
        store.update(n => n + 1);
      });
      return step;
    }

    await expect(async () => {
      await act(() => {
        ReactNoop.renderLegacySyncRoot(<NonTerminating />);
      });
    }).rejects.toThrow('Maximum');

    // A root that starts reading the store sees the last value that rendered.
    function Reader() {
      return use(store);
    }
    const root = ReactNoop.createLegacyRoot();
    await act(() => {
      root.render(<Reader />);
    });
    expect(root).toMatchRenderedOutput(String(lastRendered));
  });

  // @gate enableStore && !disableLegacyMode
  it('re-hides a reader that a store update changes while the boundary shows its fallback', async () => {
    const store = createStore('A');
    const {Suspender, resolve} = createSuspender();

    function Sibling() {
      const value = use(store);
      Scheduler.log('Sibling: ' + value);
      return <span prop={'Sibling: ' + value} />;
    }

    function App() {
      return (
        <Suspense fallback={<Text text="Loading..." />}>
          <Sibling />
          <Suspender />
        </Suspense>
      );
    }

    await act(() => {
      ReactNoop.renderLegacySyncRoot(<App />);
    });
    assertLog(['Sibling: A', 'Suspend!', 'Loading...']);
    expect(ReactNoop).toMatchRenderedOutput(
      <>
        <span hidden={true} prop="Sibling: A" />
        Loading...
      </>,
    );

    // The update commits to the hidden sibling, which has to stay hidden.
    await act(() => {
      store.update('B');
    });
    assertLog(['Sibling: B', 'Suspend!']);
    expect(ReactNoop).toMatchRenderedOutput(
      <>
        <span hidden={true} prop="Sibling: B" />
        Loading...
      </>,
    );

    await act(() => {
      resolve();
    });
    assertLog(['Resolved']);
    expect(ReactNoop).toMatchRenderedOutput(
      <>
        <span prop="Sibling: B" />
        Resolved
      </>,
    );
  });

  // @gate enableStore && !disableLegacyMode
  it('commits the siblings of a component that suspends because of a store update', async () => {
    const store = createStore(false);
    const {Suspender, resolve} = createSuspender();

    class Child extends React.Component {
      componentDidMount() {
        Scheduler.log('cDM ' + this.props.id);
      }
      componentDidUpdate() {
        Scheduler.log('cDU ' + this.props.id);
      }
      render() {
        return <span prop={this.props.id} />;
      }
    }

    function App() {
      const suspend = use(store);
      return (
        <Suspense fallback={<Text text="Loading..." />}>
          <Child id="first" />
          <Child id="second" />
          {suspend && <Suspender />}
        </Suspense>
      );
    }

    ReactNoop.renderLegacySyncRoot(<App />);
    assertLog(['cDM first', 'cDM second']);

    // The siblings commit in their hidden, updated state, so their
    // componentDidUpdate runs even though the boundary shows its fallback.
    await act(() => {
      store.update(true);
    });
    assertLog(['Suspend!', 'Loading...', 'cDU first', 'cDU second']);
    expect(ReactNoop).toMatchRenderedOutput(
      <>
        <span hidden={true} prop="first" />
        <span hidden={true} prop="second" />
        Loading...
      </>,
    );

    await act(() => {
      resolve();
    });
    assertLog(['Resolved']);
    expect(ReactNoop).toMatchRenderedOutput(
      <>
        <span prop="first" />
        <span prop="second" />
        Resolved
      </>,
    );
  });

  // @gate enableStore && !disableLegacyMode
  it('a reader that committed next to a sibling that suspended on mount renders store updates', async () => {
    const store = createStore('A');
    const {Suspender, resolve} = createSuspender();

    function Reader() {
      return <Text text={'Reader: ' + use(store)} />;
    }

    function App() {
      return (
        <Suspense fallback={<Text text="Loading..." />}>
          <Reader />
          <Suspender />
        </Suspense>
      );
    }

    await act(() => {
      ReactNoop.renderLegacySyncRoot(<App />);
    });
    assertLog(['Reader: A', 'Suspend!', 'Loading...']);
    expect(ReactNoop).toMatchRenderedOutput('Loading...');

    // Update the store without resolving the promise.
    await act(() => {
      store.update('B');
    });
    assertLog(['Reader: B', 'Suspend!']);
    expect(ReactNoop).toMatchRenderedOutput('Loading...');

    await act(() => {
      resolve();
    });
    assertLog(['Resolved']);
    expect(ReactNoop).toMatchRenderedOutput('Reader: BResolved');

    // Once the boundary is revealed, only the reader re-renders.
    await act(() => {
      store.update('C');
    });
    assertLog(['Reader: C']);
    expect(ReactNoop).toMatchRenderedOutput('Reader: CResolved');

    await act(() => {
      ReactNoop.renderLegacySyncRoot(null);
    });
    expectNoRootRecords(store);
  });

  // @gate enableStore && !disableLegacyMode
  it('a mounted reader that suspends on an update renders store updates', async () => {
    const store = createStore('A');
    const {Suspender, resolve} = createSuspender();

    function Reader({suspend}) {
      const value = use(store);
      return (
        <>
          <Text text={'Reader: ' + value} />
          {suspend && <Suspender />}
        </>
      );
    }

    function App({suspend}) {
      return (
        <Suspense fallback={<Text text="Loading..." />}>
          <Reader suspend={suspend} />
        </Suspense>
      );
    }

    await act(() => {
      ReactNoop.renderLegacySyncRoot(<App suspend={false} />);
    });
    assertLog(['Reader: A']);
    expect(ReactNoop).toMatchRenderedOutput('Reader: A');

    await act(() => {
      ReactNoop.renderLegacySyncRoot(<App suspend={true} />);
    });
    assertLog(['Reader: A', 'Suspend!', 'Loading...']);
    expect(ReactNoop).toMatchRenderedOutput('Loading...');

    // Update the store while the reader is suspended.
    await act(() => {
      store.update('B');
    });
    assertLog(['Reader: B', 'Suspend!']);
    expect(ReactNoop).toMatchRenderedOutput('Loading...');

    // The reader committed with B while suspended, so the retry only renders
    // the component that suspended.
    await act(() => {
      resolve();
    });
    assertLog(['Resolved']);
    expect(ReactNoop).toMatchRenderedOutput('Reader: BResolved');

    await act(() => {
      store.update('C');
    });
    assertLog(['Reader: C', 'Resolved']);
    expect(ReactNoop).toMatchRenderedOutput('Reader: CResolved');

    await act(() => {
      ReactNoop.renderLegacySyncRoot(null);
    });
    expectNoRootRecords(store);
  });
  // @gate enableStore && !disableLegacyMode
  it('delivers updates to every root in dispatch order when a legacy root updates the store from a layout effect while it is dispatched to', async () => {
    const store = createStore('init');

    // The legacy root reads the store first, so store.update dispatches to it
    // first.
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

    // Not batched, so the legacy root renders 'a' before store.update
    // returns, and its layout effect dispatches 'b'. 'b' reaches the
    // concurrent root after 'a' does.
    global.IS_REACT_ACT_ENVIRONMENT = false;
    store.update('a');
    global.IS_REACT_ACT_ENVIRONMENT = true;
    assertLog(['Legacy: a', 'Legacy: b']);
    await act(() => {});
    assertLog(['Concurrent: b']);
    expect(ReactNoop.getChildrenAsJSX()).toEqual('Legacy: b');
    expect(root).toMatchRenderedOutput('Concurrent: b');
  });

  // @gate enableStore && !disableLegacyMode
  it('delivers updates to two legacy roots in dispatch order when the first updates the store from componentDidUpdate', async () => {
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

    // The first root renders 'a' and dispatches 'b' from its commit. The
    // second root gets 'a' before 'b', and renders them together once the
    // first root's commit is done.
    global.IS_REACT_ACT_ENVIRONMENT = false;
    store.update('a');
    global.IS_REACT_ACT_ENVIRONMENT = true;
    assertLog(['First: a', 'Second: b', 'First: b']);
    await act(() => {});
    assertLog([]);
    expect(first).toMatchRenderedOutput('First: b');
    expect(second).toMatchRenderedOutput('Second: b');
  });

  // @gate enableStore && !disableLegacyMode
  it('a legacy reader that mounts while an async action holds an update to the store renders it synchronously', async () => {
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

    // A legacy root renders every update synchronously, like a setState in
    // an action on a legacy root, so it takes the held update without
    // waiting for the action.
    await act(() => ReactNoop.renderLegacySyncRoot(<Reader />));
    assertLog(['Reader: 2']);

    await act(() => resolve());
    assertLog([]);
    expect(ReactNoop.getChildrenAsJSX()).toEqual('Reader: 2');
    expect(store._pendingTransitionUpdates).toBe(null);
    expect(store._headQueue).toBe(null);

    await act(() => store.update(3));
    assertLog(['Reader: 3']);
  });

  // @gate enableStore && !disableLegacyMode
  it('a store update retries a boundary whose reader suspended on mount', async () => {
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
        <Suspense fallback={<Text text="Loading" />}>
          <AsyncReader />
        </Suspense>,
      );
    });
    assertLog(['Suspend! A', 'Loading']);
    expect(ReactNoop.getChildrenAsJSX()).toEqual('Loading');
    // In legacy mode the render of a component that suspends is reset before
    // the boundary collects its reads, so they're taken before the reset.
    // The boundary subscribes, and keeps the store's record.
    expect(store._records.length).toBe(1);

    await act(() => store.update('B'));
    assertLog(['Reader: B']);
    expect(ReactNoop.getChildrenAsJSX()).toEqual('Reader: B');

    await act(() => ReactNoop.renderLegacySyncRoot(null));
    expectNoRootRecords(store);
  });
});
