// use(store): a store per row, plus a store for the selection. A store
// update re-renders every component that reads the store, and nothing else.
// Every row reads the selection, so selecting a row re-renders every Row.
// With the React Compiler, a Row whose label and selected state didn't
// change returns the element it returned last time, so its RowView doesn't
// re-render.

import {use, unstable_createStore as createStore} from 'react';
import {RowView, ListView} from './views';
import {countRender} from './counts';
import {initialRows, editLabel} from './data';

let rows = null;
let ids = null;
let selected = null;

function Row({id}) {
  countRender('Row');
  const row = use(rows.get(id));
  const isSelected = use(selected) === id;
  return <RowView label={row.label} selected={isSelected} />;
}

function List() {
  countRender('List');
  return (
    <ListView>
      {use(ids).map(id => (
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
  rows = new Map();
  for (const row of initialRows) {
    rows.set(row.id, createStore(row));
  }
  ids = createStore(initialRows.map(row => row.id));
  selected = createStore(null);
  return {
    select(id) {
      selected.update(id);
    },
    edit(id) {
      rows.get(id).update(row => ({...row, label: editLabel(row.label)}));
    },
  };
}
