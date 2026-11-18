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
});
