
## Input

```javascript
import {use} from 'react';
import {makeArray} from 'shared-runtime';

/**
 * Values derived from two store reads.
 *
 * In Component, both use() calls are evaluated into temporaries before the
 * call to makeArray, so the derived value is memoized on the two store values.
 *
 * In ComponentWithMutableValue, the array is still being built when use() is
 * called. Scopes that contain use() are flattened, so the array and the JSX
 * are recomputed on every render (a known limitation).
 *
 * No FIXTURE_ENTRYPOINT: the React version used to evaluate fixtures does not
 * have unstable_createStore, and its use() throws for a store.
 */
function Component({a, b}) {
  const total = makeArray(use(a), use(b));
  return <div>{total}</div>;
}

function ComponentWithMutableValue({a, b}) {
  const values = [];
  values.push(use(a));
  values.push(use(b));
  return <div>{values}</div>;
}

```

## Code

```javascript
import { c as _c } from "react/compiler-runtime";
import { use } from "react";
import { makeArray } from "shared-runtime";

/**
 * Values derived from two store reads.
 *
 * In Component, both use() calls are evaluated into temporaries before the
 * call to makeArray, so the derived value is memoized on the two store values.
 *
 * In ComponentWithMutableValue, the array is still being built when use() is
 * called. Scopes that contain use() are flattened, so the array and the JSX
 * are recomputed on every render (a known limitation).
 *
 * No FIXTURE_ENTRYPOINT: the React version used to evaluate fixtures does not
 * have unstable_createStore, and its use() throws for a store.
 */
function Component(t0) {
  const $ = _c(5);
  const { a, b } = t0;
  const t1 = use(a);
  const t2 = use(b);
  let t3;
  if ($[0] !== t1 || $[1] !== t2) {
    t3 = makeArray(t1, t2);
    $[0] = t1;
    $[1] = t2;
    $[2] = t3;
  } else {
    t3 = $[2];
  }
  const total = t3;
  let t4;
  if ($[3] !== total) {
    t4 = <div>{total}</div>;
    $[3] = total;
    $[4] = t4;
  } else {
    t4 = $[4];
  }
  return t4;
}

function ComponentWithMutableValue(t0) {
  const { a, b } = t0;
  const values = [];
  values.push(use(a));
  values.push(use(b));
  return <div>{values}</div>;
}

```
      
### Eval output
(kind: exception) Fixture not implemented