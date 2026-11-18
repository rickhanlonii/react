'use strict';

// Maps the use(store) API onto the react-concurrent-store ponyfill.
//
// - React.unstable_createStore(initial, reducer?) -> a facade over a ponyfill
//   store. Without a reducer, the facade uses useState's reducer, so
//   store.update() takes a value or an updater function like ours does.
// - store.update(action) -> experimental: store.dispatch(action); stable:
//   store.update(action).
// - use(store) -> the ponyfill's useStore(store) when given a facade, the real
//   use() otherwise.
// - Reading an underscore property of a facade (store._records, ...) marks the
//   test as N/A: it inspects our internals, which the ponyfill doesn't have.

const NA_PREFIX = 'PONYFILL_ADAPTER_NA';

function basicStateReducer(state, action) {
  return typeof action === 'function' ? action(state) : action;
}

function markNotApplicable(reason) {
  global.__ponyfillNotApplicable = global.__ponyfillNotApplicable || [];
  global.__ponyfillNotApplicable.push(reason);
  throw new Error(`${NA_PREFIX}: ${reason}`);
}

function createAdaptedReact(RealReact, impl) {
  const ponyfill =
    impl === 'experimental'
      ? require('./dist/experimental.js')(RealReact)
      : require('./dist/stable.js')(RealReact);
  // Server rendering gets its own instance of the experimental ponyfill, so
  // its <StoreProvider> context isn't the client's. In a real app the server
  // and the client don't share a module, and sharing the context in one jest
  // registry warns about multiple renderers using the same provider.
  const serverPonyfill =
    impl === 'experimental'
      ? require('./dist/experimental.js')(RealReact)
      : ponyfill;
  const internals =
    RealReact.__CLIENT_INTERNALS_DO_NOT_USE_OR_WARN_USERS_THEY_CANNOT_UPGRADE;
  // Fizz's Hooks dispatchers, collected by setupPonyfill.js.
  const fizzDispatchers =
    global.__ponyfillCompatFizzDispatchers ||
    (global.__ponyfillCompatFizzDispatchers = new WeakSet());

  // Shared across module registries: some tests (ReactDOMServerIntegration*)
  // create a store, call jest.resetModules(), and read it with a fresh React.
  // Our stores are plain objects that work with any React instance, so the
  // adapter looks them up globally and reads them with the current instance's
  // useStore. (An experimental ponyfill store still calls the startTransition
  // of the instance that created it when it's updated.)
  const inner =
    global.__ponyfillCompatStores ||
    (global.__ponyfillCompatStores = new WeakMap());

  function createStore(initialValue, reducer) {
    const finalReducer = reducer === undefined ? basicStateReducer : reducer;
    let store;
    let update;
    if (impl === 'experimental') {
      store = ponyfill.createStore(finalReducer, initialValue);
      update = function (action) {
        store.dispatch(action);
      };
    } else {
      store = ponyfill.createStore(initialValue, finalReducer);
      update = function (action) {
        store.update(action);
      };
    }
    const target = {update};
    const facade = new Proxy(target, {
      get(t, key, receiver) {
        if (typeof key === 'string' && key[0] === '_') {
          markNotApplicable(`test reads store.${key}`);
        }
        return Reflect.get(t, key, receiver);
      },
      set(t, key, value) {
        if (typeof key === 'string' && key[0] === '_') {
          markNotApplicable(`test writes store.${key}`);
        }
        t[key] = value;
        return true;
      },
    });
    inner.set(facade, store);
    return facade;
  }

  function use(usable) {
    if (usable !== null && typeof usable === 'object' && inner.has(usable)) {
      const instance =
        internals.H !== null && fizzDispatchers.has(internals.H)
          ? serverPonyfill
          : ponyfill;
      return instance.useStore(inner.get(usable));
    }
    return RealReact.use(usable);
  }

  const adapted = Object.assign({}, RealReact, {
    use,
    unstable_createStore: createStore,
  });
  Object.defineProperty(adapted, '__ponyfill', {
    value: {impl, ponyfill, serverPonyfill},
    enumerable: false,
  });
  return adapted;
}

module.exports = {createAdaptedReact, NA_PREFIX};
