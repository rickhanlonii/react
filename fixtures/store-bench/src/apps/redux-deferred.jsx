// Typing control for `redux`: the idiomatic answer to useSyncExternalStore
// rendering transitions synchronously. The filter is one urgent value, and the
// list reads it through useDeferredValue, so the expensive re-filter renders
// in the background. Rows get the deferred filter as a prop, and the list is
// memoized so the urgent render stops at the list. Only meant for the typing
// scenario: under flushSync the deferred render hasn't happened yet. Details
// are always read in a child component (no details-inline).

import {memo, useDeferredValue, useMemo} from 'react';
import {configureStore, createSlice} from '@reduxjs/toolkit';
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

function Details() {
  return <DetailsView details={useSelector(counted(s => s.details))} />;
}

function Row({id, filter}) {
  countRender('row');
  const entity = useSelector(counted(s => s.entities[id]));
  const selected = useSelector(counted(s => s.selected === id));
  const matches = matchesFilter(entity.label, filter);
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

function Count() {
  const labels = useSelector(counted(s => s.labels));
  const filter = useDeferredValue(useSelector(counted(s => s.filter)));
  const count = useMemo(() => {
    let count = 0;
    for (let i = 0; i < labels.length; i++) {
      if (matchesFilter(labels[i], filter)) {
        count++;
      }
    }
    return count;
  }, [labels, filter]);
  return <CountView count={count} />;
}

function Filter() {
  const value = useSelector(counted(s => s.filterInput));
  const dispatch = useDispatch();
  return (
    <FilterInput
      value={value}
      onChange={next => {
        dispatch(a.setFilter(next));
      }}
    />
  );
}

const Rows = memo(function Rows({ids, filter}) {
  return (
    <ul>
      {ids.map(id => (
        <Row key={id} id={id} filter={filter} />
      ))}
    </ul>
  );
});

function List() {
  const ids = useSelector(counted(s => s.ids));
  const filter = useDeferredValue(useSelector(counted(s => s.filter)));
  return <Rows ids={ids} filter={filter} />;
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

function createApp(initialEntities) {
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

startBench('redux-deferred', createApp);
