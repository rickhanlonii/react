'use strict';

var React = require('react');
var {renderToPipeableStream} = require('../NativeFizzServerNode');
var {PassThrough} = require('stream');

function renderToInstructions(element) {
  return new Promise(function (resolve, reject) {
    var chunks = [];
    var passThrough = new PassThrough();
    passThrough.on('data', function (chunk) {
      chunks.push(chunk.toString());
    });
    passThrough.on('end', function () {
      var instructions = chunks
        .join('')
        .trim()
        .split('\n')
        .map(JSON.parse);
      resolve(instructions);
    });
    passThrough.on('error', reject);
    var stream = renderToPipeableStream(element, {
      onShellReady: function () {
        stream.pipe(passThrough);
      },
      onShellError: reject,
    });
  });
}

describe('form action serialization', function () {
  it('passes string action prop through to instructions', async function () {
    var element = React.createElement('form', {action: '/submit'});
    var instructions = await renderToInstructions(element);
    var openForm = instructions.find(function (i) {
      return i[0] === 'O' && i[1] === 'form';
    });
    expect(openForm).toBeDefined();
    expect(openForm[2]).toEqual({action: '/submit'});
  });

  it('passes method prop through for forms', async function () {
    var element = React.createElement('form', {
      action: '/submit',
      method: 'post',
    });
    var instructions = await renderToInstructions(element);
    var openForm = instructions.find(function (i) {
      return i[0] === 'O' && i[1] === 'form';
    });
    expect(openForm).toBeDefined();
    expect(openForm[2]).toEqual({action: '/submit', method: 'post'});
  });

  it('strips event handler props from forms', async function () {
    var element = React.createElement('form', {
      action: '/submit',
      onSubmit: function () {},
    });
    var instructions = await renderToInstructions(element);
    var openForm = instructions.find(function (i) {
      return i[0] === 'O' && i[1] === 'form';
    });
    expect(openForm).toBeDefined();
    expect(openForm[2]).toEqual({action: '/submit'});
    expect(openForm[2].onSubmit).toBeUndefined();
  });

  it('strips children prop from forms', async function () {
    var element = React.createElement(
      'form',
      {action: '/submit'},
      React.createElement('input', {name: 'test'})
    );
    var instructions = await renderToInstructions(element);
    var openForm = instructions.find(function (i) {
      return i[0] === 'O' && i[1] === 'form';
    });
    expect(openForm).toBeDefined();
    expect(openForm[2].children).toBeUndefined();
    expect(openForm[2]).toEqual({action: '/submit'});
  });

  it('renders form with no action prop', async function () {
    var element = React.createElement('form');
    var instructions = await renderToInstructions(element);
    var openForm = instructions.find(function (i) {
      return i[0] === 'O' && i[1] === 'form';
    });
    expect(openForm).toBeDefined();
    // When no props, the instruction omits the props object: ["O", "form"]
    expect(openForm.length).toBe(2);
    expect(openForm[2]).toBeUndefined();
  });
});
