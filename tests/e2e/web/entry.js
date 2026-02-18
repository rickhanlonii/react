'use strict';

var React = require('react');
var ReactDOM = require('react-dom/client');
var ReactDOMFlush = require('react-dom');
var fixtures = require('../fixtures');

var root = null;

function extractNode(el, rootRect) {
  if (!el) return null;
  var rect = el.getBoundingClientRect();
  var style = getComputedStyle(el);
  var children = [];
  for (var i = 0; i < el.children.length; i++) {
    var child = extractNode(el.children[i], rootRect);
    if (child) children.push(child);
  }
  return {
    type: el.tagName.toLowerCase(),
    x: Math.round((rect.x - rootRect.x) * 100) / 100,
    y: Math.round((rect.y - rootRect.y) * 100) / 100,
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
      borderTopWidth: parseFloat(style.borderTopWidth) || 0,
      borderRightWidth: parseFloat(style.borderRightWidth) || 0,
      borderBottomWidth: parseFloat(style.borderBottomWidth) || 0,
      borderLeftWidth: parseFloat(style.borderLeftWidth) || 0,
      fontSize: parseFloat(style.fontSize) || 0,
      fontWeight: style.fontWeight,
      gap: parseFloat(style.gap) || 0,
      rowGap: parseFloat(style.rowGap) || 0,
      columnGap: parseFloat(style.columnGap) || 0,
      lineHeight: parseFloat(style.lineHeight) || 0,
      flexGrow: parseFloat(style.flexGrow) || 0,
      flexShrink: parseFloat(style.flexShrink),
      flexBasis: parseFloat(style.flexBasis) || 0,
      minWidth: parseFloat(style.minWidth) || 0,
      maxWidth: parseFloat(style.maxWidth) || 0,
      minHeight: parseFloat(style.minHeight) || 0,
      maxHeight: parseFloat(style.maxHeight) || 0,
      top: parseFloat(style.top) || 0,
      right: parseFloat(style.right) || 0,
      bottom: parseFloat(style.bottom) || 0,
      left: parseFloat(style.left) || 0,
      borderRadius: parseFloat(style.borderRadius) || 0,
      opacity: parseFloat(style.opacity),
      overflow: style.overflow,
      position: style.position,
      textAlign: style.textAlign,
      color: style.color,
      backgroundColor: style.backgroundColor,
      borderColor: style.borderColor,
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
    ReactDOMFlush.flushSync(function() {
      root.render(React.createElement(fixtures[name].component));
    });
    if (window.webkit && window.webkit.messageHandlers && window.webkit.messageHandlers.layoutReady) {
      window.webkit.messageHandlers.layoutReady.postMessage(name);
    }
  },

  extractLayout: function() {
    var rootEl = document.getElementById('root').firstElementChild;
    var rootRect = rootEl.getBoundingClientRect();
    return JSON.stringify(extractNode(rootEl, rootRect));
  }
};
