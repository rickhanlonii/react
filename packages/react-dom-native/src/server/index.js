'use strict';

// react-dom-native/server — Server-side rendering for native
//
// Produces a streaming JSON-line instruction format that Swift processes
// directly to build the UIKit view tree without JavaScript.
//
// Usage:
//   const { renderToPipeableStream } = require('react-dom-native/server');
//   const { pipe } = renderToPipeableStream(<App />, {
//     onShellReady() { pipe(res); },
//     onError(err) { console.error(err); },
//   });

exports.renderToPipeableStream =
  require('./NativeFizzServerNode').renderToPipeableStream;
