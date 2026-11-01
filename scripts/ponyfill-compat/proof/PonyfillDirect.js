/**
 * Reproduces representative ponyfill failures from the adapter runs with the
 * ponyfill's own API (createStore(reducer, initial), dispatch, useStore,
 * <StoreProvider>), without adapter.js or setupPonyfill.js. Each test asserts
 * what the ponyfill actually does, so a passing run proves the adapter runs
 * show genuine ponyfill behavior. The comments give what use(store) does.
 *
 * Run: see scripts/ponyfill-compat/README.md
 */
'use strict';

let React;
let ReactNoop;
let Scheduler;
let act;
let assertLog;
let waitFor;
let waitForPaint;
let experimental;
let stable;

describe('ponyfill, used directly', () => {
  beforeEach(() => {
    jest.resetModules();
    React = require('react');
    ReactNoop = require('react-noop-renderer');
    Scheduler = require('scheduler');
    ({act, assertLog, waitFor, waitForPaint} = require('internal-test-utils'));
    experimental = require('../dist/experimental.js')(React);
    stable = require('../dist/stable.js')(React);
  });

  function Text({text}) {
    Scheduler.log(text);
    return text;
  }

  const setState = (state, action) =>
    typeof action === 'function' ? action(state) : action;

  describe('experimental', () => {
    it('a reader that mounts with a sync update during a transition first renders the transition value', async () => {
      const {createStore, useStore, StoreProvider} = experimental;
      const store = createStore(setState, 1);

      function Reader({name}) {
        return <Text text={name + ': ' + useStore(store)} />;
      }

      let setShowConditional;
      function App() {
        const [show, _setShow] = React.useState(false);
        setShowConditional = _setShow;
        return (
          <>
            <Reader name="Stable" />
            {show ? <Reader name="Conditional" /> : null}
          </>
        );
      }

      const root = ReactNoop.createRoot();
      await act(() => {
        root.render(
          <StoreProvider>
            <App />
          </StoreProvider>
        );
      });
      assertLog(['Stable: 1']);

      let resolve;
      await act(async () => {
        React.startTransition(async () => {
          store.dispatch(2);
          await new Promise(r => (resolve = r));
        });
      });
      assertLog([]);

      await act(() => {
        setShowConditional(true);
      });
      // use(store): ['Stable: 1', 'Conditional: 1']. The ponyfill renders the
      // new reader with the pending transition's value (a torn render), then
      // fixes it up in a layout effect.
      assertLog(['Stable: 1', 'Conditional: 2', 'Conditional: 1']);
    });

    it('a store update during a concurrent render produces a torn render, fixed in a layout effect', async () => {
      const {createStore, useStore, StoreProvider} = experimental;
      const store = createStore(setState, 1);

      function Reader({name}) {
        return <Text text={name + ': ' + useStore(store)} />;
      }

      const root = ReactNoop.createRoot();
      await act(async () => {
        React.startTransition(() => {
          root.render(
            <StoreProvider>
              <Reader name="A" />
              <Reader name="B" />
            </StoreProvider>
          );
        });
        await waitFor(['A: 1']);
        store.dispatch(2);
      });
      // use(store): ['B: 1', 'A: 2', 'B: 2'] (the render restarts). The
      // ponyfill finishes the render with A: 1 and B: 2, commits it, and the
      // layout effect re-renders A.
      assertLog(['B: 2', 'A: 2']);
      expect(root).toMatchRenderedOutput('A: 2B: 2');
    });

    it('a reader that suspends on mount never subscribes, so a store update does not retry it', async () => {
      const {createStore, useStore, StoreProvider} = experimental;
      const store = createStore(setState, new Promise(() => {}));

      function Consumer() {
        return <Text text={React.use(useStore(store))} />;
      }
      let setShow;
      function Show() {
        const [show, _setShow] = React.useState(false);
        setShow = _setShow;
        return show ? <Consumer /> : <Text text="Nothing" />;
      }

      const root = ReactNoop.createRoot();
      await act(() => {
        root.render(
          <StoreProvider>
            <React.Suspense fallback={<Text text="Loading" />}>
              <Show />
            </React.Suspense>
          </StoreProvider>
        );
      });
      assertLog(['Nothing']);
      await act(() => setShow(true));
      assertLog(['Loading']);

      await act(() => {
        store.dispatch({status: 'fulfilled', value: 'Result', then() {}});
      });
      // use(store): ['Result'].
      assertLog([]);
      expect(root).toMatchRenderedOutput('Loading');
    });

    it('readers in a hidden Activity do not update in the background', async () => {
      const {createStore, useStore, StoreProvider} = experimental;
      const store = createStore(setState, 'A');

      function Reader({name}) {
        return <Text text={name + ': ' + useStore(store)} />;
      }
      let setMode;
      function App() {
        const [mode, _setMode] = React.useState('visible');
        setMode = _setMode;
        return (
          <>
            <Reader name="Visible" />
            <React.Activity mode={mode}>
              <Reader name="Hidden" />
            </React.Activity>
          </>
        );
      }

      const root = ReactNoop.createRoot();
      await act(() =>
        root.render(
          <StoreProvider>
            <App />
          </StoreProvider>
        )
      );
      assertLog(['Visible: A', 'Hidden: A']);
      await act(() => setMode('hidden'));
      assertLog(['Visible: A', 'Hidden: A']);

      await act(async () => {
        store.dispatch('B');
        await waitForPaint(['Visible: B']);
      });
      // use(store): ['Hidden: B'] at offscreen priority.
      assertLog([]);
    });

    it('a reducer error throws from dispatch, not during render', async () => {
      const {createStore} = experimental;
      const store = createStore((state, action) => {
        if (action === 'throw') {
          throw new Error('Oops');
        }
        return action;
      }, 0);
      // use(store): update() doesn't throw while a root reads the store; the
      // error is thrown during render, where an error boundary can catch it.
      expect(() => store.dispatch('throw')).toThrow('Oops');
    });

    it('a conditional read changes the Hook order', async () => {
      const {createStore, useStore, StoreProvider} = experimental;
      const store = createStore(setState, 1);
      let setShow;
      function App() {
        const [show, _setShow] = React.useState(false);
        setShow = _setShow;
        return <Text text={show ? useStore(store) : 'Hidden'} />;
      }
      const root = ReactNoop.createRoot();
      await act(() =>
        root.render(
          <StoreProvider>
            <App />
          </StoreProvider>
        )
      );
      assertLog(['Hidden']);
      // use(store): renders 1.
      await expect(act(() => setShow(true))).rejects.toThrow(
        'Rendered more hooks than during the previous render.'
      );
      // DEV warning about the Hook order change.
      require('internal-test-utils').assertConsoleErrorDev([
        'React has detected a change in the order of Hooks called by App. ' +
          'This will lead to bugs and errors if not fixed. For more ' +
          'information, read the Rules of Hooks: ' +
          'https://react.dev/link/rules-of-hooks\n\n' +
          '   Previous render            Next render\n' +
          '   ------------------------------------------------------\n' +
          '1. useState                   useState\n' +
          '2. undefined                  useContext\n' +
          '   ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^\n' +
          '\n' +
          '    in App (at **)',
      ]);
    });
  });

  describe('stable', () => {
    it('drops updates dispatched before the first reader mounts', async () => {
      const {createStore, useStore} = stable;
      const store = createStore(1, setState);
      store.update(3);
      function App() {
        return <Text text={useStore(store)} />;
      }
      const root = ReactNoop.createRoot();
      await act(() => root.render(<App />));
      // use(store): [3].
      assertLog([1]);
    });

    it('every update renders twice: an urgent isPending render with the old value, then the transition', async () => {
      const {createStore, useStore} = stable;
      const store = createStore(0, setState);
      function App() {
        return <Text text={useStore(store)} />;
      }
      const root = ReactNoop.createRoot();
      await act(() => root.render(<App />));
      assertLog([0]);
      await act(() => store.update(1));
      // use(store): [1].
      assertLog([0, 1]);
    });
  });
});

// Not about the ponyfill: why the adapter wraps roots inside a top-level
// <StrictMode>. In DEV, a <StrictMode> that mounts below a newly mounted
// non-strict component doesn't double invoke effects on mount.
describe('React, without the ponyfill', () => {
  it('does not double invoke effects of a StrictMode tree under a newly placed wrapper', async () => {
    const React = require('react');
    const ReactNoop = require('react-noop-renderer');
    const {act} = require('internal-test-utils');
    const log = [];
    function App() {
      React.useEffect(() => {
        log.push('mount');
        return () => log.push('unmount');
      });
      return null;
    }
    function Wrapper({children}) {
      return children;
    }

    const strictRoot = ReactNoop.createRoot();
    await act(() =>
      strictRoot.render(
        <React.StrictMode>
          <App />
        </React.StrictMode>
      )
    );
    expect(log).toEqual(['mount', 'unmount', 'mount']);

    log.length = 0;
    const wrappedRoot = ReactNoop.createRoot();
    await act(() =>
      wrappedRoot.render(
        <Wrapper>
          <React.StrictMode>
            <App />
          </React.StrictMode>
        </Wrapper>
      )
    );
    expect(log).toEqual(['mount']);
  });
});
