/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

// Cases that use stores are marked `@reactVersion >= 19.3` instead of
// `@gate enableStore`, so DevTools regression runs against older versions of
// React skip them. (A @gate pragma would override @reactVersion.)

// Note that this test uses React components declared in the "__source__" directory.
// This is done to control if and how the code is transformed at runtime.
// Do not declare test components within this test file as it is very fragile.

function expectHookNamesToEqual(map, expectedNamesArray) {
  // Slightly hacky since it relies on the iterable order of values()
  expect(Array.from(map.values())).toEqual(expectedNamesArray);
}

function requireText(path, encoding) {
  const {existsSync, readFileSync} = require('fs');
  if (existsSync(path)) {
    return Promise.resolve(readFileSync(path, encoding));
  } else {
    return Promise.reject(`File not found "${path}"`);
  }
}

function initFetchMock() {
  const fetchMock = require('jest-fetch-mock');
  fetchMock.enableMocks();
  fetchMock.mockIf(/.+$/, request => {
    const url = request.url;
    const isLoadingExternalSourceMap = /external\/.*\.map/.test(url);
    if (isLoadingExternalSourceMap) {
      // Assert that url contains correct query params
      expect(url.includes('?foo=bar&param=some_value')).toBe(true);
      const fileSystemPath = url.split('?')[0];
      return requireText(fileSystemPath, 'utf8');
    }
    return requireText(url, 'utf8');
  });
  return fetchMock;
}

describe('parseHookNames', () => {
  let fetchMock;
  let inspectHooks;
  let parseHookNames;

  beforeEach(() => {
    jest.resetModules();

    jest.mock('source-map-support', () => {
      console.trace('source-map-support');
    });

    fetchMock = initFetchMock();

    inspectHooks =
      require('react-debug-tools/src/ReactDebugHooks').inspectHooks;

    // Jest can't run the workerized version of this module.
    const {
      flattenHooksList,
      loadSourceAndMetadata,
    } = require('../parseHookNames/loadSourceAndMetadata');
    const parseSourceAndMetadata =
      require('../parseHookNames/parseSourceAndMetadata').parseSourceAndMetadata;
    parseHookNames = async hooksTree => {
      const hooksList = flattenHooksList(hooksTree);

      // Runs in the UI thread so it can share Network cache:
      const locationKeyToHookSourceAndMetadata =
        await loadSourceAndMetadata(hooksList);

      // Runs in a Worker because it's CPU intensive:
      return parseSourceAndMetadata(
        hooksList,
        locationKeyToHookSourceAndMetadata,
      );
    };

    // Jest (jest-runner?) configures Errors to automatically account for source maps.
    // This changes behavior between our tests and the browser.
    // Ideally we would clear the prepareStackTrace() method on the Error object,
    // but Node falls back to looking for it on the main context's Error constructor,
    // which may still be patched.
    // To ensure we get the default behavior, override prepareStackTrace ourselves.
    // NOTE: prepareStackTrace is called from the error.stack getter, but the getter
    // has a recursion breaker which falls back to the default behavior.
    Error.prepareStackTrace = (error, trace) => {
      return error.stack;
    };
  });

  afterEach(() => {
    fetch.resetMocks();
  });

  async function getHookNamesForComponent(Component, props = {}) {
    const hooksTree = inspectHooks(Component, props, undefined);
    const hookNames = await parseHookNames(hooksTree);
    return hookNames;
  }

  // @reactVersion >= 19.3
  it('should parse names for useState()', async () => {
    const Component =
      require('./__source__/__untransformed__/ComponentWithUseStore').Component;
    const hookNames = await getHookNamesForComponent(Component);
    // store-semantics: DevTools only names hooks whose callee matches
    // /^use[A-Z0-9]/, so use(store) isn't named, the same as use(context).
    expectHookNamesToEqual(hookNames, [null, null, null, null]);
  });

  // @reactVersion >= 19.3
  it('should parse names for useReducer()', async () => {
    const Component =
      require('./__source__/__untransformed__/ComponentWithUseReducerUseStore').Component;
    const hookNames = await getHookNamesForComponent(Component);
    // store-semantics: DevTools only names hooks whose callee matches
    // /^use[A-Z0-9]/, so use(store) isn't named, the same as use(context).
    expectHookNamesToEqual(hookNames, [null, null, null]);
  });

  it('should skip loading source files for unnamed hooks like useEffect', async () => {
    const Component =
      require('./__source__/__untransformed__/ComponentWithUseEffect').Component;

    // Since this component contains only unnamed hooks, the source code should not even be loaded.
    fetchMock.mockIf(/.+$/, request => {
      throw Error(`Unexpected file request for "${request.url}"`);
    });

    const hookNames = await getHookNamesForComponent(Component);
    expectHookNamesToEqual(hookNames, []); // No hooks with names
  });

  // @reactVersion >= 19.3
  it('should skip loading source files for unnamed hooks like useEffect (alternate)', async () => {
    const Component =
      require('./__source__/__untransformed__/ComponentWithExternalUseEffectUseStore').Component;

    fetchMock.mockIf(/.+$/, request => {
      // Since the custom hook contains only unnamed hooks, the source code should not be loaded.
      if (request.url.endsWith('useCustom.js')) {
        throw Error(`Unexpected file request for "${request.url}"`);
      }
      return requireText(request.url, 'utf8');
    });

    const hookNames = await getHookNamesForComponent(Component);
    // store-semantics: DevTools only names hooks whose callee matches
    // /^use[A-Z0-9]/, so use(store) isn't named, the same as use(context).
    expectHookNamesToEqual(hookNames, [null, null]); // No hooks with names
  });

  // @reactVersion >= 19.3
  it('should parse names for custom hooks', async () => {
    const Component =
      require('./__source__/__untransformed__/ComponentWithNamedCustomHooksUseStore').Component;
    const hookNames = await getHookNamesForComponent(Component);
    expectHookNamesToEqual(hookNames, [
      'foo',
      null, // Custom hooks can have names, but not when using destructuring.
      // store-semantics: DevTools only names hooks whose callee matches
      // /^use[A-Z0-9]/, so use(store) isn't named, the same as use(context).
      null,
    ]);
  });

  // @reactVersion >= 19.3
  it('should parse names for code using hooks indirectly', async () => {
    const Component =
      require('./__source__/__untransformed__/ComponentUsingHooksIndirectlyUseStore').Component;
    const hookNames = await getHookNamesForComponent(Component);
    // store-semantics: DevTools only names hooks whose callee matches
    // /^use[A-Z0-9]/, so use(store) isn't named, the same as use(context).
    expectHookNamesToEqual(hookNames, [null, 'darkMode', null]);
  });

  // @reactVersion >= 19.3
  it('should parse names for code using nested hooks', async () => {
    const Component =
      require('./__source__/__untransformed__/ComponentWithNestedHooksUseStore').Component;
    let InnerComponent;
    const hookNames = await getHookNamesForComponent(Component, {
      callback: innerComponent => {
        InnerComponent = innerComponent;
      },
    });
    const innerHookNames = await getHookNamesForComponent(InnerComponent);
    expectHookNamesToEqual(hookNames, ['InnerComponent']);
    // store-semantics: DevTools only names hooks whose callee matches
    // /^use[A-Z0-9]/, so use(store) isn't named, the same as use(context).
    expectHookNamesToEqual(innerHookNames, [null]);
  });

  it('should return null for custom hooks without explicit names', async () => {
    const Component =
      require('./__source__/__untransformed__/ComponentWithUnnamedCustomHooks').Component;
    const hookNames = await getHookNamesForComponent(Component);
    expectHookNamesToEqual(hookNames, [
      null, // Custom hooks can have names, but this one does not even return a value.
      null, // Custom hooks can have names, but not when using destructuring.
      null, // Custom hooks can have names, but not when using destructuring.
    ]);
  });

  // TODO Test that cache purge works

  // TODO Test that cached metadata is purged when Fast Refresh scheduled

  describe('inline, external and bundle source maps', () => {
    // @reactVersion >= 19.3
    it('should work for simple components', async () => {
      async function testFor(path, name = 'Component') {
        const Component = require(path)[name];
        const hookNames = await getHookNamesForComponent(Component);
        expectHookNamesToEqual(hookNames, [
          // store-semantics: DevTools only names hooks whose callee matches
          // /^use[A-Z0-9]/, so use(store) isn't named, the same as use(context).
          null, // use(store)
        ]);
      }

      await testFor('./__source__/ExampleUseStore'); // original source (uncompiled)
      await testFor('./__source__/__compiled__/inline/ExampleUseStore'); // inline source map
      await testFor('./__source__/__compiled__/external/ExampleUseStore'); // external source map
      await testFor(
        './__source__/__compiled__/inline/index-map/ExampleUseStore',
      ); // inline index map source map
      await testFor(
        './__source__/__compiled__/external/index-map/ExampleUseStore',
      ); // external index map source map
      await testFor(
        './__source__/__compiled__/bundle/indexUseStore',
        'ExampleUseStore',
      ); // bundle source map
      await testFor('./__source__/__compiled__/no-columns/ExampleUseStore'); // simulated Webpack 'cheap-module-source-map'
    });

    // @reactVersion >= 19.3
    it('should work with more complex files and components', async () => {
      async function testFor(path, name = undefined) {
        const components = name != null ? require(path)[name] : require(path);

        let hookNames = await getHookNamesForComponent(components.List);
        expectHookNamesToEqual(hookNames, [
          // store-semantics: DevTools only names hooks whose callee matches
          // /^use[A-Z0-9]/, so use(store) isn't named, the same as use(context).
          null, // use(store)
          null, // use(store)
          null, // use(store)
          'handleClick', // useCallback
          'handleKeyPress', // useCallback
          'handleChange', // useCallback
          'removeItem', // useCallback
          'toggleItem', // useCallback
        ]);

        hookNames = await getHookNamesForComponent(components.ListItem, {
          item: {},
        });
        expectHookNamesToEqual(hookNames, [
          'handleDelete', // useCallback
          'handleToggle', // useCallback
        ]);
      }

      await testFor('./__source__/ToDoListUseStore'); // original source (uncompiled)
      await testFor('./__source__/__compiled__/inline/ToDoListUseStore'); // inline source map
      await testFor('./__source__/__compiled__/external/ToDoListUseStore'); // external source map
      await testFor(
        './__source__/__compiled__/inline/index-map/ToDoListUseStore',
      ); // inline index map source map
      await testFor(
        './__source__/__compiled__/external/index-map/ToDoListUseStore',
      ); // external index map source map
      await testFor(
        './__source__/__compiled__/bundle/indexUseStore',
        'ToDoListUseStore',
      ); // bundle source map
      await testFor('./__source__/__compiled__/no-columns/ToDoListUseStore'); // simulated Webpack 'cheap-module-source-map'
    });

    // @reactVersion >= 19.3
    it('should work for custom hook', async () => {
      async function testFor(path, name = 'Component') {
        const Component = require(path)[name];
        const hookNames = await getHookNamesForComponent(Component);
        expectHookNamesToEqual(hookNames, [
          // store-semantics: DevTools only names hooks whose callee matches
          // /^use[A-Z0-9]/, so use(store) isn't named, the same as use(context).
          null, // use(store)
          'isDarkMode', // useIsDarkMode()
          null, // useIsDarkMode -> use(store)
          null, // useFoo()
        ]);
      }

      await testFor('./__source__/ComponentWithCustomHookUseStore'); // original source (uncompiled)
      await testFor(
        './__source__/__compiled__/inline/ComponentWithCustomHookUseStore',
      ); // inline source map
      await testFor(
        './__source__/__compiled__/external/ComponentWithCustomHookUseStore',
      ); // external source map
      await testFor(
        './__source__/__compiled__/inline/index-map/ComponentWithCustomHookUseStore',
      ); // inline index map source map
      await testFor(
        './__source__/__compiled__/external/index-map/ComponentWithCustomHookUseStore',
      ); // external index map source map
      await testFor(
        './__source__/__compiled__/bundle/indexUseStore',
        'ComponentWithCustomHookUseStore',
      ); // bundle source map
      await testFor(
        './__source__/__compiled__/no-columns/ComponentWithCustomHookUseStore',
      ); // simulated Webpack 'cheap-module-source-map'
    });

    // @reactVersion >= 19.3
    it('should work when code is using hooks indirectly', async () => {
      async function testFor(path, name = 'Component') {
        const Component = require(path)[name];
        const hookNames = await getHookNamesForComponent(Component);
        expectHookNamesToEqual(hookNames, [
          // store-semantics: DevTools only names hooks whose callee matches
          // /^use[A-Z0-9]/, so use(store) isn't named, the same as use(context).
          null, // use(store)
          'darkMode', // useDarkMode()
          null, // use(store)
        ]);
      }

      await testFor(
        './__source__/__compiled__/inline/ComponentUsingHooksIndirectlyUseStore',
      ); // inline source map
      await testFor(
        './__source__/__compiled__/external/ComponentUsingHooksIndirectlyUseStore',
      ); // external source map
      await testFor(
        './__source__/__compiled__/inline/index-map/ComponentUsingHooksIndirectlyUseStore',
      ); // inline index map source map
      await testFor(
        './__source__/__compiled__/external/index-map/ComponentUsingHooksIndirectlyUseStore',
      ); // external index map source map
      await testFor(
        './__source__/__compiled__/bundle/indexUseStore',
        'ComponentUsingHooksIndirectlyUseStore',
      ); // bundle source map
      await testFor(
        './__source__/__compiled__/no-columns/ComponentUsingHooksIndirectlyUseStore',
      ); // simulated Webpack 'cheap-module-source-map'
    });

    // @reactVersion >= 19.3
    it('should work when code is using nested hooks', async () => {
      async function testFor(path, name = 'Component') {
        const Component = require(path)[name];
        let InnerComponent;
        const hookNames = await getHookNamesForComponent(Component, {
          callback: innerComponent => {
            InnerComponent = innerComponent;
          },
        });
        const innerHookNames = await getHookNamesForComponent(InnerComponent);
        expectHookNamesToEqual(hookNames, [
          'InnerComponent', // useMemo()
        ]);
        expectHookNamesToEqual(innerHookNames, [
          // store-semantics: DevTools only names hooks whose callee matches
          // /^use[A-Z0-9]/, so use(store) isn't named, the same as use(context).
          null, // use(store)
        ]);
      }

      await testFor(
        './__source__/__compiled__/inline/ComponentWithNestedHooksUseStore',
      ); // inline source map
      await testFor(
        './__source__/__compiled__/external/ComponentWithNestedHooksUseStore',
      ); // external source map
      await testFor(
        './__source__/__compiled__/inline/index-map/ComponentWithNestedHooksUseStore',
      ); // inline index map source map
      await testFor(
        './__source__/__compiled__/external/index-map/ComponentWithNestedHooksUseStore',
      ); // external index map source map
      await testFor(
        './__source__/__compiled__/bundle/indexUseStore',
        'ComponentWithNestedHooksUseStore',
      ); // bundle source map
      await testFor(
        './__source__/__compiled__/no-columns/ComponentWithNestedHooksUseStore',
      ); // simulated Webpack 'cheap-module-source-map'
    });

    it('should work for external hooks', async () => {
      async function testFor(path, name = 'Component') {
        const Component = require(path)[name];
        const hookNames = await getHookNamesForComponent(Component);
        expectHookNamesToEqual(hookNames, [
          'theme', // useTheme()
          'theme', // useContext()
        ]);
      }

      // We can't test the uncompiled source here, because it either needs to get transformed,
      // which would break the source mapping, or the import statements will fail.

      await testFor(
        './__source__/__compiled__/inline/ComponentWithExternalCustomHooks',
      ); // inline source map
      await testFor(
        './__source__/__compiled__/external/ComponentWithExternalCustomHooks',
      ); // external source map
      await testFor(
        './__source__/__compiled__/inline/index-map/ComponentWithExternalCustomHooks',
      ); // inline index map source map
      await testFor(
        './__source__/__compiled__/external/index-map/ComponentWithExternalCustomHooks',
      ); // external index map source map
      await testFor(
        './__source__/__compiled__/bundle',
        'ComponentWithExternalCustomHooks',
      ); // bundle source map
      await testFor(
        './__source__/__compiled__/no-columns/ComponentWithExternalCustomHooks',
      ); // simulated Webpack 'cheap-module-source-map'
    });

    it('should work when multiple hooks are on a line', async () => {
      async function testFor(path, name = 'Component') {
        const Component = require(path)[name];
        const hookNames = await getHookNamesForComponent(Component);
        expectHookNamesToEqual(hookNames, [
          'a', // useContext()
          'b', // useContext()
          'c', // useContext()
          'd', // useContext()
        ]);
      }

      await testFor(
        './__source__/__compiled__/inline/ComponentWithMultipleHooksPerLine',
      ); // inline source map
      await testFor(
        './__source__/__compiled__/external/ComponentWithMultipleHooksPerLine',
      ); // external source map
      await testFor(
        './__source__/__compiled__/inline/index-map/ComponentWithMultipleHooksPerLine',
      ); // inline index map source map
      await testFor(
        './__source__/__compiled__/external/index-map/ComponentWithMultipleHooksPerLine',
      ); // external index map source map
      await testFor(
        './__source__/__compiled__/bundle',
        'ComponentWithMultipleHooksPerLine',
      ); // bundle source map

      async function noColumntest(path, name = 'Component') {
        const Component = require(path)[name];
        const hookNames = await getHookNamesForComponent(Component);
        expectHookNamesToEqual(hookNames, [
          'a', // useContext()
          'b', // useContext()
          null, // useContext()
          null, // useContext()
        ]);
      }

      // Note that this test is expected to only match the first two hooks
      // because the 3rd and 4th hook are on the same line,
      // and this type of source map doesn't have column numbers.
      await noColumntest(
        './__source__/__compiled__/no-columns/ComponentWithMultipleHooksPerLine',
      ); // simulated Webpack 'cheap-module-source-map'
    });

    // TODO Inline require (e.g. require("react").useState()) isn't supported yet.
    // Maybe this isn't an important use case to support,
    // since inline requires are most likely to exist in compiled source (if at all).
    // eslint-disable-next-line jest/no-disabled-tests
    it.skip('should work for inline requires', async () => {
      async function testFor(path, name = 'Component') {
        const Component = require(path)[name];
        const hookNames = await getHookNamesForComponent(Component);
        expectHookNamesToEqual(hookNames, [
          // store-semantics: DevTools only names hooks whose callee matches
          // /^use[A-Z0-9]/, so use(store) isn't named, the same as use(context).
          null, // use(store)
        ]);
      }

      await testFor('./__source__/InlineRequireUseStore'); // original source (uncompiled)
      await testFor('./__source__/__compiled__/inline/InlineRequireUseStore'); // inline source map
      await testFor('./__source__/__compiled__/external/InlineRequireUseStore'); // external source map
      await testFor(
        './__source__/__compiled__/inline/index-map/InlineRequireUseStore',
      ); // inline index map source map
      await testFor(
        './__source__/__compiled__/external/index-map/InlineRequireUseStore',
      ); // external index map source map
      await testFor(
        './__source__/__compiled__/bundle/indexUseStore',
        'InlineRequireUseStore',
      ); // bundle source map
      await testFor(
        './__source__/__compiled__/no-columns/InlineRequireUseStore',
      ); // simulated Webpack 'cheap-module-source-map'
    });

    // @reactVersion >= 19.3
    it('should support sources that contain the string "sourceMappingURL="', async () => {
      async function testFor(path, name = 'Component') {
        const Component = require(path)[name];
        const hookNames = await getHookNamesForComponent(Component);
        expectHookNamesToEqual(hookNames, [
          // store-semantics: DevTools only names hooks whose callee matches
          // /^use[A-Z0-9]/, so use(store) isn't named, the same as use(context).
          null, // use(store)
        ]);
      }

      // We expect the inline sourceMappingURL to be invalid in this case; mute the warning.
      console.warn = () => {};

      await testFor('./__source__/ContainingStringSourceMappingURLUseStore'); // original source (uncompiled)
      await testFor(
        './__source__/__compiled__/inline/ContainingStringSourceMappingURLUseStore',
      ); // inline source map
      await testFor(
        './__source__/__compiled__/external/ContainingStringSourceMappingURLUseStore',
      ); // external source map
      await testFor(
        './__source__/__compiled__/inline/index-map/ContainingStringSourceMappingURLUseStore',
      ); // inline index map source map
      await testFor(
        './__source__/__compiled__/external/index-map/ContainingStringSourceMappingURLUseStore',
      ); // external index map source map
      await testFor(
        './__source__/__compiled__/bundle/indexUseStore',
        'ContainingStringSourceMappingURLUseStore',
      ); // bundle source map
      await testFor(
        './__source__/__compiled__/no-columns/ContainingStringSourceMappingURLUseStore',
      ); // simulated Webpack 'cheap-module-source-map'
    });
  });

  describe('extended source maps', () => {
    beforeEach(() => {
      const babelParser = require('@babel/parser');
      const generateHookMapModule = require('../generateHookMap');
      jest.spyOn(babelParser, 'parse');
      jest.spyOn(generateHookMapModule, 'decodeHookMap');
    });

    // @reactVersion >= 19.3
    it('should work for simple components', async () => {
      async function testFor(path, name = 'Component') {
        const Component = require(path)[name];
        const hookNames = await getHookNamesForComponent(Component);
        expectHookNamesToEqual(hookNames, [
          // store-semantics: DevTools only names hooks whose callee matches
          // /^use[A-Z0-9]/, so use(store) isn't named, the same as use(context).
          null, // use(store)
        ]);
        expect(require('@babel/parser').parse).toHaveBeenCalledTimes(0);
        expect(require('../generateHookMap').decodeHookMap).toHaveBeenCalled();
      }

      await testFor(
        './__source__/__compiled__/inline/fb-sources-extended/ExampleUseStore',
      ); // x_facebook_sources extended inline source map
      await testFor(
        './__source__/__compiled__/external/fb-sources-extended/ExampleUseStore',
      ); // x_facebook_sources extended external source map
      await testFor(
        './__source__/__compiled__/inline/react-sources-extended/ExampleUseStore',
      ); // x_react_sources extended inline source map
      await testFor(
        './__source__/__compiled__/external/react-sources-extended/ExampleUseStore',
      ); // x_react_sources extended external source map

      // Using index map format for source maps
      await testFor(
        './__source__/__compiled__/inline/fb-sources-extended/index-map/ExampleUseStore',
      ); // x_facebook_sources extended inline index map source map
      await testFor(
        './__source__/__compiled__/external/fb-sources-extended/index-map/ExampleUseStore',
      ); // x_facebook_sources extended external index map source map
      await testFor(
        './__source__/__compiled__/inline/react-sources-extended/index-map/ExampleUseStore',
      ); // x_react_sources extended inline index map source map
      await testFor(
        './__source__/__compiled__/external/react-sources-extended/index-map/ExampleUseStore',
      ); // x_react_sources extended external index map source map

      // TODO test no-columns and bundle cases with extended source maps
    });

    // @reactVersion >= 19.3
    it('should work with more complex files and components', async () => {
      async function testFor(path, name = undefined) {
        const components = name != null ? require(path)[name] : require(path);

        let hookNames = await getHookNamesForComponent(components.List);
        expectHookNamesToEqual(hookNames, [
          // store-semantics: DevTools only names hooks whose callee matches
          // /^use[A-Z0-9]/, so use(store) isn't named, the same as use(context).
          null, // use(store)
          null, // use(store)
          null, // use(store)
          'handleClick', // useCallback
          'handleKeyPress', // useCallback
          'handleChange', // useCallback
          'removeItem', // useCallback
          'toggleItem', // useCallback
        ]);

        hookNames = await getHookNamesForComponent(components.ListItem, {
          item: {},
        });
        expectHookNamesToEqual(hookNames, [
          'handleDelete', // useCallback
          'handleToggle', // useCallback
        ]);

        expect(require('@babel/parser').parse).toHaveBeenCalledTimes(0);
        expect(require('../generateHookMap').decodeHookMap).toHaveBeenCalled();
      }

      await testFor(
        './__source__/__compiled__/inline/fb-sources-extended/ToDoListUseStore',
      ); // x_facebook_sources extended inline source map
      await testFor(
        './__source__/__compiled__/external/fb-sources-extended/ToDoListUseStore',
      ); // x_facebook_sources extended external source map
      await testFor(
        './__source__/__compiled__/inline/react-sources-extended/ToDoListUseStore',
      ); // x_react_sources extended inline source map
      await testFor(
        './__source__/__compiled__/external/react-sources-extended/ToDoListUseStore',
      ); // x_react_sources extended external source map

      // Using index map format for source maps
      await testFor(
        './__source__/__compiled__/inline/fb-sources-extended/index-map/ToDoListUseStore',
      ); // x_facebook_sources extended inline index map source map
      await testFor(
        './__source__/__compiled__/external/fb-sources-extended/index-map/ToDoListUseStore',
      ); // x_facebook_sources extended external index map source map
      await testFor(
        './__source__/__compiled__/inline/react-sources-extended/index-map/ToDoListUseStore',
      ); // x_react_sources extended inline index map source map
      await testFor(
        './__source__/__compiled__/external/react-sources-extended/index-map/ToDoListUseStore',
      ); // x_react_sources extended external index map source map

      // TODO test no-columns and bundle cases with extended source maps
    });

    // @reactVersion >= 19.3
    it('should work for custom hook', async () => {
      async function testFor(path, name = 'Component') {
        const Component = require(path)[name];
        const hookNames = await getHookNamesForComponent(Component);
        expectHookNamesToEqual(hookNames, [
          // store-semantics: DevTools only names hooks whose callee matches
          // /^use[A-Z0-9]/, so use(store) isn't named, the same as use(context).
          null, // use(store)
          'isDarkMode', // useIsDarkMode()
          null, // useIsDarkMode -> use(store)
          null, // isFoo()
        ]);
        expect(require('@babel/parser').parse).toHaveBeenCalledTimes(0);
        expect(require('../generateHookMap').decodeHookMap).toHaveBeenCalled();
      }

      await testFor(
        './__source__/__compiled__/inline/fb-sources-extended/ComponentWithCustomHookUseStore',
      ); // x_facebook_sources extended inline source map
      await testFor(
        './__source__/__compiled__/external/fb-sources-extended/ComponentWithCustomHookUseStore',
      ); // x_facebook_sources extended external source map
      await testFor(
        './__source__/__compiled__/inline/react-sources-extended/ComponentWithCustomHookUseStore',
      ); // x_react_sources extended inline source map
      await testFor(
        './__source__/__compiled__/external/react-sources-extended/ComponentWithCustomHookUseStore',
      ); // x_react_sources extended external source map

      // Using index map format for source maps
      await testFor(
        './__source__/__compiled__/inline/fb-sources-extended/index-map/ComponentWithCustomHookUseStore',
      ); // x_facebook_sources extended inline index map source map
      await testFor(
        './__source__/__compiled__/external/fb-sources-extended/index-map/ComponentWithCustomHookUseStore',
      ); // x_facebook_sources extended external index map source map
      await testFor(
        './__source__/__compiled__/inline/react-sources-extended/index-map/ComponentWithCustomHookUseStore',
      ); // x_react_sources extended inline index map source map
      await testFor(
        './__source__/__compiled__/external/react-sources-extended/index-map/ComponentWithCustomHookUseStore',
      ); // x_react_sources extended external index map source map

      // TODO test no-columns and bundle cases with extended source maps
    });

    // @reactVersion >= 19.3
    it('should work when code is using hooks indirectly', async () => {
      async function testFor(path, name = 'Component') {
        const Component = require(path)[name];
        const hookNames = await getHookNamesForComponent(Component);
        expectHookNamesToEqual(hookNames, [
          // store-semantics: DevTools only names hooks whose callee matches
          // /^use[A-Z0-9]/, so use(store) isn't named, the same as use(context).
          null, // use(store)
          'darkMode', // useDarkMode()
          null, // use(store)
        ]);
        expect(require('@babel/parser').parse).toHaveBeenCalledTimes(0);
        expect(require('../generateHookMap').decodeHookMap).toHaveBeenCalled();
      }

      await testFor(
        './__source__/__compiled__/inline/fb-sources-extended/ComponentUsingHooksIndirectlyUseStore',
      ); // x_facebook_sources extended inline source map
      await testFor(
        './__source__/__compiled__/external/fb-sources-extended/ComponentUsingHooksIndirectlyUseStore',
      ); // x_facebook_sources extended external source map
      await testFor(
        './__source__/__compiled__/inline/react-sources-extended/ComponentUsingHooksIndirectlyUseStore',
      ); // x_react_sources extended inline source map
      await testFor(
        './__source__/__compiled__/external/react-sources-extended/ComponentUsingHooksIndirectlyUseStore',
      ); // x_react_sources extended external source map

      // Using index map format for source maps
      await testFor(
        './__source__/__compiled__/inline/fb-sources-extended/index-map/ComponentUsingHooksIndirectlyUseStore',
      ); // x_facebook_sources extended inline index map source map
      await testFor(
        './__source__/__compiled__/external/fb-sources-extended/index-map/ComponentUsingHooksIndirectlyUseStore',
      ); // x_facebook_sources extended external index map source map
      await testFor(
        './__source__/__compiled__/inline/react-sources-extended/index-map/ComponentUsingHooksIndirectlyUseStore',
      ); // x_react_sources extended inline index map source map
      await testFor(
        './__source__/__compiled__/external/react-sources-extended/index-map/ComponentUsingHooksIndirectlyUseStore',
      ); // x_react_sources extended external index map source map

      // TODO test no-columns and bundle cases with extended source maps
    });

    // @reactVersion >= 19.3
    it('should work when code is using nested hooks', async () => {
      async function testFor(path, name = 'Component') {
        const Component = require(path)[name];
        let InnerComponent;
        const hookNames = await getHookNamesForComponent(Component, {
          callback: innerComponent => {
            InnerComponent = innerComponent;
          },
        });
        const innerHookNames = await getHookNamesForComponent(InnerComponent);
        expectHookNamesToEqual(hookNames, [
          'InnerComponent', // useMemo()
        ]);
        expectHookNamesToEqual(innerHookNames, [
          // store-semantics: The hook map has no entry for use(store), the
          // same as use(context), because DevTools only names hooks whose
          // callee matches /^use[A-Z0-9]/. The call sits inside the useMemo
          // callback, so the hook map lookup falls back to the enclosing
          // useMemo name. Parsing the source instead returns null (see the
          // "inline, external and bundle source maps" version of this case).
          'InnerComponent', // use(store)
        ]);
        expect(require('@babel/parser').parse).toHaveBeenCalledTimes(0);
        expect(require('../generateHookMap').decodeHookMap).toHaveBeenCalled();
      }

      await testFor(
        './__source__/__compiled__/inline/fb-sources-extended/ComponentWithNestedHooksUseStore',
      ); // x_facebook_sources extended inline source map
      await testFor(
        './__source__/__compiled__/external/fb-sources-extended/ComponentWithNestedHooksUseStore',
      ); // x_facebook_sources extended external source map
      await testFor(
        './__source__/__compiled__/inline/react-sources-extended/ComponentWithNestedHooksUseStore',
      ); // x_react_sources extended inline source map
      await testFor(
        './__source__/__compiled__/external/react-sources-extended/ComponentWithNestedHooksUseStore',
      ); // x_react_sources extended external source map

      // Using index map format for source maps
      await testFor(
        './__source__/__compiled__/inline/fb-sources-extended/index-map/ComponentWithNestedHooksUseStore',
      ); // x_facebook_sources extended inline index map source map
      await testFor(
        './__source__/__compiled__/external/fb-sources-extended/index-map/ComponentWithNestedHooksUseStore',
      ); // x_facebook_sources extended external index map source map
      await testFor(
        './__source__/__compiled__/inline/react-sources-extended/index-map/ComponentWithNestedHooksUseStore',
      ); // x_react_sources extended inline index map source map
      await testFor(
        './__source__/__compiled__/external/react-sources-extended/index-map/ComponentWithNestedHooksUseStore',
      ); // x_react_sources extended external index map source map

      // TODO test no-columns and bundle cases with extended source maps
    });

    it('should work for external hooks', async () => {
      async function testFor(path, name = 'Component') {
        const Component = require(path)[name];
        const hookNames = await getHookNamesForComponent(Component);
        expectHookNamesToEqual(hookNames, [
          'theme', // useTheme()
          'theme', // useContext()
        ]);
        expect(require('@babel/parser').parse).toHaveBeenCalledTimes(0);
        expect(require('../generateHookMap').decodeHookMap).toHaveBeenCalled();
      }

      // We can't test the uncompiled source here, because it either needs to get transformed,
      // which would break the source mapping, or the import statements will fail.

      await testFor(
        './__source__/__compiled__/inline/fb-sources-extended/ComponentWithExternalCustomHooks',
      ); // x_facebook_sources extended inline source map
      await testFor(
        './__source__/__compiled__/external/fb-sources-extended/ComponentWithExternalCustomHooks',
      ); // x_facebook_sources extended external source map
      await testFor(
        './__source__/__compiled__/inline/react-sources-extended/ComponentWithExternalCustomHooks',
      ); // x_react_sources extended inline source map
      await testFor(
        './__source__/__compiled__/external/react-sources-extended/ComponentWithExternalCustomHooks',
      ); // x_react_sources extended external source map

      // Using index map format for source maps
      await testFor(
        './__source__/__compiled__/inline/fb-sources-extended/index-map/ComponentWithExternalCustomHooks',
      ); // x_facebook_sources extended inline index map source map
      await testFor(
        './__source__/__compiled__/external/fb-sources-extended/index-map/ComponentWithExternalCustomHooks',
      ); // x_facebook_sources extended external index map source map
      await testFor(
        './__source__/__compiled__/inline/react-sources-extended/index-map/ComponentWithExternalCustomHooks',
      ); // x_react_sources extended inline index map source map
      await testFor(
        './__source__/__compiled__/external/react-sources-extended/index-map/ComponentWithExternalCustomHooks',
      ); // x_react_sources extended external index map source map

      // TODO test no-columns and bundle cases with extended source maps
    });

    it('should work when multiple hooks are on a line', async () => {
      async function testFor(path, name = 'Component') {
        const Component = require(path)[name];
        const hookNames = await getHookNamesForComponent(Component);
        expectHookNamesToEqual(hookNames, [
          'a', // useContext()
          'b', // useContext()
          'c', // useContext()
          'd', // useContext()
        ]);
        expect(require('@babel/parser').parse).toHaveBeenCalledTimes(0);
        expect(require('../generateHookMap').decodeHookMap).toHaveBeenCalled();
      }

      await testFor(
        './__source__/__compiled__/inline/fb-sources-extended/ComponentWithMultipleHooksPerLine',
      ); // x_facebook_sources extended inline source map
      await testFor(
        './__source__/__compiled__/external/fb-sources-extended/ComponentWithMultipleHooksPerLine',
      ); // x_facebook_sources extended external source map
      await testFor(
        './__source__/__compiled__/inline/react-sources-extended/ComponentWithMultipleHooksPerLine',
      ); // x_react_sources extended inline source map
      await testFor(
        './__source__/__compiled__/external/react-sources-extended/ComponentWithMultipleHooksPerLine',
      ); // x_react_sources extended external source map

      // Using index map format for source maps
      await testFor(
        './__source__/__compiled__/inline/fb-sources-extended/index-map/ComponentWithMultipleHooksPerLine',
      ); // x_facebook_sources extended inline index map source map
      await testFor(
        './__source__/__compiled__/external/fb-sources-extended/index-map/ComponentWithMultipleHooksPerLine',
      ); // x_facebook_sources extended external index map source map
      await testFor(
        './__source__/__compiled__/inline/react-sources-extended/index-map/ComponentWithMultipleHooksPerLine',
      ); // x_react_sources extended inline index map source map
      await testFor(
        './__source__/__compiled__/external/react-sources-extended/index-map/ComponentWithMultipleHooksPerLine',
      ); // x_react_sources extended external index map source map

      // TODO test no-columns and bundle cases with extended source maps
    });

    // TODO Inline require (e.g. require("react").useState()) isn't supported yet.
    // Maybe this isn't an important use case to support,
    // since inline requires are most likely to exist in compiled source (if at all).
    // eslint-disable-next-line jest/no-disabled-tests
    it.skip('should work for inline requires', async () => {
      async function testFor(path, name = 'Component') {
        const Component = require(path)[name];
        const hookNames = await getHookNamesForComponent(Component);
        expectHookNamesToEqual(hookNames, [
          // store-semantics: DevTools only names hooks whose callee matches
          // /^use[A-Z0-9]/, so use(store) isn't named, the same as use(context).
          null, // use(store)
        ]);
        expect(require('@babel/parser').parse).toHaveBeenCalledTimes(0);
        expect(require('../generateHookMap').decodeHookMap).toHaveBeenCalled();
      }

      await testFor(
        './__source__/__compiled__/inline/fb-sources-extended/InlineRequireUseStore',
      ); // x_facebook_sources extended inline source map
      await testFor(
        './__source__/__compiled__/external/fb-sources-extended/InlineRequireUseStore',
      ); // x_facebook_sources extended external source map
      await testFor(
        './__source__/__compiled__/inline/react-sources-extended/InlineRequireUseStore',
      ); // x_react_sources extended inline source map
      await testFor(
        './__source__/__compiled__/external/react-sources-extended/InlineRequireUseStore',
      ); // x_react_sources extended external source map

      // Using index map format for source maps
      await testFor(
        './__source__/__compiled__/inline/fb-sources-extended/index-map/InlineRequireUseStore',
      ); // x_facebook_sources extended inline index map source map
      await testFor(
        './__source__/__compiled__/external/fb-sources-extended/index-map/InlineRequireUseStore',
      ); // x_facebook_sources extended external index map source map
      await testFor(
        './__source__/__compiled__/inline/react-sources-extended/index-map/InlineRequireUseStore',
      ); // x_react_sources extended inline index map source map
      await testFor(
        './__source__/__compiled__/external/react-sources-extended/index-map/InlineRequireUseStore',
      ); // x_react_sources extended external index map source map

      // TODO test no-columns and bundle cases with extended source maps
    });

    // @reactVersion >= 19.3
    it('should support sources that contain the string "sourceMappingURL="', async () => {
      async function testFor(path, name = 'Component') {
        const Component = require(path)[name];
        const hookNames = await getHookNamesForComponent(Component);
        expectHookNamesToEqual(hookNames, [
          // store-semantics: DevTools only names hooks whose callee matches
          // /^use[A-Z0-9]/, so use(store) isn't named, the same as use(context).
          null, // use(store)
        ]);
        expect(require('@babel/parser').parse).toHaveBeenCalledTimes(0);
        expect(require('../generateHookMap').decodeHookMap).toHaveBeenCalled();
      }

      // We expect the inline sourceMappingURL to be invalid in this case; mute the warning.
      console.warn = () => {};

      await testFor(
        './__source__/__compiled__/inline/fb-sources-extended/ContainingStringSourceMappingURLUseStore',
      ); // x_facebook_sources extended inline source map
      await testFor(
        './__source__/__compiled__/external/fb-sources-extended/ContainingStringSourceMappingURLUseStore',
      ); // x_facebook_sources extended external source map
      await testFor(
        './__source__/__compiled__/inline/react-sources-extended/ContainingStringSourceMappingURLUseStore',
      ); // x_react_sources extended inline source map
      await testFor(
        './__source__/__compiled__/external/react-sources-extended/ContainingStringSourceMappingURLUseStore',
      ); // x_react_sources extended external source map

      // Using index map format for source maps
      await testFor(
        './__source__/__compiled__/inline/fb-sources-extended/index-map/ContainingStringSourceMappingURLUseStore',
      ); // x_facebook_sources extended inline index map source map
      await testFor(
        './__source__/__compiled__/external/fb-sources-extended/index-map/ContainingStringSourceMappingURLUseStore',
      ); // x_facebook_sources extended external index map source map
      await testFor(
        './__source__/__compiled__/inline/react-sources-extended/index-map/ContainingStringSourceMappingURLUseStore',
      ); // x_react_sources extended inline index map source map
      await testFor(
        './__source__/__compiled__/external/react-sources-extended/index-map/ContainingStringSourceMappingURLUseStore',
      ); // x_react_sources extended external index map source map

      // TODO test no-columns and bundle cases with extended source maps
    });
  });
});

describe('parseHookNames worker', () => {
  let inspectHooks;
  let parseHookNames;
  let workerizedParseSourceAndMetadataMock;

  beforeEach(() => {
    window.Worker = undefined;

    workerizedParseSourceAndMetadataMock = jest.fn();

    initFetchMock();

    jest.mock('../parseHookNames/parseSourceAndMetadata.worker.js', () => {
      return {
        __esModule: true,
        default: () => ({
          parseSourceAndMetadata: workerizedParseSourceAndMetadataMock,
        }),
      };
    });

    inspectHooks =
      require('react-debug-tools/src/ReactDebugHooks').inspectHooks;
    parseHookNames = require('../parseHookNames').parseHookNames;
  });

  async function getHookNamesForComponent(Component, props = {}) {
    const hooksTree = inspectHooks(Component, props, undefined);
    const hookNames = await parseHookNames(hooksTree);
    return hookNames;
  }

  // @reactVersion >= 19.3
  it('should use worker', async () => {
    const Component =
      require('./__source__/__untransformed__/ComponentWithUseStore').Component;

    window.Worker = true;

    // Reset module so mocked worker instance can be updated.
    jest.resetModules();
    parseHookNames = require('../parseHookNames').parseHookNames;

    await getHookNamesForComponent(Component);
    expect(workerizedParseSourceAndMetadataMock).toHaveBeenCalledTimes(1);
  });
});
