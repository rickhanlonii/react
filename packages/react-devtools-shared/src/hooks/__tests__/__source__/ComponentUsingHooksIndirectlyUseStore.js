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
  useEffect,
} from 'react';

const countStore = createStore(0);
const darkModeStore = createStore(false);

export function Component() {
  // A store has no [value, setter] tuple to read indirectly, so the value
  // and the update function are read separately.
  const count = use(countStore);
  const setCount = countStore.update;

  const darkMode = useIsDarkMode();
  const [isDarkMode] = darkMode;

  useEffect(() => {
    // ...
  }, []);

  const handleClick = () => setCount(count + 1);

  return (
    <>
      <div>Dark mode? {isDarkMode}</div>
      <div>Count: {count}</div>
      <button onClick={handleClick}>Update count</button>
    </>
  );
}

function useIsDarkMode() {
  const isDarkMode = use(darkModeStore);

  useEffect(function useEffectCreate() {
    // Here is where we may listen to a "theme" event...
  }, []);

  return [isDarkMode, () => {}];
}
