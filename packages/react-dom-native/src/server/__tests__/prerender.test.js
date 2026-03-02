'use strict';

var React = require('react');
var {prerenderToNodeStream} = require('../NativeFizzStaticNode');

function readStream(readable) {
  return new Promise(function (resolve, reject) {
    var chunks = [];
    readable.on('data', function (chunk) {
      chunks.push(chunk.toString());
    });
    readable.on('end', function () {
      resolve(chunks.join(''));
    });
    readable.on('error', reject);
  });
}

function parseInstructions(raw) {
  return raw
    .split('\n')
    .filter(function (line) {
      return line.length > 0;
    })
    .map(function (line) {
      return JSON.parse(line);
    });
}

describe('prerenderToNodeStream', function () {
  it('renders a simple element to an instruction stream', async function () {
    var element = React.createElement('div', {
      style: {color: 'red'},
    }, 'hello');

    var {prelude, postponed} = await prerenderToNodeStream(element);
    var raw = await readStream(prelude);
    var instructions = parseInstructions(raw);

    // Should have Open div, Text, Close, Root complete
    var openDiv = instructions.find(function (i) {
      return i[0] === 'O' && i[1] === 'div';
    });
    expect(openDiv).toBeDefined();
    expect(openDiv[2]).toEqual({style: {color: 'red'}});

    var textNode = instructions.find(function (i) {
      return i[0] === 'T' && i[1] === 'hello';
    });
    expect(textNode).toBeDefined();

    var rootComplete = instructions.find(function (i) {
      return i[0] === 'R';
    });
    expect(rootComplete).toBeDefined();

    // No postponed state for a fully static render
    expect(postponed).toBeNull();
  });

  it('includes bootstrapScripts as BOOT instructions', async function () {
    var element = React.createElement('div', null, 'test');

    var {prelude} = await prerenderToNodeStream(element, {
      bootstrapScripts: ['http://localhost:6000/bundle.js'],
    });
    var raw = await readStream(prelude);
    var instructions = parseInstructions(raw);

    var boot = instructions.find(function (i) {
      return i[0] === 'BOOT';
    });
    expect(boot).toBeDefined();
    expect(boot[1]).toBe('http://localhost:6000/bundle.js');
  });

  it('renders nested elements correctly', async function () {
    var element = React.createElement('div', null,
      React.createElement('span', null, 'child1'),
      React.createElement('p', null, 'child2'),
    );

    var {prelude} = await prerenderToNodeStream(element);
    var raw = await readStream(prelude);
    var instructions = parseInstructions(raw);

    var opens = instructions.filter(function (i) {
      return i[0] === 'O';
    });
    expect(opens.length).toBe(3); // div, span, p

    var types = opens.map(function (i) {
      return i[1];
    });
    expect(types).toEqual(['div', 'span', 'p']);
  });

  it('renders suspense boundaries', async function () {
    var element = React.createElement('div', null,
      React.createElement(React.Suspense, {fallback: React.createElement('span', null, 'loading')},
        React.createElement('p', null, 'content'),
      ),
    );

    var {prelude} = await prerenderToNodeStream(element);
    var raw = await readStream(prelude);
    var instructions = parseInstructions(raw);

    // The content should be inline (completed suspense boundary)
    var suspenseOpen = instructions.find(function (i) {
      return i[0] === 'O' && i[1] === '#suspense';
    });
    expect(suspenseOpen).toBeDefined();

    var pContent = instructions.find(function (i) {
      return i[0] === 'T' && i[1] === 'content';
    });
    expect(pContent).toBeDefined();
  });

  it('strips event handlers from props', async function () {
    var element = React.createElement('div', {
      onClick: function () {},
      id: 'test',
    }, 'hello');

    var {prelude} = await prerenderToNodeStream(element);
    var raw = await readStream(prelude);
    var instructions = parseInstructions(raw);

    var openDiv = instructions.find(function (i) {
      return i[0] === 'O' && i[1] === 'div';
    });
    expect(openDiv[2]).toEqual({id: 'test'});
    expect(openDiv[2].onClick).toBeUndefined();
  });
});
