'use strict';

var React = require('react');
var renderer = require('../../../packages/react-dom-native/client');
var fixtures = require('../fixtures');

globalThis.__LAYOUT_COMPARE__ = {
  fixtureNames: Object.keys(fixtures),

  renderFixture: function(name, surfaceId) {
    var root = renderer.createRoot({surfaceId: surfaceId, width: 390, height: 844});
    root.render(React.createElement(fixtures[name].component), function() {
      if (typeof __onFixtureReady__ === 'function') {
        __onFixtureReady__();
      }
    });
  }
};
