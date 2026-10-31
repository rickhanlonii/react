/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import React, {
  unstable_createStore as createStore,
  use,
  useDebugValue,
  useEffect,
} from 'react';

const countStore = createStore(0);
const isDarkModeStore = createStore(false);

export function Component() {
  const count = use(countStore);
  const isDarkMode = useIsDarkMode();
  const {foo} = useFoo();

  useEffect(() => {
    // ...
  }, []);

  const handleClick = () => countStore.update(count + 1);

  return (
    <>
      <div>Dark mode? {isDarkMode}</div>
      <div>Count: {count}</div>
      <div>Foo: {foo}</div>
      <button onClick={handleClick}>Update count</button>
    </>
  );
}

function useIsDarkMode() {
  const isDarkMode = use(isDarkModeStore);

  useEffect(function useEffectCreate() {
    // Here is where we may listen to a "theme" event...
  }, []);

  return isDarkMode;
}

function useFoo() {
  useDebugValue('foo');
  return {foo: true};
}
