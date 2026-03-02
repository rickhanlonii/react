'use strict';

// NativeFizzServerNode — Fizz server entry point for Node.js streams.
//
// Instantiates React's Fizz renderer with NativeFizzConfig and provides
// renderToPipeableStream(), the same API shape as ReactDOMServer.

var React = require('react');

// Fizz expects these internals to be initialized by the server renderer
// before createRequest is called.
var ReactSharedInternals =
  React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
ReactSharedInternals.getCurrentStack = null;
ReactSharedInternals.recentlyCreatedOwnerStacks = 0;

var ReactServer = require('react-server');
var NativeFizzConfig = require('./NativeFizzConfig');

var Fizz = ReactServer(NativeFizzConfig);

function createDrainHandler(destination, request) {
  return function () {
    Fizz.startFlowing(request, destination);
  };
}

function createCancelHandler(request, reason) {
  return function () {
    Fizz.stopFlowing(request);
    Fizz.abort(request, new Error(reason));
  };
}

function renderToPipeableStream(children, options) {
  if (!options) options = {};

  var resumableState = NativeFizzConfig.createResumableState(
    undefined,  // identifierPrefix
    undefined,  // externalRuntimeConfig
    undefined,  // bootstrapScriptContent
    options.bootstrapScripts,
    undefined,  // bootstrapModules
  );
  var request = Fizz.createRequest(
    children,
    resumableState,
    NativeFizzConfig.createRenderState(resumableState),
    NativeFizzConfig.createRootFormatContext(),
    options.progressiveChunkSize,
    options.onError,
    options.onAllReady,
    options.onShellReady,
    options.onShellError,
    undefined,  // onFatalError
    undefined,  // formState
  );

  var hasStartedFlowing = false;
  Fizz.startWork(request);

  return {
    pipe: function pipe(destination) {
      if (hasStartedFlowing) {
        throw new Error(
          'React currently only supports piping to one writable stream.',
        );
      }
      hasStartedFlowing = true;
      Fizz.prepareForStartFlowingIfBeforeAllReady(request);
      Fizz.startFlowing(request, destination);
      destination.on('drain', createDrainHandler(destination, request));
      destination.on(
        'error',
        createCancelHandler(
          request,
          'The destination stream errored while writing data.',
        ),
      );
      destination.on(
        'close',
        createCancelHandler(
          request,
          'The destination stream closed early.',
        ),
      );
      return destination;
    },
    abort: function abort(reason) {
      Fizz.abort(request, reason);
    },
  };
}

exports.renderToPipeableStream = renderToPipeableStream;
