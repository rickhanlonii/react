"use strict";

const {
  unstable_createStore: createStore,
  use,
  useMemo
} = require('react');
const stateStore = createStore(0);
function Component(props) {
  const InnerComponent = useMemo(() => () => {
    const state = use(stateStore);
    return state;
  });
  props.callback(InnerComponent);
  return null;
}
module.exports = {
  Component
};
//# sourceMappingURL=ComponentWithNestedHooksUseStore.js.map?foo=bar&param=some_value