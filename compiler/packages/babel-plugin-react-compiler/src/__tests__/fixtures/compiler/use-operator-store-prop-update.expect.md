
## Input

```javascript
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

```

## Code

```javascript
import { c as _c } from "react/compiler-runtime";
import { use } from "react";

/**
 * Reads a store (from React.unstable_createStore) passed as a prop, and
 * writes it from an event handler that closes over the store.
 *
 * No FIXTURE_ENTRYPOINT: the React version used to evaluate fixtures does not
 * have unstable_createStore, and its use() throws for a store.
 */
function Component(t0) {
  const $ = _c(5);
  const { store } = t0;
  const count = use(store);
  let t1;
  if ($[0] !== store) {
    t1 = () => {
      store.update(_temp);
    };
    $[0] = store;
    $[1] = t1;
  } else {
    t1 = $[1];
  }
  const onClick = t1;
  let t2;
  if ($[2] !== count || $[3] !== onClick) {
    t2 = <button onClick={onClick}>{count}</button>;
    $[2] = count;
    $[3] = onClick;
    $[4] = t2;
  } else {
    t2 = $[4];
  }
  return t2;
}
function _temp(c) {
  return c + 1;
}

```
      
### Eval output
(kind: exception) Fixture not implemented