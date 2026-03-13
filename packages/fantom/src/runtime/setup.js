'use strict';

// ---------------------------------------------------------------------------
// Fantom Test Runtime
//
// Prepended to every test bundle via esbuild's inject option. Provides
// describe, it, expect, and the $$RunTests$$ global that the Swift
// TesterBridge calls to execute all registered tests.
// ---------------------------------------------------------------------------

var suites = [];
var currentSuite = null;

function describe(name, fn) {
  var suite = {name: name, tests: [], beforeEachFn: null, afterEachFn: null};
  var prev = currentSuite;
  currentSuite = suite;
  suites.push(suite);
  fn();
  currentSuite = prev;
}

function beforeEach(fn) {
  if (!currentSuite) throw new Error('beforeEach() must be inside describe()');
  currentSuite.beforeEachFn = fn;
}

function afterEach(fn) {
  if (!currentSuite) throw new Error('afterEach() must be inside describe()');
  currentSuite.afterEachFn = fn;
}

function it(name, fn) {
  if (!currentSuite) throw new Error('it() must be inside describe()');
  currentSuite.tests.push({name: name, fn: fn});
}

// Alias
var test = it;

function deepEqual(a, b) {
  if (a === b) return true;
  if (a == null || b == null) return false;
  if (typeof a !== typeof b) return false;

  if (Array.isArray(a)) {
    if (!Array.isArray(b) || a.length !== b.length) return false;
    for (var i = 0; i < a.length; i++) {
      if (!deepEqual(a[i], b[i])) return false;
    }
    return true;
  }

  if (typeof a === 'object') {
    var keysA = Object.keys(a);
    var keysB = Object.keys(b);
    if (keysA.length !== keysB.length) return false;
    for (var j = 0; j < keysA.length; j++) {
      var key = keysA[j];
      if (!deepEqual(a[key], b[key])) return false;
    }
    return true;
  }

  return false;
}

function expect(actual) {
  function createMatchers(negated) {
    return {
      toBe: function (expected) {
        var pass = actual === expected;
        if (negated ? pass : !pass) {
          throw new Error(
            'Expected ' +
              JSON.stringify(actual) +
              (negated ? ' not ' : ' ') +
              'to be ' +
              JSON.stringify(expected),
          );
        }
      },
      toEqual: function (expected) {
        var pass = deepEqual(actual, expected);
        if (negated ? pass : !pass) {
          throw new Error(
            'Expected ' +
              JSON.stringify(actual) +
              (negated ? ' not ' : ' ') +
              'to equal ' +
              JSON.stringify(expected),
          );
        }
      },
      toContain: function (item) {
        var pass = false;
        if (typeof actual === 'string') {
          pass = actual.indexOf(item) !== -1;
        } else if (Array.isArray(actual)) {
          pass = actual.indexOf(item) !== -1;
        }
        if (negated ? pass : !pass) {
          throw new Error(
            'Expected ' +
              JSON.stringify(actual) +
              (negated ? ' not ' : ' ') +
              'to contain ' +
              JSON.stringify(item),
          );
        }
      },
      toBeTruthy: function () {
        var pass = !!actual;
        if (negated ? pass : !pass) {
          throw new Error(
            'Expected ' +
              JSON.stringify(actual) +
              (negated ? ' not ' : ' ') +
              'to be truthy',
          );
        }
      },
      toBeFalsy: function () {
        var pass = !actual;
        if (negated ? pass : !pass) {
          throw new Error(
            'Expected ' +
              JSON.stringify(actual) +
              (negated ? ' not ' : ' ') +
              'to be falsy',
          );
        }
      },
      toThrow: function (msg) {
        var threw = false;
        var thrownError = null;
        try {
          actual();
        } catch (e) {
          threw = true;
          thrownError = e;
        }
        var pass = threw;
        if (msg && threw) {
          pass = thrownError.message.indexOf(msg) !== -1;
        }
        if (negated ? pass : !pass) {
          throw new Error(
            'Expected function ' +
              (negated ? 'not ' : '') +
              'to throw' +
              (msg ? ' "' + msg + '"' : ''),
          );
        }
      },
      toBeNull: function () {
        var pass = actual === null;
        if (negated ? pass : !pass) {
          throw new Error(
            'Expected ' +
              JSON.stringify(actual) +
              (negated ? ' not ' : ' ') +
              'to be null',
          );
        }
      },
      toBeDefined: function () {
        var pass = actual !== undefined;
        if (negated ? pass : !pass) {
          throw new Error(
            'Expected value ' +
              (negated ? 'not ' : '') +
              'to be defined',
          );
        }
      },
      toBeGreaterThan: function (expected) {
        var pass = actual > expected;
        if (negated ? pass : !pass) {
          throw new Error(
            'Expected ' +
              actual +
              (negated ? ' not ' : ' ') +
              'to be greater than ' +
              expected,
          );
        }
      },
    };
  }

  var matchers = createMatchers(false);
  matchers.not = createMatchers(true);
  return matchers;
}

// Polyfill performance.now for JSC (needed by React scheduler and Flight client).
if (typeof globalThis.performance === 'undefined') {
  globalThis.performance = {};
}
if (typeof globalThis.performance.now !== 'function') {
  var _perfStart = Date.now();
  globalThis.performance.now = function () { return Date.now() - _perfStart; };
}

// Polyfill TextEncoder/TextDecoder for JSC (needed by Flight client).
if (typeof globalThis.TextEncoder === 'undefined') {
  globalThis.TextEncoder = function () {};
  globalThis.TextEncoder.prototype.encode = function (str) {
    var arr = [];
    for (var i = 0; i < str.length; i++) {
      var c = str.charCodeAt(i);
      if (c < 0x80) {
        arr.push(c);
      } else if (c < 0x800) {
        arr.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
      } else {
        arr.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
      }
    }
    return new Uint8Array(arr);
  };
}

if (typeof globalThis.TextDecoder === 'undefined') {
  globalThis.TextDecoder = function () {};
  globalThis.TextDecoder.prototype.decode = function (bytes) {
    if (!bytes) return '';
    var str = '';
    for (var i = 0; i < bytes.length; i++) {
      str += String.fromCharCode(bytes[i]);
    }
    return str;
  };
}

// Minimal ReadableStream polyfill for JSC (needed by Flight client).
if (typeof globalThis.ReadableStream === 'undefined') {
  globalThis.ReadableStream = function (source) {
    this._source = source;
  };
  globalThis.ReadableStream.prototype.getReader = function () {
    var chunks = [];
    var closed = false;
    var controller = {
      enqueue: function (chunk) { chunks.push(chunk); },
      close: function () { closed = true; },
      error: function (e) { closed = true; },
    };
    this._source.start(controller);
    var index = 0;
    return {
      read: function () {
        if (index < chunks.length) {
          return Promise.resolve({value: chunks[index++], done: false});
        }
        return Promise.resolve({value: undefined, done: true});
      },
      cancel: function () {},
      releaseLock: function () {},
    };
  };
}

// Shim __webpack_require__ for react-server-dom-webpack/client.browser.
// The module accesses __webpack_require__.u at load time. In tests, actual
// client module resolution is never exercised, so a no-op shim suffices.
if (typeof globalThis.__webpack_require__ === 'undefined') {
  globalThis.__webpack_require__ = function (id) {
    throw new Error('__webpack_require__ called in test — module ' + id + ' not available');
  };
  globalThis.__webpack_require__.u = function () { return ''; };
}

// Polyfill timer and scheduling APIs for JSC (not part of ECMAScript,
// but needed by the React reconciler's scheduler).
//
// setTimeout callbacks are deferred into a queue rather than run inline,
// because React's scheduler expects setTimeout to return before the
// callback executes. The queue is drained by $$flushWork (called from
// Fantom.runTask) after the main callback completes.
var _pendingTimeouts = [];
var _nextTimeoutId = 1;

if (typeof globalThis.setTimeout === 'undefined') {
  globalThis.setTimeout = function (fn) {
    var id = _nextTimeoutId++;
    _pendingTimeouts.push({id: id, fn: fn});
    return id;
  };
}
if (typeof globalThis.clearTimeout === 'undefined') {
  globalThis.clearTimeout = function (id) {
    for (var i = 0; i < _pendingTimeouts.length; i++) {
      if (_pendingTimeouts[i].id === id) {
        _pendingTimeouts.splice(i, 1);
        break;
      }
    }
  };
}
if (typeof globalThis.queueMicrotask === 'undefined') {
  globalThis.queueMicrotask = function (fn) {
    fn();
  };
}

// Drain all pending setTimeout callbacks. Called by Fantom.runTask
// after the user callback finishes, to flush React scheduler work.
globalThis.$$flushWork = function () {
  var safety = 0;
  while (_pendingTimeouts.length > 0 && safety < 10000) {
    var entry = _pendingTimeouts.shift();
    entry.fn();
    safety++;
  }
};

// Expose test API on globalThis so test files can use them.
// esbuild's inject option wraps this file as an ESM module, so local
// function declarations are not visible to the entry point unless
// they are on globalThis.
globalThis.describe = describe;
globalThis.it = it;
globalThis.test = test;
globalThis.expect = expect;
globalThis.beforeEach = beforeEach;
globalThis.afterEach = afterEach;

// Called by Swift TesterBridge to run all registered tests
globalThis.$$RunTests$$ = function () {
  var results = {passed: 0, failed: 0, tests: []};

  for (var i = 0; i < suites.length; i++) {
    var suite = suites[i];
    for (var j = 0; j < suite.tests.length; j++) {
      var testCase = suite.tests[j];
      try {
        if (suite.beforeEachFn) {
          suite.beforeEachFn();
        }
        testCase.fn();
        if (suite.afterEachFn) {
          suite.afterEachFn();
        }
        results.passed++;
        results.tests.push({
          suite: suite.name,
          test: testCase.name,
          status: 'passed',
        });
      } catch (e) {
        results.failed++;
        results.tests.push({
          suite: suite.name,
          test: testCase.name,
          status: 'failed',
          error: e.message,
          stack: e.stack || '',
        });
      }
    }
  }

  $$reportResult(JSON.stringify(results));
};
