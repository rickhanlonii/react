/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 */
'use strict';

// Known correctness bugs in use(store). Each test asserts the correct behavior
// and fails until the bug is fixed. Once a test passes, move it to
// ReactUseStore-test.js.

let React;
let Scheduler;
let act;
let use;
let useState;
let startTransition;
let assertLog;
let createStore;

const originalReportError = global.reportError;

describe('TODOCorrectnessUseStore', () => {
  function setUpReact() {
    React = require('react');
    Scheduler = require('scheduler');
    act = require('internal-test-utils').act;
    use = React.use;
    useState = React.useState;
    startTransition = React.startTransition;
    createStore = React.unstable_createStore;
    assertLog = require('internal-test-utils').assertLog;
  }

  function Text({text}) {
    Scheduler.log(text);
    return text;
  }

  describe('noop', () => {
    let ReactNoop;

    beforeEach(() => {
      jest.resetModules();
      global.reportError = originalReportError;
      setUpReact();
      ReactNoop = require('react-noop-renderer');
    });

    afterEach(() => {
      global.reportError = originalReportError;
    });

    // @gate enableStore && TODO
    it('a transition still commits when its only reader unmounts in a root render before it renders', async () => {
      const store = createStore(0);

      function Reader() {
        return <Text text={'Reader: ' + use(store)} />;
      }

      function App({show}) {
        return show ? <Reader /> : <Text text="Nothing" />;
      }

      const root = ReactNoop.createRoot();
      await act(() => {
        root.render(<App show={true} />);
      });
      assertLog(['Reader: 0']);

      await act(() => {
        startTransition(() => {
          store.update(1);
        });
        // Unmount the reader in an update to the root, before the transition
        // renders.
        ReactNoop.flushSync(() => {
          root.render(<App show={false} />);
        });
        assertLog(['Nothing']);
      });

      // The transition committed, so the record has no pending updates, and
      // nothing reads it, so it was dropped.
      expect(store._headQueue).toBe(null);
      expect(store._records.length).toBe(0);

      // A new reader reads the committed value.
      await act(() => {
        root.render(<App show={true} />);
      });
      assertLog(['Reader: 1']);
      expect(root).toMatchRenderedOutput('Reader: 1');
    });

    // @gate enableStore && TODO
    it('a store update with no readers commits even when the root renders an unrelated update first', async () => {
      const store = createStore(0);

      function Reader() {
        return <Text text={'Reader: ' + use(store)} />;
      }

      let setShow, setTab;
      function App() {
        const [show, _setShow] = useState(true);
        const [tab, _setTab] = useState('a');
        setShow = _setShow;
        setTab = _setTab;
        return (
          <>
            <Text text={'Tab: ' + tab} />
            {show && <Reader />}
          </>
        );
      }

      const root = ReactNoop.createRoot();
      await act(() => {
        root.render(<App />);
      });
      assertLog(['Tab: a', 'Reader: 0']);

      await act(() => {
        startTransition(() => {
          store.update(1);
          setTab('b');
        });
        // Unmount the only reader while the transition is pending. The record
        // is kept, because it has a pending update.
        ReactNoop.flushSync(() => setShow(false));
        assertLog(['Tab: a']);
        expect(store._records.length).toBe(1);
        expect(store._records[0].readers.size).toBe(0);

        // Nothing reads the store, so this update is scheduled on the root.
        // It's in a lane that isn't rendered with the sync lane, and isn't a
        // transition, so it doesn't get entangled with the pending one.
        ReactNoop.idleUpdates(() => {
          store.update(2);
        });
        // Then the root renders an update in a different lane.
        ReactNoop.flushSync(() => {
          root.render(<App />);
        });
        assertLog(['Tab: a']);
      });
      assertLog(['Tab: b']);

      // Both updates committed, so the record has no pending updates, and
      // nothing reads it, so it was dropped.
      expect(store._headQueue).toBe(null);
      expect(store._records.length).toBe(0);

      await act(() => {
        setShow(true);
      });
      assertLog(['Tab: b', 'Reader: 2']);
    });

    // Found by the port of the react-concurrent-store tests
    // (ReactUseStorePonyfill-test.js, "Does not miss sync updates triggered in
    // useEffect or useLayoutEffect during a long-running transition").
    // @gate enableStore && TODO
    it('a reader that mounts urgently does not see a transition update to a store no root read yet', async () => {
      const store = createStore(1);

      function Reader() {
        return <Text text={'Reader: ' + use(store)} />;
      }

      let setShow;
      function App() {
        const [show, _setShow] = useState(false);
        setShow = _setShow;
        return show ? <Reader /> : <Text text="Nothing" />;
      }

      const root = ReactNoop.createRoot();
      await act(() => {
        root.render(<App />);
      });
      assertLog(['Nothing']);
      expect(store._records.length).toBe(0);

      // Nothing reads the store yet, so no root has a copy of it.
      let resolve;
      await act(() => {
        startTransition(async () => {
          store.update(n => n * 2);
          await new Promise(r => (resolve = r));
        });
      });

      // Mount the first reader in an urgent update while the action is
      // pending. Like useReducer, it shouldn't see the transition's update.
      await act(() => {
        ReactNoop.flushSync(() => setShow(true));
      });
      assertLog(['Reader: 1']);
      expect(root).toMatchRenderedOutput('Reader: 1');

      await act(() => resolve());
      assertLog(['Reader: 2']);
      expect(root).toMatchRenderedOutput('Reader: 2');
    });
  });
});
