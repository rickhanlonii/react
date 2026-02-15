'use strict';

var React = require('react');
var Fantom = require('@react-dom-native/fantom');

describe('Block layout', function () {
  it('sibling margins collapse to max when both positive', function () {
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(
        <div>
          <div style={{height: 50, marginBottom: 20}} />
          <div style={{height: 30, marginTop: 30}} />
        </div>,
      );
    });

    var output = Fantom.getRenderedOutput();
    var parent = output.children[0];
    var child2 = parent.children[1];
    // Collapsed margin = max(20, 30) = 30, not 50
    expect(child2.frame.y).toBe(80); // 50 + 30
  });

  it('sibling margins with mixed signs use algebraic sum', function () {
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(
        <div>
          <div style={{height: 50, marginBottom: 20}} />
          <div style={{height: 30, marginTop: -10}} />
        </div>,
      );
    });

    var output = Fantom.getRenderedOutput();
    var child2 = output.children[0].children[1];
    // Collapsed margin = 20 + (-10) = 10
    expect(child2.frame.y).toBe(60); // 50 + 10
  });

  it('sibling margins with both negative use most negative', function () {
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(
        <div>
          <div style={{height: 50, marginBottom: -10}} />
          <div style={{height: 30, marginTop: -20}} />
        </div>,
      );
    });

    var output = Fantom.getRenderedOutput();
    var child2 = output.children[0].children[1];
    // Collapsed margin = min(-10, -20) = -20
    expect(child2.frame.y).toBe(30); // 50 + (-20)
  });

  it('block children stretch to full parent width', function () {
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(
        <div style={{width: 200}}>
          <div style={{height: 50}} />
        </div>,
      );
    });

    var output = Fantom.getRenderedOutput();
    var child = output.children[0].children[0];
    expect(child.frame.width).toBe(200);
  });

  it('nested block containers position correctly', function () {
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(
        <div>
          <div style={{height: 40}} />
          <div>
            <div style={{height: 30}} />
            <div style={{height: 20}} />
          </div>
        </div>,
      );
    });

    var output = Fantom.getRenderedOutput();
    var parent = output.children[0];
    var child1 = parent.children[0];
    var child2 = parent.children[1];
    var nested1 = child2.children[0];
    var nested2 = child2.children[1];
    expect(child1.frame.y).toBe(0);
    expect(child2.frame.y).toBe(40);
    expect(nested1.frame.y).toBe(0);
    expect(nested2.frame.y).toBe(30);
  });

  it('h2 and p default margins collapse correctly', function () {
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(
        <div>
          <h2>Title</h2>
          <p>Paragraph</p>
        </div>,
      );
    });

    var output = Fantom.getRenderedOutput();
    var parent = output.children[0];
    var h2 = parent.children[0];
    var p = parent.children[1];
    // h2: marginTop=19.9, content height = font-based, marginBottom=19.9
    // p: marginTop=16, marginBottom=16
    // Collapsed gap = max(19.9, 16) = 19.9
    expect(Math.round(h2.frame.y)).toBe(Math.round(19.9));
    // p.y = h2.y + h2.height + collapsed(h2.marginBottom=19.9, p.marginTop=16) = h2.y + h2.height + 19.9
    var expectedPY = h2.frame.y + h2.frame.height + 19.9;
    expect(Math.round(p.frame.y)).toBe(Math.round(expectedPY));
  });
});
