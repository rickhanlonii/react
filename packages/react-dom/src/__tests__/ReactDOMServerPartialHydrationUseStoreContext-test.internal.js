/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 * @jest-environment ./scripts/jest/ReactDOMServerIntegrationEnvironment
 */

'use strict';

// The context cases of ReactDOMServerPartialHydration-test.internal.js, with
// context replaced by `use(store)`. See "Context copies" in
// docs/use-store/COPY_RULES.md.

let React = require('react');
let ReactDOMClient;
let ReactDOMServer;
let ReactFeatureFlags;
let Scheduler;
let Suspense;
let use;
let createStore;
let act;
let waitForAll;

function normalizeError(msg) {
  // Take the first sentence to make it easier to assert on.
  const idx = msg.indexOf('.');
  if (idx > -1) {
    return msg.slice(0, idx + 1);
  }
  return msg;
}

describe('ReactDOMServerPartialHydration', () => {
  beforeEach(() => {
    jest.resetModules();

    ReactFeatureFlags = require('shared/ReactFeatureFlags');
    ReactFeatureFlags.enableSuspenseCallback = true;
    ReactFeatureFlags.enableCreateEventHandleAPI = true;

    React = require('react');
    ReactDOMClient = require('react-dom/client');
    act = require('internal-test-utils').act;
    ReactDOMServer = require('react-dom/server');
    Scheduler = require('scheduler');
    Suspense = React.Suspense;
    use = React.use;
    createStore = React.unstable_createStore;

    const InternalTestUtils = require('internal-test-utils');
    waitForAll = InternalTestUtils.waitForAll;
  });

  // @gate enableStore
  it('blocks the update to hydrate first if context has changed', async () => {
    let suspend = false;
    let resolve;
    const promise = new Promise(resolvePromise => (resolve = resolvePromise));
    const ref = React.createRef();
    // Every Provider in the original renders the same value on the server
    // and when hydrating, so it's the store's initial value. The server
    // renders, and the client hydrates with, that value.
    const store = createStore({text: 'Hello', className: 'hello'});

    function Child() {
      const {text, className} = use(store);
      if (suspend) {
        throw promise;
      } else {
        return (
          <span ref={ref} className={className}>
            {text}
          </span>
        );
      }
    }

    const App = React.memo(function App() {
      return (
        <div>
          <Suspense fallback="Loading...">
            <Child />
          </Suspense>
        </div>
      );
    });

    suspend = false;
    const finalHTML = ReactDOMServer.renderToString(<App />);
    const container = document.createElement('div');
    container.innerHTML = finalHTML;

    const span = container.getElementsByTagName('span')[0];

    // On the client we don't have all data yet but we want to start
    // hydrating anyway.
    suspend = true;
    const root = ReactDOMClient.hydrateRoot(container, <App />);
    await waitForAll([]);

    expect(ref.current).toBe(null);
    expect(span.textContent).toBe('Hello');

    // Render an update, which will be higher or the same priority as pinging the hydration.
    // The original re-renders the root with a new Provider value. Keep the
    // re-render (App bails out because it's memoized) and change the value
    // with a store update in the same batch.
    root.render(<App />);
    store.update({text: 'Hi', className: 'hi'});

    // At the same time, resolving the promise so that rendering can complete.
    // This should first complete the hydration and then flush the update onto the hydrated state.
    await act(async () => {
      suspend = false;
      resolve();
      await promise;
    });

    // Since this should have been hydrated, this should still be the same span.
    const newSpan = container.getElementsByTagName('span')[0];
    expect(newSpan).toBe(span);

    // We should now have fully rendered with a ref on the new span.
    expect(ref.current).toBe(span);
    expect(span.textContent).toBe('Hi');
    // If we ended up hydrating the existing content, we won't have properly
    // patched up the tree, which might mean we haven't patched the className.
    expect(span.className).toBe('hi');
  });

  // @gate enableStore
  it('shows the fallback if context has changed before hydration completes and is still suspended', async () => {
    let suspend = false;
    let resolve;
    const promise = new Promise(resolvePromise => (resolve = resolvePromise));
    const ref = React.createRef();
    // Every Provider in the original renders the same value on the server
    // and when hydrating, so it's the store's initial value. The server
    // renders, and the client hydrates with, that value.
    const store = createStore({text: 'Hello', className: 'hello'});

    function Child() {
      const {text, className} = use(store);
      if (suspend) {
        throw promise;
      } else {
        return (
          <span ref={ref} className={className}>
            {text}
          </span>
        );
      }
    }

    const App = React.memo(function App() {
      return (
        <div>
          <Suspense fallback="Loading...">
            <Child />
          </Suspense>
        </div>
      );
    });

    suspend = false;
    const finalHTML = ReactDOMServer.renderToString(<App />);
    const container = document.createElement('div');
    container.innerHTML = finalHTML;

    // On the client we don't have all data yet but we want to start
    // hydrating anyway.
    suspend = true;
    const root = ReactDOMClient.hydrateRoot(container, <App />, {
      onRecoverableError(error) {
        Scheduler.log('onRecoverableError: ' + normalizeError(error.message));
        if (error.cause) {
          Scheduler.log('Cause: ' + normalizeError(error.cause.message));
        }
      },
    });
    await waitForAll([]);

    expect(ref.current).toBe(null);

    // Render an update, but leave it still suspended.
    // Flushing now should delete the existing content and show the fallback.
    await act(() => {
      // The original re-renders the root with a new Provider value. Keep the
      // re-render (App bails out because it's memoized) and change the value
      // with a store update in the same batch.
      root.render(<App />);
      store.update({text: 'Hi', className: 'hi'});
    });

    // store-semantics: the original deletes the dehydrated content and shows
    // the fallback, because the context change is propagated into the
    // dehydrated boundary, which can't hydrate while it's suspended. A store
    // update isn't routed into dehydrated boundaries: the reader hasn't
    // hydrated, so it isn't subscribed, and the store's initial value is the
    // server snapshot that it will hydrate with (DCP-4). The server HTML stays
    // until the boundary hydrates, and the reader then catches up to the new
    // value.
    expect(container.getElementsByTagName('span').length).toBe(1);
    expect(ref.current).toBe(null);
    expect(container.textContent).toBe('Hello');

    // Unsuspending shows the content.
    await act(async () => {
      suspend = false;
      resolve();
      await promise;
    });

    const span = container.getElementsByTagName('span')[0];
    expect(span.textContent).toBe('Hi');
    expect(span.className).toBe('hi');
    expect(ref.current).toBe(span);
    expect(container.textContent).toBe('Hi');
  });

  // @gate enableStore
  it('regenerates if it cannot hydrate before changes to props/context expire', async () => {
    let suspend = false;
    const promise = new Promise(resolvePromise => {});
    const ref = React.createRef();
    // The Provider's value on the server and when hydrating is the store's
    // initial value.
    const classNameStore = createStore('hello');

    function Child({text}) {
      const className = use(classNameStore);
      if (suspend && className !== 'hi' && text !== 'Hi') {
        // Never suspends on the newer data.
        throw promise;
      } else {
        return (
          <span ref={ref} className={className}>
            {text}
          </span>
        );
      }
    }

    function App({text, className}) {
      return (
        <div>
          <Suspense fallback="Loading...">
            <Child text={text} />
          </Suspense>
        </div>
      );
    }

    suspend = false;
    const finalHTML = ReactDOMServer.renderToString(<App text="Hello" />);
    const container = document.createElement('div');
    container.innerHTML = finalHTML;

    const span = container.getElementsByTagName('span')[0];

    // On the client we don't have all data yet but we want to start
    // hydrating anyway.
    suspend = true;
    const root = ReactDOMClient.hydrateRoot(container, <App text="Hello" />, {
      onRecoverableError(error) {
        Scheduler.log('onRecoverableError: ' + normalizeError(error.message));
        if (error.cause) {
          Scheduler.log('Cause: ' + normalizeError(error.cause.message));
        }
      },
    });
    await waitForAll([]);

    expect(ref.current).toBe(null);
    expect(span.textContent).toBe('Hello');

    // Render an update, which will be higher or the same priority as pinging the hydration.
    // The new update doesn't suspend.
    // Since we're still suspended on the original data, we can't hydrate.
    // This will force all expiration times to flush.
    await act(() => {
      // The props change through the root, and the Provider value through
      // the store, in the same batch.
      root.render(<App text="Hi" />);
      classNameStore.update('hi');
    });

    // This will now be a new span because we weren't able to hydrate before
    const newSpan = container.getElementsByTagName('span')[0];
    expect(newSpan).not.toBe(span);

    // We should now have fully rendered with a ref on the new span.
    expect(ref.current).toBe(newSpan);
    expect(newSpan.textContent).toBe('Hi');
    // If we ended up hydrating the existing content, we won't have properly
    // patched up the tree, which might mean we haven't patched the className.
    expect(newSpan.className).toBe('hi');
  });
});
