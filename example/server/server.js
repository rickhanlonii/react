'use strict';

// Babel for JSX transformation — must be registered BEFORE node-register
require('@babel/register')({
  babelrc: false,
  ignore: [/node_modules/],
  only: [/example\/server\/src/],
  presets: ['@babel/preset-react'],
  targets: {node: 'current'},
});

// Intercepts require() for 'use client' files — creates client reference proxies
require('react-server-dom-webpack/node-register')();

var express = require('express');
var React = require('react');
var path = require('path');
var url = require('url');

var app = express();
var PORT = 3001;

// Build client manifest programmatically.
// Maps file:// URLs (what node-register uses as $$id) to {id, chunks, name}.
// The `id` field is what appears in Flight I rows and must match the native module map keys.
function buildClientManifest() {
  var componentsDir = path.resolve(__dirname, '../components');
  var manifest = {};
  var components = ['Counter', 'TextInput'];

  for (var i = 0; i < components.length; i++) {
    var name = components[i];
    var filePath = path.join(componentsDir, name + '.js');
    var fileURL = url.pathToFileURL(filePath).href;

    // node-register creates proxies with $$id = fileURL
    // renderToPipeableStream looks up manifest[$$id] to get metadata for I rows
    manifest[fileURL] = {
      id: name,
      chunks: [],
      name: '*',
    };
    // Also register specific export variants
    manifest[fileURL + '#'] = {
      id: name,
      chunks: [],
      name: 'default',
    };
    manifest[fileURL + '#default'] = {
      id: name,
      chunks: [],
      name: 'default',
    };
  }

  return manifest;
}

var clientManifest = buildClientManifest();

app.get('/', function (req, res) {
  // Dynamic import to ensure babel + node-register hooks are active
  var App = require('./src/App');
  // Handle both default export styles
  var AppComponent = App.default || App;
  var element = React.createElement(AppComponent);

  res.setHeader('Content-Type', 'text/x-component');
  res.setHeader('Access-Control-Allow-Origin', '*');

  var renderToPipeableStream =
    require('react-server-dom-webpack/server').renderToPipeableStream;
  var stream = renderToPipeableStream(element, clientManifest);
  stream.pipe(res);
});

app.listen(PORT, function () {
  console.log('RSC server listening on http://localhost:' + PORT);
});
