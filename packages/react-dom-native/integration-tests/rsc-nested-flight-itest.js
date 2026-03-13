'use strict';

var React = require('react');
var Fantom = require('@react-dom-native/fantom');

function Header() {
  return <h1>Nested Title</h1>;
}

function Content() {
  return (
    <section>
      <p>First paragraph</p>
      <p>Second paragraph</p>
    </section>
  );
}

function App() {
  return (
    <div>
      <Header />
      <Content />
    </div>
  );
}

describe('Flight: nested server components', function () {
  it('flattens nested server components to host elements', function () {
    var payload = Fantom.renderToFlightString(<App />);
    var element = Fantom.createFromFlight(payload);
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(element);
    });

    var output = Fantom.getRenderedOutput();
    var div = output.children[0];
    expect(div.type).toBe('div');
    // Server components (Header, Content) are flattened —
    // only host elements remain
    expect(div.children.length).toBe(2);
    expect(div.children[0].type).toBe('h1');
    expect(div.children[1].type).toBe('section');
  });

  it('preserves deeply nested host element structure', function () {
    var payload = Fantom.renderToFlightString(<App />);
    var element = Fantom.createFromFlight(payload);
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(element);
    });

    var output = Fantom.getRenderedOutput();
    var section = output.children[0].children[1];
    expect(section.type).toBe('section');
    expect(section.children.length).toBe(2);
    expect(section.children[0].type).toBe('p');
    expect(section.children[1].type).toBe('p');
  });
});
