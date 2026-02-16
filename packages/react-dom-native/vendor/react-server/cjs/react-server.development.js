/**
 * @license React
 * react-server.development.js
 *
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 */

"use strict";
"production" !== process.env.NODE_ENV &&
  ((module.exports = function ($$$config) {
    function getIteratorFn(maybeIterable) {
      if (null === maybeIterable || "object" !== typeof maybeIterable)
        return null;
      maybeIterable =
        (MAYBE_ITERATOR_SYMBOL && maybeIterable[MAYBE_ITERATOR_SYMBOL]) ||
        maybeIterable["@@iterator"];
      return "function" === typeof maybeIterable ? maybeIterable : null;
    }
    function objectName(object) {
      object = Object.prototype.toString.call(object);
      return object.slice(8, object.length - 1);
    }
    function describeKeyForErrorMessage(key) {
      var encodedKey = JSON.stringify(key);
      return '"' + key + '"' === encodedKey ? key : encodedKey;
    }
    function describeValueForErrorMessage(value) {
      switch (typeof value) {
        case "string":
          return JSON.stringify(
            10 >= value.length ? value : value.slice(0, 10) + "..."
          );
        case "object":
          if (isArrayImpl(value)) return "[...]";
          if (null !== value && value.$$typeof === CLIENT_REFERENCE_TAG)
            return "client";
          value = objectName(value);
          return "Object" === value ? "{...}" : value;
        case "function":
          return value.$$typeof === CLIENT_REFERENCE_TAG
            ? "client"
            : (value = value.displayName || value.name)
              ? "function " + value
              : "function";
        default:
          return String(value);
      }
    }
    function describeElementType(type) {
      if ("string" === typeof type) return type;
      switch (type) {
        case REACT_SUSPENSE_TYPE:
          return "Suspense";
        case REACT_SUSPENSE_LIST_TYPE:
          return "SuspenseList";
        case REACT_VIEW_TRANSITION_TYPE:
          return "ViewTransition";
      }
      if ("object" === typeof type)
        switch (type.$$typeof) {
          case REACT_FORWARD_REF_TYPE:
            return describeElementType(type.render);
          case REACT_MEMO_TYPE:
            return describeElementType(type.type);
          case REACT_LAZY_TYPE:
            var payload = type._payload;
            type = type._init;
            try {
              return describeElementType(type(payload));
            } catch (x) {}
        }
      return "";
    }
    function describeObjectForErrorMessage(objectOrArray, expandedName) {
      var objKind = objectName(objectOrArray);
      if ("Object" !== objKind && "Array" !== objKind) return objKind;
      var start = -1,
        length = 0;
      if (isArrayImpl(objectOrArray))
        if (jsxChildrenParents.has(objectOrArray)) {
          var type = jsxChildrenParents.get(objectOrArray);
          objKind = "<" + describeElementType(type) + ">";
          for (var i = 0; i < objectOrArray.length; i++) {
            var value = objectOrArray[i];
            value =
              "string" === typeof value
                ? value
                : "object" === typeof value && null !== value
                  ? "{" + describeObjectForErrorMessage(value) + "}"
                  : "{" + describeValueForErrorMessage(value) + "}";
            "" + i === expandedName
              ? ((start = objKind.length),
                (length = value.length),
                (objKind += value))
              : (objKind =
                  15 > value.length && 40 > objKind.length + value.length
                    ? objKind + value
                    : objKind + "{...}");
          }
          objKind += "</" + describeElementType(type) + ">";
        } else {
          objKind = "[";
          for (type = 0; type < objectOrArray.length; type++)
            0 < type && (objKind += ", "),
              (i = objectOrArray[type]),
              (i =
                "object" === typeof i && null !== i
                  ? describeObjectForErrorMessage(i)
                  : describeValueForErrorMessage(i)),
              "" + type === expandedName
                ? ((start = objKind.length),
                  (length = i.length),
                  (objKind += i))
                : (objKind =
                    10 > i.length && 40 > objKind.length + i.length
                      ? objKind + i
                      : objKind + "...");
          objKind += "]";
        }
      else if (objectOrArray.$$typeof === REACT_ELEMENT_TYPE)
        objKind = "<" + describeElementType(objectOrArray.type) + "/>";
      else {
        if (objectOrArray.$$typeof === CLIENT_REFERENCE_TAG) return "client";
        if (jsxPropsParents.has(objectOrArray)) {
          objKind = jsxPropsParents.get(objectOrArray);
          objKind = "<" + (describeElementType(objKind) || "...");
          type = Object.keys(objectOrArray);
          for (i = 0; i < type.length; i++) {
            objKind += " ";
            value = type[i];
            objKind += describeKeyForErrorMessage(value) + "=";
            var _value2 = objectOrArray[value];
            var _substr2 =
              value === expandedName &&
              "object" === typeof _value2 &&
              null !== _value2
                ? describeObjectForErrorMessage(_value2)
                : describeValueForErrorMessage(_value2);
            "string" !== typeof _value2 && (_substr2 = "{" + _substr2 + "}");
            value === expandedName
              ? ((start = objKind.length),
                (length = _substr2.length),
                (objKind += _substr2))
              : (objKind =
                  10 > _substr2.length && 40 > objKind.length + _substr2.length
                    ? objKind + _substr2
                    : objKind + "...");
          }
          objKind += ">";
        } else {
          objKind = "{";
          type = Object.keys(objectOrArray);
          for (i = 0; i < type.length; i++)
            0 < i && (objKind += ", "),
              (value = type[i]),
              (objKind += describeKeyForErrorMessage(value) + ": "),
              (_value2 = objectOrArray[value]),
              (_value2 =
                "object" === typeof _value2 && null !== _value2
                  ? describeObjectForErrorMessage(_value2)
                  : describeValueForErrorMessage(_value2)),
              value === expandedName
                ? ((start = objKind.length),
                  (length = _value2.length),
                  (objKind += _value2))
                : (objKind =
                    10 > _value2.length && 40 > objKind.length + _value2.length
                      ? objKind + _value2
                      : objKind + "...");
          objKind += "}";
        }
      }
      return void 0 === expandedName
        ? objKind
        : -1 < start && 0 < length
          ? ((objectOrArray = " ".repeat(start) + "^".repeat(length)),
            "\n  " + objKind + "\n  " + objectOrArray)
          : "\n  " + objKind;
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
        switch (
          ("number" === typeof type.tag &&
            console.error(
              "Received an unexpected object in getComponentNameFromType(). This is likely a bug in React. Please file an issue."
            ),
          type.$$typeof)
        ) {
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
    function warnOnInvalidCallback(callback) {
      if (null !== callback && "function" !== typeof callback) {
        var key = String(callback);
        didWarnOnInvalidCallback.has(key) ||
          (didWarnOnInvalidCallback.add(key),
          console.error(
            "Expected the last optional `callback` argument to be a function. Instead received: %s.",
            callback
          ));
      }
    }
    function warnNoop(publicInstance, callerName) {
      publicInstance =
        ((publicInstance = publicInstance.constructor) &&
          getComponentNameFromType(publicInstance)) ||
        "ReactClass";
      var warningKey = publicInstance + "." + callerName;
      didWarnAboutNoopUpdateForComponent[warningKey] ||
        (console.error(
          "Can only update a mounting component. This usually means you called %s() outside componentWillMount() on the server. This is a no-op.\n\nPlease check the code for the %s component.",
          callerName,
          publicInstance
        ),
        (didWarnAboutNoopUpdateForComponent[warningKey] = !0));
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
          shouldCaptureSuspendedCallSite && captureSuspendedCallSite();
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
    function captureSuspendedCallSite() {
      var currentTask = currentTaskInDEV;
      if (null === currentTask)
        throw Error(
          "Expected to have a current task when tracking a suspend call site. This is a bug in React."
        );
      var currentComponentStack = currentTask.componentStack;
      if (null === currentComponentStack)
        throw Error(
          "Expected to have a component stack on the current task when tracking a suspended call site. This is a bug in React."
        );
      suspendedCallSiteStack = {
        parent: currentComponentStack.parent,
        type: currentComponentStack.type,
        owner: currentComponentStack.owner,
        stack: Error("react-stack-top-frame")
      };
      suspendedCallSiteDebugTask = currentTask.debugTask;
    }
    function ensureSuspendableThenableStateDEV(thenableState) {
      var lastThenable = thenableState[thenableState.length - 1];
      switch (lastThenable.status) {
        case "fulfilled":
          var previousThenableValue = lastThenable.value,
            previousThenableThen = lastThenable.then.bind(lastThenable);
          delete lastThenable.value;
          delete lastThenable.status;
          lastThenable.then = noop;
          return function () {
            lastThenable.then = previousThenableThen;
            lastThenable.value = previousThenableValue;
            lastThenable.status = "fulfilled";
          };
        case "rejected":
          var previousThenableReason = lastThenable.reason;
          delete lastThenable.reason;
          delete lastThenable.status;
          return function () {
            lastThenable.reason = previousThenableReason;
            lastThenable.status = "rejected";
          };
      }
      return noop;
    }
    function is(x, y) {
      return (x === y && (0 !== x || 1 / x === 1 / y)) || (x !== x && y !== y);
    }
    function testStringCoercion(value) {
      return "" + value;
    }
    function resolveCurrentlyRenderingComponent() {
      if (null === currentlyRenderingComponent)
        throw Error(
          "Invalid hook call. Hooks can only be called inside of the body of a function component. This could happen for one of the following reasons:\n1. You might have mismatching versions of React and the renderer (such as React DOM)\n2. You might be breaking the Rules of Hooks\n3. You might have more than one copy of React in the same app\nSee https://react.dev/link/invalid-hook-call for tips about how to debug and fix this problem."
        );
      isInHookUserCodeInDev &&
        console.error(
          "Do not call Hooks inside useEffect(...), useMemo(...), or other built-in Hooks. You can only call Hooks at the top level of your React function. For more information, see https://react.dev/link/rules-of-hooks"
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
      isInHookUserCodeInDev = !1;
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
    function readContext(context) {
      isInHookUserCodeInDev &&
        console.error(
          "Context can only be read while React is rendering. In classes, you can read it in the render method or getDerivedStateFromProps. In function components, you can read it directly in the function body, but not inside Hooks like useReducer() or useMemo()."
        );
      return context._currentValue2;
    }
    function basicStateReducer(state, action) {
      return "function" === typeof action ? action(state) : action;
    }
    function useReducer(reducer, initialArg, init) {
      reducer !== basicStateReducer && (currentHookNameInDev = "useReducer");
      currentlyRenderingComponent = resolveCurrentlyRenderingComponent();
      workInProgressHook = createWorkInProgressHook();
      if (isReRender) {
        init = workInProgressHook.queue;
        initialArg = init.dispatch;
        if (null !== renderPhaseUpdates) {
          var firstRenderPhaseUpdate = renderPhaseUpdates.get(init);
          if (void 0 !== firstRenderPhaseUpdate) {
            renderPhaseUpdates.delete(init);
            init = workInProgressHook.memoizedState;
            do {
              var action = firstRenderPhaseUpdate.action;
              isInHookUserCodeInDev = !0;
              init = reducer(init, action);
              isInHookUserCodeInDev = !1;
              firstRenderPhaseUpdate = firstRenderPhaseUpdate.next;
            } while (null !== firstRenderPhaseUpdate);
            workInProgressHook.memoizedState = init;
            return [init, initialArg];
          }
        }
        return [workInProgressHook.memoizedState, initialArg];
      }
      isInHookUserCodeInDev = !0;
      reducer =
        reducer === basicStateReducer
          ? "function" === typeof initialArg
            ? initialArg()
            : initialArg
          : void 0 !== init
            ? init(initialArg)
            : initialArg;
      isInHookUserCodeInDev = !1;
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
          a: {
            var JSCompiler_inline_result = prevState[1];
            if (null === JSCompiler_inline_result)
              console.error(
                "%s received a final argument during this render, but not during the previous render. Even though the final argument is optional, its type cannot change between renders.",
                currentHookNameInDev
              ),
                (JSCompiler_inline_result = !1);
            else {
              deps.length !== JSCompiler_inline_result.length &&
                console.error(
                  "The final argument passed to %s changed size between renders. The order and size of this array must remain constant.\n\nPrevious: %s\nIncoming: %s",
                  currentHookNameInDev,
                  "[" + deps.join(", ") + "]",
                  "[" + JSCompiler_inline_result.join(", ") + "]"
                );
              for (
                var i = 0;
                i < JSCompiler_inline_result.length && i < deps.length;
                i++
              )
                if (!objectIs(deps[i], JSCompiler_inline_result[i])) {
                  JSCompiler_inline_result = !1;
                  break a;
                }
              JSCompiler_inline_result = !0;
            }
          }
          if (JSCompiler_inline_result) return prevState[0];
        }
      }
      isInHookUserCodeInDev = !0;
      nextCreate = nextCreate();
      isInHookUserCodeInDev = !1;
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
                    JSON.stringify([
                      componentKeyPath,
                      null,
                      actionStateHookIndex
                    ])
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
            if (void 0 !== permalink) {
              var value = permalink;
              try {
                testStringCoercion(value);
                var JSCompiler_inline_result = !1;
              } catch (e) {
                JSCompiler_inline_result = !0;
              }
              JSCompiler_inline_result &&
                (console.error(
                  "The provided `%s` attribute is an unsupported type %s. This value must be coerced to a string before using it here.",
                  "target",
                  ("function" === typeof Symbol &&
                    Symbol.toStringTag &&
                    value[Symbol.toStringTag]) ||
                    value.constructor.name ||
                    "Object"
                ),
                testStringCoercion(value));
              permalink += "";
              prefix.action = permalink;
            }
            if ((JSCompiler_inline_result = prefix.data))
              null === nextPostbackStateKey &&
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
                JSCompiler_inline_result.append(
                  "$ACTION_KEY",
                  nextPostbackStateKey
                );
            return prefix;
          });
        return [initialState, action, !1];
      }
      var _boundAction = action.bind(null, initialState);
      return [
        initialState,
        function (payload) {
          _boundAction(payload);
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
    function disabledLog() {}
    function disableLogs() {
      if (0 === disabledDepth) {
        prevLog = console.log;
        prevInfo = console.info;
        prevWarn = console.warn;
        prevError = console.error;
        prevGroup = console.group;
        prevGroupCollapsed = console.groupCollapsed;
        prevGroupEnd = console.groupEnd;
        var props = {
          configurable: !0,
          enumerable: !0,
          value: disabledLog,
          writable: !0
        };
        Object.defineProperties(console, {
          info: props,
          log: props,
          warn: props,
          error: props,
          group: props,
          groupCollapsed: props,
          groupEnd: props
        });
      }
      disabledDepth++;
    }
    function reenableLogs() {
      disabledDepth--;
      if (0 === disabledDepth) {
        var props = { configurable: !0, enumerable: !0, writable: !0 };
        Object.defineProperties(console, {
          log: assign({}, props, { value: prevLog }),
          info: assign({}, props, { value: prevInfo }),
          warn: assign({}, props, { value: prevWarn }),
          error: assign({}, props, { value: prevError }),
          group: assign({}, props, { value: prevGroup }),
          groupCollapsed: assign({}, props, { value: prevGroupCollapsed }),
          groupEnd: assign({}, props, { value: prevGroupEnd })
        });
      }
      0 > disabledDepth &&
        console.error(
          "disabledDepth fell below zero. This is a bug in React. Please file an issue."
        );
    }
    function formatOwnerStack(error) {
      var prevPrepareStackTrace = Error.prepareStackTrace;
      Error.prepareStackTrace = void 0;
      error = error.stack;
      Error.prepareStackTrace = prevPrepareStackTrace;
      error.startsWith("Error: react-stack-top-frame\n") &&
        (error = error.slice(29));
      prevPrepareStackTrace = error.indexOf("\n");
      -1 !== prevPrepareStackTrace &&
        (error = error.slice(prevPrepareStackTrace + 1));
      prevPrepareStackTrace = error.indexOf("react_stack_bottom_frame");
      -1 !== prevPrepareStackTrace &&
        (prevPrepareStackTrace = error.lastIndexOf(
          "\n",
          prevPrepareStackTrace
        ));
      if (-1 !== prevPrepareStackTrace)
        error = error.slice(0, prevPrepareStackTrace);
      else return "";
      return error;
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
      var frame = componentFrameCache.get(fn);
      if (void 0 !== frame) return frame;
      reentry = !0;
      frame = Error.prepareStackTrace;
      Error.prepareStackTrace = void 0;
      var previousDispatcher = null;
      previousDispatcher = ReactSharedInternals.H;
      ReactSharedInternals.H = null;
      disableLogs();
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
                  } catch (x$0) {
                    control = x$0;
                  }
                  fn.call(Fake.prototype);
                }
              } else {
                try {
                  throw Error();
                } catch (x$1) {
                  control = x$1;
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
        var _RunInRootFrame$Deter =
            RunInRootFrame.DetermineComponentFrameRoot(),
          sampleStack = _RunInRootFrame$Deter[0],
          controlStack = _RunInRootFrame$Deter[1];
        if (sampleStack && controlStack) {
          var sampleLines = sampleStack.split("\n"),
            controlLines = controlStack.split("\n");
          for (
            _RunInRootFrame$Deter = namePropDescriptor = 0;
            namePropDescriptor < sampleLines.length &&
            !sampleLines[namePropDescriptor].includes(
              "DetermineComponentFrameRoot"
            );

          )
            namePropDescriptor++;
          for (
            ;
            _RunInRootFrame$Deter < controlLines.length &&
            !controlLines[_RunInRootFrame$Deter].includes(
              "DetermineComponentFrameRoot"
            );

          )
            _RunInRootFrame$Deter++;
          if (
            namePropDescriptor === sampleLines.length ||
            _RunInRootFrame$Deter === controlLines.length
          )
            for (
              namePropDescriptor = sampleLines.length - 1,
                _RunInRootFrame$Deter = controlLines.length - 1;
              1 <= namePropDescriptor &&
              0 <= _RunInRootFrame$Deter &&
              sampleLines[namePropDescriptor] !==
                controlLines[_RunInRootFrame$Deter];

            )
              _RunInRootFrame$Deter--;
          for (
            ;
            1 <= namePropDescriptor && 0 <= _RunInRootFrame$Deter;
            namePropDescriptor--, _RunInRootFrame$Deter--
          )
            if (
              sampleLines[namePropDescriptor] !==
              controlLines[_RunInRootFrame$Deter]
            ) {
              if (1 !== namePropDescriptor || 1 !== _RunInRootFrame$Deter) {
                do
                  if (
                    (namePropDescriptor--,
                    _RunInRootFrame$Deter--,
                    0 > _RunInRootFrame$Deter ||
                      sampleLines[namePropDescriptor] !==
                        controlLines[_RunInRootFrame$Deter])
                  ) {
                    var _frame =
                      "\n" +
                      sampleLines[namePropDescriptor].replace(
                        " at new ",
                        " at "
                      );
                    fn.displayName &&
                      _frame.includes("<anonymous>") &&
                      (_frame = _frame.replace("<anonymous>", fn.displayName));
                    "function" === typeof fn &&
                      componentFrameCache.set(fn, _frame);
                    return _frame;
                  }
                while (1 <= namePropDescriptor && 0 <= _RunInRootFrame$Deter);
              }
              break;
            }
        }
      } finally {
        (reentry = !1),
          (ReactSharedInternals.H = previousDispatcher),
          reenableLogs(),
          (Error.prepareStackTrace = frame);
      }
      sampleLines = (sampleLines = fn ? fn.displayName || fn.name : "")
        ? describeBuiltInComponentFrame(sampleLines)
        : "";
      "function" === typeof fn && componentFrameCache.set(fn, sampleLines);
      return sampleLines;
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
            type = type.debugLocation;
            if (null != type) {
              type = formatOwnerStack(type);
              var idx = type.lastIndexOf("\n");
              type = -1 === idx ? type : type.slice(idx + 1);
              if (-1 !== type.indexOf(payload)) {
                payload = "\n" + type;
                break a;
              }
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
    function resetOwnerStackLimit() {
      var now = getCurrentTime();
      1e3 < now - lastResetTime &&
        ((ReactSharedInternals.recentlyCreatedOwnerStacks = 0),
        (lastResetTime = now));
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
      this.didWarnForKey = null;
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
      resetOwnerStackLimit();
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
        null,
        emptyContextObject,
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
      resetOwnerStackLimit();
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
            null,
            emptyContextObject,
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
        null,
        emptyContextObject,
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
        tracked: null,
        errorMessage: null,
        errorStack: null,
        errorComponentStack: null
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
      componentStack,
      legacyContext,
      debugTask
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
      task.debugTask = debugTask;
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
      componentStack,
      legacyContext,
      debugTask
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
      task.debugTask = debugTask;
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
    function getCurrentStackInDEV() {
      if (null === currentTaskInDEV || null === currentTaskInDEV.componentStack)
        return "";
      var componentStack = currentTaskInDEV.componentStack;
      try {
        var info = "";
        if ("string" === typeof componentStack.type)
          info += describeBuiltInComponentFrame(componentStack.type);
        else if ("function" === typeof componentStack.type) {
          if (!componentStack.owner) {
            var JSCompiler_temp_const = info,
              fn = componentStack.type,
              name = fn ? fn.displayName || fn.name : "";
            var JSCompiler_inline_result = name
              ? describeBuiltInComponentFrame(name)
              : "";
            info = JSCompiler_temp_const + JSCompiler_inline_result;
          }
        } else
          componentStack.owner ||
            (info += describeComponentStackByType(componentStack.type));
        for (; componentStack; )
          (JSCompiler_temp_const = null),
            null != componentStack.debugStack
              ? (JSCompiler_temp_const = formatOwnerStack(
                  componentStack.debugStack
                ))
              : ((JSCompiler_inline_result = componentStack),
                null != JSCompiler_inline_result.stack &&
                  (JSCompiler_temp_const =
                    "string" !== typeof JSCompiler_inline_result.stack
                      ? (JSCompiler_inline_result.stack = formatOwnerStack(
                          JSCompiler_inline_result.stack
                        ))
                      : JSCompiler_inline_result.stack)),
            (componentStack = componentStack.owner) &&
              JSCompiler_temp_const &&
              (info += "\n" + JSCompiler_temp_const);
        var JSCompiler_inline_result$jscomp$0 = info;
      } catch (x) {
        JSCompiler_inline_result$jscomp$0 =
          "\nError generating stack: " + x.message + "\n" + x.stack;
      }
      return JSCompiler_inline_result$jscomp$0;
    }
    function pushHaltedAwaitOnComponentStack(task, debugInfo) {
      if (null != debugInfo)
        for (var i = debugInfo.length - 1; 0 <= i; i--) {
          var info = debugInfo[i];
          if (null != info.awaited) {
            var bestStack = null == info.debugStack ? info.awaited : info;
            if (void 0 !== bestStack.debugStack) {
              task.componentStack = {
                parent: task.componentStack,
                type: info,
                owner: bestStack.owner,
                stack: bestStack.debugStack
              };
              task.debugTask = bestStack.debugTask;
              break;
            }
          }
        }
    }
    function pushSuspendedCallSiteOnComponentStack(request, task) {
      shouldCaptureSuspendedCallSite = !0;
      var restoreThenableState = ensureSuspendableThenableStateDEV(
        task.thenableState
      );
      try {
        var prevStatus = request.status;
        request.status = 15;
        var prevContext = currentActiveSnapshot,
          prevDispatcher = ReactSharedInternals.H;
        ReactSharedInternals.H = HooksDispatcher;
        var prevAsyncDispatcher = ReactSharedInternals.A;
        ReactSharedInternals.A = DefaultAsyncDispatcher;
        var prevRequest = currentRequest;
        currentRequest = request;
        var prevGetCurrentStackImpl = ReactSharedInternals.getCurrentStack;
        ReactSharedInternals.getCurrentStack = getCurrentStackInDEV;
        var prevResumableState = currentResumableState;
        currentResumableState = request.resumableState;
        switchContext(task.context);
        var prevTaskInDEV = currentTaskInDEV;
        currentTaskInDEV = task;
        try {
          retryNode(request, task);
        } catch (x) {
          resetHooksState();
        } finally {
          (currentTaskInDEV = prevTaskInDEV),
            (currentResumableState = prevResumableState),
            (ReactSharedInternals.H = prevDispatcher),
            (ReactSharedInternals.A = prevAsyncDispatcher),
            (ReactSharedInternals.getCurrentStack = prevGetCurrentStackImpl),
            prevDispatcher === HooksDispatcher && switchContext(prevContext),
            (currentRequest = prevRequest),
            (request.status = prevStatus);
        }
      } finally {
        restoreThenableState(), (shouldCaptureSuspendedCallSite = !1);
      }
      null === suspendedCallSiteStack
        ? (request = null)
        : ((request = suspendedCallSiteStack), (suspendedCallSiteStack = null));
      null === suspendedCallSiteDebugTask
        ? (restoreThenableState = null)
        : ((restoreThenableState = suspendedCallSiteDebugTask),
          (suspendedCallSiteDebugTask = null));
      null !== request &&
        (task.componentStack = {
          owner: task.componentStack,
          parent: request.parent,
          stack: request.stack,
          type: request.type
        });
      task.debugTask = restoreThenableState;
    }
    function pushServerComponentStack(task, debugInfo) {
      if (null != debugInfo)
        for (var i = 0; i < debugInfo.length; i++) {
          var componentInfo = debugInfo[i];
          "string" === typeof componentInfo.name &&
            void 0 !== componentInfo.debugStack &&
            ((task.componentStack = {
              parent: task.componentStack,
              type: componentInfo,
              owner: componentInfo.owner,
              stack: componentInfo.debugStack
            }),
            (task.debugTask = componentInfo.debugTask));
        }
    }
    function pushComponentStack(task) {
      var node = task.node;
      if ("object" === typeof node && null !== node)
        switch (node.$$typeof) {
          case REACT_ELEMENT_TYPE:
            var type = node.type,
              owner = node._owner,
              stack = node._debugStack;
            pushServerComponentStack(task, node._debugInfo);
            task.debugTask = node._debugTask;
            task.componentStack = {
              parent: task.componentStack,
              type: type,
              owner: owner,
              stack: stack
            };
            break;
          case REACT_LAZY_TYPE:
            pushServerComponentStack(task, node._debugInfo);
            break;
          default:
            "function" === typeof node.then &&
              pushServerComponentStack(task, node._debugInfo);
        }
    }
    function replaceSuspenseComponentStackWithSuspenseFallbackStack(
      componentStack
    ) {
      return null === componentStack
        ? null
        : {
            parent: componentStack.parent,
            type: "Suspense Fallback",
            owner: componentStack.owner,
            stack: componentStack.stack
          };
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
              var stack = info;
            } catch (x) {
              stack = "\nError generating stack: " + x.message + "\n" + x.stack;
            }
            Object.defineProperty(errorInfo, "componentStack", {
              value: stack
            });
            return stack;
          }
        });
      return errorInfo;
    }
    function encodeErrorForBoundary(
      boundary,
      digest,
      error,
      thrownInfo,
      wasAborted
    ) {
      boundary.errorDigest = digest;
      error instanceof Error
        ? ((digest = String(error.message)), (error = String(error.stack)))
        : ((digest =
            "object" === typeof error && null !== error
              ? describeObjectForErrorMessage(error)
              : String(error)),
          (error = null));
      wasAborted = wasAborted
        ? "Switched to client rendering because the server rendering aborted due to:\n\n"
        : "Switched to client rendering because the server rendering errored:\n\n";
      boundary.errorMessage = wasAborted + digest;
      boundary.errorStack = null !== error ? wasAborted + error : null;
      boundary.errorComponentStack = thrownInfo.componentStack;
    }
    function logRecoverableError(request, error, errorInfo, debugTask) {
      request = request.onError;
      error = debugTask
        ? debugTask.run(request.bind(null, error, errorInfo))
        : request(error, errorInfo);
      if (null != error && "string" !== typeof error)
        console.error(
          'onError returned something with a type other than "string". onError should return a string and may return null or undefined but must not return anything else. It received something of type "%s" instead',
          typeof error
        );
      else return error;
    }
    function fatalError(request, error, errorInfo, debugTask) {
      errorInfo = request.onShellError;
      var onFatalError = request.onFatalError;
      debugTask
        ? (debugTask.run(errorInfo.bind(null, error)),
          debugTask.run(onFatalError.bind(null, error)))
        : (errorInfo(error), onFatalError(error));
      null !== request.destination
        ? ((request.status = 14), closeWithError(request.destination, error))
        : ((request.status = 13), (request.fatalError = error));
    }
    function finishSuspenseListRow(request, row) {
      unblockSuspenseListRow(request, row.next, row.hoistables);
    }
    function unblockSuspenseListRow(
      request,
      unblockedRow,
      inheritedHoistables
    ) {
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
      if (
        null !== boundaries &&
        togetherRow.pendingTasks === boundaries.length
      ) {
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
        prevRow = task.row,
        previousComponentStack = task.componentStack;
      var previousDebugTask = task.debugTask;
      pushServerComponentStack(task, task.node.props.children._debugInfo);
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
              warnForMissingKey(request, task, i),
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
            warnForMissingKey(request, task, resumeSlots),
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
          var _node3 = rows[resumeSegmentID];
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
          warnForMissingKey(request, task, _node3);
          try {
            renderNode(request, task, _node3, resumeSegmentID),
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
      task.componentStack = previousComponentStack;
      task.debugTask = previousDebugTask;
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
      isInHookUserCodeInDev = !1;
      actionStateCounter = localIdCounter = 0;
      actionStateMatchingIndex = -1;
      thenableIndexCounter = 0;
      thenableState = prevThenableState;
      for (
        request = callComponentInDEV(Component, props, secondArg);
        didScheduleRenderPhaseUpdate;

      )
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
        for (var _propName in Component)
          void 0 === newProps[_propName] &&
            (newProps[_propName] = Component[_propName]);
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
          if (
            "contextType" in type &&
            null !== contextType &&
            (void 0 === contextType ||
              contextType.$$typeof !== REACT_CONTEXT_TYPE) &&
            !didWarnAboutInvalidateContextType.has(type)
          ) {
            didWarnAboutInvalidateContextType.add(type);
            var addendum =
              void 0 === contextType
                ? " However, it is set to undefined. This can be caused by a typo or by mixing up named and default imports. This can also happen due to a circular dependency, so try moving the createContext() call to a separate file."
                : "object" !== typeof contextType
                  ? " However, it is set to a " + typeof contextType + "."
                  : contextType.$$typeof === REACT_CONSUMER_TYPE
                    ? " Did you accidentally pass the Context.Consumer instead?"
                    : " However, it is set to an object with keys {" +
                      Object.keys(contextType).join(", ") +
                      "}.";
            console.error(
              "%s defines an invalid contextType. contextType should point to the Context object returned by React.createContext().%s",
              getComponentNameFromType(type) || "Component",
              addendum
            );
          }
          "object" === typeof contextType &&
            null !== contextType &&
            (context = contextType._currentValue2);
          var instance = new type(resolvedProps, context);
          if (
            "function" === typeof type.getDerivedStateFromProps &&
            (null === instance.state || void 0 === instance.state)
          ) {
            var componentName = getComponentNameFromType(type) || "Component";
            didWarnAboutUninitializedState.has(componentName) ||
              (didWarnAboutUninitializedState.add(componentName),
              console.error(
                "`%s` uses `getDerivedStateFromProps` but its initial state is %s. This is not recommended. Instead, define the initial state by assigning an object to `this.state` in the constructor of `%s`. This ensures that `getDerivedStateFromProps` arguments have a consistent shape.",
                componentName,
                null === instance.state ? "null" : "undefined",
                componentName
              ));
          }
          if (
            "function" === typeof type.getDerivedStateFromProps ||
            "function" === typeof instance.getSnapshotBeforeUpdate
          ) {
            var foundWillMountName = null,
              foundWillReceivePropsName = null,
              foundWillUpdateName = null;
            "function" === typeof instance.componentWillMount &&
            !0 !== instance.componentWillMount.__suppressDeprecationWarning
              ? (foundWillMountName = "componentWillMount")
              : "function" === typeof instance.UNSAFE_componentWillMount &&
                (foundWillMountName = "UNSAFE_componentWillMount");
            "function" === typeof instance.componentWillReceiveProps &&
            !0 !==
              instance.componentWillReceiveProps.__suppressDeprecationWarning
              ? (foundWillReceivePropsName = "componentWillReceiveProps")
              : "function" ===
                  typeof instance.UNSAFE_componentWillReceiveProps &&
                (foundWillReceivePropsName =
                  "UNSAFE_componentWillReceiveProps");
            "function" === typeof instance.componentWillUpdate &&
            !0 !== instance.componentWillUpdate.__suppressDeprecationWarning
              ? (foundWillUpdateName = "componentWillUpdate")
              : "function" === typeof instance.UNSAFE_componentWillUpdate &&
                (foundWillUpdateName = "UNSAFE_componentWillUpdate");
            if (
              null !== foundWillMountName ||
              null !== foundWillReceivePropsName ||
              null !== foundWillUpdateName
            ) {
              var _componentName =
                  getComponentNameFromType(type) || "Component",
                newApiName =
                  "function" === typeof type.getDerivedStateFromProps
                    ? "getDerivedStateFromProps()"
                    : "getSnapshotBeforeUpdate()";
              didWarnAboutLegacyLifecyclesAndDerivedState.has(_componentName) ||
                (didWarnAboutLegacyLifecyclesAndDerivedState.add(
                  _componentName
                ),
                console.error(
                  "Unsafe legacy lifecycles will not be called for components using new component APIs.\n\n%s uses %s but also contains the following legacy lifecycles:%s%s%s\n\nThe above lifecycles should be removed. Learn more about this warning here:\nhttps://react.dev/link/unsafe-component-lifecycles",
                  _componentName,
                  newApiName,
                  null !== foundWillMountName
                    ? "\n  " + foundWillMountName
                    : "",
                  null !== foundWillReceivePropsName
                    ? "\n  " + foundWillReceivePropsName
                    : "",
                  null !== foundWillUpdateName
                    ? "\n  " + foundWillUpdateName
                    : ""
                ));
            }
          }
          var name = getComponentNameFromType(type) || "Component";
          instance.render ||
            (type.prototype && "function" === typeof type.prototype.render
              ? console.error(
                  "No `render` method found on the %s instance: did you accidentally return an object from the constructor?",
                  name
                )
              : console.error(
                  "No `render` method found on the %s instance: you may have forgotten to define `render`.",
                  name
                ));
          !instance.getInitialState ||
            instance.getInitialState.isReactClassApproved ||
            instance.state ||
            console.error(
              "getInitialState was defined on %s, a plain JavaScript class. This is only supported for classes created using React.createClass. Did you mean to define a state property instead?",
              name
            );
          instance.getDefaultProps &&
            !instance.getDefaultProps.isReactClassApproved &&
            console.error(
              "getDefaultProps was defined on %s, a plain JavaScript class. This is only supported for classes created using React.createClass. Use a static property to define defaultProps instead.",
              name
            );
          instance.contextType &&
            console.error(
              "contextType was defined as an instance property on %s. Use a static property to define contextType instead.",
              name
            );
          type.childContextTypes &&
            !didWarnAboutChildContextTypes.has(type) &&
            (didWarnAboutChildContextTypes.add(type),
            console.error(
              "%s uses the legacy childContextTypes API which was removed in React 19. Use React.createContext() instead. (https://react.dev/link/legacy-context)",
              name
            ));
          type.contextTypes &&
            !didWarnAboutContextTypes$1.has(type) &&
            (didWarnAboutContextTypes$1.add(type),
            console.error(
              "%s uses the legacy contextTypes API which was removed in React 19. Use React.createContext() with static contextType instead. (https://react.dev/link/legacy-context)",
              name
            ));
          "function" === typeof instance.componentShouldUpdate &&
            console.error(
              "%s has a method called componentShouldUpdate(). Did you mean shouldComponentUpdate()? The name is phrased as a question because the function is expected to return a value.",
              name
            );
          type.prototype &&
            type.prototype.isPureReactComponent &&
            "undefined" !== typeof instance.shouldComponentUpdate &&
            console.error(
              "%s has a method called shouldComponentUpdate(). shouldComponentUpdate should not be used when extending React.PureComponent. Please extend React.Component if shouldComponentUpdate is used.",
              getComponentNameFromType(type) || "A pure component"
            );
          "function" === typeof instance.componentDidUnmount &&
            console.error(
              "%s has a method called componentDidUnmount(). But there is no such lifecycle method. Did you mean componentWillUnmount()?",
              name
            );
          "function" === typeof instance.componentDidReceiveProps &&
            console.error(
              "%s has a method called componentDidReceiveProps(). But there is no such lifecycle method. If you meant to update the state in response to changing props, use componentWillReceiveProps(). If you meant to fetch data or run side-effects or mutations after React has updated the UI, use componentDidUpdate().",
              name
            );
          "function" === typeof instance.componentWillRecieveProps &&
            console.error(
              "%s has a method called componentWillRecieveProps(). Did you mean componentWillReceiveProps()?",
              name
            );
          "function" === typeof instance.UNSAFE_componentWillRecieveProps &&
            console.error(
              "%s has a method called UNSAFE_componentWillRecieveProps(). Did you mean UNSAFE_componentWillReceiveProps()?",
              name
            );
          var hasMutatedProps = instance.props !== resolvedProps;
          void 0 !== instance.props &&
            hasMutatedProps &&
            console.error(
              "When calling super() in `%s`, make sure to pass up the same props that your component's constructor was passed.",
              name
            );
          instance.defaultProps &&
            console.error(
              "Setting defaultProps as an instance property on %s is not supported and will be ignored. Instead, define defaultProps as a static property on %s.",
              name,
              name
            );
          "function" !== typeof instance.getSnapshotBeforeUpdate ||
            "function" === typeof instance.componentDidUpdate ||
            didWarnAboutGetSnapshotBeforeUpdateWithoutDidUpdate.has(type) ||
            (didWarnAboutGetSnapshotBeforeUpdateWithoutDidUpdate.add(type),
            console.error(
              "%s: getSnapshotBeforeUpdate() should be used with componentDidUpdate(). This component defines getSnapshotBeforeUpdate() only.",
              getComponentNameFromType(type)
            ));
          "function" === typeof instance.getDerivedStateFromProps &&
            console.error(
              "%s: getDerivedStateFromProps() is defined as an instance method and will be ignored. Instead, declare it as a static method.",
              name
            );
          "function" === typeof instance.getDerivedStateFromError &&
            console.error(
              "%s: getDerivedStateFromError() is defined as an instance method and will be ignored. Instead, declare it as a static method.",
              name
            );
          "function" === typeof type.getSnapshotBeforeUpdate &&
            console.error(
              "%s: getSnapshotBeforeUpdate() is defined as a static method and will be ignored. Instead, declare it as an instance method.",
              name
            );
          var state = instance.state;
          state &&
            ("object" !== typeof state || isArrayImpl(state)) &&
            console.error("%s.state: must be set to an object or null", name);
          "function" === typeof instance.getChildContext &&
            "object" !== typeof type.childContextTypes &&
            console.error(
              "%s.getChildContext(): childContextTypes must be defined in order to use getChildContext().",
              name
            );
          var initialState = void 0 !== instance.state ? instance.state : null;
          instance.updater = classComponentUpdater;
          instance.props = resolvedProps;
          instance.state = initialState;
          var internalInstance = { queue: [], replace: !1 };
          instance._reactInternals = internalInstance;
          var contextType$jscomp$0 = type.contextType;
          instance.context =
            "object" === typeof contextType$jscomp$0 &&
            null !== contextType$jscomp$0
              ? contextType$jscomp$0._currentValue2
              : emptyContextObject;
          if (instance.state === resolvedProps) {
            var componentName$jscomp$0 =
              getComponentNameFromType(type) || "Component";
            didWarnAboutDirectlyAssigningPropsToState.has(
              componentName$jscomp$0
            ) ||
              (didWarnAboutDirectlyAssigningPropsToState.add(
                componentName$jscomp$0
              ),
              console.error(
                "%s: It is not recommended to assign props directly to state because updates to props won't be reflected in state. In most cases, it is better to use props directly.",
                componentName$jscomp$0
              ));
          }
          var getDerivedStateFromProps = type.getDerivedStateFromProps;
          if ("function" === typeof getDerivedStateFromProps) {
            var partialState = getDerivedStateFromProps(
              resolvedProps,
              initialState
            );
            if (void 0 === partialState) {
              var componentName$jscomp$1 =
                getComponentNameFromType(type) || "Component";
              didWarnAboutUndefinedDerivedState.has(componentName$jscomp$1) ||
                (didWarnAboutUndefinedDerivedState.add(componentName$jscomp$1),
                console.error(
                  "%s.getDerivedStateFromProps(): A valid state object (or null) must be returned. You have returned undefined.",
                  componentName$jscomp$1
                ));
            }
            var JSCompiler_inline_result =
              null === partialState || void 0 === partialState
                ? initialState
                : assign({}, initialState, partialState);
            instance.state = JSCompiler_inline_result;
          }
          if (
            "function" !== typeof type.getDerivedStateFromProps &&
            "function" !== typeof instance.getSnapshotBeforeUpdate &&
            ("function" === typeof instance.UNSAFE_componentWillMount ||
              "function" === typeof instance.componentWillMount)
          ) {
            var oldState = instance.state;
            if ("function" === typeof instance.componentWillMount) {
              if (
                !0 !== instance.componentWillMount.__suppressDeprecationWarning
              ) {
                var componentName$jscomp$2 =
                  getComponentNameFromType(type) || "Unknown";
                didWarnAboutDeprecatedWillMount[componentName$jscomp$2] ||
                  (console.warn(
                    "componentWillMount has been renamed, and is not recommended for use. See https://react.dev/link/unsafe-component-lifecycles for details.\n\n* Move code from componentWillMount to componentDidMount (preferred in most cases) or the constructor.\n\nPlease update the following components: %s",
                    componentName$jscomp$2
                  ),
                  (didWarnAboutDeprecatedWillMount[componentName$jscomp$2] =
                    !0));
              }
              instance.componentWillMount();
            }
            "function" === typeof instance.UNSAFE_componentWillMount &&
              instance.UNSAFE_componentWillMount();
            oldState !== instance.state &&
              (console.error(
                "%s.componentWillMount(): Assigning directly to this.state is deprecated (except inside a component's constructor). Use setState instead.",
                getComponentNameFromType(type) || "Component"
              ),
              classComponentUpdater.enqueueReplaceState(
                instance,
                instance.state,
                null
              ));
            if (
              null !== internalInstance.queue &&
              0 < internalInstance.queue.length
            ) {
              var oldQueue = internalInstance.queue,
                oldReplace = internalInstance.replace;
              internalInstance.queue = null;
              internalInstance.replace = !1;
              if (oldReplace && 1 === oldQueue.length)
                instance.state = oldQueue[0];
              else {
                for (
                  var nextState = oldReplace ? oldQueue[0] : instance.state,
                    dontMutate = !0,
                    i = oldReplace ? 1 : 0;
                  i < oldQueue.length;
                  i++
                ) {
                  var partial = oldQueue[i],
                    partialState$jscomp$0 =
                      "function" === typeof partial
                        ? partial.call(
                            instance,
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
                instance.state = nextState;
              }
            } else internalInstance.queue = null;
          }
          var nextChildren = callRenderInDEV(instance);
          if (12 === request.status) throw null;
          instance.props !== resolvedProps &&
            (didWarnAboutReassigningProps ||
              console.error(
                "It looks like %s is reassigning its own `this.props` while rendering. This is not supported and can lead to confusing bugs.",
                getComponentNameFromType(type) || "a component"
              ),
            (didWarnAboutReassigningProps = !0));
          var prevKeyPath = task.keyPath;
          task.keyPath = keyPath;
          renderNodeDestructive(request, task, nextChildren, -1);
          task.keyPath = prevKeyPath;
        } else {
          if (type.prototype && "function" === typeof type.prototype.render) {
            var componentName$jscomp$3 =
              getComponentNameFromType(type) || "Unknown";
            didWarnAboutBadClass[componentName$jscomp$3] ||
              (console.error(
                "The <%s /> component appears to have a render method, but doesn't extend React.Component. This is likely to cause errors. Change %s to extend React.Component instead.",
                componentName$jscomp$3,
                componentName$jscomp$3
              ),
              (didWarnAboutBadClass[componentName$jscomp$3] = !0));
          }
          var value = renderWithHooks(
            request,
            task,
            keyPath,
            type,
            props,
            void 0
          );
          if (12 === request.status) throw null;
          var hasId = 0 !== localIdCounter,
            actionStateCount = actionStateCounter,
            actionStateMatchingIndex$jscomp$0 = actionStateMatchingIndex;
          if (type.contextTypes) {
            var _componentName$jscomp$0 =
              getComponentNameFromType(type) || "Unknown";
            didWarnAboutContextTypes[_componentName$jscomp$0] ||
              ((didWarnAboutContextTypes[_componentName$jscomp$0] = !0),
              console.error(
                "%s uses the legacy contextTypes API which was removed in React 19. Use React.createContext() with React.useContext() instead. (https://react.dev/link/legacy-context)",
                _componentName$jscomp$0
              ));
          }
          type &&
            type.childContextTypes &&
            console.error(
              "childContextTypes cannot be defined on a function component.\n  %s.childContextTypes = ...",
              type.displayName || type.name || "Component"
            );
          if ("function" === typeof type.getDerivedStateFromProps) {
            var componentName$jscomp$4 =
              getComponentNameFromType(type) || "Unknown";
            didWarnAboutGetDerivedStateOnFunctionComponent[
              componentName$jscomp$4
            ] ||
              (console.error(
                "%s: Function components do not support getDerivedStateFromProps.",
                componentName$jscomp$4
              ),
              (didWarnAboutGetDerivedStateOnFunctionComponent[
                componentName$jscomp$4
              ] = !0));
          }
          if (
            "object" === typeof type.contextType &&
            null !== type.contextType
          ) {
            var _componentName2 = getComponentNameFromType(type) || "Unknown";
            didWarnAboutContextTypeOnFunctionComponent[_componentName2] ||
              (console.error(
                "%s: Function components do not support contextType.",
                _componentName2
              ),
              (didWarnAboutContextTypeOnFunctionComponent[_componentName2] =
                !0));
          }
          finishFunctionComponent(
            request,
            task,
            keyPath,
            value,
            hasId,
            actionStateCount,
            actionStateMatchingIndex$jscomp$0
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
          var _children = pushStartInstance(
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
          var _prevContext2 = task.formatContext,
            _prevKeyPath3 = task.keyPath;
          task.keyPath = keyPath;
          var newContext = (task.formatContext = getChildFormatContext(
            _prevContext2,
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
                renderNode(request, task, _children, -1),
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
          } else renderNode(request, task, _children, -1);
          task.formatContext = _prevContext2;
          task.keyPath = _prevKeyPath3;
          pushEndInstance(
            segment.chunks,
            type,
            props,
            request.resumableState,
            _prevContext2
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
              var _prevKeyPath4 = task.keyPath;
              task.keyPath = keyPath;
              renderNode(request, task, props.children, -1);
              task.keyPath = _prevKeyPath4;
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
                    validateIterable(
                      task,
                      children$jscomp$0,
                      -1,
                      iterator,
                      iteratorFn
                    );
                    var step = iterator.next();
                    if (!step.done) {
                      var rows = [];
                      do rows.push(step.value), (step = iterator.next());
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
                  var _iterator = children$jscomp$0[ASYNC_ITERATOR]();
                  if (_iterator) {
                    validateAsyncIterable(
                      task,
                      children$jscomp$0,
                      -1,
                      _iterator
                    );
                    var prevThenableState = task.thenableState;
                    task.thenableState = null;
                    thenableIndexCounter = 0;
                    thenableState = prevThenableState;
                    var _rows = [],
                      done = !1;
                    if (_iterator === children$jscomp$0)
                      for (
                        var _step = readPreviousThenableFromState();
                        void 0 !== _step;

                      ) {
                        if (_step.done) {
                          done = !0;
                          break;
                        }
                        _rows.push(_step.value);
                        _step = readPreviousThenableFromState();
                      }
                    if (!done)
                      for (
                        var _step2 = unwrapThenable(_iterator.next());
                        !_step2.done;

                      )
                        _rows.push(_step2.value),
                          (_step2 = unwrapThenable(_iterator.next()));
                    renderSuspenseListRows(
                      request,
                      task,
                      keyPath,
                      _rows,
                      revealOrder
                    );
                    break a;
                  }
                }
              }
              if ("together" === revealOrder) {
                var _prevKeyPath2 = task.keyPath,
                  prevRow = task.row,
                  newRow = (task.row = createSuspenseListRow(null));
                newRow.boundaries = [];
                newRow.together = !0;
                task.keyPath = keyPath;
                renderNodeDestructive(request, task, children$jscomp$0, -1);
                0 === --newRow.pendingTasks &&
                  finishSuspenseListRow(request, newRow);
                task.keyPath = _prevKeyPath2;
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
              var autoName = props.name;
            else {
              var treeId = getTreeId(task.treeContext);
              autoName = makeId(resumableState, treeId, 0);
            }
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
            throw Error(
              "ReactDOMServer does not yet support scope components."
            );
          case REACT_SUSPENSE_TYPE:
            a: if (null !== task.replay) {
              var _prevKeyPath = task.keyPath,
                _prevContext = task.formatContext,
                _prevRow = task.row;
              task.keyPath = keyPath;
              task.formatContext = getSuspenseContentFormatContext(
                request.resumableState,
                _prevContext
              );
              task.row = null;
              var _content = props.children;
              try {
                renderNode(request, task, _content, -1);
              } finally {
                (task.keyPath = _prevKeyPath),
                  (task.formatContext = _prevContext),
                  (task.row = _prevRow);
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
                  fallbackKeyPath = [
                    keyPath[0],
                    "Suspense Fallback",
                    keyPath[2]
                  ];
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
                  suspenseComponentStack,
                  emptyContextObject,
                  task.debugTask
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
                } catch (thrownValue$2) {
                  newBoundary.status = 4;
                  if (12 === request.status) {
                    contentRootSegment.status = 3;
                    var error = request.fatalError;
                  } else
                    (contentRootSegment.status = 4), (error = thrownValue$2);
                  var thrownInfo = getThrownInfo(task.componentStack),
                    errorDigest = logRecoverableError(
                      request,
                      error,
                      thrownInfo,
                      task.debugTask
                    );
                  encodeErrorForBoundary(
                    newBoundary,
                    errorDigest,
                    error,
                    thrownInfo,
                    !1
                  );
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
                  ),
                  emptyContextObject,
                  task.debugTask
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
              var value$jscomp$0 = props.value,
                children$jscomp$2 = props.children;
              var prevSnapshot = task.context;
              var prevKeyPath$jscomp$6 = task.keyPath;
              var prevValue = type._currentValue2;
              type._currentValue2 = value$jscomp$0;
              void 0 !== type._currentRenderer2 &&
                null !== type._currentRenderer2 &&
                type._currentRenderer2 !== rendererSigil &&
                console.error(
                  "Detected multiple renderers concurrently rendering the same context provider. This is currently unsupported."
                );
              type._currentRenderer2 = rendererSigil;
              var prevNode = currentActiveSnapshot,
                newNode = {
                  parent: prevNode,
                  depth: null === prevNode ? 0 : prevNode.depth + 1,
                  context: type,
                  parentValue: prevValue,
                  value: value$jscomp$0
                };
              currentActiveSnapshot = newNode;
              task.context = newNode;
              task.keyPath = keyPath;
              renderNodeDestructive(request, task, children$jscomp$2, -1);
              var prevSnapshot$jscomp$0 = currentActiveSnapshot;
              if (null === prevSnapshot$jscomp$0)
                throw Error(
                  "Tried to pop a Context at the root of the app. This is a bug in React."
                );
              prevSnapshot$jscomp$0.context !== type &&
                console.error(
                  "The parent context is not the expected context. This is probably a bug in React."
                );
              prevSnapshot$jscomp$0.context._currentValue2 =
                prevSnapshot$jscomp$0.parentValue;
              void 0 !== type._currentRenderer2 &&
                null !== type._currentRenderer2 &&
                type._currentRenderer2 !== rendererSigil &&
                console.error(
                  "Detected multiple renderers concurrently rendering the same context provider. This is currently unsupported."
                );
              type._currentRenderer2 = rendererSigil;
              var JSCompiler_inline_result$jscomp$0 = (currentActiveSnapshot =
                prevSnapshot$jscomp$0.parent);
              task.context = JSCompiler_inline_result$jscomp$0;
              task.keyPath = prevKeyPath$jscomp$6;
              prevSnapshot !== task.context &&
                console.error(
                  "Popping the context provider did not return back to the original snapshot. This is a bug in React."
                );
              return;
            case REACT_CONSUMER_TYPE:
              var context$jscomp$0 = type._context,
                render = props.children;
              "function" !== typeof render &&
                console.error(
                  "A context consumer was rendered with multiple children, or a child that isn't a function. A context consumer expects a single child that is a function. If you did pass a function, make sure there is no trailing or leading whitespace around it."
                );
              var newChildren = render(context$jscomp$0._currentValue2),
                prevKeyPath$jscomp$7 = task.keyPath;
              task.keyPath = keyPath;
              renderNodeDestructive(request, task, newChildren, -1);
              task.keyPath = prevKeyPath$jscomp$7;
              return;
            case REACT_LAZY_TYPE:
              var Component = callLazyInitInDEV(type);
              if (12 === request.status && 15 !== request.status) throw null;
              renderElement(request, task, keyPath, Component, props, ref);
              return;
          }
        var info = "";
        if (
          void 0 === type ||
          ("object" === typeof type &&
            null !== type &&
            0 === Object.keys(type).length)
        )
          info +=
            " You likely forgot to export your component from the file it's defined in, or you might have mixed up default and named imports.";
        throw Error(
          "Element type is invalid: expected a string (for built-in components) or a class/function (for composite components) but got: " +
            ((null == type ? type : typeof type) + "." + info)
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
    function replayElement(
      request,
      task,
      keyPath,
      name,
      keyOrIndex,
      childIndex,
      type,
      props,
      ref,
      replay
    ) {
      childIndex = replay.nodes;
      for (var i = 0; i < childIndex.length; i++) {
        var node = childIndex[i];
        if (keyOrIndex === node[1]) {
          if (4 === node.length) {
            if (null !== name && name !== node[0])
              throw Error(
                "Expected the resume to render <" +
                  node[0] +
                  "> in this slot but instead it rendered <" +
                  name +
                  ">. The tree doesn't match so React will fallback to client rendering."
              );
            var childNodes = node[2],
              childSlots = node[3];
            name = task.node;
            task.replay = {
              nodes: childNodes,
              slots: childSlots,
              pendingTasks: 1
            };
            try {
              renderElement(request, task, keyPath, type, props, ref);
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
                (x === SuspenseException || "function" === typeof x.then)
              )
                throw (
                  (task.node === name
                    ? (task.replay = replay)
                    : childIndex.splice(i, 1),
                  x)
                );
              task.replay.pendingTasks--;
              type = getThrownInfo(task.componentStack);
              props = request;
              keyPath = task.blockedBoundary;
              request = x;
              ref = logRecoverableError(props, request, type, task.debugTask);
              abortRemainingReplayNodes(
                props,
                keyPath,
                childNodes,
                childSlots,
                request,
                ref,
                type,
                !1
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
            a: {
              replay = request;
              request = node[5];
              type = node[2];
              ref = node[3];
              name = null === node[4] ? [] : node[4][2];
              node = null === node[4] ? null : node[4][3];
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
                replay,
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
              defer.rootSegmentID = request;
              task.blockedBoundary = defer;
              task.hoistableState = defer.contentState;
              task.keyPath = keyPath;
              task.formatContext = getSuspenseContentFormatContext(
                replay.resumableState,
                prevContext
              );
              task.row = null;
              task.replay = { nodes: type, slots: ref, pendingTasks: 1 };
              try {
                renderNode(replay, task, content, -1);
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
                  replay.completedBoundaries.push(defer);
                  break a;
                }
              } catch (error) {
                (defer.status = 4),
                  (childNodes = getThrownInfo(task.componentStack)),
                  (childSlots = logRecoverableError(
                    replay,
                    error,
                    childNodes,
                    task.debugTask
                  )),
                  encodeErrorForBoundary(
                    defer,
                    childSlots,
                    error,
                    childNodes,
                    !1
                  ),
                  task.replay.pendingTasks--,
                  replay.clientRenderedBoundaries.push(defer);
              } finally {
                (task.blockedBoundary = parentBoundary),
                  (task.hoistableState = parentHoistableState),
                  (task.replay = previousReplaySet),
                  (task.keyPath = keyOrIndex),
                  (task.formatContext = prevContext),
                  (task.row = prevRow);
              }
              props = createReplayTask(
                replay,
                null,
                { nodes: name, slots: node, pendingTasks: 0 },
                fallback,
                -1,
                parentBoundary,
                defer.fallbackState,
                props,
                [keyPath[0], "Suspense Fallback", keyPath[2]],
                getSuspenseFallbackFormatContext(
                  replay.resumableState,
                  task.formatContext
                ),
                task.context,
                task.treeContext,
                task.row,
                replaceSuspenseComponentStackWithSuspenseFallbackStack(
                  task.componentStack
                ),
                emptyContextObject,
                task.debugTask
              );
              pushComponentStack(props);
              replay.pingedTasks.push(props);
            }
          }
          childIndex.splice(i, 1);
          break;
        }
      }
    }
    function validateIterable(
      task,
      iterable,
      childIndex,
      iterator,
      iteratorFn
    ) {
      if (iterator === iterable) {
        if (
          -1 !== childIndex ||
          null === task.componentStack ||
          "function" !== typeof task.componentStack.type ||
          "[object GeneratorFunction]" !==
            Object.prototype.toString.call(task.componentStack.type) ||
          "[object Generator]" !== Object.prototype.toString.call(iterator)
        )
          didWarnAboutGenerators ||
            console.error(
              "Using Iterators as children is unsupported and will likely yield unexpected results because enumerating a generator mutates it. You may convert it to an array with `Array.from()` or the `[...spread]` operator before rendering. You can also use an Iterable that can iterate multiple times over the same items."
            ),
            (didWarnAboutGenerators = !0);
      } else
        iterable.entries !== iteratorFn ||
          didWarnAboutMaps ||
          (console.error(
            "Using Maps as children is not supported. Use an array of keyed ReactElements instead."
          ),
          (didWarnAboutMaps = !0));
    }
    function validateAsyncIterable(task, iterable, childIndex, iterator) {
      iterator !== iterable ||
        (-1 === childIndex &&
          null !== task.componentStack &&
          "function" === typeof task.componentStack.type &&
          "[object AsyncGeneratorFunction]" ===
            Object.prototype.toString.call(task.componentStack.type) &&
          "[object AsyncGenerator]" ===
            Object.prototype.toString.call(iterator)) ||
        (didWarnAboutGenerators ||
          console.error(
            "Using AsyncIterators as children is unsupported and will likely yield unexpected results because enumerating a generator mutates it. You can use an AsyncIterable that can iterate multiple times over the same items."
          ),
        (didWarnAboutGenerators = !0));
    }
    function renderNodeDestructive(request, task, node, childIndex) {
      null !== task.replay && "number" === typeof task.replay.slots
        ? resumeNode(request, task, task.replay.slots, node, childIndex)
        : ((task.node = node),
          (task.childIndex = childIndex),
          (node = task.componentStack),
          (childIndex = task.debugTask),
          pushComponentStack(task),
          retryNode(request, task),
          (task.componentStack = node),
          (task.debugTask = childIndex));
    }
    function retryNode(request, task) {
      var node = task.node,
        childIndex = task.childIndex;
      if (null !== node) {
        if ("object" === typeof node) {
          switch (node.$$typeof) {
            case REACT_ELEMENT_TYPE:
              var type = node.type,
                key = node.key;
              node = node.props;
              var refProp = node.ref;
              refProp = void 0 !== refProp ? refProp : null;
              var debugTask = task.debugTask,
                name = getComponentNameFromType(type);
              key =
                null == key || key === REACT_OPTIMISTIC_KEY
                  ? -1 === childIndex
                    ? 0
                    : childIndex
                  : key;
              var keyPath = [task.keyPath, name, key];
              null !== task.replay
                ? debugTask
                  ? debugTask.run(
                      replayElement.bind(
                        null,
                        request,
                        task,
                        keyPath,
                        name,
                        key,
                        childIndex,
                        type,
                        node,
                        refProp,
                        task.replay
                      )
                    )
                  : replayElement(
                      request,
                      task,
                      keyPath,
                      name,
                      key,
                      childIndex,
                      type,
                      node,
                      refProp,
                      task.replay
                    )
                : debugTask
                  ? debugTask.run(
                      renderElement.bind(
                        null,
                        request,
                        task,
                        keyPath,
                        type,
                        node,
                        refProp
                      )
                    )
                  : renderElement(request, task, keyPath, type, node, refProp);
              return;
            case REACT_PORTAL_TYPE:
              throw Error(
                "Portals are not currently supported by the server renderer. Render them conditionally so that they only appear on the client render."
              );
            case REACT_LAZY_TYPE:
              node = callLazyInitInDEV(node);
              if (12 === request.status) throw null;
              renderNodeDestructive(request, task, node, childIndex);
              return;
          }
          if (isArrayImpl(node)) {
            renderChildrenArray(request, task, node, childIndex);
            return;
          }
          if ((key = getIteratorFn(node)))
            if ((type = key.call(node))) {
              validateIterable(task, node, childIndex, type, key);
              node = type.next();
              if (!node.done) {
                key = [];
                do key.push(node.value), (node = type.next());
                while (!node.done);
                renderChildrenArray(request, task, key, childIndex);
              }
              return;
            }
          if (
            "function" === typeof node[ASYNC_ITERATOR] &&
            (type = node[ASYNC_ITERATOR]())
          ) {
            validateAsyncIterable(task, node, childIndex, type);
            key = task.thenableState;
            task.thenableState = null;
            thenableIndexCounter = 0;
            thenableState = key;
            key = [];
            refProp = !1;
            if (type === node)
              for (node = readPreviousThenableFromState(); void 0 !== node; ) {
                if (node.done) {
                  refProp = !0;
                  break;
                }
                key.push(node.value);
                node = readPreviousThenableFromState();
              }
            if (!refProp)
              for (node = unwrapThenable(type.next()); !node.done; )
                key.push(node.value), (node = unwrapThenable(type.next()));
            renderChildrenArray(request, task, key, childIndex);
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
          request = Object.prototype.toString.call(node);
          throw Error(
            "Objects are not valid as a React child (found: " +
              ("[object Object]" === request
                ? "object with keys {" + Object.keys(node).join(", ") + "}"
                : request) +
              "). If you meant to render a collection of children, use an array instead."
          );
        }
        "string" === typeof node
          ? ((task = task.blockedSegment),
            null !== task &&
              (task.lastPushedText = pushTextInstance(
                task.chunks,
                node,
                request.renderState,
                task.lastPushedText
              )))
          : "number" === typeof node || "bigint" === typeof node
            ? ((task = task.blockedSegment),
              null !== task &&
                (task.lastPushedText = pushTextInstance(
                  task.chunks,
                  "" + node,
                  request.renderState,
                  task.lastPushedText
                )))
            : ("function" === typeof node &&
                ((request = node.displayName || node.name || "Component"),
                console.error(
                  "Functions are not valid as a React child. This may happen if you return %s instead of <%s /> from render. Or maybe you meant to call this function rather than return it.",
                  request,
                  request
                )),
              "symbol" === typeof node &&
                console.error(
                  "Symbols are not valid as a React child.\n  %s",
                  String(node)
                ));
      }
    }
    function warnForMissingKey(request, task, child) {
      if (
        null !== child &&
        "object" === typeof child &&
        (child.$$typeof === REACT_ELEMENT_TYPE ||
          child.$$typeof === REACT_PORTAL_TYPE) &&
        child._store &&
        ((!child._store.validated && null == child.key) ||
          2 === child._store.validated)
      ) {
        if ("object" !== typeof child._store)
          throw Error(
            "React Component in warnForMissingKey should have a _store. This error is likely caused by a bug in React. Please file an issue."
          );
        child._store.validated = 1;
        var didWarnForKey = request.didWarnForKey;
        null == didWarnForKey &&
          (didWarnForKey = request.didWarnForKey = new WeakSet());
        request = task.componentStack;
        if (null !== request && !didWarnForKey.has(request)) {
          didWarnForKey.add(request);
          var componentName = getComponentNameFromType(child.type);
          didWarnForKey = child._owner;
          var parentOwner = request.owner;
          request = "";
          if (parentOwner && "undefined" !== typeof parentOwner.type) {
            var name = getComponentNameFromType(parentOwner.type);
            name &&
              (request = "\n\nCheck the render method of `" + name + "`.");
          }
          request ||
            (componentName &&
              (request =
                "\n\nCheck the top-level render call using <" +
                componentName +
                ">."));
          componentName = "";
          null != didWarnForKey &&
            parentOwner !== didWarnForKey &&
            ((parentOwner = null),
            "undefined" !== typeof didWarnForKey.type
              ? (parentOwner = getComponentNameFromType(didWarnForKey.type))
              : "string" === typeof didWarnForKey.name &&
                (parentOwner = didWarnForKey.name),
            parentOwner &&
              (componentName =
                " It was passed a child from " + parentOwner + "."));
          didWarnForKey = task.componentStack;
          task.componentStack = {
            parent: task.componentStack,
            type: child.type,
            owner: child._owner,
            stack: child._debugStack
          };
          console.error(
            'Each child in a list should have a unique "key" prop.%s%s See https://react.dev/link/warning-keys for more information.',
            request,
            componentName
          );
          task.componentStack = didWarnForKey;
        }
      }
    }
    function renderChildrenArray(request, task, children, childIndex) {
      var prevKeyPath = task.keyPath,
        previousComponentStack = task.componentStack;
      var previousDebugTask = task.debugTask;
      pushServerComponentStack(task, task.node._debugInfo);
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
                (x === SuspenseException || "function" === typeof x.then)
              )
                throw x;
              task.replay.pendingTasks--;
              var thrownInfo = getThrownInfo(task.componentStack);
              children = task.blockedBoundary;
              var error = x,
                errorDigest = logRecoverableError(
                  request,
                  error,
                  thrownInfo,
                  task.debugTask
                );
              abortRemainingReplayNodes(
                request,
                children,
                childIndex,
                node,
                error,
                errorDigest,
                thrownInfo,
                !1
              );
            }
            task.replay = replay;
            replayNodes.splice(j, 1);
            break;
          }
        }
        task.keyPath = prevKeyPath;
        task.componentStack = previousComponentStack;
        task.debugTask = previousDebugTask;
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
            (task.treeContext = pushTreeContext(
              replay,
              replayNodes,
              childIndex
            )),
            (error = j[childIndex]),
            "number" === typeof error
              ? (resumeNode(request, task, error, node, childIndex),
                delete j[childIndex])
              : renderNode(request, task, node, childIndex);
        task.treeContext = replay;
        task.keyPath = prevKeyPath;
        task.componentStack = previousComponentStack;
        task.debugTask = previousDebugTask;
        return;
      }
      for (j = 0; j < replayNodes; j++)
        (childIndex = children[j]),
          warnForMissingKey(request, task, childIndex),
          (task.treeContext = pushTreeContext(replay, replayNodes, j)),
          renderNode(request, task, childIndex, j);
      task.treeContext = replay;
      task.keyPath = prevKeyPath;
      task.componentStack = previousComponentStack;
      task.debugTask = previousDebugTask;
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
        task.componentStack,
        emptyContextObject,
        task.debugTask
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
        task.componentStack,
        emptyContextObject,
        task.debugTask
      );
    }
    function renderNode(request, task, node, childIndex) {
      var previousFormatContext = task.formatContext,
        previousContext = task.context,
        previousKeyPath = task.keyPath,
        previousTreeContext = task.treeContext,
        previousComponentStack = task.componentStack,
        previousDebugTask = task.debugTask,
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
              task.debugTask = previousDebugTask;
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
              task.debugTask = previousDebugTask;
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
        } catch (thrownValue$3) {
          if (
            (resetHooksState(),
            (segment.children.length = childrenLength),
            (segment.chunks.length = chunkLength),
            (node =
              thrownValue$3 === SuspenseException
                ? getSuspendedThenable()
                : thrownValue$3),
            12 !== request.status && "object" === typeof node && null !== node)
          ) {
            if ("function" === typeof node.then) {
              segment = node;
              node =
                thrownValue$3 === SuspenseException
                  ? getThenableStateAfterSuspending()
                  : null;
              request = spawnNewSuspendedRenderTask(request, task, node).ping;
              segment.then(request, request);
              task.formatContext = previousFormatContext;
              task.context = previousContext;
              task.keyPath = previousKeyPath;
              task.treeContext = previousTreeContext;
              task.componentStack = previousComponentStack;
              task.debugTask = previousDebugTask;
              switchContext(previousContext);
              return;
            }
            if ("Maximum call stack size exceeded" === node.message) {
              segment =
                thrownValue$3 === SuspenseException
                  ? getThenableStateAfterSuspending()
                  : null;
              segment = spawnNewSuspendedRenderTask(request, task, segment);
              request.pingedTasks.push(segment);
              task.formatContext = previousFormatContext;
              task.context = previousContext;
              task.keyPath = previousKeyPath;
              task.treeContext = previousTreeContext;
              task.componentStack = previousComponentStack;
              task.debugTask = previousDebugTask;
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
      error$jscomp$0,
      errorDigest$jscomp$0,
      errorInfo$jscomp$0,
      aborted
    ) {
      for (var i = 0; i < nodes.length; i++) {
        var node = nodes[i];
        if (4 === node.length)
          abortRemainingReplayNodes(
            request$jscomp$0,
            boundary,
            node[2],
            node[3],
            error$jscomp$0,
            errorDigest$jscomp$0,
            errorInfo$jscomp$0,
            aborted
          );
        else {
          var request = request$jscomp$0;
          node = node[5];
          var error = error$jscomp$0,
            errorDigest = errorDigest$jscomp$0,
            errorInfo = errorInfo$jscomp$0,
            wasAborted = aborted,
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
          encodeErrorForBoundary(
            resumedBoundary,
            errorDigest,
            error,
            errorInfo,
            wasAborted
          );
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
          encodeErrorForBoundary(
            boundary,
            errorDigest$jscomp$0,
            error$jscomp$0,
            errorInfo$jscomp$0,
            aborted
          ),
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
      var errorInfo = getThrownInfo(task.componentStack),
        node = task.node;
      if (null !== node && "object" === typeof node) {
        for (
          var debugInfo = node._debugInfo;
          "object" === typeof node &&
          null !== node &&
          node.$$typeof === REACT_LAZY_TYPE;

        ) {
          var payload = node._payload;
          if ("fulfilled" === payload.status) node = payload.value;
          else break;
        }
        "object" === typeof node &&
          null !== node &&
          (isArrayImpl(node) ||
            "function" === typeof node[ASYNC_ITERATOR] ||
            node.$$typeof === REACT_ELEMENT_TYPE ||
            node.$$typeof === REACT_LAZY_TYPE) &&
          isArrayImpl(node._debugInfo) &&
          (debugInfo = node._debugInfo);
        pushHaltedAwaitOnComponentStack(task, debugInfo);
        null !== task.thenableState &&
          pushSuspendedCallSiteOnComponentStack(request, task);
      }
      if (null === boundary) {
        if (13 !== request.status && 14 !== request.status) {
          boundary = task.replay;
          if (null === boundary) {
            null !== request.trackedPostpones && null !== segment
              ? ((boundary = request.trackedPostpones),
                logRecoverableError(request, error, errorInfo, task.debugTask),
                trackPostpone(request, boundary, task, segment),
                finishedTask(request, null, task.row, segment))
              : (logRecoverableError(request, error, errorInfo, task.debugTask),
                fatalError(request, error, errorInfo, task.debugTask));
            return;
          }
          boundary.pendingTasks--;
          0 === boundary.pendingTasks &&
            0 < boundary.nodes.length &&
            ((segment = logRecoverableError(request, error, errorInfo, null)),
            abortRemainingReplayNodes(
              request,
              null,
              boundary.nodes,
              boundary.slots,
              error,
              segment,
              errorInfo,
              !0
            ));
          request.pendingRootTasks--;
          0 === request.pendingRootTasks && completeShell(request);
        }
      } else {
        node = request.trackedPostpones;
        if (4 !== boundary.status) {
          if (null !== node && null !== segment)
            return (
              logRecoverableError(request, error, errorInfo, task.debugTask),
              trackPostpone(request, node, task, segment),
              boundary.fallbackAbortableTasks.forEach(function (fallbackTask) {
                return abortTask(fallbackTask, request, error);
              }),
              boundary.fallbackAbortableTasks.clear(),
              finishedTask(request, boundary, task.row, segment)
            );
          boundary.status = 4;
          segment = logRecoverableError(
            request,
            error,
            errorInfo,
            task.debugTask
          );
          boundary.status = 4;
          encodeErrorForBoundary(boundary, segment, error, errorInfo, !0);
          untrackBoundary(request, boundary);
          boundary.parentFlushed &&
            request.clientRenderedBoundaries.push(boundary);
        }
        boundary.pendingTasks--;
        errorInfo = boundary.row;
        null !== errorInfo &&
          0 === --errorInfo.pendingTasks &&
          finishSuspenseListRow(request, errorInfo);
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
        logRecoverableError(request, error, {}, null);
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
            boundary.parentFlushed &&
              request.completedBoundaries.push(boundary),
            1 === boundary.status)
          )
            (row = boundary.row),
              null !== row &&
                hoistHoistables(row.hoistables, boundary.contentState),
              isEligibleForOutlining(request, boundary) ||
                (boundary.fallbackAbortableTasks.forEach(
                  abortTaskSoft,
                  request
                ),
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
        var prevGetCurrentStackImpl = ReactSharedInternals.getCurrentStack;
        ReactSharedInternals.getCurrentStack = getCurrentStackInDEV;
        var prevResumableState = currentResumableState;
        currentResumableState = request$jscomp$1.resumableState;
        try {
          var pingedTasks = request$jscomp$1.pingedTasks,
            i;
          for (i = 0; i < pingedTasks.length; i++) {
            var request = request$jscomp$1,
              task = pingedTasks[i],
              segment = task.blockedSegment;
            if (null === segment) {
              var prevTaskInDEV = void 0,
                task$jscomp$0 = task;
              if (0 !== task$jscomp$0.replay.pendingTasks) {
                switchContext(task$jscomp$0.context);
                prevTaskInDEV = currentTaskInDEV;
                currentTaskInDEV = task$jscomp$0;
                try {
                  "number" === typeof task$jscomp$0.replay.slots
                    ? resumeNode(
                        request,
                        task$jscomp$0,
                        task$jscomp$0.replay.slots,
                        task$jscomp$0.node,
                        task$jscomp$0.childIndex
                      )
                    : retryNode(request, task$jscomp$0);
                  if (
                    1 === task$jscomp$0.replay.pendingTasks &&
                    0 < task$jscomp$0.replay.nodes.length
                  )
                    throw Error(
                      "Couldn't find all resumable slots by key/index during replaying. The tree doesn't match so React will fallback to client rendering."
                    );
                  task$jscomp$0.replay.pendingTasks--;
                  task$jscomp$0.abortSet.delete(task$jscomp$0);
                  finishedTask(
                    request,
                    task$jscomp$0.blockedBoundary,
                    task$jscomp$0.row,
                    null
                  );
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
                    var ping = task$jscomp$0.ping;
                    x.then(ping, ping);
                    task$jscomp$0.thenableState =
                      thrownValue === SuspenseException
                        ? getThenableStateAfterSuspending()
                        : null;
                  } else {
                    task$jscomp$0.replay.pendingTasks--;
                    task$jscomp$0.abortSet.delete(task$jscomp$0);
                    var errorInfo = getThrownInfo(task$jscomp$0.componentStack),
                      request$jscomp$0 = request,
                      boundary = task$jscomp$0.blockedBoundary,
                      error$jscomp$0 =
                        12 === request.status ? request.fatalError : x,
                      errorInfo$jscomp$0 = errorInfo,
                      replayNodes = task$jscomp$0.replay.nodes,
                      resumeSlots = task$jscomp$0.replay.slots,
                      errorDigest = logRecoverableError(
                        request$jscomp$0,
                        error$jscomp$0,
                        errorInfo$jscomp$0,
                        task$jscomp$0.debugTask
                      );
                    abortRemainingReplayNodes(
                      request$jscomp$0,
                      boundary,
                      replayNodes,
                      resumeSlots,
                      error$jscomp$0,
                      errorDigest,
                      errorInfo$jscomp$0,
                      !1
                    );
                    request.pendingRootTasks--;
                    0 === request.pendingRootTasks && completeShell(request);
                    request.allPendingTasks--;
                    0 === request.allPendingTasks && completeAll(request);
                  }
                } finally {
                  currentTaskInDEV = prevTaskInDEV;
                }
              }
            } else if (
              ((prevTaskInDEV = void 0),
              (task$jscomp$0 = task),
              (request$jscomp$0 = segment),
              0 === request$jscomp$0.status)
            ) {
              request$jscomp$0.status = 6;
              switchContext(task$jscomp$0.context);
              prevTaskInDEV = currentTaskInDEV;
              currentTaskInDEV = task$jscomp$0;
              var childrenLength = request$jscomp$0.children.length,
                chunkLength = request$jscomp$0.chunks.length;
              try {
                retryNode(request, task$jscomp$0),
                  pushSegmentFinale(
                    request$jscomp$0.chunks,
                    request.renderState,
                    request$jscomp$0.lastPushedText,
                    request$jscomp$0.textEmbedded
                  ),
                  task$jscomp$0.abortSet.delete(task$jscomp$0),
                  (request$jscomp$0.status = 1),
                  finishedSegment(
                    request,
                    task$jscomp$0.blockedBoundary,
                    request$jscomp$0
                  ),
                  finishedTask(
                    request,
                    task$jscomp$0.blockedBoundary,
                    task$jscomp$0.row,
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
                if (
                  12 === request.status &&
                  null !== request.trackedPostpones
                ) {
                  var trackedPostpones = request.trackedPostpones,
                    thrownInfo = getThrownInfo(task$jscomp$0.componentStack);
                  task$jscomp$0.abortSet.delete(task$jscomp$0);
                  logRecoverableError(
                    request,
                    x$jscomp$0,
                    thrownInfo,
                    task$jscomp$0.debugTask
                  );
                  trackPostpone(
                    request,
                    trackedPostpones,
                    task$jscomp$0,
                    request$jscomp$0
                  );
                  finishedTask(
                    request,
                    task$jscomp$0.blockedBoundary,
                    task$jscomp$0.row,
                    request$jscomp$0
                  );
                } else if (
                  "object" === typeof x$jscomp$0 &&
                  null !== x$jscomp$0 &&
                  "function" === typeof x$jscomp$0.then
                ) {
                  request$jscomp$0.status = 0;
                  task$jscomp$0.thenableState =
                    thrownValue === SuspenseException
                      ? getThenableStateAfterSuspending()
                      : null;
                  var ping$jscomp$0 = task$jscomp$0.ping;
                  x$jscomp$0.then(ping$jscomp$0, ping$jscomp$0);
                } else {
                  var errorInfo$jscomp$1 = getThrownInfo(
                    task$jscomp$0.componentStack
                  );
                  task$jscomp$0.abortSet.delete(task$jscomp$0);
                  request$jscomp$0.status = 4;
                  var boundary$jscomp$0 = task$jscomp$0.blockedBoundary,
                    row = task$jscomp$0.row,
                    debugTask = task$jscomp$0.debugTask;
                  null !== row &&
                    0 === --row.pendingTasks &&
                    finishSuspenseListRow(request, row);
                  request.allPendingTasks--;
                  var errorDigest$jscomp$0 = logRecoverableError(
                    request,
                    x$jscomp$0,
                    errorInfo$jscomp$1,
                    debugTask
                  );
                  if (null === boundary$jscomp$0)
                    fatalError(
                      request,
                      x$jscomp$0,
                      errorInfo$jscomp$1,
                      debugTask
                    );
                  else if (
                    (boundary$jscomp$0.pendingTasks--,
                    4 !== boundary$jscomp$0.status)
                  ) {
                    boundary$jscomp$0.status = 4;
                    encodeErrorForBoundary(
                      boundary$jscomp$0,
                      errorDigest$jscomp$0,
                      x$jscomp$0,
                      errorInfo$jscomp$1,
                      !1
                    );
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
                currentTaskInDEV = prevTaskInDEV;
              }
            }
          }
          pingedTasks.splice(0, i);
          null !== request$jscomp$1.destination &&
            flushCompletedQueues(
              request$jscomp$1,
              request$jscomp$1.destination
            );
        } catch (error) {
          (pingedTasks = {}),
            logRecoverableError(request$jscomp$1, error, pingedTasks, null),
            fatalError(request$jscomp$1, error, pingedTasks, null);
        } finally {
          (currentResumableState = prevResumableState),
            (ReactSharedInternals.H = prevDispatcher),
            (ReactSharedInternals.A = prevAsyncDispatcher),
            (ReactSharedInternals.getCurrentStack = prevGetCurrentStackImpl),
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
          boundary.errorMessage,
          boundary.errorStack,
          boundary.errorComponentStack
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
      return writeEndCompletedSuspenseBoundary(
        destination,
        request.renderState
      );
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
              boundary.errorMessage,
              boundary.errorStack,
              boundary.errorComponentStack
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
            a: {
              completedRootSegment = request;
              completedPreambleSegments = destination;
              var boundary$jscomp$0 = partialBoundaries[i];
              flushedByteSize = boundary$jscomp$0.byteSize;
              var completedSegments = boundary$jscomp$0.completedSegments;
              for (
                segments = 0;
                segments < completedSegments.length;
                segments++
              )
                if (
                  !flushPartiallyCompletedSegment(
                    completedRootSegment,
                    completedPreambleSegments,
                    boundary$jscomp$0,
                    completedSegments[segments]
                  )
                ) {
                  segments++;
                  completedSegments.splice(0, segments);
                  var JSCompiler_inline_result$jscomp$0 = !1;
                  break a;
                }
              completedSegments.splice(0, segments);
              var row = boundary$jscomp$0.row;
              null !== row &&
                row.together &&
                1 === boundary$jscomp$0.pendingTasks &&
                (1 === row.pendingTasks
                  ? unblockSuspenseListRow(
                      completedRootSegment,
                      row,
                      row.hoistables
                    )
                  : row.pendingTasks--);
              JSCompiler_inline_result$jscomp$0 = writeHoistablesForBoundary(
                completedPreambleSegments,
                boundary$jscomp$0.contentState,
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
              0 !== request.abortableTasks.size &&
                console.error(
                  "There was still abortable task at the root when we closed. This is a bug in React."
                ),
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
      jsxPropsParents = new WeakMap(),
      jsxChildrenParents = new WeakMap(),
      CLIENT_REFERENCE_TAG = Symbol.for("react.client.reference"),
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
      getSuspenseContentFormatContext =
        $$$config.getSuspenseContentFormatContext,
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
      writeEndPendingSuspenseBoundary =
        $$$config.writeEndPendingSuspenseBoundary,
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
      emptyContextObject = {};
    Object.freeze(emptyContextObject);
    var rendererSigil = {};
    var currentActiveSnapshot = null,
      didWarnAboutNoopUpdateForComponent = {},
      didWarnAboutDeprecatedWillMount = {};
    var didWarnAboutUninitializedState = new Set();
    var didWarnAboutGetSnapshotBeforeUpdateWithoutDidUpdate = new Set();
    var didWarnAboutLegacyLifecyclesAndDerivedState = new Set();
    var didWarnAboutDirectlyAssigningPropsToState = new Set();
    var didWarnAboutUndefinedDerivedState = new Set();
    var didWarnAboutContextTypes$1 = new Set();
    var didWarnAboutChildContextTypes = new Set();
    var didWarnAboutInvalidateContextType = new Set();
    var didWarnOnInvalidCallback = new Set();
    var classComponentUpdater = {
        enqueueSetState: function (inst, payload, callback) {
          var internals = inst._reactInternals;
          null === internals.queue
            ? warnNoop(inst, "setState")
            : (internals.queue.push(payload),
              void 0 !== callback &&
                null !== callback &&
                warnOnInvalidCallback(callback));
        },
        enqueueReplaceState: function (inst, payload, callback) {
          inst = inst._reactInternals;
          inst.replace = !0;
          inst.queue = [payload];
          void 0 !== callback &&
            null !== callback &&
            warnOnInvalidCallback(callback);
        },
        enqueueForceUpdate: function (inst, callback) {
          null === inst._reactInternals.queue
            ? warnNoop(inst, "forceUpdate")
            : void 0 !== callback &&
              null !== callback &&
              warnOnInvalidCallback(callback);
        }
      },
      emptyTreeContext = { id: 1, overflow: "" },
      clz32 = Math.clz32 ? Math.clz32 : clz32Fallback,
      log = Math.log,
      LN2 = Math.LN2,
      currentTaskInDEV = null,
      SuspenseException = Error(
        "Suspense Exception: This is not a real error! It's an implementation detail of `use` to interrupt the current render. You must either rethrow it immediately, or move the `use` call outside of the `try/catch` block. Capturing without rethrowing will lead to unexpected behavior.\n\nTo handle async errors, wrap your component in an error boundary, or call the promise's `.catch` method and pass the result to `use`."
      ),
      suspendedThenable = null,
      shouldCaptureSuspendedCallSite = !1,
      suspendedCallSiteStack = null,
      suspendedCallSiteDebugTask = null,
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
      isInHookUserCodeInDev = !1,
      currentHookNameInDev,
      HooksDispatcher = {
        readContext: readContext,
        use: function (usable) {
          if (null !== usable && "object" === typeof usable) {
            if ("function" === typeof usable.then)
              return unwrapThenable(usable);
            if (usable.$$typeof === REACT_CONTEXT_TYPE)
              return readContext(usable);
          }
          throw Error(
            "An unsupported type was passed to use(): " + String(usable)
          );
        },
        useContext: function (context) {
          currentHookNameInDev = "useContext";
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
              Object.seal(initialValue),
              (workInProgressHook.memoizedState = initialValue))
            : previousRef;
        },
        useState: function (initialState) {
          currentHookNameInDev = "useState";
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
        },
        getOwner: function () {
          return null === currentTaskInDEV
            ? null
            : currentTaskInDEV.componentStack;
        }
      },
      disabledDepth = 0,
      prevLog,
      prevInfo,
      prevWarn,
      prevError,
      prevGroup,
      prevGroupCollapsed,
      prevGroupEnd;
    disabledLog.__reactDisabledLog = !0;
    var ReactSharedInternals =
        React.__SERVER_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE,
      prefix,
      suffix,
      reentry = !1;
    var componentFrameCache = new (
      "function" === typeof WeakMap ? WeakMap : Map
    )();
    var callComponent = {
        react_stack_bottom_frame: function (Component, props, secondArg) {
          return Component(props, secondArg);
        }
      },
      callComponentInDEV =
        callComponent.react_stack_bottom_frame.bind(callComponent),
      callRender = {
        react_stack_bottom_frame: function (instance) {
          return instance.render();
        }
      },
      callRenderInDEV = callRender.react_stack_bottom_frame.bind(callRender),
      callLazyInit = {
        react_stack_bottom_frame: function (lazy) {
          var init = lazy._init;
          return init(lazy._payload);
        }
      },
      callLazyInitInDEV =
        callLazyInit.react_stack_bottom_frame.bind(callLazyInit),
      lastResetTime = 0;
    if (
      "object" === typeof performance &&
      "function" === typeof performance.now
    ) {
      var localPerformance = performance;
      var getCurrentTime = function () {
        return localPerformance.now();
      };
    } else {
      var localDate = Date;
      getCurrentTime = function () {
        return localDate.now();
      };
    }
    var currentRequest = null,
      didWarnAboutBadClass = {},
      didWarnAboutContextTypes = {},
      didWarnAboutContextTypeOnFunctionComponent = {},
      didWarnAboutGetDerivedStateOnFunctionComponent = {},
      didWarnAboutReassigningProps = !1,
      didWarnAboutGenerators = !1,
      didWarnAboutMaps = !1,
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
            var prevTaskInDEV = currentTaskInDEV,
              prevGetCurrentStackImpl = ReactSharedInternals.getCurrentStack;
            currentTaskInDEV = task;
            ReactSharedInternals.getCurrentStack = getCurrentStackInDEV;
            try {
              abortTask(task, request, error);
            } finally {
              (currentTaskInDEV = prevTaskInDEV),
                (ReactSharedInternals.getCurrentStack =
                  prevGetCurrentStackImpl);
            }
          });
          abortableTasks.clear();
        }
        null !== request.destination &&
          flushCompletedQueues(request, request.destination);
      } catch (error$4) {
        (reason = {}),
          logRecoverableError(request, error$4, reason, null),
          fatalError(request, error$4, reason, null);
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
          (destination = {}),
            logRecoverableError(request, error, destination, null),
            fatalError(request, error, destination, null);
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
  }),
  (module.exports.default = module.exports),
  Object.defineProperty(module.exports, "__esModule", { value: !0 }));
