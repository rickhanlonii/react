'use strict';

var React = require('react');
var Fantom = require('@react-dom-native/fantom');

describe('MPA Form Submit', function () {
  it('stores form action prop in rendered output', function () {
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(
        <form action="/submit">
          <input name="q" />
          <button>Go</button>
        </form>,
      );
    });

    var output = Fantom.getRenderedOutput();
    var form = output.children[0];
    expect(form.type).toBe('form');
    expect(form.props.action).toBe('/submit');
  });

  it('stores input name prop in rendered output', function () {
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(
        <form action="/submit">
          <input name="username" />
          <input name="password" />
          <button>Submit</button>
        </form>,
      );
    });

    var output = Fantom.getRenderedOutput();
    var form = output.children[0];
    // Input elements are children of the form
    var inputs = form.children.filter(function (c) {
      return c.type === 'input';
    });
    expect(inputs.length).toBe(2);
    expect(inputs[0].props.name).toBe('username');
    expect(inputs[1].props.name).toBe('password');
  });

  it('renders form with button inside', function () {
    var root = Fantom.createRoot();
    Fantom.runTask(function () {
      root.render(
        <form action="http://localhost:6001/ssr/test">
          <input name="q" />
          <button>Go</button>
        </form>,
      );
    });

    var output = Fantom.getRenderedOutput();
    var form = output.children[0];
    expect(form.type).toBe('form');
    expect(form.props.action).toBe('http://localhost:6001/ssr/test');
    var button = form.children.find(function (c) {
      return c.type === 'button';
    });
    expect(button).toBeDefined();
  });
});
