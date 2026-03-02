'use strict';

var React = require('react');
var {prerenderToNodeStream, prerender} = require('../NativeFizzStaticNode');
var {renderToPipeableStream} = require('../NativeFizzServerNode');
var {PassThrough} = require('stream');

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

function pipeToString(pipeable) {
  return new Promise(function (resolve, reject) {
    var passThrough = new PassThrough();
    var chunks = [];
    passThrough.on('data', function (chunk) {
      chunks.push(chunk.toString());
    });
    passThrough.on('end', function () {
      resolve(chunks.join(''));
    });
    passThrough.on('error', reject);
    pipeable.pipe(passThrough);
  });
}

function readWebStream(readableStream) {
  return new Promise(function (resolve, reject) {
    var reader = readableStream.getReader();
    var chunks = [];
    function pump() {
      reader.read().then(function (result) {
        if (result.done) {
          resolve(chunks.join(''));
          return;
        }
        chunks.push(new TextDecoder().decode(result.value));
        pump();
      }).catch(reject);
    }
    pump();
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
    expect(opens.length).toBe(3);

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

  it('produces matching Open/Close pairs', async function () {
    var element = React.createElement('div', null,
      React.createElement('section', null,
        React.createElement('h1', null, 'title'),
        React.createElement('p', null, 'body'),
      ),
    );

    var {prelude} = await prerenderToNodeStream(element);
    var raw = await readStream(prelude);
    var instructions = parseInstructions(raw);

    var openCount = instructions.filter(function (i) {
      return i[0] === 'O' && i[1] !== '#suspense';
    }).length;
    var closeCount = instructions.filter(function (i) {
      return i[0] === 'C';
    }).length;
    expect(openCount).toBe(closeCount);
  });

  it('waits for async Suspense content before resolving', async function () {
    var dataPromise = new Promise(function (resolve) {
      setTimeout(function () { resolve('async data'); }, 50);
    });

    function AsyncComponent() {
      var data = React.use(dataPromise);
      return React.createElement('p', null, data);
    }

    var element = React.createElement('div', null,
      React.createElement(React.Suspense, {
        fallback: React.createElement('span', null, 'loading...')
      },
        React.createElement(AsyncComponent)
      )
    );

    var {prelude, postponed} = await prerenderToNodeStream(element);
    var raw = await readStream(prelude);
    var instructions = parseInstructions(raw);

    // Async data should be resolved in the output
    var asyncText = instructions.find(function (i) {
      return i[0] === 'T' && i[1] === 'async data';
    });
    expect(asyncText).toBeDefined();

    // Fallback should NOT appear
    var fallback = instructions.find(function (i) {
      return i[0] === 'T' && i[1] === 'loading...';
    });
    expect(fallback).toBeUndefined();

    // No postponed state since everything resolved
    expect(postponed).toBeNull();
  });

  it('produces same output as renderToPipeableStream for static content', async function () {
    var element = React.createElement('div', {style: {color: 'red'}},
      React.createElement('span', null, 'hello'),
      React.createElement('p', {id: 'msg'}, 'world'),
    );

    // Prerender
    var {prelude} = await prerenderToNodeStream(element);
    var prerenderOutput = await readStream(prelude);

    // Render
    var renderOutput = await new Promise(function (resolve, reject) {
      var pipeable = renderToPipeableStream(element, {
        onAllReady: function () {
          pipeToString(pipeable).then(resolve).catch(reject);
        }
      });
    });

    expect(prerenderOutput).toBe(renderOutput);
  });

  it('calls onError for rendering errors', async function () {
    function BadComponent() {
      throw new Error('render error');
    }

    var errors = [];
    var element = React.createElement('div', null,
      React.createElement(React.Suspense, {
        fallback: React.createElement('span', null, 'error fallback')
      },
        React.createElement(BadComponent)
      )
    );

    var {prelude} = await prerenderToNodeStream(element, {
      onError: function (err) {
        errors.push(err.message || err);
      }
    });
    await readStream(prelude);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toBe('render error');
  });

  it('handles abort signal on already-aborted controller', async function () {
    var controller = new AbortController();
    controller.abort('pre-aborted');

    var errors = [];
    var element = React.createElement('div', null, 'test');

    var {prelude} = await prerenderToNodeStream(element, {
      signal: controller.signal,
      onError: function (err) {
        errors.push(err);
      }
    });
    await readStream(prelude);

    // Should still resolve (Fizz handles abort gracefully)
    expect(errors).toContain('pre-aborted');
  });

  it('produces postponed state when aborted with pending Suspense', async function () {
    var controller = new AbortController();
    var neverResolve = new Promise(function () {});

    function HangingComponent() {
      React.use(neverResolve);
      return React.createElement('p', null, 'never');
    }

    var element = React.createElement('div', null,
      React.createElement('h1', null, 'static'),
      React.createElement(React.Suspense, {
        fallback: React.createElement('span', null, 'fb')
      },
        React.createElement(HangingComponent)
      )
    );

    setTimeout(function () {
      controller.abort('timeout');
    }, 50);

    var {prelude, postponed} = await prerenderToNodeStream(element, {
      signal: controller.signal,
      onError: function () {},
    });
    var raw = await readStream(prelude);
    var instructions = parseInstructions(raw);

    // Static content should be in the prelude
    var staticText = instructions.find(function (i) {
      return i[0] === 'T' && i[1] === 'static';
    });
    expect(staticText).toBeDefined();

    // Fallback should be in the prelude (as pending boundary)
    var pendingBoundary = instructions.find(function (i) {
      return i[0] === 'B';
    });
    expect(pendingBoundary).toBeDefined();

    // Postponed state should exist for the resume phase
    expect(postponed).not.toBeNull();
    expect(postponed.replayNodes).toBeDefined();
    expect(postponed.replayNodes.length).toBeGreaterThan(0);
    expect(postponed.resumableState).toBeDefined();
  });
});

describe('prerender (Web Streams)', function () {
  it('returns a ReadableStream prelude', async function () {
    var element = React.createElement('div', null, 'web streams');

    var {prelude, postponed} = await prerender(element);
    expect(prelude).toBeInstanceOf(ReadableStream);

    var output = await readWebStream(prelude);
    var instructions = parseInstructions(output);

    var text = instructions.find(function (i) {
      return i[0] === 'T' && i[1] === 'web streams';
    });
    expect(text).toBeDefined();
    expect(postponed).toBeNull();
  });

  it('produces same instructions as prerenderToNodeStream', async function () {
    var element = React.createElement('div', {id: 'root'},
      React.createElement('span', null, 'child'),
    );

    var {prelude: nodePrelude} = await prerenderToNodeStream(element);
    var nodeOutput = await readStream(nodePrelude);

    var {prelude: webPrelude} = await prerender(element);
    var webOutput = await readWebStream(webPrelude);

    expect(webOutput).toBe(nodeOutput);
  });
});
