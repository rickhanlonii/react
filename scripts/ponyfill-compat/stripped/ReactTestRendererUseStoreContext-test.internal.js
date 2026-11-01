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

// The context cases of ReactTestRenderer-test.internal.js, with context
// replaced by `use(store)`. See "Context copies" in
// docs/use-store/COPY_RULES.md.

const ReactFeatureFlags = require('shared/ReactFeatureFlags');
const React = require('react');
const ReactTestRenderer = require('react-test-renderer');
const InternalTestUtils = require('internal-test-utils');
const waitForAll = InternalTestUtils.waitForAll;
const act = InternalTestUtils.act;

// Isolate noop renderer. The original isolates every module, so the noop
// renderer also gets its own copy of React. A store is read with use(store),
// which goes through the dispatcher of the React copy the component calls, so
// both renderers have to share this file's copy of React (and its internals),
// the way two renderers share React in an app. The reconciler is still
// isolated.
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

describe('ReactTestRenderer', () => {
  beforeEach(() => {
    jest.resetModules();
    ReactFeatureFlags.enableReactTestRendererWarning = false;
  });

  // @gate enableStore
  it('can concurrently render context with a "primary" renderer', async () => {
    const store = React.unstable_createStore(null);
    const Indirection = React.Fragment;
    // <Context.Consumer> becomes a function component that reads the store
    // and calls its render prop.
    function Consumer({children}) {
      return children(React.use(store));
    }
    const App = () => (
      <Indirection>
        <Consumer>{() => null}</Consumer>
      </Indirection>
    );
    ReactNoop.render(<App />);
    await waitForAll([]);
    // store-semantics: in the original, waitForAll flushes this file's
    // Scheduler, not the isolated noop renderer's, so the noop render never
    // runs and only the test renderer renders the context. Flush the noop
    // renderer's Scheduler, so that both renderers read the store.
    NoopScheduler.unstable_flushAllWithoutAsserting();
    await act(() => {
      ReactTestRenderer.create(<App />);
    });
  });
});
