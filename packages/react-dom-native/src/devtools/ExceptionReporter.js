'use strict';

// ---------------------------------------------------------------------------
// Exception Reporter
//
// Captures unhandled exceptions and forwards them as
// Runtime.exceptionThrown CDP events to Chrome DevTools.
//
// Uses the JSContext.exceptionHandler (wired by JavaScriptCoreEngine)
// which calls our $$uncaughtExceptionHandler global when an unhandled
// error occurs.
// ---------------------------------------------------------------------------

var RemoteObject = require('./RemoteObject');

function reportException(error) {
  if (typeof $$sendInspectorMessage !== 'function') return;

  var stackTrace = RemoteObject.parseStackTrace(error && error.stack);
  var text = String(error);

  $$sendInspectorMessage(JSON.stringify({
    type: 'cdp-event',
    method: 'Runtime.exceptionThrown',
    params: {
      timestamp: typeof $$performanceNow === 'function' ? $$performanceNow() : Date.now(),
      exceptionDetails: {
        exceptionId: Date.now(),
        text: 'Uncaught ' + text,
        lineNumber: stackTrace.callFrames.length > 0 ? stackTrace.callFrames[0].lineNumber : 0,
        columnNumber: stackTrace.callFrames.length > 0 ? stackTrace.callFrames[0].columnNumber : 0,
        scriptId: '0',
        url: stackTrace.callFrames.length > 0 ? stackTrace.callFrames[0].url : '',
        stackTrace: stackTrace,
        exception: RemoteObject.toRemoteObject(error),
        executionContextId: 1,
      },
    },
  }));
}

// Register a global handler that the JSEngine exception handler calls
globalThis.$$reportUncaughtException = reportException;
