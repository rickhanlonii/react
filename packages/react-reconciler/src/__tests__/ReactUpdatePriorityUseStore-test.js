let React;
let ReactNoop;
let Scheduler;
let ContinuousEventPriority;
let startTransition;
let use;
let useEffect;
let act;
let waitFor;
let waitForPaint;
let assertLog;
let createStore;

describe('ReactUpdatePriority', () => {
  beforeEach(() => {
    jest.resetModules();

    React = require('react');
    ReactNoop = require('react-noop-renderer');
    Scheduler = require('scheduler');
    act = require('internal-test-utils').act;
    ContinuousEventPriority =
      require('react-reconciler/constants').ContinuousEventPriority;
    startTransition = React.startTransition;
    use = React.use;
    useEffect = React.useEffect;
    createStore = React.unstable_createStore;

    const InternalTestUtils = require('internal-test-utils');
    waitFor = InternalTestUtils.waitFor;
    waitForPaint = InternalTestUtils.waitForPaint;
    assertLog = InternalTestUtils.assertLog;
  });

  function Text({text}) {
    Scheduler.log(text);
    return text;
  }

  // @gate enableStore
  it('setState inside passive effect triggered by sync update should have default priority', async () => {
    const root = ReactNoop.createRoot();

    const store = createStore(1);
    function App() {
      const state = use(store);
      useEffect(() => {
        store.update(2);
      }, []);
      return <Text text={state} />;
    }

    await act(() => {
      ReactNoop.flushSync(() => {
        root.render(<App />);
      });
      // Should not have flushed the effect update yet
      assertLog([1]);
    });
    assertLog([2]);
  });

  // @gate enableStore
  it('setState inside passive effect triggered by idle update should have idle priority', async () => {
    const root = ReactNoop.createRoot();

    const idleStore = createStore(1);
    const defaultStore = createStore(1);
    function App() {
      const idleState = use(idleStore);
      const defaultState = use(defaultStore);
      useEffect(() => {
        Scheduler.log('Idle update');
        idleStore.update(2);
      }, []);
      return <Text text={`Idle: ${idleState}, Default: ${defaultState}`} />;
    }

    await act(async () => {
      ReactNoop.idleUpdates(() => {
        root.render(<App />);
      });
      // Should not have flushed the effect update yet
      await waitForPaint(['Idle: 1, Default: 1']);

      // Schedule another update at default priority
      defaultStore.update(2);

      if (gate(flags => flags.enableYieldingBeforePassive)) {
        // The default update flushes first, because
        await waitForPaint([
          // Idle update is scheduled
          'Idle update',
        ]);
        await waitForPaint([
          // The default update flushes first, without including the idle update
          'Idle: 1, Default: 2',
        ]);
      } else {
        // The default update flushes first, because
        await waitForPaint([
          // Idle update is scheduled
          'Idle update',

          // The default update flushes first, without including the idle update
          'Idle: 1, Default: 2',
        ]);
      }
    });
    // Now the idle update has flushed
    assertLog(['Idle: 2, Default: 2']);
  });

  // @gate enableStore
  it('continuous updates should interrupt transitions', async () => {
    const root = ReactNoop.createRoot();

    const counterStore = createStore(1);
    const isHiddenStore = createStore(false);
    function App() {
      const counter = use(counterStore);
      const isHidden = use(isHiddenStore);
      if (isHidden) {
        return <Text text={'(hidden)'} />;
      }
      return (
        <>
          <Text text={'A' + counter} />
          <Text text={'B' + counter} />
          <Text text={'C' + counter} />
        </>
      );
    }

    await act(() => {
      root.render(<App />);
    });
    assertLog(['A1', 'B1', 'C1']);
    expect(root).toMatchRenderedOutput('A1B1C1');

    await act(async () => {
      startTransition(() => {
        counterStore.update(2);
      });
      await waitFor(['A2']);
      ReactNoop.unstable_runWithPriority(ContinuousEventPriority, () => {
        isHiddenStore.update(true);
      });
    });
    assertLog([
      // Because the hide update has continuous priority, it should interrupt the
      // in-progress transition
      '(hidden)',
      // When the transition resumes, it's a no-op because the children are
      // now hidden.
      '(hidden)',
    ]);
    expect(root).toMatchRenderedOutput('(hidden)');
  });
});
