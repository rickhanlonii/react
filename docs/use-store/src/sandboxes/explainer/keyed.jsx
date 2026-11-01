import {use, unstable_createStore as createStore} from 'react';

// One store per row id, created on demand, that holds whether the row is
// selected. The benchmarks use weakMemo for this, which is a Map for ids.
const selectedStores = new Map();
function isSelectedStore(id) {
  if (!selectedStores.has(id)) selectedStores.set(id, createStore(false));
  return selectedStores.get(id);
}

let selectedId = null;
function select(id) {
  if (selectedId !== null) isSelectedStore(selectedId).update(false);
  isSelectedStore(id).update(true);
  selectedId = id;
}

function Row({id}) {
  const isSelected = use(isSelectedStore(id));
  return (
    <li onClick={() => select(id)}>
      Row {id}
      {isSelected ? ' (selected)' : ''}
    </li>
  );
}

export default function List() {
  return (
    <ul>
      {['a', 'b', 'c', 'd', 'e'].map(id => (
        <Row key={id} id={id} />
      ))}
    </ul>
  );
}
