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
let use;
let useMemo;
let useContext;
let createContext;
let Profiler;
let createStore;

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
    use = React.use;
    useMemo = React.useMemo;
    useContext = React.useContext;
    createContext = React.createContext;
    Profiler = React.Profiler;
    createStore = React.unstable_createStore;
  });

  function Text({text}) {
    Scheduler.log(text);
    return text;
  }

  // @gate enableStore
  it('still renders a child that has its own pending update', async () => {
    const parentStore = createStore(0);
    const childStore = createStore(0);
    function Child() {
      return <Text text={'Child ' + use(childStore)} />;
    }
    function Parent() {
      const value = use(parentStore);
      Scheduler.log('Parent ' + value);
      return useMemo(() => <Child />, []);
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<Parent />));
    assertLog(['Parent 0', 'Child 0']);

    // The parent re-renders because of its store and returns the same
    // element. The update to the child's store still reaches the child.
    await act(() => {
      parentStore.update(1);
      childStore.update(1);
    });
    assertLog(['Parent 1', 'Child 1']);
    expect(root).toMatchRenderedOutput('Child 1');

    // With no pending update, the child bails out.
    await act(() => parentStore.update(2));
    assertLog(['Parent 2']);

    // An update to the child's store alone renders the child.
    await act(() => childStore.update(2));
    assertLog(['Child 2']);
    expect(root).toMatchRenderedOutput('Child 2');
  });

  // @gate enableStore
  it('still renders the pending update of a child of a forwardRef', async () => {
    const parentStore = createStore(0);
    const childStore = createStore(0);
    function Child() {
      return <Text text={'Child ' + use(childStore)} />;
    }
    const Parent = React.forwardRef(function Parent(props, ref) {
      const value = use(parentStore);
      Scheduler.log('Parent ' + value);
      return useMemo(() => <Child />, []);
    });

    const root = ReactNoop.createRoot();
    await act(() => root.render(<Parent />));
    assertLog(['Parent 0', 'Child 0']);

    await act(() => {
      parentStore.update(1);
      childStore.update(1);
    });
    assertLog(['Parent 1', 'Child 1']);

    await act(() => parentStore.update(2));
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

  // @gate enableStore
  it('keeps the context dependencies of the render that bailed out', async () => {
    const Context = createContext('A');
    const readStore = createStore(false);
    function Parent() {
      const read = use(readStore);
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
    await act(() => readStore.update(true));
    assertLog(['Parent A']);

    // It's now a consumer, so a change re-renders it.
    await act(() => root.render(<App value="B" />));
    assertLog(['Parent B']);
  });

  // @gate enableStore
  it('attaches a new ref when the element changes', async () => {
    const refs = [];
    const refIndexStore = createStore(0);
    function Parent() {
      const refIndex = use(refIndexStore);
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

    await act(() => refIndexStore.update(1));
    expect(refs).toEqual([
      [0, 'div'],
      [0, null],
      [1, 'div'],
    ]);
  });

  // @gate enableStore
  it('runs the effects of the render that bailed out', async () => {
    const {useEffect} = React;
    const valueStore = createStore(0);
    function Parent() {
      const value = use(valueStore);
      useEffect(() => {
        Scheduler.log('Effect ' + value);
      }, [value]);
      return useMemo(() => <Text text="Child" />, []);
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<Parent />));
    assertLog(['Child', 'Effect 0']);

    await act(() => valueStore.update(1));
    assertLog(['Effect 1']);
  });

  // @gate enableStore
  it('takes the normal path when the previous render had more than one child', async () => {
    const showSiblingStore = createStore(true);
    function Parent() {
      const showSibling = use(showSiblingStore);
      const child = useMemo(() => <Text key="child" text="Child" />, []);
      return showSibling
        ? [child, <Text key="sibling" text="Sibling" />]
        : child;
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<Parent />));
    assertLog(['Child', 'Sibling']);

    await act(() => showSiblingStore.update(false));
    assertLog([]);
    expect(root).toMatchRenderedOutput('Child');
  });

  // @gate enableStore && enableProfilerTimer
  it('records the render time of a component that bailed out of its child', async () => {
    const valueStore = createStore(0);
    function Child() {
      Scheduler.unstable_advanceTime(5);
      return null;
    }
    function Parent() {
      const value = use(valueStore);
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

    await act(() => valueStore.update(1));
    assertLog(['Parent 1']);
    expect(onRender).toHaveBeenCalledTimes(2);
    // The parent rendered and the child didn't. The base duration still
    // includes the child's last render.
    expect(onRender.mock.calls[1].slice(1, 4)).toEqual(['update', 10, 15]);
  });
});
