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

// use(store) with two renderers in the same app. This needs its own file: the
// noop renderer's reconciler is isolated at module level, so the test renderer
// and the noop renderer share one copy of React.

const ReactFeatureFlags = require('shared/ReactFeatureFlags');
const React = require('react');
const ReactTestRenderer = require('react-test-renderer');
const InternalTestUtils = require('internal-test-utils');
const waitForAll = InternalTestUtils.waitForAll;
const act = InternalTestUtils.act;

// Isolate the noop renderer's reconciler, so the test renderer and the noop
// renderer are two renderers in the same app. Both share this file's copy of
// React (and its internals), because use(store) goes through the dispatcher of
// the React copy the component calls.
const ReactSharedInternals = require('shared/ReactSharedInternals');
jest.resetModules();
jest.doMock('react', () => React);
jest.doMock('shared/ReactSharedInternals', () => ReactSharedInternals);
const ReactNoop = require('react-noop-renderer');
// The noop renderer's own Scheduler. waitForAll flushes this file's Scheduler,
// which the isolated noop renderer doesn't use.
const NoopScheduler = require('scheduler');
jest.dontMock('react');
jest.dontMock('shared/ReactSharedInternals');

describe('ReactUseStore with multiple renderers', () => {
  beforeEach(() => {
    jest.resetModules();
    ReactFeatureFlags.enableReactTestRendererWarning = false;
  });

  // The store version of 'can concurrently render context with a "primary"
  // renderer' in ReactTestRenderer-test. Each renderer's root gets its own
  // record of the store.
  // @gate enableStore
  it('two renderers that read the same store each get a record of it', async () => {
    const store = React.unstable_createStore(null);
    function Reader() {
      React.use(store);
      return null;
    }
    ReactNoop.render(<Reader />);
    // The root is scheduled in a microtask. Flush it, then flush the noop
    // renderer's own Scheduler.
    await waitForAll([]);
    NoopScheduler.unstable_flushAllWithoutAsserting();
    expect(store._records.length).toBe(1);
    await act(() => {
      ReactTestRenderer.create(<Reader />);
    });
    expect(store._records.length).toBe(2);
  });
});
