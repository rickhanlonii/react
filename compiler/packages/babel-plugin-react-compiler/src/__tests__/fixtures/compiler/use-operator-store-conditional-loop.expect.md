
## Input

```javascript
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

```

## Code

```javascript
import { c as _c } from "react/compiler-runtime";
import { use } from "react";

/**
 * Like any use(), use(store) can be called conditionally and in a loop.
 *
 * No FIXTURE_ENTRYPOINT: the React version used to evaluate fixtures does not
 * have unstable_createStore, and its use() throws for a store.
 */
function Component(t0) {
  const $ = _c(2);
  const { showTitle, titleStore, itemStores } = t0;
  let title = null;
  if (showTitle) {
    title = use(titleStore);
  }

  const items = [];
  for (const store of itemStores) {
    items.push(<li key={store.id}>{use(store)}</li>);
  }
  let t1;
  if ($[0] !== title) {
    t1 = title !== null ? <h1>{title}</h1> : null;
    $[0] = title;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  return (
    <div>
      {t1}
      <ul>{items}</ul>
    </div>
  );
}

```
      
### Eval output
(kind: exception) Fixture not implemented