/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 */

'use strict';

const ReactDOMServerIntegrationUtils = require('./utils/ReactDOMServerIntegrationTestUtils');

let React;
let ReactDOMClient;
let ReactDOMServer;
let use;
let createStore;

function initModules() {
  // Reset warning cache.
  jest.resetModules();
  React = require('react');
  ReactDOMClient = require('react-dom/client');
  ReactDOMServer = require('react-dom/server');
  use = React.use;
  createStore = React.unstable_createStore;

  // Make them available to the helpers.
  return {
    ReactDOMClient,
    ReactDOMServer,
  };
}

const {
  resetModules,
  itClientRenders: itClientRendersUngated,
  renderIntoDom,
  serverRender,
} = ReactDOMServerIntegrationUtils(initModules);

// The itClientRenders helper calls `it` itself, so a @gate pragma doesn't reach
// it. This version gates every test it generates on enableStore, the way
// `@gate enableStore` does.
function itClientRenders(desc, testFn) {
  const originalIt = global.it;
  global.it = (name, fn, timeout) =>
    global._test_gate(flags => flags.enableStore, name, fn, timeout);
  try {
    itClientRendersUngated(desc, testFn);
  } finally {
    global.it = originalIt;
  }
}

describe('ReactDOMServerIntegrationUserInteraction', () => {
  let ControlledInput, ControlledTextArea, ControlledCheckbox, ControlledSelect;

  beforeEach(() => {
    resetModules();
    // Each component reads its state from a store passed as a prop. Like the
    // state of the class components this replaces, the store holds an object,
    // and an update to any of its keys re-renders the component.
    ControlledInput = function ({type = 'text', store, onChange, cascade}) {
      const state = use(store);
      function handleChange(event) {
        if (onChange) {
          onChange(event);
        }
        store.update(prevState => ({...prevState, value: event.target.value}));
      }
      React.useLayoutEffect(() => {
        if (cascade) {
          // Trigger a cascading render immediately upon hydration which rerenders the input.
          store.update(prevState => ({...prevState, cascade: true}));
        }
      }, []);
      return <input type={type} value={state.value} onChange={handleChange} />;
    };
    ControlledTextArea = function ({store, onChange, cascade}) {
      const state = use(store);
      function handleChange(event) {
        if (onChange) {
          onChange(event);
        }
        store.update(prevState => ({...prevState, value: event.target.value}));
      }
      React.useLayoutEffect(() => {
        if (cascade) {
          // Trigger a cascading render immediately upon hydration which rerenders the textarea.
          store.update(prevState => ({...prevState, cascade: true}));
        }
      }, []);
      return <textarea value={state.value} onChange={handleChange} />;
    };
    ControlledCheckbox = function ({store, onChange, cascade}) {
      const state = use(store);
      function handleChange(event) {
        if (onChange) {
          onChange(event);
        }
        store.update(prevState => ({
          ...prevState,
          value: event.target.checked,
        }));
      }
      React.useLayoutEffect(() => {
        if (cascade) {
          // Trigger a cascading render immediately upon hydration which rerenders the checkbox.
          store.update(prevState => ({...prevState, cascade: true}));
        }
      }, []);
      return (
        <input type="checkbox" checked={state.value} onChange={handleChange} />
      );
    };
    ControlledSelect = function ({store, onChange, cascade}) {
      const state = use(store);
      function handleChange(event) {
        if (onChange) {
          onChange(event);
        }
        store.update(prevState => ({...prevState, value: event.target.value}));
      }
      React.useLayoutEffect(() => {
        if (cascade) {
          // Trigger a cascading render immediately upon hydration which rerenders the select.
          store.update(prevState => ({...prevState, cascade: true}));
        }
      }, []);
      return (
        <select value={state.value} onChange={handleChange}>
          <option key="1" value="Hello">
            Hello
          </option>
          <option key="2" value="Goodbye">
            Goodbye
          </option>
        </select>
      );
    };
  });

  describe('user interaction with controlled inputs', function () {
    itClientRenders('a controlled text input', async render => {
      const setUntrackedValue = Object.getOwnPropertyDescriptor(
        HTMLInputElement.prototype,
        'value',
      ).set;

      let changeCount = 0;
      const e = await render(
        <ControlledInput
          store={createStore({value: 'Hello'})}
          onChange={() => changeCount++}
        />,
      );
      const container = e.parentNode;
      document.body.appendChild(container);

      try {
        expect(changeCount).toBe(0);
        expect(e.value).toBe('Hello');

        // simulate a user typing.
        setUntrackedValue.call(e, 'Goodbye');
        e.dispatchEvent(new Event('input', {bubbles: true, cancelable: false}));

        expect(changeCount).toBe(1);
        expect(e.value).toBe('Goodbye');
      } finally {
        document.body.removeChild(container);
      }
    });

    itClientRenders('a controlled textarea', async render => {
      const setUntrackedValue = Object.getOwnPropertyDescriptor(
        HTMLTextAreaElement.prototype,
        'value',
      ).set;

      let changeCount = 0;
      const e = await render(
        <ControlledTextArea
          store={createStore({value: 'Hello'})}
          onChange={() => changeCount++}
        />,
      );
      const container = e.parentNode;
      document.body.appendChild(container);

      try {
        expect(changeCount).toBe(0);
        expect(e.value).toBe('Hello');

        // simulate a user typing.
        setUntrackedValue.call(e, 'Goodbye');
        e.dispatchEvent(new Event('input', {bubbles: true, cancelable: false}));

        expect(changeCount).toBe(1);
        expect(e.value).toBe('Goodbye');
      } finally {
        document.body.removeChild(container);
      }
    });

    itClientRenders('a controlled checkbox', async render => {
      let changeCount = 0;
      const e = await render(
        <ControlledCheckbox
          store={createStore({value: true})}
          onChange={() => changeCount++}
        />,
      );
      const container = e.parentNode;
      document.body.appendChild(container);

      try {
        expect(changeCount).toBe(0);
        expect(e.checked).toBe(true);

        // simulate a user clicking.
        e.click();

        expect(changeCount).toBe(1);
        expect(e.checked).toBe(false);
      } finally {
        document.body.removeChild(container);
      }
    });

    itClientRenders('a controlled select', async render => {
      const setUntrackedValue = Object.getOwnPropertyDescriptor(
        HTMLSelectElement.prototype,
        'value',
      ).set;

      let changeCount = 0;
      const e = await render(
        <ControlledSelect
          store={createStore({value: 'Hello'})}
          onChange={() => changeCount++}
        />,
      );
      const container = e.parentNode;
      document.body.appendChild(container);

      try {
        expect(changeCount).toBe(0);
        expect(e.value).toBe('Hello');

        // simulate a user typing.
        setUntrackedValue.call(e, 'Goodbye');
        e.dispatchEvent(
          new Event('change', {bubbles: true, cancelable: false}),
        );

        expect(changeCount).toBe(1);
        expect(e.value).toBe('Goodbye');
      } finally {
        document.body.removeChild(container);
      }
    });
  });

  describe('user interaction with inputs before client render', function () {
    // renders the element and changes the value **before** the client
    // code has a chance to render; this simulates what happens when a
    // user starts to interact with a server-rendered form before
    // ReactDOM.render is called. the client render should NOT blow away
    // the changes the user has made.
    const testUserInteractionBeforeClientRender = async (
      element,
      initialValue = 'Hello',
      changedValue = 'Goodbye',
      valueKey = 'value',
    ) => {
      const field = await serverRender(element);
      expect(field[valueKey]).toBe(initialValue);

      // simulate a user typing in the field **before** client-side reconnect happens.
      field[valueKey] = changedValue;

      resetModules();
      // client render on top of the server markup.
      const clientField = await renderIntoDom(element, field.parentNode, true);
      // verify that the input field was not replaced.
      // Note that we cannot use expect(clientField).toBe(field) because
      // of jest bug #1772
      expect(clientField === field).toBe(true);
      // confirm that the client render has not changed what the user typed.
      expect(clientField[valueKey]).toBe(changedValue);
    };

    it('should not blow away user-entered text on successful reconnect to an uncontrolled input', () =>
      testUserInteractionBeforeClientRender(<input defaultValue="Hello" />));

    // @gate enableStore
    it('should not blow away user-entered text on successful reconnect to a controlled input', async () => {
      let changeCount = 0;
      await testUserInteractionBeforeClientRender(
        <ControlledInput
          store={createStore({value: 'Hello'})}
          onChange={() => changeCount++}
        />,
      );
      expect(changeCount).toBe(
        gate(flags => flags.enableHydrationChangeEvent) ? 1 : 0,
      );
    });

    it('should not blow away user-interaction on successful reconnect to an uncontrolled range input', () =>
      testUserInteractionBeforeClientRender(
        <input type="text" defaultValue="0.5" />,
        '0.5',
        '1',
      ));

    // @gate enableStore
    it('should not blow away user-interaction on successful reconnect to a controlled range input', async () => {
      let changeCount = 0;
      await testUserInteractionBeforeClientRender(
        <ControlledInput
          type="range"
          store={createStore({value: '0.25'})}
          onChange={() => changeCount++}
        />,
        '0.25',
        '1',
      );
      expect(changeCount).toBe(
        gate(flags => flags.enableHydrationChangeEvent) ? 1 : 0,
      );
    });

    it('should not blow away user-entered text on successful reconnect to an uncontrolled checkbox', () =>
      testUserInteractionBeforeClientRender(
        <input type="checkbox" defaultChecked={true} />,
        true,
        false,
        'checked',
      ));

    // @gate enableStore
    it('should not blow away user-entered text on successful reconnect to a controlled checkbox', async () => {
      let changeCount = 0;
      await testUserInteractionBeforeClientRender(
        <ControlledCheckbox
          store={createStore({value: true})}
          onChange={() => changeCount++}
        />,
        true,
        false,
        'checked',
      );
      expect(changeCount).toBe(
        gate(flags => flags.enableHydrationChangeEvent) ? 1 : 0,
      );
    });

    // @gate enableHydrationChangeEvent
    it('should not blow away user-entered text on successful reconnect to an uncontrolled textarea', () =>
      testUserInteractionBeforeClientRender(<textarea defaultValue="Hello" />));

    // @gate enableStore && enableHydrationChangeEvent
    it('should not blow away user-entered text on successful reconnect to a controlled textarea', async () => {
      let changeCount = 0;
      await testUserInteractionBeforeClientRender(
        <ControlledTextArea
          store={createStore({value: 'Hello'})}
          onChange={() => changeCount++}
        />,
      );
      expect(changeCount).toBe(1);
    });

    it('should not blow away user-selected value on successful reconnect to an uncontrolled select', () =>
      testUserInteractionBeforeClientRender(
        <select defaultValue="Hello">
          <option key="1" value="Hello">
            Hello
          </option>
          <option key="2" value="Goodbye">
            Goodbye
          </option>
        </select>,
      ));

    // @gate enableStore
    it('should not blow away user-selected value on successful reconnect to an controlled select', async () => {
      let changeCount = 0;
      await testUserInteractionBeforeClientRender(
        <ControlledSelect
          store={createStore({value: 'Hello'})}
          onChange={() => changeCount++}
        />,
      );
      expect(changeCount).toBe(
        gate(flags => flags.enableHydrationChangeEvent) ? 1 : 0,
      );
    });

    // @gate enableStore && enableHydrationChangeEvent
    it('should not blow away user-entered text cascading hydration to a controlled input', async () => {
      let changeCount = 0;
      await testUserInteractionBeforeClientRender(
        <ControlledInput
          store={createStore({value: 'Hello'})}
          onChange={() => changeCount++}
          cascade={true}
        />,
      );
      expect(changeCount).toBe(1);
    });

    // @gate enableStore && enableHydrationChangeEvent
    it('should not blow away user-interaction cascading hydration to a controlled range input', async () => {
      let changeCount = 0;
      await testUserInteractionBeforeClientRender(
        <ControlledInput
          type="range"
          store={createStore({value: '0.25'})}
          onChange={() => changeCount++}
          cascade={true}
        />,
        '0.25',
        '1',
      );
      expect(changeCount).toBe(1);
    });

    // @gate enableStore && enableHydrationChangeEvent
    it('should not blow away user-entered text cascading hydration to a controlled checkbox', async () => {
      let changeCount = 0;
      await testUserInteractionBeforeClientRender(
        <ControlledCheckbox
          store={createStore({value: true})}
          onChange={() => changeCount++}
          cascade={true}
        />,
        true,
        false,
        'checked',
      );
      expect(changeCount).toBe(1);
    });

    // @gate enableStore && enableHydrationChangeEvent
    it('should not blow away user-entered text cascading hydration to a controlled textarea', async () => {
      let changeCount = 0;
      await testUserInteractionBeforeClientRender(
        <ControlledTextArea
          store={createStore({value: 'Hello'})}
          onChange={() => changeCount++}
          cascade={true}
        />,
      );
      expect(changeCount).toBe(1);
    });

    // @gate enableStore && enableHydrationChangeEvent
    it('should not blow away user-selected value cascading hydration to an controlled select', async () => {
      let changeCount = 0;
      await testUserInteractionBeforeClientRender(
        <ControlledSelect
          store={createStore({value: 'Hello'})}
          onChange={() => changeCount++}
          cascade={true}
        />,
      );
      expect(changeCount).toBe(1);
    });
  });
});
