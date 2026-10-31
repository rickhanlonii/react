/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 * @jest-environment node
 */

/* eslint-disable no-func-assign */

'use strict';

// The context cases of ReactMemo-test.js, with context replaced by
// `use(store)`. See "Context copies" in docs/use-store/COPY_RULES.md.

let React;
let ReactNoop;
let Suspense;
let Scheduler;
let act;
let waitForAll;
let assertLog;
let use;
let createStore;

describe('memo', () => {
  beforeEach(() => {
    jest.resetModules();

    React = require('react');
    ReactNoop = require('react-noop-renderer');
    Scheduler = require('scheduler');
    act = require('internal-test-utils').act;
    ({Suspense} = React);
    use = React.use;
    createStore = React.unstable_createStore;

    const InternalTestUtils = require('internal-test-utils');
    waitForAll = InternalTestUtils.waitForAll;
    assertLog = InternalTestUtils.assertLog;
  });

  function Text(props) {
    Scheduler.log(props.text);
    return <span prop={props.text} />;
  }

  async function fakeImport(result) {
    return {default: result};
  }

  // Tests should run against both the lazy and non-lazy versions of `memo`.
  // To make the tests work for both versions, we wrap the non-lazy version in
  // a lazy function component.
  sharedTests('normal', (...args) => {
    const Memo = React.memo(...args);
    function Indirection(props) {
      return <Memo {...props} />;
    }
    return React.lazy(() => fakeImport(Indirection));
  });
  sharedTests('lazy', (...args) => {
    const Memo = React.memo(...args);
    return React.lazy(() => fakeImport(Memo));
  });

  function sharedTests(label, memo) {
    describe(`${label}`, () => {
      // @gate enableStore
      it("does not bail out if there's a context change", async () => {
        const countStore = createStore(0);

        function Counter(props) {
          const count = use(countStore);
          return <Text text={`${props.label}: ${count}`} />;
        }
        Counter = memo(Counter);

        class Parent extends React.Component {
          state = {count: 0};
          render() {
            return (
              <Suspense fallback={<Text text="Loading..." />}>
                <Counter label="Count" />
              </Suspense>
            );
          }
        }

        const parent = React.createRef(null);
        await act(() => ReactNoop.render(<Parent ref={parent} />));
        assertLog(['Loading...', 'Count: 0']);
        expect(ReactNoop).toMatchRenderedOutput(<span prop="Count: 0" />);

        // Should bail out because props have not changed
        ReactNoop.render(<Parent ref={parent} />);
        await waitForAll([]);
        expect(ReactNoop).toMatchRenderedOutput(<span prop="Count: 0" />);

        // Should update because there was a context change. Parent's state
        // still re-renders it, so the update has to get past memo's bailout,
        // and the value it provided is updated in the store.
        parent.current.setState({count: 1});
        countStore.update(1);
        await waitForAll(['Count: 1']);
        expect(ReactNoop).toMatchRenderedOutput(<span prop="Count: 1" />);
      });
    });
  }
});
