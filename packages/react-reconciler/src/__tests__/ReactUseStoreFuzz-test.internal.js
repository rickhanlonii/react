/**
 * Copyright (c) Meta Platforms, Inc. and affiliates.
 *
 * This source code is licensed under the MIT license found in the
 * LICENSE file in the root directory of this source tree.
 *
 * @emails react-core
 */
'use strict';

// A differential fuzzer for use(store).
//
// Each case is a random app (a tree of components that read a few stores,
// some conditionally, under Suspense, Activity and components that mount and
// unmount) and a random list of actions (store updates at every priority,
// async actions, toggles, suspending and resolving, yielding partway through
// a render). The case runs twice: once with stores, and once with the same
// app written with useReducer (or useState, for a store without a reducer)
// at the root and one context per store. The committed output must match at
// every commit, and the store app must keep its invariants.
//
// Knobs:
//   STORE_FUZZ_SEED=<n>        run only this seed
//   STORE_FUZZ_RUNS=<n>        the number of seeds per mode (default 60)
//   STORE_FUZZ_SEED_START=<n>  the first seed (default 1)
//   STORE_FUZZ_FREE_DIFF=1     also compare the outputs in the free mode
//   STORE_FUZZ_VERBOSE=1       print the action list of every case
//   STORE_FUZZ_STRICT=1        don't work around the known findings
//   STORE_FUZZ_TRACE=1         print each app's render log and commits
//   STORE_FUZZ_COLLECT=1       run every seed, and print each failure's kind
//                              instead of stopping at the first one
//   STORE_FUZZ_FLAGS_OFF=a,b   turn these feature flags off

let React;
let ReactNoop;
let Scheduler;
let ContinuousEventPriority;
let waitForMicrotasks;
const Random = require('random-seed');

const SEED = process.env.STORE_FUZZ_SEED;
const RUNS = +(process.env.STORE_FUZZ_RUNS || 60);
const SEED_START = +(process.env.STORE_FUZZ_SEED_START || 1);
const FREE_DIFF = process.env.STORE_FUZZ_FREE_DIFF === '1';
const VERBOSE = process.env.STORE_FUZZ_VERBOSE === '1';
// Turns off the workarounds for known findings (see "Known findings").
const STRICT = process.env.STORE_FUZZ_STRICT === '1';
const TRACE = process.env.STORE_FUZZ_TRACE === '1';
const COLLECT = process.env.STORE_FUZZ_COLLECT === '1';
const FLAGS_OFF = process.env.STORE_FUZZ_FLAGS_OFF;

function loadReact() {
  jest.resetModules();
  if (FLAGS_OFF) {
    jest.mock('shared/ReactFeatureFlags', () => {
      const flags = {...jest.requireActual('shared/ReactFeatureFlags')};
      FLAGS_OFF.split(',').forEach(flag => {
        flags[flag] = false;
      });
      return flags;
    });
  }
  React = require('react');
  if (process.env.STORE_FUZZ_PRINT_FLAG) {
    console.log(
      'flag',
      require('shared/ReactFeatureFlags')[process.env.STORE_FUZZ_PRINT_FLAG],
    );
  }
  ReactNoop = require('react-noop-renderer');
  Scheduler = require('scheduler');
  ContinuousEventPriority =
    require('react-reconciler/constants').ContinuousEventPriority;
  waitForMicrotasks = require('internal-test-utils').waitForMicrotasks;
}

// ---------------------------------------------------------------------------
// Generating a case
// ---------------------------------------------------------------------------

const PRIORITIES = [
  {value: 'discrete', weight: 2},
  {value: 'continuous', weight: 1},
  {value: 'default', weight: 2},
  {value: 'transition', weight: 4},
  {value: 'idle', weight: 1},
  {value: 'sync', weight: 1},
];

function pick(rand, options) {
  let total = 0;
  for (let i = 0; i < options.length; i++) {
    total += options[i].weight;
  }
  let remaining = rand.floatBetween(0, total);
  for (let i = 0; i < options.length; i++) {
    remaining -= options[i].weight;
    if (remaining <= 0) {
      return options[i].value;
    }
  }
  return options[options.length - 1].value;
}

function chance(rand, p) {
  return rand.random() < p;
}

function pickOne(rand, list) {
  return list[rand.intBetween(0, list.length - 1)];
}

// mode: 'anchored' gives every store a reader that's mounted for the whole
// run, at the top of a single root. That's where a store must behave exactly
// like useReducer and context. 'free' lets every reader unmount, so updates
// can be held, and can render the app into two roots.
function generateCase(seed, mode) {
  const rand = Random.create(String(seed));
  const numStores = rand.intBetween(1, 3);
  const stores = [];
  for (let i = 0; i < numStores; i++) {
    stores.push({reducer: chance(rand, 0.6)});
  }

  let nextId = 0;
  let remaining = rand.intBetween(3, 10);
  const toggles = [];
  const suspenders = [];
  let hasDataReaders = false;

  function createNode(depth) {
    remaining--;
    const kinds = [{value: 'reader', weight: 5}];
    if (depth < 4) {
      kinds.push({value: 'suspense', weight: 2});
      kinds.push({value: 'activity', weight: 1.5});
      kinds.push({value: 'gate', weight: 1.5});
    }
    kinds.push({value: 'suspender', weight: 1});
    const kind = pick(rand, kinds);
    const id = nextId++;
    switch (kind) {
      case 'reader': {
        const reads = [];
        const count = Math.min(numStores, rand.intBetween(1, 2));
        const first = rand.intBetween(0, numStores - 1);
        let hasCond = false;
        for (let i = 0; i < count; i++) {
          const cond = chance(rand, 0.25);
          hasCond = hasCond || cond;
          reads.push({store: (first + i) % numStores, cond});
        }
        const suspendOnData = chance(rand, 0.25);
        hasDataReaders = hasDataReaders || suspendOnData;
        if (hasCond) {
          toggles.push('c' + id);
        }
        return {
          kind,
          id,
          reads,
          condInitially: chance(rand, 0.5),
          suspendOnData,
          useThenable: chance(rand, 0.5),
          sameElement: chance(rand, 0.3),
          children:
            depth < 4 && chance(rand, 0.3) ? createChildren(depth + 1, 2) : [],
        };
      }
      case 'suspense':
        return {kind, id, children: createChildren(depth + 1, 3)};
      case 'activity':
        toggles.push('a' + id);
        return {
          kind,
          id,
          initiallyVisible: chance(rand, 0.7),
          children: createChildren(depth + 1, 3),
        };
      case 'gate':
        toggles.push('g' + id);
        return {
          kind,
          id,
          initiallyOn: chance(rand, 0.7),
          children: createChildren(depth + 1, 3),
        };
      case 'suspender':
      default:
        suspenders.push(id);
        return {
          kind: 'suspender',
          id,
          useThenable: chance(rand, 0.5),
          initiallyResolved: chance(rand, 0.7),
        };
    }
  }

  function createChildren(depth, limit) {
    const children = [];
    const count = rand.intBetween(1, limit);
    while (remaining > 0 && children.length < count) {
      children.push(createNode(depth));
    }
    return children;
  }

  // Anchors are rendered above every boundary, so they're mounted for the
  // whole run and the shrinker leaves them alone.
  const anchors = [];
  const tree = [];
  if (mode === 'anchored') {
    for (let i = 0; i < numStores; i++) {
      anchors.push({
        kind: 'reader',
        id: nextId++,
        reads: [{store: i, cond: false}],
        condInitially: true,
        suspendOnData: false,
        useThenable: false,
        sameElement: false,
        children: [],
      });
    }
  }
  while (remaining > 0) {
    tree.push(createNode(0));
  }

  // Keys a component can suspend on. Each is resolved by an action, or at
  // the end of the run.
  const keys = [];
  suspenders.forEach(id => keys.push('s' + id + 'v0'));
  const bumps = new Map(suspenders.map(id => [id, 0]));

  let nextToken = 0;
  const slowTokens = [];
  function createStoreAction(store) {
    const tok = 'a' + nextToken++;
    if (hasDataReaders && chance(rand, 0.25)) {
      slowTokens.push(tok);
      // Some data never resolves. A reader that suspends on it shows again
      // once the store has a newer value, which needs its boundary to retry
      // when the store changes (DCP-16).
      if (!chance(rand, 0.3)) {
        keys.push('t' + tok);
      }
    }
    if (stores[store].reducer) {
      // An update that doesn't change the value bails out without rendering
      // when the store has nothing pending, and useReducer has no eager
      // bailout, so its render can interrupt a render in progress (DESIGN.md,
      // "Eager computation and bailout"). So only the free mode has them.
      return mode === 'free' && chance(rand, 0.1)
        ? {kind: 'same'}
        : {kind: 'append', tok};
    }
    // The free mode sets values that can repeat, so an update can produce
    // the value the store already has and bail out eagerly. A store bails
    // out whenever it has nothing pending, and useState only when its
    // component has no pending work, so the other updates batch differently
    // (DESIGN.md, "Eager computation and bailout").
    return chance(rand, 0.2)
      ? {
          kind: 'set',
          value: mode === 'free' ? pickOne(rand, ['x', 'y']) : 'v' + tok,
        }
      : {kind: 'updater', tok};
  }

  function createEntry() {
    const options = [{value: 'store', weight: 6}];
    if (toggles.length > 0) {
      options.push({value: 'toggle', weight: 2});
    }
    if (suspenders.length > 0) {
      options.push({value: 'bump', weight: 1});
    }
    switch (pick(rand, options)) {
      case 'toggle':
        return {t: 'toggle', id: pickOne(rand, toggles)};
      case 'bump': {
        const id = pickOne(rand, suspenders);
        const version = bumps.get(id) + 1;
        bumps.set(id, version);
        keys.push('s' + id + 'v' + version);
        return {t: 'bump', id: 's' + id};
      }
      case 'store':
      default: {
        const store = rand.intBetween(0, numStores - 1);
        return {t: 'store', store, action: createStoreAction(store)};
      }
    }
  }

  function createEntries(max) {
    const entries = [];
    const count = rand.intBetween(1, max);
    for (let i = 0; i < count; i++) {
      entries.push(createEntry());
    }
    return entries;
  }

  const numRoots = mode === 'free' && chance(rand, 0.3) ? 2 : 1;
  const actions = [];
  const numActions = rand.intBetween(5, 30);
  let nextAsync = 0;
  const unresolvedAsync = [];
  for (let i = 0; i < numActions; i++) {
    const options = [
      {value: 'event', weight: 10},
      {value: 'async', weight: unresolvedAsync.length < 3 ? 2 : 0},
      {value: 'resolveAsync', weight: unresolvedAsync.length > 0 ? 3 : 0},
      {value: 'resolve', weight: keys.length > 0 ? 3 : 0},
      {value: 'yield', weight: 3},
      {value: 'tick', weight: 3},
      {value: 'flush', weight: 2},
    ];
    const type = pick(rand, options);
    const root = rand.intBetween(0, numRoots - 1);
    switch (type) {
      case 'event':
        actions.push({
          type,
          root,
          priority: pick(rand, PRIORITIES),
          entries: createEntries(3),
        });
        break;
      case 'async': {
        const id = nextAsync++;
        unresolvedAsync.push(id);
        actions.push({
          type,
          root,
          id,
          before: createEntries(2),
          after: chance(rand, 0.8) ? createEntries(2) : [],
          afterTransition: chance(rand, 0.7),
        });
        break;
      }
      case 'resolveAsync': {
        const index = rand.intBetween(0, unresolvedAsync.length - 1);
        actions.push({type, id: unresolvedAsync[index]});
        unresolvedAsync.splice(index, 1);
        break;
      }
      case 'resolve':
        actions.push({type, key: pickOne(rand, keys)});
        break;
      case 'yield':
        actions.push({type, count: chance(rand, 0.7) ? 1 : 2});
        break;
      default:
        actions.push({type});
    }
  }

  return {
    seed,
    mode,
    // A context change conservatively retries every Suspense boundary below
    // the provider that shows a fallback, and a store update only retries
    // its readers (DESIGN.md, "Differences from context"). In the anchored
    // mode, a component above each boundary reads every store, so both apps
    // retry the same boundaries. The free mode leaves it out, so a boundary
    // only retries through its own subscription (DCP-16).
    retriers: mode === 'anchored',
    strict: chance(rand, 0.3),
    // In the anchored mode, the context app's providers must mount even if
    // the tree suspends on mount, so there's always a root boundary.
    rootSuspense: mode === 'anchored' || chance(rand, 0.8),
    numRoots,
    stores,
    anchors,
    tree,
    slowTokens,
    keys,
    actions,
  };
}

// ---------------------------------------------------------------------------
// Running a case
// ---------------------------------------------------------------------------

function fold(storeSpec, actions) {
  let value = 'i';
  for (let i = 0; i < actions.length; i++) {
    const action = actions[i];
    switch (action.kind) {
      case 'same':
        break;
      case 'set':
        value = action.value;
        break;
      default:
        value = value + '.' + action.tok;
    }
  }
  return value;
}

function lastToken(value) {
  const parts = String(value).split('.');
  return parts[parts.length - 1];
}

function serialize(node) {
  if (node == null || typeof node === 'boolean') {
    return '';
  }
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }
  if (Array.isArray(node)) {
    return node.map(serialize).join('');
  }
  const props = node.props;
  if (props.prop === undefined) {
    // A fragment.
    return serialize(props.children);
  }
  return '[' + (props.hidden ? 'hidden ' : '') + props.prop + ']';
}

// The values that the visible readers of each store show.
function visibleValues(output) {
  const byStore = new Map();
  const re = /\[R\d+((?: s\d+=[^ \]]+)*)\]/g;
  let match;
  while ((match = re.exec(output)) !== null) {
    const reads = match[1].trim().split(' ').filter(Boolean);
    reads.forEach(read => {
      const [store, value] = read.slice(1).split('=');
      if (!byStore.has(store)) {
        byStore.set(store, new Set());
      }
      byStore.get(store).add(value);
    });
  }
  return byStore;
}

class FuzzFailure extends Error {
  constructor(kind, message) {
    super(kind + ': ' + message);
    this.kind = kind;
  }
}

// app: 'store' or 'context'.
async function runApp(spec, app) {
  const {
    use,
    useState,
    useReducer,
    useInsertionEffect,
    useMemo,
    startTransition,
    Suspense,
    Activity,
    StrictMode,
    Profiler,
    createContext,
  } = React;

  const env = {
    reducerCalls: 0,
    errors: [],
    commits: [],
    step: -1,
    dispatched: spec.stores.map(() => []),
    cache: new Map(),
    asyncResolvers: new Map(),
    // One map of state setters per root, keyed by the toggle's id.
    setters: [],
    dispatchers: [],
    trace: [],
    // The text each reader last rendered, by root and node id.
    lastText: new Map(),
  };
  const slowTokens = new Set(spec.slowTokens);

  function countReducerCall(index, action) {
    env.reducerCalls++;
    if (TRACE) {
      env.trace.push(
        'reducer s' + index + ' ' + (action.kind === 'same' ? '=' : action.tok),
      );
    }
  }

  const reducers = spec.stores.map((_, index) => (state, action) => {
    countReducerCall(index, action);
    if (action.kind === 'same') {
      return state;
    }
    return state + '.' + action.tok;
  });

  const stores = spec.stores.map((s, index) =>
    s.reducer
      ? React.unstable_createStore('i', reducers[index])
      : React.unstable_createStore('i'),
  );
  const contexts = spec.stores.map(() => createContext(null));

  function toRuntimeAction(storeIndex, action) {
    if (spec.stores[storeIndex].reducer) {
      return action;
    }
    if (action.kind === 'set') {
      return action.value;
    }
    return state => {
      countReducerCall(storeIndex, action);
      return state + '.' + action.tok;
    };
  }

  function getEntry(key) {
    let entry = env.cache.get(key);
    if (entry === undefined) {
      const listeners = [];
      entry = {
        status: 'pending',
        value: undefined,
        listeners,
        then(resolve) {
          if (entry.status === 'fulfilled') {
            Promise.resolve().then(() => resolve(entry.value));
          } else {
            listeners.push(resolve);
          }
        },
      };
      env.cache.set(key, entry);
    }
    return entry;
  }

  function resolveKey(key) {
    const entry = getEntry(key);
    if (entry.status === 'pending') {
      entry.status = 'fulfilled';
      entry.value = key;
      const listeners = entry.listeners.slice();
      entry.listeners.length = 0;
      listeners.forEach(listener => listener(key));
    }
  }

  function readData(key, viaUse) {
    const entry = getEntry(key);
    if (viaUse) {
      // Always call use(), so the replay of a suspended render calls it too.
      return use(entry);
    }
    if (entry.status === 'fulfilled') {
      return entry.value;
    }
    throw entry;
  }

  function createTree(rootIndex) {
    const setters = (env.setters[rootIndex] = {});

    // Register a setter once the component mounts. Hiding an Activity doesn't
    // disconnect insertion effects, so a hidden component can still update.
    function useSetter(key, setter) {
      useInsertionEffect(() => {
        setters[key] = setter;
        return () => {
          if (setters[key] === setter) {
            delete setters[key];
          }
        };
      }, [key, setter]);
    }

    function readStore(index) {
      return app === 'store' ? use(stores[index]) : use(contexts[index]);
    }

    function Leaf({text, children}) {
      return (
        <>
          <span prop={text} />
          {children}
        </>
      );
    }

    function Reader({node, children}) {
      const [cond, setCond] = useState(node.condInitially);
      useSetter('c' + node.id, setCond);
      let text = 'R' + node.id;
      const values = [];
      for (let i = 0; i < node.reads.length; i++) {
        const read = node.reads[i];
        if (read.cond && !cond) {
          continue;
        }
        const value = readStore(read.store);
        values.push(value);
        text += ' s' + read.store + '=' + value;
      }
      // Log only renders that change what the component last rendered, in
      // any render, so the two apps log the same renders: a store reader can
      // render again with the same value, where a context consumer isn't
      // rendered at all. The logs decide where a render yields.
      const key = rootIndex + ':' + node.id;
      if (env.lastText.get(key) !== text) {
        env.lastText.set(key, text);
        Scheduler.log(text);
      }
      if (node.suspendOnData) {
        // Data for the latest update. Only slow tokens suspend, but every
        // render reads the data, so a retry calls use() the same way.
        for (let i = 0; i < values.length; i++) {
          const token = lastToken(values[i]);
          if (!slowTokens.has(token)) {
            resolveKey('t' + token);
          }
          readData('t' + token, node.useThenable);
        }
        if (values.length === 0) {
          // A conditional read can leave no values. Read something anyway.
          resolveKey('tnone');
          readData('tnone', node.useThenable);
        }
      }
      // Like the compiler: the same element when the output didn't change.
      const element = useMemo(
        () => <Leaf text={text}>{children}</Leaf>,
        [text, children],
      );
      return node.sameElement ? element : <Leaf text={text}>{children}</Leaf>;
    }

    // Reads every store, and renders the boundary itself, so the boundary
    // renders again, and retries its content, whenever a store changes.
    function RetryOnChange({fallback, children}) {
      for (let i = 0; i < spec.stores.length; i++) {
        readStore(i);
      }
      return <Suspense fallback={fallback}>{children}</Suspense>;
    }

    function SuspenseBoundary({id, children}) {
      const fallback = <span prop={'F' + id} />;
      const content = (
        <>
          <span prop={'<' + id} />
          {children}
          <span prop={'>' + id} />
        </>
      );
      return spec.retriers ? (
        <RetryOnChange fallback={fallback}>{content}</RetryOnChange>
      ) : (
        <Suspense fallback={fallback}>{content}</Suspense>
      );
    }

    function Gate({node, children}) {
      const [on, setOn] = useState(node.initiallyOn);
      useSetter('g' + node.id, setOn);
      return on ? children : null;
    }

    function ActivityGate({node, children}) {
      const [visible, setVisible] = useState(node.initiallyVisible);
      useSetter('a' + node.id, setVisible);
      // Works around a React bug in the oracle (see "Known findings"): when a
      // hidden tree is deferred, context changes are propagated into it only
      // if no parent above it already propagated them. Reading the contexts
      // here makes this component the consumer that the parent's propagation
      // stops at, so the deferral propagates into the whole hidden tree. The
      // store app reads the stores here too, so both apps render (and defer)
      // the hidden tree in the same renders.
      for (let i = 0; i < spec.stores.length; i++) {
        readStore(i);
      }
      return (
        <Activity mode={visible ? 'visible' : 'hidden'}>{children}</Activity>
      );
    }

    function Suspender({node}) {
      const [version, setVersion] = useState(0);
      useSetter('s' + node.id, setVersion);
      readData('s' + node.id + 'v' + version, node.useThenable);
      return <span prop={'S' + node.id + 'v' + version} />;
    }

    function build(nodes) {
      return nodes.map(node => {
        const children = node.children ? build(node.children) : null;
        switch (node.kind) {
          case 'reader':
            return (
              <Reader key={node.id} node={node}>
                {children.length > 0 ? children : null}
              </Reader>
            );
          case 'suspense':
            return (
              <SuspenseBoundary key={node.id} id={node.id}>
                {children}
              </SuspenseBoundary>
            );
          case 'activity':
            return (
              <ActivityGate key={node.id} node={node}>
                {children}
              </ActivityGate>
            );
          case 'gate':
            return (
              <Gate key={node.id} node={node}>
                {children}
              </Gate>
            );
          case 'suspender':
          default:
            return <Suspender key={node.id} node={node} />;
        }
      });
    }

    function ReducerProvider({index, children}) {
      const [state, dispatch] = useReducer(reducers[index], 'i');
      env.dispatchers[index] = dispatch;
      const Context = contexts[index];
      return <Context value={state}>{children}</Context>;
    }

    function StateProvider({index, children}) {
      const [state, setState] = useState('i');
      env.dispatchers[index] = setState;
      const Context = contexts[index];
      return <Context value={state}>{children}</Context>;
    }

    let element = build(spec.tree);
    if (spec.rootSuspense) {
      element = <SuspenseBoundary id="root">{element}</SuspenseBoundary>;
    }
    element = (
      <>
        {build(spec.anchors)}
        {element}
      </>
    );
    if (app === 'context') {
      for (let i = spec.stores.length - 1; i >= 0; i--) {
        const Provider = spec.stores[i].reducer
          ? ReducerProvider
          : StateProvider;
        element = <Provider index={i}>{element}</Provider>;
      }
    }
    if (spec.strict) {
      element = <StrictMode>{element}</StrictMode>;
    }
    return element;
  }

  function withPriority(priority, fn) {
    switch (priority) {
      case 'discrete':
        ReactNoop.discreteUpdates(fn);
        break;
      case 'continuous':
        ReactNoop.unstable_runWithPriority(ContinuousEventPriority, fn);
        break;
      case 'transition':
        startTransition(fn);
        break;
      case 'idle':
        ReactNoop.idleUpdates(fn);
        break;
      case 'sync':
        ReactNoop.flushSync(fn);
        break;
      case 'default':
      default:
        fn();
    }
  }

  function dispatchEntry(rootIndex, entry) {
    switch (entry.t) {
      case 'store': {
        env.dispatched[entry.store].push(entry.action);
        const action = toRuntimeAction(entry.store, entry.action);
        if (app === 'store') {
          stores[entry.store].update(action);
        } else {
          env.dispatchers[entry.store](action);
        }
        break;
      }
      case 'toggle': {
        const setter = env.setters[rootIndex][entry.id];
        if (setter !== undefined) {
          setter(value => !value);
        }
        break;
      }
      case 'bump': {
        const setter = env.setters[rootIndex][entry.id];
        if (setter !== undefined) {
          setter(version => version + 1);
        }
        break;
      }
    }
  }

  async function flushAll() {
    for (let i = 0; i < 1000; i++) {
      await waitForMicrotasks();
      if (!Scheduler.unstable_hasPendingWork()) {
        if (jest.getTimerCount() === 0) {
          return;
        }
        // Like act(): a pending timer is a throttled Suspense commit. Fire it.
        jest.runOnlyPendingTimers();
        continue;
      }
      Scheduler.unstable_flushAllWithoutAsserting();
    }
    throw new FuzzFailure('hang', 'work is still pending after 1000 flushes');
  }

  // A store's state is processed when the HostRoot begins, and a reader that
  // renders an update from a pending async action suspends on it. A context
  // app's state is processed, and suspends, when its provider renders. So if
  // an action finishes in the middle of a render, the store app's reader can
  // render after it finished, and commit its first updates without the ones
  // after its await, like a useState component that renders then would. The
  // provider rendered before it finished, suspended, and restarts with all of
  // them. In the anchored mode, renders finish before an action does.
  function finishRenderingBeforeAsyncActionsResolve() {
    return spec.mode === 'anchored' ? flushAll() : Promise.resolve();
  }

  const roots = [];
  const elements = [];
  const outputs = () => roots.map(root => serialize(root.getChildrenAsJSX()));

  function onCommit(rootIndex) {
    const output = serialize(roots[rootIndex].getChildrenAsJSX());
    if (TRACE) {
      env.trace.push(...Scheduler.unstable_clearLog());
      env.trace.push('commit ' + output);
    }
    env.commits.push({step: env.step, root: rootIndex, output});
  }

  // Lets temporary logging in React's source write to the trace.
  global.__FUZZ_DEBUG = TRACE ? msg => env.trace.push(msg) : null;
  const originalConsoleError = console.error;
  const originalReportError = global.reportError;
  console.error = (...args) => {
    env.errors.push('console.error: ' + String(args[0]).slice(0, 300));
  };
  global.reportError = error => {
    env.errors.push('reportError: ' + (error && error.message));
  };

  try {
    spec.tree.forEach(function preResolve(node) {
      if (node.kind === 'suspender' && node.initiallyResolved) {
        resolveKey('s' + node.id + 'v0');
      }
      (node.children || []).forEach(preResolve);
    });

    for (let r = 0; r < spec.numRoots; r++) {
      const root = ReactNoop.createRoot({
        onUncaughtError(error) {
          env.errors.push('onUncaughtError: ' + error.message);
        },
        onCaughtError(error) {
          env.errors.push('onCaughtError: ' + error.message);
        },
        onRecoverableError(error) {
          env.errors.push('onRecoverableError: ' + error.message);
        },
      });
      roots.push(root);
      const element = (
        <Profiler id={'root' + r} onRender={() => onCommit(r)}>
          {createTree(r)}
        </Profiler>
      );
      elements.push(element);
      root.render(element);
    }
    await flushAll();

    // Returns a promise only for the actions that wait. The loop below has
    // no closures, so Babel doesn't turn its body into an async function
    // that's awaited on every iteration, which would flush microtasks (and
    // sync work) between every pair of actions.
    const performAction = action => {
      switch (action.type) {
        case 'event':
          withPriority(action.priority, () => {
            action.entries.forEach(entry => dispatchEntry(action.root, entry));
          });
          return null;
        case 'async':
          startTransition(async () => {
            action.before.forEach(entry => dispatchEntry(action.root, entry));
            await new Promise(resolve =>
              env.asyncResolvers.set(action.id, resolve),
            );
            const dispatchAfter = () =>
              action.after.forEach(entry => dispatchEntry(action.root, entry));
            if (action.afterTransition) {
              startTransition(dispatchAfter);
            } else {
              dispatchAfter();
            }
          });
          return null;
        case 'resolveAsync': {
          const resolveAsync = () => {
            const resolve = env.asyncResolvers.get(action.id);
            env.asyncResolvers.delete(action.id);
            if (resolve !== undefined) {
              resolve();
            }
            return waitForMicrotasks();
          };
          return spec.mode === 'anchored'
            ? finishRenderingBeforeAsyncActionsResolve().then(resolveAsync)
            : resolveAsync();
        }
        case 'resolve':
          resolveKey(action.key);
          return waitForMicrotasks();
        case 'yield':
          return waitForMicrotasks().then(() => {
            if (TRACE) {
              env.trace.push(...Scheduler.unstable_clearLog());
            }
            Scheduler.unstable_clearLog();
            if (Scheduler.unstable_hasPendingWork()) {
              Scheduler.unstable_flushNumberOfYields(action.count);
            }
            if (TRACE) {
              env.trace.push('(yielded)');
            }
          });
        case 'tick':
          return waitForMicrotasks();
        case 'flush':
          return flushAll();
        default:
          return null;
      }
    };

    const stepOutputs = [];
    for (let i = 0; i < spec.actions.length; i++) {
      env.step = i;
      if (TRACE) {
        env.trace.push(...Scheduler.unstable_clearLog());
        env.trace.push('-- step ' + i + ': ' + JSON.stringify(spec.actions[i]));
      }
      const pending = performAction(spec.actions[i]);
      if (pending !== null) {
        await pending;
      }
      stepOutputs.push(outputs());
    }

    // Finish everything: resolve every key and async action, and flush.
    // Then update every store once more, so no reader waits on data that
    // never resolves.
    env.step = spec.actions.length;
    if (TRACE) {
      env.trace.push(...Scheduler.unstable_clearLog());
      env.trace.push('-- finish');
    }
    for (let pass = 0; pass < 3; pass++) {
      spec.keys.forEach(resolveKey);
      if (env.asyncResolvers.size > 0) {
        await finishRenderingBeforeAsyncActionsResolve();
      }
      Array.from(env.asyncResolvers.values()).forEach(resolve => resolve());
      env.asyncResolvers.clear();
      await flushAll();
      if (pass === 0) {
        spec.stores.forEach((store, index) => {
          const action = store.reducer
            ? {kind: 'append', tok: 'end'}
            : {kind: 'updater', tok: 'end'};
          dispatchEntry(0, {t: 'store', store: index, action});
        });
      }
    }
    const finalOutputs = outputs();

    // Inspect the store app's internals while it's idle.
    const pending = [];
    if (
      app === 'store' &&
      !STRICT &&
      stores.some(store => store._pendingTransitionUpdates !== null)
    ) {
      // Known finding 1: held updates whose transitions are done stay on the
      // store until some root commits. Commit each root once, without
      // changing anything, and check again.
      roots.forEach((root, r) => root.render(elements[r]));
      await flushAll();
    }
    if (app === 'store') {
      stores.forEach((store, i) => {
        if (store._headQueue !== null) {
          pending.push('store ' + i + ' has a _headQueue');
        }
        if (store._pendingTransitionUpdates !== null) {
          pending.push('store ' + i + ' has held updates');
        }
        store._records.forEach(record => {
          if (record.pending !== null || record.lanes !== 0) {
            pending.push('store ' + i + ' has a record with pending updates');
          }
          if (record.root.pendingLanes !== 0) {
            pending.push(
              'a root that reads store ' +
                i +
                ' has pending lanes ' +
                record.root.pendingLanes.toString(2),
            );
          }
        });
      });
    }

    // Unmount, and check that the stores let go of the roots.
    roots.forEach(root => root.render(null));
    await flushAll();
    const retained = [];
    if (app === 'store') {
      stores.forEach((store, i) => {
        if (store._records.length !== 0) {
          retained.push(
            'store ' + i + ' keeps ' + store._records.length + ' records',
          );
        }
      });
    }

    return {
      commits: env.commits,
      stepOutputs,
      finalOutputs,
      dispatched: env.dispatched,
      reducerCalls: env.reducerCalls,
      errors: env.errors,
      pending,
      retained,
    };
  } finally {
    if (TRACE) {
      console.log(app + ':\n  ' + env.trace.join('\n  '));
    }
    console.error = originalConsoleError;
    global.reportError = originalReportError;
    Scheduler.unstable_clearLog();
  }
}

// The distinct outputs each root committed, with the step that committed
// them. Commits that didn't change the output are left out: a store can skip
// a render that a context provider does, like an eager bailout.
// The values a hidden reader shows aren't compared. React context doesn't
// always propagate a change into a hidden tree (see "Known findings"), so the
// context app's hidden readers can show an older value until the next change,
// and a store's hidden readers render the value committed at the root (DESIGN.md,
// "Hidden trees"). checkHiddenReaders checks the store app's instead.
function withoutHiddenValues(output) {
  return output.replace(/\[hidden R(\d+)[^\]]*\]/g, '[hidden R$1]');
}

function distinctCommits(commits, numRoots) {
  const result = [];
  const last = new Array(numRoots).fill('');
  commits.forEach(({step, root, output: fullOutput}) => {
    const output = withoutHiddenValues(fullOutput);
    if (output !== last[root]) {
      last[root] = output;
      result.push({step, root, output});
    }
  });
  return result;
}

function formatCommit(commit) {
  return commit === undefined
    ? '(none)'
    : 'step ' + commit.step + ': ' + commit.output;
}

function isSameCommit(a, b) {
  return (
    a !== undefined &&
    b !== undefined &&
    a.step === b.step &&
    a.root === b.root &&
    a.output === b.output
  );
}

function compareCommits(storeCommits, contextCommits) {
  const length = Math.max(storeCommits.length, contextCommits.length);
  for (let i = 0; i < length; i++) {
    if (!isSameCommit(storeCommits[i], contextCommits[i])) {
      return {store: storeCommits[i], context: contextCommits[i], index: i};
    }
  }
  return null;
}

function checkInvariants(spec, result) {
  if (result.errors.length > 0) {
    throw new FuzzFailure('error', result.errors.join('\n'));
  }
  checkTearing(result);
  checkHiddenReaders(spec, result);
  checkFinalState(spec, result);
}

// A hidden reader can show an older version of a store than the visible
// readers, until its hidden tree renders, but not one its root never showed.
// Only the anchored mode always has a visible reader of every store.
function checkHiddenReaders(spec, result) {
  if (spec.mode !== 'anchored') {
    return;
  }
  const shown = new Map();
  result.commits.forEach(({step, root, output}) => {
    visibleValues(output).forEach((values, store) => {
      const key = root + ':' + store;
      if (!shown.has(key)) {
        shown.set(key, new Set(['i']));
      }
      values.forEach(value => shown.get(key).add(value));
    });
    const re = /\[hidden R\d+((?: s\d+=[^ \]]+)*)\]/g;
    let match;
    while ((match = re.exec(output)) !== null) {
      match[1]
        .trim()
        .split(' ')
        .filter(Boolean)
        .forEach(read => {
          const [store, value] = read.slice(1).split('=');
          const values = shown.get(root + ':' + store);
          if (values !== undefined && !values.has(value)) {
            throw new FuzzFailure(
              'hidden-ahead',
              'step ' +
                step +
                ', root ' +
                root +
                ': a hidden reader of store ' +
                store +
                ' shows ' +
                value +
                ', which no visible reader showed\n' +
                output,
            );
          }
        });
    }
  });
}

// Every visible reader in a root shows the same version of a store at each
// commit.
function checkTearing(result) {
  result.commits.forEach(({step, root, output}) => {
    visibleValues(output).forEach((values, store) => {
      if (values.size > 1) {
        throw new FuzzFailure(
          'tearing',
          'step ' +
            step +
            ', root ' +
            root +
            ': store ' +
            store +
            ' shows ' +
            Array.from(values).join(' and ') +
            '\n' +
            output,
        );
      }
    });
  });
}

function checkFinalState(spec, result) {
  // Once everything resolved, no boundary shows its fallback.
  result.finalOutputs.forEach((output, root) => {
    const fallback = /\[F[^\] ]+\]/.exec(output);
    if (fallback !== null) {
      throw new FuzzFailure(
        'stuck-fallback',
        'root ' + root + ' still shows ' + fallback[0] + '\n' + output,
      );
    }
  });
  // Once idle, every store is its actions applied in dispatch order.
  result.finalOutputs.forEach((output, root) => {
    visibleValues(output).forEach((values, store) => {
      const expected = fold(spec.stores[store], result.dispatched[store]);
      const actual = Array.from(values)[0];
      if (actual !== expected) {
        throw new FuzzFailure(
          'final-value',
          'root ' +
            root +
            ': store ' +
            store +
            ' shows ' +
            actual +
            ', expected ' +
            expected,
        );
      }
    });
  });
  if (result.pending.length > 0) {
    throw new FuzzFailure('pending', result.pending.join('\n'));
  }
  if (result.retained.length > 0) {
    throw new FuzzFailure('retained', result.retained.join('\n'));
  }
}

async function runCase(spec) {
  loadReact();
  const storeResult = await runApp(spec, 'store');
  checkInvariants(spec, storeResult);
  if (spec.mode === 'free' && !FREE_DIFF) {
    return;
  }
  if (spec.numRoots > 1) {
    return;
  }
  loadReact();
  const contextResult = await runApp(spec, 'context');
  // React context itself can show two values in one commit (see "Known
  // findings"). Then the oracle is wrong, not the store.
  if (!STRICT) {
    try {
      checkTearing(contextResult);
    } catch (error) {
      throw new FuzzFailure('oracle-tearing', error.message);
    }
  }
  if (contextResult.errors.length > 0) {
    throw new FuzzFailure(
      'oracle-error',
      'the context app failed: ' + contextResult.errors.join('\n'),
    );
  }
  // The same actions were dispatched in the same order.
  expectEqual(
    'dispatch-order',
    JSON.stringify(storeResult.dispatched),
    JSON.stringify(contextResult.dispatched),
  );
  // The store app commits the same outputs as the context app.
  const storeCommits = distinctCommits(storeResult.commits, spec.numRoots);
  const contextCommits = distinctCommits(contextResult.commits, spec.numRoots);
  const mismatch = compareCommits(storeCommits, contextCommits);
  if (mismatch !== null) {
    throw new FuzzFailure(
      'differential',
      'commit ' +
        mismatch.index +
        ' differs\n  store:   ' +
        formatCommit(mismatch.store) +
        '\n  context: ' +
        formatCommit(mismatch.context) +
        '\nstore commits:\n  ' +
        storeCommits.map(formatCommit).join('\n  ') +
        '\ncontext commits:\n  ' +
        contextCommits.map(formatCommit).join('\n  '),
    );
  }
  // The reducer runs no more often than useReducer's. This is only checked
  // with STORE_FUZZ_STRICT=1, because of known finding 2 (a render that skips
  // every update to a store with a new update in another lane runs its
  // reducer again) and because the HostRoot processes every store before any
  // reader can suspend, where a provider that suspends stops the providers
  // below it (see the report). In Strict Mode, a reader replays the reducer
  // once per state, in every attempt of a render, which is DEV only, so
  // Strict Mode runs aren't counted.
  if (
    STRICT &&
    !spec.strict &&
    storeResult.reducerCalls > contextResult.reducerCalls
  ) {
    throw new FuzzFailure(
      'reducer-calls',
      'the store ran reducers ' +
        storeResult.reducerCalls +
        ' times, useReducer ' +
        contextResult.reducerCalls,
    );
  }
}

function expectEqual(kind, actual, expected) {
  if (actual !== expected) {
    throw new FuzzFailure(kind, actual + '\n!==\n' + expected);
  }
}

async function failureOf(spec) {
  try {
    await runCase(spec);
    return null;
  } catch (error) {
    if (error instanceof FuzzFailure) {
      return error;
    }
    // An error that escaped React or the harness. Known finding 5 (not store
    // specific): resolving the data of a component in a hidden Activity that
    // was deleted crashes in resolveRetryWakeable.
    const stack = String((error && error.stack) || error);
    const isKnownCrash =
      !STRICT &&
      stack.includes('resolveRetryWakeable') &&
      stack.includes('_retryCache');
    const crash = new FuzzFailure(
      isKnownCrash ? 'known-activity-retry-crash' : 'crash',
      String((error && error.stack) || error)
        .split('\n')
        .slice(0, 12)
        .join('\n'),
    );
    return crash;
  }
}

// Remove actions, then tree nodes, one at a time, while the case still fails
// the same way.
async function shrink(spec, kind) {
  let current = spec;
  let changed = true;
  while (changed) {
    changed = false;
    for (let i = current.actions.length - 1; i >= 0; i--) {
      const candidate = {
        ...current,
        actions: current.actions.filter((_, j) => j !== i),
      };
      const error = await failureOf(candidate);
      if (error !== null && error.kind === kind) {
        current = candidate;
        changed = true;
      }
    }
    const ids = [];
    (function collect(nodes) {
      nodes.forEach(node => {
        ids.push(node.id);
        collect(node.children || []);
      });
    })(current.tree);
    for (let i = ids.length - 1; i >= 0; i--) {
      const candidate = removeNode(current, ids[i]);
      const error = await failureOf(candidate);
      if (error !== null && error.kind === kind) {
        current = candidate;
        changed = true;
      }
    }
    const flags =
      current.mode === 'anchored' ? ['strict'] : ['strict', 'rootSuspense'];
    for (let i = 0; i < flags.length; i++) {
      const flag = flags[i];
      if (current[flag]) {
        const candidate = {...current, [flag]: false};
        const error = await failureOf(candidate);
        if (error !== null && error.kind === kind) {
          current = candidate;
          changed = true;
        }
      }
    }
  }
  return current;
}

function removeNode(spec, id) {
  function filter(nodes) {
    return nodes
      .filter(node => node.id !== id)
      .map(node =>
        node.children ? {...node, children: filter(node.children)} : node,
      );
  }
  return {...spec, tree: filter(spec.tree)};
}

function describeCase(spec) {
  return JSON.stringify(spec);
}

async function fuzz(seed, mode) {
  const spec = generateCase(seed, mode);
  if (VERBOSE) {
    console.log(describeCase(spec));
  }
  const error = await failureOf(spec);
  if (error === null) {
    return;
  }
  if (error.kind === 'oracle-tearing') {
    skippedForOracle.push(seed);
    return;
  }
  if (error.kind === 'known-activity-retry-crash') {
    skippedForCrash.push(seed);
    return;
  }
  if (COLLECT) {
    collected.push(
      mode +
        ' ' +
        seed +
        ' ' +
        error.kind +
        ' ' +
        error.message.split('\n')[0].slice(0, 120),
    );
    return;
  }
  const minimal = await shrink(spec, error.kind);
  const minimalError = await failureOf(minimal);
  console.log(
    'use(store) fuzzer: seed ' +
      seed +
      ' (' +
      mode +
      ') failed.\n\n' +
      (minimalError || error).message +
      '\n\nMinimal case, ready to paste into the "regressions" block:\n\n' +
      "  it('seed " +
      seed +
      "', () => runRegression(" +
      describeCase(minimal) +
      '));\n',
  );
  throw minimalError || error;
}

// Seeds whose context app tore, so its output can't be compared.
const skippedForOracle = [];
// Seeds that hit known finding 5, a React crash that isn't store specific.
const skippedForCrash = [];
// With STORE_FUZZ_COLLECT, every failure: "<mode> <seed> <kind> <message>".
const collected = [];

function runRegression(spec) {
  return runCase(spec);
}

function seeds() {
  if (SEED !== undefined) {
    return [+SEED];
  }
  const list = [];
  for (let i = 0; i < RUNS; i++) {
    list.push(SEED_START + i);
  }
  return list;
}

describe('ReactUseStoreFuzz', () => {
  jest.setTimeout(3 * 60 * 60 * 1000);

  async function fuzzSeeds(mode) {
    const list = seeds();
    for (let i = 0; i < list.length; i++) {
      await fuzz(list[i], mode);
    }
    const failures = collected.filter(line => line.startsWith(mode + ' '));
    if (failures.length > 0) {
      throw new Error(
        failures.length + ' seeds failed: ' + failures.join(', '),
      );
    }
  }

  // @gate enableStore
  it('anchored mode: readers mounted for the whole run, in one root, match useReducer and context', () =>
    fuzzSeeds('anchored'));

  // @gate enableStore
  it('free mode: readers that mount and unmount, in one or two roots, keep the invariants', () =>
    fuzzSeeds('free'));

  afterAll(() => {
    if (COLLECT) {
      const kinds = {};
      collected.forEach(line => {
        const kind = line.split(' ')[2];
        kinds[kind] = (kinds[kind] || 0) + 1;
      });
      console.log(
        'use(store) fuzzer: ' +
          collected.length +
          ' failures ' +
          JSON.stringify(kinds) +
          '\n' +
          collected.join('\n'),
      );
    }
    if (skippedForCrash.length > 0) {
      console.log(
        'use(store) fuzzer: skipped ' +
          skippedForCrash.length +
          ' seeds that hit known finding 5: ' +
          skippedForCrash.join(', '),
      );
    }
    if (skippedForOracle.length > 0) {
      console.log(
        'use(store) fuzzer: skipped ' +
          skippedForOracle.length +
          ' seeds where the context app tore: ' +
          skippedForOracle.join(', '),
      );
    }
  });

  describe('regressions', () => {
    // @gate enableStore
    it('the harness runs a hand-written case', () =>
      runRegression({
        seed: 0,
        mode: 'anchored',
        strict: false,
        rootSuspense: true,
        numRoots: 1,
        stores: [{reducer: true}],
        tree: [],
        anchors: [
          {
            kind: 'reader',
            id: 0,
            reads: [{store: 0, cond: false}],
            condInitially: true,
            suspendOnData: false,
            useThenable: false,
            sameElement: false,
            children: [],
          },
        ],
        slowTokens: [],
        keys: [],
        actions: [
          {
            type: 'event',
            root: 0,
            priority: 'transition',
            entries: [
              {t: 'store', store: 0, action: {kind: 'append', tok: 'a0'}},
            ],
          },
          {
            type: 'event',
            root: 0,
            priority: 'discrete',
            entries: [
              {t: 'store', store: 0, action: {kind: 'append', tok: 'a1'}},
            ],
          },
          {type: 'yield', count: 1},
          {type: 'flush'},
        ],
      }));
  });
});

// Hand-written versions of what the fuzzer found. Each test asserts the
// expected behavior, so it fails until the finding is fixed.
describe('findings', () => {
  let act;
  let waitFor;
  let use;
  let useEffect;
  let startTransition;
  let Activity;
  let createStore;
  let createContext;
  let useState;

  beforeEach(() => {
    loadReact();
    act = require('internal-test-utils').act;
    waitFor = require('internal-test-utils').waitFor;
    use = React.use;
    useEffect = React.useEffect;
    useState = React.useState;
    startTransition = React.startTransition;
    Activity = React.Activity;
    createStore = React.unstable_createStore;
    createContext = React.createContext;
  });

  // Finding 1.
  // @gate enableStore
  it('a transition with nothing else to render applies its held updates at the end of the event', async () => {
    const store = createStore('A', (state, action) => {
      if (action === 'throw') {
        throw new Error('Oops');
      }
      return action;
    });
    ReactNoop.createRoot().render(<span prop="unrelated" />);
    await act(() => {});

    // No root reads the store, and the transition has nothing else to
    // render, so it's done at the end of the event.
    await act(() => startTransition(() => store.update('B')));
    expect(store._pendingTransitionUpdates).toBe(null);

    // So an urgent update to the store isn't held behind it. It's applied
    // right away, and a reducer error throws (DCP-14).
    expect(() => store.update('throw')).toThrow('Oops');
    for (let i = 0; i < 100; i++) {
      store.update('C' + i);
    }
    expect(store._pendingTransitionUpdates).toBe(null);
  });

  // Finding 1, through an async action.
  // @gate enableStore
  it('an async action with nothing else to render applies its held updates when it finishes', async () => {
    const store = createStore('A', (state, action) => {
      if (action === 'throw') {
        throw new Error('Oops');
      }
      return action;
    });
    ReactNoop.createRoot().render(<span prop="unrelated" />);
    await act(() => {});

    // No root reads the store, so the update is held until the action is
    // done. Nothing else renders.
    let resolve;
    await act(() =>
      startTransition(async () => {
        store.update('B');
        await new Promise(r => (resolve = r));
      }),
    );
    await act(() => resolve());
    expect(store._pendingTransitionUpdates).toBe(null);
    expect(() => store.update('throw')).toThrow('Oops');
  });

  // Finding 2.
  // @gate enableStore
  it('a render that skips every update to a store with a new update in another lane does not run its reducer again', async () => {
    let reducerCalls = 0;
    const store = createStore({n: 0}, (state, action) => {
      reducerCalls++;
      return {n: state.n + action};
    });
    const other = createStore(0);
    const effects = [];

    function Reader() {
      const value = use(store);
      const count = use(other);
      useEffect(() => {
        effects.push(value.n);
      }, [value]);
      return <span prop={value.n + ':' + count} />;
    }

    const root = ReactNoop.createRoot();
    await act(() => root.render(<Reader />));
    expect(effects).toEqual([0]);

    // A transition update, and a sync update that's rebased on top of it.
    // The sync update commits, and flushes its effects; the transition is
    // still pending.
    startTransition(() => store.update(1));
    ReactNoop.flushSync(() => store.update(10));
    expect(root).toMatchRenderedOutput(<span prop="10:0" />);
    expect(effects).toEqual([0, 10]);

    // Another transition update to the store. It isn't rendered yet.
    startTransition(() => store.update(100));
    const callsBefore = reducerCalls;

    // A sync render for another store. It includes no update to `store`,
    // so, like a useReducer Hook whose component doesn't render, the store's
    // reducer doesn't run and its value keeps its identity.
    ReactNoop.flushSync(() => other.update(1));
    expect(root).toMatchRenderedOutput(<span prop="10:1" />);
    expect(effects).toEqual([0, 10]);
    expect(reducerCalls).toBe(callsBefore);

    await act(() => {});
    expect(root).toMatchRenderedOutput(<span prop="111:1" />);
  });

  // Finding 7.
  // @gate enableStore
  it('a hidden reader that is revealed does not wait for an async action whose update it does not show', async () => {
    const store = createStore('A');
    let setVisible;
    function Reader({name}) {
      const value = use(store);
      Scheduler.log(name + ': ' + value);
      return <span prop={name + ': ' + value} />;
    }
    function Gate({children}) {
      const [visible, _setVisible] = useState(false);
      setVisible = _setVisible;
      return (
        <Activity mode={visible ? 'visible' : 'hidden'}>{children}</Activity>
      );
    }

    const root = ReactNoop.createRoot();
    await act(() =>
      root.render(
        <>
          <Reader name="Visible" />
          <Gate>
            <Reader name="Hidden" />
          </Gate>
        </>,
      ),
    );
    Scheduler.unstable_clearLog();

    // A transition updates the store and reveals the hidden reader. It
    // starts rendering.
    startTransition(() => {
      store.update('B');
      setVisible(true);
    });
    await waitFor(['Visible: B']);
    // An async action updates the store, and is still pending.
    let resolveAction;
    startTransition(async () => {
      store.update('C');
      await new Promise(resolve => (resolveAction = resolve));
    });
    // A sync update sets the store to a new value. The transition and the
    // action are rebased under it, so they render 'D' too, the committed
    // value: nothing they render comes from the pending action.
    ReactNoop.flushSync(() => store.update('D'));
    Scheduler.unstable_clearLog();
    expect(root).toMatchRenderedOutput(
      <>
        <span prop="Visible: D" />
        <span hidden={true} prop="Hidden: A" />
      </>,
    );

    // Like useState, the transition commits without waiting for the action.
    // The hidden reader read 'A' before it was hidden, so its value changed,
    // but it isn't a value the root hasn't committed.
    await act(() => {});
    Scheduler.unstable_clearLog();
    expect(root).toMatchRenderedOutput(
      <>
        <span prop="Visible: D" />
        <span prop="Hidden: D" />
      </>,
    );
    await act(() => resolveAction());
    Scheduler.unstable_clearLog();
  });

  // Finding 3: enableSameElementBailout (not store specific).
  it('a context consumer in a hidden tree, below a consumer that returns the same element, shows the new value when revealed', async () => {
    const Context = createContext('A');
    let setValue;
    let setVisible;
    function Provider({children}) {
      const [value, _setValue] = useState('A');
      setValue = _setValue;
      return <Context value={value}>{children}</Context>;
    }
    function Gate({children}) {
      const [visible, _setVisible] = useState(false);
      setVisible = _setVisible;
      return (
        <Activity mode={visible ? 'visible' : 'hidden'}>{children}</Activity>
      );
    }
    function Parent({children}) {
      use(Context);
      return children;
    }
    function Child() {
      return <span prop={use(Context)} />;
    }

    const root = ReactNoop.createRoot();
    await act(() =>
      root.render(
        <Provider>
          <Gate>
            <Parent>
              <Child />
            </Parent>
          </Gate>
        </Provider>,
      ),
    );
    await act(() => setValue('B'));
    await act(() => setVisible(true));
    expect(root).toMatchRenderedOutput(<span prop="B" />);
  });

  // Finding 4: React context, on main too (not store specific).
  // FIXME(M1): a bug on main (ReactFiberNewContext propagation into deferred hidden trees), not caused by stores.
  it.skip('a context consumer in a hidden tree, below a consumer and a component that bails out, shows the new value when revealed', async () => {
    const Context = createContext('A');
    let setValue;
    let setVisible;
    function Provider({children}) {
      const [value, _setValue] = useState('A');
      setValue = _setValue;
      return <Context value={value}>{children}</Context>;
    }
    function Gate({children}) {
      const [visible, _setVisible] = useState(false);
      setVisible = _setVisible;
      return (
        <Activity mode={visible ? 'visible' : 'hidden'}>{children}</Activity>
      );
    }
    function Parent({children}) {
      use(Context);
      return children;
    }
    function Child() {
      return <span prop={use(Context)} />;
    }

    // The div is the same element when Parent renders again, so it bails
    // out, and Child is only reached through context propagation.
    const root = ReactNoop.createRoot();
    await act(() =>
      root.render(
        <Provider>
          <Gate>
            <Parent>
              <div>
                <Child />
              </div>
            </Parent>
          </Gate>
        </Provider>,
      ),
    );
    await act(() => setValue('B'));
    await act(() => setVisible(true));
    expect(root).toMatchRenderedOutput(
      <div>
        <span prop="B" />
      </div>,
    );
  });

  // Finding 4b: React context, on main too (not store specific). The same
  // cause as finding 4, through a Suspense boundary instead of Activity.
  // FIXME(M2): a bug on main (context tears in a nested boundary on reveal), not caused by stores.
  it.skip('a context consumer in a nested boundary shows the new value when its parent boundary shows its content again', async () => {
    const Context = createContext('A');
    let setValue;
    let setVersion;
    function Provider({children}) {
      const [value, _setValue] = useState('A');
      setValue = _setValue;
      return <Context value={value}>{children}</Context>;
    }
    let resolved = 0;
    const listeners = [];
    const thenable = {
      then(resolve) {
        listeners.push(resolve);
      },
    };
    function Suspends() {
      const [version, _setVersion] = useState(0);
      setVersion = _setVersion;
      if (version > resolved) {
        throw thenable;
      }
      return null;
    }
    function Reader({name}) {
      return <span prop={name + ': ' + use(Context)} />;
    }

    const root = ReactNoop.createRoot();
    await act(() =>
      root.render(
        <Provider>
          <Reader name="Outside" />
          <React.Suspense fallback={<span prop="Loading" />}>
            <Suspends />
            <React.Suspense fallback={null}>
              <Reader name="Inside" />
            </React.Suspense>
          </React.Suspense>
        </Provider>,
      ),
    );
    // The context changes in the same render that the boundary falls back.
    setValue('B');
    ReactNoop.flushSync(() => setVersion(1));
    expect(root).toMatchRenderedOutput(
      <>
        <span prop="Outside: B" />
        <span hidden={true} prop="Inside: A" />
        <span prop="Loading" />
      </>,
    );
    // The boundary shows its content again.
    await act(() => {
      resolved = 1;
      listeners.forEach(listener => listener());
    });
    expect(root).toMatchRenderedOutput(
      <>
        <span prop="Outside: B" />
        <span prop="Inside: B" />
      </>,
    );
  });

  // Finding 5: React, on main too (not store specific).
  // FIXME(M3): a bug on main (resolveRetryWakeable after a hidden Activity is deleted), not caused by stores.
  it.skip('resolving the data of a component in a deleted hidden Activity does not crash', async () => {
    const thenable = {
      status: 'pending',
      listeners: [],
      then(resolve) {
        thenable.listeners.push(resolve);
      },
    };
    let setOn;
    function Gate({children}) {
      const [on, _setOn] = useState(true);
      setOn = _setOn;
      return on ? children : null;
    }
    function Suspends() {
      use(thenable);
      return <span prop="resolved" />;
    }

    const root = ReactNoop.createRoot();
    await act(() =>
      root.render(
        <Gate>
          <Activity mode="hidden">
            <Suspends />
          </Activity>
        </Gate>,
      ),
    );
    await act(() => setOn(false));
    await act(() => {
      thenable.status = 'fulfilled';
      thenable.value = 'resolved';
      thenable.listeners.forEach(listener => listener('resolved'));
    });
    expect(root).toMatchRenderedOutput(null);
  });

  // Finding 6: React, not store specific. Only with
  // enableDefaultTransitionIndicator.
  // FIXME(M4): a bug on main (a context tear with enableDefaultTransitionIndicator), not caused by stores.
  it.skip('a context consumer and its parent consumer show the same value in a commit', async () => {
    const Context = createContext('A');
    let setValue;
    let setVisible;
    const never = {then() {}};
    function Provider({children}) {
      const [value, _setValue] = useState('A');
      setValue = _setValue;
      return <Context value={value}>{children}</Context>;
    }
    function Gate({children}) {
      const [visible, _setVisible] = useState(false);
      setVisible = _setVisible;
      return (
        <Activity mode={visible ? 'visible' : 'hidden'}>{children}</Activity>
      );
    }
    function Suspends() {
      throw never;
    }
    function Parent({children}) {
      return (
        <>
          <span prop={'Parent: ' + use(Context)} />
          {children}
        </>
      );
    }
    function Child() {
      return <span prop={'Child: ' + use(Context)} />;
    }

    const torn = [];
    const root = ReactNoop.createRoot();
    function onCommit() {
      const output = JSON.stringify(root.getChildrenAsJSX());
      const parent = /"Parent: (\w+)"/.exec(output);
      const child = /"Child: (\w+)"/.exec(output);
      if (
        parent !== null &&
        child !== null &&
        !output.includes('"hidden":true') &&
        parent[1] !== child[1]
      ) {
        torn.push(parent[0] + ', ' + child[0]);
      }
    }
    await act(() =>
      root.render(
        <React.Profiler id="root" onRender={onCommit}>
          <Provider>
            <React.Suspense fallback={<span prop="Loading" />}>
              {[
                <Gate key="gate">{[<Suspends key="suspends" />]}</Gate>,
                <Parent key="parent">{[<Child key="child" />]}</Parent>,
              ]}
            </React.Suspense>
          </Provider>
        </React.Profiler>,
      ),
    );
    // One event shows content that suspends, so the boundary falls back, and
    // changes the context. A transition is pending.
    ReactNoop.unstable_runWithPriority(ContinuousEventPriority, () => {
      setVisible(true);
      setValue('B');
    });
    startTransition(() => setValue(value => value + 'C'));
    await waitForMicrotasks();
    // Hiding the content that suspends shows the boundary's children again.
    ReactNoop.discreteUpdates(() => setVisible(false));
    await act(() => {});
    expect(torn).toEqual([]);
  });
});
