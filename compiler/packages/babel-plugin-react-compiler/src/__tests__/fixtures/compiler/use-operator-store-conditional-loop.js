import {use} from 'react';

/**
 * Like any use(), use(store) can be called conditionally and in a loop.
 *
 * No FIXTURE_ENTRYPOINT: the React version used to evaluate fixtures does not
 * have unstable_createStore, and its use() throws for a store.
 */
function Component({showTitle, titleStore, itemStores}) {
  let title = null;
  if (showTitle) {
    title = use(titleStore);
  }
  const items = [];
  for (const store of itemStores) {
    items.push(<li key={store.id}>{use(store)}</li>);
  }
  return (
    <div>
      {title !== null ? <h1>{title}</h1> : null}
      <ul>{items}</ul>
    </div>
  );
}
