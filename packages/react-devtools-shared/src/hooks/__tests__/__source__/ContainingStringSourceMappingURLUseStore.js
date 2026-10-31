/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @flow
 */

import React, {unstable_createStore as createStore, use} from 'react';

// ?sourceMappingURL=([^\s'"]+)/gm

const abc = 'abc';
const string =
  'sourceMappingURL=data:application/json;charset=utf-8;base64,' + abc;

const countStore = createStore(0);

export function Component() {
  const count = use(countStore);

  return (
    <div>
      <p>You clicked {count} times</p>
      <div>string: {string}</div>
      <button onClick={() => countStore.update(count + 1)}>Click me</button>
    </div>
  );
}
