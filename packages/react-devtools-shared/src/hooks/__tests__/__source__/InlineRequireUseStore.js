/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

const countStore = require('react').unstable_createStore(0);

export function Component() {
  const count = require('react').use(countStore);

  return count;
}
