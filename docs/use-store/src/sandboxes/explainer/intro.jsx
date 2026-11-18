import {use, unstable_createStore as createStore} from 'react';

const count = createStore(0);

function Count() {
  return <p>Count: {use(count)}</p>;
}

export default function App() {
  return (
    <>
      <button onClick={() => count.update(n => n + 1)}>Add one</button>
      <Count />
    </>
  );
}
