// Context + useReducer at the root, one provider: the baseline most apps start
// with. Every consumer re-renders on every update.

import {
  createContext,
  use,
  useReducer,
  useLayoutEffect,
  startTransition,
} from 'react';
import {startBench} from '../shared/harness';
import {
  RowView,
  DetailsView,
  FilterInput,
  CountView,
  countRender,
} from '../shared/views';
import {matchesFilter} from '../shared/data';
import {createInitialState, reducer} from '../shared/updates';

const StateContext = createContext(null);
const box = {dispatch: null, initialState: null, detailsMode: 'component'};

function Details() {
  return <DetailsView details={use(StateContext).details} />;
}

function Row({id}) {
  countRender('row');
  const state = use(StateContext);
  const entity = state.entities[id];
  const expanded = state.expanded[id] === true;
  let details = null;
  let children = null;
  if (expanded) {
    if (box.detailsMode === 'component') {
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
  const {labels, filter} = use(StateContext);
  let count = 0;
  for (let i = 0; i < labels.length; i++) {
    if (matchesFilter(labels[i], filter)) {
      count++;
    }
  }
  return <CountView count={count} />;
}

function onFilterChange(value) {
  box.dispatch({type: 'setFilterInput', payload: value});
  startTransition(() => {
    box.dispatch({type: 'setListFilter', payload: value});
  });
}

function Filter() {
  return (
    <FilterInput
      value={use(StateContext).filterInput}
      onChange={onFilterChange}
    />
  );
}

function App() {
  const [state, dispatch] = useReducer(reducer, box.initialState);
  useLayoutEffect(() => {
    box.dispatch = dispatch;
  }, [dispatch]);
  return (
    <StateContext value={state}>
      <div>
        <Filter />
        <Count />
        <ul>
          {state.ids.map(id => (
            <Row key={id} id={id} />
          ))}
        </ul>
      </div>
    </StateContext>
  );
}

function createApp(initialEntities, options) {
  box.initialState = createInitialState(initialEntities);
  box.detailsMode = options.details;
  const dispatch = (type, payload) => box.dispatch({type, payload});
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

startBench('context', createApp);
