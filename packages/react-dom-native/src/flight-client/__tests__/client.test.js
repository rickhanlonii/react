'use strict';

// ---------------------------------------------------------------------------
// Flight Client Tests
//
// Tests the Flight wire protocol parser, JSON reviver, React element
// deserialization, streaming updates, client references, and HTTP layer.
// ---------------------------------------------------------------------------

// Mock the $$fetch bridge global
var mockFetch = jest.fn();

beforeEach(function () {
  mockFetch.mockReset();
  global.$$fetch = mockFetch;
  // Clear module cache between tests to prevent pollution
  config._clearModuleCache();
});

afterEach(function () {
  delete global.$$fetch;
  delete globalThis.__module;
});

var client = require('../client');
var http = require('../http');
var config = require('../config');

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Creates a TextEncoder instance for encoding test payloads.
 */
var encoder = new TextEncoder();

/**
 * Encodes a Flight payload string to Uint8Array.
 */
function encode(str) {
  return encoder.encode(str);
}

/**
 * Parses a complete Flight payload string and returns the root chunk.
 * Simulates receiving the entire payload at once.
 */
function parseFlightPayload(payload, options) {
  var bundlerConfig = (options && options.serverURL) || '';
  var response = client.createResponse(bundlerConfig);
  var streamState = client.createStreamState();
  client.processStringChunk(response, streamState, payload);
  client.close(response);
  return client.getRoot(response);
}

/**
 * Waits for a thenable/chunk to resolve and returns its value.
 */
function resolveChunk(chunk) {
  return new Promise(function (resolve, reject) {
    if (chunk.status === 'resolved') {
      resolve(chunk.value);
    } else if (chunk.status === 'rejected') {
      reject(chunk.reason);
    } else {
      chunk.then(resolve, reject);
    }
  });
}

// ===========================================================================
// Config tests
// ===========================================================================
describe('Flight Client Config', function () {
  describe('createStringDecoder', function () {
    it('returns a TextDecoder instance', function () {
      var decoder = config.createStringDecoder();
      expect(decoder).toBeInstanceOf(TextDecoder);
    });
  });

  describe('readPartialStringChunk', function () {
    it('decodes a Uint8Array to string with streaming', function () {
      var decoder = config.createStringDecoder();
      var chunk = encode('Hello');
      var result = config.readPartialStringChunk(decoder, chunk);
      expect(result).toBe('Hello');
    });
  });

  describe('readFinalStringChunk', function () {
    it('decodes a final Uint8Array to string', function () {
      var decoder = config.createStringDecoder();
      var chunk = encode(' World');
      var result = config.readFinalStringChunk(decoder, chunk);
      expect(result).toBe(' World');
    });
  });

  describe('resolveClientReference', function () {
    it('resolves metadata to a fetchable URL with array format', function () {
      var bundlerConfig = 'http://localhost:6000';
      var metadata = ['my-module', [], 'default'];
      var ref = config.resolveClientReference(bundlerConfig, metadata);
      expect(ref).toEqual({url: 'http://localhost:6000/modules/my-module.js', name: 'default', id: 'my-module'});
    });

    it('resolves metadata with empty server URL', function () {
      var bundlerConfig = '';
      var metadata = ['Counter', [], 'default'];
      var ref = config.resolveClientReference(bundlerConfig, metadata);
      expect(ref).toEqual({url: '/modules/Counter.js', name: 'default', id: 'Counter'});
    });

    it('uses "default" when export name is empty', function () {
      var metadata = ['mod', [], ''];
      var ref = config.resolveClientReference('http://localhost:6000', metadata);
      expect(ref.name).toBe('default');
    });
  });

  describe('resolveServerReference', function () {
    it('parses url#exportName format', function () {
      var ref = config.resolveServerReference(null, '/api/action#myAction');
      expect(ref).toEqual({url: '/api/action', name: 'myAction'});
    });

    it('defaults to "default" when no export name', function () {
      var ref = config.resolveServerReference(null, '/api/action');
      expect(ref).toEqual({url: '/api/action', name: 'default'});
    });

    it('defaults to "default" when hash has no name', function () {
      var ref = config.resolveServerReference(null, '/api/action#');
      expect(ref).toEqual({url: '/api/action', name: 'default'});
    });
  });

  describe('requireModule', function () {
    it('returns null for null reference', function () {
      expect(config.requireModule(null)).toBeNull();
    });

    it('throws for module not in cache', function () {
      expect(function () {
        config.requireModule({url: '/modules/NotCached.js', name: 'default', id: 'NotCached'});
      }).toThrow('Module not loaded');
    });
  });

  describe('resolveClientReference — webpack object format', function () {
    it('resolves metadata as {id, chunks, name} object', function () {
      var metadata = {id: 'Counter', chunks: [], name: 'default'};
      var ref = config.resolveClientReference('http://localhost:6000', metadata);
      expect(ref).not.toBeNull();
      expect(ref.url).toBe('http://localhost:6000/modules/Counter.js');
      expect(ref.name).toBe('default');
      expect(ref.id).toBe('Counter');
    });

    it('constructs URL for any module in object format', function () {
      var metadata = {id: 'Unknown', chunks: [], name: 'default'};
      var ref = config.resolveClientReference('http://localhost:6000', metadata);
      expect(ref.url).toBe('http://localhost:6000/modules/Unknown.js');
    });
  });

  describe('preloadModule', function () {
    it('returns null for null reference', function () {
      expect(config.preloadModule(null)).toBeNull();
    });

    it('fetches module from server and caches result', function (done) {
      var moduleCode = 'var __module = (function() { return {default: function MyComp() {}}; })();';
      mockFetch.mockImplementation(function (url, headers, callback) {
        callback('data', moduleCode);
        callback('end', '');
      });

      var clientRef = {url: 'http://localhost:6000/modules/MyComp.js', name: 'default', id: 'MyComp'};
      var result = config.preloadModule(clientRef);
      expect(result).not.toBeNull();
      expect(typeof result.then).toBe('function');

      result.then(function () {
        // After preload, requireModule should return the component
        var mod = config.requireModule(clientRef);
        expect(typeof mod).toBe('function');
        done();
      });
    });

    it('returns null for already-loaded module', function (done) {
      var moduleCode = 'var __module = (function() { return {default: function Cached() {}}; })();';
      mockFetch.mockImplementation(function (url, headers, callback) {
        callback('data', moduleCode);
        callback('end', '');
      });

      var clientRef = {url: 'http://localhost:6000/modules/Cached.js', name: 'default', id: 'Cached'};
      var firstLoad = config.preloadModule(clientRef);
      firstLoad.then(function () {
        // Second call should return null (already cached)
        expect(config.preloadModule(clientRef)).toBeNull();
        done();
      });
    });
  });

  describe('prepareDestinationForModule', function () {
    it('is a no-op', function () {
      // Should not throw
      config.prepareDestinationForModule(null, null, null);
    });
  });

  describe('dispatchHint', function () {
    it('is a no-op', function () {
      // Should not throw
      config.dispatchHint('L', {href: '/style.css'});
    });
  });

  describe('bindToConsole', function () {
    it('returns a bound console function', function () {
      var bound = config.bindToConsole('log', ['prefix:']);
      expect(typeof bound).toBe('function');
    });
  });
});

// ===========================================================================
// Parser / Deserializer tests
// ===========================================================================
describe('Flight Client Parser', function () {
  // -----------------------------------------------------------------------
  // Basic model rows
  // -----------------------------------------------------------------------
  describe('model rows', function () {
    it('parses a simple string value', function () {
      var root = parseFlightPayload('0:"hello"\n');
      expect(root.status).toBe('resolved');
      expect(root.value).toBe('hello');
    });

    it('parses a number value', function () {
      var root = parseFlightPayload('0:42\n');
      expect(root.status).toBe('resolved');
      expect(root.value).toBe(42);
    });

    it('parses null value', function () {
      var root = parseFlightPayload('0:null\n');
      expect(root.status).toBe('resolved');
      expect(root.value).toBe(null);
    });

    it('parses boolean true', function () {
      var root = parseFlightPayload('0:true\n');
      expect(root.status).toBe('resolved');
      expect(root.value).toBe(true);
    });

    it('parses boolean false', function () {
      var root = parseFlightPayload('0:false\n');
      expect(root.status).toBe('resolved');
      expect(root.value).toBe(false);
    });

    it('parses an object', function () {
      var root = parseFlightPayload('0:{"a":1,"b":"two"}\n');
      expect(root.status).toBe('resolved');
      expect(root.value).toEqual({a: 1, b: 'two'});
    });

    it('parses an array', function () {
      var root = parseFlightPayload('0:[1,2,3]\n');
      expect(root.status).toBe('resolved');
      expect(root.value).toEqual([1, 2, 3]);
    });
  });

  // -----------------------------------------------------------------------
  // React element deserialization
  // -----------------------------------------------------------------------
  describe('React elements', function () {
    it('deserializes a simple div element', function () {
      var payload = '0:["$","div",null,{"children":"Hello"}]\n';
      var root = parseFlightPayload(payload);

      expect(root.status).toBe('resolved');
      var el = root.value;
      expect(el.$$typeof).toBe(Symbol.for('react.transitional.element'));
      expect(el.type).toBe('div');
      expect(el.key).toBeNull();
      expect(el.props).toEqual({children: 'Hello'});
    });

    it('deserializes nested elements', function () {
      var payload =
        '0:["$","div",null,{"children":["$","span",null,{"children":"Hi"}]}]\n';
      var root = parseFlightPayload(payload);

      expect(root.status).toBe('resolved');
      var el = root.value;
      expect(el.type).toBe('div');

      var child = el.props.children;
      expect(child.$$typeof).toBe(Symbol.for('react.transitional.element'));
      expect(child.type).toBe('span');
      expect(child.props.children).toBe('Hi');
    });

    it('deserializes element with key', function () {
      var payload = '0:["$","li","item-1",{"children":"First"}]\n';
      var root = parseFlightPayload(payload);

      var el = root.value;
      expect(el.key).toBe('item-1');
    });

    it('deserializes element with multiple children', function () {
      var payload =
        '0:["$","div",null,{"children":["Hello"," ","World"]}]\n';
      var root = parseFlightPayload(payload);

      var el = root.value;
      expect(el.props.children).toEqual(['Hello', ' ', 'World']);
    });
  });

  // -----------------------------------------------------------------------
  // Special $ values
  // -----------------------------------------------------------------------
  describe('special $ values', function () {
    it('handles escaped $ strings ($$)', function () {
      var payload = '0:{"text":"$$dollar"}\n';
      var root = parseFlightPayload(payload);
      expect(root.value.text).toBe('$dollar');
    });

    it('handles $undefined', function () {
      var payload = '0:{"val":"$undefined"}\n';
      var root = parseFlightPayload(payload);
      expect(root.value.val).toBeUndefined();
    });

    it('handles $Infinity', function () {
      var payload = '0:{"val":"$Infinity"}\n';
      var root = parseFlightPayload(payload);
      expect(root.value.val).toBe(Infinity);
    });

    it('handles $-Infinity', function () {
      var payload = '0:{"val":"$-Infinity"}\n';
      var root = parseFlightPayload(payload);
      expect(root.value.val).toBe(-Infinity);
    });

    it('handles $NaN', function () {
      var payload = '0:{"val":"$NaN"}\n';
      var root = parseFlightPayload(payload);
      expect(root.value.val).toBeNaN();
    });

    it('handles $-0', function () {
      var payload = '0:{"val":"$-0"}\n';
      var root = parseFlightPayload(payload);
      expect(Object.is(root.value.val, -0)).toBe(true);
    });

    it('handles $D for Date', function () {
      var payload = '0:{"val":"$D2024-01-15T00:00:00.000Z"}\n';
      var root = parseFlightPayload(payload);
      expect(root.value.val).toBeInstanceOf(Date);
      expect(root.value.val.toISOString()).toBe('2024-01-15T00:00:00.000Z');
    });

    it('handles $n for BigInt', function () {
      var payload = '0:{"val":"$n12345"}\n';
      var root = parseFlightPayload(payload);
      expect(root.value.val).toBe(BigInt(12345));
    });

    it('handles $S for Symbol.for', function () {
      var payload = '0:{"val":"$Sreact.fragment"}\n';
      var root = parseFlightPayload(payload);
      expect(root.value.val).toBe(Symbol.for('react.fragment'));
    });
  });

  // -----------------------------------------------------------------------
  // Multi-row payloads and references
  // -----------------------------------------------------------------------
  describe('multi-row payloads', function () {
    it('resolves references between chunks', function () {
      var payload = '1:{"text":"child"}\n0:{"child":"$1"}\n';
      var root = parseFlightPayload(payload);

      // chunk 1 resolves first, then chunk 0 references it via $1
      expect(root.status).toBe('resolved');
      expect(root.value.child).toEqual({text: 'child'});
    });

    it('processes hex row IDs correctly', function () {
      // Row ID 'a' = 10 in hex
      var payload = 'a:"hexval"\n0:{"ref":"$a"}\n';
      var root = parseFlightPayload(payload);

      expect(root.value.ref).toBe('hexval');
    });
  });

  // -----------------------------------------------------------------------
  // Lazy references ($L)
  // -----------------------------------------------------------------------
  describe('lazy references', function () {
    it('creates lazy wrappers for $L references', function () {
      var payload = '0:["$","div",null,{"children":"$L1"}]\n';
      var root = parseFlightPayload(payload);

      var el = root.value;
      var children = el.props.children;
      // $L1 should create a React lazy wrapper
      expect(children.$$typeof).toBe(Symbol.for('react.lazy'));
    });

    it('lazy wrapper resolves when referenced chunk arrives', function () {
      // Send chunk 0 first with a lazy reference, then chunk 1
      var payload =
        '0:["$","div",null,{"children":"$L1"}]\n' +
        '1:["$","span",null,{"children":"Loaded!"}]\n';
      var root = parseFlightPayload(payload);

      var el = root.value;
      var lazy = el.props.children;
      // The lazy _init should resolve the chunk
      var resolved = lazy._init(lazy._payload);
      expect(resolved.type).toBe('span');
      expect(resolved.props.children).toBe('Loaded!');
    });

    it('lazy wrapper throws pending thenable when chunk is not yet resolved', function () {
      // Only send chunk 0, chunk 1 is still pending
      var payload = '0:["$","div",null,{"children":"$L1"}]\n';
      var root = parseFlightPayload(payload);

      var el = root.value;
      var lazy = el.props.children;

      // _init should throw the pending chunk (thenable) for Suspense
      expect(function () {
        lazy._init(lazy._payload);
      }).toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // Client references (I rows)
  // -----------------------------------------------------------------------
  describe('client references (I rows)', function () {
    it('resolves a client component module via I row (async)', function (done) {
      var CounterComponent = function Counter() {};
      var moduleCode = 'var __module = (function() { return {default: ' + CounterComponent.toString() + '}; })();';
      mockFetch.mockImplementation(function (url, headers, callback) {
        callback('data', moduleCode);
        callback('end', '');
      });

      var payload =
        '1:I["Counter",[],"default"]\n' +
        '0:["$","$L1",null,{"count":0}]\n';

      var response = client.createResponse('http://localhost:6000');
      var streamState = client.createStreamState();
      client.processStringChunk(response, streamState, payload);
      client.close(response);

      var root = client.getRoot(response);
      expect(root.status).toBe('resolved');

      // Chunk 1 resolves async after module loads
      var chunk1 = client._getOrCreateChunk(response, 1);
      chunk1.then(function (value) {
        expect(typeof value).toBe('function');
        done();
      });
    });

    it('resolves I row to named export (async)', function (done) {
      var SearchInput = function SearchInput() {};
      var moduleCode = 'var __module = (function() { return {SearchInput: ' + SearchInput.toString() + '}; })();';
      mockFetch.mockImplementation(function (url, headers, callback) {
        callback('data', moduleCode);
        callback('end', '');
      });

      var payload =
        '1:I["SearchInput",[],"SearchInput"]\n';

      var response = client.createResponse('http://localhost:6000');
      var streamState = client.createStreamState();
      client.processStringChunk(response, streamState, payload);
      client.close(response);

      var chunk = client._getOrCreateChunk(response, 1);
      chunk.then(function (value) {
        expect(typeof value).toBe('function');
        done();
      });
    });
  });

  // -----------------------------------------------------------------------
  // Error rows
  // -----------------------------------------------------------------------
  describe('error rows', function () {
    it('rejects a chunk on error row', function () {
      var payload = '0:E{"digest":"ERR001","message":"Something broke"}\n';

      var response = client.createResponse('');
      var streamState = client.createStreamState();
      client.processStringChunk(response, streamState, payload);
      client.close(response);

      var root = client.getRoot(response);
      expect(root.status).toBe('rejected');
      expect(root.reason.message).toBe('Something broke');
      expect(root.reason.digest).toBe('ERR001');
    });

    it('rejects specific chunk by ID', function () {
      var payload =
        '1:E{"message":"Chunk 1 error"}\n' +
        '0:["$","div",null,{"children":"ok"}]\n';

      var response = client.createResponse('');
      var streamState = client.createStreamState();
      client.processStringChunk(response, streamState, payload);
      client.close(response);

      var root = client.getRoot(response);
      expect(root.status).toBe('resolved');

      var chunk1 = client._getOrCreateChunk(response, 1);
      expect(chunk1.status).toBe('rejected');
      expect(chunk1.reason.message).toBe('Chunk 1 error');
    });
  });

  // -----------------------------------------------------------------------
  // Hint rows
  // -----------------------------------------------------------------------
  describe('hint rows', function () {
    it('processes hint rows without error (no-op)', function () {
      // Hint rows have no ID or always use ID 0
      var payload = '0:HS["/_next/static/css/app/layout.css"]\n';

      // Should not throw
      expect(function () {
        parseFlightPayload(payload);
      }).not.toThrow();
    });
  });

  // -----------------------------------------------------------------------
  // Streaming updates
  // -----------------------------------------------------------------------
  describe('streaming', function () {
    it('handles chunks arriving incrementally', function () {
      var response = client.createResponse('');
      var streamState = client.createStreamState();

      var root = client.getRoot(response);
      expect(root.status).toBe('pending');

      // Send first part of the payload
      client.processStringChunk(response, streamState, '0:["$","div"');

      // Root is still pending (row not complete)
      expect(root.status).toBe('pending');

      // Send rest of the payload
      client.processStringChunk(
        response,
        streamState,
        ',null,{"children":"Hello"}]\n',
      );

      // Now root should be resolved
      expect(root.status).toBe('resolved');
      expect(root.value.type).toBe('div');
    });

    it('progressive rendering: resolves chunks as they arrive', function (done) {
      var response = client.createResponse('');
      var streamState = client.createStreamState();

      // Send root with a lazy reference to chunk 1
      client.processStringChunk(
        response,
        streamState,
        '0:["$","div",null,{"children":"$L1"}]\n',
      );

      var root = client.getRoot(response);
      expect(root.status).toBe('resolved');

      // Chunk 1 is pending
      var chunk1 = client._getOrCreateChunk(response, 1);
      expect(chunk1.status).toBe('pending');

      // Register a waiter on chunk 1
      chunk1.then(function (value) {
        expect(value.type).toBe('span');
        expect(value.props.children).toBe('Loaded later');
        done();
      });

      // Simulate chunk 1 arriving later
      client.processStringChunk(
        response,
        streamState,
        '1:["$","span",null,{"children":"Loaded later"}]\n',
      );
    });

    it('handles multiple rows in a single chunk', function () {
      var payload =
        '1:{"text":"first"}\n' +
        '2:{"text":"second"}\n' +
        '0:{"a":"$1","b":"$2"}\n';

      var root = parseFlightPayload(payload);

      expect(root.status).toBe('resolved');
      expect(root.value.a).toEqual({text: 'first'});
      expect(root.value.b).toEqual({text: 'second'});
    });

    it('handles binary chunks via processBinaryChunk', function () {
      var response = client.createResponse('');
      var streamState = client.createStreamState();

      var chunk = encode('0:["$","p",null,{"children":"Binary!"}]\n');
      client.processBinaryChunk(response, streamState, chunk);
      client.close(response);

      var root = client.getRoot(response);
      expect(root.status).toBe('resolved');
      expect(root.value.type).toBe('p');
      expect(root.value.props.children).toBe('Binary!');
    });
  });

  // -----------------------------------------------------------------------
  // reportGlobalError
  // -----------------------------------------------------------------------
  describe('reportGlobalError', function () {
    it('rejects all pending chunks', function () {
      var response = client.createResponse('');

      // Create some pending chunks
      var chunk0 = client._getOrCreateChunk(response, 0);
      var chunk1 = client._getOrCreateChunk(response, 1);

      expect(chunk0.status).toBe('pending');
      expect(chunk1.status).toBe('pending');

      client.reportGlobalError(response, new Error('Transport failed'));

      expect(chunk0.status).toBe('rejected');
      expect(chunk0.reason.message).toBe('Transport failed');
      expect(chunk1.status).toBe('rejected');
      expect(chunk1.reason.message).toBe('Transport failed');
    });

    it('does not affect already-resolved chunks', function () {
      var response = client.createResponse('');
      var streamState = client.createStreamState();

      client.processStringChunk(response, streamState, '0:"resolved"\n');

      var root = client.getRoot(response);
      expect(root.status).toBe('resolved');

      // Create a pending chunk
      var chunk1 = client._getOrCreateChunk(response, 1);

      client.reportGlobalError(response, new Error('Error'));

      // Root should still be resolved
      expect(root.status).toBe('resolved');
      expect(root.value).toBe('resolved');

      // Chunk 1 should be rejected
      expect(chunk1.status).toBe('rejected');
    });
  });

  // -----------------------------------------------------------------------
  // Dev-only row types
  // -----------------------------------------------------------------------
  describe('dev-only row types', function () {
    it('collects D (Debug) rows into _debugInfoMap', function () {
      var response = client.createResponse('');
      var streamState = client.createStreamState();
      client.processStringChunk(response, streamState, '1:D{"name":"MyComponent"}\n0:"ok"\n');
      expect(response._debugInfoMap[1]).toEqual([{name: 'MyComponent'}]);
      var root = client.getRoot(response);
      expect(root.value).toBe('ok');
    });

    it('stores N (Time Origin) rows as time offset', function () {
      var response = client.createResponse('');
      var streamState = client.createStreamState();
      // Server sends its Date.now() as the time origin.
      // The client converts to performance.now() domain:
      //   offset = serverOrigin - Date.now() + performance.now()
      // If serverOrigin ≈ Date.now() - 100, offset ≈ performance.now() - 100
      var nowMs = performance.now();
      var fakeOrigin = Date.now() - 100;
      client.processStringChunk(response, streamState, '0:N' + fakeOrigin + '\n1:"ok"\n');
      // offset should be approximately (performance.now() - 100)
      expect(response._timeOrigin).toBeCloseTo(nowMs - 100, -1);
    });

    it('ignores W (Console) rows', function () {
      var payload = '1:W["log","hello"]\n0:"ok"\n';
      var root = parseFlightPayload(payload);
      expect(root.value).toBe('ok');
    });
  });

  // -----------------------------------------------------------------------
  // Server component timing (flushServerComponentTiming via close)
  // -----------------------------------------------------------------------
  describe('server component timing', function () {
    it('emits console.timeStamp calls on close when D/N rows present', function () {
      var calls = [];
      console.timeStamp = function () {
        calls.push(Array.prototype.slice.call(arguments));
      };

      var response = client.createResponse('');
      var streamState = client.createStreamState();
      // N row: server time origin (same as client for simplicity)
      var payload = '0:N' + performance.timeOrigin + '\n';
      // D rows for chunk 1: time-start, component, time-end
      payload += '1:D{"time":10}\n';
      payload += '1:D{"name":"App","env":"Server"}\n';
      payload += '1:D{"time":25}\n';
      // Model rows: chunk 1 resolves, chunk 0 references chunk 1
      payload += '1:"hello"\n';
      payload += '0:{"child":"$1"}\n';
      client.processStringChunk(response, streamState, payload);
      client.close(response);

      // First call: track registration
      expect(calls[0][0]).toBe('Server Components ⚛');
      expect(calls[0][4]).toBe('Server Components ⚛');
      // Second call: component timing
      expect(calls[1][0]).toBe('App');
      expect(calls[1][3]).toBe('Primary');
      expect(calls[1][4]).toBe('Server Components ⚛');

      delete console.timeStamp;
    });

    it('skips timing flush when no D rows collected', function () {
      var called = false;
      console.timeStamp = function () {
        called = true;
      };

      var response = client.createResponse('');
      var streamState = client.createStreamState();
      client.processStringChunk(response, streamState, '0:"ok"\n');
      client.close(response);

      expect(called).toBe(false);
      delete console.timeStamp;
    });

    it('assigns parallel tracks when components overlap in time', function () {
      var calls = [];
      console.timeStamp = function () {
        calls.push(Array.prototype.slice.call(arguments));
      };

      var response = client.createResponse('');
      var streamState = client.createStreamState();
      var payload = '0:N' + performance.timeOrigin + '\n';
      // Parent component on chunk 1
      payload += '1:D{"time":0}\n';
      payload += '1:D{"name":"Parent"}\n';
      payload += '1:D{"time":1}\n';
      // Child 1 on chunk 2 — starts at 0, ends at 500
      payload += '2:D{"time":0}\n';
      payload += '2:D{"name":"Child1"}\n';
      payload += '2:D{"time":500}\n';
      // Child 2 on chunk 3 — starts at 0 (overlaps with Child1), ends at 1000
      payload += '3:D{"time":0}\n';
      payload += '3:D{"name":"Child2"}\n';
      payload += '3:D{"time":1000}\n';
      // Model rows: children resolve first, then parent references them
      payload += '2:"section1"\n';
      payload += '3:"section2"\n';
      payload += '1:{"a":"$2","b":"$3"}\n';
      payload += '0:{"root":"$1"}\n';
      client.processStringChunk(response, streamState, payload);
      client.close(response);

      // Filter out track registration
      var componentCalls = calls.filter(function (c) {
        return c[0] !== 'Server Components ⚛';
      });

      // Find each component's call
      var child1 = componentCalls.find(function(c) { return c[0] === 'Child1'; });
      var child2 = componentCalls.find(function(c) { return c[0] === 'Child2'; });
      var parent = componentCalls.find(function(c) { return c[0] === 'Parent'; });

      expect(child1).toBeDefined();
      expect(child2).toBeDefined();
      expect(parent).toBeDefined();

      // Child1 on Primary (first child, no overlap)
      expect(child1[3]).toBe('Primary');
      // Child2 on Parallel (overlaps with Child1 — starts at 0, but Child1 ends at 500)
      expect(child2[3]).toBe('Parallel');
      // Parent on Primary
      expect(parent[3]).toBe('Primary');

      // All on the Server Components track group
      expect(child1[4]).toBe('Server Components ⚛');
      expect(child2[4]).toBe('Server Components ⚛');
      expect(parent[4]).toBe('Server Components ⚛');

      delete console.timeStamp;
    });

    it('extends component duration to include child end times', function () {
      var calls = [];
      console.timeStamp = function () {
        calls.push(Array.prototype.slice.call(arguments));
      };

      var response = client.createResponse('');
      var streamState = client.createStreamState();
      var payload = '0:N' + performance.timeOrigin + '\n';
      // Parent: self time 0-1ms
      payload += '1:D{"time":0}\n';
      payload += '1:D{"name":"Parent"}\n';
      payload += '1:D{"time":1}\n';
      // Child: self time 0-3000ms (async work)
      payload += '2:D{"time":0}\n';
      payload += '2:D{"name":"SlowChild"}\n';
      payload += '2:D{"time":3000}\n';
      // Model rows
      payload += '2:"content"\n';
      payload += '1:{"child":"$2"}\n';
      payload += '0:{"root":"$1"}\n';
      client.processStringChunk(response, streamState, payload);
      client.close(response);

      var componentCalls = calls.filter(function (c) {
        return c[0] !== 'Server Components ⚛';
      });

      var parent = componentCalls.find(function(c) { return c[0] === 'Parent'; });
      var child = componentCalls.find(function(c) { return c[0] === 'SlowChild'; });

      expect(parent).toBeDefined();
      expect(child).toBeDefined();

      // Parent's end time (arg[2]) should match child's end time
      // Both extend to childrenEndTime (3000 + timeOrigin)
      expect(parent[2]).toBe(child[2]);

      delete console.timeStamp;
    });

    it('emits await entries for awaited async work within components', function () {
      var calls = [];
      console.timeStamp = function () {
        calls.push(Array.prototype.slice.call(arguments));
      };

      var response = client.createResponse('');
      var streamState = client.createStreamState();
      var payload = '0:N' + performance.timeOrigin + '\n';
      // Component with awaited entry: time-start, component, awaited, time-end
      payload += '1:D{"time":0}\n';
      payload += '1:D{"name":"SlowSection","env":"Server"}\n';
      payload += '1:D{"awaited":{"name":"sleep","env":"Server"}}\n';
      payload += '1:D{"time":500}\n';
      // Model rows
      payload += '1:"content"\n';
      payload += '0:{"root":"$1"}\n';
      client.processStringChunk(response, streamState, payload);
      client.close(response);

      var componentCalls = calls.filter(function (c) {
        return c[0] !== 'Server Components ⚛';
      });

      // Should have both the component and the await entry
      var component = componentCalls.find(function(c) { return c[0] === 'SlowSection'; });
      var awaitEntry = componentCalls.find(function(c) { return c[0] === 'await sleep'; });

      expect(component).toBeDefined();
      expect(awaitEntry).toBeDefined();

      // Await entry should be on the same track as the component
      expect(awaitEntry[3]).toBe(component[3]);
      expect(awaitEntry[4]).toBe('Server Components ⚛');

      // Await entry should use tertiary color scheme
      expect(awaitEntry[5]).toMatch(/^tertiary/);

      // Await start should match component start time, end should match component end time
      expect(awaitEntry[1]).toBe(component[1]); // same start
      expect(awaitEntry[2]).toBe(component[2]); // same end

      delete console.timeStamp;
    });

    it('resolves $N references in awaited entries from outlined J rows', function () {
      var calls = [];
      console.timeStamp = function () {
        calls.push(Array.prototype.slice.call(arguments));
      };

      var response = client.createResponse('');
      var streamState = client.createStreamState();
      var payload = '0:N' + performance.timeOrigin + '\n';
      // J row outlines the IO info at chunk ID 0xa (10)
      payload += 'a:J{"name":"fetch","start":0,"end":400,"env":"Server"}\n';
      // D rows for chunk 1: time-start, component, awaited ($a ref to J row), time-end
      payload += '1:D{"time":0}\n';
      payload += '1:D{"name":"DataLoader","env":"Server"}\n';
      payload += '1:D{"awaited":"$a","env":"Server"}\n';
      payload += '1:D{"time":500}\n';
      // Model rows
      payload += '1:"data"\n';
      payload += '0:{"root":"$1"}\n';
      client.processStringChunk(response, streamState, payload);
      client.close(response);

      var componentCalls = calls.filter(function (c) {
        return c[0] !== 'Server Components ⚛';
      });

      var component = componentCalls.find(function(c) { return c[0] === 'DataLoader'; });
      var awaitEntry = componentCalls.find(function(c) { return c[0] === 'await fetch'; });

      expect(component).toBeDefined();
      expect(awaitEntry).toBeDefined();

      // Await entry should use the resolved IO info's name
      expect(awaitEntry[3]).toBe(component[3]);
      expect(awaitEntry[4]).toBe('Server Components ⚛');
      expect(awaitEntry[5]).toMatch(/^tertiary/);

      delete console.timeStamp;
    });
  });

  // -----------------------------------------------------------------------
  // Missing performance track features (fixtures for planned work)
  // -----------------------------------------------------------------------
  describe('aborted component timing', function () {
    it('emits aborted component with warning color when no end time marker', function () {
      // When the server stream ends before a component finishes rendering,
      // the D rows have a start time but no end time. The upstream handles
      // this in the else branch (endTimeIdx === -1) and uses 'warning' color.
      var calls = [];
      console.timeStamp = function () {
        calls.push(Array.prototype.slice.call(arguments));
      };

      var response = client.createResponse('');
      var streamState = client.createStreamState();
      var payload = '0:N' + performance.timeOrigin + '\n';
      // Chunk 1: component with start time but NO end time (aborted)
      payload += '1:D{"time":100}\n';
      payload += '1:D{"name":"AbortedComponent","env":"Server"}\n';
      // No closing 1:D{"time":...} — stream ends before component finishes
      // Model rows
      payload += '1:"partial"\n';
      payload += '0:{"root":"$1"}\n';
      client.processStringChunk(response, streamState, payload);
      client.close(response);

      var componentCalls = calls.filter(function (c) {
        return c[0] !== 'Server Components ⚛';
      });

      var aborted = componentCalls.find(function(c) { return c[0] === 'AbortedComponent'; });
      expect(aborted).toBeDefined();
      // Aborted components should use 'warning' color
      expect(aborted[5]).toBe('warning');
      expect(aborted[4]).toBe('Server Components ⚛');

      delete console.timeStamp;
    });

    it('handles mix of completed and aborted components', function () {
      // When a parent completes but a later component in the same chunk aborts
      var calls = [];
      console.timeStamp = function () {
        calls.push(Array.prototype.slice.call(arguments));
      };

      var response = client.createResponse('');
      var streamState = client.createStreamState();
      var payload = '0:N' + performance.timeOrigin + '\n';
      // Chunk 1: first component completes, second aborts
      payload += '1:D{"time":0}\n';
      payload += '1:D{"name":"CompletedParent","env":"Server"}\n';
      payload += '1:D{"time":100}\n';
      payload += '1:D{"name":"AbortedChild","env":"Server"}\n';
      // No end time for AbortedChild
      // Model rows
      payload += '1:"data"\n';
      payload += '0:{"root":"$1"}\n';
      client.processStringChunk(response, streamState, payload);
      client.close(response);

      var componentCalls = calls.filter(function (c) {
        return c[0] !== 'Server Components ⚛';
      });

      var completed = componentCalls.find(function(c) { return c[0] === 'CompletedParent'; });
      var aborted = componentCalls.find(function(c) { return c[0] === 'AbortedChild'; });

      expect(completed).toBeDefined();
      expect(aborted).toBeDefined();
      // Completed uses normal color, aborted uses warning
      expect(aborted[5]).toBe('warning');
      expect(completed[5]).not.toBe('warning');

      delete console.timeStamp;
    });
  });

  describe('errored component timing', function () {
    it('emits errored component with error color when chunk is rejected', function () {
      // When a server component throws, the chunk gets an E row.
      // The rootmost component in that chunk should use 'error' color.
      var calls = [];
      console.timeStamp = function () {
        calls.push(Array.prototype.slice.call(arguments));
      };

      var response = client.createResponse('');
      var streamState = client.createStreamState();
      var payload = '0:N' + performance.timeOrigin + '\n';
      // Chunk 1: component renders but errors
      payload += '1:D{"time":0}\n';
      payload += '1:D{"name":"FailingComponent","env":"Server"}\n';
      payload += '1:D{"time":100}\n';
      // E row rejects chunk 1
      payload += '1:E{"message":"Component threw an error"}\n';
      // Parent references the errored chunk
      payload += '0:{"root":"$1"}\n';
      client.processStringChunk(response, streamState, payload);
      client.close(response);

      var componentCalls = calls.filter(function (c) {
        return c[0] !== 'Server Components ⚛';
      });

      var errored = componentCalls.find(function(c) { return c[0] === 'FailingComponent'; });
      expect(errored).toBeDefined();
      // Errored components should use 'error' color regardless of self-time
      expect(errored[5]).toBe('error');
      expect(errored[4]).toBe('Server Components ⚛');

      delete console.timeStamp;
    });
  });

  describe('deduped component timing', function () {
    it('emits deduped entry when the same chunk is referenced by multiple parents', function () {
      // When two parent chunks reference the same child chunk, the second
      // visit should emit a lightweight dedup entry instead of re-logging
      // the full component render.
      var calls = [];
      console.timeStamp = function () {
        calls.push(Array.prototype.slice.call(arguments));
      };

      var response = client.createResponse('');
      var streamState = client.createStreamState();
      var payload = '0:N' + performance.timeOrigin + '\n';
      // Shared child chunk (chunk 3)
      payload += '3:D{"time":0}\n';
      payload += '3:D{"name":"SharedCard","env":"Server"}\n';
      payload += '3:D{"time":50}\n';
      // Parent 1 (chunk 1) references shared child
      payload += '1:D{"time":0}\n';
      payload += '1:D{"name":"Parent1","env":"Server"}\n';
      payload += '1:D{"time":1}\n';
      // Parent 2 (chunk 2) also references shared child
      payload += '2:D{"time":0}\n';
      payload += '2:D{"name":"Parent2","env":"Server"}\n';
      payload += '2:D{"time":1}\n';
      // Model rows — both parents reference chunk 3
      payload += '3:"shared content"\n';
      payload += '1:{"child":"$3"}\n';
      payload += '2:{"child":"$3"}\n';
      payload += '0:{"a":"$1","b":"$2"}\n';
      client.processStringChunk(response, streamState, payload);
      client.close(response);

      var componentCalls = calls.filter(function (c) {
        return c[0] !== 'Server Components ⚛';
      });

      // SharedCard should appear twice — once as normal render, once as deduped
      var sharedCalls = componentCalls.filter(function(c) {
        return c[0] === 'SharedCard' || c[0] === 'SharedCard [deduped]';
      });
      expect(sharedCalls.length).toBe(2);

      // The deduped entry should use 'primary-light' color
      var deduped = sharedCalls.find(function(c) { return c[5] === 'primary-light'; });
      expect(deduped).toBeDefined();

      delete console.timeStamp;
    });
  });

  describe('aborted await timing', function () {
    it('emits aborted await with warning color when no end time marker', function () {
      // When a component starts awaiting but the stream ends before
      // the await resolves, the await entry should use 'warning' color.
      var calls = [];
      console.timeStamp = function () {
        calls.push(Array.prototype.slice.call(arguments));
      };

      var response = client.createResponse('');
      var streamState = client.createStreamState();
      var payload = '0:N' + performance.timeOrigin + '\n';
      // Chunk 1: component starts, awaits, but no end time
      payload += '1:D{"time":0}\n';
      payload += '1:D{"name":"StuckComponent","env":"Server"}\n';
      payload += '1:D{"awaited":{"name":"fetch","env":"Server"}}\n';
      // No end time — stream aborted
      // Model rows
      payload += '1:"partial"\n';
      payload += '0:{"root":"$1"}\n';
      client.processStringChunk(response, streamState, payload);
      client.close(response);

      var componentCalls = calls.filter(function (c) {
        return c[0] !== 'Server Components ⚛';
      });

      var awaitEntry = componentCalls.find(function(c) { return c[0] === 'await fetch'; });
      expect(awaitEntry).toBeDefined();
      // Aborted awaits should use 'warning' color
      expect(awaitEntry[5]).toBe('warning');
      expect(awaitEntry[4]).toBe('Server Components ⚛');

      delete console.timeStamp;
    });
  });

  describe('errored IO timing', function () {
    it('emits errored IO with error color in Server Requests track', function () {
      // When a server I/O operation (e.g. fetch) fails, its J row entry
      // should be rendered with 'error' color in the Server Requests track.
      var calls = [];
      console.timeStamp = function () {
        calls.push(Array.prototype.slice.call(arguments));
      };

      var response = client.createResponse('');
      var streamState = client.createStreamState();
      var payload = '0:N' + Date.now() + '\n';
      // Successful IO
      payload += '70:J{"name":"db.query","start":0,"end":50,"env":"Server"}\n';
      // Failed IO — negative end or error flag
      payload += '71:J{"name":"fetch","start":10,"end":100,"env":"Server","errored":true}\n';
      payload += '1:"ok"\n';
      client.processStringChunk(response, streamState, payload);
      client.close(response);

      var requestCalls = calls.filter(function (c) { return c[4] === 'Server Requests ⚛'; });

      // Track registration + 2 IO entries
      var dbQuery = requestCalls.find(function(c) { return c[0] === 'db.query'; });
      var fetchEntry = requestCalls.find(function(c) { return c[0] === 'fetch'; });

      expect(dbQuery).toBeDefined();
      expect(fetchEntry).toBeDefined();

      // Failed IO should use 'error' color
      expect(fetchEntry[5]).toBe('error');
      // Successful IO should not use 'error' color
      expect(dbQuery[5]).not.toBe('error');

      delete console.timeStamp;
    });
  });
  describe('server request timing', function () {
    it('stores J (IO Info) rows and emits timing on close', function () {
      var calls = [];
      console.timeStamp = function () {
        calls.push(Array.prototype.slice.call(arguments));
      };

      var response = client.createResponse('');
      var streamState = client.createStreamState();
      // N row for time origin, J rows for IO info, model row
      var payload = '0:N' + Date.now() + '\n';
      payload += '70:J{"name":"CounterSection","start":1.0,"end":100.0,"env":"Server"}\n';
      payload += '78:J{"name":"TabsSection","start":2.0,"end":150.0,"env":"Server"}\n';
      payload += '1:"ok"\n';
      client.processStringChunk(response, streamState, payload);
      client.close(response);

      // Filter to only Server Requests track calls
      var requestCalls = calls.filter(function (c) { return c[4] === 'Server Requests ⚛'; });

      // First call: track registration
      expect(requestCalls[0][0]).toBe('Server Requests ⚛');
      // Second call: CounterSection
      expect(requestCalls[1][0]).toBe('CounterSection');
      expect(requestCalls[1][4]).toBe('Server Requests ⚛');
      // Third call: TabsSection
      expect(requestCalls[2][0]).toBe('TabsSection');

      delete console.timeStamp;
    });

    it('skips request timing flush when no J rows collected', function () {
      var calls = [];
      console.timeStamp = function () {
        calls.push(Array.prototype.slice.call(arguments));
      };

      var response = client.createResponse('');
      var streamState = client.createStreamState();
      client.processStringChunk(response, streamState, '0:"ok"\n');
      client.close(response);

      var requestCalls = calls.filter(function (c) { return c[4] === 'Server Requests ⚛'; });
      expect(requestCalls.length).toBe(0);

      delete console.timeStamp;
    });
  });
});

// ===========================================================================
// High-level API tests (createFromStream / createFromFetch)
// ===========================================================================
describe('createFromStream', function () {
  it('parses a stream and returns root element', function (done) {
    var stream = http.createStream();

    var root = client.createFromStream(stream, {serverURL: ''});

    root.then(function (value) {
      expect(value.type).toBe('div');
      expect(value.props.children).toBe('Hello');
      done();
    });

    // Emit data
    var chunk = encode('0:["$","div",null,{"children":"Hello"}]\n');
    stream._emitChunk(chunk);
    stream._emitDone();
  });

  it('handles string chunks', function (done) {
    var stream = http.createStream();

    var root = client.createFromStream(stream, {serverURL: ''});

    root.then(function (value) {
      expect(value).toBe('test');
      done();
    });

    // Emit as string
    stream._emitChunk('0:"test"\n');
    stream._emitDone();
  });

  it('rejects on stream error', function (done) {
    var stream = http.createStream();

    var root = client.createFromStream(stream, {serverURL: ''});

    root.then(
      function () {
        done(new Error('Should not resolve'));
      },
      function (err) {
        expect(err.message).toBe('Stream failed');
        done();
      },
    );

    stream._emitError(new Error('Stream failed'));
  });

  it('resolves client references via on-demand module loading', function (done) {
    var MyButton = function MyButton() {};
    var moduleCode = 'var __module = (function() { return {default: ' + MyButton.toString() + '}; })();';
    mockFetch.mockImplementation(function (url, headers, callback) {
      if (url.indexOf('/modules/') !== -1) {
        callback('data', moduleCode);
        callback('end', '');
      }
    });

    var stream = http.createStream();
    var root = client.createFromStream(stream, {serverURL: 'http://localhost:6000'});

    root.then(function (value) {
      // Root is a div, whose child is a lazy reference to chunk 1
      expect(value.type).toBe('div');
      done();
    });

    var payload =
      '1:I["my-button-module",[],"default"]\n' +
      '0:["$","div",null,{"children":"$L1"}]\n';
    stream._emitChunk(encode(payload));
    stream._emitDone();
  });
});

describe('createFromFetch', function () {
  it('handles resolved fetch promise', function (done) {
    var stream = http.createStream();
    var fetchPromise = Promise.resolve(stream);

    var root = client.createFromFetch(fetchPromise, {serverURL: ''});

    root.then(function (value) {
      expect(value).toBe('fetched');
      done();
    });

    // Need to wait for the promise to resolve before emitting
    fetchPromise.then(function () {
      stream._emitChunk(encode('0:"fetched"\n'));
      stream._emitDone();
    });
  });

  it('handles rejected fetch promise', function (done) {
    var fetchPromise = Promise.reject(new Error('Fetch failed'));

    var root = client.createFromFetch(fetchPromise, {serverURL: ''});

    // The root chunk should be rejected
    // Need to give the promise time to reject
    setTimeout(function () {
      root.then(
        function () {
          done(new Error('Should not resolve'));
        },
        function (err) {
          expect(err.message).toBe('Fetch failed');
          done();
        },
      );
    }, 10);
  });
});

// ===========================================================================
// HTTP layer tests
// ===========================================================================
describe('HTTP layer', function () {
  describe('fetchRSC', function () {
    it('calls $$fetch with RSC headers', function () {
      http.fetchRSC('/page');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      var args = mockFetch.mock.calls[0];
      expect(args[0]).toBe('/page');
      // Check headers
      var headers = args[1];
      expect(headers.RSC).toBe('1');
      expect(headers['Next-URL']).toBe('/page');
      expect(JSON.parse(headers['Next-Router-State-Tree'])).toEqual(['']);
    });

    it('includes custom headers', function () {
      http.fetchRSC('/page', {
        headers: {'X-Custom': 'value'},
      });

      var headers = mockFetch.mock.calls[0][1];
      expect(headers['X-Custom']).toBe('value');
      expect(headers.RSC).toBe('1');
    });

    it('includes custom router state tree', function () {
      http.fetchRSC('/page', {
        routerStateTree: ['app', {segment: 'page'}],
      });

      var headers = mockFetch.mock.calls[0][1];
      expect(JSON.parse(headers['Next-Router-State-Tree'])).toEqual([
        'app',
        {segment: 'page'},
      ]);
    });

    it('resolves with a stream on data callback', function (done) {
      mockFetch.mockImplementation(function (url, headers, callback) {
        callback('data', '0:"hello"\n');
      });

      http.fetchRSC('/page').then(function (stream) {
        expect(stream).toBeDefined();
        expect(typeof stream.onChunk).toBe('function');
        expect(typeof stream.onDone).toBe('function');
        expect(typeof stream.onError).toBe('function');
        done();
      });
    });

    it('rejects on error callback before data', function (done) {
      mockFetch.mockImplementation(function (url, headers, callback) {
        callback('error', 'Network error');
      });

      http.fetchRSC('/page').catch(function (err) {
        expect(err.message).toBe('Network error');
        done();
      });
    });

    it('emits chunks to registered listeners', function (done) {
      var savedCallback;
      mockFetch.mockImplementation(function (url, headers, callback) {
        savedCallback = callback;
        // First call triggers resolve
        callback('data', 'first');
      });

      http.fetchRSC('/page').then(function (stream) {
        var chunks = [];
        stream.onChunk(function (chunk) {
          // chunk is a Uint8Array
          chunks.push(new TextDecoder().decode(chunk));
        });

        // Emit more data
        savedCallback('data', 'second');

        // onChunk replays buffered chunks, so both are captured
        expect(chunks).toEqual(['first', 'second']);
        done();
      });
    });

    it('emits done to registered listeners', function (done) {
      var savedCallback;
      mockFetch.mockImplementation(function (url, headers, callback) {
        savedCallback = callback;
        callback('data', 'data');
      });

      http.fetchRSC('/page').then(function (stream) {
        stream.onDone(function () {
          done();
        });
        savedCallback('end', '');
      });
    });

    it('emits error to registered listeners after resolve', function (done) {
      var savedCallback;
      mockFetch.mockImplementation(function (url, headers, callback) {
        savedCallback = callback;
        callback('data', 'data');
      });

      http.fetchRSC('/page').then(function (stream) {
        stream.onError(function (err) {
          expect(err.message).toBe('Late error');
          done();
        });
        savedCallback('error', 'Late error');
      });
    });
  });

  describe('callServer', function () {
    it('calls $$fetch with action headers', function () {
      http.callServer('action-123', [], {
        url: '/page',
      });

      expect(mockFetch).toHaveBeenCalledTimes(1);
      var args = mockFetch.mock.calls[0];
      expect(args[0]).toBe('/page');
      var headers = args[1];
      expect(headers.Accept).toBe('text/x-component');
      expect(headers['Next-Action']).toBe('action-123');
      expect(headers['Next-URL']).toBe('/page');
    });
  });

  describe('createStream', function () {
    it('creates a stream with onChunk/onDone/onError methods', function () {
      var stream = http.createStream();
      expect(typeof stream.onChunk).toBe('function');
      expect(typeof stream.onDone).toBe('function');
      expect(typeof stream.onError).toBe('function');
    });

    it('dispatches chunks to listeners', function () {
      var stream = http.createStream();
      var received = [];
      stream.onChunk(function (data) {
        received.push(data);
      });

      stream._emitChunk('a');
      stream._emitChunk('b');

      expect(received).toEqual(['a', 'b']);
    });

    it('dispatches done to listeners', function () {
      var stream = http.createStream();
      var doneCalled = false;
      stream.onDone(function () {
        doneCalled = true;
      });

      stream._emitDone();

      expect(doneCalled).toBe(true);
    });

    it('dispatches errors to listeners', function () {
      var stream = http.createStream();
      var capturedErr = null;
      stream.onError(function (err) {
        capturedErr = err;
      });

      stream._emitError(new Error('test'));

      expect(capturedErr.message).toBe('test');
    });

    it('supports multiple listeners', function () {
      var stream = http.createStream();
      var count = 0;
      stream.onChunk(function () {
        count++;
      });
      stream.onChunk(function () {
        count++;
      });

      stream._emitChunk('data');

      expect(count).toBe(2);
    });
  });
});

// ===========================================================================
// Integration test: end-to-end Flight payload
// ===========================================================================
describe('end-to-end integration', function () {
  it('parses a realistic Next.js-like Flight payload', function () {
    // Simulates a Next.js response with layout and page
    var payload =
      '2:["$","p",null,{"children":"Welcome to the app"}]\n' +
      '1:["$","main",null,{"children":"$2"}]\n' +
      '0:["$","html",null,{"children":["$","body",null,{"children":"$1"}]}]\n';

    var root = parseFlightPayload(payload);

    expect(root.status).toBe('resolved');
    var html = root.value;
    expect(html.type).toBe('html');

    var body = html.props.children;
    expect(body.type).toBe('body');

    var main = body.props.children;
    expect(main.type).toBe('main');

    var p = main.props.children;
    expect(p.type).toBe('p');
    expect(p.props.children).toBe('Welcome to the app');
  });

  it('parses a Flight payload with client component references (async)', function (done) {
    var Counter = function Counter() {};
    var moduleCode = 'var __module = (function() { return {default: ' + Counter.toString() + '}; })();';
    mockFetch.mockImplementation(function (url, headers, callback) {
      if (url.indexOf('/modules/') !== -1) {
        callback('data', moduleCode);
        callback('end', '');
      }
    });

    var payload =
      '1:I["Counter",[],"default"]\n' +
      '0:["$","div",null,{"children":"$L1"}]\n';

    var response = client.createResponse('http://localhost:6000');
    var streamState = client.createStreamState();
    client.processStringChunk(response, streamState, payload);
    client.close(response);

    var root = client.getRoot(response);
    expect(root.status).toBe('resolved');
    var div = root.value;
    expect(div.type).toBe('div');

    // Children is a lazy wrapper to chunk 1
    var lazy = div.props.children;
    expect(lazy.$$typeof).toBe(Symbol.for('react.lazy'));

    // Chunk 1 resolves async — wait for it
    var chunk1 = client._getOrCreateChunk(response, 1);
    chunk1.then(function (value) {
      // Now initializing the lazy should return the Counter component
      var resolved = lazy._init(lazy._payload);
      expect(typeof resolved).toBe('function');
      done();
    });
  });

  it('simulates progressive streaming with Suspense-like behavior', function (done) {
    var stream = http.createStream();
    var root = client.createFromStream(stream, {serverURL: ''});

    // First: send root with a lazy reference
    stream._emitChunk(
      encode('0:["$","div",null,{"children":"$L1"}]\n'),
    );

    root.then(function (value) {
      expect(value.type).toBe('div');

      // Children is a lazy wrapper — still pending
      var lazy = value.props.children;
      expect(lazy.$$typeof).toBe(Symbol.for('react.lazy'));

      // Trying to init throws the pending thenable
      try {
        lazy._init(lazy._payload);
        done(new Error('Should have thrown'));
      } catch (thrown) {
        // The thrown value is the pending chunk (a thenable)
        expect(typeof thrown.then).toBe('function');

        // Register on the thenable
        thrown.then(function (resolved) {
          expect(resolved.type).toBe('span');
          expect(resolved.props.children).toBe('Async content');

          // Now _init should work
          var result = lazy._init(lazy._payload);
          expect(result.type).toBe('span');
          done();
        });

        // Later: send the async content
        stream._emitChunk(
          encode(
            '1:["$","span",null,{"children":"Async content"}]\n',
          ),
        );
        stream._emitDone();
      }
    });
  });
});
