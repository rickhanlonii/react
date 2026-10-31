// The context cases of ReactSuspense-test.internal.js, with context replaced
// by `use(store)`. See "Context copies" in docs/use-store/COPY_RULES.md.

let React;
let ReactDOMClient;
let ReactDOM;
let Scheduler;
let Suspense;
let act;
let textCache;
let container;

let assertLog;
let use;
let createStore;

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

    const InternalTestUtils = require('internal-test-utils');
    assertLog = InternalTestUtils.assertLog;

    textCache = new Map();
    use = React.use;
    createStore = React.unstable_createStore;
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

  // @gate enableStore
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

    const root = ReactDOMClient.createRoot(container);
    await act(() => {
      root.render(
        <App>
          <Suspense fallback={<Text text="Loading..." />}>
            <MemoizedChild />
          </Suspense>
        </App>,
      );
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
  it('updates memoized child of suspense component when context updates (forwardRef)', async () => {
    const {forwardRef} = React;

    const valueStore = createStore('default');

    const MemoizedChild = forwardRef(() => {
      const text = use(valueStore);
      return <Text text={readText(text)} />;
    });

    function App({children}) {
      // Stands in for the useState that owned the Provider value.
      use(valueStore);

      return children;
    }

    const root = ReactDOMClient.createRoot(container);
    await act(() => {
      root.render(
        <App>
          <Suspense fallback={<Text text="Loading..." />}>
            <MemoizedChild />
          </Suspense>
        </App>,
      );
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
