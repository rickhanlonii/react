// use(store), idiomatic: a store per entity plus small stores for shared state.

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

let s = null;

function Details() {
  return <DetailsView details={use(s.details)} />;
}

function Row({id}) {
  countRender('row');
  const entity = use(s.entities.get(id));
  const selected = use(s.selected) === id;
  const matches = matchesFilter(entity.label, use(s.filter));
  const expanded = use(s.expanded).has(id);
  let details = null;
  let children = null;
  if (expanded) {
    if (s.detailsMode === 'component') {
      children = <Details />;
    } else {
      // Read conditionally: rows that aren't expanded don't subscribe.
      details = use(s.details);
    }
  }
  return (
    <RowView
      label={entity.label}
      x={entity.x}
      y={entity.y}
      color={entity.color}
      selected={selected}
      matches={matches}
      details={details}>
      {children}
    </RowView>
  );
}

function Count() {
  const labels = use(s.labels);
  const filter = use(s.filter);
  let count = 0;
  for (let i = 0; i < labels.length; i++) {
    if (matchesFilter(labels[i], filter)) {
      count++;
    }
  }
  return <CountView count={count} />;
}

function onFilterChange(value) {
  s.filterInput.update(value);
  startTransition(() => {
    s.filter.update(value);
  });
}

function Filter() {
  return <FilterInput value={use(s.filterInput)} onChange={onFilterChange} />;
}

function App() {
  const ids = use(s.ids);
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
  const entities = new Map();
  for (let i = 0; i < initialEntities.length; i++) {
    entities.set(initialEntities[i].id, createStore(initialEntities[i]));
  }
  s = {
    entities,
    ids: createStore(initialEntities.map(e => e.id)),
    labels: createStore(initialEntities.map(e => e.label)),
    selected: createStore(null),
    filter: createStore(''),
    filterInput: createStore(''),
    expanded: createStore(new Set()),
    details: createStore(0),
    detailsMode: options.details,
  };
  let nextIndex = initialEntities.length;
  const added = [];

  const actions = {
    editEntity(index) {
      s.entities.get('e' + index).update(e => ({...e, x: e.x + 1}));
    },
    select(index) {
      s.selected.update('e' + index);
    },
    setFilter(value) {
      s.filterInput.update(value);
      s.filter.update(value);
    },
    expandEvery(k, n) {
      const set = new Set();
      for (let i = 0; i < n; i += k) {
        set.add('e' + i);
      }
      s.expanded.update(set);
    },
    tickDetails() {
      s.details.update(d => d + 1);
    },
    add() {
      const entity = createEntity(nextIndex++);
      added.push(entity.id);
      s.entities.set(entity.id, createStore(entity));
      s.ids.update(ids => [...ids, entity.id]);
      s.labels.update(labels => [...labels, entity.label]);
    },
    removeLast() {
      const id = added.pop();
      s.entities.delete(id);
      s.ids.update(ids => ids.filter(other => other !== id));
      s.labels.update(labels => labels.slice(0, -1));
    },
  };

  return {App, actions};
}

startBench('store', createApp);
