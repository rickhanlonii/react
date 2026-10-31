/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

const React = require('react');
const {unstable_createStore: createStore, use, useEffect} = require('react');

const countStore = createStore(0);
const darkModeStore = createStore(false);

function Component() {
  // A store has no [value, setter] tuple to read indirectly, so the value
  // and the update function are read separately.
  const count = use(countStore);
  const setCount = countStore.update;

  const darkMode = useIsDarkMode();
  const [isDarkMode, setDarkMode] = darkMode;

  useEffect(() => {
    // ...
  }, []);

  const handleClick = () => setCount(count + 1);

  return null;
}

function useIsDarkMode() {
  const isDarkMode = use(darkModeStore);

  useEffect(function useEffectCreate() {
    // Here is where we may listen to a "theme" event...
  }, []);

  return [isDarkMode, () => {}];
}

module.exports = {Component};
