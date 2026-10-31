// Sweep app for Redux: RTK slice and inline useSelector selectors, like
// redux.jsx, with rows of __WIDTH__ props and __COVERAGE__% compiled rows (see
// sweep-views.jsx). Only supports the entity and selection scenarios.

import {configureStore, createSlice} from '@reduxjs/toolkit';
import {Provider, useSelector} from 'react-redux';
import {
  WIDTH,
  WideRowView,
  WideRowViewNoMemo,
  addFields,
  isCompiledRow,
} from './sweep-views';
import {countRender, counted} from '../shared/views';
import {startBench} from '../shared/harness';

const slice = createSlice({
  name: 'sweep',
  initialState: null,
  reducers: {
    editEntity(state, action) {
      state.entities['e' + action.payload].x += 1;
    },
    select(state, action) {
      state.selected = 'e' + action.payload;
    },
  },
});

let store = null;

function Row4({id}) {
  countRender('row');
  const e = useSelector(counted(s => s.entities[id]));
  const selected = useSelector(counted(s => s.selected === id));
  return <WideRowView selected={selected} label={e.label} x={e.x} y={e.y} />;
}

function Row4NoMemo({id}) {
  'use no memo';
  countRender('row');
  const e = useSelector(counted(s => s.entities[id]));
  const selected = useSelector(counted(s => s.selected === id));
  return (
    <WideRowViewNoMemo selected={selected} label={e.label} x={e.x} y={e.y} />
  );
}

function Row8({id}) {
  countRender('row');
  const e = useSelector(counted(s => s.entities[id]));
  const selected = useSelector(counted(s => s.selected === id));
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
  const e = useSelector(counted(s => s.entities[id]));
  const selected = useSelector(counted(s => s.selected === id));
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
  const e = useSelector(counted(s => s.entities[id]));
  const selected = useSelector(counted(s => s.selected === id));
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
  const e = useSelector(counted(s => s.entities[id]));
  const selected = useSelector(counted(s => s.selected === id));
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

function Rows() {
  return <List ids={useSelector(counted(s => s.ids))} />;
}

function App() {
  return (
    <Provider store={store}>
      <Rows />
    </Provider>
  );
}

function createApp(initialEntities) {
  const entities = {};
  for (const entity of addFields(initialEntities)) {
    entities[entity.id] = entity;
  }
  store = configureStore({
    reducer: slice.reducer,
    preloadedState: {
      entities,
      ids: initialEntities.map(e => e.id),
      selected: null,
    },
  });
  const actions = {
    editEntity: index => store.dispatch(slice.actions.editEntity(index)),
    select: index => store.dispatch(slice.actions.select(index)),
  };
  return {App, actions};
}

startBench('sweep-redux', createApp);
