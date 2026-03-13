'use strict';

var React = require('react');
var Fantom = require('@react-dom-native/fantom');

function App() {
  return (
    <div style={{backgroundColor: 'blue', padding: 16}}>
      <h1 style={{color: 'white'}}>Styled heading</h1>
      <p style={{fontSize: 14}}>Styled text</p>
    </div>
  );
}

describe('Flight: props serialization', function () {
  it('preserves style props through Flight', function () {
    var payload = Fantom.renderToFlightString(<App />);
    var element = Fantom.createFromFlight(payload);
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(element);
    });

    var output = Fantom.getRenderedOutput();
    var div = output.children[0];
    expect(div.props.style.backgroundColor).toBe('blue');
    expect(div.props.style.padding).toBe(16);
  });

  it('preserves nested element props through Flight', function () {
    var payload = Fantom.renderToFlightString(<App />);
    var element = Fantom.createFromFlight(payload);
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(element);
    });

    var output = Fantom.getRenderedOutput();
    var div = output.children[0];
    expect(div.children[0].type).toBe('h1');
    expect(div.children[0].props.style.color).toBe('white');
    expect(div.children[1].type).toBe('p');
    expect(div.children[1].props.style.fontSize).toBe(14);
  });
});
