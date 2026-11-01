// The frame side of the conditional subscription panel. It runs in a step
// frame, and flushes all work after every command, so each snapshot shows
// the committed tree.
//
// Three stores. A Profile component always reads `theme`, and reads `cart`
// and `user` only while its toggles are on. A row of Badge components each
// read `cart`. The snapshot reports, for each store, how many records it has
// (one per root that reads it) and which components are subscribed, straight
// from the store's internals, plus how many times each component rendered.

'use strict';

const {readStore} = require('./internals');

function noop() {}

function createSubscriptionDemo({
  React,
  ReactDOM,
  createRoot,
  Scheduler,
  container,
}) {
  const h = React.createElement;

  let root = null;
  let stores = null;
  let renders = null;
  let setShowCart = null;
  let setShowUser = null;
  let setBadges = null;

  function count(name) {
    renders[name] = (renders[name] || 0) + 1;
  }

  function Profile() {
    count('Profile');
    const [showCart, set1] = React.useState(false);
    const [showUser, set2] = React.useState(false);
    setShowCart = set1;
    setShowUser = set2;
    const theme = React.use(stores.theme);
    // Conditional reads: when a toggle is off, Profile doesn't read the
    // store, so it isn't subscribed to it.
    const cart = showCart ? React.use(stores.cart) : null;
    const user = showUser ? React.use(stores.user) : null;
    return h(
      'div',
      {className: 'subs-profile', 'data-theme': theme},
      h('span', null, 'theme: ' + theme),
      cart === null ? null : h('span', null, ' cart: ' + cart),
      user === null ? null : h('span', null, ' user: ' + user)
    );
  }

  function Badge({index}) {
    count('Badge');
    const cart = React.use(stores.cart);
    return h(
      'span',
      {className: 'subs-badge', 'data-badge': index},
      String(cart)
    );
  }

  function Badges() {
    const [n, set] = React.useState(0);
    setBadges = set;
    const badges = [];
    for (let i = 0; i < n; i++) {
      badges.push(h(Badge, {key: i, index: i}));
    }
    return h('div', {className: 'subs-badges'}, badges);
  }

  function App() {
    return h('div', null, h(Profile), h(Badges));
  }

  function settle() {
    return new Promise(resolve => setTimeout(resolve, 0));
  }

  async function flush() {
    await settle();
    Scheduler.unstable_flushAllWithoutAsserting();
    await settle();
  }

  function snapshot() {
    const result = {stores: {}, renders};
    renders = {};
    const names = Object.keys(stores);
    for (let i = 0; i < names.length; i++) {
      const read = readStore(stores[names[i]]);
      result.stores[names[i]] = {
        records: read.records,
        readers: read.record === null ? [] : read.record.readers.slice().sort(),
        value: read.head,
      };
    }
    result.screen = container.textContent;
    return result;
  }

  async function reset() {
    if (root !== null) {
      root.unmount();
    }
    stores = {
      theme: React.unstable_createStore('light'),
      cart: React.unstable_createStore(0),
      user: React.unstable_createStore('Ada'),
    };
    renders = {};
    root = createRoot(container, {onDefaultTransitionIndicator: noop});
    ReactDOM.flushSync(() => root.render(h(App)));
    await flush();
    renders = {};
    return snapshot();
  }

  // command: {type: 'toggle', store: 'cart' | 'user', on}
  //          {type: 'badges', count}
  //          {type: 'update', store}
  async function run(command) {
    switch (command.type) {
      case 'toggle':
        (command.store === 'cart' ? setShowCart : setShowUser)(command.on);
        break;
      case 'badges':
        setBadges(command.count);
        break;
      case 'update': {
        const store = stores[command.store];
        if (command.store === 'theme') {
          store.update(theme => (theme === 'light' ? 'dark' : 'light'));
        } else if (command.store === 'cart') {
          store.update(cart => cart + 1);
        } else {
          store.update(user => (user === 'Ada' ? 'Grace' : 'Ada'));
        }
        break;
      }
      default:
        throw new Error('Unknown command ' + command.type);
    }
    await flush();
    return snapshot();
  }

  return {reset, run, snapshot};
}

module.exports = {createSubscriptionDemo};
