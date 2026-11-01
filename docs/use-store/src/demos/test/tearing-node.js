// Runs the tearing demo script against the frozen React build in Node and
// checks the outcomes.
//
//   node docs/use-store/src/demos/test/tearing-node.js [--verbose]

'use strict';

const createNodeEnv = require('./node-env');

async function main() {
  const env = createNodeEnv();
  const {createTearingDemo, CELLS} = require('../frames/tearing');
  const Check = require('../runtime/tearing-check');
  let failed = false;
  for (const source of ['global', 'uses', 'store', 'store-click']) {
    const container = env.document.createElement('div');
    env.document.body.appendChild(container);
    const frame = createTearingDemo({...env, container, source});
    const snapshots = await Check.runScript(frame);
    if (process.argv.includes('--verbose')) {
      console.log('--- ' + source);
      for (const s of snapshots) {
        console.log(
          s.screen.join(' ') +
            '  ' +
            s.log
              .map(e =>
                e.type === 'render'
                  ? 'r' + e.cell + '=' + e.value + '@' + e.round
                  : 'C[' + e.values.join(',') + ']@' + e.round
              )
              .join(' ')
        );
      }
    }
    const problems = Check.checkOutcome(source, snapshots, CELLS);
    if (problems.length > 0) {
      failed = true;
      console.error(source + ':');
      for (const p of problems) {
        console.error('  ' + p);
      }
    } else {
      console.log(source + ': ok');
    }
  }
  if (failed) {
    process.exit(1);
  }
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
