/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 */

'use strict';

// use(store) in legacy roots. Legacy mode is only on in the React Native
// builds (disableLegacyMode is false in the native-fb forks), and enableStore
// is a dynamic flag there, so these cases run on `-r=xplat --variant=true`.
// They live in react-reconciler, not react-dom, because the xplat config
// ignores packages/react-dom. Legacy roots get SyncLane from
// requestStoreUpdateLane and commit synchronously, which no other store test
// covers.
//
// Each describe is named after the test file the case was converted from.

let React;
let ReactDOM;
let act;
let Scheduler;
let assertLog;
let use;
let createStore;

describe('ReactLegacyUpdates', () => {
  // Calls `callback` after every commit except the first, like
  // componentDidUpdate.
  function useDidUpdate(callback) {
    const didMount = React.useRef(false);
    React.useLayoutEffect(() => {
      if (!didMount.current) {
        didMount.current = true;
        return;
      }
      callback();
    });
  }

  beforeEach(() => {
    jest.resetModules();
    React = require('react');
    ReactDOM = require('react-dom');
    use = React.use;
    createStore = React.unstable_createStore;
    act = require('internal-test-utils').act;
    Scheduler = require('scheduler');

    const InternalTestUtils = require('internal-test-utils');
    assertLog = InternalTestUtils.assertLog;
  });

  // @gate enableStore && !disableLegacyMode
  it('should batch state when updating state twice', () => {
    let updateCount = 0;

    // The state of the last render, in place of instance.state.
    let instanceState;
    const store = createStore({x: 0});
    function Component() {
      const state = use(store);
      instanceState = state;
      useDidUpdate(() => {
        updateCount++;
      });
      return <div>{state.x}</div>;
    }

    const container = document.createElement('div');
    ReactDOM.render(<Component />, container);
    expect(instanceState.x).toBe(0);

    ReactDOM.unstable_batchedUpdates(function () {
      store.update(prev => ({...prev, x: 1}));
      store.update(prev => ({...prev, x: 2}));
      expect(instanceState.x).toBe(0);
      expect(updateCount).toBe(0);
    });

    expect(instanceState.x).toBe(2);
    expect(updateCount).toBe(1);
  });

  // @gate enableStore && !disableLegacyMode
  it('should batch state when updating two different state keys', () => {
    let updateCount = 0;

    // The state of the last render, in place of instance.state.
    let instanceState;
    const store = createStore({x: 0, y: 0});
    function Component() {
      const state = use(store);
      instanceState = state;
      useDidUpdate(() => {
        updateCount++;
      });
      return <div>{`(${state.x}, ${state.y})`}</div>;
    }

    const container = document.createElement('div');
    ReactDOM.render(<Component />, container);
    expect(instanceState.x).toBe(0);
    expect(instanceState.y).toBe(0);

    ReactDOM.unstable_batchedUpdates(function () {
      store.update(prev => ({...prev, x: 1}));
      store.update(prev => ({...prev, y: 2}));
      expect(instanceState.x).toBe(0);
      expect(instanceState.y).toBe(0);
      expect(updateCount).toBe(0);
    });

    expect(instanceState.x).toBe(1);
    expect(instanceState.y).toBe(2);
    expect(updateCount).toBe(1);
  });

  // @gate enableStore && !disableLegacyMode
  it('should batch state and props together', () => {
    let updateCount = 0;

    // The props and state of the last render, in place of instance.props and
    // instance.state.
    let instanceProps;
    let instanceState;
    const store = createStore({y: 0});
    function Component(props) {
      const state = use(store);
      instanceProps = props;
      instanceState = state;
      useDidUpdate(() => {
        updateCount++;
      });
      return <div>{`(${props.x}, ${state.y})`}</div>;
    }

    const container = document.createElement('div');
    ReactDOM.render(<Component x={0} />, container);
    expect(instanceProps.x).toBe(0);
    expect(instanceState.y).toBe(0);

    ReactDOM.unstable_batchedUpdates(function () {
      ReactDOM.render(<Component x={1} />, container);
      store.update(prev => ({...prev, y: 2}));
      expect(instanceProps.x).toBe(0);
      expect(instanceState.y).toBe(0);
      expect(updateCount).toBe(0);
    });

    expect(instanceProps.x).toBe(1);
    expect(instanceState.y).toBe(2);
    expect(updateCount).toBe(1);
  });

  // @gate enableStore && !disableLegacyMode
  it('should batch parent/child state updates together', () => {
    let parentUpdateCount = 0;

    // The state of the last render of each component, in place of
    // instance.state.
    let parentState;
    let childState;
    const parentStore = createStore({x: 0});
    const childStore = createStore({y: 0});

    function Parent() {
      const state = use(parentStore);
      parentState = state;
      useDidUpdate(() => {
        parentUpdateCount++;
      });
      return (
        <div>
          <Child x={state.x} />
        </div>
      );
    }

    let childUpdateCount = 0;

    function Child(props) {
      const state = use(childStore);
      childState = state;
      useDidUpdate(() => {
        childUpdateCount++;
      });
      return <div>{props.x + state.y}</div>;
    }

    const container = document.createElement('div');
    ReactDOM.render(<Parent />, container);
    expect(parentState.x).toBe(0);
    expect(childState.y).toBe(0);

    ReactDOM.unstable_batchedUpdates(function () {
      parentStore.update(prev => ({...prev, x: 1}));
      childStore.update(prev => ({...prev, y: 2}));
      expect(parentState.x).toBe(0);
      expect(childState.y).toBe(0);
      expect(parentUpdateCount).toBe(0);
      expect(childUpdateCount).toBe(0);
    });

    expect(parentState.x).toBe(1);
    expect(childState.y).toBe(2);
    expect(parentUpdateCount).toBe(1);
    expect(childUpdateCount).toBe(1);
  });

  // @gate enableStore && !disableLegacyMode
  it('should batch child/parent state updates together', () => {
    let parentUpdateCount = 0;

    // The state of the last render of each component, in place of
    // instance.state.
    let parentState;
    let childState;
    const parentStore = createStore({x: 0});
    const childStore = createStore({y: 0});

    function Parent() {
      const state = use(parentStore);
      parentState = state;
      useDidUpdate(() => {
        parentUpdateCount++;
      });
      return (
        <div>
          <Child x={state.x} />
        </div>
      );
    }

    let childUpdateCount = 0;

    function Child(props) {
      const state = use(childStore);
      childState = state;
      useDidUpdate(() => {
        childUpdateCount++;
      });
      return <div>{props.x + state.y}</div>;
    }

    const container = document.createElement('div');
    ReactDOM.render(<Parent />, container);
    expect(parentState.x).toBe(0);
    expect(childState.y).toBe(0);

    ReactDOM.unstable_batchedUpdates(function () {
      childStore.update(prev => ({...prev, y: 2}));
      parentStore.update(prev => ({...prev, x: 1}));
      expect(parentState.x).toBe(0);
      expect(childState.y).toBe(0);
      expect(parentUpdateCount).toBe(0);
      expect(childUpdateCount).toBe(0);
    });

    expect(parentState.x).toBe(1);
    expect(childState.y).toBe(2);
    expect(parentUpdateCount).toBe(1);

    // Batching reduces the number of updates here to 1.
    expect(childUpdateCount).toBe(1);
  });

  // Parent keeps its class state, since the test is about its
  // shouldComponentUpdate blocking the update. Child's state is a store.
  // @gate enableStore && !disableLegacyMode
  it('should update children even if parent blocks updates', () => {
    let parentRenderCount = 0;
    let childRenderCount = 0;
    const childStore = createStore({});

    class Parent extends React.Component {
      shouldComponentUpdate() {
        return false;
      }

      render() {
        parentRenderCount++;
        return <Child />;
      }
    }

    function Child() {
      use(childStore);
      childRenderCount++;
      return <div />;
    }

    expect(parentRenderCount).toBe(0);
    expect(childRenderCount).toBe(0);

    const container = document.createElement('div');
    const instance = ReactDOM.render(<Parent />, container);

    expect(parentRenderCount).toBe(1);
    expect(childRenderCount).toBe(1);

    ReactDOM.unstable_batchedUpdates(function () {
      instance.setState({x: 1});
    });

    expect(parentRenderCount).toBe(1);
    expect(childRenderCount).toBe(1);

    ReactDOM.unstable_batchedUpdates(function () {
      childStore.update(prev => ({...prev, x: 1}));
    });

    expect(parentRenderCount).toBe(1);
    expect(childRenderCount).toBe(2);
  });

  // @gate enableStore && !disableLegacyMode
  it('should queue mount-ready handlers across different roots', () => {
    // We'll define two components A and B, then update both of them. When A's
    // componentDidUpdate handlers is called, B's DOM should already have been
    // updated.

    const bContainer = document.createElement('div');

    // B's host node, in place of findDOMNode(b).
    let b;

    let aUpdated = false;

    const aStore = createStore({x: 0});
    const bStore = createStore({x: 0});

    function A() {
      const state = use(aStore);
      useDidUpdate(() => {
        expect(b.textContent).toBe('B1');
        aUpdated = true;
      });

      let portal = null;
      // If we're using Fiber, we use Portals instead to achieve this.
      portal = ReactDOM.createPortal(<B />, bContainer);
      return (
        <div>
          A{state.x}
          {portal}
        </div>
      );
    }

    function B() {
      const state = use(bStore);
      return <div ref={n => (b = n)}>B{state.x}</div>;
    }

    const container = document.createElement('div');
    ReactDOM.render(<A />, container);
    ReactDOM.unstable_batchedUpdates(function () {
      aStore.update(prev => ({...prev, x: 1}));
      bStore.update(prev => ({...prev, x: 1}));
    });

    expect(aUpdated).toBe(true);
  });

  // @gate enableStore && !disableLegacyMode
  it('should queue nested updates', () => {
    // See https://github.com/react/react/issues/1147

    const xStore = createStore({s: 0});
    function X() {
      const state = use(xStore);
      if (state.s === 0) {
        return (
          <div>
            <span>0</span>
          </div>
        );
      } else {
        return <div>1</div>;
      }
    }
    const x = {
      go: () => {
        xStore.update(prev => ({...prev, s: 1}));
        xStore.update(prev => ({...prev, s: 0}));
        xStore.update(prev => ({...prev, s: 1}));
      },
    };

    class Y extends React.Component {
      render() {
        return (
          <div>
            <Z />
          </div>
        );
      }
    }

    class Z extends React.Component {
      render() {
        return <div />;
      }

      UNSAFE_componentWillUpdate() {
        x.go();
      }
    }

    let container = document.createElement('div');
    const xContainer = container;
    ReactDOM.render(<X />, container);
    container = document.createElement('div');
    const y = ReactDOM.render(<Y />, container);
    expect(xContainer.firstChild.textContent).toBe('0');

    y.forceUpdate();
    expect(xContainer.firstChild.textContent).toBe('1');
  });

  // @gate enableStore && !disableLegacyMode
  it('should queue updates from during mount', () => {
    // See https://github.com/react/react/issues/1353
    const aStore = createStore({x: 0});
    // The state of the last render and the host node of A, in place of
    // a.state and findDOMNode(a).
    let aState;
    let aNode;

    function A() {
      const state = use(aStore);
      aState = state;
      return <div ref={n => (aNode = n)}>A{state.x}</div>;
    }

    class B extends React.Component {
      UNSAFE_componentWillMount() {
        aStore.update(prev => ({...prev, x: 1}));
      }

      render() {
        return <div />;
      }
    }

    ReactDOM.unstable_batchedUpdates(function () {
      const container = document.createElement('div');

      ReactDOM.render(
        <div>
          <A />
          <B />
        </div>,
        container,
      );
    });

    expect(aState.x).toBe(1);
    expect(aNode.textContent).toBe('A1');
  });

  // @gate enableStore && !disableLegacyMode
  it('does not call render after a component as been deleted', () => {
    let renderCount = 0;
    const storeA = createStore({showB: true});
    const storeB = createStore({updates: 0});

    function B() {
      use(storeB);
      renderCount++;
      return <div />;
    }

    function A() {
      const state = use(storeA);
      return state.showB ? <B /> : <div />;
    }

    const container = document.createElement('div');
    ReactDOM.render(<A />, container);

    ReactDOM.unstable_batchedUpdates(function () {
      // B will have scheduled an update but the batching should ensure that its
      // update never fires.
      storeB.update(prev => ({...prev, updates: 1}));
      storeA.update(prev => ({...prev, showB: false}));
    });

    expect(renderCount).toBe(1);
  });

  // @gate enableStore && !disableLegacyMode
  it('does not update one component twice in a batch (#6371)', () => {
    let callbacks = [];
    function emitChange() {
      callbacks.forEach(c => c());
    }

    const store = createStore({showChild: true});
    function App() {
      const state = use(store);
      // componentDidMount
      React.useLayoutEffect(() => {
        store.update(prev => ({...prev, showChild: false}));
      }, []);
      return (
        <div>
          <ForceUpdatesOnChange />
          {state.showChild && <EmitsChangeOnUnmount />}
        </div>
      );
    }

    class EmitsChangeOnUnmount extends React.Component {
      componentWillUnmount() {
        emitChange();
      }
      render() {
        return null;
      }
    }

    class ForceUpdatesOnChange extends React.Component {
      componentDidMount() {
        this.onChange = () => this.forceUpdate();
        this.onChange();
        callbacks.push(this.onChange);
      }
      componentWillUnmount() {
        callbacks = callbacks.filter(c => c !== this.onChange);
      }
      render() {
        return <div key={Math.random()} onClick={function () {}} />;
      }
    }

    ReactDOM.render(<App />, document.createElement('div'));
  });

  // @gate enableStore && !disableLegacyMode
  it('can render ridiculously large number of roots without triggering infinite update loop error', () => {
    const fooStore = createStore({});
    function Foo() {
      use(fooStore);
      // componentDidMount
      React.useLayoutEffect(() => {
        const limit = 1200;
        for (let i = 0; i < limit; i++) {
          if (i < limit - 1) {
            ReactDOM.render(<div />, document.createElement('div'));
          } else {
            ReactDOM.render(<div />, document.createElement('div'), () => {
              // The "nested update limit" error isn't thrown until setState
              fooStore.update({});
            });
          }
        }
      }, []);
      return null;
    }

    const container = document.createElement('div');
    ReactDOM.render(<Foo />, container);
  });

  // @gate enableStore && !disableLegacyMode
  it('resets the update counter for unrelated updates', async () => {
    const container = document.createElement('div');
    const ref = React.createRef();

    function EventuallyTerminating({store, ref: instanceRef}) {
      const state = use(store);
      // Stands in for the class instance, so the test can check when it's
      // unmounted.
      React.useImperativeHandle(instanceRef, () => ({}), []);
      const didMount = React.useRef(false);
      React.useLayoutEffect(() => {
        if (!didMount.current) {
          // componentDidMount
          didMount.current = true;
          store.update(prev => ({...prev, step: 1}));
          return;
        }
        // componentDidUpdate
        if (state.step < limit) {
          store.update(prev => ({...prev, step: state.step + 1}));
        }
      });
      return state.step;
    }

    let limit = 55;
    let store = createStore({step: 0});
    await expect(async () => {
      await act(() => {
        ReactDOM.render(
          <EventuallyTerminating store={store} ref={ref} />,
          container,
        );
      });
    }).rejects.toThrow('Maximum');

    // Verify that we don't go over the limit if these updates are unrelated.
    limit -= 10;
    // store-semantics: stores persist across remounts, so a new store is passed for the new instance
    store = createStore({step: 0});
    ReactDOM.render(
      <EventuallyTerminating store={store} ref={ref} />,
      container,
    );
    expect(container.textContent).toBe(limit.toString());
    // In legacy mode, updates to function components outside of act warn,
    // unlike updates to classes.
    await act(() => {
      store.update(prev => ({...prev, step: 0}));
    });
    expect(container.textContent).toBe(limit.toString());
    await act(() => {
      store.update(prev => ({...prev, step: 0}));
    });
    expect(container.textContent).toBe(limit.toString());

    limit += 10;
    await expect(async () => {
      await act(() => {
        store.update(prev => ({...prev, step: 0}));
      });
    }).rejects.toThrow('Maximum');
    expect(ref.current).toBe(null);
  });

  // @gate enableStore && !disableLegacyMode
  it('does not fall into an infinite update loop', async () => {
    const store = createStore({step: 0});
    function NonTerminating({name}) {
      const state = use(store);
      const didMount = React.useRef(false);
      React.useLayoutEffect(() => {
        if (!didMount.current) {
          // componentDidMount
          didMount.current = true;
          store.update(prev => ({...prev, step: 1}));
          return;
        }
        // UNSAFE_componentWillUpdate has no function component equivalent.
        // Update after every update instead.
        store.update(prev => ({...prev, step: 2}));
      });

      return (
        <div>
          Hello {name}
          {state.step}
        </div>
      );
    }

    const container = document.createElement('div');
    await expect(async () => {
      await act(() => {
        ReactDOM.render(<NonTerminating />, container);
      });
    }).rejects.toThrow('Maximum');
  });

  // @gate enableStore && !disableLegacyMode
  it('does not fall into an infinite update loop with useLayoutEffect', async () => {
    const store = createStore(0);
    function NonTerminating() {
      const step = use(store);
      React.useLayoutEffect(() => {
        store.update(x => x + 1);
      });
      return step;
    }

    const container = document.createElement('div');
    await expect(async () => {
      await act(() => {
        ReactDOM.render(<NonTerminating />, container);
      });
    }).rejects.toThrow('Maximum');
  });

  // @gate enableStore && !disableLegacyMode
  it('can recover after falling into an infinite update loop', async () => {
    function NonTerminating({store}) {
      const state = use(store);
      const didMount = React.useRef(false);
      React.useLayoutEffect(() => {
        if (!didMount.current) {
          // componentDidMount
          didMount.current = true;
          store.update(prev => ({...prev, step: 1}));
          return;
        }
        // componentDidUpdate
        store.update(prev => ({...prev, step: 2}));
      });
      return state.step;
    }

    function Terminating({store}) {
      const state = use(store);
      // componentDidMount
      React.useLayoutEffect(() => {
        store.update(prev => ({...prev, step: 1}));
      }, []);
      return state.step;
    }

    const container = document.createElement('div');
    // store-semantics: stores persist across remounts, so a new store is passed for the new instance
    await expect(async () => {
      await act(() => {
        ReactDOM.render(
          <NonTerminating store={createStore({step: 0})} />,
          container,
        );
      });
    }).rejects.toThrow('Maximum');

    ReactDOM.render(<Terminating store={createStore({step: 0})} />, container);
    expect(container.textContent).toBe('1');

    await expect(async () => {
      await act(() => {
        ReactDOM.render(
          <NonTerminating store={createStore({step: 0})} />,
          container,
        );
      });
    }).rejects.toThrow('Maximum');

    ReactDOM.render(<Terminating store={createStore({step: 0})} />, container);
    expect(container.textContent).toBe('1');
  });

  // @gate enableStore && !disableLegacyMode
  it('does not fall into an infinite error loop', async () => {
    function BadRender() {
      throw new Error('error');
    }

    class ErrorBoundary extends React.Component {
      componentDidCatch() {
        // Schedule a no-op state update to avoid triggering a DEV warning in the test.
        this.setState({});

        this.props.parent.remount();
      }
      render() {
        return <BadRender />;
      }
    }

    const store = createStore({step: 0});
    const parent = {
      remount() {
        store.update(state => ({step: state.step + 1}));
      },
    };
    function NonTerminating() {
      const state = use(store);
      return <ErrorBoundary key={state.step} parent={parent} />;
    }

    const container = document.createElement('div');
    await expect(async () => {
      await act(() => {
        ReactDOM.render(<NonTerminating />, container);
      });
    }).rejects.toThrow('Maximum');
  });

  // @gate enableStore && !disableLegacyMode
  it('can schedule ridiculously many updates within the same batch without triggering a maximum update error', () => {
    const subscribers = [];
    // Each Child has independent state, so each gets its own store.
    const stores = [];
    for (let i = 0; i < 1200; i++) {
      stores.push(createStore({value: 'initial'}));
    }

    function Child({store}) {
      use(store);
      // componentDidMount
      React.useLayoutEffect(() => {
        subscribers.push(store);
      }, []);
      return null;
    }

    class App extends React.Component {
      render() {
        const children = [];
        for (let i = 0; i < 1200; i++) {
          children.push(<Child key={i} store={stores[i]} />);
        }
        return children;
      }
    }

    const container = document.createElement('div');
    ReactDOM.render(<App />, container);

    ReactDOM.unstable_batchedUpdates(() => {
      subscribers.forEach(s => {
        s.update(prev => ({...prev, value: 'update'}));
      });
    });
  });

  // TODO: Replace this branch with @gate pragmas
  if (__DEV__) {
    // @gate enableStore && !disableLegacyMode
    it('can have nested updates if they do not cross the limit', async () => {
      const LIMIT = 50;
      const store = createStore(0);
      const _setStep = store.update;

      function Terminating() {
        const step = use(store);
        React.useEffect(() => {
          if (step < LIMIT) {
            store.update(x => x + 1);
          }
        });
        Scheduler.log(step);
        return step;
      }

      const container = document.createElement('div');
      await act(() => {
        ReactDOM.render(<Terminating />, container);
      });
      assertLog(Array.from({length: LIMIT + 1}, (_, k) => k));
      expect(container.textContent).toBe('50');
      await act(() => {
        _setStep(0);
      });
      expect(container.textContent).toBe('50');
    });

    // @gate enableStore && !disableLegacyMode
    it('can have many updates inside useEffect without triggering a warning', async () => {
      const store = createStore(0);
      function Terminating() {
        const step = use(store);
        React.useEffect(() => {
          for (let i = 0; i < 1000; i++) {
            store.update(x => x + 1);
          }
          Scheduler.log('Done');
        }, []);
        return step;
      }

      const container = document.createElement('div');
      await act(() => {
        ReactDOM.render(<Terminating />, container);
      });

      assertLog(['Done']);
      expect(container.textContent).toBe('1000');
    });
  }
});

describe('ReactDOMLegacyFiber', () => {
  let container;

  beforeEach(() => {
    jest.resetModules();
    React = require('react');
    ReactDOM = require('react-dom');
    use = React.use;
    createStore = React.unstable_createStore;
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
    container = null;
    jest.restoreAllMocks();
  });

  // @gate enableStore && !disableLegacyMode
  it('should unmount empty portal component wherever it appears', () => {
    const portalContainer = document.createElement('div');

    const showStore = createStore(true);
    let renderedShow;
    function Wrapper() {
      const show = use(showStore);
      renderedShow = show;
      return (
        <div>
          {show && (
            <>
              {ReactDOM.createPortal(null, portalContainer)}
              <div>child</div>
            </>
          )}
          <div>parent</div>
        </div>
      );
    }

    ReactDOM.render(<Wrapper />, container);
    expect(container.innerHTML).toBe(
      '<div><div>child</div><div>parent</div></div>',
    );
    // In legacy mode, an update to a function component outside of act or a
    // batch warns, unlike an update to a class, so batch it. Legacy batches
    // flush synchronously when they exit.
    ReactDOM.unstable_batchedUpdates(() => {
      showStore.update(false);
    });
    expect(renderedShow).toBe(false);
    expect(container.innerHTML).toBe('<div><div>parent</div></div>');
  });

  // @gate enableStore && !disableLegacyMode
  it('should not update event handlers until commit', () => {
    spyOnDev(console, 'error');

    let ops = [];
    const handlerA = () => ops.push('A');
    const handlerB = () => ops.push('B');

    function click() {
      const event = new MouseEvent('click', {
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, 'timeStamp', {
        value: 0,
      });
      node.dispatchEvent(event);
    }

    const store = createStore({flip: false, count: 0});
    function Example({forceA}) {
      const state = use(store);
      const useB = !forceA && state.flip;
      return <div onClick={useB ? handlerB : handlerA} />;
    }

    class Click extends React.Component {
      constructor() {
        super();
        node.click();
      }
      render() {
        return null;
      }
    }

    // In legacy mode, an update to a function component outside of act or a
    // batch warns, unlike an update to a class, so batch it. Legacy batches
    // flush synchronously when they exit.
    const inst = {
      flip() {
        ReactDOM.unstable_batchedUpdates(() => {
          store.update(state => ({flip: true, count: state.count + 1}));
        });
      },
      tick() {
        ReactDOM.unstable_batchedUpdates(() => {
          store.update(state => ({...state, count: state.count + 1}));
        });
      },
    };
    ReactDOM.render([<Example key="a" />], container);
    const node = container.firstChild;
    expect(node.tagName).toEqual('DIV');

    click();

    expect(ops).toEqual(['A']);
    ops = [];

    // Render with the other event handler.
    inst.flip();

    click();

    expect(ops).toEqual(['B']);
    ops = [];

    // Rerender without changing any props.
    inst.tick();

    click();

    expect(ops).toEqual(['B']);
    ops = [];

    // Render a flip back to the A handler. The second component invokes the
    // click handler during render to simulate a click during an aborted
    // render. I use this hack because at current time we don't have a way to
    // test aborted ReactDOM renders.
    ReactDOM.render(
      [<Example key="a" forceA={true} />, <Click key="b" />],
      container,
    );

    // Because the new click handler has not yet committed, we should still
    // invoke B.
    expect(ops).toEqual(['B']);
    ops = [];

    // Any click that happens after commit, should invoke A.
    click();
    expect(ops).toEqual(['A']);

    if (__DEV__) {
      expect(console.error).toHaveBeenCalledTimes(2);
      expect(console.error.mock.calls[0][0]).toMatch(
        'ReactDOM.render has not been supported since React 18',
      );
      expect(console.error.mock.calls[1][0]).toMatch(
        'ReactDOM.render has not been supported since React 18',
      );
    }
  });

  // Regression test for https://github.com/react/react/issues/12643#issuecomment-413727104
  // @gate enableStore && !disableLegacyMode
  it('should not diff memoized host components', () => {
    const inputRef = React.createRef();
    let didCallOnChange = false;

    const childStore = createStore({});
    function Child() {
      use(childStore);
      React.useLayoutEffect(() => {
        const update = () => {
          // We're testing that this store update
          // doesn't cause React to commit updates
          // to the input outside (which would itself
          // prevent the parent's onChange parent handler
          // from firing).
          // In legacy mode, an update to a function component outside of act or a
          // batch warns, unlike an update to a class, so batch it. Legacy batches
          // flush synchronously when they exit.
          ReactDOM.unstable_batchedUpdates(() => {
            childStore.update({});
          });
          // Note that onChange was always broken when there was an
          // earlier setState() in a manual document capture phase
          // listener *in the same component*. But that's very rare.
          // Here we're testing that a *child* component doesn't break
          // the parent if this happens.
        };
        document.addEventListener('click', update, true);
        return () => {
          document.removeEventListener('click', update, true);
        };
      }, []);
      return <div />;
    }

    class Parent extends React.Component {
      handleChange = val => {
        didCallOnChange = true;
      };
      render() {
        return (
          <div>
            <Child />
            <input
              ref={inputRef}
              type="checkbox"
              checked={true}
              onChange={this.handleChange}
            />
          </div>
        );
      }
    }

    ReactDOM.render(<Parent />, container);
    inputRef.current.dispatchEvent(
      new MouseEvent('click', {
        bubbles: true,
      }),
    );
    expect(didCallOnChange).toBe(true);

    // Unmount, so Child removes its document listener before the next test.
    ReactDOM.unmountComponentAtNode(container);
  });
});

describe('ReactDOMSelect', () => {
  beforeEach(() => {
    jest.resetModules();
    React = require('react');
    ReactDOM = require('react-dom');
    use = React.use;
    createStore = React.unstable_createStore;
  });

  // @gate enableStore && !disableLegacyMode
  it('should allow controlling `value` in a nested legacy render', async () => {
    let selectNode;

    const store = createStore({
      value: 'giraffe',
    });

    function Parent() {
      const state = use(store);
      const nestingContainer = React.useRef(null);

      function handleChange(event) {
        store.update(prev => ({...prev, value: event.target.value}));
      }

      // componentDidMount and componentDidUpdate
      React.useLayoutEffect(() => {
        ReactDOM.render(
          <select
            onChange={handleChange}
            ref={n => (selectNode = n)}
            value={state.value}>
            <option value="monkey">A monkey!</option>
            <option value="giraffe">A giraffe!</option>
            <option value="gorilla">A gorilla!</option>
          </select>,
          nestingContainer.current,
        );
      });

      return <div ref={nestingContainer} />;
    }

    const container = document.createElement('div');

    document.body.appendChild(container);

    ReactDOM.render(<Parent />, container);

    expect(selectNode.value).toBe('giraffe');

    selectNode.value = 'gorilla';

    let nativeEvent = document.createEvent('Event');
    nativeEvent.initEvent('input', true, true);
    selectNode.dispatchEvent(nativeEvent);

    expect(selectNode.value).toEqual('gorilla');

    nativeEvent = document.createEvent('Event');
    nativeEvent.initEvent('change', true, true);
    selectNode.dispatchEvent(nativeEvent);

    expect(selectNode.value).toEqual('gorilla');

    document.body.removeChild(container);
  });
});

describe('ReactDOMInput', () => {
  let setUntrackedChecked;
  let container;

  function emptyFunction() {}

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

  function getTrackedAndCurrentInputValue(elem: HTMLElement): [mixed, mixed] {
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
    jest.resetModules();
    setUntrackedChecked = Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      'checked',
    ).set;
    React = require('react');
    ReactDOM = require('react-dom');
    use = React.use;
    createStore = React.unstable_createStore;
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
    jest.restoreAllMocks();
  });

  // @gate enableStore && !disableLegacyMode
  it('should control radio buttons if the tree updates during render in legacy mode', async () => {
    container.remove();
    container = document.createElement('div');
    document.body.appendChild(container);
    const sharedParent = container;
    const container1 = document.createElement('div');
    const container2 = document.createElement('div');

    sharedParent.appendChild(container1);

    let aNode;
    let bNode;
    const changedStore = createStore(false);
    function ComponentA() {
      use(changedStore);
      const didMount = React.useRef(false);
      const handleChange = () => {
        changedStore.update(true);
      };
      // componentDidUpdate
      React.useLayoutEffect(() => {
        if (didMount.current) {
          sharedParent.appendChild(container2);
        }
      });
      // componentDidMount
      React.useLayoutEffect(() => {
        didMount.current = true;
        ReactDOM.render(<ComponentB />, container2);
      }, []);
      return (
        <div>
          <input
            ref={n => (aNode = n)}
            type="radio"
            name="fruit"
            checked={false}
            onChange={handleChange}
          />
          A
        </div>
      );
    }

    class ComponentB extends React.Component {
      render() {
        return (
          <div>
            <input
              ref={n => (bNode = n)}
              type="radio"
              name="fruit"
              checked={true}
              onChange={emptyFunction}
            />
            B
          </div>
        );
      }
    }

    ReactDOM.render(<ComponentA />, container1);

    expect(aNode.checked).toBe(false);
    expect(bNode.checked).toBe(true);
    expect(isCheckedDirty(aNode)).toBe(true);
    expect(isCheckedDirty(bNode)).toBe(true);
    assertInputTrackingIsCurrent(container);

    setUntrackedChecked.call(aNode, true);
    // This next line isn't necessary in a proper browser environment, but
    // jsdom doesn't uncheck the others in a group (because they are not yet
    // sharing a parent), which makes this whole test a little less effective.
    setUntrackedChecked.call(bNode, false);

    // Now let's run the actual ReactDOMInput change event handler
    dispatchEventOnNode(aNode, 'click');

    // The original state should have been restored
    expect(aNode.checked).toBe(false);
    expect(bNode.checked).toBe(true);
    expect(isCheckedDirty(aNode)).toBe(true);
    expect(isCheckedDirty(bNode)).toBe(true);
    assertInputTrackingIsCurrent(container);
  });
});

describe('ReactDOMHooks', () => {
  let container;

  beforeEach(() => {
    jest.resetModules();
    React = require('react');
    ReactDOM = require('react-dom');
    use = React.use;
    createStore = React.unstable_createStore;
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  // @gate enableStore && !disableLegacyMode
  it('should not bail out when an update is scheduled from within an event handler', () => {
    const {createRef, useCallback} = React;

    const textStore = createStore('');
    const Example = ({inputRef, labelRef}) => {
      const text = use(textStore);
      const handleInput = useCallback(event => {
        textStore.update(event.target.value);
      });

      return (
        <>
          <input ref={inputRef} onInput={handleInput} />
          <label ref={labelRef}>{text}</label>
        </>
      );
    };

    const inputRef = createRef();
    const labelRef = createRef();

    ReactDOM.render(
      <Example inputRef={inputRef} labelRef={labelRef} />,
      container,
    );

    inputRef.current.value = 'abc';
    inputRef.current.dispatchEvent(
      new Event('input', {bubbles: true, cancelable: true}),
    );

    expect(labelRef.current.innerHTML).toBe('abc');
  });
});

describe('ReactCompositeComponent-state', () => {
  beforeEach(() => {
    jest.resetModules();
    React = require('react');
    ReactDOM = require('react-dom');
    use = React.use;
    createStore = React.unstable_createStore;
  });

  // @gate enableStore && !disableLegacyMode
  it('Legacy mode should support setState in componentWillUnmount (#18851)', () => {
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
    ReactDOM.render(<A />, el);
    expect(el.textContent).toBe('A');

    ReactDOM.render(<B />, el);
    expect(el.textContent).toBe('B No Sibling');
  });
});

describe('ReactDOMSuspensePlaceholder', () => {
  let container;
  let findDOMNode;
  let Suspense;
  let textCache;

  beforeEach(() => {
    jest.resetModules();
    React = require('react');
    ReactDOM = require('react-dom');
    findDOMNode =
      ReactDOM.__DOM_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE
        .findDOMNode;
    Scheduler = require('scheduler');
    act = require('internal-test-utils').act;
    assertLog = require('internal-test-utils').assertLog;
    Suspense = React.Suspense;
    use = React.use;
    createStore = React.unstable_createStore;
    container = document.createElement('div');
    document.body.appendChild(container);

    textCache = new Map();
  });

  afterEach(() => {
    document.body.removeChild(container);
  });

  function resolveText(text) {
    const record = textCache.get(text);
    if (record === undefined) {
      const newRecord = {
        status: 'resolved',
        value: text,
      };
      textCache.set(text, newRecord);
    } else if (record.status === 'pending') {
      const thenable = record.value;
      record.status = 'resolved';
      record.value = text;
      thenable.pings.forEach(t => t());
    }
  }

  function readText(text) {
    const record = textCache.get(text);
    if (record !== undefined) {
      switch (record.status) {
        case 'pending':
          Scheduler.log(`Suspend! [${text}]`);
          throw record.value;
        case 'rejected':
          throw record.value;
        case 'resolved':
          return record.value;
      }
    } else {
      Scheduler.log(`Suspend! [${text}]`);
      const thenable = {
        pings: [],
        then(resolve) {
          if (newRecord.status === 'pending') {
            thenable.pings.push(resolve);
          } else {
            Promise.resolve().then(() => resolve(newRecord.value));
          }
        },
      };

      const newRecord = {
        status: 'pending',
        value: thenable,
      };
      textCache.set(text, newRecord);

      throw thenable;
    }
  }

  function Text({text}) {
    Scheduler.log(text);
    return text;
  }

  function AsyncText({text}) {
    readText(text);
    Scheduler.log(text);
    return text;
  }

  // @gate enableStore && !disableLegacyMode
  it(
    'in legacy roots, re-hides children if their display is updated ' +
      'but the boundary is still showing the fallback',
    async () => {
      const isVisibleStore = createStore(false);
      const setIsVisible = isVisibleStore.update;
      function Sibling({children}) {
        const isVisible = use(isVisibleStore);
        return (
          <span style={{display: isVisible ? 'inline' : 'none'}}>
            {children}
          </span>
        );
      }

      function App() {
        return (
          <Suspense fallback={<Text text="Loading..." />}>
            <Sibling>Sibling</Sibling>
            <span>
              <AsyncText text="Async" />
            </span>
          </Suspense>
        );
      }

      await act(() => {
        ReactDOM.render(<App />, container);
      });
      expect(container.innerHTML).toEqual(
        '<span style="display: none;">Sibling</span><span style=' +
          '"display: none;"></span>Loading...',
      );
      assertLog(['Suspend! [Async]', 'Loading...']);

      // Update the inline display style. It will be overridden because it's
      // inside a hidden fallback.
      await act(() => setIsVisible(true));
      expect(container.innerHTML).toEqual(
        '<span style="display: none;">Sibling</span><span style=' +
          '"display: none;"></span>Loading...',
      );
      assertLog(['Suspend! [Async]']);

      // Unsuspend. The style should now match the inline prop.
      await act(() => resolveText('Async'));
      expect(container.innerHTML).toEqual(
        '<span style="display: inline;">Sibling</span><span style="">Async</span>',
      );
    },
  );

  // Regression test for https://github.com/react/react/issues/14188
  // @gate enableStore && !disableLegacyMode
  it('can call findDOMNode() in a suspended component commit phase in legacy roots', async () => {
    const log = [];
    const Lazy = React.lazy(
      () =>
        new Promise(resolve =>
          resolve({
            default() {
              return 'lazy';
            },
          }),
        ),
    );

    class Child extends React.Component {
      componentDidMount() {
        log.push('cDM ' + this.props.id);
        findDOMNode(this);
      }
      componentDidUpdate() {
        log.push('cDU ' + this.props.id);
        findDOMNode(this);
      }
      render() {
        return 'child';
      }
    }

    const buttonRef = React.createRef();
    const suspendStore = createStore(false);
    function App() {
      const suspend = use(suspendStore);
      const handleClick = () => {
        suspendStore.update(true);
      };
      return (
        <React.Suspense fallback="Loading">
          <Child id="first" />
          <button ref={buttonRef} onClick={handleClick}>
            Suspend
          </button>
          <Child id="second" />
          {suspend && <Lazy />}
        </React.Suspense>
      );
    }

    ReactDOM.render(<App />, container);

    expect(log).toEqual(['cDM first', 'cDM second']);
    log.length = 0;

    buttonRef.current.dispatchEvent(new MouseEvent('click', {bubbles: true}));
    await Lazy;
    expect(log).toEqual(['cDU first', 'cDU second']);
  });
});

describe('ReactLegacyErrorBoundaries', () => {
  let log;

  let ErrorBoundary;
  beforeEach(() => {
    jest.resetModules();
    ReactDOM = require('react-dom');
    React = require('react');
    use = React.use;
    createStore = React.unstable_createStore;
    log = [];

    ErrorBoundary = class extends React.Component {
      constructor(props) {
        super(props);
        this.state = {error: null};
        log.push(`${this.props.logName} constructor`);
      }
      render() {
        if (this.state.error && !this.props.forceRetry) {
          log.push(`${this.props.logName} render error`);
          return this.props.renderError(this.state.error, this.props);
        }
        log.push(`${this.props.logName} render success`);
        return <div>{this.props.children}</div>;
      }
      componentDidCatch(error) {
        log.push(`${this.props.logName} componentDidCatch`);
        this.setState({error});
      }
      UNSAFE_componentWillMount() {
        log.push(`${this.props.logName} componentWillMount`);
      }
      componentDidMount() {
        log.push(`${this.props.logName} componentDidMount`);
      }
      UNSAFE_componentWillReceiveProps() {
        log.push(`${this.props.logName} componentWillReceiveProps`);
      }
      UNSAFE_componentWillUpdate() {
        log.push(`${this.props.logName} componentWillUpdate`);
      }
      componentDidUpdate() {
        log.push(`${this.props.logName} componentDidUpdate`);
      }
      componentWillUnmount() {
        log.push(`${this.props.logName} componentWillUnmount`);
      }
    };
    ErrorBoundary.defaultProps = {
      logName: 'ErrorBoundary',
      renderError(error, props) {
        return (
          <div ref={props.errorMessageRef}>
            Caught an error: {error.message}.
          </div>
        );
      },
    };
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // @gate enableStore && !disableLegacyMode
  it('catches errors originating downstream', () => {
    let fail = false;
    const statefulStore = createStore({shouldThrow: false});
    function Stateful(props) {
      use(statefulStore);
      if (fail) {
        log.push('Stateful render [!]');
        throw new Error('Hello');
      }
      return <div>{props.children}</div>;
    }

    const container = document.createElement('div');
    ReactDOM.render(
      <ErrorBoundary>
        <Stateful />
      </ErrorBoundary>,
      container,
    );

    log.length = 0;
    expect(() => {
      fail = true;
      // A store update re-renders only Stateful, like forceUpdate. In legacy
      // mode, an update to a function component outside of act or a batch
      // warns, unlike an update to a class, so batch it. Legacy batches flush
      // synchronously when they exit.
      ReactDOM.unstable_batchedUpdates(() => {
        statefulStore.update({shouldThrow: false});
      });
    }).not.toThrow();

    expect(log).toEqual([
      'Stateful render [!]',
      'ErrorBoundary componentDidCatch',
      'ErrorBoundary componentWillUpdate',
      'ErrorBoundary render error',
      'ErrorBoundary componentDidUpdate',
    ]);

    log.length = 0;
    ReactDOM.unmountComponentAtNode(container);
    expect(log).toEqual(['ErrorBoundary componentWillUnmount']);
  });
});

describe('ReactMount', () => {
  beforeEach(() => {
    jest.resetModules();
    React = require('react');
    ReactDOM = require('react-dom');
    use = React.use;
    createStore = React.unstable_createStore;
  });

  // @gate enableStore && !disableLegacyMode
  it('initial mount of legacy root is sync inside batchedUpdates, as if it were wrapped in flushSync', () => {
    const container1 = document.createElement('div');
    const container2 = document.createElement('div');

    const activeStore = createStore(false);
    function Foo({children}) {
      const active = use(activeStore);
      // componentDidMount
      React.useLayoutEffect(() => {
        activeStore.update(true);
      }, []);
      return <div>{children + (active ? '!' : '')}</div>;
    }

    ReactDOM.render(<div>1</div>, container1);

    ReactDOM.unstable_batchedUpdates(() => {
      // Update. Does not flush yet.
      ReactDOM.render(<div>2</div>, container1);
      expect(container1.textContent).toEqual('1');

      // Initial mount on another root. Should flush immediately.
      ReactDOM.render(<Foo>a</Foo>, container2);
      // The earlier update also flushed, since flushSync flushes all pending
      // sync work across all roots.
      expect(container1.textContent).toEqual('2');
      // Layout updates are also flushed synchronously
      expect(container2.textContent).toEqual('a!');
    });
    expect(container1.textContent).toEqual('2');
    expect(container2.textContent).toEqual('a!');
  });
});

// Legacy roots commit a suspended tree in an incomplete state: the siblings of
// the component that suspended mount, hidden, and a component that suspends on
// an update keeps its committed fiber. The readers must stay subscribed exactly
// once, render the latest value, and release the store when they unmount.
describe('Suspense', () => {
  let ReactNoop;
  let Suspense;

  beforeEach(() => {
    jest.resetModules();
    React = require('react');
    ReactNoop = require('react-noop-renderer');
    Scheduler = require('scheduler');
    act = require('internal-test-utils').act;
    assertLog = require('internal-test-utils').assertLog;
    Suspense = React.Suspense;
    use = React.use;
    createStore = React.unstable_createStore;
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
      Scheduler.log('Resolved');
      return 'Resolved';
    }
    return {Suspender, resolve: () => resolve()};
  }

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

    const root = ReactNoop.createLegacyRoot();
    await act(() => {
      root.render(<App />);
    });
    assertLog(['Reader: A', 'Suspend!', 'Loading...']);
    expect(root).toMatchRenderedOutput('Loading...');

    // Update the store without resolving the promise.
    await act(() => {
      store.update('B');
    });
    assertLog(['Reader: B', 'Suspend!']);
    expect(root).toMatchRenderedOutput('Loading...');

    await act(() => {
      resolve();
    });
    assertLog(['Resolved']);
    expect(root).toMatchRenderedOutput('Reader: BResolved');

    // Only the reader is subscribed once the boundary is revealed.
    expect(store._records.length).toBe(1);
    expect(store._records[0].readers.size).toBe(1);

    await act(() => {
      store.update('C');
    });
    assertLog(['Reader: C']);
    expect(root).toMatchRenderedOutput('Reader: CResolved');

    await act(() => {
      root.render(null);
    });
    expect(store._records.length).toBe(0);
  });

  // @gate enableStore && !disableLegacyMode
  it('a mounted reader that suspends on an update renders store updates', async () => {
    const store = createStore('A');
    const {Suspender, resolve} = createSuspender();

    function Reader({suspend}) {
      const value = use(store);
      if (suspend) {
        return (
          <>
            <Text text={'Reader: ' + value} />
            <Suspender />
          </>
        );
      }
      return <Text text={'Reader: ' + value} />;
    }

    function App({suspend}) {
      return (
        <Suspense fallback={<Text text="Loading..." />}>
          <Reader suspend={suspend} />
        </Suspense>
      );
    }

    const root = ReactNoop.createLegacyRoot();
    await act(() => {
      root.render(<App suspend={false} />);
    });
    assertLog(['Reader: A']);
    expect(root).toMatchRenderedOutput('Reader: A');

    await act(() => {
      root.render(<App suspend={true} />);
    });
    assertLog(['Reader: A', 'Suspend!', 'Loading...']);
    expect(root).toMatchRenderedOutput('Loading...');

    // Update the store while the reader is suspended.
    await act(() => {
      store.update('B');
    });
    assertLog(['Reader: B', 'Suspend!']);
    expect(root).toMatchRenderedOutput('Loading...');

    // The reader committed with B while suspended, so the retry only renders
    // the component that suspended.
    await act(() => {
      resolve();
    });
    assertLog(['Resolved']);
    expect(root).toMatchRenderedOutput('Reader: BResolved');

    expect(store._records.length).toBe(1);
    expect(store._records[0].readers.size).toBe(1);

    await act(() => {
      store.update('C');
    });
    assertLog(['Reader: C', 'Resolved']);
    expect(root).toMatchRenderedOutput('Reader: CResolved');

    await act(() => {
      root.render(null);
    });
    expect(store._records.length).toBe(0);
  });
});
