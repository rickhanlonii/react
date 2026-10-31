/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 */

'use strict';

// The context cases of ReactUse-test.js, with context replaced by
// `use(store)`. See "Context copies" in docs/use-store/COPY_RULES.md.

let React;
let ReactNoop;
let Scheduler;
let use;
let startTransition;
let waitForPaint;
let assertLog;
let waitForAll;
let createStore;

describe('ReactUse', () => {
  beforeEach(() => {
    jest.resetModules();

    React = require('react');
    ReactNoop = require('react-noop-renderer');
    Scheduler = require('scheduler');
    use = React.use;
    startTransition = React.startTransition;
    createStore = React.unstable_createStore;

    const InternalTestUtils = require('internal-test-utils');
    waitForAll = InternalTestUtils.waitForAll;
    assertLog = InternalTestUtils.assertLog;
    waitForPaint = InternalTestUtils.waitForPaint;
  });

  function Text({text}) {
    Scheduler.log(text);
    return text;
  }

  // @gate enableStore
  it('basic use(context)', async () => {
    // The Provider's value is the store's initial value. ContextB has no
    // Provider, so its store has the context's default value.
    const storeA = createStore('A');
    const storeB = createStore('B');

    function Sync() {
      const text = use(storeA) + use(storeB);
      return text;
    }

    function App() {
      return <Sync />;
    }

    const root = ReactNoop.createRoot();
    root.render(<App />);
    await waitForAll([]);
    expect(root).toMatchRenderedOutput('AB');
  });

  // @gate enableStore
  it('interrupting while yielded should reset contexts', async () => {
    let resolve;
    const promise = new Promise(r => {
      resolve = r;
    });

    const store = createStore('world');

    const lazy = React.lazy(() => {
      return promise;
    });

    function ContextText() {
      return <Text text={use(store)} />;
    }

    function App() {
      return (
        <div>
          {lazy}
          <ContextText />
        </div>
      );
    }

    const root = ReactNoop.createRoot();
    startTransition(() => {
      root.render(<App />);
    });
    await waitForPaint([]);
    expect(root).toMatchRenderedOutput(null);

    await resolve({default: <Text key="hi" text="Hello " />});

    // Higher priority update that interrupts the first render. The original
    // re-renders the root with a new Provider value. Keep the root render,
    // which has to interrupt the transition, and update the store with it.
    // The interrupted render read 'world', so the new render must not reuse
    // what it read.
    ReactNoop.flushSync(() => {
      root.render(<App />);
      store.update('world!');
    });

    assertLog(['Hello ', 'world!']);

    expect(root).toMatchRenderedOutput(<div>Hello world!</div>);
  });
});
