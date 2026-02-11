'use strict';

var React = require('react');
var Fantom = require('@react-dom-native/fantom');

function App() {
  return (
    <div>
      <h1>Hello from RSC</h1>
      <p>Server content</p>
    </div>
  );
}

describe('Flight: basic RSC', function () {
  it('renders server components through Flight', function () {
    var payload = Fantom.renderToFlightString(<App />);
    console.log('### payload', JSON.stringify(payload));
    var element = Fantom.createFromFlight(payload);
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(element);
    });

    var output = Fantom.getRenderedOutput();
    expect(output.children.length).toBe(1);
    expect(output.children[0].type).toBe('div');
  });

  it('renders child elements from server component', function () {
    var payload = Fantom.renderToFlightString(<App />);
    var element = Fantom.createFromFlight(payload);
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(element);
    });

    var output = Fantom.getRenderedOutput();
    var div = output.children[0];
    expect(div.children.length).toBe(2);
    expect(div.children[0].type).toBe('h1');
    expect(div.children[1].type).toBe('p');
  });
});
