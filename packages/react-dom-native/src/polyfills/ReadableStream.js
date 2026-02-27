'use strict';

/**
 * Minimal ReadableStream polyfill for JavaScriptCore.
 *
 * Only implements the subset needed by react-server-dom-webpack/client:
 * - Constructor with start(controller)
 * - controller.enqueue(chunk), controller.close(), controller.error(err)
 * - stream.getReader() returning { read() -> Promise<{value, done}> }
 *
 * Does NOT implement: pull(), cancel(), pipeTo(), pipeThrough(), tee(),
 * byte streams, BYOB readers, or queuing strategy.
 */
function installReadableStreamPolyfill(target) {
  function ReadableStreamDefaultController(stream) {
    this._stream = stream;
  }

  ReadableStreamDefaultController.prototype.enqueue = function enqueue(chunk) {
    var stream = this._stream;
    if (stream._errored) {
      throw stream._storedError;
    }
    if (stream._closed) {
      throw new TypeError('Cannot enqueue to a closed ReadableStream');
    }
    if (stream._pendingRead !== null) {
      var resolve = stream._pendingRead;
      stream._pendingRead = null;
      stream._pendingReject = null;
      resolve({value: chunk, done: false});
    } else {
      stream._buffer.push(chunk);
    }
  };

  ReadableStreamDefaultController.prototype.close = function close() {
    var stream = this._stream;
    stream._closed = true;
    if (stream._pendingRead !== null) {
      var resolve = stream._pendingRead;
      stream._pendingRead = null;
      stream._pendingReject = null;
      resolve({value: undefined, done: true});
    }
  };

  ReadableStreamDefaultController.prototype.error = function error(err) {
    var stream = this._stream;
    stream._errored = true;
    stream._storedError = err;
    if (stream._pendingRead !== null) {
      var reject = stream._pendingReject;
      stream._pendingRead = null;
      stream._pendingReject = null;
      reject(err);
    }
  };

  function ReadableStreamDefaultReader(stream) {
    this._stream = stream;
  }

  ReadableStreamDefaultReader.prototype.read = function read() {
    var stream = this._stream;
    if (stream._errored) {
      return Promise.reject(stream._storedError);
    }
    if (stream._buffer.length > 0) {
      return Promise.resolve({value: stream._buffer.shift(), done: false});
    }
    if (stream._closed) {
      return Promise.resolve({value: undefined, done: true});
    }
    return new Promise(function (resolve, reject) {
      stream._pendingRead = resolve;
      stream._pendingReject = reject;
    });
  };

  function ReadableStream(underlyingSource) {
    this._buffer = [];
    this._closed = false;
    this._errored = false;
    this._storedError = null;
    this._pendingRead = null;
    this._pendingReject = null;
    this._locked = false;

    var controller = new ReadableStreamDefaultController(this);
    if (underlyingSource && typeof underlyingSource.start === 'function') {
      underlyingSource.start(controller);
    }
  }

  ReadableStream.prototype.getReader = function getReader() {
    if (this._locked) {
      throw new TypeError('ReadableStream is already locked to a reader');
    }
    this._locked = true;
    return new ReadableStreamDefaultReader(this);
  };

  target.ReadableStream = ReadableStream;
}

exports.installReadableStreamPolyfill = installReadableStreamPolyfill;
