/* eslint-disable strict, no-restricted-globals, no-new-func,
   react-internal/safe-string-coercion, react-internal/no-primitive-constructors,
   react-internal/no-production-logging, react-internal/warning-args --
   a browser script for the use(store) docs, not React source. */
// Runs inside each sandbox iframe, after frame-hook.js and the React bundle.
// It captures the console and errors, provides the require shim and the
// helpers (log, Slow, SlowList, createResource, inspectStore, watchStore,
// renders, step), runs the code the host sends, and reports back with
// postMessage. See API.md.
(function () {
  'use strict';

  const config = window.__SANDBOX__ || {};
  const id = config.id;
  const modules = window.__modules;
  const isStep = config.runtime === 'step';
  let strict = !!config.strict;

  function post(type, fields) {
    const message = fields || {};
    message.__sandbox = 1;
    message.id = id;
    message.type = type;
    try {
      parent.postMessage(message, '*');
    } catch (error) {
      // A value that can't be cloned. Everything we send is strings and
      // numbers, so this is a bug in this file.
      parent.postMessage(
        {
          __sandbox: 1,
          id: id,
          type: 'error',
          phase: 'hook',
          message: String(error),
        },
        '*'
      );
    }
  }

  // ---------------------------------------------------------------- describe

  const ELEMENT = Symbol.for('react.transitional.element');
  const LEGACY_ELEMENT = Symbol.for('react.element');
  const STORE = Symbol.for('react.store');

  // A short, readable string for any value, for the console panel and store
  // snapshots.
  function describe(value, depth, seen) {
    depth = depth === undefined ? 0 : depth;
    seen = seen || [];
    const type = typeof value;
    if (value === null) return 'null';
    if (type === 'undefined') return 'undefined';
    if (type === 'string') return depth === 0 ? value : JSON.stringify(value);
    if (type === 'number' || type === 'boolean' || type === 'bigint') {
      return String(value);
    }
    if (type === 'symbol') return value.toString();
    if (type === 'function') {
      const source = Function.prototype.toString.call(value);
      if (/^(async\s*)?(\(|[\w$]+\s*=>)/.test(source)) {
        return truncate(source.replace(/\s+/g, ' '), 60);
      }
      return 'ƒ ' + (value.name || 'anonymous') + '()';
    }
    if (seen.indexOf(value) !== -1) return '[Circular]';
    if (value instanceof Error) {
      return (value.name || 'Error') + ': ' + value.message;
    }
    if (value.$$typeof === ELEMENT || value.$$typeof === LEGACY_ELEMENT) {
      const t = value.type;
      const name =
        typeof t === 'string'
          ? t
          : (t && (t.displayName || t.name)) || 'Component';
      return '<' + name + ' />';
    }
    if (value.$$typeof === STORE) return 'Store';
    if (typeof Node !== 'undefined' && value instanceof Node) {
      return value.nodeType === 1
        ? '<' + value.nodeName.toLowerCase() + '>'
        : '#text';
    }
    if (typeof value.then === 'function') {
      return 'Promise {' + (value.status || 'pending') + '}';
    }
    if (depth > 2) return Array.isArray(value) ? '[…]' : '{…}';
    seen = seen.concat([value]);
    const parts = [];
    let i;
    if (Array.isArray(value)) {
      for (i = 0; i < value.length && i < 10; i++) {
        parts.push(describe(value[i], depth + 1, seen));
      }
      if (value.length > 10) parts.push('… ' + (value.length - 10) + ' more');
      return '[' + parts.join(', ') + ']';
    }
    if (value instanceof Map || value instanceof Set) {
      const isMap = value instanceof Map;
      value.forEach(function (v, k) {
        if (parts.length < 10) {
          parts.push(
            isMap
              ? describe(k, depth + 1, seen) +
                  ' => ' +
                  describe(v, depth + 1, seen)
              : describe(v, depth + 1, seen)
          );
        }
      });
      return (
        (isMap ? 'Map' : 'Set') +
        '(' +
        value.size +
        ') {' +
        parts.join(', ') +
        '}'
      );
    }
    const keys = Object.keys(value);
    for (i = 0; i < keys.length && i < 10; i++) {
      parts.push(keys[i] + ': ' + describe(value[keys[i]], depth + 1, seen));
    }
    if (keys.length > 10) parts.push('…');
    return '{' + parts.join(', ') + '}';
  }

  function truncate(text, max) {
    return text.length > max ? text.slice(0, max - 1) + '…' : text;
  }

  // console.* formatting: %s, %d, %i, %f, %o, %O and %c (dropped).
  function format(args) {
    args = Array.prototype.slice.call(args);
    let out = '';
    let rest = args;
    if (typeof args[0] === 'string' && /%[sdifoOc]/.test(args[0])) {
      let index = 1;
      out = args[0].replace(/%([sdifoOc%])/g, function (match, spec) {
        if (spec === '%') return '%';
        if (index >= args.length) return match;
        const arg = args[index++];
        switch (spec) {
          case 'c':
            return '';
          case 'd':
          case 'i':
            return String(parseInt(arg, 10));
          case 'f':
            return String(Number(arg));
          case 's':
            return typeof arg === 'string' ? arg : describe(arg, 1);
          default:
            return describe(arg, 1);
        }
      });
      rest = args.slice(index);
    } else {
      out = args.length > 0 ? describe(args[0]) : '';
      rest = args.slice(1);
    }
    for (let i = 0; i < rest.length; i++) {
      out += ' ' + describe(rest[i]);
    }
    return truncate(out, 4000);
  }

  // ---------------------------------------------------------------- console

  // While the inspector replays a reducer (inspectStore computeHead), the
  // console and log() are muted, so a reducer that logs doesn't add lines.
  let muted = false;

  ['log', 'info', 'warn', 'error', 'debug'].forEach(function (kind) {
    const original = console[kind];
    console[kind] = function () {
      if (muted) return undefined;
      try {
        post('console', {
          kind: kind,
          text: format(arguments),
          source: 'console',
        });
      } catch (error) {
        // Formatting must never break the caller.
      }
      return original.apply(console, arguments);
    };
  });

  // ---------------------------------------------------------------- errors

  function reportError(phase, error, componentStack) {
    const isError = error instanceof Error;
    post('error', {
      phase: phase,
      message: isError
        ? (error.name || 'Error') + ': ' + error.message
        : describe(error),
      stack: isError && error.stack ? String(error.stack) : '',
      componentStack: componentStack ? String(componentStack) : '',
    });
  }

  // Cancelling the event keeps the error out of the browser console, so an
  // error a sandbox shows on purpose isn't an uncaught page error.
  window.addEventListener('error', function (event) {
    event.preventDefault();
    reportError(
      'event',
      event.error !== undefined ? event.error : event.message
    );
  });
  window.addEventListener('unhandledrejection', function (event) {
    event.preventDefault();
    reportError('promise', event.reason);
  });
  window.__onSandboxHookError = function (error) {
    reportError('hook', error);
  };

  if (!modules || !modules.react || !modules['react-dom/client']) {
    reportError('module', new Error('The React vendor bundle failed to load.'));
    post('ran', {ok: false});
    return;
  }

  const React = modules.react;
  const client = modules['react-dom/client'];
  const Scheduler = modules.scheduler;

  // ---------------------------------------------------------------- roots

  // Roots report uncaught errors to the overlay and honor the StrictMode
  // toggle, whether the frame or the sandbox code creates them. Caught and
  // recoverable errors keep React's default logging, so the console panel
  // shows what React would print.
  function rootOptions(options) {
    const copy = {};
    for (const key in options) copy[key] = options[key];
    // The experimental build's default transition indicator fakes a
    // navigation.navigate() while a transition is pending. In a file://
    // srcdoc frame that's noise, so it's off unless the code asks for it.
    if (copy.onDefaultTransitionIndicator === undefined) {
      copy.onDefaultTransitionIndicator = function () {};
    }
    const user = copy.onUncaughtError;
    copy.onUncaughtError = function (error, info) {
      reportError('uncaught', error, info && info.componentStack);
      if (typeof user === 'function') user(error, info);
    };
    return copy;
  }

  function wrapStrict(children) {
    return strict
      ? React.createElement(React.StrictMode, null, children)
      : children;
  }

  function patchRender(root) {
    const render = root.render;
    root.render = function (children) {
      return render.call(root, wrapStrict(children));
    };
    return root;
  }

  const wrappedClient = {};
  for (const clientKey in client) wrappedClient[clientKey] = client[clientKey];
  wrappedClient.createRoot = function (container, options) {
    return patchRender(client.createRoot(container, rootOptions(options)));
  };
  wrappedClient.hydrateRoot = function (container, children, options) {
    return patchRender(
      client.hydrateRoot(container, wrapStrict(children), rootOptions(options))
    );
  };

  // ---------------------------------------------------------------- helpers

  function log() {
    if (muted) return;
    const text = format(arguments);
    post('console', {kind: 'log', text: text, source: 'sandbox'});
    if (isStep) {
      Scheduler.log(arguments.length === 1 ? arguments[0] : text);
    }
  }

  function block(ms) {
    const end = performance.now() + ms;
    while (performance.now() < end) {
      // Busy wait: this is the point.
    }
  }

  function Slow(props) {
    block(props.ms == null ? 100 : props.ms);
    return props.children === undefined ? null : props.children;
  }

  function SlowItem(props) {
    block(props.ms);
    return React.createElement(
      'li',
      null,
      props.render ? props.render(props.index) : 'Item #' + (props.index + 1)
    );
  }

  function SlowList(props) {
    const count = props.count == null ? 200 : props.count;
    const ms = props.ms == null ? 1 : props.ms;
    const items = [];
    for (let i = 0; i < count; i++) {
      items.push(
        React.createElement(SlowItem, {
          key: i,
          index: i,
          ms: ms,
          render: props.render,
        })
      );
    }
    return React.createElement('ul', {className: 'slow-list'}, items);
  }

  function createResource(load, options) {
    if (typeof load !== 'function' && load != null) {
      options = load;
      load = undefined;
    }
    const delay = options && options.delay;
    const entries = new Map();

    function entry(key) {
      let e = entries.get(key);
      if (e !== undefined) return e;
      e = {status: 'pending', value: undefined};
      e.promise = new Promise(function (res, rej) {
        e.resolve = res;
        e.reject = rej;
      });
      // A rejection the code hasn't read yet isn't unhandled. use() still
      // sees it.
      e.promise.catch(function () {});
      entries.set(key, e);
      if (typeof load === 'function') {
        const start = function () {
          try {
            Promise.resolve(load(key)).then(
              function (value) {
                resolve(key, value);
              },
              function (error) {
                reject(key, error);
              }
            );
          } catch (error) {
            reject(key, error);
          }
        };
        if (delay > 0) setTimeout(start, delay);
        else start();
      }
      return e;
    }

    function resolve(key, value) {
      const e = entry(key);
      if (e.status !== 'pending') return;
      e.status = e.promise.status = 'fulfilled';
      e.value = e.promise.value = value;
      e.resolve(value);
    }

    function reject(key, error) {
      const e = entry(key);
      if (e.status !== 'pending') return;
      if (!(error instanceof Error)) error = new Error(String(error));
      e.status = e.promise.status = 'rejected';
      e.value = e.promise.reason = error;
      e.reject(error);
    }

    return {
      read: function (key) {
        return entry(key).promise;
      },
      resolve: resolve,
      reject: reject,
      status: function (key) {
        const e = entries.get(key);
        return e === undefined ? 'missing' : e.status;
      },
      clear: function (key) {
        if (key === undefined) entries.clear();
        else entries.delete(key);
      },
    };
  }

  // ---------------------------------------------------------------- stores

  // Lanes from react-reconciler/src/ReactFiberLane.js.
  const LANE_NAMES = [
    'SyncHydration',
    'Sync',
    'InputContinuousHydration',
    'InputContinuous',
    'DefaultHydration',
    'Default',
    'Gesture',
    'TransitionHydration',
  ];
  for (let t = 1; t <= 14; t++) LANE_NAMES.push('Transition' + t);
  for (let r = 1; r <= 4; r++) LANE_NAMES.push('Retry' + r);
  LANE_NAMES.push(
    'SelectiveHydration',
    'IdleHydration',
    'Idle',
    'Offscreen',
    'Deferred'
  );

  function laneNames(lanes) {
    const names = [];
    for (let i = 0; i < LANE_NAMES.length; i++) {
      if (lanes & (1 << i)) names.push(LANE_NAMES[i]);
    }
    return names;
  }

  function isQueue(last) {
    return (
      last === null ||
      (typeof last === 'object' &&
        typeof last.lane === 'number' &&
        'action' in last &&
        last.next !== null &&
        typeof last.next === 'object')
    );
  }

  // A circular list is stored by its last node; last.next is the first.
  function queueToArray(last) {
    const out = [];
    if (last === null) return out;
    const first = last.next;
    let update = first;
    do {
      out.push({
        lane: update.lane,
        laneName: laneNames(update.lane).join('|'),
        action: update.action,
      });
      update = update.next;
    } while (update !== first && out.length < 10000);
    return out;
  }

  function readerName(fiber) {
    if (fiber.tag === 13) return 'Suspense';
    return window.__renders ? window.__renders._getName(fiber) : 'Component';
  }

  // Returns a reason the store doesn't have the shape this inspector reads,
  // or null.
  function checkShape(store) {
    if (store === null || typeof store !== 'object') return 'not a store';
    if (store.$$typeof !== STORE)
      return 'store.$$typeof is not Symbol(react.store)';
    if (!Array.isArray(store._records)) return 'store._records is not an array';
    if (!('_head' in store)) return 'store._head is missing';
    if (typeof store._reducer !== 'function') {
      return 'store._reducer is not a function';
    }
    if (store._headQueue !== null && !Array.isArray(store._headQueue)) {
      return 'store._headQueue is not an array or null';
    }
    const held = store._pendingTransitionUpdates;
    if (held !== null && !Array.isArray(held)) {
      return 'store._pendingTransitionUpdates is not an array or null';
    }
    for (let i = 0; i < store._records.length; i++) {
      const record = store._records[i];
      if (!('pending' in record) || !isQueue(record.pending)) {
        return 'record.pending is not an update queue';
      }
      const committed = record.committed;
      if (
        committed === null ||
        typeof committed !== 'object' ||
        !('baseQueue' in committed) ||
        !('memoizedState' in committed) ||
        !('baseState' in committed) ||
        typeof committed.skippedLanes !== 'number'
      ) {
        return 'record.committed is not a StoreState';
      }
      if (!isQueue(committed.baseQueue)) {
        return 'record.committed.baseQueue is not an update queue';
      }
      if (!(record.readers instanceof Set))
        return 'record.readers is not a Set';
      if (!record.root || typeof record.root.pendingLanes !== 'number') {
        return 'record.root.pendingLanes is not a number';
      }
      if (
        typeof record.lanes !== 'number' ||
        typeof record.transitionLanes !== 'number'
      ) {
        return 'record.lanes or record.transitionLanes is not a number';
      }
    }
    return null;
  }

  const reportedReasons = [];

  // Every update applied in dispatch order. store._head is folded lazily
  // (shared/getStoreHead.js), so apply _headQueue to a copy, skipping updates
  // that throw like getStoreHead does, without changing the store.
  // Opt in only: it runs the sandbox's reducer outside React, so it's muted
  // and never throws. An update that throws is skipped, as in getStoreHead,
  // and reported as headError.
  function foldHead(store) {
    let head = store._head;
    let headError;
    const queue = store._headQueue;
    if (queue !== null) {
      muted = true;
      try {
        for (let i = 0; i < queue.length; i++) {
          try {
            head = store._reducer(head, queue[i]);
          } catch (error) {
            if (headError === undefined) headError = error;
          }
        }
      } finally {
        muted = false;
      }
    }
    return {head: head, headError: headError};
  }

  // options.computeHead: also apply _headQueue to a copy of store._head with
  // the reducer, to get every update in dispatch order (head, headError).
  function inspectStore(store, options) {
    let reason = checkShape(store);
    if (reason !== null) {
      reason = 'inspector unavailable for this build: ' + reason;
      if (reportedReasons.indexOf(reason) === -1) {
        reportedReasons.push(reason);
        console.error(reason);
      }
      return {ok: false, reason: reason};
    }
    const held = [];
    const pendingTransitionUpdates = store._pendingTransitionUpdates || [];
    for (let i = 0; i < pendingTransitionUpdates.length; i += 2) {
      const lane = pendingTransitionUpdates[i + 1];
      held.push({
        lane: lane,
        laneName: laneNames(lane).join('|'),
        action: pendingTransitionUpdates[i],
      });
    }
    const records = store._records.map(function (record) {
      const readers = [];
      record.readers.forEach(function (fiber) {
        readers.push(readerName(fiber));
      });
      return {
        pending: queueToArray(record.pending),
        baseQueue: queueToArray(record.committed.baseQueue),
        committed: {
          baseState: record.committed.baseState,
          memoizedState: record.committed.memoizedState,
          skippedLanes: laneNames(record.committed.skippedLanes),
        },
        lanes: laneNames(record.lanes),
        transitionLanes: laneNames(record.transitionLanes),
        rawLanes: record.lanes,
        rawTransitionLanes: record.transitionLanes,
        rootPendingLanes: laneNames(record.root.pendingLanes),
        rawRootPendingLanes: record.root.pendingLanes,
        readers: readers,
        readerCount: record.readers.size,
      };
    });
    const snapshot = {
      ok: true,
      headBase: store._head,
      headQueue: (store._headQueue || []).slice(),
      heldTransitionUpdates: held,
      records: records,
      record: records.length > 0 ? records[0] : null,
    };
    if (options && options.computeHead) {
      const folded = foldHead(store);
      snapshot.head = folded.head;
      if (folded.headError !== undefined) snapshot.headError = folded.headError;
    }
    return snapshot;
  }

  // The snapshot with every value turned into a short string, for the host.
  function serializeSnapshot(snapshot) {
    if (!snapshot.ok) return snapshot;
    function updates(list) {
      return list.map(function (u) {
        return {laneName: u.laneName, action: describe(u.action, 1)};
      });
    }
    const records = snapshot.records.map(function (record) {
      return {
        pending: updates(record.pending),
        baseQueue: updates(record.baseQueue),
        committed: {
          baseState: describe(record.committed.baseState, 1),
          memoizedState: describe(record.committed.memoizedState, 1),
          skippedLanes: record.committed.skippedLanes,
        },
        lanes: record.lanes,
        transitionLanes: record.transitionLanes,
        rootPendingLanes: record.rootPendingLanes,
        readers: record.readers,
        readerCount: record.readerCount,
      };
    });
    return {
      ok: true,
      headBase: describe(snapshot.headBase, 1),
      headQueue: snapshot.headQueue.map(function (a) {
        return describe(a, 1);
      }),
      heldTransitionUpdates: updates(snapshot.heldTransitionUpdates),
      records: records,
      record: records.length > 0 ? records[0] : null,
    };
  }

  const watched = [];
  let storesScheduled = false;

  function snapshots() {
    return watched.map(function (w) {
      const snapshot = serializeSnapshot(inspectStore(w.store));
      return {
        label: w.label,
        ok: snapshot.ok,
        reason: snapshot.reason,
        snapshot: snapshot,
      };
    });
  }

  function scheduleStores() {
    if (watched.length === 0 || storesScheduled) return;
    storesScheduled = true;
    Promise.resolve().then(function () {
      storesScheduled = false;
      post('stores', {stores: snapshots()});
    });
  }

  function watchStore(store, label) {
    for (let i = 0; i < watched.length; i++) {
      if (watched[i].store === store) return store;
    }
    watched.push({
      store: store,
      label: label || 'store' + (watched.length + 1),
    });
    if (store && typeof store.update === 'function') {
      const update = store.update;
      store.update = function () {
        try {
          return update.apply(this, arguments);
        } finally {
          scheduleStores();
        }
      };
    }
    scheduleStores();
    return store;
  }

  // ---------------------------------------------------------------- step

  let lastPending = null;

  function postStepState(reqId, values) {
    lastPending = Scheduler.unstable_hasPendingWork();
    post('step-state', {
      reqId: reqId,
      pending: lastPending,
      log: (values || []).map(function (v) {
        return describe(v);
      }),
    });
  }

  function command(cmd, count, reqId) {
    // Values logged since the last command (by event handlers, say) belong
    // to this one. flushNumberOfYields counts the whole log, so it has to
    // start empty.
    let values = Scheduler.unstable_clearLog();
    try {
      switch (cmd) {
        case 'paint':
          Scheduler.unstable_flushUntilNextPaint();
          break;
        case 'flush':
          Scheduler.unstable_flushAllWithoutAsserting();
          break;
        case 'yield':
          Scheduler.unstable_flushNumberOfYields(count || 1);
          break;
        case 'advance':
          Scheduler.unstable_advanceTime(count || 0);
          break;
        default:
          throw new Error('Unknown stepper command ' + cmd);
      }
    } catch (error) {
      reportError('uncaught', error);
    }
    values = values.concat(Scheduler.unstable_clearLog());
    scheduleStores();
    postStepState(reqId, values);
    return values;
  }

  const step = isStep
    ? {
        paint: function () {
          return command('paint');
        },
        flush: function () {
          return command('flush');
        },
        yields: function (n) {
          return command('yield', n === undefined ? 1 : n);
        },
        advance: function (ms) {
          return command('advance', ms);
        },
        log: function (value) {
          Scheduler.log(value);
        },
        pending: function () {
          return Scheduler.unstable_hasPendingWork();
        },
        clearLog: function () {
          return Scheduler.unstable_clearLog();
        },
      }
    : undefined;

  if (isStep) {
    // Clicks schedule work without a command. Keep the indicator honest.
    setInterval(function () {
      if (Scheduler.unstable_hasPendingWork() !== lastPending) {
        postStepState(undefined, []);
      }
    }, 200);
  }

  // ---------------------------------------------------------------- commits

  const counts = window.__renders;
  let lastNames = [];
  let commitScheduled = false;
  let commitWaiters = [];

  counts.onCommit(function (root, names) {
    for (let i = 0; i < names.length; i++) {
      if (lastNames.indexOf(names[i]) === -1) lastNames.push(names[i]);
    }
    const waiters = commitWaiters;
    commitWaiters = [];
    for (let w = 0; w < waiters.length; w++) waiters[w]();
    if (!commitScheduled) {
      commitScheduled = true;
      Promise.resolve().then(postCommit);
    }
    scheduleStores();
  });

  function postCommit() {
    commitScheduled = false;
    const last = lastNames;
    lastNames = [];
    post('commit', {counts: counts.counts(), last: last});
  }

  const renders = {
    counts: function () {
      return counts.counts();
    },
    reset: function () {
      counts.reset();
      post('commit', {counts: {}, last: []});
    },
  };

  // ---------------------------------------------------------------- require

  const helpers = {
    log: log,
    Slow: Slow,
    SlowList: SlowList,
    createResource: createResource,
    inspectStore: inspectStore,
    watchStore: watchStore,
    renders: renders,
    step: step,
    describe: describe,
  };
  modules.sandbox = helpers;
  for (const name in helpers) {
    if (helpers[name] !== undefined) window[name] = helpers[name];
  }

  function sandboxRequire(name) {
    if (name === 'react-dom/client') return wrappedClient;
    if (Object.prototype.hasOwnProperty.call(modules, name))
      return modules[name];
    throw new Error(
      'Module "' +
        name +
        '" isn\'t available in sandboxes. Available: ' +
        Object.keys(modules).sort().join(', ') +
        (name === 'react-dom/server'
          ? '. Add data-server to the sandbox.'
          : '.')
    );
  }
  window.require = sandboxRequire;

  // ---------------------------------------------------------------- run

  let didRun = false;

  function waitForCommit(timeout) {
    return new Promise(function (resolve) {
      let done = false;
      function finish() {
        if (!done) {
          done = true;
          resolve();
        }
      }
      commitWaiters.push(finish);
      setTimeout(finish, timeout);
    });
  }

  function run(message) {
    if (didRun) {
      reportError(
        'hook',
        new Error('A sandbox frame runs code once. The host makes a new frame.')
      );
      return;
    }
    didRun = true;
    strict = !!message.strict;
    counts.setFlash(message.flash !== false);
    const module = {exports: {}};
    try {
      const factory = new Function(
        'require',
        'module',
        'exports',
        message.code + '\n//# sourceURL=sandbox-' + id + '.js'
      );
      factory(sandboxRequire, module, module.exports);
    } catch (error) {
      reportError('module', error);
      post('ran', {ok: false});
      return;
    }
    const App = module.exports && module.exports.default;
    const committed = waitForCommit(1000);
    if (App != null) {
      try {
        const root = wrappedClient.createRoot(document.getElementById('root'));
        root.render(React.createElement(App));
      } catch (error) {
        reportError('module', error);
        post('ran', {ok: false});
        return;
      }
    }
    if (isStep) {
      // The first render is the setup, not something to step through. React
      // schedules the render task from a microtask, so flush after it.
      Promise.resolve().then(function () {
        command('flush');
      });
    }
    committed.then(function () {
      post('ran', {ok: true});
    });
  }

  window.addEventListener('message', function (event) {
    if (event.source !== parent) return;
    const message = event.data;
    if (!message || message.__sandbox !== 1) return;
    switch (message.type) {
      case 'run':
        run(message);
        break;
      case 'step':
        if (!isStep) {
          post('step-state', {
            reqId: message.reqId,
            pending: false,
            log: [],
            error: 'not a stepper sandbox',
          });
        } else {
          command(message.cmd, message.count, message.reqId);
        }
        break;
      case 'inspect':
        post('stores', {reqId: message.reqId, stores: snapshots()});
        break;
      case 'reset-renders':
        renders.reset();
        break;
    }
  });

  // Content height, for data-height="auto".
  if (typeof ResizeObserver === 'function') {
    let lastHeight = -1;
    new ResizeObserver(function () {
      const height = Math.ceil(
        document.documentElement.getBoundingClientRect().height
      );
      if (height !== lastHeight) {
        lastHeight = height;
        post('size', {height: height});
      }
    }).observe(document.documentElement);
  }

  const build = window.__REACT_BUILD__ || {};
  post('ready', {
    build: {
      // The package version, as in VERSIONS.json and the benchmark build
      // label. React.version says 19.x for the same build.
      version: String(build.version || React.version),
      sha: String(build.sha || ''),
      dirty: !!build.dirty,
      channel: String(build.channel || ''),
    },
    runtime: isStep ? 'step' : 'dev',
    server: !!modules['react-dom/server'],
  });
})();
