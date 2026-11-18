// Redux: the rapid-dispatch scenario from reduxjs/react-redux-benchmarks
// (src/scenarios/rapid-dispatch), maintained by the Redux team.
// Copyright (c) 2018 Redux, MIT License.
//
// state.ts, listenerMiddleware.ts, dispatchers.ts, components.tsx and App.tsx
// are kept as written, converted from TS to JSX. Changes:
// - Date.now() is the harness clock (now(), START_TIME) so timestamps match.
// - The dispatchers take the item ID and value from the harness schedule
//   instead of Math.random(), and thunkBurst's setTimeout part is its own
//   step (thunkEnd).
// - The store and listener middleware are created per mount, the dispatch
//   timing middleware and <Profiler> are dropped (the harness times each
//   task in flushSync), and counted() wraps selectors in the counting build.

import React from 'react';
import {
  combineReducers,
  configureStore,
  createListenerMiddleware,
  createSlice,
} from '@reduxjs/toolkit';
import {Provider, useSelector} from 'react-redux';
import {startSuiteBench} from '../../common/harness';
import {countRender, counted} from '../../common/instrument';
import {now, resetClock, START_TIME} from '../clock';
import {scenarios} from '../scenarios';
import {
  NUM_ITEMS,
  ITEM_STATUS_COUNT,
  COUNTER_VIEW_COUNT,
  LAST_UPDATED_COUNT,
  LOG_COUNT_COUNT,
} from '../constants';

// ---------------------------------------------------------------- state.ts

const initialItems = Array.from({length: NUM_ITEMS}).map((_, i) => ({
  id: i,
  value: 0,
  status: 'idle',
}));

const itemsSlice = createSlice({
  name: 'items',
  initialState: {
    list: initialItems,
    lastUpdated: START_TIME,
  },
  reducers: {
    setStatus(state, action) {
      const item = state.list.find(i => i.id === action.payload.id);
      if (item) item.status = action.payload.status;
    },
    updateValue(state, action) {
      const item = state.list.find(i => i.id === action.payload.id);
      if (item) item.value = action.payload.value;
    },
    touch(state) {
      state.lastUpdated = now();
    },
  },
});

const countersSlice = createSlice({
  name: 'counters',
  initialState: {
    a: 0,
    b: 0,
    c: 0,
    total: 0,
  },
  reducers: {
    incrementA(state) {
      state.a += 1;
    },
    incrementB(state) {
      state.b += 1;
    },
    incrementC(state) {
      state.c += 1;
    },
    updateTotal(state) {
      state.total = state.a + state.b + state.c;
    },
  },
});

const logSlice = createSlice({
  name: 'log',
  initialState: {
    entries: [],
    count: 0,
  },
  reducers: {
    append(state, action) {
      state.entries.push(action.payload);
      state.count += 1;
    },
  },
});

const rootReducer = combineReducers({
  items: itemsSlice.reducer,
  counters: countersSlice.reducer,
  log: logSlice.reducer,
});

const {setStatus, updateValue, touch} = itemsSlice.actions;
const {incrementA, incrementB, incrementC, updateTotal} = countersSlice.actions;
const {append} = logSlice.actions;

// ---------------------------------------------------------------- listenerMiddleware.ts

function createCascadeListeners() {
  const listenerMiddleware = createListenerMiddleware();
  const startListening = listenerMiddleware.startListening;

  startListening({
    actionCreator: incrementA,
    effect: async (_action, listenerApi) => {
      listenerApi.dispatch(incrementB());
    },
  });

  startListening({
    actionCreator: incrementB,
    effect: async (_action, listenerApi) => {
      listenerApi.dispatch(incrementC());
    },
  });

  startListening({
    actionCreator: incrementC,
    effect: async (_action, listenerApi) => {
      listenerApi.dispatch(updateTotal());
      listenerApi.dispatch(append(`cascade complete at ${now()}`));
    },
  });

  return listenerMiddleware;
}

// ---------------------------------------------------------------- dispatchers.ts

function syncBurst(store, id, value) {
  store.dispatch(setStatus({id, status: 'pending'}));
  store.dispatch(updateValue({id, value}));
  store.dispatch(setStatus({id, status: 'done'}));
  store.dispatch(touch());
  store.dispatch(incrementA());
}

function thunkBurst(store, id) {
  store.dispatch(setStatus({id, status: 'pending'}));
}

// The setTimeout(0) half of thunkBurst.
function thunkBurstTimeout(store, id, value) {
  store.dispatch(updateValue({id, value}));
  store.dispatch(setStatus({id, status: 'done'}));
}

function listenerCascade(store) {
  store.dispatch(incrementA());
}

// ---------------------------------------------------------------- components.tsx

const ItemStatus = React.memo(function ItemStatus({itemId}) {
  countRender();
  const item = useSelector(counted(state => state.items.list[itemId]));
  return (
    <div>
      #{item.id} {item.status} ({item.value})
    </div>
  );
});

const CounterView = React.memo(function CounterView() {
  countRender();
  const total = useSelector(counted(state => state.counters.total));
  return <div>Total: {total}</div>;
});

const LastUpdated = React.memo(function LastUpdated() {
  countRender();
  const lastUpdated = useSelector(counted(state => state.items.lastUpdated));
  return <div>Updated: {lastUpdated}</div>;
});

const LogCount = React.memo(function LogCount() {
  countRender();
  const count = useSelector(counted(state => state.log.count));
  return <div>Logs: {count}</div>;
});

// ---------------------------------------------------------------- App.tsx

let store = null;

function App() {
  return (
    <Provider store={store}>
      <div>
        <div>
          {Array.from({length: ITEM_STATUS_COUNT}).map((_, i) => (
            <ItemStatus key={i} itemId={i} />
          ))}
        </div>
        <div>
          {Array.from({length: COUNTER_VIEW_COUNT}).map((_, i) => (
            <CounterView key={i} />
          ))}
        </div>
        <div>
          {Array.from({length: LAST_UPDATED_COUNT}).map((_, i) => (
            <LastUpdated key={i} />
          ))}
        </div>
        <div>
          {Array.from({length: LOG_COUNT_COUNT}).map((_, i) => (
            <LogCount key={i} />
          ))}
        </div>
      </div>
    </Provider>
  );
}

// ---------------------------------------------------------------- index.tsx

function createApp() {
  resetClock();
  const listenerMiddleware = createCascadeListeners();
  store = configureStore({
    reducer: rootReducer,
    middleware: gdm =>
      gdm({
        immutabilityCheck: false,
        serializableCheck: false,
      }).prepend(listenerMiddleware.middleware),
  });
  return {
    App,
    actions: {
      syncBurst: (id, value) => syncBurst(store, id, value),
      thunkStart: id => thunkBurst(store, id),
      thunkEnd: (id, value) => thunkBurstTimeout(store, id, value),
      listenerCascade: () => listenerCascade(store),
    },
  };
}

startSuiteBench('redux', createApp, scenarios);
