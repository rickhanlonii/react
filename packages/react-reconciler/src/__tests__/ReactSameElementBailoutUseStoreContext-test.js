/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 * @jest-environment node
 */

// The context cases of ReactSameElementBailout-test.js, with context replaced
// by `use(store)`. See "Differences from context" in docs/use-store/DESIGN.md.

'use strict';

let React;
let ReactNoop;
let Scheduler;
let act;
let assertLog;
let use;
let useState;
let useMemo;
let createStore;

describe('ReactSameElementBailout', () => {
  beforeEach(() => {
    jest.resetModules();
    React = require('react');
    ReactNoop = require('react-noop-renderer');
    Scheduler = require('scheduler');
    act = require('internal-test-utils').act;
    assertLog = require('internal-test-utils').assertLog;
    use = React.use;
    useState = React.useState;
    useMemo = React.useMemo;
    createStore = React.unstable_createStore;
  });

  function Text({text}) {
    Scheduler.log(text);
    return text;
  }

  // @gate enableStore
  it('propagates a context change to consumers below the child', async () => {
    const store = createStore(0);
    function Consumer() {
      return <Text text={'Consumer ' + use(store)} />;
    }
    function Middle() {
      Scheduler.log('Middle');
      return <Consumer />;
    }
    function Parent({value}) {
      Scheduler.log('Parent ' + value);
      return useMemo(() => <Middle />, []);
    }
    function App({value}) {
      return <Parent value={value} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<App value={0} />));
    assertLog(['Parent 0', 'Middle', 'Consumer 0']);

    // The parent re-renders and returns the same element, and the store
    // update reaches the reader below it.
    await act(() => {
      root.render(<App value={1} />);
      store.update(1);
    });
    assertLog(['Parent 1', 'Consumer 1']);
    expect(root).toMatchRenderedOutput('Consumer 1');
  });

  // @gate enableStore
  it('keeps the context dependencies of the render that bailed out', async () => {
    const store = createStore('A');
    let setRead;
    function Parent() {
      const [read, _setRead] = useState(false);
      setRead = _setRead;
      const value = read ? use(store) : null;
      Scheduler.log('Parent ' + value);
      return useMemo(() => <Text text="Child" />, []);
    }
    const MemoParent = React.memo(Parent);
    function App() {
      return <MemoParent />;
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<App />));
    assertLog(['Parent null', 'Child']);

    // Parent starts reading the store in a render that returns the same
    // element.
    await act(() => setRead(true));
    assertLog(['Parent A']);

    // It's now subscribed, so an update re-renders it.
    await act(() => store.update('B'));
    assertLog(['Parent B']);
  });
});
