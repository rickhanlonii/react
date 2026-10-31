"use strict";

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.Component = Component;
var _react = _interopRequireWildcard(require("react"));
var _jsxFileName = "";
function _getRequireWildcardCache(e) { if ("function" != typeof WeakMap) return null; var r = new WeakMap(), t = new WeakMap(); return (_getRequireWildcardCache = function (e) { return e ? t : r; })(e); }
function _interopRequireWildcard(e, r) { if (!r && e && e.__esModule) return e; if (null === e || "object" != typeof e && "function" != typeof e) return { default: e }; var t = _getRequireWildcardCache(r); if (t && t.has(e)) return t.get(e); var n = { __proto__: null }, a = Object.defineProperty && Object.getOwnPropertyDescriptor; for (var u in e) if ("default" !== u && {}.hasOwnProperty.call(e, u)) { var i = a ? Object.getOwnPropertyDescriptor(e, u) : null; i && (i.get || i.set) ? Object.defineProperty(n, u, i) : n[u] = e[u]; } return n.default = e, t && t.set(e, n), n; }
const countStore = (0, _react.unstable_createStore)(0);
function Component() {
  const count = (0, _react.use)(countStore);
  return /*#__PURE__*/_react.default.createElement("div", {
    __source: {
      fileName: _jsxFileName,
      lineNumber: 18,
      columnNumber: 5
    }
  }, /*#__PURE__*/_react.default.createElement("p", {
    __source: {
      fileName: _jsxFileName,
      lineNumber: 19,
      columnNumber: 7
    }
  }, "You clicked ", count, " times"), /*#__PURE__*/_react.default.createElement("button", {
    onClick: () => countStore.update(count + 1),
    __source: {
      fileName: _jsxFileName,
      lineNumber: 20,
      columnNumber: 7
    }
  }, "Click me"));
}
//# sourceMappingURL=ExampleUseStore.js.map?foo=bar&param=some_value