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
let ReactNoop;
let createStore;

describe('arity', () => {
  beforeEach(() => {
    jest.resetModules();

    React = require('react');
    ReactNoop = require('react-noop-renderer');
    createStore = React.unstable_createStore;
  });

  // @gate enableStore
  it("ensure useState setter's arity is correct", () => {
    const store = createStore(() => 'Halo!');
    function Component() {
      React.use(store);
      expect(store.update.length).toBe(1);
      return null;
    }

    ReactNoop.render(<Component />);
  });

  // @gate enableStore
  it("ensure useReducer setter's arity is correct", () => {
    const store = createStore(undefined, () => 'Halo!');
    function Component() {
      React.use(store);
      expect(store.update.length).toBe(1);
      return null;
    }

    ReactNoop.render(<Component />);
  });
});
