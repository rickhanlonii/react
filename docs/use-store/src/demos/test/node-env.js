// Loads the frozen React build in Node, in jsdom, with scheduler aliased to
// scheduler/unstable_mock, so the frame-side demo code can be checked
// without a browser. A quick check while writing the explainers; the gate
// that counts is G4 (tools/check-explainers.mjs), in Chrome.
//
//   const env = require('./node-env')();  // {React, ReactDOM, createRoot, Scheduler, document, window}

'use strict';

const path = require('path');
const Module = require('module');

const repo = path.resolve(__dirname, '../../../../..');
const reactBuild =
  process.env.REACT_BUILD ||
  path.join(repo, 'fixtures/store-bench/react-builds/head');

module.exports = function createNodeEnv() {
  process.env.NODE_ENV = process.env.NODE_ENV || 'development';
  const {JSDOM} = require(path.join(repo, 'node_modules/jsdom'));
  const dom = new JSDOM('<!doctype html><html><body></body></html>', {
    pretendToBeVisual: true,
  });
  global.window = dom.window;
  global.document = dom.window.document;
  global.HTMLElement = dom.window.HTMLElement;
  global.Node = dom.window.Node;
  global.MessageChannel = undefined;

  const aliases = {
    react: path.join(reactBuild, 'react'),
    'react-dom': path.join(reactBuild, 'react-dom'),
    'react-dom/client': path.join(reactBuild, 'react-dom/client.js'),
    scheduler: path.join(reactBuild, 'scheduler/unstable_mock.js'),
  };
  const originalResolve = Module._resolveFilename;
  Module._resolveFilename = function (request, ...rest) {
    if (Object.prototype.hasOwnProperty.call(aliases, request)) {
      return originalResolve.call(this, aliases[request], ...rest);
    }
    return originalResolve.call(this, request, ...rest);
  };

  const React = require('react');
  const ReactDOM = require('react-dom');
  const {createRoot} = require('react-dom/client');
  const Scheduler = require('scheduler');
  if (typeof React.unstable_createStore !== 'function') {
    throw new Error(
      'The React build has no unstable_createStore: ' + reactBuild
    );
  }
  return {
    React,
    ReactDOM,
    createRoot,
    Scheduler,
    window: dom.window,
    document: dom.window.document,
  };
};
