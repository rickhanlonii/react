let React;
let use;
let createStore;
let ReactDOM;
let ReactDOMClient;
let Scheduler;
let Suspense;
let act;
let textCache;
let container;

let assertLog;
describe('ReactSuspense', () => {
  beforeEach(() => {
    jest.resetModules();
    React = require('react');
    ReactDOM = require('react-dom');
    ReactDOMClient = require('react-dom/client');
    act = require('internal-test-utils').act;
    Scheduler = require('scheduler');
    container = document.createElement('div');

    Suspense = React.Suspense;
    use = React.use;
    createStore = React.unstable_createStore;

    const InternalTestUtils = require('internal-test-utils');
    assertLog = InternalTestUtils.assertLog;
    textCache = new Map();
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

  // The memoized child reads the store, in place of the context the original
  // reads.
  // @gate enableStore
  it('updates memoized child of suspense component when context updates (simple memo)', async () => {
    const {memo} = React;

    const valueStore = createStore('default');

    const MemoizedChild = memo(function MemoizedChild() {
      const text = use(valueStore);
      return <Text text={readText(text)} />;
    });

    function App() {
      // Stands in for the useState that owned the Provider value.
      use(valueStore);

      return (
        <Suspense fallback={<Text text="Loading..." />}>
          <MemoizedChild />
        </Suspense>
      );
    }

    const root = ReactDOMClient.createRoot(container);
    await act(() => {
      root.render(<App />);
    });
    assertLog([
      'Suspend! [default]',
      'Loading...',
      // pre-warming
      'Suspend! [default]',
    ]);

    await act(() => resolveText('default'));
    assertLog(['default']);
    expect(container.textContent).toEqual('default');

    await act(() => valueStore.update('new value'));
    assertLog([
      'Suspend! [new value]',
      'Loading...',
      // pre-warming
      'Suspend! [new value]',
    ]);

    await act(() => resolveText('new value'));
    assertLog(['new value']);
    expect(container.textContent).toEqual('new value');
  });

  // @gate enableStore
  it('updates memoized child of suspense component when context updates (manual memo)', async () => {
    const {memo} = React;

    const valueStore = createStore('default');

    const MemoizedChild = memo(
      function MemoizedChild() {
        const text = use(valueStore);
        return <Text text={readText(text)} />;
      },
      function areEqual(prevProps, nextProps) {
        return true;
      },
    );
    function App() {
      // Stands in for the useState that owned the Provider value.
      use(valueStore);

      return (
        <Suspense fallback={<Text text="Loading..." />}>
          <MemoizedChild />
        </Suspense>
      );
    }

    const root = ReactDOMClient.createRoot(container);
    await act(() => {
      root.render(<App />);
    });
    assertLog([
      'Suspend! [default]',
      'Loading...',
      // pre-warming
      'Suspend! [default]',
    ]);

    await act(() => resolveText('default'));
    assertLog(['default']);
    expect(container.textContent).toEqual('default');

    await act(() => valueStore.update('new value'));
    assertLog([
      'Suspend! [new value]',
      'Loading...',
      // pre-warming
      'Suspend! [new value]',
    ]);

    await act(() => resolveText('new value'));
    assertLog(['new value']);
    expect(container.textContent).toEqual('new value');
  });

  describe('outside concurrent mode (legacy)', () => {
    // @gate enableStore && !disableLegacyMode
    it('a mounted class component can suspend without losing state', async () => {
      class TextWithLifecycle extends React.Component {
        componentDidMount() {
          Scheduler.log(`Mount [${this.props.text}]`);
        }
        componentDidUpdate() {
          Scheduler.log(`Update [${this.props.text}]`);
        }
        componentWillUnmount() {
          Scheduler.log(`Unmount [${this.props.text}]`);
        }
        render() {
          return <Text {...this.props} />;
        }
      }

      const stepStore = createStore(1);
      function AsyncTextWithLifecycle(props) {
        const step = use(stepStore);
        const label = `${props.text}:${step}`;
        const didMount = React.useRef(false);
        const latestLabel = React.useRef(label);
        React.useLayoutEffect(() => {
          latestLabel.current = label;
          if (!didMount.current) {
            didMount.current = true;
            Scheduler.log(`Mount [${label}]`);
          } else {
            Scheduler.log(`Update [${label}]`);
          }
        });
        React.useLayoutEffect(() => {
          return () => {
            Scheduler.log(`Unmount [${latestLabel.current}]`);
          };
        }, []);
        const text = readText(label);
        return <Text text={text} />;
      }

      function App() {
        return (
          <Suspense fallback={<TextWithLifecycle text="Loading..." />}>
            <TextWithLifecycle text="A" />
            <AsyncTextWithLifecycle text="B" />
            <TextWithLifecycle text="C" />
          </Suspense>
        );
      }

      ReactDOM.render(<App />, container);
      assertLog([
        'A',
        'Suspend! [B:1]',
        'C',
        'Loading...',

        'Mount [A]',
        // B's lifecycle should not fire because it suspended
        // 'Mount [B]',
        'Mount [C]',
        'Mount [Loading...]',
      ]);
      expect(container.textContent).toEqual('Loading...');

      await resolveText('B:1');
      assertLog([
        'B:1',
        'Unmount [Loading...]',
        // Should be a mount, not an update
        'Mount [B:1]',
      ]);
      expect(container.textContent).toEqual('AB:1C');

      // In legacy mode, an update to a function component outside of act or a
      // batch warns, unlike an update to a class, so batch it. Legacy batches
      // flush synchronously when they exit.
      ReactDOM.unstable_batchedUpdates(() => {
        stepStore.update(2);
      });
      assertLog(['Suspend! [B:2]', 'Loading...', 'Mount [Loading...]']);
      expect(container.textContent).toEqual('Loading...');

      await resolveText('B:2');
      assertLog(['B:2', 'Unmount [Loading...]', 'Update [B:2]']);
      expect(container.textContent).toEqual('AB:2C');
    });

    // @gate enableStore && !disableLegacyMode
    it('bails out on timed-out primary children even if they receive an update', async () => {
      const stepStore = createStore(1);
      function Stateful() {
        const step = use(stepStore);
        return <Text text={`Stateful: ${step}`} />;
      }

      function App(props) {
        return (
          <Suspense fallback={<Text text="Loading..." />}>
            <Stateful />
            <AsyncText text={props.text} />
          </Suspense>
        );
      }

      ReactDOM.render(<App text="A" />, container);

      assertLog(['Stateful: 1', 'Suspend! [A]', 'Loading...']);

      await resolveText('A');
      assertLog(['A']);
      expect(container.textContent).toEqual('Stateful: 1A');

      ReactDOM.render(<App text="B" />, container);
      assertLog(['Stateful: 1', 'Suspend! [B]', 'Loading...']);
      expect(container.textContent).toEqual('Loading...');

      // In legacy mode, an update to a function component outside of act or a
      // batch warns, unlike an update to a class, so batch it. Legacy batches
      // flush synchronously when they exit.
      ReactDOM.unstable_batchedUpdates(() => {
        stepStore.update(2);
      });
      assertLog(['Stateful: 2', 'Suspend! [B]']);
      expect(container.textContent).toEqual('Loading...');

      await resolveText('B');
      assertLog(['B']);
      expect(container.textContent).toEqual('Stateful: 2B');
    });

    // @gate enableStore && !disableLegacyMode
    it('when updating a timed-out tree, always retries the suspended component', async () => {
      const stepStore = createStore(1);
      function Stateful() {
        const step = use(stepStore);
        return <Text text={`Stateful: ${step}`} />;
      }

      const Indirection = React.Fragment;

      function App(props) {
        return (
          <Suspense fallback={<Text text="Loading..." />}>
            <Stateful />
            <Indirection>
              <Indirection>
                <Indirection>
                  <AsyncText text={props.text} />
                </Indirection>
              </Indirection>
            </Indirection>
          </Suspense>
        );
      }

      ReactDOM.render(<App text="A" />, container);

      assertLog(['Stateful: 1', 'Suspend! [A]', 'Loading...']);

      await resolveText('A');
      assertLog(['A']);
      expect(container.textContent).toEqual('Stateful: 1A');

      ReactDOM.render(<App text="B" />, container);
      assertLog(['Stateful: 1', 'Suspend! [B]', 'Loading...']);
      expect(container.textContent).toEqual('Loading...');

      // In legacy mode, an update to a function component outside of act or a
      // batch warns, unlike an update to a class, so batch it. Legacy batches
      // flush synchronously when they exit.
      ReactDOM.unstable_batchedUpdates(() => {
        stepStore.update(2);
      });
      assertLog([
        'Stateful: 2',

        // The suspended component should suspend again. If it doesn't, the
        // likely mistake is that the suspended fiber wasn't marked with
        // pending work, so it was improperly treated as complete.
        'Suspend! [B]',
      ]);
      expect(container.textContent).toEqual('Loading...');

      await resolveText('B');
      assertLog(['B']);
      expect(container.textContent).toEqual('Stateful: 2B');
    });

    // @gate enableStore && !disableLegacyMode
    it('retries when an update is scheduled on a timed out tree', async () => {
      const stepStore = createStore(1);
      function Stateful() {
        const step = use(stepStore);
        return <AsyncText text={`Step: ${step}`} />;
      }

      function App(props) {
        return (
          <Suspense fallback={<Text text="Loading..." />}>
            <Stateful />
          </Suspense>
        );
      }

      ReactDOM.render(<App />, container);

      // Initial render
      assertLog(['Suspend! [Step: 1]', 'Loading...']);

      await act(() => resolveText('Step: 1'));
      assertLog(['Step: 1']);
      expect(container.textContent).toEqual('Step: 1');

      // Update that suspends
      await act(() => {
        stepStore.update(2);
      });
      assertLog(['Suspend! [Step: 2]', 'Loading...']);
      expect(container.textContent).toEqual('Loading...');

      // Update while still suspended
      stepStore.update(3);
      assertLog(['Suspend! [Step: 3]']);
      expect(container.textContent).toEqual('Loading...');

      await act(() => {
        resolveText('Step: 2');
        resolveText('Step: 3');
      });
      assertLog(['Step: 3']);
      expect(container.textContent).toEqual('Step: 3');
    });

    // @gate enableStore && !disableLegacyMode
    it('reuses effects, including deletions, from the suspended tree', async () => {
      const tabStore = createStore(0);
      const setTab = tabStore.update;
      function App() {
        const tab = use(tabStore);

        return (
          <Suspense fallback={<Text text="Loading..." />}>
            <AsyncText key={tab} text={'Tab: ' + tab} />
            <Text key={tab + 'sibling'} text=" + sibling" />
          </Suspense>
        );
      }

      ReactDOM.render(<App />, container);
      assertLog(['Suspend! [Tab: 0]', ' + sibling', 'Loading...']);
      expect(container.textContent).toEqual('Loading...');

      await resolveText('Tab: 0');
      assertLog(['Tab: 0']);
      expect(container.textContent).toEqual('Tab: 0 + sibling');

      await act(() => setTab(1));
      assertLog(['Suspend! [Tab: 1]', ' + sibling', 'Loading...']);
      expect(container.textContent).toEqual('Loading...');

      await resolveText('Tab: 1');
      assertLog(['Tab: 1']);
      expect(container.textContent).toEqual('Tab: 1 + sibling');

      await act(() => setTab(2));
      assertLog(['Suspend! [Tab: 2]', ' + sibling', 'Loading...']);
      expect(container.textContent).toEqual('Loading...');

      await resolveText('Tab: 2');
      assertLog(['Tab: 2']);
      expect(container.textContent).toEqual('Tab: 2 + sibling');
    });

    // @gate enableStore && !disableLegacyMode
    it('does not warn if a mounted component is pinged', async () => {
      ReactDOM.render(null, container);

      const stepStore = createStore(0);
      const setStep = stepStore.update;
      function UpdatingText({text, ms}) {
        const step = use(stepStore);
        const fullText = `${text}:${step}`;
        return <Text text={readText(fullText)} />;
      }

      ReactDOM.render(
        <Suspense fallback={<Text text="Loading..." />}>
          <UpdatingText text="A" ms={1000} />
        </Suspense>,
        container,
      );

      assertLog(['Suspend! [A:0]', 'Loading...']);

      await resolveText('A:0');
      assertLog(['A:0']);
      expect(container.textContent).toEqual('A:0');

      await act(() => setStep(1));
      assertLog(['Suspend! [A:1]', 'Loading...']);
      expect(container.textContent).toEqual('Loading...');
    });

    // @gate enableStore && !disableLegacyMode
    it('#14162', async () => {
      const {lazy} = React;

      function Hello() {
        return <span>hello</span>;
      }

      async function fetchComponent() {
        return new Promise(r => {
          // simulating a delayed import() call
          setTimeout(r, 1000, {default: Hello});
        });
      }

      const LazyHello = lazy(fetchComponent);

      const renderStore = createStore(false);
      function App() {
        const render = use(renderStore);
        React.useLayoutEffect(() => {
          setTimeout(() => renderStore.update(true));
        }, []);
        return (
          <Suspense fallback={<span>loading...</span>}>
            {render && <LazyHello />}
          </Suspense>
        );
      }

      ReactDOM.render(null, container);

      ReactDOM.render(<App name="world" />, container);
    });

    // @gate enableStore && !disableLegacyMode
    it('updates memoized child of suspense component when context updates (simple memo)', async () => {
      const {useContext, createContext, memo} = React;

      const ValueContext = createContext(null);

      const MemoizedChild = memo(function MemoizedChild() {
        const text = useContext(ValueContext);
        return <Text text={readText(text)} />;
      });

      const valueStore = createStore('default');

      const setValue = valueStore.update;

      function App() {
        const value = use(valueStore);

        return (
          <ValueContext.Provider value={value}>
            <Suspense fallback={<Text text="Loading..." />}>
              <MemoizedChild />
            </Suspense>
          </ValueContext.Provider>
        );
      }

      ReactDOM.render(<App />, container);
      assertLog(['Suspend! [default]', 'Loading...']);

      await resolveText('default');
      assertLog(['default']);
      expect(container.textContent).toEqual('default');

      await act(() => setValue('new value'));
      assertLog(['Suspend! [new value]', 'Loading...']);

      await resolveText('new value');
      assertLog(['new value']);
      expect(container.textContent).toEqual('new value');
    });

    // @gate enableStore && !disableLegacyMode
    it('updates memoized child of suspense component when context updates (manual memo)', async () => {
      const {useContext, createContext, memo} = React;

      const ValueContext = createContext(null);

      const MemoizedChild = memo(
        function MemoizedChild() {
          const text = useContext(ValueContext);
          return <Text text={readText(text)} />;
        },
        function areEqual(prevProps, nextProps) {
          return true;
        },
      );

      const valueStore = createStore('default');

      const setValue = valueStore.update;

      function App() {
        const value = use(valueStore);

        return (
          <ValueContext.Provider value={value}>
            <Suspense fallback={<Text text="Loading..." />}>
              <MemoizedChild />
            </Suspense>
          </ValueContext.Provider>
        );
      }

      ReactDOM.render(<App />, container);
      assertLog(['Suspend! [default]', 'Loading...']);

      await resolveText('default');
      assertLog(['default']);
      expect(container.textContent).toEqual('default');

      await act(() => setValue('new value'));
      assertLog(['Suspend! [new value]', 'Loading...']);

      await resolveText('new value');
      assertLog(['new value']);
      expect(container.textContent).toEqual('new value');
    });

    // @gate enableStore && !disableLegacyMode
    it('updates memoized child of suspense component when context updates (function)', async () => {
      const {useContext, createContext} = React;

      const ValueContext = createContext(null);

      function MemoizedChild() {
        const text = useContext(ValueContext);
        return <Text text={readText(text)} />;
      }

      const valueStore = createStore('default');

      const setValue = valueStore.update;

      function App({children}) {
        const value = use(valueStore);

        return (
          <ValueContext.Provider value={value}>
            {children}
          </ValueContext.Provider>
        );
      }

      ReactDOM.render(
        <App>
          <Suspense fallback={<Text text="Loading..." />}>
            <MemoizedChild />
          </Suspense>
        </App>,
        container,
      );
      assertLog(['Suspend! [default]', 'Loading...']);

      await resolveText('default');
      assertLog(['default']);
      expect(container.textContent).toEqual('default');

      await act(() => setValue('new value'));
      assertLog(['Suspend! [new value]', 'Loading...']);

      await resolveText('new value');
      assertLog(['new value']);
      expect(container.textContent).toEqual('new value');
    });

    // @gate enableStore && !disableLegacyMode
    it('updates memoized child of suspense component when context updates (forwardRef)', async () => {
      const {forwardRef, useContext, createContext} = React;

      const ValueContext = createContext(null);

      const MemoizedChild = forwardRef(function MemoizedChild() {
        const text = useContext(ValueContext);
        return <Text text={readText(text)} />;
      });

      const valueStore = createStore('default');

      const setValue = valueStore.update;

      function App() {
        const value = use(valueStore);

        return (
          <ValueContext.Provider value={value}>
            <Suspense fallback={<Text text="Loading..." />}>
              <MemoizedChild />
            </Suspense>
          </ValueContext.Provider>
        );
      }

      ReactDOM.render(<App />, container);
      assertLog(['Suspend! [default]', 'Loading...']);

      await resolveText('default');
      assertLog(['default']);
      expect(container.textContent).toEqual('default');

      await act(() => setValue('new value'));
      assertLog(['Suspend! [new value]', 'Loading...']);

      await resolveText('new value');
      assertLog(['new value']);
      expect(container.textContent).toEqual('new value');
    });

    // @gate enableStore && !disableLegacyMode
    it('updates context consumer within child of suspended suspense component when context updates', async () => {
      const {createContext} = React;

      const ValueContext = createContext(null);

      const promiseThatNeverResolves = new Promise(() => {});
      function Child() {
        return (
          <ValueContext.Consumer>
            {value => {
              Scheduler.log(`Received context value [${value}]`);
              if (value === 'default') return <Text text="default" />;
              throw promiseThatNeverResolves;
            }}
          </ValueContext.Consumer>
        );
      }

      const valueStore = createStore('default');

      const setValue = valueStore.update;

      function Wrapper({children}) {
        const value = use(valueStore);
        return (
          <ValueContext.Provider value={value}>
            {children}
          </ValueContext.Provider>
        );
      }

      function App() {
        return (
          <Wrapper>
            <Suspense fallback={<Text text="Loading..." />}>
              <Child />
            </Suspense>
          </Wrapper>
        );
      }

      ReactDOM.render(<App />, container);
      assertLog(['Received context value [default]', 'default']);
      expect(container.textContent).toEqual('default');

      await act(() => setValue('new value'));
      assertLog(['Received context value [new value]', 'Loading...']);
      expect(container.textContent).toEqual('Loading...');

      await act(() => setValue('default'));
      assertLog(['Received context value [default]', 'default']);
      expect(container.textContent).toEqual('default');
    });

    // The memoized child reads the store, in place of the context the original
    // reads.
    describe('reading the store in place of context', () => {
      // @gate enableStore && !disableLegacyMode
      it('updates memoized child of suspense component when context updates (simple memo)', async () => {
        const {memo} = React;

        const valueStore = createStore('default');

        const MemoizedChild = memo(function MemoizedChild() {
          const text = use(valueStore);
          return <Text text={readText(text)} />;
        });

        function App() {
          // Stands in for the useState that owned the Provider value.
          use(valueStore);

          return (
            <Suspense fallback={<Text text="Loading..." />}>
              <MemoizedChild />
            </Suspense>
          );
        }

        ReactDOM.render(<App />, container);
        assertLog(['Suspend! [default]', 'Loading...']);

        await resolveText('default');
        assertLog(['default']);
        expect(container.textContent).toEqual('default');

        await act(() => valueStore.update('new value'));
        assertLog(['Suspend! [new value]', 'Loading...']);

        await resolveText('new value');
        assertLog(['new value']);
        expect(container.textContent).toEqual('new value');
      });

      // @gate enableStore && !disableLegacyMode
      it('updates memoized child of suspense component when context updates (manual memo)', async () => {
        const {memo} = React;

        const valueStore = createStore('default');

        const MemoizedChild = memo(
          function MemoizedChild() {
            const text = use(valueStore);
            return <Text text={readText(text)} />;
          },
          function areEqual(prevProps, nextProps) {
            return true;
          },
        );
        function App() {
          // Stands in for the useState that owned the Provider value.
          use(valueStore);

          return (
            <Suspense fallback={<Text text="Loading..." />}>
              <MemoizedChild />
            </Suspense>
          );
        }

        ReactDOM.render(<App />, container);
        assertLog(['Suspend! [default]', 'Loading...']);

        await resolveText('default');
        assertLog(['default']);
        expect(container.textContent).toEqual('default');

        await act(() => valueStore.update('new value'));
        assertLog(['Suspend! [new value]', 'Loading...']);

        await resolveText('new value');
        assertLog(['new value']);
        expect(container.textContent).toEqual('new value');
      });

      // @gate enableStore && !disableLegacyMode
      it('updates memoized child of suspense component when context updates (function)', async () => {
        const valueStore = createStore('default');

        function MemoizedChild() {
          const text = use(valueStore);
          return <Text text={readText(text)} />;
        }

        function App({children}) {
          // Stands in for the useState that owned the Provider value.
          use(valueStore);

          return children;
        }

        ReactDOM.render(
          <App>
            <Suspense fallback={<Text text="Loading..." />}>
              <MemoizedChild />
            </Suspense>
          </App>,
          container,
        );
        assertLog(['Suspend! [default]', 'Loading...']);

        await resolveText('default');
        assertLog(['default']);
        expect(container.textContent).toEqual('default');

        await act(() => valueStore.update('new value'));
        assertLog(['Suspend! [new value]', 'Loading...']);

        await resolveText('new value');
        assertLog(['new value']);
        expect(container.textContent).toEqual('new value');
      });

      // @gate enableStore && !disableLegacyMode
      it('updates memoized child of suspense component when context updates (forwardRef)', async () => {
        const {forwardRef} = React;

        const valueStore = createStore('default');

        const MemoizedChild = forwardRef(function MemoizedChild() {
          const text = use(valueStore);
          return <Text text={readText(text)} />;
        });

        function App() {
          // Stands in for the useState that owned the Provider value.
          use(valueStore);

          return (
            <Suspense fallback={<Text text="Loading..." />}>
              <MemoizedChild />
            </Suspense>
          );
        }

        ReactDOM.render(<App />, container);
        assertLog(['Suspend! [default]', 'Loading...']);

        await resolveText('default');
        assertLog(['default']);
        expect(container.textContent).toEqual('default');

        await act(() => valueStore.update('new value'));
        assertLog(['Suspend! [new value]', 'Loading...']);

        await resolveText('new value');
        assertLog(['new value']);
        expect(container.textContent).toEqual('new value');
      });

      // @gate enableStore && !disableLegacyMode
      it('updates context consumer within child of suspended suspense component when context updates', async () => {
        const valueStore = createStore('default');

        // <ValueContext.Consumer> becomes a function component that reads the
        // store and calls its render prop.
        function ValueConsumer({children}) {
          return children(use(valueStore));
        }

        const promiseThatNeverResolves = new Promise(() => {});
        function Child() {
          return (
            <ValueConsumer>
              {value => {
                Scheduler.log(`Received context value [${value}]`);
                if (value === 'default') return <Text text="default" />;
                throw promiseThatNeverResolves;
              }}
            </ValueConsumer>
          );
        }

        function Wrapper({children}) {
          // Stands in for the useState that owned the Provider value.
          use(valueStore);
          return children;
        }

        function App() {
          return (
            <Wrapper>
              <Suspense fallback={<Text text="Loading..." />}>
                <Child />
              </Suspense>
            </Wrapper>
          );
        }

        ReactDOM.render(<App />, container);
        assertLog(['Received context value [default]', 'default']);
        expect(container.textContent).toEqual('default');

        await act(() => valueStore.update('new value'));
        assertLog(['Received context value [new value]', 'Loading...']);
        expect(container.textContent).toEqual('Loading...');

        await act(() => valueStore.update('default'));
        assertLog(['Received context value [default]', 'default']);
        expect(container.textContent).toEqual('default');
      });
    });
  });
});
