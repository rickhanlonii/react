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

  // server/src/components/TextInput.jsx
  var require_TextInput = __commonJS({
    "server/src/components/TextInput.jsx"(exports, module) {
      var React = require_react_shim();
      var useState = React.useState;
      function TextInput(props) {
        var placeholder = props.placeholder || "Type here...";
        var valueState = useState("");
        var value = valueState[0];
        var setValue = valueState[1];
        return /* @__PURE__ */ React.createElement("div", { style: { gap: 4 } }, /* @__PURE__ */ React.createElement(
          "input",
          {
            value,
            placeholder,
            onChange: function(e) {
              setValue(e && e.value ? e.value : "");
            }
          }
        ), /* @__PURE__ */ React.createElement("p", null, "You typed: " + value));
      }
      module.exports = TextInput;
      module.exports.default = TextInput;
    }
  });
  return require_TextInput();
})();
