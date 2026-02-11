'use strict';

// ---------------------------------------------------------------------------
// Flight Client Config for Native
//
// Implements the interface defined by react-client's
// ReactFlightClientConfig.custom.js. This config handles string decoding,
// client/server reference resolution, and resource hints for a native
// JavaScriptCore environment where all client components are pre-bundled.
// ---------------------------------------------------------------------------

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
 * @param {object} bundlerConfig - { modules: Record<string, any> }
 * @param {Array} metadata - [moduleId, chunks, exportName] from I rows
 * @returns {{ module: any, name: string } | null}
 */
function resolveClientReference(bundlerConfig, metadata) {
  var moduleId = metadata[0];
  var exportName = metadata[2] || 'default';
  var entry = bundlerConfig.modules[moduleId];
  if (!entry) {
    if (typeof __DEV__ !== 'undefined' && __DEV__) {
      console.warn('Unknown client module: ' + moduleId);
    }
    return null;
  }
  return {module: entry, name: exportName};
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
 * Starts async loading of a client module. No-op because all modules
 * are pre-bundled.
 */
function preloadModule(clientRef) {
  return null;
}

/**
 * Synchronously requires an already-loaded module. Returns the export
 * identified by the client reference.
 */
function requireModule(clientRef) {
  if (!clientRef) return null;
  var mod = clientRef.module;
  if (clientRef.name === 'default' || clientRef.name === '') {
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
};
