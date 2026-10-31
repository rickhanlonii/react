/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 */

'use strict';

// The context cases of ReactNewContext-test.js, with context replaced by
// `use(store)`. See "Context copies" in docs/use-store/COPY_RULES.md.

let React = require('react');
let use;
let createStore;
let ReactNoop;
let Scheduler;
let gen;
let waitForAll;
let waitForThrow;

describe('ReactNewContext', () => {
  beforeEach(() => {
    jest.resetModules();

    React = require('react');
    use = React.use;
    createStore = React.unstable_createStore;
    ReactNoop = require('react-noop-renderer');
    Scheduler = require('scheduler');
    gen = require('random-seed');

    ({waitForAll, waitForThrow} = require('internal-test-utils'));
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function Text(props) {
    Scheduler.log(props.text);
    return <span prop={props.text} />;
  }

  // Note: This is based on a similar component we use in www. We can delete
  // once the extra div wrapper is no longer necessary.
  function LegacyHiddenDiv({children, mode}) {
    return (
      <div hidden={mode === 'hidden'}>
        <React.unstable_LegacyHidden
          mode={mode === 'hidden' ? 'unstable-defer-without-hiding' : mode}>
          {children}
        </React.unstable_LegacyHidden>
      </div>
    );
  }

  // The original runs these cases once per way of reading context. A store is
  // read with use(store), so the Consumer variant is a function component that
  // calls it. The two class variants (readContext inside a class component and
  // inside a pure class component) are left out: classes can't read stores.
  // They're listed in scripts/store-parity/skips/context-reconciler.json.
  sharedContextTests(
    'Context.Consumer',
    store =>
      function Consumer(props) {
        return props.children(use(store));
      },
  );
  sharedContextTests(
    'useContext inside function component',
    store =>
      function Consumer(props) {
        const contextValue = use(store);
        const render = props.children;
        return render(contextValue);
      },
  );
  sharedContextTests('useContext inside forwardRef component', store =>
    React.forwardRef(function Consumer(props, ref) {
      const contextValue = use(store);
      const render = props.children;
      return render(contextValue);
    }),
  );
  sharedContextTests('useContext inside memoized function component', store =>
    React.memo(function Consumer(props) {
      const contextValue = use(store);
      const render = props.children;
      return render(contextValue);
    }),
  );

  function sharedContextTests(label, getConsumer) {
    describe(`reading context with ${label}`, () => {
      // @gate enableStore
      it('simple mount and update', async () => {
        // The Provider's first value is the store's initial value.
        const store = createStore(2);
        const Consumer = getConsumer(store);

        const Indirection = React.Fragment;

        function App() {
          return (
            <Indirection>
              <Indirection>
                <Consumer>
                  {value => <span prop={'Result: ' + value} />}
                </Consumer>
              </Indirection>
            </Indirection>
          );
        }

        ReactNoop.render(<App />);
        await waitForAll([]);
        expect(ReactNoop).toMatchRenderedOutput(<span prop="Result: 2" />);

        // Update
        store.update(3);
        await waitForAll([]);
        expect(ReactNoop).toMatchRenderedOutput(<span prop="Result: 3" />);
      });

      // @gate enableStore
      it('propagates through shouldComponentUpdate false', async () => {
        const store = createStore(2);
        const ContextConsumer = getConsumer(store);

        // Stands in for the component that rendered the Provider.
        function Provider(props) {
          Scheduler.log('Provider');
          return props.children;
        }

        function Consumer(props) {
          Scheduler.log('Consumer');
          return (
            <ContextConsumer>
              {value => {
                Scheduler.log('Consumer render prop');
                return <span prop={'Result: ' + value} />;
              }}
            </ContextConsumer>
          );
        }

        class Indirection extends React.Component {
          shouldComponentUpdate() {
            return false;
          }
          render() {
            Scheduler.log('Indirection');
            return this.props.children;
          }
        }

        function App() {
          Scheduler.log('App');
          return (
            <Provider>
              <Indirection>
                <Indirection>
                  <Consumer />
                </Indirection>
              </Indirection>
            </Provider>
          );
        }

        ReactNoop.render(<App />);
        await waitForAll([
          'App',
          'Provider',
          'Indirection',
          'Indirection',
          'Consumer',
          'Consumer render prop',
        ]);
        expect(ReactNoop).toMatchRenderedOutput(<span prop="Result: 2" />);

        // Update. The original re-renders App with a new Provider value. Keep
        // the re-render, so the update has to get past the
        // shouldComponentUpdate bailouts, and change the value with a store
        // update in the same batch.
        ReactNoop.render(<App />);
        store.update(3);
        await waitForAll(['App', 'Provider', 'Consumer render prop']);
        expect(ReactNoop).toMatchRenderedOutput(<span prop="Result: 3" />);
      });

      // @gate enableStore
      it('consumers bail out if context value is the same', async () => {
        const store = createStore(2);
        const ContextConsumer = getConsumer(store);

        // Stands in for the component that rendered the Provider.
        function Provider(props) {
          Scheduler.log('Provider');
          return props.children;
        }

        function Consumer(props) {
          Scheduler.log('Consumer');
          return (
            <ContextConsumer>
              {value => {
                Scheduler.log('Consumer render prop');
                return <span prop={'Result: ' + value} />;
              }}
            </ContextConsumer>
          );
        }

        class Indirection extends React.Component {
          shouldComponentUpdate() {
            return false;
          }
          render() {
            Scheduler.log('Indirection');
            return this.props.children;
          }
        }

        function App() {
          Scheduler.log('App');
          return (
            <Provider>
              <Indirection>
                <Indirection>
                  <Consumer />
                </Indirection>
              </Indirection>
            </Provider>
          );
        }

        ReactNoop.render(<App />);
        await waitForAll([
          'App',
          'Provider',
          'Indirection',
          'Indirection',
          'Consumer',
          'Consumer render prop',
        ]);
        expect(ReactNoop).toMatchRenderedOutput(<span prop="Result: 2" />);

        // Update with the same context value
        ReactNoop.render(<App />);
        store.update(2);
        await waitForAll([
          'App',
          'Provider',
          // Don't call render prop again
        ]);
        expect(ReactNoop).toMatchRenderedOutput(<span prop="Result: 2" />);
      });

      // @gate enableStore
      it('multiple consumers in different branches', async () => {
        // Each Provider level is its own store. In the original, the inner
        // Provider derives its value from the outer one (value * 2), so each
        // update here dispatches both values.
        const outerStore = createStore(2);
        const innerStore = createStore(4);
        const OuterConsumer = getConsumer(outerStore);
        const InnerConsumer = getConsumer(innerStore);

        class Indirection extends React.Component {
          shouldComponentUpdate() {
            return false;
          }
          render() {
            return this.props.children;
          }
        }

        function App() {
          return (
            <Indirection>
              <Indirection>
                <InnerConsumer>
                  {value => <span prop={'Result: ' + value} />}
                </InnerConsumer>
              </Indirection>
              <Indirection>
                <OuterConsumer>
                  {value => <span prop={'Result: ' + value} />}
                </OuterConsumer>
              </Indirection>
            </Indirection>
          );
        }

        ReactNoop.render(<App />);
        await waitForAll([]);
        expect(ReactNoop).toMatchRenderedOutput(
          <>
            <span prop="Result: 4" />
            <span prop="Result: 2" />
          </>,
        );

        // Update
        ReactNoop.render(<App />);
        outerStore.update(3);
        innerStore.update(6);
        await waitForAll([]);
        expect(ReactNoop).toMatchRenderedOutput(
          <>
            <span prop="Result: 6" />
            <span prop="Result: 3" />
          </>,
        );

        // Another update
        ReactNoop.render(<App />);
        outerStore.update(4);
        innerStore.update(8);
        await waitForAll([]);
        expect(ReactNoop).toMatchRenderedOutput(
          <>
            <span prop="Result: 8" />
            <span prop="Result: 4" />
          </>,
        );
      });

      // @gate enableStore
      it('compares context values with Object.is semantics', async () => {
        const store = createStore(NaN);
        const ContextConsumer = getConsumer(store);

        // Stands in for the component that rendered the Provider.
        function Provider(props) {
          Scheduler.log('Provider');
          return props.children;
        }

        function Consumer(props) {
          Scheduler.log('Consumer');
          return (
            <ContextConsumer>
              {value => {
                Scheduler.log('Consumer render prop');
                return <span prop={'Result: ' + value} />;
              }}
            </ContextConsumer>
          );
        }

        class Indirection extends React.Component {
          shouldComponentUpdate() {
            return false;
          }
          render() {
            Scheduler.log('Indirection');
            return this.props.children;
          }
        }

        function App() {
          Scheduler.log('App');
          return (
            <Provider>
              <Indirection>
                <Indirection>
                  <Consumer />
                </Indirection>
              </Indirection>
            </Provider>
          );
        }

        ReactNoop.render(<App />);
        await waitForAll([
          'App',
          'Provider',
          'Indirection',
          'Indirection',
          'Consumer',
          'Consumer render prop',
        ]);
        expect(ReactNoop).toMatchRenderedOutput(<span prop="Result: NaN" />);

        // Update
        ReactNoop.render(<App />);
        store.update(NaN);
        await waitForAll([
          'App',
          'Provider',
          // Consumer should not re-render again
          // 'Consumer render prop',
        ]);
        expect(ReactNoop).toMatchRenderedOutput(<span prop="Result: NaN" />);
      });

      // @gate enableStore
      it("does not re-render if there's an update in a child", async () => {
        const store = createStore(1);
        const Consumer = getConsumer(store);

        let child;
        class Child extends React.Component {
          state = {step: 0};
          render() {
            Scheduler.log('Child');
            return (
              <span
                prop={`Context: ${this.props.context}, Step: ${this.state.step}`}
              />
            );
          }
        }

        function App() {
          return (
            <Consumer>
              {value => {
                Scheduler.log('Consumer render prop');
                return <Child ref={inst => (child = inst)} context={value} />;
              }}
            </Consumer>
          );
        }

        // Initial mount
        ReactNoop.render(<App />);
        await waitForAll(['Consumer render prop', 'Child']);
        expect(ReactNoop).toMatchRenderedOutput(
          <span prop="Context: 1, Step: 0" />,
        );

        child.setState({step: 1});
        await waitForAll(['Child']);
        expect(ReactNoop).toMatchRenderedOutput(
          <span prop="Context: 1, Step: 1" />,
        );
      });

      // @gate enableStore
      it('consumer bails out if value is unchanged and something above bailed out', async () => {
        const store = createStore(1);
        const Consumer = getConsumer(store);

        function renderChildValue(value) {
          Scheduler.log('Consumer');
          return <span prop={value} />;
        }

        function ChildWithInlineRenderCallback() {
          Scheduler.log('ChildWithInlineRenderCallback');
          // Note: we are intentionally passing an inline arrow. Don't refactor.
          return <Consumer>{value => renderChildValue(value)}</Consumer>;
        }

        function ChildWithCachedRenderCallback() {
          Scheduler.log('ChildWithCachedRenderCallback');
          return <Consumer>{renderChildValue}</Consumer>;
        }

        class PureIndirection extends React.PureComponent {
          render() {
            Scheduler.log('PureIndirection');
            return (
              <>
                <ChildWithInlineRenderCallback />
                <ChildWithCachedRenderCallback />
              </>
            );
          }
        }

        class App extends React.Component {
          render() {
            Scheduler.log('App');
            return <PureIndirection />;
          }
        }

        // Initial mount
        ReactNoop.render(<App />);
        await waitForAll([
          'App',
          'PureIndirection',
          'ChildWithInlineRenderCallback',
          'Consumer',
          'ChildWithCachedRenderCallback',
          'Consumer',
        ]);
        expect(ReactNoop).toMatchRenderedOutput(
          <>
            <span prop={1} />
            <span prop={1} />
          </>,
        );

        // Update (bailout). The original re-renders App with the same
        // Provider value. Keep the re-render, so PureIndirection bails out,
        // and dispatch the same value to the store in the same batch.
        ReactNoop.render(<App />);
        store.update(1);
        await waitForAll(['App']);
        expect(ReactNoop).toMatchRenderedOutput(
          <>
            <span prop={1} />
            <span prop={1} />
          </>,
        );

        // Update (no bailout)
        ReactNoop.render(<App />);
        store.update(2);
        await waitForAll(['App', 'Consumer', 'Consumer']);
        expect(ReactNoop).toMatchRenderedOutput(
          <>
            <span prop={2} />
            <span prop={2} />
          </>,
        );
      });

      // @gate enableStore && enableLegacyHidden
      it("context consumer doesn't bail out inside hidden subtree", async () => {
        const store = createStore('dark');
        const Consumer = getConsumer(store);

        function App() {
          return (
            <LegacyHiddenDiv mode="hidden">
              <Consumer>{value => <Text text={value} />}</Consumer>
            </LegacyHiddenDiv>
          );
        }

        ReactNoop.render(<App />);
        await waitForAll(['dark']);
        expect(ReactNoop.getChildrenAsJSX()).toEqual(
          <div hidden={true}>
            <span prop="dark" />
          </div>,
        );

        // Only the store changes, so nothing above the hidden tree
        // re-renders. The update has to find the reader inside it.
        store.update('light');
        await waitForAll(['light']);
        expect(ReactNoop.getChildrenAsJSX()).toEqual(
          <div hidden={true}>
            <span prop="light" />
          </div>,
        );
      });

      // This is a regression case for https://github.com/react/react/issues/12389.
      // @gate enableStore
      it('does not run into an infinite loop', async () => {
        const store = createStore({});
        const Consumer = getConsumer(store);

        class App extends React.Component {
          renderItem(id) {
            return (
              <span key={id}>
                <Consumer>{() => <span>inner</span>}</Consumer>
                <span>outer</span>
              </span>
            );
          }
          renderList() {
            const list = [1, 2].map(id => this.renderItem(id));
            if (this.props.reverse) {
              list.reverse();
            }
            return list;
          }
          render() {
            return this.renderList();
          }
        }

        // The original provides a new object on every render, so every
        // re-render also changes the store.
        ReactNoop.render(<App reverse={false} />);
        await waitForAll([]);
        ReactNoop.render(<App reverse={true} />);
        store.update({});
        await waitForAll([]);
        ReactNoop.render(<App reverse={false} />);
        store.update({});
        await waitForAll([]);
      });

      // This is a regression case for https://github.com/react/react/issues/12686
      // @gate enableStore
      it('does not skip some siblings', async () => {
        const store = createStore(0);
        const ContextConsumer = getConsumer(store);

        // App's state still decides whether Indirection is rendered. The
        // Provider value it passed down is the store, updated with it.
        class App extends React.Component {
          state = {
            step: 0,
          };

          render() {
            Scheduler.log('App');
            return (
              <>
                <StaticContent />
                {this.state.step > 0 && <Indirection />}
              </>
            );
          }
        }

        class StaticContent extends React.PureComponent {
          render() {
            return (
              <>
                <>
                  <span prop="static 1" />
                  <span prop="static 2" />
                </>
              </>
            );
          }
        }

        class Indirection extends React.PureComponent {
          render() {
            return (
              <ContextConsumer>
                {value => {
                  Scheduler.log('Consumer');
                  return <span prop={value} />;
                }}
              </ContextConsumer>
            );
          }
        }

        // Initial mount
        let inst;
        ReactNoop.render(<App ref={ref => (inst = ref)} />);
        await waitForAll(['App']);
        expect(ReactNoop).toMatchRenderedOutput(
          <>
            <span prop="static 1" />
            <span prop="static 2" />
          </>,
        );
        // Update the first time
        inst.setState({step: 1});
        store.update(1);
        await waitForAll(['App', 'Consumer']);
        expect(ReactNoop).toMatchRenderedOutput(
          <>
            <span prop="static 1" />
            <span prop="static 2" />
            <span prop={1} />
          </>,
        );
        // Update the second time
        inst.setState({step: 2});
        store.update(2);
        await waitForAll(['App', 'Consumer']);
        expect(ReactNoop).toMatchRenderedOutput(
          <>
            <span prop="static 1" />
            <span prop="static 2" />
            <span prop={2} />
          </>,
        );
      });
    });
  }

  describe('Context.Consumer', () => {
    // @gate enableStore
    it('can read other contexts inside consumer render prop', async () => {
      const fooStore = createStore(1);
      const barStore = createStore(1);

      // <FooContext.Consumer> becomes a function component that reads the
      // store and calls its render prop.
      function FooConsumer({children}) {
        return children(use(fooStore));
      }

      function FooAndBar() {
        return (
          <FooConsumer>
            {foo => {
              const bar = use(barStore);
              return <Text text={`Foo: ${foo}, Bar: ${bar}`} />;
            }}
          </FooConsumer>
        );
      }

      class Indirection extends React.Component {
        shouldComponentUpdate() {
          return false;
        }
        render() {
          return this.props.children;
        }
      }

      function App() {
        return (
          <Indirection>
            <FooAndBar />
          </Indirection>
        );
      }

      ReactNoop.render(<App />);
      await waitForAll(['Foo: 1, Bar: 1']);
      expect(ReactNoop).toMatchRenderedOutput(<span prop="Foo: 1, Bar: 1" />);

      // Update foo. App re-renders, as in the original, so the update has
      // to get past Indirection's bailout.
      ReactNoop.render(<App />);
      fooStore.update(2);
      await waitForAll(['Foo: 2, Bar: 1']);
      expect(ReactNoop).toMatchRenderedOutput(<span prop="Foo: 2, Bar: 1" />);

      // Update bar
      ReactNoop.render(<App />);
      barStore.update(2);
      await waitForAll(['Foo: 2, Bar: 2']);
      expect(ReactNoop).toMatchRenderedOutput(<span prop="Foo: 2, Bar: 2" />);
    });

    // Context consumer bails out on propagating "deep" updates when `value` hasn't changed.
    // However, it doesn't bail out from rendering if the component above it re-rendered anyway.
    // If we bailed out on referential equality, it would be confusing that you
    // can call this.setState(), but an autobound render callback "blocked" the update.
    // https://github.com/react/react/pull/12470#issuecomment-376917711
    // @gate enableStore
    it('consumer does not bail out if there were no bailouts above it', async () => {
      const store = createStore(1);
      // <Context.Consumer> becomes a function component that reads the store
      // and calls its render prop.
      function Consumer({children}) {
        return children(use(store));
      }

      class App extends React.Component {
        state = {
          text: 'hello',
        };

        renderConsumer = context => {
          Scheduler.log('App#renderConsumer');
          return <span prop={this.state.text} />;
        };

        render() {
          Scheduler.log('App');
          return <Consumer>{this.renderConsumer}</Consumer>;
        }
      }

      // Initial mount
      let inst;
      ReactNoop.render(<App ref={ref => (inst = ref)} />);
      await waitForAll(['App', 'App#renderConsumer']);
      expect(ReactNoop).toMatchRenderedOutput(<span prop="hello" />);

      // Update
      inst.setState({text: 'goodbye'});
      await waitForAll(['App', 'App#renderConsumer']);
      expect(ReactNoop).toMatchRenderedOutput(<span prop="goodbye" />);
    });
  });

  describe('useContext', () => {
    // @gate enableStore
    it('throws when used in a class component', async () => {
      const store = createStore(0);
      class Foo extends React.Component {
        render() {
          return use(store);
        }
      }
      ReactNoop.render(<Foo />);
      await waitForThrow(
        'Invalid hook call. Hooks can only be called inside of the body of a function component. This could happen' +
          ' for one of the following reasons:\n' +
          '1. You might have mismatching versions of React and the renderer (such as React DOM)\n' +
          '2. You might be breaking the Rules of Hooks\n' +
          '3. You might have more than one copy of React in the same app\n' +
          'See https://react.dev/link/invalid-hook-call for tips about how to debug and fix this problem.',
      );
    });

    // Context consumer bails out on propagating "deep" updates when `value` hasn't changed.
    // However, it doesn't bail out from rendering if the component above it re-rendered anyway.
    // If we bailed out on referential equality, it would be confusing that you
    // can call this.setState(), but an autobound render callback "blocked" the update.
    // https://github.com/react/react/pull/12470#issuecomment-376917711
    // @gate enableStore
    it('does not bail out if there were no bailouts above it', async () => {
      const store = createStore(1);

      function Consumer({children}) {
        const contextValue = use(store);
        return children(contextValue);
      }

      class App extends React.Component {
        state = {
          text: 'hello',
        };

        renderConsumer = context => {
          Scheduler.log('App#renderConsumer');
          return <span prop={this.state.text} />;
        };

        render() {
          Scheduler.log('App');
          return <Consumer>{this.renderConsumer}</Consumer>;
        }
      }

      // Initial mount
      let inst;
      ReactNoop.render(<App ref={ref => (inst = ref)} />);
      await waitForAll(['App', 'App#renderConsumer']);
      expect(ReactNoop).toMatchRenderedOutput(<span prop="hello" />);

      // Update
      inst.setState({text: 'goodbye'});
      await waitForAll(['App', 'App#renderConsumer']);
      expect(ReactNoop).toMatchRenderedOutput(<span prop="goodbye" />);
    });
  });

  // @gate enableStore
  it('unwinds after errors in complete phase', async () => {
    // The original is a regression test for the context stack getting
    // misaligned when a render throws in the complete phase. A store has no
    // stack, but a render that read the store and then threw must not leave
    // anything behind that breaks the next render.
    const store = createStore(null);

    function Reader() {
      return <span prop={use(store)} />;
    }

    ReactNoop.render(
      <errorInCompletePhase>
        <Reader />
      </errorInCompletePhase>,
    );
    await waitForThrow('Error in host config.');

    store.update(10);
    ReactNoop.render(<Reader />);
    await waitForAll([]);
    expect(ReactNoop).toMatchRenderedOutput(<span prop={10} />);
  });

  describe('fuzz test', () => {
    const contextKeys = ['A', 'B', 'C', 'D', 'E', 'F', 'G'];

    const FLUSH_ALL = 'FLUSH_ALL';
    function flushAll() {
      return {
        type: FLUSH_ALL,
        toString() {
          return `flushAll()`;
        },
      };
    }

    const FLUSH = 'FLUSH';
    function flush(unitsOfWork) {
      return {
        type: FLUSH,
        unitsOfWork,
        toString() {
          return `flush(${unitsOfWork})`;
        },
      };
    }

    const UPDATE = 'UPDATE';
    function update(key, value) {
      return {
        type: UPDATE,
        key,
        value,
        toString() {
          return `update('${key}', ${value})`;
        },
      };
    }

    function randomInteger(min, max) {
      min = Math.ceil(min);
      max = Math.floor(max);
      return Math.floor(Math.random() * (max - min)) + min;
    }

    function randomAction() {
      switch (randomInteger(0, 3)) {
        case 0:
          return flushAll();
        case 1:
          return flush(randomInteger(0, 500));
        case 2:
          const key = contextKeys[randomInteger(0, contextKeys.length)];
          const value = randomInteger(1, 10);
          return update(key, value);
        default:
          throw new Error('Switch statement should be exhaustive');
      }
    }

    function randomActions(n) {
      const actions = [];
      for (let i = 0; i < n; i++) {
        actions.push(randomAction());
      }
      return actions;
    }

    function ContextSimulator(maxDepth) {
      const initialValues = contextKeys.reduce(
        (result, key, i) => ({...result, [key]: i + 1}),
        {},
      );

      // One store per context. The Providers at the root become store
      // updates.
      const stores = new Map(
        contextKeys.map(key => [key, createStore(initialValues[key])]),
      );

      function StoreConsumer({store, children}) {
        return children(use(store));
      }

      class ConsumerTree extends React.Component {
        shouldComponentUpdate() {
          return false;
        }
        render() {
          Scheduler.log();
          if (this.props.depth >= this.props.maxDepth) {
            return null;
          }
          const consumers = [0, 1, 2].map(i => {
            const randomKey =
              contextKeys[
                this.props.rand.intBetween(0, contextKeys.length - 1)
              ];
            const store = stores.get(randomKey);
            return (
              <StoreConsumer key={i} store={store}>
                {value => (
                  <>
                    <span prop={`${randomKey}:${value}`} />
                    <ConsumerTree
                      rand={this.props.rand}
                      depth={this.props.depth + 1}
                      maxDepth={this.props.maxDepth}
                    />
                  </>
                )}
              </StoreConsumer>
            );
          });
          return consumers;
        }
      }

      function Root(props) {
        return (
          <ConsumerTree rand={props.rand} depth={0} maxDepth={props.maxDepth} />
        );
      }

      function assertConsistentTree(expectedValues = {}) {
        const jsx = ReactNoop.getChildrenAsJSX();
        const children = jsx === null ? [] : jsx.props.children;
        children.forEach(child => {
          const text = child.props.prop;
          const key = text[0];
          const value = parseInt(text[2], 10);
          const expectedValue = expectedValues[key];
          if (expectedValue === undefined) {
            // If an expected value was not explicitly passed to this function,
            // use the first occurrence.
            expectedValues[key] = value;
          } else if (value !== expectedValue) {
            throw new Error(
              `Inconsistent value! Expected: ${key}:${expectedValue}. Actual: ${text}`,
            );
          }
        });
      }

      function simulate(seed, actions) {
        const rand = gen.create(seed);
        let finalExpectedValues = initialValues;
        // The original re-renders Root with new Provider values. Keep the
        // re-render, so updates have to get past ConsumerTree's bailouts, and
        // update the stores that changed in the same batch.
        function updateRoot(changedKeys) {
          ReactNoop.render(
            <Root
              maxDepth={maxDepth}
              rand={rand}
              values={finalExpectedValues}
            />,
          );
          changedKeys.forEach(key => {
            stores.get(key).update(finalExpectedValues[key]);
          });
        }
        // Each simulation starts from the initial values, like the original's
        // first render of Root. Stores keep their value between simulations.
        updateRoot(contextKeys);

        actions.forEach(action => {
          switch (action.type) {
            case FLUSH_ALL:
              Scheduler.unstable_flushAllWithoutAsserting();
              break;
            case FLUSH:
              Scheduler.unstable_flushNumberOfYields(action.unitsOfWork);
              break;
            case UPDATE:
              finalExpectedValues = {
                ...finalExpectedValues,
                [action.key]: action.value,
              };
              updateRoot([action.key]);
              break;
            default:
              throw new Error('Switch statement should be exhaustive');
          }
          assertConsistentTree();
        });

        Scheduler.unstable_flushAllWithoutAsserting();
        assertConsistentTree(finalExpectedValues);
      }

      return {simulate};
    }

    // @gate enableStore
    it('hard-coded tests', () => {
      const {simulate} = ContextSimulator(5);
      simulate('randomSeed', [flush(3), update('A', 4)]);
    });

    // @gate enableStore
    it('generated tests', () => {
      const {simulate} = ContextSimulator(5);

      const LIMIT = 100;
      for (let i = 0; i < LIMIT; i++) {
        const seed = Math.random().toString(36).slice(2, 7);
        const actions = randomActions(5);
        try {
          simulate(seed, actions);
        } catch (error) {
          console.error(`
Context fuzz tester error! Copy and paste the following line into the test suite:
  simulate('${seed}', ${actions.join(', ')});
`);
          throw error;
        }
      }
    });
  });
});
