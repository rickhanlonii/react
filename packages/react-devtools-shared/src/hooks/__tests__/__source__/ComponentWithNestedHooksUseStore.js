/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

const {unstable_createStore: createStore, use, useMemo} = require('react');

const stateStore = createStore(0);

function Component(props) {
  const InnerComponent = useMemo(() => () => {
    const state = use(stateStore);

    return state;
  });
  props.callback(InnerComponent);

  return null;
}

module.exports = {Component};
