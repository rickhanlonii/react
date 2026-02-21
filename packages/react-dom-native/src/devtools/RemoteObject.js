'use strict';

// ---------------------------------------------------------------------------
// CDP RemoteObject serialization
//
// Converts JS values to CDP Runtime.RemoteObject format.
// Shared by RuntimeAgent (evaluate/getProperties) and ConsoleForwarding.
// ---------------------------------------------------------------------------

var objectStore = {};
var nextObjectId = 1;

function storeObject(value) {
  var id = 'obj-' + nextObjectId++;
  objectStore[id] = value;
  return id;
}

function getStoredObject(id) {
  return objectStore[id];
}

function hasStoredObject(id) {
  return id in objectStore;
}

function releaseObject(id) {
  delete objectStore[id];
}

function releaseAll() {
  objectStore = {};
}

function toRemoteObject(value) {
  if (value === null) {
    return {type: 'object', subtype: 'null', value: null};
  }
  if (value === undefined) {
    return {type: 'undefined'};
  }

  var t = typeof value;

  if (t === 'boolean' || t === 'string') {
    return {type: t, value: value};
  }
  if (t === 'number') {
    if (value !== value) return {type: 'number', unserializableValue: 'NaN', description: 'NaN'};
    if (value === Infinity) return {type: 'number', unserializableValue: 'Infinity', description: 'Infinity'};
    if (value === -Infinity) return {type: 'number', unserializableValue: '-Infinity', description: '-Infinity'};
    if (Object.is(value, -0)) return {type: 'number', unserializableValue: '-0', description: '-0'};
    return {type: 'number', value: value, description: String(value)};
  }
  if (t === 'bigint') {
    return {type: 'bigint', unserializableValue: String(value) + 'n', description: String(value) + 'n'};
  }
  if (t === 'symbol') {
    return {type: 'symbol', description: String(value)};
  }
  if (t === 'function') {
    var funcId = storeObject(value);
    return {
      type: 'function',
      className: 'Function',
      description: String(value),
      objectId: funcId,
    };
  }

  // Objects (including arrays, errors, dates, regexps, etc.)
  var objectId = storeObject(value);
  var subtype;
  var className = 'Object';
  var description;

  if (Array.isArray(value)) {
    subtype = 'array';
    className = 'Array';
    description = 'Array(' + value.length + ')';
  } else if (value instanceof RegExp) {
    subtype = 'regexp';
    className = 'RegExp';
    description = String(value);
  } else if (value instanceof Date) {
    subtype = 'date';
    className = 'Date';
    description = String(value);
  } else if (value instanceof Error) {
    subtype = 'error';
    className = value.constructor ? value.constructor.name : 'Error';
    description = String(value);
  } else if (value instanceof Map) {
    subtype = 'map';
    className = 'Map';
    description = 'Map(' + value.size + ')';
  } else if (value instanceof Set) {
    subtype = 'set';
    className = 'Set';
    description = 'Set(' + value.size + ')';
  } else if (value instanceof WeakMap) {
    subtype = 'weakmap';
    className = 'WeakMap';
    description = 'WeakMap';
  } else if (value instanceof WeakSet) {
    subtype = 'weakset';
    className = 'WeakSet';
    description = 'WeakSet';
  } else if (value instanceof Promise) {
    subtype = 'promise';
    className = 'Promise';
    description = 'Promise';
  } else if (typeof ArrayBuffer !== 'undefined' && value instanceof ArrayBuffer) {
    subtype = 'arraybuffer';
    className = 'ArrayBuffer';
    description = 'ArrayBuffer(' + value.byteLength + ')';
  } else {
    className = value.constructor ? value.constructor.name : 'Object';
    try {
      var keys = Object.keys(value);
      description = className === 'Object'
        ? '{' + keys.slice(0, 5).join(', ') + (keys.length > 5 ? ', ...' : '') + '}'
        : className;
    } catch (e) {
      description = className;
    }
  }

  var result = {
    type: 'object',
    className: className,
    description: description,
    objectId: objectId,
  };
  if (subtype) result.subtype = subtype;
  return result;
}

// Parse a JSC Error().stack string into CDP StackTrace
function parseStackTrace(stack) {
  if (!stack) return {callFrames: []};
  var lines = stack.split('\n');
  var frames = [];
  for (var i = 0; i < lines.length; i++) {
    var line = lines[i].trim();
    // JSC stack format: "functionName@file:line:col" or "@file:line:col"
    var match = line.match(/^(.*)@(.*):(\d+):(\d+)$/);
    if (match) {
      frames.push({
        functionName: match[1] || '',
        scriptId: '0',
        url: match[2] || '',
        lineNumber: parseInt(match[3], 10) - 1, // CDP is 0-based
        columnNumber: parseInt(match[4], 10) - 1,
      });
    }
  }
  return {callFrames: frames};
}

module.exports = {
  toRemoteObject: toRemoteObject,
  storeObject: storeObject,
  getStoredObject: getStoredObject,
  hasStoredObject: hasStoredObject,
  releaseObject: releaseObject,
  releaseAll: releaseAll,
  parseStackTrace: parseStackTrace,
};
