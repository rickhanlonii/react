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
