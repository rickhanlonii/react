/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

// "Why did this render?" for components that read stores. use(store) can be
// called conditionally, so store reads are matched across renders by store,
// not by position.
//
// Cases are marked `@reactVersion >= 19.3`, so DevTools regression runs
// against older versions of React skip them.

import type Store from 'react-devtools-shared/src/devtools/store';

import {getVersionedRenderImplementation} from './utils';

describe('profiling store change detection', () => {
  let React;
  let store: Store;
  let utils;
  let createStore;

  beforeEach(() => {
    utils = require('./utils');
    utils.beforeEachProfiling();

    store = global.store;
    store.collapseNodesByDefault = false;
    store.recordChangeDescriptions = true;

    React = require('react');
    createStore = React.unstable_createStore;
  });

  const {render} = getVersionedRenderImplementation();

  function getChangedHooks() {
    const rootID = store.roots[0];
    return store.profilerStore
      .getDataForRoot(rootID)
      .commitData.map(commitData => {
        const descriptions = Array.from(commitData.changeDescriptions.values());
        expect(descriptions).toHaveLength(1);
        const {hooks, storeReads} = descriptions[0];
        return {hooks, storeReads: storeReads ?? []};
      });
  }

  // The component reads storeA only while its state includes 'a'. The two
  // stores have different values, so comparing storeA with storeB would
  // report a change.
  function createComponent(storeA, storeB) {
    let setState = null;
    function Component() {
      let state;
      [state, setState] = React.useState('abc');
      let result = state;
      if (state.includes('a')) {
        result += React.use(storeA);
      }
      result += React.use(storeB);
      return result;
    }
    return {
      Component,
      // inspectHooks() re-runs the component with a mock dispatcher, which
      // overwrites setState, so read it before profiling starts.
      getSetState: () => setState,
    };
  }

  // @reactVersion >= 19.3
  it('does not report a dropped store read as a change', () => {
    const storeA = createStore(1);
    const storeB = createStore(2);
    const {Component, getSetState} = createComponent(storeA, storeB);

    utils.act(() => render(<Component />));
    const setState = getSetState();

    utils.act(() => store.profilerStore.startProfiling());
    // Hooks: [state, storeA, storeB] -> [state, storeB]
    utils.act(() => setState('def'));
    utils.act(() => store.profilerStore.stopProfiling());

    expect(getChangedHooks()).toEqual([{hooks: [0], storeReads: []}]);
  });

  // @reactVersion >= 19.3
  it('does not report a newly added store read as a change of another hook', () => {
    const storeA = createStore(1);
    const storeB = createStore(2);
    const {Component, getSetState} = createComponent(storeA, storeB);

    utils.act(() => render(<Component />));
    const setState = getSetState();
    utils.act(() => setState('def'));

    utils.act(() => store.profilerStore.startProfiling());
    // Hooks: [state, storeB] -> [state, storeA, storeB]
    utils.act(() => setState('abc'));
    utils.act(() => store.profilerStore.stopProfiling());

    expect(getChangedHooks()).toEqual([{hooks: [0], storeReads: []}]);
  });

  // @reactVersion >= 19.3
  it('reports a store read in both renders at its position in the new render', () => {
    const storeA = createStore(1);
    const storeB = createStore(2);
    const {Component, getSetState} = createComponent(storeA, storeB);

    utils.act(() => render(<Component />));
    const setState = getSetState();
    utils.act(() => setState('def'));

    utils.act(() => store.profilerStore.startProfiling());
    // Hooks: [state, storeB] -> [state, storeA, storeB], and storeB changes.
    utils.act(() => {
      setState('abc');
      storeB.update(3);
    });
    // storeB is unchanged here.
    utils.act(() => setState('abd'));
    utils.act(() => store.profilerStore.stopProfiling());

    expect(getChangedHooks()).toEqual([
      {hooks: [0], storeReads: [1]},
      {hooks: [0], storeReads: []},
    ]);
  });

  // @reactVersion >= 19.3
  it('matches repeated reads of the same store in order', () => {
    const storeA = createStore(1);
    const storeB = createStore(2);
    function Component() {
      return [React.use(storeA), React.use(storeB), React.use(storeA)].join('');
    }

    utils.act(() => render(<Component />));

    utils.act(() => store.profilerStore.startProfiling());
    utils.act(() => storeA.update(4));
    utils.act(() => storeB.update(5));
    utils.act(() => store.profilerStore.stopProfiling());

    expect(getChangedHooks()).toEqual([
      {hooks: [], storeReads: [0, 2]},
      {hooks: [], storeReads: [1]},
    ]);
  });

  // Store reads have no id, so the ids of the hooks after them don't count
  // them.
  // @reactVersion >= 19.3
  it('reports a store read and a state hook after it separately', () => {
    const countStore = createStore(1);
    let setState = null;
    function Component() {
      const count = React.use(countStore);
      let state;
      [state, setState] = React.useState('a');
      return state + count;
    }

    utils.act(() => render(<Component />));
    const realSetState = setState;

    utils.act(() => store.profilerStore.startProfiling());
    utils.act(() => countStore.update(2));
    utils.act(() => realSetState('b'));
    utils.act(() => store.profilerStore.stopProfiling());

    expect(getChangedHooks()).toEqual([
      {hooks: [], storeReads: [0]},
      {hooks: [0], storeReads: []},
    ]);
  });

  // @reactVersion >= 19.3
  it('reports a store read in a custom hook', () => {
    const countStore = createStore(1);
    function useCount() {
      return React.use(countStore);
    }
    let setState = null;
    function Component() {
      let state;
      [state, setState] = React.useState('a');
      return state + useCount();
    }

    utils.act(() => render(<Component />));
    const realSetState = setState;

    utils.act(() => store.profilerStore.startProfiling());
    utils.act(() => countStore.update(2));
    utils.act(() => realSetState('b'));
    utils.act(() => store.profilerStore.stopProfiling());

    expect(getChangedHooks()).toEqual([
      {hooks: [], storeReads: [0]},
      {hooks: [0], storeReads: []},
    ]);
  });
});
