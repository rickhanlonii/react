// use(store) with one store for all state and no selectors. This is the worst
// case for stores: every update re-renders every reader, and only the
// compiler's memoization keeps the work down.

import {use, unstable_createStore as createStore, startTransition} from 'react';
import {startBench} from '../shared/harness';
import {
  RowView,
  DetailsView,
  FilterInput,
  CountView,
  countRender,
} from '../shared/views';
import {createEntity, matchesFilter} from '../shared/data';

let store = null;
let detailsMode = 'inline';

function Details() {
  return <DetailsView details={use(store).details} />;
}

function Row({id}) {
  countRender('row');
  const state = use(store);
  const entity = state.entities[id];
  const expanded = state.expanded[id] === true;
  let details = null;
  let children = null;
  if (expanded) {
    if (detailsMode === 'component') {
      children = <Details />;
    } else {
      details = state.details;
    }
  }
  return (
    <RowView
      label={entity.label}
      x={entity.x}
      y={entity.y}
      color={entity.color}
      selected={state.selected === id}
      matches={matchesFilter(entity.label, state.filter)}
      details={details}>
      {children}
    </RowView>
  );
}

function Count() {
  const {labels, filter} = use(store);
  let count = 0;
  for (let i = 0; i < labels.length; i++) {
    if (matchesFilter(labels[i], filter)) {
      count++;
    }
  }
  return <CountView count={count} />;
}

function onFilterChange(value) {
  store.update(state => ({...state, filterInput: value}));
  startTransition(() => {
    store.update(state => ({...state, filter: value}));
  });
}

function Filter() {
  return (
    <FilterInput value={use(store).filterInput} onChange={onFilterChange} />
  );
}

function App() {
  const ids = use(store).ids;
  return (
    <div>
      <Filter />
      <Count />
      <ul>
        {ids.map(id => (
          <Row key={id} id={id} />
        ))}
      </ul>
    </div>
  );
}

function createApp(initialEntities, options) {
  const entities = {};
  for (let i = 0; i < initialEntities.length; i++) {
    entities[initialEntities[i].id] = initialEntities[i];
  }
  detailsMode = options.details || 'inline';
  store = createStore({
    entities,
    ids: initialEntities.map(e => e.id),
    labels: initialEntities.map(e => e.label),
    selected: null,
    filter: '',
    filterInput: '',
    expanded: {},
    details: 0,
  });
  let nextIndex = initialEntities.length;
  const added = [];

  const actions = {
    editEntity(index) {
      const id = 'e' + index;
      store.update(state => ({
        ...state,
        entities: {
          ...state.entities,
          [id]: {...state.entities[id], x: state.entities[id].x + 1},
        },
      }));
    },
    select(index) {
      store.update(state => ({...state, selected: 'e' + index}));
    },
    setFilter(value) {
      store.update(state => ({...state, filter: value, filterInput: value}));
    },
    expandEvery(k, n) {
      const expanded = {};
      for (let i = 0; i < n; i += k) {
        expanded['e' + i] = true;
      }
      store.update(state => ({...state, expanded}));
    },
    tickDetails() {
      store.update(state => ({...state, details: state.details + 1}));
    },
    add() {
      const entity = createEntity(nextIndex++);
      added.push(entity.id);
      store.update(state => ({
        ...state,
        entities: {...state.entities, [entity.id]: entity},
        ids: [...state.ids, entity.id],
        labels: [...state.labels, entity.label],
      }));
    },
    removeLast() {
      const id = added.pop();
      store.update(state => {
        const nextEntities = {...state.entities};
        delete nextEntities[id];
        return {
          ...state,
          entities: nextEntities,
          ids: state.ids.filter(other => other !== id),
          labels: state.labels.slice(0, -1),
        };
      });
    },
  };

  return {App, actions};
}

startBench('store-single', createApp);
