/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 */

'use strict';

global.IS_REACT_ACT_ENVIRONMENT = true;

// Our current version of JSDOM doesn't implement the event dispatching
// so we polyfill it.
const NativeFormData = global.FormData;
const FormDataPolyfill = function FormData(form) {
  const formData = new NativeFormData(form);
  const formDataEvent = new Event('formdata', {
    bubbles: true,
    cancelable: false,
  });
  formDataEvent.formData = formData;
  form.dispatchEvent(formDataEvent);
  return formData;
};
NativeFormData.prototype.constructor = FormDataPolyfill;
global.FormData = FormDataPolyfill;

describe('useActionState', () => {
  let act;
  let container;
  let React;
  let ReactDOMClient;
  let Scheduler;
  let assertLog;
  let waitForThrow;
  let textCache;
  let useActionState;

  beforeEach(() => {
    jest.resetModules();
    React = require('react');
    ReactDOMClient = require('react-dom/client');
    Scheduler = require('scheduler');
    act = require('internal-test-utils').act;
    assertLog = require('internal-test-utils').assertLog;
    waitForThrow = require('internal-test-utils').waitForThrow;
    useActionState = React.useActionState;
    container = document.createElement('div');
    document.body.appendChild(container);

    textCache = new Map();
  });

  function resolveText(text) {
    const record = textCache.get(text);
    if (record === undefined) {
      const newRecord = {
        status: 'resolved',
        value: text,
      };
      textCache.set(text, newRecord);
    } else if (record.status === 'pending') {
      const thenable = record.value;
      record.status = 'resolved';
      record.value = text;
      thenable.pings.forEach(t => t(text));
    }
  }

  function getText(text) {
    const record = textCache.get(text);
    if (record === undefined) {
      const thenable = {
        pings: [],
        then(resolve) {
          if (newRecord.status === 'pending') {
            thenable.pings.push(resolve);
          } else {
            Promise.resolve().then(() => resolve(newRecord.value));
          }
        },
      };
      const newRecord = {
        status: 'pending',
        value: thenable,
      };
      textCache.set(text, newRecord);
      return thenable;
    } else {
      switch (record.status) {
        case 'pending':
          return record.value;
        case 'rejected':
          return Promise.reject(record.value);
        case 'resolved':
          return Promise.resolve(record.value);
      }
    }
  }

  function Text({text}) {
    Scheduler.log(text);
    return text;
  }

  afterEach(() => {
    document.body.removeChild(container);
  });

  // @gate enableFormActions
  // @gate enableAsyncActions
  test('updates state asynchronously and queues multiple actions', async () => {
    let actionCounter = 0;
    async function action(state, type) {
      actionCounter++;

      Scheduler.log(`Async action started [${actionCounter}]`);
      await getText(`Wait [${actionCounter}]`);

      switch (type) {
        case 'increment':
          return state + 1;
        case 'decrement':
          return state - 1;
        default:
          return state;
      }
    }

    let dispatch;
    function App() {
      const [state, _dispatch, isPending] = useActionState(action, 0);
      dispatch = _dispatch;
      const pending = isPending ? 'Pending ' : '';
      return <Text text={pending + state} />;
    }

    const root = ReactDOMClient.createRoot(container);
    await act(() => root.render(<App />));
    assertLog(['0']);
    expect(container.textContent).toBe('0');

    await act(() => dispatch('increment'));
    assertLog(['Async action started [1]', 'Pending 0']);
    expect(container.textContent).toBe('Pending 0');

    // Dispatch a few more actions. None of these will start until the previous
    // one finishes.
    await act(() => dispatch('increment'));
    await act(() => dispatch('decrement'));
    await act(() => dispatch('increment'));
    assertLog([]);

    // Each action starts as soon as the previous one finishes.
    // NOTE: React does not render in between these actions because they all
    // update the same queue, which means they get entangled together. This is
    // intentional behavior.
    await act(() => resolveText('Wait [1]'));
    assertLog(['Async action started [2]']);
    await act(() => resolveText('Wait [2]'));
    assertLog(['Async action started [3]']);
    await act(() => resolveText('Wait [3]'));
    assertLog(['Async action started [4]']);
    await act(() => resolveText('Wait [4]'));

    // Finally the last action finishes and we can render the result.
    assertLog(['2']);
    expect(container.textContent).toBe('2');
  });

  // @gate enableFormActions
  // @gate enableAsyncActions
  test('supports inline actions', async () => {
    let increment;
    function App({stepSize}) {
      const [state, dispatch, isPending] = useActionState(async prevState => {
        return prevState + stepSize;
      }, 0);
      increment = dispatch;
      const pending = isPending ? 'Pending ' : '';
      return <Text text={pending + state} />;
    }

    // Initial render
    const root = ReactDOMClient.createRoot(container);
    await act(() => root.render(<App stepSize={1} />));
    assertLog(['0']);

    // Perform an action. This will increase the state by 1, as defined by the
    // stepSize prop.
    await act(() => increment());
    assertLog(['Pending 0', '1']);

    // Now increase the stepSize prop to 10. Subsequent steps will increase
    // by this amount.
    await act(() => root.render(<App stepSize={10} />));
    assertLog(['1']);

    // Increment again. The state should increase by 10.
    await act(() => increment());
    assertLog(['Pending 1', '11']);
  });

  // @gate enableFormActions
  // @gate enableAsyncActions
  test('dispatch throws if called during render', async () => {
    function App() {
      const [state, dispatch, isPending] = useActionState(async () => {}, 0);
      dispatch();
      const pending = isPending ? 'Pending ' : '';
      return <Text text={pending + state} />;
    }

    const root = ReactDOMClient.createRoot(container);
    await act(async () => {
      root.render(<App />);
      await waitForThrow('Cannot update form state while rendering.');
    });
  });

  // @gate enableFormActions
  // @gate enableAsyncActions
  test('queues multiple actions and runs them in order', async () => {
    let action;
    function App() {
      const [state, dispatch, isPending] = useActionState(
        async (s, a) => await getText(a),
        'A',
      );
      action = dispatch;
      const pending = isPending ? 'Pending ' : '';
      return <Text text={pending + state} />;
    }

    const root = ReactDOMClient.createRoot(container);
    await act(() => root.render(<App />));
    assertLog(['A']);

    await act(() => action('B'));
    assertLog(['Pending A']);
    expect(container.textContent).toBe('Pending A');

    await act(() => action('C'));
    assertLog([]); // Still pending.
    expect(container.textContent).toBe('Pending A');

    await act(() => action('D'));
    assertLog([]); // Still pending.
    expect(container.textContent).toBe('Pending A');

    await act(() => resolveText('B'));
    await act(() => resolveText('C'));
    await act(() => resolveText('D'));

    assertLog(['D']);
    expect(container.textContent).toBe('D');
  });

  // @gate enableFormActions
  // @gate enableAsyncActions
  test('works if action is sync', async () => {
    let increment;
    function App({stepSize}) {
      const [state, dispatch, isPending] = useActionState(prevState => {
        return prevState + stepSize;
      }, 0);
      increment = dispatch;
      const pending = isPending ? 'Pending ' : '';
      return <Text text={pending + state} />;
    }

    // Initial render
    const root = ReactDOMClient.createRoot(container);
    await act(() => root.render(<App stepSize={1} />));
    assertLog(['0']);

    // Perform an action. This will increase the state by 1, as defined by the
    // stepSize prop.
    await act(() => increment());
    assertLog(['Pending 0', '1']);
    expect(container.textContent).toBe('1');

    // Now increase the stepSize prop to 10. Subsequent steps will increase
    // by this amount.
    await act(() => root.render(<App stepSize={10} />));
    assertLog(['1']);
    expect(container.textContent).toBe('1');

    // Increment again. The state should increase by 10.
    await act(() => increment());
    assertLog(['Pending 1', '11']);
    expect(container.textContent).toBe('11');
  });

  // @gate enableFormActions
  // @gate enableAsyncActions
  test('can mix sync and async actions', async () => {
    let action;
    function App() {
      const [state, dispatch, isPending] = useActionState((s, a) => a, 'A');
      action = dispatch;
      const pending = isPending ? 'Pending ' : '';
      return <Text text={pending + state} />;
    }

    const root = ReactDOMClient.createRoot(container);
    await act(() => root.render(<App />));
    assertLog(['A']);

    await act(() => action(getText('B')));
    assertLog(['Pending A']);
    expect(container.textContent).toBe('Pending A');

    await act(() => action('C'));
    assertLog([]); // Still pending.
    expect(container.textContent).toBe('Pending A');

    await act(() => action(getText('D')));
    assertLog([]); // Still pending.
    expect(container.textContent).toBe('Pending A');

    await act(() => action('E'));
    assertLog([]); // Still pending.
    expect(container.textContent).toBe('Pending A');

    await act(() => resolveText('B'));
    assertLog([]); // Still pending.
    expect(container.textContent).toBe('Pending A');

    await act(() => resolveText('D'));
    assertLog(['E']);
    expect(container.textContent).toBe('E');
  });

  // @gate enableFormActions
  // @gate enableAsyncActions
  test('error handling (sync action)', async () => {
    let resetErrorBoundary;
    class ErrorBoundary extends React.Component {
      state = {error: null};
      static getDerivedStateFromError(error) {
        return {error};
      }
      render() {
        resetErrorBoundary = () => this.setState({error: null});
        if (this.state.error !== null) {
          return <Text text={'Caught an error: ' + this.state.error.message} />;
        }
        return this.props.children;
      }
    }

    let action;
    function App() {
      const [state, dispatch, isPending] = useActionState((s, a) => {
        if (a.endsWith('!')) {
          throw new Error(a);
        }
        return a;
      }, 'A');
      action = dispatch;
      const pending = isPending ? 'Pending ' : '';
      return <Text text={pending + state} />;
    }

    const root = ReactDOMClient.createRoot(container);
    await act(() =>
      root.render(
        <ErrorBoundary>
          <App />
        </ErrorBoundary>,
      ),
    );
    assertLog(['A']);

    await act(() => action('Oops!'));
    assertLog([
      'Pending A', // Error has not thrown yet.
      'Caught an error: Oops!',
      'Caught an error: Oops!',
    ]);
    expect(container.textContent).toBe('Caught an error: Oops!');

    // Reset the error boundary
    await act(() => resetErrorBoundary());
    assertLog(['A']);

    // Trigger an error again, but this time, perform another action that
    // overrides the first one and fixes the error
    await act(() => {
      action('Oops!');
      action('B');
    });
    assertLog(['Pending A', 'B']);
    expect(container.textContent).toBe('B');
  });

  // @gate enableFormActions
  // @gate enableAsyncActions
  test('error handling (async action)', async () => {
    let resetErrorBoundary;
    class ErrorBoundary extends React.Component {
      state = {error: null};
      static getDerivedStateFromError(error) {
        return {error};
      }
      render() {
        resetErrorBoundary = () => this.setState({error: null});
        if (this.state.error !== null) {
          return <Text text={'Caught an error: ' + this.state.error.message} />;
        }
        return this.props.children;
      }
    }

    let action;
    function App() {
      const [state, dispatch, isPending] = useActionState(async (s, a) => {
        const text = await getText(a);
        if (text.endsWith('!')) {
          throw new Error(text);
        }
        return text;
      }, 'A');
      action = dispatch;
      const pending = isPending ? 'Pending ' : '';
      return <Text text={pending + state} />;
    }

    const root = ReactDOMClient.createRoot(container);
    await act(() =>
      root.render(
        <ErrorBoundary>
          <App />
        </ErrorBoundary>,
      ),
    );
    assertLog(['A']);

    await act(() => action('Oops!'));
    assertLog(['Pending A']); // Error has not thrown yet.
    expect(container.textContent).toBe('Pending A');

    await act(() => resolveText('Oops!'));
    assertLog(['Caught an error: Oops!', 'Caught an error: Oops!']);
    expect(container.textContent).toBe('Caught an error: Oops!');

    // Reset the error boundary
    await act(() => resetErrorBoundary());
    assertLog(['A']);

    // Trigger an error again, but this time, perform another action that
    // overrides the first one and fixes the error
    await act(() => {
      action('Oops!');
      action('B');
    });
    assertLog(['Pending A']);
    expect(container.textContent).toBe('Pending A');

    await act(() => resolveText('B'));
    assertLog(['B']);
    expect(container.textContent).toBe('B');
  });
});
