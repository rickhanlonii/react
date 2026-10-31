/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

const {unstable_createStore: createStore, use} = require('react');
const {useCustom} = require('./useCustom');

const countStore = createStore(0);

function Component(props) {
  const count = use(countStore);
  useCustom();
  return count;
}

module.exports = {Component};
