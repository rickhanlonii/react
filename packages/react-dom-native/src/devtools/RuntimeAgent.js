'use strict';

// ---------------------------------------------------------------------------
// Runtime Agent (in-JSC)
//
// Handles CDP Runtime domain requests forwarded from the inspector proxy.
// Runs inside JSC — uses eval() for expression evaluation and maintains
// an object store for getProperties/releaseObject/releaseObjectGroup.
//
// Incoming messages (via $$handleCDPRequest):
//   {requestId, domain: 'Runtime', method, params}
//
// Outgoing messages (via $$sendInspectorMessage):
//   {type: 'cdp-response', requestId, result}
// ---------------------------------------------------------------------------

// Object store — maps objectId -> JS value for getProperties
var objectStore = {};
var nextObjectId = 1;

function storeObject(value) {
  var id = 'obj-' + nextObjectId++;
  objectStore[id] = value;
  return id;
}

// Convert a JS value to a CDP RemoteObject
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
    // Handle special numbers
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

function handleEvaluate(params) {
  var expression = params.expression;
  try {
    // (0, eval) is indirect eval — executes in global scope
    var value = (0, eval)(expression);
    var result = {result: toRemoteObject(value)};
    if (params.returnByValue && typeof value === 'object' && value !== null) {
      try {
        result.result = {type: typeof value, value: JSON.parse(JSON.stringify(value))};
      } catch (e) {
        // Fall through to objectId-based result
      }
    }
    return result;
  } catch (e) {
    return {
      result: toRemoteObject(undefined),
      exceptionDetails: {
        exceptionId: nextObjectId++,
        text: String(e),
        lineNumber: 0,
        columnNumber: 0,
        exception: toRemoteObject(e),
      },
    };
  }
}

function handleGetProperties(params) {
  var objectId = params.objectId;
  var obj = objectStore[objectId];
  if (obj === undefined && !(objectId in objectStore)) {
    return {result: []};
  }

  var properties = [];

  try {
    var names = Object.getOwnPropertyNames(obj);
    for (var i = 0; i < names.length; i++) {
      var name = names[i];
      try {
        var descriptor = Object.getOwnPropertyDescriptor(obj, name);
        var prop = {
          name: name,
          configurable: !!descriptor.configurable,
          enumerable: !!descriptor.enumerable,
          isOwn: true,
        };
        if ('value' in descriptor) {
          prop.value = toRemoteObject(descriptor.value);
          prop.writable = !!descriptor.writable;
        }
        if (descriptor.get) {
          prop.get = toRemoteObject(descriptor.get);
        }
        if (descriptor.set) {
          prop.set = toRemoteObject(descriptor.set);
        }
        properties.push(prop);
      } catch (e) {
        properties.push({
          name: name,
          value: toRemoteObject(undefined),
          configurable: false,
          enumerable: false,
          isOwn: true,
        });
      }
    }
  } catch (e) {
    // Non-inspectable object
  }

  // Add prototype if not ownProperties-only
  if (!params.ownProperties) {
    try {
      var proto = Object.getPrototypeOf(obj);
      if (proto !== null) {
        properties.push({
          name: '__proto__',
          value: toRemoteObject(proto),
          configurable: true,
          enumerable: false,
          isOwn: true,
        });
      }
    } catch (e) {}
  }

  return {result: properties};
}

function handleCallFunctionOn(params) {
  var objectId = params.objectId;
  var obj = objectStore[objectId];
  if (obj === undefined && !(objectId in objectStore)) {
    return {result: toRemoteObject(undefined)};
  }

  try {
    var fn = (0, eval)('(' + params.functionDeclaration + ')');
    var args = [];
    if (params.arguments) {
      for (var i = 0; i < params.arguments.length; i++) {
        var arg = params.arguments[i];
        if ('objectId' in arg) {
          args.push(objectStore[arg.objectId]);
        } else if ('value' in arg) {
          args.push(arg.value);
        } else if ('unserializableValue' in arg) {
          args.push((0, eval)(arg.unserializableValue));
        } else {
          args.push(undefined);
        }
      }
    }
    var result = fn.apply(obj, args);
    return {result: toRemoteObject(result)};
  } catch (e) {
    return {
      result: toRemoteObject(undefined),
      exceptionDetails: {
        exceptionId: nextObjectId++,
        text: String(e),
        lineNumber: 0,
        columnNumber: 0,
        exception: toRemoteObject(e),
      },
    };
  }
}

function handleReleaseObject(params) {
  delete objectStore[params.objectId];
  return {};
}

function handleReleaseObjectGroup() {
  // We don't track groups; clear everything
  objectStore = {};
  return {};
}

// Main dispatcher — called by InspectorMessageHandler
function handleRuntimeRequest(requestId, method, params) {
  var result;

  switch (method) {
    case 'evaluate':
      result = handleEvaluate(params);
      break;
    case 'getProperties':
      result = handleGetProperties(params);
      break;
    case 'callFunctionOn':
      result = handleCallFunctionOn(params);
      break;
    case 'releaseObject':
      result = handleReleaseObject(params);
      break;
    case 'releaseObjectGroup':
      result = handleReleaseObjectGroup(params);
      break;
    case 'globalLexicalScopeNames':
      result = {names: []};
      break;
    case 'compileScript':
      result = {};
      break;
    default:
      result = {};
      break;
  }

  if (typeof $$sendInspectorMessage === 'function') {
    $$sendInspectorMessage(JSON.stringify({
      type: 'cdp-response',
      requestId: requestId,
      result: result,
    }));
  }
}

// Register as a global handler
globalThis.$$handleCDPRequest = function (jsonString) {
  var request;
  try {
    request = JSON.parse(jsonString);
  } catch (e) {
    return;
  }

  if (request.domain === 'Runtime') {
    handleRuntimeRequest(request.requestId, request.method, request.params || {});
  }
};
