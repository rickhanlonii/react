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

// The context cases of ReactDOMFizzServerNode-test.js, with context replaced by
// `use(store)`. See "Context copies" in docs/use-store/COPY_RULES.md.

let Stream;
let React;
let ReactDOMFizzServer;
let Suspense;
let act;
let use;
let createStore;

describe('ReactDOMFizzServerNode', () => {
  beforeEach(() => {
    jest.resetModules();
    React = require('react');
    ReactDOMFizzServer = require('react-dom/server');
    Stream = require('stream');
    Suspense = React.Suspense;
    act = require('internal-test-utils').act;
    use = React.use;
    createStore = React.unstable_createStore;
  });

  function getTestWritable() {
    const writable = new Stream.PassThrough();
    writable.setEncoding('utf8');
    const output = {result: '', error: undefined};
    writable.on('data', chunk => {
      output.result += chunk;
    });
    writable.on('error', error => {
      output.error = error;
    });
    const completed = new Promise(resolve => {
      writable.on('finish', () => {
        resolve();
      });
      writable.on('error', () => {
        resolve();
      });
    });
    return {writable, completed, output};
  }

  // @gate enableStore
  it('should be able to get context value when promise resolves', async () => {
    class DelayClient {
      get() {
        if (this.resolved) return this.resolved;
        if (this.pending) return this.pending;
        return (this.pending = new Promise(resolve => {
          setTimeout(() => {
            delete this.pending;
            this.resolved = 'OK';
            resolve();
          }, 500);
        }));
      }
    }

    const Component = () => {
      const client = use(delayStore);
      if (!client) {
        return 'context not found.';
      }
      const result = client.get();
      if (typeof result === 'string') {
        return result;
      }
      throw result;
    };

    const client = new DelayClient();
    // The Provider's value is constant, so it's the store's initial value.
    const delayStore = createStore(client);
    const {writable, output, completed} = getTestWritable();
    await act(() => {
      ReactDOMFizzServer.renderToPipeableStream(
        <div>
          <Suspense fallback="loading">
            <Component />
          </Suspense>
        </div>,
      ).pipe(writable);
    });

    expect(output.error).toBe(undefined);
    expect(output.result).toContain('loading');

    await completed;

    expect(output.error).toBe(undefined);
    expect(output.result).not.toContain('context never found');
    expect(output.result).toContain('OK');
  });

  // @gate enableStore
  it('should be able to pop context after suspending', async () => {
    class DelayClient {
      get() {
        if (this.resolved) return this.resolved;
        if (this.pending) return this.pending;
        return (this.pending = new Promise(resolve => {
          setTimeout(() => {
            delete this.pending;
            this.resolved = 'OK';
            resolve();
          }, 500);
        }));
      }
    }

    const Component = () => {
      const client = use(delayStore);
      if (!client) {
        return 'context not found.';
      }
      const result = client.get();
      if (typeof result === 'string') {
        return result;
      }
      throw result;
    };

    const client = new DelayClient();
    // Both Providers have the same constant value, so it's the store's
    // initial value.
    const delayStore = createStore(client);
    const {writable, output, completed} = getTestWritable();
    await act(() => {
      ReactDOMFizzServer.renderToPipeableStream(
        <div>
          <Suspense fallback="loading">
            <Component />
          </Suspense>
          <Suspense fallback="loading">
            <Component />
          </Suspense>
        </div>,
      ).pipe(writable);
    });

    expect(output.error).toBe(undefined);
    expect(output.result).toContain('loading');

    await completed;

    expect(output.error).toBe(undefined);
    expect(output.result).not.toContain('context never found');
    expect(output.result).toContain('OK');
  });
});
