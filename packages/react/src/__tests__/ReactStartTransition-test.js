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
let ReactTestRenderer;
let act;
let assertConsoleWarnDev;
let useState;
let useTransition;

const SUSPICIOUS_NUMBER_OF_FIBERS_UPDATED = 10;

describe('ReactStartTransition', () => {
  beforeEach(() => {
    jest.resetModules();
    React = require('react');
    ReactTestRenderer = require('react-test-renderer');
    ({act, assertConsoleWarnDev} = require('internal-test-utils'));
    useState = React.useState;
    useTransition = React.useTransition;
  });

  it('Warns if a suspicious number of fibers are updated inside startTransition', async () => {
    const subs = new Set();
    const useUserSpaceSubscription = () => {
      const setState = useState(0)[1];
      subs.add(setState);
    };

    let triggerHookTransition;

    const Component = ({level}) => {
      useUserSpaceSubscription();
      if (level === 0) {
        triggerHookTransition = useTransition()[1];
      }
      if (level < SUSPICIOUS_NUMBER_OF_FIBERS_UPDATED) {
        return <Component level={level + 1} />;
      }
      return null;
    };

    await act(() => {
      ReactTestRenderer.create(<Component level={0} />, {
        unstable_isConcurrent: true,
      });
    });

    await act(() => {
      React.startTransition(() => {
        subs.forEach(setState => {
          setState(state => state + 1);
        });
      });
    });
    assertConsoleWarnDev([
      'Detected a large number of updates inside startTransition. ' +
        'If this is due to a subscription please re-write it to use React provided hooks. ' +
        'Otherwise concurrent mode guarantees are off the table.',
    ]);

    await act(() => {
      triggerHookTransition(() => {
        subs.forEach(setState => {
          setState(state => state + 1);
        });
      });
    });
    assertConsoleWarnDev([
      'Detected a large number of updates inside startTransition. ' +
        'If this is due to a subscription please re-write it to use React provided hooks. ' +
        'Otherwise concurrent mode guarantees are off the table.',
    ]);
  });

  describe('use(store)', () => {
    // These cases read a store in place of component state, where the store
    // update path matters to what the case checks.
    let createStore;
    let use;

    beforeEach(() => {
      createStore = React.unstable_createStore;
      use = React.use;
    });

    // @gate enableStore
    it('Warns if a suspicious number of fibers are updated inside startTransition', async () => {
      // Each component has its own state, so each one gets its own store.
      const stores = [];
      for (let i = 0; i <= SUSPICIOUS_NUMBER_OF_FIBERS_UPDATED; i++) {
        stores.push(createStore(0));
      }

      let triggerHookTransition;

      const Component = ({level}) => {
        use(stores[level]);
        if (level === 0) {
          triggerHookTransition = useTransition()[1];
        }
        if (level < SUSPICIOUS_NUMBER_OF_FIBERS_UPDATED) {
          return <Component level={level + 1} />;
        }
        return null;
      };

      await act(() => {
        ReactTestRenderer.create(<Component level={0} />, {
          unstable_isConcurrent: true,
        });
      });

      await act(() => {
        React.startTransition(() => {
          stores.forEach(store => {
            store.update(state => state + 1);
          });
        });
      });
      // store-semantics: store updates don't count toward the "large number of
      // updates inside startTransition" warning, because stores are the React
      // provided primitive that the warning recommends.

      await act(() => {
        triggerHookTransition(() => {
          stores.forEach(store => {
            store.update(state => state + 1);
          });
        });
      });
      // store-semantics: store updates don't count toward the "large number of
      // updates inside startTransition" warning, because stores are the React
      // provided primitive that the warning recommends.
    });
  });
});
