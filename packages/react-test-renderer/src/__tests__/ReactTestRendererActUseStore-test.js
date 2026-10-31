jest.useRealTimers();

let React;
let ReactTestRenderer;
let Scheduler;
let act;
let assertLog;
let createStore;

describe('ReactTestRenderer.act()', () => {
  beforeEach(() => {
    jest.resetModules();
    React = require('react');
    ReactTestRenderer = require('react-test-renderer');
    Scheduler = require('scheduler');
    act = ReactTestRenderer.act;
    createStore = React.unstable_createStore;

    const InternalTestUtils = require('internal-test-utils');
    assertLog = InternalTestUtils.assertLog;
    global.IS_REACT_ACT_ENVIRONMENT = true;
  });

  // @gate enableStore && __DEV__
  it('can use .act() to flush effects', () => {
    const ctrStore = createStore(0);
    function App(props) {
      const ctr = React.use(ctrStore);
      React.useEffect(() => {
        props.callback();
        ctrStore.update(1);
      }, []);
      return ctr;
    }
    const calledLog = [];
    let root;
    act(() => {
      root = ReactTestRenderer.create(
        <App
          callback={() => {
            calledLog.push(calledLog.length);
          }}
        />,
      );
    });

    expect(calledLog).toEqual([0]);
    expect(root.toJSON()).toEqual('1');
  });

  describe('async', () => {
    // @gate enableStore && __DEV__
    it('should work with async/await', async () => {
      function fetch(url) {
        return Promise.resolve({
          details: [1, 2, 3],
        });
      }
      const detailsStore = createStore(0);
      function App() {
        const details = React.use(detailsStore);

        React.useEffect(() => {
          async function fetchDetails() {
            const response = await fetch();
            detailsStore.update(response.details);
          }
          fetchDetails();
        }, []);
        return details;
      }
      let root;

      await ReactTestRenderer.act(async () => {
        root = ReactTestRenderer.create(<App />);
      });

      expect(root.toJSON()).toEqual(['1', '2', '3']);
    });

    // @gate enableStore && __DEV__
    it('should not flush effects without also flushing microtasks', async () => {
      const {useEffect, use} = React;

      const alreadyResolvedPromise = Promise.resolve();

      const stepStore = createStore(1, s => (s === 3 ? 3 : s + 1));
      function App() {
        // This component will keep updating itself until step === 3
        const step = use(stepStore);
        useEffect(() => {
          Scheduler.log('Effect');
          alreadyResolvedPromise.then(() => {
            Scheduler.log('Microtask');
            stepStore.update();
          });
        });
        return step;
      }
      let root;
      await act(() => {
        root = ReactTestRenderer.create(null);
      });
      await act(async () => {
        root.update(<App />);
      });
      assertLog([
        // Should not flush effects without also flushing microtasks
        // First render:
        'Effect',
        'Microtask',
        // Second render:
        'Effect',
        'Microtask',
        // Final render:
        'Effect',
        'Microtask',
      ]);
      expect(root).toMatchRenderedOutput('3');
    });
  });
});
