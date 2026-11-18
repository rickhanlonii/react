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

let React;
let ReactNoop;
let Scheduler;
let act;
let assertLog;
let useState;
let useMemo;
let useContext;
let createContext;
let Profiler;
let Activity;
let use;

// A component that returns the same element when its inputs don't change, the
// way the React Compiler does. enableSameElementBailout skips reconciling the
// child in that case. These tests pass with the flag on or off.
describe('ReactSameElementBailout', () => {
  beforeEach(() => {
    jest.resetModules();
    React = require('react');
    ReactNoop = require('react-noop-renderer');
    Scheduler = require('scheduler');
    act = require('internal-test-utils').act;
    assertLog = require('internal-test-utils').assertLog;
    useState = React.useState;
    useMemo = React.useMemo;
    useContext = React.useContext;
    createContext = React.createContext;
    Profiler = React.Profiler;
    Activity = React.Activity;
    use = React.use;
  });

  function Text({text}) {
    Scheduler.log(text);
    return text;
  }

  it('still renders a child that has its own pending update', async () => {
    let setParent;
    let setChild;
    function Child() {
      const [value, _setChild] = useState(0);
      setChild = _setChild;
      return <Text text={'Child ' + value} />;
    }
    function Parent() {
      const [value, _setParent] = useState(0);
      setParent = _setParent;
      Scheduler.log('Parent ' + value);
      return useMemo(() => <Child />, []);
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<Parent />));
    assertLog(['Parent 0', 'Child 0']);

    await act(() => {
      setParent(1);
      setChild(1);
    });
    assertLog(['Parent 1', 'Child 1']);
    expect(root).toMatchRenderedOutput('Child 1');

    // With no pending update, the child bails out.
    await act(() => setParent(2));
    assertLog(['Parent 2']);
  });

  it('still renders the pending update of a child of a forwardRef', async () => {
    let setParent;
    let setChild;
    function Child() {
      const [value, _setChild] = useState(0);
      setChild = _setChild;
      return <Text text={'Child ' + value} />;
    }
    const Parent = React.forwardRef(function Parent(props, ref) {
      const [value, _setParent] = useState(0);
      setParent = _setParent;
      Scheduler.log('Parent ' + value);
      return useMemo(() => <Child />, []);
    });

    const root = ReactNoop.createRoot();
    await act(() => root.render(<Parent />));
    assertLog(['Parent 0', 'Child 0']);

    await act(() => {
      setParent(1);
      setChild(1);
    });
    assertLog(['Parent 1', 'Child 1']);

    await act(() => setParent(2));
    assertLog(['Parent 2']);
    expect(root).toMatchRenderedOutput('Child 1');
  });

  it('propagates a context change to consumers below the child', async () => {
    const Context = createContext(0);
    function Consumer() {
      return <Text text={'Consumer ' + useContext(Context)} />;
    }
    function Middle() {
      Scheduler.log('Middle');
      return <Consumer />;
    }
    function Parent({value}) {
      Scheduler.log('Parent ' + value);
      return useMemo(() => <Middle />, []);
    }
    function App({value}) {
      return (
        <Context.Provider value={value}>
          <Parent value={value} />
        </Context.Provider>
      );
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<App value={0} />));
    assertLog(['Parent 0', 'Middle', 'Consumer 0']);

    await act(() => root.render(<App value={1} />));
    assertLog(['Parent 1', 'Consumer 1']);
    expect(root).toMatchRenderedOutput('Consumer 1');
  });

  it('keeps the context dependencies of the render that bailed out', async () => {
    const Context = createContext('A');
    let setRead;
    function Parent() {
      const [read, _setRead] = useState(false);
      setRead = _setRead;
      const value = read ? React.use(Context) : null;
      Scheduler.log('Parent ' + value);
      return useMemo(() => <Text text="Child" />, []);
    }
    const MemoParent = React.memo(Parent);
    function App({value}) {
      return (
        <Context.Provider value={value}>
          <MemoParent />
        </Context.Provider>
      );
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<App value="A" />));
    assertLog(['Parent null', 'Child']);

    // Parent starts reading the context in a render that returns the same
    // element.
    await act(() => setRead(true));
    assertLog(['Parent A']);

    // It's now a consumer, so a change re-renders it.
    await act(() => root.render(<App value="B" />));
    assertLog(['Parent B']);
  });

  it('shows a context change to a child in a hidden tree when the tree is revealed', async () => {
    const Context = createContext('A');
    let setValue;
    let setVisible;
    function Provider({children}) {
      const [value, _setValue] = useState('A');
      setValue = _setValue;
      return <Context value={value}>{children}</Context>;
    }
    function Gate({children}) {
      const [visible, _setVisible] = useState(false);
      setVisible = _setVisible;
      return (
        <Activity mode={visible ? 'visible' : 'hidden'}>{children}</Activity>
      );
    }
    // Reads the context and returns the same element, so the child is
    // skipped. The child reads the context too.
    function Parent({children}) {
      use(Context);
      return children;
    }
    function Child() {
      return <span prop={use(Context)} />;
    }

    const root = ReactNoop.createRoot();
    await act(() =>
      root.render(
        <Provider>
          <Gate>
            <Parent>
              <Child />
            </Parent>
          </Gate>
        </Provider>,
      ),
    );
    // The provider commits before the hidden tree renders, so when Parent
    // renders there, no provider above it has changed. Only the child's own
    // context dependencies show that it has to render.
    await act(() => setValue('B'));
    await act(() => setVisible(true));
    expect(root).toMatchRenderedOutput(<span prop="B" />);
  });

  it('attaches a new ref when the element changes', async () => {
    const refs = [];
    let setRefIndex;
    function Parent() {
      const [refIndex, _setRefIndex] = useState(0);
      setRefIndex = _setRefIndex;
      const ref = useMemo(
        () => instance => {
          refs.push([refIndex, instance === null ? null : 'div']);
        },
        [refIndex],
      );
      return useMemo(() => <div ref={ref} />, [ref]);
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<Parent />));
    expect(refs).toEqual([[0, 'div']]);

    await act(() => setRefIndex(1));
    expect(refs).toEqual([
      [0, 'div'],
      [0, null],
      [1, 'div'],
    ]);
  });

  it('runs the effects of the render that bailed out', async () => {
    const {useEffect} = React;
    let setValue;
    function Parent() {
      const [value, _setValue] = useState(0);
      setValue = _setValue;
      useEffect(() => {
        Scheduler.log('Effect ' + value);
      }, [value]);
      return useMemo(() => <Text text="Child" />, []);
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<Parent />));
    assertLog(['Child', 'Effect 0']);

    await act(() => setValue(1));
    assertLog(['Effect 1']);
  });

  it('takes the normal path when the previous render had more than one child', async () => {
    let setShowSibling;
    function Parent() {
      const [showSibling, _setShowSibling] = useState(true);
      setShowSibling = _setShowSibling;
      const child = useMemo(() => <Text key="child" text="Child" />, []);
      return showSibling
        ? [child, <Text key="sibling" text="Sibling" />]
        : child;
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<Parent />));
    assertLog(['Child', 'Sibling']);

    await act(() => setShowSibling(false));
    assertLog([]);
    expect(root).toMatchRenderedOutput('Child');
  });

  // @gate enableProfilerTimer
  it('records the render time of a component that bailed out of its child', async () => {
    let setValue;
    function Child() {
      Scheduler.unstable_advanceTime(5);
      return null;
    }
    function Parent() {
      const [value, _setValue] = useState(0);
      setValue = _setValue;
      Scheduler.unstable_advanceTime(10);
      Scheduler.log('Parent ' + value);
      return useMemo(() => <Child />, []);
    }
    const onRender = jest.fn();

    const root = ReactNoop.createRoot();
    await act(() =>
      root.render(
        <Profiler id="test" onRender={onRender}>
          <Parent />
        </Profiler>,
      ),
    );
    assertLog(['Parent 0']);
    expect(onRender).toHaveBeenCalledTimes(1);
    // [id, phase, actualDuration, baseDuration]
    expect(onRender.mock.calls[0].slice(1, 4)).toEqual(['mount', 15, 15]);

    await act(() => setValue(1));
    assertLog(['Parent 1']);
    expect(onRender).toHaveBeenCalledTimes(2);
    // The parent rendered and the child didn't. The base duration still
    // includes the child's last render.
    expect(onRender.mock.calls[1].slice(1, 4)).toEqual(['update', 10, 15]);
  });
});
