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

describe('React hooks DevTools integration', () => {
  let React;
  let ReactTestRenderer;
  let act;
  let scheduleUpdate;
  let scheduleRetry;
  let setSuspenseHandler;
  let waitForAll;

  global.IS_REACT_ACT_ENVIRONMENT = true;

  beforeEach(() => {
    global.__REACT_DEVTOOLS_GLOBAL_HOOK__ = {
      inject: injected => {
        scheduleUpdate = injected.scheduleUpdate;
        scheduleRetry = injected.scheduleRetry;
        setSuspenseHandler = injected.setSuspenseHandler;
      },
      supportsFiber: true,
      onCommitFiberRoot: () => {},
      onCommitFiberUnmount: () => {},
    };

    jest.resetModules();

    React = require('react');
    ReactTestRenderer = require('react-test-renderer');

    const InternalTestUtils = require('internal-test-utils');
    waitForAll = InternalTestUtils.waitForAll;

    act = require('internal-test-utils').act;
  });

  it('should support overriding suspense in legacy mode', async () => {
    if (__DEV__) {
      // Lock the first render
      setSuspenseHandler(() => true);
    }

    function MyComponent() {
      return 'Done';
    }
    let renderer;
    await act(() => {
      renderer = ReactTestRenderer.create(
        <div>
          <React.Suspense fallback={'Loading'}>
            <MyComponent />
          </React.Suspense>
        </div>,
        {unstable_isConcurrent: true},
      );
    });
    const fiber = renderer.root._currentFiber().child;
    if (__DEV__) {
      // First render was locked
      expect(renderer.toJSON().children).toEqual(['Loading']);
      await act(() => scheduleUpdate(fiber)); // Re-render
      expect(renderer.toJSON().children).toEqual(['Loading']);

      // Release the lock
      setSuspenseHandler(() => false);
      await act(() => scheduleUpdate(fiber)); // Re-render
      expect(renderer.toJSON().children).toEqual(['Done']);
      await act(() => scheduleUpdate(fiber)); // Re-render
      expect(renderer.toJSON().children).toEqual(['Done']);

      // Lock again
      setSuspenseHandler(() => true);
      await act(() => scheduleUpdate(fiber)); // Re-render
      expect(renderer.toJSON().children).toEqual(['Loading']);

      // Release the lock again
      setSuspenseHandler(() => false);
      await act(() => scheduleUpdate(fiber)); // Re-render
      expect(renderer.toJSON().children).toEqual(['Done']);

      // Ensure it checks specific fibers.
      setSuspenseHandler(f => f === fiber || f === fiber.alternate);
      await act(() => scheduleUpdate(fiber)); // Re-render
      expect(renderer.toJSON().children).toEqual(['Loading']);
      setSuspenseHandler(f => f !== fiber && f !== fiber.alternate);
      await act(() => scheduleUpdate(fiber)); // Re-render
      expect(renderer.toJSON().children).toEqual(['Done']);
    } else {
      expect(renderer.toJSON().children).toEqual(['Done']);
    }
  });

  it('should support overriding suspense in concurrent mode', async () => {
    if (__DEV__) {
      // Lock the first render
      setSuspenseHandler(() => true);
    }

    function MyComponent() {
      return 'Done';
    }

    const renderer = await act(() =>
      ReactTestRenderer.create(
        <div>
          <React.Suspense fallback={'Loading'}>
            <MyComponent />
          </React.Suspense>
        </div>,
        {unstable_isConcurrent: true},
      ),
    );

    await waitForAll([]);
    // Ensure we timeout any suspense time.
    jest.advanceTimersByTime(1000);
    const fiber = renderer.root._currentFiber().child;
    if (__DEV__) {
      // First render was locked
      expect(renderer.toJSON().children).toEqual(['Loading']);
      await act(() => scheduleUpdate(fiber)); // Re-render
      expect(renderer.toJSON().children).toEqual(['Loading']);

      // Release the lock
      setSuspenseHandler(() => false);
      await act(() => scheduleUpdate(fiber)); // Re-render
      expect(renderer.toJSON().children).toEqual(['Done']);
      await act(() => scheduleUpdate(fiber)); // Re-render
      expect(renderer.toJSON().children).toEqual(['Done']);

      // Lock again
      setSuspenseHandler(() => true);
      await act(() => scheduleUpdate(fiber)); // Re-render
      expect(renderer.toJSON().children).toEqual(['Loading']);

      // Release the lock again
      setSuspenseHandler(() => false);
      await act(() => scheduleUpdate(fiber)); // Re-render
      expect(renderer.toJSON().children).toEqual(['Done']);

      // Ensure it checks specific fibers.
      setSuspenseHandler(f => f === fiber || f === fiber.alternate);
      await act(() => scheduleUpdate(fiber)); // Re-render
      expect(renderer.toJSON().children).toEqual(['Loading']);
      setSuspenseHandler(f => f !== fiber && f !== fiber.alternate);
      await act(() => scheduleUpdate(fiber)); // Re-render
      expect(renderer.toJSON().children).toEqual(['Done']);
    } else {
      expect(renderer.toJSON().children).toEqual(['Done']);
    }

    if (scheduleRetry) {
      // Lock again, synchronously
      setSuspenseHandler(() => true);
      await act(() => scheduleUpdate(fiber)); // Re-render
      expect(renderer.toJSON().children).toEqual(['Loading']);

      // Release the lock again but this time using retry lane
      setSuspenseHandler(() => false);
      await act(() => scheduleRetry(fiber)); // Re-render
      expect(renderer.toJSON().children).toEqual(['Done']);
    }
  });
});
