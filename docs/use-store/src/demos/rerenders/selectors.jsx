// Selectors: one external store for everything, and each component
// subscribes with selectors, the way react-redux's useSelector works.
// Every update runs every mounted selector, and only the components whose
// selected values changed re-render.

import {useSyncExternalStoreWithSelector} from 'use-sync-external-store/with-selector';
import {RowView, ListView} from './views';
import {countRender, countSelector} from './counts';
import {initialRows, editLabel} from './data';

function createExternalStore(initial) {
  let state = initial;
  const listeners = new Set();
  return {
    getState: () => state,
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    setState(update) {
      state = update(state);
      listeners.forEach(listener => listener());
    },
  };
}

let store = null;

function useSelector(selector) {
  return useSyncExternalStoreWithSelector(
    store.subscribe,
    store.getState,
    null,
    state => {
      countSelector();
      return selector(state);
    }
  );
}

function Row({id}) {
  countRender('Row');
  const label = useSelector(state => state.labels[id]);
  const selected = useSelector(state => state.selectedId === id);
  return <RowView label={label} selected={selected} />;
}

function List() {
  countRender('List');
  const ids = useSelector(state => state.ids);
  return (
    <ListView>
      {ids.map(id => (
        <Row key={id} id={id} />
      ))}
    </ListView>
  );
}

export function App() {
  countRender('App');
  return <List />;
}

export function createState() {
  const labels = {};
  for (const row of initialRows) {
    labels[row.id] = row.label;
  }
  store = createExternalStore({
    ids: initialRows.map(row => row.id),
    labels,
    selectedId: null,
  });
  return {
    select(id) {
      store.setState(state => ({...state, selectedId: id}));
    },
    edit(id) {
      store.setState(state => ({
        ...state,
        labels: {...state.labels, [id]: editLabel(state.labels[id])},
      }));
    },
  };
}
