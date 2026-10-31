/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 */

'use strict';

// The context cases of ReactFresh-test.js, with context replaced by
// `use(store)`. See "Context copies" in docs/use-store/COPY_RULES.md.

let React;
let ReactDOMClient;
let ReactFreshRuntime;
let act;
let use;
let createStore;

describe('ReactFresh', () => {
  let container;
  let root;

  beforeEach(() => {
    if (__DEV__) {
      jest.resetModules();
      React = require('react');
      ReactFreshRuntime = require('react-refresh/runtime');
      ReactFreshRuntime.injectIntoGlobalHook(global);
      ReactDOMClient = require('react-dom/client');
      act = require('internal-test-utils').act;

      use = React.use;
      createStore = React.unstable_createStore;
      container = document.createElement('div');
      root = ReactDOMClient.createRoot(container);
      document.body.appendChild(container);
    }
  });

  afterEach(() => {
    if (__DEV__) {
      delete global.__REACT_DEVTOOLS_GLOBAL_HOOK__;
      document.body.removeChild(container);
    }
  });

  async function render(version, props) {
    const Component = version();
    await act(() => {
      root.render(<Component {...props} />);
    });
    return Component;
  }

  async function patch(version) {
    const Component = version();
    await act(() => {
      ReactFreshRuntime.performReactRefresh();
    });
    return Component;
  }

  function $RefreshReg$(type, id) {
    ReactFreshRuntime.register(type, id);
  }

  function $RefreshSig$(type, key, forceReset, getCustomHooks) {
    ReactFreshRuntime.setSignature(type, key, forceReset, getCustomHooks);
    return type;
  }

  // @gate enableStore || !__DEV__
  it('can remount on signature change within a context consumer', async () => {
    if (__DEV__) {
      await testRemountingWithWrapper(Hello => {
        const store = createStore();
        // <Context.Consumer> becomes a function component that reads the
        // store and calls its render prop.
        function Consumer({children}) {
          return children(use(store));
        }
        const child = <Consumer>{() => <Hello />}</Consumer>;
        return function Wrapper() {
          return child;
        };
      });
    }
  });

  async function testRemountingWithWrapper(wrap) {
    await render(() => {
      function Hello() {
        const [val, setVal] = React.useState(0);
        return (
          <p style={{color: 'blue'}} onClick={() => setVal(val + 1)}>
            {val}
          </p>
        );
      }
      $RefreshReg$(Hello, 'Hello');
      // When this changes, we'll expect a remount:
      $RefreshSig$(Hello, '1');

      // Use the passed wrapper.
      // This will be different in every test.
      return wrap(Hello);
    });

    // Bump the state before patching.
    const el = container.firstChild;
    expect(el.textContent).toBe('0');
    expect(el.style.color).toBe('blue');
    await act(() => {
      el.dispatchEvent(new MouseEvent('click', {bubbles: true}));
    });
    expect(el.textContent).toBe('1');

    // Perform a hot update that doesn't remount.
    await patch(() => {
      function Hello() {
        const [val, setVal] = React.useState(0);
        return (
          <p style={{color: 'red'}} onClick={() => setVal(val + 1)}>
            {val}
          </p>
        );
      }
      $RefreshReg$(Hello, 'Hello');
      // The signature hasn't changed since the last time:
      $RefreshSig$(Hello, '1');
      return Hello;
    });

    // Assert the state was preserved but color changed.
    expect(container.firstChild).toBe(el);
    expect(el.textContent).toBe('1');
    expect(el.style.color).toBe('red');

    // Perform a hot update that remounts.
    await patch(() => {
      function Hello() {
        const [val, setVal] = React.useState(0);
        return (
          <p style={{color: 'yellow'}} onClick={() => setVal(val + 1)}>
            {val}
          </p>
        );
      }
      // We're changing the signature now so it will remount:
      $RefreshReg$(Hello, 'Hello');
      $RefreshSig$(Hello, '2');
      return Hello;
    });

    // Expect a remount.
    expect(container.firstChild).not.toBe(el);
    const newEl = container.firstChild;
    expect(newEl.textContent).toBe('0');
    expect(newEl.style.color).toBe('yellow');

    // Bump state again.
    await act(() => {
      newEl.dispatchEvent(new MouseEvent('click', {bubbles: true}));
    });
    expect(newEl.textContent).toBe('1');
    expect(newEl.style.color).toBe('yellow');

    // Verify we can patch again while preserving the signature.
    await patch(() => {
      function Hello() {
        const [val, setVal] = React.useState(0);
        return (
          <p style={{color: 'purple'}} onClick={() => setVal(val + 1)}>
            {val}
          </p>
        );
      }
      // Same signature as last time.
      $RefreshReg$(Hello, 'Hello');
      $RefreshSig$(Hello, '2');
      return Hello;
    });

    expect(container.firstChild).toBe(newEl);
    expect(newEl.textContent).toBe('1');
    expect(newEl.style.color).toBe('purple');

    // Check removing the signature also causes a remount.
    await patch(() => {
      function Hello() {
        const [val, setVal] = React.useState(0);
        return (
          <p style={{color: 'orange'}} onClick={() => setVal(val + 1)}>
            {val}
          </p>
        );
      }
      // No signature this time.
      $RefreshReg$(Hello, 'Hello');
      return Hello;
    });

    // Expect a remount.
    expect(container.firstChild).not.toBe(newEl);
    const finalEl = container.firstChild;
    expect(finalEl.textContent).toBe('0');
    expect(finalEl.style.color).toBe('orange');
  }
});
