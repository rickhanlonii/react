'use strict';

var React = require('react');
var Fantom = require('@react-dom-native/fantom');

describe('Layout frames', function () {
  it('div fills available width', function () {
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(<div />);
    });

    var output = Fantom.getRenderedOutput();
    var div = output.children[0];
    expect(div.frame.width).toBe(390);
  });

  it('children stack vertically in column layout', function () {
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(
        <div>
          <div style={{height: 50}} />
          <div style={{height: 30}} />
        </div>,
      );
    });

    var output = Fantom.getRenderedOutput();
    var parent = output.children[0];
    var child1 = parent.children[0];
    var child2 = parent.children[1];
    expect(child1.frame.y).toBe(0);
    expect(child1.frame.height).toBe(50);
    expect(child2.frame.y).toBe(50);
    expect(child2.frame.height).toBe(30);
  });

  it('absolute positioning sets position offsets', function () {
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(
        <div>
          <div
            style={{
              position: 'absolute',
              top: 10,
              left: 20,
              width: 100,
              height: 100,
            }}
          />
        </div>,
      );
    });

    var output = Fantom.getRenderedOutput();
    var child = output.children[0].children[0];
    expect(child.frame.x).toBe(20);
    expect(child.frame.y).toBe(10);
    expect(child.frame.width).toBe(100);
    expect(child.frame.height).toBe(100);
  });

  it('overflow hidden does not affect layout frame', function () {
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(
        <div style={{overflow: 'hidden', width: 200, height: 100}} />,
      );
    });

    var output = Fantom.getRenderedOutput();
    var div = output.children[0];
    expect(div.frame.width).toBe(200);
    expect(div.frame.height).toBe(100);
  });

  it('borderWidth affects content area', function () {
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(
        <div style={{width: 100, height: 100, borderWidth: 5}}>
          <div />
        </div>,
      );
    });

    var output = Fantom.getRenderedOutput();
    var parent = output.children[0];
    var child = parent.children[0];
    // Default box-sizing is content-box: width/height specify content area,
    // border is added outside. Child stretches to fill content area (100).
    expect(child.frame.width).toBe(100);
    expect(child.frame.x).toBe(5);
    expect(child.frame.y).toBe(5);
  });
});
