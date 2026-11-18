import {use, useTransition, unstable_createStore as createStore} from 'react';

const cart = createStore([]);
const status = createStore('Not saved');
let finishSave;

function Summary() {
  const items = use(cart);
  const saved = use(status);
  log('rendered cart=' + items.length + ', ' + saved);
  return (
    <p className="summary">
      Cart: {items.length}. {saved}
    </p>
  );
}

export default function App() {
  const [isPending, startTransition] = useTransition();
  function addAndSave() {
    startTransition(async () => {
      cart.update(items => [...items, 'Book']);
      await new Promise(resolve => (finishSave = resolve)); // The server call.
      startTransition(() => status.update('Saved'));
    });
  }
  return (
    <>
      <button className="add" onClick={addAndSave}>
        Add and save
      </button>
      <button className="finish" onClick={() => finishSave?.()}>
        Finish the server call
      </button>
      <p className="pending">{isPending ? 'Saving…' : 'Idle'}</p>
      <Summary />
    </>
  );
}
