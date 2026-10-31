"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.ListItem = ListItem;
exports.List = List;
var React = _interopRequireWildcard(require("react"));
var _jsxFileName = "";
function _getRequireWildcardCache(e) { if ("function" != typeof WeakMap) return null; var r = new WeakMap(), t = new WeakMap(); return (_getRequireWildcardCache = function (e) { return e ? t : r; })(e); }
function _interopRequireWildcard(e, r) { if (!r && e && e.__esModule) return e; if (null === e || "object" != typeof e && "function" != typeof e) return { default: e }; var t = _getRequireWildcardCache(r); if (t && t.has(e)) return t.get(e); var n = { __proto__: null }, a = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var u in e) if ("default" !== u && {}.hasOwnProperty.call(e, u)) { var i = a ? Object.getOwnPropertyDescriptor(e, u) : null; i && (i.get || i.set) ? Object.defineProperty(n, u, i) : n[u] = e[u]; } return n.default = e, t && t.set(e, n), n; }
const newItemTextStore = (0, React.unstable_createStore)('');
const itemsStore = (0, React.unstable_createStore)([{
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
const uidStore = (0, React.unstable_createStore)(4);
function ListItem({
  item,
  removeItem,
  toggleItem
}) {
  const handleDelete = (0, React.useCallback)(() => {
    removeItem(item);
  }, [item, removeItem]);
  const handleToggle = (0, React.useCallback)(() => {
    toggleItem(item);
  }, [item, toggleItem]);
  return /*#__PURE__*/React.createElement("li", {
    __source: {
      fileName: _jsxFileName,
      lineNumber: 36,
      columnNumber: 5
    }
  }, /*#__PURE__*/React.createElement("button", {
    onClick: handleDelete,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 37,
      columnNumber: 7
    }
  }, "Delete"), /*#__PURE__*/React.createElement("label", {
    __source: {
      fileName: _jsxFileName,
      lineNumber: 38,
      columnNumber: 7
    }
  }, /*#__PURE__*/React.createElement("input", {
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
  const newItemText = (0, React.use)(newItemTextStore);
  const items = (0, React.use)(itemsStore);
  const uid = (0, React.use)(uidStore);
  const handleClick = (0, React.useCallback)(() => {
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
  const handleKeyPress = (0, React.useCallback)(event => {
    if (event.key === 'Enter') {
      handleClick();
    }
  }, [handleClick]);
  const handleChange = (0, React.useCallback)(event => {
    newItemTextStore.update(event.currentTarget.value);
  }, []);
  const removeItem = (0, React.useCallback)(itemToRemove => itemsStore.update(items.filter(item => item !== itemToRemove)), [items]);
  const toggleItem = (0, React.useCallback)(itemToToggle => {
    const index = items.findIndex(item => item.id === itemToToggle.id);
    itemsStore.update(items.slice(0, index).concat({
      ...itemToToggle,
      isComplete: !itemToToggle.isComplete
    }).concat(items.slice(index + 1)));
  }, [items]);
  return /*#__PURE__*/React.createElement(React.Fragment, {
    __source: {
      fileName: _jsxFileName,
      lineNumber: 109,
      columnNumber: 5
    }
  }, /*#__PURE__*/React.createElement("h1", {
    __source: {
      fileName: _jsxFileName,
      lineNumber: 110,
      columnNumber: 7
    }
  }, "List"), /*#__PURE__*/React.createElement("input", {
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
  }), /*#__PURE__*/React.createElement("button", {
    disabled: newItemText === '',
    onClick: handleClick,
    __source: {
      fileName: _jsxFileName,
      lineNumber: 118,
      columnNumber: 7
    }
  }, /*#__PURE__*/React.createElement("span", {
    role: "img",
    "aria-label": "Add item",
    __source: {
      fileName: _jsxFileName,
      lineNumber: 119,
      columnNumber: 9
    }
  }, "Add")), /*#__PURE__*/React.createElement("ul", {
    __source: {
      fileName: _jsxFileName,
      lineNumber: 123,
      columnNumber: 7
    }
  }, items.map(item => /*#__PURE__*/React.createElement(ListItem, {
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
//# sourceMappingURL=ToDoListUseStore.js.map?foo=bar&param=some_value