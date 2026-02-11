'use strict';

var React = require('react');
var Fantom = require('@react-dom-native/fantom');

describe('Basic rendering', function () {
  it('renders a div with text', function () {
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(
        <div>
          <p>Hello</p>
        </div>,
      );
    });

    var output = Fantom.getRenderedOutput();
    expect(output.children.length).toBe(1);
    expect(output.children[0].type).toBe('div');
    expect(output.children[0].children[0].type).toBe('p');
  });

  it('renders nested elements', function () {
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(
        <div>
          <section>
            <h1>Title</h1>
            <p>Body</p>
          </section>
        </div>,
      );
    });

    var output = Fantom.getRenderedOutput();
    var section = output.children[0].children[0];
    expect(section.type).toBe('section');
    expect(section.children.length).toBe(2);
    expect(section.children[0].type).toBe('h1');
    expect(section.children[1].type).toBe('p');
  });

  it('renders with style props', function () {
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(<div style={{backgroundColor: 'red'}} />);
    });

    var output = Fantom.getRenderedOutput();
    expect(output.children[0].props.style.backgroundColor).toBe('red');
  });
});
