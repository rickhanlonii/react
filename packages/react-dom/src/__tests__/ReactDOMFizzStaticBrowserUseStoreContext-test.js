/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 * @jest-environment ./scripts/jest/ReactDOMServerIntegrationEnvironment
 */

'use strict';

// The context cases of ReactDOMFizzStaticBrowser-test.js, with context
// replaced by `use(store)`. See "Context copies" in
// docs/use-store/COPY_RULES.md.

import {patchMessageChannel} from '../../../../scripts/jest/patchMessageChannel';

import {
  getVisibleChildren,
  insertNodesAndExecuteScripts,
} from '../test-utils/FizzTestUtils';

// Polyfills for test environment
global.ReadableStream =
  require('web-streams-polyfill/ponyfill/es6').ReadableStream;
global.TextEncoder = require('util').TextEncoder;
global.TextDecoder = require('util').TextDecoder;

let React;
let ReactDOMFizzServer;
let ReactDOMFizzStatic;
let Suspense;
let use;
let createStore;
let container;
let serverAct;

describe('ReactDOMFizzStaticBrowser', () => {
  beforeEach(() => {
    jest.resetModules();

    // We need the mocked version of setTimeout inside the document.
    window.setTimeout = setTimeout;
    window.requestAnimationFrame = setTimeout;

    patchMessageChannel();
    serverAct = require('internal-test-utils').serverAct;

    React = require('react');
    ReactDOMFizzServer = require('react-dom/server.browser');
    ReactDOMFizzStatic = require('react-dom/static.browser');
    Suspense = React.Suspense;
    use = React.use;
    createStore = React.unstable_createStore;
    container = document.createElement('div');
    document.body.appendChild(container);
  });

  afterEach(() => {
    if (typeof global.window.__restoreGlobalScope === 'function') {
      global.window.__restoreGlobalScope();
    }
    document.body.removeChild(container);
  });

  async function readIntoContainer(stream) {
    const reader = stream.getReader();
    let result = '';
    while (true) {
      const {done, value} = await reader.read();
      if (done) {
        break;
      }
      result += Buffer.from(value).toString('utf8');
    }
    const temp = document.createElement('div');
    temp.innerHTML = result;
    await insertNodesAndExecuteScripts(temp, container, null);
    jest.runAllTimers();
  }

  // @gate enableStore
  it('keeps static children but discards user code results after a synchronous abort', async () => {
    const controller = new AbortController();
    // The context has no Provider, so its default value is the store's
    // initial value. A Context.Consumer becomes a function component that
    // reads the store and calls its render prop.
    const store = createStore(null);
    function Consumer({children}) {
      return children(use(store));
    }
    let prerendering = true;
    let hostCoercions = 0;

    function Abort() {
      if (prerendering) {
        controller.abort('prerender abort');
      }
      return 'Abort';
    }

    function Later() {
      return prerendering ? 'Too early' : 'Later';
    }

    function Content() {
      const iterable = {
        [Symbol.iterator]() {
          let done = false;
          return {
            next() {
              if (done) {
                return {done: true};
              }
              done = true;
              return {
                done: false,
                value: prerendering ? 'Iterable too early' : 'Iterable',
              };
            },
          };
        },
      };
      const thenable = {
        then(resolve) {
          resolve(prerendering ? 'Thenable too early' : 'Thenable');
        },
      };
      const children = [
        <Abort key="abort" />,
        'Middle',
        <span
          key="host"
          title={{
            toString() {
              hostCoercions++;
              return 'host';
            },
          }}>
          Host
        </span>,
        <Later key="later" />,
        <Consumer key="consumer">
          {() => (prerendering ? 'Consumer too early' : 'Consumer')}
        </Consumer>,
        iterable,
        thenable,
      ];
      return <section>{children}</section>;
    }

    function App() {
      return (
        <div>
          <Suspense fallback="Loading...">
            <Content />
          </Suspense>
        </div>
      );
    }

    let pendingResult;
    await serverAct(() => {
      pendingResult = ReactDOMFizzStatic.prerender(<App />, {
        signal: controller.signal,
        onError() {},
      });
    });
    const prerendered = await pendingResult;

    expect(hostCoercions).toBeGreaterThan(0);
    expect(prerendered.postponed).not.toBe(null);
    await readIntoContainer(prerendered.prelude);
    expect(container.innerHTML.toLowerCase()).not.toContain('too early');
    expect(getVisibleChildren(container)).toEqual(<div>Loading...</div>);

    prerendering = false;
    const resumed = await serverAct(() =>
      ReactDOMFizzServer.resume(
        <App />,
        JSON.parse(JSON.stringify(prerendered.postponed)),
      ),
    );
    await readIntoContainer(resumed);
    expect(getVisibleChildren(container)).toEqual(
      <div>
        <section>
          {[
            'Abort',
            'Middle',
            <span title="host">Host</span>,
            'Later',
            'Consumer',
            'Iterable',
            'Thenable',
          ]}
        </section>
      </div>,
    );
  });
});
