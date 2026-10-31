// Redux: the many-components-same-slice scenario from
// reduxjs/react-redux-benchmarks, maintained by the Redux team.
// Copyright (c) 2018 Redux, MIT License.
//
// stateSlice.ts and App.tsx are kept as written, converted from TS to JSX. The
// store is created per mount, the dispatch timing middleware and <Profiler>
// are dropped (the harness times each update in flushSync), and counted()
// wraps the selector in the counting build.

import {configureStore, createSlice} from '@reduxjs/toolkit';
import {Provider, useSelector} from 'react-redux';
import {startSuiteBench} from '../../common/harness';
import {countRender, counted} from '../../common/instrument';
import {scenarios, NUMBER_OF_COMPONENTS} from '../scenarios';

// ---------------------------------------------------------------- stateSlice.ts

const {reducer, actions} = createSlice({
  name: 'counter',
  initialState: {
    counter: 0,
  },
  reducers: {
    increment(state) {
      state.counter += 1;
    },
  },
});

const {increment} = actions;

// ---------------------------------------------------------------- App.tsx

function Component() {
  countRender();
  const counter = useSelector(counted(state => state.counter));

  return <div>{counter}</div>;
}

let store = null;

function App() {
  return (
    <Provider store={store}>
      <div>
        {Array.from({length: NUMBER_OF_COMPONENTS}).map((_, index) => (
          <Component key={index} />
        ))}
      </div>
    </Provider>
  );
}

// ---------------------------------------------------------------- index.tsx

function createApp() {
  store = configureStore({
    reducer,
    middleware: gdm =>
      gdm({
        immutabilityCheck: false,
        serializableCheck: false,
      }),
  });
  return {
    App,
    actions: {
      increment() {
        store.dispatch(increment());
      },
    },
  };
}

startSuiteBench('redux', createApp, scenarios);
