// Expected reader counts and renders for the conditional subscription panel
// (G4). The model is the rule from DESIGN.md: a component is subscribed to
// exactly the stores it read in its last committed render, and a root keeps
// a record of a store while something on it reads the store or the store
// has updates that haven't committed (DCP-11).

(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.StoreSubscriptionsCheck = factory();
  }
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  function createModel() {
    return {showCart: false, showUser: false, badges: 0};
  }

  function expectedReaders(model) {
    const cart = [];
    if (model.showCart) {
      cart.push('Profile');
    }
    for (let i = 0; i < model.badges; i++) {
      cart.push('Badge');
    }
    return {
      theme: ['Profile'],
      cart: cart.sort(),
      user: model.showUser ? ['Profile'] : [],
    };
  }

  // Applies a command to the model and returns the renders it should cause.
  function apply(model, command) {
    const renders = {};
    switch (command.type) {
      case 'toggle':
        if (command.store === 'cart') {
          model.showCart = command.on;
        } else {
          model.showUser = command.on;
        }
        renders.Profile = 1;
        break;
      case 'badges':
        // Badges re-renders, and Badge isn't memoized, so every badge that's
        // still there renders, along with the new ones.
        if (command.count > 0) {
          renders.Badge = command.count;
        }
        model.badges = command.count;
        break;
      case 'update':
        if (command.store === 'theme') {
          renders.Profile = 1;
        } else if (command.store === 'cart') {
          if (model.showCart) {
            renders.Profile = 1;
          }
          if (model.badges > 0) {
            renders.Badge = model.badges;
          }
        } else if (model.showUser) {
          renders.Profile = 1;
        }
        break;
    }
    return renders;
  }

  function compare(model, renders, snapshot) {
    const problems = [];
    const readers = expectedReaders(model);
    for (const name of ['theme', 'cart', 'user']) {
      const got = snapshot.stores[name];
      const want = readers[name];
      if (got.readers.join(',') !== want.join(',')) {
        problems.push(
          name +
            ' readers: expected [' +
            want.join(',') +
            '], got [' +
            got.readers.join(',') +
            ']'
        );
      }
      const wantRecords = want.length > 0 ? 1 : 0;
      if (got.records !== wantRecords) {
        problems.push(
          name + ' records: expected ' + wantRecords + ', got ' + got.records
        );
      }
    }
    const names = new Set(
      Object.keys(renders).concat(Object.keys(snapshot.renders))
    );
    names.forEach(name => {
      if ((renders[name] || 0) !== (snapshot.renders[name] || 0)) {
        problems.push(
          name +
            ' renders: expected ' +
            (renders[name] || 0) +
            ', got ' +
            (snapshot.renders[name] || 0)
        );
      }
    });
    return problems;
  }

  function random(seed) {
    let a = seed >>> 0;
    return function () {
      a = (a + 0x6d2b79f5) >>> 0;
      let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // Random commands that always change something (a toggle flips, the badge
  // count changes), so every command has a known effect.
  function generateCommands(seed, length) {
    const next = random(seed);
    const model = createModel();
    const commands = [];
    for (let i = 0; i < length; i++) {
      const r = next();
      let command;
      if (r < 0.2) {
        command = {type: 'toggle', store: 'cart', on: !model.showCart};
      } else if (r < 0.4) {
        command = {type: 'toggle', store: 'user', on: !model.showUser};
      } else if (r < 0.55) {
        let count = Math.floor(next() * 4);
        if (count === model.badges) {
          count = (count + 1) % 4;
        }
        command = {type: 'badges', count};
      } else {
        const stores = ['theme', 'cart', 'user'];
        command = {type: 'update', store: stores[Math.floor(next() * 3)]};
      }
      apply(model, command);
      commands.push(command);
    }
    return commands;
  }

  function describe(command) {
    switch (command.type) {
      case 'toggle':
        return (
          'Profile ' +
          (command.on ? 'reads ' : 'stops reading ') +
          command.store
        );
      case 'badges':
        return command.count + ' badges';
      default:
        return 'update ' + command.store;
    }
  }

  async function runSeed(frame, seed, length) {
    const commands = generateCommands(seed, length);
    const model = createModel();
    let snapshot = await frame.reset();
    let problems = compare(model, {}, snapshot);
    const history = ['reset'];
    if (problems.length > 0) {
      return {ok: false, seed, index: -1, sequence: 'reset', problems};
    }
    for (let i = 0; i < commands.length; i++) {
      history.push(describe(commands[i]));
      snapshot = await frame.run(commands[i]);
      const renders = apply(model, commands[i]);
      problems = compare(model, renders, snapshot);
      if (problems.length > 0) {
        return {
          ok: false,
          seed,
          index: i,
          sequence: history.join(', '),
          problems,
        };
      }
    }
    return {ok: true, seed, commands: commands.length};
  }

  async function runSeeds(
    frame,
    {seeds = 20, firstSeed = 1, length = 30} = {}
  ) {
    let commands = 0;
    for (let seed = firstSeed; seed < firstSeed + seeds; seed++) {
      const result = await runSeed(frame, seed, length);
      if (!result.ok) {
        return result;
      }
      commands += result.commands;
    }
    return {ok: true, seeds, commands};
  }

  return {
    createModel,
    expectedReaders,
    apply,
    compare,
    generateCommands,
    describe,
    runSeed,
    runSeeds,
  };
});
