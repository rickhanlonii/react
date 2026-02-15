'use strict';

var React = require('react');
var Fantom = require('@react-dom-native/fantom');

describe('Inline-block layout', function () {
  it('inline-block child shrinks to fit content width', function () {
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(
        <div style={{width: 300}}>
          <div style={{display: 'inline-block', width: 100, height: 50}} />
        </div>,
      );
    });

    var output = Fantom.getRenderedOutput();
    var parent = output.children[0];
    var child = parent.children[0];
    // inline-block with explicit width: uses that width, not parent's 300
    expect(child.frame.width).toBe(100);
    expect(child.frame.height).toBe(50);
  });

  it('multiple inline-block children flow horizontally on the same line', function () {
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(
        <div style={{width: 300}}>
          <div style={{display: 'inline-block', width: 80, height: 40}} />
          <div style={{display: 'inline-block', width: 80, height: 40}} />
          <div style={{display: 'inline-block', width: 80, height: 40}} />
        </div>,
      );
    });

    var output = Fantom.getRenderedOutput();
    var parent = output.children[0];
    var child1 = parent.children[0];
    var child2 = parent.children[1];
    var child3 = parent.children[2];
    // All three fit on one line (80+80+80=240 < 300)
    expect(child1.frame.x).toBe(0);
    expect(child1.frame.y).toBe(0);
    expect(child2.frame.x).toBe(80);
    expect(child2.frame.y).toBe(0);
    expect(child3.frame.x).toBe(160);
    expect(child3.frame.y).toBe(0);
  });

  it('inline-block children wrap to next line when overflowing', function () {
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(
        <div style={{width: 200}}>
          <div style={{display: 'inline-block', width: 120, height: 40}} />
          <div style={{display: 'inline-block', width: 120, height: 40}} />
        </div>,
      );
    });

    var output = Fantom.getRenderedOutput();
    var parent = output.children[0];
    var child1 = parent.children[0];
    var child2 = parent.children[1];
    // First fits, second wraps (120+120=240 > 200)
    expect(child1.frame.x).toBe(0);
    expect(child1.frame.y).toBe(0);
    expect(child2.frame.x).toBe(0);
    expect(child2.frame.y).toBe(40);
  });

  it('inline-block does not participate in margin collapsing', function () {
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(
        <div>
          <div style={{height: 50, marginBottom: 20}} />
          <div style={{display: 'inline-block', width: 80, height: 30, marginTop: 30}} />
        </div>,
      );
    });

    var output = Fantom.getRenderedOutput();
    var parent = output.children[0];
    var child2 = parent.children[1];
    // No margin collapsing: 50 + 20 + 30 = 100 (not 50 + 30 = 80)
    expect(child2.frame.y).toBe(100);
  });

  it('block child after inline-block starts on new line', function () {
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(
        <div style={{width: 300}}>
          <div style={{display: 'inline-block', width: 80, height: 40}} />
          <div style={{height: 30}} />
        </div>,
      );
    });

    var output = Fantom.getRenderedOutput();
    var parent = output.children[0];
    var inlineChild = parent.children[0];
    var blockChild = parent.children[1];
    // Block child flushes the inline line and starts below
    expect(inlineChild.frame.x).toBe(0);
    expect(inlineChild.frame.y).toBe(0);
    expect(blockChild.frame.y).toBe(40);
    // Block child stretches to full width
    expect(blockChild.frame.width).toBe(300);
  });

  it('inline-block children with different heights align to line top', function () {
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(
        <div style={{width: 300}}>
          <div style={{display: 'inline-block', width: 80, height: 60}} />
          <div style={{display: 'inline-block', width: 80, height: 30}} />
        </div>,
      );
    });

    var output = Fantom.getRenderedOutput();
    var parent = output.children[0];
    var child1 = parent.children[0];
    var child2 = parent.children[1];
    // Both start at same Y (top-aligned)
    expect(child1.frame.y).toBe(0);
    expect(child2.frame.y).toBe(0);
    // Parent height is tallest child
    expect(parent.frame.height).toBe(60);
  });
});
