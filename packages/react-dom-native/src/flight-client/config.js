'use strict';

// ---------------------------------------------------------------------------
// Flight Client Config for Native — On-Demand Module Loading
//
// Implements the interface defined by react-client's
// ReactFlightClientConfig.custom.js. This config handles string decoding,
// client/server reference resolution, and on-demand module fetching for a
// native JavaScriptCore environment.
//
// Client components are NOT pre-bundled. When the Flight stream references
// a client component, this config fetches it from the server on demand,
// evaluates the IIFE, and caches the result.
// ---------------------------------------------------------------------------

// Module cache: url -> {status, value, reason, promise}
var moduleCache = {};

/**
 * Creates a string decoder for converting binary chunks to strings.
 * TextDecoder is available in modern JavaScriptCore.
 */
function createStringDecoder() {
  return new TextDecoder();
}

/**
 * Decodes a partial binary chunk to string (more data coming).
 */
function readPartialStringChunk(decoder, buffer) {
  return decoder.decode(buffer, {stream: true});
}

/**
 * Decodes the final binary chunk to string (stream complete).
 */
function readFinalStringChunk(decoder, buffer) {
  return decoder.decode(buffer);
}

/**
 * Resolves a client reference from Flight metadata.
 *
 * @param {string} bundlerConfig - Server base URL (e.g. 'http://localhost:6000')
 * @param {object|Array} metadata - Module metadata from I rows
 * @returns {{ url: string, name: string, id: string }}
 */
function resolveClientReference(bundlerConfig, metadata) {
  var moduleId;
  var exportName;

  // Handle webpack object format: {id, chunks, name}
  if (metadata !== null && typeof metadata === 'object' && !Array.isArray(metadata)) {
    moduleId = metadata.id;
    exportName = metadata.name || 'default';
  } else {
    // Handle array format: [moduleId, chunks, exportName]
    moduleId = metadata[0];
    exportName = metadata[2] || 'default';
  }

  // bundlerConfig is the server base URL
  var serverURL = typeof bundlerConfig === 'string' ? bundlerConfig : '';
  return {
    url: serverURL + '/modules/' + moduleId + '.js',
    name: exportName,
    id: moduleId,
  };
}

/**
 * Resolves a server reference ID into a callable reference.
 * Server reference IDs are formatted as "url#exportName".
 */
function resolveServerReference(config, id) {
  var idx = id.indexOf('#');
  if (idx === -1) {
    return {url: id, name: 'default'};
  }
  return {url: id.slice(0, idx), name: id.slice(idx + 1) || 'default'};
}

/**
 * Prepares the environment for a module. No-op for native (no script
 * injection needed).
 */
function prepareDestinationForModule(moduleLoading, nonce, metadata) {
  // No-op: no script injection needed in native
}

/**
 * Starts async loading of a client module. Fetches the module IIFE from
 * the server, evaluates it, and caches the result.
 *
 * @param {object} clientRef - { url, name, id } from resolveClientReference
 * @returns {Promise|null} A thenable if loading, null if already loaded
 */
function preloadModule(clientRef) {
  if (!clientRef) return null;

  var url = clientRef.url;
  var cached = moduleCache[url];

  if (cached) {
    if (cached.status === 'fulfilled') return null;
    if (cached.status === 'pending') return cached.promise;
    if (cached.status === 'rejected') return cached.promise;
  }

  var entry = {status: 'pending', value: null, reason: null, promise: null, _data: ''};
  moduleCache[url] = entry;

  entry.promise = new Promise(function(resolve, reject) {
    $$fetch(url, {}, function(type, payload) {
      if (type === 'data') {
        entry._data += payload;
      } else if (type === 'end') {
        try {
          // The module is a self-contained IIFE that assigns to globalThis.__module
          // e.g.: var __module = (() => { ... return {default: Counter}; })();
          // Use indirect eval (0, eval)() to execute in global scope so that
          // `var __module` creates a global variable regardless of calling context.
          (0, eval)(entry._data);
          var moduleExports = globalThis.__module;
          delete globalThis.__module;
          entry.status = 'fulfilled';
          entry.value = moduleExports;
          resolve(moduleExports);
        } catch (err) {
          entry.status = 'rejected';
          entry.reason = err;
          reject(err);
        }
      } else if (type === 'error') {
        var err = new Error(payload || 'Failed to load module: ' + url);
        entry.status = 'rejected';
        entry.reason = err;
        reject(err);
      }
    });
  });

  return entry.promise;
}

/**
 * Returns an already-loaded module export. Called after preloadModule
 * has resolved.
 *
 * @param {object} clientRef - { url, name, id } from resolveClientReference
 * @returns {any} The module export
 */
function requireModule(clientRef) {
  if (!clientRef) return null;

  var url = clientRef.url;
  var cached = moduleCache[url];

  if (!cached || cached.status !== 'fulfilled') {
    throw new Error('Module not loaded: ' + clientRef.id + ' (' + url + ')');
  }

  var mod = cached.value;
  if (clientRef.name === 'default' || clientRef.name === '' || clientRef.name === '*') {
    return mod.default || mod;
  }
  return mod[clientRef.name];
}

/**
 * Handles resource hints (H rows). No-op for native since resource hints
 * like preload, prefetch, etc. are DOM-specific.
 */
function dispatchHint(code, model) {
  // No-op: resource hints are DOM-specific
}

/**
 * Creates a bound console method for replaying server console logs.
 */
function bindToConsole(methodName, args, badgeName) {
  return Function.prototype.bind.apply(
    console[methodName],
    [console].concat(args),
  );
}

module.exports = {
  createStringDecoder: createStringDecoder,
  readPartialStringChunk: readPartialStringChunk,
  readFinalStringChunk: readFinalStringChunk,
  resolveClientReference: resolveClientReference,
  resolveServerReference: resolveServerReference,
  prepareDestinationForModule: prepareDestinationForModule,
  preloadModule: preloadModule,
  requireModule: requireModule,
  dispatchHint: dispatchHint,
  bindToConsole: bindToConsole,
  // Testing only
  _clearModuleCache: function() { moduleCache = {}; },
};
