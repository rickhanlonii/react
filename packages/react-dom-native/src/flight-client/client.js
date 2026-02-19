'use strict';

// ---------------------------------------------------------------------------
// Flight Client — RSC Wire Protocol Parser & Deserializer
//
// This module implements the React Server Components Flight wire protocol
// parser. Since react-client/flight is internal to the React monorepo and
// not published as a standalone package, this is a standalone implementation
// that parses the Flight row format and produces React element trees.
//
// Wire format: Each row is `<hex-id>:<tag><payload>\n`
// See docs/research/flight-protocol.md for full format specification.
// ---------------------------------------------------------------------------

var React = require('react');
var Config = require('./config');

// ---------------------------------------------------------------------------
// Chunk states
// ---------------------------------------------------------------------------
var PENDING = 'pending';
var RESOLVED = 'resolved';
var REJECTED = 'rejected';

// ---------------------------------------------------------------------------
// Parser states for processBinaryChunk state machine
// ---------------------------------------------------------------------------
var ROW_ID = 0;
var ROW_TAG = 1;
var ROW_DATA = 2;
var ROW_LENGTH = 3;
var ROW_BINARY = 4;

// Binary row tags (use length-prefixed format)
var BINARY_TAGS = {
  T: true, // Text
  A: true, // ArrayBuffer
  O: true, // Int8Array
  o: true, // Uint8Array
  b: true, // byte stream chunk
  U: true, // Uint8ClampedArray
  S: true, // Int16Array
  s: true, // Uint16Array
  L: true, // Int32Array
  l: true, // Uint32Array
  G: true, // Float32Array
  g: true, // Float64Array
  M: true, // BigInt64Array
  m: true, // BigUint64Array
  V: true, // DataView
};

// ---------------------------------------------------------------------------
// Chunk helpers
// ---------------------------------------------------------------------------

/**
 * Creates a pending chunk — a thenable that resolves when data arrives.
 */
function createPendingChunk() {
  var resolve = null;
  var reject = null;
  var chunk = {
    status: PENDING,
    value: undefined,
    reason: undefined,
    _resolve: null,
    _reject: null,
    then: function then(onFulfilled, onRejected) {
      if (chunk.status === RESOLVED) {
        if (onFulfilled) onFulfilled(chunk.value);
      } else if (chunk.status === REJECTED) {
        if (onRejected) onRejected(chunk.reason);
      } else {
        // Store callbacks for later
        if (!chunk._waiters) chunk._waiters = [];
        chunk._waiters.push({onFulfilled: onFulfilled, onRejected: onRejected});
      }
    },
  };
  return chunk;
}

/**
 * Resolves a chunk with a value.
 */
function resolveChunk(chunk, value) {
  if (chunk.status !== PENDING) return;
  chunk.status = RESOLVED;
  chunk.value = value;
  if (chunk._waiters) {
    for (var i = 0; i < chunk._waiters.length; i++) {
      var waiter = chunk._waiters[i];
      if (waiter.onFulfilled) waiter.onFulfilled(value);
    }
    chunk._waiters = null;
  }
}

/**
 * Rejects a chunk with an error.
 */
function rejectChunk(chunk, error) {
  if (chunk.status !== PENDING) return;
  chunk.status = REJECTED;
  chunk.reason = error;
  if (chunk._waiters) {
    for (var i = 0; i < chunk._waiters.length; i++) {
      var waiter = chunk._waiters[i];
      if (waiter.onRejected) waiter.onRejected(error);
    }
    chunk._waiters = null;
  }
}

/**
 * Gets or creates a chunk by ID.
 */
function getOrCreateChunk(response, id) {
  if (!response.chunks[id]) {
    response.chunks[id] = createPendingChunk();
  }
  return response.chunks[id];
}

// ---------------------------------------------------------------------------
// JSON reviver for $-prefixed special values
// ---------------------------------------------------------------------------

/**
 * Creates a JSON reviver that resolves $-prefixed references to other
 * chunks, React element types, symbols, and special values.
 */
function createReviver(response) {
  return function reviver(key, value) {
    // Convert element tuples: [Symbol(react.transitional.element), type, key, props]
    if (
      Array.isArray(value) &&
      value.length >= 4 &&
      value[0] === Symbol.for('react.transitional.element')
    ) {
      return {
        $$typeof: Symbol.for('react.transitional.element'),
        type: value[1],
        key: value[2],
        props: value[3],
        ref: null,
      };
    }

    if (typeof value === 'string' && value.length > 0 && value[0] === '$') {
      if (value === '$') {
        // REACT_ELEMENT_TYPE symbol marker
        return Symbol.for('react.transitional.element');
      }
      if (value[1] === '$') {
        // Escaped $ — return the string without the leading $
        return value.slice(1);
      }

      var code = value[1];
      var rest = value.slice(2);

      switch (code) {
        case 'L': {
          // Lazy reference to chunk by ID
          var chunkId = parseInt(rest, 16);
          var chunk = getOrCreateChunk(response, chunkId);
          return createLazyWrapper(chunk);
        }
        case '@': {
          // Promise reference to chunk by ID
          var promiseChunkId = parseInt(rest, 16);
          return getOrCreateChunk(response, promiseChunkId);
        }
        case 'S': {
          // Symbol.for(name)
          return Symbol.for(rest);
        }
        case 'I': {
          if (rest === 'nfinity') {
            return Infinity;
          }
          break;
        }
        case 'N': {
          if (rest === 'aN') {
            return NaN;
          }
          break;
        }
        case 'u': {
          if (rest === 'ndefined') {
            return undefined;
          }
          return undefined;
        }
        case 'D': {
          // Date
          return new Date(rest);
        }
        case 'n': {
          // BigInt
          return BigInt(rest);
        }
        case '-': {
          if (rest === '0') {
            return -0;
          }
          if (rest === 'Infinity') {
            return -Infinity;
          }
          break;
        }
        default: {
          // Check if it is a hex reference to another chunk (e.g. "$3", "$1a")
          // or a path-based reference (e.g. "$0:props:children:0:props:style")
          var colonIdx = value.indexOf(':', 1);
          var idPart = colonIdx >= 0 ? value.slice(1, colonIdx) : value.slice(1);
          var refId = parseInt(idPart, 16);
          if (!isNaN(refId)) {
            var refChunk = getOrCreateChunk(response, refId);
            var pathSegments = colonIdx >= 0 ? value.slice(colonIdx + 1).split(':') : null;
            if (refChunk.status === RESOLVED) {
              var resolved = refChunk.value;
              // Navigate path segments if present
              if (pathSegments) {
                for (var pi = 0; pi < pathSegments.length; pi++) {
                  var seg = pathSegments[pi];
                  if (resolved == null) break;
                  var numSeg = parseInt(seg, 10);
                  resolved = !isNaN(numSeg) && String(numSeg) === seg
                    ? resolved[numSeg]
                    : resolved[seg];
                }
              }
              return resolved;
            }
            // Return a lazy wrapper for pending references
            if (pathSegments) {
              return createPathLazyWrapper(refChunk, pathSegments);
            }
            return createLazyWrapper(refChunk);
          }
          break;
        }
      }
    }
    return value;
  };
}

/**
 * Creates a lazy wrapper around a chunk that React can use with Suspense.
 * Returns a lazy-like object: { $$typeof: Symbol.for('react.lazy'), ... }
 */
function createLazyWrapper(chunk) {
  var lazy = {
    $$typeof: Symbol.for('react.lazy'),
    _payload: chunk,
    _init: function _init(payload) {
      if (payload.status === RESOLVED) {
        return payload.value;
      }
      if (payload.status === REJECTED) {
        throw payload.reason;
      }
      // Still pending — throw the thenable so Suspense can catch it
      throw payload;
    },
  };
  return lazy;
}

/**
 * Creates a path-aware lazy wrapper that navigates a path within a chunk's
 * resolved value. Used for Flight protocol path-based references like
 * "$0:props:children:0:props:style" which reference a value nested inside
 * another chunk's model.
 */
function createPathLazyWrapper(chunk, pathSegments) {
  var lazy = {
    $$typeof: Symbol.for('react.lazy'),
    _payload: {chunk: chunk, path: pathSegments},
    _init: function _init(payload) {
      if (payload.chunk.status === RESOLVED) {
        var resolved = payload.chunk.value;
        for (var i = 0; i < payload.path.length; i++) {
          if (resolved == null) break;
          var seg = payload.path[i];
          var numSeg = parseInt(seg, 10);
          resolved = !isNaN(numSeg) && String(numSeg) === seg
            ? resolved[numSeg]
            : resolved[seg];
        }
        return resolved;
      }
      if (payload.chunk.status === REJECTED) {
        throw payload.chunk.reason;
      }
      throw payload.chunk;
    },
  };
  return lazy;
}

// ---------------------------------------------------------------------------
// React element tuple parsing
//
// Flight encodes React elements as: ["$", type, key, props]
// where "$" is the REACT_ELEMENT_TYPE marker.
// ---------------------------------------------------------------------------

/**
 * Converts a parsed JSON array into a React element if it matches the
 * element tuple format.
 */
function resolveModelValue(response, value) {
  if (Array.isArray(value) && value.length >= 4 && value[0] === Symbol.for('react.transitional.element')) {
    // This is a React element tuple: [$$typeof, type, key, props]
    return {
      $$typeof: Symbol.for('react.transitional.element'),
      type: value[1],
      key: value[2],
      props: value[3],
      ref: null,
    };
  }
  return value;
}

// ---------------------------------------------------------------------------
// Row processing
// ---------------------------------------------------------------------------

/**
 * Processes a model row (no tag — default row type). Parses JSON with
 * the custom reviver and resolves the chunk.
 */
function processModelRow(response, id, json) {
  var parsed = JSON.parse(json, createReviver(response));
  var resolved = resolveModelValue(response, parsed);
  var chunk = getOrCreateChunk(response, id);
  resolveChunk(chunk, resolved);
}

/**
 * Processes an Import/Module row (I tag). Resolves the client reference,
 * fetches the module on demand if needed, and stores it in the chunk.
 */
function processModuleRow(response, id, json) {
  var metadata = JSON.parse(json);
  var clientRef = Config.resolveClientReference(
    response.bundlerConfig,
    metadata,
  );

  var preloaded = Config.preloadModule(clientRef);

  if (preloaded !== null && typeof preloaded === 'object' && typeof preloaded.then === 'function') {
    // Module needs async loading — wait for preload, then resolve chunk
    preloaded.then(
      function() {
        var mod = Config.requireModule(clientRef);
        var chunk = getOrCreateChunk(response, id);
        resolveChunk(chunk, mod);
      },
      function(error) {
        var chunk = getOrCreateChunk(response, id);
        rejectChunk(chunk, error);
      }
    );
  } else {
    // Module already loaded (synchronous)
    var mod = Config.requireModule(clientRef);
    var chunk = getOrCreateChunk(response, id);
    resolveChunk(chunk, mod);
  }
}

/**
 * Processes a Hint row (H tag). Dispatches resource hints (no-op for native).
 */
function processHintRow(response, payload) {
  if (payload.length === 0) return;
  var hintCode = payload[0];
  var hintData;
  try {
    hintData = payload.length > 1 ? JSON.parse(payload.slice(1)) : undefined;
  } catch (e) {
    // Ignore malformed hints
    return;
  }
  Config.dispatchHint(hintCode, hintData);
}

/**
 * Processes an Error row (E tag). Rejects the chunk with an error.
 */
function processErrorRow(response, id, json) {
  var errorData = JSON.parse(json);
  var error = new Error(errorData.message || errorData.digest || 'Server error');
  if (errorData.digest) error.digest = errorData.digest;
  if (errorData.stack) error.stack = errorData.stack;

  var chunk = getOrCreateChunk(response, id);
  rejectChunk(chunk, error);
}

/**
 * Processes a Text row (T tag). Stores the text value in the chunk.
 */
function processTextRow(response, id, text) {
  var chunk = getOrCreateChunk(response, id);
  resolveChunk(chunk, text);
}

/**
 * Dispatches a complete row to the appropriate handler based on tag.
 */
function processRow(response, id, tag, data) {
  switch (tag) {
    case '': {
      // Model row (no tag)
      processModelRow(response, id, data);
      break;
    }
    case 'I': {
      // Import/Module
      processModuleRow(response, id, data);
      break;
    }
    case 'H': {
      // Hint
      processHintRow(response, data);
      break;
    }
    case 'E': {
      // Error
      processErrorRow(response, id, data);
      break;
    }
    case 'T': {
      // Text
      processTextRow(response, id, data);
      break;
    }
    case 'D':
    case 'W':
    case 'N':
    case 'J': {
      // Dev-only row types — silently ignore in production
      break;
    }
    default: {
      // Unknown tag — ignore
      break;
    }
  }
}

// ---------------------------------------------------------------------------
// Stream parser
// ---------------------------------------------------------------------------

/**
 * Creates a new Flight response state object.
 *
 * @param {string} bundlerConfig - Server base URL for on-demand module loading
 * @param {object} [options] - Additional options
 * @returns {object} Response state object
 */
function createResponse(bundlerConfig, options) {
  return {
    bundlerConfig: bundlerConfig || '',
    chunks: {},
    closed: false,
    options: options || {},
  };
}

/**
 * Creates a stream state object for incremental parsing.
 */
function createStreamState() {
  return {
    state: ROW_ID,
    rowID: 0,
    rowTag: '',
    buffer: '',
    rowLength: 0,
    binaryBuffer: null,
    binaryReceived: 0,
  };
}

/**
 * Processes a string chunk through the row-parsing state machine.
 * This is the main entry point for feeding data into the parser.
 *
 * @param {object} response - The Flight response state
 * @param {object} streamState - The parser state
 * @param {string} text - The text chunk to process
 */
function processStringChunk(response, streamState, text) {
  for (var i = 0; i < text.length; i++) {
    var ch = text[i];

    switch (streamState.state) {
      case ROW_ID: {
        if (ch === ':') {
          streamState.state = ROW_TAG;
        } else {
          // Hex digit for row ID
          var code = ch.charCodeAt(0);
          var digit = code > 96 ? code - 87 : code - 48;
          streamState.rowID = (streamState.rowID << 4) | digit;
        }
        break;
      }

      case ROW_TAG: {
        // Determine if this is a tagged row or a model row
        if (
          ch === '"' ||
          ch === '{' ||
          ch === '[' ||
          ch === 't' ||
          ch === 'f' ||
          ch === 'n' ||
          (ch >= '0' && ch <= '9')
        ) {
          // No tag — this is a model row. The character is part of JSON.
          streamState.rowTag = '';
          streamState.buffer = ch;
          streamState.state = ROW_DATA;
        } else if (BINARY_TAGS[ch]) {
          // Binary row — switch to length-prefix mode
          streamState.rowTag = ch;
          streamState.rowLength = 0;
          streamState.state = ROW_LENGTH;
        } else {
          // Tagged text row
          streamState.rowTag = ch;
          streamState.buffer = '';
          streamState.state = ROW_DATA;
        }
        break;
      }

      case ROW_LENGTH: {
        if (ch === ',') {
          // End of length prefix — switch to binary data mode
          streamState.state = ROW_BINARY;
          streamState.binaryBuffer = '';
          streamState.binaryReceived = 0;
        } else {
          // Hex digit for length
          var lengthCode = ch.charCodeAt(0);
          var lengthDigit = lengthCode > 96 ? lengthCode - 87 : lengthCode - 48;
          streamState.rowLength = (streamState.rowLength << 4) | lengthDigit;
        }
        break;
      }

      case ROW_BINARY: {
        // Accumulate binary data (as text since we process string chunks)
        var remaining = streamState.rowLength - streamState.binaryReceived;
        var available = text.length - i;
        if (available >= remaining) {
          // We have enough data to complete this row
          streamState.binaryBuffer += text.slice(i, i + remaining);
          i += remaining - 1; // -1 because loop increments
          processRow(
            response,
            streamState.rowID,
            streamState.rowTag,
            streamState.binaryBuffer,
          );
          // Reset for next row
          streamState.state = ROW_ID;
          streamState.rowID = 0;
          streamState.rowTag = '';
          streamState.buffer = '';
          streamState.binaryBuffer = null;
          streamState.binaryReceived = 0;
        } else {
          // Need more data
          streamState.binaryBuffer += text.slice(i);
          streamState.binaryReceived += available;
          i = text.length; // Skip past the rest
        }
        break;
      }

      case ROW_DATA: {
        if (ch === '\n') {
          // End of row
          processRow(
            response,
            streamState.rowID,
            streamState.rowTag,
            streamState.buffer,
          );
          // Reset for next row
          streamState.state = ROW_ID;
          streamState.rowID = 0;
          streamState.rowTag = '';
          streamState.buffer = '';
        } else {
          streamState.buffer += ch;
        }
        break;
      }
    }
  }
}

/**
 * Processes a binary (Uint8Array) chunk by decoding it to a string
 * and feeding it through the string parser.
 *
 * @param {object} response - The Flight response state
 * @param {object} streamState - The parser state
 * @param {Uint8Array} chunk - Binary data chunk
 */
function processBinaryChunk(response, streamState, chunk) {
  if (!streamState._decoder) {
    streamState._decoder = Config.createStringDecoder();
  }
  var text = Config.readPartialStringChunk(streamState._decoder, chunk);
  if (text) {
    processStringChunk(response, streamState, text);
  }
}

/**
 * Returns a thenable for the root chunk (ID 0).
 */
function getRoot(response) {
  return getOrCreateChunk(response, 0);
}

/**
 * Signals that the Flight stream is complete. Any pending chunks that
 * haven't been resolved will remain pending.
 */
function close(response) {
  response.closed = true;
}

/**
 * Reports a transport-level error. All pending chunks are rejected.
 */
function reportGlobalError(response, error) {
  response.closed = true;
  var ids = Object.keys(response.chunks);
  for (var i = 0; i < ids.length; i++) {
    var chunk = response.chunks[ids[i]];
    if (chunk.status === PENDING) {
      rejectChunk(chunk, error);
    }
  }
}

// ---------------------------------------------------------------------------
// High-level API: createFromStream, createFromFetch
// ---------------------------------------------------------------------------

/**
 * Creates a Flight response from a bridge-provided stream object.
 * The stream must have onChunk(cb), onDone(cb), and onError(cb) methods.
 *
 * @param {object} stream - Stream with onChunk/onDone/onError
 * @param {object} [options] - Options
 * @param {string} [options.serverURL] - Server base URL for on-demand module loading
 * @returns {Thenable} A thenable that resolves to the root element
 */
function createFromStream(stream, options) {
  if (!options) options = {};
  var bundlerConfig = options.serverURL || '';
  var response = createResponse(bundlerConfig, options);
  var streamState = createStreamState();

  stream.onChunk(function (chunk) {
    if (chunk instanceof Uint8Array) {
      processBinaryChunk(response, streamState, chunk);
    } else if (typeof chunk === 'string') {
      processStringChunk(response, streamState, chunk);
    }
  });

  stream.onDone(function () {
    // Flush any remaining partial data from the decoder
    if (streamState._decoder) {
      var remaining = Config.readFinalStringChunk(
        streamState._decoder,
        new Uint8Array(0),
      );
      if (remaining) {
        processStringChunk(response, streamState, remaining);
      }
    }
    close(response);
  });

  stream.onError(function (error) {
    reportGlobalError(response, error);
  });

  return getRoot(response);
}

/**
 * Creates a Flight response from a bridge fetch promise.
 * The promise should resolve to a stream object.
 *
 * @param {Promise<Stream>} fetchPromise - Promise resolving to a stream
 * @param {object} [options] - Options
 * @param {string} [options.serverURL] - Server base URL for on-demand module loading
 * @returns {Thenable} A thenable that resolves to the root element
 */
function createFromFetch(fetchPromise, options) {
  if (!options) options = {};
  var bundlerConfig = options.serverURL || '';
  var response = createResponse(bundlerConfig, options);
  var streamState = createStreamState();

  fetchPromise.then(
    function onStream(stream) {
      stream.onChunk(function (chunk) {
        if (chunk instanceof Uint8Array) {
          processBinaryChunk(response, streamState, chunk);
        } else if (typeof chunk === 'string') {
          processStringChunk(response, streamState, chunk);
        }
      });

      stream.onDone(function () {
        if (streamState._decoder) {
          var remaining = Config.readFinalStringChunk(
            streamState._decoder,
            new Uint8Array(0),
          );
          if (remaining) {
            processStringChunk(response, streamState, remaining);
          }
        }
        close(response);
      });

      stream.onError(function (error) {
        console.error('[Flight] Stream error:', error);
        reportGlobalError(response, error);
      });
    },
    function onError(error) {
      console.error('[Flight] Fetch error:', error);
      reportGlobalError(response, error);
    },
  );

  return getRoot(response);
}

module.exports = {
  // Low-level API
  createResponse: createResponse,
  createStreamState: createStreamState,
  processStringChunk: processStringChunk,
  processBinaryChunk: processBinaryChunk,
  getRoot: getRoot,
  close: close,
  reportGlobalError: reportGlobalError,
  // High-level API
  createFromStream: createFromStream,
  createFromFetch: createFromFetch,
  // Internals (exported for testing)
  _processRow: processRow,
  _createPendingChunk: createPendingChunk,
  _resolveChunk: resolveChunk,
  _rejectChunk: rejectChunk,
  _getOrCreateChunk: getOrCreateChunk,
};
