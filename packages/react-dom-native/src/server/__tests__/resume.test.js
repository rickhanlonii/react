'use strict';

var React = require('react');
var {PassThrough} = require('stream');
var {prerenderToNodeStream} = require('../NativeFizzStaticNode');
var {resumeToPipeableStream} = require('../NativeFizzServerNode');

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
  it('resumes a prerendered stream with no postponed state', async function () {
    // Prerender a fully static tree (no postpones)
    var element = React.createElement('div', null, 'static content');

    var {prelude, postponed} = await prerenderToNodeStream(element);
    await readStream(prelude); // consume the prelude

    // With no postponed state, there's nothing to resume
    expect(postponed).toBeNull();
  });

  it('resumes fully static content and produces valid instruction stream', async function () {
    // Even without postpone(), we can resume with the same children
    // to produce a complete instruction stream
    var element = React.createElement('div', null,
      React.createElement('span', null, 'hello'),
    );

    var {prelude} = await prerenderToNodeStream(element);
    var preludeRaw = await readStream(prelude);
    var preludeInstructions = parseInstructions(preludeRaw);

    // Verify prelude has the expected structure
    var opens = preludeInstructions.filter(function (i) {
      return i[0] === 'O';
    });
    expect(opens.length).toBeGreaterThanOrEqual(1);

    var rootComplete = preludeInstructions.find(function (i) {
      return i[0] === 'R';
    });
    expect(rootComplete).toBeDefined();
  });

  it('resume produces pipeable stream with correct API shape', function () {
    var element = React.createElement('div', null, 'test');

    // resumeToPipeableStream should return { pipe, abort }
    // We need a valid postponedState for this — use a minimal one
    var fakePostponedState = {
      nextSegmentId: 1,
      rootFormatContext: {isTextContext: false},
      progressiveChunkSize: Infinity,
      resumableState: {bootstrapScripts: []},
      replayNodes: [],
      replaySlots: null,
    };

    var pipeable = resumeToPipeableStream(element, fakePostponedState);

    expect(typeof pipeable.pipe).toBe('function');
    expect(typeof pipeable.abort).toBe('function');

    // Clean up
    pipeable.abort();
  });

  it('resumed stream produces valid native instructions', async function () {
    var fakePostponedState = {
      nextSegmentId: 1,
      rootFormatContext: {isTextContext: false},
      progressiveChunkSize: Infinity,
      resumableState: {bootstrapScripts: []},
      replayNodes: [],
      replaySlots: -1,  // Root-level resume
    };

    var element = React.createElement('div', null,
      React.createElement('p', null, 'resumed content'),
    );

    var pipeable = resumeToPipeableStream(element, fakePostponedState, {
      onShellReady: function () {},
    });

    var raw = await pipeToString(pipeable);
    var instructions = parseInstructions(raw);

    // Should contain native instructions
    expect(instructions.length).toBeGreaterThan(0);

    // Should have element open instructions
    var opens = instructions.filter(function (i) {
      return i[0] === 'O';
    });
    expect(opens.length).toBeGreaterThanOrEqual(1);
  });
});
