"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Component = Component;
const countStore = require('react').unstable_createStore(0);
function Component() {
  const count = require('react').use(countStore);
  return count;
}
//# sourceMappingURL=InlineRequireUseStore.js.map?foo=bar&param=some_value