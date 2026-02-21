'use strict';

// ---------------------------------------------------------------------------
// Console forwarding to Chrome DevTools
//
// Wraps console.log/warn/error/info/debug so that calls in JSC are forwarded
// to the dev server via $$sendInspectorMessage, which relays them as
// Runtime.consoleAPICalled CDP events to any connected Chrome DevTools.
//
// Uses the shared RemoteObject module for proper CDP type serialization
// (objects get objectIds for expandable inspection, not stringified).
// ---------------------------------------------------------------------------

var RemoteObject = require('./RemoteObject');

var METHODS = ['log', 'warn', 'error', 'info', 'debug'];
var originals = {};

for (var i = 0; i < METHODS.length; i++) {
  (function (method) {
    originals[method] = console[method];

    console[method] = function () {
      // Always call the original so Xcode console still works
      if (originals[method]) {
        originals[method].apply(console, arguments);
      }

      // Forward to dev server if the bridge is available
      if (typeof $$sendInspectorMessage !== 'function') {
        return;
      }

      var args = [];
      for (var j = 0; j < arguments.length; j++) {
        args.push(RemoteObject.toRemoteObject(arguments[j]));
      }

      // Map console method names to CDP types
      var cdpType = method;
      if (method === 'warn') cdpType = 'warning';

      var msg = {
        type: 'console-message',
        cdpType: cdpType,
        args: args,
        timestamp: typeof $$performanceNow === 'function' ? $$performanceNow() : Date.now(),
      };

      // Include stack trace for errors and warnings
      if (method === 'error' || method === 'warn') {
        try {
          msg.stackTrace = RemoteObject.parseStackTrace(new Error().stack);
          // Remove the first frame (this wrapper function)
          if (msg.stackTrace.callFrames.length > 0) {
            msg.stackTrace.callFrames.shift();
          }
        } catch (e) {}
      }

      $$sendInspectorMessage(JSON.stringify(msg));
    };
  })(METHODS[i]);
}
