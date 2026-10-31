'use strict';

var React = require('react');

function _interopNamespaceDefault(e) {
  var n = Object.create(null);
  if (e) {
    Object.keys(e).forEach(function (k) {
      if (k !== 'default') {
        var d = Object.getOwnPropertyDescriptor(e, k);
        Object.defineProperty(n, k, d.get ? d : {
          enumerable: true,
          get: function () { return e[k]; }
        });
      }
    });
  }
  n.default = e;
  return Object.freeze(n);
}

var React__namespace = /*#__PURE__*/_interopNamespaceDefault(React);

var _jsxFileName$4 = "/Users/rickhanlonii/oss/react/packages/react-devtools-shared/src/hooks/__tests__/__source__/ComponentUsingHooksIndirectlyUseStore.js";
const countStore$4 = React.unstable_createStore(0);
const darkModeStore = React.unstable_createStore(false);
function Component$5() {
  const count = React.use(countStore$4);
  const setCount = countStore$4.update;
  const darkMode = useIsDarkMode$1();
  const [isDarkMode] = darkMode;
  React.useEffect(() => {}, []);
  const handleClick = () => setCount(count + 1);
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    __source: {
      fileName: _jsxFileName$4,
      lineNumber: 36,
      columnNumber: 7
    }
  }, "Dark mode? ", isDarkMode), /*#__PURE__*/React.createElement("div", {
    __source: {
      fileName: _jsxFileName$4,
      lineNumber: 37,
      columnNumber: 7
    }
  }, "Count: ", count), /*#__PURE__*/React.createElement("button", {
    onClick: handleClick,
    __source: {
      fileName: _jsxFileName$4,
      lineNumber: 38,
      columnNumber: 7
    }
  }, "Update count"));
}
function useIsDarkMode$1() {
  const isDarkMode = React.use(darkModeStore);
  React.useEffect(function useEffectCreate() {}, []);
  return [isDarkMode, () => {}];
}

var _jsxFileName$3 = "/Users/rickhanlonii/oss/react/packages/react-devtools-shared/src/hooks/__tests__/__source__/ComponentWithCustomHookUseStore.js";
const countStore$3 = React.unstable_createStore(0);
const isDarkModeStore = React.unstable_createStore(false);
function Component$4() {
  const count = React.use(countStore$3);
  const isDarkMode = useIsDarkMode();
  const {
    foo
  } = useFoo();
  React.useEffect(() => {}, []);
  const handleClick = () => countStore$3.update(count + 1);
  return /*#__PURE__*/React.createElement(React.Fragment, null, /*#__PURE__*/React.createElement("div", {
    __source: {
      fileName: _jsxFileName$3,
      lineNumber: 33,
      columnNumber: 7
    }
  }, "Dark mode? ", isDarkMode), /*#__PURE__*/React.createElement("div", {
    __source: {
      fileName: _jsxFileName$3,
      lineNumber: 34,
      columnNumber: 7
    }
  }, "Count: ", count), /*#__PURE__*/React.createElement("div", {
    __source: {
      fileName: _jsxFileName$3,
      lineNumber: 35,
      columnNumber: 7
    }
  }, "Foo: ", foo), /*#__PURE__*/React.createElement("button", {
    onClick: handleClick,
    __source: {
      fileName: _jsxFileName$3,
      lineNumber: 36,
      columnNumber: 7
    }
  }, "Update count"));
}
function useIsDarkMode() {
  const isDarkMode = React.use(isDarkModeStore);
  React.useEffect(function useEffectCreate() {}, []);
  return isDarkMode;
}
function useFoo() {
  React.useDebugValue('foo');
  return {
    foo: true
  };
}

const {
  unstable_createStore: createStore,
  use,
  useMemo
} = React;
const stateStore = createStore(0);
function Component$3(props) {
  const InnerComponent = useMemo(() => () => {
    const state = use(stateStore);
    return state;
  });
  props.callback(InnerComponent);
  return null;
}
var ComponentWithNestedHooksUseStore = {
  Component: Component$3
};

var _jsxFileName$2 = "/Users/rickhanlonii/oss/react/packages/react-devtools-shared/src/hooks/__tests__/__source__/ContainingStringSourceMappingURLUseStore.js";
const abc = 'abc';
const string = 'sourceMappingURL=data:application/json;charset=utf-8;base64,' + abc;
const countStore$2 = React.unstable_createStore(0);
function Component$2() {
  const count = React.use(countStore$2);
  return /*#__PURE__*/React.createElement("div", {
    __source: {
      fileName: _jsxFileName$2,
      lineNumber: 24,
      columnNumber: 5
    }
  }, /*#__PURE__*/React.createElement("p", {
    __source: {
      fileName: _jsxFileName$2,
      lineNumber: 25,
      columnNumber: 7
    }
  }, "You clicked ", count, " times"), /*#__PURE__*/React.createElement("div", {
    __source: {
      fileName: _jsxFileName$2,
      lineNumber: 26,
      columnNumber: 7
    }
  }, "string: ", string), /*#__PURE__*/React.createElement("button", {
    onClick: () => countStore$2.update(count + 1),
    __source: {
      fileName: _jsxFileName$2,
      lineNumber: 27,
      columnNumber: 7
    }
  }, "Click me"));
}

var _jsxFileName$1 = "/Users/rickhanlonii/oss/react/packages/react-devtools-shared/src/hooks/__tests__/__source__/ExampleUseStore.js";
const countStore$1 = React.unstable_createStore(0);
function Component$1() {
  const count = React.use(countStore$1);
  return /*#__PURE__*/React.createElement("div", {
    __source: {
      fileName: _jsxFileName$1,
      lineNumber: 18,
      columnNumber: 5
    }
  }, /*#__PURE__*/React.createElement("p", {
    __source: {
      fileName: _jsxFileName$1,
      lineNumber: 19,
      columnNumber: 7
    }
  }, "You clicked ", count, " times"), /*#__PURE__*/React.createElement("button", {
    onClick: () => countStore$1.update(count + 1),
    __source: {
      fileName: _jsxFileName$1,
      lineNumber: 20,
      columnNumber: 7
    }
  }, "Click me"));
}

const countStore = require('react').unstable_createStore(0);
function Component() {
  const count = require('react').use(countStore);
  return count;
}

var _jsxFileName = "/Users/rickhanlonii/oss/react/packages/react-devtools-shared/src/hooks/__tests__/__source__/ToDoListUseStore.js";
const newItemTextStore = React.unstable_createStore('');
const itemsStore = React.unstable_createStore([{
  id: 1,
  isComplete: true,
  text: 'First'
}, {
  id: 2,
  isComplete: true,
  text: 'Second'
}, {
  id: 3,
  isComplete: false,
  text: 'Third'
}]);
const uidStore = React.unstable_createStore(4);
function ListItem({
  item,
  removeItem,
  toggleItem
}) {
  const handleDelete = React.useCallback(() => {
    removeItem(item);
  }, [item, removeItem]);
  const handleToggle = React.useCallback(() => {
    toggleItem(item);
  }, [item, toggleItem]);
  return /*#__PURE__*/React__namespace.createElement("li", {
    __source: {
      fileName: _jsxFileName,
      lineNumber: 36,
      columnNumber: 5
    }
  }, /*#__PURE__*/React__namespace.createElement("button", {
    onClick: handleDelete,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 37,
      columnNumber: 7
    }
  }, "Delete"), /*#__PURE__*/React__namespace.createElement("label", {
    __source: {
      fileName: _jsxFileName,
      lineNumber: 38,
      columnNumber: 7
    }
  }, /*#__PURE__*/React__namespace.createElement("input", {
    checked: item.isComplete,
    onChange: handleToggle,
    type: "checkbox",
    __source: {
      fileName: _jsxFileName,
      lineNumber: 39,
      columnNumber: 9
    }
  }), ' ', item.text));
}
function List(props) {
  const newItemText = React.use(newItemTextStore);
  const items = React.use(itemsStore);
  const uid = React.use(uidStore);
  const handleClick = React.useCallback(() => {
    if (newItemText !== '') {
      itemsStore.update([...items, {
        id: uid,
        isComplete: false,
        text: newItemText
      }]);
      uidStore.update(uid + 1);
      newItemTextStore.update('');
    }
  }, [newItemText, items, uid]);
  const handleKeyPress = React.useCallback(event => {
    if (event.key === 'Enter') {
      handleClick();
    }
  }, [handleClick]);
  const handleChange = React.useCallback(event => {
    newItemTextStore.update(event.currentTarget.value);
  }, []);
  const removeItem = React.useCallback(itemToRemove => itemsStore.update(items.filter(item => item !== itemToRemove)), [items]);
  const toggleItem = React.useCallback(itemToToggle => {
    const index = items.findIndex(item => item.id === itemToToggle.id);
    itemsStore.update(items.slice(0, index).concat({
      ...itemToToggle,
      isComplete: !itemToToggle.isComplete
    }).concat(items.slice(index + 1)));
  }, [items]);
  return /*#__PURE__*/React__namespace.createElement(React.Fragment, {
    __source: {
      fileName: _jsxFileName,
      lineNumber: 109,
      columnNumber: 5
    }
  }, /*#__PURE__*/React__namespace.createElement("h1", {
    __source: {
      fileName: _jsxFileName,
      lineNumber: 110,
      columnNumber: 7
    }
  }, "List"), /*#__PURE__*/React__namespace.createElement("input", {
    type: "text",
    placeholder: "New list item...",
    value: newItemText,
    onChange: handleChange,
    onKeyPress: handleKeyPress,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 111,
      columnNumber: 7
    }
  }), /*#__PURE__*/React__namespace.createElement("button", {
    disabled: newItemText === '',
    onClick: handleClick,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 118,
      columnNumber: 7
    }
  }, /*#__PURE__*/React__namespace.createElement("span", {
    role: "img",
    "aria-label": "Add item",
    __source: {
      fileName: _jsxFileName,
      lineNumber: 119,
      columnNumber: 9
    }
  }, "Add")), /*#__PURE__*/React__namespace.createElement("ul", {
    __source: {
      fileName: _jsxFileName,
      lineNumber: 123,
      columnNumber: 7
    }
  }, items.map(item => /*#__PURE__*/React__namespace.createElement(ListItem, {
    key: item.id,
    item: item,
    removeItem: removeItem,
    toggleItem: toggleItem,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 125,
      columnNumber: 11
    }
  }))));
}

var ToDoListUseStore = /*#__PURE__*/Object.freeze({
  __proto__: null,
  List: List,
  ListItem: ListItem
});

exports.ComponentUsingHooksIndirectlyUseStore = Component$5;
exports.ComponentWithCustomHookUseStore = Component$4;
exports.ComponentWithNestedHooksUseStore = ComponentWithNestedHooksUseStore.Component;
exports.ContainingStringSourceMappingURLUseStore = Component$2;
exports.ExampleUseStore = Component$1;
exports.InlineRequireUseStore = Component;
exports.ToDoListUseStore = ToDoListUseStore;
//# sourceMappingURL=indexUseStore.js.map
