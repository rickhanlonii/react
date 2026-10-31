/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 */

'use strict';

// The context cases of ReactDOMServerSelectiveHydrationActivity-test.internal.js, with
// context replaced by `use(store)`. See "Context copies" in
// docs/use-store/COPY_RULES.md.

let React;
let ReactDOM;
let ReactDOMClient;
let ReactDOMServer;
let ReactFeatureFlags;
let Scheduler;
let Activity;
let use;
let createStore;
let act;
let assertLog;
let waitForAll;
let waitFor;
let IdleEventPriority;

function dispatchClickEvent(target) {
  const mouseOutEvent = document.createEvent('MouseEvents');
  mouseOutEvent.initMouseEvent(
    'click',
    true,
    true,
    window,
    0,
    50,
    50,
    50,
    50,
    false,
    false,
    false,
    false,
    0,
    target,
  );
  return target.dispatchEvent(mouseOutEvent);
}

// TODO: There's currently no React DOM API to opt into Idle priority updates,
// and there's no native DOM event that maps to idle priority, so this is a
// temporary workaround. Need something like ReactDOM.unstable_IdleUpdates.
function TODO_scheduleIdleDOMSchedulerTask(fn) {
  ReactDOM.unstable_runWithPriority(IdleEventPriority, () => {
    const prevEvent = window.event;
    window.event = {type: 'message'};
    try {
      fn();
    } finally {
      window.event = prevEvent;
    }
  });
}

describe('ReactDOMServerSelectiveHydrationActivity', () => {
  beforeEach(() => {
    jest.resetModules();

    ReactFeatureFlags = require('shared/ReactFeatureFlags');
    ReactFeatureFlags.enableCreateEventHandleAPI = true;
    React = require('react');
    ReactDOM = require('react-dom');
    ReactDOMClient = require('react-dom/client');
    ReactDOMServer = require('react-dom/server');
    act = require('internal-test-utils').act;
    Scheduler = require('scheduler');
    Activity = React.Activity;
    use = React.use;
    createStore = React.unstable_createStore;

    const InternalTestUtils = require('internal-test-utils');
    assertLog = InternalTestUtils.assertLog;
    waitForAll = InternalTestUtils.waitForAll;
    waitFor = InternalTestUtils.waitFor;

    IdleEventPriority = require('react-reconciler/constants').IdleEventPriority;
  });

  // @gate enableStore && www
  it('regression test: can unwind context on selective hydration interruption', async () => {
    // The original is a regression test for unwinding the context stack when
    // selective hydration interrupts a render inside a Provider. A store has
    // no stack, but a render that selective hydration interrupts must not
    // break the reads of the renders after it. Nothing reads the Provider's
    // value, so the Provider is gone, and ContextReader reads the store's
    // initial value, which is the context's default value.
    const store = createStore('DefaultContext');

    function ContextReader(props) {
      const value = use(store);
      Scheduler.log(value);
      return null;
    }

    function Child({text}) {
      Scheduler.log(text);
      return <span>{text}</span>;
    }
    const ChildWithBoundary = React.memo(function ({text}) {
      return (
        <Activity>
          <Child text={text} />
        </Activity>
      );
    });

    function App({a}) {
      Scheduler.log('App');
      React.useEffect(() => {
        Scheduler.log('Commit');
      });
      return (
        <>
          <ChildWithBoundary text={a} />
          <ContextReader />
        </>
      );
    }
    const finalHTML = ReactDOMServer.renderToString(<App a="A" />);
    assertLog(['App', 'A', 'DefaultContext']);
    const container = document.createElement('div');
    container.innerHTML = finalHTML;
    document.body.appendChild(container);

    const spanA = container.getElementsByTagName('span')[0];

    await act(async () => {
      const root = ReactDOMClient.hydrateRoot(container, <App a="A" />);
      await waitFor(['App', 'DefaultContext', 'Commit']);

      TODO_scheduleIdleDOMSchedulerTask(() => {
        root.render(<App a="AA" />);
      });
      await waitFor(['App', 'A']);

      dispatchClickEvent(spanA);
      assertLog(['A']);
      await waitForAll(['App', 'AA', 'DefaultContext', 'Commit']);
    });
  });

  // @gate enableStore
  it('regression test: can unwind context on selective hydration interruption for sync updates', async () => {
    // The original is a regression test for unwinding the context stack when
    // selective hydration interrupts a render inside a Provider. A store has
    // no stack, but a render that selective hydration interrupts must not
    // break the reads of the renders after it. Nothing reads the Provider's
    // value, so the Provider is gone, and ContextReader reads the store's
    // initial value, which is the context's default value.
    const store = createStore('DefaultContext');

    function ContextReader(props) {
      const value = use(store);
      Scheduler.log(value);
      return null;
    }

    function Child({text}) {
      Scheduler.log(text);
      return <span>{text}</span>;
    }
    const ChildWithBoundary = React.memo(function ({text}) {
      return (
        <Activity>
          <Child text={text} />
        </Activity>
      );
    });

    function App({a}) {
      Scheduler.log('App');
      React.useEffect(() => {
        Scheduler.log('Commit');
      });
      return (
        <>
          <ChildWithBoundary text={a} />
          <ContextReader />
        </>
      );
    }
    const finalHTML = ReactDOMServer.renderToString(<App a="A" />);
    assertLog(['App', 'A', 'DefaultContext']);
    const container = document.createElement('div');
    container.innerHTML = finalHTML;

    await act(async () => {
      const root = ReactDOMClient.hydrateRoot(container, <App a="A" />);
      await waitFor(['App', 'DefaultContext', 'Commit']);

      ReactDOM.flushSync(() => {
        root.render(<App a="AA" />);
      });
      assertLog(['App', 'A', 'App', 'AA', 'DefaultContext', 'Commit']);
    });
  });
});
