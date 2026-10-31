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

// The context cases of useEffectEvent-test.js, with context replaced by
// `use(store)`. See "Context copies" in docs/use-store/COPY_RULES.md.

describe('useEffectEvent', () => {
  let React;
  let ReactNoop;
  let Scheduler;
  let act;
  let use;
  let createStore;
  let useEffectEvent;
  let useEffect;
  let assertLog;

  beforeEach(() => {
    React = require('react');
    ReactNoop = require('react-noop-renderer');
    Scheduler = require('scheduler');

    act = require('internal-test-utils').act;
    use = React.use;
    createStore = React.unstable_createStore;
    useEffectEvent = React.useEffectEvent;
    useEffect = React.useEffect;

    const InternalTestUtils = require('internal-test-utils');
    assertLog = InternalTestUtils.assertLog;
  });

  function Text(props) {
    Scheduler.log(props.text);
    return <span prop={props.text} />;
  }

  // @gate enableStore
  it('integration: implements the docs logVisit example', async () => {
    class AddToCartButton extends React.PureComponent {
      addToCart = () => {
        this.props.onClick();
      };
      render() {
        return <Text text="Add to cart" />;
      }
    }
    // The context provided {items, updateItems} from AppShell's state. The
    // store holds the items, and store.update is updateItems.
    const shoppingCartStore = createStore([]);

    function AppShell({children}) {
      // Stands in for the useState that owned the Provider value.
      use(shoppingCartStore);
      return children;
    }

    function Page({url}) {
      const items = use(shoppingCartStore);
      const updateItems = shoppingCartStore.update;
      const onClick = useEffectEvent(() => updateItems([...items, 1]));
      const numberOfItems = items.length;

      const onVisit = useEffectEvent(visitedUrl => {
        Scheduler.log(
          'url: ' + visitedUrl + ', numberOfItems: ' + numberOfItems,
        );
      });

      useEffect(() => {
        onVisit(url);
      }, [url]);

      return (
        <AddToCartButton
          onClick={() => {
            onClick();
          }}
          ref={button}
        />
      );
    }

    const button = React.createRef(null);
    await act(() =>
      ReactNoop.render(
        <AppShell>
          <Page url="/shop/1" />
        </AppShell>,
      ),
    );
    assertLog(['Add to cart', 'url: /shop/1, numberOfItems: 0']);
    await act(() => button.current.addToCart());
    assertLog(['Add to cart']);

    await act(() =>
      ReactNoop.render(
        <AppShell>
          <Page url="/shop/2" />
        </AppShell>,
      ),
    );
    assertLog(['Add to cart', 'url: /shop/2, numberOfItems: 1']);
  });

  // @gate enableStore
  it('reads the latest context value in memo Components', async () => {
    const myStore = createStore('first');

    let logContextValue;
    const ContextReader = React.memo(function ContextReader() {
      const value = use(myStore);
      Scheduler.log('ContextReader: ' + value);
      const fireLogContextValue = useEffectEvent(() => {
        Scheduler.log('ContextReader (Effect event): ' + value);
      });
      useEffect(() => {
        logContextValue = fireLogContextValue;
      }, []);
      return null;
    });

    function App() {
      return <ContextReader />;
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<App />));
    assertLog(['ContextReader: first']);

    logContextValue();

    assertLog(['ContextReader (Effect event): first']);

    // The original re-renders App with a new Provider value. Keep the
    // re-render, so the update has to get past memo's bailout.
    await act(() => {
      root.render(<App />);
      myStore.update('second');
    });
    assertLog(['ContextReader: second']);

    logContextValue();
    assertLog(['ContextReader (Effect event): second']);
  });

  // @gate enableStore
  it('reads the latest context value in forwardRef Components', async () => {
    const myStore = createStore('first');

    let logContextValue;
    const ContextReader = React.forwardRef(function ContextReader(props, ref) {
      const value = use(myStore);
      Scheduler.log('ContextReader: ' + value);
      const fireLogContextValue = useEffectEvent(() => {
        Scheduler.log('ContextReader (Effect event): ' + value);
      });
      useEffect(() => {
        logContextValue = fireLogContextValue;
      }, []);
      return null;
    });

    function App() {
      return <ContextReader />;
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<App />));
    assertLog(['ContextReader: first']);

    logContextValue();

    assertLog(['ContextReader (Effect event): first']);

    await act(() => myStore.update('second'));
    assertLog(['ContextReader: second']);

    logContextValue();
    assertLog(['ContextReader (Effect event): second']);
  });
});
