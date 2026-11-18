// Sweep app for use(store) with a keyed selection index: sweep-store.jsx, but
// each row reads whether it's selected from its own store, created on demand
// by a userland weakMemo (shared-memo.js). Selecting updates two of those
// stores, the previous and the next row's, so only those rows re-render. This
// is the use(store) equivalent of a selector (Solid's createSelector), and the
// same granularity as the store per entity.

import {use, unstable_createStore as createStore} from 'react';
import {
  WIDTH,
  WideRowView,
  WideRowViewNoMemo,
  addFields,
  isCompiledRow,
} from './sweep-views';
import {countRender} from '../shared/views';
import {startBench} from '../shared/harness';
import {weakMemo} from '../redux-suite/derived-selectors/shared-memo';

let s = null;

// One store per row id, holding whether that row is selected. Created per
// mount (createApp), so a remount doesn't see the last mount's selection.
let selectedStoreFor = null;

function Row4({id}) {
  countRender('row');
  const e = use(s.entities.get(id));
  const selected = use(selectedStoreFor(id));
  return <WideRowView selected={selected} label={e.label} x={e.x} y={e.y} />;
}

function Row4NoMemo({id}) {
  'use no memo';
  countRender('row');
  const e = use(s.entities.get(id));
  const selected = use(selectedStoreFor(id));
  return (
    <WideRowViewNoMemo selected={selected} label={e.label} x={e.x} y={e.y} />
  );
}

function Row8({id}) {
  countRender('row');
  const e = use(s.entities.get(id));
  const selected = use(selectedStoreFor(id));
  return (
    <WideRowView
      selected={selected}
      label={e.label}
      x={e.x}
      y={e.y}
      color={e.color}
      f0={e.f0}
      f1={e.f1}
      f2={e.f2}
    />
  );
}

function Row8NoMemo({id}) {
  'use no memo';
  countRender('row');
  const e = use(s.entities.get(id));
  const selected = use(selectedStoreFor(id));
  return (
    <WideRowViewNoMemo
      selected={selected}
      label={e.label}
      x={e.x}
      y={e.y}
      color={e.color}
      f0={e.f0}
      f1={e.f1}
      f2={e.f2}
    />
  );
}

function Row16({id}) {
  countRender('row');
  const e = use(s.entities.get(id));
  const selected = use(selectedStoreFor(id));
  return (
    <WideRowView
      selected={selected}
      label={e.label}
      x={e.x}
      y={e.y}
      color={e.color}
      f0={e.f0}
      f1={e.f1}
      f2={e.f2}
      f3={e.f3}
      f4={e.f4}
      f5={e.f5}
      f6={e.f6}
      f7={e.f7}
      f8={e.f8}
      f9={e.f9}
      f10={e.f10}
    />
  );
}

function Row16NoMemo({id}) {
  'use no memo';
  countRender('row');
  const e = use(s.entities.get(id));
  const selected = use(selectedStoreFor(id));
  return (
    <WideRowViewNoMemo
      selected={selected}
      label={e.label}
      x={e.x}
      y={e.y}
      color={e.color}
      f0={e.f0}
      f1={e.f1}
      f2={e.f2}
      f3={e.f3}
      f4={e.f4}
      f5={e.f5}
      f6={e.f6}
      f7={e.f7}
      f8={e.f8}
      f9={e.f9}
      f10={e.f10}
    />
  );
}

const Row = WIDTH === 4 ? Row4 : WIDTH === 8 ? Row8 : Row16;
const RowNoMemo =
  WIDTH === 4 ? Row4NoMemo : WIDTH === 8 ? Row8NoMemo : Row16NoMemo;

function List({ids}) {
  return (
    <ul>
      {ids.map((id, index) =>
        isCompiledRow(index) ? (
          <Row key={id} id={id} />
        ) : (
          <RowNoMemo key={id} id={id} />
        )
      )}
    </ul>
  );
}

function App() {
  return <List ids={use(s.ids)} />;
}

function createApp(initialEntities) {
  const entities = new Map();
  for (const entity of addFields(initialEntities)) {
    entities.set(entity.id, createStore(entity));
  }
  s = {
    entities,
    ids: createStore(initialEntities.map(e => e.id)),
    selectedId: null,
  };
  selectedStoreFor = weakMemo(id => createStore(false));
  const actions = {
    editEntity(index) {
      s.entities.get('e' + index).update(e => ({...e, x: e.x + 1}));
    },
    select(index) {
      const next = 'e' + index;
      const prev = s.selectedId;
      if (prev === next) {
        return;
      }
      if (prev !== null) {
        selectedStoreFor(prev).update(false);
      }
      selectedStoreFor(next).update(true);
      s.selectedId = next;
    },
  };
  return {App, actions};
}

startBench('sweep-store-keyed', createApp);
