// Runs the queue preview check against the frozen React build in Node.
//
//   node docs/use-store/src/demos/test/queue-node.js [--seeds=200] [--length=24]

'use strict';

const createNodeEnv = require('./node-env');

function option(name, fallback) {
  const arg = process.argv.find(a => a.startsWith('--' + name + '='));
  return arg ? Number(arg.slice(name.length + 3)) : fallback;
}

async function main() {
  const env = createNodeEnv();
  const {createQueueDemo} = require('../frames/queue');
  const Check = require('../runtime/queue-check');
  const container = env.document.createElement('div');
  env.document.body.appendChild(container);
  const frame = createQueueDemo({...env, container});
  const result = await Check.runSeeds(frame, {
    seeds: option('seeds', 200),
    length: option('length', 24),
  });
  if (!result.ok) {
    console.error(
      'Mismatch at seed ' + result.seed + ', command ' + result.index
    );
    console.error('  sequence: ' + result.sequence);
    for (const problem of result.problems) {
      console.error('  ' + problem);
    }
    process.exit(1);
  }
  console.log(
    'queue preview matches React: ' +
      result.seeds +
      ' seeds, ' +
      result.commands +
      ' commands'
  );
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
