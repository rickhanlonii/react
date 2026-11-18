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
let ReactNoopSecond;
let Scheduler;
let act;
let use;
let useState;
let startTransition;
let assertLog;
let createStore;

describe('ReactUseStoreMultipleRenderers', () => {
  beforeEach(() => {
    jest.resetModules();
    React = require('react');
    const ReactSharedInternals = require('shared/ReactSharedInternals');
    Scheduler = require('scheduler');
    ReactNoop = require('react-noop-renderer');
    const InternalTestUtils = require('internal-test-utils');
    act = InternalTestUtils.act;
    assertLog = InternalTestUtils.assertLog;

    // A second copy of the reconciler, like react-dom and react-art on the
    // same page. It shares React and the Scheduler with the first one.
    jest.resetModules();
    jest.doMock('react', () => React);
    jest.doMock('shared/ReactSharedInternals', () => ReactSharedInternals);
    jest.doMock('scheduler', () => Scheduler);
    ReactNoopSecond = require('react-noop-renderer');

    use = React.use;
    useState = React.useState;
    startTransition = React.startTransition;
    createStore = React.unstable_createStore;
  });

  afterEach(() => {
    // Restore the mocks of the test setup.
    global.__unmockReact();
    jest.doMock('scheduler', () =>
      jest.requireActual('scheduler/unstable_mock'),
    );
  });

  function Text({text}) {
    Scheduler.log(text);
    return text;
  }

  async function useUpTransitionLane(renderer) {
    // Each renderer assigns transition lanes on its own. Use one up in this
    // renderer, so the renderers pick different lanes for the next one.
    const root = renderer.createRoot();
    await act(() => {
      startTransition(() => {
        root.render(<Text text="Other root" />);
      });
    });
    assertLog(['Other root']);
  }

  async function testHeldUpdate(readingRenderer, otherRenderer) {
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

    await useUpTransitionLane(otherRenderer);

    const root = readingRenderer.createRoot();
    await act(() => {
      root.render(<App />);
    });
    assertLog(['Nothing']);

    // Nothing reads the store yet, so its update is held until the async
    // action is done.
    let resolve;
    await act(() => {
      startTransition(async () => {
        store.update(n => n * 2);
        await new Promise(r => (resolve = r));
      });
    });

    // Mount the first reader in an urgent update while the action is
    // pending. Like useReducer, it shouldn't see the action's update.
    await act(() => {
      readingRenderer.flushSync(() => setShow(true));
    });
    assertLog(['Reader: 1']);
    expect(root).toMatchRenderedOutput('Reader: 1');

    await act(() => resolve());
    assertLog(['Reader: 2']);
    expect(root).toMatchRenderedOutput('Reader: 2');
    expect(store._pendingTransitionUpdates).toBe(null);
  }

  // @gate enableStore
  it('holds an update until its async action is done in the first renderer', async () => {
    await testHeldUpdate(ReactNoop, ReactNoopSecond);
  });

  // @gate enableStore
  it('holds an update until its async action is done in the last renderer', async () => {
    await testHeldUpdate(ReactNoopSecond, ReactNoop);
  });

  // @gate enableStore
  it('applies a held update once in each renderer that reads the store', async () => {
    const store = createStore('', (state, action) => state + action);

    function Reader() {
      return <Text text={'Reader: ' + use(store)} />;
    }

    const root = ReactNoop.createRoot();
    const secondRoot = ReactNoopSecond.createRoot();

    // Held, because nothing reads the store, then applied to the latest
    // value once its transition is done.
    await act(() => {
      startTransition(() => store.update('A'));
    });
    store.update('B');

    await act(() => {
      root.render(<Reader />);
    });
    assertLog(['Reader: AB']);
    await act(() => {
      secondRoot.render(<Reader />);
    });
    assertLog(['Reader: AB']);
    expect(store._pendingTransitionUpdates).toBe(null);

    await act(() => store.update('C'));
    assertLog(['Reader: ABC', 'Reader: ABC']);
  });
});
