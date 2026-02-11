'use strict';

var React = require('react');
var Fantom = require('@react-dom-native/fantom');

describe('Updates', function () {
  it('updates props without recreating views', function () {
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(<div style={{backgroundColor: 'red'}} />);
    });

    var before = Fantom.getRenderedOutput();
    expect(before.children[0].props.style.backgroundColor).toBe('red');

    Fantom.runTask(function () {
      root.render(<div style={{backgroundColor: 'blue'}} />);
    });

    var after = Fantom.getRenderedOutput();
    expect(after.children[0].props.style.backgroundColor).toBe('blue');
  });

  it('adds and removes children', function () {
    var root = Fantom.createRoot();

    Fantom.runTask(function () {
      root.render(
        <div>
          <p>First</p>
        </div>,
      );
    });

    var first = Fantom.getRenderedOutput();
    expect(first.children[0].children.length).toBe(1);

    Fantom.runTask(function () {
      root.render(
        <div>
          <p>First</p>
          <p>Second</p>
        </div>,
      );
    });

    var second = Fantom.getRenderedOutput();
    expect(second.children[0].children.length).toBe(2);
  });

  it('unmounts cleanly', function () {
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(<div>Hello</div>);
    });

    var before = Fantom.getRenderedOutput();
    expect(before.children.length).toBeGreaterThan(0);

    Fantom.runTask(function () {
      root.unmount();
    });

    var after = Fantom.getRenderedOutput();
    expect(after.children).toBeFalsy();
  });
});
