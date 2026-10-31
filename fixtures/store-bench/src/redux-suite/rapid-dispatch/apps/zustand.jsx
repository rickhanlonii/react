// Zustand: one store with the same shape as the Redux state, a selector per
// component, and a setState per action. There's no middleware, so the
// listener cascade is plain function calls: incrementA calls incrementB, and
// so on, each a separate setState.
//
// Port of the rapid-dispatch scenario from reduxjs/react-redux-benchmarks.
// Copyright (c) 2018 Redux, MIT License.

import {create} from 'zustand';
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

const useBench = create(() => ({}));

function ItemStatus({itemId}) {
  countRender();
  const item = useBench(counted(state => state.items.list[itemId]));
  return (
    <div>
      #{item.id} {item.status} ({item.value})
    </div>
  );
}

function CounterView() {
  countRender();
  const total = useBench(counted(state => state.counters.total));
  return <div>Total: {total}</div>;
}

function LastUpdated() {
  countRender();
  const lastUpdated = useBench(counted(state => state.items.lastUpdated));
  return <div>Updated: {lastUpdated}</div>;
}

function LogCount() {
  countRender();
  const count = useBench(counted(state => state.log.count));
  return <div>Logs: {count}</div>;
}

function App() {
  return (
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
  );
}

function updateItem(id, changes) {
  useBench.setState(state => ({
    items: {
      ...state.items,
      list: state.items.list.map(item =>
        item.id === id ? {...item, ...changes} : item
      ),
    },
  }));
}

function setStatus(id, status) {
  updateItem(id, {status});
}

function updateValue(id, value) {
  updateItem(id, {value});
}

function touch() {
  const time = now();
  useBench.setState(state => ({items: {...state.items, lastUpdated: time}}));
}

function updateCounters(update) {
  useBench.setState(state => ({counters: update(state.counters)}));
}

function incrementA() {
  updateCounters(c => ({...c, a: c.a + 1}));
  incrementB();
}

function incrementB() {
  updateCounters(c => ({...c, b: c.b + 1}));
  incrementC();
}

function incrementC() {
  updateCounters(c => ({...c, c: c.c + 1}));
  updateTotal();
  append(`cascade complete at ${now()}`);
}

function updateTotal() {
  updateCounters(c => ({...c, total: c.a + c.b + c.c}));
}

function append(entry) {
  useBench.setState(state => ({
    log: {entries: [...state.log.entries, entry], count: state.log.count + 1},
  }));
}

function createApp() {
  resetClock();
  useBench.setState(
    {
      items: {
        list: Array.from({length: NUM_ITEMS}).map((_, i) => ({
          id: i,
          value: 0,
          status: 'idle',
        })),
        lastUpdated: START_TIME,
      },
      counters: {a: 0, b: 0, c: 0, total: 0},
      log: {entries: [], count: 0},
    },
    true
  );
  return {
    App,
    actions: {
      syncBurst(id, value) {
        setStatus(id, 'pending');
        updateValue(id, value);
        setStatus(id, 'done');
        touch();
        incrementA();
      },
      thunkStart(id) {
        setStatus(id, 'pending');
      },
      thunkEnd(id, value) {
        updateValue(id, value);
        setStatus(id, 'done');
      },
      listenerCascade() {
        incrementA();
      },
    },
  };
}

startSuiteBench('zustand', createApp, scenarios);
