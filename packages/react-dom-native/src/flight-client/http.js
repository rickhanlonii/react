'use strict';

// ---------------------------------------------------------------------------
// HTTP layer for RSC Flight Client
//
// Provides fetchRSC() and callServer() which use the bridge's $$fetch global
// to make HTTP requests to a Next.js server and return stream-like objects
// compatible with the Flight client.
//
// Bridge $$fetch signature (from NativeBridge.swift):
//   $$fetch(url, headers, callback) -> void
//   callback(type: 'data'|'end'|'error', payload: string)
// ---------------------------------------------------------------------------

/**
 * Creates a stream-like object that the Flight client can consume.
 * The stream provides onChunk/onDone/onError registration methods.
 * Buffers events until listeners are registered to avoid race conditions.
 */
function createStream() {
  var chunkCallbacks = [];
  var doneCallbacks = [];
  var errorCallbacks = [];

  // Buffer for events that arrive before listeners are registered
  var bufferedChunks = [];
  var isDone = false;
  var bufferedError = null;

  return {
    onChunk: function onChunk(cb) {
      chunkCallbacks.push(cb);
      // Flush buffered chunks
      for (var i = 0; i < bufferedChunks.length; i++) {
        cb(bufferedChunks[i]);
      }
    },
    onDone: function onDone(cb) {
      doneCallbacks.push(cb);
      // If already done, call immediately
      if (isDone) {
        cb();
      }
    },
    onError: function onError(cb) {
      errorCallbacks.push(cb);
      // If already errored, call immediately
      if (bufferedError !== null) {
        cb(bufferedError);
      }
    },
    _emitChunk: function _emitChunk(data) {
      // Always buffer in case more listeners are added
      bufferedChunks.push(data);
      for (var i = 0; i < chunkCallbacks.length; i++) {
        chunkCallbacks[i](data);
      }
    },
    _emitDone: function _emitDone() {
      isDone = true;
      for (var i = 0; i < doneCallbacks.length; i++) {
        doneCallbacks[i]();
      }
    },
    _emitError: function _emitError(err) {
      bufferedError = err;
      for (var i = 0; i < errorCallbacks.length; i++) {
        errorCallbacks[i](err);
      }
    },
  };
}

/**
 * Fetches an RSC payload from a Next.js server.
 *
 * Sends a GET request with RSC headers. Returns a promise that resolves
 * to a stream object when the response begins.
 *
 * @param {string} url - The URL to fetch
 * @param {object} [options] - Options
 * @param {object} [options.headers] - Additional headers
 * @param {Array} [options.routerStateTree] - Next.js router state tree
 * @returns {Promise<Stream>} A promise resolving to a stream object
 */
function fetchRSC(url, options) {
  if (!options) options = {};

  return new Promise(function (resolve, reject) {
    var headers = {
      RSC: '1',
      'Next-Router-State-Tree': JSON.stringify(
        options.routerStateTree || [''],
      ),
      'Next-URL': url,
    };

    if (options.headers) {
      var keys = Object.keys(options.headers);
      for (var i = 0; i < keys.length; i++) {
        headers[keys[i]] = options.headers[keys[i]];
      }
    }

    var stream = createStream();
    var resolved = false;

    $$fetch(url, headers, function (type, payload) {
      if (type === 'data') {
        if (!resolved) {
          resolved = true;
          resolve(stream);
        }
        // Convert string payload to Uint8Array for Flight client
        var encoder = new TextEncoder();
        var chunk = encoder.encode(payload);
        stream._emitChunk(chunk);
      } else if (type === 'end') {
        if (!resolved) {
          resolved = true;
          resolve(stream);
        }
        stream._emitDone();
      } else if (type === 'error') {
        var err = new Error(payload || 'Network error');
        if (!resolved) {
          resolved = true;
          reject(err);
        } else {
          stream._emitError(err);
        }
      }
    });
  });
}

/**
 * Makes an HTTP request via the bridge's $$fetch, returning a stream.
 * This is a lower-level helper used by callServer and other consumers.
 *
 * @param {string} url - The URL to fetch
 * @param {object} [options] - Options
 * @param {string} [options.method] - HTTP method (default: 'GET')
 * @param {object} [options.headers] - Request headers
 * @returns {Promise<Stream>} A promise resolving to a stream object
 */
function fetchWithBridge(url, options) {
  if (!options) options = {};

  return new Promise(function (resolve, reject) {
    var headers = options.headers || {};
    var stream = createStream();
    var resolved = false;

    $$fetch(url, headers, function (type, payload) {
      if (type === 'data') {
        if (!resolved) {
          resolved = true;
          resolve(stream);
        }
        var encoder = new TextEncoder();
        var chunk = encoder.encode(payload);
        stream._emitChunk(chunk);
      } else if (type === 'end') {
        if (!resolved) {
          resolved = true;
          resolve(stream);
        }
        stream._emitDone();
      } else if (type === 'error') {
        var err = new Error(payload || 'Network error');
        if (!resolved) {
          resolved = true;
          reject(err);
        } else {
          stream._emitError(err);
        }
      }
    });
  });
}

/**
 * Invokes a server action on the Next.js server.
 *
 * @param {string} actionId - The server action ID
 * @param {Array} args - Arguments to pass to the server action
 * @param {object} options - Options
 * @param {string} options.url - Current page URL
 * @param {object} [options.serverURL] - Server URL for resolving client refs
 * @param {Array} [options.routerStateTree] - Next.js router state tree
 * @param {Function} [options.createFromStream] - Flight createFromStream function
 * @returns {Promise<any>} The server action result
 */
function callServer(actionId, args, options) {
  if (!options) options = {};

  var headers = {
    Accept: 'text/x-component',
    'Next-Action': actionId,
    'Next-Router-State-Tree': JSON.stringify(
      options.routerStateTree || [''],
    ),
    'Next-URL': options.url || '/',
  };

  return fetchWithBridge(options.url || '/', {
    headers: headers,
  }).then(function (stream) {
    if (options.createFromStream) {
      return options.createFromStream(stream, {
        serverURL: options.serverURL,
      });
    }
    return stream;
  });
}

module.exports = {
  fetchRSC: fetchRSC,
  fetchWithBridge: fetchWithBridge,
  callServer: callServer,
  createStream: createStream,
};
