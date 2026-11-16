/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 */
'use strict';

// Review slice 2: transitions, priorities and async actions. Most tests run
// the same scenario twice: once with useState at the root and the value passed
// through context (the oracle), and once with a store. Both runs assert the
// same logs and output.

let React;
let ReactNoop;
let Scheduler;
let ContinuousEventPriority;
let DefaultEventPriority;
let act;
let use;
let useState;
let useReducer;
let useEffect;
let useLayoutEffect;
let useInsertionEffect;
let useTransition;
let useOptimistic;
let useActionState;
let useDeferredValue;
let startTransition;
let Suspense;
let Activity;
let assertLog;
let waitForPaint;
let waitForMicrotasks;
let assertConsoleErrorDev;
let createStore;
let textCache;

const originalReportError = global.reportError;

beforeEach(() => {
  jest.resetModules();
  global.reportError = error => {
    Scheduler.log('reportError: ' + error.message.split('.')[0]);
  };

  React = require('react');
  ReactNoop = require('react-noop-renderer');
  Scheduler = require('scheduler');
  const constants = require('react-reconciler/constants');
  ContinuousEventPriority = constants.ContinuousEventPriority;
  DefaultEventPriority = constants.DefaultEventPriority;
  use = React.use;
  useState = React.useState;
  useReducer = React.useReducer;
  useEffect = React.useEffect;
  useLayoutEffect = React.useLayoutEffect;
  useInsertionEffect = React.useInsertionEffect;
  useTransition = React.useTransition;
  useOptimistic = React.useOptimistic;
  useActionState = React.useActionState;
  useDeferredValue = React.useDeferredValue;
  startTransition = React.startTransition;
  Suspense = React.Suspense;
  Activity = React.Activity;
  createStore = React.unstable_createStore;

  const InternalTestUtils = require('internal-test-utils');
  act = InternalTestUtils.act;
  assertLog = InternalTestUtils.assertLog;
  waitForPaint = InternalTestUtils.waitForPaint;
  waitForMicrotasks = InternalTestUtils.waitForMicrotasks;
  assertConsoleErrorDev = InternalTestUtils.assertConsoleErrorDev;

  textCache = new Map();
});

afterEach(() => {
  global.reportError = originalReportError;
  assertLog([]);
});

function resolveText(text) {
  const record = textCache.get(text);
  if (record === undefined) {
    textCache.set(text, {status: 'resolved', value: text});
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
    if (record.status === 'pending') {
      Scheduler.log(`Suspend! [${text}]`);
      throw record.value;
    }
    return record.value;
  }
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
  const newRecord = {status: 'pending', value: thenable};
  textCache.set(text, newRecord);
  throw thenable;
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

// The oracle: useReducer at the root, with the value passed through context.
// A store with the same reducer should commit the same output.
function createStateSource(initialValue, reducer) {
  const Context = React.createContext(null);
  let dispatch;
  function Root({children}) {
    const [value, _dispatch] = useReducer(
      reducer === undefined
        ? (s, a) => (typeof a === 'function' ? a(s) : a)
        : reducer,
      initialValue,
    );
    dispatch = _dispatch;
    return <Context value={value}>{children}</Context>;
  }
  return {
    kind: 'state',
    Root,
    read: () => use(Context),
    update: action => dispatch(action),
  };
}

function createStoreSource(initialValue, reducer) {
  const store = createStore(initialValue, reducer);
  return {
    kind: 'store',
    store,
    Root: ({children}) => children,
    read: () => use(store),
    update: action => store.update(action),
  };
}

async function runWithStateAndStore(scenario) {
  const sourceFactories = [createStateSource, createStoreSource];
  for (let k = 0; k < sourceFactories.length; k++) {
    const createSource = sourceFactories[k];
    const kind = createSource === createStateSource ? 'state' : 'store';
    textCache = new Map();
    try {
      await scenario(createSource);
    } catch (error) {
      error.message = '[' + kind + '] ' + error.message;
      throw error;
    }
  }
}

// Runs the scenario with the oracle and with a store. The scenario calls
// check(root, label) at points where it wants the logs since the last check
// and the output compared. The store's checkpoints must equal the oracle's.
function getOutput(root) {
  const children = root.getChildren();
  if (children === null || children.length === 0) {
    return '';
  }
  return children
    .map(child =>
      child.hidden ? '(hidden)' : child.text != null ? child.text : child.type,
    )
    .join('|');
}

// Like waitFor, waitForPaint and waitForAll, but they don't assert. The logs
// are kept for the next check() in compareStateAndStore.
let pendingLog = [];
function collectLog() {
  pendingLog.push(...Scheduler.unstable_clearLog());
}
async function flushYields(count) {
  collectLog();
  let flushed = 0;
  while (true) {
    await waitForMicrotasks();
    if (!Scheduler.unstable_hasPendingWork()) {
      break;
    }
    Scheduler.unstable_flushNumberOfYields(count - flushed);
    const log = Scheduler.unstable_clearLog();
    pendingLog.push(...log);
    flushed += log.length;
    if (flushed >= count) {
      await waitForMicrotasks();
      collectLog();
      break;
    }
  }
}
async function flushPaint() {
  collectLog();
  await waitForMicrotasks();
  if (Scheduler.unstable_hasPendingWork()) {
    Scheduler.unstable_flushUntilNextPaint();
    await waitForMicrotasks();
  }
  collectLog();
}
async function flushAll() {
  collectLog();
  while (true) {
    await waitForMicrotasks();
    if (!Scheduler.unstable_hasPendingWork()) {
      break;
    }
    Scheduler.unstable_flushAllWithoutAsserting();
  }
  collectLog();
}

async function compareStateAndStore(scenario) {
  const results = {};
  const sourceFactories = [createStateSource, createStoreSource];
  for (let k = 0; k < sourceFactories.length; k++) {
    const createSource = sourceFactories[k];
    const kind = createSource === createStateSource ? 'state' : 'store';
    textCache = new Map();
    const checkpoints = [];
    pendingLog = [];
    const check = (root, label) => {
      collectLog();
      const log = pendingLog;
      pendingLog = [];
      checkpoints.push({
        label,
        log,
        output: getOutput(root),
      });
    };
    await scenario(createSource, check);
    collectLog();
    checkpoints.push({label: 'end', log: pendingLog});
    pendingLog = [];
    results[kind] = checkpoints;
  }
  expect(results.store).toEqual(results.state);
}

describe('async actions', () => {
  // @gate enableStore
  it('does not commit an action update read only by a hidden reader before the action is done', async () => {
    await runWithStateAndStore(async createSource => {
      const source = createSource(0);
      function Reader({name}) {
        return <Text text={name + ': ' + source.read()} />;
      }
      let setShow;
      function App() {
        const [show, _setShow] = useState(false);
        setShow = _setShow;
        return (
          <>
            <Activity mode="hidden">
              <Reader name="Hidden" />
            </Activity>
            {show ? <Reader name="Visible" /> : null}
          </>
        );
      }

      const root = ReactNoop.createRoot();
      await act(() =>
        root.render(
          <source.Root>
            <App />
          </source.Root>,
        ),
      );
      assertLog(['Hidden: 0']);

      let resolve;
      await act(() => {
        startTransition(async () => {
          source.update(1);
          await new Promise(r => (resolve = r));
        });
      });
      // The action is pending, so its update isn't rendered, even in the
      // hidden tree.
      assertLog([]);

      // A reader that mounts urgently shows the committed value.
      await act(() => ReactNoop.flushSync(() => setShow(true)));
      assertLog(['Visible: 0']);
      expect(root).toMatchRenderedOutput('Visible: 0');

      await act(() => resolve());
      assertLog(['Visible: 1', 'Hidden: 1']);
      expect(root).toMatchRenderedOutput('Visible: 1');
    });
  });

  // @gate enableStore
  it('a reader that mounts urgently while an action is pending shows the committed value when the other reader is hidden', async () => {
    await runWithStateAndStore(async createSource => {
      const source = createSource(0);
      function HiddenReader() {
        source.read();
        return null;
      }
      function Reader() {
        return <Text text={'Visible: ' + source.read()} />;
      }
      let setShow;
      function App() {
        const [show, _setShow] = useState(false);
        setShow = _setShow;
        return (
          <>
            <Activity mode="hidden">
              <HiddenReader />
            </Activity>
            {show ? <Reader /> : <Text text="Nothing" />}
          </>
        );
      }

      const root = ReactNoop.createRoot();
      await act(() =>
        root.render(
          <source.Root>
            <App />
          </source.Root>,
        ),
      );
      assertLog(['Nothing']);

      let resolve;
      await act(() => {
        startTransition(async () => {
          source.update(1);
          await new Promise(r => (resolve = r));
        });
      });
      assertLog([]);

      await act(() => ReactNoop.flushSync(() => setShow(true)));
      // The action hasn't finished, so its update isn't visible yet.
      assertLog(['Visible: 0']);
      expect(root).toMatchRenderedOutput('Visible: 0');

      await act(() => resolve());
      assertLog(['Visible: 1']);
      expect(root).toMatchRenderedOutput('Visible: 1');
    });
  });

  // @gate enableStore
  it('store updates after await without startTransition render at default priority', async () => {
    await runWithStateAndStore(async createSource => {
      const source = createSource('', (s, a) => s + a);
      function Reader() {
        return <Text text={'Value: ' + source.read()} />;
      }
      const root = ReactNoop.createRoot();
      await act(() =>
        root.render(
          <source.Root>
            <Reader />
          </source.Root>,
        ),
      );
      assertLog(['Value: ']);

      let resolve;
      await act(() => {
        startTransition(async () => {
          source.update('A');
          await new Promise(r => (resolve = r));
          // Not in a transition anymore.
          source.update('B');
        });
      });
      assertLog([]);

      await act(() => resolve());
      // B renders first, without A. Then the action is done and A renders
      // with B rebased on top.
      assertLog(['Value: B', 'Value: AB']);
      expect(root).toMatchRenderedOutput('Value: AB');
    });
  });

  // @gate enableStore
  it('store updates after await in a new startTransition join the action', async () => {
    await runWithStateAndStore(async createSource => {
      const source = createSource('', (s, a) => s + a);
      function Reader() {
        return <Text text={'Value: ' + source.read()} />;
      }
      const root = ReactNoop.createRoot();
      await act(() =>
        root.render(
          <source.Root>
            <Reader />
          </source.Root>,
        ),
      );
      assertLog(['Value: ']);

      let resolve1, resolve2;
      await act(() => {
        startTransition(async () => {
          source.update('A');
          await new Promise(r => (resolve1 = r));
          startTransition(() => source.update('B'));
          await new Promise(r => (resolve2 = r));
          startTransition(() => source.update('C'));
        });
      });
      assertLog([]);
      await act(() => resolve1());
      assertLog([]);
      // An urgent update in the middle.
      await act(() => source.update('!'));
      assertLog(['Value: !']);
      await act(() => resolve2());
      assertLog(['Value: AB!C']);
      expect(root).toMatchRenderedOutput('Value: AB!C');
    });
  });

  // @gate enableStore
  it('an action that throws still commits its store updates', async () => {
    await runWithStateAndStore(async createSource => {
      const source = createSource('', (s, a) => s + a);
      function Reader() {
        return <Text text={'Value: ' + source.read()} />;
      }
      const root = ReactNoop.createRoot();
      await act(() =>
        root.render(
          <source.Root>
            <Reader />
          </source.Root>,
        ),
      );
      assertLog(['Value: ']);

      let reject;
      await act(() => {
        startTransition(async () => {
          source.update('A');
          await new Promise((_, r) => (reject = r));
          startTransition(() => source.update('B'));
        });
      });
      assertLog([]);
      await act(() => reject(new Error('Action failed')));
      assertLog(['reportError: Action failed', 'Value: A']);
      expect(root).toMatchRenderedOutput('Value: A');
    });
  });

  // @gate enableStore
  it('a sync action that throws after a store update still commits the update', async () => {
    await runWithStateAndStore(async createSource => {
      const source = createSource('', (s, a) => s + a);
      function Reader() {
        return <Text text={'Value: ' + source.read()} />;
      }
      const root = ReactNoop.createRoot();
      await act(() =>
        root.render(
          <source.Root>
            <Reader />
          </source.Root>,
        ),
      );
      assertLog(['Value: ']);

      await act(() => {
        startTransition(() => {
          source.update('A');
          throw new Error('Sync action failed');
        });
      });
      assertLog(['reportError: Sync action failed', 'Value: A']);
    });
  });

  // @gate enableStore
  it('two overlapping actions share the entangled lane and commit together', async () => {
    await runWithStateAndStore(async createSource => {
      const source = createSource('', (s, a) => s + a);
      function Reader() {
        return <Text text={'Value: ' + source.read()} />;
      }
      const root = ReactNoop.createRoot();
      await act(() =>
        root.render(
          <source.Root>
            <Reader />
          </source.Root>,
        ),
      );
      assertLog(['Value: ']);

      let resolve1, resolve2;
      await act(() => {
        startTransition(async () => {
          source.update('A');
          await new Promise(r => (resolve1 = r));
        });
      });
      await act(() => {
        startTransition(async () => {
          source.update('B');
          await new Promise(r => (resolve2 = r));
        });
      });
      assertLog([]);
      // The first action finishes, but the second one is still pending,
      // and they're entangled.
      await act(() => resolve1());
      assertLog([]);
      await act(() => resolve2());
      assertLog(['Value: AB']);
    });
  });

  // @gate enableStore
  it('a reader that mounts in the action lane while the action is pending', async () => {
    await runWithStateAndStore(async createSource => {
      const source = createSource(0);
      function Reader({name}) {
        return <Text text={name + ': ' + source.read()} />;
      }
      let setShow;
      function App() {
        const [show, _setShow] = useState(false);
        setShow = _setShow;
        return (
          <>
            <Reader name="A" />
            {show ? <Reader name="B" /> : null}
          </>
        );
      }
      const root = ReactNoop.createRoot();
      await act(() =>
        root.render(
          <source.Root>
            <App />
          </source.Root>,
        ),
      );
      assertLog(['A: 0']);

      let resolve;
      await act(() => {
        startTransition(async () => {
          source.update(1);
          await new Promise(r => (resolve = r));
        });
      });
      assertLog([]);
      // Another transition while the action is pending gets the action's
      // lane, so it waits for the action too.
      await act(() => startTransition(() => setShow(true)));
      expect(root).toMatchRenderedOutput('A: 0');
      Scheduler.unstable_clearLog();

      await act(() => resolve());
      assertLog(['A: 1', 'B: 1']);
      expect(root).toMatchRenderedOutput('A: 1B: 1');
    });
  });

  // @gate enableStore
  it('useTransition isPending stays true until a store update that suspends commits', async () => {
    await runWithStateAndStore(async createSource => {
      const source = createSource('A');
      function Reader() {
        return <AsyncText text={source.read()} />;
      }
      let start;
      function Button() {
        const [isPending, _start] = useTransition();
        start = _start;
        return <Text text={isPending ? 'Pending' : 'Idle'} />;
      }
      resolveText('A');
      const root = ReactNoop.createRoot();
      await act(() =>
        root.render(
          <source.Root>
            <Button />
            <Suspense fallback={<Text text="Loading" />}>
              <Reader />
            </Suspense>
          </source.Root>,
        ),
      );
      assertLog(['Idle', 'A']);

      await act(() => start(() => source.update('B')));
      assertLog(['Pending', 'Idle', 'Suspend! [B]', 'Loading']);
      expect(root).toMatchRenderedOutput('PendingA');

      await act(() => resolveText('B'));
      assertLog(['Idle', 'B']);
      expect(root).toMatchRenderedOutput('IdleB');
    });
  });

  // @gate enableStore
  it('useTransition with an async action keeps isPending until the action is done', async () => {
    await runWithStateAndStore(async createSource => {
      const source = createSource('A');
      function Reader() {
        return <Text text={source.read()} />;
      }
      let start;
      function Button() {
        const [isPending, _start] = useTransition();
        start = _start;
        return <Text text={isPending ? 'Pending' : 'Idle'} />;
      }
      const root = ReactNoop.createRoot();
      await act(() =>
        root.render(
          <source.Root>
            <Button />
            <Reader />
          </source.Root>,
        ),
      );
      assertLog(['Idle', 'A']);

      let resolve;
      await act(() =>
        start(async () => {
          source.update('B');
          await new Promise(r => (resolve = r));
          startTransition(() => source.update('C'));
        }),
      );
      assertLog(['Pending']);
      expect(root).toMatchRenderedOutput('PendingA');

      await act(() => resolve());
      assertLog(['Idle', 'C']);
      expect(root).toMatchRenderedOutput('IdleC');
    });
  });
});

describe('optimistic and deferred values', () => {
  // @gate enableStore
  it('useOptimistic over a store value', async () => {
    await runWithStateAndStore(async createSource => {
      const source = createSource('A');
      let addOptimistic;
      function Reader() {
        const value = source.read();
        const [optimistic, _add] = useOptimistic(value, (s, a) => a);
        addOptimistic = _add;
        return <Text text={value + ' / ' + optimistic} />;
      }
      const root = ReactNoop.createRoot();
      await act(() =>
        root.render(
          <source.Root>
            <Reader />
          </source.Root>,
        ),
      );
      assertLog(['A / A']);

      let resolve;
      await act(() =>
        startTransition(async () => {
          addOptimistic('B?');
          await new Promise(r => (resolve = r));
          startTransition(() => source.update('B'));
        }),
      );
      assertLog(['A / B?']);

      // An urgent update to the store while the action is pending. The
      // optimistic value is rebased on top of it.
      await act(() => source.update('X'));
      assertLog(['X / B?']);

      await act(() => resolve());
      assertLog(['B / B']);
      expect(root).toMatchRenderedOutput('B / B');
    });
  });

  // @gate enableStore
  it('useOptimistic with a store update after await outside a transition', async () => {
    await runWithStateAndStore(async createSource => {
      const source = createSource('A');
      let addOptimistic;
      function Reader() {
        const value = source.read();
        const [optimistic, _add] = useOptimistic(value, (s, a) => a);
        addOptimistic = _add;
        return <Text text={value + ' / ' + optimistic} />;
      }
      const root = ReactNoop.createRoot();
      await act(() =>
        root.render(
          <source.Root>
            <Reader />
          </source.Root>,
        ),
      );
      assertLog(['A / A']);

      let resolve1, resolve2;
      await act(() =>
        startTransition(async () => {
          addOptimistic('B?');
          await new Promise(r => (resolve1 = r));
          source.update('B');
          await new Promise(r => (resolve2 = r));
        }),
      );
      assertLog(['A / B?']);
      await act(() => resolve1());
      assertLog(['B / B?']);
      await act(() => resolve2());
      assertLog(['B / B']);
    });
  });

  // @gate enableStore
  it('useDeferredValue of a store value, urgent and transition updates', async () => {
    await runWithStateAndStore(async createSource => {
      const source = createSource('A');
      function App() {
        const value = source.read();
        const deferred = useDeferredValue(value);
        return (
          <>
            <Text text={'Value: ' + value} />
            <Text text={'Deferred: ' + deferred} />
          </>
        );
      }
      const root = ReactNoop.createRoot();
      await act(() =>
        root.render(
          <source.Root>
            <App />
          </source.Root>,
        ),
      );
      assertLog(['Value: A', 'Deferred: A']);

      await act(async () => {
        source.update('B');
        await waitForPaint(['Value: B', 'Deferred: A']);
        // Another urgent update before the deferred render.
        source.update('C');
        await waitForPaint(['Value: C', 'Deferred: A']);
      });
      assertLog(['Value: C', 'Deferred: C']);

      // A transition update isn't deferred again.
      await act(() => startTransition(() => source.update('D')));
      assertLog(['Value: D', 'Deferred: D']);
    });
  });

  // @gate enableStore
  it('useDeferredValue with an initial value over a store value', async () => {
    await runWithStateAndStore(async createSource => {
      const source = createSource('A');
      function App() {
        const value = source.read();
        const deferred = useDeferredValue(value, 'Initial');
        return <Text text={value + ' / ' + deferred} />;
      }
      const root = ReactNoop.createRoot();
      await act(async () => {
        root.render(
          <source.Root>
            <App />
          </source.Root>,
        );
        await waitForPaint(['A / Initial']);
        // An update before the deferred render.
        source.update('B');
      });
      assertLog(['B / Initial', 'B / B']);
    });
  });

  // @gate enableStore
  it('useDeferredValue of a store that suspends keeps showing the old value', async () => {
    await runWithStateAndStore(async createSource => {
      const source = createSource('A');
      function App() {
        const deferred = useDeferredValue(source.read());
        return (
          <Suspense fallback={<Text text="Loading" />}>
            <AsyncText text={deferred} />
          </Suspense>
        );
      }
      resolveText('A');
      const root = ReactNoop.createRoot();
      await act(() =>
        root.render(
          <source.Root>
            <App />
          </source.Root>,
        ),
      );
      assertLog(['A']);

      await act(() => source.update('B'));
      assertLog(['A', 'Suspend! [B]', 'Loading']);
      expect(root).toMatchRenderedOutput('A');
      await act(() => resolveText('B'));
      assertLog(['B']);
      expect(root).toMatchRenderedOutput('B');
    });
  });
});

describe('async actions and Suspense', () => {
  // @gate enableStore
  it('does not commit an action update whose only rendered reader suspends inside a boundary showing its fallback', async () => {
    await compareStateAndStore(async (createSource, check) => {
      const source = createSource(0);
      function Reader({name}) {
        return <Text text={name + ': ' + source.read()} />;
      }
      let setTab, setShow;
      function App() {
        const [tab, _setTab] = useState('a');
        const [show, _setShow] = useState(false);
        setTab = _setTab;
        setShow = _setShow;
        return (
          <>
            <Suspense fallback={<Text text="Loading" />}>
              <Reader name="Inner" />
              <AsyncText text={'Tab ' + tab} />
            </Suspense>
            {show ? <Reader name="Outer" /> : null}
          </>
        );
      }
      resolveText('Tab a');
      const root = ReactNoop.createRoot();
      await act(() =>
        root.render(
          <source.Root>
            <App />
          </source.Root>,
        ),
      );
      check(root, 'mount');

      // An urgent update suspends, so the boundary shows its fallback and
      // the reader is hidden.
      await act(() => ReactNoop.flushSync(() => setTab('b')));
      check(root, 'fallback');

      let resolve;
      await act(() => {
        startTransition(async () => {
          source.update(1);
          await new Promise(r => (resolve = r));
        });
      });
      check(root, 'action pending');

      // A reader that mounts urgently while the action is pending.
      await act(() => ReactNoop.flushSync(() => setShow(true)));
      check(root, 'mount while pending');

      await act(() => resolve());
      check(root, 'action done');
      await act(() => resolveText('Tab b'));
      check(root, 'tab resolved');
    });
  });
  // @gate enableStore
  it('does not reveal an action update in a boundary that was waiting on the store before the action is done', async () => {
    await compareStateAndStore(async (createSource, check) => {
      const source = createSource(0);
      // Suspends until the data for the value it read is loaded. It never
      // committed, so the boundary is what subscribes to the store.
      function Child() {
        return <AsyncText text={'Data ' + source.read()} />;
      }
      const root = ReactNoop.createRoot();
      await act(() =>
        root.render(
          <source.Root>
            <Suspense fallback={<Text text="Loading" />}>
              <Child />
            </Suspense>
          </source.Root>,
        ),
      );
      check(root, 'mount');
      // The data for the action's value is already loaded.
      resolveText('Data 1');
      let resolve;
      await act(() => {
        startTransition(async () => {
          source.update(1);
          await new Promise(r => (resolve = r));
        });
      });
      check(root, 'action pending');
      await act(() => resolve());
      check(root, 'action done');
    });
  });
});

describe('every lane', () => {
  // @gate enableStore
  it('discrete, continuous, default and transition updates interleaved', async () => {
    await compareStateAndStore(async (createSource, check) => {
      const source = createSource('', (s, a) => s + a);
      function Reader({name}) {
        return <Text text={name + ':' + source.read()} />;
      }
      const root = ReactNoop.createRoot();
      await act(() =>
        root.render(
          <source.Root>
            <Reader name="A" />
            <Reader name="B" />
          </source.Root>,
        ),
      );
      check(root, 'mount');

      await act(async () => {
        startTransition(() => source.update('t'));
        ReactNoop.unstable_runWithPriority(DefaultEventPriority, () =>
          source.update('d'),
        );
        ReactNoop.unstable_runWithPriority(ContinuousEventPriority, () =>
          source.update('c'),
        );
        ReactNoop.discreteUpdates(() => source.update('s'));
        await flushPaint();
        check(root, 'first paint');
        await flushPaint();
        check(root, 'second paint');
        await flushPaint();
        check(root, 'third paint');
      });
      check(root, 'done');
    });
  });

  // @gate enableStore
  it('an idle update renders after a default update, and is rebased', async () => {
    await compareStateAndStore(async (createSource, check) => {
      const source = createSource('', (s, a) => s + a);
      function Reader() {
        return <Text text={'Value:' + source.read()} />;
      }
      const root = ReactNoop.createRoot();
      await act(() =>
        root.render(
          <source.Root>
            <Reader />
          </source.Root>,
        ),
      );
      check(root, 'mount');
      await act(async () => {
        ReactNoop.idleUpdates(() => source.update('i'));
        source.update('d');
        await flushPaint();
        check(root, 'default painted');
      });
      check(root, 'idle painted');
    });
  });

  // @gate enableStore
  it('flushSync inside a transition callback renders synchronously', async () => {
    await compareStateAndStore(async (createSource, check) => {
      const source = createSource('', (s, a) => s + a);
      function Reader() {
        return <Text text={'Value:' + source.read()} />;
      }
      const root = ReactNoop.createRoot();
      await act(() =>
        root.render(
          <source.Root>
            <Reader />
          </source.Root>,
        ),
      );
      check(root, 'mount');
      await act(() => {
        startTransition(() => {
          source.update('t');
          ReactNoop.flushSync(() => source.update('s'));
          check(root, 'after flushSync');
        });
      });
      check(root, 'done');
    });
  });

  // @gate enableStore
  it('flushSync during a time sliced transition render', async () => {
    await compareStateAndStore(async (createSource, check) => {
      const source = createSource('', (s, a) => s + a);
      function Reader({name}) {
        return <Text text={name + ':' + source.read()} />;
      }
      const root = ReactNoop.createRoot();
      await act(() =>
        root.render(
          <source.Root>
            <Reader name="A" />
            <Reader name="B" />
            <Reader name="C" />
          </source.Root>,
        ),
      );
      check(root, 'mount');
      await act(async () => {
        startTransition(() => source.update('t'));
        await flushYields(1);
        ReactNoop.flushSync(() => source.update('s'));
        check(root, 'after flushSync');
      });
      check(root, 'done');
    });
  });

  // @gate enableStore
  it('a retry of a suspended boundary does not include a pending transition update', async () => {
    await compareStateAndStore(async (createSource, check) => {
      const source = createSource(0);
      function Reader({name}) {
        return <Text text={name + ':' + source.read()} />;
      }
      let setTab;
      function App() {
        const [tab, _setTab] = useState('a');
        setTab = _setTab;
        return (
          <>
            <Reader name="Outside" />
            <Suspense fallback={<Text text="Loading" />}>
              <Reader name="Inside" />
              <AsyncText text={'Tab ' + tab} />
            </Suspense>
          </>
        );
      }
      resolveText('Tab a');
      const root = ReactNoop.createRoot();
      await act(() =>
        root.render(
          <source.Root>
            <App />
          </source.Root>,
        ),
      );
      check(root, 'mount');
      await act(() => ReactNoop.flushSync(() => setTab('b')));
      check(root, 'fallback');
      // A transition that suspends on data that never resolves.
      await act(() =>
        startTransition(() => {
          source.update(1);
          setTab('c');
        }),
      );
      check(root, 'transition suspended');
      // The retry lane renders b, without the transition.
      await act(() => resolveText('Tab b'));
      check(root, 'retry');
      await act(() => resolveText('Tab c'));
      check(root, 'transition done');
    });
  });
});

describe('time slicing', () => {
  // @gate enableStore
  it('an urgent update before a reader renders in a yielded transition render', async () => {
    await compareStateAndStore(async (createSource, check) => {
      const source = createSource('', (s, a) => s + a);
      function Reader({name}) {
        return <Text text={name + ':' + source.read()} />;
      }
      const root = ReactNoop.createRoot();
      await act(() =>
        root.render(
          <source.Root>
            <Text text="Before" />
            <Reader name="A" />
            <Reader name="B" />
          </source.Root>,
        ),
      );
      check(root, 'mount');
      await act(async () => {
        startTransition(() => source.update('t'));
        await flushYields(1);
        // The reader hasn't rendered yet.
        source.update('d');
        check(root, 'dispatched');
      });
      check(root, 'done');
    });
  });

  // @gate enableStore
  it('a transition update after one reader rendered in a yielded transition render', async () => {
    await compareStateAndStore(async (createSource, check) => {
      const source = createSource('', (s, a) => s + a);
      function Reader({name}) {
        return <Text text={name + ':' + source.read()} />;
      }
      const root = ReactNoop.createRoot();
      await act(() =>
        root.render(
          <source.Root>
            <Reader name="A" />
            <Reader name="B" />
          </source.Root>,
        ),
      );
      check(root, 'mount');
      await act(async () => {
        startTransition(() => source.update('1'));
        await flushYields(1);
        startTransition(() => source.update('2'));
        check(root, 'dispatched');
      });
      check(root, 'done');
    });
  });

  // @gate enableStore
  it('an idle update during a yielded idle render, before and after a reader rendered', async () => {
    await compareStateAndStore(async (createSource, check) => {
      const source = createSource('', (s, a) => s + a);
      function Reader({name}) {
        return <Text text={name + ':' + source.read()} />;
      }
      const root = ReactNoop.createRoot();
      await act(() =>
        root.render(
          <source.Root>
            <Text text="Before" />
            <Reader name="A" />
            <Reader name="B" />
          </source.Root>,
        ),
      );
      check(root, 'mount');
      await act(async () => {
        ReactNoop.idleUpdates(() => source.update('1'));
        await flushYields(1);
        ReactNoop.idleUpdates(() => source.update('2'));
        await flushYields(1);
        ReactNoop.idleUpdates(() => source.update('3'));
        check(root, 'dispatched');
      });
      check(root, 'done');
    });
  });

  // @gate enableStore
  it('a ping restarts a transition render that suspended, with an update dispatched in between', async () => {
    await compareStateAndStore(async (createSource, check) => {
      const source = createSource('', (s, a) => s + a);
      function Reader({name}) {
        return <Text text={name + ':' + source.read()} />;
      }
      function App() {
        const value = source.read();
        return (
          <>
            <Reader name="A" />
            <AsyncText text={'Data ' + value.length} />
            <Reader name="B" />
          </>
        );
      }
      resolveText('Data 0');
      const root = ReactNoop.createRoot();
      await act(() =>
        root.render(
          <source.Root>
            <App />
          </source.Root>,
        ),
      );
      check(root, 'mount');
      await act(async () => {
        startTransition(() => source.update('x'));
        await flushAll();
        check(root, 'suspended');
        startTransition(() => source.update('y'));
        resolveText('Data 1');
        await flushAll();
        check(root, 'after ping');
        resolveText('Data 2');
      });
      check(root, 'done');
    });
  });
  // @gate enableStore
  it('a store that becomes pending during a yielded transition render, before its reader renders', async () => {
    await compareStateAndStore(async (createSource, check) => {
      const source = createSource('', (s, a) => s + a);
      let setTab;
      function Tab() {
        const [tab, _setTab] = useState('a');
        setTab = _setTab;
        return <Text text={'Tab ' + tab} />;
      }
      function Reader({name}) {
        return <Text text={name + ':' + source.read()} />;
      }
      function App() {
        return (
          <>
            <Tab />
            <Reader name="A" />
          </>
        );
      }
      const root = ReactNoop.createRoot();
      await act(() =>
        root.render(
          <source.Root>
            <App />
          </source.Root>,
        ),
      );
      check(root, 'mount');
      await act(async () => {
        // The store has nothing pending when this render begins.
        startTransition(() => setTab('b'));
        await flushYields(1);
        // Lower priority than the render, so it doesn't interrupt it.
        ReactNoop.idleUpdates(() => source.update('i'));
        // A transition update in a new lane.
        startTransition(() => source.update('t'));
        check(root, 'dispatched');
      });
      check(root, 'done');
    });
  });
});

describe('batching', () => {
  // @gate enableStore
  it('batches store and state updates in a microtask', async () => {
    await compareStateAndStore(async (createSource, check) => {
      const source = createSource(0);
      let setLabel;
      function App() {
        const [label, _setLabel] = useState('Count');
        setLabel = _setLabel;
        return <Text text={label + ': ' + source.read()} />;
      }
      const root = ReactNoop.createRoot();
      await act(() =>
        root.render(
          <source.Root>
            <App />
          </source.Root>,
        ),
      );
      check(root, 'mount');
      await act(async () => {
        await null;
        source.update(1);
        setLabel('Total');
        source.update(2);
      });
      check(root, 'microtask');
    });
  });

  // @gate enableStore
  it('batches store and state updates in a timeout', async () => {
    await compareStateAndStore(async (createSource, check) => {
      const source = createSource(0);
      let setLabel;
      function App() {
        const [label, _setLabel] = useState('Count');
        setLabel = _setLabel;
        return <Text text={label + ': ' + source.read()} />;
      }
      const root = ReactNoop.createRoot();
      await act(() =>
        root.render(
          <source.Root>
            <App />
          </source.Root>,
        ),
      );
      check(root, 'mount');
      await act(() => {
        setTimeout(() => {
          source.update(1);
          setLabel('Total');
          source.update(2);
        }, 0);
        jest.runOnlyPendingTimers();
      });
      check(root, 'timeout');
    });
  });
});

describe('updates from effects', () => {
  // @gate enableStore
  it('updates from layout and passive effects of a transition render', async () => {
    await compareStateAndStore(async (createSource, check) => {
      const source = createSource('', (s, a) => s + a);
      function Reader() {
        return <Text text={'Value:' + source.read()} />;
      }
      let setShow;
      function Updater() {
        useLayoutEffect(() => {
          source.update('L');
        }, []);
        useEffect(() => {
          source.update('P');
        }, []);
        return null;
      }
      function App() {
        const [show, _setShow] = useState(false);
        setShow = _setShow;
        return (
          <>
            <Reader />
            {show ? <Updater /> : null}
          </>
        );
      }
      const root = ReactNoop.createRoot();
      await act(() =>
        root.render(
          <source.Root>
            <App />
          </source.Root>,
        ),
      );
      check(root, 'mount');
      await act(async () => {
        startTransition(() => {
          source.update('t');
          setShow(true);
        });
        await flushPaint();
        check(root, 'transition painted');
        await flushPaint();
        check(root, 'next paint');
      });
      check(root, 'done');
    });
  });

  // @gate enableStore
  it('an update from a passive effect while a transition is pending is rebased', async () => {
    await compareStateAndStore(async (createSource, check) => {
      const source = createSource('', (s, a) => s + a);
      function Reader() {
        return <Text text={'Value:' + source.read()} />;
      }
      let setShow;
      function Updater() {
        useEffect(() => {
          source.update('P');
        }, []);
        return null;
      }
      function App() {
        const [show, _setShow] = useState(false);
        setShow = _setShow;
        return (
          <>
            <Reader />
            {show ? <Updater /> : null}
          </>
        );
      }
      const root = ReactNoop.createRoot();
      await act(() =>
        root.render(
          <source.Root>
            <App />
          </source.Root>,
        ),
      );
      check(root, 'mount');
      let resolve;
      await act(() =>
        startTransition(async () => {
          source.update('t');
          await new Promise(r => (resolve = r));
        }),
      );
      check(root, 'pending');
      await act(() => setShow(true));
      check(root, 'effect ran');
      await act(() => resolve());
      check(root, 'done');
    });
  });
});

describe('reducer runs', () => {
  async function countReducerRuns(scenario) {
    const counts = {};
    const outputs = {};
    const sourceFactories = [createStateSource, createStoreSource];
    for (let k = 0; k < sourceFactories.length; k++) {
      const createSource = sourceFactories[k];
      const kind = createSource === createStateSource ? 'state' : 'store';
      textCache = new Map();
      let runs = 0;
      const reducer = (s, a) => {
        runs++;
        return s + a;
      };
      const output = await scenario(initial => createSource(initial, reducer));
      Scheduler.unstable_clearLog();
      counts[kind] = runs;
      outputs[kind] = output;
    }
    expect(outputs.store).toEqual(outputs.state);
    return counts;
  }

  // @gate enableStore
  it('across an interrupted transition and a rebase, no more than useReducer', async () => {
    const counts = await countReducerRuns(async createSource => {
      const source = createSource('');
      function Reader({name}) {
        return <Text text={name + ':' + source.read()} />;
      }
      const root = ReactNoop.createRoot();
      await act(() =>
        root.render(
          <source.Root>
            <Reader name="A" />
            <Reader name="B" />
            <Reader name="C" />
          </source.Root>,
        ),
      );
      Scheduler.unstable_clearLog();
      await act(async () => {
        startTransition(() => {
          source.update('a');
          source.update('b');
        });
        await flushYields(1);
        ReactNoop.flushSync(() => source.update('s'));
        startTransition(() => source.update('c'));
        await flushYields(1);
        ReactNoop.flushSync(() => source.update('t'));
      });
      return getOutput(root);
    });
    expect(counts.store).toBeLessThanOrEqual(counts.state);
  });

  // @gate enableStore
  it('across a suspended transition retried several times, no more than useReducer', async () => {
    const counts = await countReducerRuns(async createSource => {
      const source = createSource('');
      function Reader() {
        const value = source.read();
        return <AsyncText text={'Value:' + value} />;
      }
      resolveText('Value:');
      const root = ReactNoop.createRoot();
      await act(() =>
        root.render(
          <source.Root>
            <Suspense fallback={<Text text="Loading" />}>
              <Reader />
            </Suspense>
          </source.Root>,
        ),
      );
      Scheduler.unstable_clearLog();
      await act(() => startTransition(() => source.update('a')));
      Scheduler.unstable_clearLog();
      await act(() => source.update('b'));
      Scheduler.unstable_clearLog();
      await act(() => source.update('c'));
      Scheduler.unstable_clearLog();
      resolveText('Value:bc');
      await act(() => resolveText('Value:abc'));
      return getOutput(root);
    });
    expect(counts.store).toBeLessThanOrEqual(counts.state);
  });
});

describe('held updates and async actions', () => {
  async function renderHeldActionUpdateAfterTransitions(fillerTransitions) {
    const store = createStore(1);
    const otherStore = createStore(0);
    const never = new Promise(() => {});

    function Reader() {
      return <Text text={'Reader: ' + use(store)} />;
    }

    let setShow, setTab;
    function App() {
      const [show, _setShow] = useState(false);
      const [tab, _setTab] = useState('a');
      setShow = _setShow;
      setTab = _setTab;
      if (tab === 'b') {
        use(never);
      }
      return (
        <>
          <Text text={'Tab: ' + tab} />
          {show ? <Reader /> : null}
        </>
      );
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<App />));
    assertLog(['Tab: a']);

    // No root reads the store, so the action's update is held.
    let resolve;
    await act(() =>
      startTransition(async () => {
        store.update(2);
        await new Promise(r => (resolve = r));
      }),
    );
    // The action is done. Nothing else rendered in it.
    await act(() => resolve());
    // Use the rest of the transition lanes, with updates to another store
    // that no root reads, so nothing commits.
    for (let i = 1; i <= fillerTransitions; i++) {
      await act(() => startTransition(() => otherStore.update(i)));
    }
    // With 9 filler transitions, this one gets the action's lane. It
    // suspends.
    await act(() => startTransition(() => setTab('b')));
    assertLog([]);

    // The action is done, so a reader that mounts shows its update.
    await act(() => ReactNoop.flushSync(() => setShow(true)));
    assertLog(['Tab: a', 'Reader: 2']);
    expect(root).toMatchRenderedOutput('Tab: aReader: 2');
  }

  // @gate enableStore
  it('a held update from an async action that is done is visible when a later transition is pending (control: different lane)', async () => {
    await renderHeldActionUpdateAfterTransitions(8);
  });

  // @gate enableStore
  it('a held update from an async action that is done is visible after its lane is reused', async () => {
    await renderHeldActionUpdateAfterTransitions(9);
  });
});

describe('reads and readers during transitions', () => {
  // @gate enableStore
  it('a reader that switches stores in a transition while the new store has a pending transition', async () => {
    await compareStateAndStore(async (createSource, check) => {
      const a = createSource('a0');
      const b = createSource('b0');
      let setWhich;
      function Reader() {
        const [which, _setWhich] = useState('a');
        setWhich = _setWhich;
        return <Text text={which === 'a' ? a.read() : b.read()} />;
      }
      function Other() {
        return <Text text={'Other: ' + b.read()} />;
      }
      const root = ReactNoop.createRoot();
      await act(() =>
        root.render(
          <a.Root>
            <b.Root>
              <Reader />
              <Other />
            </b.Root>
          </a.Root>,
        ),
      );
      check(root, 'mount');
      let resolve;
      await act(() =>
        startTransition(async () => {
          b.update('b1');
          await new Promise(r => (resolve = r));
        }),
      );
      check(root, 'b pending');
      // Switch urgently: shows b's committed value.
      await act(() => ReactNoop.flushSync(() => setWhich('b')));
      check(root, 'switched to b');
      // Switch back in a transition while b's transition is still pending.
      await act(() => startTransition(() => setWhich('a')));
      check(root, 'switch back pending');
      await act(() => resolve());
      check(root, 'done');
    });
  });

  // @gate enableStore
  it('a conditional read that starts during a time sliced transition render', async () => {
    await compareStateAndStore(async (createSource, check) => {
      const source = createSource(0);
      let setShow;
      function Maybe() {
        const [show, _setShow] = useState(false);
        setShow = _setShow;
        return <Text text={show ? 'Read: ' + source.read() : 'No read'} />;
      }
      function Reader() {
        return <Text text={'Reader: ' + source.read()} />;
      }
      const root = ReactNoop.createRoot();
      await act(() =>
        root.render(
          <source.Root>
            <Reader />
            <Maybe />
          </source.Root>,
        ),
      );
      check(root, 'mount');
      await act(async () => {
        startTransition(() => source.update(1));
        await flushYields(1);
        // An urgent update makes Maybe start reading the store.
        ReactNoop.flushSync(() => setShow(true));
        check(root, 'urgent');
      });
      check(root, 'done');
    });
  });

  // @gate enableStore
  it('reads a list of stores in a loop with interleaved urgent and transition updates', async () => {
    await compareStateAndStore(async (createSource, check) => {
      const sources = [createSource(0), createSource(0), createSource(0)];
      function Sum() {
        let sum = '';
        for (let i = 0; i < sources.length; i++) {
          sum += sources[i].read();
        }
        return <Text text={'Values: ' + sum} />;
      }
      const root = ReactNoop.createRoot();
      await act(() =>
        root.render(
          sources.reduceRight(
            (children, source) => <source.Root>{children}</source.Root>,
            <Sum />,
          ),
        ),
      );
      check(root, 'mount');
      let resolve;
      await act(() =>
        startTransition(async () => {
          sources[0].update(1);
          sources[2].update(1);
          await new Promise(r => (resolve = r));
        }),
      );
      check(root, 'pending');
      await act(() => {
        sources[1].update(2);
        sources[2].update(n => n + 2);
      });
      check(root, 'urgent');
      await act(() => resolve());
      check(root, 'done');
    });
  });

  // @gate enableStore
  it('a reader that unmounts during a time sliced transition render, and remounts urgently', async () => {
    await compareStateAndStore(async (createSource, check) => {
      const source = createSource(0);
      function Reader({name}) {
        return <Text text={name + ': ' + source.read()} />;
      }
      let setShow;
      function App() {
        const [show, _setShow] = useState(true);
        setShow = _setShow;
        return (
          <>
            <Reader name="A" />
            {show ? <Reader name="B" /> : null}
          </>
        );
      }
      const root = ReactNoop.createRoot();
      await act(() =>
        root.render(
          <source.Root>
            <App />
          </source.Root>,
        ),
      );
      check(root, 'mount');
      await act(async () => {
        startTransition(() => source.update(1));
        await flushYields(1);
        ReactNoop.flushSync(() => setShow(false));
        check(root, 'unmounted');
        ReactNoop.flushSync(() => setShow(true));
        check(root, 'remounted');
      });
      check(root, 'done');
    });
  });

  // @gate enableStore
  it('a store of stores: a transition switches the inner store while it has an urgent update', async () => {
    const inner1 = createStore('x1');
    const inner2 = createStore('y1');
    const outer = createStore(inner1);
    function Reader({name}) {
      return <Text text={name + ': ' + use(use(outer))} />;
    }
    const root = ReactNoop.createRoot();
    await act(() =>
      root.render(
        <>
          <Reader name="A" />
          <Reader name="B" />
        </>,
      ),
    );
    assertLog(['A: x1', 'B: x1']);

    let resolve;
    await act(() =>
      startTransition(async () => {
        outer.update(inner2);
        inner2.update('y2');
        await new Promise(r => (resolve = r));
      }),
    );
    assertLog([]);
    // An urgent update to the inner store that's still shown.
    await act(() => inner1.update('x2'));
    assertLog(['A: x2', 'B: x2']);
    // An urgent update to the new inner store isn't visible until the
    // transition commits.
    await act(() => inner2.update(s => s + '!'));
    assertLog([]);
    expect(root).toMatchRenderedOutput('A: x2B: x2');
    await act(() => resolve());
    assertLog(['A: y2!', 'B: y2!']);
    expect(root).toMatchRenderedOutput('A: y2!B: y2!');
  });
});

describe('updates from render and insertion effects', () => {
  // @gate enableStore
  it('a store update during a transition render renders after it, in the same lane', async () => {
    await compareStateAndStore(async (createSource, check) => {
      const source = createSource('', (s, a) => s + a);
      let didUpdate = false;
      function Updater() {
        const value = source.read();
        if (value === 't' && !didUpdate) {
          didUpdate = true;
          source.update('r');
        }
        return <Text text={'Updater: ' + value} />;
      }
      function Reader() {
        return <Text text={'Reader: ' + source.read()} />;
      }
      const root = ReactNoop.createRoot();
      await act(() =>
        root.render(
          <source.Root>
            <Reader />
            <Updater />
          </source.Root>,
        ),
      );
      check(root, 'mount');
      await act(async () => {
        startTransition(() => source.update('t'));
        await flushPaint();
        check(root, 'transition painted');
        // An urgent update before the render phase update renders.
        source.update('u');
      });
      check(root, 'done');
      if (source.kind === 'state') {
        assertConsoleErrorDev([
          'Cannot update a component (`Root`) while rendering a different ' +
            'component (`Updater`). To locate the bad setState() call inside ' +
            '`Updater`, follow the stack trace as described in ' +
            'https://react.dev/link/setstate-in-render\n' +
            '    in Updater (at **)',
        ]);
      } else {
        assertConsoleErrorDev([
          'Cannot update a store while rendering a component (`Updater`). ' +
            'Updating a store is a side effect, so it should happen in an ' +
            'event handler or an effect. The update will be rendered after the ' +
            'current render. To locate the bad store.update() call inside ' +
            '`Updater`, follow the stack trace as described in ' +
            'https://react.dev/link/setstate-in-render\n' +
            '    in Updater (at **)',
        ]);
      }
    });
  });

  // @gate enableStore
  it('a store update from an insertion effect of a transition render', async () => {
    await compareStateAndStore(async (createSource, check) => {
      const source = createSource('', (s, a) => s + a);
      function Reader() {
        return <Text text={'Reader: ' + source.read()} />;
      }
      let setShow;
      function Updater() {
        useInsertionEffect(() => {
          source.update('i');
        }, []);
        return null;
      }
      function App() {
        const [show, _setShow] = useState(false);
        setShow = _setShow;
        return (
          <>
            <Reader />
            {show ? <Updater /> : null}
          </>
        );
      }
      const root = ReactNoop.createRoot();
      await act(() =>
        root.render(
          <source.Root>
            <App />
          </source.Root>,
        ),
      );
      check(root, 'mount');
      await act(async () => {
        startTransition(() => {
          source.update('t');
          setShow(true);
        });
        await flushPaint();
        check(root, 'transition painted');
      });
      check(root, 'done');
      assertConsoleErrorDev([
        'useInsertionEffect must not schedule updates.\n' +
          '    in App (at **)',
      ]);
    });
  });
});

describe('gestures', () => {
  // @gate enableStore && enableGestureTransition
  it('a store update inside a gesture does not hold anything for a store no root reads', async () => {
    const store = createStore(0);
    await act(() => {
      React.unstable_startGestureTransition({}, () => {
        store.update(1);
      });
    });
    assertLog([
      'reportError: Cannot update a store inside a startGestureTransition',
    ]);
    expect(store._pendingTransitionUpdates).toBe(null);
    expect(store._headQueue).toBe(null);
    expect(store._head).toBe(0);

    function Reader() {
      return <Text text={'Reader: ' + use(store)} />;
    }
    const root = ReactNoop.createRoot();
    await act(() => root.render(<Reader />));
    assertLog(['Reader: 0']);
  });

  // @gate enableStore && enableGestureTransition
  it('a store update inside a gesture leaves the record untouched', async () => {
    const store = createStore(0);
    function Reader() {
      return <Text text={'Reader: ' + use(store)} />;
    }
    const root = ReactNoop.createRoot();
    await act(() => root.render(<Reader />));
    assertLog(['Reader: 0']);
    const record = store._records[0];

    await act(() => {
      React.unstable_startGestureTransition({}, () => {
        store.update(1);
      });
    });
    assertLog([
      'reportError: Cannot update a store inside a startGestureTransition',
    ]);
    expect(record.pending).toBe(null);
    expect(record.lanes).toBe(0);
    expect(record.isPending).toBe(false);
    expect(store._headQueue).toBe(null);
  });
});

describe('render phase updates in other lanes', () => {
  function renderPhaseWarning(kind, name) {
    return kind === 'state'
      ? 'Cannot update a component (`Root`) while rendering a different ' +
          'component (`' +
          name +
          '`). To locate the bad setState() call inside `' +
          name +
          '`, follow the stack trace as described in ' +
          'https://react.dev/link/setstate-in-render\n' +
          '    in ' +
          name +
          ' (at **)'
      : 'Cannot update a store while rendering a component (`' +
          name +
          '`). Updating a store is a side effect, so it should happen in an ' +
          'event handler or an effect. The update will be rendered after the ' +
          'current render. To locate the bad store.update() call inside `' +
          name +
          '`, follow the stack trace as described in ' +
          'https://react.dev/link/setstate-in-render\n' +
          '    in ' +
          name +
          ' (at **)';
  }

  // @gate enableStore
  it('a store update while rendering a hidden tree', async () => {
    await compareStateAndStore(async (createSource, check) => {
      const source = createSource('', (s, a) => s + a);
      let didUpdate = false;
      function HiddenUpdater() {
        if (!didUpdate) {
          didUpdate = true;
          source.update('h');
        }
        return null;
      }
      function Reader() {
        return <Text text={'Reader: ' + source.read()} />;
      }
      const root = ReactNoop.createRoot();
      await act(async () => {
        root.render(
          <source.Root>
            <Reader />
            <Activity mode="hidden">
              <HiddenUpdater />
            </Activity>
          </source.Root>,
        );
        await flushPaint();
        check(root, 'visible painted');
        // An urgent update before the hidden tree's update renders.
        source.update('u');
      });
      check(root, 'done');
      assertConsoleErrorDev([renderPhaseWarning(source.kind, 'HiddenUpdater')]);
    });
  });

  // @gate enableStore
  it('a store update while rendering a Suspense retry', async () => {
    await compareStateAndStore(async (createSource, check) => {
      const source = createSource('', (s, a) => s + a);
      let didUpdate = false;
      function RetryUpdater() {
        readText('Data');
        if (!didUpdate) {
          didUpdate = true;
          source.update('r');
        }
        return <Text text="Data" />;
      }
      function Reader() {
        return <Text text={'Reader: ' + source.read()} />;
      }
      const root = ReactNoop.createRoot();
      await act(() =>
        root.render(
          <source.Root>
            <Reader />
            <Suspense fallback={<Text text="Loading" />}>
              <RetryUpdater />
            </Suspense>
          </source.Root>,
        ),
      );
      check(root, 'mount');
      await act(() => resolveText('Data'));
      check(root, 'retried');
      assertConsoleErrorDev([renderPhaseWarning(source.kind, 'RetryUpdater')]);
    });
  });
});

describe('form actions', () => {
  // @gate enableStore
  it('useActionState with a store update before and after await', async () => {
    await compareStateAndStore(async (createSource, check) => {
      const source = createSource('', (s, a) => s + a);
      let resolve;
      let dispatchAction;
      function Form() {
        const [state, _dispatch, isPending] = useActionState(
          async (prev, payload) => {
            source.update(payload);
            await new Promise(r => (resolve = r));
            startTransition(() => source.update('!'));
            return prev + 1;
          },
          0,
        );
        dispatchAction = _dispatch;
        return (
          <Text
            text={
              'Runs: ' +
              state +
              (isPending ? ' (pending)' : '') +
              ' Value: ' +
              source.read()
            }
          />
        );
      }
      const root = ReactNoop.createRoot();
      await act(() =>
        root.render(
          <source.Root>
            <Form />
          </source.Root>,
        ),
      );
      check(root, 'mount');
      await act(() => startTransition(() => dispatchAction('a')));
      check(root, 'pending');
      await act(() => source.update('u'));
      check(root, 'urgent');
      await act(() => resolve());
      check(root, 'done');
    });
  });
});
