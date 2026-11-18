'use strict';

// Runs after scripts/jest/setupHostConfigs.js. When PONYFILL_IMPL is set,
// re-mocks 'react' with the adapted React (adapter.js) and, for the
// experimental ponyfill, wraps every root's children in <StoreProvider>.

const fs = require('fs');

const impl = process.env.PONYFILL_IMPL;

function resolveReactEntry() {
  // Same pick as resolveEntryFork in scripts/jest/setupHostConfigs.js for the
  // OSS channels.
  const base = require.resolve('react');
  const forked = base.replace(
    '.js',
    __EXPERIMENTAL__ ? '.experimental.js' : '.stable.js'
  );
  const candidates = [
    __DEV__ && forked.replace('.js', '.development.js'),
    forked,
    __DEV__ && base.replace('.js', '.development.js'),
    base,
  ].filter(Boolean);
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) {
      return candidate;
    }
  }
  return base;
}

function withOverrides(actual, overrides) {
  const result = {};
  for (const key of Object.keys(actual)) {
    if (!(key in overrides)) {
      Object.defineProperty(result, key, {
        enumerable: true,
        configurable: true,
        get: () => actual[key],
      });
    }
  }
  return Object.assign(result, overrides);
}

if (impl) {
  if (impl !== 'experimental' && impl !== 'stable') {
    throw new Error('PONYFILL_IMPL must be "experimental" or "stable"');
  }
  if (global.__WWW__ || global.__XPLAT__) {
    throw new Error('The ponyfill adapter only supports the OSS channels.');
  }
  const entry = resolveReactEntry();
  jest.mock('react', () => {
    const RealReact = jest.requireActual(entry);
    return require('./adapter').createAdaptedReact(RealReact, impl);
  });

  if (impl === 'experimental') {
    jest.mock('react-reconciler/src/ReactFiberReconciler', () => {
      const actual = jest.requireActual(
        'react-reconciler/src/ReactFiberReconciler'
      );
      const React = require('react');
      const {StoreProvider} = React.__ponyfill.ponyfill;
      function wrap(children) {
        if (children === null || children === undefined) {
          // Unmount: keep it an unmount.
          return children;
        }
        // Wrap inside a top-level <StrictMode>: in DEV, React only double
        // invokes the effects of a newly placed tree if its topmost placed
        // fiber is in StrictMode, so a non-strict wrapper above <StrictMode>
        // would turn off strict effects on mount.
        if (
          React.isValidElement(children) &&
          children.type === React.StrictMode
        ) {
          return React.cloneElement(
            children,
            undefined,
            wrap(children.props.children)
          );
        }
        // StoreProvider renders [<CommitTracker />, children], so wrap the
        // children in a Fragment: switching between one child and an array
        // would otherwise change the type of that slot and remount the tree,
        // which doesn't happen at the root.
        return React.createElement(
          StoreProvider,
          null,
          React.createElement(React.Fragment, null, children)
        );
      }
      // Forward lazily: ReactFiberReconciler is part of an import cycle, so
      // its exports aren't initialized yet when this factory runs.
      return withOverrides(actual, {
        updateContainer(element, ...rest) {
          return actual.updateContainer(wrap(element), ...rest);
        },
        updateContainerSync(element, ...rest) {
          return actual.updateContainerSync(wrap(element), ...rest);
        },
        createHydrationContainer(initialChildren, ...rest) {
          return actual.createHydrationContainer(
            wrap(initialChildren),
            ...rest
          );
        },
      });
    });

    // Server rendering (used to produce HTML for hydration tests): wrap the
    // Fizz request's children too, so the client tree matches. The server
    // uses a separate ponyfill instance (see adapter.js).
    jest.mock('react-server/src/ReactFizzHooks', () => {
      const actual = jest.requireActual('react-server/src/ReactFizzHooks');
      global.__ponyfillCompatFizzDispatchers =
        global.__ponyfillCompatFizzDispatchers || new WeakSet();
      global.__ponyfillCompatFizzDispatchers.add(actual.HooksDispatcher);
      return actual;
    });
    jest.mock('react-server/src/ReactFizzServer', () => {
      const actual = jest.requireActual('react-server/src/ReactFizzServer');
      const React = require('react');
      if (!React.__ponyfill) {
        // 'react' is the react-server build here (react-markup's server
        // tests), which the adapter doesn't patch.
        return actual;
      }
      const {StoreProvider} = React.__ponyfill.serverPonyfill;
      const overrides = {};
      for (const name of [
        'createRequest',
        'createPrerenderRequest',
        'resumeRequest',
        'resumeAndPrerenderRequest',
      ]) {
        overrides[name] = (children, ...rest) =>
          actual[name](
            children == null
              ? children
              : React.createElement(StoreProvider, null, children),
            ...rest
          );
      }
      return withOverrides(actual, overrides);
    });

    // The wrapper adds a StoreProvider frame at the bottom of every
    // component stack. Remove it, so assertions on stacks aren't affected.
    const stripFrames = stack =>
      typeof stack === 'string'
        ? stack.replace(/\n\s+(at|in) StoreProvider\b[^\n]*/g, '')
        : stack;
    const stripModule = (path, names) => {
      jest.mock(path, () => {
        const actual = jest.requireActual(path);
        const overrides = {};
        for (const name of names) {
          overrides[name] = (...args) => stripFrames(actual[name](...args));
        }
        return withOverrides(actual, overrides);
      });
    };
    stripModule('react-reconciler/src/ReactFiberComponentStack', [
      'getStackByFiberInDevAndProd',
      'getOwnerStackByFiberInDev',
    ]);
    stripModule('react-server/src/ReactFizzComponentStack', [
      'getStackByComponentStackNode',
      'getOwnerStackByComponentStackNodeInDev',
    ]);
  }
}
