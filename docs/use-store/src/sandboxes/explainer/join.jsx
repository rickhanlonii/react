import {
  use,
  useState,
  startTransition,
  unstable_createStore as createStore,
} from 'react';

const query = watchStore(createStore('old'), 'query');

function Label({name}) {
  const value = use(query);
  log(name + ' rendered ' + value);
  return (
    <p className={name}>
      {name}: {value}
    </p>
  );
}

export default function App() {
  const [showSecond, setShowSecond] = useState(false);
  return (
    <>
      <button
        className="transition"
        onClick={() => startTransition(() => query.update('new'))}>
        Update in a transition
      </button>
      <button className="mount" onClick={() => setShowSecond(true)}>
        Mount a second reader
      </button>
      <Label name="First" />
      {showSecond && <Label name="Second" />}
    </>
  );
}
