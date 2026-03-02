'use strict';

function prerender() {
  throw new Error('react-dom-native/static prerender is not yet implemented.');
}

function prerenderToNodeStream() {
  throw new Error('react-dom-native/static prerenderToNodeStream is not yet implemented.');
}

exports.prerender = prerender;
exports.prerenderToNodeStream = prerenderToNodeStream;
