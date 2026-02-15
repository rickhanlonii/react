'use strict';

var React = require('react');
var Fantom = require('@react-dom-native/fantom');

describe('Element defaults', function () {
  it('div gets flexDirection column by default', function () {
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(<div />);
    });

    var output = Fantom.getRenderedOutput();
    var div = output.children[0];
    expect(div.type).toBe('div');
    expect(div.props.style.flexDirection).toBe('column');
  });

  it('h1 gets fontSize 32 and fontWeight bold', function () {
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(<h1>Title</h1>);
    });

    var output = Fantom.getRenderedOutput();
    var h1 = output.children[0];
    expect(h1.type).toBe('h1');
    expect(h1.props.style.fontSize).toBe(32);
    expect(h1.props.style.fontWeight).toBe('bold');
    expect(h1.props.style.flexDirection).toBe('column');
  });

  it('user style overrides defaults', function () {
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(<div style={{flexDirection: 'row'}} />);
    });

    var output = Fantom.getRenderedOutput();
    var div = output.children[0];
    expect(div.props.style.flexDirection).toBe('row');
  });

  it('button gets centered layout defaults', function () {
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(<button>Click</button>);
    });

    var output = Fantom.getRenderedOutput();
    var button = output.children[0];
    expect(button.type).toBe('button');
    expect(button.props.style.alignItems).toBe('center');
    expect(button.props.style.justifyContent).toBe('center');
    expect(button.props.style.flexDirection).toBe('row');
  });

  it('span gets flexDirection row and flexShrink 1', function () {
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(
        <p>
          <span>text</span>
        </p>,
      );
    });

    var output = Fantom.getRenderedOutput();
    var p = output.children[0];
    var span = p.children[0];
    expect(span.type).toBe('span');
    expect(span.props.style.flexDirection).toBe('row');
    expect(span.props.style.flexShrink).toBe(1);
  });
});
