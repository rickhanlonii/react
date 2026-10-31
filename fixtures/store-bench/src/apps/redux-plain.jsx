// Fairness control for `redux`: plain Redux with a hand-written immutable
// reducer (the same updates as context and zustand, from shared/updates.js),
// no RTK and no Immer. The react-redux usage is the same as redux.jsx: inline
// useSelector selectors and createSelector for derived data.

import {startTransition} from 'react';
import {legacy_createStore as createStore} from 'redux';
import {createSelector} from 'reselect';
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
import {createInitialState, updates} from '../shared/updates';

function action(type, payload) {
  return {type, payload};
}

let store = null;
let detailsMode = 'inline';

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
  // Hooks can't be called conditionally, so every row subscribes to details,
  // and selects null when it isn't expanded.
  const inlineDetails = useSelector(
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
  return <CountView count={useSelector(counted(selectCount))} />;
}

function Filter() {
  const value = useSelector(counted(s => s.filterInput));
  const dispatch = useDispatch();
  return (
    <FilterInput
      value={value}
      onChange={next => {
        dispatch(action('setFilterInput', next));
        // useSyncExternalStore renders this synchronously even in a
        // transition, so it can't keep the input responsive.
        startTransition(() => {
          dispatch(action('setListFilter', next));
        });
      }}
    />
  );
}

function List() {
  const ids = useSelector(counted(s => s.ids));
  return (
    <ul>
      {ids.map(id => (
        <Row key={id} id={id} />
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
  detailsMode = options.details || 'inline';
  store = createStore((state, {type, payload}) => {
    const update = updates[type];
    return update === undefined ? state : update(state, payload);
  }, createInitialState(initialEntities));
  const dispatch = (type, payload) => store.dispatch(action(type, payload));
  const actions = {
    editEntity: index => dispatch('editEntity', index),
    select: index => dispatch('select', index),
    setFilter: value => dispatch('setFilter', value),
    expandEvery: (k, n) => dispatch('expandEvery', {k, n}),
    tickDetails: () => dispatch('tickDetails'),
    add: () => dispatch('add'),
    removeLast: () => dispatch('removeLast'),
  };
  return {App, actions};
}

startBench('redux-plain', createApp);
