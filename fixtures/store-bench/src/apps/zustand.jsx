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
let detailsMode = 'component';

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
  const entity = useBench(counted(s => s.entities[id]));
  const selected = useBench(counted(s => s.selected === id));
  const matches = useBench(
    counted(s => matchesFilter(s.entities[id].label, s.filter))
  );
  const details = useBench(
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

// Selects the inputs and counts in render, like the other variants. (A
// selector that counts would run the O(N) loop on every update.)
function Count() {
  const labels = useBench(counted(s => s.labels));
  const filter = useBench(counted(s => s.filter));
  let count = 0;
  for (let i = 0; i < labels.length; i++) {
    if (matchesFilter(labels[i], filter)) {
      count++;
    }
  }
  return <CountView count={count} />;
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
  const ListRow = detailsMode === 'inline' ? RowWithInlineDetails : Row;
  return (
    <div>
      <Filter />
      <Count />
      <ul>
        {ids.map(id => (
          <ListRow key={id} id={id} />
        ))}
      </ul>
    </div>
  );
}

function createApp(initialEntities, options) {
  detailsMode = options.details;
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
