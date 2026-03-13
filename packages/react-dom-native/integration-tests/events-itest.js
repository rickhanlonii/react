'use strict';

var React = require('react');
var Fantom = require('@react-dom-native/fantom');

describe('Events', function () {
  it('dispatches click events to handlers', function () {
    var clicked = false;
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(
        <button onClick={() => { clicked = true; }}>
          Tap me
        </button>,
      );
    });

    Fantom.dispatchEvent('button', 'click');
    expect(clicked).toBe(true);
  });
});
