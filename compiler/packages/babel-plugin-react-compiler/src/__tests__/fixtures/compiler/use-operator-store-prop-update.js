import {use} from 'react';

/**
 * Reads a store (from React.unstable_createStore) passed as a prop, and
 * writes it from an event handler that closes over the store.
 *
 * No FIXTURE_ENTRYPOINT: the React version used to evaluate fixtures does not
 * have unstable_createStore, and its use() throws for a store.
 */
function Component({store}) {
  const count = use(store);
  const onClick = () => {
    store.update(c => c + 1);
  };
  return <button onClick={onClick}>{count}</button>;
}
