'use strict';

var React = require('react');
var ReactDOM = require('react-dom/client');
var fixtures = require('../fixtures');

var root = null;

function extractNode(el) {
  if (!el) return null;
  var rect = el.getBoundingClientRect();
  var style = getComputedStyle(el);
  var children = [];
  for (var i = 0; i < el.children.length; i++) {
    var child = extractNode(el.children[i]);
    if (child) children.push(child);
  }
  return {
    type: el.tagName.toLowerCase(),
    x: Math.round(rect.x * 100) / 100,
    y: Math.round(rect.y * 100) / 100,
    width: Math.round(rect.width * 100) / 100,
    height: Math.round(rect.height * 100) / 100,
    styles: {
      display: style.display,
      flexDirection: style.flexDirection,
      alignItems: style.alignItems,
      justifyContent: style.justifyContent,
      flexWrap: style.flexWrap,
      marginTop: parseFloat(style.marginTop) || 0,
      marginRight: parseFloat(style.marginRight) || 0,
      marginBottom: parseFloat(style.marginBottom) || 0,
      marginLeft: parseFloat(style.marginLeft) || 0,
      paddingTop: parseFloat(style.paddingTop) || 0,
      paddingRight: parseFloat(style.paddingRight) || 0,
      paddingBottom: parseFloat(style.paddingBottom) || 0,
      paddingLeft: parseFloat(style.paddingLeft) || 0,
      fontSize: parseFloat(style.fontSize) || 0,
      fontWeight: style.fontWeight,
    },
    children: children
  };
}

globalThis.__LAYOUT_COMPARE__ = {
  fixtureNames: Object.keys(fixtures),

  renderFixture: function(name) {
    var container = document.getElementById('root');
    if (root) {
      root.unmount();
    }
    container.innerHTML = '';
    root = ReactDOM.createRoot(container);
    root.render(React.createElement(fixtures[name].component));
  },

  extractLayout: function() {
    var rootEl = document.getElementById('root').firstElementChild;
    return JSON.stringify(extractNode(rootEl));
  }
};
