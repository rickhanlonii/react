'use strict';

var React = require('react');
var Fantom = require('@react-dom-native/fantom');

describe('Hydration', function () {
  it('hydrates a simple div with text', function () {
    var element = (
      <div>
        <p>Hello</p>
      </div>
    );

    var root = Fantom.createHydrationRoot(element);
    Fantom.runTask(function () {
      root.hydrate(element);
    });

    var output = root.getRenderedOutput();
    expect(output.children.length).toBe(1);
    expect(output.children[0].type).toBe('div');
    expect(output.children[0].children[0].type).toBe('p');
  });

  it('hydrates nested elements', function () {
    var element = (
      <div>
        <section>
          <h1>Title</h1>
          <p>Body</p>
        </section>
      </div>
    );

    var root = Fantom.createHydrationRoot(element);
    Fantom.runTask(function () {
      root.hydrate(element);
    });

    var output = root.getRenderedOutput();
    var section = output.children[0].children[0];
    expect(section.type).toBe('section');
    expect(section.children.length).toBe(2);
    expect(section.children[0].type).toBe('h1');
    expect(section.children[1].type).toBe('p');
  });

  it('hydrates with style props preserved', function () {
    var element = <div style={{backgroundColor: 'red'}} />;

    var root = Fantom.createHydrationRoot(element);
    Fantom.runTask(function () {
      root.hydrate(element);
    });

    var output = root.getRenderedOutput();
    expect(output.children[0].props.style.backgroundColor).toBe('red');
  });

  it('supports updates after hydration', function () {
    var element = <div><p>Before</p></div>;

    var root = Fantom.createHydrationRoot(element);
    var hydrationRoot;
    Fantom.runTask(function () {
      hydrationRoot = root.hydrate(element);
    });

    // Update after hydration
    Fantom.runTask(function () {
      hydrationRoot.render(<div><p>After</p></div>);
    });

    var output = root.getRenderedOutput();
    expect(output.children[0].children[0].type).toBe('p');
  });
});
