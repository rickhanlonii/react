import {
  use,
  useState,
  useTransition,
  unstable_createStore as createStore,
} from 'react';

// Nothing reads this store until you mount the reader.
const count = watchStore(createStore(1), 'count');
let finishAction;

function Reader() {
  return <p className="reader">Reader: {use(count)}</p>;
}

export default function App() {
  const [showReader, setShowReader] = useState(false);
  const [isPending, startTransition] = useTransition();
  return (
    <>
      <button
        className="start"
        onClick={() =>
          startTransition(async () => {
            count.update(n => n * 2);
            await new Promise(resolve => (finishAction = resolve));
          })
        }>
        Double it in an async transition
      </button>
      <button className="mount" onClick={() => setShowReader(true)}>
        Mount the first reader
      </button>
      <button className="finish" onClick={() => finishAction?.()}>
        Finish the action
      </button>
      <p className="status">{isPending ? 'Transition pending' : 'Idle'}</p>
      {showReader ? <Reader /> : <p className="reader">No reader yet</p>}
    </>
  );
}
