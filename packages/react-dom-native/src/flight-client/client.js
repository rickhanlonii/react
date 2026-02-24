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
var RESOLVED = 'fulfilled';
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
// Chunk tree tracking for performance profiling
//
// During model row processing, we track which chunks reference other chunks
// so we can build a tree for the performance flush. This mirrors React
// upstream's initializingChunk + _children pattern.
// ---------------------------------------------------------------------------
var initializingChunk = null;

// Parallel track names — each must be unique so they appear as separate
// sub-tracks in Chrome DevTools. Zero-width spaces pad "Parallel" variants.
// (upstream: ReactFlightPerformanceTrack.js:62-73)
var trackNames = [
  'Primary',
  'Parallel',
  'Parallel\u200b',
  'Parallel\u200b\u200b',
  'Parallel\u200b\u200b\u200b',
  'Parallel\u200b\u200b\u200b\u200b',
  'Parallel\u200b\u200b\u200b\u200b\u200b',
  'Parallel\u200b\u200b\u200b\u200b\u200b\u200b',
  'Parallel\u200b\u200b\u200b\u200b\u200b\u200b\u200b',
  'Parallel\u200b\u200b\u200b\u200b\u200b\u200b\u200b\u200b',
];

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
    _id: -1,
    _children: [],
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
    response.chunks[id]._id = id;
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
          if (initializingChunk !== null && Array.isArray(initializingChunk._children)) {
            initializingChunk._children.push(chunk);
          }
          return createLazyWrapper(chunk);
        }
        case '@': {
          // Promise reference to chunk by ID
          var promiseChunkId = parseInt(rest, 16);
          var promiseChunk = getOrCreateChunk(response, promiseChunkId);
          if (initializingChunk !== null && Array.isArray(initializingChunk._children)) {
            initializingChunk._children.push(promiseChunk);
          }
          return promiseChunk;
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
            if (initializingChunk !== null && Array.isArray(initializingChunk._children)) {
              initializingChunk._children.push(refChunk);
            }
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
  var chunk = getOrCreateChunk(response, id);
  var prevChunk = initializingChunk;
  initializingChunk = chunk;
  var parsed = JSON.parse(json, createReviver(response));
  initializingChunk = prevChunk;
  var resolved = resolveModelValue(response, parsed);
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
    case 'N': {
      // Time origin — server's performance.timeOrigin in Unix epoch ms.
      // Convert to client-relative time: we need an offset such that
      // (serverTime + offset) gives a value in performance.now() domain.
      // Server times are relative to serverOrigin (epoch ms).
      // Client performance.now() is relative to a boot-time origin.
      // So: offset = serverOrigin - Date.now() + performance.now()
      var serverOrigin = parseFloat(data);
      response._timeOrigin = serverOrigin - Date.now() + performance.now();
      break;
    }
    case 'D': {
      // Debug info — component timing data from server
      var debugData = JSON.parse(data);
      if (!response._debugInfoMap[id]) {
        response._debugInfoMap[id] = [];
      }
      response._debugInfoMap[id].push(debugData);
      break;
    }
    case 'J': {
      // IO info — server-side async operation timing (e.g. async component functions)
      var ioData = JSON.parse(data);
      response._ioInfoMap[id] = ioData;
      if (typeof ioData.start === 'number' && typeof ioData.end === 'number') {
        response._ioInfos.push(ioData);
      }
      break;
    }
    case 'W':
    default: {
      // Unknown/unhandled row types — ignore
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
    _timeOrigin: 0,
    _debugInfoMap: {},
    _ioInfos: [],
    _ioInfoMap: {},
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
 * Resolves a $N chunk reference string to the referenced value.
 */
function resolveChunkRef(response, ref) {
  if (typeof ref === 'string' && ref.length > 1 && ref[0] === '$') {
    var refId = parseInt(ref.slice(1), 16);
    if (!isNaN(refId)) {
      // Check model chunks first, then IO info map
      if (response.chunks[refId] && response.chunks[refId].status === RESOLVED) {
        return response.chunks[refId].value;
      }
      if (response._ioInfoMap[refId]) {
        return response._ioInfoMap[refId];
      }
    }
  }
  return ref;
}

/**
 * Resolves $N chunk references in debug info entries.
 * Component info in D rows may be stored as "$N" references
 * to separate model chunks containing the actual info.
 * Awaited entries may reference outlined IO info via $N.
 */
function resolveDebugInfoEntry(response, entry) {
  if (typeof entry === 'string' && entry.length > 1 && entry[0] === '$') {
    var refId = parseInt(entry.slice(1), 16);
    if (!isNaN(refId) && response.chunks[refId] && response.chunks[refId].status === RESOLVED) {
      return response.chunks[refId].value;
    }
  }
  // Resolve nested $N references in awaited field
  if (typeof entry === 'object' && entry !== null && typeof entry.awaited === 'string') {
    entry.awaited = resolveChunkRef(response, entry.awaited);
  }
  return entry;
}

/**
 * Recursively walks the chunk tree to compute parallel track assignments
 * and extended durations (childrenEndTime) for server component traces.
 *
 * Mirrors React upstream's flushComponentPerformance algorithm
 * (ReactFlightClient.js:4406-4681).
 *
 * @param {object} response - The Flight response state
 * @param {object} root - The chunk to process
 * @param {number} trackIdx - Next available track index
 * @param {number} trackTime - Time after which the track is available
 * @param {number} parentEndTime - Parent component's end time
 * @returns {{track: number, endTime: number, component: object|null}}
 */
function flushComponentPerformance(response, root, trackIdx, trackTime, parentEndTime) {
  // If already visited (dedup), log a lightweight dedup entry and return
  if (!Array.isArray(root._children)) {
    var previousResult = root._children;
    var previousEndTime = previousResult.endTime;
    if (
      parentEndTime > -Infinity &&
      parentEndTime < previousEndTime &&
      previousResult.component !== null &&
      trackIdx < 10
    ) {
      var dedupName = previousResult.component.name + ' [deduped]';
      var dedupStart = parentEndTime + response._timeOrigin;
      var dedupEnd = previousEndTime + response._timeOrigin;
      console.timeStamp(
        dedupName,
        dedupStart < 0 ? 0 : dedupStart,
        dedupEnd,
        trackNames[trackIdx],
        'Server Components ⚛',
        'primary-light'
      );
    }
    previousResult.track = trackIdx;
    return previousResult;
  }

  var children = root._children;
  var chunkId = root._id;
  var debugInfo = chunkId >= 0 ? response._debugInfoMap[chunkId] || null : null;

  // Resolve $N references in debug info entries
  if (debugInfo) {
    for (var ri = 0; ri < debugInfo.length; ri++) {
      debugInfo[ri] = resolveDebugInfoEntry(response, debugInfo[ri]);
    }
  }

  // Find start time of the first component to detect parallel overlap
  if (debugInfo) {
    var startTime = 0;
    for (var si = 0; si < debugInfo.length; si++) {
      var sInfo = debugInfo[si];
      if (typeof sInfo === 'object' && sInfo !== null && typeof sInfo.time === 'number') {
        startTime = sInfo.time;
      }
      if (typeof sInfo === 'object' && sInfo !== null && typeof sInfo.name === 'string') {
        if (startTime < trackTime) {
          // This component started before the previous sibling finished —
          // it was rendering in parallel, so bump to the next track
          trackIdx++;
        }
        trackTime = startTime;
        break;
      }
    }
    // Find the last time marker to potentially extend parentEndTime
    for (var ei = debugInfo.length - 1; ei >= 0; ei--) {
      var eInfo = debugInfo[ei];
      if (typeof eInfo === 'object' && eInfo !== null && typeof eInfo.time === 'number') {
        if (eInfo.time > parentEndTime) {
          parentEndTime = eInfo.time;
        }
        break;
      }
    }
  }

  // Mark as visited and create result placeholder
  var result = {track: trackIdx, endTime: -Infinity, component: null};
  root._children = result;

  // Recursively flush all children
  var childrenEndTime = -Infinity;
  var childTrackIdx = trackIdx;
  var childTrackTime = trackTime;
  for (var ci = 0; ci < children.length; ci++) {
    var childResult = flushComponentPerformance(
      response, children[ci], childTrackIdx, childTrackTime, parentEndTime
    );
    if (childResult.component !== null) {
      result.component = childResult.component;
    }
    childTrackIdx = childResult.track;
    var childEndTime = childResult.endTime;
    if (childEndTime > childTrackTime) {
      childTrackTime = childEndTime;
    }
    if (childEndTime > childrenEndTime) {
      childrenEndTime = childEndTime;
    }
  }

  // Emit component timing events in reverse order (matching upstream)
  if (debugInfo) {
    var timeOrigin = response._timeOrigin;
    var componentEndTime = 0;
    var endTime = -1;
    var endTimeIdx = -1;
    var isLastComponent = true;
    for (var di = debugInfo.length - 1; di >= 0; di--) {
      var dInfo = debugInfo[di];
      if (typeof dInfo !== 'object' || dInfo === null || typeof dInfo.time !== 'number') {
        continue;
      }
      if (componentEndTime === 0) {
        // Last timestamp is the end of the last component
        componentEndTime = dInfo.time;
      }
      var time = dInfo.time;
      if (endTimeIdx > -1) {
        // Process component entries between this time marker and the previous one
        for (var ji = endTimeIdx - 1; ji > di; ji--) {
          var candidate = debugInfo[ji];
          if (typeof candidate === 'object' && candidate !== null && typeof candidate.name === 'string') {
            if (componentEndTime > childrenEndTime) {
              childrenEndTime = componentEndTime;
            }
            // Emit component render timing
            var selfTime = componentEndTime - time;
            var color;
            if (isLastComponent && root.status === REJECTED) {
              color = 'error';
            } else {
              color =
                selfTime < 0.5 ? 'primary-light' :
                selfTime < 50 ? 'primary' :
                selfTime < 500 ? 'primary-dark' : 'error';
            }
            var clientStart = time + timeOrigin;
            var clientChildrenEnd = childrenEndTime + timeOrigin;
            if (trackIdx < 10) {
              console.timeStamp(
                candidate.name,
                clientStart < 0 ? 0 : clientStart,
                clientChildrenEnd,
                trackNames[trackIdx],
                'Server Components ⚛',
                color
              );
            }
            componentEndTime = time;
            result.component = candidate;
            isLastComponent = false;
          } else if (candidate.awaited && candidate.awaited.env != null) {
            // Extend childrenEndTime with the endTime of this await span
            if (endTime > childrenEndTime) {
              childrenEndTime = endTime;
            }
            // Emit "await <name>" timing event
            var awaitName = 'await ' + candidate.awaited.name;
            var awaitColor;
            switch (candidate.awaited.name.charCodeAt(0) % 3) {
              case 0: awaitColor = 'tertiary-light'; break;
              case 1: awaitColor = 'tertiary'; break;
              default: awaitColor = 'tertiary-dark'; break;
            }
            var awaitStart = time + timeOrigin;
            var awaitEnd = endTime + timeOrigin;
            if (trackIdx < 10) {
              console.timeStamp(
                awaitName,
                awaitStart < 0 ? 0 : awaitStart,
                awaitEnd,
                trackNames[trackIdx],
                'Server Components ⚛',
                awaitColor
              );
            }
          }
        }
      } else {
        // Aborted: no end time marker found yet. Entries between the end of
        // the debugInfo array and this time marker were still in progress
        // when the stream ended.
        endTime = time; // If we don't find anything else the endTime is the start time.
        for (var ai = debugInfo.length - 1; ai > di; ai--) {
          var abortCandidate = debugInfo[ai];
          if (typeof abortCandidate === 'object' && abortCandidate !== null && typeof abortCandidate.name === 'string') {
            if (componentEndTime > childrenEndTime) {
              childrenEndTime = componentEndTime;
            }
            // Aborted component — use 'warning' color
            var abortStart = time + timeOrigin;
            var abortChildrenEnd = childrenEndTime + timeOrigin;
            if (trackIdx < 10) {
              console.timeStamp(
                abortCandidate.name,
                abortStart < 0 ? 0 : abortStart,
                abortChildrenEnd,
                trackNames[trackIdx],
                'Server Components ⚛',
                'warning'
              );
            }
            componentEndTime = time;
            result.component = abortCandidate;
            isLastComponent = false;
          } else if (typeof abortCandidate === 'object' && abortCandidate !== null && abortCandidate.awaited && abortCandidate.awaited.env != null) {
            // Aborted await — use awaited.end as fallback endTime if available
            if (abortCandidate.awaited.end > endTime) {
              endTime = abortCandidate.awaited.end;
            }
            if (endTime > childrenEndTime) {
              childrenEndTime = endTime;
            }
            var abortAwaitName = 'await ' + abortCandidate.awaited.name;
            var abortAwaitStart = time + timeOrigin;
            var abortAwaitEnd = endTime + timeOrigin;
            if (trackIdx < 10) {
              console.timeStamp(
                abortAwaitName,
                abortAwaitStart < 0 ? 0 : abortAwaitStart,
                abortAwaitEnd,
                trackNames[trackIdx],
                'Server Components ⚛',
                'warning'
              );
            }
          }
        }
      }
      endTime = time;
      endTimeIdx = di;
    }
  }

  result.endTime = childrenEndTime;
  return result;
}

/**
 * Flushes collected server component debug info as performance timing events.
 * Called when the Flight stream closes. Recursively walks the chunk tree
 * (built during model row resolution) to compute parallel track assignments
 * and extended durations, then emits console.timeStamp() calls that the
 * PerformanceTracer picks up for the Chrome DevTools trace.
 */
function flushServerComponentTiming(response) {
  if (Object.keys(response._debugInfoMap).length === 0 || typeof console.timeStamp !== 'function') {
    return;
  }

  var rootChunk = response.chunks[0];
  if (!rootChunk || !Array.isArray(rootChunk._children)) {
    return;
  }

  // Register the track ordering (so it appears after client tracks)
  console.timeStamp('Server Components ⚛', 0, 0, 'Primary', 'Server Components ⚛', 'primary-light');

  flushComponentPerformance(response, rootChunk, 0, -Infinity, -Infinity);
}

/**
 * Flushes collected IO info as performance timing events on the
 * "Server Requests ⚛" track. Called when the Flight stream closes.
 * Each IO entry represents an async server operation (e.g. an async
 * Server Component function) with start/end times.
 */
function flushServerRequestTiming(response) {
  var ioInfos = response._ioInfos;
  var timeOrigin = response._timeOrigin;

  if (ioInfos.length === 0 || typeof console.timeStamp !== 'function') {
    return;
  }

  // Register the track (appears after Server Components track)
  console.timeStamp('Server Requests ⚛', 0, 0, 'Primary', 'Server Requests ⚛', 'tertiary-light');

  for (var i = 0; i < ioInfos.length; i++) {
    var io = ioInfos[i];
    var startTime = io.start + timeOrigin;
    var endTime = io.end + timeOrigin;
    var label = io.name;

    // Errored IO uses 'error' color; otherwise color based on first character
    var color;
    if (io.errored) {
      color = 'error';
    } else if (label.length > 0) {
      switch (label.charCodeAt(0) % 3) {
        case 0: color = 'tertiary-light'; break;
        case 1: color = 'tertiary'; break;
        default: color = 'tertiary-dark'; break;
      }
    } else {
      color = 'tertiary';
    }

    console.timeStamp(
      label,
      startTime < 0 ? 0 : startTime,
      endTime,
      'Primary',
      'Server Requests ⚛',
      color
    );
  }
}

/**
 * Signals that the Flight stream is complete. Any pending chunks that
 * haven't been resolved will remain pending.
 */
function close(response) {
  flushServerComponentTiming(response);
  flushServerRequestTiming(response);
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
