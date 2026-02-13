"use client";
var __module = (() => {
  var __getOwnPropNames = Object.getOwnPropertyNames;
  var __commonJS = (cb, mod) => function __require() {
    return mod || (0, cb[__getOwnPropNames(cb)[0]])((mod = { exports: {} }).exports, mod), mod.exports;
  };

  // scripts/react-shim.js
  var require_react_shim = __commonJS({
    "scripts/react-shim.js"(exports, module) {
      module.exports = globalThis.React;
    }
  });

  // server/src/components/Counter.jsx
  var require_Counter = __commonJS({
    "server/src/components/Counter.jsx"(exports, module) {
      var React = require_react_shim();
      var useState = React.useState;
      function Counter(props) {
        var initialCount = props.initialCount || 0;
        var countState = useState(initialCount);
        var count = countState[0];
        var setCount = countState[1];
        return /* @__PURE__ */ React.createElement("div", { style: { display: "flex", flexDirection: "row", alignItems: "center", gap: 8 } }, /* @__PURE__ */ React.createElement(
          "button",
          {
            onClick: function() {
              setCount(function(c) {
                return c - 1;
              });
            }
          },
          /* @__PURE__ */ React.createElement("span", null, "-")
        ), /* @__PURE__ */ React.createElement("span", null, String(count)), /* @__PURE__ */ React.createElement(
          "button",
          {
            onClick: function() {
              setCount(function(c) {
                return c + 1;
              });
            }
          },
          /* @__PURE__ */ React.createElement("span", null, "+")
        ));
      }
      module.exports = Counter;
      module.exports.default = Counter;
    }
  });
  return require_Counter();
})();
