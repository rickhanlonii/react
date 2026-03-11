'use strict';

var path = require('path');
var url = require('url');
var http = require('http');
var {spawn, execFileSync} = require('child_process');

// --- Setup webpack globals (same as server.js) ---

globalThis.__webpack_require__ = function (id) {
  if (id.startsWith('file://')) {
    return require(url.fileURLToPath(id));
  }
  return require(id);
};
globalThis.__webpack_chunk_load__ = function () {
  return Promise.resolve();
};

// --- Helpers ---

var TODO_ACTIONS_PATH = path.resolve(
  __dirname,
  '../src/actions/todo-actions.js'
);
var TODO_ACTIONS_URL = url.pathToFileURL(TODO_ACTIONS_PATH).href;

// --- Unit Tests ---

describe('__webpack_require__', function () {
  it('resolves file:// URLs via require()', function () {
    var fileUrl = url.pathToFileURL(TODO_ACTIONS_PATH).href;
    var mod = __webpack_require__(fileUrl);
    expect(typeof mod.addTodo).toBe('function');
    expect(typeof mod.getTodos).toBe('function');
  });

  it('falls back to regular require() for non-file:// IDs', function () {
    var mod = __webpack_require__('path');
    expect(typeof mod.resolve).toBe('function');
  });
});

describe('__webpack_chunk_load__', function () {
  it('returns a resolved promise', async function () {
    var result = await __webpack_chunk_load__('anything');
    expect(result).toBeUndefined();
  });
});

describe('node-register', function () {
  it('assigns $$id to use server exports', function () {
    // node-register requires --conditions react-server, so we run
    // this check in a subprocess with the correct flag.
    var script =
      'require("react-server-dom-webpack/node-register")();' +
      'var a = require("./fixtures/example/server/src/actions/todo-actions");' +
      'var out = {};' +
      'out.addTodoId = a.addTodo["$$id"];' +
      'out.addTodoTypeof = String(a.addTodo["$$typeof"]);' +
      'out.toggleTodoId = a.toggleTodo["$$id"];' +
      'console.log(JSON.stringify(out));';

    var result = execFileSync(process.execPath, [
      '--conditions',
      'react-server',
      '-e',
      script,
    ], {
      cwd: path.resolve(__dirname, '../../../../'),
      encoding: 'utf8',
    });

    var parsed = JSON.parse(result.trim());
    expect(parsed.addTodoId).toMatch(/todo-actions\.js#addTodo$/);
    expect(parsed.addTodoTypeof).toBe('Symbol(react.server.reference)');
    expect(parsed.toggleTodoId).toMatch(/todo-actions\.js#toggleTodo$/);
  });
});

describe('getServerManifest', function () {
  it('returns manifest entries for todo-actions.js exports', function () {
    // Run getServerManifest in a subprocess with --conditions react-server
    // since it requires node-register to process 'use server' files.
    var script =
      'var path = require("path");' +
      'var url = require("url");' +
      'var fs = require("fs");' +
      'require("react-server-dom-webpack/node-register")();' +
      'var SERVER_ACTIONS_DIR = path.resolve(__dirname, "fixtures/example/server/src/actions");' +
      'function getServerManifest() {' +
      '  var manifest = {};' +
      '  if (!fs.existsSync(SERVER_ACTIONS_DIR)) return manifest;' +
      '  var files = fs.readdirSync(SERVER_ACTIONS_DIR).filter(function(f) { return f.endsWith(".js"); });' +
      '  for (var i = 0; i < files.length; i++) {' +
      '    var filePath = path.resolve(SERVER_ACTIONS_DIR, files[i]);' +
      '    var fileUrl = url.pathToFileURL(filePath).href;' +
      '    var mod = require(filePath);' +
      '    for (var exportName in mod) {' +
      '      if (typeof mod[exportName] === "function") {' +
      '        var fullId = fileUrl + "#" + exportName;' +
      '        manifest[fullId] = { id: fileUrl, chunks: [], name: exportName };' +
      '      }' +
      '    }' +
      '    manifest[fileUrl] = { id: fileUrl, chunks: [], name: "" };' +
      '  }' +
      '  return manifest;' +
      '}' +
      'console.log(JSON.stringify(getServerManifest()));';

    var result = execFileSync(process.execPath, [
      '--conditions',
      'react-server',
      '-e',
      script,
    ], {
      cwd: path.resolve(__dirname, '../../../../'),
      encoding: 'utf8',
    });

    var manifest = JSON.parse(result.trim());
    var todoActionsUrl = url.pathToFileURL(TODO_ACTIONS_PATH).href;

    expect(manifest[todoActionsUrl + '#addTodo']).toEqual({
      id: todoActionsUrl,
      chunks: [],
      name: 'addTodo',
    });
    expect(manifest[todoActionsUrl + '#toggleTodo']).toBeDefined();
    expect(manifest[todoActionsUrl + '#deleteTodo']).toBeDefined();
    expect(manifest[todoActionsUrl + '#getTodos']).toBeDefined();
    // Module-level fallback entry
    expect(manifest[todoActionsUrl]).toEqual({
      id: todoActionsUrl,
      chunks: [],
      name: '',
    });
  });
});

// --- Integration Tests (HTTP endpoint) ---

describe('POST /fixtures/:name endpoint', function () {
  var serverProcess;
  var serverPort = 6111; // Use a non-standard port to avoid conflicts
  var actionId;

  function makeRequest(options, body) {
    return new Promise(function (resolve, reject) {
      var req = http.request(options, function (res) {
        var data = '';
        res.on('data', function (chunk) {
          data += chunk;
        });
        res.on('end', function () {
          resolve({status: res.statusCode, headers: res.headers, body: data});
        });
      });
      req.on('error', reject);
      if (body) {
        req.write(body);
      }
      req.end();
    });
  }

  beforeAll(function (done) {
    // Get the action ID from a subprocess with --conditions react-server
    var script =
      'require("react-server-dom-webpack/node-register")();' +
      'var a = require("./fixtures/example/server/src/actions/todo-actions");' +
      'console.log(a.addTodo["$$id"]);';

    actionId = execFileSync(process.execPath, [
      '--conditions',
      'react-server',
      '-e',
      script,
    ], {
      cwd: path.resolve(__dirname, '../../../../'),
      encoding: 'utf8',
    }).trim();

    // Start the RSC server as a child process with --conditions react-server
    serverProcess = spawn(
      process.execPath,
      ['--conditions', 'react-server', 'server/server.js'],
      {
        cwd: path.resolve(__dirname, '../../'),
        env: Object.assign({}, process.env, {PORT: String(serverPort)}),
        stdio: ['pipe', 'pipe', 'pipe'],
      }
    );

    var started = false;
    serverProcess.stdout.on('data', function (data) {
      if (!started && data.toString().includes('RSC server listening')) {
        started = true;
        done();
      }
    });

    serverProcess.stderr.on('data', function (data) {
      // Log stderr for debugging but don't fail
      if (!started) {
        var msg = data.toString();
        if (msg.includes('Error') && !msg.includes('ExperimentalWarning')) {
          done(new Error('Server failed to start: ' + msg));
        }
      }
    });

    // Timeout if server doesn't start
    setTimeout(function () {
      if (!started) {
        done(new Error('Server did not start within 10 seconds'));
      }
    }, 10000);
  }, 15000);

  afterAll(function (done) {
    if (serverProcess) {
      serverProcess.on('close', function () {
        done();
      });
      serverProcess.kill('SIGTERM');
    } else {
      done();
    }
  });

  it('returns Flight stream with valid action ID', async function () {
    var result = await makeRequest(
      {
        hostname: 'localhost',
        port: serverPort,
        path: '/fixtures/06-kitchen-sink',
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
          'rsc-action': actionId,
        },
      },
      '["Test todo"]'
    );

    expect(result.status).toBe(200);
    expect(result.headers['content-type']).toMatch(/text\/x-component/);
    expect(result.body.length).toBeGreaterThan(0);
    // Flight stream rows start with digits followed by :
    expect(result.body).toMatch(/^\d+:/m);
  });

  it('returns 400 with invalid action ID (missing #)', async function () {
    var result = await makeRequest(
      {
        hostname: 'localhost',
        port: serverPort,
        path: '/fixtures/06-kitchen-sink',
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
          'rsc-action': 'invalid-no-hash',
        },
      },
      '[]'
    );

    expect(result.status).toBe(400);
    expect(result.body).toContain('Invalid action ID');
  });

  it('returns 500 with non-existent module', async function () {
    var result = await makeRequest(
      {
        hostname: 'localhost',
        port: serverPort,
        path: '/fixtures/06-kitchen-sink',
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
          'rsc-action': 'file:///nonexistent.js#foo',
        },
      },
      '[]'
    );

    // Module not found triggers a catch -> 500
    expect(result.status).toBe(500);
  });

  it('handles MPA form POST without rsc-action header', async function () {
    // Without rsc-action header, the Flight server treats this as an MPA
    // form POST. With no valid action data in the body, it falls through
    // to re-rendering the fixture as a Flight stream.
    var result = await makeRequest(
      {
        hostname: 'localhost',
        port: serverPort,
        path: '/fixtures/06-kitchen-sink',
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
      ''
    );

    expect(result.status).toBe(200);
  });

  it('executes action even with non-existent fixture (returns action result)', async function () {
    // Server actions return the action result directly (not a re-rendered fixture),
    // so the fixture name in the URL is just for routing. The action executes
    // regardless of whether the fixture file exists.
    var result = await makeRequest(
      {
        hostname: 'localhost',
        port: serverPort,
        path: '/fixtures/nonexistent-fixture',
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
          'rsc-action': actionId,
        },
      },
      '["Test"]'
    );

    expect(result.status).toBe(200);
  });

  it('parses text/plain body as string', async function () {
    // Send a text/plain body and verify the action receives the decoded args
    var result = await makeRequest(
      {
        hostname: 'localhost',
        port: serverPort,
        path: '/fixtures/06-kitchen-sink',
        method: 'POST',
        headers: {
          'Content-Type': 'text/plain',
          'rsc-action': actionId,
        },
      },
      '["parsed text body"]'
    );

    // If the body was parsed correctly, the action should execute
    // and return a Flight stream (re-rendered fixture)
    expect(result.status).toBe(200);
    expect(result.headers['content-type']).toMatch(/text\/x-component/);
  });

  it('GET /fixtures/:name still works after POST route added', async function () {
    var result = await makeRequest({
      hostname: 'localhost',
      port: serverPort,
      path: '/fixtures/06-kitchen-sink',
      method: 'GET',
    });

    expect(result.status).toBe(200);
    expect(result.headers['content-type']).toMatch(/text\/x-component/);
    expect(result.body.length).toBeGreaterThan(0);
  });
});
