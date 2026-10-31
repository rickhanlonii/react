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

// The context cases of ReactFlight-test.js, with context replaced by
// `use(store)`. See "Context copies" in docs/use-store/COPY_RULES.md.

let React;
let ReactServer;
let ReactNoopFlightServer;
let createStore;

describe('ReactFlight', () => {
  beforeEach(() => {
    jest.resetModules();
    jest.mock('react', () => require('react/react.react-server'));
    ReactServer = require('react');
    ReactNoopFlightServer = require('react-noop-renderer/flight-server');
    // This stores the state so we need to preserve it
    const flightModules = require('react-noop-renderer/flight-modules');
    jest.resetModules();
    __unmockReact();
    jest.mock('react-noop-renderer/flight-modules', () => flightModules);
    React = require('react');
    createStore = React.unstable_createStore;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  function clientReference(value) {
    return Object.defineProperties(
      function () {
        throw new Error('Cannot call a client function from the server.');
      },
      {
        $$typeof: {value: Symbol.for('react.client.reference')},
        value: {value: value},
      },
    );
  }

  // @gate enableStore
  it('should error if a context without a client reference is passed to use()', () => {
    const store = createStore();
    function ServerComponent() {
      return ReactServer.use(store);
    }
    const errors = [];
    ReactNoopFlightServer.render(<ServerComponent />, {
      onError(x) {
        errors.push(x.message);
      },
    });
    expect(errors).toEqual([
      // store-semantics: the store version of "Cannot read a Client Context
      // from a Server Component."
      'Cannot read a store from a Server Component.',
    ]);
  });

  // @gate enableStore
  it('should error if a client reference is passed to use()', () => {
    const store = createStore();
    const ClientStore = clientReference(store);
    function ServerComponent() {
      return ReactServer.use(ClientStore);
    }
    const errors = [];
    ReactNoopFlightServer.render(<ServerComponent />, {
      onError(x) {
        errors.push(x.message);
      },
    });
    expect(errors).toEqual([
      // store-semantics: the store version of "Cannot read a Client Context
      // from a Server Component."
      'Cannot read a store from a Server Component.',
    ]);
  });
});
