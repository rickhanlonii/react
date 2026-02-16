/**
 * @license React
 * react-server.production.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

"use strict";
module.exports = function ($$$config) {
  function getIteratorFn(maybeIterable) {
    if (null === maybeIterable || "object" !== typeof maybeIterable)
      return null;
    maybeIterable =
      (MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL]) ||
      maybeIterable["@@iterator"];
    return "function" === typeof maybeIterable ? maybeIterable : null;
  }
  function getComponentNameFromType(type) {
    if (null == type) return null;
    if ("function" === typeof type)
      return type.$$typeof === REACT_CLIENT_REFERENCE
        ? null
        : type.displayName || type.name || null;
    if ("string" === typeof type) return type;
    switch (type) {
      case REACT_FRAGMENT_TYPE:
        return "Fragment";
      case REACT_PROFILER_TYPE:
        return "Profiler";
      case REACT_STRICT_MODE_TYPE:
        return "StrictMode";
      case REACT_SUSPENSE_TYPE:
        return "Suspense";
      case REACT_SUSPENSE_LIST_TYPE:
        return "SuspenseList";
      case REACT_ACTIVITY_TYPE:
        return "Activity";
      case REACT_VIEW_TRANSITION_TYPE:
        return "ViewTransition";
    }
    if ("object" === typeof type)
      switch (type.$$typeof) {
        case REACT_PORTAL_TYPE:
          return "Portal";
        case REACT_CONTEXT_TYPE:
          return type.displayName || "Context";
        case REACT_CONSUMER_TYPE:
          return (type._context.displayName || "Context") + ".Consumer";
        case REACT_FORWARD_REF_TYPE:
          var innerType = type.render;
          type = type.displayName;
          type ||
            ((type = innerType.displayName || innerType.name || ""),
            (type = "" !== type ? "ForwardRef(" + type + ")" : "ForwardRef"));
          return type;
        case REACT_MEMO_TYPE:
          return (
            (innerType = type.displayName || null),
            null !== innerType
              ? innerType
              : getComponentNameFromType(type.type) || "Memo"
          );
        case REACT_LAZY_TYPE:
          innerType = type._payload;
          type = type._init;
          try {
            return getComponentNameFromType(type(innerType));
          } catch (x) {}
      }
    return null;
  }
  function popToNearestCommonAncestor(prev, next) {
    if (prev !== next) {
      prev.context._currentValue2 = prev.parentValue;
      prev = prev.parent;
      var parentNext = next.parent;
      if (null === prev) {
        if (null !== parentNext)
          throw Error(
            "The stacks must reach the root at the same time. This is a bug in React."
          );
      } else {
        if (null === parentNext)
          throw Error(
            "The stacks must reach the root at the same time. This is a bug in React."
          );
        popToNearestCommonAncestor(prev, parentNext);
      }
      next.context._currentValue2 = next.value;
    }
  }
  function popAllPrevious(prev) {
    prev.context._currentValue2 = prev.parentValue;
    prev = prev.parent;
    null !== prev && popAllPrevious(prev);
  }
  function pushAllNext(next) {
    var parentNext = next.parent;
    null !== parentNext && pushAllNext(parentNext);
    next.context._currentValue2 = next.value;
  }
  function popPreviousToCommonLevel(prev, next) {
    prev.context._currentValue2 = prev.parentValue;
    prev = prev.parent;
    if (null === prev)
      throw Error(
        "The depth must equal at least at zero before reaching the root. This is a bug in React."
      );
    prev.depth === next.depth
      ? popToNearestCommonAncestor(prev, next)
      : popPreviousToCommonLevel(prev, next);
  }
  function popNextToCommonLevel(prev, next) {
    var parentNext = next.parent;
    if (null === parentNext)
      throw Error(
        "The depth must equal at least at zero before reaching the root. This is a bug in React."
      );
    prev.depth === parentNext.depth
      ? popToNearestCommonAncestor(prev, parentNext)
      : popNextToCommonLevel(prev, parentNext);
    next.context._currentValue2 = next.value;
  }
  function switchContext(newSnapshot) {
    var prev = currentActiveSnapshot;
    prev !== newSnapshot &&
      (null === prev
        ? pushAllNext(newSnapshot)
        : null === newSnapshot
          ? popAllPrevious(prev)
          : prev.depth === newSnapshot.depth
            ? popToNearestCommonAncestor(prev, newSnapshot)
            : prev.depth > newSnapshot.depth
              ? popPreviousToCommonLevel(prev, newSnapshot)
              : popNextToCommonLevel(prev, newSnapshot),
      (currentActiveSnapshot = newSnapshot));
  }
  function getTreeId(context) {
    var overflow = context.overflow;
    context = context.id;
    return (
      (context & ~(1 << (32 - clz32(context) - 1))).toString(32) + overflow
    );
  }
  function pushTreeContext(baseContext, totalChildren, index) {
    var baseIdWithLeadingBit = baseContext.id;
    baseContext = baseContext.overflow;
    var baseLength = 32 - clz32(baseIdWithLeadingBit) - 1;
    baseIdWithLeadingBit &= ~(1 << baseLength);
    index += 1;
    var length = 32 - clz32(totalChildren) + baseLength;
    if (30 < length) {
      var numberOfOverflowBits = baseLength - (baseLength % 5);
      length = (
        baseIdWithLeadingBit &
        ((1 << numberOfOverflowBits) - 1)
      ).toString(32);
      baseIdWithLeadingBit >>= numberOfOverflowBits;
      baseLength -= numberOfOverflowBits;
      return {
        id:
          (1 << (32 - clz32(totalChildren) + baseLength)) |
          (index << baseLength) |
          baseIdWithLeadingBit,
        overflow: length + baseContext
      };
    }
    return {
      id: (1 << length) | (index << baseLength) | baseIdWithLeadingBit,
      overflow: baseContext
    };
  }
  function clz32Fallback(x) {
    x >>>= 0;
    return 0 === x ? 32 : (31 - ((log(x) / LN2) | 0)) | 0;
  }
  function noop() {}
  function trackUsedThenable(thenableState, thenable, index) {
    index = thenableState[index];
    void 0 === index
      ? thenableState.push(thenable)
      : index !== thenable && (thenable.then(noop, noop), (thenable = index));
    switch (thenable.status) {
      case "fulfilled":
        return thenable.value;
      case "rejected":
        throw thenable.reason;
      default:
        "string" === typeof thenable.status
          ? thenable.then(noop, noop)
          : ((thenableState = thenable),
            (thenableState.status = "pending"),
            thenableState.then(
              function (fulfilledValue) {
                if ("pending" === thenable.status) {
                  var fulfilledThenable = thenable;
                  fulfilledThenable.status = "fulfilled";
                  fulfilledThenable.value = fulfilledValue;
                }
              },
              function (error) {
                if ("pending" === thenable.status) {
                  var rejectedThenable = thenable;
                  rejectedThenable.status = "rejected";
                  rejectedThenable.reason = error;
                }
              }
            ));
        switch (thenable.status) {
          case "fulfilled":
            return thenable.value;
          case "rejected":
            throw thenable.reason;
        }
        suspendedThenable = thenable;
        throw SuspenseException;
    }
  }
  function getSuspendedThenable() {
    if (null === suspendedThenable)
      throw Error(
        "Expected a suspended thenable. This is a bug in React. Please file an issue."
      );
    var thenable = suspendedThenable;
    suspendedThenable = null;
    return thenable;
  }
  function is(x, y) {
    return (x === y && (0 !== x || 1 / x === 1 / y)) || (x !== x && y !== y);
  }
  function resolveCurrentlyRenderingComponent() {
    if (null === currentlyRenderingComponent)
      throw Error(
        "Invalid hook call. Hooks can only be called inside of the body of a function component. This could happen for one of the following reasons:\n1. You might have mismatching versions of React and the renderer (such as React DOM)\n2. You might be breaking the Rules of Hooks\n3. You might have more than one copy of React in the same app\nSee https://react.dev/link/invalid-hook-call for tips about how to debug and fix this problem."
      );
    return currentlyRenderingComponent;
  }
  function createHook() {
    if (0 < numberOfReRenders)
      throw Error("Rendered more hooks than during the previous render");
    return { memoizedState: null, queue: null, next: null };
  }
  function createWorkInProgressHook() {
    null === workInProgressHook
      ? null === firstWorkInProgressHook
        ? ((isReRender = !1),
          (firstWorkInProgressHook = workInProgressHook = createHook()))
        : ((isReRender = !0), (workInProgressHook = firstWorkInProgressHook))
      : null === workInProgressHook.next
        ? ((isReRender = !1),
          (workInProgressHook = workInProgressHook.next = createHook()))
        : ((isReRender = !0), (workInProgressHook = workInProgressHook.next));
    return workInProgressHook;
  }
  function getThenableStateAfterSuspending() {
    var state = thenableState;
    thenableState = null;
    return state;
  }
  function resetHooksState() {
    currentlyRenderingKeyPath =
      currentlyRenderingRequest =
      currentlyRenderingTask =
      currentlyRenderingComponent =
        null;
    didScheduleRenderPhaseUpdate = !1;
    firstWorkInProgressHook = null;
    numberOfReRenders = 0;
    workInProgressHook = renderPhaseUpdates = null;
  }
  function basicStateReducer(state, action) {
    return "function" === typeof action ? action(state) : action;
  }
  function useReducer(reducer, initialArg, init) {
    currentlyRenderingComponent = resolveCurrentlyRenderingComponent();
    workInProgressHook = createWorkInProgressHook();
    if (isReRender) {
      var queue = workInProgressHook.queue;
      initialArg = queue.dispatch;
      if (
        null !== renderPhaseUpdates &&
        ((init = renderPhaseUpdates.get(queue)), void 0 !== init)
      ) {
        renderPhaseUpdates.delete(queue);
        queue = workInProgressHook.memoizedState;
        do (queue = reducer(queue, init.action)), (init = init.next);
        while (null !== init);
        workInProgressHook.memoizedState = queue;
        return [queue, initialArg];
      }
      return [workInProgressHook.memoizedState, initialArg];
    }
    reducer =
      reducer === basicStateReducer
        ? "function" === typeof initialArg
          ? initialArg()
          : initialArg
        : void 0 !== init
          ? init(initialArg)
          : initialArg;
    workInProgressHook.memoizedState = reducer;
    reducer = workInProgressHook.queue = { last: null, dispatch: null };
    reducer = reducer.dispatch = dispatchAction.bind(
      null,
      currentlyRenderingComponent,
      reducer
    );
    return [workInProgressHook.memoizedState, reducer];
  }
  function useMemo(nextCreate, deps) {
    currentlyRenderingComponent = resolveCurrentlyRenderingComponent();
    workInProgressHook = createWorkInProgressHook();
    deps = void 0 === deps ? null : deps;
    if (null !== workInProgressHook) {
      var prevState = workInProgressHook.memoizedState;
      if (null !== prevState && null !== deps) {
        var prevDeps = prevState[1];
        a: if (null === prevDeps) prevDeps = !1;
        else {
          for (var i = 0; i < prevDeps.length && i < deps.length; i++)
            if (!objectIs(deps[i], prevDeps[i])) {
              prevDeps = !1;
              break a;
            }
          prevDeps = !0;
        }
        if (prevDeps) return prevState[0];
      }
    }
    nextCreate = nextCreate();
    workInProgressHook.memoizedState = [nextCreate, deps];
    return nextCreate;
  }
  function dispatchAction(componentIdentity, queue, action) {
    if (25 <= numberOfReRenders)
      throw Error(
        "Too many re-renders. React limits the number of renders to prevent an infinite loop."
      );
    if (componentIdentity === currentlyRenderingComponent)
      if (
        ((didScheduleRenderPhaseUpdate = !0),
        (componentIdentity = { action: action, next: null }),
        null === renderPhaseUpdates && (renderPhaseUpdates = new Map()),
        (action = renderPhaseUpdates.get(queue)),
        void 0 === action)
      )
        renderPhaseUpdates.set(queue, componentIdentity);
      else {
        for (queue = action; null !== queue.next; ) queue = queue.next;
        queue.next = componentIdentity;
      }
  }
  function throwOnUseEffectEventCall() {
    throw Error(
      "A function wrapped in useEffectEvent can't be called during rendering."
    );
  }
  function unsupportedStartTransition() {
    throw Error("startTransition cannot be called during server rendering.");
  }
  function unsupportedSetOptimisticState() {
    throw Error("Cannot update optimistic state while rendering.");
  }
  function useActionState(action, initialState, permalink) {
    resolveCurrentlyRenderingComponent();
    var actionStateHookIndex = actionStateCounter++,
      request = currentlyRenderingRequest;
    if ("function" === typeof action.$$FORM_ACTION) {
      var nextPostbackStateKey = null,
        componentKeyPath = currentlyRenderingKeyPath;
      request = request.formState;
      var isSignatureEqual = action.$$IS_SIGNATURE_EQUAL;
      if (null !== request && "function" === typeof isSignatureEqual) {
        var postbackKey = request[1];
        isSignatureEqual.call(action, request[2], request[3]) &&
          ((nextPostbackStateKey =
            void 0 !== permalink
              ? "p" + permalink
              : "k" +
                createFastHash(
                  JSON.stringify([componentKeyPath, null, actionStateHookIndex])
                )),
          postbackKey === nextPostbackStateKey &&
            ((actionStateMatchingIndex = actionStateHookIndex),
            (initialState = request[0])));
      }
      var boundAction = action.bind(null, initialState);
      action = function (payload) {
        boundAction(payload);
      };
      "function" === typeof boundAction.$$FORM_ACTION &&
        (action.$$FORM_ACTION = function (prefix) {
          prefix = boundAction.$$FORM_ACTION(prefix);
          void 0 !== permalink &&
            ((permalink += ""), (prefix.action = permalink));
          var formData = prefix.data;
          formData &&
            (null === nextPostbackStateKey &&
              (nextPostbackStateKey =
                void 0 !== permalink
                  ? "p" + permalink
                  : "k" +
                    createFastHash(
                      JSON.stringify([
                        componentKeyPath,
                        null,
                        actionStateHookIndex
                      ])
                    )),
            formData.append("$ACTION_KEY", nextPostbackStateKey));
          return prefix;
        });
      return [initialState, action, !1];
    }
    var boundAction$4 = action.bind(null, initialState);
    return [
      initialState,
      function (payload) {
        boundAction$4(payload);
      },
      !1
    ];
  }
  function unwrapThenable(thenable) {
    var index = thenableIndexCounter;
    thenableIndexCounter += 1;
    null === thenableState && (thenableState = []);
    return trackUsedThenable(thenableState, thenable, index);
  }
  function readPreviousThenableFromState() {
    var index = thenableIndexCounter;
    thenableIndexCounter += 1;
    if (null !== thenableState)
      return (
        (index = thenableState[index]),
        (index = void 0 === index ? void 0 : index.value),
        index
      );
  }
  function unsupportedRefresh() {
    throw Error("Cache cannot be refreshed during server rendering.");
  }
  function describeBuiltInComponentFrame(name) {
    if (void 0 === prefix)
      try {
        throw Error();
      } catch (x) {
        var match = x.stack.trim().match(/\n( *(at )?)/);
        prefix = (match && match[1]) || "";
        suffix =
          -1 < x.stack.indexOf("\n    at")
            ? " (<anonymous>)"
            : -1 < x.stack.indexOf("@")
              ? "@unknown:0:0"
              : "";
      }
    return "\n" + prefix + name + suffix;
  }
  function describeNativeComponentFrame(fn, construct) {
    if (!fn || reentry) return "";
    reentry = !0;
    var previousPrepareStackTrace = Error.prepareStackTrace;
    Error.prepareStackTrace = void 0;
    try {
      var RunInRootFrame = {
        DetermineComponentFrameRoot: function () {
          try {
            if (construct) {
              var Fake = function () {
                throw Error();
              };
              Object.defineProperty(Fake.prototype, "props", {
                set: function () {
                  throw Error();
                }
              });
              if ("object" === typeof Reflect && Reflect.construct) {
                try {
                  Reflect.construct(Fake, []);
                } catch (x) {
                  var control = x;
                }
                Reflect.construct(fn, [], Fake);
              } else {
                try {
                  Fake.call();
                } catch (x$6) {
                  control = x$6;
                }
                fn.call(Fake.prototype);
              }
            } else {
              try {
                throw Error();
              } catch (x$7) {
                control = x$7;
              }
              (Fake = fn()) &&
                "function" === typeof Fake.catch &&
                Fake.catch(function () {});
            }
          } catch (sample) {
            if (sample && control && "string" === typeof sample.stack)
              return [sample.stack, control.stack];
          }
          return [null, null];
        }
      };
      RunInRootFrame.DetermineComponentFrameRoot.displayName =
        "DetermineComponentFrameRoot";
      var namePropDescriptor = Object.getOwnPropertyDescriptor(
        RunInRootFrame.DetermineComponentFrameRoot,
        "name"
      );
      namePropDescriptor &&
        namePropDescriptor.configurable &&
        Object.defineProperty(
          RunInRootFrame.DetermineComponentFrameRoot,
          "name",
          { value: "DetermineComponentFrameRoot" }
        );
      var _RunInRootFrame$Deter = RunInRootFrame.DetermineComponentFrameRoot(),
        sampleStack = _RunInRootFrame$Deter[0],
        controlStack = _RunInRootFrame$Deter[1];
      if (sampleStack && controlStack) {
        var sampleLines = sampleStack.split("\n"),
          controlLines = controlStack.split("\n");
        for (
          namePropDescriptor = RunInRootFrame = 0;
          RunInRootFrame < sampleLines.length &&
          !sampleLines[RunInRootFrame].includes("DetermineComponentFrameRoot");

        )
          RunInRootFrame++;
        for (
          ;
          namePropDescriptor < controlLines.length &&
          !controlLines[namePropDescriptor].includes(
            "DetermineComponentFrameRoot"
          );

        )
          namePropDescriptor++;
        if (
          RunInRootFrame === sampleLines.length ||
          namePropDescriptor === controlLines.length
        )
          for (
            RunInRootFrame = sampleLines.length - 1,
              namePropDescriptor = controlLines.length - 1;
            1 <= RunInRootFrame &&
            0 <= namePropDescriptor &&
            sampleLines[RunInRootFrame] !== controlLines[namePropDescriptor];

          )
            namePropDescriptor--;
        for (
          ;
          1 <= RunInRootFrame && 0 <= namePropDescriptor;
          RunInRootFrame--, namePropDescriptor--
        )
          if (
            sampleLines[RunInRootFrame] !== controlLines[namePropDescriptor]
          ) {
            if (1 !== RunInRootFrame || 1 !== namePropDescriptor) {
              do
                if (
                  (RunInRootFrame--,
                  namePropDescriptor--,
                  0 > namePropDescriptor ||
                    sampleLines[RunInRootFrame] !==
                      controlLines[namePropDescriptor])
                ) {
                  var frame =
                    "\n" +
                    sampleLines[RunInRootFrame].replace(" at new ", " at ");
                  fn.displayName &&
                    frame.includes("<anonymous>") &&
                    (frame = frame.replace("<anonymous>", fn.displayName));
                  return frame;
                }
              while (1 <= RunInRootFrame && 0 <= namePropDescriptor);
            }
            break;
          }
      }
    } finally {
      (reentry = !1), (Error.prepareStackTrace = previousPrepareStackTrace);
    }
    return (previousPrepareStackTrace = fn ? fn.displayName || fn.name : "")
      ? describeBuiltInComponentFrame(previousPrepareStackTrace)
      : "";
  }
  function describeComponentStackByType(type) {
    if ("string" === typeof type) return describeBuiltInComponentFrame(type);
    if ("function" === typeof type)
      return type.prototype && type.prototype.isReactComponent
        ? describeNativeComponentFrame(type, !0)
        : describeNativeComponentFrame(type, !1);
    if ("object" === typeof type && null !== type) {
      switch (type.$$typeof) {
        case REACT_FORWARD_REF_TYPE:
          return describeNativeComponentFrame(type.render, !1);
        case REACT_MEMO_TYPE:
          return describeNativeComponentFrame(type.type, !1);
        case REACT_LAZY_TYPE:
          var lazyComponent = type,
            payload = lazyComponent._payload;
          lazyComponent = lazyComponent._init;
          try {
            type = lazyComponent(payload);
          } catch (x) {
            return describeBuiltInComponentFrame("Lazy");
          }
          return describeComponentStackByType(type);
      }
      if ("string" === typeof type.name) {
        a: {
          payload = type.name;
          lazyComponent = type.env;
          var location = type.debugLocation;
          if (
            null != location &&
            ((type = Error.prepareStackTrace),
            (Error.prepareStackTrace = void 0),
            (location = location.stack),
            (Error.prepareStackTrace = type),
            location.startsWith("Error: react-stack-top-frame\n") &&
              (location = location.slice(29)),
            (type = location.indexOf("\n")),
            -1 !== type && (location = location.slice(type + 1)),
            (type = location.indexOf("react_stack_bottom_frame")),
            -1 !== type && (type = location.lastIndexOf("\n", type)),
            (type = -1 !== type ? (location = location.slice(0, type)) : ""),
            (location = type.lastIndexOf("\n")),
            (type = -1 === location ? type : type.slice(location + 1)),
            -1 !== type.indexOf(payload))
          ) {
            payload = "\n" + type;
            break a;
          }
          payload = describeBuiltInComponentFrame(
            payload + (lazyComponent ? " [" + lazyComponent + "]" : "")
          );
        }
        return payload;
      }
    }
    switch (type) {
      case REACT_SUSPENSE_LIST_TYPE:
        return describeBuiltInComponentFrame("SuspenseList");
      case REACT_SUSPENSE_TYPE:
        return describeBuiltInComponentFrame("Suspense");
      case REACT_VIEW_TRANSITION_TYPE:
        return describeBuiltInComponentFrame("ViewTransition");
    }
    return "";
  }
  function getViewTransitionClassName(defaultClass, eventClass) {
    defaultClass =
      null == defaultClass || "string" === typeof defaultClass
        ? defaultClass
        : defaultClass.default;
    eventClass =
      null == eventClass || "string" === typeof eventClass
        ? eventClass
        : eventClass.default;
    return null == eventClass
      ? "auto" === defaultClass
        ? null
        : defaultClass
      : "auto" === eventClass
        ? null
        : eventClass;
  }
  function isEligibleForOutlining(request, boundary) {
    return (
      (500 < boundary.byteSize ||
        hasSuspenseyContent(boundary.contentState) ||
        boundary.defer) &&
      null === boundary.preamble
    );
  }
  function defaultErrorHandler(error) {
    "object" === typeof error &&
    null !== error &&
    "string" === typeof error.environmentName
      ? bindToConsole("error", [error], error.environmentName)()
      : console.error(error);
    return null;
  }
  function RequestInstance(
    resumableState,
    renderState,
    rootFormatContext,
    progressiveChunkSize,
    onError,
    onAllReady,
    onShellReady,
    onShellError,
    onFatalError,
    formState
  ) {
    var abortSet = new Set();
    this.destination = null;
    this.flushScheduled = !1;
    this.resumableState = resumableState;
    this.renderState = renderState;
    this.rootFormatContext = rootFormatContext;
    this.progressiveChunkSize =
      void 0 === progressiveChunkSize ? 12800 : progressiveChunkSize;
    this.status = 10;
    this.fatalError = null;
    this.pendingRootTasks = this.allPendingTasks = this.nextSegmentId = 0;
    this.completedPreambleSegments = this.completedRootSegment = null;
    this.byteSize = 0;
    this.abortableTasks = abortSet;
    this.pingedTasks = [];
    this.clientRenderedBoundaries = [];
    this.completedBoundaries = [];
    this.partialBoundaries = [];
    this.trackedPostpones = null;
    this.onError = void 0 === onError ? defaultErrorHandler : onError;
    this.onAllReady = void 0 === onAllReady ? noop : onAllReady;
    this.onShellReady = void 0 === onShellReady ? noop : onShellReady;
    this.onShellError = void 0 === onShellError ? noop : onShellError;
    this.onFatalError = void 0 === onFatalError ? noop : onFatalError;
    this.formState = void 0 === formState ? null : formState;
  }
  function createRequest(
    children,
    resumableState,
    renderState,
    rootFormatContext,
    progressiveChunkSize,
    onError,
    onAllReady,
    onShellReady,
    onShellError,
    onFatalError,
    formState
  ) {
    resumableState = new RequestInstance(
      resumableState,
      renderState,
      rootFormatContext,
      progressiveChunkSize,
      onError,
      onAllReady,
      onShellReady,
      onShellError,
      onFatalError,
      formState
    );
    renderState = createPendingSegment(
      resumableState,
      0,
      null,
      rootFormatContext,
      !1,
      !1
    );
    renderState.parentFlushed = !0;
    children = createRenderTask(
      resumableState,
      null,
      children,
      -1,
      null,
      renderState,
      null,
      null,
      resumableState.abortableTasks,
      null,
      rootFormatContext,
      null,
      emptyTreeContext,
      null,
      null
    );
    pushComponentStack(children);
    resumableState.pingedTasks.push(children);
    return resumableState;
  }
  function resumeRequest(
    children,
    postponedState,
    renderState,
    onError,
    onAllReady,
    onShellReady,
    onShellError,
    onFatalError
  ) {
    renderState = new RequestInstance(
      postponedState.resumableState,
      renderState,
      postponedState.rootFormatContext,
      postponedState.progressiveChunkSize,
      onError,
      onAllReady,
      onShellReady,
      onShellError,
      onFatalError,
      null
    );
    renderState.nextSegmentId = postponedState.nextSegmentId;
    if ("number" === typeof postponedState.replaySlots)
      return (
        (onError = createPendingSegment(
          renderState,
          0,
          null,
          postponedState.rootFormatContext,
          !1,
          !1
        )),
        (onError.parentFlushed = !0),
        (children = createRenderTask(
          renderState,
          null,
          children,
          -1,
          null,
          onError,
          null,
          null,
          renderState.abortableTasks,
          null,
          postponedState.rootFormatContext,
          null,
          emptyTreeContext,
          null,
          null
        )),
        pushComponentStack(children),
        renderState.pingedTasks.push(children),
        renderState
      );
    children = createReplayTask(
      renderState,
      null,
      {
        nodes: postponedState.replayNodes,
        slots: postponedState.replaySlots,
        pendingTasks: 0
      },
      children,
      -1,
      null,
      null,
      renderState.abortableTasks,
      null,
      postponedState.rootFormatContext,
      null,
      emptyTreeContext,
      null,
      null
    );
    pushComponentStack(children);
    renderState.pingedTasks.push(children);
    return renderState;
  }
  function pingTask(request, task) {
    request.pingedTasks.push(task);
    1 === request.pingedTasks.length &&
      ((request.flushScheduled = null !== request.destination),
      null !== request.trackedPostpones || 10 === request.status
        ? scheduleMicrotask(function () {
            return performWork(request);
          })
        : scheduleWork(function () {
            return performWork(request);
          }));
  }
  function createSuspenseBoundary(
    request,
    row,
    fallbackAbortableTasks,
    preamble,
    defer
  ) {
    fallbackAbortableTasks = {
      status: 0,
      rootSegmentID: -1,
      parentFlushed: !1,
      pendingTasks: 0,
      row: row,
      completedSegments: [],
      byteSize: 0,
      defer: defer,
      fallbackAbortableTasks: fallbackAbortableTasks,
      errorDigest: null,
      contentState: createHoistableState(),
      fallbackState: createHoistableState(),
      preamble: preamble,
      tracked: null
    };
    null !== row &&
      (row.pendingTasks++,
      (preamble = row.boundaries),
      null !== preamble &&
        (request.allPendingTasks++,
        fallbackAbortableTasks.pendingTasks++,
        preamble.push(fallbackAbortableTasks)),
      (request = row.inheritedHoistables),
      null !== request &&
        hoistHoistables(fallbackAbortableTasks.contentState, request));
    return fallbackAbortableTasks;
  }
  function createRenderTask(
    request,
    thenableState,
    node,
    childIndex,
    blockedBoundary,
    blockedSegment,
    blockedPreamble,
    hoistableState,
    abortSet,
    keyPath,
    formatContext,
    context,
    treeContext,
    row,
    componentStack
  ) {
    request.allPendingTasks++;
    null === blockedBoundary
      ? request.pendingRootTasks++
      : blockedBoundary.pendingTasks++;
    null !== row && row.pendingTasks++;
    var task = {
      replay: null,
      node: node,
      childIndex: childIndex,
      ping: function () {
        return pingTask(request, task);
      },
      blockedBoundary: blockedBoundary,
      blockedSegment: blockedSegment,
      blockedPreamble: blockedPreamble,
      hoistableState: hoistableState,
      abortSet: abortSet,
      keyPath: keyPath,
      formatContext: formatContext,
      context: context,
      treeContext: treeContext,
      row: row,
      componentStack: componentStack,
      thenableState: thenableState
    };
    abortSet.add(task);
    return task;
  }
  function createReplayTask(
    request,
    thenableState,
    replay,
    node,
    childIndex,
    blockedBoundary,
    hoistableState,
    abortSet,
    keyPath,
    formatContext,
    context,
    treeContext,
    row,
    componentStack
  ) {
    request.allPendingTasks++;
    null === blockedBoundary
      ? request.pendingRootTasks++
      : blockedBoundary.pendingTasks++;
    null !== row && row.pendingTasks++;
    replay.pendingTasks++;
    var task = {
      replay: replay,
      node: node,
      childIndex: childIndex,
      ping: function () {
        return pingTask(request, task);
      },
      blockedBoundary: blockedBoundary,
      blockedSegment: null,
      blockedPreamble: null,
      hoistableState: hoistableState,
      abortSet: abortSet,
      keyPath: keyPath,
      formatContext: formatContext,
      context: context,
      treeContext: treeContext,
      row: row,
      componentStack: componentStack,
      thenableState: thenableState
    };
    abortSet.add(task);
    return task;
  }
  function createPendingSegment(
    request,
    index,
    boundary,
    parentFormatContext,
    lastPushedText,
    textEmbedded
  ) {
    return {
      status: 0,
      parentFlushed: !1,
      id: -1,
      index: index,
      chunks: [],
      children: [],
      preambleChildren: [],
      parentFormatContext: parentFormatContext,
      boundary: boundary,
      lastPushedText: lastPushedText,
      textEmbedded: textEmbedded
    };
  }
  function pushComponentStack(task) {
    var node = task.node;
    if ("object" === typeof node && null !== node)
      switch (node.$$typeof) {
        case REACT_ELEMENT_TYPE:
          task.componentStack = {
            parent: task.componentStack,
            type: node.type
          };
      }
  }
  function replaceSuspenseComponentStackWithSuspenseFallbackStack(
    componentStack
  ) {
    return null === componentStack
      ? null
      : { parent: componentStack.parent, type: "Suspense Fallback" };
  }
  function getThrownInfo(node$jscomp$0) {
    var errorInfo = {};
    node$jscomp$0 &&
      Object.defineProperty(errorInfo, "componentStack", {
        configurable: !0,
        enumerable: !0,
        get: function () {
          try {
            var info = "",
              node = node$jscomp$0;
            do
              (info += describeComponentStackByType(node.type)),
                (node = node.parent);
            while (node);
            var JSCompiler_inline_result = info;
          } catch (x) {
            JSCompiler_inline_result =
              "\nError generating stack: " + x.message + "\n" + x.stack;
          }
          Object.defineProperty(errorInfo, "componentStack", {
            value: JSCompiler_inline_result
          });
          return JSCompiler_inline_result;
        }
      });
    return errorInfo;
  }
  function logRecoverableError(request, error, errorInfo) {
    request = request.onError;
    error = request(error, errorInfo);
    if (null == error || "string" === typeof error) return error;
  }
  function fatalError(request, error) {
    var onShellError = request.onShellError,
      onFatalError = request.onFatalError;
    onShellError(error);
    onFatalError(error);
    null !== request.destination
      ? ((request.status = 14), closeWithError(request.destination, error))
      : ((request.status = 13), (request.fatalError = error));
  }
  function finishSuspenseListRow(request, row) {
    unblockSuspenseListRow(request, row.next, row.hoistables);
  }
  function unblockSuspenseListRow(request, unblockedRow, inheritedHoistables) {
    for (; null !== unblockedRow; ) {
      null !== inheritedHoistables &&
        (hoistHoistables(unblockedRow.hoistables, inheritedHoistables),
        (unblockedRow.inheritedHoistables = inheritedHoistables));
      var unblockedBoundaries = unblockedRow.boundaries;
      if (null !== unblockedBoundaries) {
        unblockedRow.boundaries = null;
        for (var i = 0; i < unblockedBoundaries.length; i++) {
          var unblockedBoundary = unblockedBoundaries[i];
          null !== inheritedHoistables &&
            hoistHoistables(
              unblockedBoundary.contentState,
              inheritedHoistables
            );
          finishedTask(request, unblockedBoundary, null, null);
        }
      }
      unblockedRow.pendingTasks--;
      if (0 < unblockedRow.pendingTasks) break;
      inheritedHoistables = unblockedRow.hoistables;
      unblockedRow = unblockedRow.next;
    }
  }
  function tryToResolveTogetherRow(request, togetherRow) {
    var boundaries = togetherRow.boundaries;
    if (null !== boundaries && togetherRow.pendingTasks === boundaries.length) {
      for (
        var allCompleteAndInlinable = !0, i = 0;
        i < boundaries.length;
        i++
      ) {
        var rowBoundary = boundaries[i];
        if (
          1 !== rowBoundary.pendingTasks ||
          rowBoundary.parentFlushed ||
          isEligibleForOutlining(request, rowBoundary)
        ) {
          allCompleteAndInlinable = !1;
          break;
        }
      }
      allCompleteAndInlinable &&
        unblockSuspenseListRow(request, togetherRow, togetherRow.hoistables);
    }
  }
  function createSuspenseListRow(previousRow) {
    var newRow = {
      pendingTasks: 1,
      boundaries: null,
      hoistables: createHoistableState(),
      inheritedHoistables: null,
      together: !1,
      next: null
    };
    null !== previousRow &&
      0 < previousRow.pendingTasks &&
      (newRow.pendingTasks++,
      (newRow.boundaries = []),
      (previousRow.next = newRow));
    return newRow;
  }
  function renderSuspenseListRows(request, task, keyPath, rows, revealOrder) {
    var prevKeyPath = task.keyPath,
      prevTreeContext = task.treeContext,
      prevRow = task.row;
    task.keyPath = keyPath;
    keyPath = rows.length;
    var previousSuspenseListRow = null;
    if (null !== task.replay) {
      var resumeSlots = task.replay.slots;
      if (null !== resumeSlots && "object" === typeof resumeSlots)
        for (var n = 0; n < keyPath; n++) {
          var i =
              "backwards" !== revealOrder &&
              "unstable_legacy-backwards" !== revealOrder
                ? n
                : keyPath - 1 - n,
            node = rows[i];
          task.row = previousSuspenseListRow = createSuspenseListRow(
            previousSuspenseListRow
          );
          task.treeContext = pushTreeContext(prevTreeContext, keyPath, i);
          var resumeSegmentID = resumeSlots[i];
          "number" === typeof resumeSegmentID
            ? (resumeNode(request, task, resumeSegmentID, node, i),
              delete resumeSlots[i])
            : renderNode(request, task, node, i);
          0 === --previousSuspenseListRow.pendingTasks &&
            finishSuspenseListRow(request, previousSuspenseListRow);
        }
      else
        for (resumeSlots = 0; resumeSlots < keyPath; resumeSlots++)
          (n =
            "backwards" !== revealOrder &&
            "unstable_legacy-backwards" !== revealOrder
              ? resumeSlots
              : keyPath - 1 - resumeSlots),
            (i = rows[n]),
            (task.row = previousSuspenseListRow =
              createSuspenseListRow(previousSuspenseListRow)),
            (task.treeContext = pushTreeContext(prevTreeContext, keyPath, n)),
            renderNode(request, task, i, n),
            0 === --previousSuspenseListRow.pendingTasks &&
              finishSuspenseListRow(request, previousSuspenseListRow);
    } else if (
      "backwards" !== revealOrder &&
      "unstable_legacy-backwards" !== revealOrder
    )
      for (revealOrder = 0; revealOrder < keyPath; revealOrder++)
        (resumeSlots = rows[revealOrder]),
          (task.row = previousSuspenseListRow =
            createSuspenseListRow(previousSuspenseListRow)),
          (task.treeContext = pushTreeContext(
            prevTreeContext,
            keyPath,
            revealOrder
          )),
          renderNode(request, task, resumeSlots, revealOrder),
          0 === --previousSuspenseListRow.pendingTasks &&
            finishSuspenseListRow(request, previousSuspenseListRow);
    else {
      resumeSlots = task.blockedSegment;
      n = resumeSlots.children.length;
      i = resumeSlots.chunks.length;
      for (node = 0; node < keyPath; node++) {
        resumeSegmentID =
          "unstable_legacy-backwards" === revealOrder
            ? keyPath - 1 - node
            : node;
        var node$22 = rows[resumeSegmentID];
        task.row = previousSuspenseListRow = createSuspenseListRow(
          previousSuspenseListRow
        );
        task.treeContext = pushTreeContext(
          prevTreeContext,
          keyPath,
          resumeSegmentID
        );
        var newSegment = createPendingSegment(
          request,
          i,
          null,
          task.formatContext,
          0 === resumeSegmentID ? resumeSlots.lastPushedText : !0,
          !0
        );
        resumeSlots.children.splice(n, 0, newSegment);
        task.blockedSegment = newSegment;
        try {
          renderNode(request, task, node$22, resumeSegmentID),
            pushSegmentFinale(
              newSegment.chunks,
              request.renderState,
              newSegment.lastPushedText,
              newSegment.textEmbedded
            ),
            (newSegment.status = 1),
            finishedSegment(request, task.blockedBoundary, newSegment),
            0 === --previousSuspenseListRow.pendingTasks &&
              finishSuspenseListRow(request, previousSuspenseListRow);
        } catch (thrownValue) {
          throw (
            ((newSegment.status = 12 === request.status ? 3 : 4), thrownValue)
          );
        }
      }
      task.blockedSegment = resumeSlots;
      resumeSlots.lastPushedText = !1;
    }
    null !== prevRow &&
      null !== previousSuspenseListRow &&
      0 < previousSuspenseListRow.pendingTasks &&
      (prevRow.pendingTasks++, (previousSuspenseListRow.next = prevRow));
    task.treeContext = prevTreeContext;
    task.row = prevRow;
    task.keyPath = prevKeyPath;
  }
  function renderWithHooks(
    request,
    task,
    keyPath,
    Component,
    props,
    secondArg
  ) {
    var prevThenableState = task.thenableState;
    task.thenableState = null;
    currentlyRenderingComponent = {};
    currentlyRenderingTask = task;
    currentlyRenderingRequest = request;
    currentlyRenderingKeyPath = keyPath;
    actionStateCounter = localIdCounter = 0;
    actionStateMatchingIndex = -1;
    thenableIndexCounter = 0;
    thenableState = prevThenableState;
    for (request = Component(props, secondArg); didScheduleRenderPhaseUpdate; )
      (didScheduleRenderPhaseUpdate = !1),
        (actionStateCounter = localIdCounter = 0),
        (actionStateMatchingIndex = -1),
        (thenableIndexCounter = 0),
        (numberOfReRenders += 1),
        (workInProgressHook = null),
        (request = Component(props, secondArg));
    resetHooksState();
    return request;
  }
  function resolveClassComponentProps(Component, baseProps) {
    var newProps = baseProps;
    if ("ref" in baseProps) {
      newProps = {};
      for (var propName in baseProps)
        "ref" !== propName && (newProps[propName] = baseProps[propName]);
    }
    if ((Component = Component.defaultProps)) {
      newProps === baseProps && (newProps = assign({}, newProps, baseProps));
      for (var propName$30 in Component)
        void 0 === newProps[propName$30] &&
          (newProps[propName$30] = Component[propName$30]);
    }
    return newProps;
  }
  function finishFunctionComponent(
    request,
    task,
    keyPath,
    children,
    hasId,
    actionStateCount,
    actionStateMatchingIndex
  ) {
    var didEmitActionStateMarkers = !1;
    if (0 !== actionStateCount && null !== request.formState) {
      var segment = task.blockedSegment;
      if (null !== segment) {
        didEmitActionStateMarkers = !0;
        segment = segment.chunks;
        for (var i = 0; i < actionStateCount; i++)
          i === actionStateMatchingIndex
            ? pushFormStateMarkerIsMatching(segment)
            : pushFormStateMarkerIsNotMatching(segment);
      }
    }
    actionStateCount = task.keyPath;
    task.keyPath = keyPath;
    hasId
      ? ((keyPath = task.treeContext),
        (task.treeContext = pushTreeContext(keyPath, 1, 0)),
        renderNode(request, task, children, -1),
        (task.treeContext = keyPath))
      : didEmitActionStateMarkers
        ? renderNode(request, task, children, -1)
        : renderNodeDestructive(request, task, children, -1);
    task.keyPath = actionStateCount;
  }
  function renderElement(request, task, keyPath, type, props, ref) {
    if ("function" === typeof type)
      if (type.prototype && type.prototype.isReactComponent) {
        var resolvedProps = resolveClassComponentProps(type, props),
          context = emptyContextObject,
          contextType = type.contextType;
        "object" === typeof contextType &&
          null !== contextType &&
          (context = contextType._currentValue2);
        var JSCompiler_inline_result = new type(resolvedProps, context);
        var initialState =
          void 0 !== JSCompiler_inline_result.state
            ? JSCompiler_inline_result.state
            : null;
        JSCompiler_inline_result.updater = classComponentUpdater;
        JSCompiler_inline_result.props = resolvedProps;
        JSCompiler_inline_result.state = initialState;
        var internalInstance = { queue: [], replace: !1 };
        JSCompiler_inline_result._reactInternals = internalInstance;
        var contextType$jscomp$0 = type.contextType;
        JSCompiler_inline_result.context =
          "object" === typeof contextType$jscomp$0 &&
          null !== contextType$jscomp$0
            ? contextType$jscomp$0._currentValue2
            : emptyContextObject;
        var getDerivedStateFromProps = type.getDerivedStateFromProps;
        if ("function" === typeof getDerivedStateFromProps) {
          var partialState = getDerivedStateFromProps(
            resolvedProps,
            initialState
          );
          var JSCompiler_inline_result$jscomp$0 =
            null === partialState || void 0 === partialState
              ? initialState
              : assign({}, initialState, partialState);
          JSCompiler_inline_result.state = JSCompiler_inline_result$jscomp$0;
        }
        if (
          "function" !== typeof type.getDerivedStateFromProps &&
          "function" !==
            typeof JSCompiler_inline_result.getSnapshotBeforeUpdate &&
          ("function" ===
            typeof JSCompiler_inline_result.UNSAFE_componentWillMount ||
            "function" === typeof JSCompiler_inline_result.componentWillMount)
        ) {
          var oldState = JSCompiler_inline_result.state;
          "function" === typeof JSCompiler_inline_result.componentWillMount &&
            JSCompiler_inline_result.componentWillMount();
          "function" ===
            typeof JSCompiler_inline_result.UNSAFE_componentWillMount &&
            JSCompiler_inline_result.UNSAFE_componentWillMount();
          oldState !== JSCompiler_inline_result.state &&
            classComponentUpdater.enqueueReplaceState(
              JSCompiler_inline_result,
              JSCompiler_inline_result.state,
              null
            );
          if (
            null !== internalInstance.queue &&
            0 < internalInstance.queue.length
          ) {
            var oldQueue = internalInstance.queue,
              oldReplace = internalInstance.replace;
            internalInstance.queue = null;
            internalInstance.replace = !1;
            if (oldReplace && 1 === oldQueue.length)
              JSCompiler_inline_result.state = oldQueue[0];
            else {
              for (
                var nextState = oldReplace
                    ? oldQueue[0]
                    : JSCompiler_inline_result.state,
                  dontMutate = !0,
                  i = oldReplace ? 1 : 0;
                i < oldQueue.length;
                i++
              ) {
                var partial = oldQueue[i],
                  partialState$jscomp$0 =
                    "function" === typeof partial
                      ? partial.call(
                          JSCompiler_inline_result,
                          nextState,
                          resolvedProps,
                          void 0
                        )
                      : partial;
                null != partialState$jscomp$0 &&
                  (dontMutate
                    ? ((dontMutate = !1),
                      (nextState = assign(
                        {},
                        nextState,
                        partialState$jscomp$0
                      )))
                    : assign(nextState, partialState$jscomp$0));
              }
              JSCompiler_inline_result.state = nextState;
            }
          } else internalInstance.queue = null;
        }
        var nextChildren = JSCompiler_inline_result.render();
        if (12 === request.status) throw null;
        var prevKeyPath = task.keyPath;
        task.keyPath = keyPath;
        renderNodeDestructive(request, task, nextChildren, -1);
        task.keyPath = prevKeyPath;
      } else {
        var value = renderWithHooks(
          request,
          task,
          keyPath,
          type,
          props,
          void 0
        );
        if (12 === request.status) throw null;
        finishFunctionComponent(
          request,
          task,
          keyPath,
          value,
          0 !== localIdCounter,
          actionStateCounter,
          actionStateMatchingIndex
        );
      }
    else if ("string" === typeof type) {
      var segment = task.blockedSegment;
      if (null === segment) {
        var children = props.children,
          prevContext = task.formatContext,
          prevKeyPath$jscomp$0 = task.keyPath;
        task.formatContext = getChildFormatContext(prevContext, type, props);
        task.keyPath = keyPath;
        renderNode(request, task, children, -1);
        task.formatContext = prevContext;
        task.keyPath = prevKeyPath$jscomp$0;
      } else {
        var children$27 = pushStartInstance(
          segment.chunks,
          type,
          props,
          request.resumableState,
          request.renderState,
          task.blockedPreamble,
          task.hoistableState,
          task.formatContext,
          segment.lastPushedText
        );
        segment.lastPushedText = !1;
        var prevContext$28 = task.formatContext,
          prevKeyPath$29 = task.keyPath;
        task.keyPath = keyPath;
        var newContext = (task.formatContext = getChildFormatContext(
          prevContext$28,
          type,
          props
        ));
        if (isPreambleContext(newContext)) {
          var preambleSegment = createPendingSegment(
            request,
            0,
            null,
            task.formatContext,
            !1,
            !1
          );
          segment.preambleChildren.push(preambleSegment);
          task.blockedSegment = preambleSegment;
          try {
            (preambleSegment.status = 6),
              renderNode(request, task, children$27, -1),
              pushSegmentFinale(
                preambleSegment.chunks,
                request.renderState,
                preambleSegment.lastPushedText,
                preambleSegment.textEmbedded
              ),
              (preambleSegment.status = 1),
              finishedSegment(request, task.blockedBoundary, preambleSegment);
          } finally {
            task.blockedSegment = segment;
          }
        } else renderNode(request, task, children$27, -1);
        task.formatContext = prevContext$28;
        task.keyPath = prevKeyPath$29;
        pushEndInstance(
          segment.chunks,
          type,
          props,
          request.resumableState,
          prevContext$28
        );
        segment.lastPushedText = !1;
      }
    } else {
      switch (type) {
        case REACT_LEGACY_HIDDEN_TYPE:
        case REACT_STRICT_MODE_TYPE:
        case REACT_PROFILER_TYPE:
        case REACT_FRAGMENT_TYPE:
          var prevKeyPath$jscomp$1 = task.keyPath;
          task.keyPath = keyPath;
          renderNodeDestructive(request, task, props.children, -1);
          task.keyPath = prevKeyPath$jscomp$1;
          return;
        case REACT_ACTIVITY_TYPE:
          var segment$jscomp$0 = task.blockedSegment;
          if (null === segment$jscomp$0) {
            if ("hidden" !== props.mode) {
              var prevKeyPath$jscomp$2 = task.keyPath;
              task.keyPath = keyPath;
              renderNode(request, task, props.children, -1);
              task.keyPath = prevKeyPath$jscomp$2;
            }
          } else if ("hidden" !== props.mode) {
            pushStartActivityBoundary(
              segment$jscomp$0.chunks,
              request.renderState
            );
            segment$jscomp$0.lastPushedText = !1;
            var prevKeyPath$32 = task.keyPath;
            task.keyPath = keyPath;
            renderNode(request, task, props.children, -1);
            task.keyPath = prevKeyPath$32;
            pushEndActivityBoundary(
              segment$jscomp$0.chunks,
              request.renderState
            );
            segment$jscomp$0.lastPushedText = !1;
          }
          return;
        case REACT_SUSPENSE_LIST_TYPE:
          a: {
            var children$jscomp$0 = props.children,
              revealOrder = props.revealOrder;
            if ("independent" !== revealOrder && "together" !== revealOrder) {
              if (isArrayImpl(children$jscomp$0)) {
                renderSuspenseListRows(
                  request,
                  task,
                  keyPath,
                  children$jscomp$0,
                  revealOrder
                );
                break a;
              }
              var iteratorFn = getIteratorFn(children$jscomp$0);
              if (iteratorFn) {
                var iterator = iteratorFn.call(children$jscomp$0);
                if (iterator) {
                  var step = iterator.next();
                  if (!step.done) {
                    do step = iterator.next();
                    while (!step.done);
                    renderSuspenseListRows(
                      request,
                      task,
                      keyPath,
                      children$jscomp$0,
                      revealOrder
                    );
                  }
                  break a;
                }
              }
              if ("function" === typeof children$jscomp$0[ASYNC_ITERATOR]) {
                var iterator$23 = children$jscomp$0[ASYNC_ITERATOR]();
                if (iterator$23) {
                  var prevThenableState = task.thenableState;
                  task.thenableState = null;
                  thenableIndexCounter = 0;
                  thenableState = prevThenableState;
                  var rows = [],
                    done = !1;
                  if (iterator$23 === children$jscomp$0)
                    for (
                      var step$24 = readPreviousThenableFromState();
                      void 0 !== step$24;

                    ) {
                      if (step$24.done) {
                        done = !0;
                        break;
                      }
                      rows.push(step$24.value);
                      step$24 = readPreviousThenableFromState();
                    }
                  if (!done)
                    for (
                      var step$25 = unwrapThenable(iterator$23.next());
                      !step$25.done;

                    )
                      rows.push(step$25.value),
                        (step$25 = unwrapThenable(iterator$23.next()));
                  renderSuspenseListRows(
                    request,
                    task,
                    keyPath,
                    rows,
                    revealOrder
                  );
                  break a;
                }
              }
            }
            if ("together" === revealOrder) {
              var prevKeyPath$26 = task.keyPath,
                prevRow = task.row,
                newRow = (task.row = createSuspenseListRow(null));
              newRow.boundaries = [];
              newRow.together = !0;
              task.keyPath = keyPath;
              renderNodeDestructive(request, task, children$jscomp$0, -1);
              0 === --newRow.pendingTasks &&
                finishSuspenseListRow(request, newRow);
              task.keyPath = prevKeyPath$26;
              task.row = prevRow;
              null !== prevRow &&
                0 < newRow.pendingTasks &&
                (prevRow.pendingTasks++, (newRow.next = prevRow));
            } else {
              var prevKeyPath$jscomp$3 = task.keyPath;
              task.keyPath = keyPath;
              renderNodeDestructive(request, task, children$jscomp$0, -1);
              task.keyPath = prevKeyPath$jscomp$3;
            }
          }
          return;
        case REACT_VIEW_TRANSITION_TYPE:
          var prevContext$jscomp$0 = task.formatContext,
            prevKeyPath$jscomp$4 = task.keyPath;
          var resumableState = request.resumableState;
          if (null != props.name && "auto" !== props.name)
            var JSCompiler_inline_result$jscomp$1 = props.name;
          else {
            var treeId = getTreeId(task.treeContext);
            JSCompiler_inline_result$jscomp$1 = makeId(
              resumableState,
              treeId,
              0
            );
          }
          var autoName = JSCompiler_inline_result$jscomp$1;
          task.formatContext = getViewTransitionFormatContext(
            request.resumableState,
            prevContext$jscomp$0,
            getViewTransitionClassName(props.default, props.update),
            getViewTransitionClassName(props.default, props.enter),
            getViewTransitionClassName(props.default, props.exit),
            getViewTransitionClassName(props.default, props.share),
            props.name,
            autoName
          );
          task.keyPath = keyPath;
          if (null != props.name && "auto" !== props.name)
            renderNodeDestructive(request, task, props.children, -1);
          else {
            var prevTreeContext = task.treeContext;
            task.treeContext = pushTreeContext(prevTreeContext, 1, 0);
            renderNode(request, task, props.children, -1);
            task.treeContext = prevTreeContext;
          }
          task.formatContext = prevContext$jscomp$0;
          task.keyPath = prevKeyPath$jscomp$4;
          return;
        case REACT_SCOPE_TYPE:
          throw Error("ReactDOMServer does not yet support scope components.");
        case REACT_SUSPENSE_TYPE:
          a: if (null !== task.replay) {
            var prevKeyPath$9 = task.keyPath,
              prevContext$10 = task.formatContext,
              prevRow$11 = task.row;
            task.keyPath = keyPath;
            task.formatContext = getSuspenseContentFormatContext(
              request.resumableState,
              prevContext$10
            );
            task.row = null;
            var content$12 = props.children;
            try {
              renderNode(request, task, content$12, -1);
            } finally {
              (task.keyPath = prevKeyPath$9),
                (task.formatContext = prevContext$10),
                (task.row = prevRow$11);
            }
          } else {
            var prevKeyPath$jscomp$5 = task.keyPath,
              prevContext$jscomp$1 = task.formatContext,
              prevRow$jscomp$0 = task.row,
              parentBoundary = task.blockedBoundary,
              parentPreamble = task.blockedPreamble,
              parentHoistableState = task.hoistableState,
              parentSegment = task.blockedSegment,
              fallback = props.fallback,
              content = props.children,
              defer = !0 === props.defer,
              fallbackAbortSet = new Set(),
              newBoundary = createSuspenseBoundary(
                request,
                task.row,
                fallbackAbortSet,
                canHavePreamble(task.formatContext)
                  ? {
                      content: createPreambleState(),
                      fallback: createPreambleState()
                    }
                  : null,
                defer
              ),
              boundarySegment = createPendingSegment(
                request,
                parentSegment.chunks.length,
                newBoundary,
                task.formatContext,
                !1,
                !1
              );
            parentSegment.children.push(boundarySegment);
            parentSegment.lastPushedText = !1;
            var contentRootSegment = createPendingSegment(
              request,
              0,
              null,
              task.formatContext,
              !1,
              !1
            );
            contentRootSegment.parentFlushed = !0;
            var trackedPostpones = request.trackedPostpones;
            if (null !== trackedPostpones || defer) {
              var suspenseComponentStack = task.componentStack,
                fallbackKeyPath = [keyPath[0], "Suspense Fallback", keyPath[2]];
              if (null !== trackedPostpones) {
                var fallbackReplayNode = [
                  fallbackKeyPath[1],
                  fallbackKeyPath[2],
                  [],
                  null
                ];
                trackedPostpones.workingMap.set(
                  fallbackKeyPath,
                  fallbackReplayNode
                );
                newBoundary.tracked = {
                  contentKeyPath: keyPath,
                  fallbackNode: fallbackReplayNode
                };
              }
              task.blockedSegment = boundarySegment;
              task.blockedPreamble =
                null === newBoundary.preamble
                  ? null
                  : newBoundary.preamble.fallback;
              task.keyPath = fallbackKeyPath;
              task.formatContext = getSuspenseFallbackFormatContext(
                request.resumableState,
                prevContext$jscomp$1
              );
              task.componentStack =
                replaceSuspenseComponentStackWithSuspenseFallbackStack(
                  suspenseComponentStack
                );
              boundarySegment.status = 6;
              try {
                renderNode(request, task, fallback, -1),
                  pushSegmentFinale(
                    boundarySegment.chunks,
                    request.renderState,
                    boundarySegment.lastPushedText,
                    boundarySegment.textEmbedded
                  ),
                  (boundarySegment.status = 1),
                  finishedSegment(request, parentBoundary, boundarySegment);
              } catch (thrownValue) {
                throw (
                  ((boundarySegment.status = 12 === request.status ? 3 : 4),
                  thrownValue)
                );
              } finally {
                (task.blockedSegment = parentSegment),
                  (task.blockedPreamble = parentPreamble),
                  (task.keyPath = prevKeyPath$jscomp$5),
                  (task.formatContext = prevContext$jscomp$1);
              }
              var suspendedPrimaryTask = createRenderTask(
                request,
                null,
                content,
                -1,
                newBoundary,
                contentRootSegment,
                null === newBoundary.preamble
                  ? null
                  : newBoundary.preamble.content,
                newBoundary.contentState,
                task.abortSet,
                keyPath,
                getSuspenseContentFormatContext(
                  request.resumableState,
                  task.formatContext
                ),
                task.context,
                task.treeContext,
                null,
                suspenseComponentStack
              );
              pushComponentStack(suspendedPrimaryTask);
              request.pingedTasks.push(suspendedPrimaryTask);
            } else {
              task.blockedBoundary = newBoundary;
              task.blockedPreamble =
                null === newBoundary.preamble
                  ? null
                  : newBoundary.preamble.content;
              task.hoistableState = newBoundary.contentState;
              task.blockedSegment = contentRootSegment;
              task.keyPath = keyPath;
              task.formatContext = getSuspenseContentFormatContext(
                request.resumableState,
                prevContext$jscomp$1
              );
              task.row = null;
              contentRootSegment.status = 6;
              try {
                if (
                  (renderNode(request, task, content, -1),
                  pushSegmentFinale(
                    contentRootSegment.chunks,
                    request.renderState,
                    contentRootSegment.lastPushedText,
                    contentRootSegment.textEmbedded
                  ),
                  (contentRootSegment.status = 1),
                  finishedSegment(request, newBoundary, contentRootSegment),
                  queueCompletedSegment(newBoundary, contentRootSegment),
                  0 === newBoundary.pendingTasks && 0 === newBoundary.status)
                ) {
                  if (
                    ((newBoundary.status = 1),
                    !isEligibleForOutlining(request, newBoundary))
                  ) {
                    null !== prevRow$jscomp$0 &&
                      0 === --prevRow$jscomp$0.pendingTasks &&
                      finishSuspenseListRow(request, prevRow$jscomp$0);
                    0 === request.pendingRootTasks &&
                      task.blockedPreamble &&
                      preparePreamble(request);
                    break a;
                  }
                } else
                  null !== prevRow$jscomp$0 &&
                    prevRow$jscomp$0.together &&
                    tryToResolveTogetherRow(request, prevRow$jscomp$0);
              } catch (thrownValue$13) {
                newBoundary.status = 4;
                if (12 === request.status) {
                  contentRootSegment.status = 3;
                  var error = request.fatalError;
                } else
                  (contentRootSegment.status = 4), (error = thrownValue$13);
                var thrownInfo = getThrownInfo(task.componentStack),
                  errorDigest = logRecoverableError(request, error, thrownInfo);
                newBoundary.errorDigest = errorDigest;
                untrackBoundary(request, newBoundary);
              } finally {
                (task.blockedBoundary = parentBoundary),
                  (task.blockedPreamble = parentPreamble),
                  (task.hoistableState = parentHoistableState),
                  (task.blockedSegment = parentSegment),
                  (task.keyPath = prevKeyPath$jscomp$5),
                  (task.formatContext = prevContext$jscomp$1),
                  (task.row = prevRow$jscomp$0);
              }
              var suspendedFallbackTask = createRenderTask(
                request,
                null,
                fallback,
                -1,
                parentBoundary,
                boundarySegment,
                null === newBoundary.preamble
                  ? null
                  : newBoundary.preamble.fallback,
                newBoundary.fallbackState,
                fallbackAbortSet,
                [keyPath[0], "Suspense Fallback", keyPath[2]],
                getSuspenseFallbackFormatContext(
                  request.resumableState,
                  task.formatContext
                ),
                task.context,
                task.treeContext,
                task.row,
                replaceSuspenseComponentStackWithSuspenseFallbackStack(
                  task.componentStack
                )
              );
              pushComponentStack(suspendedFallbackTask);
              request.pingedTasks.push(suspendedFallbackTask);
            }
          }
          return;
      }
      if ("object" === typeof type && null !== type)
        switch (type.$$typeof) {
          case REACT_FORWARD_REF_TYPE:
            if ("ref" in props) {
              var propsWithoutRef = {};
              for (var key in props)
                "ref" !== key && (propsWithoutRef[key] = props[key]);
            } else propsWithoutRef = props;
            var children$jscomp$1 = renderWithHooks(
              request,
              task,
              keyPath,
              type.render,
              propsWithoutRef,
              ref
            );
            finishFunctionComponent(
              request,
              task,
              keyPath,
              children$jscomp$1,
              0 !== localIdCounter,
              actionStateCounter,
              actionStateMatchingIndex
            );
            return;
          case REACT_MEMO_TYPE:
            renderElement(request, task, keyPath, type.type, props, ref);
            return;
          case REACT_CONTEXT_TYPE:
            var children$jscomp$2 = props.children,
              prevKeyPath$jscomp$6 = task.keyPath,
              nextValue = props.value;
            var prevValue = type._currentValue2;
            type._currentValue2 = nextValue;
            var prevNode = currentActiveSnapshot,
              newNode = {
                parent: prevNode,
                depth: null === prevNode ? 0 : prevNode.depth + 1,
                context: type,
                parentValue: prevValue,
                value: nextValue
              };
            currentActiveSnapshot = newNode;
            task.context = newNode;
            task.keyPath = keyPath;
            renderNodeDestructive(request, task, children$jscomp$2, -1);
            var prevSnapshot = currentActiveSnapshot;
            if (null === prevSnapshot)
              throw Error(
                "Tried to pop a Context at the root of the app. This is a bug in React."
              );
            prevSnapshot.context._currentValue2 = prevSnapshot.parentValue;
            var JSCompiler_inline_result$jscomp$2 = (currentActiveSnapshot =
              prevSnapshot.parent);
            task.context = JSCompiler_inline_result$jscomp$2;
            task.keyPath = prevKeyPath$jscomp$6;
            return;
          case REACT_CONSUMER_TYPE:
            var render = props.children,
              newChildren = render(type._context._currentValue2),
              prevKeyPath$jscomp$7 = task.keyPath;
            task.keyPath = keyPath;
            renderNodeDestructive(request, task, newChildren, -1);
            task.keyPath = prevKeyPath$jscomp$7;
            return;
          case REACT_LAZY_TYPE:
            var init = type._init;
            var Component = init(type._payload);
            if (12 === request.status) throw null;
            renderElement(request, task, keyPath, Component, props, ref);
            return;
        }
      throw Error(
        "Element type is invalid: expected a string (for built-in components) or a class/function (for composite components) but got: " +
          ((null == type ? type : typeof type) + ".")
      );
    }
  }
  function resumeNode(request, task, segmentId, node, childIndex) {
    var prevReplay = task.replay,
      blockedBoundary = task.blockedBoundary,
      resumedSegment = createPendingSegment(
        request,
        0,
        null,
        task.formatContext,
        !1,
        !1
      );
    resumedSegment.id = segmentId;
    resumedSegment.parentFlushed = !0;
    try {
      (task.replay = null),
        (task.blockedSegment = resumedSegment),
        renderNode(request, task, node, childIndex),
        (resumedSegment.status = 1),
        finishedSegment(request, blockedBoundary, resumedSegment),
        null === blockedBoundary
          ? (request.completedRootSegment = resumedSegment)
          : (queueCompletedSegment(blockedBoundary, resumedSegment),
            blockedBoundary.parentFlushed &&
              request.partialBoundaries.push(blockedBoundary));
    } finally {
      (task.replay = prevReplay), (task.blockedSegment = null);
    }
  }
  function renderNodeDestructive(request, task, node, childIndex) {
    null !== task.replay && "number" === typeof task.replay.slots
      ? resumeNode(request, task, task.replay.slots, node, childIndex)
      : ((task.node = node),
        (task.childIndex = childIndex),
        (node = task.componentStack),
        pushComponentStack(task),
        retryNode(request, task),
        (task.componentStack = node));
  }
  function retryNode(request, task) {
    var node = task.node,
      childIndex = task.childIndex;
    if (null !== node) {
      if ("object" === typeof node) {
        switch (node.$$typeof) {
          case REACT_ELEMENT_TYPE:
            var type = node.type,
              key = node.key,
              props = node.props;
            node = props.ref;
            var ref = void 0 !== node ? node : null,
              name = getComponentNameFromType(type),
              keyOrIndex =
                null == key || key === REACT_OPTIMISTIC_KEY
                  ? -1 === childIndex
                    ? 0
                    : childIndex
                  : key;
            key = [task.keyPath, name, keyOrIndex];
            if (null !== task.replay)
              a: {
                var replay = task.replay;
                childIndex = replay.nodes;
                for (node = 0; node < childIndex.length; node++) {
                  var node$jscomp$0 = childIndex[node];
                  if (keyOrIndex === node$jscomp$0[1]) {
                    if (4 === node$jscomp$0.length) {
                      if (null !== name && name !== node$jscomp$0[0])
                        throw Error(
                          "Expected the resume to render <" +
                            node$jscomp$0[0] +
                            "> in this slot but instead it rendered <" +
                            name +
                            ">. The tree doesn't match so React will fallback to client rendering."
                        );
                      var childNodes = node$jscomp$0[2],
                        childSlots = node$jscomp$0[3];
                      name = task.node;
                      task.replay = {
                        nodes: childNodes,
                        slots: childSlots,
                        pendingTasks: 1
                      };
                      try {
                        renderElement(request, task, key, type, props, ref);
                        if (
                          1 === task.replay.pendingTasks &&
                          0 < task.replay.nodes.length
                        )
                          throw Error(
                            "Couldn't find all resumable slots by key/index during replaying. The tree doesn't match so React will fallback to client rendering."
                          );
                        task.replay.pendingTasks--;
                      } catch (x) {
                        if (
                          "object" === typeof x &&
                          null !== x &&
                          (x === SuspenseException ||
                            "function" === typeof x.then)
                        )
                          throw (
                            (task.node === name
                              ? (task.replay = replay)
                              : childIndex.splice(node, 1),
                            x)
                          );
                        task.replay.pendingTasks--;
                        props = getThrownInfo(task.componentStack);
                        key = task.blockedBoundary;
                        type = x;
                        props = logRecoverableError(request, type, props);
                        abortRemainingReplayNodes(
                          request,
                          key,
                          childNodes,
                          childSlots,
                          type,
                          props
                        );
                      }
                      task.replay = replay;
                    } else {
                      if (type !== REACT_SUSPENSE_TYPE)
                        throw Error(
                          "Expected the resume to render <Suspense> in this slot but instead it rendered <" +
                            (getComponentNameFromType(type) || "Unknown") +
                            ">. The tree doesn't match so React will fallback to client rendering."
                        );
                      b: {
                        replay = node$jscomp$0[5];
                        type = node$jscomp$0[2];
                        ref = node$jscomp$0[3];
                        name =
                          null === node$jscomp$0[4] ? [] : node$jscomp$0[4][2];
                        node$jscomp$0 =
                          null === node$jscomp$0[4]
                            ? null
                            : node$jscomp$0[4][3];
                        keyOrIndex = task.keyPath;
                        var prevContext = task.formatContext,
                          prevRow = task.row,
                          previousReplaySet = task.replay,
                          parentBoundary = task.blockedBoundary,
                          parentHoistableState = task.hoistableState,
                          content = props.children,
                          fallback = props.fallback,
                          defer = !0 === props.defer;
                        props = new Set();
                        defer = createSuspenseBoundary(
                          request,
                          task.row,
                          props,
                          canHavePreamble(task.formatContext)
                            ? {
                                content: createPreambleState(),
                                fallback: createPreambleState()
                              }
                            : null,
                          defer
                        );
                        defer.parentFlushed = !0;
                        defer.rootSegmentID = replay;
                        task.blockedBoundary = defer;
                        task.hoistableState = defer.contentState;
                        task.keyPath = key;
                        task.formatContext = getSuspenseContentFormatContext(
                          request.resumableState,
                          prevContext
                        );
                        task.row = null;
                        task.replay = {
                          nodes: type,
                          slots: ref,
                          pendingTasks: 1
                        };
                        try {
                          renderNode(request, task, content, -1);
                          if (
                            1 === task.replay.pendingTasks &&
                            0 < task.replay.nodes.length
                          )
                            throw Error(
                              "Couldn't find all resumable slots by key/index during replaying. The tree doesn't match so React will fallback to client rendering."
                            );
                          task.replay.pendingTasks--;
                          if (0 === defer.pendingTasks && 0 === defer.status) {
                            defer.status = 1;
                            request.completedBoundaries.push(defer);
                            break b;
                          }
                        } catch (error) {
                          (defer.status = 4),
                            (childNodes = getThrownInfo(task.componentStack)),
                            (childSlots = logRecoverableError(
                              request,
                              error,
                              childNodes
                            )),
                            (defer.errorDigest = childSlots),
                            task.replay.pendingTasks--,
                            request.clientRenderedBoundaries.push(defer);
                        } finally {
                          (task.blockedBoundary = parentBoundary),
                            (task.hoistableState = parentHoistableState),
                            (task.replay = previousReplaySet),
                            (task.keyPath = keyOrIndex),
                            (task.formatContext = prevContext),
                            (task.row = prevRow);
                        }
                        task = createReplayTask(
                          request,
                          null,
                          {
                            nodes: name,
                            slots: node$jscomp$0,
                            pendingTasks: 0
                          },
                          fallback,
                          -1,
                          parentBoundary,
                          defer.fallbackState,
                          props,
                          [key[0], "Suspense Fallback", key[2]],
                          getSuspenseFallbackFormatContext(
                            request.resumableState,
                            task.formatContext
                          ),
                          task.context,
                          task.treeContext,
                          task.row,
                          replaceSuspenseComponentStackWithSuspenseFallbackStack(
                            task.componentStack
                          )
                        );
                        pushComponentStack(task);
                        request.pingedTasks.push(task);
                      }
                    }
                    childIndex.splice(node, 1);
                    break a;
                  }
                }
              }
            else renderElement(request, task, key, type, props, ref);
            return;
          case REACT_PORTAL_TYPE:
            throw Error(
              "Portals are not currently supported by the server renderer. Render them conditionally so that they only appear on the client render."
            );
          case REACT_LAZY_TYPE:
            childNodes = node._init;
            node = childNodes(node._payload);
            if (12 === request.status) throw null;
            renderNodeDestructive(request, task, node, childIndex);
            return;
        }
        if (isArrayImpl(node)) {
          renderChildrenArray(request, task, node, childIndex);
          return;
        }
        if ((childNodes = getIteratorFn(node)))
          if ((childNodes = childNodes.call(node))) {
            node = childNodes.next();
            if (!node.done) {
              childSlots = [];
              do childSlots.push(node.value), (node = childNodes.next());
              while (!node.done);
              renderChildrenArray(request, task, childSlots, childIndex);
            }
            return;
          }
        if (
          "function" === typeof node[ASYNC_ITERATOR] &&
          (childNodes = node[ASYNC_ITERATOR]())
        ) {
          childSlots = task.thenableState;
          task.thenableState = null;
          thenableIndexCounter = 0;
          thenableState = childSlots;
          childSlots = [];
          props = !1;
          if (childNodes === node)
            for (node = readPreviousThenableFromState(); void 0 !== node; ) {
              if (node.done) {
                props = !0;
                break;
              }
              childSlots.push(node.value);
              node = readPreviousThenableFromState();
            }
          if (!props)
            for (node = unwrapThenable(childNodes.next()); !node.done; )
              childSlots.push(node.value),
                (node = unwrapThenable(childNodes.next()));
          renderChildrenArray(request, task, childSlots, childIndex);
          return;
        }
        if ("function" === typeof node.then)
          return (
            (task.thenableState = null),
            renderNodeDestructive(
              request,
              task,
              unwrapThenable(node),
              childIndex
            )
          );
        if (node.$$typeof === REACT_CONTEXT_TYPE)
          return renderNodeDestructive(
            request,
            task,
            node._currentValue2,
            childIndex
          );
        childIndex = Object.prototype.toString.call(node);
        throw Error(
          "Objects are not valid as a React child (found: " +
            ("[object Object]" === childIndex
              ? "object with keys {" + Object.keys(node).join(", ") + "}"
              : childIndex) +
            "). If you meant to render a collection of children, use an array instead."
        );
      }
      if ("string" === typeof node)
        (childIndex = task.blockedSegment),
          null !== childIndex &&
            (childIndex.lastPushedText = pushTextInstance(
              childIndex.chunks,
              node,
              request.renderState,
              childIndex.lastPushedText
            ));
      else if ("number" === typeof node || "bigint" === typeof node)
        (childIndex = task.blockedSegment),
          null !== childIndex &&
            (childIndex.lastPushedText = pushTextInstance(
              childIndex.chunks,
              "" + node,
              request.renderState,
              childIndex.lastPushedText
            ));
    }
  }
  function renderChildrenArray(request, task, children, childIndex) {
    var prevKeyPath = task.keyPath;
    if (
      -1 !== childIndex &&
      ((task.keyPath = [task.keyPath, "Fragment", childIndex]),
      null !== task.replay)
    ) {
      for (
        var replay = task.replay, replayNodes = replay.nodes, j = 0;
        j < replayNodes.length;
        j++
      ) {
        var node = replayNodes[j];
        if (node[1] === childIndex) {
          childIndex = node[2];
          node = node[3];
          task.replay = { nodes: childIndex, slots: node, pendingTasks: 1 };
          try {
            renderChildrenArray(request, task, children, -1);
            if (1 === task.replay.pendingTasks && 0 < task.replay.nodes.length)
              throw Error(
                "Couldn't find all resumable slots by key/index during replaying. The tree doesn't match so React will fallback to client rendering."
              );
            task.replay.pendingTasks--;
          } catch (x) {
            if (
              "object" === typeof x &&
              null !== x &&
              (x === SuspenseException || "function" === typeof x.then)
            )
              throw x;
            task.replay.pendingTasks--;
            children = getThrownInfo(task.componentStack);
            var boundary = task.blockedBoundary,
              error = x;
            children = logRecoverableError(request, error, children);
            abortRemainingReplayNodes(
              request,
              boundary,
              childIndex,
              node,
              error,
              children
            );
          }
          task.replay = replay;
          replayNodes.splice(j, 1);
          break;
        }
      }
      task.keyPath = prevKeyPath;
      return;
    }
    replay = task.treeContext;
    replayNodes = children.length;
    if (
      null !== task.replay &&
      ((j = task.replay.slots), null !== j && "object" === typeof j)
    ) {
      for (childIndex = 0; childIndex < replayNodes; childIndex++)
        (node = children[childIndex]),
          (task.treeContext = pushTreeContext(replay, replayNodes, childIndex)),
          (boundary = j[childIndex]),
          "number" === typeof boundary
            ? (resumeNode(request, task, boundary, node, childIndex),
              delete j[childIndex])
            : renderNode(request, task, node, childIndex);
      task.treeContext = replay;
      task.keyPath = prevKeyPath;
      return;
    }
    for (j = 0; j < replayNodes; j++)
      (childIndex = children[j]),
        (task.treeContext = pushTreeContext(replay, replayNodes, j)),
        renderNode(request, task, childIndex, j);
    task.treeContext = replay;
    task.keyPath = prevKeyPath;
  }
  function trackPostponedBoundary(request, trackedPostpones, boundary) {
    boundary.status = 5;
    boundary.rootSegmentID = request.nextSegmentId++;
    var tracked = boundary.tracked;
    if (null === tracked)
      throw Error(
        "It should not be possible to postpone at the root. This is a bug in React."
      );
    request = tracked.contentKeyPath;
    if (null === request)
      throw Error(
        "It should not be possible to postpone at the root. This is a bug in React."
      );
    tracked = tracked.fallbackNode;
    var children = [],
      boundaryNode = trackedPostpones.workingMap.get(request);
    if (void 0 === boundaryNode)
      return (
        (boundary = [
          request[1],
          request[2],
          children,
          null,
          tracked,
          boundary.rootSegmentID
        ]),
        trackedPostpones.workingMap.set(request, boundary),
        addToReplayParent(boundary, request[0], trackedPostpones),
        boundary
      );
    boundaryNode[4] = tracked;
    boundaryNode[5] = boundary.rootSegmentID;
    return boundaryNode;
  }
  function trackPostpone(request, trackedPostpones, task, segment) {
    segment.status = 5;
    var keyPath = task.keyPath,
      boundary = task.blockedBoundary;
    if (null === boundary)
      (segment.id = request.nextSegmentId++),
        (trackedPostpones.rootSlots = segment.id),
        null !== request.completedRootSegment &&
          (request.completedRootSegment.status = 5);
    else {
      if (null !== boundary && 0 === boundary.status) {
        var boundaryNode = trackPostponedBoundary(
          request,
          trackedPostpones,
          boundary
        );
        if (
          null !== boundary.tracked &&
          boundary.tracked.contentKeyPath === keyPath &&
          -1 === task.childIndex
        ) {
          -1 === segment.id &&
            (segment.id = segment.parentFlushed
              ? boundary.rootSegmentID
              : request.nextSegmentId++);
          boundaryNode[3] = segment.id;
          return;
        }
      }
      -1 === segment.id &&
        (segment.id =
          segment.parentFlushed && null !== boundary
            ? boundary.rootSegmentID
            : request.nextSegmentId++);
      if (-1 === task.childIndex)
        null === keyPath
          ? (trackedPostpones.rootSlots = segment.id)
          : ((task = trackedPostpones.workingMap.get(keyPath)),
            void 0 === task
              ? ((task = [keyPath[1], keyPath[2], [], segment.id]),
                addToReplayParent(task, keyPath[0], trackedPostpones))
              : (task[3] = segment.id));
      else {
        if (null === keyPath)
          if (((request = trackedPostpones.rootSlots), null === request))
            request = trackedPostpones.rootSlots = {};
          else {
            if ("number" === typeof request)
              throw Error(
                "It should not be possible to postpone both at the root of an element as well as a slot below. This is a bug in React."
              );
          }
        else if (
          ((boundary = trackedPostpones.workingMap),
          (boundaryNode = boundary.get(keyPath)),
          void 0 === boundaryNode)
        )
          (request = {}),
            (boundaryNode = [keyPath[1], keyPath[2], [], request]),
            boundary.set(keyPath, boundaryNode),
            addToReplayParent(boundaryNode, keyPath[0], trackedPostpones);
        else if (((request = boundaryNode[3]), null === request))
          request = boundaryNode[3] = {};
        else if ("number" === typeof request)
          throw Error(
            "It should not be possible to postpone both at the root of an element as well as a slot below. This is a bug in React."
          );
        request[task.childIndex] = segment.id;
      }
    }
  }
  function untrackBoundary(request, boundary) {
    request = request.trackedPostpones;
    null !== request &&
      ((boundary = boundary.tracked),
      null !== boundary &&
        ((boundary = boundary.contentKeyPath),
        null !== boundary &&
          ((request = request.workingMap.get(boundary)),
          void 0 !== request &&
            ((request.length = 4), (request[2] = []), (request[3] = null)))));
  }
  function spawnNewSuspendedReplayTask(request, task, thenableState) {
    return createReplayTask(
      request,
      thenableState,
      task.replay,
      task.node,
      task.childIndex,
      task.blockedBoundary,
      task.hoistableState,
      task.abortSet,
      task.keyPath,
      task.formatContext,
      task.context,
      task.treeContext,
      task.row,
      task.componentStack
    );
  }
  function spawnNewSuspendedRenderTask(request, task, thenableState) {
    var segment = task.blockedSegment,
      newSegment = createPendingSegment(
        request,
        segment.chunks.length,
        null,
        task.formatContext,
        segment.lastPushedText,
        !0
      );
    segment.children.push(newSegment);
    segment.lastPushedText = !1;
    return createRenderTask(
      request,
      thenableState,
      task.node,
      task.childIndex,
      task.blockedBoundary,
      newSegment,
      task.blockedPreamble,
      task.hoistableState,
      task.abortSet,
      task.keyPath,
      task.formatContext,
      task.context,
      task.treeContext,
      task.row,
      task.componentStack
    );
  }
  function renderNode(request, task, node, childIndex) {
    var previousFormatContext = task.formatContext,
      previousContext = task.context,
      previousKeyPath = task.keyPath,
      previousTreeContext = task.treeContext,
      previousComponentStack = task.componentStack,
      segment = task.blockedSegment;
    if (null === segment) {
      segment = task.replay;
      try {
        return renderNodeDestructive(request, task, node, childIndex);
      } catch (thrownValue) {
        if (
          (resetHooksState(),
          (node =
            thrownValue === SuspenseException
              ? getSuspendedThenable()
              : thrownValue),
          12 !== request.status && "object" === typeof node && null !== node)
        ) {
          if ("function" === typeof node.then) {
            childIndex =
              thrownValue === SuspenseException
                ? getThenableStateAfterSuspending()
                : null;
            request = spawnNewSuspendedReplayTask(
              request,
              task,
              childIndex
            ).ping;
            node.then(request, request);
            task.formatContext = previousFormatContext;
            task.context = previousContext;
            task.keyPath = previousKeyPath;
            task.treeContext = previousTreeContext;
            task.componentStack = previousComponentStack;
            task.replay = segment;
            switchContext(previousContext);
            return;
          }
          if ("Maximum call stack size exceeded" === node.message) {
            node =
              thrownValue === SuspenseException
                ? getThenableStateAfterSuspending()
                : null;
            node = spawnNewSuspendedReplayTask(request, task, node);
            request.pingedTasks.push(node);
            task.formatContext = previousFormatContext;
            task.context = previousContext;
            task.keyPath = previousKeyPath;
            task.treeContext = previousTreeContext;
            task.componentStack = previousComponentStack;
            task.replay = segment;
            switchContext(previousContext);
            return;
          }
        }
      }
    } else {
      var childrenLength = segment.children.length,
        chunkLength = segment.chunks.length;
      try {
        return renderNodeDestructive(request, task, node, childIndex);
      } catch (thrownValue$53) {
        if (
          (resetHooksState(),
          (segment.children.length = childrenLength),
          (segment.chunks.length = chunkLength),
          (node =
            thrownValue$53 === SuspenseException
              ? getSuspendedThenable()
              : thrownValue$53),
          12 !== request.status && "object" === typeof node && null !== node)
        ) {
          if ("function" === typeof node.then) {
            segment = node;
            node =
              thrownValue$53 === SuspenseException
                ? getThenableStateAfterSuspending()
                : null;
            request = spawnNewSuspendedRenderTask(request, task, node).ping;
            segment.then(request, request);
            task.formatContext = previousFormatContext;
            task.context = previousContext;
            task.keyPath = previousKeyPath;
            task.treeContext = previousTreeContext;
            task.componentStack = previousComponentStack;
            switchContext(previousContext);
            return;
          }
          if ("Maximum call stack size exceeded" === node.message) {
            segment =
              thrownValue$53 === SuspenseException
                ? getThenableStateAfterSuspending()
                : null;
            segment = spawnNewSuspendedRenderTask(request, task, segment);
            request.pingedTasks.push(segment);
            task.formatContext = previousFormatContext;
            task.context = previousContext;
            task.keyPath = previousKeyPath;
            task.treeContext = previousTreeContext;
            task.componentStack = previousComponentStack;
            switchContext(previousContext);
            return;
          }
        }
      }
    }
    task.formatContext = previousFormatContext;
    task.context = previousContext;
    task.keyPath = previousKeyPath;
    task.treeContext = previousTreeContext;
    switchContext(previousContext);
    throw node;
  }
  function abortTaskSoft(task) {
    var boundary = task.blockedBoundary,
      segment = task.blockedSegment;
    null !== segment &&
      ((segment.status = 3), finishedTask(this, boundary, task.row, segment));
  }
  function abortRemainingReplayNodes(
    request$jscomp$0,
    boundary,
    nodes,
    slots,
    error,
    errorDigest$jscomp$0
  ) {
    for (var i = 0; i < nodes.length; i++) {
      var node = nodes[i];
      if (4 === node.length)
        abortRemainingReplayNodes(
          request$jscomp$0,
          boundary,
          node[2],
          node[3],
          error,
          errorDigest$jscomp$0
        );
      else {
        node = node[5];
        var request = request$jscomp$0,
          errorDigest = errorDigest$jscomp$0,
          resumedBoundary = createSuspenseBoundary(
            request,
            null,
            new Set(),
            null,
            !1
          );
        resumedBoundary.parentFlushed = !0;
        resumedBoundary.rootSegmentID = node;
        resumedBoundary.status = 4;
        resumedBoundary.errorDigest = errorDigest;
        resumedBoundary.parentFlushed &&
          request.clientRenderedBoundaries.push(resumedBoundary);
      }
    }
    nodes.length = 0;
    if (null !== slots) {
      if (null === boundary)
        throw Error(
          "We should not have any resumable nodes in the shell. This is a bug in React."
        );
      4 !== boundary.status &&
        ((boundary.status = 4),
        (boundary.errorDigest = errorDigest$jscomp$0),
        boundary.parentFlushed &&
          request$jscomp$0.clientRenderedBoundaries.push(boundary));
      if ("object" === typeof slots)
        for (var index in slots) delete slots[index];
    }
  }
  function abortTask(task, request, error) {
    var boundary = task.blockedBoundary,
      segment = task.blockedSegment;
    if (null !== segment) {
      if (6 === segment.status) return;
      segment.status = 3;
    }
    var errorInfo = getThrownInfo(task.componentStack);
    if (null === boundary) {
      if (13 !== request.status && 14 !== request.status) {
        boundary = task.replay;
        if (null === boundary) {
          null !== request.trackedPostpones && null !== segment
            ? ((boundary = request.trackedPostpones),
              logRecoverableError(request, error, errorInfo),
              trackPostpone(request, boundary, task, segment),
              finishedTask(request, null, task.row, segment))
            : (logRecoverableError(request, error, errorInfo),
              fatalError(request, error));
          return;
        }
        boundary.pendingTasks--;
        0 === boundary.pendingTasks &&
          0 < boundary.nodes.length &&
          ((segment = logRecoverableError(request, error, errorInfo)),
          abortRemainingReplayNodes(
            request,
            null,
            boundary.nodes,
            boundary.slots,
            error,
            segment
          ));
        request.pendingRootTasks--;
        0 === request.pendingRootTasks && completeShell(request);
      }
    } else {
      var trackedPostpones$54 = request.trackedPostpones;
      if (4 !== boundary.status) {
        if (null !== trackedPostpones$54 && null !== segment)
          return (
            logRecoverableError(request, error, errorInfo),
            trackPostpone(request, trackedPostpones$54, task, segment),
            boundary.fallbackAbortableTasks.forEach(function (fallbackTask) {
              return abortTask(fallbackTask, request, error);
            }),
            boundary.fallbackAbortableTasks.clear(),
            finishedTask(request, boundary, task.row, segment)
          );
        boundary.status = 4;
        segment = logRecoverableError(request, error, errorInfo);
        boundary.status = 4;
        boundary.errorDigest = segment;
        untrackBoundary(request, boundary);
        boundary.parentFlushed &&
          request.clientRenderedBoundaries.push(boundary);
      }
      boundary.pendingTasks--;
      segment = boundary.row;
      null !== segment &&
        0 === --segment.pendingTasks &&
        finishSuspenseListRow(request, segment);
      boundary.fallbackAbortableTasks.forEach(function (fallbackTask) {
        return abortTask(fallbackTask, request, error);
      });
      boundary.fallbackAbortableTasks.clear();
    }
    task = task.row;
    null !== task &&
      0 === --task.pendingTasks &&
      finishSuspenseListRow(request, task);
    request.allPendingTasks--;
    0 === request.allPendingTasks && completeAll(request);
  }
  function safelyEmitEarlyPreloads(request, shellComplete) {
    try {
      emitEarlyPreloads(
        request.renderState,
        request.resumableState,
        shellComplete
      );
    } catch (error) {
      logRecoverableError(request, error, {});
    }
  }
  function completeShell(request) {
    null === request.trackedPostpones && safelyEmitEarlyPreloads(request, !0);
    null === request.trackedPostpones && preparePreamble(request);
    request.onShellError = noop;
    request = request.onShellReady;
    request();
  }
  function completeAll(request) {
    safelyEmitEarlyPreloads(
      request,
      null === request.trackedPostpones
        ? !0
        : null === request.completedRootSegment ||
            5 !== request.completedRootSegment.status
    );
    preparePreamble(request);
    request = request.onAllReady;
    request();
  }
  function queueCompletedSegment(boundary, segment) {
    if (
      0 === segment.chunks.length &&
      1 === segment.children.length &&
      null === segment.children[0].boundary &&
      -1 === segment.children[0].id
    ) {
      var childSegment = segment.children[0];
      childSegment.id = segment.id;
      childSegment.parentFlushed = !0;
      (1 !== childSegment.status &&
        3 !== childSegment.status &&
        4 !== childSegment.status) ||
        queueCompletedSegment(boundary, childSegment);
    } else boundary.completedSegments.push(segment);
  }
  function finishedSegment(request, boundary, segment) {
    if (null !== byteLengthOfChunk) {
      segment = segment.chunks;
      for (var segmentByteSize = 0, i = 0; i < segment.length; i++)
        segmentByteSize += byteLengthOfChunk(segment[i]);
      null === boundary
        ? (request.byteSize += segmentByteSize)
        : (boundary.byteSize += segmentByteSize);
    }
  }
  function finishedTask(request, boundary, row, segment) {
    null !== row &&
      (0 === --row.pendingTasks
        ? finishSuspenseListRow(request, row)
        : row.together && tryToResolveTogetherRow(request, row));
    request.allPendingTasks--;
    if (null === boundary) {
      if (null !== segment && segment.parentFlushed) {
        if (null !== request.completedRootSegment)
          throw Error(
            "There can only be one root segment. This is a bug in React."
          );
        request.completedRootSegment = segment;
      }
      request.pendingRootTasks--;
      0 === request.pendingRootTasks && completeShell(request);
    } else if ((boundary.pendingTasks--, 4 !== boundary.status))
      if (0 === boundary.pendingTasks)
        if (
          (0 === boundary.status && (boundary.status = 1),
          null !== segment &&
            segment.parentFlushed &&
            (1 === segment.status || 3 === segment.status) &&
            queueCompletedSegment(boundary, segment),
          boundary.parentFlushed && request.completedBoundaries.push(boundary),
          1 === boundary.status)
        )
          (row = boundary.row),
            null !== row &&
              hoistHoistables(row.hoistables, boundary.contentState),
            isEligibleForOutlining(request, boundary) ||
              (boundary.fallbackAbortableTasks.forEach(abortTaskSoft, request),
              boundary.fallbackAbortableTasks.clear(),
              null !== row &&
                0 === --row.pendingTasks &&
                finishSuspenseListRow(request, row)),
            0 === request.pendingRootTasks &&
              null === request.trackedPostpones &&
              null !== boundary.preamble &&
              preparePreamble(request);
        else {
          if (
            5 === boundary.status &&
            ((boundary = boundary.row), null !== boundary)
          ) {
            if (null !== request.trackedPostpones) {
              row = request.trackedPostpones;
              var postponedRow = boundary.next;
              if (
                null !== postponedRow &&
                ((segment = postponedRow.boundaries), null !== segment)
              )
                for (
                  postponedRow.boundaries = null, postponedRow = 0;
                  postponedRow < segment.length;
                  postponedRow++
                ) {
                  var postponedBoundary = segment[postponedRow];
                  trackPostponedBoundary(request, row, postponedBoundary);
                  finishedTask(request, postponedBoundary, null, null);
                }
            }
            0 === --boundary.pendingTasks &&
              finishSuspenseListRow(request, boundary);
          }
        }
      else
        null === segment ||
          !segment.parentFlushed ||
          (1 !== segment.status && 3 !== segment.status) ||
          (queueCompletedSegment(boundary, segment),
          1 === boundary.completedSegments.length &&
            boundary.parentFlushed &&
            request.partialBoundaries.push(boundary)),
          (boundary = boundary.row),
          null !== boundary &&
            boundary.together &&
            tryToResolveTogetherRow(request, boundary);
    0 === request.allPendingTasks && completeAll(request);
  }
  function performWork(request$jscomp$1) {
    if (14 !== request$jscomp$1.status && 13 !== request$jscomp$1.status) {
      var prevContext = currentActiveSnapshot,
        prevDispatcher = ReactSharedInternals.H;
      ReactSharedInternals.H = HooksDispatcher;
      var prevAsyncDispatcher = ReactSharedInternals.A;
      ReactSharedInternals.A = DefaultAsyncDispatcher;
      var prevRequest = currentRequest;
      currentRequest = request$jscomp$1;
      var prevResumableState = currentResumableState;
      currentResumableState = request$jscomp$1.resumableState;
      try {
        var pingedTasks = request$jscomp$1.pingedTasks,
          i;
        for (i = 0; i < pingedTasks.length; i++) {
          var task = pingedTasks[i],
            request = request$jscomp$1,
            segment = task.blockedSegment;
          if (null === segment) {
            if (0 !== task.replay.pendingTasks) {
              switchContext(task.context);
              try {
                "number" === typeof task.replay.slots
                  ? resumeNode(
                      request,
                      task,
                      task.replay.slots,
                      task.node,
                      task.childIndex
                    )
                  : retryNode(request, task);
                if (
                  1 === task.replay.pendingTasks &&
                  0 < task.replay.nodes.length
                )
                  throw Error(
                    "Couldn't find all resumable slots by key/index during replaying. The tree doesn't match so React will fallback to client rendering."
                  );
                task.replay.pendingTasks--;
                task.abortSet.delete(task);
                finishedTask(request, task.blockedBoundary, task.row, null);
              } catch (thrownValue) {
                resetHooksState();
                var x =
                  thrownValue === SuspenseException
                    ? getSuspendedThenable()
                    : thrownValue;
                if (
                  "object" === typeof x &&
                  null !== x &&
                  "function" === typeof x.then
                ) {
                  var ping = task.ping;
                  x.then(ping, ping);
                  task.thenableState =
                    thrownValue === SuspenseException
                      ? getThenableStateAfterSuspending()
                      : null;
                } else {
                  task.replay.pendingTasks--;
                  task.abortSet.delete(task);
                  var errorInfo = getThrownInfo(task.componentStack),
                    request$jscomp$0 = request,
                    boundary = task.blockedBoundary,
                    error$jscomp$0 =
                      12 === request.status ? request.fatalError : x,
                    replayNodes = task.replay.nodes,
                    resumeSlots = task.replay.slots,
                    errorDigest = logRecoverableError(
                      request$jscomp$0,
                      error$jscomp$0,
                      errorInfo
                    );
                  abortRemainingReplayNodes(
                    request$jscomp$0,
                    boundary,
                    replayNodes,
                    resumeSlots,
                    error$jscomp$0,
                    errorDigest
                  );
                  request.pendingRootTasks--;
                  0 === request.pendingRootTasks && completeShell(request);
                  request.allPendingTasks--;
                  0 === request.allPendingTasks && completeAll(request);
                }
              } finally {
              }
            }
          } else if (
            ((request$jscomp$0 = segment), 0 === request$jscomp$0.status)
          ) {
            request$jscomp$0.status = 6;
            switchContext(task.context);
            var childrenLength = request$jscomp$0.children.length,
              chunkLength = request$jscomp$0.chunks.length;
            try {
              retryNode(request, task),
                pushSegmentFinale(
                  request$jscomp$0.chunks,
                  request.renderState,
                  request$jscomp$0.lastPushedText,
                  request$jscomp$0.textEmbedded
                ),
                task.abortSet.delete(task),
                (request$jscomp$0.status = 1),
                finishedSegment(
                  request,
                  task.blockedBoundary,
                  request$jscomp$0
                ),
                finishedTask(
                  request,
                  task.blockedBoundary,
                  task.row,
                  request$jscomp$0
                );
            } catch (thrownValue) {
              resetHooksState();
              request$jscomp$0.children.length = childrenLength;
              request$jscomp$0.chunks.length = chunkLength;
              var x$jscomp$0 =
                thrownValue === SuspenseException
                  ? getSuspendedThenable()
                  : 12 === request.status
                    ? request.fatalError
                    : thrownValue;
              if (12 === request.status && null !== request.trackedPostpones) {
                var trackedPostpones = request.trackedPostpones,
                  thrownInfo = getThrownInfo(task.componentStack);
                task.abortSet.delete(task);
                logRecoverableError(request, x$jscomp$0, thrownInfo);
                trackPostpone(
                  request,
                  trackedPostpones,
                  task,
                  request$jscomp$0
                );
                finishedTask(
                  request,
                  task.blockedBoundary,
                  task.row,
                  request$jscomp$0
                );
              } else if (
                "object" === typeof x$jscomp$0 &&
                null !== x$jscomp$0 &&
                "function" === typeof x$jscomp$0.then
              ) {
                request$jscomp$0.status = 0;
                task.thenableState =
                  thrownValue === SuspenseException
                    ? getThenableStateAfterSuspending()
                    : null;
                var ping$jscomp$0 = task.ping;
                x$jscomp$0.then(ping$jscomp$0, ping$jscomp$0);
              } else {
                var errorInfo$jscomp$0 = getThrownInfo(task.componentStack);
                task.abortSet.delete(task);
                request$jscomp$0.status = 4;
                var boundary$jscomp$0 = task.blockedBoundary,
                  row = task.row;
                null !== row &&
                  0 === --row.pendingTasks &&
                  finishSuspenseListRow(request, row);
                request.allPendingTasks--;
                var errorDigest$jscomp$0 = logRecoverableError(
                  request,
                  x$jscomp$0,
                  errorInfo$jscomp$0
                );
                if (null === boundary$jscomp$0) fatalError(request, x$jscomp$0);
                else if (
                  (boundary$jscomp$0.pendingTasks--,
                  4 !== boundary$jscomp$0.status)
                ) {
                  boundary$jscomp$0.status = 4;
                  boundary$jscomp$0.errorDigest = errorDigest$jscomp$0;
                  untrackBoundary(request, boundary$jscomp$0);
                  var boundaryRow = boundary$jscomp$0.row;
                  null !== boundaryRow &&
                    0 === --boundaryRow.pendingTasks &&
                    finishSuspenseListRow(request, boundaryRow);
                  boundary$jscomp$0.parentFlushed &&
                    request.clientRenderedBoundaries.push(boundary$jscomp$0);
                  0 === request.pendingRootTasks &&
                    null === request.trackedPostpones &&
                    null !== boundary$jscomp$0.preamble &&
                    preparePreamble(request);
                }
                0 === request.allPendingTasks && completeAll(request);
              }
            } finally {
            }
          }
        }
        pingedTasks.splice(0, i);
        null !== request$jscomp$1.destination &&
          flushCompletedQueues(request$jscomp$1, request$jscomp$1.destination);
      } catch (error) {
        logRecoverableError(request$jscomp$1, error, {}),
          fatalError(request$jscomp$1, error);
      } finally {
        (currentResumableState = prevResumableState),
          (ReactSharedInternals.H = prevDispatcher),
          (ReactSharedInternals.A = prevAsyncDispatcher),
          prevDispatcher === HooksDispatcher && switchContext(prevContext),
          (currentRequest = prevRequest);
      }
    }
  }
  function preparePreambleFromSubtree(
    request,
    segment,
    collectedPreambleSegments
  ) {
    segment.preambleChildren.length &&
      collectedPreambleSegments.push(segment.preambleChildren);
    for (var pendingPreambles = !1, i = 0; i < segment.children.length; i++)
      pendingPreambles =
        preparePreambleFromSegment(
          request,
          segment.children[i],
          collectedPreambleSegments
        ) || pendingPreambles;
    return pendingPreambles;
  }
  function preparePreambleFromSegment(
    request,
    segment,
    collectedPreambleSegments
  ) {
    var boundary = segment.boundary;
    if (null === boundary)
      return preparePreambleFromSubtree(
        request,
        segment,
        collectedPreambleSegments
      );
    var preamble = boundary.preamble;
    if (null === preamble) return !1;
    switch (boundary.status) {
      case 1:
        hoistPreambleState(request.renderState, preamble.content);
        request.byteSize += boundary.byteSize;
        segment = boundary.completedSegments[0];
        if (!segment)
          throw Error(
            "A previously unvisited boundary must have exactly one root segment. This is a bug in React."
          );
        return preparePreambleFromSubtree(
          request,
          segment,
          collectedPreambleSegments
        );
      case 5:
        if (null !== request.trackedPostpones) return !0;
      case 4:
        if (1 === segment.status)
          return (
            hoistPreambleState(request.renderState, preamble.fallback),
            preparePreambleFromSubtree(
              request,
              segment,
              collectedPreambleSegments
            )
          );
      default:
        return !0;
    }
  }
  function preparePreamble(request) {
    if (
      request.completedRootSegment &&
      null === request.completedPreambleSegments
    ) {
      var collectedPreambleSegments = [],
        originalRequestByteSize = request.byteSize,
        hasPendingPreambles = preparePreambleFromSegment(
          request,
          request.completedRootSegment,
          collectedPreambleSegments
        );
      isPreambleReady(request.renderState, hasPendingPreambles)
        ? (request.completedPreambleSegments = collectedPreambleSegments)
        : (request.byteSize = originalRequestByteSize);
    }
  }
  function flushSubtree(request, destination, segment, hoistableState) {
    segment.parentFlushed = !0;
    switch (segment.status) {
      case 0:
        segment.id = request.nextSegmentId++;
      case 5:
        return (
          (hoistableState = segment.id),
          (segment.lastPushedText = !1),
          (segment.textEmbedded = !1),
          writePlaceholder(destination, request.renderState, hoistableState)
        );
      case 1:
        segment.status = 2;
        var r = !0,
          chunks = segment.chunks,
          chunkIdx = 0;
        segment = segment.children;
        for (var childIdx = 0; childIdx < segment.length; childIdx++) {
          for (r = segment[childIdx]; chunkIdx < r.index; chunkIdx++)
            writeChunk(destination, chunks[chunkIdx]);
          r = flushSegment(request, destination, r, hoistableState);
        }
        for (; chunkIdx < chunks.length - 1; chunkIdx++)
          writeChunk(destination, chunks[chunkIdx]);
        chunkIdx < chunks.length &&
          (r = writeChunkAndReturn(destination, chunks[chunkIdx]));
        return r;
      case 3:
        return !0;
      default:
        throw Error(
          "Aborted, errored or already flushed boundaries should not be flushed again. This is a bug in React."
        );
    }
  }
  function flushSegment(request, destination, segment, hoistableState) {
    var boundary = segment.boundary;
    if (null === boundary)
      return flushSubtree(request, destination, segment, hoistableState);
    segment.boundary = null;
    boundary.parentFlushed = !0;
    if (4 === boundary.status) {
      var row = boundary.row;
      null !== row &&
        0 === --row.pendingTasks &&
        finishSuspenseListRow(request, row);
      writeStartClientRenderedSuspenseBoundary(
        destination,
        request.renderState,
        boundary.errorDigest,
        null,
        null,
        null
      );
      flushSubtree(request, destination, segment, hoistableState);
      return writeEndClientRenderedSuspenseBoundary(
        destination,
        request.renderState
      );
    }
    if (1 !== boundary.status)
      return (
        0 === boundary.status &&
          (boundary.rootSegmentID = request.nextSegmentId++),
        0 < boundary.completedSegments.length &&
          request.partialBoundaries.push(boundary),
        writeStartPendingSuspenseBoundary(
          destination,
          request.renderState,
          boundary.rootSegmentID
        ),
        hoistableState &&
          hoistHoistables(hoistableState, boundary.fallbackState),
        flushSubtree(request, destination, segment, hoistableState),
        writeEndPendingSuspenseBoundary(destination, request.renderState)
      );
    if (
      !flushingPartialBoundaries &&
      isEligibleForOutlining(request, boundary) &&
      (flushedByteSize + boundary.byteSize > request.progressiveChunkSize ||
        hasSuspenseyContent(boundary.contentState) ||
        boundary.defer)
    )
      return (
        (boundary.rootSegmentID = request.nextSegmentId++),
        request.completedBoundaries.push(boundary),
        writeStartPendingSuspenseBoundary(
          destination,
          request.renderState,
          boundary.rootSegmentID
        ),
        flushSubtree(request, destination, segment, hoistableState),
        writeEndPendingSuspenseBoundary(destination, request.renderState)
      );
    flushedByteSize += boundary.byteSize;
    hoistableState && hoistHoistables(hoistableState, boundary.contentState);
    segment = boundary.row;
    null !== segment &&
      isEligibleForOutlining(request, boundary) &&
      0 === --segment.pendingTasks &&
      finishSuspenseListRow(request, segment);
    writeStartCompletedSuspenseBoundary(destination, request.renderState);
    boundary = boundary.completedSegments;
    if (1 !== boundary.length)
      throw Error(
        "A previously unvisited boundary must have exactly one root segment. This is a bug in React."
      );
    flushSegment(request, destination, boundary[0], hoistableState);
    return writeEndCompletedSuspenseBoundary(destination, request.renderState);
  }
  function flushSegmentContainer(
    request,
    destination,
    segment,
    hoistableState
  ) {
    writeStartSegment(
      destination,
      request.renderState,
      segment.parentFormatContext,
      segment.id
    );
    flushSegment(request, destination, segment, hoistableState);
    return writeEndSegment(destination, segment.parentFormatContext);
  }
  function flushCompletedBoundary(request, destination, boundary) {
    flushedByteSize = boundary.byteSize;
    for (
      var completedSegments = boundary.completedSegments, i = 0;
      i < completedSegments.length;
      i++
    )
      flushPartiallyCompletedSegment(
        request,
        destination,
        boundary,
        completedSegments[i]
      );
    completedSegments.length = 0;
    completedSegments = boundary.row;
    null !== completedSegments &&
      isEligibleForOutlining(request, boundary) &&
      0 === --completedSegments.pendingTasks &&
      finishSuspenseListRow(request, completedSegments);
    writeHoistablesForBoundary(
      destination,
      boundary.contentState,
      request.renderState
    );
    return writeCompletedBoundaryInstruction(
      destination,
      request.resumableState,
      request.renderState,
      boundary.rootSegmentID,
      boundary.contentState
    );
  }
  function flushPartiallyCompletedSegment(
    request,
    destination,
    boundary,
    segment
  ) {
    if (2 === segment.status) return !0;
    var hoistableState = boundary.contentState,
      segmentID = segment.id;
    if (-1 === segmentID) {
      if (-1 === (segment.id = boundary.rootSegmentID))
        throw Error(
          "A root segment ID must have been assigned by now. This is a bug in React."
        );
      return flushSegmentContainer(
        request,
        destination,
        segment,
        hoistableState
      );
    }
    if (segmentID === boundary.rootSegmentID)
      return flushSegmentContainer(
        request,
        destination,
        segment,
        hoistableState
      );
    flushSegmentContainer(request, destination, segment, hoistableState);
    return writeCompletedSegmentInstruction(
      destination,
      request.resumableState,
      request.renderState,
      segmentID
    );
  }
  function flushCompletedQueues(request, destination) {
    beginWriting(destination);
    try {
      if (!(0 < request.pendingRootTasks)) {
        var i,
          completedRootSegment = request.completedRootSegment;
        if (null !== completedRootSegment) {
          if (5 === completedRootSegment.status) return;
          var completedPreambleSegments = request.completedPreambleSegments;
          if (null === completedPreambleSegments) return;
          flushedByteSize = request.byteSize;
          var skipBlockingShell = !1,
            blockingRenderMaxSize = 40 * request.progressiveChunkSize;
          flushedByteSize > blockingRenderMaxSize &&
            ((skipBlockingShell = !0),
            logRecoverableError(
              request,
              Error(
                "This rendered a large document (>" +
                  Math.round(blockingRenderMaxSize / 1e3) +
                  " kB) without any Suspense boundaries around most of it. That can delay initial paint longer than necessary. To improve load performance, add a <Suspense> or <SuspenseList> around the content you expect to be below the header or below the fold. In the meantime, the content will deopt to paint arbitrary incomplete pieces of HTML."
              ),
              {},
              null
            ));
          writePreambleStart(
            destination,
            request.resumableState,
            request.renderState,
            skipBlockingShell
          );
          for (
            skipBlockingShell = 0;
            skipBlockingShell < completedPreambleSegments.length;
            skipBlockingShell++
          ) {
            var segments = completedPreambleSegments[skipBlockingShell];
            for (
              blockingRenderMaxSize = 0;
              blockingRenderMaxSize < segments.length;
              blockingRenderMaxSize++
            )
              flushSegment(
                request,
                destination,
                segments[blockingRenderMaxSize],
                null
              );
          }
          writePreambleEnd(destination, request.renderState);
          flushSegment(request, destination, completedRootSegment, null);
          request.completedRootSegment = null;
          writeCompletedRoot(
            destination,
            request.resumableState,
            request.renderState,
            0 === request.allPendingTasks &&
              0 === request.clientRenderedBoundaries.length &&
              0 === request.completedBoundaries.length &&
              (null === request.trackedPostpones ||
                (0 === request.trackedPostpones.rootNodes.length &&
                  null === request.trackedPostpones.rootSlots))
          );
        }
        writeHoistables(
          destination,
          request.resumableState,
          request.renderState
        );
        var clientRenderedBoundaries = request.clientRenderedBoundaries;
        for (i = 0; i < clientRenderedBoundaries.length; i++) {
          var boundary = clientRenderedBoundaries[i];
          var JSCompiler_inline_result = writeClientRenderBoundaryInstruction(
            destination,
            request.resumableState,
            request.renderState,
            boundary.rootSegmentID,
            boundary.errorDigest,
            null,
            null,
            null
          );
          if (!JSCompiler_inline_result) {
            request.destination = null;
            i++;
            clientRenderedBoundaries.splice(0, i);
            return;
          }
        }
        clientRenderedBoundaries.splice(0, i);
        var completedBoundaries = request.completedBoundaries;
        for (i = 0; i < completedBoundaries.length; i++)
          if (
            !flushCompletedBoundary(
              request,
              destination,
              completedBoundaries[i]
            )
          ) {
            request.destination = null;
            i++;
            completedBoundaries.splice(0, i);
            return;
          }
        completedBoundaries.splice(0, i);
        completeWriting(destination);
        beginWriting(destination);
        flushingPartialBoundaries = !0;
        var partialBoundaries = request.partialBoundaries;
        for (i = 0; i < partialBoundaries.length; i++) {
          var boundary$60 = partialBoundaries[i];
          a: {
            completedRootSegment = request;
            completedPreambleSegments = destination;
            flushedByteSize = boundary$60.byteSize;
            var completedSegments = boundary$60.completedSegments;
            for (segments = 0; segments < completedSegments.length; segments++)
              if (
                !flushPartiallyCompletedSegment(
                  completedRootSegment,
                  completedPreambleSegments,
                  boundary$60,
                  completedSegments[segments]
                )
              ) {
                segments++;
                completedSegments.splice(0, segments);
                var JSCompiler_inline_result$jscomp$0 = !1;
                break a;
              }
            completedSegments.splice(0, segments);
            var row = boundary$60.row;
            null !== row &&
              row.together &&
              1 === boundary$60.pendingTasks &&
              (1 === row.pendingTasks
                ? unblockSuspenseListRow(
                    completedRootSegment,
                    row,
                    row.hoistables
                  )
                : row.pendingTasks--);
            JSCompiler_inline_result$jscomp$0 = writeHoistablesForBoundary(
              completedPreambleSegments,
              boundary$60.contentState,
              completedRootSegment.renderState
            );
          }
          if (!JSCompiler_inline_result$jscomp$0) {
            request.destination = null;
            i++;
            partialBoundaries.splice(0, i);
            return;
          }
        }
        partialBoundaries.splice(0, i);
        flushingPartialBoundaries = !1;
        var largeBoundaries = request.completedBoundaries;
        for (i = 0; i < largeBoundaries.length; i++)
          if (
            !flushCompletedBoundary(request, destination, largeBoundaries[i])
          ) {
            request.destination = null;
            i++;
            largeBoundaries.splice(0, i);
            return;
          }
        largeBoundaries.splice(0, i);
      }
    } finally {
      (flushingPartialBoundaries = !1),
        0 === request.allPendingTasks &&
        0 === request.clientRenderedBoundaries.length &&
        0 === request.completedBoundaries.length
          ? ((request.flushScheduled = !1),
            writePostamble(destination, request.resumableState),
            completeWriting(destination),
            flushBuffered(destination),
            (request.status = 14),
            close(destination),
            stopFlowing(request))
          : (completeWriting(destination), flushBuffered(destination));
    }
  }
  function enqueueFlush(request) {
    !1 === request.flushScheduled &&
      0 === request.pingedTasks.length &&
      null !== request.destination &&
      ((request.flushScheduled = !0),
      scheduleWork(function () {
        var destination = request.destination;
        destination
          ? flushCompletedQueues(request, destination)
          : (request.flushScheduled = !1);
      }));
  }
  function stopFlowing(request) {
    request.destination = null;
  }
  function addToReplayParent(node, parentKeyPath, trackedPostpones) {
    if (null === parentKeyPath) trackedPostpones.rootNodes.push(node);
    else {
      var workingMap = trackedPostpones.workingMap,
        parentNode = workingMap.get(parentKeyPath);
      void 0 === parentNode &&
        ((parentNode = [parentKeyPath[1], parentKeyPath[2], [], null]),
        workingMap.set(parentKeyPath, parentNode),
        addToReplayParent(parentNode, parentKeyPath[0], trackedPostpones));
      parentNode[2].push(node);
    }
  }
  var exports = {};
  ("use strict");
  var React = require("react"),
    REACT_ELEMENT_TYPE = Symbol.for("react.transitional.element"),
    REACT_PORTAL_TYPE = Symbol.for("react.portal"),
    REACT_FRAGMENT_TYPE = Symbol.for("react.fragment"),
    REACT_STRICT_MODE_TYPE = Symbol.for("react.strict_mode"),
    REACT_PROFILER_TYPE = Symbol.for("react.profiler"),
    REACT_CONSUMER_TYPE = Symbol.for("react.consumer"),
    REACT_CONTEXT_TYPE = Symbol.for("react.context"),
    REACT_FORWARD_REF_TYPE = Symbol.for("react.forward_ref"),
    REACT_SUSPENSE_TYPE = Symbol.for("react.suspense"),
    REACT_SUSPENSE_LIST_TYPE = Symbol.for("react.suspense_list"),
    REACT_MEMO_TYPE = Symbol.for("react.memo"),
    REACT_LAZY_TYPE = Symbol.for("react.lazy"),
    REACT_SCOPE_TYPE = Symbol.for("react.scope"),
    REACT_ACTIVITY_TYPE = Symbol.for("react.activity"),
    REACT_LEGACY_HIDDEN_TYPE = Symbol.for("react.legacy_hidden"),
    REACT_MEMO_CACHE_SENTINEL = Symbol.for("react.memo_cache_sentinel"),
    REACT_VIEW_TRANSITION_TYPE = Symbol.for("react.view_transition"),
    MAYBE_ITERATOR_SYMBOL = Symbol.iterator,
    ASYNC_ITERATOR = Symbol.asyncIterator,
    REACT_OPTIMISTIC_KEY = Symbol.for("react.optimistic_key"),
    isArrayImpl = Array.isArray,
    scheduleWork = $$$config.scheduleWork,
    scheduleMicrotask = $$$config.scheduleMicrotask,
    beginWriting = $$$config.beginWriting,
    writeChunk = $$$config.writeChunk,
    writeChunkAndReturn = $$$config.writeChunkAndReturn,
    completeWriting = $$$config.completeWriting,
    flushBuffered = $$$config.flushBuffered,
    close = $$$config.close,
    closeWithError = $$$config.closeWithError;
  $$$config.stringToChunk;
  $$$config.stringToPrecomputedChunk;
  $$$config.typedArrayToBinaryChunk;
  var byteLengthOfChunk = $$$config.byteLengthOfChunk;
  $$$config.byteLengthOfBinaryChunk;
  var createFastHash = $$$config.createFastHash;
  $$$config.readAsDataURL;
  var bindToConsole = $$$config.bindToConsole,
    resetResumableState = $$$config.resetResumableState,
    completeResumableState = $$$config.completeResumableState,
    getChildFormatContext = $$$config.getChildFormatContext,
    getSuspenseFallbackFormatContext =
      $$$config.getSuspenseFallbackFormatContext,
    getSuspenseContentFormatContext = $$$config.getSuspenseContentFormatContext,
    getViewTransitionFormatContext = $$$config.getViewTransitionFormatContext,
    makeId = $$$config.makeId,
    pushTextInstance = $$$config.pushTextInstance,
    pushStartInstance = $$$config.pushStartInstance,
    pushEndInstance = $$$config.pushEndInstance,
    pushSegmentFinale = $$$config.pushSegmentFinale,
    pushFormStateMarkerIsMatching = $$$config.pushFormStateMarkerIsMatching,
    pushFormStateMarkerIsNotMatching =
      $$$config.pushFormStateMarkerIsNotMatching,
    writeCompletedRoot = $$$config.writeCompletedRoot,
    writePlaceholder = $$$config.writePlaceholder,
    pushStartActivityBoundary = $$$config.pushStartActivityBoundary,
    pushEndActivityBoundary = $$$config.pushEndActivityBoundary,
    writeStartCompletedSuspenseBoundary =
      $$$config.writeStartCompletedSuspenseBoundary,
    writeStartPendingSuspenseBoundary =
      $$$config.writeStartPendingSuspenseBoundary,
    writeStartClientRenderedSuspenseBoundary =
      $$$config.writeStartClientRenderedSuspenseBoundary,
    writeEndCompletedSuspenseBoundary =
      $$$config.writeEndCompletedSuspenseBoundary,
    writeEndPendingSuspenseBoundary = $$$config.writeEndPendingSuspenseBoundary,
    writeEndClientRenderedSuspenseBoundary =
      $$$config.writeEndClientRenderedSuspenseBoundary,
    writeStartSegment = $$$config.writeStartSegment,
    writeEndSegment = $$$config.writeEndSegment,
    writeCompletedSegmentInstruction =
      $$$config.writeCompletedSegmentInstruction,
    writeCompletedBoundaryInstruction =
      $$$config.writeCompletedBoundaryInstruction,
    writeClientRenderBoundaryInstruction =
      $$$config.writeClientRenderBoundaryInstruction,
    NotPendingTransition = $$$config.NotPendingTransition,
    createPreambleState = $$$config.createPreambleState,
    canHavePreamble = $$$config.canHavePreamble,
    isPreambleContext = $$$config.isPreambleContext,
    isPreambleReady = $$$config.isPreambleReady,
    hoistPreambleState = $$$config.hoistPreambleState,
    writePreambleStart = $$$config.writePreambleStart,
    writePreambleEnd = $$$config.writePreambleEnd,
    writeHoistables = $$$config.writeHoistables,
    writeHoistablesForBoundary = $$$config.writeHoistablesForBoundary,
    writePostamble = $$$config.writePostamble,
    hoistHoistables = $$$config.hoistHoistables,
    createHoistableState = $$$config.createHoistableState,
    hasSuspenseyContent = $$$config.hasSuspenseyContent,
    emitEarlyPreloads = $$$config.emitEarlyPreloads,
    assign = Object.assign,
    REACT_CLIENT_REFERENCE = Symbol.for("react.client.reference"),
    emptyContextObject = {},
    currentActiveSnapshot = null,
    classComponentUpdater = {
      enqueueSetState: function (inst, payload) {
        inst = inst._reactInternals;
        null !== inst.queue && inst.queue.push(payload);
      },
      enqueueReplaceState: function (inst, payload) {
        inst = inst._reactInternals;
        inst.replace = !0;
        inst.queue = [payload];
      },
      enqueueForceUpdate: function () {}
    },
    emptyTreeContext = { id: 1, overflow: "" },
    clz32 = Math.clz32 ? Math.clz32 : clz32Fallback,
    log = Math.log,
    LN2 = Math.LN2,
    SuspenseException = Error(
      "Suspense Exception: This is not a real error! It's an implementation detail of `use` to interrupt the current render. You must either rethrow it immediately, or move the `use` call outside of the `try/catch` block. Capturing without rethrowing will lead to unexpected behavior.\n\nTo handle async errors, wrap your component in an error boundary, or call the promise's `.catch` method and pass the result to `use`."
    ),
    suspendedThenable = null,
    objectIs = "function" === typeof Object.is ? Object.is : is,
    currentlyRenderingComponent = null,
    currentlyRenderingTask = null,
    currentlyRenderingRequest = null,
    currentlyRenderingKeyPath = null,
    firstWorkInProgressHook = null,
    workInProgressHook = null,
    isReRender = !1,
    didScheduleRenderPhaseUpdate = !1,
    localIdCounter = 0,
    actionStateCounter = 0,
    actionStateMatchingIndex = -1,
    thenableIndexCounter = 0,
    thenableState = null,
    renderPhaseUpdates = null,
    numberOfReRenders = 0,
    HooksDispatcher = {
      readContext: function (context) {
        return context._currentValue2;
      },
      use: function (usable) {
        if (null !== usable && "object" === typeof usable) {
          if ("function" === typeof usable.then) return unwrapThenable(usable);
          if (usable.$$typeof === REACT_CONTEXT_TYPE)
            return usable._currentValue2;
        }
        throw Error(
          "An unsupported type was passed to use(): " + String(usable)
        );
      },
      useContext: function (context) {
        resolveCurrentlyRenderingComponent();
        return context._currentValue2;
      },
      useMemo: useMemo,
      useReducer: useReducer,
      useRef: function (initialValue) {
        currentlyRenderingComponent = resolveCurrentlyRenderingComponent();
        workInProgressHook = createWorkInProgressHook();
        var previousRef = workInProgressHook.memoizedState;
        return null === previousRef
          ? ((initialValue = { current: initialValue }),
            (workInProgressHook.memoizedState = initialValue))
          : previousRef;
      },
      useState: function (initialState) {
        return useReducer(basicStateReducer, initialState);
      },
      useInsertionEffect: noop,
      useLayoutEffect: noop,
      useCallback: function (callback, deps) {
        return useMemo(function () {
          return callback;
        }, deps);
      },
      useImperativeHandle: noop,
      useEffect: noop,
      useDebugValue: noop,
      useDeferredValue: function (value, initialValue) {
        resolveCurrentlyRenderingComponent();
        return void 0 !== initialValue ? initialValue : value;
      },
      useTransition: function () {
        resolveCurrentlyRenderingComponent();
        return [!1, unsupportedStartTransition];
      },
      useId: function () {
        var treeId = getTreeId(currentlyRenderingTask.treeContext),
          resumableState = currentResumableState;
        if (null === resumableState)
          throw Error(
            "Invalid hook call. Hooks can only be called inside of the body of a function component."
          );
        var localId = localIdCounter++;
        return makeId(resumableState, treeId, localId);
      },
      useSyncExternalStore: function (
        subscribe,
        getSnapshot,
        getServerSnapshot
      ) {
        if (void 0 === getServerSnapshot)
          throw Error(
            "Missing getServerSnapshot, which is required for server-rendered content. Will revert to client rendering."
          );
        return getServerSnapshot();
      },
      useOptimistic: function (passthrough) {
        resolveCurrentlyRenderingComponent();
        return [passthrough, unsupportedSetOptimisticState];
      },
      useActionState: useActionState,
      useFormState: useActionState,
      useHostTransitionStatus: function () {
        resolveCurrentlyRenderingComponent();
        return NotPendingTransition;
      },
      useMemoCache: function (size) {
        for (var data = Array(size), i = 0; i < size; i++)
          data[i] = REACT_MEMO_CACHE_SENTINEL;
        return data;
      },
      useCacheRefresh: function () {
        return unsupportedRefresh;
      },
      useEffectEvent: function () {
        return throwOnUseEffectEventCall;
      }
    },
    currentResumableState = null,
    DefaultAsyncDispatcher = {
      getCacheForType: function () {
        throw Error("Not implemented.");
      },
      cacheSignal: function () {
        throw Error("Not implemented.");
      }
    },
    ReactSharedInternals =
      React.__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,
    prefix,
    suffix,
    reentry = !1,
    currentRequest = null,
    flushedByteSize = 0,
    flushingPartialBoundaries = !1;
  exports.abort = function (request, reason) {
    if (11 === request.status || 10 === request.status) request.status = 12;
    try {
      var abortableTasks = request.abortableTasks;
      if (0 < abortableTasks.size) {
        var error =
          void 0 === reason
            ? Error("The render was aborted by the server without a reason.")
            : "object" === typeof reason &&
                null !== reason &&
                "function" === typeof reason.then
              ? Error("The render was aborted by the server with a promise.")
              : reason;
        request.fatalError = error;
        abortableTasks.forEach(function (task) {
          return abortTask(task, request, error);
        });
        abortableTasks.clear();
      }
      null !== request.destination &&
        flushCompletedQueues(request, request.destination);
    } catch (error$62) {
      logRecoverableError(request, error$62, {}), fatalError(request, error$62);
    }
  };
  exports.createPrerenderRequest = function (
    children,
    resumableState,
    renderState,
    rootFormatContext,
    progressiveChunkSize,
    onError,
    onAllReady,
    onShellReady,
    onShellError,
    onFatalError
  ) {
    children = createRequest(
      children,
      resumableState,
      renderState,
      rootFormatContext,
      progressiveChunkSize,
      onError,
      onAllReady,
      onShellReady,
      onShellError,
      onFatalError,
      void 0
    );
    children.trackedPostpones = {
      workingMap: new Map(),
      rootNodes: [],
      rootSlots: null
    };
    return children;
  };
  exports.createRequest = createRequest;
  exports.flushResources = function (request) {
    enqueueFlush(request);
  };
  exports.getFormState = function (request) {
    return request.formState;
  };
  exports.getPostponedState = function (request) {
    var trackedPostpones = request.trackedPostpones;
    if (
      null === trackedPostpones ||
      (0 === trackedPostpones.rootNodes.length &&
        null === trackedPostpones.rootSlots)
    )
      return (request.trackedPostpones = null);
    if (
      null === request.completedRootSegment ||
      (5 !== request.completedRootSegment.status &&
        null !== request.completedPreambleSegments)
    ) {
      var nextSegmentId = request.nextSegmentId;
      var replaySlots = trackedPostpones.rootSlots;
      completeResumableState(request.resumableState);
    } else
      (nextSegmentId = 0),
        (replaySlots = -1),
        resetResumableState(request.resumableState, request.renderState);
    return {
      nextSegmentId: nextSegmentId,
      rootFormatContext: request.rootFormatContext,
      progressiveChunkSize: request.progressiveChunkSize,
      resumableState: request.resumableState,
      replayNodes: trackedPostpones.rootNodes,
      replaySlots: replaySlots
    };
  };
  exports.getRenderState = function (request) {
    return request.renderState;
  };
  exports.getResumableState = function (request) {
    return request.resumableState;
  };
  exports.performWork = performWork;
  exports.prepareForStartFlowingIfBeforeAllReady = function (request) {
    safelyEmitEarlyPreloads(
      request,
      null === request.trackedPostpones
        ? 0 === request.pendingRootTasks
        : null === request.completedRootSegment
          ? 0 === request.pendingRootTasks
          : 5 !== request.completedRootSegment.status
    );
  };
  exports.resolveClassComponentProps = resolveClassComponentProps;
  exports.resolveRequest = function () {
    return currentRequest ? currentRequest : null;
  };
  exports.resumeAndPrerenderRequest = function (
    children,
    postponedState,
    renderState,
    onError,
    onAllReady,
    onShellReady,
    onShellError,
    onFatalError
  ) {
    children = resumeRequest(
      children,
      postponedState,
      renderState,
      onError,
      onAllReady,
      onShellReady,
      onShellError,
      onFatalError
    );
    children.trackedPostpones = {
      workingMap: new Map(),
      rootNodes: [],
      rootSlots: null
    };
    return children;
  };
  exports.resumeRequest = resumeRequest;
  exports.startFlowing = function (request, destination) {
    if (13 === request.status)
      (request.status = 14), closeWithError(destination, request.fatalError);
    else if (14 !== request.status && null === request.destination) {
      request.destination = destination;
      try {
        flushCompletedQueues(request, destination);
      } catch (error) {
        logRecoverableError(request, error, {}), fatalError(request, error);
      }
    }
  };
  exports.startWork = function (request) {
    request.flushScheduled = null !== request.destination;
    scheduleMicrotask(function () {
      return performWork(request);
    });
    scheduleWork(function () {
      10 === request.status && (request.status = 11);
      null === request.trackedPostpones &&
        safelyEmitEarlyPreloads(request, 0 === request.pendingRootTasks);
    });
  };
  exports.stopFlowing = stopFlowing;
  return exports;
};
module.exports.default = module.exports;
Object.defineProperty(module.exports, "__esModule", { value: !0 });
