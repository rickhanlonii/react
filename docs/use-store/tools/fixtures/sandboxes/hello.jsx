import {use, unstable_createStore as createStore} from 'react';

const count = createStore(0);

export default function App() {
  const n = use(count);
  return (
    <button onClick={() => count.update(x => x + 1)}>Clicked {n} times</button>
  );
}
