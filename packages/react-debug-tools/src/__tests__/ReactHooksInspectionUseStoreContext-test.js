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

// The context cases of ReactHooksInspection-test.js, with context replaced by
// `use(store)`. See "Context copies" in docs/use-store/COPY_RULES.md.

let React;
let ReactDebugTools;
let createStore;

function normalizeSourceLoc(tree) {
  tree.forEach(node => {
    if (node.hookSource) {
      node.hookSource.fileName = '**';
      node.hookSource.lineNumber = 0;
      node.hookSource.columnNumber = 0;
    }
    normalizeSourceLoc(node.subHooks);
  });
  return tree;
}

describe('ReactHooksInspection', () => {
  beforeEach(() => {
    jest.resetModules();
    React = require('react');
    ReactDebugTools = require('react-debug-tools');
    createStore = React.unstable_createStore;
  });

  // @gate enableStore
  it('should inspect the default value using the useContext hook', () => {
    const store = createStore('default');
    function Foo(props) {
      const value = React.use(store);
      return <div>{value}</div>;
    }
    const tree = ReactDebugTools.inspectHooks(Foo, {});
    // store-semantics: a store read shows up as a hook named "Store", the way
    // a context read is named after the context ("Context" by default).
    expect(normalizeSourceLoc(tree)).toMatchInlineSnapshot(`
      [
        {
          "debugInfo": null,
          "hookSource": {
            "columnNumber": 0,
            "fileName": "**",
            "functionName": "Foo",
            "lineNumber": 0,
          },
          "id": null,
          "isStateEditable": false,
          "name": "Store",
          "subHooks": [],
          "value": "default",
        },
      ]
    `);
  });

  // @gate enableStore
  it('should inspect use() calls for Promise and Context', async () => {
    const store = createStore('hi');
    const promise = Promise.resolve('world');
    await promise;
    promise.status = 'fulfilled';
    promise.value = 'world';
    promise._debugInfo = [{name: 'Hello'}];

    function useCustom() {
      const value = React.use(promise);
      const [state] = React.useState(value);
      return state;
    }
    function Foo(props) {
      const value1 = React.use(store);
      const value2 = useCustom();
      return (
        <div>
          {value1} {value2}
        </div>
      );
    }
    const tree = ReactDebugTools.inspectHooks(Foo, {});
    // store-semantics: a store read shows up as a hook named "Store", the way
    // a context read is named after the context ("Context" by default).
    expect(normalizeSourceLoc(tree)).toMatchInlineSnapshot(`
      [
        {
          "debugInfo": null,
          "hookSource": {
            "columnNumber": 0,
            "fileName": "**",
            "functionName": "Foo",
            "lineNumber": 0,
          },
          "id": null,
          "isStateEditable": false,
          "name": "Store",
          "subHooks": [],
          "value": "hi",
        },
        {
          "debugInfo": null,
          "hookSource": {
            "columnNumber": 0,
            "fileName": "**",
            "functionName": "Foo",
            "lineNumber": 0,
          },
          "id": null,
          "isStateEditable": false,
          "name": "Custom",
          "subHooks": [
            {
              "debugInfo": [
                {
                  "name": "Hello",
                },
              ],
              "hookSource": {
                "columnNumber": 0,
                "fileName": "**",
                "functionName": "useCustom",
                "lineNumber": 0,
              },
              "id": null,
              "isStateEditable": false,
              "name": "Use",
              "subHooks": [],
              "value": "world",
            },
            {
              "debugInfo": null,
              "hookSource": {
                "columnNumber": 0,
                "fileName": "**",
                "functionName": "useCustom",
                "lineNumber": 0,
              },
              "id": 0,
              "isStateEditable": true,
              "name": "State",
              "subHooks": [],
              "value": "world",
            },
          ],
          "value": undefined,
        },
      ]
    `);
  });
});
