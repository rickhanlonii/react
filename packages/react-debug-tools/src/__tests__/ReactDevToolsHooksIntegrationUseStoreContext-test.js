/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 * @jest-environment node
 */

'use strict';

// The context cases of ReactDevToolsHooksIntegration-test.js, with context
// replaced by `use(store)`. See "Context copies" in
// docs/use-store/COPY_RULES.md.

describe('React hooks DevTools integration', () => {
  let React;
  let ReactDebugTools;
  let ReactTestRenderer;
  let act;
  let overrideHookState;
  let createStore;

  global.IS_REACT_ACT_ENVIRONMENT = true;

  beforeEach(() => {
    global.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      inject: injected => {
        overrideHookState = injected.overrideHookState;
      },
      supportsFiber: true,
      onCommitFiberRoot: () => {},
      onCommitFiberUnmount: () => {},
    };

    jest.resetModules();

    React = require('react');
    ReactDebugTools = require('react-debug-tools');
    ReactTestRenderer = require('react-test-renderer');
    createStore = React.unstable_createStore;

    act = require('internal-test-utils').act;
  });

  // This test case is based on an open source bug report:
  // https://github.com/facebookincubator/redux-react-hook/issues/34#issuecomment-466693787
  // @gate enableStore
  it('should handle interleaved stateful hooks (e.g. useState) and non-stateful hooks (e.g. useContext)', async () => {
    const store = createStore(1);

    let setStateFn;
    function useCustomHook() {
      const context = React.use(store);
      const [state, setState] = React.useState({count: context});
      React.useDebugValue(state.count);
      setStateFn = setState;
      return state.count;
    }

    function MyComponent() {
      const count = useCustomHook();
      return <div>count:{count}</div>;
    }

    let renderer;
    await act(() => {
      renderer = ReactTestRenderer.create(<MyComponent />, {
        unstable_isConcurrent: true,
      });
    });
    expect(renderer.toJSON()).toEqual({
      type: 'div',
      props: {},
      children: ['count:', '1'],
    });

    const fiber = renderer.root.findByType(MyComponent)._currentFiber();
    const tree = ReactDebugTools.inspectHooksOfFiber(fiber);
    const stateHook = tree[0].subHooks[1];
    expect(stateHook.isStateEditable).toBe(true);

    if (__DEV__) {
      await act(() => overrideHookState(fiber, stateHook.id, ['count'], 10));
      expect(renderer.toJSON()).toEqual({
        type: 'div',
        props: {},
        children: ['count:', '10'],
      });
      await act(() => setStateFn(state => ({count: state.count + 1})));
      expect(renderer.toJSON()).toEqual({
        type: 'div',
        props: {},
        children: ['count:', '11'],
      });
    }
  });
});
