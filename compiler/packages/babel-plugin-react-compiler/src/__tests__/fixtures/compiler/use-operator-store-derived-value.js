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
