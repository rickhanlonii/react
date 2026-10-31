// Shared (cross-component) memoization for the shared-derived-data spike. See
// docs/use-store/research/shared-derived-data.md.
//
// Store values are immutable snapshots, so a derivation of them can be cached
// by the identity of its arguments: two renders that read different snapshots
// use different keys, and two components that read the same snapshot share
// the result.

function createNode() {
  return {hasValue: false, value: undefined, objects: null, primitives: null};
}

// The node for a list of arguments in a trie, like cache() from 'react' on
// the server: objects are keys of a WeakMap, primitives of a Map. A node is
// only reachable while every object argument before it is alive, so the
// entries for a replaced snapshot are collected with it.
function getNode(root, args, from) {
  let node = root;
  for (let i = from; i < args.length; i++) {
    const arg = args[i];
    let next;
    if (
      typeof arg === 'function' ||
      (typeof arg === 'object' && arg !== null)
    ) {
      let objects = node.objects;
      if (objects === null) {
        node.objects = objects = new WeakMap();
      }
      next = objects.get(arg);
      if (next === undefined) {
        next = createNode();
        objects.set(arg, next);
      }
    } else {
      let primitives = node.primitives;
      if (primitives === null) {
        node.primitives = primitives = new Map();
      }
      next = primitives.get(arg);
      if (next === undefined) {
        next = createNode();
        primitives.set(arg, next);
      }
    }
    node = next;
  }
  return node;
}

// Option 3 (userland): memoize a function across every caller, keyed by its
// arguments. Lives as long as the module.
export function weakMemo(fn) {
  const root = createNode();
  return function () {
    const node = getNode(root, arguments, 0);
    if (node.hasValue) {
      return node.value;
    }
    const value = fn.apply(null, arguments);
    node.hasValue = true;
    node.value = value;
    return value;
  };
}

// Option 5: what a compiler-emitted shared memo could call, sharedCall(fn,
// ...args), with the callee as the first key. One cache for the whole app, so
// two call sites (or two components) that call the same function with the
// same arguments share the result.
const sharedRoot = createNode();
export function sharedCall(fn) {
  const node = getNode(sharedRoot, arguments, 0);
  if (node.hasValue) {
    return node.value;
  }
  const value = fn.apply(null, Array.prototype.slice.call(arguments, 1));
  node.hasValue = true;
  node.value = value;
  return value;
}

// Option 4 (a React client cache with a lifetime of a number of generations):
// entries are held strongly, in Maps, but only for the current render and,
// with two generations, the last committed one. One generation is a cache
// scoped to a render. React would start a generation when a root commits;
// userland calls nextGeneration() from a layout effect.
let generation = 0;
export function nextGeneration() {
  generation++;
}

function getStrongNode(root, args) {
  let node = root;
  for (let i = 0; i < args.length; i++) {
    let children = node.primitives;
    if (children === null) {
      node.primitives = children = new Map();
    }
    let next = children.get(args[i]);
    if (next === undefined) {
      next = createNode();
      children.set(args[i], next);
    }
    node = next;
  }
  return node;
}

function findStrongNode(root, args) {
  let node = root;
  for (let i = 0; i < args.length && node !== undefined; i++) {
    node = node.primitives === null ? undefined : node.primitives.get(args[i]);
  }
  return node;
}

export function generationalMemo(fn, generations = 2) {
  let ownGeneration = generation;
  let current = createNode();
  let previous = createNode();
  return function () {
    if (ownGeneration !== generation) {
      previous =
        generations === 2 && ownGeneration === generation - 1
          ? current
          : createNode();
      current = createNode();
      ownGeneration = generation;
    }
    const node = getStrongNode(current, arguments);
    if (node.hasValue) {
      return node.value;
    }
    const old = findStrongNode(previous, arguments);
    const value =
      old !== undefined && old.hasValue ? old.value : fn.apply(null, arguments);
    node.hasValue = true;
    node.value = value;
    return value;
  };
}
