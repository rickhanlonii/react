/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

const React = require('react');
const {use} = React;

const fooStore = React.unstable_createStore(true);
const barStore = React.unstable_createStore(true);
const bazStore = React.unstable_createStore(true);
const forceUpdateStore = React.unstable_createStore();

function Component(props) {
  const foo = use(fooStore);
  const bar = use(barStore);
  const baz = React.use(bazStore);
  use(forceUpdateStore);
  return `${foo}-${bar}-${baz}`;
}

module.exports = {Component};
