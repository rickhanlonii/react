'use strict';

// ---------------------------------------------------------------------------
// Flight Client Config for Native
//
// Implements the interface defined by react-client's
// ReactFlightClientConfig.custom.js. This config handles client/server
// reference resolution for a native JavaScriptCore environment.
//
// Module loading is handled by Swift (FlightStreamClient.swift) which
// fetches webpack chunks via URLSession and resolves modules via
// $$webpackRequire. This config is only used by Fantom tests.
// ---------------------------------------------------------------------------

/**
 * Resolves a client reference from Flight metadata.
 * Used by Fantom tests which still run the JS-side parser.
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

  // bundlerConfig is the server URL (may include a path like /fixtures/name).
  // Extract origin (protocol + host + port) since modules always live at /modules/.
  var serverURL = typeof bundlerConfig === 'string' ? bundlerConfig : '';
  var origin = serverURL.replace(/^(https?:\/\/[^\/]+).*$/, '$1');
  return {
    url: origin + '/modules/' + moduleId + '.js',
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
  resolveClientReference: resolveClientReference,
  resolveServerReference: resolveServerReference,
  dispatchHint: dispatchHint,
  bindToConsole: bindToConsole,
};
