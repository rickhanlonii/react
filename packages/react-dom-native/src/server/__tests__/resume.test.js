'use strict';

var React = require('react');
var {PassThrough} = require('stream');
var {prerenderToNodeStream} = require('../NativeFizzStaticNode');
var {resumeToPipeableStream, renderToPipeableStream} = require('../NativeFizzServerNode');

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

describe('resumeToPipeableStream', function () {
  it('returns correct API shape (pipe and abort)', function () {
    var fakePostponedState = {
      nextSegmentId: 1,
      rootFormatContext: {isTextContext: false},
      progressiveChunkSize: Infinity,
      resumableState: {bootstrapScripts: []},
      replayNodes: [],
      replaySlots: null,
    };

    var element = React.createElement('div', null, 'test');
    var pipeable = resumeToPipeableStream(element, fakePostponedState);

    expect(typeof pipeable.pipe).toBe('function');
    expect(typeof pipeable.abort).toBe('function');

    pipeable.abort();
  });

  it('throws when piped to multiple destinations', async function () {
    var fakePostponedState = {
      nextSegmentId: 1,
      rootFormatContext: {isTextContext: false},
      progressiveChunkSize: Infinity,
      resumableState: {bootstrapScripts: []},
      replayNodes: [],
      replaySlots: -1,
    };

    var element = React.createElement('div', null, 'test');
    var pipeable = resumeToPipeableStream(element, fakePostponedState);

    pipeable.pipe(new PassThrough());

    expect(function () {
      pipeable.pipe(new PassThrough());
    }).toThrow('React currently only supports piping to one writable stream.');
  });

  it('produces valid instructions with root-level resume', async function () {
    var fakePostponedState = {
      nextSegmentId: 1,
      rootFormatContext: {isTextContext: false},
      progressiveChunkSize: Infinity,
      resumableState: {bootstrapScripts: []},
      replayNodes: [],
      replaySlots: -1,
    };

    var element = React.createElement('div', null,
      React.createElement('p', null, 'resumed content'),
    );

    var pipeable = resumeToPipeableStream(element, fakePostponedState);
    var raw = await pipeToString(pipeable);
    var instructions = parseInstructions(raw);

    expect(instructions.length).toBeGreaterThan(0);

    var opens = instructions.filter(function (i) {
      return i[0] === 'O';
    });
    expect(opens.length).toBeGreaterThanOrEqual(1);
  });

  it('completes the full prerender→resume cycle', async function () {
    // Phase 1: Prerender with a pending async component
    var controller = new AbortController();
    var resolveData;
    var dataPromise = new Promise(function (r) { resolveData = r; });

    function AsyncContent() {
      var data = React.use(dataPromise);
      return React.createElement('p', null, data);
    }

    var element = React.createElement('div', null,
      React.createElement('h1', null, 'header'),
      React.createElement(React.Suspense, {
        fallback: React.createElement('span', null, 'loading...')
      },
        React.createElement(AsyncContent)
      )
    );

    // Abort before async resolves
    setTimeout(function () { controller.abort('timeout'); }, 50);

    var {prelude, postponed} = await prerenderToNodeStream(element, {
      signal: controller.signal,
      onError: function () {},
    });
    var preludeRaw = await readStream(prelude);
    var preludeInstructions = parseInstructions(preludeRaw);

    // Prelude should have static header content
    var headerText = preludeInstructions.find(function (i) {
      return i[0] === 'T' && i[1] === 'header';
    });
    expect(headerText).toBeDefined();

    // Prelude should have pending boundary with fallback
    var pendingBoundary = preludeInstructions.find(function (i) {
      return i[0] === 'B';
    });
    expect(pendingBoundary).toBeDefined();
    var boundaryId = pendingBoundary[1];

    // Postponed state should exist
    expect(postponed).not.toBeNull();

    // Phase 2: Resume with data now available
    resolveData('dynamic content');

    var resumeElement = React.createElement('div', null,
      React.createElement('h1', null, 'header'),
      React.createElement(React.Suspense, {
        fallback: React.createElement('span', null, 'loading...')
      },
        React.createElement(AsyncContent)
      )
    );

    var resumeRaw = await new Promise(function (resolve, reject) {
      var pipeable = resumeToPipeableStream(resumeElement, postponed, {
        onAllReady: function () {
          pipeToString(pipeable).then(resolve).catch(reject);
        },
        onShellError: reject,
      });
    });
    var resumeInstructions = parseInstructions(resumeRaw);

    // Resume should produce the completed segment
    var segment = resumeInstructions.find(function (i) {
      return i[0] === 'S';
    });
    expect(segment).toBeDefined();

    // Resume should have the dynamic content
    var dynamicText = resumeInstructions.find(function (i) {
      return i[0] === 'T' && i[1] === 'dynamic content';
    });
    expect(dynamicText).toBeDefined();

    // Resume should have the boundary reveal instruction
    var reveal = resumeInstructions.find(function (i) {
      return i[0] === 'X';
    });
    expect(reveal).toBeDefined();
    expect(reveal[1]).toBe(boundaryId);
  });

  it('preserves bootstrapScripts through the resume cycle', async function () {
    var controller = new AbortController();
    var neverResolve = new Promise(function () {});

    function Hanging() {
      React.use(neverResolve);
      return React.createElement('p', null, 'never');
    }

    var element = React.createElement('div', null,
      React.createElement(React.Suspense, {
        fallback: React.createElement('span', null, 'fb')
      },
        React.createElement(Hanging)
      )
    );

    setTimeout(function () { controller.abort(); }, 50);

    var {postponed} = await prerenderToNodeStream(element, {
      signal: controller.signal,
      bootstrapScripts: ['http://localhost:6000/bundle.js'],
      onError: function () {},
    });

    expect(postponed).not.toBeNull();
    expect(postponed.resumableState.bootstrapScripts).toEqual(
      ['http://localhost:6000/bundle.js']
    );
  });

  it('calls onError during resume for render errors', async function () {
    function BadComponent() {
      throw new Error('resume render error');
    }

    var fakePostponedState = {
      nextSegmentId: 1,
      rootFormatContext: {isTextContext: false},
      progressiveChunkSize: Infinity,
      resumableState: {bootstrapScripts: []},
      replayNodes: [],
      replaySlots: -1,
    };

    var errors = [];
    var element = React.createElement('div', null,
      React.createElement(React.Suspense, {
        fallback: React.createElement('span', null, 'error fallback')
      },
        React.createElement(BadComponent)
      )
    );

    var pipeable = resumeToPipeableStream(element, fakePostponedState, {
      onError: function (err) {
        errors.push(err.message || err);
      },
    });

    var raw = await pipeToString(pipeable);

    expect(errors.length).toBeGreaterThan(0);
    expect(errors[0]).toBe('resume render error');
  });

  it('resume completes the stream (no hanging)', async function () {
    var fakePostponedState = {
      nextSegmentId: 1,
      rootFormatContext: {isTextContext: false},
      progressiveChunkSize: Infinity,
      resumableState: {bootstrapScripts: []},
      replayNodes: [],
      replaySlots: -1,
    };

    var element = React.createElement('div', null, 'done');
    var pipeable = resumeToPipeableStream(element, fakePostponedState);

    // This should complete within the test timeout (not hang)
    var raw = await pipeToString(pipeable);
    expect(raw.length).toBeGreaterThan(0);
    expect(raw).toContain('done');
  });
});
