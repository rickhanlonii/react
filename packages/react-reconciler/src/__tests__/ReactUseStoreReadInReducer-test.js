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
let ReactNoop;
let Scheduler;
let act;
let use;
let startTransition;
let assertLog;
let createStore;
let useState;
let textCache;
let ErrorBoundary;

const originalReportError = global.reportError;

beforeEach(() => {
  jest.resetModules();
  // Errors that no error boundary handles, like a reducer error that no
  // component threw, are passed to reportError. Log the first sentence of
  // each one. React reads reportError when it loads.
  global.reportError = error => {
    Scheduler.log('reportError: ' + error.message.split('.')[0]);
  };

  React = require('react');
  ReactNoop = require('react-noop-renderer');
  Scheduler = require('scheduler');
  use = React.use;
  startTransition = React.startTransition;
  createStore = React.unstable_createStore;
  useState = React.useState;
  textCache = new Map();
  ErrorBoundary = createErrorBoundary();

  const InternalTestUtils = require('internal-test-utils');
  act = InternalTestUtils.act;
  assertLog = InternalTestUtils.assertLog;
});

afterEach(() => {
  global.reportError = originalReportError;
  // A reported error would otherwise go unnoticed after the last act.
  assertLog([]);
});

function Text({text}) {
  Scheduler.log(text);
  return text;
}

function resolveText(text) {
  const record = textCache.get(text);
  if (record === undefined) {
    textCache.set(text, {status: 'resolved', value: text});
  } else if (record.status === 'pending') {
    record.status = 'resolved';
    record.ping();
  }
}

function AsyncText({text}) {
  let record = textCache.get(text);
  if (record === undefined) {
    let ping;
    const promise = new Promise(resolve => (ping = resolve));
    record = {status: 'pending', ping, promise};
    textCache.set(text, record);
  }
  if (record.status === 'pending') {
    Scheduler.log('Suspend! [' + text + ']');
    throw record.promise;
  }
  Scheduler.log(text);
  return text;
}

function createErrorBoundary() {
  return class Boundary extends React.Component {
    state = {error: null};
    static getDerivedStateFromError(error) {
      return {error};
    }
    render() {
      if (this.state.error !== null) {
        return <Text text={'Caught: ' + this.state.error.message} />;
      }
      return this.props.children;
    }
  };
}

// Spike: a store's reducer reads another store with use(). It returns the
// other store's value at the point the update was dispatched, under the
// render's lanes, so updates that read across stores rebase like updates to
// one store. These tests describe the behavior we want; they fail today.
describe('reading another store in a reducer', () => {
  // @gate enableStore
  it('reads the value of another store', async () => {
    const a = createStore(1);
    const b = createStore(0, (state, action) =>
      action === 'add a' ? state + use(a) : state,
    );
    function Reader() {
      return <Text text={'A: ' + use(a) + ', B: ' + use(b)} />;
    }
    const root = ReactNoop.createRoot();
    await act(() => root.render(<Reader />));
    assertLog(['A: 1, B: 0']);

    await act(() => {
      a.update(2);
      b.update('add a');
    });
    assertLog(['A: 2, B: 2']);
  });

  // @gate enableStore
  it('reads the other store as of when the update was dispatched', async () => {
    const a = createStore(1);
    const b = createStore(0, (state, action) =>
      action === 'add a' ? state + use(a) : state,
    );
    function Reader() {
      return <Text text={'A: ' + use(a) + ', B: ' + use(b)} />;
    }
    const root = ReactNoop.createRoot();
    await act(() => root.render(<Reader />));
    assertLog(['A: 1, B: 0']);

    // B's update comes first, so it reads A before A's update.
    await act(() => {
      b.update('add a');
      a.update(10);
    });
    assertLog(['A: 10, B: 1']);
  });

  // @gate enableStore
  it('reads a store that no component reads', async () => {
    const a = createStore(1);
    const b = createStore(0, (state, action) =>
      action === 'add a' ? state + use(a) : state,
    );
    function Reader() {
      return <Text text={'B: ' + use(b)} />;
    }
    const root = ReactNoop.createRoot();
    await act(() => root.render(<Reader />));
    assertLog(['B: 0']);

    await act(() => {
      a.update(5);
      b.update('add a');
    });
    assertLog(['B: 5']);
  });

  // @gate enableStore
  it('a root that starts reading the store gets the latest value, computed with the other store', async () => {
    const a = createStore(1);
    const b = createStore(0, (state, action) =>
      action === 'add a' ? state + use(a) : state,
    );
    // Nothing reads either store, so the latest values are computed without
    // a render.
    a.update(3);
    b.update('add a');
    a.update(100);

    function Reader() {
      return <Text text={'B: ' + use(b)} />;
    }
    const root = ReactNoop.createRoot();
    await act(() => root.render(<Reader />));
    assertLog(['B: 3']);
  });

  // @gate enableStore
  it('rebases an update whose reducer read a store with a skipped transition update', async () => {
    const a = createStore('a0');
    const b = createStore('', (state, action) =>
      action === 'copy a' ? use(a) : state,
    );
    function Reader() {
      return <Text text={'A: ' + use(a) + ', B: ' + use(b)} />;
    }
    const root = ReactNoop.createRoot();
    await act(() => root.render(<Reader />));
    assertLog(['A: a0, B: ']);

    await act(async () => {
      startTransition(() => a.update('a1'));
      // The sync render skips A's transition update, so B copies the A it
      // shows. Nothing in B's own queue was skipped.
      ReactNoop.flushSync(() => b.update('copy a'));
      assertLog(['A: a0, B: a0']);
    });
    // In dispatch order, B's update comes after A's, so once the transition
    // renders, B is rebased and copies A's new value.
    assertLog(['A: a1, B: a1']);
  });

  // @gate enableStore
  it('two stores whose reducers read each other read the earlier updates', async () => {
    const a = createStore(1, (state, action) =>
      action === 'copy b' ? use(b) : state,
    );
    const b = createStore(2, (state, action) =>
      action === 'copy a' ? use(a) : state,
    );
    function Reader() {
      return <Text text={'A: ' + use(a) + ', B: ' + use(b)} />;
    }
    const root = ReactNoop.createRoot();
    await act(() => root.render(<Reader />));
    assertLog(['A: 1, B: 2']);

    await act(() => {
      a.update('copy b');
      b.update('copy a');
    });
    assertLog(['A: 2, B: 2']);
  });

  // react-concurrent-store PR 28 (Jordan's Gmail-style labels), with a store
  // per email and per label. Updates that read a store are dispatched before
  // the update that changes it.
  // @gate enableStore
  it('keeps label counts right when a sync update interrupts a transition (a store per entity)', async () => {
    const labelNames = {foo: 'Foo', bar: 'Bar', baz: 'Baz'};
    const emails = {
      1: createStore({
        subject: 'Lunch?',
        isRead: false,
        labelIds: ['foo', 'bar'],
      }),
      2: createStore({
        subject: 'Quarterly report',
        isRead: false,
        labelIds: ['foo'],
      }),
      3: createStore({
        subject: 'Weekend plans',
        isRead: false,
        labelIds: ['baz'],
      }),
    };
    function labelReducer(labelId) {
      return (count, action) => {
        // Reads the email as of this update: has it been read, and does it
        // still have this label?
        const email = use(emails[action.emailId]);
        if (email.isRead || !email.labelIds.includes(labelId)) {
          return count;
        }
        return count - 1;
      };
    }
    const labels = {
      foo: createStore(2, labelReducer('foo')),
      bar: createStore(1, labelReducer('bar')),
      baz: createStore(1, labelReducer('baz')),
    };

    function markEmailAsRead(emailId, labelIds) {
      labelIds.forEach(labelId => labels[labelId].update({emailId}));
      emails[emailId].update(e => ({...e, isRead: true}));
    }
    function removeLabelFromEmail(emailId, labelId) {
      labels[labelId].update({emailId});
      emails[emailId].update(e => ({
        ...e,
        labelIds: e.labelIds.filter(id => id !== labelId),
      }));
    }

    function Mailbox() {
      const counts = Object.keys(labels)
        .map(id => labelNames[id] + ' (' + use(labels[id]) + ')')
        .join(', ');
      const list = Object.keys(emails)
        .map(id => {
          const e = use(emails[id]);
          return (
            e.subject +
            ' [' +
            e.labelIds.map(l => labelNames[l]).join(', ') +
            ']' +
            (e.isRead ? '' : ' (unread)')
          );
        })
        .join(', ');
      return <Text text={counts + ' | ' + list} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<Mailbox />));
    assertLog([
      'Foo (2), Bar (1), Baz (1) | Lunch? [Foo, Bar] (unread), Quarterly report [Foo] (unread), Weekend plans [Baz] (unread)',
    ]);

    let resolve;
    await act(() => {
      startTransition(async () => {
        markEmailAsRead('1', ['foo', 'bar']);
        await new Promise(r => (resolve = r));
      });
    });
    assertLog([]);

    // Applied to the committed state, where "Lunch?" is still unread.
    await act(() => removeLabelFromEmail('1', 'bar'));
    assertLog([
      'Foo (2), Bar (0), Baz (1) | Lunch? [Foo] (unread), Quarterly report [Foo] (unread), Weekend plans [Baz] (unread)',
    ]);

    // Rebased in dispatch order: marking it read decrements Foo and Bar, and
    // removing Bar then sees it's read, so Bar isn't decremented again.
    await act(() => resolve());
    assertLog([
      'Foo (1), Bar (0), Baz (1) | Lunch? [Foo], Quarterly report [Foo] (unread), Weekend plans [Baz] (unread)',
    ]);
  });
  // @gate enableStore
  it('replays an update with the other store as of when it was dispatched, when the other store is updated urgently after it', async () => {
    const a = createStore('a0');
    const b = createStore('', (state, action) =>
      action === 'copy a' ? use(a) : state,
    );
    function Reader() {
      return <Text text={'A: ' + use(a) + ', B: ' + use(b)} />;
    }
    const root = ReactNoop.createRoot();
    await act(() => root.render(<Reader />));
    assertLog(['A: a0, B: ']);

    // B's update is part of an async action, so it doesn't commit until the
    // action is done.
    let resolve;
    await act(() => {
      startTransition(async () => {
        b.update('copy a');
        await new Promise(r => (resolve = r));
      });
    });
    assertLog([]);

    // An urgent update to A, dispatched after B's.
    await act(() => a.update('a1'));
    assertLog(['A: a1, B: ']);

    // In dispatch order, B copied A before A's update.
    await act(() => resolve());
    assertLog(['A: a1, B: a0']);
  });

  // @gate enableStore
  it('replays an update with a store no component reads as of when it was dispatched', async () => {
    const a = createStore('a0');
    const b = createStore('', (state, action) =>
      action === 'copy a' ? use(a) : state,
    );
    function Reader() {
      return <Text text={'B: ' + use(b)} />;
    }
    const root = ReactNoop.createRoot();
    await act(() => root.render(<Reader />));
    assertLog(['B: ']);

    let resolve;
    await act(() => {
      startTransition(async () => {
        b.update('copy a');
        await new Promise(r => (resolve = r));
      });
    });
    assertLog([]);

    // Nothing reads A, so its update is applied to its latest value right
    // away.
    a.update('a1');

    await act(() => resolve());
    assertLog(['B: a0']);
  });

  // @gate enableStore
  it('each root replays the update with the other store as of when it was dispatched', async () => {
    const a = createStore('a0');
    const b = createStore('', (state, action) =>
      action === 'copy a' ? use(a) : state,
    );
    function Reader({name}) {
      return <Text text={name + ': A: ' + use(a) + ', B: ' + use(b)} />;
    }
    let setPage;
    function Page() {
      const [page, _setPage] = useState('a');
      setPage = _setPage;
      return <AsyncText text={'Page ' + page} />;
    }
    resolveText('Page a');
    const root1 = ReactNoop.createRoot();
    const root2 = ReactNoop.createRoot();
    await act(() => {
      root1.render(
        <>
          <Reader name="1" />
          <Page />
        </>,
      );
      root2.render(<Reader name="2" />);
    });
    assertLog(['1: A: a0, B: ', 'Page a', '2: A: a0, B: ']);

    // The transition also changes root 1's page, which waits on data, so
    // only root 2 commits it.
    await act(() => {
      startTransition(() => {
        b.update('copy a');
        setPage('b');
      });
    });
    assertLog(['1: A: a0, B: a0', 'Suspend! [Page b]', '2: A: a0, B: a0']);

    // Root 1 also retries the transition, with B's update replayed after
    // A's committed one, but the page still waits on data.
    await act(() => a.update('a1'));
    assertLog([
      '1: A: a1, B: ',
      '2: A: a1, B: a0',
      '1: A: a1, B: a0',
      'Suspend! [Page b]',
    ]);

    // Root 1 replays B's update with A as of when it was dispatched.
    await act(() => resolveText('Page b'));
    assertLog(['1: A: a1, B: a0', 'Page b']);
  });

  // @gate enableStore
  it('defers an update that only throws because it read a store whose earlier update was skipped', async () => {
    const a = createStore('initial');
    const b = createStore('', (state, action) => {
      if (action === 'next') {
        if (use(a) !== 'ready') {
          throw new Error('Not ready');
        }
        return 'next';
      }
      return state;
    });
    function Reader() {
      return <Text text={'A: ' + use(a) + ', B: ' + use(b)} />;
    }
    const root = ReactNoop.createRoot();
    await act(() =>
      root.render(
        <ErrorBoundary>
          <Reader />
        </ErrorBoundary>,
      ),
    );
    assertLog(['A: initial, B: ']);

    let resolve;
    await act(() => {
      startTransition(async () => {
        a.update('ready');
        await new Promise(r => (resolve = r));
      });
    });
    assertLog([]);

    // In dispatch order, B's update comes after A's and is valid. The urgent
    // render skips A's update, so B's would throw. It's deferred instead.
    await act(() => b.update('next'));
    assertLog([]);

    await act(() => resolve());
    assertLog(['A: ready, B: next']);
  });

  // @gate enableStore
  it('does not run the reducer of a store whose reducer reads no other store again when a transition commits', async () => {
    let reducerCalls = 0;
    const x = createStore(0);
    const y = createStore(0, (state, action) => {
      reducerCalls++;
      return state + action;
    });
    function Reader() {
      return <Text text={'X: ' + use(x) + ', Y: ' + use(y)} />;
    }
    const root = ReactNoop.createRoot();
    await act(() => root.render(<Reader />));
    assertLog(['X: 0, Y: 0']);

    let resolve;
    await act(() => {
      startTransition(async () => {
        x.update(1);
        await new Promise(r => (resolve = r));
      });
    });
    assertLog([]);

    // Y's reducer reads no other store, so its updates don't depend on X's
    // pending transition. Like useReducer, it runs once per update. (The
    // second update has no eager state, so the reducer runs in render.)
    reducerCalls = 0;
    await act(() => {
      y.update(1);
      y.update(10);
    });
    assertLog(['X: 0, Y: 11']);
    await act(() => resolve());
    assertLog(['X: 1, Y: 11']);
    expect(reducerCalls).toBe(2);
  });
  // @gate enableStore
  it('limitation: an update to the other store before any render has run the reader reducer is not kept', async () => {
    const a = createStore('a0');
    const b = createStore('', (state, action) =>
      action === 'copy a' ? use(a) : action,
    );
    function Reader() {
      return <Text text={'B: ' + use(b)} />;
    }
    const root = ReactNoop.createRoot();
    await act(() => root.render(<Reader />));
    assertLog(['B: ']);

    let resolve;
    await act(() => {
      startTransition(async () => {
        // The first update gets an eager state, which doesn't read A. The
        // second has none, because the queue isn't empty.
        b.update('first');
        b.update('copy a');
        await new Promise(r => (resolve = r));
      });
      // Before any render runs B's reducer, nothing knows that it reads A,
      // so A's update is applied to its latest value without keeping the
      // value from before it.
      a.update('a1');
    });
    assertLog([]);

    // In dispatch order, B should copy 'a0'. The replay reads 'a1'. Once a
    // reducer has read A, later updates rebase correctly (see the tests
    // above).
    await act(() => resolve());
    assertLog(['B: a1']);
  });
});
