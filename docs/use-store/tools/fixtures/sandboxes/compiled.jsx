import {use, unstable_createStore as createStore} from 'react';

const selected = createStore(0);

function Row({id}) {
  const isSelected = use(selected) === id;
  return (
    <li onClick={() => selected.update(id)}>
      {isSelected ? '> ' : ''}Row {id}
    </li>
  );
}

export default function App() {
  return (
    <ul>
      {[0, 1, 2].map(id => (
        <Row key={id} id={id} />
      ))}
    </ul>
  );
}
