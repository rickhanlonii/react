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

function reducer(state, action) {
  return action;
}

const fooStore = React.unstable_createStore(undefined, reducer);
const barStore = React.unstable_createStore(undefined, reducer);
const bazStore = React.unstable_createStore(undefined, reducer);

function Component(props) {
  const foo = use(fooStore);
  const bar = use(barStore);
  const baz = React.use(bazStore);
  return `${foo}-${bar}-${baz}`;
}

module.exports = {Component};
