'use strict';

// NativeFizzStaticNode — Static prerendering for react-dom-native.
//
// Provides prerender() and prerenderToNodeStream(), which use Fizz's
// createPrerenderRequest to render with postpone tracking enabled.
// Returns { prelude, postponed } where prelude is the static shell
// instruction stream and postponed is the serializable state for resume.

var React = require('react');
var {Readable} = require('stream');

var ReactSharedInternals =
  React.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
ReactSharedInternals.getCurrentStack = null;
ReactSharedInternals.recentlyCreatedOwnerStacks = 0;

var NativeFizzConfig = require('./NativeFizzConfig');
var ReactServer = require('react-server');
var Fizz = ReactServer(NativeFizzConfig);

function createFakeWritableFromReadable(readable) {
  return {
    write: function (chunk) {
      return readable.push(chunk);
    },
    end: function () {
      readable.push(null);
    },
    destroy: function (error) {
      readable.destroy(error);
    },
  };
}

function prerenderToNodeStream(children, options) {
  return new Promise(function (resolve, reject) {
    var onFatalError = reject;

    function onAllReady() {
      var readable = new Readable({
        read: function () {
          Fizz.startFlowing(request, writable);
        },
      });
      var writable = createFakeWritableFromReadable(readable);

      var result = {
        postponed: Fizz.getPostponedState(request),
        prelude: readable,
      };
      resolve(result);
    }

    var resumableState = NativeFizzConfig.createResumableState(
      undefined,
      undefined,
      undefined,
      options ? options.bootstrapScripts : undefined,
      undefined,
    );
    var request = Fizz.createPrerenderRequest(
      children,
      resumableState,
      NativeFizzConfig.createRenderState(resumableState),
      NativeFizzConfig.createRootFormatContext(),
      options ? options.progressiveChunkSize : undefined,
      options ? options.onError : undefined,
      onAllReady,
      undefined, // onShellReady
      undefined, // onShellError
      onFatalError,
    );

    if (options && options.signal) {
      var signal = options.signal;
      if (signal.aborted) {
        Fizz.abort(request, signal.reason);
      } else {
        var listener = function () {
          Fizz.abort(request, signal.reason);
          signal.removeEventListener('abort', listener);
        };
        signal.addEventListener('abort', listener);
      }
    }

    Fizz.startWork(request);
  });
}

function prerender(children, options) {
  return new Promise(function (resolve, reject) {
    var onFatalError = reject;

    function onAllReady() {
      var writable;
      var stream = new ReadableStream(
        {
          type: 'bytes',
          start: function (controller) {
            writable = {
              write: function (chunk) {
                if (typeof chunk === 'string') {
                  controller.enqueue(new TextEncoder().encode(chunk));
                } else {
                  controller.enqueue(chunk);
                }
                return true;
              },
              end: function () {
                controller.close();
              },
              destroy: function (error) {
                if (typeof controller.error === 'function') {
                  controller.error(error);
                } else {
                  controller.close();
                }
              },
            };
          },
          pull: function () {
            Fizz.startFlowing(request, writable);
          },
          cancel: function (reason) {
            Fizz.stopFlowing(request);
            Fizz.abort(request, reason);
          },
        },
        {highWaterMark: 0},
      );

      var result = {
        postponed: Fizz.getPostponedState(request),
        prelude: stream,
      };
      resolve(result);
    }

    var resumableState = NativeFizzConfig.createResumableState(
      undefined,
      undefined,
      undefined,
      options ? options.bootstrapScripts : undefined,
      undefined,
    );
    var request = Fizz.createPrerenderRequest(
      children,
      resumableState,
      NativeFizzConfig.createRenderState(resumableState),
      NativeFizzConfig.createRootFormatContext(),
      options ? options.progressiveChunkSize : undefined,
      options ? options.onError : undefined,
      onAllReady,
      undefined, // onShellReady
      undefined, // onShellError
      onFatalError,
    );

    if (options && options.signal) {
      var signal = options.signal;
      if (signal.aborted) {
        Fizz.abort(request, signal.reason);
      } else {
        var listener = function () {
          Fizz.abort(request, signal.reason);
          signal.removeEventListener('abort', listener);
        };
        signal.addEventListener('abort', listener);
      }
    }

    Fizz.startWork(request);
  });
}

exports.prerender = prerender;
exports.prerenderToNodeStream = prerenderToNodeStream;
