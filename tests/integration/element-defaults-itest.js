'use strict';

var React = require('react');
var Fantom = require('@react-dom-native/fantom');

describe('Element defaults', function () {
  it('div gets display block by default', function () {
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(<div />);
    });

    var output = Fantom.getRenderedOutput();
    var div = output.children[0];
    expect(div.type).toBe('div');
    expect(div.props.style.display).toBe('block');
  });

  it('h1 gets fontSize 32 and fontWeight bold', function () {
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(<h1>Title</h1>);
    });

    var output = Fantom.getRenderedOutput();
    var h1 = output.children[0];
    expect(h1.type).toBe('h1');
    expect(h1.props.style.display).toBe('block');
    expect(h1.props.style.fontSize).toBe(32);
    expect(h1.props.style.fontWeight).toBe('bold');
    expect(h1.props.style.flexDirection).toBe('row');
    expect(h1.props.style.flexWrap).toBe('wrap');
  });

  it('p gets default vertical margins of 16px', function () {
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(<p>text</p>);
    });

    var output = Fantom.getRenderedOutput();
    var p = output.children[0];
    expect(p.props.style.marginTop).toBe(16);
    expect(p.props.style.marginBottom).toBe(16);
  });

  it('h1 gets default vertical margins of 21.44px', function () {
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(<h1>Title</h1>);
    });

    var output = Fantom.getRenderedOutput();
    var h1 = output.children[0];
    expect(h1.props.style.marginTop).toBe(21.44);
    expect(h1.props.style.marginBottom).toBe(21.44);
  });

  it('h2 gets default vertical margins of 19.92px', function () {
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(<h2>Title</h2>);
    });

    var output = Fantom.getRenderedOutput();
    var h2 = output.children[0];
    expect(h2.props.style.marginTop).toBe(19.92);
    expect(h2.props.style.marginBottom).toBe(19.92);
  });

  it('ul gets default vertical margins of 16px', function () {
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(<ul><li>item</li></ul>);
    });

    var output = Fantom.getRenderedOutput();
    var ul = output.children[0];
    expect(ul.props.style.marginTop).toBe(16);
    expect(ul.props.style.marginBottom).toBe(16);
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

  it('button gets display inline-block and centered layout defaults', function () {
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(<button>Click</button>);
    });

    var output = Fantom.getRenderedOutput();
    var button = output.children[0];
    expect(button.type).toBe('button');
    expect(button.props.style.display).toBe('inline-block');
    expect(button.props.style.alignItems).toBe('center');
    expect(button.props.style.justifyContent).toBe('center');
    expect(button.props.style.flexDirection).toBe('row');
  });

  it('input gets display inline-block', function () {
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(<input />);
    });

    var output = Fantom.getRenderedOutput();
    var input = output.children[0];
    expect(input.type).toBe('input');
    expect(input.props.style.display).toBe('inline-block');
  });

  it('img gets display inline-block', function () {
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(<img />);
    });

    var output = Fantom.getRenderedOutput();
    var img = output.children[0];
    expect(img.type).toBe('img');
    expect(img.props.style.display).toBe('inline-block');
  });

  it('video gets display inline-block', function () {
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(<video />);
    });

    var output = Fantom.getRenderedOutput();
    var video = output.children[0];
    expect(video.type).toBe('video');
    expect(video.props.style.display).toBe('inline-block');
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

  it('margin auto string value survives JS-to-native bridge', function () {
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(
        <div style={{width: 200, marginLeft: 'auto', marginRight: 'auto'}} />,
      );
    });

    var output = Fantom.getRenderedOutput();
    var div = output.children[0];
    expect(div.type).toBe('div');
    expect(div.props.style.marginLeft).toBe('auto');
    expect(div.props.style.marginRight).toBe('auto');
  });
});
