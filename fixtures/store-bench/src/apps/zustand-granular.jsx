// Control: zustand with a store per entity (like the granular use(store)
// variant), and one store for shared state. This separates the effect of
// granular stores from the effect of the store implementation.

import {startTransition} from 'react';
import {create, useStore} from 'zustand';
import {createStore} from 'zustand/vanilla';
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

const useShared = create(() => ({}));
const box = {entities: null, detailsMode: 'inline'};

function Details() {
  return <DetailsView details={useShared(counted(s => s.details))} />;
}

const selectEntity = counted(s => s);

function Row({id}) {
  countRender('row');
  const entity = useStore(box.entities.get(id), selectEntity);
  const selected = useShared(counted(s => s.selected === id));
  const matches = useShared(
    counted(s => matchesFilter(entity.label, s.filter))
  );
  const expanded = useShared(counted(s => s.expanded[id] === true));
  const inlineDetails = useShared(
    counted(s =>
      box.detailsMode === 'inline' && s.expanded[id] === true ? s.details : null
    )
  );
  return (
    <RowView
      label={entity.label}
      x={entity.x}
      y={entity.y}
      color={entity.color}
      selected={selected}
      matches={matches}
      details={expanded && box.detailsMode === 'inline' ? inlineDetails : null}>
      {expanded && box.detailsMode === 'component' ? <Details /> : null}
    </RowView>
  );
}

function selectCount(state) {
  let count = 0;
  for (let i = 0; i < state.labels.length; i++) {
    if (matchesFilter(state.labels[i], state.filter)) {
      count++;
    }
  }
  return count;
}

function Count() {
  return <CountView count={useShared(counted(selectCount))} />;
}

function onFilterChange(value) {
  useShared.setState({filterInput: value});
  startTransition(() => {
    useShared.setState({filter: value});
  });
}

function Filter() {
  return (
    <FilterInput
      value={useShared(counted(s => s.filterInput))}
      onChange={onFilterChange}
    />
  );
}

function App() {
  const ids = useShared(counted(s => s.ids));
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
  box.detailsMode = options.details || 'inline';
  box.entities = new Map();
  for (let i = 0; i < initialEntities.length; i++) {
    box.entities.set(
      initialEntities[i].id,
      createStore(() => initialEntities[i])
    );
  }
  useShared.setState(
    {
      ids: initialEntities.map(e => e.id),
      labels: initialEntities.map(e => e.label),
      selected: null,
      filter: '',
      filterInput: '',
      expanded: {},
      details: 0,
    },
    true
  );
  let nextIndex = initialEntities.length;
  const added = [];

  const actions = {
    editEntity(index) {
      box.entities.get('e' + index).setState(e => ({...e, x: e.x + 1}), true);
    },
    select(index) {
      useShared.setState({selected: 'e' + index});
    },
    setFilter(value) {
      useShared.setState({filter: value, filterInput: value});
    },
    expandEvery(k, n) {
      const expanded = {};
      for (let i = 0; i < n; i += k) {
        expanded['e' + i] = true;
      }
      useShared.setState({expanded});
    },
    tickDetails() {
      useShared.setState(s => ({details: s.details + 1}));
    },
    add() {
      const entity = createEntity(nextIndex++);
      added.push(entity.id);
      box.entities.set(
        entity.id,
        createStore(() => entity)
      );
      useShared.setState(s => ({
        ids: [...s.ids, entity.id],
        labels: [...s.labels, entity.label],
      }));
    },
    removeLast() {
      const id = added.pop();
      useShared.setState(s => ({
        ids: s.ids.filter(other => other !== id),
        labels: s.labels.slice(0, -1),
      }));
    },
  };

  return {App, actions};
}

startBench('zustand-granular', createApp);
