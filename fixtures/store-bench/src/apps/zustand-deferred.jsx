// Typing control for `zustand`: the idiomatic answer to useSyncExternalStore
// rendering transitions synchronously. The filter is one urgent value, and the
// list reads it through useDeferredValue, so the expensive re-filter renders
// in the background. Rows get the deferred filter as a prop, and the list is
// memoized so the urgent render stops at the list. Only meant for the typing
// scenario: under flushSync the deferred render hasn't happened yet.

import {memo, useDeferredValue, useMemo} from 'react';
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

function Row({id, filter}) {
  countRender('row');
  const entity = useBench(counted(s => s.entities[id]));
  const selected = useBench(counted(s => s.selected === id));
  const matches = matchesFilter(entity.label, filter);
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

function Count() {
  const labels = useBench(counted(s => s.labels));
  const filter = useDeferredValue(useBench(counted(s => s.filter)));
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

function onFilterChange(value) {
  update('setFilter', value);
}

function Filter() {
  return (
    <FilterInput
      value={useBench(counted(s => s.filterInput))}
      onChange={onFilterChange}
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

function App() {
  const ids = useBench(counted(s => s.ids));
  const filter = useDeferredValue(useBench(counted(s => s.filter)));
  return (
    <div>
      <Filter />
      <Count />
      <Rows ids={ids} filter={filter} />
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

startBench('zustand-deferred', createApp);
