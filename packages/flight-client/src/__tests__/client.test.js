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
  mockFetch.mockClear();
  global.$$fetch = mockFetch;
});

afterEach(function () {
  delete global.$$fetch;
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
  var bundlerConfig = {modules: (options && options.moduleMap) || {}};
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
    it('resolves a known module by ID and export name', function () {
      var MyComponent = function MyComponent() {};
      var bundlerConfig = {
        modules: {
          'my-module': {default: MyComponent, named: 'other'},
        },
      };
      var metadata = ['my-module', [], 'default'];
      var ref = config.resolveClientReference(bundlerConfig, metadata);
      expect(ref).toEqual({module: {default: MyComponent, named: 'other'}, name: 'default'});
    });

    it('returns null for unknown module ID', function () {
      var bundlerConfig = {modules: {}};
      var metadata = ['unknown-module', [], 'default'];
      var ref = config.resolveClientReference(bundlerConfig, metadata);
      expect(ref).toBeNull();
    });

    it('uses "default" when export name is empty', function () {
      var bundlerConfig = {
        modules: {'mod': {default: 'x'}},
      };
      var metadata = ['mod', [], ''];
      var ref = config.resolveClientReference(bundlerConfig, metadata);
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

    it('returns default export for "default" name', function () {
      var mod = {default: 'theDefault', other: 'notThis'};
      expect(config.requireModule({module: mod, name: 'default'})).toBe('theDefault');
    });

    it('returns the module itself if no default export', function () {
      var mod = {other: 'value'};
      expect(config.requireModule({module: mod, name: 'default'})).toBe(mod);
    });

    it('returns named export', function () {
      var mod = {default: 'x', named: 'y'};
      expect(config.requireModule({module: mod, name: 'named'})).toBe('y');
    });
  });

  describe('resolveClientReference — webpack object format', function () {
    it('resolves metadata as {id, chunks, name} object', function () {
      var bundlerConfig = {
        modules: {
          Counter: {default: function Counter() {}},
        },
      };
      var metadata = {id: 'Counter', chunks: [], name: 'default'};
      var ref = config.resolveClientReference(bundlerConfig, metadata);
      expect(ref).not.toBeNull();
      expect(ref.module).toBe(bundlerConfig.modules.Counter);
      expect(ref.name).toBe('default');
    });

    it('returns null for unknown module in object format', function () {
      var bundlerConfig = {modules: {}};
      var metadata = {id: 'Unknown', chunks: [], name: 'default'};
      var ref = config.resolveClientReference(bundlerConfig, metadata);
      expect(ref).toBeNull();
    });
  });

  describe('requireModule — wildcard export', function () {
    it('handles name "*" by returning default export', function () {
      var mod = {default: function MyComponent() {}};
      var ref = {module: mod, name: '*'};
      var result = config.requireModule(ref);
      expect(result).toBe(mod.default);
    });
  });

  describe('preloadModule', function () {
    it('returns null (no-op)', function () {
      expect(config.preloadModule({module: {}, name: 'default'})).toBeNull();
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
    it('resolves a client component module via I row', function () {
      var CounterComponent = function Counter() {};
      var moduleMap = {
        '(app)/./components/Counter.tsx': {default: CounterComponent},
      };

      var payload =
        '1:I["(app)/./components/Counter.tsx",[],"default"]\n' +
        '0:["$","$L1",null,{"count":0}]\n';

      var root = parseFlightPayload(payload, {moduleMap: moduleMap});

      expect(root.status).toBe('resolved');
      var el = root.value;
      // The type should be resolved to the lazy wrapper referencing the module
      // chunk 1 resolves to the Counter component (via requireModule)
    });

    it('resolves I row to the actual component export', function () {
      var SearchInput = function SearchInput() {};
      var moduleMap = {
        '(app)/./components/SearchInput.tsx': {SearchInput: SearchInput},
      };

      var payload =
        '1:I["(app)/./components/SearchInput.tsx",[],"SearchInput"]\n';

      var bundlerConfig = {modules: moduleMap};
      var response = client.createResponse(bundlerConfig);
      var streamState = client.createStreamState();
      client.processStringChunk(response, streamState, payload);
      client.close(response);

      var chunk = client._getOrCreateChunk(response, 1);
      expect(chunk.status).toBe('resolved');
      expect(chunk.value).toBe(SearchInput);
    });
  });

  // -----------------------------------------------------------------------
  // Error rows
  // -----------------------------------------------------------------------
  describe('error rows', function () {
    it('rejects a chunk on error row', function () {
      var payload = '0:E{"digest":"ERR001","message":"Something broke"}\n';

      var bundlerConfig = {modules: {}};
      var response = client.createResponse(bundlerConfig);
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

      var bundlerConfig = {modules: {}};
      var response = client.createResponse(bundlerConfig);
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
      var bundlerConfig = {modules: {}};
      var response = client.createResponse(bundlerConfig);
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
      var bundlerConfig = {modules: {}};
      var response = client.createResponse(bundlerConfig);
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
      var bundlerConfig = {modules: {}};
      var response = client.createResponse(bundlerConfig);
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
      var bundlerConfig = {modules: {}};
      var response = client.createResponse(bundlerConfig);

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
      var bundlerConfig = {modules: {}};
      var response = client.createResponse(bundlerConfig);
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
  // Dev-only row types (should be ignored)
  // -----------------------------------------------------------------------
  describe('dev-only row types', function () {
    it('ignores D (Debug) rows', function () {
      var payload = '1:D{"name":"MyComponent"}\n0:"ok"\n';
      var root = parseFlightPayload(payload);
      expect(root.value).toBe('ok');
    });

    it('ignores W (Console) rows', function () {
      var payload = '1:W["log","hello"]\n0:"ok"\n';
      var root = parseFlightPayload(payload);
      expect(root.value).toBe('ok');
    });
  });
});

// ===========================================================================
// High-level API tests (createFromStream / createFromFetch)
// ===========================================================================
describe('createFromStream', function () {
  it('parses a stream and returns root element', function (done) {
    var stream = http.createStream();

    var root = client.createFromStream(stream, {moduleMap: {}});

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

    var root = client.createFromStream(stream, {moduleMap: {}});

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

    var root = client.createFromStream(stream, {moduleMap: {}});

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

  it('resolves client references via module map', function (done) {
    var MyButton = function MyButton() {};
    var moduleMap = {
      'my-button-module': {default: MyButton},
    };

    var stream = http.createStream();
    var root = client.createFromStream(stream, {moduleMap: moduleMap});

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

    var root = client.createFromFetch(fetchPromise, {moduleMap: {}});

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

    var root = client.createFromFetch(fetchPromise, {moduleMap: {}});

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

        // The first 'first' chunk was already emitted before onChunk was registered
        // so only 'second' will be captured by the listener
        expect(chunks).toEqual(['second']);
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

  it('parses a Flight payload with client component references', function () {
    var Counter = function Counter() {};
    var moduleMap = {
      '(app-pages-browser)/./components/Counter.tsx': {default: Counter},
    };

    var payload =
      '1:I["(app-pages-browser)/./components/Counter.tsx",["static/chunks/app.js"],"default"]\n' +
      '0:["$","div",null,{"children":"$L1"}]\n';

    var root = parseFlightPayload(payload, {moduleMap: moduleMap});

    expect(root.status).toBe('resolved');
    var div = root.value;
    expect(div.type).toBe('div');

    // Children is a lazy wrapper to chunk 1
    var lazy = div.props.children;
    expect(lazy.$$typeof).toBe(Symbol.for('react.lazy'));

    // Initializing the lazy should return the Counter component
    var resolved = lazy._init(lazy._payload);
    expect(resolved).toBe(Counter);
  });

  it('simulates progressive streaming with Suspense-like behavior', function (done) {
    var stream = http.createStream();
    var root = client.createFromStream(stream, {moduleMap: {}});

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
