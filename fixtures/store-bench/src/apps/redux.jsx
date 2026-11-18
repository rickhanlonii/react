// Redux Toolkit + react-redux, written the way their docs recommend: a slice
// with Immer updates, inline useSelector selectors, and createSelector for
// derived data. Every mounted selector runs on every dispatch.

import {startTransition} from 'react';
import {configureStore, createSlice, createSelector} from '@reduxjs/toolkit';
import {Provider, useSelector, useDispatch} from 'react-redux';
import {startBench} from '../shared/harness';
import {
  RowView,
  DetailsView,
  FilterInput,
  CountView,
  countRender,
  counted,
} from '../shared/views';
import {createEntity, matchesFilter} from '../shared/data';
import {createInitialState} from '../shared/updates';

const slice = createSlice({
  name: 'bench',
  initialState: null,
  reducers: {
    reset: (state, action) => action.payload,
    editEntity(state, action) {
      state.entities['e' + action.payload].x += 1;
    },
    select(state, action) {
      state.selected = 'e' + action.payload;
    },
    setFilter(state, action) {
      state.filter = action.payload;
      state.filterInput = action.payload;
    },
    setFilterInput(state, action) {
      state.filterInput = action.payload;
    },
    setListFilter(state, action) {
      state.filter = action.payload;
    },
    expandEvery(state, action) {
      const {k, n} = action.payload;
      const expanded = {};
      for (let i = 0; i < n; i += k) {
        expanded['e' + i] = true;
      }
      state.expanded = expanded;
    },
    tickDetails(state) {
      state.details += 1;
    },
    add(state) {
      const entity = createEntity(state.nextIndex);
      state.entities[entity.id] = entity;
      state.ids.push(entity.id);
      state.labels.push(entity.label);
      state.nextIndex += 1;
      state.added.push(entity.id);
    },
    removeLast(state) {
      const id = state.added.pop();
      delete state.entities[id];
      state.ids = state.ids.filter(other => other !== id);
      state.labels.pop();
    },
  },
});

const a = slice.actions;
let store = null;
let detailsMode = 'component';

const selectCount = createSelector(
  [state => state.labels, state => state.filter],
  (labels, filter) => {
    let count = 0;
    for (let i = 0; i < labels.length; i++) {
      if (matchesFilter(labels[i], filter)) {
        count++;
      }
    }
    return count;
  }
);

function Details() {
  return <DetailsView details={useSelector(counted(s => s.details))} />;
}

function Row({id}) {
  countRender('row');
  const entity = useSelector(counted(s => s.entities[id]));
  const selected = useSelector(counted(s => s.selected === id));
  const matches = useSelector(
    counted(s => matchesFilter(s.entities[id].label, s.filter))
  );
  const expanded = useSelector(counted(s => s.expanded[id] === true));
  return (
    <RowView
      label={entity.label}
      x={entity.x}
      y={entity.y}
      color={entity.color}
      selected={selected}
      matches={matches}
      details={null}>
      {expanded ? <Details /> : null}
    </RowView>
  );
}

// The row for details-inline, which shows the details in the row itself.
// Hooks can't be called conditionally, so every row subscribes to details,
// and selects null when it isn't expanded.
function RowWithInlineDetails({id}) {
  countRender('row');
  const entity = useSelector(counted(s => s.entities[id]));
  const selected = useSelector(counted(s => s.selected === id));
  const matches = useSelector(
    counted(s => matchesFilter(s.entities[id].label, s.filter))
  );
  const details = useSelector(
    counted(s => (s.expanded[id] === true ? s.details : null))
  );
  return (
    <RowView
      label={entity.label}
      x={entity.x}
      y={entity.y}
      color={entity.color}
      selected={selected}
      matches={matches}
      details={details}
    />
  );
}

function Count() {
  return <CountView count={useSelector(counted(selectCount))} />;
}

function Filter() {
  const value = useSelector(counted(s => s.filterInput));
  const dispatch = useDispatch();
  return (
    <FilterInput
      value={value}
      onChange={next => {
        dispatch(a.setFilterInput(next));
        // useSyncExternalStore renders this synchronously even in a
        // transition, so it can't keep the input responsive.
        startTransition(() => {
          dispatch(a.setListFilter(next));
        });
      }}
    />
  );
}

function List() {
  const ids = useSelector(counted(s => s.ids));
  const ListRow = detailsMode === 'inline' ? RowWithInlineDetails : Row;
  return (
    <ul>
      {ids.map(id => (
        <ListRow key={id} id={id} />
      ))}
    </ul>
  );
}

function App() {
  return (
    <Provider store={store}>
      <div>
        <Filter />
        <Count />
        <List />
      </div>
    </Provider>
  );
}

function createApp(initialEntities, options) {
  detailsMode = options.details;
  store = configureStore({
    reducer: slice.reducer,
    preloadedState: createInitialState(initialEntities),
  });
  const dispatch = action => store.dispatch(action);
  const actions = {
    editEntity: index => dispatch(a.editEntity(index)),
    select: index => dispatch(a.select(index)),
    setFilter: value => dispatch(a.setFilter(value)),
    expandEvery: (k, n) => dispatch(a.expandEvery({k, n})),
    tickDetails: () => dispatch(a.tickDetails()),
    add: () => dispatch(a.add()),
    removeLast: () => dispatch(a.removeLast()),
  };
  return {App, actions};
}

startBench('redux', createApp);
