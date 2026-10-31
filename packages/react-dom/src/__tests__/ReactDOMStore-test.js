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
let ReactDOMClient;
let ReactDOMServer;
let Scheduler;
let act;
let use;
let startTransition;
let Suspense;
let createStore;
let assertLog;
let waitFor;

describe('ReactDOMStore', () => {
  beforeEach(() => {
    jest.resetModules();
    React = require('react');
    ReactDOMClient = require('react-dom/client');
    ReactDOMServer = require('react-dom/server');
    Scheduler = require('scheduler');
    act = require('internal-test-utils').act;
    use = React.use;
    startTransition = React.startTransition;
    Suspense = React.Suspense;
    createStore = React.unstable_createStore;

    const InternalTestUtils = require('internal-test-utils');
    assertLog = InternalTestUtils.assertLog;
    waitFor = InternalTestUtils.waitFor;
  });

  function Text({text}) {
    Scheduler.log(text);
    return text;
  }

  // @gate enableStore
  it('a reader inside a newly inserted host component catches up without warnings', async () => {
    const store = createStore(1);

    function Reader({name}) {
      return <Text text={name + ': ' + use(store)} />;
    }

    const container = document.createElement('div');
    const root = ReactDOMClient.createRoot(container);
    await act(async () => {
      startTransition(() => {
        root.render(
          <div>
            <Reader name="A" />
            <Reader name="B" />
          </div>,
        );
      });
      await waitFor(['A: 1']);
      // Dispatched after A rendered and before the tree commits.
      store.update(2);
    });
    assertLog(['B: 1', 'A: 2', 'B: 2']);
    expect(container.textContent).toBe('A: 2B: 2');
  });

  // @gate enableStore
  it('hydrates with the initial value of the store', async () => {
    const store = createStore('A');

    function App() {
      return <Text text={use(store)} />;
    }

    const container = document.createElement('div');
    container.innerHTML = ReactDOMServer.renderToString(<App />);
    assertLog(['A']);
    expect(container.textContent).toBe('A');

    // The store moves before hydration.
    store.update('B');

    const errors = [];
    await act(() => {
      ReactDOMClient.hydrateRoot(container, <App />, {
        onRecoverableError(error) {
          errors.push(error.message);
        },
      });
    });
    // It hydrates with the server value, then updates to the latest value.
    assertLog(['A', 'B']);
    expect(errors).toEqual([]);
    expect(container.textContent).toBe('B');

    await act(() => {
      store.update('C');
    });
    assertLog(['C']);
    expect(container.textContent).toBe('C');
  });

  // @gate enableStore
  it('the server renders the initial value, not updates', async () => {
    const store = createStore('A');
    store.update('B');

    function App() {
      return use(store);
    }

    expect(ReactDOMServer.renderToString(<App />)).toBe('A');
  });

  // @gate enableStore
  it('a store update before a dehydrated reader hydrates does not cause a mismatch', async () => {
    const store = createStore('A');
    let resolve;
    const promise = new Promise(r => (resolve = r));
    let suspend = false;

    function Reader() {
      const value = use(store);
      if (suspend) {
        throw promise;
      }
      return value;
    }

    function App() {
      return (
        <Suspense fallback="Loading">
          <Reader />
        </Suspense>
      );
    }

    const container = document.createElement('div');
    container.innerHTML = ReactDOMServer.renderToString(<App />);
    expect(container.textContent).toBe('A');

    suspend = true;
    const errors = [];
    await act(() => {
      ReactDOMClient.hydrateRoot(container, <App />, {
        onRecoverableError(error) {
          errors.push(error.message);
        },
      });
    });
    await act(() => {
      store.update('B');
    });
    suspend = false;
    await act(() => {
      resolve();
    });
    expect(errors).toEqual([]);
    expect(container.textContent).toBe('B');
  });

  // @gate enableStore
  it('keeps a controlled input in sync', async () => {
    const store = createStore('');

    function Input() {
      return (
        <input
          value={use(store)}
          onChange={e => store.update(e.target.value)}
        />
      );
    }

    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = ReactDOMClient.createRoot(container);
    await act(() => {
      root.render(<Input />);
    });
    const input = container.firstChild;

    const setValue = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'value',
    ).set;
    await act(() => {
      setValue.call(input, 'hello');
      input.dispatchEvent(new Event('input', {bubbles: true}));
    });
    expect(input.value).toBe('hello');

    // A store that rejects the change restores the controlled value.
    const lockedStore = createStore('locked');
    function LockedInput() {
      return <input value={use(lockedStore)} onChange={() => {}} />;
    }
    await act(() => {
      root.render(<LockedInput />);
    });
    const lockedInput = container.firstChild;
    await act(() => {
      setValue.call(lockedInput, 'changed');
      lockedInput.dispatchEvent(new Event('input', {bubbles: true}));
    });
    expect(lockedInput.value).toBe('locked');
    document.body.removeChild(container);
  });
  // @gate enableStore
  it('releases the root when it unmounts, without another store update', async () => {
    const store = createStore('A');

    function Reader() {
      return <Text text={use(store)} />;
    }

    const root = ReactDOMClient.createRoot(document.createElement('div'));
    await act(() => {
      root.render(<Reader />);
    });
    assertLog(['A']);
    expect(store._records.length).toBe(1);

    await act(() => {
      root.unmount();
    });
    // The store no longer references the root.
    expect(store._records.length).toBe(0);
  });

  // @gate enableStore
  it('a hydrated reader keeps updating when an unrelated store updated before it hydrated', async () => {
    const store = createStore('A');
    const other = createStore(0);
    let resolve;
    const promise = new Promise(r => (resolve = r));
    let suspend = false;

    function Reader() {
      return <Text text={'Reader: ' + use(store)} />;
    }
    function Suspender() {
      if (suspend) {
        throw promise;
      }
      return null;
    }
    function App() {
      return (
        <Suspense fallback="Loading">
          <Reader />
          <Suspender />
        </Suspense>
      );
    }

    const container = document.createElement('div');
    container.innerHTML = ReactDOMServer.renderToString(<App />);
    assertLog(['Reader: A']);

    // The first attempt to hydrate the boundary reads the store, and then
    // suspends, so nothing subscribes.
    suspend = true;
    await act(() => {
      ReactDOMClient.hydrateRoot(container, <App />);
    });
    assertLog(['Reader: A']);

    // An update to a store on another root, which doesn't commit this root.
    function OtherReader() {
      return use(other);
    }
    const otherRoot = ReactDOMClient.createRoot(document.createElement('div'));
    await act(() => {
      otherRoot.render(<OtherReader />);
    });
    await act(() => {
      other.update(1);
    });

    suspend = false;
    await act(() => {
      resolve();
    });
    assertLog(['Reader: A']);
    expect(container.textContent).toBe('Reader: A');

    await act(() => {
      store.update('B');
    });
    assertLog(['Reader: B']);
    expect(container.textContent).toBe('Reader: B');
  });

  // @gate enableStore
  it('a reader that hydrates while a transition is pending joins the transition', async () => {
    const store = createStore('A');
    let resolveA;
    const promiseA = new Promise(r => (resolveA = r));
    let resolveB;
    const promiseB = new Promise(r => (resolveB = r));
    let suspendA = false;
    let suspendB = false;

    function A() {
      const value = use(store);
      if (value === 'T' && suspendA) {
        throw promiseA;
      }
      Scheduler.log('A: ' + value);
      return value;
    }
    function B() {
      const value = use(store);
      Scheduler.log('B: ' + value);
      return (
        <span id="b" onClick={() => {}}>
          {value}
        </span>
      );
    }
    function Suspender() {
      if (suspendB) {
        throw promiseB;
      }
      return null;
    }
    function App() {
      return (
        <>
          <A />
          <Suspense fallback="Loading">
            <B />
            <Suspender />
          </Suspense>
        </>
      );
    }

    const container = document.createElement('div');
    document.body.appendChild(container);
    container.innerHTML = ReactDOMServer.renderToString(<App />);
    assertLog(['A: A', 'B: A']);

    suspendB = true;
    await act(() => {
      ReactDOMClient.hydrateRoot(container, <App />);
    });
    assertLog(['A: A', 'B: A']);

    // A transition updates the store and suspends, so it stays pending.
    suspendA = true;
    await act(() => {
      startTransition(() => store.update('T'));
    });
    assertLog([]);
    expect(container.textContent).toBe('AA');

    // A discrete event hydrates the boundary at a higher priority than the
    // transition. B hydrates with the initial value, and skips the
    // transition's update, which joins it to the transition.
    suspendB = false;
    await act(() => {
      container
        .querySelector('#b')
        .dispatchEvent(new MouseEvent('click', {bubbles: true}));
    });
    assertLog(['B: A', 'B: T']);
    expect(container.textContent).toBe('AA');

    // The transition commits both readers together.
    suspendA = false;
    await act(() => {
      resolveA();
      resolveB();
    });
    assertLog(['A: T', 'B: T']);
    expect(container.textContent).toBe('TT');
    document.body.removeChild(container);
  });
});
