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
let ReactDOM;
let Activity;
let waitForAll;

function normalizeError(msg) {
  // Take the first sentence to make it easier to assert on.
  const idx = msg.indexOf('.');
  if (idx > -1) {
    return msg.slice(0, idx + 1);
  }
  return msg;
}

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

  // Cases folded in from the cleanup of the use(store) test copies (see each case's source comment).
  describe('folded copies', () => {
    beforeEach(() => {
      jest.resetModules();
      React = require('react');
      ReactDOM = require('react-dom');
      ReactDOMClient = require('react-dom/client');
      ReactDOMServer = require('react-dom/server');
      Scheduler = require('scheduler');
      Activity = React.Activity;
      Suspense = React.Suspense;
      use = React.use;
      createStore = React.unstable_createStore;

      const InternalTestUtils = require('internal-test-utils');
      act = InternalTestUtils.act;
      assertLog = InternalTestUtils.assertLog;
      waitFor = InternalTestUtils.waitFor;
      waitForAll = InternalTestUtils.waitForAll;
    });

    describe('updates during commit', () => {
      // @gate enableStore
      it('should batch unmounts', async () => {
        const outerStore = createStore({showInner: true});
        class Inner extends React.Component {
          render() {
            return <div />;
          }

          componentWillUnmount() {
            // This should get silently ignored (maybe with a warning), but it
            // shouldn't break React.
            outerStore.update(state => ({...state, showInner: false}));
          }
        }

        function Outer() {
          const state = use(outerStore);
          return <div>{state.showInner && <Inner />}</div>;
        }

        const container = document.createElement('div');
        const root = ReactDOMClient.createRoot(container);
        await act(() => {
          root.render(<Outer />);
        });

        expect(() => {
          root.unmount();
        }).not.toThrow();
      });

      // @gate enableStore
      it('should not support setState in componentWillUnmount', async () => {
        const store = createStore({siblingUnmounted: false});
        let subscription;
        class A extends React.Component {
          componentWillUnmount() {
            subscription();
          }
          render() {
            return 'A';
          }
        }

        function B() {
          const state = use(store);
          // UNSAFE_componentWillMount
          if (subscription === undefined) {
            subscription = () =>
              store.update(prev => ({...prev, siblingUnmounted: true}));
          }
          return 'B' + (state.siblingUnmounted ? ' No Sibling' : '');
        }

        const el = document.createElement('div');
        const root = ReactDOMClient.createRoot(el);
        await act(() => {
          root.render(<A />);
        });
        expect(el.textContent).toBe('A');

        ReactDOM.flushSync(() => {
          root.render(<B />);
        });
        // store-semantics: store updates never warn about unmounted or
        // not-yet-mounted components, so there's no "hasn't mounted yet" warning.
        // B was dispatched an update while the commit that mounts it was in
        // progress, and it catches up.
        await act(() => {});
        expect(el.textContent).toBe('B No Sibling');
      });
    });

    describe('updates during render', () => {
      // @gate enableStore
      it('should not warn on updating function component from componentWillMount', async () => {
        const store = createStore(null);
        const setState = store.update;
        let ref;
        function A() {
          const state = use(store);
          return <div ref={r => (ref = r)}>{state}</div>;
        }
        class B extends React.Component {
          UNSAFE_componentWillMount() {
            setState(1);
          }
          render() {
            return null;
          }
        }
        function Parent() {
          return (
            <div>
              <A />
              <B />
            </div>
          );
        }
        const container = document.createElement('div');
        const root = ReactDOMClient.createRoot(container);
        await act(() => {
          root.render(<Parent />);
        });

        expect(ref.textContent).toBe('1');
      });

      // The test returns early, before it creates a store, in the same cases as
      // the original.
      // @gate enableStore || !__DEV__ || !enableInfiniteRenderLoopDetection || enableInfiniteRenderLoopDetectionForceThrow
      it("warns about potential infinite loop if there's a synchronous render phase update on another component", async () => {
        if (
          !__DEV__ ||
          gate(
            flags =>
              !flags.enableInfiniteRenderLoopDetection ||
              flags.enableInfiniteRenderLoopDetectionForceThrow,
          )
        ) {
          return;
        }
        const store = createStore(0);
        const setState = store.update;
        function App() {
          use(store);
          return <Child />;
        }

        function Child(step) {
          // This will cause an infinite update loop, and a warning in dev.
          setState(n => n + 1);
          return null;
        }

        const originalConsoleError = console.error;
        console.error = e => {
          if (
            typeof e === 'string' &&
            e.startsWith(
              'Maximum update depth exceeded. This could be an infinite loop.',
            )
          ) {
            Scheduler.log('stop');
          }
        };
        try {
          const container = document.createElement('div');
          const root = ReactDOMClient.createRoot(container);
          root.render(<App />);
          await waitFor(['stop']);
        } finally {
          console.error = originalConsoleError;
        }
      });
    });

    describe('roots', () => {
      let container;

      beforeEach(() => {
        container = document.createElement('div');
        document.body.appendChild(container);
      });

      afterEach(() => {
        document.body.removeChild(container);
      });

      // @gate enableStore
      it('unmounted roots should never clear newer root content from a container', async () => {
        const ref = React.createRef();

        const valueStore = createStore('old');
        function OldApp() {
          const value = use(valueStore);
          function hideOnClick() {
            // Schedule a discrete update.
            valueStore.update('update');
            // Synchronously unmount this root.
            ReactDOM.flushSync(() => oldRoot.unmount());
          }
          return (
            <button onClick={hideOnClick} ref={ref}>
              {value}
            </button>
          );
        }

        function NewApp() {
          return <button ref={ref}>new</button>;
        }

        const oldRoot = ReactDOMClient.createRoot(container);
        await act(() => {
          oldRoot.render(<OldApp />);
        });

        // Invoke discrete event.
        ref.current.click();

        // The root should now be unmounted.
        expect(container.textContent).toBe('');

        // We can now render a new one.
        const newRoot = ReactDOMClient.createRoot(container);
        ReactDOM.flushSync(() => {
          newRoot.render(<NewApp />);
        });
        ref.current.click();

        expect(container.textContent).toBe('new');
      });
    });

    describe('controlled inputs', () => {
      let setUntrackedValue;
      let setUntrackedChecked;
      let container;
      let root;

      function dispatchEventOnNode(node, type) {
        node.dispatchEvent(new Event(type, {bubbles: true, cancelable: true}));
      }

      function isCheckedDirty(node) {
        // Return the "dirty checked flag" as defined in the HTML spec.
        if (node.checked !== node.defaultChecked) {
          return true;
        }
        const copy = node.cloneNode();
        copy.type = 'checkbox';
        copy.defaultChecked = !copy.defaultChecked;
        return copy.checked === node.checked;
      }

      function getTrackedAndCurrentInputValue(
        elem: HTMLElement,
      ): [mixed, mixed] {
        const tracker = elem._valueTracker;
        if (!tracker) {
          throw new Error('No input tracker');
        }
        return [
          tracker.getValue(),
          elem.nodeName === 'INPUT' &&
          (elem.type === 'checkbox' || elem.type === 'radio')
            ? String(elem.checked)
            : elem.value,
        ];
      }

      function assertInputTrackingIsCurrent(parent) {
        parent.querySelectorAll('input, textarea, select').forEach(input => {
          const [trackedValue, currentValue] =
            getTrackedAndCurrentInputValue(input);
          if (trackedValue !== currentValue) {
            throw new Error(
              `Input ${input.outerHTML} is currently ${currentValue} but tracker thinks it's ${trackedValue}`,
            );
          }
        });
      }

      beforeEach(() => {
        setUntrackedValue = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          'value',
        ).set;
        setUntrackedChecked = Object.getOwnPropertyDescriptor(
          HTMLInputElement.prototype,
          'checked',
        ).set;
        container = document.createElement('div');
        document.body.appendChild(container);
        root = ReactDOMClient.createRoot(container);
      });

      afterEach(() => {
        document.body.removeChild(container);
      });

      // @gate enableStore
      it('should control a value in reentrant events', async () => {
        const instance = {a: null, b: null, switchedFocus: false};
        const valueStore = createStore('lion');
        function ControlledInputs() {
          const value = use(valueStore);
          function change(newValue) {
            valueStore.update(newValue);
            // Calling focus here will blur the text box which causes a native
            // change event. Ideally we shouldn't have to fire this ourselves.
            // Don't remove unless you've verified the fix in #8240 is still covered.
            dispatchEventOnNode(instance.a, 'input');
            instance.b.focus();
          }
          function blur(currentValue) {
            instance.switchedFocus = true;
            // currentValue should be 'giraffe' here because we should not have
            // restored it on the target yet.
            valueStore.update(currentValue);
          }
          return (
            <div>
              <input
                type="text"
                ref={n => (instance.a = n)}
                value={value}
                onChange={e => change(e.target.value)}
                onBlur={e => blur(e.target.value)}
              />
              <input type="text" ref={n => (instance.b = n)} />
            </div>
          );
        }

        await act(() => {
          root.render(<ControlledInputs />);
        });

        // Focus the field so we can later blur it.
        // Don't remove unless you've verified the fix in #8240 is still covered.
        await act(() => {
          instance.a.focus();
        });
        setUntrackedValue.call(instance.a, 'giraffe');
        // This must use the native event dispatching. If we simulate, we will
        // bypass the lazy event attachment system so we won't actually test this.
        await act(() => {
          dispatchEventOnNode(instance.a, 'input');
        });
        await act(() => {
          dispatchEventOnNode(instance.a, 'blur');
        });
        await act(() => {
          dispatchEventOnNode(instance.a, 'focusout');
        });

        expect(instance.a.value).toBe('giraffe');
        expect(instance.switchedFocus).toBe(true);
      });

      // @gate enableStore
      it('should hydrate controlled radio buttons', async () => {
        const currentStore = createStore('a');
        function App() {
          const current = use(currentStore);
          return (
            <>
              <input
                type="radio"
                name="fruit"
                checked={current === 'a'}
                onChange={() => {
                  Scheduler.log('click a');
                  currentStore.update('a');
                }}
              />
              <input
                type="radio"
                name="fruit"
                checked={current === 'b'}
                onChange={() => {
                  Scheduler.log('click b');
                  currentStore.update('b');
                }}
              />
              <input
                type="radio"
                name="fruit"
                checked={current === 'c'}
                onChange={() => {
                  Scheduler.log('click c');
                  // Let's say the user can't pick C
                }}
              />
            </>
          );
        }
        const html = ReactDOMServer.renderToString(<App />);
        // Create a fresh container, not attached a root yet
        container.remove();
        container = document.createElement('div');
        document.body.appendChild(container);
        container.innerHTML = html;
        const [a, b, c] = container.querySelectorAll('input');
        expect(a.checked).toBe(true);
        expect(b.checked).toBe(false);
        expect(c.checked).toBe(false);
        expect(isCheckedDirty(a)).toBe(false);
        expect(isCheckedDirty(b)).toBe(false);
        expect(isCheckedDirty(c)).toBe(false);

        // Click on B before hydrating
        b.checked = true;
        expect(isCheckedDirty(a)).toBe(true);
        expect(isCheckedDirty(b)).toBe(true);
        expect(isCheckedDirty(c)).toBe(false);

        await act(async () => {
          ReactDOMClient.hydrateRoot(container, <App />);
        });

        if (gate(flags => flags.enableHydrationChangeEvent)) {
          // We replayed the click since the value changed before hydration.
          assertLog(['click b']);
        } else {
          assertLog([]);
          // Strangely, we leave `b` checked even though we rendered A with
          // checked={true} and B with checked={false}. Arguably this is a bug.
        }
        expect(a.checked).toBe(false);
        expect(b.checked).toBe(true);
        expect(c.checked).toBe(false);
        expect(isCheckedDirty(a)).toBe(true);
        expect(isCheckedDirty(b)).toBe(true);
        expect(isCheckedDirty(c)).toBe(true);
        assertInputTrackingIsCurrent(container);

        // If we click on C now though...
        await act(async () => {
          setUntrackedChecked.call(c, true);
          dispatchEventOnNode(c, 'click');
        });

        assertLog(['click c']);
        if (gate(flags => flags.enableHydrationChangeEvent)) {
          // then since C's onClick doesn't set state, B becomes rechecked.
          expect(a.checked).toBe(false);
          expect(b.checked).toBe(true);
          expect(c.checked).toBe(false);
        } else {
          // then since C's onClick doesn't set state, A becomes rechecked
          // since in this branch we didn't replay to select B.
          expect(a.checked).toBe(true);
          expect(b.checked).toBe(false);
          expect(c.checked).toBe(false);
        }
        expect(isCheckedDirty(a)).toBe(true);
        expect(isCheckedDirty(b)).toBe(true);
        expect(isCheckedDirty(c)).toBe(true);
        assertInputTrackingIsCurrent(container);

        await act(async () => {
          setUntrackedChecked.call(b, true);
          dispatchEventOnNode(b, 'click');
        });
        if (gate(flags => flags.enableHydrationChangeEvent)) {
          // Since we already had this selected, this doesn't trigger a change again.
          assertLog([]);
        } else {
          // And we can also change to B properly after hydration.
          assertLog(['click b']);
        }
        expect(a.checked).toBe(false);
        expect(b.checked).toBe(true);
        expect(c.checked).toBe(false);
        expect(isCheckedDirty(a)).toBe(true);
        expect(isCheckedDirty(b)).toBe(true);
        expect(isCheckedDirty(c)).toBe(true);
        assertInputTrackingIsCurrent(container);
      });
    });

    // The store version of "does not fall into an infinite update loop with
    // useLayoutEffect" in ReactUpdates-test.
    describe('infinite update loops', () => {
      // @gate enableStore
      it('an update the root rejects for an infinite loop is not applied to the store', async () => {
        const store = createStore(0);
        let lastRendered;
        function NonTerminating() {
          const step = use(store);
          lastRendered = step;
          React.useLayoutEffect(() => {
            store.update(x => x + 1);
          });
          return step;
        }

        const container = document.createElement('div');
        const root = ReactDOMClient.createRoot(container);
        await expect(async () => {
          await act(() => {
            root.render(<NonTerminating />);
          });
        }).rejects.toThrow('Maximum');

        // The update that hit the limit threw from store.update, so a root that
        // starts reading the store sees the last value that rendered.
        function Reader() {
          return use(store);
        }
        const container2 = document.createElement('div');
        const root2 = ReactDOMClient.createRoot(container2);
        await act(() => {
          root2.render(<Reader />);
        });
        expect(container2.textContent).toBe(String(lastRendered));
      });
    });

    // Store updates that reach readers inside dehydrated boundaries (DCP-4).
    describe('dehydrated boundaries', () => {
      // The store version of "warns but works if setState is called before
      // commit in a dehydrated component" in
      // ReactDOMServerPartialHydration-test.
      // @gate enableStore
      it('a store update while a dehydrated reader hydrates is rendered after it hydrates', async () => {
        let suspend = false;
        let resolve;
        const promise = new Promise(
          resolvePromise => (resolve = resolvePromise),
        );

        const textStore = createStore('Hello');
        const updateText = textStore.update;

        function Child() {
          const state = use(textStore);
          Scheduler.log('Child');
          if (suspend) {
            throw promise;
          } else {
            return state;
          }
        }

        function Sibling() {
          Scheduler.log('Sibling');
          return null;
        }

        function App() {
          return (
            <div>
              <Suspense fallback="Loading...">
                <Child />
                <Sibling />
              </Suspense>
            </div>
          );
        }

        suspend = false;
        const finalHTML = ReactDOMServer.renderToString(<App />);
        assertLog(['Child', 'Sibling']);

        const container = document.createElement('div');
        container.innerHTML = finalHTML;

        const recoverableErrors = [];
        ReactDOMClient.hydrateRoot(
          container,
          <App text="Hello" className="hello" />,
          {
            onRecoverableError(error) {
              recoverableErrors.push(normalizeError(error.message));
            },
          },
        );

        await act(async () => {
          suspend = true;
          await waitFor(['Child']);

          // While we're part way through the hydration, we update the state.
          // This will schedule an update on the children of the suspense boundary.
          updateText('Hi');
          // store-semantics: a store update isn't tied to a fiber, so there's no
          // warning about updating a component that hasn't mounted yet, and the
          // update isn't dropped.

          // This will throw it away and rerender.
          await waitForAll(['Child']);

          expect(container.textContent).toBe('Hello');

          suspend = false;
          resolve();
          await promise;
        });
        // The content hydrates without a mismatch and then shows the latest value
        // of the store.
        expect(recoverableErrors).toEqual([]);
        assertLog(['Child', 'Sibling', 'Child']);
        expect(container.textContent).toBe('Hi');
      });

      // The store version of "blocks the update to hydrate first if context has
      // changed" in ReactDOMServerPartialHydration-test.
      // @gate enableStore
      it('a suspended dehydrated reader hydrates first and then renders a store update', async () => {
        let suspend = false;
        let resolve;
        const promise = new Promise(
          resolvePromise => (resolve = resolvePromise),
        );
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

      // The store version of "shows the fallback if context has changed before
      // hydration completes and is still suspended" in
      // ReactDOMServerPartialHydration-test.
      // @gate enableStore
      it('keeps the server HTML when a store changes before a suspended dehydrated reader hydrates', async () => {
        let suspend = false;
        let resolve;
        const promise = new Promise(
          resolvePromise => (resolve = resolvePromise),
        );
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
            Scheduler.log(
              'onRecoverableError: ' + normalizeError(error.message),
            );
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

      // The store version of "shows the parent fallback if context has changed
      // before hydration completes and is still suspended" in
      // ReactDOMServerPartialHydrationActivity-test.
      // @gate enableStore
      it('keeps the server HTML when a store changes before a suspended reader in a dehydrated Activity hydrates', async () => {
        let suspend = false;
        let resolve;
        const promise = new Promise(
          resolvePromise => (resolve = resolvePromise),
        );
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
            <Suspense fallback="Loading...">
              <div>
                <Activity>
                  <Child />
                </Activity>
              </div>
            </Suspense>
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
            Scheduler.log(
              'onRecoverableError: ' + normalizeError(error.message),
            );
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

        // store-semantics: the original hides the dehydrated content and shows
        // the parent fallback, because the context change is propagated into the
        // dehydrated Activity boundary, which can't hydrate while it's suspended. A store
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
    });
  });
});
