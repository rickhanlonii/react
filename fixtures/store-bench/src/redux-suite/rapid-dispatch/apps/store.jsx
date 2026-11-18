// use(store), idiomatic: a store per item, and a store for each of the other
// slices (lastUpdated, counters, log). There's no middleware, so the listener
// cascade is plain function calls: incrementA calls incrementB, and so on,
// each updating the counters store.
//
// Port of the rapid-dispatch scenario from reduxjs/react-redux-benchmarks.
// Copyright (c) 2018 Redux, MIT License.

import {use, unstable_createStore as createStore} from 'react';
import {startSuiteBench} from '../../common/harness';
import {countRender} from '../../common/instrument';
import {now, resetClock, START_TIME} from '../clock';
import {scenarios} from '../scenarios';
import {
  NUM_ITEMS,
  ITEM_STATUS_COUNT,
  COUNTER_VIEW_COUNT,
  LAST_UPDATED_COUNT,
  LOG_COUNT_COUNT,
} from '../constants';

let s = null;

function ItemStatus({itemId}) {
  countRender();
  const item = use(s.items[itemId]);
  return (
    <div>
      #{item.id} {item.status} ({item.value})
    </div>
  );
}

function CounterView() {
  countRender();
  return <div>Total: {use(s.counters).total}</div>;
}

function LastUpdated() {
  countRender();
  return <div>Updated: {use(s.lastUpdated)}</div>;
}

function LogCount() {
  countRender();
  return <div>Logs: {use(s.log).count}</div>;
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

function setStatus(id, status) {
  s.items[id].update(item => ({...item, status}));
}

function updateValue(id, value) {
  s.items[id].update(item => ({...item, value}));
}

function touch() {
  s.lastUpdated.update(now());
}

function incrementA() {
  s.counters.update(c => ({...c, a: c.a + 1}));
  incrementB();
}

function incrementB() {
  s.counters.update(c => ({...c, b: c.b + 1}));
  incrementC();
}

function incrementC() {
  s.counters.update(c => ({...c, c: c.c + 1}));
  updateTotal();
  append(`cascade complete at ${now()}`);
}

function updateTotal() {
  s.counters.update(c => ({...c, total: c.a + c.b + c.c}));
}

function append(entry) {
  s.log.update(log => ({
    entries: [...log.entries, entry],
    count: log.count + 1,
  }));
}

function createApp() {
  resetClock();
  s = {
    items: Array.from({length: NUM_ITEMS}).map((_, i) =>
      createStore({id: i, value: 0, status: 'idle'})
    ),
    lastUpdated: createStore(START_TIME),
    counters: createStore({a: 0, b: 0, c: 0, total: 0}),
    log: createStore({entries: [], count: 0}),
  };
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

startSuiteBench('store', createApp, scenarios);
