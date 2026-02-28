'use strict';

// ---------------------------------------------------------------------------
// CDP Runtime helpers — registered as $$ globals for Swift to call
//
// Swift dispatches CDP requests directly and calls these helpers for
// Runtime domain methods that require live JS value introspection.
// ---------------------------------------------------------------------------

var objectStore = {};
var nextObjectId = 1;

function storeObject(value) {
  var id = 'obj-' + nextObjectId++;
  objectStore[id] = value;
  return id;
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

// ---------------------------------------------------------------------------
// $$ globals — called by Swift CDP dispatch
// ---------------------------------------------------------------------------

// Evaluate expression and return CDP result (1 JS crossing)
globalThis.$$evaluateForCDP = function $$evaluateForCDP(expression, returnByValue) {
  try {
    var value = (0, eval)(expression);
    var result = {result: toRemoteObject(value)};
    if (returnByValue && typeof value === 'object' && value !== null) {
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
        exceptionId: Date.now(),
        text: String(e),
        lineNumber: 0,
        columnNumber: 0,
        exception: toRemoteObject(e),
      },
    };
  }
};

// Return CDP-formatted property list for a stored object (1 JS crossing)
globalThis.$$getOwnProperties = function $$getOwnProperties(objectId, ownOnly) {
  if (!(objectId in objectStore)) {
    return {result: []};
  }
  var obj = objectStore[objectId];
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

  if (!ownOnly) {
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
};

// Call function on a stored object (1 JS crossing)
globalThis.$$callFunctionOn = function $$callFunctionOn(objectId, functionDeclaration, argsJson) {
  if (!(objectId in objectStore)) {
    return {result: toRemoteObject(undefined)};
  }
  var obj = objectStore[objectId];

  try {
    var fn = (0, eval)('(' + functionDeclaration + ')');
    var args = [];
    if (argsJson) {
      var parsedArgs = typeof argsJson === 'string' ? JSON.parse(argsJson) : argsJson;
      for (var i = 0; i < parsedArgs.length; i++) {
        var arg = parsedArgs[i];
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
        exceptionId: Date.now(),
        text: String(e),
        lineNumber: 0,
        columnNumber: 0,
        exception: toRemoteObject(e),
      },
    };
  }
};

// Release a stored object
globalThis.$$releaseObject = function $$releaseObject(objectId) {
  delete objectStore[objectId];
};

// Release all stored objects
globalThis.$$releaseAllObjects = function $$releaseAllObjects() {
  objectStore = {};
};
