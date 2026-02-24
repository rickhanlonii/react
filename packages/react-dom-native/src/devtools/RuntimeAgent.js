'use strict';

// ---------------------------------------------------------------------------
// Runtime Agent (in-JSC)
//
// Handles CDP Runtime domain requests forwarded from the inspector proxy.
// Runs inside JSC — uses eval() for expression evaluation and delegates
// object storage/serialization to the shared RemoteObject module.
//
// Incoming messages (via $$handleCDPRequest):
//   {requestId, domain: 'Runtime', method, params}
//
// Outgoing messages (via $$sendInspectorMessage):
//   {type: 'cdp-response', requestId, result}
// ---------------------------------------------------------------------------

var RemoteObject = require('./RemoteObject');

function handleEvaluate(params) {
  var expression = params.expression;
  try {
    // (0, eval) is indirect eval — executes in global scope
    var value = (0, eval)(expression);
    var result = {result: RemoteObject.toRemoteObject(value)};
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
      result: RemoteObject.toRemoteObject(undefined),
      exceptionDetails: {
        exceptionId: Date.now(),
        text: String(e),
        lineNumber: 0,
        columnNumber: 0,
        exception: RemoteObject.toRemoteObject(e),
      },
    };
  }
}

function handleGetProperties(params) {
  var objectId = params.objectId;
  if (!RemoteObject.hasStoredObject(objectId)) {
    return {result: []};
  }
  var obj = RemoteObject.getStoredObject(objectId);

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
          prop.value = RemoteObject.toRemoteObject(descriptor.value);
          prop.writable = !!descriptor.writable;
        }
        if (descriptor.get) {
          prop.get = RemoteObject.toRemoteObject(descriptor.get);
        }
        if (descriptor.set) {
          prop.set = RemoteObject.toRemoteObject(descriptor.set);
        }
        properties.push(prop);
      } catch (e) {
        properties.push({
          name: name,
          value: RemoteObject.toRemoteObject(undefined),
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
          value: RemoteObject.toRemoteObject(proto),
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
  if (!RemoteObject.hasStoredObject(objectId)) {
    return {result: RemoteObject.toRemoteObject(undefined)};
  }
  var obj = RemoteObject.getStoredObject(objectId);

  try {
    var fn = (0, eval)('(' + params.functionDeclaration + ')');
    var args = [];
    if (params.arguments) {
      for (var i = 0; i < params.arguments.length; i++) {
        var arg = params.arguments[i];
        if ('objectId' in arg) {
          args.push(RemoteObject.getStoredObject(arg.objectId));
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
    return {result: RemoteObject.toRemoteObject(result)};
  } catch (e) {
    return {
      result: RemoteObject.toRemoteObject(undefined),
      exceptionDetails: {
        exceptionId: Date.now(),
        text: String(e),
        lineNumber: 0,
        columnNumber: 0,
        exception: RemoteObject.toRemoteObject(e),
      },
    };
  }
}

function handleReleaseObject(params) {
  RemoteObject.releaseObject(params.objectId);
  return {};
}

function handleReleaseObjectGroup() {
  RemoteObject.releaseAll();
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
    case 'getHeapUsage': {
      var mem = {usedSize: 0, totalSize: 0};
      if (typeof $$getMemoryUsage === 'function') {
        var info = $$getMemoryUsage();
        if (info) {
          mem.usedSize = info.usedSize || 0;
          mem.totalSize = info.totalSize || 0;
        }
      }
      result = mem;
      break;
    }
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

// ---------------------------------------------------------------------------
// Profiler domain (in-JSC)
//
// Handles Profiler.start/stop by recording $$performanceNow() timestamps.
// This ensures the profile time range matches trace event timestamps (both
// use the same monotonic clock from CACurrentMediaTime).
// ---------------------------------------------------------------------------

var profilerStartTime = 0;

function handleProfilerRequest(requestId, method, params) {
  var result = {};

  switch (method) {
    case 'start':
      profilerStartTime = typeof $$performanceNow === 'function'
        ? $$performanceNow() * 1000  // ms → µs
        : 0;
      break;

    case 'stop':
      var endTime = typeof $$performanceNow === 'function'
        ? $$performanceNow() * 1000
        : 0;
      result = {
        profile: {
          nodes: [{
            id: 1,
            callFrame: {
              functionName: '(root)',
              scriptId: '0',
              url: '',
              lineNumber: -1,
              columnNumber: -1,
            },
            children: [],
          }],
          startTime: profilerStartTime,
          endTime: endTime,
          samples: [],
          timeDeltas: [],
        },
      };
      break;

    case 'setSamplingInterval':
      // Acknowledged but no-op for JSC
      break;

    default:
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
  } else if (request.domain === 'Profiler') {
    handleProfilerRequest(request.requestId, request.method, request.params || {});
  } else if (request.domain === 'DOM') {
    if (typeof $$handleDOMRequest === 'function') {
      $$handleDOMRequest(request.requestId, request.method, request.params || {});
    }
  } else if (request.domain === 'CSS') {
    if (typeof $$handleCSSRequest === 'function') {
      $$handleCSSRequest(request.requestId, request.method, request.params || {});
    }
  }
};
