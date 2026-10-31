// Zustand, written the way its docs recommend: one store, a selector per
// component. Every mounted selector runs on every update.

import {startTransition} from 'react';
import {create} from 'zustand';
import {startBench} from '../shared/harness';
import {
  RowView,
  DetailsView,
  FilterInput,
  CountView,
  countRender,
  counted,
} from '../shared/views';
import {matchesFilter} from '../shared/data';
import {createInitialState, updates} from '../shared/updates';

const useBench = create(() => ({}));
let detailsMode = 'inline';

function update(name, payload) {
  useBench.setState(state => updates[name](state, payload), true);
}

function Details() {
  return <DetailsView details={useBench(counted(s => s.details))} />;
}

function Row({id}) {
  countRender('row');
  const entity = useBench(counted(s => s.entities[id]));
  const selected = useBench(counted(s => s.selected === id));
  const matches = useBench(
    counted(s => matchesFilter(s.entities[id].label, s.filter))
  );
  const expanded = useBench(counted(s => s.expanded[id] === true));
  // Hooks can't be called conditionally, so every row subscribes to details.
  const inlineDetails = useBench(
    counted(s =>
      detailsMode === 'inline' && s.expanded[id] === true ? s.details : null
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
      details={expanded && detailsMode === 'inline' ? inlineDetails : null}>
      {expanded && detailsMode === 'component' ? <Details /> : null}
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
  return <CountView count={useBench(counted(selectCount))} />;
}

function onFilterChange(value) {
  update('setFilterInput', value);
  // useSyncExternalStore renders this synchronously even in a transition.
  startTransition(() => {
    update('setListFilter', value);
  });
}

function Filter() {
  return (
    <FilterInput
      value={useBench(counted(s => s.filterInput))}
      onChange={onFilterChange}
    />
  );
}

function App() {
  const ids = useBench(counted(s => s.ids));
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
  detailsMode = options.details || 'inline';
  useBench.setState(createInitialState(initialEntities), true);
  const actions = {
    editEntity: index => update('editEntity', index),
    select: index => update('select', index),
    setFilter: value => update('setFilter', value),
    expandEvery: (k, n) => update('expandEvery', {k, n}),
    tickDetails: () => update('tickDetails'),
    add: () => update('add'),
    removeLast: () => update('removeLast'),
  };
  return {App, actions};
}

startBench('zustand', createApp);
